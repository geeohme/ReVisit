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
