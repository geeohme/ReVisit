# Onboarding: login-first sync + Ollama config

**Date:** 2026-06-03
**Status:** Approved (design)

## Problem

The onboarding wizard (`onboarding.html` / `onboarding.js`) always walks a new
user through a 5-step setup (Name → Categories → Defaults → Gateway key →
Provider/model). It has no awareness of cloud accounts: a returning user who
reinstalls the extension is forced to re-enter everything by hand even though
their bookmarks, categories, and (encrypted) keys already live in Supabase.

Onboarding also never collects Ollama configuration, so a user who relies on
local or cloud Ollama must open Settings after onboarding to add it.

## Goals

1. **Login-first.** At the very start, ask whether the user already has an
   account. If yes, let them sign in; on success, sync their cloud data (with a
   visible progress indication) and skip the entire rest of onboarding.
2. **Ollama in onboarding.** Collect Ollama details during onboarding — local
   Ollama defaulting to off with an empty URL, and a populatable Ollama Cloud
   key — using the *same* logic as the Settings panel (shared function).
3. **Synced data displays.** After a login-driven sync, the ReVisit list must
   show the existing categories and saved bookmarks that were pulled down.

## Non-goals

- No change to `sync.js` / `background.js` auth or `syncCycle` internals. Progress
  is shown as staged status messages driven by the onboarding page, not by
  instrumenting the sync engine for per-record percentages.
- No redesign of the existing onboarding steps beyond inserting the account step
  and the Ollama fields.
- No new backup/restore, no new Supabase schema.

## Background (current behavior)

- `popup.js` opens `onboarding.html` when `settings.onboardingComplete` is false.
- `onboarding.js` is a 5-step wizard. `completeOnboarding()` writes `rvData`
  (with `onboardingComplete: true`) to `chrome.storage.local` and redirects to
  `list-modal.html`.
- `onboarding.html` currently loads **only** `onboarding.js`.
- Auth runs through `background.js` message handlers, which already have
  `RvSync` (from `sync.js`) loaded in the service worker:
  - `setSyncConfig { url, anonKey }` → `RvSync.setConfig`
  - `authSignIn { email, password }` → `RvSync.signIn` (derives the secret
    encryption key from the password, so synced secrets decrypt). The
    background message listener wraps every handler in a try/catch that returns
    `{ success: false, error: <message> }` on a thrown error
    (`background.js:1392`), so callers test `res.success` and read `res.error`
    — exactly the pattern `list-modal.js` `handleAuth()` already uses
    (`list-modal.js:746-747`).
  - `authStatus` → `{ loggedIn, email }`
  - `syncNow` → `RvSync.syncCycle()` (push + pull bookmarks, categories,
    transcripts, settings; pulled rows are written into `rvData`)
- The Supabase URL / anon key are currently hard-coded and registered only by
  `list-modal.js` on load (lines ~1398-1402). Onboarding never sets them, so
  sign-in from onboarding would fail until config is registered.
- `list-modal.js` `init()` reads `rvData` and calls `renderCategories()` +
  `renderLinks()`, and `migrateCategoriesFormat()` normalizes legacy category
  shapes. A background pull also live-refreshes the open list via a
  `storage.onChanged` listener.
- Ollama settings are built inline inside `saveSettings()` in `list-modal.js`
  (≈ lines 1132-1142): local enabled only when a URL is present, cloud enabled
  only when a key is present, `modelsLastUpdated` preserved.

## Design

### Component 1 — Shared Ollama settings builder

Add to `utils.js` (loaded today by `list-modal.html` and `background.js`; this
change additionally loads it in `onboarding.html`, making it the one script
shared by both pages):

```js
/**
 * Build the canonical `settings.ollama` object from raw field values.
 * Local is enabled only when a URL is provided; cloud only when a key is
 * provided. `prevModelsLastUpdated` preserves the existing timestamp.
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

- Export it alongside the existing CommonJS exports for tests.
- `list-modal.js` `saveSettings()` replaces its inline object with
  `settings.ollama = buildOllamaSettings(localUrl, cloudKey, settings.ollama?.modelsLastUpdated)`.
- `onboarding.js` `completeOnboarding()` calls the same helper.

**Contract:** identical input → identical `settings.ollama` shape in both
entry points. Pure function, no DOM/storage access, unit-testable.

> **Prerequisite ordering:** the Ollama input elements
> (`#ollama-local-url`, `#ollama-cloud-api-key`) do **not** exist in
> `onboarding.html` today — they're only in `list-modal.html`. Component 5 (add
> the HTML fields) is therefore a prerequisite of using the helper in
> `completeOnboarding()`; if the read runs before the fields exist,
> `document.getElementById(...)` returns `null` and the helper would receive
> `undefined`/`null` (still safe — it coerces to empty/disabled — but the user's
> input would be silently ignored). Implement the HTML fields and the read
> together.

### Component 2 — Supabase config bootstrap (shared constants)

The Supabase URL / anon key are duplicated if pasted into onboarding. To keep a
single source of truth, expose them from a shared place. Minimal approach:
keep the constants where they are in `list-modal.js`, and in `onboarding.js`
register config via the same background message before any sign-in:

```js
const SUPABASE_URL = 'https://supabase.generationai.cloud';
const SUPABASE_ANON_KEY = '...'; // same anon key as list-modal.js
await chrome.runtime.sendMessage({ action: 'setSyncConfig', url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY });
```

These must match `list-modal.js` exactly. (A later cleanup could move them into
`utils.js`; out of scope here to avoid touching `list-modal.js` more than
needed. If the implementer finds it cleaner, defining
`RV_SUPABASE = { url, anonKey }` in `utils.js` and consuming it from both pages
is acceptable and preferred — but both pages must then use it.)

### Component 3 — Account gate (pre-wizard screen)

To satisfy "ask at the very beginning" **without** renumbering the existing 5
steps (which the Risks section flags as an off-by-one hazard), the account
screen is a **gate shown before the numbered wizard**, not a renumbered step 1.

A new `#account-gate` `<div>` in `onboarding.html` is the only screen visible on
load; the existing `#step-1`…`#step-5` wizard and its 5-dot indicator are hidden
behind it (the wizard container starts hidden, or the gate sits above it and the
wizard's first step is only activated when the user chooses "No, I'm new").

The gate contains:
- Heading + prompt: *"Do you already have a ReVisit account?"*
- Two buttons: **Yes, sign in** and **No, I'm new**.
- A hidden login sub-panel (revealed by "Yes, sign in"):
  - email input, password input
  - **Sign In** button
  - a **Back** link returning to the Yes/No choice
  - a status area (`#account-sync-status`) for staged messages

Behavior:
- **No, I'm new** → hide the gate, show the wizard at `#step-1`
  (`currentStep = 1`). The existing 5 steps, their dot indicator, and all
  `next-btn-N`/`prev-btn-N` handlers are **unchanged** — zero renumbering.
- **Yes, sign in** → reveal the login sub-panel (gate stays; wizard never shown
  on the success path because we redirect away).

This keeps `nextStep()`'s `if (currentStep < 5)` bound and every existing step ID
exactly as-is.

### Component 4 — Login + staged sync flow (`onboarding.js`)

On **Sign In** click:

1. Validate email + password present (inline error in status area otherwise).
2. Status: *"Signing in…"*.
3. `setSyncConfig` (idempotent), then `authSignIn { email, password }`.
4. On failure: the `sendMessage` resolves to `{ success: false, error }` (the
   background catch, not a rejected promise — see Background). Wrap the call in
   try/catch anyway (a truly dropped message would reject), then show
   `❌ <res.error || e.message>` in the status area and keep the user on the
   account step. They can retry or click "No, I'm new". **No forced fallback**
   into the rest of onboarding.
5. On success — **strict ordering** (the `onboardingComplete` write must happen
   *after* `syncNow` resolves, never before, so a pulled settings record can't
   clobber it via `pullSettings`'s `{ ...local, ...remote }` merge):
   - Status: *"Downloading your data…"*.
   - `await syncNow` → awaits `syncCycle()` (push + `pullRemoteChanges` +
     `pullSettings`). This writes pulled bookmarks / categories / settings into
     `rvData`.
   - **Then** read back `rvData`, set `settings.onboardingComplete = true`, and
     persist via `chrome.storage.local.set({ rvData })`. Because `syncNow` is
     only triggered manually here, no further pull runs after this write, so the
     flag survives.
   - Status: *"Done ✓"*.
   - Redirect to `list-modal.html`.

The staged messages are simple text swaps (with the existing
`.loading-message`-style styling or a small spinner). No percentage bar.

**Edge cases:**
- Sign-up of a brand-new account is *not* offered here (onboarding is the
  sign-up path for new users — they click "No, I'm new"). Only existing-account
  sign-in is offered.
- Unconfirmed email / bad credentials surface as the background error string.
- Network failure surfaces the thrown error; user stays on the step.
- **Encryption-key network dependency (known limitation).** `signIn` derives the
  secret key via `deriveKeyForSession(password)`, which calls `ensureSaltRow` —
  an authenticated round-trip to `user_settings` (`sync.js:152,161-169`). On a
  fresh install there's no local key yet. `signIn` wraps this in try/catch
  (`sync.js:71`), so a transient failure still logs the user in, but
  `pullSettings` will then keep the (empty) local secrets rather than decrypting
  the cloud ones — the gateway / Ollama-cloud keys won't populate and the user
  would re-enter them in Settings. This is acceptable for v1; we do not add
  retry/repair here, but the implementer should not assume secrets are always
  decrypted post-login.

### Component 5 — Ollama fields in the AI Config step

In the existing AI-config step of `onboarding.html` (the gateway-key step), add
an **Ollama (optional)** block mirroring the Settings UI:

- **Local Ollama URL** — empty by default, placeholder `http://localhost:11434`,
  help text "Leave blank to disable local Ollama."
- **Ollama Cloud API Key** — password input, empty by default, help text
  "API key for Ollama Cloud (ollama.com). Leave blank to disable."

No "Test Connection" / "Refresh Models" buttons required in onboarding (kept
lean); the user can do that later in Settings. `completeOnboarding()` reads the
two fields and sets `data.settings.ollama = buildOllamaSettings(localUrl, cloudKey)`.

### Component 6 — Display synced data in the list

No functional change required: `list-modal.js` `init()` already renders from
`rvData`, and `migrateCategoriesFormat()` handles legacy category arrays. The
key requirement is **ordering**: the onboarding login flow must `await` the
`syncNow` round-trip (so `rvData` is populated) *before* redirecting. The
list-page bootstrap additionally fires a `syncPush` on load, and the
`storage.onChanged` listener live-refreshes — so even a late-arriving pull will
render. Verification step confirms categories + bookmarks appear.

## Data flow

```
New user:
  popup → onboarding.html (step 1 account)
        → "No, I'm new" → steps 2..6 → completeOnboarding()
        → rvData{ onboardingComplete:true, ollama:buildOllamaSettings(...) }
        → list-modal.html → renders local (empty) data

Returning user:
  popup → onboarding.html (step 1 account)
        → "Yes, sign in" → setSyncConfig → authSignIn
        → syncNow (syncCycle pulls bookmarks/categories/settings into rvData)
        → set onboardingComplete:true → persist
        → list-modal.html → init() renders pulled categories + bookmarks
```

## Files touched

| File | Change |
|------|--------|
| `utils.js` | Add `buildOllamaSettings()`; export it. |
| `onboarding.html` | Add account gate (choice + login + status) shown before the wizard; add Ollama fields to AI-config step (`#step-4`); add `<script src="utils.js">` before `onboarding.js`. No step renumbering. |
| `onboarding.js` | Account-gate wiring (choice, sign-in, staged sync, set `onboardingComplete`, redirect); Supabase config bootstrap; read Ollama fields via `buildOllamaSettings` in `completeOnboarding()`. Existing step logic unchanged. |
| `list-modal.js` | `saveSettings()` uses `buildOllamaSettings()` instead of the inline object. |
| `utils.test.js` (new, optional) | Unit tests for `buildOllamaSettings()`. |

## Testing

- **Unit:** `buildOllamaSettings()` — empty inputs → both disabled, empty
  strings, null timestamp; URL only → local enabled, cloud disabled; key only →
  cloud enabled; whitespace trimmed; `prevModelsLastUpdated` preserved.
- **Manual / verification:**
  1. New-user path: "No, I'm new" → complete wizard with an Ollama URL → confirm
     `settings.ollama.localEnabled === true` and list opens.
  2. Returning-user path (real account): "Yes, sign in" → staged messages →
     list opens showing previously-synced categories and bookmarks.
  3. Bad-credentials path: error shown, stays on account step, "No, I'm new"
     still works.
  4. Parity: Ollama saved via onboarding produces the same `settings.ollama`
     shape as saving via Settings.

## Risks

- **Constant drift:** Supabase URL/anon key duplicated across two files; mitigated
  by (preferred) sharing via `utils.js`, or by an explicit note to keep them in
  sync.
- **Step renumbering bugs:** avoided entirely — the account screen is a gate
  before the wizard (Component 3), so the existing 5 steps, IDs, dot indicator,
  and handlers are untouched.
- **Race on redirect:** redirecting before `syncNow` resolves would show an empty
  list; mitigated by awaiting `syncNow` and relying on the storage live-refresh
  listener as a backstop.
