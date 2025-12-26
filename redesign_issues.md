# ReVisit Redesign Issues & Progress

## The Good
- Light/Dark modes look good.
- General 2-column + overlay layout is correct.
- Unsaved changes protection works.

## The Bad (Issues to Fix)

### 1. Search Bar Styling
- [ ] **Issue:** Search magnifying glass icon is huge and below the input.
- [ ] **Fix:** Resize icon to match input height, place it next to/inside the input using flexbox/positioning.

### 2. Bookmark List Functionality
- [ ] **Issue:** Missing "ReVisit" button (link to open page) in the bookmark list.
- [ ] **Fix:** Add a "ReVisit" button/icon to each list item in `renderLinks()`.

### 3. Settings Modal
- [ ] **Issue:** Displays below the bookmark list instead of as a popup.
- [ ] **Issue:** Settings button and internal modal buttons do not work.
- [ ] **Fix:** Check CSS for `.settings-overlay` (ensure `fixed` positioning works). Verify event listeners in `list-modal.js`.

### 4. Priority View
- [ ] **Issue:** Priority View button does nothing.
- [ ] **Fix:** Verify `priorityView` logic in `renderLinks()` and event listener in `list-modal.js`.

### 5. "ReVisit this Page" Button
- [ ] **Issue:** Not working (possibly related to Settings modal or content script injection).
- [ ] **Fix:** Debug `content.js` injection and message passing.

### 6. Bookmark Detail Styling & Markdown
- [ ] **Issue:** Header info (Title, Category, etc.) is in a single column and looks bad.
- [ ] **Issue:** Markdown displays as a single block of text (no line breaks).
- [ ] **Fix:**
    -   Refactor `.detail-header` and `.metadata-grid` CSS for better layout (grid/flex).
    -   Update `renderMarkdown` to handle newlines (`.replace(/\n/g, '<br>')`) and ensure CSS allows line breaks (`white-space: pre-wrap`).

## Context & Notes
- **Styles:** `styles.css`
- **Logic:** `list-modal.js`
- **Structure:** `list-modal.html`
- **Content Script:** `content.js`
