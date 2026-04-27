// Content script for page scraping and floating modal communication
(function() {
  if (window.__revisitContentScriptLoaded) return;
  window.__revisitContentScriptLoaded = true;

console.log('DEBUG: Content script starting execution on:', window.location.href);

// Styles to be injected into Shadow DOM
const OVERLAY_STYLES = `
:host {
  all: initial !important;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
  font-size: 16px !important;
  font-weight: 400 !important;
  font-style: normal !important;
  line-height: 1.5 !important;
  letter-spacing: normal !important;
  text-align: left !important;
  text-transform: none !important;
  text-indent: 0 !important;
  color: #1F2937 !important;
  --color-primary: #3B82F6;
  --color-primary-hover: #2563EB;
  --color-bg-panel: #FFFFFF;
  --color-text-main: #1F2937;
  --color-text-secondary: #6B7280;
  --color-border: #E5E7EB;
  --color-bg-input: #FFFFFF;
  --radius-md: 0.375rem;
  --radius-lg: 0.5rem;
  --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
}

/* Reset every element inside the shadow root so the host page's inherited
   styles (font-size, line-height, color, etc.) cannot leak through. */
*, *::before, *::after {
  box-sizing: border-box;
  font-family: inherit;
  font-size: inherit;
  font-weight: inherit;
  font-style: inherit;
  line-height: inherit;
  letter-spacing: inherit;
  text-align: inherit;
  text-transform: none;
  text-indent: 0;
  color: inherit;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  vertical-align: baseline;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Form controls don't inherit font by default — force them to. */
input, textarea, select, button {
  font: inherit;
  color: inherit;
  letter-spacing: inherit;
  text-transform: none;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
}

button {
  cursor: pointer;
}

@media (prefers-color-scheme: dark) {
  :host {
    --color-bg-panel: #1F2937;
    --color-text-main: #F9FAFB;
    --color-text-secondary: #9CA3AF;
    --color-border: #374151;
    --color-bg-input: #374151;
  }
}

.overlay-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(2px);
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.overlay-card {
  background: var(--color-bg-panel);
  border-radius: 12px;
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: var(--shadow-xl);
  display: flex;
  flex-direction: column;
  color: var(--color-text-main);
  border: 1px solid var(--color-border);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
}

.card-header h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-text-main);
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--color-text-secondary);
  padding: 4px;
  line-height: 1;
  border-radius: 4px;
}

.close-btn:hover {
  background: rgba(0,0,0,0.05);
  color: var(--color-text-main);
}

.card-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-weight: 500;
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

input, textarea, select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 0.95rem;
  background: var(--color-bg-input);
  color: var(--color-text-main);
  box-sizing: border-box;
  transition: border-color 0.15s;
}

input:focus, textarea:focus, select:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

textarea {
  min-height: 100px;
  resize: vertical;
  font-family: inherit;
}

.card-footer {
  padding: 20px 24px;
  border-top: 1px solid var(--color-border);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  background: rgba(0,0,0,0.02);
}

.btn {
  padding: 10px 20px;
  border-radius: var(--radius-md);
  font-weight: 500;
  font-size: 0.95rem;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.btn-secondary {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text-main);
}

.btn-secondary:hover {
  background: rgba(0,0,0,0.05);
}

.btn-primary {
  background: var(--color-primary);
  color: white;
}

.btn-primary:hover {
  background: var(--color-primary-hover);
}

/* Notification Toast */
.toast {
  position: fixed;
  top: 20px;
  right: 20px;
  padding: 12px 20px;
  border-radius: var(--radius-md);
  color: white;
  font-weight: 500;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 100000;
  animation: slideIn 0.3s ease-out;
}

.toast.success { background: #10B981; }
.toast.error { background: #EF4444; }
.toast.info { background: #3B82F6; }

@keyframes slideIn {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
`;

// Wrap entire script in try-catch to catch any initialization errors
try {
  console.log('DEBUG: 101 Content script loaded successfully, registering message listener');
  
  // Synchronous message handler - no async/await anywhere
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('DEBUG: 102 Content script received message:', request);
    
    if (request.action === 'ping') {
      sendResponse({ success: true, message: 'Content script is ready' });
      return;
    }
    
    if (request.action === 'scrapePage') {
      const bodyText = document.body.innerText || '';
      const truncated = bodyText.substring(0, 2000);
      const response = {
        url: window.location.href,
        title: document.title || 'Untitled',
        content: truncated
      };
      sendResponse(response);
      return;
    }
    
    if (request.action === 'injectOverlayWithAIResults') {
      injectBookmarkOverlay(request.bookmarkId, request.bookmarkData);
      sendResponse({ success: true });
      return;
    }

    if (request.action === 'showNotification') {
      showNotification(request.message, request.type);
      sendResponse({ success: true });
      return;
    }

    if (request.action === 'showDuplicateConfirmation') {
      showDuplicateConfirmationDialog(request.existingBookmark);
      sendResponse({ success: true });
      return;
    }

    if (request.action === 'scrapeAndShowOverlay') {
      handleScrapeAndShowOverlay(request.bookmarkId, request.bookmarkData);
      sendResponse({ success: true });
      return;
    }

    console.warn('WARN: 108 Unknown action received:', request.action);
    sendResponse({ success: false, error: 'Unknown action' });
  });
  
} catch (error) {
  console.error('ERROR: 110 Content script initialization failed:', error);
}

// Listen for floating modal actions (from injected script)
window.addEventListener('message', (event) => {
  if (event.data.type === 'REVISIT_ACTION') {
    // Forward to background script
    chrome.runtime.sendMessage({
      action: 'updateBookmarkStatus',
      bookmarkId: event.data.bookmarkId,
      actionType: event.data.action
    });
  } else if (event.data.type === 'OVERLAY_ACTION') {
    // Handle overlay actions
    handleOverlayAction(event.data);
  }
});

// Shared utility functions
function isYouTubeUrl(url) {
  return url.includes('youtube.com/watch') || url.includes('youtu.be/');
}

function extractVideoId(url) {
  const urlObj = new URL(url);
  return urlObj.searchParams.get('v') || urlObj.pathname.split('/').pop();
}

// YouTube content scraping
function scrapeYouTubeContent() {
  const videoId = extractVideoId(window.location.href);
  const title = document.title.replace(' - YouTube', '');
  const descriptionMeta = document.querySelector('meta[name="description"]');
  const description = descriptionMeta ? descriptionMeta.content : '';
  
  return {
    url: window.location.href,
    title: title,
    content: description.substring(0, 2000),
    isYouTube: true,
    videoId: videoId
  };
}

// Helper function to wait for an element to appear in the DOM
function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const existingElement = document.querySelector(selector);
    if (existingElement) return resolve(existingElement);

    const intervalTime = 100;
    let elapsedTime = 0;

    const interval = setInterval(() => {
      const element = document.querySelector(selector);
      if (element) {
        clearInterval(interval);
        resolve(element);
      }

      elapsedTime += intervalTime;
      if (elapsedTime >= timeout) {
        clearInterval(interval);
        reject(new Error(`Element with selector "${selector}" not found within ${timeout}ms.`));
      }
    }, intervalTime);
  });
}

// Function to scrape transcript from YouTube DOM
async function getTranscriptFromDOM() {
  try {
    let segmentsContainer = document.querySelector('ytd-transcript-segment-list-renderer');

    if (!segmentsContainer) {
      const descriptionExpander = document.querySelector('#expand.ytd-text-inline-expander');
      if (descriptionExpander) descriptionExpander.click();

      const transcriptSectionContainer = await waitForElement('ytd-video-description-transcript-section-renderer');
      const showTranscriptButton = transcriptSectionContainer.querySelector('button[aria-label="Show transcript"]');

      if (!showTranscriptButton) return { error: "Could not find 'Show transcript' button." };
      
      showTranscriptButton.click();
      segmentsContainer = await waitForElement('ytd-transcript-segment-list-renderer');
    }

    await new Promise(resolve => setTimeout(resolve, 500));
    
    const segmentElements = segmentsContainer.querySelectorAll('ytd-transcript-segment-renderer');
    if (segmentElements.length === 0) return { error: "No text segments found." };

    let fullTranscript = "";
    segmentElements.forEach(segment => {
      const textElement = segment.querySelector('.segment-text');
      if (textElement) fullTranscript += textElement.textContent.trim() + " ";
    });

    return { transcript: fullTranscript.trim() };

  } catch (error) {
    return { error: error.message };
  }
}

// Handle the scrape and overlay workflow
async function handleScrapeAndShowOverlay(bookmarkId, preliminaryBookmark) {
  console.log('DEBUG: Starting scrape and overlay workflow');
  
  // Scrape page content
  let scrapedData;
  let transcript = null;
  const url = window.location.href;
  
  if (isYouTubeUrl(url)) {
    console.log('DEBUG: Detected YouTube URL, using YouTube scraping');
    scrapedData = scrapeYouTubeContent();
    
    // Also try to get transcript for YouTube videos
    console.log('DEBUG: Attempting to scrape transcript from DOM');
    const transcriptResult = await getTranscriptFromDOM();
    console.log('DEBUG: Transcript result:', transcriptResult);
    
    if (transcriptResult && transcriptResult.transcript) {
      transcript = transcriptResult.transcript;
      console.log('DEBUG: Transcript successfully scraped, length:', transcript.length);
    } else {
      console.warn('WARN: No transcript available from DOM scraping');
    }
  } else {
    console.log('DEBUG: Standard URL, using standard scraping');
    const bodyText = document.body.innerText || '';
    scrapedData = {
      url: window.location.href,
      title: document.title || 'Untitled',
      content: bodyText.substring(0, 2000),
      isYouTube: false,
      videoId: null
    };
  }
  console.log('DEBUG: Scraped data:', scrapedData);
  
  // Send to background for AI processing
  console.log('DEBUG: Sending to background for AI processing: processWithAI');

  // Show processing notification to user
  showNotification('Analyzing content...', 'info');

  const message = {
    action: 'processWithAI',
    scrapedData: scrapedData
  };

  // Add transcript to message if available
  if (transcript) {
    message.transcript = transcript;
    console.log('DEBUG: Including transcript in AI processing request');
  }

  chrome.runtime.sendMessage(message).then(response => {
    if (!response.success) {
      throw new Error(response.error || 'AI processing failed');
    }
    
    console.log('DEBUG: AI processing result:', response.result);
    
    // Inject overlay with AI results
    injectBookmarkOverlay(bookmarkId, {
      ...preliminaryBookmark,
      category: response.result.category,
      summary: response.result.summary,
      tags: response.result.tags
    });
  }).catch(error => {
    console.error('ERROR: Scrape and overlay workflow failed:', error);
    // Show error overlay
    injectErrorOverlay(bookmarkId, error.message);
  });
}

// Create a shadow-DOM host that prevents keyboard/input events from leaking
// to the host page (e.g., YouTube's 'k', space, '/' shortcuts).
function createIsolatedHost(id) {
  const host = document.createElement('div');
  host.id = id;
  // Bubble-phase listeners on the host stop events from reaching host-page
  // listeners attached to window/document. Capture phase would prevent the
  // event from reaching elements inside the shadow root in the first place.
  const stop = (e) => e.stopPropagation();
  ['keydown', 'keyup', 'keypress', 'input', 'beforeinput',
   'mousedown', 'mouseup', 'click', 'dblclick',
   'pointerdown', 'pointerup', 'wheel'].forEach(type => {
    host.addEventListener(type, stop, false);
  });
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const styleSheet = document.createElement('style');
  styleSheet.textContent = OVERLAY_STYLES;
  shadow.appendChild(styleSheet);
  return { host, shadow };
}

// Inject the bookmark overlay into the current page using Shadow DOM
function injectBookmarkOverlay(bookmarkId, bookmarkData) {
  console.log('DEBUG: Injecting bookmark overlay (Shadow DOM)');

  // Remove existing host if any
  const existingHost = document.getElementById('rv-overlay-host');
  if (existingHost) existingHost.remove();

  const { host, shadow } = createIsolatedHost('rv-overlay-host');
  
  // Create Overlay HTML
  const overlayContainer = document.createElement('div');
  overlayContainer.className = 'overlay-backdrop';
  overlayContainer.innerHTML = `
    <div class="overlay-card">
      <div class="card-header">
        <h2>Add ReVisit Bookmark</h2>
        <button class="close-btn" id="rv-close">&times;</button>
      </div>
      
      <div class="card-body">
        <div class="form-group">
          <label>Title</label>
          <input type="text" id="rv-title" value="${bookmarkData.title || ''}">
        </div>
        
        <div class="form-group">
          <label>Category</label>
          <input type="text" id="rv-category" value="${bookmarkData.category || ''}">
        </div>
        
        <div class="form-group">
          <label>Summary</label>
          <textarea id="rv-summary">${bookmarkData.summary || ''}</textarea>
        </div>
        
        <div class="form-group">
          <label>Tags (comma-separated)</label>
          <input type="text" id="rv-tags" value="${(bookmarkData.tags || []).join(', ')}">
        </div>
        
        <div class="form-group">
          <label>Your Notes</label>
          <textarea id="rv-notes" placeholder="Add your own notes..."></textarea>
        </div>
        
        <div class="form-group">
          <label>Revisit By</label>
          <input type="date" id="rv-revisit" value="${bookmarkData.revisitBy ? bookmarkData.revisitBy.split('T')[0] : ''}">
        </div>
      </div>
      
      <div class="card-footer">
        <button class="btn btn-secondary" id="rv-cancel">Cancel</button>
        <button class="btn btn-primary" id="rv-save">Save Bookmark</button>
      </div>
    </div>
  `;
  
  shadow.appendChild(overlayContainer);
  
  // Event Listeners (attached to elements within shadow root)
  const closeHandler = () => {
    handleOverlayAction({ action: 'cancel', bookmarkId });
    host.remove();
  };
  
  shadow.getElementById('rv-close').addEventListener('click', closeHandler);
  shadow.getElementById('rv-cancel').addEventListener('click', closeHandler);
  
  shadow.getElementById('rv-save').addEventListener('click', () => {
    const updatedData = {
      title: shadow.getElementById('rv-title').value,
      category: shadow.getElementById('rv-category').value,
      summary: shadow.getElementById('rv-summary').value,
      tags: shadow.getElementById('rv-tags').value.split(',').map(t => t.trim()).filter(t => t),
      userNotes: shadow.getElementById('rv-notes').value,
      revisitBy: new Date(shadow.getElementById('rv-revisit').value).toISOString()
    };
    handleOverlayAction({ action: 'save', bookmarkId, updatedData });
    host.remove();
  });
}

// Inject error overlay (Shadow DOM)
function injectErrorOverlay(bookmarkId, errorMessage) {
  const existingHost = document.getElementById('rv-overlay-host');
  if (existingHost) existingHost.remove();

  const { host, shadow } = createIsolatedHost('rv-overlay-host');

  const overlayContainer = document.createElement('div');
  overlayContainer.className = 'overlay-backdrop';
  overlayContainer.innerHTML = `
    <div class="overlay-card" style="max-width: 500px;">
      <div class="card-header">
        <h2 style="color: #EF4444;">Error Adding Bookmark</h2>
        <button class="close-btn" id="rv-close">&times;</button>
      </div>
      <div class="card-body">
        <p style="color: var(--color-text-secondary); line-height: 1.5;">${errorMessage}</p>
      </div>
      <div class="card-footer">
        <button class="btn btn-secondary" id="rv-cancel">Close</button>
      </div>
    </div>
  `;
  
  shadow.appendChild(overlayContainer);
  
  const closeHandler = () => {
    chrome.runtime.sendMessage({ action: 'cancelBookmark', bookmarkId });
    host.remove();
  };
  
  shadow.getElementById('rv-close').addEventListener('click', closeHandler);
  shadow.getElementById('rv-cancel').addEventListener('click', closeHandler);
}

// Handle overlay actions
async function handleOverlayAction(actionData) {
  if (actionData.action === 'save') {
    const response = await chrome.runtime.sendMessage({
      action: 'updateBookmark',
      bookmarkId: actionData.bookmarkId,
      updatedData: actionData.updatedData
    });
    
    if (response.success) {
      showNotification('Bookmark saved successfully!', 'success');
    } else {
      showNotification('Failed to save bookmark', 'error');
    }
  } else if (actionData.action === 'cancel') {
    await chrome.runtime.sendMessage({
      action: 'cancelBookmark',
      bookmarkId: actionData.bookmarkId
    });
    showNotification('Bookmark addition canceled', 'info');
  }
}

// Show notification (Shadow DOM)
function showNotification(message, type = 'info') {
  // Check for existing notification host or create one
  let host = document.getElementById('rv-notification-host');
  if (!host) {
    host = createIsolatedHost('rv-notification-host').host;
  }
  
  const shadow = host.shadowRoot;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  shadow.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
    if (shadow.children.length <= 1) { // Only style tag remains
      host.remove();
    }
  }, 3000);
}

function showDuplicateConfirmationDialog(existingBookmark) {
  const existingHost = document.getElementById('rv-overlay-host');
  if (existingHost) existingHost.remove();

  const { host, shadow } = createIsolatedHost('rv-overlay-host');

  const addedDate = new Date(existingBookmark.addedTimestamp).toLocaleDateString();

  const overlayContainer = document.createElement('div');
  overlayContainer.className = 'overlay-backdrop';
  overlayContainer.innerHTML = `
    <div class="overlay-card" style="max-width: 500px;">
      <div class="card-header">
        <h2 style="color: #F59E0B;">Duplicate Bookmark</h2>
      </div>
      <div class="card-body">
        <p>This page was already saved on <strong>${addedDate}</strong>.</p>
        <p>What would you like to do?</p>
      </div>
      <div class="card-footer" style="flex-direction: column; gap: 10px;">
        <button class="btn btn-primary" id="rv-yes" style="width: 100%;">Save Again (Duplicate)</button>
        <button class="btn btn-secondary" id="rv-edit" style="width: 100%;">Edit Existing Bookmark</button>
        <button class="btn btn-secondary" id="rv-no" style="width: 100%;">Cancel</button>
      </div>
    </div>
  `;
  
  shadow.appendChild(overlayContainer);

  shadow.getElementById('rv-yes').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'duplicateBookmarkResponse', response: 'yes' });
    host.remove();
  });

  shadow.getElementById('rv-edit').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'duplicateBookmarkResponse', response: 'edit', bookmarkId: existingBookmark.id });
    host.remove();
  });

  shadow.getElementById('rv-no').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'duplicateBookmarkResponse', response: 'no' });
    host.remove();
  });
}

})();