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
