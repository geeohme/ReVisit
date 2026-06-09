# ReVisit Feature Batch — Design Spec

**Date:** 2026-06-08
**Status:** Approved, ready for implementation planning
**Scope:** A batch of UI/UX and capability improvements to the ReVisit Chrome extension, grouped into 3 self-contained, independently-shippable phases. Per-domain rules are explicitly **deferred** to a separate future spec.

---

## Background: questions answered

Two of the user's items were questions about current behavior. Answers (grounded in code) informed the design:

### Bookmark statuses
Code today defines `Active`, `Complete`, `Deleted`, and a **vestigial** `ReVisited`:
- **Active** — awaiting revisit; has a `revisitBy` date (set on save, `background.js:860`).
- **Complete** — finished; set on Open/Done (`list-modal.js:536,555`).
- **Deleted** — soft-delete tombstone, hidden (`list-modal.js:563`).
- **ReVisited** — a filter chip exists (`list-modal.html:49`) but **no bookmark is ever stored with this status**. The "Revisited — remind again" action just resets status to `Active` and pushes `revisitBy` out (`background.js:1187-1191`). The chip is therefore dead.

**Decision:** Make `ReVisited` a *real* status (see Phase 1.3).

### Flat list vs Grouped view
- **Grouped (default)** — groups bookmarks under due-date buckets *Overdue → Today → This week → Later → Someday* with per-header counts (`list-modal.js:317-346`). Active only when sort = "due".
- **Flat list** — one continuous list in sort order, no headers (`list-modal.js:319-321`).
- The "Priority View" button toggles between them.

**Decision:** Grouped view gains explicit bucket-nav buttons to make grouping legible (Phase 1.9).

---

## Shared data-model deltas

These small schema additions are introduced in the earliest phase that needs them, so each phase remains independently shippable.

| Field / setting | Shape | Default | Introduced in |
|---|---|---|---|
| `category.color` | hex string `#RRGGBB` | from a fixed palette, assigned on category create / first render | Phase 1 (consumed by avatars), picker UI added in Phase 2 |
| `bookmark.letterColor` | optional hex string | unset (inherits category color) | Phase 1 |
| `bookmark.status` value `ReVisited` | existing enum gains real member | — | Phase 1 |
| `settings.defaultIntervalDays` | `number \| null` (`null` = None) | `7` | Phase 2 (control); model already exists as number |
| `settings.capturePopupPosition` | one of 9-grid presets (`center`,`top-left`,`top-center`,`top-right`,`mid-left`,`mid-right`,`bottom-left`,`bottom-center`,`bottom-right`) | `center` | Phase 3 |

`category.color` is space-scoped just like the category record (`(spaceId, name)` key). All new fields participate in the existing LWW sync stamping (`_dirty`, `updatedAt`) where they live on synced records (`rvData`).

---

## Phase 1 — List page: header, statuses, tags, detail popup, avatars, grouped-nav

**Files:** `list-modal.html`, `list-modal.js`, `styles.css`; small change in `background.js` (real ReVisited status).

1. **Logo in header.** Place `icons/ReVisit Logo.png` immediately before the "ReVisit" text in the upper-left logo block (`list-modal.html:18`, `.logo` CSS `styles.css:223-229`).

2. **Move Spaces dropdown to upper-left.** Relocate `#space-selector` (`list-modal.html:32`) to sit directly after the logo. Keep `renderSpaceSelector()` / `onSpaceSelectorChange()` behavior unchanged (`list-modal.js:1500-1518`).

3. **Status chips: reorder + default All + real ReVisited.**
   - Chip order becomes: **All** (first, default-selected) · **To revisit** (`Active`) · **Revisited** (`ReVisited`) · **Done** (`Complete`) (`list-modal.html:47-52`).
   - `statusFilter` initializes to `'All'` (`list-modal.js:13`).
   - Make `ReVisited` real: the "remind again" action sets `status = 'ReVisited'` and pushes `revisitBy` out by the default interval, instead of resetting to `Active` (`background.js:1187-1191`, mirror any client-side path in `list-modal.js:543`).
   - **Semantics:** `Active` = never cycled yet; `ReVisited` = snoozed/cycled at least once (still has a future `revisitBy`). Due-bucket grouping uses `revisitBy` and works for both.

4. **Click any tag → filtered list.** Clicking a tag anywhere (bookmark card tags, detail-popup tags) sets `selectedTag` to that tag and shows the list filtered to it, scrolling the list into view. Reuse existing `selectedTag` filter (`list-modal.js:10,411-444`). Tags on cards must be rendered as clickable elements (currently tags render only in the detail overlay + sidebar; add card-level tag chips wired to the same handler).

5. **Detail popup zoom for Summary & Notes.** Add a zoom affordance to `#detail-summary` and `#detail-notes` (`list-modal.html:136-140`) that expands the field into a large overlay, **editable in zoom mode**. Reuse the existing markdown editor (`setupMarkdownEditor`, `list-modal.js:657-860`) and the zoom pattern already present in the capture popup (`content.js` summary/notes zoom buttons). Edits in zoom persist back to the field and save with the overlay.

6. **Switch space from detail popup.** Add a Space `<select>` to the detail overlay, populated only with this install's **enabled** spaces (`rvLocal.enabledSpaceIds`). Changing it reassigns `bookmark.spaceId`, marks `_dirty`, and saves. Mirror the capture popup's `#rv-space` selector approach.

7. **Category-letter avatars with color.** Replace host-first-letter avatar with **category first letter**:
   - Letter = first char (uppercase) of the bookmark's category name; fall back to host first letter when uncategorized (preserves current behavior for category-less bookmarks).
   - Color = `bookmark.letterColor` if set, else the category's `color`, else deterministic palette fallback. Update `faviconLetter()` / `faviconColor()` (`list-modal.js:367-376`) and the row render (`list-modal.js:463-465`).
   - Per-bookmark override: a color swatch in the detail overlay sets `bookmark.letterColor`.
   - Introduce `category.color` here with palette defaults (the Phase 2 picker edits it).

8. **Multi-select bulk actions.** Add a selection mode to the list: per-row checkboxes (or a "Select" toggle) and a bulk-action bar with **Delete**, **Move to space**, and **Move to category**. Move targets are scoped to enabled spaces; "Move to category" lists categories of the destination space. Operations mark affected bookmarks `_dirty` and save once.

9. **Grouped-view bucket nav.** When Grouped mode is active, render a row of bucket buttons — **Overdue · Today · This week · Later · Someday** — each showing its count (from `DUE_BUCKETS`, `list-modal.js:340-346`). Clicking a button scrolls to / focuses that bucket's section header. Empty buckets render dimmed (or hidden). The button row is hidden in Flat mode.

---

## Phase 2 — Settings: reorg + Categories/Tags management

**Files:** `list-modal.html`, `list-modal.js`, `styles.css`.

1. **Tab order.** Reorder `SETTINGS_TABS` (`list-modal.js:1003-1009`) to: **Account · AI · Appearance · Spaces · Data**.

2. **Categories & Tags as two tabs with shared search.** Replace the current categories pop-over (`.settings-cats-layer`, `list-modal.html:396-425`) with a two-tab panel inside the Spaces tab: **Categories | Tags**. Above the two tabs sits a single **search bar + Clear button** (clear sits immediately after the input). Behavior:
   - The search term persists when toggling between Categories and Tags (not erased on toggle).
   - The active tab's list is filtered live by the search term.
   - Clear empties the search and restores both lists.
   - Categories list reuses `renderCategoriesSettings()` (`list-modal.js:1724-1775`), now also showing each category's color swatch (item 6). Tags list is derived from the union of tags across bookmarks in scope.

3. **Default revisit interval control (with None).** Add a control in the **Appearance** tab bound to `settings.defaultIntervalDays`, accepting a number or **None** (`null`). When `null`, saves create bookmarks with no `revisitBy`. Update save paths that read `defaultIntervalDays` to treat `null` as "no reminder" (`background.js:859,1189`).

4. **Delete category (incl. non-empty).** Extend `deleteCategory()` (`list-modal.js:1779-1790`, currently empty-only) to support non-empty deletion via a reassign dialog mirroring the Space-delete flow (`onDeleteSpace`, `list-modal.js:1609-1667`): reassign the category's bookmarks to another category (or clear their category), then tombstone the category.

5. **Delete tag.** Add a delete action in the Tags tab that removes the tag string from every bookmark in scope, marking each `_dirty`, then saves.

6. **Per-category color picker.** In the Categories tab, each category row gets a color picker bound to `category.color` (the field introduced in Phase 1). Changing it updates avatars for all that category's bookmarks (unless a bookmark has a `letterColor` override).

---

## Phase 3 — Capture flow

**Files:** `content.js`, `background.js`.

1. **Summarize-only → ReVisit this page.** Add a flow that summarizes without pre-saving a bookmark. The key insight: **reuse the existing create-bookmark pipeline almost entirely** (including its YouTube transcript-scraping logic). The *only* differences are (a) no preliminary bookmark is created up front, and (b) what renders when summarization completes.

   **Trigger.** A new action (e.g. from the popup / context) that summarizes **only the content presently on the open active page** (regular page scrape, or YouTube transcript — same scraping path as today, `content.js:721-793`, `background.js:1476-1580`).

   **Summarize result display.** When the completion message arrives, instead of opening the full Save overlay, render a **popup overlay on the same page showing only the summary in Zoom Mode (read-only, no editing)**. At the bottom of this zoomed-summary overlay are two outcomes:
   - **ReVisit this page** → opens the normal Save Bookmark modal (the existing capture overlay), with the already-computed **summary pre-filled in the Summary box (unzoomed)**, all other fields (title, space, category, tags, revisit date) defaulted exactly as normal. For a **YouTube page**, the scraped transcript used for the summary is **kept in memory** and carried into this save so it persists normally on save. On **Save**, the bookmark is persisted as usual (the standard `updateBookmark` save path) — no second summarization, since it's already done.
   - **Dismiss** (close without choosing) → **drop everything**: no bookmark, discard the in-memory summary/transcript.

   **Implementation note.** Because no preliminary bookmark is pre-saved in this flow, the refactor is: run the same scrape+summarize, branch on display (zoomed-summary overlay vs. today's auto-open Save overlay), hold the `{summary, transcript?, scrapedData}` in memory, and only on "ReVisit this page" instantiate the Save overlay pre-seeded with that data. The existing auto-summarize-then-save flow remains available unchanged for the normal "Add Bookmark" path.

2. **Capture popup position (9-grid).** Add `settings.capturePopupPosition` and honor it when positioning the capture overlay, which is currently always flex-centered (`content.js:82-91`). Provide a setting control in the **Appearance** tab to choose among the 9 presets. Default `center` preserves current behavior.

---

## Deferred (separate future spec)

**Per-domain rules.** Once a domain is saved, allow a rule: summarize future saves from that domain with a chosen model, use a custom summarization prompt, and position the capture popup at a chosen location. No infrastructure exists today (no domain/host/rule fields). This needs its own storage table (`rvDomainRules` keyed by hostname), a rule editor UI, and rule-application logic in the capture/summarize path. Out of scope for this batch; the Phase 3 `capturePopupPosition` setting establishes the position-preset vocabulary it will reuse.

---

## Cross-cutting notes

- **Sync safety:** every new persisted field on `rvData` records uses the existing LWW stamping. `rvLocal` (per-install) fields are untouched except for reads (enabled-spaces gating in 1.6 / 1.8 move targets).
- **Independently shippable:** Phase 1 introduces `category.color` with palette defaults so it stands alone; Phase 2 only adds the editor for it. Phase 3 is isolated to the capture surface.
- **No new dependencies; vanilla JS, matching existing patterns.**
- **Testing:** extend existing core-module tests where logic is extractable (status transition for ReVisited, interval-null handling, category-color resolution). UI wiring verified manually against the extension.
