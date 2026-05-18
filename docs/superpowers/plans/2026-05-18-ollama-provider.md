# Ollama Provider Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Ollama (local and cloud) as selectable AI providers in the ReVisit Chrome extension, appearing as `ollama-local` and `ollama-cloud` in the existing per-transaction provider/model dropdowns.

**Architecture:** Ollama models are merged into the existing `settings.llmGateway.modelsData` structure so all dropdown rendering logic works unchanged. A new `callOllama()` function in `background.js` handles direct API calls to local/cloud Ollama; a routing branch in each transaction helper detects Ollama providers and bypasses the LLM Gateway. The Settings UI gains a new Ollama Setup section mirroring the existing LLM Gateway section.

**Tech Stack:** Vanilla JS, Chrome Extension Manifest V3 (service worker), `chrome.storage.local`, Ollama REST API (`/api/chat`, `/api/tags`, `/api/version`).

---

## File Map

| File | What changes |
|------|-------------|
| `background.js` | Add `ollama` to `DEFAULT_DATA`; add `isOllamaProvider()`, `callOllama()`; add routing branch in `formatTranscriptFast`, `summarizeYouTubeVideo`, `processStandardPage`; update `processWithAI` gateway-key validation; add `testOllamaConnection` + `refreshOllamaModels` message handlers |
| `list-modal.html` | Add Ollama Setup `<div class="settings-section">` between the LLM Gateway section and the AI Provider Settings section |
| `list-modal.js` | Add `'ollama-local'`/`'ollama-cloud'` to `getProviderDisplayName`; extend `openSettings` + `saveSettings`; wire `setupSettingsEventListeners`; add `testOllamaConnection()` + `refreshOllamaModels()` |

---

## Task 1: Add `ollama` key to `DEFAULT_DATA` in `background.js`

**Files:**
- Modify: `background.js:12-39`

- [ ] **Step 1: Add the `ollama` settings key to `DEFAULT_DATA`**

In `background.js`, find the `DEFAULT_DATA` object (lines 4–39). Inside `settings`, after the closing `}` of `llmGateway`, add:

```js
    ollama: {
      localEnabled: true,
      localBaseUrl: 'http://localhost:11434',
      cloudEnabled: false,
      cloudApiKey: '',
      modelsLastUpdated: null
    }
```

The full `settings` block should now read:

```js
  settings: {
    userName: "",
    defaultIntervalDays: 7,
    onboardingComplete: false,
    priorityThresholdDays: 3,
    llmGateway: {
      enabled: true,
      apiKey: '',
      transactions: {
        youtubeSummary: {
          provider: 'groq',
          model: 'openai/gpt-oss-120b',
          options: { temperature: 0.7, maxTokens: 10000 }
        },
        transcriptFormatting: {
          provider: 'groq',
          model: 'openai/gpt-oss-120b',
          options: { temperature: 0.3, maxTokens: 64000 }
        },
        pageSummary: {
          provider: 'groq',
          model: 'openai/gpt-oss-120b',
          options: { temperature: 0.7, maxTokens: 2500 }
        }
      }
    },
    ollama: {
      localEnabled: true,
      localBaseUrl: 'http://localhost:11434',
      cloudEnabled: false,
      cloudApiKey: '',
      modelsLastUpdated: null
    }
  }
```

- [ ] **Step 2: Verify the extension still loads**

Load the unpacked extension in Chrome (`chrome://extensions` → Load unpacked). Open the service worker console (click "service worker" link on the extension card). Confirm no errors.

- [ ] **Step 3: Commit**

```bash
git add background.js
git commit -m "feat: add ollama key to DEFAULT_DATA settings schema"
```

---

## Task 2: Add `isOllamaProvider()` and `callOllama()` to `background.js`

**Files:**
- Modify: `background.js` — insert after line 278 (end of `callLLMGateway`)

- [ ] **Step 1: Add the helper and the Ollama call function**

Insert the following block immediately after the closing `}` of `callLLMGateway` (after line 278):

```js
/**
 * Returns true if the provider key refers to Ollama (local or cloud).
 */
function isOllamaProvider(provider) {
  return provider === 'ollama-local' || provider === 'ollama-cloud';
}

/**
 * Call Ollama API directly (local or cloud).
 * Uses the same message array format as callLLMGateway so prompts are unchanged.
 *
 * @param {string} provider - 'ollama-local' or 'ollama-cloud'
 * @param {string} model - Ollama model name (e.g. 'llama3.2')
 * @param {Array} messages - [{role, content}] array
 * @param {Object} options - { temperature, maxTokens }
 * @param {Object} settings - full settings object (reads settings.ollama)
 * @returns {Promise<{content, provider, model}>}
 */
async function callOllama(provider, model, messages, options = {}, settings) {
  const ollamaSettings = settings.ollama || {};
  const isCloud = provider === 'ollama-cloud';

  const baseUrl = isCloud
    ? 'https://api.ollama.com'
    : (ollamaSettings.localBaseUrl || 'http://localhost:11434');

  const headers = { 'Content-Type': 'application/json' };
  if (isCloud && ollamaSettings.cloudApiKey) {
    headers['Authorization'] = `Bearer ${ollamaSettings.cloudApiKey}`;
  }

  const body = {
    model,
    messages,
    stream: false,
    options: {}
  };

  if (options.temperature !== undefined) {
    body.options.temperature = options.temperature;
  }
  if (options.maxTokens !== undefined) {
    body.options.num_predict = options.maxTokens;
  }

  console.log(`DEBUG: Calling Ollama (${provider}) model: ${model} at ${baseUrl}`);

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errMsg = errorData.error || `HTTP ${response.status}`;
      switch (response.status) {
        case 401:
          throw new Error(`Ollama authentication failed: ${errMsg}. Check your Cloud API key in Settings.`);
        case 404:
          throw new Error(`Ollama model not found: "${model}". Run "ollama pull ${model}" or select a different model.`);
        case 500:
          throw new Error(`Ollama server error: ${errMsg}`);
        default:
          throw new Error(`Ollama error (${response.status}): ${errMsg}`);
      }
    }

    const data = await response.json();
    const content = data.message?.content;

    if (!content) {
      throw new Error('Invalid Ollama response: missing message.content');
    }

    return { content, provider, model };
  } catch (error) {
    if (error.message.includes('fetch') || error.message.includes('Failed to fetch') || error.message.includes('ERR_CONNECTION_REFUSED')) {
      const target = isCloud ? 'Ollama Cloud' : `local Ollama at ${baseUrl}`;
      throw new Error(`Cannot reach ${target}. ${isCloud ? 'Check your internet connection.' : 'Is Ollama running? Try: ollama serve'}`);
    }
    throw error;
  }
}
```

- [ ] **Step 2: Verify the extension still loads**

Reload the extension. Check the service worker console — no errors.

- [ ] **Step 3: Commit**

```bash
git add background.js
git commit -m "feat: add isOllamaProvider() and callOllama() to background.js"
```

---

## Task 3: Add Ollama routing in transaction helper functions and fix `processWithAI` validation

**Files:**
- Modify: `background.js` — `formatTranscriptFast` (~line 378), `summarizeYouTubeVideo` (~line 414), `processStandardPage` (~line 1254), `processWithAI` (~line 1166)

- [ ] **Step 1: Update `processWithAI` gateway-key validation**

Find in `processWithAI` (around line 1166):

```js
  // Validate API key
  if (!settings.llmGateway?.apiKey) {
    throw new Error('LLM Gateway API key not found in settings. Please configure your API key in the extension settings.');
  }
```

Replace with:

```js
  // Validate API key — only required when at least one transaction uses the LLM Gateway
  const transactions = settings.llmGateway?.transactions || {};
  const needsGatewayKey = Object.values(transactions).some(t => t.provider && !isOllamaProvider(t.provider));
  if (needsGatewayKey && !settings.llmGateway?.apiKey) {
    throw new Error('LLM Gateway API key not found in settings. Please configure your API key in the extension settings.');
  }
```

- [ ] **Step 2: Add routing in `formatTranscriptFast`**

Find in `formatTranscriptFast` (~line 397):

```js
  try {
    const result = await callLLMGateway(
      provider,
      model,
      [{ role: 'user', content: prompt }],
      options,
      apiKey
    );

    console.log('DEBUG: Transcript formatted successfully with LLM Gateway');
    return result.content;
```

Replace with:

```js
  try {
    const result = isOllamaProvider(provider)
      ? await callOllama(provider, model, [{ role: 'user', content: prompt }], options, settings)
      : await callLLMGateway(provider, model, [{ role: 'user', content: prompt }], options, apiKey);

    console.log(`DEBUG: Transcript formatted successfully with ${provider}`);
    return result.content;
```

- [ ] **Step 3: Add routing in `summarizeYouTubeVideo`**

Find in `summarizeYouTubeVideo` (~line 482):

```js
  try {
    const result = await callLLMGateway(
      provider,
      model,
      [{ role: 'user', content: prompt }],
      options,
      apiKey
    );

    console.log('DEBUG: YouTube video summarized successfully with LLM Gateway');
    return extractJSON(result.content);
```

Replace with:

```js
  try {
    const result = isOllamaProvider(provider)
      ? await callOllama(provider, model, [{ role: 'user', content: prompt }], options, settings)
      : await callLLMGateway(provider, model, [{ role: 'user', content: prompt }], options, apiKey);

    console.log(`DEBUG: YouTube video summarized successfully with ${provider}`);
    return extractJSON(result.content);
```

- [ ] **Step 4: Add routing in `processStandardPage`**

Find in `processStandardPage` (~line 1278):

```js
  try {
    const result = await callLLMGateway(
      provider,
      model,
      [{ role: 'user', content: prompt }],
      options,
      apiKey
    );

    console.log('DEBUG: Standard page processed successfully with LLM Gateway');
    return extractJSON(result.content);
```

Replace with:

```js
  try {
    const result = isOllamaProvider(provider)
      ? await callOllama(provider, model, [{ role: 'user', content: prompt }], options, settings)
      : await callLLMGateway(provider, model, [{ role: 'user', content: prompt }], options, apiKey);

    console.log(`DEBUG: Standard page processed successfully with ${provider}`);
    return extractJSON(result.content);
```

Note: `processStandardPage` does not receive `settings` as a parameter today. Find its signature:

```js
async function processStandardPage(scrapedData, settings, categories) {
```

Confirm `settings` is already the second parameter — it is, so `callOllama` can access `settings.ollama` without any signature change.

- [ ] **Step 5: Reload the extension and verify no console errors**

Reload the extension. Check the service worker console. No errors expected since no new code paths are triggered yet.

- [ ] **Step 6: Commit**

```bash
git add background.js
git commit -m "feat: add ollama routing in formatTranscriptFast, summarizeYouTubeVideo, processStandardPage"
```

---

## Task 4: Add `testOllamaConnection` and `refreshOllamaModels` message handlers in `background.js`

**Files:**
- Modify: `background.js` — inside the `chrome.runtime.onMessage` listener, after the `testGatewayConnection` handler (~line 1112)

- [ ] **Step 1: Add the two new message handlers**

Find the closing of the `testGatewayConnection` block:

```js
      } else if (request.action === 'testGatewayConnection') {
        // ... existing block ...
        }
      }
```

After the closing `}` of `testGatewayConnection` (but still inside the outer `try`), add:

```js
      } else if (request.action === 'testOllamaConnection') {
        console.log('DEBUG: Testing Ollama connection');
        try {
          const results = { local: null, cloud: null };

          // Test local Ollama if URL provided
          if (request.localBaseUrl) {
            const localResponse = await fetch(`${request.localBaseUrl}/api/version`);
            if (!localResponse.ok) {
              throw new Error(`Local Ollama returned status ${localResponse.status}`);
            }
            const localData = await localResponse.json();
            results.local = { success: true, version: localData.version };
            console.log('DEBUG: Local Ollama version:', localData.version);
          }

          // Test cloud Ollama if API key provided
          if (request.cloudApiKey) {
            const cloudResponse = await fetch('https://api.ollama.com/api/tags', {
              headers: { 'Authorization': `Bearer ${request.cloudApiKey}` }
            });
            if (!cloudResponse.ok) {
              const errData = await cloudResponse.json().catch(() => ({}));
              throw new Error(`Ollama Cloud returned status ${cloudResponse.status}: ${errData.error || 'Auth failed'}`);
            }
            results.cloud = { success: true };
            console.log('DEBUG: Ollama Cloud connection successful');
          }

          if (!request.localBaseUrl && !request.cloudApiKey) {
            throw new Error('Enter a local URL or Cloud API key to test');
          }

          const parts = [];
          if (results.local) parts.push(`Local Ollama ${results.local.version}`);
          if (results.cloud) parts.push('Ollama Cloud');
          sendResponse({ success: true, message: `Connected: ${parts.join(', ')}` });
        } catch (error) {
          console.error('ERROR: Ollama connection test failed:', error);
          sendResponse({ success: false, message: error.message });
        }

      } else if (request.action === 'refreshOllamaModels') {
        console.log('DEBUG: Refreshing Ollama models');
        try {
          const mergedModels = {};

          // Fetch local models
          if (request.localBaseUrl) {
            const localResponse = await fetch(`${request.localBaseUrl}/api/tags`);
            if (!localResponse.ok) {
              throw new Error(`Local Ollama returned status ${localResponse.status}`);
            }
            const localData = await localResponse.json();
            mergedModels['ollama-local'] = {
              models: (localData.models || []).map(m => ({
                id: m.model || m.name,
                name: `${m.name}${m.details?.parameter_size ? ' (' + m.details.parameter_size + ')' : ''}`
              }))
            };
            console.log('DEBUG: Local Ollama models fetched:', mergedModels['ollama-local'].models.length);
          }

          // Fetch cloud models
          if (request.cloudApiKey) {
            const cloudResponse = await fetch('https://ollama.com/api/tags', {
              headers: { 'Authorization': `Bearer ${request.cloudApiKey}` }
            });
            if (!cloudResponse.ok) {
              throw new Error(`Ollama Cloud returned status ${cloudResponse.status}`);
            }
            const cloudData = await cloudResponse.json();
            mergedModels['ollama-cloud'] = {
              models: (cloudData.models || []).map(m => ({
                id: m.model || m.name,
                name: `${m.name}${m.details?.parameter_size ? ' (' + m.details.parameter_size + ' · Cloud)' : ' (Cloud)'}`
              }))
            };
            console.log('DEBUG: Ollama Cloud models fetched:', mergedModels['ollama-cloud'].models.length);
          }

          if (Object.keys(mergedModels).length === 0) {
            throw new Error('Enter a local URL or Cloud API key to fetch models');
          }

          // Merge into existing modelsData in storage
          const data = await getStorageData();
          const existingModelsData = data.settings?.llmGateway?.modelsData || {};
          const updatedModelsData = { ...existingModelsData, ...mergedModels };

          if (!data.settings) data.settings = {};
          if (!data.settings.llmGateway) data.settings.llmGateway = {};
          data.settings.llmGateway.modelsData = updatedModelsData;

          // Also update modelsLastUpdated in ollama settings
          if (!data.settings.ollama) data.settings.ollama = {};
          data.settings.ollama.modelsLastUpdated = new Date().toISOString();

          await saveStorageData(data);
          console.log('DEBUG: Ollama models saved to storage');

          sendResponse({ success: true, modelsData: updatedModelsData });
        } catch (error) {
          console.error('ERROR: Ollama model refresh failed:', error);
          sendResponse({ success: false, message: error.message });
        }
```

- [ ] **Step 2: Reload the extension and verify no console errors**

Reload the extension. Service worker console should be clean.

- [ ] **Step 3: Commit**

```bash
git add background.js
git commit -m "feat: add testOllamaConnection and refreshOllamaModels message handlers"
```

---

## Task 5: Add Ollama Setup section to `list-modal.html`

**Files:**
- Modify: `list-modal.html` — insert after line 148 (closing `</div>` of the LLM Gateway Setup section)

- [ ] **Step 1: Insert the Ollama Setup section**

Find in `list-modal.html` (line 148):

```html
                </div>

                <!-- Transaction Settings Section -->
```

Replace with:

```html
                </div>

                <!-- Ollama Setup Section -->
                <div class="settings-section">
                    <h3>🦙 Ollama Setup</h3>
                    <div class="settings-field">
                        <label for="ollama-local-url">Local Ollama URL</label>
                        <input type="text" id="ollama-local-url" placeholder="http://localhost:11434">
                        <div class="settings-help-text">
                            URL for your local Ollama instance. Leave blank to disable local Ollama.
                        </div>
                    </div>
                    <div class="settings-field">
                        <label for="ollama-cloud-api-key">Ollama Cloud API Key</label>
                        <input type="password" id="ollama-cloud-api-key" placeholder="Ollama Cloud API key">
                        <div class="settings-help-text">
                            API key for Ollama Cloud (ollama.com). Leave blank to disable Ollama Cloud.
                        </div>
                    </div>
                    <div class="settings-button-group">
                        <button class="settings-btn settings-btn-info" id="test-ollama-connection-btn">🔍 Test Connection</button>
                        <button class="settings-btn settings-btn-secondary" id="refresh-ollama-models-btn">🔄 Refresh Ollama Models</button>
                    </div>
                </div>

                <!-- Transaction Settings Section -->
```

- [ ] **Step 2: Verify UI renders**

Reload the extension, open the list modal, click Settings. Confirm the new "🦙 Ollama Setup" section appears between the LLM Gateway section and the AI Provider Settings section with the two inputs and two buttons.

- [ ] **Step 3: Commit**

```bash
git add list-modal.html
git commit -m "feat: add Ollama Setup section to settings UI"
```

---

## Task 6: Extend `getProviderDisplayName`, `openSettings`, and `saveSettings` in `list-modal.js`

**Files:**
- Modify: `list-modal.js` — `getProviderDisplayName` (~line 840), `openSettings` (~line 628), `saveSettings` (~line 906)

- [ ] **Step 1: Add Ollama entries to `getProviderDisplayName`**

Find in `list-modal.js` (~line 840):

```js
function getProviderDisplayName(provider) {
  const names = {
    groq: 'Groq (Fast Inference)',
    anthropic: 'Anthropic (Claude)',
```

Add two entries to the `names` object:

```js
function getProviderDisplayName(provider) {
  const names = {
    'ollama-local': 'Ollama (Local)',
    'ollama-cloud': 'Ollama Cloud',
    groq: 'Groq (Fast Inference)',
    anthropic: 'Anthropic (Claude)',
```

- [ ] **Step 2: Extend `openSettings` to populate Ollama fields**

Find in `openSettings` (~line 638):

```js
  // Populate fields
  document.getElementById('gateway-api-key').value = settings.llmGateway?.apiKey || '';
```

Add after that line:

```js
  // Populate Ollama fields
  document.getElementById('ollama-local-url').value = settings.ollama?.localBaseUrl || 'http://localhost:11434';
  document.getElementById('ollama-cloud-api-key').value = settings.ollama?.cloudApiKey || '';
```

- [ ] **Step 3: Extend `saveSettings` to persist Ollama fields**

Find in `saveSettings` (~line 948):

```js
  await saveData();
  showToast('✅ Settings saved successfully!', 'success');
```

Add before `await saveData()`:

```js
  // Save Ollama settings
  const ollamaLocalUrl = document.getElementById('ollama-local-url').value.trim();
  const ollamaCloudKey = document.getElementById('ollama-cloud-api-key').value.trim();
  settings.ollama = {
    localEnabled: !!ollamaLocalUrl,
    localBaseUrl: ollamaLocalUrl || 'http://localhost:11434',
    cloudEnabled: !!ollamaCloudKey,
    cloudApiKey: ollamaCloudKey,
    modelsLastUpdated: settings.ollama?.modelsLastUpdated || null
  };

```

- [ ] **Step 4: Verify fields populate and save**

Reload extension. Open Settings. Confirm the Ollama URL field shows `http://localhost:11434` by default. Type a value, click Save. Reopen Settings — confirm the value persisted. Check `chrome.storage.local` in DevTools Application tab → confirm `rvData.settings.ollama` has the saved values.

- [ ] **Step 5: Commit**

```bash
git add list-modal.js
git commit -m "feat: extend openSettings and saveSettings for Ollama fields"
```

---

## Task 7: Add `testOllamaConnection()`, `refreshOllamaModels()`, and wire event listeners in `list-modal.js`

**Files:**
- Modify: `list-modal.js` — `setupSettingsEventListeners` (~line 693), add two new functions after `testGatewayConnection` (~line 899)

- [ ] **Step 1: Wire button handlers in `setupSettingsEventListeners`**

Find in `setupSettingsEventListeners` (~line 703):

```js
  // Test connection
  document.getElementById('test-connection-btn').onclick = testGatewayConnection;
```

Add immediately after:

```js
  // Ollama buttons
  document.getElementById('test-ollama-connection-btn').onclick = testOllamaConnection;
  document.getElementById('refresh-ollama-models-btn').onclick = refreshOllamaModels;
```

- [ ] **Step 2: Add `testOllamaConnection()` function**

Find in `list-modal.js` the closing `}` of `testGatewayConnection` (~line 899). Insert the new function immediately after:

```js
/**
 * Test Ollama connection (local and/or cloud) via background service worker
 */
async function testOllamaConnection() {
  const localBaseUrl = document.getElementById('ollama-local-url').value.trim();
  const cloudApiKey = document.getElementById('ollama-cloud-api-key').value.trim();

  if (!localBaseUrl && !cloudApiKey) {
    showToast('Enter a local URL or Cloud API key to test', 'error');
    return;
  }

  showToast('Testing Ollama connection...', 'info');

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'testOllamaConnection',
      localBaseUrl: localBaseUrl || null,
      cloudApiKey: cloudApiKey || null
    });

    if (response.success) {
      showToast(`✅ ${response.message}`, 'success');
    } else {
      showToast(`❌ ${response.message}`, 'error');
    }
  } catch (error) {
    showToast(`❌ Test failed: ${error.message}`, 'error');
  }
}
```

- [ ] **Step 3: Add `refreshOllamaModels()` function**

Insert immediately after `testOllamaConnection`:

```js
/**
 * Fetch latest Ollama model lists and merge into modelsData dropdowns
 */
async function refreshOllamaModels() {
  const localBaseUrl = document.getElementById('ollama-local-url').value.trim();
  const cloudApiKey = document.getElementById('ollama-cloud-api-key').value.trim();

  if (!localBaseUrl && !cloudApiKey) {
    showToast('Enter a local URL or Cloud API key to refresh models', 'error');
    return;
  }

  showToast('🔄 Refreshing Ollama models...', 'info');

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'refreshOllamaModels',
      localBaseUrl: localBaseUrl || null,
      cloudApiKey: cloudApiKey || null
    });

    if (response.success) {
      // Merge returned modelsData into local settings and refresh dropdowns
      settings.llmGateway = settings.llmGateway || {};
      settings.llmGateway.modelsData = response.modelsData;
      await saveData();

      populateProviderDropdowns(response.modelsData);
      showToast('✅ Ollama models loaded!', 'success');
    } else {
      showToast(`❌ Refresh failed: ${response.message}`, 'error');
    }
  } catch (error) {
    showToast(`❌ Refresh failed: ${error.message}`, 'error');
  }
}
```

- [ ] **Step 4: Verify buttons work end-to-end**

Reload the extension. Open Settings. Click **Test Connection** (Ollama section):
- With no values: should show "Enter a local URL or Cloud API key to test" error toast.
- With `http://localhost:11434` in the URL field (and local Ollama running): should show "Connected: Local Ollama X.X.X".
- With local Ollama not running: should show a descriptive error about connection refused.

Click **Refresh Ollama Models** with `http://localhost:11434` and local Ollama running with at least one model pulled:
- Should show "Ollama models loaded!" toast.
- Open the YouTube provider dropdown — `Ollama (Local)` should appear.
- Select `Ollama (Local)` — the model dropdown should populate with your local models.

- [ ] **Step 5: Commit**

```bash
git add list-modal.js
git commit -m "feat: add testOllamaConnection and refreshOllamaModels to settings UI"
```

---

## Task 8: End-to-End Smoke Test

- [ ] **Step 1: Test Ollama model selection persists through save/reload**

Open Settings. Run Refresh Ollama Models. Select `Ollama (Local)` + a local model for one of the transactions (e.g. YouTube Summary). Click Save. Close and reopen Settings — confirm the Ollama provider/model selection was retained.

- [ ] **Step 2: Test full AI processing flow with a local Ollama model**

With a local model selected (e.g. `llama3.2`) for at least one transaction:
- Navigate to a regular webpage and use the extension to save/process it.
- Check the service worker console: look for `DEBUG: Calling Ollama (ollama-local) model: llama3.2`.
- Confirm the bookmark is saved with a summary (even if quality differs from cloud models).

- [ ] **Step 3: Verify gateway API key validation allows Ollama-only config**

In Settings, set all three provider dropdowns to `Ollama (Local)`. Clear the LLM Gateway API key field. Click Save. Try to process a page — confirm it proceeds without a "Gateway API key not found" error.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete Ollama provider integration (local + cloud)"
```

---

## Self-Review Notes

- **Spec coverage:** All sections covered — storage schema (Task 1), `callOllama` (Task 2), routing branches (Task 3), message handlers (Task 4), UI section (Task 5), settings functions (Task 6), event listeners + new functions (Task 7).
- **processWithAI validation:** Updated in Task 3 Step 1 to allow Ollama-only configs.
- **`processStandardPage` settings param:** Confirmed it already receives `settings` as second argument — no signature change needed.
- **Cloud model fetch URL:** `https://ollama.com/api/tags` (public list, no auth needed for listing) vs `https://api.ollama.com/api/chat` (inference, requires Bearer auth). The refresh handler uses the correct URL for each.
- **No duplicate prompts:** All three transaction functions pass the same existing prompt string to `callOllama` — no new prompt text introduced.
