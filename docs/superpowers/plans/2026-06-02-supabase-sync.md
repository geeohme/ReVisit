# Supabase Cloud Sync, Auth & Multi-Device Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move ReVisit's data from `chrome.storage.local` to a self-hosted Supabase instance, with persistent email/password login, multi-device sync (last-write-wins), client-side encrypted settings secrets, and backup/restore that stays compatible with legacy files.

**Architecture:** A new `sync.js` module is a **thin, dependency-free client** that talks to Supabase's GoTrue (`/auth/v1`) and PostgREST (`/rest/v1`) endpoints with raw `fetch` — the same style the codebase already uses for the LLM gateway. No `supabase-js` bundle (avoids MV3 service-worker module/build friction). It is inlined into `background.js` for the service worker, and a browser-context copy is loaded by `list-modal.js`/`popup.js`. Pure logic (LWW merge, tombstones, legacy→UUID mapping, encrypt/decrypt, backup-format detection) lives in a separate testable module, `rv-sync-core.js`, exercised by Node's built-in `node --test` runner (zero npm dependencies). Local-first writes stay instant; sync is additive and fails soft; logged-out users are unaffected.

**Tech Stack:** Vanilla JS (MV3 Chrome extension), self-hosted Supabase (Postgres + GoTrue + PostgREST), WebCrypto (PBKDF2 + AES-GCM), `chrome.storage.local`, `chrome.alarms`, Node `node:test`/`node:assert` for unit tests.

**Spec:** `docs/superpowers/specs/2026-06-02-supabase-sync-design.md`

---

## Phased Execution

This is one linear plan, executed in four phases. **Each phase is intended to be one subagent-driven conversation.** Every phase ends with a **Drift-Reconciliation Task** — reconcile the plan's assumed interfaces against what was actually built before starting the next phase. **Phase 0 contains a configuration section you (the user) must fill in before Phase 1 begins.**

| Phase | Outcome (ships working software) |
| :--- | :--- |
| 0 | Prerequisites: Supabase config provided, DB schema + RLS applied, test runner + manifest ready |
| 1 | A user can sign in / sign up / sign out and stay logged in across restarts |
| 2 | Local + remote data sync bidirectionally; existing library backfills to the cloud |
| 3 | Settings (incl. encrypted secrets) sync across devices |
| 4 | Versioned backup; merge-based restore accepts legacy `rv-...` and new UUID files |

---

## File Structure

| File | Responsibility |
| :--- | :--- |
| `rv-sync-core.js` (new) | **Pure, testable** functions — no `chrome.*`, no `fetch`. LWW merge, tombstone apply, legacy→UUID mapping + dedupe, backup-format detection, settings secret encrypt/decrypt (takes a CryptoKey), record stamping. Exported for both the extension (global) and `node:test`. |
| `rv-sync-core.test.js` (new) | `node --test` unit tests for `rv-sync-core.js`. |
| `sync.js` (new) | Thin Supabase client (GoTrue + PostgREST via `fetch`), `chrome.storage.local` session adapter, `signIn`/`signUp`/`signOut`/`getSession`/`refresh`, `deriveEncKey`, `pushLocalChanges()`, `pullRemoteChanges()`, `syncCycle()`, alarm registration. Depends on `rv-sync-core.js`. |
| `package.json` (new) | Declares `"test": "node --test"`. No dependencies. |
| `db/schema.sql` (new) | Tables, indexes, RLS policies. Applied to the self-hosted instance. |
| `db/README.md` (new) | How to apply `schema.sql` + the GoTrue env values. |
| `background.js` (modify) | Inline `sync.js` + `rv-sync-core.js`; add auth message actions; stamp records + trigger push in `saveStorageData`/transcript writes; register `chrome.alarms`; run `syncCycle` on triggers. |
| `manifest.json` (modify) | Add `"alarms"` permission; declare `rv-sync-core.js`/`sync.js` as web-accessible. |
| `list-modal.js` (modify) | Stamp records in `saveData`/`deleteCurrentBookmark`; login/account/sync UI in settings; versioned `exportData`; merge-LWW `importData`; "Sync to Cloud" button. |
| `list-modal.html` (modify) | Login/account/sync UI markup in the settings modal. |
| `popup.js` / `popup.html` (modify) | Login entry point / status. |

> **Loading shared code:** `rv-sync-core.js` is written as a plain script that assigns to `globalThis.RvSyncCore` and also `module.exports` when `module` exists (so `node:test` can `require` it). The service worker loads it by inlining (copy its body into `background.js`, mirroring how `llm-gateway.js` is inlined) **or** via `importScripts('rv-sync-core.js')` — Task 0.4 picks one. Browser contexts (`list-modal.html`, `popup.html`) load it with a `<script src>` tag.

---

# PHASE 0 — Prerequisites & Configuration

## Task 0.1: Supabase configuration handoff (USER FILLS THIS IN)

**Files:**
- Create: `db/CONFIG.local.md` (gitignored — holds your instance values)

This task is a gate. The implementer pauses here until the values below are provided. **George: fill in this block and confirm before Phase 1.**

- [ ] **Step 1: Create the gitignored config file**

Add to `.gitignore`:
```
db/CONFIG.local.md
```

Create `db/CONFIG.local.md` from this template and fill it in:
```markdown
# Supabase Instance Config (LOCAL — never committed)

SUPABASE_URL = "https://<your-vps-host-or-domain>"   # base URL of the Supabase API (no trailing slash)
SUPABASE_ANON_KEY = "<anon public key from your Supabase>"

## GoTrue env currently set on the VPS (confirm / adjust):
- GOTRUE_MAILER_AUTOCONFIRM = true        # email confirmation OFF (no SMTP needed)?  [ ] yes  [ ] no
- GOTRUE_DISABLE_SIGNUP     = false        # allow new sign-ups from the extension?    [ ] yes  [ ] no
- GOTRUE_JWT_EXP            = 3600          # access-token lifetime (seconds)
- Refresh token validity / reuse interval: <value or "default">

## Anything else I should know about your instance:
- Reverse proxy / path prefix? (e.g. is PostgREST at /rest/v1 and GoTrue at /auth/v1?)  __________
- Is the instance reachable over HTTPS with a valid cert?  [ ] yes  [ ] no
- Self-signed cert? (affects fetch from the extension)  __________
```

- [ ] **Step 2: Confirm the two endpoints respond**

Run (substitute your values):
```bash
curl -s "$SUPABASE_URL/auth/v1/health" -H "apikey: $SUPABASE_ANON_KEY"
curl -s "$SUPABASE_URL/rest/v1/" -H "apikey: $SUPABASE_ANON_KEY" | head -c 200
```
Expected: `/auth/v1/health` returns JSON (e.g. `{"name":"GoTrue",...}` or `{"date":...}`); `/rest/v1/` returns an OpenAPI/JSON blob (not a connection error).

- [ ] **Step 3: STOP — wait for user confirmation that the values are filled in and endpoints respond before proceeding.**

---

## Task 0.2: Database schema + RLS

**Files:**
- Create: `db/schema.sql`
- Create: `db/README.md`

- [ ] **Step 1: Write `db/schema.sql`**

```sql
-- ReVisit cloud schema. Apply with: psql "<connection string>" -f db/schema.sql
-- Or paste into the Supabase SQL editor.

create extension if not exists "pgcrypto";

-- ── bookmarks ───────────────────────────────────────────────
create table if not exists public.bookmarks (
  id              uuid primary key,
  legacy_id       text,
  user_id         uuid not null references auth.users(id) on delete cascade,
  url             text,
  title           text,
  category        text,
  summary         text,
  tags            text[],
  user_notes      text,
  added_timestamp bigint,
  revisit_by      timestamptz,
  status          text,
  history         jsonb,
  is_youtube      boolean,
  metadata        jsonb,
  updated_at      timestamptz not null,
  deleted_at      timestamptz
);
create index if not exists bookmarks_user_updated on public.bookmarks (user_id, updated_at);
create index if not exists bookmarks_user_legacy  on public.bookmarks (user_id, legacy_id);

-- ── categories ──────────────────────────────────────────────
create table if not exists public.categories (
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  priority    int,
  updated_at  timestamptz not null,
  deleted_at  timestamptz,
  primary key (user_id, name)
);

-- ── transcripts ─────────────────────────────────────────────
create table if not exists public.transcripts (
  video_id    text not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  raw         text,
  formatted   text,
  updated_at  timestamptz not null,
  deleted_at  timestamptz,
  primary key (video_id, user_id)
);
create index if not exists transcripts_user_updated on public.transcripts (user_id, updated_at);

-- ── user_settings ───────────────────────────────────────────
create table if not exists public.user_settings (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  data        jsonb,
  secrets     jsonb,
  enc_salt    text,
  updated_at  timestamptz not null
);

-- ── Row-Level Security: each user sees only their own rows ──
alter table public.bookmarks     enable row level security;
alter table public.categories    enable row level security;
alter table public.transcripts   enable row level security;
alter table public.user_settings enable row level security;

do $$
declare t text;
begin
  foreach t in array array['bookmarks','categories','transcripts','user_settings'] loop
    execute format('drop policy if exists rls_select on public.%I;', t);
    execute format('drop policy if exists rls_modify on public.%I;', t);
    execute format($f$create policy rls_select on public.%I for select using (user_id = auth.uid());$f$, t);
    execute format($f$create policy rls_modify on public.%I for all   using (user_id = auth.uid()) with check (user_id = auth.uid());$f$, t);
  end loop;
end $$;
```

- [ ] **Step 2: Write `db/README.md`** documenting how to apply the schema (psql + SQL-editor paths) and listing the GoTrue env values from Task 0.1.

- [ ] **Step 3: Apply the schema to the instance** (user runs against their DB).

Run: `psql "<conn string>" -f db/schema.sql`
Expected: `CREATE TABLE` / `CREATE INDEX` / `ALTER TABLE` / `DO` with no errors.

- [ ] **Step 4: Verify RLS blocks anonymous reads**

Run:
```bash
curl -s "$SUPABASE_URL/rest/v1/bookmarks?select=id" -H "apikey: $SUPABASE_ANON_KEY"
```
Expected: `[]` (empty — RLS denies, no rows leak) rather than data or a 500.

- [ ] **Step 5: Commit**

```bash
git add db/schema.sql db/README.md .gitignore
git commit -m "feat(db): add Supabase schema, indexes, and RLS policies"
```

---

## Task 0.3: Test runner

**Files:**
- Create: `package.json`

- [ ] **Step 1: Create `package.json`** (no dependencies)

```json
{
  "name": "revisit",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Verify the runner works with an empty pass**

Run: `node --test 2>&1 | tail -5`
Expected: exits 0 with "tests 0" (or similar) — runner is available.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add node --test runner (zero deps)"
```

---

## Task 0.4: Manifest permissions + shared-script wiring

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: Add the `alarms` permission**

In `manifest.json`, change the `permissions` array from:
```json
  "permissions": [
    "storage",
    "activeTab",
    "scripting",
    "tabs"
  ],
```
to:
```json
  "permissions": [
    "storage",
    "activeTab",
    "scripting",
    "tabs",
    "alarms"
  ],
```

> Network access to the Supabase host is already covered by the existing `"host_permissions": ["<all_urls>"]`.

- [ ] **Step 2: Add `rv-sync-core.js` and `sync.js` to web-accessible resources** (so `list-modal.html`/`popup.html` can `<script src>` them)

Change:
```json
  "web_accessible_resources": [
    {
      "resources": ["styles.css", "utils.js"],
      "matches": ["<all_urls>"]
    }
  ],
```
to:
```json
  "web_accessible_resources": [
    {
      "resources": ["styles.css", "utils.js", "rv-sync-core.js", "sync.js"],
      "matches": ["<all_urls>"]
    }
  ],
```

- [ ] **Step 3: Commit**

```bash
git add manifest.json
git commit -m "chore(manifest): add alarms permission and expose sync scripts"
```

---

# PHASE 1 — Auth Foundation

Goal: sign up / sign in / sign out with a persistent, auto-refreshing session stored in `chrome.storage.local`. No data sync yet.

## Task 1.1: Thin GoTrue auth client in `sync.js`

**Files:**
- Create: `sync.js`

The instance URL + anon key are read from `chrome.storage.local` key `rvSyncConfig` (set by the login UI in Task 1.3, seeded from `db/CONFIG.local.md`). Session stored under `rvSession`.

- [ ] **Step 1: Create `sync.js` with the session adapter + auth functions**

```js
// sync.js — thin Supabase (GoTrue + PostgREST) client for ReVisit.
// No external deps; raw fetch, same style as the LLM gateway code.
(function (root) {
  const CONFIG_KEY  = 'rvSyncConfig';   // { url, anonKey }
  const SESSION_KEY = 'rvSession';      // { access_token, refresh_token, expires_at, user }

  async function getConfig() {
    const r = await chrome.storage.local.get(CONFIG_KEY);
    return r[CONFIG_KEY] || null;
  }
  async function setConfig(cfg) {
    await chrome.storage.local.set({ [CONFIG_KEY]: cfg });
  }
  async function getSession() {
    const r = await chrome.storage.local.get(SESSION_KEY);
    return r[SESSION_KEY] || null;
  }
  async function setSession(s) {
    if (s) await chrome.storage.local.set({ [SESSION_KEY]: s });
    else   await chrome.storage.local.remove(SESSION_KEY);
  }

  function authHeaders(cfg, accessToken) {
    return {
      'Content-Type': 'application/json',
      'apikey': cfg.anonKey,
      ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {})
    };
  }

  // Normalize a GoTrue token response into our session shape.
  function toSession(json) {
    const expiresAt = Date.now() + (json.expires_in ? json.expires_in * 1000 : 3600 * 1000);
    return {
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: expiresAt,
      user: json.user || null
    };
  }

  async function signUp(email, password) {
    const cfg = await getConfig();
    if (!cfg) throw new Error('Sync not configured');
    const res = await fetch(`${cfg.url}/auth/v1/signup`, {
      method: 'POST', headers: authHeaders(cfg),
      body: JSON.stringify({ email, password })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.msg || json.error_description || `Sign-up failed (${res.status})`);
    // If autoconfirm is on, signup returns a session; otherwise user must confirm.
    if (json.access_token) { const s = toSession(json); await setSession(s); return s; }
    return null;
  }

  async function signIn(email, password) {
    const cfg = await getConfig();
    if (!cfg) throw new Error('Sync not configured');
    const res = await fetch(`${cfg.url}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: authHeaders(cfg),
      body: JSON.stringify({ email, password })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error_description || json.msg || `Sign-in failed (${res.status})`);
    const s = toSession(json);
    await setSession(s);
    return s;
  }

  async function signOut() {
    await setSession(null);
  }

  // Refresh the access token if expired/near-expiry. Returns a valid session or null.
  async function ensureFreshSession() {
    const cfg = await getConfig();
    const s = await getSession();
    if (!cfg || !s) return null;
    const skewMs = 60 * 1000; // refresh 1 min before expiry
    if (Date.now() < (s.expires_at - skewMs)) return s;
    const res = await fetch(`${cfg.url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', headers: authHeaders(cfg),
      body: JSON.stringify({ refresh_token: s.refresh_token })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Refresh token revoked/expired — surface a re-login state, keep local data.
      await setSession(null);
      return null;
    }
    const fresh = toSession(json);
    await setSession(fresh);
    return fresh;
  }

  async function isLoggedIn() {
    return !!(await getSession());
  }

  root.RvSync = {
    getConfig, setConfig, getSession, setSession,
    signUp, signIn, signOut, ensureFreshSession, isLoggedIn,
    authHeaders, toSession, CONFIG_KEY, SESSION_KEY
  };
})(typeof self !== 'undefined' ? self : globalThis);
```

- [ ] **Step 2: Commit**

```bash
git add sync.js
git commit -m "feat(sync): thin GoTrue auth client with chrome.storage session"
```

> **Why no automated test here:** these functions are thin `fetch`/`chrome.storage` wrappers (integration glue, not logic). They're covered by the Phase 1 manual checklist (Task 1.5). Pure logic gets unit tests starting in Phase 2.

---

## Task 1.2: Wire auth message actions into `background.js`

**Files:**
- Modify: `background.js` (top of file; and the `onMessage` listener ~line 659)

- [ ] **Step 1: Load `sync.js` into the service worker**

At the very top of `background.js` (line 1, before `DEFAULT_DATA`), add:
```js
// Cloud sync client (thin GoTrue + PostgREST). Loaded into the service worker.
importScripts('sync.js');
```

> If `importScripts` is unavailable because the manifest later switches the worker to an ES module, fall back to inlining `sync.js`'s body here (as `llm-gateway.js` is inlined). For now the worker is a classic worker, so `importScripts` works.

- [ ] **Step 2: Add auth actions to the `onMessage` listener**

In `background.js`, find the `saveData` branch (line 665-667):
```js
      } else if (request.action === 'saveData') {
        await saveStorageData(request.data);
        sendResponse({ success: true });
```
Immediately after its closing, add:
```js
      } else if (request.action === 'authSignIn') {
        const s = await self.RvSync.signIn(request.email, request.password);
        sendResponse({ success: true, user: s.user });
      } else if (request.action === 'authSignUp') {
        const s = await self.RvSync.signUp(request.email, request.password);
        sendResponse({ success: true, user: s ? s.user : null, needsConfirm: !s });
      } else if (request.action === 'authSignOut') {
        await self.RvSync.signOut();
        sendResponse({ success: true });
      } else if (request.action === 'authStatus') {
        const s = await self.RvSync.ensureFreshSession();
        sendResponse({ success: true, loggedIn: !!s, email: s && s.user ? s.user.email : null });
      } else if (request.action === 'setSyncConfig') {
        await self.RvSync.setConfig({ url: request.url, anonKey: request.anonKey });
        sendResponse({ success: true });
```

- [ ] **Step 3: Reload the extension and smoke-test from the service-worker console**

Run (in the extension's service-worker DevTools console):
```js
chrome.runtime.sendMessage({ action: 'setSyncConfig', url: '<SUPABASE_URL>', anonKey: '<ANON_KEY>' });
chrome.runtime.sendMessage({ action: 'authStatus' }, console.log);
```
Expected: `{ success: true, loggedIn: false, email: null }`.

- [ ] **Step 4: Commit**

```bash
git add background.js
git commit -m "feat(sync): add auth message actions to background"
```

---

## Task 1.3: Login / account UI in the settings modal

**Files:**
- Modify: `list-modal.html` (settings modal, after the header ~line 114)
- Modify: `list-modal.js` (load `sync.js`; add handlers)

- [ ] **Step 1: Add the account section markup**

In `list-modal.html`, immediately after the opening of `<div class="settings-body">` (line 114), insert:
```html
                <!-- Account / Cloud Sync Section -->
                <div class="settings-section" id="account-section">
                    <h3>☁️ Account &amp; Sync</h3>
                    <div id="account-logged-out">
                        <div class="settings-field">
                            <label for="auth-email">Email</label>
                            <input type="email" id="auth-email" placeholder="you@example.com">
                        </div>
                        <div class="settings-field">
                            <label for="auth-password">Password</label>
                            <input type="password" id="auth-password" placeholder="Password">
                        </div>
                        <div class="settings-button-group">
                            <button class="settings-btn settings-btn-primary" id="auth-signin-btn">Sign In</button>
                            <button class="settings-btn settings-btn-secondary" id="auth-signup-btn">Create Account</button>
                        </div>
                    </div>
                    <div id="account-logged-in" style="display:none;">
                        <p class="settings-help-text">Signed in as <strong id="account-email"></strong>.</p>
                        <div class="settings-button-group">
                            <button class="settings-btn settings-btn-info" id="sync-now-btn">🔄 Sync to Cloud</button>
                            <button class="settings-btn settings-btn-secondary" id="auth-signout-btn">Sign Out</button>
                        </div>
                        <p class="settings-help-text" id="sync-status"></p>
                    </div>
                </div>
```

- [ ] **Step 2: Load `sync.js` + `rv-sync-core.js` in `list-modal.html`**

Before `<script src="list-modal.js"></script>` (end of file), add:
```html
    <script src="rv-sync-core.js"></script>
    <script src="sync.js"></script>
```
> `rv-sync-core.js` is created in Phase 2 (Task 2.1). Until then this `<script>` 404s harmlessly; add it now so the markup is final. (If a 404 in console is undesirable during Phase 1, add this line in Task 2.1 instead.)

- [ ] **Step 3: Add auth UI handlers in `list-modal.js`**

In `list-modal.js`, inside `setupSettingsEventListeners` (the function that wires settings buttons, ~line 693 region where `test-connection-btn` is wired), add:
```js
  // ── Account / auth ──
  const signinBtn  = document.getElementById('auth-signin-btn');
  const signupBtn  = document.getElementById('auth-signup-btn');
  const signoutBtn = document.getElementById('auth-signout-btn');
  if (signinBtn)  signinBtn.onclick  = () => handleAuth('authSignIn');
  if (signupBtn)  signupBtn.onclick  = () => handleAuth('authSignUp');
  if (signoutBtn) signoutBtn.onclick = handleSignOut;
```

Add these functions near the other settings functions (after `openSettings`):
```js
async function refreshAccountUI() {
  const status = await chrome.runtime.sendMessage({ action: 'authStatus' });
  const loggedOut = document.getElementById('account-logged-out');
  const loggedIn  = document.getElementById('account-logged-in');
  if (!loggedOut || !loggedIn) return;
  if (status && status.loggedIn) {
    loggedOut.style.display = 'none';
    loggedIn.style.display = '';
    document.getElementById('account-email').textContent = status.email || '';
  } else {
    loggedOut.style.display = '';
    loggedIn.style.display = 'none';
  }
}

async function handleAuth(action) {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  if (!email || !password) { showToast('Enter email and password', 'error'); return; }
  try {
    const res = await chrome.runtime.sendMessage({ action, email, password });
    if (!res || !res.success) throw new Error((res && res.error) || 'Auth failed');
    if (action === 'authSignUp' && res.needsConfirm) {
      showToast('Account created — check your email to confirm.', 'success');
    } else {
      showToast('Signed in!', 'success');
    }
    await refreshAccountUI();
  } catch (e) {
    showToast(`❌ ${e.message}`, 'error');
  }
}

async function handleSignOut() {
  await chrome.runtime.sendMessage({ action: 'authSignOut' });
  showToast('Signed out.', 'success');
  await refreshAccountUI();
}
```

- [ ] **Step 4: Call `refreshAccountUI()` when settings open**

In `openSettings()` (line 628), add as the last line of the function body:
```js
  refreshAccountUI();
```

- [ ] **Step 5: Seed the sync config once (from CONFIG.local.md)**

Add a one-time config push. In `list-modal.js`, near the top-level init (where the page first loads data), add:
```js
// One-time: ensure the extension knows the Supabase endpoint.
// Replace the literals from db/CONFIG.local.md, OR leave a Settings field (see note).
(async () => {
  const SUPABASE_URL = '<SUPABASE_URL>';      // from db/CONFIG.local.md
  const SUPABASE_ANON_KEY = '<ANON_KEY>';     // from db/CONFIG.local.md
  if (SUPABASE_URL.startsWith('http')) {
    await chrome.runtime.sendMessage({ action: 'setSyncConfig', url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY });
  }
})();
```
> The implementer substitutes the literals from `db/CONFIG.local.md` (not committed with real values). The anon key is a public key (safe in client code), so hard-coding it is acceptable for a self-hosted single-tenant app.

- [ ] **Step 6: Commit**

```bash
git add list-modal.html list-modal.js
git commit -m "feat(sync): account sign-in/up/out UI in settings"
```

---

## Task 1.4: Persistent session on startup + alarm refresh

**Files:**
- Modify: `background.js`

- [ ] **Step 1: Register a refresh alarm and refresh on startup**

In `background.js`, after the existing `chrome.runtime.onInstalled` listener (ends ~line 596), add:
```js
// Keep the session fresh: refresh on startup and on a periodic alarm.
chrome.runtime.onStartup.addListener(() => { self.RvSync.ensureFreshSession(); });

chrome.alarms.create('rvSyncTick', { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'rvSyncTick') {
    self.RvSync.ensureFreshSession();
    // Phase 2 adds: syncCycle();
  }
});
```

- [ ] **Step 2: Manually verify persistence**

After signing in (Task 1.5), inspect storage:
```js
chrome.storage.local.get('rvSession', console.log);
```
Expected: an object with `access_token`, `refresh_token`, `expires_at`. Reload the extension; run `authStatus` — still `loggedIn: true`.

- [ ] **Step 3: Commit**

```bash
git add background.js
git commit -m "feat(sync): persist session, refresh on startup + alarm"
```

---

## Task 1.5: Phase 1 manual verification checklist

**Files:** none (verification only)

- [ ] Sign up with a new email/password in the settings modal → toast confirms (or "check email" if confirm is on).
- [ ] Sign in → "Signed in as <email>" appears.
- [ ] Reload the extension → reopen settings → still signed in (persistence works).
- [ ] Sign out → returns to logged-out state.
- [ ] On a **second browser profile/device**, install the extension, sign in with the same account → succeeds (multi-device auth).
- [ ] Wrong password → clear error toast, no crash.

---

## Task 1.6: Phase 1 Drift-Reconciliation

**Files:** none (review + targeted fixes)

- [ ] **Step 1:** Re-read the actual `sync.js` `RvSync` API surface as built. Confirm exported names match what Phase 2 assumes: `getConfig/setConfig/getSession/setSession/signIn/signUp/signOut/ensureFreshSession/isLoggedIn/authHeaders/toSession/CONFIG_KEY/SESSION_KEY`. Note any renames in this file before Phase 2 starts.
- [ ] **Step 2:** Confirm the message-action names (`authSignIn/authSignUp/authSignOut/authStatus/setSyncConfig`) match between `background.js` and `list-modal.js`.
- [ ] **Step 3:** Confirm `importScripts('sync.js')` actually loaded (no service-worker registration error in `chrome://extensions`). If the worker is an ES module, switch to inlining and record that decision here.
- [ ] **Step 4:** Update Phase 2 task code references if any names drifted. Commit any fixes: `git commit -m "chore(sync): phase 1 drift reconciliation"`.

---

# PHASE 2 — Local Data Shape + Sync Engine

Goal: stamp local records (`updatedAt`/`_dirty`/`deletedAt`), build pure merge logic with tests, push dirty records up, pull remote changes down (LWW + tombstones), run on triggers, and backfill the existing library.

## Task 2.1: Pure sync-core module + tests (stamping, LWW merge, tombstones)

**Files:**
- Create: `rv-sync-core.js`
- Create: `rv-sync-core.test.js`

- [ ] **Step 1: Write the failing tests**

`rv-sync-core.test.js`:
```js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test rv-sync-core.test.js`
Expected: FAIL — "Cannot find module './rv-sync-core.js'".

- [ ] **Step 3: Implement `rv-sync-core.js`**

```js
// rv-sync-core.js — pure, environment-agnostic sync logic. No chrome.*, no fetch.
(function (root, factory) {
  const mod = factory();
  root.RvSyncCore = mod;
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis, function () {

  function stampRecord(rec, isoNow) {
    return { ...rec, updatedAt: isoNow, _dirty: true };
  }

  // Newer updatedAt wins; ties keep remote (server is canonical on equal stamps).
  function mergeRecordLWW(local, remote) {
    if (!local) return remote;
    if (!remote) return local;
    return (new Date(remote.updatedAt) >= new Date(local.updatedAt)) ? remote : local;
  }

  // Apply a list of remote rows onto a local list keyed by `key`.
  // Honors deletedAt tombstones (removes locally when remote wins).
  function applyRemoteList(localList, remoteList, key) {
    const map = new Map(localList.map(r => [r[key], r]));
    for (const remote of remoteList) {
      const local = map.get(remote[key]);
      const winner = mergeRecordLWW(local, remote);
      if (winner === remote && remote.deletedAt) {
        map.delete(remote[key]);                 // tombstone wins → drop locally
      } else if (winner === remote) {
        const clean = { ...remote }; delete clean._dirty;
        map.set(remote[key], clean);
      } // else local wins → keep as-is
    }
    return Array.from(map.values());
  }

  return { stampRecord, mergeRecordLWW, applyRemoteList };
});
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test rv-sync-core.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add rv-sync-core.js rv-sync-core.test.js
git commit -m "feat(sync): pure LWW merge + tombstone core with tests"
```

---

## Task 2.2: Stamp records on local writes

**Files:**
- Modify: `background.js` (`saveStorageData` ~line 615; transcript writes ~line 1345-1375)
- Modify: `list-modal.js` (`saveData` ~line 617; `deleteCurrentBookmark` ~line 606)

- [ ] **Step 1: Stamp bookmarks/categories on save in `background.js`**

Replace `saveStorageData` (lines 615-617):
```js
async function saveStorageData(data) {
  await chrome.storage.local.set({ rvData: data });
}
```
with:
```js
async function saveStorageData(data, opts = {}) {
  // Stamp changed records dirty unless caller is applying a remote pull.
  if (!opts.fromRemote) {
    const now = new Date().toISOString();
    (data.bookmarks || []).forEach(b => { if (b._dirty === undefined || b._touched) { b.updatedAt = now; b._dirty = true; delete b._touched; } });
  }
  await chrome.storage.local.set({ rvData: data });
  if (!opts.fromRemote && self.RvSync && (await self.RvSync.isLoggedIn())) {
    triggerPush();   // defined in Task 2.4
  }
}
```
> Bookmarks set `b._touched = true` at mutation sites that should re-stamp. For the common path (whole-array save after an edit), simplest is to stamp every record on each save; that over-marks but is correct (idempotent push). If over-marking is a concern, the implementer adds `_touched` at the specific mutation points in Task 2.2 Step 3. **Decision for this plan: stamp every record on each save** — replace the `forEach` body with `{ b.updatedAt = now; b._dirty = true; }`. Keep it simple; push is idempotent.

- [ ] **Step 2: Soft-delete instead of hard-delete in `list-modal.js`**

Replace `deleteCurrentBookmark` (lines 606-615). Change the filter line:
```js
  bookmarks = bookmarks.filter(b => b.id !== currentBookmarkId);
```
to:
```js
  const now = new Date().toISOString();
  bookmarks = bookmarks.map(b =>
    b.id === currentBookmarkId ? { ...b, deletedAt: now, updatedAt: now, _dirty: true, status: 'Deleted' } : b
  );
```
> Render code must skip `deletedAt` records. In `renderLinks()` add a `.filter(b => !b.deletedAt)` at the top of its bookmark iteration. (Implementer: locate the bookmark loop in `renderLinks` and add the filter.)

- [ ] **Step 3: Stamp in `list-modal.js` `saveData`**

Replace `saveData` (lines 617-621):
```js
async function saveData() {
  await chrome.storage.local.set({
    rvData: { bookmarks, categories, settings }
  });
}
```
with:
```js
async function saveData() {
  const now = new Date().toISOString();
  bookmarks.forEach(b => { b.updatedAt = now; b._dirty = true; });
  categories.forEach(c => { c.updatedAt = now; c._dirty = true; });
  await chrome.storage.local.set({ rvData: { bookmarks, categories, settings } });
  // Trigger a push if logged in (fire-and-forget via background).
  chrome.runtime.sendMessage({ action: 'syncPush' }).catch(() => {});
}
```

- [ ] **Step 4: Stamp transcripts in `background.js`**

In the transcript save helper (~line 1345-1354), where `transcripts[videoId]` is set, add `updatedAt`/`_dirty`:
```js
  transcripts[videoId] = { ...(transcripts[videoId] || {}), ...payload, updatedAt: new Date().toISOString(), _dirty: true };
```
(Implementer adapts to the existing shape at that line.)

- [ ] **Step 5: Manually verify stamping**

Edit a bookmark in the list view, then:
```js
chrome.storage.local.get('rvData', d => console.log(d.rvData.bookmarks.map(b => ({id:b.id, u:b.updatedAt, dirty:b._dirty}))));
```
Expected: edited records have `updatedAt` + `_dirty: true`.

- [ ] **Step 6: Commit**

```bash
git add background.js list-modal.js
git commit -m "feat(sync): stamp updatedAt/_dirty on writes, soft-delete bookmarks"
```

---

## Task 2.3: PostgREST data client in `sync.js`

**Files:**
- Modify: `sync.js`

- [ ] **Step 1: Add upsert + incremental-fetch helpers**

Inside the `sync.js` IIFE, before `root.RvSync = {...}`, add:
```js
  async function authedFetch(path, opts = {}) {
    const cfg = await getConfig();
    const s = await ensureFreshSession();
    if (!cfg || !s) throw new Error('Not authenticated');
    const res = await fetch(`${cfg.url}${path}`, {
      ...opts,
      headers: { ...authHeaders(cfg, s.access_token), ...(opts.headers || {}) }
    });
    return res;
  }

  // Upsert an array of rows into `table` (merge-duplicates on PK).
  async function upsertRows(table, rows) {
    if (!rows.length) return;
    const res = await authedFetch(`/rest/v1/${table}`, {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows)
    });
    if (!res.ok) { const t = await res.text(); throw new Error(`upsert ${table} failed (${res.status}): ${t}`); }
  }

  // Fetch rows updated after `sinceIso` (or all if null).
  async function fetchSince(table, sinceIso) {
    const q = sinceIso ? `?updated_at=gt.${encodeURIComponent(sinceIso)}` : '';
    const res = await authedFetch(`/rest/v1/${table}${q}`, { method: 'GET' });
    if (!res.ok) { const t = await res.text(); throw new Error(`fetch ${table} failed (${res.status}): ${t}`); }
    return res.json();
  }
```
Add `authedFetch, upsertRows, fetchSince` to the `root.RvSync = {...}` export list.

- [ ] **Step 2: Commit**

```bash
git add sync.js
git commit -m "feat(sync): PostgREST upsert + incremental fetch helpers"
```

---

## Task 2.4: Push/pull cycle + field mapping

**Files:**
- Modify: `sync.js`

Local records use camelCase (`addedTimestamp`, `userNotes`, `revisitBy`); Postgres uses snake_case. A mapping layer converts both ways.

- [ ] **Step 1: Add field mapping + push/pull/syncCycle**

In `sync.js`, before the export, add:
```js
  const Core = (self.RvSyncCore) || (typeof require !== 'undefined' && require('./rv-sync-core.js'));

  // ── bookmark <-> row mapping ──
  function bookmarkToRow(b, userId) {
    return {
      id: b.uuid || b.id, legacy_id: b.legacyId || null, user_id: userId,
      url: b.url, title: b.title, category: b.category, summary: b.summary,
      tags: b.tags || [], user_notes: b.userNotes || '', added_timestamp: b.addedTimestamp || null,
      revisit_by: b.revisitBy || null, status: b.status, history: b.history || [],
      is_youtube: !!b.isYouTube, metadata: b.metadata || {},
      updated_at: b.updatedAt, deleted_at: b.deletedAt || null
    };
  }
  function rowToBookmark(r) {
    return {
      id: r.id, legacyId: r.legacy_id || undefined, url: r.url, title: r.title, category: r.category,
      summary: r.summary, tags: r.tags || [], userNotes: r.user_notes || '', addedTimestamp: r.added_timestamp,
      revisitBy: r.revisit_by, status: r.status, history: r.history || [], isYouTube: !!r.is_youtube,
      metadata: r.metadata || {}, updatedAt: r.updated_at, deletedAt: r.deleted_at || undefined
    };
  }
  function catToRow(c, userId) {
    return { user_id: userId, name: c.name, priority: c.priority, updated_at: c.updatedAt || new Date().toISOString(), deleted_at: c.deletedAt || null };
  }
  function rowToCat(r) { return { name: r.name, priority: r.priority, updatedAt: r.updated_at, deletedAt: r.deleted_at || undefined }; }

  async function getRvData() { const r = await chrome.storage.local.get('rvData'); return r.rvData || { bookmarks: [], categories: [], settings: {} }; }
  async function setRvData(d) { await chrome.storage.local.set({ rvData: d }); }
  async function getSyncState() { const r = await chrome.storage.local.get('rvSyncState'); return r.rvSyncState || { lastPulledAt: null }; }
  async function setSyncState(s) { await chrome.storage.local.set({ rvSyncState: s }); }

  async function pushLocalChanges() {
    const s = await ensureFreshSession(); if (!s) return;
    const userId = s.user.id;
    const data = await getRvData();
    const dirtyBookmarks = (data.bookmarks || []).filter(b => b._dirty);
    const dirtyCats = (data.categories || []).filter(c => c._dirty);
    if (dirtyBookmarks.length) await upsertRows('bookmarks', dirtyBookmarks.map(b => bookmarkToRow(b, userId)));
    if (dirtyCats.length)      await upsertRows('categories', dirtyCats.map(c => catToRow(c, userId)));
    // transcripts pushed by their own path (Task 2.6)
    data.bookmarks = (data.bookmarks || []).map(b => { const c = { ...b }; delete c._dirty; return c; });
    data.categories = (data.categories || []).map(c => { const x = { ...c }; delete x._dirty; return x; });
    // physically drop locally-confirmed tombstones
    data.bookmarks = data.bookmarks.filter(b => !b.deletedAt);
    await setRvData(data);
  }

  async function pullRemoteChanges() {
    const s = await ensureFreshSession(); if (!s) return;
    const st = await getSyncState();
    const since = st.lastPulledAt;
    const [bRows, cRows] = await Promise.all([fetchSince('bookmarks', since), fetchSince('categories', since)]);
    const data = await getRvData();
    data.bookmarks  = Core.applyRemoteList(data.bookmarks || [], bRows.map(rowToBookmark), 'id');
    data.categories = Core.applyRemoteList(data.categories || [], cRows.map(rowToCat), 'name');
    await setRvData(data);
    const newest = [...bRows, ...cRows].map(r => r.updated_at).sort().pop();
    if (newest) await setSyncState({ ...st, lastPulledAt: newest });
  }

  async function syncCycle() {
    try { await pushLocalChanges(); await pullRemoteChanges(); }
    catch (e) { console.warn('syncCycle failed (will retry):', e.message); }
  }
```
Add `pushLocalChanges, pullRemoteChanges, syncCycle, bookmarkToRow, rowToBookmark` to the export.

- [ ] **Step 2: Commit**

```bash
git add sync.js
git commit -m "feat(sync): push/pull cycle with field mapping"
```

---

## Task 2.5: Wire sync triggers in `background.js`

**Files:**
- Modify: `background.js`

- [ ] **Step 1: Add `syncPush`/`syncCycle` message actions**

After the `setSyncConfig` branch (Task 1.2), add:
```js
      } else if (request.action === 'syncPush') {
        if (await self.RvSync.isLoggedIn()) self.RvSync.syncCycle();
        sendResponse({ success: true });
      } else if (request.action === 'syncNow') {
        await self.RvSync.syncCycle();
        sendResponse({ success: true });
```

- [ ] **Step 2: Run a cycle on the alarm + startup**

In the alarm listener (Task 1.4), replace the `// Phase 2 adds: syncCycle();` comment with:
```js
    if (self.RvSync && self.RvSync.isLoggedIn) self.RvSync.syncCycle();
```
And in `onStartup`, add after `ensureFreshSession()`:
```js
  self.RvSync.syncCycle();
```

- [ ] **Step 3: Define `triggerPush()` referenced by `saveStorageData`**

Near `saveStorageData`, add:
```js
function triggerPush() { if (self.RvSync) self.RvSync.syncCycle(); }
```

- [ ] **Step 4: Wire the "Sync to Cloud" button + sync on list open in `list-modal.js`**

In `setupSettingsEventListeners`, add:
```js
  const syncNowBtn = document.getElementById('sync-now-btn');
  if (syncNowBtn) syncNowBtn.onclick = async () => {
    document.getElementById('sync-status').textContent = 'Syncing…';
    await chrome.runtime.sendMessage({ action: 'syncNow' });
    document.getElementById('sync-status').textContent = 'Synced ✓';
  };
```
At the end of the page's init (where data first loads), add:
```js
chrome.runtime.sendMessage({ action: 'syncPush' }).catch(() => {});
```

- [ ] **Step 5: Two-device manual test**

- Sign in on device A, add a bookmark, click "Sync to Cloud".
- Sign in on device B, open the list → within a cycle the bookmark appears.
- Edit on B, sync; refresh A → edit appears (LWW).
- Delete on A, sync; B → bookmark disappears (tombstone).

- [ ] **Step 6: Commit**

```bash
git add background.js list-modal.js
git commit -m "feat(sync): wire triggers, Sync to Cloud, two-device sync"
```

---

## Task 2.6: Transcript sync + first-run backfill (legacy → UUID)

**Files:**
- Modify: `sync.js`
- Modify: `rv-sync-core.js` + `rv-sync-core.test.js` (add `ensureUuid`)

- [ ] **Step 1: Write the failing test for `ensureUuid`**

Add to `rv-sync-core.test.js`:
```js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test rv-sync-core.test.js`
Expected: FAIL — `core.ensureUuid is not a function`.

- [ ] **Step 3: Implement `ensureUuid` in `rv-sync-core.js`**

Add inside the factory (and to the return object):
```js
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function ensureUuid(rec, genUuid) {
    if (rec.id && UUID_RE.test(rec.id)) return rec;
    return { ...rec, id: genUuid(), legacyId: rec.id };
  }
```
Return `{ stampRecord, mergeRecordLWW, applyRemoteList, ensureUuid }`.

- [ ] **Step 4: Run to verify pass**

Run: `node --test rv-sync-core.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Backfill on first sync in `sync.js`**

In `pushLocalChanges`, before computing `dirtyBookmarks`, convert any legacy-id bookmarks:
```js
    data.bookmarks = (data.bookmarks || []).map(b => {
      const conv = Core.ensureUuid(b, () => crypto.randomUUID());
      if (conv !== b) conv._dirty = true;   // newly-converted rows must push
      return conv;
    });
```

- [ ] **Step 6: Add transcript push/pull**

In `pushLocalChanges`, after categories, add transcript push:
```js
    const tr = (await chrome.storage.local.get('rvTranscripts')).rvTranscripts || {};
    const dirtyTr = Object.entries(tr).filter(([,v]) => v && v._dirty)
      .map(([video_id, v]) => ({ video_id, user_id: userId, raw: v.raw || null, formatted: v.formatted || null, updated_at: v.updatedAt, deleted_at: v.deletedAt || null }));
    if (dirtyTr.length) {
      await upsertRows('transcripts', dirtyTr);
      for (const [vid] of Object.entries(tr)) if (tr[vid] && tr[vid]._dirty) delete tr[vid]._dirty;
      await chrome.storage.local.set({ rvTranscripts: tr });
    }
```
In `pullRemoteChanges`, fetch + merge transcripts:
```js
    const trRows = await fetchSince('transcripts', since);
    if (trRows.length) {
      const tr = (await chrome.storage.local.get('rvTranscripts')).rvTranscripts || {};
      for (const r of trRows) {
        const local = tr[r.video_id];
        const remote = { raw: r.raw, formatted: r.formatted, updatedAt: r.updated_at, deletedAt: r.deleted_at || undefined };
        const winner = Core.mergeRecordLWW(local ? { ...local, updatedAt: local.updatedAt } : null, remote);
        if (winner === remote && r.deleted_at) delete tr[r.video_id];
        else if (winner === remote) tr[r.video_id] = remote;
      }
      await chrome.storage.local.set({ rvTranscripts: tr });
    }
```
Include transcript `updated_at` values when computing `newest` for the watermark.

- [ ] **Step 7: Manually verify backfill**

With existing legacy bookmarks present, sign in, click "Sync to Cloud", then:
```bash
curl -s "$SUPABASE_URL/rest/v1/bookmarks?select=id,legacy_id" -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer <access_token>"
```
Expected: rows with UUID `id` and populated `legacy_id`.

- [ ] **Step 8: Commit**

```bash
git add rv-sync-core.js rv-sync-core.test.js sync.js
git commit -m "feat(sync): legacy→UUID backfill + transcript sync"
```

---

## Task 2.7: Phase 2 Drift-Reconciliation

**Files:** none (review + targeted fixes)

- [ ] **Step 1:** Run `node --test` — all unit tests green.
- [ ] **Step 2:** Confirm the camelCase↔snake_case mapping covers every field actually present on real bookmarks (diff `bookmarkToRow` keys against a live `rvData.bookmarks[0]`). Add any missing field to both mapping functions + the `metadata` fallback.
- [ ] **Step 3:** Confirm `renderLinks()` filters `deletedAt` records (deleted bookmarks must not reappear in the UI).
- [ ] **Step 4:** Confirm the watermark (`lastPulledAt`) advances and a second `pullRemoteChanges()` with no new data is a cheap no-op (network tab shows a small/empty response).
- [ ] **Step 5:** Verify `Core` resolves in the service worker (`self.RvSyncCore` is defined because `rv-sync-core.js` is loaded — add `importScripts('rv-sync-core.js')` at the top of `background.js` if missing). Commit fixes: `git commit -m "chore(sync): phase 2 drift reconciliation"`.

---

# PHASE 3 — Settings Secret Encryption

Goal: sync settings (non-secret in plaintext JSONB, secrets encrypted client-side with a password-derived key) so they cross devices safely.

## Task 3.1: Crypto core + tests (KDF + AES-GCM round-trip)

**Files:**
- Modify: `rv-sync-core.js` + `rv-sync-core.test.js`

> WebCrypto (`crypto.subtle`) is available in Node ≥ 18 as `globalThis.crypto`, so these are testable under `node --test`.

- [ ] **Step 1: Write the failing test**

Add to `rv-sync-core.test.js`:
```js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test rv-sync-core.test.js`
Expected: FAIL — `core.deriveEncKey is not a function`.

- [ ] **Step 3: Implement crypto in `rv-sync-core.js`**

Add inside the factory:
```js
  function _b64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
  function _unb64(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
  const _enc = new TextEncoder(); const _dec = new TextDecoder();

  async function deriveEncKey(password, salt) {
    const baseKey = await crypto.subtle.importKey('raw', _enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: _enc.encode(salt), iterations: 200000, hash: 'SHA-256' },
      baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
  }
  async function encryptSecret(plaintext, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, _enc.encode(plaintext));
    return { ct: _b64(ct), iv: _b64(iv) };
  }
  async function decryptSecret(enc, key) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: _unb64(enc.iv) }, key, _unb64(enc.ct));
    return _dec.decode(pt);
  }
```
Add `deriveEncKey, encryptSecret, decryptSecret` to the return object.

- [ ] **Step 4: Run to verify pass**

Run: `node --test rv-sync-core.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add rv-sync-core.js rv-sync-core.test.js
git commit -m "feat(sync): PBKDF2 + AES-GCM secret encryption core with tests"
```

---

## Task 3.2: Derive + cache the encryption key at sign-in

**Files:**
- Modify: `sync.js`

- [ ] **Step 1: Generate/fetch the per-user salt and derive the key on sign-in**

In `sync.js`, add salt + key management:
```js
  const SALT_KEY = 'rvEncSalt';
  const ENCKEY_FLAG = 'rvEncReady';  // we cache the derived key in-memory per worker wake

  let _encKey = null;  // CryptoKey, in-memory only

  async function ensureSaltRow(userId) {
    // Fetch existing settings row; if no salt, create one.
    const res = await authedFetch(`/rest/v1/user_settings?user_id=eq.${userId}&select=enc_salt,data,secrets`, { method: 'GET' });
    const rows = res.ok ? await res.json() : [];
    if (rows.length && rows[0].enc_salt) return rows[0].enc_salt;
    const salt = crypto.randomUUID();
    await upsertRows('user_settings', [{ user_id: userId, enc_salt: salt, updated_at: new Date().toISOString() }]);
    return salt;
  }

  async function deriveKeyForSession(password) {
    const s = await getSession(); if (!s) return;
    const salt = await ensureSaltRow(s.user.id);
    await chrome.storage.local.set({ [SALT_KEY]: salt });
    _encKey = await self.RvSyncCore.deriveEncKey(password, salt);
  }
  function getEncKey() { return _encKey; }
```
Add `deriveKeyForSession, getEncKey` to the export.

- [ ] **Step 2: Derive the key inside `signIn`/`signUp`**

At the end of `signIn` (after `setSession(s)`), add:
```js
    try { await deriveKeyForSession(password); } catch (e) { console.warn('enc key derive failed:', e.message); }
```
Do the same at the end of `signUp` when a session is returned.

- [ ] **Step 3: Commit**

```bash
git add sync.js
git commit -m "feat(sync): derive + cache settings encryption key at sign-in"
```

> **Note (re-derivation after worker restart):** `_encKey` is in-memory and lost when the worker sleeps. Settings sync (Task 3.3) is best-effort: if `getEncKey()` is null, settings push/pull of *secrets* is skipped until the next sign-in derives it. Document this; a fuller solution (storing the wrapped key) is out of scope.

---

## Task 3.3: Settings push/pull (non-secret plaintext, secrets encrypted)

**Files:**
- Modify: `sync.js`

- [ ] **Step 1: Add settings sync**

In `sync.js`:
```js
  const SECRET_PATHS = [['llmGateway','apiKey'], ['ollama','cloudApiKey']];
  function getPath(o, p) { return p.reduce((x,k) => (x ? x[k] : undefined), o); }
  function setPath(o, p, v) { let x = o; for (let i=0;i<p.length-1;i++){ x[p[i]] = x[p[i]]||{}; x = x[p[i]]; } x[p[p.length-1]] = v; }

  async function pushSettings() {
    const s = await ensureFreshSession(); if (!s) return;
    const key = getEncKey();
    const data = await getRvData();
    const settings = JSON.parse(JSON.stringify(data.settings || {}));
    const secrets = {};
    if (key) {
      for (const path of SECRET_PATHS) {
        const val = getPath(settings, path);
        if (val) { secrets[path.join('.')] = await self.RvSyncCore.encryptSecret(val, key); setPath(settings, path, ''); }
      }
    } else {
      // no key: strip secrets entirely from the plaintext blob, leave server secrets untouched
      for (const path of SECRET_PATHS) setPath(settings, path, '');
    }
    const row = { user_id: s.user.id, data: settings, updated_at: new Date().toISOString() };
    if (key) row.secrets = secrets;
    await upsertRows('user_settings', [row]);
  }

  async function pullSettings() {
    const s = await ensureFreshSession(); if (!s) return;
    const res = await authedFetch(`/rest/v1/user_settings?user_id=eq.${s.user.id}&select=data,secrets`, { method: 'GET' });
    if (!res.ok) return;
    const rows = await res.json(); if (!rows.length) return;
    const remote = rows[0].data || {};
    const key = getEncKey();
    if (key && rows[0].secrets) {
      for (const path of SECRET_PATHS) {
        const enc = rows[0].secrets[path.join('.')];
        if (enc) { try { setPath(remote, path, await self.RvSyncCore.decryptSecret(enc, key)); } catch (e) { /* keep local secret */ } }
      }
    }
    const data = await getRvData();
    // Merge: remote settings win for non-secret fields; preserve local secrets if we couldn't decrypt.
    data.settings = { ...data.settings, ...remote };
    await setRvData(data);
  }
```
Add `pushSettings, pullSettings` to the export. Call them inside `syncCycle`:
```js
  async function syncCycle() {
    try {
      await pushLocalChanges(); await pushSettings();
      await pullRemoteChanges(); await pullSettings();
    } catch (e) { console.warn('syncCycle failed (will retry):', e.message); }
  }
```

- [ ] **Step 2: Two-device manual test**

- Device A: enter an API key in settings, save, sign in, sync.
- Device B: sign in (same password) → open settings → API key is present (decrypted).
- Verify on the server the key is ciphertext:
```bash
curl -s "$SUPABASE_URL/rest/v1/user_settings?select=secrets" -H "apikey: $ANON" -H "Authorization: Bearer <token>"
```
Expected: `secrets` contains `{ct,iv}` blobs, not the plaintext key.

- [ ] **Step 3: Commit**

```bash
git add sync.js
git commit -m "feat(sync): settings sync with client-side encrypted secrets"
```

---

## Task 3.4: Phase 3 Drift-Reconciliation

**Files:** none (review + targeted fixes)

- [ ] **Step 1:** `node --test` green (9 tests).
- [ ] **Step 2:** Confirm the server `user_settings.data` never contains plaintext API keys (inspect the row). If a key leaked into `data`, fix the `SECRET_PATHS` stripping.
- [ ] **Step 3:** Confirm behavior when `getEncKey()` is null after a worker restart: non-secret settings still sync; secrets are preserved locally and not clobbered. 
- [ ] **Step 4:** Confirm `openSettings()`/`saveSettings()` read/write the decrypted in-memory settings (the user sees their real key). Commit fixes: `git commit -m "chore(sync): phase 3 drift reconciliation"`.

---

# PHASE 4 — Backup / Restore Update

Goal: versioned export; merge-based restore that accepts both legacy (`rv-...`, no version) and v2 (UUID) files, with dedupe + LWW, then syncs the result up.

## Task 4.1: Backup-format detection + merge core + tests

**Files:**
- Modify: `rv-sync-core.js` + `rv-sync-core.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `rv-sync-core.test.js`:
```js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test rv-sync-core.test.js`
Expected: FAIL — `core.detectBackupVersion is not a function`.

- [ ] **Step 3: Implement in `rv-sync-core.js`**

```js
  function detectBackupVersion(backup) { return backup && backup.version ? backup.version : 1; }

  // Merge incoming backup bookmarks into existing, dedupe by id|legacyId|url, LWW.
  function mergeBackupBookmarks(existing, incoming, genUuid) {
    const byId = new Map(existing.map(b => [b.id, b]));
    const byLegacy = new Map(existing.filter(b => b.legacyId).map(b => [b.legacyId, b]));
    const byUrl = new Map(existing.filter(b => b.url).map(b => [b.url, b]));
    for (const raw of incoming) {
      const inc = ensureUuid(raw, genUuid);
      let match = byId.get(inc.id) || (inc.legacyId && byLegacy.get(inc.legacyId)) || (inc.url && byUrl.get(inc.url));
      if (match) {
        const winner = mergeRecordLWW(match, inc);
        if (winner === inc) { Object.assign(match, inc, { id: match.id, _dirty: true }); }
      } else {
        inc._dirty = true;
        byId.set(inc.id, inc);
        if (inc.legacyId) byLegacy.set(inc.legacyId, inc);
        if (inc.url) byUrl.set(inc.url, inc);
      }
    }
    return Array.from(byId.values());
  }
```
Add `detectBackupVersion, mergeBackupBookmarks` to the return object.

- [ ] **Step 4: Run to verify pass**

Run: `node --test rv-sync-core.test.js`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add rv-sync-core.js rv-sync-core.test.js
git commit -m "feat(backup): versioned detection + merge-LWW restore core"
```

---

## Task 4.2: Versioned export + merge restore in `list-modal.js`

**Files:**
- Modify: `list-modal.js` (`exportData` ~line 1223; `importData` ~line 1237)

- [ ] **Step 1: Versioned export**

Replace `exportData` (lines 1223-1235). Change the `data` line:
```js
  const data = { bookmarks, categories, transcripts };
```
to:
```js
  const data = { version: 2, exportedAt: new Date().toISOString(), bookmarks, categories, transcripts };
```

- [ ] **Step 2: Merge-based restore**

Replace the body of `importData`'s `try` block (lines 1245-1264) with:
```js
      const text = await file.text();
      const backupData = JSON.parse(text);
      if (!backupData || typeof backupData !== 'object') throw new Error('Invalid backup file format');
      const ver = RvSyncCore.detectBackupVersion(backupData);

      if (Array.isArray(backupData.bookmarks)) {
        bookmarks = RvSyncCore.mergeBackupBookmarks(bookmarks, backupData.bookmarks, () => crypto.randomUUID());
      }
      if (Array.isArray(backupData.categories)) {
        const migrated = migrateCategoriesFormat(backupData.categories);
        const map = new Map(categories.map(c => [c.name, c]));
        migrated.forEach(c => { if (!map.has(c.name)) map.set(c.name, { ...c, _dirty: true, updatedAt: new Date().toISOString() }); });
        categories = Array.from(map.values());
      }
      if (backupData.transcripts && typeof backupData.transcripts === 'object') {
        const cur = (await chrome.storage.local.get('rvTranscripts')).rvTranscripts || {};
        for (const [vid, t] of Object.entries(backupData.transcripts)) {
          const stamped = { ...t, updatedAt: t.updatedAt || new Date().toISOString(), _dirty: true };
          const local = cur[vid];
          cur[vid] = RvSyncCore.mergeRecordLWW(local, stamped);
        }
        await chrome.storage.local.set({ rvTranscripts: cur });
      }
      await saveData();                 // stamps + triggers push
      renderCategories();
      renderLinks();
      showToast(`✅ Restored (v${ver}) and syncing…`, 'success');
```

- [ ] **Step 3: Manual test — restore a legacy backup**

- Take an **old** `rv-backup-*.json` (legacy `rv-...` ids, no `version`).
- Restore it → bookmarks appear, no duplicates on a second restore of the same file.
- Confirm new server rows have UUID `id` + `legacy_id` after the post-restore sync.
- Restore a **v2** file → merges by UUID, LWW respected.

- [ ] **Step 4: Commit**

```bash
git add list-modal.js
git commit -m "feat(backup): versioned export + merge-LWW restore (legacy compatible)"
```

---

## Task 4.3: Phase 4 Drift-Reconciliation + full-system pass

**Files:** none (review + targeted fixes)

- [ ] **Step 1:** `node --test` — all 13 tests green.
- [ ] **Step 2:** Full two-device acceptance run (spec §11): sign-in both devices; add/edit/delete propagates; offline edit then reconnect reconciles; restore legacy backup → no dupes → syncs up; API key crosses devices encrypted.
- [ ] **Step 3:** Confirm a logged-**out** user still has the original local-only experience (no errors, no blocked writes).
- [ ] **Step 4:** Confirm `RvSyncCore` is available in every context that calls it (service worker via `importScripts`, `list-modal.html`/`popup.html` via `<script>`).
- [ ] **Step 5:** Commit any fixes: `git commit -m "chore(sync): phase 4 drift reconciliation + full-system pass"`.

---

## Self-Review Notes (plan author)

**Spec coverage check:**
- §1 goals 1-5 → Phases 0-4. ✓
- §4 data model → Task 0.2 (`db/schema.sql`). ✓
- §5 auth/persistent login → Phase 1 (Tasks 1.1-1.4). ✓
- §6 secret encryption (password-derived key) → Phase 3. ✓
- §7 sync engine (dirty/watermark/LWW/tombstones/triggers) → Phase 2. ✓
- §8 backup/restore (versioned, merge-LWW, legacy→UUID) → Phase 4. ✓
- §9 rollout (dual-write/backfill/cloud-first) → Tasks 2.2/2.5/2.6. ✓
- §10 error handling (fail-soft, re-login, decrypt failure) → `syncCycle` try/catch, `ensureFreshSession` null path, Task 3.3 decrypt guards. ✓
- §11 testing → `node --test` units + per-phase manual checklists. ✓
- Out-of-scope (vector search, Vercel, Edge Functions, RLHF) → not planned. ✓

**Known simplifications (intentional, documented inline):**
- `saveData`/`saveStorageData` stamp every record dirty on each save (over-marks; push is idempotent).
- Encryption key is in-memory per worker wake; secret sync is best-effort until next sign-in re-derives it.
- Tombstone purge is "drop locally once pushed"; server-side tombstone GC is deferred.
