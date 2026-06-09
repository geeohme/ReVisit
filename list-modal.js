// Main list modal logic
let bookmarks = [];
let categories = [];
let settings = {};
let spaces = [];
let rvLocal = { enabledSpaceIds: [], defaultSpaceId: '', lastUsedListSpaceId: '' };
let activeSpaceId = '';
let settingsSpaceId = '';
let selectedCategory = 'All';
let selectedTag = null;
let sortMode = 'due';
let searchQuery = '';
let statusFilter = 'All';
let priorityView = false;
let currentBookmarkId = null;
let isDirty = false;

function markDirty(rec) {
  rec._dirty = true;
  rec.updatedAt = new Date().toISOString();
  return rec;
}

// Load shared utilities from utils.js
// Note: sendMessageWithRetry, isYouTubeUrl, extractVideoId are available from utils.js

/**
 * Provider model configurations
 */
const PROVIDER_MODELS = {
  groq: [
    { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B (Recommended)' },
    { id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70B (Versatile)' },
    { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B (Ultra Fast)' },
    { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B (Long Context)' }
  ],
  anthropic: [
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (Latest)' },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus (Flagship)' },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku (Fast)' }
  ],
  openai: [
    { id: 'gpt-4', name: 'GPT-4 (Most Capable)' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo (Faster, Cheaper)' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo (Fast, Cost-Effective)' }
  ],
  google: [
    { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (Experimental)' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Most Capable)' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Fast, Efficient)' }
  ],
  deepseek: [
    { id: 'deepseek-chat', name: 'Deepseek Chat' },
    { id: 'deepseek-coder', name: 'Deepseek Coder (Specialized)' }
  ],
  perplexity: [
    { id: 'llama-3.1-sonar-large-128k-online', name: 'Sonar Large (Online Search)' },
    { id: 'llama-3.1-sonar-small-128k-online', name: 'Sonar Small (Online)' },
    { id: 'llama-3.1-sonar-large-128k-chat', name: 'Sonar Large (Chat)' }
  ],
  xai: [
    { id: 'grok-beta', name: 'Grok Beta' }
  ]
};

function getDefaultSettings() {
  return {
    enabled: true,
    apiKey: '',
    transactions: {
      youtubeSummary: { provider: 'groq', model: 'openai/gpt-oss-120b' },
      transcriptFormatting: { provider: 'groq', model: 'openai/gpt-oss-120b' },
      pageSummary: { provider: 'groq', model: 'openai/gpt-oss-120b' }
    }
  };
}

function catKey(c) { return c.spaceId + ' ' + c.name; }

async function init() {
  // Theme Initialization — theme.js (loaded in <head>) already applied the
  // persisted scheme + light/dark. Just reflect the dark state in the toggle.
  document.getElementById('checkbox').checked = RvTheme.getTheme() === 'dark';

  // Load data
  const data = await chrome.storage.local.get(['rvData', 'rvLocal']);
  const rvData = data.rvData || { bookmarks: [], categories: [], settings: {}, spaces: [] };
  bookmarks = rvData.bookmarks || [];
  categories = migrateCategoriesFormat(rvData.categories || []);
  settings = rvData.settings || {};
  spaces = rvData.spaces || [];
  rvLocal = data.rvLocal || { enabledSpaceIds: [], defaultSpaceId: '', lastUsedListSpaceId: '' };
  const liveSpaces = spaces.filter(s => !s.deletedAt).sort((a, b) => (a.priority || 0) - (b.priority || 0));
  activeSpaceId = rvLocal.lastUsedListSpaceId || rvLocal.defaultSpaceId || (liveSpaces[0] && liveSpaces[0].id) || '';

  await runSetupGateIfNeeded();

  // Initial Render
  renderCategories();
  renderLinks();
  renderSpaceSelector();

  // Event Listeners
  setupEventListeners();

  // Live-refresh the list when a background sync pull writes new data to storage.
  // (The page otherwise only reads rvData once, at init.)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.rvData || !changes.rvData.newValue) return;
    const nv = changes.rvData.newValue;
    // Re-render only when the stored content actually differs from what's in memory.
    // Content comparison (rather than a self-write flag) robustly ignores the page's
    // own writes without the flag-leak/race a boolean guard has: a no-op save can't
    // strand the flag, and a background pull landing mid-save can't be suppressed.
    // (Errs toward an extra harmless render, never a missed update.)
    const same = JSON.stringify(nv.bookmarks || []) === JSON.stringify(bookmarks)
              && JSON.stringify(nv.categories || []) === JSON.stringify(categories)
              && JSON.stringify(nv.spaces || []) === JSON.stringify(spaces);
    if (same) return;
    bookmarks = nv.bookmarks || [];
    categories = migrateCategoriesFormat(nv.categories || []);
    settings = nv.settings || {};
    spaces = nv.spaces || [];
    renderCategories();
    renderLinks();
  });

  // Check for URL params (e.g. open specific bookmark)
  const urlParams = new URLSearchParams(window.location.search);
  const editBookmarkId = urlParams.get('editBookmark');
  if (editBookmarkId) {
    const bookmark = bookmarks.find(b => b.id === editBookmarkId);
    if (bookmark) {
      openDetailOverlay(bookmark);
    }
  }
}

function setupEventListeners() {
  // Theme Toggle (light/dark) — delegate to the shared theme controller.
  document.getElementById('checkbox').addEventListener('change', (e) => {
    RvTheme.setTheme(e.target.checked ? 'dark' : 'light');
  });

  // Appearance — color scheme picker (Paper & Ink / Quiet Focus / Confident System)
  // and a light/dark mode select that mirrors the header toggle.
  const schemeSel = document.getElementById('scheme-select');
  const modeSel = document.getElementById('mode-select');
  if (schemeSel) {
    schemeSel.value = RvTheme.getScheme();
    schemeSel.addEventListener('change', (e) => RvTheme.setScheme(e.target.value));
  }
  if (modeSel) {
    modeSel.value = RvTheme.getTheme();
    modeSel.addEventListener('change', (e) => RvTheme.setTheme(e.target.value));
  }
  // Keep every theme control in sync when the theme changes from anywhere.
  window.addEventListener('rv-theme-change', (e) => {
    const cb = document.getElementById('checkbox');
    if (cb) cb.checked = e.detail.theme === 'dark';
    if (schemeSel) schemeSel.value = e.detail.scheme;
    if (modeSel) modeSel.value = e.detail.theme;
  });

  // Spaces — header selector + (Spaces are now managed inline in the Settings modal)
  document.getElementById('space-selector').addEventListener('change', onSpaceSelectorChange);
  document.getElementById('add-space-btn').addEventListener('click', onAddSpace);
  // Categories editor layer (pops over the Spaces tab inside the modal).
  document.getElementById('cats-back-btn').addEventListener('click', hideCategoriesLayer);

  // Search & Filter
  document.getElementById('search-input').addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase();
    renderLinks();
  });

  // Sort control
  const sortSel = document.getElementById('sort-select');
  if (sortSel) {
    sortSel.value = sortMode;
    sortSel.addEventListener('change', (e) => { sortMode = e.target.value; renderLinks(); });
  }

  document.querySelectorAll('.filter-tabs button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-tabs button').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      statusFilter = e.target.dataset.filter; // Use data-filter attribute
      renderLinks();
    });
  });

  // View toggle: grouped-by-due (default) vs flat list by date.
  const priorityBtn = document.getElementById('priority-btn');
  priorityBtn.textContent = 'Flat list';
  priorityBtn.title = 'Toggle grouped / flat view';
  priorityBtn.addEventListener('click', (e) => {
    priorityView = !priorityView; // true = flat
    e.target.classList.toggle('active', priorityView);
    e.target.textContent = priorityView ? 'Grouped' : 'Flat list';
    renderLinks();
  });

  // Close any open row action menu when clicking elsewhere.
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.bk-kebab')) closeRowMenus();
  });

  // Close App
  document.getElementById('close-btn').addEventListener('click', () => window.close());

  // Overlay Actions
  document.getElementById('close-overlay-btn').addEventListener('click', closeDetailOverlay);
  document.getElementById('save-bookmark-btn').addEventListener('click', saveCurrentBookmark);
  document.getElementById('delete-bookmark-btn').addEventListener('click', deleteCurrentBookmark);

  // Zoom overlay — open from Summary/Notes headings, close via button or backdrop
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

  // Settings — open/close only. The section handlers (toggle instructions, the REAL
  // Test Connection = testGatewayConnection, save, etc.) are bound in
  // setupSettingsEventListeners() each time the panel opens. (The old init-time
  // duplicates + the mock "Connection successful!" test have been removed.)
  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('settings-close-btn').addEventListener('click', closeSettings);

  // Settings - Add Category is bound via add-category-btn.onclick = handleAddCategory
  // (Space-scoped). The old inline listener here pushed a spaceId-less category and
  // is removed so a single click can't create a duplicate, broken category row.

  // Tag Input in Overlay
  document.getElementById('new-tag-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(e.target.value);
      e.target.value = '';
    }
  });

  // Track changes in overlay fields
  const trackDirty = () => { isDirty = true; };
  document.getElementById('detail-title').addEventListener('input', trackDirty);
  document.getElementById('detail-category').addEventListener('change', trackDirty);
  document.getElementById('detail-revisit').addEventListener('change', trackDirty);
  document.getElementById('detail-status').addEventListener('change', trackDirty);

  // Detail overlay: quick reschedule chips set (or clear) the Revisit By date.
  const reschedule = document.getElementById('detail-reschedule');
  if (reschedule) {
    reschedule.addEventListener('click', (e) => {
      const chip = e.target.closest('.rs-chip');
      if (!chip) return;
      const input = document.getElementById('detail-revisit');
      if (chip.dataset.clear) {
        input.value = '';
      } else {
        const d = new Date();
        d.setDate(d.getDate() + parseInt(chip.dataset.days, 10));
        input.value = d.toISOString().split('T')[0];
      }
      isDirty = true;
    });
  }
  // Markdown editors track dirty on blur/input
}

// --- Rendering Functions ---

function renderCategories() {
  const container = document.getElementById('categories-list');
  container.innerHTML = '';

  // "All" Category
  const allItem = document.createElement('div');
  allItem.className = `category-item ${selectedCategory === 'All' ? 'active' : ''}`;
  allItem.innerHTML = `<span class="category-name">All</span><span class="category-count">(${bookmarks.filter(b => b.spaceId === activeSpaceId && !b.deletedAt).length})</span>`;
  allItem.addEventListener('click', () => selectCategory('All'));
  container.appendChild(allItem);

  // Dynamic Categories — scoped to the active Space.
  const scoped = categories.filter(c => c.spaceId === activeSpaceId && !c.deletedAt);
  const sortedCategories = [...scoped].sort((a, b) => a.priority - b.priority);
  sortedCategories.forEach(cat => {
    const catName = cat.name;
    const count = bookmarks.filter(b => b.spaceId === activeSpaceId && b.category === catName).length;
    const item = document.createElement('div');
    item.className = `category-item ${selectedCategory === catName ? 'active' : ''}`;
    item.innerHTML = `<span class="category-name">${catName}</span><span class="category-count">(${count})</span>`;
    item.addEventListener('click', () => selectCategory(catName));
    container.appendChild(item);
  });

  renderTagFilter();
}

function selectCategory(catName) {
  selectedCategory = catName;
  renderCategories();
  renderLinks();
}

function renderLinks() {
  const container = document.getElementById('links-list');
  container.innerHTML = '';

  let filtered = bookmarks.filter(b => {
    if (b.deletedAt) return false; // hide soft-deleted (tombstoned) bookmarks
    if (b.spaceId !== activeSpaceId) return false; // show only the active Space
    if (selectedCategory !== 'All' && b.category !== selectedCategory) return false;
    if (statusFilter !== 'All' && b.status !== statusFilter) return false;
    if (selectedTag && !(b.tags || []).includes(selectedTag)) return false;
    if (searchQuery) {
      const searchText = `${b.title} ${b.summary} ${b.userNotes} ${b.tags.join(' ')}`.toLowerCase();
      if (!searchText.includes(searchQuery)) return false;
    }
    return true;
  });

  filtered.sort(SORTERS[sortMode] || SORTERS.due);

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state">Nothing here yet.</div>';
    return;
  }

  // Group into due buckets only when sorting by due date and not in flat mode;
  // any other sort renders a single flat list in the chosen order.
  if (sortMode !== 'due' || priorityView) {
    filtered.forEach(b => container.appendChild(buildBookmarkRow(b)));
    return;
  }

  const groups = {};
  DUE_BUCKETS.forEach(g => { groups[g.key] = []; });
  filtered.forEach(b => { groups[getDueInfo(b).key].push(b); });
  DUE_BUCKETS.forEach(g => {
    const items = groups[g.key];
    if (!items.length) return;
    const head = document.createElement('div');
    head.className = `bucket-h ${g.key}`;
    head.innerHTML = `<span class="bucket-lbl">${g.label}</span><span class="bucket-ct">${items.length}</span><span class="bucket-ln"></span>`;
    container.appendChild(head);
    items.forEach(b => container.appendChild(buildBookmarkRow(b)));
  });
}

// --- Bookmark row: due state, summary preview, Open + actions menu ---

const DUE_BUCKETS = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'today',   label: 'Today' },
  { key: 'week',    label: 'This week' },
  { key: 'later',   label: 'Later' },
  { key: 'someday', label: 'Someday' },
];

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Strip light markdown so the list preview reads as plain prose.
function stripMarkdown(s) {
  return String(s || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^[>#\s-]+/gm, '')
    .replace(/[*_]{1,3}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hostOf(b) { try { return new URL(b.url).hostname.replace(/^www\./, ''); } catch { return ''; } }
function faviconLetter(b) { const h = hostOf(b); return (h && h[0] ? h[0] : '•').toUpperCase(); }
// Deterministic per-site tile colour so each domain reads consistently at a glance.
const FAV_COLORS = ['#3E7C5A', '#C8801E', '#7159B5', '#2F6FE4', '#D6492B', '#0E7C86', '#B5346F', '#4B7A1E'];
function faviconColor(b) {
  const key = hostOf(b) || b.title || '';
  let n = 0;
  for (let i = 0; i < key.length; i++) n = (n + key.charCodeAt(i)) % FAV_COLORS.length;
  return FAV_COLORS[n];
}
function addDaysISO(base, days) { return new Date(base.getTime() + days * 86400000).toISOString(); }

// Returns { key (bucket), label (chip text), cls } from revisitBy.
function getDueInfo(b) {
  if (!b.revisitBy) return { key: 'someday', label: 'Someday', cls: 'someday' };
  const due = new Date(b.revisitBy);
  if (isNaN(due)) return { key: 'someday', label: 'Someday', cls: 'someday' };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diff = Math.round((dueDay - today) / 86400000);
  if (diff < 0) return { key: 'overdue', label: `Overdue ${-diff}d`, cls: 'overdue' };
  if (diff === 0) return { key: 'today', label: 'Due today', cls: 'today' };
  if (diff <= 7) return { key: 'week', label: `Due in ${diff}d`, cls: 'week' };
  return { key: 'later', label: `Due ${due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`, cls: 'later' };
}

function dueSortKey(b) {
  if (!b.revisitBy) return Number.MAX_SAFE_INTEGER;
  const t = new Date(b.revisitBy).getTime();
  return isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}

const tsOf = (v) => { const t = v ? new Date(v).getTime() : 0; return isNaN(t) ? 0 : t; };
const SORTERS = {
  due: (a, b) => dueSortKey(a) - dueSortKey(b),
  added: (a, b) => tsOf(b.addedTimestamp) - tsOf(a.addedTimestamp),
  updated: (a, b) => tsOf(b.updatedAt || b.addedTimestamp) - tsOf(a.updatedAt || a.addedTimestamp),
  title: (a, b) => String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' }),
  category: (a, b) => String(a.category || '').localeCompare(String(b.category || ''), undefined, { sensitivity: 'base' }) || (dueSortKey(a) - dueSortKey(b)),
};

// Sidebar tag filter — chips for every tag present in the active Space.
// (Named renderTagFilter to avoid colliding with renderTags(), which renders the
// editable tag pills inside the detail overlay.)
function renderTagFilter() {
  const container = document.getElementById('tags-list');
  if (!container) return;
  const counts = new Map();
  bookmarks.forEach(b => {
    if (b.deletedAt || b.spaceId !== activeSpaceId) return;
    (b.tags || []).forEach(t => counts.set(t, (counts.get(t) || 0) + 1));
  });
  const tags = [...counts.keys()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  container.innerHTML = '';
  if (!tags.length) {
    container.innerHTML = '<span class="tag-empty">No tags yet</span>';
    return;
  }
  // Clear-filter chip when a tag is active.
  if (selectedTag) {
    const clear = document.createElement('button');
    clear.className = 'tag-chip clear';
    clear.textContent = '✕ Clear';
    clear.addEventListener('click', () => applyTagFilter(null));
    container.appendChild(clear);
  }
  tags.forEach(t => {
    const chip = document.createElement('button');
    chip.className = `tag-chip${selectedTag === t ? ' on' : ''}`;
    chip.textContent = t;
    chip.addEventListener('click', () => applyTagFilter(selectedTag === t ? null : t));
    container.appendChild(chip);
  });
}

// Centralised "filter the list by this tag" used by card chips, detail chips, and the sidebar.
async function applyTagFilter(tag) {
  // If the detail overlay is open, close it through the normal path so the isDirty
  // guard runs (and currentBookmarkId/isDirty get reset). If the user cancels the
  // discard prompt, the overlay stays open — abort the filter.
  const ov = document.getElementById('detail-overlay');
  if (ov && ov.classList.contains('active')) {
    await closeDetailOverlay();
    if (ov.classList.contains('active')) return;
  }
  selectedTag = tag || null;
  renderTagFilter();
  renderLinks();
  document.getElementById('links-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeRowMenus() {
  document.querySelectorAll('.bk-menu.open').forEach(m => m.classList.remove('open'));
  // Drop the elevated stacking context so a closed row can't sit above its neighbours.
  document.querySelectorAll('.bk-card.menu-open').forEach(c => c.classList.remove('menu-open'));
  document.querySelectorAll('.bk-kebab-btn[aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded', 'false'));
}

function buildBookmarkRow(bookmark) {
  const due = getDueInfo(bookmark);
  const item = document.createElement('article');
  item.className = `bk-card ${due.cls}`;
  const cat = bookmark.category
    ? `<span class="chip chip-cat">${escapeHtml(bookmark.category)}</span>` : '';
  const preview = stripMarkdown(bookmark.summary);
  const summary = preview ? `<p class="bk-summary">${escapeHtml(preview)}</p>` : '';
  const added = bookmark.addedTimestamp
    ? `<span class="bk-added">added ${new Date(bookmark.addedTimestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>` : '';
  const tagChips = (bookmark.tags || []).length
    ? `<div class="bk-tags">${bookmark.tags.map(t =>
        `<span class="bk-tag" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</span>`).join('')}</div>`
    : '';
  item.innerHTML = `
    <div class="bk-main">
      <div class="bk-fav" aria-hidden="true" style="background:${faviconColor(bookmark)}">${escapeHtml(faviconLetter(bookmark))}</div>
      <div class="bk-body">
        <a class="bk-title" href="${escapeHtml(bookmark.url)}" target="_blank" rel="noopener">${escapeHtml(bookmark.title || 'Untitled')}</a>
        <div class="bk-meta">
          <span class="bk-host">${escapeHtml(hostOf(bookmark))}</span>
          ${cat}
          <span class="chip chip-due ${due.cls}">${escapeHtml(due.label)}</span>
          ${added}
        </div>
        ${summary}
        ${tagChips}
      </div>
      <div class="bk-actions">
        <button class="bk-open" title="Open the page (marks it done)">Open</button>
        <div class="bk-kebab">
          <button class="bk-kebab-btn" aria-haspopup="true" aria-expanded="false" aria-label="More actions">⋯</button>
          <div class="bk-menu" role="menu">
            <button data-act="revisit" role="menuitem">Revisited — remind again</button>
            <div class="bk-menu-head">Snooze until…</div>
            <button data-act="snooze" data-days="1" role="menuitem">Tomorrow</button>
            <button data-act="snooze" data-days="7" role="menuitem">Next week</button>
            <button data-act="snooze" data-days="30" role="menuitem">Next month</button>
            <div class="bk-menu-sep"></div>
            <button data-act="done" role="menuitem">Done</button>
            <button data-act="delete" class="danger" role="menuitem">Delete</button>
          </div>
        </div>
      </div>
    </div>`;

  // Clicking the card body (not the title link or the action cluster) opens the editor.
  item.addEventListener('click', (e) => {
    if (e.target.closest('.bk-actions') || e.target.closest('.bk-title')) return;
    openDetailOverlay(bookmark);
  });
  // Title link AND Open button open the page — and mark it done (ReVisit's model:
  // once you actually go read it, the reminder is fulfilled).
  const openIt = (e) => { e.preventDefault(); e.stopPropagation(); handleRowAction(bookmark.id, 'open'); };
  item.querySelector('.bk-title').addEventListener('click', openIt);
  item.querySelector('.bk-open').addEventListener('click', openIt);

  const kebab = item.querySelector('.bk-kebab-btn');
  const menu = item.querySelector('.bk-menu');
  kebab.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasOpen = menu.classList.contains('open');
    closeRowMenus();
    if (!wasOpen) {
      menu.classList.add('open');
      item.classList.add('menu-open'); // raise this row above its neighbours
      kebab.setAttribute('aria-expanded', 'true');
    }
  });
  menu.querySelectorAll('button[data-act]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeRowMenus();
      handleRowAction(bookmark.id, btn.dataset.act, btn.dataset.days);
    });
  });
  item.querySelectorAll('.bk-tag').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation(); // don't open the detail overlay
      applyTagFilter(el.dataset.tag);
    });
  });
  return item;
}

// Apply a ReVisit action to a bookmark using the SAME saveData() LWW + push path
// the editor uses — no new sync logic, no background message needed.
async function handleRowAction(id, act, days) {
  const b = bookmarks.find(x => x.id === id);
  if (!b) return;
  const now = new Date();
  if (act === 'open') {
    // Fire the window.open synchronously (within the click gesture) before any await.
    window.open(b.url, '_blank', 'noopener');
    b.status = 'Complete';
    pushHistory(b, 'Opened from list — marked Done');
    await saveData();
    showToast('Opened — marked done', 'success');
  } else if (act === 'revisit') {
    const iv = RvListCore.resolveInterval(settings);
    const t = RvListCore.revisitTransition(now, iv);
    b.status = t.status; // 'ReVisited'
    if (t.revisitBy !== undefined) b.revisitBy = t.revisitBy; // null interval keeps existing date
    pushHistory(b, iv == null ? 'ReVisited' : `ReVisited — reminder in ${iv}d`);
    await saveData();
    showToast(iv == null ? 'Revisited' : `Revisited — back in ${iv} day${iv === 1 ? '' : 's'}`, 'success');
  } else if (act === 'snooze') {
    const d = parseInt(days, 10) || 1;
    b.revisitBy = addDaysISO(now, d);
    if (b.status === 'Complete') b.status = 'Active';
    pushHistory(b, `Snoozed ${d}d`);
    await saveData();
    showToast(`Snoozed ${d} day${d === 1 ? '' : 's'}`, 'success');
  } else if (act === 'done') {
    b.status = 'Complete';
    pushHistory(b, 'Marked Complete');
    await saveData();
    showToast('Marked done', 'success');
  } else if (act === 'delete') {
    b.deletedAt = now.toISOString();
    b.updatedAt = now.toISOString();
    b._dirty = true;
    b.status = 'Deleted';
    await saveData();
    showToast('Deleted', 'success');
  }
  renderLinks();
  renderCategories();
}

function pushHistory(b, action) {
  b.history = b.history || [];
  b.history.push({ timestamp: Date.now(), action });
}

// --- Detail Overlay Logic ---

async function openDetailOverlay(bookmark) {
  if (isDirty) {
    const ok = await rvConfirm('Discard unsaved changes?', 'You have unsaved changes. Discard them?', { confirmText: 'Discard', danger: true });
    if (!ok) return;
  }

  currentBookmarkId = bookmark.id;
  isDirty = false;

  // Populate Fields
  document.getElementById('detail-title').value = bookmark.title;
  // revisitBy can be null ("Someday") — guard the split.
  document.getElementById('detail-revisit').value = bookmark.revisitBy ? bookmark.revisitBy.split('T')[0] : '';
  document.getElementById('detail-status').value = bookmark.status;
  // Point the "open page" link at this bookmark's URL.
  const openLink = document.getElementById('detail-open-link');
  if (openLink) openLink.href = bookmark.url;

  // Categories Dropdown — scoped to THIS bookmark's Space so a reassign can't pick
  // a category name from another Space (which would orphan the (spaceId, name) pair).
  const catSelect = document.getElementById('detail-category');
  catSelect.innerHTML = categories.filter(c => c.spaceId === bookmark.spaceId && !c.deletedAt).map(c => `<option value="${c.name}" ${c.name === bookmark.category ? 'selected' : ''}>${c.name}</option>`).join('');

  // Space reassignment — limited to Spaces enabled on THIS install (plus the
  // bookmark's current space, so it always shows even if not locally enabled).
  const spaceSel = document.getElementById('detail-space');
  const enabledIds = new Set(rvLocal.enabledSpaceIds || []);
  spaceSel.innerHTML = spaces
    .filter(s => !s.deletedAt && (enabledIds.has(s.id) || s.id === bookmark.spaceId))
    .map(s => `<option value="${s.id}" ${s.id === bookmark.spaceId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`)
    .join('');
  spaceSel.onchange = () => {
    isDirty = true;
    // Repopulate the category dropdown for the newly-selected space so the user
    // never sees categories that belong to a different space (mirrors content.js).
    const catSelect = document.getElementById('detail-category');
    catSelect.innerHTML = categories
      .filter(c => c.spaceId === spaceSel.value && !c.deletedAt)
      .map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`)
      .join('');
  };

  // Tags
  renderTags(bookmark.tags);

  // Markdown Editors
  setupMarkdownEditor('detail-summary', bookmark.summary);
  setupMarkdownEditor('detail-notes', bookmark.userNotes || '');

  // Show Overlay
  document.getElementById('detail-overlay').classList.add('active');
}

async function closeDetailOverlay() {
  // Close any open zoom overlay first so it can't linger over a dismissed detail view.
  if (document.getElementById('zoom-overlay')?.classList.contains('active')) closeZoom();
  if (isDirty) {
    const ok = await rvConfirm('Discard unsaved changes?', 'You have unsaved changes. Discard them?', { confirmText: 'Discard', danger: true });
    if (!ok) return;
  }
  document.getElementById('detail-overlay').classList.remove('active');
  currentBookmarkId = null;
  isDirty = false;
}

// Zoom a markdown field into a large editable overlay. Edits sync back live to the
// source contenteditable so the existing save path persists them unchanged.
//
// setupMarkdownEditor stores raw markdown in element.dataset.raw.  When the field is
// focused it shows element.textContent (raw); when blurred it renders HTML back into
// element.innerHTML and keeps dataset.raw up-to-date.  saveCurrentBookmark reads
// dataset.raw (falling back to textContent when the element is focused).
//
// openZoom therefore:
//   1. Reads dataset.raw as the authoritative raw markdown source.
//   2. Sets zoom-editor's textContent to that raw text (stays editable).
//   3. On every input, writes zoom-editor.textContent back to src.dataset.raw so
//      Save picks it up, and also updates src.textContent in case the source field
//      is currently focused (though it won't be while zoom is open).
//   4. closeZoom re-renders the source field so it shows formatted markdown again
//      (matching the normal onblur behaviour of setupMarkdownEditor).

let zoomSourceId = null;

function openZoom(targetId, title) {
  const src = document.getElementById(targetId);
  if (!src) return;
  zoomSourceId = targetId;
  const editor = document.getElementById('zoom-editor');
  document.getElementById('zoom-title').textContent = title;
  // If the source field is currently focused it's in raw-text mode and its
  // in-progress edits live in textContent (not yet flushed to dataset.raw).
  // Flush first so zoom opens with the latest text, not a stale value.
  if (document.activeElement === src) src.dataset.raw = src.textContent;
  // Use dataset.raw as the single source of truth for raw markdown.
  editor.textContent = src.dataset.raw || '';
  editor.oninput = () => {
    const raw = editor.textContent;
    src.dataset.raw = raw;
    // Keep src.textContent in sync in case it's focused (shouldn't happen normally).
    if (document.activeElement === src) {
      src.textContent = raw;
    }
    isDirty = true;
  };
  document.getElementById('zoom-overlay').classList.add('active');
  editor.focus();
}

function closeZoom() {
  document.getElementById('zoom-overlay').classList.remove('active');
  // Re-render the source field as formatted markdown (mirrors setupMarkdownEditor onblur).
  if (zoomSourceId) {
    const src = document.getElementById(zoomSourceId);
    if (src) {
      src.innerHTML = renderMarkdown(src.dataset.raw || '');
    }
  }
  // Detach the oninput handler to avoid stale closures.
  const editor = document.getElementById('zoom-editor');
  if (editor) editor.oninput = null;
  zoomSourceId = null;
}

function renderTags(tags) {
  const container = document.getElementById('detail-tags');
  container.innerHTML = ''; // Clear existing tags

  tags.forEach(tag => {
    const tagEl = document.createElement('span');
    tagEl.className = 'tag';
    tagEl.innerHTML = `<span class="tag-label">${escapeHtml(tag)}</span> <span class="tag-remove">×</span>`;
    const label = tagEl.querySelector('.tag-label');
    label.style.cursor = 'pointer';
    label.title = 'Filter list by this tag';
    label.addEventListener('click', () => applyTagFilter(tag));
    tagEl.querySelector('.tag-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      removeTag(tag);
    });
    container.appendChild(tagEl);
  });
}

function addTag(tag) {
  const bookmark = bookmarks.find(b => b.id === currentBookmarkId);
  if (bookmark && !bookmark.tags.includes(tag)) {
    bookmark.tags.push(tag);
    renderTags(bookmark.tags);
    isDirty = true;
  }
}

function removeTag(tag) {
  const bookmark = bookmarks.find(b => b.id === currentBookmarkId);
  if (bookmark) {
    bookmark.tags = bookmark.tags.filter(t => t !== tag);
    renderTags(bookmark.tags);
    isDirty = true;
  }
}

// --- Markdown Logic ---

function setupMarkdownEditor(elementId, initialText) {
  const element = document.getElementById(elementId);
  
  // Store raw text in a property
  element.dataset.raw = initialText;
  
  // Initial Render
  element.innerHTML = renderMarkdown(initialText);

  // Focus: Switch to Raw
  element.onfocus = () => {
    element.textContent = element.dataset.raw;
  };

  // Blur: Switch to Rendered and Save
  element.onblur = () => {
    const newText = element.textContent;
    if (newText !== element.dataset.raw) {
      isDirty = true;
      element.dataset.raw = newText;
    }
    element.innerHTML = renderMarkdown(newText);
  };
}

function renderMarkdown(text) {
  if (!text) return '';

  const escapeHtml = (s) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const escapeAttr = (s) => escapeHtml(s).replace(/"/g, '&quot;');

  // Inline formatting: applied to already-escaped text.
  // Order matters: images before links, bold before italic, code spans first
  // (their contents must skip other inline processing).
  const renderInline = (s) => {
    const codeSpans = [];
    s = s.replace(/`([^`\n]+)`/g, (_, c) => {
      codeSpans.push(`<code>${c}</code>`);
      return ` ${codeSpans.length - 1} `;
    });
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g,
      (_, alt, src) => `<img alt="${escapeAttr(alt)}" src="${escapeAttr(src)}" />`);
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,
      (_, label, href) => `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`);
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^_\w])_([^_\n]+)_/g, '$1<em>$2</em>');
    s = s.replace(/ (\d+) /g, (_, i) => codeSpans[Number(i)]);
    return s;
  };

  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;

  // List state stack: each entry is { type: 'ul'|'ol', indent: number }
  const listStack = [];
  const closeListsTo = (indent) => {
    while (listStack.length && listStack[listStack.length - 1].indent >= indent) {
      out.push(`</li></${listStack.pop().type}>`);
    }
  };
  const closeAllLists = () => {
    while (listStack.length) out.push(`</li></${listStack.pop().type}>`);
  };

  // Paragraph buffer
  let paraBuf = [];
  const flushPara = () => {
    if (paraBuf.length) {
      out.push(`<p>${renderInline(escapeHtml(paraBuf.join('\n')))}</p>`);
      paraBuf = [];
    }
  };

  // Blockquote buffer
  let quoteBuf = [];
  const flushQuote = () => {
    if (quoteBuf.length) {
      out.push(`<blockquote>${renderMarkdown(quoteBuf.join('\n'))}</blockquote>`);
      quoteBuf = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fence = line.match(/^\s*(```+|~~~+)\s*([\w-]*)\s*$/);
    if (fence) {
      flushPara(); flushQuote(); closeAllLists();
      const marker = fence[1];
      const lang = fence[2];
      const codeLines = [];
      i++;
      while (i < lines.length && !new RegExp(`^\\s*${marker[0]}{${marker.length},}\\s*$`).test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // consume closing fence (if present)
      const cls = lang ? ` class="language-${escapeAttr(lang)}"` : '';
      out.push(`<pre><code${cls}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    // Blank line
    if (/^\s*$/.test(line)) {
      flushPara();
      flushQuote();
      closeAllLists();
      i++;
      continue;
    }

    // ATX heading
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (heading) {
      flushPara(); flushQuote(); closeAllLists();
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(escapeHtml(heading[2]))}</h${level}>`);
      i++;
      continue;
    }

    // Setext heading (=== or ---)
    if (i + 1 < lines.length && paraBuf.length === 0) {
      const next = lines[i + 1];
      if (/^\s{0,3}=+\s*$/.test(next) && line.trim() !== '') {
        flushQuote(); closeAllLists();
        out.push(`<h1>${renderInline(escapeHtml(line.trim()))}</h1>`);
        i += 2;
        continue;
      }
    }

    // Horizontal rule
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushPara(); flushQuote(); closeAllLists();
      out.push('<hr />');
      i++;
      continue;
    }

    // Blockquote
    const bq = line.match(/^\s{0,3}>\s?(.*)$/);
    if (bq) {
      flushPara(); closeAllLists();
      quoteBuf.push(bq[1]);
      i++;
      continue;
    } else {
      flushQuote();
    }

    // List item (unordered or ordered)
    const listMatch = line.match(/^(\s*)(?:([-*+])|(\d+)[.)])\s+(.*)$/);
    if (listMatch) {
      flushPara();
      const indent = listMatch[1].length;
      const type = listMatch[2] ? 'ul' : 'ol';
      const content = listMatch[4];

      // Pop deeper-or-equal lists with different type
      while (listStack.length) {
        const top = listStack[listStack.length - 1];
        if (top.indent > indent || (top.indent === indent && top.type !== type)) {
          out.push(`</li></${listStack.pop().type}>`);
        } else {
          break;
        }
      }

      const top = listStack[listStack.length - 1];
      if (!top || top.indent < indent) {
        out.push(`<${type}>`);
        listStack.push({ type, indent });
      } else {
        // same level, close previous <li>
        out.push('</li>');
      }

      out.push(`<li>${renderInline(escapeHtml(content))}`);
      i++;
      continue;
    }

    // Paragraph line — but a non-list line at column 0 ends any open list
    if (listStack.length && /^\S/.test(line)) closeAllLists();

    paraBuf.push(line);
    i++;
  }

  flushPara();
  flushQuote();
  closeAllLists();

  return out.join('\n');
}

// --- Data Persistence ---

async function saveCurrentBookmark() {
  if (!currentBookmarkId) return;

  const bookmark = bookmarks.find(b => b.id === currentBookmarkId);
  if (!bookmark) return;

  // Update fields
  bookmark.title = document.getElementById('detail-title').value;
  bookmark.category = document.getElementById('detail-category').value;
  // Empty date is allowed — store null (Someday) rather than throwing on Invalid Date.
  const dv = document.getElementById('detail-revisit').value;
  bookmark.revisitBy = dv ? new Date(dv).toISOString() : null;
  bookmark.status = document.getElementById('detail-status').value;
  
  // Update Markdown fields from dataset.raw (ensure we get the latest edits)
  // If element is currently focused, we need to grab textContent, otherwise dataset.raw
  const summaryEl = document.getElementById('detail-summary');
  const notesEl = document.getElementById('detail-notes');
  
  bookmark.summary = document.activeElement === summaryEl ? summaryEl.textContent : summaryEl.dataset.raw;
  bookmark.userNotes = document.activeElement === notesEl ? notesEl.textContent : notesEl.dataset.raw;

  // Tags are already updated in the bookmark object by addTag/removeTag
  // but we need to ensure we save the current state

  // Space reassignment — if changed, clear category when it doesn't exist in the
  // destination space (to avoid a dangling (spaceId, name) pair).
  const newSpaceId = document.getElementById('detail-space').value;
  const movedToAnotherSpace = newSpaceId && newSpaceId !== bookmark.spaceId;
  if (movedToAnotherSpace) {
    bookmark.spaceId = newSpaceId;
    const catOk = categories.some(c => c.spaceId === newSpaceId && c.name === bookmark.category && !c.deletedAt);
    if (!catOk) bookmark.category = '';
  }

  await saveData();
  isDirty = false;
  showToast('Bookmark saved!', 'success');
  // A bookmark moved to another Space no longer belongs to the current view — close
  // the overlay so the user isn't left looking at an orphaned record.
  if (movedToAnotherSpace) {
    document.getElementById('detail-overlay').classList.remove('active');
    currentBookmarkId = null;
  }
  renderLinks(); // Refresh list
  renderCategories(); // Refresh counts
}

async function deleteCurrentBookmark() {
  const ok = await rvConfirm('Delete this bookmark?', 'This bookmark will be removed.', { confirmText: 'Delete', danger: true });
  if (!ok) return;

  const now = new Date().toISOString();
  bookmarks = bookmarks.map(b =>
    b.id === currentBookmarkId ? { ...b, deletedAt: now, updatedAt: now, _dirty: true, status: 'Deleted' } : b
  );
  await saveData();
  closeDetailOverlay();
  renderLinks();
  renderCategories();
  showToast('Bookmark deleted.', 'success');
}

async function saveData() {
  // Stamp ONLY records whose content actually changed (per-record LWW). A blanket
  // stamp would let an unrelated edit overwrite a newer cloud edit on another device.
  const now = new Date().toISOString();
  const prev = (await chrome.storage.local.get('rvData')).rvData || {};
  bookmarks = RvSyncCore.stampChangedList(prev.bookmarks || [], bookmarks, 'id', now);
  categories = RvSyncCore.stampChangedList(prev.categories || [], categories, catKey, now);
  spaces = RvSyncCore.stampChangedList(prev.spaces || [], spaces, 'id', now);
  await chrome.storage.local.set({ rvData: { bookmarks, categories, settings, spaces } });
  // Trigger a push if logged in (fire-and-forget via background).
  chrome.runtime.sendMessage({ action: 'syncPush' }).catch(() => {});
}

// --- Settings Functions ---

/**
 * Open settings modal and populate with current settings
 */
function openSettings() {
  const overlay = document.getElementById('settings-overlay');
  overlay.classList.add('active');

  // Initialize llmGateway settings if not present
  if (!settings.llmGateway) {
    settings.llmGateway = getDefaultSettings();
  }

  // Populate fields
  document.getElementById('gateway-api-key').value = settings.llmGateway.apiKey || '';

  // Populate Ollama fields
  document.getElementById('ollama-local-url').value = settings.ollama?.localBaseUrl || '';
  document.getElementById('ollama-cloud-api-key').value = settings.ollama?.cloudApiKey || '';

  // Render categories
  renderCategoriesSettings();

  // If we have stored models data, populate dropdowns dynamically
  const modelsData = settings.llmGateway.modelsData;
  if (modelsData) {
    populateProviderDropdowns(modelsData);

    // Set selected values
    const youtubeConfig = settings.llmGateway.transactions?.youtubeSummary || { provider: 'groq', model: 'openai/gpt-oss-120b' };
    const transcriptConfig = settings.llmGateway.transactions?.transcriptFormatting || { provider: 'groq', model: 'openai/gpt-oss-120b' };
    const pageConfig = settings.llmGateway.transactions?.pageSummary || { provider: 'groq', model: 'openai/gpt-oss-120b' };

    document.getElementById('youtube-provider').value = youtubeConfig.provider;
    updateModelDropdownFromGateway('youtube-model', youtubeConfig.provider, modelsData);
    document.getElementById('youtube-model').value = youtubeConfig.model;

    document.getElementById('transcript-provider').value = transcriptConfig.provider;
    updateModelDropdownFromGateway('transcript-model', transcriptConfig.provider, modelsData);
    document.getElementById('transcript-model').value = transcriptConfig.model;

    document.getElementById('page-provider').value = pageConfig.provider;
    updateModelDropdownFromGateway('page-model', pageConfig.provider, modelsData);
    document.getElementById('page-model').value = pageConfig.model;
  } else {
    // Fallback to static models if no gateway data
    const youtubeConfig = settings.llmGateway.transactions?.youtubeSummary || { provider: 'groq', model: 'openai/gpt-oss-120b' };
    document.getElementById('youtube-provider').value = youtubeConfig.provider;
    updateModelDropdown('youtube-model', youtubeConfig.provider, youtubeConfig.model);

    const transcriptConfig = settings.llmGateway.transactions?.transcriptFormatting || { provider: 'groq', model: 'openai/gpt-oss-120b' };
    document.getElementById('transcript-provider').value = transcriptConfig.provider;
    updateModelDropdown('transcript-model', transcriptConfig.provider, transcriptConfig.model);

    const pageConfig = settings.llmGateway.transactions?.pageSummary || { provider: 'groq', model: 'openai/gpt-oss-120b' };
    document.getElementById('page-provider').value = pageConfig.provider;
    updateModelDropdown('page-model', pageConfig.provider, pageConfig.model);
  }

  // Global default model + Advanced disclosure state.
  initGlobalModel();

  // Spaces tab (inline) + ensure the categories layer starts closed.
  renderSpacesTab();
  hideCategoriesLayer();

  // Build/refresh the tab bar and default to Appearance.
  activeSettingsTab = 'appearance';
  buildSettingsTabs();

  // Setup event listeners
  setupSettingsEventListeners();

  refreshAccountUI();
}

// --- Settings tabs ---

const SETTINGS_TABS = [
  { id: 'appearance', label: 'Appearance', sections: ['appearance-section'] },
  { id: 'ai',         label: 'AI',         sections: ['gateway-section', 'ollama-section', 'aiprovider-section'] },
  { id: 'account',    label: 'Account',    sections: ['account-section'] },
  { id: 'spaces',     label: 'Spaces',     sections: ['spaces-section'] },
  { id: 'data',       label: 'Data',       sections: ['backup-section'] },
];
let activeSettingsTab = 'appearance';

function showSettingsTab(tabId) {
  const tab = SETTINGS_TABS.find(t => t.id === tabId) || SETTINGS_TABS[0];
  activeSettingsTab = tab.id;
  const shown = new Set(tab.sections);
  SETTINGS_TABS.forEach(t => t.sections.forEach(sid => {
    const el = document.getElementById(sid);
    if (el) el.style.display = shown.has(sid) ? '' : 'none';
  }));
  document.querySelectorAll('#settings-tabs .settings-tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab.id));
}

function buildSettingsTabs() {
  const bar = document.getElementById('settings-tabs');
  if (!bar) return;
  bar.innerHTML = SETTINGS_TABS.map(t =>
    `<button class="settings-tab-btn${t.id === activeSettingsTab ? ' active' : ''}" data-tab="${t.id}" role="tab">${t.label}</button>`
  ).join('');
  bar.querySelectorAll('.settings-tab-btn').forEach(b =>
    b.addEventListener('click', () => showSettingsTab(b.dataset.tab)));
  showSettingsTab(activeSettingsTab);
}

// --- Global default model (drives the three per-task selects) ---

function initGlobalModel() {
  const gp = document.getElementById('global-provider');
  const gm = document.getElementById('global-model');
  if (!gp || !gm) return;
  const md = settings.llmGateway && settings.llmGateway.modelsData;
  // Mirror the provider options already built for the per-task selects.
  const src = document.getElementById('youtube-provider');
  if (src) gp.innerHTML = src.innerHTML;
  const tx = (settings.llmGateway && settings.llmGateway.transactions) || {};
  const y = tx.youtubeSummary || { provider: 'groq', model: 'openai/gpt-oss-120b' };
  const t = tx.transcriptFormatting || y;
  const p = tx.pageSummary || y;
  gp.value = y.provider;
  if (md) updateModelDropdownFromGateway('global-model', y.provider, md);
  else updateModelDropdown('global-model', y.provider, y.model);
  gm.value = y.model;
  // Reveal Advanced only when the three tasks already differ.
  const same = y.provider === t.provider && y.model === t.model
            && y.provider === p.provider && y.model === p.model;
  const adv = document.getElementById('advanced-models');
  if (adv) adv.open = !same;
}

function syncGlobalToAll() {
  const gp = document.getElementById('global-provider');
  const gm = document.getElementById('global-model');
  if (!gp || !gm) return;
  const md = settings.llmGateway && settings.llmGateway.modelsData;
  ['youtube', 'transcript', 'page'].forEach(key => {
    const ps = document.getElementById(key + '-provider');
    if (ps) ps.value = gp.value;
    if (md) updateModelDropdownFromGateway(key + '-model', gp.value, md);
    else updateModelDropdown(key + '-model', gp.value);
    const ms = document.getElementById(key + '-model');
    if (ms) ms.value = gm.value;
  });
}

/**
 * Close settings modal
 */
function closeSettings() {
  hideCategoriesLayer();
  document.getElementById('settings-overlay').classList.remove('active');
}

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

/**
 * Setup event listeners for settings panel
 */
function setupSettingsEventListeners() {
  // Close settings
  document.getElementById('settings-close-btn').onclick = closeSettings;

  // Toggle instructions
  document.getElementById('toggle-instructions-btn').onclick = () => {
    const instructions = document.getElementById('api-key-instructions');
    instructions.style.display = instructions.style.display === 'none' ? 'block' : 'none';
  };

  // Test connection (REAL gateway check via background — not the old mock)
  document.getElementById('test-connection-btn').onclick = testGatewayConnection;

  // Ollama buttons
  document.getElementById('test-ollama-connection-btn').onclick = testOllamaConnection;
  document.getElementById('refresh-ollama-models-btn').onclick = refreshOllamaModels;

  // Provider change listeners - update model dropdowns
  const modelsData = settings.llmGateway?.modelsData;

  // Global default model drives the three per-task selects.
  const gProv = document.getElementById('global-provider');
  const gModel = document.getElementById('global-model');
  if (gProv) gProv.onchange = () => {
    if (modelsData) updateModelDropdownFromGateway('global-model', gProv.value, modelsData);
    else updateModelDropdown('global-model', gProv.value);
    syncGlobalToAll();
    persistAiSettings();
  };
  if (gModel) gModel.onchange = () => { syncGlobalToAll(); persistAiSettings(); };

  document.getElementById('youtube-provider').onchange = (e) => {
    if (modelsData) updateModelDropdownFromGateway('youtube-model', e.target.value, modelsData);
    else updateModelDropdown('youtube-model', e.target.value);
    persistAiSettings();
  };
  document.getElementById('transcript-provider').onchange = (e) => {
    if (modelsData) updateModelDropdownFromGateway('transcript-model', e.target.value, modelsData);
    else updateModelDropdown('transcript-model', e.target.value);
    persistAiSettings();
  };
  document.getElementById('page-provider').onchange = (e) => {
    if (modelsData) updateModelDropdownFromGateway('page-model', e.target.value, modelsData);
    else updateModelDropdown('page-model', e.target.value);
    persistAiSettings();
  };

  // Auto-save AI text/model fields on change (no Save button — saved as you go).
  ['gateway-api-key', 'ollama-local-url', 'ollama-cloud-api-key', 'youtube-model', 'transcript-model', 'page-model']
    .forEach(id => { const el = document.getElementById(id); if (el) el.onchange = persistAiSettings; });

  // Backup data
  document.getElementById('export-data-btn').onclick = exportData;

  // Restore data
  document.getElementById('import-data-btn').onclick = importData;

  // Add category
  document.getElementById('add-category-btn').onclick = handleAddCategory;

  // Account / auth
  const signinBtn  = document.getElementById('auth-signin-btn');
  const signupBtn  = document.getElementById('auth-signup-btn');
  const signoutBtn = document.getElementById('auth-signout-btn');
  if (signinBtn)  signinBtn.onclick  = () => handleAuth('authSignIn');
  if (signupBtn)  signupBtn.onclick  = () => handleAuth('authSignUp');
  if (signoutBtn) signoutBtn.onclick = handleSignOut;

  const syncNowBtn = document.getElementById('sync-now-btn');
  if (syncNowBtn) syncNowBtn.onclick = async () => {
    const statusEl = document.getElementById('sync-status');
    if (statusEl) statusEl.textContent = 'Syncing…';
    await chrome.runtime.sendMessage({ action: 'syncNow' });
    if (statusEl) statusEl.textContent = 'Synced ✓';
  };
}

/**
 * Update model dropdown based on selected provider
 */
function updateModelDropdown(dropdownId, provider, selectedModel = null) {
  const dropdown = document.getElementById(dropdownId);
  dropdown.innerHTML = '';

  const models = PROVIDER_MODELS[provider] || [];
  models.forEach(model => {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.name;
    if (model.id === selectedModel) {
      option.selected = true;
    }
    dropdown.appendChild(option);
  });

  // If no model selected, select first
  if (!selectedModel && models.length > 0) {
    dropdown.value = models[0].id;
  }
}

/**
 * Update model dropdown based on provider (using gateway models data)
 */
function updateModelDropdownFromGateway(dropdownId, provider, modelsData) {
  const dropdown = document.getElementById(dropdownId);
  const currentValue = dropdown.value;
  dropdown.innerHTML = '';

  if (!modelsData || !modelsData[provider]) {
    console.warn('No models data available for provider:', provider);
    return;
  }

  const models = modelsData[provider].models || [];
  models.forEach(modelObj => {
    const option = document.createElement('option');
    option.value = modelObj.id;
    option.textContent = `${modelObj.id}`;
    dropdown.appendChild(option);
  });

  // Restore selected value if it exists
  if (models.find(m => m.id === currentValue)) {
    dropdown.value = currentValue;
  } else if (models.length > 0) {
    dropdown.value = models[0].id;
  }
}

/**
 * Populate provider/model dropdowns dynamically from gateway models data
 */
function populateProviderDropdowns(modelsData) {
  console.log('DEBUG: Populating provider dropdowns with models data');

  // Build provider options from modelsData
  const providers = Object.keys(modelsData);
  const providerDropdowns = [
    document.getElementById('youtube-provider'),
    document.getElementById('transcript-provider'),
    document.getElementById('page-provider')
  ];

  // Update each provider dropdown
  providerDropdowns.forEach(dropdown => {
    const currentValue = dropdown.value;
    dropdown.innerHTML = '';

    providers.forEach(provider => {
      const option = document.createElement('option');
      option.value = provider;
      option.textContent = getProviderDisplayName(provider);
      dropdown.appendChild(option);
    });

    // Restore selected value if it exists
    if (providers.includes(currentValue)) {
      dropdown.value = currentValue;
    }
  });

  // Update model dropdowns based on selected providers
  updateModelDropdownFromGateway('youtube-model', document.getElementById('youtube-provider').value, modelsData);
  updateModelDropdownFromGateway('transcript-model', document.getElementById('transcript-provider').value, modelsData);
  updateModelDropdownFromGateway('page-model', document.getElementById('page-provider').value, modelsData);
}

/**
 * Get display name for provider
 */
function getProviderDisplayName(provider) {
  const names = {
    'ollama-local': 'Ollama (Local)',
    'ollama-cloud': 'Ollama Cloud',
    groq: 'Groq (Fast Inference)',
    anthropic: 'Anthropic (Claude)',
    openai: 'OpenAI',
    google: 'Google AI (Gemini)',
    deepseek: 'Deepseek',
    perplexity: 'Perplexity',
    xai: 'xAI (Grok)',
    sambanova: 'SambaNova',
    moonshot: 'Moonshot',
    qwen: 'Alibaba/Qwen',
    cohere: 'Cohere',
    mistral: 'Mistral',
    cerebras: 'Cerebras',
    together: 'Together AI',
    featherai: 'Feather AI',
    openrouter: 'OpenRouter'
  };
  return names[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
}

/**
 * Test LLM Gateway connection (via background service worker)
 */
async function testGatewayConnection() {
  const apiKey = document.getElementById('gateway-api-key').value.trim();

  if (!apiKey) {
    showToast('Please enter an API key first', 'error');
    return;
  }

  showToast('Testing connection...', 'info');

  try {
    // Call background service worker to test connection
    const response = await chrome.runtime.sendMessage({
      action: 'testGatewayConnection',
      apiKey: apiKey
    });

    if (response.success) {
      showToast(`✅ Connection successful!`, 'success');

      // Store the models data for dynamic dropdown population
      if (response.modelsData) {
        settings.llmGateway = settings.llmGateway || {};
        settings.llmGateway.modelsData = response.modelsData;
        await saveData();

        // Refresh dropdowns with new models data
        populateProviderDropdowns(response.modelsData);
        showToast('✅ Models loaded successfully!', 'success');
      }
    } else {
      showToast(`❌ Connection failed: ${response.message}`, 'error');
    }
  } catch (error) {
    showToast(`❌ Test failed: ${error.message}`, 'error');
  }
}

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

    if (!response) {
      showToast('❌ No response from extension background', 'error');
      return;
    }

    if (response.success) {
      showToast(`✅ ${response.message}`, 'success');
    } else {
      showToast(`❌ ${response.message}`, 'error');
    }
  } catch (error) {
    showToast(`❌ Test failed: ${error.message}`, 'error');
  }
}

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

    if (!response) {
      showToast('❌ No response from extension background', 'error');
      return;
    }

    if (response.success) {
      // Merge returned modelsData into local settings and refresh dropdowns
      settings.llmGateway = settings.llmGateway || {};
      settings.llmGateway.modelsData = response.modelsData;
      settings.ollama = settings.ollama || {};
      settings.ollama.modelsLastUpdated = new Date().toISOString();
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

/**
 * Save settings to storage
 */
// Auto-saved (no Save button): persist the AI tab's gateway + ollama settings.
// Whatever is on screen is written; the runtime validates an actual API call.
async function persistAiSettings() {
  const apiKey = document.getElementById('gateway-api-key').value.trim();

  // Build settings object (preserve modelsData if it exists)
  const existingModelsData = settings.llmGateway?.modelsData;

  settings.llmGateway = {
    enabled: true,
    apiKey: apiKey,
    modelsData: existingModelsData, // PRESERVE MODELS DATA
    transactions: {
      youtubeSummary: {
        provider: document.getElementById('youtube-provider').value,
        model: document.getElementById('youtube-model').value,
        options: {
          temperature: 0.7,
          maxTokens: 10000
        }
      },
      transcriptFormatting: {
        provider: document.getElementById('transcript-provider').value,
        model: document.getElementById('transcript-model').value,
        options: {
          temperature: 0.3,
          maxTokens: 64000
        }
      },
      pageSummary: {
        provider: document.getElementById('page-provider').value,
        model: document.getElementById('page-model').value,
        options: {
          temperature: 0.7,
          maxTokens: 2500
        }
      }
    }
  };

  // Save Ollama settings via the shared helper (same logic as onboarding).
  // Local is enabled only when a URL is provided; cloud only when a key is.
  settings.ollama = buildOllamaSettings(
    document.getElementById('ollama-local-url').value,
    document.getElementById('ollama-cloud-api-key').value,
    settings.ollama?.modelsLastUpdated
  );

  await saveData();
}

/**
 * Render categories in settings panel
 */
// --- Spaces: header selector ---

function renderSpaceSelector() {
  const sel = document.getElementById('space-selector');
  if (!sel) return;
  const enabled = new Set(rvLocal.enabledSpaceIds || []);
  const live = RvSpacesCore.liveSpaces(spaces).filter(s => enabled.has(s.id));
  sel.innerHTML = live.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  if (live.find(s => s.id === activeSpaceId)) sel.value = activeSpaceId;
  else if (live[0]) { activeSpaceId = live[0].id; sel.value = activeSpaceId; }
}

async function onSpaceSelectorChange(e) {
  activeSpaceId = e.target.value;
  selectedCategory = 'All';                 // reset view state for the new Space
  selectedTag = null;
  rvLocal.lastUsedListSpaceId = activeSpaceId;
  await chrome.storage.local.set({ rvLocal }); // rvLocal ONLY — never rvData
  renderCategories();
  renderLinks();
}

// --- Spaces: manager panel open/close ---

// Render the inline Spaces tab (called when the settings modal opens).
function renderSpacesTab() {
  const live = RvSpacesCore.liveSpaces(spaces);
  settingsSpaceId = (live.find(s => s.id === activeSpaceId) && activeSpaceId) || (live[0] && live[0].id) || '';
  renderSpacesList();
  renderSpacesInstallList();
}

// Categories editor pops over the Spaces tab inside the modal (and resizes it).
function showCategoriesLayer(spaceId) {
  settingsSpaceId = spaceId;
  renderSpaceCategoryEditor();
  const layer = document.getElementById('settings-cats-layer');
  layer.classList.add('active');
  layer.setAttribute('aria-hidden', 'false');
  document.querySelector('.settings-modal').classList.add('cats-open');
}
function hideCategoriesLayer() {
  const layer = document.getElementById('settings-cats-layer');
  layer.classList.remove('active');
  layer.setAttribute('aria-hidden', 'true');
  document.querySelector('.settings-modal').classList.remove('cats-open');
}

// --- Spaces: Zone A — definitions list (rename / priority / delete + counts) ---

function renderSpacesList() {
  const container = document.getElementById('spaces-list');
  container.innerHTML = '';
  const live = RvSpacesCore.liveSpaces(spaces);
  live.forEach(s => {
    const count = bookmarks.filter(b => b.spaceId === s.id && !b.deletedAt).length;
    const row = document.createElement('div');
    row.className = 'space-row';
    row.innerHTML = `
      <input type="text" class="space-name-input" data-id="${s.id}" value="${escapeHtml(s.name)}">
      <span class="space-count">${count}</span>
      <input type="number" class="space-priority-input" data-id="${s.id}" value="${s.priority}" min="1" max="100">
      <button class="space-edit-cats settings-btn settings-btn-secondary" data-id="${s.id}">Categories</button>
      <button class="space-delete" data-id="${s.id}" aria-label="Delete Space" title="Delete Space">
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    `;
    row.querySelector('.space-name-input').addEventListener('change', onRenameSpace);
    row.querySelector('.space-priority-input').addEventListener('change', onSpacePriorityChange);
    row.querySelector('.space-edit-cats').addEventListener('click', () => showCategoriesLayer(s.id));
    row.querySelector('.space-delete').addEventListener('click', () => onDeleteSpace(s.id));
    container.appendChild(row);
  });
}

async function onAddSpace() {
  const input = document.getElementById('new-space-name');
  const name = input.value.trim();
  if (!name) { showToast('Enter a Space name', 'error'); return; }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  spaces.push(RvSpacesCore.makeSpace(id, name, RvSpacesCore.nextSpacePriority(spaces), now));
  await saveData();
  input.value = '';
  // A brand-new Space is auto-available here (so it can be selected/used immediately).
  if (!rvLocal.enabledSpaceIds.includes(id)) rvLocal.enabledSpaceIds.push(id);
  if (!rvLocal.defaultSpaceId) rvLocal.defaultSpaceId = id;
  await chrome.storage.local.set({ rvLocal });
  renderSpacesList(); renderSpacesInstallList(); renderSpaceSelector();
  showToast('Space added', 'success');
}

async function onRenameSpace(e) {
  const id = e.target.dataset.id;
  const name = e.target.value.trim();
  if (!name) { renderSpacesList(); return; }
  spaces = spaces.map(s => s.id === id ? { ...s, name } : s);
  await saveData();
  renderSpaceSelector(); renderSpacesInstallList();
  showToast('Space renamed', 'success');
}

async function onSpacePriorityChange(e) {
  const id = e.target.dataset.id;
  const p = parseInt(e.target.value);
  if (isNaN(p) || p < 1 || p > 100) { showToast('Priority 1–100', 'error'); renderSpacesList(); return; }
  spaces = spaces.map(s => s.id === id ? { ...s, priority: p } : s);
  await saveData();
  renderSpacesList(); renderSpaceSelector();
}

async function onDeleteSpace(id) {
  const live = RvSpacesCore.liveSpaces(spaces);
  const others = live.filter(s => s.id !== id);
  const target = others[0];

  // In-app dialog with a radio choice (replaces the old type-"reassign"/"delete" prompt).
  const body = document.createElement('div');
  body.className = 'rv-radio-group';
  body.innerHTML = `
    <label class="rv-radio">
      <input type="radio" name="rv-sp-del" value="reassign" ${target ? 'checked' : 'disabled'}>
      <span>Move its bookmarks to <strong>${target ? escapeHtml(target.name) : '(no other Space)'}</strong></span>
    </label>
    <label class="rv-radio">
      <input type="radio" name="rv-sp-del" value="delete" ${target ? '' : 'checked'}>
      <span>Delete its bookmarks too</span>
    </label>`;
  const ok = await rvDialog({
    title: 'Delete this Space?',
    message: body,
    buttons: [
      { label: 'Cancel', value: false, variant: 'secondary' },
      { label: 'Delete Space', value: true, variant: 'danger' },
    ],
  });
  if (!ok) return;
  const choice = body.querySelector('input[name="rv-sp-del"]:checked').value;
  const now = new Date().toISOString();
  if (choice === 'reassign') {
    if (!target) { showToast('No other Space to reassign to; create one first.', 'error'); return; }
    // Reassign bookmarks; ensure their categories exist under the target Space.
    const targetCatNames = new Set(categories.filter(c => c.spaceId === target.id).map(c => c.name));
    bookmarks = bookmarks.map(b => {
      if (b.spaceId !== id) return b;
      if (b.category && !targetCatNames.has(b.category)) {
        const maxP = categories.filter(c => c.spaceId === target.id).reduce((m, c) => Math.max(m, c.priority || 0), 0);
        categories.push({ spaceId: target.id, name: b.category, priority: maxP + 1 });
        targetCatNames.add(b.category);
      }
      return { ...b, spaceId: target.id };
    });
  } else { // 'delete'
    bookmarks = bookmarks.map(b => b.spaceId === id ? { ...b, deletedAt: now, updatedAt: now, _dirty: true, status: 'Deleted' } : b);
  }
  // Tombstone the Space and its categories.
  spaces = RvSpacesCore.tombstoneSpace(spaces, id, now);
  categories = categories.map(c => c.spaceId === id ? { ...c, deletedAt: now, updatedAt: now, _dirty: true } : c);
  await saveData();
  // Prune from rvLocal; force re-setup if no valid default remains.
  rvLocal.enabledSpaceIds = rvLocal.enabledSpaceIds.filter(x => x !== id);
  if (rvLocal.defaultSpaceId === id) rvLocal.defaultSpaceId = rvLocal.enabledSpaceIds[0] || '';
  if (rvLocal.lastUsedListSpaceId === id) rvLocal.lastUsedListSpaceId = rvLocal.defaultSpaceId;
  await chrome.storage.local.set({ rvLocal });
  if (settingsSpaceId === id) settingsSpaceId = RvSpacesCore.liveSpaces(spaces)[0]?.id || '';
  if (activeSpaceId === id) activeSpaceId = rvLocal.defaultSpaceId;
  renderSpacesList(); renderSpacesInstallList(); renderSpaceSelector();
  renderSpaceCategoryEditor(); renderCategories(); renderLinks();
  showToast('Space deleted', 'success');
}

// --- Spaces: per-Space category editor (operates on settingsSpaceId) ---

function renderSpaceCategoryEditor() {
  const live = RvSpacesCore.liveSpaces(spaces);
  const cur = live.find(s => s.id === settingsSpaceId);
  document.getElementById('space-cats-space-name').textContent = cur ? cur.name : '—';
  renderCategoriesSettings(); // reads settingsSpaceId
}

// --- Spaces: Zone B — install list (writes rvLocal ONLY) ---

function renderSpacesInstallList() {
  const container = document.getElementById('spaces-install-list');
  container.innerHTML = '';
  const live = RvSpacesCore.liveSpaces(spaces);
  live.forEach(s => {
    const enabled = rvLocal.enabledSpaceIds.includes(s.id);
    const isDefault = rvLocal.defaultSpaceId === s.id;
    const row = document.createElement('div');
    row.className = 'space-install-row';
    row.innerHTML = `
      <label><input type="checkbox" class="space-enabled" data-id="${s.id}" ${enabled ? 'checked' : ''}> ${s.name}</label>
      <label><input type="radio" name="space-default" class="space-default" data-id="${s.id}" ${isDefault ? 'checked' : ''}> default</label>
    `;
    row.querySelector('.space-enabled').addEventListener('change', onToggleEnabled);
    row.querySelector('.space-default').addEventListener('change', onSetDefault);
    container.appendChild(row);
  });
}

async function onToggleEnabled(e) {
  const id = e.target.dataset.id;
  if (e.target.checked) {
    if (!rvLocal.enabledSpaceIds.includes(id)) rvLocal.enabledSpaceIds.push(id);
  } else {
    // Cannot disable the current default without choosing another first.
    if (rvLocal.defaultSpaceId === id) {
      showToast('Pick a different default before disabling this Space.', 'error');
      e.target.checked = true; return;
    }
    rvLocal.enabledSpaceIds = rvLocal.enabledSpaceIds.filter(x => x !== id);
  }
  await chrome.storage.local.set({ rvLocal });
  renderSpaceSelector();
}

async function onSetDefault(e) {
  const id = e.target.dataset.id;
  // Invariant: defaultSpaceId MUST be enabled.
  if (!rvLocal.enabledSpaceIds.includes(id)) rvLocal.enabledSpaceIds.push(id);
  rvLocal.defaultSpaceId = id;
  await chrome.storage.local.set({ rvLocal });
  renderSpacesInstallList(); renderSpaceSelector();
}

function renderCategoriesSettings() {
  const container = document.getElementById('categories-settings-list');
  container.innerHTML = '';

  // Sort categories by priority — scoped to the panel's selected Space (skip tombstones).
  const sortedCategories = [...categories]
    .filter(c => c.spaceId === settingsSpaceId && !c.deletedAt)
    .sort((a, b) => a.priority - b.priority);

  sortedCategories.forEach((cat, index) => {
    const catName = typeof cat === 'string' ? cat : cat.name;
    const count = bookmarks.filter(b => b.spaceId === settingsSpaceId && b.category === catName && !b.deletedAt).length;

    const item = document.createElement('div');
    item.className = 'category-settings-item';
    item.draggable = true;
    item.dataset.categoryName = catName;
    item.dataset.spaceId = cat.spaceId;
    item.dataset.categoryIndex = index;

    const delTitle = count > 0 ? 'Empty this category before deleting' : 'Delete category';
    item.innerHTML = `
      <span class="cat-name">${escapeHtml(catName)}</span>
      <span class="cat-count">${count}</span>
      <div class="cat-priority">
        <input type="number" class="cat-priority-input" data-category="${escapeHtml(catName)}"
               value="${cat.priority}" min="1" max="100">
      </div>
      <button class="cat-delete" data-category="${escapeHtml(catName)}" ${count > 0 ? 'disabled' : ''} title="${delTitle}" aria-label="${delTitle}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
      </button>
    `;

    // Add drag event listeners
    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragend', handleDragEnd);
    item.addEventListener('dragover', handleDragOver);
    item.addEventListener('drop', handleDrop);
    item.addEventListener('dragleave', handleDragLeave);

    const delBtn = item.querySelector('.cat-delete');
    delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteCategory(cat.spaceId, catName, count); });

    container.appendChild(item);
  });

  // Add event listeners for priority inputs with instant reordering
  document.querySelectorAll('.cat-priority-input').forEach(input => {
    input.addEventListener('input', handleCategoryPriorityInput); // instant reorder on type
    input.addEventListener('change', handleCategoryPriorityChange); // save on blur
  });
}

// Delete an EMPTY category (tombstone + sync). Non-empty categories are blocked
// (the move-its-bookmarks flow is deferred).
async function deleteCategory(spaceId, name, count) {
  if (count > 0) { showToast('Empty this category before deleting it.', 'error'); return; }
  const ok = await rvConfirm('Delete category?', `Delete the empty category “${name}”?`, { confirmText: 'Delete', danger: true });
  if (!ok) return;
  const now = new Date().toISOString();
  categories = categories.map(c => (c.spaceId === spaceId && c.name === name)
    ? { ...c, deletedAt: now, updatedAt: now, _dirty: true } : c);
  await saveData();
  renderCategoriesSettings();
  renderCategories();
  showToast('Category deleted', 'success');
}

// --- Drag and Drop Handlers ---

let draggedElement = null;

function handleDragStart(e) {
  draggedElement = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', this.innerHTML);
}

function handleDragEnd(e) {
  this.classList.remove('dragging');
  document.querySelectorAll('.category-settings-item').forEach(item => {
    item.classList.remove('drag-over');
  });
}

function handleDragOver(e) {
  if (e.preventDefault) e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  if (this !== draggedElement) this.classList.add('drag-over');
  return false;
}

function handleDragLeave(e) {
  this.classList.remove('drag-over');
}

function handleDrop(e) {
  if (e.stopPropagation) e.stopPropagation();

  if (draggedElement !== this) {
    const draggedCatName = draggedElement.dataset.categoryName;
    const targetCatName = this.dataset.categoryName;
    const sid = this.dataset.spaceId;

    const inSpace = categories.filter(c => c.spaceId === sid);
    const draggedCategory = inSpace.find(c => c.name === draggedCatName);
    const targetCategory  = inSpace.find(c => c.name === targetCatName);

    if (draggedCategory && targetCategory) {
      const reordered = inSpace.slice();
      const di = reordered.findIndex(c => c.name === draggedCatName);
      reordered.splice(di, 1);
      const ti = reordered.findIndex(c => c.name === targetCatName);
      reordered.splice(ti, 0, draggedCategory);
      reordered.forEach((c, i) => { c.priority = i + 1; });
      saveData();
      renderCategoriesSettings();
      renderCategories();
      renderSpacesList();
      showToast('Categories reordered', 'success');
    }
  }
  this.classList.remove('drag-over');
  return false;
}

function handleCategoryPriorityInput(e) {
  const categoryName = e.target.getAttribute('data-category');
  const newPriority = parseInt(e.target.value);

  if (isNaN(newPriority) || newPriority < 1 || newPriority > 100) return;

  const category = categories.find(c => c.spaceId === settingsSpaceId && c.name === categoryName);
  if (category) {
    category.priority = newPriority;
    renderCategoriesSettings();
    renderCategories();
    renderSpacesList();
  }
}

function handleCategoryPriorityChange(e) {
  const newPriority = parseInt(e.target.value);
  if (isNaN(newPriority) || newPriority < 1 || newPriority > 100) {
    showToast('Priority must be between 1 and 100', 'error');
    renderCategoriesSettings();
    return;
  }
  saveData();
  showToast('Category priority saved', 'success');
}

function handleAddCategory() {
  const nameInput = document.getElementById('new-category-name');
  const priorityInput = document.getElementById('new-category-priority');
  const name = nameInput.value.trim();
  const priority = parseInt(priorityInput.value);

  if (!name) {
    showToast('Please enter a category name', 'error');
    return;
  }

  if (isNaN(priority) || priority < 1 || priority > 100) {
    showToast('Priority must be between 1 and 100', 'error');
    return;
  }

  const exists = categories.some(c => c.spaceId === settingsSpaceId && c.name === name);
  if (exists) {
    showToast('Category already exists in this Space', 'error');
    return;
  }

  categories.push({ spaceId: settingsSpaceId, name, priority });
  saveData();
  nameInput.value = '';
  priorityInput.value = '1';
  renderCategoriesSettings();
  renderCategories();
  renderSpacesList();
  showToast('Category added successfully', 'success');
}

async function exportData() {
  const transcriptData = await chrome.storage.local.get('rvTranscripts');
  const transcripts = transcriptData.rvTranscripts || {};
  const data = RvSpacesCore.buildBackupV3({ spaces, bookmarks, categories }, transcripts, new Date().toISOString());
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rv-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('✅ Backup created successfully!', 'success');
}

// Resolve the target Space for a v≤2 (Space-less) backup: pick existing or create new.
function promptLegacyTargetSpace() {
  return new Promise((resolve) => {
    const overlay = document.getElementById('legacy-restore-overlay');
    const sel = document.getElementById('legacy-restore-space-select');
    const newName = document.getElementById('legacy-restore-new-space');
    const live = RvSpacesCore.liveSpaces(spaces);
    sel.innerHTML = live.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    newName.value = '';
    overlay.classList.add('active');
    const cleanup = () => { overlay.classList.remove('active'); };
    document.getElementById('legacy-restore-confirm').onclick = async () => {
      const typed = newName.value.trim();
      if (typed) {
        const now = new Date().toISOString();
        const id = crypto.randomUUID();
        spaces.push(RvSpacesCore.makeSpace(id, typed, RvSpacesCore.nextSpacePriority(spaces), now));
        if (!rvLocal.enabledSpaceIds.includes(id)) rvLocal.enabledSpaceIds.push(id);
        if (!rvLocal.defaultSpaceId) rvLocal.defaultSpaceId = id;
        await chrome.storage.local.set({ rvLocal });
        cleanup(); resolve(id);
      } else if (sel.value) {
        cleanup(); resolve(sel.value);
      } else {
        showToast('Pick a Space or enter a new name.', 'error');
      }
    };
    document.getElementById('legacy-restore-cancel').onclick = () => { cleanup(); resolve(null); };
  });
}

async function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const backupData = JSON.parse(text);
      if (!backupData || typeof backupData !== 'object') throw new Error('Invalid backup file format');
      const ver = RvSyncCore.detectBackupVersion(backupData);
      const now = new Date().toISOString();
      const genUuid = () => crypto.randomUUID();

      if (ver >= 3) {
        const merged = RvSpacesCore.mergeRestoredV3({ spaces, categories, bookmarks }, backupData, now, genUuid);
        spaces = merged.spaces; categories = merged.categories; bookmarks = merged.bookmarks;
        // Auto-enable restored Spaces; set a default if none yet.
        merged.enableSpaceIds.forEach(id => { if (!rvLocal.enabledSpaceIds.includes(id)) rvLocal.enabledSpaceIds.push(id); });
        if (!rvLocal.defaultSpaceId && merged.enableSpaceIds[0]) rvLocal.defaultSpaceId = merged.enableSpaceIds[0];
        if (!rvLocal.lastUsedListSpaceId) rvLocal.lastUsedListSpaceId = rvLocal.defaultSpaceId;
        await chrome.storage.local.set({ rvLocal });
        if (!activeSpaceId) activeSpaceId = rvLocal.defaultSpaceId;
      } else {
        // v≤2: prompt for a target Space, assign it to ALL imported records, then merge.
        const targetId = await promptLegacyTargetSpace();
        if (!targetId) { showToast('Restore cancelled.', 'info'); return; }
        const assigned = RvSpacesCore.assignTargetSpace(
          { bookmarks: backupData.bookmarks || [], categories: migrateCategoriesFormat(backupData.categories || []) },
          targetId);
        bookmarks = RvSyncCore.mergeBackupBookmarks(bookmarks, assigned.bookmarks, genUuid);
        const map = new Map(categories.map(c => [catKey(c), c]));
        assigned.categories.forEach(c => { if (!map.has(catKey(c))) map.set(catKey(c), { ...c, _dirty: true, updatedAt: now }); });
        categories = Array.from(map.values());
        if (!activeSpaceId) activeSpaceId = targetId;
      }

      // Transcripts (version-independent).
      if (backupData.transcripts && typeof backupData.transcripts === 'object') {
        const cur = (await chrome.storage.local.get('rvTranscripts')).rvTranscripts || {};
        for (const [vid, t] of Object.entries(backupData.transcripts)) {
          const stamped = { ...t, updatedAt: t.updatedAt || now, _dirty: true };
          const local = cur[vid] || null;
          cur[vid] = RvSyncCore.mergeRecordLWW(local, stamped);
        }
        await chrome.storage.local.set({ rvTranscripts: cur });
      }

      await saveData();                 // stamps + triggers push
      renderSpaceSelector();
      renderCategories();
      renderLinks();
      showToast(`✅ Restored (v${ver}) and syncing…`, 'success');
    } catch (error) {
      console.error('Import failed:', error);
      showToast(`❌ Import failed: ${error.message}`, 'error');
    }
  };
  input.click();
}

// --- Helpers ---

function migrateCategoriesFormat(cats) {
  if (!cats || cats.length === 0) return [];
  if (typeof cats[0] === 'object') return cats;
  return cats.map((c, i) => ({ name: c, priority: i + 1 }));
}

function getPriorityScore(bookmark) {
  const now = new Date();
  const revisitDate = new Date(bookmark.revisitBy);
  const daysUntil = Math.ceil((revisitDate - now) / (1000 * 60 * 60 * 24));
  
  if (daysUntil < 0) return 100; // Overdue
  if (daysUntil <= 3) return 50; // Near
  return 10;
}

function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast-message ${type} active`;
  setTimeout(() => {
    toast.classList.remove('active');
  }, 3000);
}

// --- In-app dialogs (themed; replace native confirm/prompt) ---

// Generic promise-based dialog. `message` may be a string or a DOM node.
// `buttons`: [{ label, value, variant: 'primary'|'secondary'|'danger' }].
function rvDialog({ title, message, buttons }) {
  return new Promise(resolve => {
    const scrim = document.createElement('div');
    scrim.className = 'rv-dialog-scrim';
    scrim.innerHTML = `
      <div class="rv-dialog" role="dialog" aria-modal="true" aria-label="${title}">
        <h3 class="rv-dialog-title"></h3>
        <div class="rv-dialog-msg"></div>
        <div class="rv-dialog-actions"></div>
      </div>`;
    scrim.querySelector('.rv-dialog-title').textContent = title;
    const msgEl = scrim.querySelector('.rv-dialog-msg');
    if (message instanceof Node) msgEl.appendChild(message);
    else msgEl.textContent = message || '';
    const actions = scrim.querySelector('.rv-dialog-actions');
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); cleanup(null); } };
    const cleanup = (val) => { document.removeEventListener('keydown', onKey, true); scrim.remove(); resolve(val); };
    (buttons || []).forEach(b => {
      const btn = document.createElement('button');
      btn.className = `rv-dialog-btn ${b.variant || 'secondary'}`;
      btn.textContent = b.label;
      btn.addEventListener('click', () => cleanup(b.value));
      actions.appendChild(btn);
    });
    scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) cleanup(null); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(scrim);
    requestAnimationFrame(() => scrim.classList.add('active'));
    const focusBtn = actions.querySelector('.primary, .danger') || actions.querySelector('button');
    if (focusBtn) focusBtn.focus();
  });
}

function rvConfirm(title, message, { confirmText = 'Confirm', danger = false } = {}) {
  return rvDialog({
    title, message,
    buttons: [
      { label: 'Cancel', value: false, variant: 'secondary' },
      { label: confirmText, value: true, variant: danger ? 'danger' : 'primary' },
    ],
  });
}

async function runSetupGateIfNeeded() {
  const decision = RvSpacesCore.setupGateDecision({ spaces }, rvLocal);
  if (decision === 'none') return true;

  const overlay = document.getElementById('setup-gate-overlay');
  const migrateBox = document.getElementById('setup-gate-migrate');
  const pickBox = document.getElementById('setup-gate-pick');
  const title = document.getElementById('setup-gate-title');
  const desc = document.getElementById('setup-gate-desc');
  migrateBox.style.display = decision === 'migrate' ? 'block' : 'none';
  pickBox.style.display = decision === 'pick' ? 'block' : 'none';

  if (decision === 'pick') {
    title.textContent = 'Set up Spaces on this browser';
    desc.textContent = 'Choose which Spaces are available here and pick a default.';
    const live = RvSpacesCore.liveSpaces(spaces);
    pickBox.querySelector('#setup-gate-pick-list').innerHTML = live.map((s, i) => `
      <div>
        <label><input type="checkbox" class="gate-enabled" data-id="${s.id}" ${i === 0 ? 'checked' : ''}> ${s.name}</label>
        <label><input type="radio" name="gate-default" class="gate-default" data-id="${s.id}" ${i === 0 ? 'checked' : ''}> default</label>
      </div>`).join('');
  } else {
    title.textContent = 'Welcome to Spaces';
    desc.textContent = 'Your existing bookmarks and categories will be placed into one Space. Name it:';
  }

  overlay.classList.add('active');

  await new Promise((resolve) => {
    document.getElementById('setup-gate-confirm').onclick = async () => {
      const now = new Date().toISOString();
      if (decision === 'migrate') {
        const name = document.getElementById('setup-gate-space-name').value.trim() || 'My Bookmarks';
        const migrated = RvSpacesCore.migrateToDefaultSpace({ bookmarks, categories, spaces }, name, now);
        bookmarks = migrated.bookmarks; categories = migrated.categories; spaces = migrated.spaces;
        await saveData();
        rvLocal = {
          enabledSpaceIds: [RvSpacesCore.DEFAULT_SPACE_ID],
          defaultSpaceId: RvSpacesCore.DEFAULT_SPACE_ID,
          lastUsedListSpaceId: RvSpacesCore.DEFAULT_SPACE_ID,
        };
        activeSpaceId = RvSpacesCore.DEFAULT_SPACE_ID;
      } else {
        const enabled = Array.from(document.querySelectorAll('.gate-enabled')).filter(c => c.checked).map(c => c.dataset.id);
        let def = (document.querySelector('.gate-default:checked') || {}).dataset?.id || enabled[0];
        if (def && !enabled.includes(def)) enabled.push(def);
        if (!def || enabled.length === 0) { showToast('Enable at least one Space and pick a default.', 'error'); return; }
        rvLocal = { enabledSpaceIds: enabled, defaultSpaceId: def, lastUsedListSpaceId: def };
        activeSpaceId = def;
      }
      await chrome.storage.local.set({ rvLocal });
      overlay.classList.remove('active');
      resolve();
    };
  });
  return true;
}

// Initialize
document.addEventListener('DOMContentLoaded', init);

// One-time per load: ensure the extension knows the Supabase endpoint.
(async () => {
  const SUPABASE_URL = 'https://supabase.generationai.cloud';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzgwNDM0NDM2LCJleHAiOjE5MzgxMTQ0MzZ9.nTULGxKu8CDVjpmS9-6Efc3zoUlKOhfrwOTHurKmDxo';
  try { await chrome.runtime.sendMessage({ action: 'setSyncConfig', url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY }); } catch (e) {}
  // Pull any remote changes when the list view opens (no-op when logged out).
  try { await chrome.runtime.sendMessage({ action: 'syncPush' }); } catch (e) {}
})();