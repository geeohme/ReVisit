# ReVisit Browser Extension PRD

## Overview
ReVisit is a Chrome browser extension for managing bookmarks with AI-powered categorization and summarization. It uses the Claude Haiku API to process web pages, generating summaries, categories, and tags. Data is stored in browser localStorage. The extension provides an intuitive UI for adding, viewing, editing, and revisiting bookmarks with status tracking and priority views.

**Target Users**: Users who need to organize and revisit web content efficiently, such as researchers, students, or professionals.

**Key Goals**:
- Simplify bookmark management with AI insights.
- Enable customizable categories, tags, notes, and revisit scheduling.
- Provide search, filtering, and priority views for overdue items.
- Ensure all data is local and exportable.

**Tech Stack Assumptions** (for coding agent):
- Chrome Extension APIs: `chrome.action`, `chrome.storage.local`, `chrome.tabs`.
- UI: HTML/CSS/JS (vanilla or lightweight framework like no dependencies for simplicity).
- API: Fetch to Anthropic Claude Haiku endpoint (user must provide API key via onboarding).
- Storage: `chrome.storage.local` for all data (JSON-serialized).
- No external libraries unless specified; keep bundle small.

## Core Features

### 1. Extension Icon Menu
- Clicking the RV icon in the browser toolbar opens a context menu with two items:
  - **ReVisit this Page**: Triggers bookmark addition for the current tab (see Section 2).
  - **ReVisit List**: Opens the main list modal (see Section 3).

### 2. Adding a Bookmark ("ReVisit this Page")
- **Trigger**: User clicks "ReVisit this Page" from icon menu on the current tab.
- **Process**:
  1. Capture: URL, page title (from `document.title`), and scrape page content (e.g., `<body>` innerText, truncated to ~2000 chars for API limits).
  2. Retrieve existing categories from localStorage (initially from onboarding; grows dynamically).
  3. Send to Claude Haiku API:
     - **Prompt Template**:
       ```
       Summarize the following webpage content in under 200 words using markdown. Categorize it: Use an existing category if fitting (existing: [LIST_EXISTING_CATEGORIES]), else suggest a new one. Generate up to 10 relevant tags.
       
       Content: [SCRAPED_CONTENT]
       ```
     - API Response Expected (JSON-structured for parsing):
       - `summary`: Markdown-formatted string (<200 words).
       - `category`: Single string (existing or new).
       - `tags`: Array of up to 10 strings.
  4. If new category suggested, add it to localStorage categories list (deduplicate).
  5. Store in localStorage as a bookmark object:
     ```json
     {
       id: unique UUID (e.g., timestamp + random),
       url: string,
       title: string (page's self-defined title),
       category: string,
       summary: string (markdown),
       tags: string[] (up to 10),
       userNotes: string (initially empty),
       addedTimestamp: number (Date.now()),
       revisitBy: string (ISO date, default from user settings, e.g., +7 days),
       status: "Active" (enum: "Active", "ReVisited", "Complete"),
       history: [] (array of { timestamp: number, action: "ReVisited" | "Complete" | "Keep" })
     }
     ```
  6. Open overlay modal (centered, semi-transparent backdrop, ~500px wide):
     - Display: Markdown-rendered summary, category (as text), tags (comma-separated or chips).
     - Editable Fields:
       - Textarea for user notes (save on blur/submit).
       - Edit summary (textarea, markdown support).
       - Edit tags (input for add/remove, comma-separated).
       - Category dropdown (existing categories + "Other" for new).
       - ReVisit By date picker (defaults to user-defined interval, e.g., 7 days from now).
     - Buttons: Save (updates localStorage), Cancel (discards changes).
- **Error Handling**: If API fails, store without AI data and prompt user to retry or manual entry.

### 3. ReVisit List Modal
- **Trigger**: User clicks "ReVisit List" from icon menu.
- **UI Layout**: Full-window overlay (matches current tab size, z-index high, esc to close).
  - **Top Bar**:
    - Search bar (left): Filters all data by keyword (searches title, summary, notes, tags, category; case-insensitive).
    - Export button (left of search): Downloads JSON file of all bookmarks/categories/settings.
    - ReVisit Priority button (right): Toggles priority view (see Section 4).
  - **Three-Column Layout** (responsive; progressive reveal on clicks):
    1. **Categories Column** (left, ~20% width):
       - List of categories alphabetically (include "All" as first).
       - Clicking a category filters Column 2.
       - Right-click on link in Column 2 opens context menu: "Delete" (confirms and removes from storage).
    2. **Links Column** (middle, ~30% width):
       - For selected category ("All" shows everything).
       - List items: Title (hyperlinked? no, just text) + ReVisit By date (formatted, e.g., "2023-12-01").
       - Sorted: Primarily by ReVisit By (ascending, overdue first), secondarily by title alphabetical.
       - Next to each: "ReVisit" button (opens link in new tab; see Section 5).
       - Filters: Dropdown or buttons for status (default: "Active"; options: Active, ReVisited, Complete).
    3. **Details Column** (right, ~50% width):
       - For selected link: Rendered markdown summary + user notes (below).
       - History: If present, list at bottom (e.g., "ReVisited on [date]" bullets).
       - Edit button: Opens inline editor (similar to add modal: edit all fields except addedTimestamp; save updates storage).
       - Delete button: Confirms and removes entry.
- **Data Loading**: On open, load from localStorage; re-render on search/filter changes.
- **Empty State**: If no bookmarks, show "Add your first ReVisit via the icon menu."

### 4. ReVisit Priority View
- **Trigger**: Click "ReVisit Priority" button (toggles on/off; highlights when active).
- **Behavior**:
  - Overrides standard sorting/filtering.
  - Prioritizes items in Column 2:
    - Highest: No history records (never revisited) AND past/near ReVisit By (e.g., overdue or within 3 days).
    - Medium: Has history but incomplete (status != "Complete") AND past/near ReVisit By.
    - Low: Others.
  - Visual: Highlight rows (e.g., red border for overdue, yellow for nearing); sort by priority descending.
  - "Nearing" definition: Within user-configurable threshold (default 3 days; store in settings).

### 5. ReVisit Action and Status Management
- **Trigger**: Click "ReVisit" button next to a link in Column 2.
- **Behavior**:
  - Opens the URL in a new tab (or current, user preference? default new).
  - Injects a small, movable floating modal (draggable, ~200x100px, bottom-right default) on the new tab:
    - Buttons:
      - **ReVisit Complete**: Sets status to "Complete", adds { timestamp: Date.now(), action: "Complete" } to history. Closes modal, updates list if open.
      - **Keep in ReVisit**: Sets status to "ReVisited", adds { timestamp: Date.now(), action: "ReVisited" } to history. Optionally resets ReVisit By to new date (prompt for date picker). Closes modal.
    - Modal persists until action or close (close = no change).
- **History Display**: In Details Column, show chronological list (e.g., "2023-11-15: ReVisited", "2023-12-01: Complete").
- **Status Filtering**: Applies to Column 2; "Active" = no revisits or pending.

### 6. Onboarding (First Run)
- **Trigger**: On extension install/first activation (check localStorage flag).
- **Modal**: Stepper UI (multi-page overlay):
  1. Welcome: Enter user name (stored for personalization, e.g., greetings).
  2. Interests: Input list of starting categories (comma-separated or add buttons; e.g., "Tech, Books, Research"). Saves as initial categories array.
  3. Settings: Default ReVisit interval (dropdown: 7 days, 1 month, etc.; store as number of days).
  4. API Key: Prompt for Anthropic Claude Haiku API key (store securely in localStorage).
- **Completion**: Set flag to skip future onboarding; redirect to ReVisit List (empty).

## Data Storage
- **Schema** (all in `chrome.storage.local` under key "rvData"):
  ```json
  {
    bookmarks: BookmarkObject[],  // Array as defined in Section 2
    categories: string[],         // Dynamic list, alphabetical
    settings: {
      userName: string,
      defaultIntervalDays: number (e.g., 7),
      apiKey: string,
      onboardingComplete: boolean,
      priorityThresholdDays: number (default 3)
    }
  }
  ```
- **Backup Export**: Button generates `rv-backup-[timestamp].json` with full "rvData".
- **Persistence**: All changes sync to storage on edit/save; load on extension/modals open.
- **Limits**: Monitor localStorage quota (~5MB); warn if nearing (not implemented in v1).

## UI/UX Guidelines
- **Modals**: Use shadow DOM or iframes for isolation; responsive (mobile-friendly but Chrome focus).
- **Markdown Rendering**: Simple parser (e.g., bold, lists, links) or library like marked.js if bundle allows.
- **Icons/Branding**: Simple RV logo (e.g., clock + bookmark); use Chrome's popup.html for menu.
- **Accessibility**: ARIA labels, keyboard nav (e.g., esc closes modals, arrows in lists).
- **Edge Cases**: Handle no API key (disable AI adds), offline (queue adds), duplicate URLs (prompt merge? v1: allow duplicates).

## Implementation Notes for Coding Agent
- **Manifest.json**: Version 3, permissions: `storage`, `activeTab`, `scripting` (for injection/modal).
- **Background Script**: Handle icon menu, storage sync.
- **Content Script**: For scraping and floating modal injection on ReVisit.
- **Popup Script**: For icon menu handling.
- **API Integration**: Use `fetch` with Anthropic endpoint; parse JSON response.
- **Testing**: Unit tests for storage, API integration; e2e for modals, LLM Prompt adherence.
- **Version**: v1.0; future: Sync across devices via chrome.storage.sync.

This PRD provides a complete blueprint; implement iteratively starting with storage, Anthropic Claude Haiku 4.5 integration, and add flow.