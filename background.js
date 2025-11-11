// Background service worker for ReVisit extension

// Default data structure
const DEFAULT_DATA = {
  bookmarks: [],
  categories: ["Articles", "Research", "Work", "Personal"],
  settings: {
    userName: "",
    defaultIntervalDays: 7,
    apiKey: "",
    onboardingComplete: false,
    priorityThresholdDays: 3
  }
};

// Initialize storage on install
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    const data = await chrome.storage.local.get('rvData');
    if (!data.rvData) {
      await chrome.storage.local.set({ rvData: DEFAULT_DATA });
    }
  }
});

// Helper to get storage data
async function getStorageData() {
  const result = await chrome.storage.local.get('rvData');
  return result.rvData || DEFAULT_DATA;
}

// Helper to save storage data
async function saveStorageData(data) {
  await chrome.storage.local.set({ rvData: data });
}

// Helper function to verify content script is ready
async function verifyContentScript(tabId) {
  try {
    console.log('DEBUG: Sending ping to content script for verification');
    const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    console.log('DEBUG: Ping response received:', response);
    return true;
  } catch (error) {
    console.warn('WARN: Ping failed - content script not ready:', error.message);
    return false;
  }
}

// Helper function to send message with retry (exponential backoff)
async function sendMessageWithRetry(tabId, message, maxRetries = 5) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      // Wait before first attempt (and longer for subsequent attempts)
      const delay = i === 0 ? 100 : Math.min(100 * Math.pow(2, i), 1000);
      console.log(`DEBUG: Waiting ${delay}ms before attempt ${i + 1}`);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      console.log(`DEBUG: Sending message (attempt ${i + 1}/${maxRetries})`);
      const response = await chrome.tabs.sendMessage(tabId, message);
      console.log('DEBUG: Message sent successfully, response:', response);
      return response;
    } catch (error) {
      console.warn(`WARN: Attempt ${i + 1} failed:`, error.message);
      if (i === maxRetries - 1) {
        // Last attempt, throw the error
        throw error;
      }
      // Continue to next retry
    }
  }
}

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      if (request.action === 'getData') {
        const data = await getStorageData();
        sendResponse({ success: true, data });
      } else if (request.action === 'saveData') {
        await saveStorageData(request.data);
        sendResponse({ success: true });
      } else if (request.action === 'scrapePage') {
        // Execute scraping in content script
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: scrapePageContent
        });
        sendResponse({ success: true, data: results[0].result });
      } else if (request.action === 'openUrl') {
        await chrome.tabs.create({ url: request.url, active: true });
        sendResponse({ success: true });
      } else if (request.action === 'injectFloatingModal') {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: injectFloatingModal,
          args: [request.bookmarkId, request.revisitBy]
        });
        sendResponse({ success: true });
      } else if (request.action === 'addBookmark') {
        console.log('DEBUG: Background received addBookmark request');
        
        // Get current tab
        const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        console.log('DEBUG: Current tab:', currentTab);
        
        if (!currentTab) {
          throw new Error('No active tab found');
        }
        
        // Get storage data
        const data = await getStorageData();
        const settings = data.settings || {};
        const categories = data.categories || [];
        
        console.log('DEBUG: Settings loaded in addBookmark:', settings);
        console.log('DEBUG: API Key present in addBookmark:', !!settings.apiKey);
        console.log('DEBUG: Categories in addBookmark:', categories);
        
        // Create preliminary bookmark
        const preliminaryBookmark = {
          id: 'rv-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
          url: currentTab.url,
          title: currentTab.title || 'Untitled',
          category: 'Uncategorized',
          summary: '',
          tags: [],
          userNotes: '',
          addedTimestamp: Date.now(),
          revisitBy: new Date(Date.now() + (settings.defaultIntervalDays || 7) * 24 * 60 * 60 * 1000).toISOString(),
          status: 'Active',
          history: [],
          isPreliminary: true // Mark as preliminary
        };
        
        console.log('DEBUG: Preliminary bookmark created:', preliminaryBookmark);
        
        // Save preliminary bookmark
        data.bookmarks = data.bookmarks || [];
        data.bookmarks.push(preliminaryBookmark);
        await saveStorageData(data);
        
        // Ensure content script is injected before sending message
        console.log('DEBUG: Starting content script injection for tab:', currentTab.id);
        try {
          const injectionResult = await chrome.scripting.executeScript({
            target: { tabId: currentTab.id },
            files: ['content.js']
          });
          console.log('DEBUG: Injection result:', injectionResult);
          
          // Wait a bit more after injection for script to initialize
          console.log('DEBUG: Waiting 500ms after injection for script to initialize');
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (injectionError) {
          console.error('ERROR: Content script injection failed:', injectionError);
          throw new Error(`Content script injection failed: ${injectionError.message}`);
        }
        
        // Verify content script is ready before sending the real message
        console.log('DEBUG: Verifying content script is ready...');
        const isReady = await verifyContentScript(currentTab.id);
        if (!isReady) {
          console.error('ERROR: Content script verification failed');
          throw new Error('Content script is not responding to ping');
        }
        console.log('DEBUG: Content script verification successful');
        
        // Send message to content script to scrape and show overlay
        console.log('DEBUG: Sending scrapeAndShowOverlay to tab:', currentTab.id);
        const response = await sendMessageWithRetry(currentTab.id, {
          action: 'scrapeAndShowOverlay',
          bookmarkId: preliminaryBookmark.id,
          bookmarkData: preliminaryBookmark
        });
        
        sendResponse({ success: true, bookmarkId: preliminaryBookmark.id });
      } else if (request.action === 'processWithAI') {
        // Process scraped content with AI
        console.log('DEBUG: Background processing AI request');
        
        // Load settings and categories from storage
        const data = await getStorageData();
        const settings = data.settings || {};
        const categories = data.categories || [];
        
        console.log('DEBUG: Settings loaded:', settings);
        console.log('DEBUG: API Key present:', !!settings.apiKey);
        console.log('DEBUG: Categories:', categories);
        
        // Pass settings to processWithAI
        const result = await processWithAI(request.scrapedData, settings, categories);
        sendResponse({ success: true, result });
      } else if (request.action === 'updateBookmark') {
        // Update bookmark with final data
        console.log('DEBUG: Background updating bookmark:', request.bookmarkId);
        const data = await getStorageData();
        const bookmarkIndex = data.bookmarks.findIndex(b => b.id === request.bookmarkId);
        
        if (bookmarkIndex !== -1) {
          // Update the bookmark, removing preliminary flag
          data.bookmarks[bookmarkIndex] = {
            ...data.bookmarks[bookmarkIndex],
            ...request.updatedData,
            isPreliminary: false
          };
          await saveStorageData(data);
          sendResponse({ success: true });
        } else {
          throw new Error('Bookmark not found');
        }
      } else if (request.action === 'cancelBookmark') {
        // Remove preliminary bookmark
        console.log('DEBUG: Background canceling bookmark:', request.bookmarkId);
        const data = await getStorageData();
        data.bookmarks = data.bookmarks.filter(b => b.id !== request.bookmarkId);
        await saveStorageData(data);
        sendResponse({ success: true });
      }
      
    } catch (error) {
      console.error('ERROR: Background processing failed:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true; // Keep message channel open for async response
});

// AI processing function
async function processWithAI(scrapedData, settings, categories) {
  console.log('DEBUG: processWithAI called with settings:', settings);
  console.log('DEBUG: API Key in processWithAI:', settings.apiKey ? 'PRESENT' : 'MISSING');
  
  // Validate API key
  if (!settings.apiKey) {
    throw new Error('API key not found in settings. Please configure your API key in the extension settings.');
  }
  
  const prompt = `Summarize the following webpage content in under 200 words using markdown. Categorize it: Use an existing category if fitting (existing: ${categories.join(', ')}), else suggest a new one. Generate up to 10 relevant tags.
  
Content: ${scrapedData.content}

Return ONLY a JSON object with this exact structure:
{
  "summary": "markdown summary",
  "category": "single category name",
  "tags": ["tag1", "tag2", "tag3"]
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2500,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('ERROR: API request failed:', response.status, errorData);
    throw new Error(`API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
  }
  
  const data = await response.json();
  const content = data.content[0].text;
  
  // Parse JSON from response
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('Invalid API response format');
  }
  
  return JSON.parse(match[0]);
}

// Scrape function to be injected
function scrapePageContent() {
  const bodyText = document.body.innerText || '';
  const truncated = bodyText.substring(0, 2000);
  return {
    url: window.location.href,
    title: document.title || 'Untitled',
    content: truncated
  };
}

// Floating modal injection function
function injectFloatingModal(bookmarkId, revisitBy) {
  const modalHtml = `
    <div id="rv-floating-modal" style="position: fixed; bottom: 20px; right: 20px; width: 220px; background: white; border: 2px solid #4a90e2; border-radius: 8px; padding: 15px; z-index: 10000; box-shadow: 0 4px 12px rgba(0,0,0,0.15); font-family: Arial, sans-serif; cursor: move;">
      <div id="rv-floating-header" style="font-weight: bold; margin-bottom: 10px; color: #4a90e2;">ReVisit Action</div>
      <div style="font-size: 12px; margin-bottom: 15px; color: #666;">Revisit by: ${new Date(revisitBy).toLocaleDateString()}</div>
      <div style="display: flex; gap: 8px;">
        <button id="rv-btn-complete" style="flex: 1; padding: 8px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">Complete</button>
        <button id="rv-btn-keep" style="flex: 1; padding: 8px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">Keep</button>
      </div>
      <button id="rv-btn-close" style="position: absolute; top: 5px; right: 5px; background: none; border: none; cursor: pointer; font-size: 16px; color: #999;">×</button>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  
  // Make draggable
  const modal = document.getElementById('rv-floating-modal');
  let isDragging = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;
  
  modal.addEventListener('mousedown', (e) => {
    if (e.target.id === 'rv-floating-header') {
      isDragging = true;
      initialX = e.clientX - currentX;
      initialY = e.clientY - currentY;
    }
  });
  
  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      e.preventDefault();
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;
      modal.style.transform = `translate(${currentX}px, ${currentY}px)`;
    }
  });
  
  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
  
  // Button handlers
  document.getElementById('rv-btn-complete').addEventListener('click', () => {
    window.postMessage({ type: 'REVISIT_ACTION', action: 'Complete', bookmarkId }, '*');
    modal.remove();
  });
  
  document.getElementById('rv-btn-keep').addEventListener('click', () => {
    window.postMessage({ type: 'REVISIT_ACTION', action: 'ReVisited', bookmarkId }, '*');
    modal.remove();
  });
  
  document.getElementById('rv-btn-close').addEventListener('click', () => {
    modal.remove();
  });
}