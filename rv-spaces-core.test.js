const test = require('node:test');
const assert = require('node:assert');
const spaces = require('./rv-spaces-core.js');

const DEFAULT_SPACE_ID = 'default-space';

test('catKey: composite of spaceId and name with a space separator', () => {
  assert.strictEqual(spaces.catKey({ spaceId: 's1', name: 'Articles' }), 's1 Articles');
});

test('defaultRvLocal: empty installation shape', () => {
  assert.deepStrictEqual(spaces.defaultRvLocal(), {
    enabledSpaceIds: [], defaultSpaceId: '', lastUsedListSpaceId: ''
  });
});

test('DEFAULT_SPACE_ID is the literal "default-space"', () => {
  assert.strictEqual(spaces.DEFAULT_SPACE_ID, DEFAULT_SPACE_ID);
});

test('nextSpacePriority: max existing priority + 1, or 1 when empty', () => {
  assert.strictEqual(spaces.nextSpacePriority([]), 1);
  assert.strictEqual(spaces.nextSpacePriority([{ priority: 1 }, { priority: 4 }]), 5);
});

test('makeSpace: builds a live Space record with given id/name/priority and stamp', () => {
  const s = spaces.makeSpace('id-1', 'Work', 2, '2026-09-09T00:00:00.000Z');
  assert.deepStrictEqual(s, { id: 'id-1', name: 'Work', priority: 2, updatedAt: '2026-09-09T00:00:00.000Z' });
});

test('liveSpaces: filters out tombstoned, sorts by priority', () => {
  const list = [
    { id: 'b', name: 'B', priority: 2 },
    { id: 'a', name: 'A', priority: 1 },
    { id: 'd', name: 'D', priority: 3, deletedAt: '2026-01-01T00:00:00.000Z' },
  ];
  const out = spaces.liveSpaces(list);
  assert.deepStrictEqual(out.map(s => s.id), ['a', 'b']);
});

test('tombstoneSpace: marks deletedAt/updatedAt on the matching id only', () => {
  const list = [{ id: 'a', name: 'A', priority: 1 }, { id: 'b', name: 'B', priority: 2 }];
  const out = spaces.tombstoneSpace(list, 'a', '2026-09-09T00:00:00.000Z');
  assert.strictEqual(out.find(s => s.id === 'a').deletedAt, '2026-09-09T00:00:00.000Z');
  assert.strictEqual(out.find(s => s.id === 'b').deletedAt, undefined);
});

test('migrateToDefaultSpace: buckets space-less categories+bookmarks and creates the default Space', () => {
  const data = {
    bookmarks: [{ id: 'b1', url: 'u1' }, { id: 'b2', url: 'u2' }],
    categories: [{ name: 'Articles', priority: 1 }],
    spaces: [],
  };
  const out = spaces.migrateToDefaultSpace(data, 'My Bookmarks', '2026-09-09T00:00:00.000Z');
  assert.strictEqual(out.spaces.length, 1);
  assert.deepStrictEqual(out.spaces[0], {
    id: 'default-space', name: 'My Bookmarks', priority: 1, updatedAt: '2026-09-09T00:00:00.000Z'
  });
  assert.ok(out.bookmarks.every(b => b.spaceId === 'default-space'));
  assert.ok(out.categories.every(c => c.spaceId === 'default-space'));
});

test('migrateToDefaultSpace: idempotent — only fills missing spaceId, reuses existing default Space', () => {
  const data = {
    bookmarks: [{ id: 'b1', url: 'u1', spaceId: 'default-space' }, { id: 'b2', url: 'u2' }],
    categories: [{ name: 'Articles', priority: 1, spaceId: 'default-space' }],
    spaces: [{ id: 'default-space', name: 'Existing', priority: 1, updatedAt: '2026-01-01T00:00:00.000Z' }],
  };
  const out = spaces.migrateToDefaultSpace(data, 'Ignored', '2026-09-09T00:00:00.000Z');
  assert.strictEqual(out.spaces.length, 1);
  assert.strictEqual(out.spaces[0].name, 'Existing');        // not re-created / not renamed
  assert.strictEqual(out.spaces[0].updatedAt, '2026-01-01T00:00:00.000Z');
  assert.ok(out.bookmarks.every(b => b.spaceId === 'default-space'));
  assert.strictEqual(out.bookmarks[0].spaceId, 'default-space'); // already-set is preserved
});
