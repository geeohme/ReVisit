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

test('setupGateDecision: valid rvLocal with live enabled default → none', () => {
  const rvData = { spaces: [{ id: 's1', name: 'S1', priority: 1 }] };
  const rvLocal = { enabledSpaceIds: ['s1'], defaultSpaceId: 's1', lastUsedListSpaceId: 's1' };
  assert.strictEqual(spaces.setupGateDecision(rvData, rvLocal), 'none');
});
test('setupGateDecision: no rvLocal default + empty spaces → migrate', () => {
  assert.strictEqual(spaces.setupGateDecision({ spaces: [] }, spaces.defaultRvLocal()), 'migrate');
});
test('setupGateDecision: no rvLocal default + non-empty spaces → pick', () => {
  const rvData = { spaces: [{ id: 's1', name: 'S1', priority: 1 }] };
  assert.strictEqual(spaces.setupGateDecision(rvData, spaces.defaultRvLocal()), 'pick');
});
test('setupGateDecision: default points at a tombstoned Space → pick (spaces non-empty)', () => {
  const rvData = { spaces: [{ id: 's1', name: 'S1', priority: 1, deletedAt: '2026-01-01T00:00:00.000Z' }] };
  const rvLocal = { enabledSpaceIds: ['s1'], defaultSpaceId: 's1', lastUsedListSpaceId: 's1' };
  // s1 is tombstoned, no live Space remains and spaces[] still has a (dead) row → pick
  assert.strictEqual(spaces.setupGateDecision(rvData, rvLocal), 'pick');
});
test('setupGateDecision: default not in enabledSpaceIds → pick', () => {
  const rvData = { spaces: [{ id: 's1', name: 'S1', priority: 1 }] };
  const rvLocal = { enabledSpaceIds: [], defaultSpaceId: 's1', lastUsedListSpaceId: '' };
  assert.strictEqual(spaces.setupGateDecision(rvData, rvLocal), 'pick');
});
test('setupGateDecision: null rvLocal + empty spaces → migrate', () => {
  assert.strictEqual(spaces.setupGateDecision({ spaces: [] }, null), 'migrate');
});

test('buildBackupV3: emits version 3 with spaces + spaced bookmarks/categories, NO rvLocal', () => {
  const out = spaces.buildBackupV3({
    spaces: [{ id: 's1', name: 'S1', priority: 1, updatedAt: 'x' }],
    bookmarks: [{ id: 'b1', spaceId: 's1' }],
    categories: [{ spaceId: 's1', name: 'Articles', priority: 1 }],
  }, { foo: 'transcript' }, '2026-09-09T00:00:00.000Z');
  assert.strictEqual(out.version, 3);
  assert.strictEqual(out.exportedAt, '2026-09-09T00:00:00.000Z');
  assert.deepStrictEqual(out.spaces, [{ id: 's1', name: 'S1', priority: 1, updatedAt: 'x' }]);
  assert.strictEqual(out.bookmarks[0].spaceId, 's1');
  assert.strictEqual(out.categories[0].spaceId, 's1');
  assert.deepStrictEqual(out.transcripts, { foo: 'transcript' });
  assert.ok(!('enabledSpaceIds' in out) && !('defaultSpaceId' in out) && !('lastUsedListSpaceId' in out) && !('rvLocal' in out));
});

const core = require('./rv-sync-core.js'); // for mergeBackupBookmarks parity in assertions
const genUuid = () => '00000000-0000-4000-8000-000000000000';

test('assignTargetSpace: stamps spaceId onto ALL legacy bookmarks and categories', () => {
  const out = spaces.assignTargetSpace(
    { bookmarks: [{ id: 'b1' }, { id: 'b2' }], categories: [{ name: 'Articles', priority: 1 }] },
    'target-id');
  assert.ok(out.bookmarks.every(b => b.spaceId === 'target-id'));
  assert.ok(out.categories.every(c => c.spaceId === 'target-id'));
});

test('mergeRestoredV3: merges spaces by id, categories by composite key, returns enable ids', () => {
  const current = {
    spaces: [{ id: 's1', name: 'S1', priority: 1, updatedAt: '2026-01-01T00:00:00.000Z' }],
    categories: [{ spaceId: 's1', name: 'Articles', priority: 1, updatedAt: '2026-01-01T00:00:00.000Z' }],
    bookmarks: [],
  };
  const backup = {
    version: 3,
    spaces: [
      { id: 's1', name: 'S1 renamed', priority: 1, updatedAt: '2026-05-05T00:00:00.000Z' }, // newer → wins
      { id: 's2', name: 'S2', priority: 2, updatedAt: '2026-05-05T00:00:00.000Z' },          // new
    ],
    categories: [{ spaceId: 's2', name: 'Articles', priority: 1, updatedAt: '2026-05-05T00:00:00.000Z' }], // distinct identity
    bookmarks: [{ id: 'b9b9b9b9-0000-4000-8000-000000000000', spaceId: 's2', url: 'u9', updatedAt: '2026-05-05T00:00:00.000Z' }],
  };
  const out = spaces.mergeRestoredV3(current, backup, '2026-09-09T00:00:00.000Z', genUuid);
  assert.strictEqual(out.spaces.find(s => s.id === 's1').name, 'S1 renamed'); // LWW
  assert.ok(out.spaces.find(s => s.id === 's2'));
  // both "Articles" survive because identity is (spaceId, name)
  assert.strictEqual(out.categories.filter(c => c.name === 'Articles').length, 2);
  // valid-UUID id is preserved verbatim by mergeBackupBookmarks (no rename)
  assert.ok(out.bookmarks.find(b => b.id === 'b9b9b9b9-0000-4000-8000-000000000000'));
  assert.deepStrictEqual([...out.enableSpaceIds].sort(), ['s1', 's2']); // all restored Space ids
});
