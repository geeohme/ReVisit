// Content script for page scraping and floating modal communication
console.log('DEBUG: Content script starting execution on:', window.location.href);

// Wrap entire script in try-catch to catch any initialization errors
try {
  console.log('DEBUG: Content script loaded successfully, registering message listener');
  
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('DEBUG: Content script received message:', request);
    
    try {
      if (request.action === 'ping') {
        console.log('DEBUG: Responding to ping request');
        sendResponse({ success: true, message: 'Content script is ready' });
      } else if (request.action === 'scrapePage') {
        console.log('DEBUG: Processing scrapePage request');
        const bodyText = document.body.innerText || '';
        const truncated = bodyText.substring(0, 2000);
        const response = {
          url: window.location.href,
          title: document.title || 'Untitled',
          content: truncated
        };
        console.log('DEBUG: Sending response:', response);
        sendResponse(response);
      } else if (request.action === 'scrapeAndShowOverlay') {
        console.log('DEBUG: Processing scrapeAndShowOverlay request');
        handleScrapeAndShowOverlay(request.bookmarkId, request.bookmarkData);
        sendResponse({ success: true });
      } else {
        console.warn('WARN: Unknown action received:', request.action);
        sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('ERROR: Message handler failed:', error);
      sendResponse({ success: false, error: error.message });
    }
    return true; // Keep message channel open for async response
  });
  
  console.log('DEBUG: Message listener registered successfully');
  
} catch (error) {
  console.error('ERROR: Content script initialization failed:', error);
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

// Handle the scrape and overlay workflow
async function handleScrapeAndShowOverlay(bookmarkId, preliminaryBookmark) {
  console.log('DEBUG: Starting scrape and overlay workflow');
  
  try {
    // Scrape page content
    const bodyText = document.body.innerText || '';
    const scrapedData = {
      url: window.location.href,
      title: document.title || 'Untitled',
      content: bodyText.substring(0, 2000)
    };
    console.log('DEBUG: Scraped data:', scrapedData);
    
    // Send to background for AI processing
    console.log('DEBUG: Sending to background for AI processing');
    const response = await chrome.runtime.sendMessage({
      action: 'processWithAI',
      scrapedData: scrapedData
      // Settings and categories will be loaded by background script
    });
    
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
    
  } catch (error) {
    console.error('ERROR: Scrape and overlay workflow failed:', error);
    // Show error overlay
    injectErrorOverlay(bookmarkId, error.message);
  }
}

// Listen for floating modal actions (from injected script)
window.addEventListener('message', (event) => {
  console.log('DEBUG: Window message received:', event.data);
  
  try {
    if (event.data.type === 'REVISIT_ACTION') {
      console.log('DEBUG: Forwarding REVISIT_ACTION to background');
      // Forward to background script
      chrome.runtime.sendMessage({
        action: 'updateBookmarkStatus',
        bookmarkId: event.data.bookmarkId,
        actionType: event.data.action
      });
    } else if (event.data.type === 'OVERLAY_ACTION') {
      console.log('DEBUG: Handling OVERLAY_ACTION');
      // Handle overlay actions
      handleOverlayAction(event.data);
    } else {
      console.log('DEBUG: Ignoring unknown message type:', event.data.type);
    }
  } catch (error) {
    console.error('ERROR: Window message handler failed:', error);
  }
});

// Inject the bookmark overlay into the current page
function injectBookmarkOverlay(bookmarkId, bookmarkData) {
  console.log('DEBUG: Injecting bookmark overlay');
  
  // Remove existing overlay if any
  const existingOverlay = document.getElementById('rv-bookmark-overlay');
  if (existingOverlay) {
    existingOverlay.remove();
  }
  
  const overlayHtml = `
    <div id="rv-bookmark-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 9999; display: flex; align-items: center; justify-content: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <div style="background: white; border-radius: 12px; padding: 24px; width: 90%; max-width: 600px; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 40px rgba(0,0,0,0.3);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="margin: 0; color: #333;">Add ReVisit Bookmark</h2>
          <button id="rv-overlay-close" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #999;">&times;</button>
        </div>
        
        <div style="margin-bottom: 20px;">
          <label style="display: block; font-weight: 600; margin-bottom: 8px; color: #555;">Title:</label>
          <input type="text" id="rv-title" value="${bookmarkData.title}" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;">
        </div>
        
        <div style="margin-bottom: 20px;">
          <label style="display: block; font-weight: 600; margin-bottom: 8px; color: #555;">Category:</label>
          <input type="text" id="rv-category" value="${bookmarkData.category}" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;">
        </div>
        
        <div style="margin-bottom: 20px;">
          <label style="display: block; font-weight: 600; margin-bottom: 8px; color: #555;">Summary:</label>
          <textarea id="rv-summary" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; min-height: 120px; resize: vertical;">${bookmarkData.summary}</textarea>
        </div>
        
        <div style="margin-bottom: 20px;">
          <label style="display: block; font-weight: 600; margin-bottom: 8px; color: #555;">Tags (comma-separated):</label>
          <input type="text" id="rv-tags" value="${bookmarkData.tags.join(', ')}" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;">
        </div>
        
        <div style="margin-bottom: 20px;">
          <label style="display: block; font-weight: 600; margin-bottom: 8px; color: #555;">Your Notes:</label>
          <textarea id="rv-notes" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; min-height: 80px; resize: vertical;" placeholder="Add your own notes..."></textarea>
        </div>
        
        <div style="margin-bottom: 20px;">
          <label style="display: block; font-weight: 600; margin-bottom: 8px; color: #555;">Revisit By:</label>
          <input type="date" id="rv-revisit" value="${bookmarkData.revisitBy.split('T')[0]}" style="padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;">
        </div>
        
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button id="rv-cancel-btn" style="padding: 10px 20px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; font-size: 14px; color: #666;">Cancel</button>
          <button id="rv-save-btn" style="padding: 10px 20px; background: #4a90e2; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; color: white; font-weight: 600;">Save Bookmark</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', overlayHtml);
  
  // Add event listeners
  document.getElementById('rv-overlay-close').addEventListener('click', () => {
    handleOverlayAction({ action: 'cancel', bookmarkId });
  });
  
  document.getElementById('rv-cancel-btn').addEventListener('click', () => {
    handleOverlayAction({ action: 'cancel', bookmarkId });
  });
  
  document.getElementById('rv-save-btn').addEventListener('click', () => {
    const updatedData = {
      title: document.getElementById('rv-title').value,
      category: document.getElementById('rv-category').value,
      summary: document.getElementById('rv-summary').value,
      tags: document.getElementById('rv-tags').value.split(',').map(t => t.trim()).filter(t => t),
      userNotes: document.getElementById('rv-notes').value,
      revisitBy: new Date(document.getElementById('rv-revisit').value).toISOString()
    };
    handleOverlayAction({ action: 'save', bookmarkId, updatedData });
  });
  
  console.log('DEBUG: Overlay injected successfully');
}

// Inject error overlay
function injectErrorOverlay(bookmarkId, errorMessage) {
  const overlayHtml = `
    <div id="rv-bookmark-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 9999; display: flex; align-items: center; justify-content: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <div style="background: white; border-radius: 12px; padding: 24px; width: 90%; max-width: 500px; box-shadow: 0 20px 40px rgba(0,0,0,0.3);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="margin: 0; color: #d32f2f;">Error Adding Bookmark</h2>
          <button id="rv-overlay-close" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #999;">&times;</button>
        </div>
        
        <p style="color: #666; margin-bottom: 20px; line-height: 1.5;">${errorMessage}</p>
        
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button id="rv-cancel-btn" style="padding: 10px 20px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; font-size: 14px; color: #666;">Close</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', overlayHtml);
  
  // Add event listeners
  const closeHandler = () => {
    document.getElementById('rv-bookmark-overlay').remove();
    // Cancel the bookmark
    chrome.runtime.sendMessage({ action: 'cancelBookmark', bookmarkId });
  };
  
  document.getElementById('rv-overlay-close').addEventListener('click', closeHandler);
  document.getElementById('rv-cancel-btn').addEventListener('click', closeHandler);
}

// Handle overlay actions
async function handleOverlayAction(actionData) {
  console.log('DEBUG: Handling overlay action:', actionData);
  
  const overlay = document.getElementById('rv-bookmark-overlay');
  if (overlay) {
    overlay.remove();
  }
  
  if (actionData.action === 'save') {
    // Update bookmark with final data
    console.log('DEBUG: Saving bookmark with final data');
    const response = await chrome.runtime.sendMessage({
      action: 'updateBookmark',
      bookmarkId: actionData.bookmarkId,
      updatedData: actionData.updatedData
    });
    
    if (response.success) {
      console.log('DEBUG: Bookmark saved successfully');
      // Show success notification
      showNotification('Bookmark saved successfully!', 'success');
    } else {
      console.error('ERROR: Failed to save bookmark:', response.error);
      showNotification('Failed to save bookmark', 'error');
    }
  } else if (actionData.action === 'cancel') {
    // Cancel and remove preliminary bookmark
    console.log('DEBUG: Canceling bookmark');
    await chrome.runtime.sendMessage({
      action: 'cancelBookmark',
      bookmarkId: actionData.bookmarkId
    });
    showNotification('Bookmark addition canceled', 'info');
  }
}

// Show notification
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
    color: white;
    border-radius: 6px;
    z-index: 10000;
    font-size: 14px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  `;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  // Remove after 3 seconds
  setTimeout(() => {
    notification.remove();
  }, 3000);
}