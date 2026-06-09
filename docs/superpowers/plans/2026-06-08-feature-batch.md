# ReVisit Feature Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a 3-phase batch of UI/UX and capability improvements to the ReVisit Chrome extension: list-page polish (header, real ReVisited status, tag-click filter, detail zoom + space switch, category-letter avatars, multi-select, grouped bucket nav), settings reorg (tab order, Categories/Tags tabs with shared search, default-interval-with-None, delete category/tag, per-category color), and a summarize-only capture flow plus 9-grid popup position.

**Architecture:** The extension is vanilla JS (no build step). Browser code lives in `list-modal.js`, `content.js`, `background.js`; pure, environment-agnostic logic lives in UMD `rv-*-core.js` modules that expose a global *and* `module.exports`, tested with `node --test`. This plan extracts all genuinely testable new logic into a new `rv-list-core.js` module (full TDD), and wires the UI in the browser files against exact anchors (verified manually by loading the unpacked extension). Data lives in `chrome.storage.local` under `rvData` (synced, LWW-stamped via `_dirty`/`updatedAt`) and `rvLocal` (per-install).

**Tech Stack:** Vanilla JS, Chrome MV3 extension APIs, `node:test`/`node:assert` for unit tests, no third-party deps.

---

## Conventions used in this plan

- **Test command:** `npm test` runs `node --test` over all `*.test.js`. To run one file: `node --test rv-list-core.test.js`.
- **Manual UI verification:** load the unpacked extension at `chrome://extensions` (Developer mode → "Load unpacked" → repo root), then reload it after edits. The ReVisit List page opens via the toolbar action / `list-modal.html`.
- **Commit after each task** with the message shown.
- **Synced writes:** any change to a `rvData` record (bookmark/category/space) must set `_dirty = true` and `updatedAt = new Date().toISOString()`, then call the existing `saveData()`. The helper `markDirty(rec)` is added in Task 1.

---

## File Structure

**Create:**
- `rv-list-core.js` — pure logic: ReVisited transition, interval-with-None resolution, avatar letter/color resolution, category color palette assignment, tag removal across bookmarks. UMD, exposes `RvListCore`.
- `rv-list-core.test.js` — `node --test` unit tests for the above.

**Modify:**
- `list-modal.html` — header (logo + relocate space selector), filter chips order, detail overlay (zoom buttons, space select, letter-color swatch), settings panel (tab markup, Categories/Tags tabs + shared search, interval control, color pickers), grouped bucket-nav container, multi-select bar, include new script.
- `list-modal.js` — consume `RvListCore`; status filter default; ReVisited handling; tag-click filtering; detail zoom/space-switch/color; category-letter avatars; multi-select; grouped bucket nav; settings tab order; Categories/Tags tabs + search; interval control; delete category (non-empty) / delete tag; per-category color picker.
- `styles.css` — styles for logo image, bucket-nav, zoom overlay, multi-select bar, color swatches, tabs/search.
- `background.js` — real `ReVisited` status in the floating-modal action; interval-None handling on save paths.
- `content.js` — summarize-only zoomed overlay + "ReVisit this page" → seeded Save overlay; capture popup 9-grid positioning.

---

# PHASE 1 — List page

## Task 1: Create `rv-list-core.js` pure logic module + tests

**Files:**
- Create: `rv-list-core.js`
- Test: `rv-list-core.test.js`

- [ ] **Step 1: Write the failing tests**

Create `rv-list-core.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const core = require('./rv-list-core.js');

// --- resolveInterval: number | null (None) ---
test('resolveInterval: number passes through', () => {
  assert.strictEqual(core.resolveInterval({ defaultIntervalDays: 14 }), 14);
});
test('resolveInterval: missing → default 7', () => {
  assert.strictEqual(core.resolveInterval({}), 7);
  assert.strictEqual(core.resolveInterval(undefined), 7);
});
test('resolveInterval: explicit null → null (None)', () => {
  assert.strictEqual(core.resolveInterval({ defaultIntervalDays: null }), null);
});

// --- revisitTransition: the "remind again" action makes ReVisited real ---
test('revisitTransition: numeric interval sets ReVisited + future revisitBy', () => {
  const now = new Date('2026-06-08T00:00:00.000Z');
  const r = core.revisitTransition(now, 7);
  assert.strictEqual(r.status, 'ReVisited');
  assert.strictEqual(r.revisitBy, '2026-06-15T00:00:00.000Z');
});
test('revisitTransition: null interval → ReVisited, revisitBy unchanged (undefined => caller keeps existing)', () => {
  const now = new Date('2026-06-08T00:00:00.000Z');
  const r = core.revisitTransition(now, null);
  assert.strictEqual(r.status, 'ReVisited');
  assert.strictEqual(r.revisitBy, undefined);
});

// --- avatarLetter: category first letter, fall back to host ---
test('avatarLetter: uses category first letter, uppercased', () => {
  assert.strictEqual(core.avatarLetter('news', 'example.com'), 'N');
});
test('avatarLetter: no category → host first letter', () => {
  assert.strictEqual(core.avatarLetter('', 'example.com'), 'E');
  assert.strictEqual(core.avatarLetter(null, 'example.com'), 'E');
});
test('avatarLetter: neither → bullet', () => {
  assert.strictEqual(core.avatarLetter('', ''), '•');
});

// --- avatarColor: bookmark override > category color > deterministic palette ---
const PALETTE = ['#aaa111', '#bbb222', '#ccc333'];
test('avatarColor: per-bookmark override wins', () => {
  assert.strictEqual(core.avatarColor('#123456', '#999999', 'example.com', PALETTE), '#123456');
});
test('avatarColor: else category color', () => {
  assert.strictEqual(core.avatarColor(null, '#999999', 'example.com', PALETTE), '#999999');
});
test('avatarColor: else deterministic palette by host (stable)', () => {
  const a = core.avatarColor(null, null, 'example.com', PALETTE);
  const b = core.avatarColor(null, null, 'example.com', PALETTE);
  assert.strictEqual(a, b);
  assert.ok(PALETTE.includes(a));
});

// --- nextCategoryColor: pick least-used palette colour ---
test('nextCategoryColor: returns an unused palette colour when available', () => {
  const used = ['#aaa111'];
  const c = core.nextCategoryColor(used, PALETTE);
  assert.ok(c === '#bbb222' || c === '#ccc333');
  assert.ok(!used.includes(c));
});
test('nextCategoryColor: all used → still returns a palette colour', () => {
  const c = core.nextCategoryColor([...PALETTE], PALETTE);
  assert.ok(PALETTE.includes(c));
});

// --- removeTagFromBookmarks: strips tag everywhere, marks dirty ---
test('removeTagFromBookmarks: removes tag and marks affected dirty', () => {
  const now = '2026-06-08T00:00:00.000Z';
  const bks = [
    { id: '1', tags: ['x', 'y'] },
    { id: '2', tags: ['y'] },
    { id: '3', tags: ['x'] },
  ];
  const changed = core.removeTagFromBookmarks(bks, 'x', now);
  assert.strictEqual(changed, 2);
  assert.deepStrictEqual(bks[0].tags, ['y']);
  assert.strictEqual(bks[0]._dirty, true);
  assert.strictEqual(bks[0].updatedAt, now);
  assert.deepStrictEqual(bks[1].tags, ['y']);
  assert.strictEqual(bks[1]._dirty, undefined); // untouched
  assert.deepStrictEqual(bks[2].tags, []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test rv-list-core.test.js`
Expected: FAIL — `Cannot find module './rv-list-core.js'`.

- [ ] **Step 3: Write `rv-list-core.js`**

```js
// rv-list-core.js — pure, environment-agnostic list/avatar/status logic.
// No chrome.*, no fetch, no Date.now(). Mirrors rv-spaces-core.js UMD style.
(function (root, factory) {
  const mod = factory();
  root.RvListCore = mod;
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis, function () {

  // Default avatar palette (kept in sync with FAV_COLORS in list-modal.js).
  const PALETTE = ['#3E7C5A', '#C8801E', '#7159B5', '#2F6FE4', '#D6492B', '#0E7C86', '#B5346F', '#4B7A1E'];

  // settings.defaultIntervalDays: number => that many days; null => None (no reminder);
  // missing/undefined => 7-day default.
  function resolveInterval(settings) {
    if (!settings) return 7;
    const v = settings.defaultIntervalDays;
    if (v === null) return null;
    if (v === undefined) return 7;
    return v;
  }

  // The "ReVisit — remind again" action. Returns the status + new revisitBy.
  // intervalDays null => leave revisitBy to the caller (undefined here).
  function revisitTransition(now, intervalDays) {
    if (intervalDays === null || intervalDays === undefined) {
      return { status: 'ReVisited', revisitBy: undefined };
    }
    return {
      status: 'ReVisited',
      revisitBy: new Date(now.getTime() + intervalDays * 86400000).toISOString(),
    };
  }

  // Letter shown on the avatar tile: category first letter, else host first letter, else bullet.
  function avatarLetter(categoryName, host) {
    const cat = (categoryName || '').trim();
    if (cat && cat[0]) return cat[0].toUpperCase();
    const h = (host || '').trim();
    if (h && h[0]) return h[0].toUpperCase();
    return '•';
  }

  // Avatar colour resolution: bookmark override > category colour > deterministic palette.
  function avatarColor(bookmarkLetterColor, categoryColor, host, palette) {
    const pal = palette || PALETTE;
    if (bookmarkLetterColor) return bookmarkLetterColor;
    if (categoryColor) return categoryColor;
    const key = (host || '') || '';
    let n = 0;
    for (let i = 0; i < key.length; i++) n = (n + key.charCodeAt(i)) % pal.length;
    return pal[n];
  }

  // Choose a colour for a new category: the first palette colour not already used,
  // else fall back to the first palette colour.
  function nextCategoryColor(usedColors, palette) {
    const pal = palette || PALETTE;
    const used = new Set((usedColors || []).map(c => (c || '').toLowerCase()));
    const free = pal.find(c => !used.has(c.toLowerCase()));
    return free || pal[0];
  }

  // Remove a tag string from every bookmark. Mutates in place, stamps changed ones
  // dirty for sync. Returns the count of bookmarks changed.
  function removeTagFromBookmarks(bookmarks, tag, isoNow) {
    let changed = 0;
    for (const b of bookmarks || []) {
      const tags = b.tags || [];
      if (tags.includes(tag)) {
        b.tags = tags.filter(t => t !== tag);
        b._dirty = true;
        b.updatedAt = isoNow;
        changed++;
      }
    }
    return changed;
  }

  return { PALETTE, resolveInterval, revisitTransition, avatarLetter, avatarColor, nextCategoryColor, removeTagFromBookmarks };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test rv-list-core.test.js`
Expected: PASS (all tests green).

- [ ] **Step 5: Wire the module into the page + add `markDirty` helper**

In `list-modal.html`, add the script include immediately after the `rv-spaces-core.js` line (currently `list-modal.html:469`):

```html
    <script src="rv-spaces-core.js"></script>
    <script src="rv-list-core.js"></script>
```

In `list-modal.js`, just after the variable declarations (after `let isDirty = false;`, `list-modal.js:16`), add a dirty-stamp helper used throughout this plan:

```js
function markDirty(rec) {
  rec._dirty = true;
  rec.updatedAt = new Date().toISOString();
  return rec;
}
```

- [ ] **Step 6: Commit**

```bash
git add rv-list-core.js rv-list-core.test.js list-modal.html list-modal.js
git commit -m "feat(core): rv-list-core pure logic (status/avatar/interval/tag) + tests"
```

---

## Task 2: Header — logo image + relocate Spaces dropdown to upper-left

**Files:**
- Modify: `list-modal.html:17-36`, `styles.css` (`.logo` ~223-235)

- [ ] **Step 1: Restructure the header markup**

Replace `list-modal.html:17-36` with (logo block now contains the image + the Space selector; right-side actions keep the rest):

```html
        <header class="app-header">
            <div class="logo">
                <img class="logo-img" src="icons/ReVisit Logo.png" alt="ReVisit">
                <span class="logo-text">ReVisit</span>
                <select id="space-selector" class="header-space-selector" title="Active Space"></select>
            </div>
            <div class="header-actions">
                <div class="theme-switch-wrapper">
                    <label class="theme-switch" for="checkbox" title="Toggle light / dark">
                        <input type="checkbox" id="checkbox" aria-label="Toggle dark mode">
                        <span class="slider">
                            <span class="ts-knob">
                                <svg class="ts-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19"/></svg>
                                <svg class="ts-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>
                            </span>
                        </span>
                    </label>
                </div>
                <button id="settings-btn">Settings</button>
                <button id="priority-btn">Priority View</button>
                <button class="btn-close" id="close-btn">Close</button>
            </div>
        </header>
```

(The `#space-selector` id is unchanged, so `renderSpaceSelector()` / `onSpaceSelectorChange()` at `list-modal.js:1500-1518` keep working with no JS change.)

- [ ] **Step 2: Style the logo + inline space selector**

Replace the existing `.logo` rule in `styles.css` (~223-229) with:

```css
.logo {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 18px;
  color: var(--text-strong, #1c1c1c);
}
.logo-img { width: 22px; height: 22px; border-radius: 5px; object-fit: contain; }
.logo-text { letter-spacing: 0.2px; }
.header-space-selector {
  margin-left: 10px;
  max-width: 180px;
  font-size: 13px;
  padding: 4px 8px;
}
```

- [ ] **Step 3: Manual verification**

Reload the extension, open the List page. Expected: the ReVisit logo image sits to the left of the word "ReVisit" in the top-left; the Spaces dropdown sits right after it; changing the space still reloads the list. No dropdown remains on the right side.

- [ ] **Step 4: Commit**

```bash
git add list-modal.html styles.css
git commit -m "feat(list): logo image + relocate Spaces dropdown to upper-left"
```

---

## Task 3: Status filter — reorder chips, default All, make ReVisited real

**Files:**
- Modify: `list-modal.html:47-52`, `list-modal.js:13` and `:540-546`, `background.js:1187-1198`

- [ ] **Step 1: Reorder chips + default to All**

Replace `list-modal.html:47-52` with:

```html
                <div class="filter-tabs">
                    <button class="active" data-filter="All">All</button>
                    <button data-filter="Active">To revisit</button>
                    <button data-filter="ReVisited">Revisited</button>
                    <button data-filter="Complete">Done</button>
                </div>
```

- [ ] **Step 2: Default the JS state to All**

In `list-modal.js:13`, change:

```js
let statusFilter = 'All';
```

- [ ] **Step 3: Make the list "remind again" action store ReVisited**

In `list-modal.js`, replace the `revisit` branch of `handleRowAction` (`list-modal.js:540-546`) with (uses `RvListCore`):

```js
  } else if (act === 'revisit') {
    const iv = RvListCore.resolveInterval(settings);
    const t = RvListCore.revisitTransition(now, iv);
    b.status = t.status; // 'ReVisited'
    if (t.revisitBy !== undefined) b.revisitBy = t.revisitBy; // null interval keeps existing date
    pushHistory(b, iv == null ? 'ReVisited' : `ReVisited — reminder in ${iv}d`);
    await saveData();
    showToast(iv == null ? 'Revisited' : `Revisited — back in ${iv} day${iv === 1 ? '' : 's'}`, 'success');
```

- [ ] **Step 4: Make the floating-modal (background) action store ReVisited**

In `background.js`, replace the `ReVisited` branch (`background.js:1187-1198`) with:

```js
          } else if (request.actionType === 'ReVisited') {
            // Update revisit date and mark the bookmark as ReVisited (a real status).
            const iv = (data.settings && data.settings.defaultIntervalDays === null)
              ? null
              : (data.settings?.defaultIntervalDays || 7);
            if (iv !== null) {
              bookmark.revisitBy = new Date(Date.now() + iv * 24 * 60 * 60 * 1000).toISOString();
            }
            bookmark.status = 'ReVisited';
            bookmark.history = bookmark.history || [];
            bookmark.history.push({
              timestamp: Date.now(),
              action: 'ReVisited - Updated revisit date'
            });
            console.log('DEBUG: 245 Bookmark revisit date updated');
          }
```

- [ ] **Step 5: Manual verification**

Reload extension. Open List page: the chips read **All · To revisit · Revisited · Done**, with **All** selected by default and the full list shown. Save/find a bookmark, use the row action "Revisited — remind again": it should now appear under the **Revisited** chip (not "To revisit"), with a future due date. "To revisit" shows only never-cycled (Active) items.

- [ ] **Step 6: Commit**

```bash
git add list-modal.html list-modal.js background.js
git commit -m "feat(list): All-first default filter + real ReVisited status"
```

---

## Task 4: Click any tag → filter the list to that tag

**Files:**
- Modify: `list-modal.js` — `buildBookmarkRow` (around `:445-520`), `renderTags` (`:622-635`)

- [ ] **Step 1: Add a shared tag-click handler**

In `list-modal.js`, add near `renderTagFilter` (after `list-modal.js:444`):

```js
// Centralised "filter the list by this tag" used by card chips, detail chips, and the sidebar.
function applyTagFilter(tag) {
  selectedTag = tag || null;
  // Close the detail overlay if open so the filtered list is visible.
  const ov = document.getElementById('detail-overlay');
  if (ov && ov.classList.contains('active')) ov.classList.remove('active');
  renderTagFilter();
  renderLinks();
  document.getElementById('links-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
```

- [ ] **Step 2: Render clickable tag chips on each bookmark card**

In `buildBookmarkRow` (the row HTML builder, `list-modal.js:445-520`), add a tag-chip row to the card markup. Locate where the row's inner HTML is assembled and add, after the summary/preview block, a tags line:

```js
  const tagChips = (bookmark.tags || []).length
    ? `<div class="bk-tags">${bookmark.tags.map(t =>
        `<span class="bk-tag" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</span>`).join('')}</div>`
    : '';
```

Include `${tagChips}` in the row's template where the card body is built, then after the row element exists (before `return row;`), wire the chips:

```js
  row.querySelectorAll('.bk-tag').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation(); // don't open the detail overlay
      applyTagFilter(el.dataset.tag);
    });
  });
```

- [ ] **Step 3: Make detail-overlay tag chips clickable too**

In `renderTags` (`list-modal.js:622-635`), each rendered tag should carry `data-tag` and, on click of the tag text (not the × remove button), call `applyTagFilter(tag)`. Add inside the per-tag element creation:

```js
    const label = el.querySelector('.tag-label') || el; // the text node container
    label.style.cursor = 'pointer';
    label.title = 'Filter list by this tag';
    label.addEventListener('click', () => applyTagFilter(tag));
```

(If `renderTags` builds the chip as a single span with the × inside, wrap the tag text in a `<span class="tag-label">` so the click target excludes the remove control.)

- [ ] **Step 4: Add card-tag styles**

Add to `styles.css`:

```css
.bk-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.bk-tag {
  font-size: 11px; padding: 1px 7px; border-radius: 10px; cursor: pointer;
  background: var(--chip-bg, #eef0f2); color: var(--chip-fg, #46505a);
}
.bk-tag:hover { background: var(--accent, #2F6FE4); color: #fff; }
```

- [ ] **Step 5: Manual verification**

Reload. A bookmark with tags shows clickable tag chips on its card. Clicking a card tag filters the middle list to that tag (sidebar tag chip also reflects the active tag) without opening the detail overlay. Clicking a tag inside the detail overlay closes it and filters the list. Clicking the active sidebar tag again clears it.

- [ ] **Step 6: Commit**

```bash
git add list-modal.js styles.css
git commit -m "feat(list): click any tag to filter the list by it"
```

---

## Task 5: Detail overlay — zoom (editable) for Summary & Notes

**Files:**
- Modify: `list-modal.html:136-140`, `list-modal.js` (`openDetailOverlay` ~`:604-606`), `styles.css`

- [ ] **Step 1: Add zoom buttons to the section headings**

Replace `list-modal.html:136-140` with:

```html
            <h3 class="section-heading">Summary
                <button type="button" class="zoom-btn" data-zoom-target="detail-summary" title="Zoom">⤢</button>
            </h3>
            <div id="detail-summary" class="markdown-content" contenteditable="true" placeholder="AI Summary..."></div>

            <h3 class="section-heading">Your Notes
                <button type="button" class="zoom-btn" data-zoom-target="detail-notes" title="Zoom">⤢</button>
            </h3>
            <div id="detail-notes" class="markdown-content" contenteditable="true" placeholder="Add your notes..."></div>
```

- [ ] **Step 2: Add a zoom overlay element**

Add to `list-modal.html` just before the closing of the detail overlay (after `list-modal.html:146` `</div>` that closes `.overlay-content`, but still inside reasonable DOM — place it right before `<!-- Settings Modal ... -->` at line 149):

```html
    <!-- Zoom overlay for Summary / Notes (editable) -->
    <div class="zoom-overlay" id="zoom-overlay">
        <div class="zoom-card">
            <div class="zoom-head">
                <span id="zoom-title">Summary</span>
                <button type="button" class="close-overlay-btn" id="zoom-close">×</button>
            </div>
            <div id="zoom-editor" class="markdown-content zoom-editor" contenteditable="true"></div>
        </div>
    </div>
```

- [ ] **Step 3: Wire zoom open/close**

In `list-modal.js`, add (near the detail overlay logic, after `openDetailOverlay`):

```js
// Zoom a markdown field into a large editable overlay. Edits sync back live to the
// source contenteditable so the existing save path persists them unchanged.
let zoomSourceId = null;
function openZoom(targetId, title) {
  const src = document.getElementById(targetId);
  if (!src) return;
  zoomSourceId = targetId;
  const editor = document.getElementById('zoom-editor');
  document.getElementById('zoom-title').textContent = title;
  editor.innerText = src.innerText; // raw markdown text, editable
  editor.oninput = () => {
    src.innerText = editor.innerText;
    isDirty = true;
  };
  document.getElementById('zoom-overlay').classList.add('active');
  editor.focus();
}
function closeZoom() {
  document.getElementById('zoom-overlay').classList.remove('active');
  zoomSourceId = null;
}
```

Wire the buttons once during init (add alongside other one-time listeners, e.g. near `list-modal.js:215`):

```js
document.querySelectorAll('.zoom-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const id = btn.dataset.zoomTarget;
    openZoom(id, id === 'detail-summary' ? 'Summary' : 'Your Notes');
  });
});
document.getElementById('zoom-close').addEventListener('click', closeZoom);
document.getElementById('zoom-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'zoom-overlay') closeZoom();
});
```

- [ ] **Step 4: Add zoom styles**

Add to `styles.css`:

```css
.section-heading .zoom-btn {
  float: right; border: none; background: transparent; cursor: pointer;
  font-size: 15px; color: var(--text-muted, #6b7480); padding: 0 4px;
}
.section-heading .zoom-btn:hover { color: var(--accent, #2F6FE4); }
.zoom-overlay {
  display: none; position: fixed; inset: 0; z-index: 10050;
  background: rgba(0,0,0,0.5); align-items: center; justify-content: center;
}
.zoom-overlay.active { display: flex; }
.zoom-card {
  width: min(900px, 92vw); height: min(80vh, 760px);
  background: var(--surface, #fff); border-radius: 12px; display: flex; flex-direction: column;
  box-shadow: 0 20px 60px rgba(0,0,0,0.35);
}
.zoom-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--border, #e6e8eb); font-weight: 600; }
.zoom-editor { flex: 1; overflow: auto; padding: 18px 20px; font-size: 15px; line-height: 1.6; }
```

- [ ] **Step 5: Manual verification**

Reload. Open a bookmark's detail. Click the ⤢ next to "Summary" — a large overlay opens with the summary text, editable. Type a change; close the zoom (× or backdrop). The detail's Summary field reflects the edit; clicking "Save Changes" persists it. Same for "Your Notes".

- [ ] **Step 6: Commit**

```bash
git add list-modal.html list-modal.js styles.css
git commit -m "feat(list): editable zoom overlay for Summary and Notes"
```

---

## Task 6: Detail overlay — switch a bookmark to a different (enabled) Space

**Files:**
- Modify: `list-modal.html:109-126` (metadata grid), `list-modal.js` (`openDetailOverlay` ~`:596-610`, save handler that reads detail fields)

- [ ] **Step 1: Add a Space select to the metadata grid**

In `list-modal.html`, add a fourth form-group inside `.metadata-grid` (after the Revisit By group, before `</div>` at line 126):

```html
                <div class="form-group">
                    <label>Space</label>
                    <select id="detail-space"></select>
                </div>
```

- [ ] **Step 2: Populate the Space select with enabled spaces on open**

In `openDetailOverlay`, after the category dropdown is populated (`list-modal.js:599`), add:

```js
  // Space reassignment — limited to Spaces enabled on THIS install.
  const spaceSel = document.getElementById('detail-space');
  const enabled = new Set(rvLocal.enabledSpaceIds || []);
  spaceSel.innerHTML = spaces
    .filter(s => !s.deletedAt && (enabled.has(s.id) || s.id === bookmark.spaceId))
    .map(s => `<option value="${s.id}" ${s.id === bookmark.spaceId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`)
    .join('');
  spaceSel.onchange = () => { isDirty = true; };
```

- [ ] **Step 3: Apply the space change on save**

Find the detail save handler (the `save-bookmark-btn` click that reads `detail-title`, `detail-status`, etc., near `list-modal.js:880-919`). Where it copies field values onto the bookmark, add the space reassignment. Insert alongside the other field assignments:

```js
  const newSpaceId = document.getElementById('detail-space').value;
  if (newSpaceId && newSpaceId !== b.spaceId) {
    b.spaceId = newSpaceId;
    // If the bookmark's category doesn't exist in the destination space, clear it
    // so we never leave a dangling (spaceId, name) pair.
    const catOk = categories.some(c => c.spaceId === newSpaceId && c.name === b.category && !c.deletedAt);
    if (!catOk) b.category = '';
  }
```

(Then the existing `markDirty(b)` / `saveData()` path persists it. If the handler doesn't already stamp dirty, call `markDirty(b)` before `saveData()`.)

- [ ] **Step 4: Manual verification**

With two or more enabled spaces, open a bookmark detail. The Space dropdown lists only enabled spaces and the bookmark's current space. Change it and Save. Switch the header space selector to the destination space — the bookmark now appears there and is gone from the original. Disabled spaces never appear in the dropdown.

- [ ] **Step 5: Commit**

```bash
git add list-modal.html list-modal.js
git commit -m "feat(list): switch a bookmark to a different enabled Space from detail"
```

---

## Task 7: Category-letter avatars with per-category color + per-bookmark override

**Files:**
- Modify: `list-modal.js` (`faviconLetter`/`faviconColor` `:367-376`, row render `:463-465`), `list-modal.html` detail overlay, `styles.css`

- [ ] **Step 1: Add a category-color lookup + rewire avatar helpers**

In `list-modal.js`, replace `faviconLetter`/`faviconColor` (`:368-376`) with delegations to `RvListCore`, plus a category-color lookup:

```js
function categoryColorFor(b) {
  const c = categories.find(x => x.spaceId === b.spaceId && x.name === b.category && !x.deletedAt);
  return c && c.color ? c.color : null;
}
function faviconLetter(b) { return RvListCore.avatarLetter(b.category, hostOf(b)); }
function faviconColor(b) { return RvListCore.avatarColor(b.letterColor, categoryColorFor(b), hostOf(b), FAV_COLORS); }
```

(Keep `hostOf` and `FAV_COLORS` as-is; the row render at `:463-465` already calls `faviconColor(bookmark)`/`faviconLetter(bookmark)`, so no row change needed.)

- [ ] **Step 2: Backfill category colors on load**

Categories created before this change have no `color`. After categories are loaded (in the init/load path where `categories` is assigned, near `list-modal.js:80-90`), assign defaults to any missing color and persist if changed:

```js
(function backfillCategoryColors() {
  let changed = false;
  for (const c of categories) {
    if (!c.color && !c.deletedAt) {
      const used = categories.filter(x => x.color).map(x => x.color);
      c.color = RvListCore.nextCategoryColor(used, FAV_COLORS);
      markDirty(c);
      changed = true;
    }
  }
  if (changed) saveData();
})();
```

- [ ] **Step 3: Add a per-bookmark letter-color swatch to the detail overlay**

In `list-modal.html`, add inside `.detail-header-group` (after the tags-container, before its closing `</div>` at line 107):

```html
                <label class="letter-color-ctl" title="Avatar letter colour (overrides category)">
                    Letter colour
                    <input type="color" id="detail-letter-color">
                    <button type="button" id="detail-letter-color-clear" class="link-btn">Use category</button>
                </label>
```

In `openDetailOverlay`, set the control's value (after the space select block in Task 6):

```js
  const lc = document.getElementById('detail-letter-color');
  lc.value = bookmark.letterColor || categoryColorFor(bookmark) || faviconColor(bookmark);
  lc.oninput = () => { isDirty = true; };
  document.getElementById('detail-letter-color-clear').onclick = () => {
    lc.value = categoryColorFor(bookmark) || faviconColor(bookmark);
    lc.dataset.cleared = '1';
    isDirty = true;
  };
  delete lc.dataset.cleared;
```

In the detail save handler (same place as Task 6 Step 3), apply the override:

```js
  const lcInput = document.getElementById('detail-letter-color');
  if (lcInput.dataset.cleared === '1') {
    delete b.letterColor; // revert to category colour
  } else {
    b.letterColor = lcInput.value;
  }
```

- [ ] **Step 4: Add swatch styles**

```css
.letter-color-ctl { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted,#6b7480); margin-top: 6px; }
.letter-color-ctl input[type=color] { width: 26px; height: 22px; border: none; background: none; padding: 0; cursor: pointer; }
.link-btn { border: none; background: none; color: var(--accent,#2F6FE4); cursor: pointer; font-size: 12px; padding: 0; }
```

- [ ] **Step 5: Manual verification**

Reload. Bookmark avatars now show the **category's first letter** (uncategorized ones fall back to host letter) colored by the category color. In a bookmark detail, change "Letter colour" and Save — that one bookmark's avatar uses the override. Click "Use category" then Save — it reverts to the category color.

- [ ] **Step 6: Commit**

```bash
git add list-modal.js list-modal.html styles.css
git commit -m "feat(list): category-letter avatars with per-category color + per-bookmark override"
```

---

## Task 8: Multi-select — bulk delete + move to space/category

**Files:**
- Modify: `list-modal.html` (toolbar `:69-82`), `list-modal.js` (row render, new bulk bar), `styles.css`

- [ ] **Step 1: Add a Select toggle + bulk action bar**

In `list-modal.html`, add to `.list-toolbar` (after the sort control, before `</div>` at line 82):

```html
                <button id="select-toggle" class="select-toggle">Select</button>
```

And add the bulk bar right after the toolbar (after `list-modal.html:82`):

```html
                <div id="bulk-bar" class="bulk-bar" hidden>
                    <span id="bulk-count">0 selected</span>
                    <select id="bulk-space" title="Move to space"></select>
                    <select id="bulk-category" title="Move to category"></select>
                    <button id="bulk-move" class="btn-save">Move</button>
                    <button id="bulk-delete" class="btn-delete">Delete</button>
                    <button id="bulk-cancel" class="btn-close">Done</button>
                </div>
```

- [ ] **Step 2: Selection state + per-row checkbox**

In `list-modal.js`, add state near the top (after `let currentBookmarkId`):

```js
let selectMode = false;
const selectedIds = new Set();
```

In `buildBookmarkRow`, when `selectMode` is on, prepend a checkbox to the row and stop the row's open-on-click while selecting. Add at the start of the row wiring (before `return row;`):

```js
  if (selectMode) {
    row.classList.add('selectable');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'bk-select';
    cb.checked = selectedIds.has(bookmark.id);
    cb.addEventListener('click', (e) => {
      e.stopPropagation();
      if (cb.checked) selectedIds.add(bookmark.id); else selectedIds.delete(bookmark.id);
      updateBulkBar();
    });
    row.prepend(cb);
  }
```

Ensure the row's main click handler early-returns in select mode (find where the row click opens the detail overlay and guard it):

```js
  // inside the row open-on-click handler:
  if (selectMode) { return; }
```

- [ ] **Step 3: Toggle + bulk bar logic**

Add to `list-modal.js`:

```js
function updateBulkBar() {
  document.getElementById('bulk-count').textContent = `${selectedIds.size} selected`;
}
function populateBulkTargets() {
  const enabled = new Set(rvLocal.enabledSpaceIds || []);
  const spaceSel = document.getElementById('bulk-space');
  spaceSel.innerHTML = `<option value="">Move to space…</option>` + spaces
    .filter(s => !s.deletedAt && enabled.has(s.id))
    .map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
  // Categories of the active space (move within current space by default).
  const catSel = document.getElementById('bulk-category');
  catSel.innerHTML = `<option value="">Move to category…</option>` + categories
    .filter(c => c.spaceId === activeSpaceId && !c.deletedAt)
    .map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');
}
function setSelectMode(on) {
  selectMode = on;
  selectedIds.clear();
  document.getElementById('bulk-bar').hidden = !on;
  document.getElementById('select-toggle').classList.toggle('active', on);
  if (on) { populateBulkTargets(); updateBulkBar(); }
  renderLinks();
}
async function bulkMove() {
  const spaceId = document.getElementById('bulk-space').value;
  const cat = document.getElementById('bulk-category').value;
  if (!spaceId && !cat) { showToast('Pick a space or category', 'error'); return; }
  for (const id of selectedIds) {
    const b = bookmarks.find(x => x.id === id);
    if (!b) continue;
    if (spaceId) {
      b.spaceId = spaceId;
      const catOk = categories.some(c => c.spaceId === spaceId && c.name === b.category && !c.deletedAt);
      if (!catOk) b.category = '';
    }
    if (cat) b.category = cat;
    markDirty(b);
  }
  await saveData();
  showToast('Moved', 'success');
  setSelectMode(false);
  renderCategories();
}
async function bulkDelete() {
  const ok = await rvConfirm('Delete selected?', `Delete ${selectedIds.size} bookmark(s)?`, { confirmText: 'Delete', danger: true });
  if (!ok) return;
  const now = new Date().toISOString();
  for (const id of selectedIds) {
    const b = bookmarks.find(x => x.id === id);
    if (!b) continue;
    b.deletedAt = now; b.status = 'Deleted'; markDirty(b);
  }
  await saveData();
  showToast('Deleted', 'success');
  setSelectMode(false);
  renderCategories();
}
```

Wire the buttons once during init:

```js
document.getElementById('select-toggle').addEventListener('click', () => setSelectMode(!selectMode));
document.getElementById('bulk-cancel').addEventListener('click', () => setSelectMode(false));
document.getElementById('bulk-move').addEventListener('click', bulkMove);
document.getElementById('bulk-delete').addEventListener('click', bulkDelete);
```

- [ ] **Step 4: Styles**

```css
.select-toggle.active { background: var(--accent,#2F6FE4); color:#fff; }
.bulk-bar { display: flex; gap: 8px; align-items: center; padding: 8px 12px; background: var(--surface-2,#f3f5f7); border-radius: 8px; margin: 6px 0; }
.bulk-bar[hidden] { display: none; }
.bookmark-row.selectable { cursor: default; }
.bk-select { margin-right: 8px; }
```

- [ ] **Step 5: Manual verification**

Reload. Click **Select** — checkboxes appear on rows and a bulk bar shows. Tick several; the count updates. Pick a category → **Move** reassigns them (visible after re-render). Pick another enabled space → **Move** sends them there (they leave the current space). **Delete** removes the selected after confirm. **Done** exits select mode. Clicking a row while selecting does not open its detail.

- [ ] **Step 6: Commit**

```bash
git add list-modal.html list-modal.js styles.css
git commit -m "feat(list): multi-select bulk delete + move to space/category"
```

---

## Task 9: Grouped view — bucket-nav buttons

**Files:**
- Modify: `list-modal.html` (add container after toolbar), `list-modal.js` (`renderLinks` `:317-335`), `styles.css`

- [ ] **Step 1: Add a bucket-nav container**

In `list-modal.html`, add right above the list (before `<div id="links-list" ...>` at line 83):

```html
                <div id="bucket-nav" class="bucket-nav" hidden></div>
```

- [ ] **Step 2: Render the bucket-nav in grouped mode**

In `renderLinks` (`list-modal.js:317-335`), update the grouped branch to also build the nav. Replace lines `317-335` with:

```js
  const nav = document.getElementById('bucket-nav');

  // Group into due buckets only when sorting by due date and not in flat mode;
  // any other sort renders a single flat list in the chosen order.
  if (sortMode !== 'due' || priorityView) {
    if (nav) { nav.hidden = true; nav.innerHTML = ''; }
    filtered.forEach(b => container.appendChild(buildBookmarkRow(b)));
    return;
  }

  const groups = {};
  DUE_BUCKETS.forEach(g => { groups[g.key] = []; });
  filtered.forEach(b => { groups[getDueInfo(b).key].push(b); });

  // Bucket-nav buttons: count per bucket; click scrolls to the bucket header.
  if (nav) {
    nav.hidden = false;
    nav.innerHTML = DUE_BUCKETS.map(g => {
      const n = groups[g.key].length;
      return `<button class="bucket-jump ${n ? '' : 'empty'} ${g.key}" data-bucket="${g.key}" ${n ? '' : 'disabled'}>${g.label}<span class="bj-ct">${n}</span></button>`;
    }).join('');
    nav.querySelectorAll('.bucket-jump').forEach(btn => {
      btn.addEventListener('click', () => {
        const head = container.querySelector(`.bucket-h.${btn.dataset.bucket}`);
        head?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  DUE_BUCKETS.forEach(g => {
    const items = groups[g.key];
    if (!items.length) return;
    const head = document.createElement('div');
    head.className = `bucket-h ${g.key}`;
    head.innerHTML = `<span class="bucket-lbl">${g.label}</span><span class="bucket-ct">${items.length}</span><span class="bucket-ln"></span>`;
    container.appendChild(head);
    items.forEach(b => container.appendChild(buildBookmarkRow(b)));
  });
```

- [ ] **Step 3: Styles**

```css
.bucket-nav { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 10px; }
.bucket-nav[hidden] { display: none; }
.bucket-jump {
  display: inline-flex; align-items: center; gap: 6px; font-size: 12px;
  padding: 4px 10px; border-radius: 14px; border: 1px solid var(--border,#e0e3e7);
  background: var(--surface,#fff); cursor: pointer;
}
.bucket-jump:hover { border-color: var(--accent,#2F6FE4); }
.bucket-jump.empty { opacity: 0.4; cursor: default; }
.bucket-jump .bj-ct { font-weight: 700; }
.bucket-jump.overdue { color: #D6492B; }
```

- [ ] **Step 4: Manual verification**

Reload. With sort = "Due date" and grouped (Priority View off), a row of buttons appears above the list: **Overdue · Today · This week · Later · Someday**, each with its count; empty buckets are dimmed/disabled. Clicking a button scrolls to that group. Switching to Flat (Priority View) or another sort hides the button row.

- [ ] **Step 5: Commit**

```bash
git add list-modal.html list-modal.js styles.css
git commit -m "feat(list): grouped-view bucket navigation buttons"
```

---

# PHASE 2 — Settings

## Task 10: Reorder settings tabs

**Files:**
- Modify: `list-modal.js` `SETTINGS_TABS` (`:1003-1009`)

- [ ] **Step 1: Reorder the tab definition**

Replace the `SETTINGS_TABS` array (`list-modal.js:1003-1009`) so the order is Account · AI · Appearance · Spaces · Data. Keep each tab's existing `sections` mapping intact — only the array order changes:

```js
const SETTINGS_TABS = [
  { id: 'account',    label: 'Account',    sections: ['account-section'] },
  { id: 'ai',         label: 'AI',         sections: ['gateway-section', 'ollama-section', 'aiprovider-section'] },
  { id: 'appearance', label: 'Appearance', sections: ['appearance-section'] },
  { id: 'spaces',     label: 'Spaces',     sections: ['spaces-section'] },
  { id: 'data',       label: 'Data',       sections: ['backup-section'] },
];
```

(Adjust the exact `sections` strings to match the current values at `:1003-1009` if they differ — preserve them, change only order. If a default-selected tab is set elsewhere by index, ensure it points at `account`.)

- [ ] **Step 2: Manual verification**

Reload, open Settings. Tabs appear in order **Account · AI · Appearance · Spaces · Data**; each still shows its correct sections.

- [ ] **Step 3: Commit**

```bash
git add list-modal.js
git commit -m "feat(settings): reorder tabs to Account/AI/Appearance/Spaces/Data"
```

---

## Task 11: Default revisit interval control (with None) in Appearance

**Files:**
- Modify: `list-modal.html` (appearance-section), `list-modal.js` (settings load/save), `background.js:859` and `:1189`, `content.js` save default

- [ ] **Step 1: Add the control to the Appearance section**

In `list-modal.html`, inside the appearance settings section (`#appearance-section`), add:

```html
                <div class="setting-row">
                    <label for="set-default-interval">Default revisit interval</label>
                    <select id="set-default-interval">
                        <option value="none">None (no reminder)</option>
                        <option value="1">1 day</option>
                        <option value="3">3 days</option>
                        <option value="7">1 week</option>
                        <option value="14">2 weeks</option>
                        <option value="30">1 month</option>
                    </select>
                </div>
```

- [ ] **Step 2: Load + save the setting**

In the function that opens/populates settings (`openSettings`, `list-modal.js:929`), set the control from `settings.defaultIntervalDays` (null → "none"):

```js
  const ivSel = document.getElementById('set-default-interval');
  if (ivSel) ivSel.value = (settings.defaultIntervalDays === null) ? 'none' : String(settings.defaultIntervalDays ?? 7);
```

Wire its change handler once (where other settings inputs are wired):

```js
  document.getElementById('set-default-interval').addEventListener('change', (e) => {
    settings.defaultIntervalDays = (e.target.value === 'none') ? null : parseInt(e.target.value, 10);
    saveData();
  });
```

- [ ] **Step 3: Honor None on the save paths**

In `background.js`, the bookmark-creation default (`background.js:859`) currently always computes a date. Replace that `revisitBy` initialization with None-aware logic:

```js
        revisitBy: (settings.defaultIntervalDays === null)
          ? null
          : new Date(Date.now() + (settings.defaultIntervalDays || 7) * 24 * 60 * 60 * 1000).toISOString(),
```

(The floating-modal `ReVisited` branch at `:1189` was already made None-aware in Task 3 Step 4.)

In `content.js`, where the capture overlay defaults the revisit date field, treat None as empty (no date). Find the revisit-date default (near `content.js:1055-1061`) and ensure that when the stored default is None, the date input starts empty rather than today+interval.

- [ ] **Step 4: Manual verification**

Reload. Settings → Appearance → set Default revisit interval to **None**. Save a new bookmark from a page: it has no revisit date (lands in "Someday"). Change the setting to **1 week** and save another: it's due in 7 days.

- [ ] **Step 5: Commit**

```bash
git add list-modal.html list-modal.js background.js content.js
git commit -m "feat(settings): default revisit interval with None option"
```

---

## Task 12: Categories & Tags as two tabs with a shared, persistent search

**Files:**
- Modify: `list-modal.html` (replace `.settings-cats-layer` `:396-425`), `list-modal.js` (`renderCategoriesSettings` `:1724-1775`, show/hide layer `:1531-1544`), `styles.css`

- [ ] **Step 1: Replace the categories layer markup with a tabbed panel**

Replace `list-modal.html:396-425` (`.settings-cats-layer`) with:

```html
        <div class="settings-cats-layer" id="settings-cats-layer">
            <div class="cats-layer-head">
                <button class="back-btn" id="cats-layer-back">← Back</button>
                <span id="cats-layer-title">Categories &amp; Tags</span>
            </div>
            <div class="ct-search-row">
                <input type="text" id="ct-search" placeholder="Search categories or tags…">
                <button type="button" id="ct-search-clear" class="link-btn">Clear</button>
            </div>
            <div class="ct-tabs">
                <button class="ct-tab active" data-cttab="categories">Categories</button>
                <button class="ct-tab" data-cttab="tags">Tags</button>
            </div>
            <div id="ct-categories" class="ct-pane">
                <div id="categories-settings-list"><!-- category rows injected --></div>
                <form id="add-category-form" class="add-cat-form">
                    <input type="text" id="new-category-name" placeholder="New category name">
                    <input type="number" id="new-category-priority" min="1" value="1" title="Priority">
                    <button type="submit">Add</button>
                </form>
            </div>
            <div id="ct-tags" class="ct-pane" hidden>
                <div id="tags-settings-list"><!-- tag rows injected --></div>
            </div>
        </div>
```

(If `renderCategoriesSettings` targets a different container id than `categories-settings-list`, keep the original id used at `list-modal.js:1724-1775` instead and adjust here to match.)

- [ ] **Step 2: Add the shared-search + tab state and renderers**

In `list-modal.js`, add:

```js
let ctTab = 'categories';   // which sub-tab is active
let ctSearch = '';          // shared search term (persists across tab toggle)

function showCtTab(tab) {
  ctTab = tab;
  document.querySelectorAll('.ct-tab').forEach(b => b.classList.toggle('active', b.dataset.cttab === tab));
  document.getElementById('ct-categories').hidden = tab !== 'categories';
  document.getElementById('ct-tags').hidden = tab !== 'tags';
  if (tab === 'categories') renderCategoriesSettings(); else renderTagsSettings();
}

function renderTagsSettings() {
  const host = document.getElementById('tags-settings-list');
  // Unique tags across bookmarks in the settings space (or all bookmarks if no scope).
  const scope = bookmarks.filter(b => !b.deletedAt && (!settingsSpaceId || b.spaceId === settingsSpaceId));
  const counts = {};
  scope.forEach(b => (b.tags || []).forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
  const q = ctSearch.toLowerCase();
  const tags = Object.keys(counts).filter(t => !q || t.toLowerCase().includes(q)).sort();
  host.innerHTML = tags.length
    ? tags.map(t => `<div class="ct-row"><span class="ct-name">${escapeHtml(t)}</span><span class="ct-count">${counts[t]}</span><button class="ct-del" data-tag="${escapeHtml(t)}">Delete</button></div>`).join('')
    : '<div class="empty-state">No tags.</div>';
  host.querySelectorAll('.ct-del').forEach(btn => btn.addEventListener('click', () => deleteTag(btn.dataset.tag)));
}
```

- [ ] **Step 3: Make `renderCategoriesSettings` honor the shared search**

In `renderCategoriesSettings` (`list-modal.js:1724-1775`), filter the rendered categories by `ctSearch`. At the top where it collects the categories for `settingsSpaceId`, add a filter:

```js
  const q = ctSearch.toLowerCase();
  const cats = categories
    .filter(c => c.spaceId === settingsSpaceId && !c.deletedAt)
    .filter(c => !q || c.name.toLowerCase().includes(q));
```

(Use `cats` for the subsequent row rendering loop.)

- [ ] **Step 4: Wire search + tabs once**

Where the categories layer is shown (`showCategoriesLayer`, `list-modal.js:1531-1538`), after it becomes visible, default to the categories tab and bind controls (bind once using a guard):

```js
  if (!showCategoriesLayer._wired) {
    showCategoriesLayer._wired = true;
    document.querySelectorAll('.ct-tab').forEach(b =>
      b.addEventListener('click', () => showCtTab(b.dataset.cttab)));
    const search = document.getElementById('ct-search');
    search.addEventListener('input', () => {
      ctSearch = search.value;
      if (ctTab === 'categories') renderCategoriesSettings(); else renderTagsSettings();
    });
    document.getElementById('ct-search-clear').addEventListener('click', () => {
      ctSearch = ''; search.value = '';
      if (ctTab === 'categories') renderCategoriesSettings(); else renderTagsSettings();
    });
  }
  document.getElementById('ct-search').value = ctSearch; // persist across opens
  showCtTab(ctTab);
```

- [ ] **Step 5: Styles**

```css
.ct-search-row { display: flex; gap: 8px; align-items: center; margin: 8px 0; }
.ct-search-row input { flex: 1; padding: 6px 10px; }
.ct-tabs { display: flex; gap: 6px; margin-bottom: 8px; }
.ct-tab { padding: 6px 12px; border: none; background: transparent; cursor: pointer; border-bottom: 2px solid transparent; }
.ct-tab.active { border-bottom-color: var(--accent,#2F6FE4); font-weight: 600; }
.ct-pane[hidden] { display: none; }
.ct-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; }
.ct-row .ct-name { flex: 1; }
.ct-row .ct-count { color: var(--text-muted,#6b7480); font-size: 12px; }
```

- [ ] **Step 6: Manual verification**

Reload. Settings → Spaces → open a space's Categories editor. There are now **Categories** and **Tags** sub-tabs with a **search bar + Clear** above them. Type "ne": the Categories list filters; toggle to **Tags** — the search term **persists** and now filters the tag list. Clear empties both. (Delete buttons are wired in Tasks 13–14.)

- [ ] **Step 7: Commit**

```bash
git add list-modal.html list-modal.js styles.css
git commit -m "feat(settings): Categories/Tags tabs with shared persistent search"
```

---

## Task 13: Delete a category (including non-empty, via reassign)

**Files:**
- Modify: `list-modal.js` `deleteCategory` (`:1779-1790`)

- [ ] **Step 1: Replace empty-only delete with reassign-aware delete**

Replace `deleteCategory` (`list-modal.js:1779-1790`) with:

```js
async function deleteCategory(spaceId, name, count) {
  const cat = categories.find(c => c.spaceId === spaceId && c.name === name && !c.deletedAt);
  if (!cat) return;

  if (count > 0) {
    // Non-empty: ask where the bookmarks should go.
    const others = categories
      .filter(c => c.spaceId === spaceId && c.name !== name && !c.deletedAt)
      .map(c => c.name);
    const choice = await rvChoose(
      `Delete "${name}"?`,
      `${count} bookmark(s) use this category. Reassign them, then delete.`,
      [
        ...others.map(n => ({ id: `to:${n}`, label: `Move to "${n}"` })),
        { id: 'clear', label: 'Clear their category' },
        { id: 'cancel', label: 'Cancel' },
      ]
    );
    if (!choice || choice === 'cancel') return;
    const target = choice.startsWith('to:') ? choice.slice(3) : '';
    bookmarks.forEach(b => {
      if (b.spaceId === spaceId && b.category === name) { b.category = target; markDirty(b); }
    });
  }

  cat.deletedAt = new Date().toISOString();
  markDirty(cat);
  await saveData();
  renderCategoriesSettings();
  renderCategories();
  showToast('Category deleted', 'success');
}
```

**Note:** this uses a small chooser helper `rvChoose(title, body, options)` returning the chosen option id. If the codebase already has a multi-option dialog, use it; otherwise implement `rvChoose` next to the existing `rvConfirm` as a promise-based dialog with one button per option (mirror `rvConfirm`'s structure, render N buttons, resolve with the clicked option's `id`).

- [ ] **Step 2: Manual verification**

Reload. In the Categories tab, delete an **empty** category — it disappears. Delete a **non-empty** category — a dialog offers "Move to <other>", "Clear their category", or Cancel. Choosing a target reassigns those bookmarks (verify in the list) and removes the category.

- [ ] **Step 3: Commit**

```bash
git add list-modal.js
git commit -m "feat(settings): delete non-empty category via reassign"
```

---

## Task 14: Delete a tag (removes it from all bookmarks in scope)

**Files:**
- Modify: `list-modal.js` (`deleteTag`, uses `RvListCore.removeTagFromBookmarks`)

- [ ] **Step 1: Add `deleteTag`**

In `list-modal.js`, add:

```js
async function deleteTag(tag) {
  const ok = await rvConfirm('Delete tag?', `Remove the tag "${tag}" from all bookmarks in this space?`, { confirmText: 'Delete', danger: true });
  if (!ok) return;
  const scope = bookmarks.filter(b => !settingsSpaceId || b.spaceId === settingsSpaceId);
  const changed = RvListCore.removeTagFromBookmarks(scope, tag, new Date().toISOString());
  if (changed) {
    if (selectedTag === tag) selectedTag = null;
    await saveData();
    renderTagsSettings();
    renderTagFilter();
    renderLinks();
  }
  showToast(`Removed "${tag}" from ${changed} bookmark(s)`, 'success');
}
```

(The Tags tab's Delete buttons were already wired to `deleteTag` in Task 12 Step 2.)

- [ ] **Step 2: Manual verification**

Reload. In the Tags tab, click **Delete** on a tag → confirm. The tag disappears from the tag list, the sidebar tag filter, and from every bookmark that had it (open one to confirm).

- [ ] **Step 3: Commit**

```bash
git add list-modal.js
git commit -m "feat(settings): delete a tag across all bookmarks in scope"
```

---

## Task 15: Per-category color picker

**Files:**
- Modify: `list-modal.js` `renderCategoriesSettings` (`:1724-1775`), `styles.css`

- [ ] **Step 1: Add a color input to each category row**

In `renderCategoriesSettings`, where each category row's HTML is built, add a color input bound to `category.color`. In the row template add:

```js
    `<input type="color" class="cat-color" data-cat="${escapeHtml(c.name)}" value="${c.color || RvListCore.nextCategoryColor(categories.filter(x=>x.color).map(x=>x.color), FAV_COLORS)}">`
```

After the rows are inserted into the DOM, wire change handlers:

```js
  host.querySelectorAll('.cat-color').forEach(inp => {
    inp.addEventListener('change', () => {
      const c = categories.find(x => x.spaceId === settingsSpaceId && x.name === inp.dataset.cat && !x.deletedAt);
      if (!c) return;
      c.color = inp.value;
      markDirty(c);
      saveData();
      renderLinks(); // refresh avatars
    });
  });
```

(`host` = the categories list container used by `renderCategoriesSettings`.)

- [ ] **Step 2: Styles**

```css
.cat-color { width: 26px; height: 22px; border: none; background: none; padding: 0; cursor: pointer; vertical-align: middle; }
```

- [ ] **Step 3: Manual verification**

Reload. In the Categories tab, each category row has a color swatch. Change one — bookmarks in that category immediately show the new avatar color (unless a bookmark has a per-bookmark override from Task 7). The choice persists across reloads.

- [ ] **Step 4: Commit**

```bash
git add list-modal.js styles.css
git commit -m "feat(settings): per-category avatar color picker"
```

---

# PHASE 3 — Capture flow

## Task 16: Capture popup 9-grid position

**Files:**
- Modify: `list-modal.html` (appearance-section), `list-modal.js` (settings load/save), `content.js` (overlay positioning `:82-91` + apply on inject)

- [ ] **Step 1: Add the position setting control (Appearance)**

In `list-modal.html`, inside `#appearance-section`, add:

```html
                <div class="setting-row">
                    <label for="set-popup-position">Capture popup position</label>
                    <select id="set-popup-position">
                        <option value="center">Center</option>
                        <option value="top-left">Top-left</option>
                        <option value="top-center">Top-center</option>
                        <option value="top-right">Top-right</option>
                        <option value="mid-left">Middle-left</option>
                        <option value="mid-right">Middle-right</option>
                        <option value="bottom-left">Bottom-left</option>
                        <option value="bottom-center">Bottom-center</option>
                        <option value="bottom-right">Bottom-right</option>
                    </select>
                </div>
```

- [ ] **Step 2: Load + save the setting**

In `openSettings` population code, add:

```js
  const ppSel = document.getElementById('set-popup-position');
  if (ppSel) ppSel.value = settings.capturePopupPosition || 'center';
```

Wire change once:

```js
  document.getElementById('set-popup-position').addEventListener('change', (e) => {
    settings.capturePopupPosition = e.target.value;
    saveData();
  });
```

- [ ] **Step 3: Apply the position when injecting the capture overlay**

In `content.js`, the backdrop is flex-centered (`content.js:82-91`). Change the `.overlay-card` placement to honor `settings.capturePopupPosition`. Add a helper and apply it where the overlay is injected (`injectBookmarkOverlay`, ~`content.js:960`):

```js
// Map a 9-grid preset to flexbox alignment on the backdrop.
function positionStyleFor(pos) {
  const map = {
    'center':        ['center', 'center'],
    'top-left':      ['flex-start', 'flex-start'],
    'top-center':    ['flex-start', 'center'],
    'top-right':     ['flex-start', 'flex-end'],
    'mid-left':      ['center', 'flex-start'],
    'mid-right':     ['center', 'flex-end'],
    'bottom-left':   ['flex-end', 'flex-start'],
    'bottom-center': ['flex-end', 'center'],
    'bottom-right':  ['flex-end', 'flex-end'],
  };
  const [alignItems, justifyContent] = map[pos] || map['center'];
  return { alignItems, justifyContent };
}
```

When building the backdrop element (where `align-items: center; justify-content: center;` is set, `content.js:82-91`), read the stored setting and apply it. The overlay code already reads settings/scheme from storage before injecting (e.g. theme at `content.js:908-921`); read `capturePopupPosition` from `rvData.settings` in that same retrieval and set:

```js
  const pos = positionStyleFor((rvData?.settings?.capturePopupPosition) || 'center');
  backdrop.style.alignItems = pos.alignItems;
  backdrop.style.justifyContent = pos.justifyContent;
  // Add breathing room from the edges for non-center positions.
  backdrop.style.padding = '24px';
```

- [ ] **Step 4: Manual verification**

Reload. Settings → Appearance → set Capture popup position to **Top-right**. Trigger a capture on any page — the popup appears anchored top-right (with edge padding). Set back to **Center** — it centers as before.

- [ ] **Step 5: Commit**

```bash
git add list-modal.html list-modal.js content.js
git commit -m "feat(capture): 9-grid capture popup position setting"
```

---

## Task 17: Summarize-only → zoomed summary → "ReVisit this page" → seeded Save

**Files:**
- Modify: `popup.html`/`popup.js` (add trigger), `content.js` (new summarize-only handler + zoomed overlay + seeded Save), `background.js` (summarize-only message that does NOT pre-save)

**Architecture for this task:** Reuse the *existing* scrape+summarize pipeline (regular page scrape and YouTube transcript) used by `addBookmark`. The only two differences are: (1) no preliminary bookmark is created, and (2) on completion we render a **read-only zoomed summary overlay** instead of the full Save overlay. The summary (and, for YouTube, the in-memory transcript + scraped data) are held in a module variable; on **ReVisit this page** we open the normal Save overlay seeded with them; on dismiss we discard everything.

- [ ] **Step 1: Add a "Summarize only" trigger in the popup**

In `popup.html`, add a button next to the existing Add Bookmark button:

```html
    <button id="summarize-only-btn">Summarize only</button>
```

In `popup.js`, send a new action (mirror the existing `addBookmark` send at `popup.js:13`):

```js
document.getElementById('summarize-only-btn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'summarizeOnly' });
  window.close();
});
```

- [ ] **Step 2: Background `summarizeOnly` — scrape + summarize, no pre-save**

In `background.js`, add a handler for `action === 'summarizeOnly'` that mirrors the `addBookmark` scrape/summarize path (`background.js:772-958`) **but skips creating/saving the preliminary bookmark**. It should:
  - resolve the active tab + `bookmarkData` (title/url) exactly like `addBookmark`,
  - for YouTube, inject content script and send `{ action: 'summarizeOnlyOverlay', bookmarkData }` so the content script scrapes the transcript and calls back `processWithAI` (reuse `handleScrapeAndShowOverlay`'s scrape logic),
  - for a regular page, scrape via the same `scrapePageContent()` and call `processWithAI(...)`,
  - send the `{ summary, category, tags, transcript? , scrapedData }` result to the content script via `{ action: 'showSummarizeOnly', result }` **without** any `updateBookmark`/save.

Concretely, factor the existing scrape+AI block so both `addBookmark` and `summarizeOnly` share it, with a boolean `preSave` that is `true` for `addBookmark` (current behavior) and `false` for `summarizeOnly`. When `preSave` is false, do not call the bookmark-create/save (`background.js:850-865`) and route the result to `showSummarizeOnly` instead of the normal overlay.

- [ ] **Step 3: Content script — hold result + render read-only zoomed summary**

In `content.js`, add a module-level holder and a renderer:

```js
let pendingSummary = null; // { summary, category, tags, transcript, scrapedData, bookmarkData }

function showSummarizeOnlyOverlay(result, bookmarkData) {
  pendingSummary = { ...result, bookmarkData };
  // Build a same-page overlay showing ONLY the summary, zoomed, read-only.
  const host = document.createElement('div');
  host.id = 'rv-summarize-only';
  host.innerHTML = `
    <div class="rvso-backdrop">
      <div class="rvso-card">
        <div class="rvso-head">
          <span>Summary</span>
          <button class="rvso-close" title="Dismiss">×</button>
        </div>
        <div class="rvso-body">${renderMarkdownToHtml(result.summary || '')}</div>
        <div class="rvso-foot">
          <button class="rvso-save">ReVisit this page</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(host);
  host.querySelector('.rvso-close').addEventListener('click', () => { host.remove(); pendingSummary = null; });
  host.querySelector('.rvso-backdrop').addEventListener('click', (e) => {
    if (e.target.classList.contains('rvso-backdrop')) { host.remove(); pendingSummary = null; }
  });
  host.querySelector('.rvso-save').addEventListener('click', () => {
    host.remove();
    openSaveOverlaySeeded(pendingSummary);
  });
}
```

Use the content script's existing markdown renderer for `renderMarkdownToHtml` (the capture overlay already renders the summary as markdown — reuse that same function; if it's inline, extract it). Style `.rvso-*` to match the zoomed look (large card, scrollable body, read-only).

Add a message listener branch (next to the existing `scrapeAndShowOverlay` handler at `content.js:502-506`):

```js
  if (request.action === 'showSummarizeOnly') {
    showSummarizeOnlyOverlay(request.result, request.bookmarkData);
    return;
  }
  if (request.action === 'summarizeOnlyOverlay') {
    handleSummarizeOnlyScrape(request.bookmarkData); // YouTube/regular scrape → processWithAI → showSummarizeOnly
    return;
  }
```

`handleSummarizeOnlyScrape` reuses the scrape logic of `handleScrapeAndShowOverlay` (`content.js:721-793`) but, instead of injecting the Save overlay, sends `{ action: 'processWithAI', ... }`, then on response calls `showSummarizeOnlyOverlay(result, bookmarkData)` and stashes `transcript`/`scrapedData` into the result it passes.

- [ ] **Step 4: Seeded Save overlay reusing the normal capture overlay**

In `content.js`, add:

```js
// Open the normal Save Bookmark overlay, pre-seeded with the already-computed
// summary (and YouTube transcript), so saving persists without re-summarizing.
function openSaveOverlaySeeded(pending) {
  // Reuse the existing capture overlay injector; it already accepts AI results
  // (category, summary, tags) and renders fields. Pass summary UNZOOMED in the box,
  // defaults for everything else, and carry the transcript in memory for save.
  injectBookmarkOverlay({
    title: pending.bookmarkData.title,
    url: pending.bookmarkData.url,
    category: pending.category || '',
    summary: pending.summary || '',
    tags: pending.tags || [],
    // mark this as not-yet-saved: no preliminary bookmark exists
    isPreliminary: false,
    seededTranscript: pending.transcript || null,
    seededScrapedData: pending.scrapedData || null,
  });
}
```

In `injectBookmarkOverlay` (`content.js:960`), the Save handler (`content.js:1252-1265`) sends `{ action: 'updateBookmark', ... }`. For the seeded flow there is no pre-saved bookmark id, so the save must **create** the bookmark. Adjust the Save handler so that when there is no existing `bookmarkId` (seeded flow), it sends `{ action: 'createBookmarkFromOverlay', updatedData, transcript: seededTranscript }` instead. Add a `background.js` handler `createBookmarkFromOverlay` that builds the bookmark record exactly like the `addBookmark` create block (`background.js:850-865`) using the provided fields, persists the YouTube transcript if present (same path as the normal flow, `background.js:1409-1430`), and saves via the standard path. This is the *only* new save path; everything else (field defaults, date chips, spaces) reuses the existing overlay code.

- [ ] **Step 5: Styles for the read-only summary overlay**

```css
#rv-summarize-only .rvso-backdrop { position: fixed; inset: 0; z-index: 2147483646; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; }
#rv-summarize-only .rvso-card { width: min(820px, 92vw); height: min(78vh, 720px); background: #fff; border-radius: 12px; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,.35); }
#rv-summarize-only .rvso-head { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #e6e8eb; font-weight: 600; }
#rv-summarize-only .rvso-close { border: none; background: none; font-size: 22px; cursor: pointer; }
#rv-summarize-only .rvso-body { flex: 1; overflow: auto; padding: 18px 22px; font-size: 15px; line-height: 1.6; }
#rv-summarize-only .rvso-foot { padding: 12px 16px; border-top: 1px solid #e6e8eb; text-align: right; }
#rv-summarize-only .rvso-save { padding: 8px 16px; border: none; border-radius: 8px; background: #2F6FE4; color: #fff; cursor: pointer; font-weight: 600; }
```

(If the capture overlay uses a Shadow DOM, inject these styles into the same shadow root the `#rv-summarize-only` host lives in, mirroring the existing overlay's style injection at `content.js:940-958`.)

- [ ] **Step 6: Manual verification**

Reload. On a regular article page, open the popup → **Summarize only**. After analysis, a same-page overlay shows **only the summary**, zoomed and read-only, with **ReVisit this page** at the bottom. Click it → the normal Save Bookmark modal opens with the **summary already in the Summary box (unzoomed)** and other fields defaulted; **Save** persists the bookmark (it appears in the List). Repeat on a **YouTube** video: the transcript used for the summary is retained and the saved bookmark has its transcript (open the bookmark; transcript/summary present). Dismissing the summary overlay (×/backdrop) before choosing saves nothing.

- [ ] **Step 7: Commit**

```bash
git add popup.html popup.js content.js background.js styles.css
git commit -m "feat(capture): summarize-only zoomed overlay with ReVisit-this-page save"
```

---

## Final verification

- [ ] **Run the unit suite**

Run: `npm test`
Expected: PASS — all `rv-list-core.test.js` tests plus the existing suites green.

- [ ] **Full manual smoke (load unpacked, reload):**
  1. Header shows logo image + "ReVisit" + Spaces dropdown top-left.
  2. Filter chips: All (default) · To revisit · Revisited · Done; "remind again" lands items under Revisited.
  3. Clicking any tag filters the list.
  4. Detail: zoom (editable) for Summary/Notes; Space switch (enabled spaces only); per-bookmark letter color.
  5. Avatars show category letter + category color.
  6. Multi-select: bulk move (space/category) + delete.
  7. Grouped view shows bucket-jump buttons; flat hides them.
  8. Settings tabs: Account · AI · Appearance · Spaces · Data.
  9. Appearance: default interval (incl. None) + capture popup position (9-grid).
  10. Categories/Tags sub-tabs with shared persistent search + Clear; delete category (reassign) and delete tag work; per-category color picker works.
  11. Summarize-only → zoomed read-only summary → ReVisit this page → seeded Save (regular + YouTube).

---

## Self-review notes (coverage map)

| Spec item | Task |
|---|---|
| Logo + relocate Spaces dropdown | 2 |
| Status chips reorder + default All | 3 |
| Real ReVisited status | 1 (logic), 3 (wiring) |
| Click tag → filter | 4 |
| Detail zoom (editable) summary/notes | 5 |
| Detail space switch (enabled only) | 6 |
| Category-letter avatars + per-cat color + per-bookmark override | 1, 7, 15 |
| Multi-select delete/move | 8 |
| Grouped bucket-nav | 9 |
| Settings tab order | 10 |
| Default interval w/ None | 1, 11 |
| Categories/Tags tabs + shared search | 12 |
| Delete category (non-empty) | 13 |
| Delete tag | 1, 14 |
| Per-category color picker | 15 |
| Capture popup 9-grid position | 16 |
| Summarize-only → ReVisit this page | 17 |
| Per-domain rules | DEFERRED (separate spec) |
