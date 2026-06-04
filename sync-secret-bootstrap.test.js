// sync-secret-bootstrap.test.js
// Regression test for the "first-login wipes encrypted secrets" bug.
//
// On a fresh device, syncCycle() ran push BEFORE pull. pushSettings() uploaded
// an empty `secrets` ({}) that clobbered the server's encrypted secrets via the
// merge-duplicates upsert, BEFORE pullSettings() could decrypt them — so the
// gateway/ollama API keys were never restored and the server copy was wiped.
//
// This test loads the real sync.js with in-memory chrome.storage + fetch mocks
// and a real PBKDF2/AES-GCM crypto round-trip, then asserts a first sync both
// (a) restores the encrypted apiKey locally and (b) leaves the server secret intact.

const test = require('node:test');
const assert = require('node:assert');

function makeStorage(initial) {
  const store = { ...initial };
  return {
    async get(keys) {
      if (keys == null) return { ...store };
      if (typeof keys === 'string') return (keys in store) ? { [keys]: store[keys] } : {};
      if (Array.isArray(keys)) { const o = {}; for (const k of keys) if (k in store) o[k] = store[k]; return o; }
      const o = {}; for (const k of Object.keys(keys)) o[k] = (k in store) ? store[k] : keys[k]; return o;
    },
    async set(obj) { Object.assign(store, obj); },
    async remove(keys) { for (const k of [].concat(keys)) delete store[k]; },
    _store: store
  };
}

function makeFetch(db) {
  const resp = (data, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    async json() { return data; },
    async text() { return JSON.stringify(data); }
  });
  return async function (url, opts = {}) {
    const method = (opts.method || 'GET').toUpperCase();
    const u = String(url);
    if (u.includes('/user_settings')) {
      if (method === 'GET') return resp(db.user_settings);
      if (method === 'POST') {
        const rows = JSON.parse(opts.body);
        for (const r of rows) {
          let ex = db.user_settings.find(x => x.user_id === r.user_id);
          if (!ex) { ex = { user_id: r.user_id }; db.user_settings.push(ex); }
          // PostgREST merge-duplicates updates only the columns present in the payload.
          Object.assign(ex, r);
        }
        return resp(null, 201);
      }
    }
    if (method === 'GET' && u.includes('/bookmarks')) return resp([]);
    if (method === 'GET' && u.includes('/categories')) return resp([]);
    if (method === 'GET' && u.includes('/transcripts')) return resp([]);
    if (method === 'POST') return resp(null, 201);
    return resp([]);
  };
}

test('first sync restores encrypted secrets without clobbering the server', async () => {
  const RvSyncCore = require('./rv-sync-core.js');

  // Real crypto: build a server-side encrypted secret with a key we also persist
  // locally (as the SW would after deriveKeyForSession), so getEncKey can decrypt.
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const cryptoKey = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', true, ['encrypt', 'decrypt']);
  const encApiKey = await RvSyncCore.encryptSecret('REAL-GATEWAY-KEY', cryptoKey);
  const enckeyB64 = Buffer.from(rawKey).toString('base64');

  const userId = '11111111-1111-1111-1111-111111111111';
  const emptySettings = () => ({
    userName: 'Ada', onboardingComplete: true,
    llmGateway: { enabled: true, apiKey: '', transactions: {} },
    ollama: { localEnabled: false, localBaseUrl: '', cloudEnabled: false, cloudApiKey: '', modelsLastUpdated: null }
  });

  // Server already holds the user's encrypted gateway key.
  const db = {
    user_settings: [{
      user_id: userId,
      data: emptySettings(),
      secrets: { 'llmGateway.apiKey': encApiKey },
      enc_salt: 'salt',
      updated_at: '2026-01-01T00:00:00.000Z'
    }],
    bookmarks: [], categories: [], transcripts: []
  };

  // Fresh device: logged in (session + derived key persisted) but local settings empty,
  // and no rvSyncState yet (never synced on this device).
  const storage = makeStorage({
    rvSyncConfig: { url: 'https://test.local', anonKey: 'anon' },
    rvSession: { access_token: 'a', refresh_token: 'r', expires_at: Date.now() + 3600000, user: { id: userId, email: 'ada@x.com' } },
    rvEncKeyRaw: enckeyB64,
    rvData: { bookmarks: [], categories: [], settings: emptySettings() }
  });

  globalThis.chrome = { storage: { local: storage } };
  globalThis.fetch = makeFetch(db);

  // Load sync.js fresh so module-level state (_encKey, _inFlight, _refreshInFlight) resets.
  delete require.cache[require.resolve('./sync.js')];
  delete require.cache[require.resolve('./rv-sync-core.js')];
  require('./rv-sync-core.js'); // sets globalThis.RvSyncCore (sync.js reads it)
  require('./sync.js');         // sets globalThis.RvSync

  await globalThis.RvSync.syncCycle();

  const after = (await storage.get('rvData')).rvData;
  assert.strictEqual(
    after.settings.llmGateway.apiKey, 'REAL-GATEWAY-KEY',
    'first sync must restore the encrypted gateway key into local settings'
  );

  const serverRow = db.user_settings.find(r => r.user_id === userId);
  assert.ok(
    serverRow.secrets && serverRow.secrets['llmGateway.apiKey'],
    'first sync must not clobber the server-side encrypted secret'
  );
});

test('signOut resets the hydrated flag so the next login pulls-first again', async () => {
  const storage = makeStorage({
    rvSession: { access_token: 'a', refresh_token: 'r', expires_at: Date.now() + 3600000, user: { id: 'u1' } },
    rvSyncConfig: { url: 'https://test.local', anonKey: 'anon' },
    rvSyncState: { lastPulledAt: '2026-01-01T00:00:00.000Z', hydrated: true }
  });
  globalThis.chrome = { storage: { local: storage } };
  globalThis.fetch = makeFetch({ user_settings: [], bookmarks: [], categories: [], transcripts: [] });

  delete require.cache[require.resolve('./sync.js')];
  delete require.cache[require.resolve('./rv-sync-core.js')];
  require('./rv-sync-core.js');
  require('./sync.js');

  await globalThis.RvSync.signOut();

  const st = (await storage.get('rvSyncState')).rvSyncState;
  assert.strictEqual(st.hydrated, false, 'hydrated must be cleared on signOut');
  assert.strictEqual(st.lastPulledAt, '2026-01-01T00:00:00.000Z', 'lastPulledAt should be preserved');
});
