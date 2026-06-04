# Spaces — Design Specification

Date: 2026-06-04
Status: Approved (brainstormed and signed off by the user; this document is the implementation contract)
Component: ReVisit Chrome extension (Manifest V3)

---

## 1. Overview / Goal

ReVisit today has a single, flat workspace: one global category list (`rvData.categories`) and one undivided bookmark collection (`rvData.bookmarks`). As a user accumulates bookmarks across unrelated contexts (e.g. Work, Personal, a specific project), the single category sidebar and single list become crowded and lose meaning.

**Spaces** introduce a top-level container above categories. A *Space* is a named bucket (e.g. "Work", "Personal", "Project Phoenix"). **Every bookmark belongs to exactly one Space.** Categories become **scoped per Space** — each Space owns its own category list, so "Articles" in *Work* is a distinct category from "Articles" in *Personal*. The user works in one Space at a time: the list page, the category sidebar, and the create overlay all operate within the currently selected Space.

The hard architectural constraint is the existing sync engine. `rvData` (`{ bookmarks, categories, settings }`) is mirrored to Supabase via a flat, per-record last-write-wins (LWW) engine keyed on `updatedAt` with `deletedAt` soft-delete tombstones (`rv-sync-core.js` + `sync.js`). The whole `settings` object syncs as one blob into `user_settings.data` (`sync.js:329-375`). Therefore Spaces must be expressed as flat, independently-synced records, and any genuinely per-installation state must live **outside** `rvData` so it never syncs. This spec splits Spaces into a synced definition layer and a local (installation-private) selection layer.

---

## 2. Terminology

- **Space** — a top-level container that owns a scoped category list and a set of bookmarks. Identified by a stable UUID string `id`. One reserved id, `"default-space"`, is used by migration only. Synced.
- **enabled (here)** — a Space is *available on this installation* if its id is in `rvLocal.enabledSpaceIds`. Enabled is a per-install choice; it is NOT synced. A Space can exist (synced) but be disabled on a given browser.
- **default (here)** — the single Space (`rvLocal.defaultSpaceId`) that this installation starts from when **creating** a bookmark and as the fallback when **opening** the list. Per-install, NOT synced. Exactly one default per installation.
- **last-used (list)** — `rvLocal.lastUsedListSpaceId`, the Space the list page was last viewing on this installation. Per-install, NOT synced. Drives where the list re-opens; does NOT affect create.

---

## 3. Data Model

### 3.1 Synced — lives in `rvData`, propagates to all installations

The existing sync engine only ever reads/writes the `rvData` key (`sync.js:252` `getRvData`, `sync.js:253` `setRvData`). Anything added to `rvData` syncs. Three changes:

**3.1.1 `rvData.spaces` (new array)**

Each element:

```
{
  id: string,        // stable UUID (crypto.randomUUID()); reserved value "default-space" for migration
  name: string,      // user-facing label, e.g. "Work"
  priority: number,  // integer display order (1 ranks highest), mirrors category priority semantics
  updatedAt: string, // ISO-8601, LWW stamp
  deletedAt: string  // ISO-8601 tombstone, or absent/undefined when live
}
```

Identity key for sync = `id`. Stamped/merged by the same machinery as bookmarks (`RvSyncCore.stampChangedList(prev, next, 'id', now)`, `RvSyncCore.applyRemoteList(local, remote, 'id')`). The local save paths must be taught to persist and stamp this new array — see Section 4.4.

**3.1.2 `rvData.categories` becomes Space-scoped**

Each element gains `spaceId`:

```
{
  spaceId: string,   // owning Space id
  name: string,      // category name, unique WITHIN its spaceId
  priority: number,
  updatedAt: string,
  deletedAt: string  // tombstone or absent
}
```

Category **identity becomes the composite `(spaceId, name)`**. Today identity is `name` alone — see `background.js:643` (`stampChangedList(..., 'name', ...)`), `list-modal.js:647`, `sync.js:299` (`applyRemoteList(..., 'name')`). All of these change to the composite key (Section 4.3).

**3.1.3 `rvData.bookmarks[]` gains `spaceId`**

The single-bookmark shape (`background.js:841-855`) gains one field:

```
spaceId: string   // the Space this bookmark belongs to (exactly one)
```

All other bookmark fields are unchanged (`id, url, title, category, summary, tags, userNotes, addedTimestamp, revisitBy, status, history, isPreliminary, isYouTube, updatedAt, deletedAt`). Bookmark sync identity stays `id`.

### 3.2 Local — NEW top-level key `rvLocal`, NEVER synced

A new `chrome.storage.local` key `rvLocal`, sibling to `rvData` and `rvTranscripts`. Because the sync engine touches only `rvData`, `rvLocal` is installation-private by construction — no flag, no filter, no opt-out needed.

```
rvLocal = {
  enabledSpaceIds: string[],     // Space ids available on THIS install
  defaultSpaceId: string,        // the ONE default Space id on THIS install
  lastUsedListSpaceId: string    // Space id the list last viewed on THIS install
}
```

Invariants:
- `defaultSpaceId` MUST be a member of `enabledSpaceIds`.
- `lastUsedListSpaceId`, when present, SHOULD be a member of `enabledSpaceIds`; if it is missing or points to a disabled/nonexistent Space, the list falls back to `defaultSpaceId`.
- Every id in `enabledSpaceIds` MUST reference a live (non-tombstoned) Space in `rvData.spaces`.

### 3.3 Single-default behavior (precise)

There is exactly ONE `defaultSpaceId` per installation. Two distinct rules:

- **List open** uses `rvLocal.lastUsedListSpaceId ?? rvLocal.defaultSpaceId`. Every time the user switches Space in the list header, the new id is written to `rvLocal.lastUsedListSpaceId`. The list therefore re-opens where the user left off.
- **Create** ALWAYS starts from `rvLocal.defaultSpaceId` and **ignores** `lastUsedListSpaceId`. The create overlay's Space selector is pre-set to `defaultSpaceId`; the user may override it at the final save. Overriding at save does NOT change `defaultSpaceId`.

### 3.4 Rejected alternative (recorded by request)

Nesting each Space's categories inside its Space object (e.g. `space.categories = [...]`) was considered and **rejected**. It fights the flat, per-record LWW sync engine: a nested array inside one Space record would make a single category edit re-stamp and LWW-overwrite the entire Space (and all its categories) as one unit, losing per-category merge granularity across devices. Keeping `categories` a flat top-level list with a `spaceId` field is the smaller, safer change. The only sync-core consequence is that the category identity/merge key goes from `name` to the composite `spaceId + " " + name` (Section 4.3).

---

## 4. Cloud Schema & Sync Changes

### 4.1 `db/schema.sql` — DDL deltas

**bookmarks** (`db/schema.sql:7-25`): add one column.

```sql
alter table public.bookmarks add column if not exists space_id text;
```

**categories** (`db/schema.sql:30-37`): add `space_id`, backfill, then re-key the PK. The current PK is `primary key (user_id, name)` (`db/schema.sql:36`). Migration ordering is mandatory — add column and backfill BEFORE altering the PK, so no existing row violates the new key during the change:

```sql
-- 1) add the column (nullable first so existing rows are valid)
alter table public.categories add column if not exists space_id text;

-- 2) backfill every existing row into the reserved migration bucket
update public.categories set space_id = 'default-space' where space_id is null;

-- 3) enforce non-null now that all rows have a value
alter table public.categories alter column space_id set not null;

-- 4) swap the primary key from (user_id, name) to (user_id, space_id, name)
alter table public.categories drop constraint categories_pkey;
alter table public.categories add constraint categories_pkey primary key (user_id, space_id, name);
```

**spaces** (new table), mirroring the shape and LWW columns of `categories`/`transcripts`:

```sql
create table if not exists public.spaces (
  id          text not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text,
  priority    int,
  updated_at  timestamptz not null,
  deleted_at  timestamptz,
  primary key (user_id, id)
);
create index if not exists spaces_user_updated on public.spaces (user_id, updated_at);
```

**RLS** (`db/schema.sql:60-75`): add `spaces` to the table list in the policy loop so it gets the same `rls_select` (`user_id = auth.uid()`) and `rls_modify` (`using (user_id = auth.uid()) with check (user_id = auth.uid())`) policies as the other four tables. The RLS *shape* is unchanged.

### 4.2 `sync.js` — row mappers and push/pull

Add a Space mapper pair, mirroring `catToRow`/`rowToCat` (`sync.js:247-250`):

```js
function spaceToRow(s, userId) {
  return { id: s.id, user_id: userId, name: s.name, priority: s.priority,
           updated_at: s.updatedAt || new Date().toISOString(), deleted_at: s.deletedAt || null };
}
function rowToSpace(r) {
  return { id: r.id, name: r.name, priority: r.priority,
           updatedAt: r.updated_at, deletedAt: r.deleted_at || undefined };
}
```

`bookmarkToRow` (`sync.js:222-238`) adds `space_id: b.spaceId ?? null`; `rowToBookmark` (`sync.js:239-246`) adds `spaceId: r.space_id ?? undefined`. (Every column must remain present with a non-undefined value per the PGRST102 note at `sync.js:223-228` — use `?? null`.)

`catToRow` (`sync.js:247`) adds `space_id: c.spaceId`; `rowToCat` (`sync.js:250`) adds `spaceId: r.space_id`.

`pushLocalChanges` (`sync.js:257-291`): after the bookmark/category pushes, push dirty spaces, mirroring the category dirty-filter (`sync.js:272`) and upsert (`sync.js:274`):

```js
const dirtySpaces = (data.spaces || []).filter(s => s._dirty);
if (dirtySpaces.length) await upsertRows('spaces', dirtySpaces.map(s => spaceToRow(s, userId)));
```

and clear their `_dirty` flags alongside categories (`sync.js:287`).

`pullRemoteChanges` (`sync.js:290-322`): add `spaces` to the parallel `fetchSince` batch (`sync.js:294-296`) and apply by `id`:

```js
data.spaces = Core.applyRemoteList(data.spaces || [], sRows.map(rowToSpace), 'id');
```

and include the spaces rows' `updated_at` in the watermark computation (`sync.js:312`).

### 4.3 Composite category identity (the one sync-core change)

Category merge/identity moves from `name` to the composite `spaceId + " " + name`. The space character is a safe separator because Space ids are UUIDs (no spaces). Concretely:

- `background.js:643`: `stampChangedList(prev.categories, data.categories, /* key */ catKey, now)`.
- `list-modal.js:647`: same change.
- `sync.js:299`: `applyRemoteList(data.categories, cRows.map(rowToCat), /* key */ catKey)`.

`RvSyncCore.stampChangedList` and `applyRemoteList` (`rv-sync-core.js:25,45`) currently take a single string property name as `key` and do `r[key]`. To support a composite, change the contract so `key` may be a function `(record) => string`; when a string is passed it behaves as today (`r[key]`), when a function is passed it is called as `key(r)`. The category callers pass `c => c.spaceId + ' ' + c.name`. Bookmark callers keep passing `'id'`; the new Space callers pass `'id'`. This is the only `rv-sync-core.js` behavior change required.

`mergeBackupBookmarks` (`rv-sync-core.js:102-120`) is unaffected (still id/legacyId/url keyed). Backup category merge in `list-modal.js:1337-1342` changes to key its `Map` on the composite `(spaceId, name)` instead of `name`.

### 4.4 Local save layer must persist and stamp `spaces`

The sync layer (4.2) only pushes/pulls what `saveData()` has already written into `rvData` and stamped `_dirty`. Today neither save path knows about `spaces`, so both must be extended or every "writes `rvData.spaces` via `saveData()`" instruction below is a no-op:

- **`list-modal.js`.** The module-level state vars (`list-modal.js:2-4`: `bookmarks`, `categories`, `settings`) gain a `let spaces = [];`, hydrated from `rvData.spaces` wherever `bookmarks`/`categories` are loaded. `saveData()` (`list-modal.js:647-648`) currently stamps `bookmarks`/`categories` and writes `{ rvData: { bookmarks, categories, settings } }`; it must also stamp spaces — `spaces = RvSyncCore.stampChangedList(prev.spaces || [], spaces, 'id', now);` — and write `{ rvData: { bookmarks, categories, settings, spaces } }`.
- **`background.js`.** The `saveStorageData` save path (`background.js:635-648`, stamp block at `background.js:642-643`) that stamps `data.bookmarks`/`data.categories` must add `data.spaces = self.RvSyncCore.stampChangedList(prev.spaces || [], data.spaces || [], 'id', now);` before `chrome.storage.local.set({ rvData: data })` (`background.js:645`), so Space records created/edited on the background side (e.g. during migration) also stamp and push.
- **`getRvData` default shape.** `sync.js:252` returns `{ bookmarks: [], categories: [], settings: {} }` when `rvData` is absent; add `spaces: []` so pull/push never read `undefined.spaces`.

Spaces are stamped by `'id'` (same identity key as bookmarks), never the composite category key.

---

## 5. UI: Spaces Manager (slide-in panel)

A new **Spaces** section is added to the settings modal (`list-modal.html`, settings modal at lines ~107-322), placed adjacent to the existing Backup & Restore (`list-modal.html:281-288`) and Categories (`list-modal.html:291-314`) sections. The section contains a single **"Manage Spaces"** button. Clicking it slides a panel in from the **right edge** of the viewport, overlaying the settings modal. A close affordance (× or "Done") slides it back out.

The panel has two clearly separated, labelled zones:

### 5.1 Zone A — "Your Spaces" (synced definitions; writes `rvData.spaces` and `rvData.categories`)

- **List of Spaces** sorted by `priority` (1 first), each row showing name, priority, and a bookmark count for that Space.
- **Create** a Space: name input + add button. Generates `id = crypto.randomUUID()`, assigns `priority = max(existing priority) + 1`, stamps via `saveData()` (which calls `stampChangedList`, so the new Space pushes). Model the add interaction on `handleAddCategory` (`list-modal.js:1276-1305`).
- **Rename** a Space: edit the `name` in place; saved via `saveData()`.
- **Reorder by priority**: numeric priority inputs and/or drag-and-drop, modelled on the category priority/drag handlers (`list-modal.js:1195-1274`): `handleCategoryPriorityInput`/`handleCategoryPriorityChange` and `handleDragStart/Over/Drop/...`.
- **Delete** a Space: see Section 5.3 (must prompt for the fate of its bookmarks).
- **Selecting a Space reveals ITS categories.** The existing global Categories settings UI (`renderCategoriesSettings` `list-modal.js:1148-1189`, plus the add/priority/drag handlers `list-modal.js:1195-1305`, and the markup at `list-modal.html:291-314`) **moves into this panel** and becomes per-Space. Categories are no longer a global settings section. The per-Space category editor filters `categories` to the selected `spaceId`, and every create/rename/reorder/delete it performs writes that `spaceId`. Counts (`bookmarks.filter(b => b.category === catName)` at `list-modal.js:1157`) become `bookmarks.filter(b => b.spaceId === selectedSpaceId && b.category === catName)`.

### 5.2 Zone B — "This Installation" (writes `rvLocal` ONLY; never `rvData`)

- A **checkbox per Space** = "available here" → toggles membership in `rvLocal.enabledSpaceIds`.
- A **radio (or single-select)** across Spaces = "default here" → sets `rvLocal.defaultSpaceId`. Only one may be selected.
- Constraint enforcement: the Space currently set as default cannot be unchecked from "available here" without first choosing a different default; the UI must keep `defaultSpaceId ∈ enabledSpaceIds` at all times (Section 3.2 invariant).
- All Zone B writes go to `rvLocal` via `chrome.storage.local.set({ rvLocal })`. They do NOT call `saveData()` and do NOT stamp anything — they must never enter `rvData`.

### 5.3 Space-delete prompt (no silent orphans)

Deleting a Space MUST first resolve the fate of every bookmark whose `spaceId` is that Space (and that Space's categories). The delete action opens a confirmation prompt offering:

1. **Reassign** all of the Space's bookmarks to another (chosen) Space — set their `spaceId` to the target, then tombstone the deleted Space and its categories. Reassigned bookmarks keep their `category` string as-is (the target Space simply gains those category values; create the missing category rows under the target `spaceId` if absent).
2. **Soft-delete** all of the Space's bookmarks — set `deletedAt`/`updatedAt` on each (standard tombstone), then tombstone the Space and its categories.

Only after the user picks an option is the Space tombstoned (`deletedAt` set, `saveData()` to stamp + push). If the deleted Space was `rvLocal.defaultSpaceId` or was enabled, prune it from `rvLocal` and force a per-install setup if no valid default remains (Section 8). The flow must never leave a bookmark pointing at a tombstoned/nonexistent Space.

---

## 6. UI: Selectors

### 6.1 List page header selector

A Space selector is added to the list page header/filter bar. It lists **only enabled Spaces** (`rvLocal.enabledSpaceIds`) — there is no "All Spaces" view (Section 11). One Space is shown at a time.

On load, the list opens on `rvLocal.lastUsedListSpaceId ?? rvLocal.defaultSpaceId` (Section 3.3). Switching the selector:

1. writes the new id to `rvLocal.lastUsedListSpaceId`;
2. re-scopes the **category sidebar** — `renderCategories` (`list-modal.js:227-249`) filters `categories` to the active `spaceId`, and its per-category counts (`list-modal.js:242`) become `bookmarks.filter(b => b.spaceId === activeSpaceId && b.category === catName)`;
3. re-scopes the **list** — `renderLinks` (`list-modal.js:257-314`) adds `if (b.spaceId !== activeSpaceId) return false;` to its filter chain (`list-modal.js:261-270`), alongside the existing `deletedAt`/category/status/search filters;
4. resets the in-memory `selectedCategory` to `'All'` for the new Space (the view-state vars at `list-modal.js:5-8` remain non-persisted; only `lastUsedListSpaceId` is persisted, in `rvLocal`).

### 6.2 Create overlay selector (content.js)

The create overlay (`content.js`, overlay built around `content.js:919`; existing category autocomplete `#rv-category` input + `#rv-category-list` at `content.js:932-942`) gains a **Space selector** above the Category field.

- The selector is pre-set to `rvLocal.defaultSpaceId` (the overlay must read `rvLocal` in addition to `rvData`; today it reads only `rvData.categories` at `content.js:900-903`). It lists enabled Spaces.
- Changing the Space repopulates the category autocomplete source: the existing-categories list (`content.js:901-906`) is filtered to the selected `spaceId` before being offered as suggestions.
- The **preliminary** bookmark is created in `background.js` (`background.js:841-855`) stamped with `rvLocal.defaultSpaceId` — `background.js` must read `rvLocal` (it currently reads only `rvData` via `getStorageData` `background.js:617-632`). Add `spaceId: <defaultSpaceId>` to the `preliminaryBookmark` object.
- The **final save** writes whatever the overlay's Space selector shows. The `updateBookmark` path (`background.js:972-1012`) sets the bookmark's `spaceId` from the submitted data, and when adding a brand-new category (`background.js:988-1000`) it creates that category under the submitted `spaceId` (not the global list).

---

## 7. Onboarding — required Spaces step

A new **Spaces step** is inserted into BOTH onboarding paths, immediately before each path completes / navigates to `list-modal.html`. Onboarding CANNOT complete without at least one Space AND a default set on this install.

### 7.1 "Have account" gate path (`onboarding.js:196-231`, `handleGateSignIn`)

Today this path signs in → `syncNow` → sets `onboardingComplete = true` (`onboarding.js:222`) → navigates to `list-modal.html` (`onboarding.js:226`). Insert the Spaces step **after the sync round-trip** (so any Spaces that synced down are visible) and **before** setting `onboardingComplete` / navigating:

- If `rvData.spaces` is non-empty (synced down) → the user picks which Spaces are **enabled here** and chooses the **default here** (writes `rvLocal`); they may also create more Spaces (writes `rvData.spaces`).
- If `rvData.spaces` is empty → the user must create at least one Space (writes `rvData.spaces`) and it becomes enabled + default (writes `rvLocal`).
- Only once `rvLocal.enabledSpaceIds.length >= 1` and `rvLocal.defaultSpaceId` is set may the path proceed to set `onboardingComplete = true` and navigate.

### 7.2 Five-step wizard path (`onboarding.js:233-300+`, `completeOnboarding`)

The wizard's step machinery is `nextStep`/`prevStep`/`updateStepIndicator` (`onboarding.js:22-44`) with `currentStep`. Add a Spaces step before `completeOnboarding` builds and writes the fresh `rvData`:

- The wizard's current **`initial-categories`** field (`onboarding.js:235-246`, the comma-split category names) becomes **the first Space's categories**. Concretely, `completeOnboarding` creates the first Space (`id = crypto.randomUUID()`, the name the user gives it in the Spaces step) and stamps every category built from `initial-categories` with that `spaceId` (the `categories.map(... { name, priority })` at `onboarding.js:243-246` gains `spaceId`).
- The fresh `rvData` (`onboarding.js:270+`) gains a `spaces: [ <first space> ]` array and each category carries `spaceId`.
- `rvLocal` is written: `enabledSpaceIds = [firstSpaceId]`, `defaultSpaceId = firstSpaceId`, `lastUsedListSpaceId = firstSpaceId`.
- The wizard cannot finish unless a Space exists and a default is set.

### 7.3 Rationale (recorded by request)

`onboardingComplete` lives in `settings` and **syncs** (it is part of the `user_settings.data` blob, `sync.js:329-375`). A second browser that already has `onboardingComplete = true` pulled down would otherwise skip onboarding and never get per-install Space config. This is acceptable because **every fresh install logs in through an onboarding path**, and this Spaces step doubles as the per-installation setup gate — it always runs and always writes `rvLocal`, regardless of the synced `onboardingComplete` flag. (The upgrade gate in Section 8 is the backstop for installs that bypass onboarding, e.g. an already-signed-in browser updated in place.)

---

## 8. Upgrade & Per-Install Setup Gate

On every list-page load (`list-modal.html` / list bootstrap), before rendering, check `rvLocal`:

> If `rvLocal.defaultSpaceId` is missing, OR points to a Space that is tombstoned/nonexistent in `rvData.spaces`, OR is not present in `rvLocal.enabledSpaceIds` — this installation is not set up. Run setup.

Setup has the **same UI** (the Spaces step / Spaces manager flow), in two flavors determined by `rvData.spaces`:

### 8.1 Flavor A — Migration (pre-Spaces user): `rvData.spaces` is EMPTY

This is an existing user who upgraded; their `rvData.bookmarks` and `rvData.categories` have no Space info. Show a **Migration modal**:

- Bucket ALL existing categories and bookmarks into the reserved Space id `"default-space"` (Section 10).
- The user **names** that Space (e.g. "My Bookmarks"); the name is stored on the `"default-space"` record, but the **id stays `"default-space"`** so two browsers cannot fork the migration bucket.
- The user confirms it is the default (it is auto-selected as default + enabled); they may add more Spaces.
- Push via the normal sync path; **nothing is lost** — every existing bookmark and category simply gains `spaceId = "default-space"`.

### 8.2 Flavor B — Second-browser per-install setup: `rvData.spaces` is NON-EMPTY but no local config

A second browser that has already synced Spaces down but has no valid `rvLocal`. Lighter setup:

- The user picks **enabled** Spaces and a **default** from the already-synced `rvData.spaces`.
- **No data is mutated** — only `rvLocal` is written. Bookmarks, categories, and Spaces are untouched.

After either flavor, `rvLocal` satisfies the gate invariants (Section 3.2) and the list renders.

---

## 9. Backup & Restore

### 9.1 Backup — version 3

`exportData` (`list-modal.js:1307-1319`) currently emits `{ version: 2, exportedAt, bookmarks, categories, transcripts }`. Bump to **version 3**:

```
{
  version: 3,
  exportedAt: <ISO>,
  spaces:     rvData.spaces,              // Space DEFINITIONS (id, name, priority, updatedAt, deletedAt)
  bookmarks:  rvData.bookmarks,           // each carries spaceId
  categories: rvData.categories,          // each carries spaceId
  transcripts: rvTranscripts              // unchanged
}
```

Backups include Space **definitions** but DELIBERATELY EXCLUDE per-install `rvLocal` (`enabledSpaceIds`, `defaultSpaceId`, `lastUsedListSpaceId`) — those are installation-private and must not travel between installs via a file (Section 11). The help text at `list-modal.html:283` ("Settings are not backed up") remains accurate and should be extended to note Spaces definitions ARE included.

### 9.2 Restore

`importData` (`list-modal.js:1321-1362`) branches on `RvSyncCore.detectBackupVersion` (`rv-sync-core.js:99`, returns `backup.version || 1`).

- **v3 file** → merge `spaces` (by `id`, LWW), Space-scoped `categories` (by composite `(spaceId, name)`, LWW — update the `Map` key at `list-modal.js:1339` to `c.spaceId + ' ' + c.name`), and spaced `bookmarks` (via `mergeBackupBookmarks`, unchanged). After merge, **auto-enable** the restored Spaces on the current install (add their ids to `rvLocal.enabledSpaceIds`); if the install has no `defaultSpaceId` yet, set it to one of the restored Spaces.
- **v≤2 legacy file** (no Space info) → **PROMPT** the user before importing: pick an EXISTING Space, OR type a NEW Space name (created inline → new `id`, added to `rvData.spaces` + `rvLocal.enabledSpaceIds`). Assign that target `spaceId` to ALL imported bookmarks and ALL imported categories before merging. This guarantees no v≤2 bookmark or category lands without a Space.

In both cases, restore still ends with `saveData()` (stamps + triggers push, `list-modal.js:1352`) and a re-render of the (now Space-scoped) sidebar and list.

---

## 10. Migration

Triggered by Section 8.1 (Flavor A) when `rvData.spaces` is empty on an existing install.

- **Reserved-id bucketing.** Create one Space record `{ id: "default-space", name: <user-chosen>, priority: 1, updatedAt: now }` in `rvData.spaces`. Set `spaceId = "default-space"` on every existing bookmark in `rvData.bookmarks` and on every existing category in `rvData.categories`. Stamp all touched records via `saveData()` so they push.
- **Idempotency across two browsers.** Because the bucket id is the hard-coded constant `"default-space"` (NOT a fresh UUID), if Browser A migrates and pushes, and Browser B independently runs migration before pulling, both produce the **same** Space id and the same `spaceId` on their records. LWW then converges them instead of creating two rival "default" Spaces. The cloud `categories` backfill (Section 4.1, step 2) uses the same `"default-space"` literal, so server-side and client-side migration agree.
- **What data is touched.** Only `spaceId` is added to existing bookmarks/categories, and one Space record is created; `rvLocal` is set to `{ enabledSpaceIds: ["default-space"], defaultSpaceId: "default-space", lastUsedListSpaceId: "default-space" }`. No bookmark content, category name, priority, history, or transcript is modified or deleted. Nothing is lost.

---

## 11. Out of Scope / Non-Goals (YAGNI)

- **No multi-Space-per-bookmark.** A bookmark has exactly one `spaceId`.
- **No "All Spaces" combined list view.** The list always shows exactly one Space.
- **No per-install config in backups.** Backups carry Space definitions only; never `rvLocal`.
- **No Space colors, icons, or descriptions.** Space definitions stay minimal: `id`, `name`, `priority` (plus the sync stamps `updatedAt`/`deletedAt`).
- **No nested-category data model.** Categories stay a flat top-level list keyed by `(spaceId, name)` (Section 3.4).
- **No cross-Space move UI for individual bookmarks** beyond what the delete-reassign flow (5.3) and create/edit selectors (6) already provide.

---

## 12. Success Criteria (reviewer checklist)

A reviewer can verify each of these:

1. `rvData.spaces` exists as a flat array of `{ id, name, priority, updatedAt, deletedAt }`; `rvData.categories` entries carry `spaceId`; `rvData.bookmarks` entries carry `spaceId`.
2. `rvLocal` exists as a separate top-level key with exactly `{ enabledSpaceIds, defaultSpaceId, lastUsedListSpaceId }`, and grepping the sync path confirms the engine reads/writes only `rvData` (and `rvTranscripts`) — never `rvLocal`.
3. `db/schema.sql` has `bookmarks.space_id`, `categories.space_id` with PK `(user_id, space_id, name)`, a `spaces` table with PK `(user_id, id)`, and `spaces` is included in the RLS loop.
4. `sync.js` has `spaceToRow`/`rowToSpace`, pushes/pulls `spaces` by `id`, maps `space_id ↔ spaceId` on bookmarks and categories, and uses the composite `(spaceId, name)` key for category merge.
4a. Both local save paths persist and stamp `spaces`: `list-modal.js` `saveData()` writes `{ ..., spaces }` and stamps it by `'id'`; `background.js` `saveStorageData` stamps `data.spaces` by `'id'`; `getRvData`'s default shape includes `spaces: []` (Section 4.4).
5. Category stamp/merge keys at `background.js:643`, `list-modal.js:647`, and `sync.js:299` use the composite key; `rv-sync-core.js` `stampChangedList`/`applyRemoteList` accept a function key.
6. The settings modal has a Spaces section with a "Manage Spaces" button that opens a right-edge slide-in panel with two zones; the global Categories section has moved into the panel and is per-Space.
7. Deleting a Space prompts to reassign-or-soft-delete its bookmarks; no bookmark is ever left pointing at a tombstoned/nonexistent Space.
8. The list header has a Space selector listing only enabled Spaces; switching re-scopes both sidebar and list and writes `lastUsedListSpaceId`; there is no "All Spaces" view.
9. The create overlay shows a Space selector pre-set to `defaultSpaceId`, repopulates the category autocomplete on Space change, and the preliminary bookmark created in `background.js` carries `defaultSpaceId`; final save writes the selector's Space.
10. Both onboarding paths run a Spaces step before completing; neither can finish without ≥1 Space and a default; the wizard's `initial-categories` become the first Space's categories.
11. On list load, a missing/invalid `rvLocal.defaultSpaceId` triggers setup: Flavor A (migration into `"default-space"`) when `rvData.spaces` is empty, Flavor B (pick enabled + default, no data mutated) when it is non-empty.
12. Backup is `version: 3` with `spaces` + spaced bookmarks/categories and NO `rvLocal`; v3 restore merges + auto-enables; v≤2 restore prompts for a target Space and assigns it to all imported records.
13. Migration buckets into the literal id `"default-space"` and is idempotent across two browsers (same id on both); only `spaceId` is added to existing records — nothing is lost.

---

## 13. Key Risks

- **Categories-become-Space-scoped blast radius (primary risk).** Changing category identity from `name` to `(spaceId, name)` touches every category consumer at once: the list sidebar render and counts (`list-modal.js:227-249`), the list filter (`list-modal.js:257-270`), the create-overlay category autocomplete source (`content.js:900-906`), the new-category-on-save path (`background.js:988-1000`), the category settings editor (`list-modal.js:1148-1305`, moving into the Spaces panel), the local stamp keys (`background.js:643`, `list-modal.js:647`), the remote merge key (`sync.js:299`), the backup category merge (`list-modal.js:1337-1342`), and the cloud PK (`db/schema.sql:36`). Any consumer missed will mis-merge categories across Spaces (e.g. "Articles" in Work and Personal collapsing into one row, or a category appearing under the wrong Space). Every site in this list must be updated together.
- **`rvLocal` leakage into `rvData`.** If any Zone-B write, onboarding step, or migration accidentally stuffs `enabledSpaceIds`/`defaultSpaceId`/`lastUsedListSpaceId` into `rvData` (or into `settings`, which is a single synced blob, `sync.js:329-375`), per-install state would sync and one browser would override another's enabled/default choices. Keep all per-install writes on the `rvLocal` key only.
- **Composite-key function-key contract change in `rv-sync-core.js`.** Allowing `key` to be a function in `stampChangedList`/`applyRemoteList` is a core-engine change; a regression here breaks bookmark and transcript sync too, since they share the same functions. The function/string branch must preserve the exact existing string behavior for `'id'` callers.
- **Cloud PK migration ordering.** The `categories` PK swap (Section 4.1) must add+backfill+set-not-null `space_id` BEFORE dropping/adding the PK; doing it out of order leaves rows that violate `(user_id, space_id, name)` and the `alter` fails. The backfill literal and the client migration literal must both be exactly `"default-space"`.
- **Bookmarks without a `spaceId`.** Any code path that creates a bookmark (preliminary at `background.js:841-855`, final save at `background.js:972-1012`, legacy/v≤2 import at `list-modal.js:1321-1362`) must set `spaceId`, or a bookmark becomes invisible (it matches no Space-scoped list). The migration and v≤2 restore prompt are the safety nets that guarantee no record is left Space-less.
