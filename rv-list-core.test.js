const test = require('node:test');
const assert = require('node:assert');
const core = require('./rv-list-core.js');

// --- resolveInterval: number | null (None) ---
test('resolveInterval: number passes through', () => {
  assert.strictEqual(core.resolveInterval({ defaultIntervalDays: 14 }), 14);
});
test('resolveInterval: missing → default 7', () => {
  assert.strictEqual(core.resolveInterval({}), 7);
  assert.strictEqual(core.resolveInterval(undefined), 7);
});
test('resolveInterval: explicit null → null (None)', () => {
  assert.strictEqual(core.resolveInterval({ defaultIntervalDays: null }), null);
});

// --- revisitTransition: the "remind again" action makes ReVisited real ---
test('revisitTransition: numeric interval sets ReVisited + future revisitBy', () => {
  const now = new Date('2026-06-08T00:00:00.000Z');
  const r = core.revisitTransition(now, 7);
  assert.strictEqual(r.status, 'ReVisited');
  assert.strictEqual(r.revisitBy, '2026-06-15T00:00:00.000Z');
});
test('revisitTransition: null interval → ReVisited, revisitBy unchanged (undefined => caller keeps existing)', () => {
  const now = new Date('2026-06-08T00:00:00.000Z');
  const r = core.revisitTransition(now, null);
  assert.strictEqual(r.status, 'ReVisited');
  assert.strictEqual(r.revisitBy, undefined);
});

// --- avatarLetter: category first letter, fall back to host ---
test('avatarLetter: uses category first letter, uppercased', () => {
  assert.strictEqual(core.avatarLetter('news', 'example.com'), 'N');
});
test('avatarLetter: no category → host first letter', () => {
  assert.strictEqual(core.avatarLetter('', 'example.com'), 'E');
  assert.strictEqual(core.avatarLetter(null, 'example.com'), 'E');
});
test('avatarLetter: neither → bullet', () => {
  assert.strictEqual(core.avatarLetter('', ''), '•');
});

// --- avatarColor: bookmark override > category color > deterministic palette ---
const PALETTE = ['#aaa111', '#bbb222', '#ccc333'];
test('avatarColor: per-bookmark override wins', () => {
  assert.strictEqual(core.avatarColor('#123456', '#999999', 'example.com', PALETTE), '#123456');
});
test('avatarColor: else category color', () => {
  assert.strictEqual(core.avatarColor(null, '#999999', 'example.com', PALETTE), '#999999');
});
test('avatarColor: else deterministic palette by host (stable)', () => {
  const a = core.avatarColor(null, null, 'example.com', PALETTE);
  const b = core.avatarColor(null, null, 'example.com', PALETTE);
  assert.strictEqual(a, b);
  assert.ok(PALETTE.includes(a));
});

// --- nextCategoryColor: pick least-used palette colour ---
test('nextCategoryColor: returns an unused palette colour when available', () => {
  const used = ['#aaa111'];
  const c = core.nextCategoryColor(used, PALETTE);
  assert.ok(c === '#bbb222' || c === '#ccc333');
  assert.ok(!used.includes(c));
});
test('nextCategoryColor: all used → still returns a palette colour', () => {
  const c = core.nextCategoryColor([...PALETTE], PALETTE);
  assert.ok(PALETTE.includes(c));
});

// --- removeTagFromBookmarks: strips tag everywhere, marks dirty ---
test('removeTagFromBookmarks: removes tag and marks affected dirty', () => {
  const now = '2026-06-08T00:00:00.000Z';
  const bks = [
    { id: '1', tags: ['x', 'y'] },
    { id: '2', tags: ['y'] },
    { id: '3', tags: ['x'] },
  ];
  const changed = core.removeTagFromBookmarks(bks, 'x', now);
  assert.strictEqual(changed, 2);
  assert.deepStrictEqual(bks[0].tags, ['y']);
  assert.strictEqual(bks[0]._dirty, true);
  assert.strictEqual(bks[0].updatedAt, now);
  assert.deepStrictEqual(bks[1].tags, ['y']);
  assert.strictEqual(bks[1]._dirty, undefined); // untouched
  assert.deepStrictEqual(bks[2].tags, []);
});
