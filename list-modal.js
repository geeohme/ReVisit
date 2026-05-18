// Main list modal logic
let bookmarks = [];
let categories = [];
let settings = {};
let selectedCategory = 'All';
let searchQuery = '';
let statusFilter = 'Active';
let priorityView = false;
let currentBookmarkId = null;
let isDirty = false;

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

async function init() {
  // Theme Initialization
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  document.getElementById('checkbox').checked = savedTheme === 'dark';

  // Load data
  const data = await chrome.storage.local.get('rvData');
  const rvData = data.rvData || { bookmarks: [], categories: [], settings: {} };
  bookmarks = rvData.bookmarks || [];
  categories = migrateCategoriesFormat(rvData.categories || []);
  settings = rvData.settings || {};

  // Initial Render
  renderCategories();
  renderLinks();

  // Event Listeners
  setupEventListeners();

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
  // Theme Toggle
  document.getElementById('checkbox').addEventListener('change', (e) => {
    const newTheme = e.target.checked ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  });

  // Search & Filter
  document.getElementById('search-input').addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase();
    renderLinks();
  });

  document.querySelectorAll('.filter-tabs button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-tabs button').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      statusFilter = e.target.dataset.filter; // Use data-filter attribute
      renderLinks();
    });
  });

  // Priority View Toggle
  document.getElementById('priority-btn').addEventListener('click', (e) => {
    priorityView = !priorityView;
    e.target.classList.toggle('active');
    // Update button text to reflect state
    e.target.textContent = priorityView ? 'Date View' : 'Priority View';
    renderLinks();
  });

  // Close App
  document.getElementById('close-btn').addEventListener('click', () => window.close());

  // Overlay Actions
  document.getElementById('close-overlay-btn').addEventListener('click', closeDetailOverlay);
  document.getElementById('save-bookmark-btn').addEventListener('click', saveCurrentBookmark);
  document.getElementById('delete-bookmark-btn').addEventListener('click', deleteCurrentBookmark);

  // Settings
  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('settings-close-btn').addEventListener('click', closeSettings);
  
  // Settings - Toggle Instructions
  document.getElementById('toggle-instructions-btn').addEventListener('click', () => {
    const instructions = document.getElementById('api-key-instructions');
    instructions.style.display = instructions.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
  
  // Settings - Toggle Instructions
  document.getElementById('toggle-instructions-btn').addEventListener('click', () => {
    const instructions = document.getElementById('api-key-instructions');
    instructions.style.display = instructions.style.display === 'none' ? 'block' : 'none';
  });

  // Settings - Test Connection
  document.getElementById('test-connection-btn').addEventListener('click', async () => {
    const apiKey = document.getElementById('gateway-api-key').value;
    if (!apiKey) {
      showToast('Please enter an API Key first.', 'error');
      return;
    }
    // Mock test for now, or implement actual fetch if endpoint known
    showToast('Testing connection...', 'info');
    try {
        // Simulating a check
        await new Promise(resolve => setTimeout(resolve, 1000));
        showToast('Connection successful!', 'success');
    } catch (e) {
        showToast('Connection failed.', 'error');
    }
  });

  // Settings - Add Category
  document.getElementById('add-category-btn').addEventListener('click', () => {
    const nameInput = document.getElementById('new-category-name');
    const priorityInput = document.getElementById('new-category-priority');
    const name = nameInput.value.trim();
    const priority = parseInt(priorityInput.value) || 1;
    
    if (name) {
      categories.push({ name, priority });
      nameInput.value = '';
      renderCategoriesSettings();
      renderCategories(); // Update main list immediately
    }
  });

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
  // Markdown editors track dirty on blur/input
}

// --- Rendering Functions ---

function renderCategories() {
  const container = document.getElementById('categories-list');
  container.innerHTML = '';

  // "All" Category
  const allItem = document.createElement('div');
  allItem.className = `category-item ${selectedCategory === 'All' ? 'active' : ''}`;
  allItem.innerHTML = `<span class="category-name">All</span><span class="category-count">(${bookmarks.length})</span>`;
  allItem.addEventListener('click', () => selectCategory('All'));
  container.appendChild(allItem);

  // Dynamic Categories
  const sortedCategories = [...categories].sort((a, b) => a.priority - b.priority);
  sortedCategories.forEach(cat => {
    const catName = cat.name;
    const count = bookmarks.filter(b => b.category === catName).length;
    const item = document.createElement('div');
    item.className = `category-item ${selectedCategory === catName ? 'active' : ''}`;
    item.innerHTML = `<span class="category-name">${catName}</span><span class="category-count">(${count})</span>`;
    item.addEventListener('click', () => selectCategory(catName));
    container.appendChild(item);
  });
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
    if (selectedCategory !== 'All' && b.category !== selectedCategory) return false;
    if (statusFilter !== 'All' && b.status !== statusFilter) return false;
    if (searchQuery) {
      const searchText = `${b.title} ${b.summary} ${b.userNotes} ${b.tags.join(' ')}`.toLowerCase();
      if (!searchText.includes(searchQuery)) return false;
    }
    return true;
  });

  // Sort
  if (priorityView) {
    filtered = filtered.sort((a, b) => getPriorityScore(b) - getPriorityScore(a));
  } else {
    filtered = filtered.sort((a, b) => new Date(a.revisitBy) - new Date(b.revisitBy));
  }

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state">No bookmarks found</div>';
    return;
  }

  filtered.forEach(bookmark => {
    const item = document.createElement('div');
    item.className = 'bookmark-list-item';
    item.innerHTML = `
      <div class="bookmark-title">${bookmark.title}</div>
      <div class="bookmark-meta">
        <span class="bookmark-source">${new URL(bookmark.url).hostname.replace('www.', '')}</span>
        <span class="bookmark-date">${new Date(bookmark.revisitBy).toLocaleDateString()}</span>
      </div>
      <div class="bookmark-actions" style="margin-top: 8px; display: flex; justify-content: flex-end;">
        <button class="revisit-btn" data-url="${bookmark.url}" style="padding: 4px 8px; font-size: 12px; background: var(--color-primary); color: white; border: none; border-radius: 4px;">ReVisit ↗</button>
      </div>
    `;
    
    // Click on item opens details
    item.addEventListener('click', (e) => {
      // Prevent opening details if clicking the ReVisit button
      if (e.target.classList.contains('revisit-btn')) return;
      openDetailOverlay(bookmark);
    });

    // ReVisit Button Action
    const revisitBtn = item.querySelector('.revisit-btn');
    revisitBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.open(bookmark.url, '_blank');
    });

    container.appendChild(item);
  });
}

// --- Detail Overlay Logic ---

function openDetailOverlay(bookmark) {
  if (isDirty) {
    if (!confirm('You have unsaved changes. Discard them?')) return;
  }

  currentBookmarkId = bookmark.id;
  isDirty = false;

  // Populate Fields
  document.getElementById('detail-title').value = bookmark.title;
  document.getElementById('detail-revisit').value = bookmark.revisitBy.split('T')[0];
  document.getElementById('detail-status').value = bookmark.status;

  // Categories Dropdown
  const catSelect = document.getElementById('detail-category');
  catSelect.innerHTML = categories.map(c => `<option value="${c.name}" ${c.name === bookmark.category ? 'selected' : ''}>${c.name}</option>`).join('');

  // Tags
  renderTags(bookmark.tags);

  // Markdown Editors
  setupMarkdownEditor('detail-summary', bookmark.summary);
  setupMarkdownEditor('detail-notes', bookmark.userNotes || '');

  // Show Overlay
  document.getElementById('detail-overlay').classList.add('active');
}

function closeDetailOverlay() {
  if (isDirty) {
    if (!confirm('You have unsaved changes. Discard them?')) return;
  }
  document.getElementById('detail-overlay').classList.remove('active');
  currentBookmarkId = null;
  isDirty = false;
}

function renderTags(tags) {
  const container = document.getElementById('detail-tags');
  container.innerHTML = ''; // Clear existing tags
  
  tags.forEach(tag => {
    const tagEl = document.createElement('span');
    tagEl.className = 'tag';
    tagEl.innerHTML = `${tag} <span class="tag-remove">×</span>`;
    tagEl.querySelector('.tag-remove').addEventListener('click', () => {
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
  bookmark.revisitBy = new Date(document.getElementById('detail-revisit').value).toISOString();
  bookmark.status = document.getElementById('detail-status').value;
  
  // Update Markdown fields from dataset.raw (ensure we get the latest edits)
  // If element is currently focused, we need to grab textContent, otherwise dataset.raw
  const summaryEl = document.getElementById('detail-summary');
  const notesEl = document.getElementById('detail-notes');
  
  bookmark.summary = document.activeElement === summaryEl ? summaryEl.textContent : summaryEl.dataset.raw;
  bookmark.userNotes = document.activeElement === notesEl ? notesEl.textContent : notesEl.dataset.raw;

  // Tags are already updated in the bookmark object by addTag/removeTag
  // but we need to ensure we save the current state
  
  await saveData();
  isDirty = false;
  showToast('Bookmark saved!', 'success');
  renderLinks(); // Refresh list
  renderCategories(); // Refresh counts
}

async function deleteCurrentBookmark() {
  if (!confirm('Are you sure you want to delete this bookmark?')) return;
  
  bookmarks = bookmarks.filter(b => b.id !== currentBookmarkId);
  await saveData();
  closeDetailOverlay();
  renderLinks();
  renderCategories();
  showToast('Bookmark deleted.', 'success');
}

async function saveData() {
  await chrome.storage.local.set({
    rvData: { bookmarks, categories, settings }
  });
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
  document.getElementById('ollama-local-url').value = settings.ollama?.localBaseUrl || 'http://localhost:11434';
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

  // Setup event listeners
  setupSettingsEventListeners();
}

/**
 * Close settings modal
 */
function closeSettings() {
  document.getElementById('settings-overlay').classList.remove('active');
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

  // Test connection
  document.getElementById('test-connection-btn').onclick = testGatewayConnection;

  // Provider change listeners - update model dropdowns
  const modelsData = settings.llmGateway?.modelsData;

  document.getElementById('youtube-provider').onchange = (e) => {
    if (modelsData) {
      updateModelDropdownFromGateway('youtube-model', e.target.value, modelsData);
    } else {
      updateModelDropdown('youtube-model', e.target.value);
    }
  };

  document.getElementById('transcript-provider').onchange = (e) => {
    if (modelsData) {
      updateModelDropdownFromGateway('transcript-model', e.target.value, modelsData);
    } else {
      updateModelDropdown('transcript-model', e.target.value);
    }
  };

  document.getElementById('page-provider').onchange = (e) => {
    if (modelsData) {
      updateModelDropdownFromGateway('page-model', e.target.value, modelsData);
    } else {
      updateModelDropdown('page-model', e.target.value);
    }
  };

  // Backup data
  document.getElementById('export-data-btn').onclick = exportData;

  // Restore data
  document.getElementById('import-data-btn').onclick = importData;

  // Add category
  document.getElementById('add-category-btn').onclick = handleAddCategory;

  // Save settings
  document.getElementById('save-settings-btn').onclick = saveSettings;
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
 * Save settings to storage
 */
async function saveSettings() {
  const apiKey = document.getElementById('gateway-api-key').value.trim();

  if (!apiKey) {
    showToast('Please enter an API key', 'error');
    return;
  }

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

  // Save Ollama settings
  const ollamaLocalUrl = document.getElementById('ollama-local-url').value.trim();
  const ollamaCloudKey = document.getElementById('ollama-cloud-api-key').value.trim();
  settings.ollama = {
    localEnabled: !!ollamaLocalUrl,
    localBaseUrl: ollamaLocalUrl || 'http://localhost:11434',
    cloudEnabled: !!ollamaCloudKey,
    cloudApiKey: ollamaCloudKey,
    modelsLastUpdated: settings.ollama?.modelsLastUpdated || null
  };

  await saveData();
  showToast('✅ Settings saved successfully!', 'success');
  closeSettings();
}

/**
 * Render categories in settings panel
 */
function renderCategoriesSettings() {
  const container = document.getElementById('categories-settings-list');
  container.innerHTML = '';

  // Sort categories by priority
  const sortedCategories = [...categories].sort((a, b) => a.priority - b.priority);

  sortedCategories.forEach((cat, index) => {
    const catName = typeof cat === 'string' ? cat : cat.name;
    const count = bookmarks.filter(b => b.category === catName).length;

    const item = document.createElement('div');
    item.className = 'category-settings-item';
    item.draggable = true;
    item.dataset.categoryName = catName;
    item.dataset.categoryIndex = index;

    item.innerHTML = `
      <span class="cat-name">${catName}</span>
      <span class="cat-count">${count}</span>
      <div class="cat-priority">
        <input type="number" class="cat-priority-input" data-category="${catName}"
               value="${cat.priority}" min="1" max="100">
      </div>
    `;

    // Add drag event listeners
    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragend', handleDragEnd);
    item.addEventListener('dragover', handleDragOver);
    item.addEventListener('drop', handleDrop);
    item.addEventListener('dragleave', handleDragLeave);

    container.appendChild(item);
  });

  // Add event listeners for priority inputs with instant reordering
  document.querySelectorAll('.cat-priority-input').forEach(input => {
    input.addEventListener('input', handleCategoryPriorityInput); // instant reorder on type
    input.addEventListener('change', handleCategoryPriorityChange); // save on blur
  });
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

    const draggedCategory = categories.find(cat => (typeof cat === 'string' ? cat : cat.name) === draggedCatName);
    const targetCategory = categories.find(cat => (typeof cat === 'string' ? cat : cat.name) === targetCatName);

    if (draggedCategory && targetCategory) {
      const draggedIndex = categories.findIndex(cat => (typeof cat === 'string' ? cat : cat.name) === draggedCatName);
      categories.splice(draggedIndex, 1);

      const targetIndex = categories.findIndex(cat => (typeof cat === 'string' ? cat : cat.name) === targetCatName);
      categories.splice(targetIndex, 0, draggedCategory);

      categories.forEach((cat, index) => {
        cat.priority = index + 1;
      });

      saveData();
      renderCategoriesSettings();
      renderCategories();
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

  const category = categories.find(cat => (typeof cat === 'string' ? cat : cat.name) === categoryName);
  if (category) {
    category.priority = newPriority;
    renderCategoriesSettings();
    renderCategories();
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

  const exists = categories.some(cat => (typeof cat === 'string' ? cat : cat.name) === name);
  if (exists) {
    showToast('Category already exists', 'error');
    return;
  }

  categories.push({ name, priority });
  saveData();
  nameInput.value = '';
  priorityInput.value = '1';
  renderCategoriesSettings();
  renderCategories();
  showToast('Category added successfully', 'success');
}

async function exportData() {
  const transcriptData = await chrome.storage.local.get('rvTranscripts');
  const transcripts = transcriptData.rvTranscripts || {};
  const data = { bookmarks, categories, transcripts };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rv-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('✅ Backup created successfully!', 'success');
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
      if (backupData.bookmarks && Array.isArray(backupData.bookmarks)) bookmarks = backupData.bookmarks;
      if (backupData.categories && Array.isArray(backupData.categories)) {
        const migratedBackupCategories = migrateCategoriesFormat(backupData.categories);
        const categoryMap = new Map();
        categories.forEach(cat => categoryMap.set(cat.name, cat));
        migratedBackupCategories.forEach(cat => {
          if (!categoryMap.has(cat.name)) categoryMap.set(cat.name, cat);
        });
        categories = Array.from(categoryMap.values());
      }
      if (backupData.transcripts && typeof backupData.transcripts === 'object') {
        await chrome.storage.local.set({ rvTranscripts: backupData.transcripts });
      }
      await saveData();
      renderCategories();
      renderLinks();
      showToast('✅ Data restored successfully!', 'success');
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

// Initialize
document.addEventListener('DOMContentLoaded', init);