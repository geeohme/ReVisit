# Ollama Provider Integration Design

**Date:** 2026-05-18
**Status:** Approved

---

## Overview

Add Ollama (local and cloud) as selectable AI providers in the ReVisit extension, alongside the existing LLM Gateway providers. Ollama models appear in the per-transaction provider/model dropdowns, use the same prompts as all other providers, and are managed through a new Ollama Settings section that mirrors the existing LLM Gateway UI patterns.

---

## Approach

**Merged model list.** Ollama models are fetched and merged into the existing `settings.llmGateway.modelsData` structure under two new keys: `ollama-local` and `ollama-cloud`. All existing rendering logic (`populateProviderDropdowns`, `updateModelDropdownFromGateway`, `saveSettings`) requires zero changes — Ollama providers appear as two more entries in the dropdowns. Routing in `background.js` detects these provider keys and calls Ollama directly instead of the LLM Gateway. Prompt text is identical to what the gateway uses — only the transport layer differs.

---

## Section 1: Storage Schema

### New `settings.ollama` key

```js
settings: {
  // existing fields unchanged
  llmGateway: { ... },

  ollama: {
    localEnabled: true,
    localBaseUrl: 'http://localhost:11434',  // user-configurable
    cloudEnabled: false,
    cloudApiKey: '',
    modelsLastUpdated: null,  // ISO timestamp
  }
}
```

### Ollama entries in `modelsData`

Ollama models are merged into the existing `settings.llmGateway.modelsData` object:

```js
modelsData: {
  groq: { models: [...] },      // gateway (unchanged)
  anthropic: { models: [...] }, // gateway (unchanged)
  // ...
  'ollama-local': {
    models: [
      { id: 'llama3.2', name: 'llama3.2 (3.8B)' },
      { id: 'mistral', name: 'mistral (7B)' },
      // ...fetched from GET <localBaseUrl>/api/tags
    ]
  },
  'ollama-cloud': {
    models: [
      { id: 'llama3.2', name: 'llama3.2 (3.8B · Cloud)' },
      // ...fetched from https://ollama.com/api/tags
    ]
  }
}
```

Models from Ollama's `/api/tags` response (`models[].name` and `models[].details.parameter_size`) are mapped to `{ id, name }`. Cloud model names get a `· Cloud` suffix to distinguish them in the dropdown.

---

## Section 2: Settings UI (`list-modal.html`)

A new **🦙 Ollama Setup** section is added below the existing LLM Gateway Setup section, using the same CSS classes and HTML structure.

```
⚙️ Settings
├── 🔑 LLM Gateway Setup          (existing, unchanged)
│   ├── Gateway API Key input
│   └── [Test Connection] [How to Get API Key]
│
├── 🦙 Ollama Setup               (NEW)
│   ├── Local Ollama
│   │   └── Host URL input        id="ollama-local-url"
│   │                             placeholder="http://localhost:11434"
│   ├── Ollama Cloud
│   │   └── Cloud API Key input   id="ollama-cloud-api-key" (password)
│   └── [Test Connection]  [Refresh Ollama Models]
│         id="test-ollama-connection-btn"
│                            id="refresh-ollama-models-btn"
│
└── 🎯 AI Provider Settings       (existing, unchanged)
    ├── YouTube Summary:    [Provider ▼] [Model ▼]
    ├── Transcript Format:  [Provider ▼] [Model ▼]
    └── Page Summary:       [Provider ▼] [Model ▼]
```

`getProviderDisplayName()` in `list-modal.js` gets two new entries:

```js
'ollama-local': 'Ollama (Local)',
'ollama-cloud': 'Ollama Cloud',
```

---

## Section 3: `background.js` — Routing & API Calls

### `DEFAULT_DATA` update

The `ollama` key from the storage schema is added to the `settings` block in `DEFAULT_DATA`.

### Routing branch

In `formatTranscriptFast()` and `summarizeYouTubeVideo()`, after extracting `provider` from the transaction config, a routing branch is added before the `callLLMGateway()` call:

```js
if (provider === 'ollama-local' || provider === 'ollama-cloud') {
  return await callOllama(provider, model, messages, options, settings);
} else {
  return await callLLMGateway(provider, model, messages, options, apiKey);
}
```

The same `messages` array (built from the same prompt strings) is passed to both paths.

### New `callOllama(provider, model, messages, options, settings)`

- **Local:** POST to `<settings.ollama.localBaseUrl>/api/chat`, no auth header.
- **Cloud:** POST to `https://api.ollama.com/api/chat`, `Authorization: Bearer <cloudApiKey>`.
- Request body: `{ model, messages, stream: false, options: { temperature, num_predict } }`.
  - `num_predict` maps from `maxTokens` (Ollama's equivalent).
- Response normalized to `{ content, usage, provider, model }` matching `callLLMGateway()` return shape.
- Error handling mirrors `callLLMGateway()`: network errors, 401, 429, 500 all produce descriptive messages.

### New message handlers

**`testOllamaConnection`**
```
Input: { action, localBaseUrl, cloudApiKey, testLocal, testCloud }
- Local: GET <localBaseUrl>/api/version → checks response ok
- Cloud: GET https://api.ollama.com/api/tags with Bearer auth → checks response ok
Output: { success, message }
```

**`refreshOllamaModels`**
```
Input: { action, localBaseUrl, cloudApiKey, refreshLocal, refreshCloud }
- Local: GET <localBaseUrl>/api/tags → maps models[].name + details.parameter_size
- Cloud: GET https://ollama.com/api/tags → maps models[].name + details.parameter_size
- Merges results into modelsData under 'ollama-local' and/or 'ollama-cloud'
- Saves updated modelsData to chrome.storage.local
Output: { success, modelsData }
```

---

## Section 4: `list-modal.js` — Settings Functions

### `openSettings()` extension

Reads `settings.ollama` and populates:
- `document.getElementById('ollama-local-url').value = settings.ollama?.localBaseUrl || 'http://localhost:11434'`
- `document.getElementById('ollama-cloud-api-key').value = settings.ollama?.cloudApiKey || ''`

### `saveSettings()` extension

Reads Ollama inputs and saves back:
```js
settings.ollama = {
  localEnabled: true,
  localBaseUrl: document.getElementById('ollama-local-url').value.trim() || 'http://localhost:11434',
  cloudEnabled: !!document.getElementById('ollama-cloud-api-key').value.trim(),
  cloudApiKey: document.getElementById('ollama-cloud-api-key').value.trim(),
  modelsLastUpdated: settings.ollama?.modelsLastUpdated || null
};
```

### `setupSettingsEventListeners()` extension

Two new event handlers:
```js
document.getElementById('test-ollama-connection-btn').onclick = testOllamaConnection;
document.getElementById('refresh-ollama-models-btn').onclick = refreshOllamaModels;
```

### New `testOllamaConnection()`

Mirrors `testGatewayConnection()` exactly:
1. Reads `ollama-local-url` and `ollama-cloud-api-key` from inputs.
2. Shows "Testing connection..." toast.
3. Sends `chrome.runtime.sendMessage({ action: 'testOllamaConnection', localBaseUrl, cloudApiKey, testLocal: !!localUrl, testCloud: !!cloudApiKey })`.
4. Shows success/failure toast based on response.

### New `refreshOllamaModels()`

Mirrors the post-success flow of `testGatewayConnection()`:
1. Reads `ollama-local-url` and `ollama-cloud-api-key` from inputs.
2. Shows "Refreshing Ollama models..." toast.
3. Sends `chrome.runtime.sendMessage({ action: 'refreshOllamaModels', localBaseUrl, cloudApiKey, refreshLocal: !!localUrl, refreshCloud: !!cloudApiKey })`.
4. On success: merges `response.modelsData` into `settings.llmGateway.modelsData`, saves via `saveData()`, calls `populateProviderDropdowns(settings.llmGateway.modelsData)`.
5. Shows success/failure toast.

---

## Files Modified

| File | Change |
|------|--------|
| `list-modal.html` | Add Ollama Setup section with 2 inputs + 2 buttons |
| `list-modal.js` | Extend `openSettings`, `saveSettings`, `setupSettingsEventListeners`; add `testOllamaConnection`, `refreshOllamaModels`, display name entries |
| `background.js` | Add `ollama` to `DEFAULT_DATA`; add `callOllama()`; add routing branch in transaction helpers; add `testOllamaConnection` + `refreshOllamaModels` message handlers |

---

## Out of Scope

- Ollama model management (pull, delete) — users manage local models via the Ollama CLI/app directly.
- Periodic background model refresh — same as the LLM Gateway, refresh is manual.
- Onboarding flow changes — only the Settings modal is updated.
