# Login-First Onboarding with Sync + Ollama Config — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let returning users sign in at the start of onboarding and sync their cloud data (skipping the rest of setup), add Ollama config to onboarding via a shared helper, and ensure synced categories/bookmarks render in the list.

**Architecture:** Chrome extension (MV3). The onboarding page (`onboarding.html`/`onboarding.js`) gains an **account gate** shown before the existing 5-step wizard — no step renumbering. Auth/sync run through existing `background.js` message handlers backed by `RvSync` (`sync.js`). Ollama settings are built by a new pure `buildOllamaSettings()` in `utils.js`, shared by both the onboarding page and the Settings panel (`list-modal.js`).

**Tech Stack:** Vanilla JS, Chrome extension APIs (`chrome.storage.local`, `chrome.runtime.sendMessage`), Node's built-in test runner (`node --test`) with `node:test`/`node:assert` on CommonJS `*.test.js` files. Supabase (GoTrue + PostgREST) via the existing thin client.

**Spec:** `docs/superpowers/specs/2026-06-03-onboarding-login-sync-design.md`

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `utils.js` | Shared pure helpers loaded by every page | Add `buildOllamaSettings()`; export it. |
| `utils.test.js` | Unit tests for shared helpers | **Create** — tests for `buildOllamaSettings()`. |
| `list-modal.js` | Main list + Settings panel logic | `saveSettings()` uses `buildOllamaSettings()` instead of the inline object. |
| `onboarding.html` | Onboarding markup | Add account gate; add Ollama fields to `#step-4`; load `utils.js`. |
| `onboarding.js` | Onboarding behavior | Supabase bootstrap; account-gate wiring (choice, sign-in, staged sync, redirect); read Ollama in `completeOnboarding()`. |

**Verification reference (do not modify these):** `background.js:702-722` (auth/sync message handlers), `background.js:1392` (listener catch → `{success:false,error}`), `sync.js:60-73` (`signIn` + key derivation), `sync.js:370-383` (`syncCycle`), `list-modal.js:741-757` (`handleAuth` precedent), `list-modal.js:66-115` (`init` renders from `rvData`), `popup.js:4-5` (onboarding trigger).

---

## Task 1: Shared `buildOllamaSettings()` helper (TDD)

**Files:**
- Modify: `utils.js` (add function + export)
- Test: `utils.test.js` (create)

- [ ] **Step 1: Write the failing tests**

Create `utils.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `buildOllamaSettings` is `undefined` (TypeError: not a function), the new tests error.

- [ ] **Step 3: Implement the helper in `utils.js`**

Insert this function in `utils.js` after `extractVideoId` (before the export block at the bottom):

```js
/**
 * Build the canonical `settings.ollama` object from raw field values.
 * Local Ollama is enabled only when a URL is provided; cloud only when a key
 * is provided. `prevModelsLastUpdated` preserves any existing timestamp.
 * Pure function — no DOM or storage access.
 * @param {string} localUrl - Local Ollama base URL (may be empty/null)
 * @param {string} cloudKey - Ollama Cloud API key (may be empty/null)
 * @param {string|null} prevModelsLastUpdated - Existing modelsLastUpdated to preserve
 * @returns {{localEnabled:boolean, localBaseUrl:string, cloudEnabled:boolean, cloudApiKey:string, modelsLastUpdated:(string|null)}}
 */
function buildOllamaSettings(localUrl, cloudKey, prevModelsLastUpdated = null) {
  const url = (localUrl || '').trim();
  const key = (cloudKey || '').trim();
  return {
    localEnabled: !!url,
    localBaseUrl: url,
    cloudEnabled: !!key,
    cloudApiKey: key,
    modelsLastUpdated: prevModelsLastUpdated || null
  };
}
```

Then update the export block at the bottom of `utils.js` from:

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { sendMessageWithRetry, isYouTubeUrl, extractVideoId };
}
```

to:

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { sendMessageWithRetry, isYouTubeUrl, extractVideoId, buildOllamaSettings };
}
```

(Browser pages that load `utils.js` via `<script>` get `buildOllamaSettings` as a global — the `module` block is skipped in that context.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all `buildOllamaSettings` tests green, existing `rv-sync-core` tests still green.

- [ ] **Step 5: Commit**

```bash
git add utils.js utils.test.js
git commit -m "feat: add shared buildOllamaSettings() helper with tests"
```

---

## Task 2: Refactor `saveSettings()` to use the shared helper

**Files:**
- Modify: `list-modal.js:1132-1142` (inside `saveSettings`)

This keeps Settings behavior identical while proving the helper works in the browser context (manual verification at the end). No unit test — `saveSettings` is DOM/storage-bound; the helper itself is already covered by Task 1.

- [ ] **Step 1: Replace the inline Ollama object**

In `list-modal.js`, find this block inside `saveSettings()` (around lines 1132-1142):

```js
  // Save Ollama settings. Local is enabled only when the user actually provides a URL;
  // otherwise it defaults off with an empty URL (no implicit localhost).
  const ollamaLocalUrl = document.getElementById('ollama-local-url').value.trim();
  const ollamaCloudKey = document.getElementById('ollama-cloud-api-key').value.trim();
  settings.ollama = {
    localEnabled: !!ollamaLocalUrl,
    localBaseUrl: ollamaLocalUrl,
    cloudEnabled: !!ollamaCloudKey,
    cloudApiKey: ollamaCloudKey,
    modelsLastUpdated: settings.ollama?.modelsLastUpdated || null
  };
```

Replace it with:

```js
  // Save Ollama settings via the shared helper (same logic as onboarding).
  // Local is enabled only when a URL is provided; cloud only when a key is.
  settings.ollama = buildOllamaSettings(
    document.getElementById('ollama-local-url').value,
    document.getElementById('ollama-cloud-api-key').value,
    settings.ollama?.modelsLastUpdated
  );
```

(`utils.js` is already loaded by `list-modal.html` at line 327, so `buildOllamaSettings` is in scope.)

- [ ] **Step 2: Verify the existing test suite still passes**

Run: `npm test`
Expected: PASS — no test touches `saveSettings`, but confirm nothing broke.

- [ ] **Step 3: Sanity-check the reference is resolvable**

Run: `grep -n "buildOllamaSettings" list-modal.js utils.js`
Expected: a call in `list-modal.js` and the definition + export in `utils.js`.

- [ ] **Step 4: Commit**

```bash
git add list-modal.js
git commit -m "refactor: use shared buildOllamaSettings() in saveSettings"
```

---

## Task 3: Onboarding HTML — load utils.js + Ollama fields in AI-config step

**Files:**
- Modify: `onboarding.html` (script tag; `#step-4` Ollama block)

- [ ] **Step 1: Load `utils.js` before `onboarding.js`**

In `onboarding.html`, find the last lines (around 261):

```html
  <script src="onboarding.js"></script>
</body>
```

Replace with:

```html
  <script src="utils.js"></script>
  <script src="onboarding.js"></script>
</body>
```

- [ ] **Step 2: Add the Ollama block to the AI-config step (`#step-4`)**

In `onboarding.html`, find the closing of the API-key section inside `#step-4`, immediately before the `<div class="loading-message" id="loading-message">` line (around line 182-183):

```html
        </div>
      </div>

      <div class="loading-message" id="loading-message">
```

Insert a new Ollama block between the `</div>` that closes `.api-key-section` and the loading-message div, so it reads:

```html
        </div>
      </div>

      <div class="api-key-section" style="margin-bottom: 25px;">
        <h3 style="margin-bottom: 10px;">🦙 Ollama (Optional)</h3>
        <p style="margin-bottom: 10px;">Use a local Ollama instance and/or Ollama Cloud. Leave blank to skip — you can add these later in Settings.</p>
        <div class="settings-field">
          <label for="ollama-local-url">Local Ollama URL</label>
          <input type="text" id="ollama-local-url" placeholder="http://localhost:11434">
          <div class="alert" style="background:#f8f9fa;border-color:#ddd;font-size:12px;">Leave blank to disable local Ollama.</div>
        </div>
        <div class="settings-field">
          <label for="ollama-cloud-api-key">Ollama Cloud API Key</label>
          <input type="password" id="ollama-cloud-api-key" placeholder="Ollama Cloud API key">
          <div class="alert" style="background:#f8f9fa;border-color:#ddd;font-size:12px;">API key for Ollama Cloud (ollama.com). Leave blank to disable.</div>
        </div>
      </div>

      <div class="loading-message" id="loading-message">
```

(The two new input IDs `ollama-local-url` and `ollama-cloud-api-key` match what `completeOnboarding()` will read in Task 5 and mirror the Settings panel IDs.)

- [ ] **Step 3: Verify the IDs exist and are unique**

Run: `grep -n "ollama-local-url\|ollama-cloud-api-key" onboarding.html`
Expected: exactly one match for each ID.

- [ ] **Step 4: Commit**

```bash
git add onboarding.html
git commit -m "feat: load utils.js and add Ollama fields to onboarding AI-config step"
```

---

## Task 4: Onboarding HTML — account gate (choice + login + status)

**Files:**
- Modify: `onboarding.html` (new `#account-gate`; hide the wizard initially)

The gate is shown on load; the existing wizard (`#step-1`…`#step-5` + dot indicator) is hidden until the user chooses "No, I'm new".

- [ ] **Step 1: Add the gate markup and open the `#wizard` wrapper**

To avoid a fragile match on a trailing-whitespace blank line (line 116 has 4
trailing spaces), anchor on the unique `<h1>` + `step-indicator` opening. Find
exactly these three lines (`onboarding.html` lines 107-109):

```html
  <div class="onboarding-container">
    <h1>Welcome to ReVisit</h1>
    <div class="step-indicator">
```

Replace with (inserts the gate, then opens `<div id="wizard" style="display:none;">`
right before the indicator; the indicator line is reproduced at the end):

```html
  <div class="onboarding-container">
    <h1>Welcome to ReVisit</h1>

    <div id="account-gate">
      <div id="account-choice">
        <h2>Do you already have a ReVisit account?</h2>
        <p>Sign in to restore your bookmarks, categories, and settings from the cloud.</p>
        <div class="button-group" style="justify-content:flex-start;">
          <button class="btn-primary" id="gate-have-account-btn">Yes, sign in</button>
          <button class="btn-secondary" id="gate-new-user-btn">No, I'm new</button>
        </div>
      </div>

      <div id="account-login" style="display:none;">
        <h2>Sign in</h2>
        <div class="settings-field">
          <label for="account-email">Email</label>
          <input type="email" id="account-email" placeholder="you@example.com">
        </div>
        <div class="settings-field">
          <label for="account-password">Password</label>
          <input type="password" id="account-password" placeholder="Password">
        </div>
        <div class="loading-message" id="account-sync-status"></div>
        <div class="button-group">
          <button class="btn-secondary" id="account-back-btn">Back</button>
          <button class="btn-primary" id="account-signin-btn">Sign In</button>
        </div>
      </div>
    </div>

    <div id="wizard" style="display:none;">
    <div class="step-indicator">
```

This leaves the 5 step dots, all `#step-N` blocks, and their handlers completely
untouched — only the indicator line is now preceded by the gate and the `#wizard`
opening tag.

- [ ] **Step 2: Close the `#wizard` wrapper**

The new `<div id="wizard">` must be closed. In `onboarding.html`, find the end of the last step block — the `</div>` that closes `#step-5` followed by the `</div>` that closes `.onboarding-container` (around lines 258-259):

```html
    </div>
  </div>

  <script src="utils.js"></script>
```

Replace with (one extra closing `</div>` for `#wizard`):

```html
    </div>
    </div>
  </div>

  <script src="utils.js"></script>
```

- [ ] **Step 3: Add a status-area style override (make `#account-sync-status` always render when it has text)**

The reused `.loading-message` class is `display:none` until `.active`. The sign-in flow will toggle `.active`, so no CSS change is strictly required. Confirm the class exists.

Run: `grep -n "loading-message" onboarding.html`
Expected: the existing `.loading-message` / `.loading-message.active` CSS rules (around lines 37-45) plus the two usages (`#loading-message`, `#account-sync-status`).

- [ ] **Step 4: Verify structure balance**

Run: `node -e "const h=require('fs').readFileSync('onboarding.html','utf8'); const o=(h.match(/<div\b/g)||[]).length, c=(h.match(/<\/div>/g)||[]).length; console.log('open',o,'close',c); process.exit(o===c?0:1)"`
Expected: `open N close N` with equal counts (exit 0). If unequal, fix the nesting before continuing.

- [ ] **Step 5: Commit**

```bash
git add onboarding.html
git commit -m "feat: add account gate (sign-in choice) before onboarding wizard"
```

---

## Task 5: Onboarding JS — gate wiring, sign-in + staged sync, Ollama read

**Files:**
- Modify: `onboarding.js` (Supabase bootstrap; gate handlers; Ollama in `completeOnboarding`)

- [ ] **Step 1: Add Supabase constants + a config bootstrap at the top of `onboarding.js`**

At the very top of `onboarding.js` (after `let modelsData = null;` on line 2), add:

```js
// Supabase endpoint — MUST stay in sync with list-modal.js.
const SUPABASE_URL = 'https://supabase.generationai.cloud';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzgwNDM0NDM2LCJleHAiOjE5MzgxMTQ0MzZ9.nTULGxKu8CDVjpmS9-6Efc3zoUlKOhfrwOTHurKmDxo';

async function ensureSyncConfig() {
  try {
    await chrome.runtime.sendMessage({ action: 'setSyncConfig', url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY });
  } catch (e) { /* background may be cold; sign-in will surface a real error */ }
}

function setAccountStatus(text, kind) {
  const el = document.getElementById('account-sync-status');
  if (!el) return;
  el.textContent = text || '';
  el.classList.toggle('active', !!text);
  el.style.color = kind === 'error' ? '#c0392b' : '#4a90e2';
}
```

> The anon key above must be **byte-identical** to `list-modal.js`'s
> `SUPABASE_ANON_KEY` (verified in Step 8). If `list-modal.js` differs, copy its
> value verbatim.

- [ ] **Step 2: Add the gate handler functions**

Add these functions to `onboarding.js` (e.g. just before `completeOnboarding`):

```js
function showWizardFromGate() {
  document.getElementById('account-gate').style.display = 'none';
  document.getElementById('wizard').style.display = '';
}

function showLoginPanel() {
  document.getElementById('account-choice').style.display = 'none';
  document.getElementById('account-login').style.display = '';
}

function showAccountChoice() {
  document.getElementById('account-login').style.display = 'none';
  document.getElementById('account-choice').style.display = '';
  setAccountStatus('', null);
}

async function handleGateSignIn() {
  const email = document.getElementById('account-email').value.trim();
  const password = document.getElementById('account-password').value;
  if (!email || !password) { setAccountStatus('Enter email and password.', 'error'); return; }

  const signinBtn = document.getElementById('account-signin-btn');
  signinBtn.disabled = true;
  try {
    setAccountStatus('Signing in…', 'info');
    await ensureSyncConfig();
    const res = await chrome.runtime.sendMessage({ action: 'authSignIn', email, password });
    if (!res || !res.success) throw new Error((res && res.error) || 'Sign-in failed');

    setAccountStatus('Downloading your data…', 'info');
    // NOTE: syncCycle() swallows its own internal errors (sync.js `_runCycle`
    // try/catch), so `syncNow` returns { success: true } even if a pull failed
    // — we cannot reliably detect a failed pull here without changing sync.js
    // (out of scope). The defensive check below only catches a dropped message
    // or a future change that makes the handler throw. Eventual consistency is
    // provided by the background refresh alarm + the list page's storage
    // live-refresh listener, same as the existing list bootstrap.
    const syncRes = await chrome.runtime.sendMessage({ action: 'syncNow' });
    if (!syncRes || !syncRes.success) throw new Error((syncRes && syncRes.error) || 'Sync failed');

    // Persist onboardingComplete AFTER the sync round-trip so a pulled settings
    // record can't clobber it (pullSettings merges remote over local).
    const stored = await chrome.storage.local.get('rvData');
    const rvData = stored.rvData || { bookmarks: [], categories: [], settings: {} };
    rvData.settings = rvData.settings || {};
    rvData.settings.onboardingComplete = true;
    await chrome.storage.local.set({ rvData });

    setAccountStatus('Done ✓', 'info');
    window.location.href = 'list-modal.html';
  } catch (e) {
    setAccountStatus(`❌ ${e.message}`, 'error');
    signinBtn.disabled = false;
  }
}
```

- [ ] **Step 3: Wire the gate buttons in `DOMContentLoaded`**

In `onboarding.js`, inside the existing `document.addEventListener('DOMContentLoaded', function() { ... })` (starts line 237), add at the **start** of the callback body:

```js
  // Account gate
  const haveAccountBtn = document.getElementById('gate-have-account-btn');
  const newUserBtn     = document.getElementById('gate-new-user-btn');
  const accountBackBtn = document.getElementById('account-back-btn');
  const accountSigninBtn = document.getElementById('account-signin-btn');
  if (haveAccountBtn) haveAccountBtn.addEventListener('click', showLoginPanel);
  if (newUserBtn)     newUserBtn.addEventListener('click', showWizardFromGate);
  if (accountBackBtn) accountBackBtn.addEventListener('click', showAccountChoice);
  if (accountSigninBtn) accountSigninBtn.addEventListener('click', handleGateSignIn);
```

- [ ] **Step 4: Read Ollama fields in `completeOnboarding()`**

In `onboarding.js`, find the `data` object built in `completeOnboarding()` (around lines 199-230). The `settings` object currently ends with the `llmGateway` block. Add an `ollama` key built from the shared helper.

Find:

```js
      llmGateway: {
        enabled: true,
        apiKey: gatewayApiKey,
        modelsData: modelsData, // SAVE MODELS DATA TO STORAGE
        transactions: {
```

Leave that block intact, but locate its closing — the `}` that closes `llmGateway` followed by the `}` closing `settings`. It currently looks like:

```js
          pageSummary: {
            provider: pageProvider,
            model: pageModel,
            options: { temperature: 0.7, maxTokens: 2500 }
          }
        }
      }
    }
  };
```

Replace that tail with (insert `ollama:` after the `llmGateway` block closes):

```js
          pageSummary: {
            provider: pageProvider,
            model: pageModel,
            options: { temperature: 0.7, maxTokens: 2500 }
          }
        }
      },
      ollama: buildOllamaSettings(
        document.getElementById('ollama-local-url').value,
        document.getElementById('ollama-cloud-api-key').value
      )
    }
  };
```

(Note the comma added after the `llmGateway` block's closing `}` and before `ollama:`.)

- [ ] **Step 5: Run the test suite (regression guard)**

Run: `npm test`
Expected: PASS — onboarding.js isn't unit-tested, but confirm nothing in the shared modules broke.

- [ ] **Step 6: Lint-check the JS parses**

Run: `node --check onboarding.js`
Expected: no output (exit 0). If it errors, fix the syntax (commonly a missing/extra brace from Step 4).

- [ ] **Step 7: Confirm `buildOllamaSettings` is referenced and reachable**

Run: `grep -n "buildOllamaSettings" onboarding.js`
Expected: one call in `completeOnboarding()`. (It's a global from `utils.js`, loaded before `onboarding.js` in Task 3.)

- [ ] **Step 8: Verify the Supabase constants match `list-modal.js`**

Run:
```bash
grep -n "SUPABASE_URL\s*=\|SUPABASE_ANON_KEY\s*=" onboarding.js list-modal.js
```
Expected: the URL and anon-key string literals are identical between the two files. If they differ, copy `list-modal.js`'s values into `onboarding.js`.

- [ ] **Step 9: Commit**

```bash
git add onboarding.js
git commit -m "feat: account-gate sign-in with staged sync + Ollama read in onboarding"
```

---

## Task 6: Manual verification (real extension)

**Files:** none (verification only). Load the unpacked extension in Chrome (`chrome://extensions` → Load unpacked → repo root).

- [ ] **Step 1: New-user path renders and saves Ollama**

1. Trigger onboarding (fresh profile, or set `onboardingComplete:false`).
2. On the gate, click **No, I'm new** → wizard appears at step 1.
3. Complete the wizard; on the AI-config step enter a Local Ollama URL (e.g. `http://localhost:11434`); finish.
4. Open the list → DevTools console:
   `chrome.storage.local.get('rvData', d => console.log(d.rvData.settings.ollama))`
   Expected: `{ localEnabled: true, localBaseUrl: 'http://localhost:11434', cloudEnabled: false, cloudApiKey: '', modelsLastUpdated: null }`.

- [ ] **Step 2: Returning-user path syncs and shows data**

1. Re-trigger onboarding. On the gate click **Yes, sign in**.
2. Enter credentials for an account that already has cloud bookmarks/categories.
3. Watch the staged messages: *Signing in… → Downloading your data… → Done ✓*.
4. The list opens and shows the previously-synced **categories and bookmarks**.
5. Confirm onboarding does not re-appear on next popup open
   (`onboardingComplete` is true).

- [ ] **Step 3: Bad-credentials path**

1. Gate → **Yes, sign in** → wrong password → **Sign In**.
2. Expected: `❌ <error message>` in the status area; user stays on the login panel; **Sign In** re-enables; **Back** returns to the choice; **No, I'm new** still starts the wizard.

- [ ] **Step 4: Parity check (onboarding vs Settings)**

Confirm the `settings.ollama` shape produced by onboarding (Step 1) is byte-identical to one produced by saving the same values in the Settings panel. Both call `buildOllamaSettings`, so they must match.

- [ ] **Step 5: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "fix: onboarding login/sync verification fixes"
```

(Skip if no changes were required.)

---

## Done criteria

- `npm test` passes (including the new `buildOllamaSettings` tests).
- New users can finish onboarding with Ollama config persisted.
- Returning users sign in at the gate, see staged sync messages, land in the list with their synced categories/bookmarks, and are not re-onboarded.
- Settings and onboarding produce identical `settings.ollama` via the shared helper.
