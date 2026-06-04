// sync-bookmark-row.test.js
// Regression test for the PGRST102 "All object keys must match" sync failure.
//
// PostgREST's bulk upsert requires every object in the array to have an IDENTICAL
// key set. bookmarkToRow built several columns without defaults (url, title,
// category, summary, status, updated_at), so for legacy records missing any of
// them, JSON.stringify dropped the key — producing two row shapes in one batch and
// a 400 PGRST102. updated_at is NOT NULL in the schema, so it must always be set.
//
// These tests load the real sync.js (via the same chrome-stub pattern as the other
// sync tests) and assert bookmarkToRow emits a stable, fully-defined key set.

const test = require('node:test');
const assert = require('node:assert');

function loadSync() {
  globalThis.chrome = { storage: { local: { async get() { return {}; }, async set() {}, async remove() {} } } };
  delete require.cache[require.resolve('./sync.js')];
  delete require.cache[require.resolve('./rv-sync-core.js')];
  require('./rv-sync-core.js'); // sets globalThis.RvSyncCore (sync.js reads it)
  require('./sync.js');         // sets globalThis.RvSync
  return globalThis.RvSync;
}

// The JSON-serialized key set is what PostgREST actually sees (undefined values
// are dropped by JSON.stringify; null values keep their key).
const serializedKeys = row => Object.keys(JSON.parse(JSON.stringify(row))).sort();

test('bookmarkToRow: a full record and a bare legacy record serialize to the SAME key set', () => {
  const { bookmarkToRow } = loadSync();
  const full = bookmarkToRow({
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', url: 'https://x.com/p', title: 't',
    category: 'c', summary: 's', tags: ['k'], userNotes: 'n', addedTimestamp: 1700000000000,
    revisitBy: '2026-01-01T00:00:00.000Z', status: 'Active', history: ['h'], isYouTube: false,
    metadata: { a: 1 }, updatedAt: '2026-01-01T00:00:00.000Z'
  }, 'user-1');
  // A legacy record: only id + url, everything else undefined (no updatedAt).
  const legacy = bookmarkToRow({ id: 'rv-123', url: 'https://x.com/p' }, 'user-1');

  assert.deepStrictEqual(
    serializedKeys(legacy), serializedKeys(full),
    'serialized key sets must match so a mixed batch passes PostgREST bulk upsert'
  );
});

test('bookmarkToRow: updated_at is always a non-null timestamp (NOT NULL column)', () => {
  const { bookmarkToRow } = loadSync();
  // No updatedAt, but has an addedTimestamp → derive from it.
  const fromAdded = bookmarkToRow({ id: 'rv-1', addedTimestamp: 1700000000000 }, 'u');
  assert.ok(fromAdded.updated_at, 'updated_at must be set');
  assert.strictEqual(fromAdded.updated_at, new Date(1700000000000).toISOString());
  // No updatedAt and no addedTimestamp → still a valid ISO timestamp, never undefined.
  const bare = bookmarkToRow({ id: 'rv-2' }, 'u');
  assert.ok(bare.updated_at && !Number.isNaN(Date.parse(bare.updated_at)), 'updated_at must be a valid timestamp');
});

test('bookmarkToRow: no field serializes to undefined (every key survives JSON.stringify)', () => {
  const { bookmarkToRow } = loadSync();
  const row = bookmarkToRow({ id: 'rv-3' }, 'u'); // maximally sparse
  for (const [k, v] of Object.entries(row)) {
    assert.notStrictEqual(v, undefined, `${k} must not be undefined (would drop the key)`);
  }
});

test('bookmarkToRow: present values are preserved unchanged', () => {
  const { bookmarkToRow } = loadSync();
  const row = bookmarkToRow({
    id: 'id1', url: 'u', title: 'ti', category: 'ca', summary: 'su', status: 'Active',
    updatedAt: '2026-05-05T00:00:00.000Z'
  }, 'user-1');
  assert.strictEqual(row.url, 'u');
  assert.strictEqual(row.title, 'ti');
  assert.strictEqual(row.category, 'ca');
  assert.strictEqual(row.summary, 'su');
  assert.strictEqual(row.status, 'Active');
  assert.strictEqual(row.updated_at, '2026-05-05T00:00:00.000Z'); // real updatedAt kept, not overwritten
});

// ── End-to-end: the cycle must survive a key-strict server and reach dedupe ──
// Reproduces the production failure: a mixed batch (a legacy record without
// updatedAt + an edited record with it) hit PostgREST's "All object keys must
// match" (PGRST102), pushLocalChanges threw, and _runCycle aborted before dedupe.

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
  };
}

// fetch mock that ENFORCES PostgREST's bulk-upsert key-match rule for /bookmarks.
function makeStrictFetch(db) {
  const resp = (data, status = 200) => ({
    ok: status >= 200 && status < 300, status,
    async json() { return data; }, async text() { return JSON.stringify(data); }
  });
  return async function (url, opts = {}) {
    const method = (opts.method || 'GET').toUpperCase();
    const u = String(url);
    if (u.includes('/bookmarks')) {
      if (method === 'GET') return resp(db.bookmarks);
      if (method === 'POST') {
        const rows = JSON.parse(opts.body);
        const sigs = new Set(rows.map(r => Object.keys(r).sort().join(',')));
        if (sigs.size > 1) return resp({ code: 'PGRST102', message: 'All object keys must match' }, 400);
        for (const r of rows) { const ex = db.bookmarks.find(x => x.id === r.id); if (ex) Object.assign(ex, r); else db.bookmarks.push({ ...r }); }
        return resp(null, 201);
      }
    }
    if (u.includes('/user_settings')) return resp(method === 'GET' ? [] : null, method === 'GET' ? 200 : 201);
    if (method === 'GET' && u.includes('/categories')) return resp([]);
    if (method === 'GET' && u.includes('/transcripts')) return resp([]);
    if (method === 'POST') return resp(null, 201);
    return resp([]);
  };
}

test('syncCycle survives a legacy-record mixed batch and collapses the duplicate', async () => {
  const userId = '11111111-1111-1111-1111-111111111111';
  const SURV = '33333333-3333-3333-3333-333333333333'; // cloud uuid copy of the dup url (newer)

  const db = {
    bookmarks: [
      { id: SURV, user_id: userId, url: 'https://dup.com/x', title: 'A', category: 'C', summary: '',
        tags: [], user_notes: '', added_timestamp: 1700000000000, revisit_by: null, status: 'Active',
        history: [], is_youtube: false, metadata: {}, updated_at: '2026-03-01T00:00:00.000Z', deleted_at: null },
    ]
  };

  const storage = makeStorage({
    rvSyncConfig: { url: 'https://test.local', anonKey: 'anon' },
    rvSession: { access_token: 'a', refresh_token: 'r', expires_at: Date.now() + 3600000, user: { id: userId, email: 'ada@x.com' } },
    rvData: { bookmarks: [
      // legacy record, NO updatedAt — same url as the cloud copy, holds a note to preserve
      { id: 'rv-old-1', url: 'https://dup.com/x', title: 'A', category: 'C', summary: '', tags: [],
        history: [], status: 'Active', userNotes: 'kept note', addedTimestamp: 1700000000000 },
      // an unrelated edited record WITH updatedAt — makes the push batch mixed-shape
      { id: '22222222-2222-2222-2222-222222222222', url: 'https://other.com/y', title: 'B', category: 'C',
        summary: '', tags: [], history: [], status: 'Active', userNotes: '', updatedAt: '2026-02-01T00:00:00.000Z', _dirty: true },
    ], categories: [], settings: {} },
  });

  globalThis.chrome = { storage: { local: storage } };
  globalThis.fetch = makeStrictFetch(db);
  delete require.cache[require.resolve('./sync.js')];
  delete require.cache[require.resolve('./rv-sync-core.js')];
  require('./rv-sync-core.js');
  require('./sync.js');

  await globalThis.RvSync.syncCycle();

  // The mixed batch was accepted (the unrelated edit reached the cloud) → no PGRST102 abort.
  assert.ok(db.bookmarks.find(r => r.id === '22222222-2222-2222-2222-222222222222'),
    'edited record pushed → cycle did not abort on the mixed batch');

  // The duplicate collapsed locally to one survivor, with the legacy note preserved.
  const local = (await storage.get('rvData')).rvData.bookmarks;
  const liveX = local.filter(b => !b.deletedAt && b.url === 'https://dup.com/x');
  assert.strictEqual(liveX.length, 1, 'exactly one bookmark for the duplicated url survives locally');
  assert.strictEqual(liveX[0].id, SURV, 'the newer cloud copy is the survivor');
  assert.strictEqual(liveX[0].userNotes, 'kept note', 'gap-fill preserved the legacy note');

  // Cloud: survivor carries the note and is live; the converted-legacy copy is tombstoned.
  const cloudSurv = db.bookmarks.find(r => r.id === SURV);
  assert.strictEqual(cloudSurv.user_notes, 'kept note');
  assert.ok(!cloudSurv.deleted_at, 'cloud survivor not tombstoned');
  assert.ok(db.bookmarks.some(r => r.url === 'https://dup.com/x' && r.id !== SURV && r.deleted_at),
    'the converted-legacy duplicate row is tombstoned in the cloud');
});
