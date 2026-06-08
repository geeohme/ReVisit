# ReVisit — Next-Phase Implementation Spec

> **Purpose.** This is the executable handoff for the **next conversation**. Phase 1
> (the zero-logic-risk foundation) is **done and on branch `ui-foundation-themes`**
> (see "Phase 1 — shipped" below). This doc specs Phases 2–4: the interaction fixes
> that make the product's name true, plus the capture/onboarding/settings work.
>
> **Guardrail (unchanged).** Do not touch the cloud-sync path or the stored data
> shape of `rvData` / `rvLocal`. Every item below is tagged: **[CSS]** pure
> presentation · **[WIRE]** connect an existing background endpoint · **[MINOR]**
> small local logic on existing fields · **[FLOW]** a multi-screen flow. None
> require new sync logic or schema changes.
>
> **How to start the next session:** `git checkout ui-foundation-themes`, read this
> file + `01-walkthrough.md` + `02-recommendations.md`, then execute phase by phase
> with verification (load the extension unpacked, or serve + drive with a chrome
> stub) after each.

---

## Phase 1 — shipped (context, do not redo)

Branch `ui-foundation-themes`, files: `styles.css`, `theme.js` (new),
`manifest.json`, `list-modal.html`, `list-modal.js`, `onboarding.html`.

- **Tri-scheme token system.** `styles.css` `:root` now defines 3 schemes
  (`paper` / `quiet` / `system`) × light/dark, all mapped onto the **existing**
  variable names, plus `--font-ui` / `--font-display` / `--color-primary-contrast`.
- **`theme.js`** (loaded in `<head>` of list + onboarding; in `web_accessible_resources`)
  is the single source of truth: persists `rvScheme` (default `paper`) + `rvTheme`
  (default `light`) in localStorage, applies `data-scheme`/`data-theme` to `<html>`,
  migrates the legacy `theme` key, exposes `window.RvTheme`, fires `rv-theme-change`.
- **Appearance section** in Settings: scheme picker + light/dark + live swatch
  preview; the header dark toggle + both selects stay in sync.
- **Settings de-slopped:** the hardcoded-light CSS + duplicate `.settings-overlay`
  are gone; everything is token-driven, the Bootstrap rainbow is collapsed to one
  accent, emoji section headers → inline SVG line icons, header action buttons +
  spaces-panel inputs are now styled.
- **A11y baseline:** `:focus-visible` rings, `prefers-reduced-motion`, `.sr-only`,
  `aria-live` toast, `aria-label`s; search placeholder copy fixed (U24).
- **Verified** in-browser across all 3 schemes × light/dark (screenshots in
  `design-review/screenshots/foundation/`).

**Still untouched (intentionally deferred to below):** the bookmark list rows, the
detail/edit overlay, the capture card (`content.js`), the popup (`popup.html`),
onboarding's step content (the curl block / triple-provider step), and all
interaction logic.

---

## Phase 2 — Make the name true (the core fixes) — ✅ SHIPPED (commit `2e9c79d`)

> Done: wired action model (Revisited/Snooze/Done/Delete via `saveData()`'s LWW+push
> path — no background message needed), due chips + Overdue/Today/This week/Later/
> Someday buckets, 2-line summary preview + favicon + category chip on rows, sort
> control (Due/Added/Updated/Title/Category) and a sidebar tag filter. Verified across
> all 3 schemes. **Start the next session at Phase 3.** Original spec retained below.


### 2.1 Wired ReVisit action model **[WIRE]** 🔴
**Why:** the row "ReVisit ↗" button only `window.open`s; the date-driven engine in
`background.js` is built but never called (see `revisit-orphaned-engine` /
walkthrough U18).
**Do:**
- In `list-modal.js` `renderLinks()` (~`:296`), replace the single inline‑styled
  button with: **title/row click = Open** (`window.open`) and an **actions cluster**
  — a primary **Open** + a kebab `⋮` menu: **Revisited — remind again**, **Snooze ▸**
  (Tomorrow / Next week / Next month), **Done**, **Delete**.
- Wire each to the EXISTING background handler:
  - Revisited → `chrome.runtime.sendMessage({action:'updateBookmarkStatus', bookmarkId, actionType:'ReVisited'})` (`background.js:1187` advances `revisitBy` by `defaultIntervalDays`, sets `Active`, logs history).
  - Done → same message, `actionType:'Complete'` (`background.js:1178`).
  - Snooze → **[MINOR]** add an optional `newRevisitBy` to that handler (or set `revisitBy` locally then `saveData()` — reuse the existing per-record stamp path in `saveData`, `list-modal.js:654`). Do **not** add new sync code.
- After the action, re-`renderLinks()` / `renderCategories()` (storage.onChanged already live-refreshes, `:101`).
**Acceptance:** clicking Revisited moves the item's date forward and it leaves the
"overdue" group; Done moves it to the Done/Complete filter; the ReVisited filter tab
finally has contents; no sync regressions (verify a logged-in push still fires).

### 2.2 Due state on every row + time buckets **[CSS]** + **[MINOR]** 🟠
**Why:** "Priority View" is 3 invisible buckets (U19).
**Do:**
- Compute a relative due label from `revisitBy` (reuse/extend `getPriorityScore`,
  `:1635`): `Overdue Nd` / `Due today` / `Due in Nd` / `Someday` (null date).
- Render a **due chip** + a **left color rail** on each row (danger/warn/accent/faint).
  Tokens already exist (`--color-danger/-warning/-primary/-light-text`).
- Replace the Priority/Date toggle with **grouping** into **Overdue / Today / This
  week / Later / Someday** sections in `renderLinks()` (presentation only on existing
  data). Keep a "flat by date" option.
**Acceptance:** matches the mockups' list; no item is un-grouped; null-date items
appear under Someday.

### 2.3 Summary preview in the list **[CSS]** 🟠
Render a 2-line clamp of `bookmark.summary` under the title in `renderLinks()`
(field already exists). Add favicon dot + category chip to the row.
**Acceptance:** the gist is readable without opening the overlay (U22).

### 2.4 Real sort + filter bar + tag filter **[CSS]** 🟠
- Add a toolbar above the list: **Sort** (Due ▾ default, Date added, Recently
  updated, Title, Category) — all sort the existing in-memory array.
- Add a **Tag filter** (the sidebar already has a "Tags" slot in the mockups); filter
  `bookmarks` by selected tag(s). Tags already captured (U25).
**Acceptance:** sorting + tag filter work; search placeholder already fixed.

---

## Phase 3 — Capture & dialogs

### 3.1 Optional revisit date + quick chips **[MINOR]** 🔴
**Why:** capture throws on empty date (U13, `content.js:1120`).
**Do:** guard the `new Date(value).toISOString()` — if empty, store `revisitBy = null`
(Someday). Add quick chips (Tomorrow / This week / Next month / Pick date / No
reminder) that set the date field. Mirror the same chips in the detail overlay.
**Acceptance:** a bookmark saves with no date and lands in Someday; no exception.

### 3.2 Capture card + detail overlay polish **[CSS]**
- Theme `content.js` `OVERLAY_STYLES` to read the saved scheme (it can read
  `localStorage`/`chrome.storage`; at minimum swap its hardcoded Inter/blue palette
  to the Paper&Ink tokens + serif fallback so the default brand matches; keep its
  `prefers-color-scheme` dark).
- Give **Notes** a Zoom button to match Summary (U14, `content.js:976`).
- Detail overlay (`list-modal.html` `#detail-overlay`): add an **open-the-page**
  link, group metadata, calmer markdown edit affordance (V15/V16).

### 3.3 In-app dialogs replace native confirm/prompt **[MINOR]** 🟠
Replace `window.confirm` (unsaved-changes `:331/:360`, delete `:641`) and the
`window.prompt` Space-delete (`:1265`, type "reassign"/"delete") with a themed
`<dialog>`/overlay helper (radio choice for reassign-vs-delete). Promise-based so the
existing call sites `await` it. **No data/sync change.**

---

## Phase 4 — Onboarding & settings flow **[FLOW]**

### 4.1 Onboarding on rails
Rebuild onboarding to the 3-screen flow in `mockups/onboarding-a-paper-ink.html`:
one path; starter-Space **template chips** instead of the comma string; AI step
**optional** with the curl behind a "How do I get a key?" link + a **Skip** button;
one default model with an "Advanced — per task" disclosure. **Writes the same
storage keys in the same shape** (`completeOnboarding`/gate code in `onboarding.js`).

### 4.2 Tabbed settings + global model default **[CSS]** + **[MINOR]**
Reorganize the settings modal into tabs (Appearance / AI / Account / Spaces / Data).
Add a **global default model** with optional per-task overrides. Make the in-app
**Test Connection real** by reusing the working `testGatewayConnection` message
(replace the mock at `list-modal.js:196-211`, U7). **[WIRE]**

### 4.3 Popup theming **[CSS]**
`popup.html` is still its own white/emoji menu — point it at the tokens + line icons
so the very first surface matches.

---

## Suggested order & checkpoints

1. **2.1 + 2.2** together (the headline fix) → verify the action model end-to-end.
2. **2.3 + 2.4** (triage polish).
3. **3.1** (capture date) → **3.3** (dialogs) → **3.2** (capture/detail polish).
4. **4.2 + 4.3**, then **4.1** (largest).

Verify after each checkpoint by loading the unpacked extension (or serving + a
`chrome` stub) and confirming: a real bookmark renders, the action menu moves dates,
dark mode + all 3 schemes hold, and a logged-in sync push still fires. Keep each
phase a separate commit on `ui-foundation-themes` (or child branches).

## Risk notes
- The only **[WIRE]** points are existing `background.js` handlers — confirm message
  names/shapes against `background.js` before sending.
- `getPriorityScore` (`list-modal.js:1635`) is the single place to extend for due
  labels — keep it pure.
- Do not alter `saveData()`'s per-record LWW stamping (`:654`) or `rv-sync-core` —
  that's the sync contract.
