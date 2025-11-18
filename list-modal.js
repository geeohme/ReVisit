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
  
  document.getElementById('export-btn').addEventListener('click', exportData);
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

init();