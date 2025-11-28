// Main list modal logic
let bookmarks = [];
let categories = [];
let settings = {};
let selectedCategory = 'All';
let selectedBookmarkId = null;
let searchQuery = '';
let statusFilter = 'Active';
let priorityView = false;

// Load shared utilities from utils.js
// Note: sendMessageWithRetry, isYouTubeUrl, extractVideoId are available from utils.js

async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  const action = urlParams.get('action');
  
  // Load data
  const data = await chrome.storage.local.get('rvData');
  const rvData = data.rvData || { bookmarks: [], categories: [], settings: {} };
  bookmarks = rvData.bookmarks || [];
  categories = rvData.categories || [];
  settings = rvData.settings || {};
  
  if (!settings.onboardingComplete) {
    window.location.href = 'onboarding.html';
    return;
  }
  
  // If coming from popup to add bookmark
  if (action === 'add') {
    await openAddBookmarkModal();
  }
  
  renderCategories();
  renderLinks();

  // Event listeners
  let searchTimeout;
  document.getElementById('search-input').addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase();

    // Debounce: wait 300ms after user stops typing
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      renderLinks();
    }, 300);
  });
  
  document.getElementById('status-filter').addEventListener('change', (e) => {
    statusFilter = e.target.value;
    renderLinks();
  });
  
  document.getElementById('priority-btn').addEventListener('click', () => {
    priorityView = !priorityView;
    document.getElementById('priority-btn').classList.toggle('active');
    renderLinks();
  });

  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('close-btn').addEventListener('click', () => window.close());
  
  // ESC to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.close();
  });
}

function renderCategories() {
  const container = document.getElementById('categories-list');
  container.innerHTML = '';
  
  // Add "All" category
  const allItem = createCategoryItem('All', bookmarks.length);
  container.appendChild(allItem);
  
  // Add individual categories
  categories.forEach(cat => {
    const count = bookmarks.filter(b => b.category === cat).length;
    const item = createCategoryItem(cat, count);
    container.appendChild(item);
  });
}

function createCategoryItem(name, count) {
  const div = document.createElement('div');
  div.className = 'category-item';
  div.textContent = `${name} (${count})`;
  if (name === selectedCategory) div.classList.add('active');
  
  div.addEventListener('click', () => {
    selectedCategory = name;
    selectedBookmarkId = null;
    renderCategories();
    renderLinks();
    document.getElementById('details-content').innerHTML = '<div class="empty-state">Select a bookmark to view details</div>';
  });
  
  return div;
}

function renderLinks() {
  const container = document.getElementById('links-list');
  container.innerHTML = '';
  
  let filtered = bookmarks.filter(b => {
    if (selectedCategory !== 'All' && b.category !== selectedCategory) return false;
    if (statusFilter !== 'All' && b.status !== statusFilter) return false;
    if (searchQuery) {
      const searchText = `${b.title} ${b.summary} ${b.userNotes} ${b.tags.join(' ')} ${b.category}`.toLowerCase();
      if (!searchText.includes(searchQuery)) return false;
    }
    return true;
  });
  
  // Priority sorting
  if (priorityView) {
    filtered = filtered.sort((a, b) => {
      const priorityA = getPriorityScore(a);
      const priorityB = getPriorityScore(b);
      if (priorityA !== priorityB) return priorityB - priorityA;
      return new Date(a.revisitBy) - new Date(b.revisitBy);
    });
  } else {
    filtered.sort((a, b) => {
      const dateA = new Date(a.revisitBy);
      const dateB = new Date(b.revisitBy);
      if (dateA - dateB !== 0) return dateA - dateB;
      return a.title.localeCompare(b.title);
    });
  }
  
  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state">No bookmarks found</div>';
    return;
  }
  
  filtered.forEach(bookmark => {
    const item = createLinkItem(bookmark);
    container.appendChild(item);
  });
}

function getPriorityScore(bookmark) {
  const now = new Date();
  const revisitDate = new Date(bookmark.revisitBy);
  const daysUntil = Math.ceil((revisitDate - now) / (1000 * 60 * 60 * 24));
  const threshold = settings.priorityThresholdDays || 3;
  
  const isOverdueOrNear = daysUntil <= threshold;
  const hasNeverRevisited = (!bookmark.history || bookmark.history.length === 0);
  const isIncomplete = bookmark.status !== 'Complete';
  
  if (hasNeverRevisited && isOverdueOrNear) return 3; // High
  if (isIncomplete && isOverdueOrNear) return 2; // Medium
  return 1; // Low
}

function createLinkItem(bookmark) {
  const div = document.createElement('div');
  div.className = 'link-item';
  
  const now = new Date();
  const revisitDate = new Date(bookmark.revisitBy);
  const daysUntil = Math.ceil((revisitDate - now) / (1000 * 60 * 60 * 24));
  const threshold = settings.priorityThresholdDays || 3;
  
  if (daysUntil < 0) div.classList.add('overdue');
  else if (daysUntil <= threshold) div.classList.add('nearing');
  
  const titleDiv = document.createElement('div');
  titleDiv.className = 'link-title';
  titleDiv.textContent = bookmark.title;
  
  const dateDiv = document.createElement('div');
  dateDiv.className = 'link-date';
  dateDiv.textContent = new Date(bookmark.revisitBy).toLocaleDateString();
  
  const revisitBtn = document.createElement('button');
  revisitBtn.className = 'revisit-btn';
  revisitBtn.textContent = 'ReVisit';
  revisitBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleReVisitAction(bookmark);
  });
  
  div.appendChild(titleDiv);
  div.appendChild(dateDiv);
  div.appendChild(revisitBtn);
  
  div.addEventListener('click', () => {
    selectedBookmarkId = bookmark.id;
    renderDetails(bookmark);
  });
  
  return div;
}

function renderDetails(bookmark) {
  const container = document.getElementById('details-content');
  const isYouTube = isYouTubeUrl(bookmark.url);
  const videoId = isYouTube ? extractVideoId(bookmark.url) : null;
  
  const html = `
    <div>
      <div class="details-header">
        <h2>${bookmark.title}</h2>
        <div>
          ${isYouTube ? `<button id="transcript-btn" class="transcript-btn">Video Transcript</button>` : ''}
          <button id="edit-btn">Edit</button>
          <button id="delete-btn" style="background: #dc3545; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">Delete</button>
        </div>
      </div>
      <div class="tags">
        ${bookmark.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
      </div>
      <p><strong>Category:</strong> ${bookmark.category}</p>
      <p><strong>Revisit By:</strong> ${new Date(bookmark.revisitBy).toLocaleDateString()}</p>
      <p><strong>Status:</strong> ${bookmark.status}</p>
      <div class="details-content left-justify">
        <h3>Summary</h3>
        ${renderMarkdown(bookmark.summary)}
      </div>
      ${bookmark.userNotes ? `
        <div class="details-content left-justify" style="margin-top: 15px;">
          <h3>Your Notes</h3>
          ${renderMarkdown(bookmark.userNotes)}
        </div>
      ` : ''}
      ${bookmark.history && bookmark.history.length > 0 ? `
        <div class="history-list">
          <h3>History</h3>
          ${bookmark.history
            .sort((a, b) => b.timestamp - a.timestamp)
            .map(h => `
              <div class="history-item">
                ${new Date(h.timestamp).toLocaleString()}: ${h.action}
              </div>
            `).join('')}
        </div>
      ` : ''}
    </div>
    <div class="edit-form" id="edit-form">
      <h3>Edit Bookmark</h3>
      <label>Title:</label>
      <input type="text" id="edit-title" value="${bookmark.title}">
      <label>Category:</label>
      <select id="edit-category">${categories.map(c => `<option ${c === bookmark.category ? 'selected' : ''}>${c}</option>`).join('')}</select>
      <label>Revisit By:</label>
      <input type="date" id="edit-revisit" value="${bookmark.revisitBy.split('T')[0]}">
      <label>Summary:</label>
      <textarea id="edit-summary">${bookmark.summary}</textarea>
      <label>Tags (comma-separated):</label>
      <input type="text" id="edit-tags" value="${bookmark.tags.join(', ')}">
      <label>Notes:</label>
      <textarea id="edit-notes">${bookmark.userNotes}</textarea>
      <div class="edit-actions">
        <button class="btn-primary" id="save-edit-btn">Save</button>
        <button class="btn-secondary" id="cancel-edit-btn">Cancel</button>
      </div>
    </div>
    
    <!-- Transcript Overlay -->
    <div id="transcript-overlay" class="transcript-overlay" style="display: none;">
      <div class="transcript-modal">
        <div class="transcript-header">
          <h3>Video Transcript</h3>
          <button id="close-transcript" class="close-btn">&times;</button>
        </div>
        <div class="transcript-content" id="transcript-content">
          <div class="loading">Loading transcript...</div>
        </div>
      </div>
    </div>
  `;
  
  container.innerHTML = html;
  
  // Add transcript button handler
  if (isYouTube) {
    document.getElementById('transcript-btn').addEventListener('click', () => {
      showTranscriptOverlay(videoId);
    });
    
    document.getElementById('close-transcript').addEventListener('click', () => {
      document.getElementById('transcript-overlay').style.display = 'none';
    });
  }
  
  document.getElementById('edit-btn').addEventListener('click', () => {
    document.getElementById('edit-form').classList.add('active');
  });
  
  document.getElementById('delete-btn').addEventListener('click', async () => {
    if (confirm('Delete this bookmark?')) {
      bookmarks = bookmarks.filter(b => b.id !== bookmark.id);
      await saveData();
      renderCategories();
      renderLinks();
      container.innerHTML = '<div class="empty-state">Select a bookmark to view details</div>';
    }
  });
  
  document.getElementById('save-edit-btn').addEventListener('click', () => saveEdit(bookmark.id));
  document.getElementById('cancel-edit-btn').addEventListener('click', cancelEdit);
}

async function showTranscriptOverlay(videoId) {
  const overlay = document.getElementById('transcript-overlay');
  const content = document.getElementById('transcript-content');
  
  overlay.style.display = 'flex';
  
  // Check if transcript exists in storage
  const response = await chrome.runtime.sendMessage({
    action: 'getTranscript',
    videoId: videoId
  });
  
  if (response.success && response.transcript) {
    const transcriptData = response.transcript;
    
    if (transcriptData.formatted) {
      content.innerHTML = renderMarkdown(transcriptData.formatted);
    } else if (transcriptData.raw) {
      // DOM-scraped transcript is a string - display directly
      content.innerHTML = `<pre>${transcriptData.raw}</pre>`;
    } else {
      content.innerHTML = '<div class="error">Transcript not available. Try refreshing the bookmark.</div>';
    }
  } else {
    content.innerHTML = '<div class="error">Transcript not available. Try refreshing the bookmark.</div>';
  }
}


function renderMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>')
    .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*?)$/gm, '<h1>$1</h1>')
    .replace(/^\* (.*?)$/gm, '<li>$1</li>')
    .replace(/((?:<li>.*?<\/li>\n?)+)/g, '<ul>$1</ul>')
    .replace(/\n/g, '<br>');
}

async function handleReVisitAction(bookmark) {
  // Open URL
  await chrome.tabs.create({ url: bookmark.url, active: true });
  
  // Inject floating modal
  await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for tab to load
  await chrome.runtime.sendMessage({
    action: 'injectFloatingModal',
    bookmarkId: bookmark.id,
    revisitBy: bookmark.revisitBy
  });
  
  // Listen for action from floating modal
  window.addEventListener('message', async (event) => {
    if (event.data.type === 'REVISIT_ACTION') {
      const action = event.data.action;
      const bookmarkId = event.data.bookmarkId;
      
      const bm = bookmarks.find(b => b.id === bookmarkId);
      if (!bm) return;
      
      bm.history = bm.history || [];
      bm.history.push({
        timestamp: Date.now(),
        action: action
      });
      
      if (action === 'Complete') {
        bm.status = 'Complete';
      } else if (action === 'ReVisited') {
        bm.status = 'ReVisited';
        const newDate = prompt('Set new revisit date (YYYY-MM-DD):', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
        if (newDate) bm.revisitBy = new Date(newDate).toISOString();
      }
      
      await saveData();
      renderLinks();
    }
  });
}

async function openAddBookmarkModal() {
  try {
    // Scrape current page
    console.log('DEBUG: 305 Starting openAddBookmarkModal()');
    
    // Read tabId from URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const tabIdParam = urlParams.get('tabId');
    console.log('DEBUG: 306 tabId from URL parameter:', tabIdParam);
    
    let targetTab;
    if (tabIdParam) {
      // Use the specific tab that was passed from popup
      targetTab = await chrome.tabs.get(parseInt(tabIdParam));
      console.log('DEBUG: 307 Using target tab from parameter:', targetTab);
    } else {
      // Fallback to current behavior for backward compatibility
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      targetTab = activeTab;
      console.log('DEBUG: 308 Using active tab (fallback):', targetTab);
    }
    
    console.log('DEBUG: 309 Target tab ID:', targetTab.id);
    console.log('DEBUG: 310 Target tab URL:', targetTab.url);
    
    // Ensure content script is injected before sending message
    console.log('DEBUG: 311 Injecting content script into tab:', targetTab.id);
    try {
      await chrome.scripting.executeScript({
        target: { tabId: targetTab.id },
        files: ['content.js']
      });
      console.log('DEBUG: 312 Content script injected successfully');
    } catch (injectionError) {
      console.warn('WARN: 313 Content script injection failed, may already be injected:', injectionError.message);
      // Continue anyway as the script might already be present
    }
    
    // TEST: Try to send message to content script with retry
    console.log('DEBUG: 314 About to call sendMessageWithRetry()');
    let scraped;
    try {
      scraped = await sendMessageWithRetry(targetTab.id, { action: 'scrapePage' });
      console.log('DEBUG: 315 Scraped data received:', scraped);
    } catch (messageError) {
      console.error('ERROR: 316 sendMessageWithRetry() failed:', messageError);
      console.error('ERROR: 317 Tab ID:', targetTab.id);
      console.error('ERROR: 318 Tab URL:', targetTab.url);
      throw messageError; // Re-throw to be caught by outer catch
    }
    
    // Process with AI via background script
    console.log('DEBUG: 319 About to call background.js processWithAI');
    const aiResponse = await chrome.runtime.sendMessage({
      action: 'processWithAI',
      scrapedData: scraped
    });

    if (!aiResponse.success) {
      throw new Error(aiResponse.error || 'AI processing failed');
    }

    const result = aiResponse.result;
    console.log('DEBUG: 320 AI processing complete:', result);
    
    // Create bookmark object
    console.log('DEBUG: 321 Creating bookmark object');
    const bookmark = {
      id: 'rv-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      url: targetTab.url, // Use the target tab's URL instead of scraped URL
      title: scraped.title,
      category: result.category,
      summary: result.summary,
      tags: result.tags,
      userNotes: '',
      addedTimestamp: Date.now(),
      revisitBy: new Date(Date.now() + settings.defaultIntervalDays * 24 * 60 * 60 * 1000).toISOString(),
      status: 'Active',
      history: []
    };
    console.log('DEBUG: 322 Bookmark object created:', bookmark);
    
    // Save and open for editing
    console.log('DEBUG: 323 About to push bookmark to array');
    bookmarks.push(bookmark);
    console.log('DEBUG: 324 About to call saveData()');
    await saveData();
    console.log('DEBUG: 325 saveData() completed successfully');
    
    selectedBookmarkId = bookmark.id;
    renderCategories();
    renderLinks();
    renderDetails(bookmark);
    console.log('DEBUG: 326 openAddBookmarkModal() completed successfully');
  } catch (error) {
    console.error('ERROR: 327 Caught in openAddBookmarkModal() catch block');
    console.error('ERROR: 328 Message:', error.message);
    console.error('ERROR: 329 Stack:', error.stack);
    
    // Check if it's the specific connection error
    if (error.message.includes('Could not establish connection')) {
      console.error('DEBUG: 330 Connection error detected - content script not available');
      alert('Failed to add bookmark: Content script not loaded. Please refresh the page and try again.');
    } else {
      alert('Failed to add bookmark. Check API key and try again.');
    }
  }
}

// Note: processWithAI functionality is now handled by background.js
// The background script processes AI requests and returns results

async function saveData() {
  await chrome.storage.local.set({
    rvData: { bookmarks, categories, settings }
  });
}

async function exportData() {
  const data = { bookmarks, categories, settings };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rv-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function saveEdit(bookmarkId) {
  const bookmark = bookmarks.find(b => b.id === bookmarkId);
  if (!bookmark) return;
  
  bookmark.title = document.getElementById('edit-title').value;
  bookmark.category = document.getElementById('edit-category').value;
  bookmark.revisitBy = new Date(document.getElementById('edit-revisit').value).toISOString();
  bookmark.summary = document.getElementById('edit-summary').value;
  bookmark.tags = document.getElementById('edit-tags').value.split(',').map(t => t.trim()).filter(t => t);
  bookmark.userNotes = document.getElementById('edit-notes').value;
  
  await saveData();
  document.getElementById('edit-form').classList.remove('active');
  renderCategories();
  renderLinks();
  renderDetails(bookmark);
}

function cancelEdit() {
  document.getElementById('edit-form').classList.remove('active');
}

// Listen for messages from floating modal
window.addEventListener('message', async (event) => {
  if (event.data.type === 'REVISIT_ACTION') {
    // Already handled in the function
  }
});

/* ============================================
   SETTINGS PANEL FUNCTIONALITY
   ============================================ */

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

  // Export data
  document.getElementById('export-data-btn').onclick = exportData;

  // Save settings
  document.getElementById('save-settings-btn').onclick = saveSettings;

  // Critical error close
  document.getElementById('critical-error-close-btn').onclick = closeCriticalError;
}

/**
 * Close settings modal
 */
function closeSettings() {
  document.getElementById('settings-overlay').classList.remove('active');
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
 * Get display name for provider
 */
function getProviderDisplayName(provider) {
  const names = {
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

  await saveData();
  showToast('✅ Settings saved successfully!', 'success');
  closeSettings();
}

/**
 * Show toast message
 */
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast-message');
  toast.textContent = message;
  toast.className = 'toast-message active';

  if (type === 'error') {
    toast.classList.add('error');
  }

  setTimeout(() => {
    toast.classList.remove('active');
    toast.classList.remove('error');
  }, 3000);
}

/**
 * Show critical error modal
 */
function showCriticalError(errorMessage) {
  const overlay = document.getElementById('critical-error-overlay');
  const messageEl = document.getElementById('critical-error-message');

  messageEl.textContent = errorMessage;
  overlay.classList.add('active');
}

/**
 * Close critical error modal
 */
function closeCriticalError() {
  document.getElementById('critical-error-overlay').classList.remove('active');
}

init();