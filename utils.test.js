const test = require('node:test');
const assert = require('node:assert');
const { buildOllamaSettings } = require('./utils.js');

test('buildOllamaSettings: empty inputs → both disabled, empty strings, null timestamp', () => {
  const o = buildOllamaSettings('', '');
  assert.deepStrictEqual(o, {
    localEnabled: false,
    localBaseUrl: '',
    cloudEnabled: false,
    cloudApiKey: '',
    modelsLastUpdated: null
  });
});

test('buildOllamaSettings: URL only → local enabled, cloud disabled', () => {
  const o = buildOllamaSettings('http://localhost:11434', '');
  assert.strictEqual(o.localEnabled, true);
  assert.strictEqual(o.localBaseUrl, 'http://localhost:11434');
  assert.strictEqual(o.cloudEnabled, false);
  assert.strictEqual(o.cloudApiKey, '');
});

test('buildOllamaSettings: key only → cloud enabled, local disabled', () => {
  const o = buildOllamaSettings('', 'sk-ollama-abc');
  assert.strictEqual(o.cloudEnabled, true);
  assert.strictEqual(o.cloudApiKey, 'sk-ollama-abc');
  assert.strictEqual(o.localEnabled, false);
});

test('buildOllamaSettings: trims whitespace on both fields', () => {
  const o = buildOllamaSettings('  http://x:11434  ', '  key  ');
  assert.strictEqual(o.localBaseUrl, 'http://x:11434');
  assert.strictEqual(o.cloudApiKey, 'key');
  assert.strictEqual(o.localEnabled, true);
  assert.strictEqual(o.cloudEnabled, true);
});

test('buildOllamaSettings: preserves prevModelsLastUpdated', () => {
  const o = buildOllamaSettings('http://x', '', '2026-05-01T00:00:00.000Z');
  assert.strictEqual(o.modelsLastUpdated, '2026-05-01T00:00:00.000Z');
});

test('buildOllamaSettings: null/undefined inputs are safe', () => {
  const o = buildOllamaSettings(null, undefined);
  assert.strictEqual(o.localEnabled, false);
  assert.strictEqual(o.localBaseUrl, '');
  assert.strictEqual(o.cloudEnabled, false);
  assert.strictEqual(o.cloudApiKey, '');
  assert.strictEqual(o.modelsLastUpdated, null);
});
