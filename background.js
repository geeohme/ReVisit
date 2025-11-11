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
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true; // Keep message channel open for async response
});

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