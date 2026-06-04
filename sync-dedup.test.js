// sync-dedup.test.js
// End-to-end regression test for URL de-duplication through the real syncCycle().
//
// Scenario: two devices each saved the SAME url before syncing, so the cloud
// `bookmarks` table holds two rows with the same url but different UUIDs. A sync
// cycle must collapse them to a single survivor (newest updatedAt, gap-filled so
// no user data is lost) and tombstone the loser in BOTH local storage and the
// cloud — without recreating the duplicate.
//
// Loads the real sync.js with in-memory chrome.storage + fetch mocks; the fetch
// mock records bookmark upserts so we can assert the loser row was tombstoned.

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

// fetch mock that records bookmark upserts (PostgREST merge-duplicates on id).
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
    if (u.includes('/bookmarks')) {
      if (method === 'GET') return resp(db.bookmarks);
      if (method === 'POST') {
        for (const r of JSON.parse(opts.body)) {
          const ex = db.bookmarks.find(x => x.id === r.id);
          if (ex) Object.assign(ex, r); else db.bookmarks.push({ ...r });
        }
        return resp(null, 201);
      }
    }
    if (u.includes('/user_settings')) {
      if (method === 'GET') return resp(db.user_settings || []);
      if (method === 'POST') return resp(null, 201);
    }
    if (method === 'GET' && u.includes('/categories')) return resp([]);
    if (method === 'GET' && u.includes('/transcripts')) return resp([]);
    if (method === 'POST') return resp(null, 201);
    return resp([]);
  };
}

test('syncCycle collapses a cross-device URL duplicate locally and tombstones the loser in the cloud', async () => {
  const userId = '11111111-1111-1111-1111-111111111111';
  const LOSER  = '00000000-0000-0000-0000-00000000aaaa'; // older, has the note
  const SURV   = '00000000-0000-0000-0000-00000000bbbb'; // newer, empty note → survives

  // Cloud already holds both same-url rows (snake_case PostgREST shape).
  const db = {
    user_settings: [],
    categories: [], transcripts: [],
    bookmarks: [
      { id: LOSER, user_id: userId, url: 'https://dup.com/x', title: 'older', category: 'C',
        summary: '', tags: [], user_notes: 'kept note', status: 'Active', history: [],
        updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null },
      { id: SURV, user_id: userId, url: 'https://dup.com/x', title: 'newer', category: 'C',
        summary: '', tags: [], user_notes: '', status: 'Active', history: [],
        updated_at: '2026-02-01T00:00:00.000Z', deleted_at: null },
    ]
  };

  // Fresh device: logged in, nothing synced yet (no rvSyncState → bootstrap pull-first).
  const storage = makeStorage({
    rvSyncConfig: { url: 'https://test.local', anonKey: 'anon' },
    rvSession: { access_token: 'a', refresh_token: 'r', expires_at: Date.now() + 3600000, user: { id: userId, email: 'ada@x.com' } },
    rvData: { bookmarks: [], categories: [], settings: {} }
  });

  globalThis.chrome = { storage: { local: storage } };
  globalThis.fetch = makeFetch(db);

  delete require.cache[require.resolve('./sync.js')];
  delete require.cache[require.resolve('./rv-sync-core.js')];
  require('./rv-sync-core.js'); // sets globalThis.RvSyncCore
  require('./sync.js');         // sets globalThis.RvSync

  await globalThis.RvSync.syncCycle();

  // ── local: exactly one live bookmark for the url, gap-filled, no tombstone left ──
  const local = (await storage.get('rvData')).rvData.bookmarks;
  const liveLocal = local.filter(b => !b.deletedAt);
  assert.strictEqual(liveLocal.length, 1, 'exactly one bookmark survives locally');
  assert.strictEqual(liveLocal[0].id, SURV, 'newest updatedAt is the survivor');
  assert.strictEqual(liveLocal[0].userNotes, 'kept note', 'gap-fill preserved the note from the older copy');
  assert.ok(!local.some(b => b.id === LOSER), 'loser is physically dropped from local after its tombstone pushed');

  // ── cloud: loser row tombstoned, survivor carries the gap-filled note ──
  const cloudLoser = db.bookmarks.find(r => r.id === LOSER);
  assert.ok(cloudLoser.deleted_at, 'loser row is tombstoned (deleted_at set) in the cloud');
  const cloudSurv = db.bookmarks.find(r => r.id === SURV);
  assert.strictEqual(cloudSurv.user_notes, 'kept note', 'cloud survivor received the gap-filled note');
  assert.ok(!cloudSurv.deleted_at, 'cloud survivor is not tombstoned');
});

test('syncCycle drops a stale preliminary that has an enriched twin (local only, no cloud tombstone)', async () => {
  const userId = '11111111-1111-1111-1111-111111111111';
  const ENRICHED = '44444444-4444-4444-4444-444444444444';
  const PRELIM_ID = 'rv-stuck-1';

  // Cloud holds only the enriched copy (the preliminary was never synced).
  const db = {
    user_settings: [], categories: [], transcripts: [],
    bookmarks: [
      { id: ENRICHED, user_id: userId, url: 'https://dup.com/p', title: 'real', category: 'C', summary: 'done',
        tags: [], user_notes: '', added_timestamp: 1700000000000, revisit_by: null, status: 'Active',
        history: [], is_youtube: false, metadata: {}, updated_at: '2026-03-01T00:00:00.000Z', deleted_at: null },
    ]
  };

  const storage = makeStorage({
    rvSyncConfig: { url: 'https://test.local', anonKey: 'anon' },
    rvSession: { access_token: 'a', refresh_token: 'r', expires_at: Date.now() + 3600000, user: { id: userId, email: 'ada@x.com' } },
    rvData: { bookmarks: [
      { id: ENRICHED, url: 'https://dup.com/p', title: 'real', category: 'C', summary: 'done', tags: [],
        history: [], status: 'Active', userNotes: '', addedTimestamp: 1700000000000, updatedAt: '2026-03-01T00:00:00.000Z' },
      // months-old stuck preliminary for the SAME url (enrichment never finished)
      { id: PRELIM_ID, url: 'https://dup.com/p', title: 'real', category: 'Uncategorized', summary: '', tags: [],
        history: [], status: 'Active', userNotes: '', isPreliminary: true, addedTimestamp: 1700000000000 },
    ], categories: [], settings: {} },
  });

  globalThis.chrome = { storage: { local: storage } };
  globalThis.fetch = makeFetch(db);
  delete require.cache[require.resolve('./sync.js')];
  delete require.cache[require.resolve('./rv-sync-core.js')];
  require('./rv-sync-core.js');
  require('./sync.js');

  await globalThis.RvSync.syncCycle();

  // Local: the stuck preliminary is gone, the enriched copy remains.
  const local = (await storage.get('rvData')).rvData.bookmarks;
  assert.ok(!local.some(b => b.id === PRELIM_ID), 'stale preliminary dropped locally');
  assert.strictEqual(local.filter(b => !b.deletedAt && b.url === 'https://dup.com/p').length, 1, 'one bookmark left for the url');
  assert.ok(local.some(b => b.id === ENRICHED), 'enriched copy survives');

  // Cloud: the preliminary was never pushed, so there must be NO row (tombstone or otherwise) for it.
  assert.ok(!db.bookmarks.some(r => r.id === PRELIM_ID), 'no cloud row created for the dropped preliminary');
});
