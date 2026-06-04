const test = require('node:test');
const assert = require('node:assert');
const core = require('./rv-sync-core.js');

test('stampRecord sets updatedAt and _dirty', () => {
  const r = core.stampRecord({ id: 'a' }, '2026-01-01T00:00:00.000Z');
  assert.strictEqual(r._dirty, true);
  assert.strictEqual(r.updatedAt, '2026-01-01T00:00:00.000Z');
});

test('mergeRecordLWW: remote newer wins', () => {
  const local  = { id: 'a', title: 'old', updatedAt: '2026-01-01T00:00:00.000Z' };
  const remote = { id: 'a', title: 'new', updatedAt: '2026-02-01T00:00:00.000Z' };
  assert.strictEqual(core.mergeRecordLWW(local, remote).title, 'new');
});

test('mergeRecordLWW: local newer wins', () => {
  const local  = { id: 'a', title: 'keep', updatedAt: '2026-03-01T00:00:00.000Z' };
  const remote = { id: 'a', title: 'stale', updatedAt: '2026-02-01T00:00:00.000Z' };
  assert.strictEqual(core.mergeRecordLWW(local, remote).title, 'keep');
});

test('applyRemoteList: tombstone removes local record', () => {
  const localList = [{ id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' }];
  const remote = [{ id: 'a', updatedAt: '2026-02-01T00:00:00.000Z', deletedAt: '2026-02-01T00:00:00.000Z' }];
  const out = core.applyRemoteList(localList, remote, 'id');
  assert.strictEqual(out.find(r => r.id === 'a'), undefined);
});

test('applyRemoteList: new remote record is added', () => {
  const out = core.applyRemoteList([], [{ id: 'b', updatedAt: '2026-02-01T00:00:00.000Z' }], 'id');
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].id, 'b');
});

test('ensureUuid: legacy rv- id gets a uuid and legacyId', () => {
  const b = core.ensureUuid({ id: 'rv-123-abc', title: 't' }, () => '11111111-1111-1111-1111-111111111111');
  assert.strictEqual(b.id, '11111111-1111-1111-1111-111111111111');
  assert.strictEqual(b.legacyId, 'rv-123-abc');
});
test('ensureUuid: already-uuid id is left alone', () => {
  const u = '22222222-2222-2222-2222-222222222222';
  const b = core.ensureUuid({ id: u, title: 't' }, () => 'SHOULD-NOT-BE-USED');
  assert.strictEqual(b.id, u);
  assert.strictEqual(b.legacyId, undefined);
});

test('encrypt/decrypt round-trip with derived key', async () => {
  const key = await core.deriveEncKey('hunter2', 'static-salt-123');
  const enc = await core.encryptSecret('sk-abc-123', key);
  assert.ok(enc.ct && enc.iv);
  const dec = await core.decryptSecret(enc, key);
  assert.strictEqual(dec, 'sk-abc-123');
});

test('wrong password fails to decrypt', async () => {
  const k1 = await core.deriveEncKey('right', 'salt');
  const k2 = await core.deriveEncKey('wrong', 'salt');
  const enc = await core.encryptSecret('secret', k1);
  await assert.rejects(() => core.decryptSecret(enc, k2));
});

test('derived key is extractable and survives export/import (persistence across SW restart)', async () => {
  const key = await core.deriveEncKey('pw', 'salt');
  const enc = await core.encryptSecret('sk-persist-me', key);
  // Simulate: export raw, persist, then re-import after a worker restart.
  const raw = await crypto.subtle.exportKey('raw', key);
  const reimported = await crypto.subtle.importKey('raw', new Uint8Array(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);
  const dec = await core.decryptSecret(enc, reimported);
  assert.strictEqual(dec, 'sk-persist-me');
});

test('isValidSession: complete session is valid', () => {
  assert.strictEqual(core.isValidSession({ access_token: 'a', refresh_token: 'r', user: { id: 'u' } }), true);
});
test('isValidSession: missing refresh_token is invalid (would send {} refresh)', () => {
  assert.strictEqual(core.isValidSession({ access_token: 'a', user: { id: 'u' } }), false);
});
test('isValidSession: missing user is invalid (would crash on s.user.id)', () => {
  assert.strictEqual(core.isValidSession({ access_token: 'a', refresh_token: 'r' }), false);
});
test('isValidSession: null is invalid', () => {
  assert.strictEqual(core.isValidSession(null), false);
});

test('detectBackupVersion: no version field => 1 (legacy)', () => {
  assert.strictEqual(core.detectBackupVersion({ bookmarks: [] }), 1);
});
test('detectBackupVersion: version 2', () => {
  assert.strictEqual(core.detectBackupVersion({ version: 2, bookmarks: [] }), 2);
});
test('mergeBackupBookmarks: legacy id matched by legacyId, no dup', () => {
  const existing = [{ id: 'uuid-1', legacyId: 'rv-1', title: 'current', updatedAt: '2026-02-01T00:00:00.000Z' }];
  const incoming = [{ id: 'rv-1', title: 'older', updatedAt: '2026-01-01T00:00:00.000Z' }];
  const out = core.mergeBackupBookmarks(existing, incoming, () => 'uuid-NEW');
  assert.strictEqual(out.length, 1);            // matched by legacyId, not duplicated
  assert.strictEqual(out[0].title, 'current');  // LWW: existing is newer
});
test('mergeBackupBookmarks: brand-new legacy bookmark gets uuid', () => {
  const out = core.mergeBackupBookmarks([], [{ id: 'rv-9', title: 't', updatedAt: '2026-01-01T00:00:00.000Z' }], () => 'uuid-9');
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].id, 'uuid-9');
  assert.strictEqual(out[0].legacyId, 'rv-9');
  assert.strictEqual(out[0]._dirty, true);      // must push after restore
});

// ── stampChangedList (C1 fix: only stamp records whose content actually changed) ──
test('stampChangedList: unchanged record is NOT re-stamped', () => {
  const prev = [{ id: 'a', title: 'x', updatedAt: '2026-01-01T00:00:00.000Z' }];
  const next = [{ id: 'a', title: 'x', updatedAt: '2026-01-01T00:00:00.000Z' }];
  const out = core.stampChangedList(prev, next, 'id', '2026-09-09T00:00:00.000Z');
  assert.strictEqual(out[0].updatedAt, '2026-01-01T00:00:00.000Z'); // untouched
  assert.strictEqual(out[0]._dirty, undefined);
});
test('stampChangedList: changed content IS stamped', () => {
  const prev = [{ id: 'a', title: 'x', updatedAt: '2026-01-01T00:00:00.000Z' }];
  const next = [{ id: 'a', title: 'EDITED', updatedAt: '2026-01-01T00:00:00.000Z' }];
  const out = core.stampChangedList(prev, next, 'id', '2026-09-09T00:00:00.000Z');
  assert.strictEqual(out[0].updatedAt, '2026-09-09T00:00:00.000Z');
  assert.strictEqual(out[0]._dirty, true);
});
test('stampChangedList: brand-new record is stamped', () => {
  const out = core.stampChangedList([], [{ id: 'b', title: 't' }], 'id', '2026-09-09T00:00:00.000Z');
  assert.strictEqual(out[0]._dirty, true);
  assert.strictEqual(out[0].updatedAt, '2026-09-09T00:00:00.000Z');
});
test('stampChangedList: a record already dirty but unchanged stays dirty, not re-timestamped', () => {
  const prev = [{ id: 'a', title: 'x', updatedAt: '2026-02-02T00:00:00.000Z', _dirty: true }];
  const next = [{ id: 'a', title: 'x', updatedAt: '2026-02-02T00:00:00.000Z', _dirty: true }];
  const out = core.stampChangedList(prev, next, 'id', '2026-09-09T00:00:00.000Z');
  assert.strictEqual(out[0].updatedAt, '2026-02-02T00:00:00.000Z'); // pending push preserved
  assert.strictEqual(out[0]._dirty, true);
});
test('stampChangedList: meta-only difference (stamp) does NOT count as change', () => {
  const prev = [{ id: 'a', title: 'x', updatedAt: '2026-01-01T00:00:00.000Z' }];
  const next = [{ id: 'a', title: 'x', updatedAt: '2026-05-05T00:00:00.000Z', _dirty: true }];
  const out = core.stampChangedList(prev, next, 'id', '2026-09-09T00:00:00.000Z');
  // content identical → returned as-is (whatever next already had), not re-stamped to isoNow
  assert.strictEqual(out[0].updatedAt, '2026-05-05T00:00:00.000Z');
});

// ── dedupeBookmarksByUrl ──
test('dedupeBookmarksByUrl: two same-url records collapse to survivor + tombstone', () => {
  const list = [
    { id: 'b1', url: 'https://x.com/p', title: 'newer', summary: 's', userNotes: 'n', tags: ['t'], history: ['h'], updatedAt: '2026-02-01T00:00:00.000Z' },
    { id: 'a1', url: 'https://x.com/p', title: 'older', summary: 's', userNotes: 'n', tags: ['t'], history: ['h'], updatedAt: '2026-01-01T00:00:00.000Z' },
  ];
  const { list: out, changed } = core.dedupeBookmarksByUrl(list, '2026-09-09T00:00:00.000Z');
  const live = out.filter(b => !b.deletedAt);
  const dead = out.filter(b => b.deletedAt);
  assert.strictEqual(live.length, 1);
  assert.strictEqual(live[0].id, 'b1');                 // newest updatedAt survives
  assert.strictEqual(live[0]._dirty, undefined);        // survivor needed no gap-fill → untouched
  assert.strictEqual(dead.length, 1);
  assert.strictEqual(dead[0].id, 'a1');
  assert.strictEqual(dead[0]._dirty, true);
  assert.strictEqual(dead[0].deletedAt, '2026-09-09T00:00:00.000Z');
  assert.strictEqual(changed, 1);                       // only the tombstone counts
});

test('dedupeBookmarksByUrl: gap-fills empty survivor fields from older loser', () => {
  const list = [
    { id: 'b1', url: 'https://x.com/p', userNotes: '', summary: '', tags: [], history: [], updatedAt: '2026-02-01T00:00:00.000Z' },
    { id: 'a1', url: 'https://x.com/p', userNotes: 'keep me', summary: 'old summary', tags: ['x'], history: ['h1'], updatedAt: '2026-01-01T00:00:00.000Z' },
  ];
  const { list: out, changed } = core.dedupeBookmarksByUrl(list, '2026-09-09T00:00:00.000Z');
  const survivor = out.find(b => b.id === 'b1');
  assert.strictEqual(survivor.userNotes, 'keep me');
  assert.strictEqual(survivor.summary, 'old summary');
  assert.deepStrictEqual(survivor.tags, ['x']);
  assert.deepStrictEqual(survivor.history, ['h1']);
  assert.strictEqual(survivor.updatedAt, '2026-09-09T00:00:00.000Z'); // re-stamped
  assert.strictEqual(survivor._dirty, true);
  assert.strictEqual(changed, 2);  // survivor gap-filled + loser tombstoned
});

test('dedupeBookmarksByUrl: three same-url records collapse to one survivor + two tombstones', () => {
  const list = [
    { id: 'c', url: 'https://x.com/p', updatedAt: '2026-03-01T00:00:00.000Z' },
    { id: 'a', url: 'https://x.com/p', updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'b', url: 'https://x.com/p', updatedAt: '2026-02-01T00:00:00.000Z' },
  ];
  const { list: out } = core.dedupeBookmarksByUrl(list, '2026-09-09T00:00:00.000Z');
  assert.strictEqual(out.filter(b => !b.deletedAt).length, 1);
  assert.strictEqual(out.find(b => !b.deletedAt).id, 'c');           // newest survives
  assert.strictEqual(out.filter(b => b.deletedAt).length, 2);
});

test('dedupeBookmarksByUrl: no duplicates → changed 0 and original references kept', () => {
  const r1 = { id: 'a', url: 'https://x.com/1', updatedAt: '2026-01-01T00:00:00.000Z' };
  const r2 = { id: 'b', url: 'https://x.com/2', updatedAt: '2026-01-01T00:00:00.000Z' };
  const { list: out, changed } = core.dedupeBookmarksByUrl([r1, r2], '2026-09-09T00:00:00.000Z');
  assert.strictEqual(changed, 0);
  assert.strictEqual(out.find(b => b.id === 'a'), r1);  // same reference, untouched
  assert.strictEqual(out.find(b => b.id === 'b'), r2);
});

test('dedupeBookmarksByUrl: tombstones and url-less records pass through untouched', () => {
  const tomb  = { id: 't', url: 'https://x.com/p', deletedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
  const live  = { id: 'p', url: 'https://x.com/p', updatedAt: '2026-02-01T00:00:00.000Z' };
  const nourl = { id: 'n', updatedAt: '2026-02-01T00:00:00.000Z' };
  const { list: out, changed } = core.dedupeBookmarksByUrl([tomb, live, nourl], '2026-09-09T00:00:00.000Z');
  // The lone live record has no live twin to collapse against → nothing changes.
  assert.strictEqual(changed, 0);
  assert.strictEqual(out.find(b => b.id === 't'), tomb);
  assert.strictEqual(out.find(b => b.id === 'n'), nourl);
  assert.strictEqual(out.find(b => b.id === 'p'), live);
});

test('dedupeBookmarksByUrl: a preliminary with NO enriched twin passes through untouched', () => {
  const prelim = { id: 'pre', url: 'https://x.com/solo', isPreliminary: true, addedTimestamp: 100, updatedAt: '2026-02-01T00:00:00.000Z' };
  const { list: out, changed } = core.dedupeBookmarksByUrl([prelim], '2026-09-09T00:00:00.000Z');
  assert.strictEqual(changed, 0);
  assert.strictEqual(out.find(b => b.id === 'pre'), prelim); // stale, but no enriched copy to defer to → keep
});

test('dedupeBookmarksByUrl: an all-preliminary group (no enriched twin) is left untouched', () => {
  const p1 = { id: 'p1', url: 'https://x.com/q', isPreliminary: true, addedTimestamp: 100, updatedAt: '2026-01-01T00:00:00.000Z' };
  const p2 = { id: 'p2', url: 'https://x.com/q', isPreliminary: true, addedTimestamp: 100, updatedAt: '2026-02-01T00:00:00.000Z' };
  const { list: out, changed } = core.dedupeBookmarksByUrl([p1, p2], '2026-09-09T00:00:00.000Z');
  assert.strictEqual(changed, 0);
  assert.strictEqual(out.length, 2);
});

test('dedupeBookmarksByUrl: a STALE preliminary with an enriched twin is dropped (not tombstoned)', () => {
  const enriched    = { id: 'uuid-1', url: 'https://x.com/p', summary: 's', updatedAt: '2026-03-01T00:00:00.000Z' };
  const stalePrelim = { id: 'rv-1', url: 'https://x.com/p', isPreliminary: true, addedTimestamp: 100, updatedAt: '2026-01-01T00:00:00.000Z' };
  const { list: out, changed } = core.dedupeBookmarksByUrl([enriched, stalePrelim], '2026-09-09T00:00:00.000Z');
  assert.strictEqual(out.length, 1, 'stale preliminary removed entirely');
  assert.strictEqual(out[0].id, 'uuid-1', 'enriched copy survives');
  assert.ok(!out.some(b => b.deletedAt), 'dropped, NOT tombstoned (a preliminary was never synced)');
  assert.strictEqual(changed, 1);
});

test('dedupeBookmarksByUrl: enriched survivor gap-fills from a dropped stale preliminary', () => {
  const enriched    = { id: 'uuid-1', url: 'https://x.com/p', userNotes: '', updatedAt: '2026-03-01T00:00:00.000Z' };
  const stalePrelim = { id: 'rv-1', url: 'https://x.com/p', isPreliminary: true, addedTimestamp: 100, userNotes: 'note from prelim', updatedAt: '2026-01-01T00:00:00.000Z' };
  const { list: out } = core.dedupeBookmarksByUrl([enriched, stalePrelim], '2026-09-09T00:00:00.000Z');
  const surv = out.find(b => b.id === 'uuid-1');
  assert.strictEqual(surv.userNotes, 'note from prelim');
  assert.strictEqual(surv._dirty, true);
});

test('dedupeBookmarksByUrl: a FRESH preliminary with an enriched twin is preserved (active enrichment untouched)', () => {
  const now = '2026-09-09T00:00:00.000Z';
  const enriched   = { id: 'uuid-1', url: 'https://x.com/p', updatedAt: '2026-03-01T00:00:00.000Z' };
  const freshPrelim = { id: 'rv-1', url: 'https://x.com/p', isPreliminary: true, addedTimestamp: Date.parse(now) - 1000, updatedAt: now };
  const { list: out, changed } = core.dedupeBookmarksByUrl([enriched, freshPrelim], now);
  assert.strictEqual(changed, 0, 'fresh preliminary (<5 min old) is left alone');
  assert.strictEqual(out.find(b => b.id === 'rv-1'), freshPrelim); // preserved, original reference
  assert.strictEqual(out.find(b => b.id === 'uuid-1'), enriched);
});

test('dedupeBookmarksByUrl: equal updatedAt → deterministic survivor (lowest id)', () => {
  const same = '2026-02-01T00:00:00.000Z';
  const mk = () => [
    { id: 'zzz', url: 'https://x.com/p', updatedAt: same },
    { id: 'aaa', url: 'https://x.com/p', updatedAt: same },
  ];
  const out1 = core.dedupeBookmarksByUrl(mk(), '2026-09-09T00:00:00.000Z').list;
  const out2 = core.dedupeBookmarksByUrl(mk().reverse(), '2026-09-09T00:00:00.000Z').list;
  assert.strictEqual(out1.find(b => !b.deletedAt).id, 'aaa');  // lowest id wins
  assert.strictEqual(out2.find(b => !b.deletedAt).id, 'aaa');  // order-independent → converges
});

test('dedupeBookmarksByUrl: gap-fill picks the NEWEST loser that has a value', () => {
  const list = [
    { id: 's', url: 'https://x.com/p', userNotes: '', updatedAt: '2026-04-01T00:00:00.000Z' }, // survivor, empty notes
    { id: 'm', url: 'https://x.com/p', userNotes: 'newer note', updatedAt: '2026-03-01T00:00:00.000Z' }, // newest loser w/ value
    { id: 'o', url: 'https://x.com/p', userNotes: 'older note', updatedAt: '2026-01-01T00:00:00.000Z' }, // older loser w/ value
  ];
  const { list: out } = core.dedupeBookmarksByUrl(list, '2026-09-09T00:00:00.000Z');
  const survivor = out.find(b => !b.deletedAt);
  assert.strictEqual(survivor.id, 's');
  assert.strictEqual(survivor.userNotes, 'newer note'); // newest loser with a value wins
});

test('dedupeBookmarksByUrl: gap-filled array field is a copy, not the donor reference', () => {
  const donorTags = ['x', 'y'];
  const list = [
    { id: 'b1', url: 'https://x.com/p', tags: [], updatedAt: '2026-02-01T00:00:00.000Z' },
    { id: 'a1', url: 'https://x.com/p', tags: donorTags, updatedAt: '2026-01-01T00:00:00.000Z' },
  ];
  const { list: out } = core.dedupeBookmarksByUrl(list, '2026-09-09T00:00:00.000Z');
  const survivor = out.find(b => b.id === 'b1');
  assert.deepStrictEqual(survivor.tags, ['x', 'y']);
  assert.notStrictEqual(survivor.tags, donorTags); // must be a copy, not aliased
});
