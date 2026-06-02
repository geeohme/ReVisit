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
