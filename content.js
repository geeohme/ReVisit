// Content script for page scraping and floating modal communication
console.log('DEBUG: Content script starting execution on:', window.location.href);

// Wrap entire script in try-catch to catch any initialization errors
try {
  console.log('DEBUG: 101 Content script loaded successfully, registering message listener');
  
  // Synchronous message handler - no async/await anywhere
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('DEBUG: 102 Content script received message:', request);
    
    if (request.action === 'ping') {
      console.log('DEBUG: 103 Responding to ping request');
      sendResponse({ success: true, message: 'Content script is ready' });
      return;
    }
    
    if (request.action === 'scrapePage') {
      console.log('DEBUG: 104 Processing scrapePage request');
      const bodyText = document.body.innerText || '';
      const truncated = bodyText.substring(0, 2000);
      const response = {
        url: window.location.href,
        title: document.title || 'Untitled',
        content: truncated
      };
      console.log('DEBUG: 105 Sending response:', response);
      sendResponse(response);
      return;
    }
    
    if (request.action === 'scrapeAndShowOverlay') {
      console.log('DEBUG: 106 Processing scrapeAndShowOverlay request');
      handleScrapeAndShowOverlay(request.bookmarkId, request.bookmarkData);
      sendResponse({ success: true });
      return;
    }
    
    if (request.action === 'injectOverlayWithAIResults') {
      console.log('DEBUG: 107 Processing injectOverlayWithAIResults request');
      injectBookmarkOverlay(request.bookmarkId, request.bookmarkData);
      sendResponse({ success: true });
      return;
    }

    if (request.action === 'showNotification') {
      console.log('DEBUG: Showing notification from background:', request.message);
      showNotification(request.message, request.type);
      sendResponse({ success: true });
      return;
    }

    console.warn('WARN: 108 Unknown action received:', request.action);
    sendResponse({ success: false, error: 'Unknown action' });
  });
  
  console.log('DEBUG: 109 Message listener registered successfully');
  
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

// Shared utility functions (duplicated for content script compatibility)
// Note: These are also defined in utils.js but content scripts need them inline
function isYouTubeUrl(url) {
  console.log('DEBUG: 111 Checking if URL is YouTube:', url);
  return url.includes('youtube.com/watch') || url.includes('youtu.be/');
}

function extractVideoId(url) {
  console.log('DEBUG: 112 Extracting video ID from URL:', url);
  const urlObj = new URL(url);
  return urlObj.searchParams.get('v') || urlObj.pathname.split('/').pop();
}

// YouTube content scraping
function scrapeYouTubeContent() {
  console.log('DEBUG: 113 Scraping YouTube content');
  const videoId = extractVideoId(window.location.href);
  const title = document.title.replace(' - YouTube', '');
  
  // Get description from meta tag or page
  const descriptionMeta = document.querySelector('meta[name="description"]');
  const description = descriptionMeta ? descriptionMeta.content : '';
  
  return {
    url: window.location.href,
    title: title,
    content: description.substring(0, 2000), // Description only, no comments
    isYouTube: true,
    videoId: videoId
  };
}

// Helper function to wait for an element to appear in the DOM
function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const existingElement = document.querySelector(selector);
    console.log('DEBUG: 114 Waiting for element:', selector);
    if (existingElement) {
      return resolve(existingElement);
    }

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
    console.log("DEBUG: 115 Scraper: Starting transcript search...");
    let segmentsContainer = document.querySelector('ytd-transcript-segment-list-renderer');

    if (!segmentsContainer) {
      console.log("DEBUG: 116 Scraper: Transcript panel not found. Attempting to open it.");
      
      // Step 1: Click "...more" to expand the description area
      const descriptionExpander = document.querySelector('#expand.ytd-text-inline-expander');
      if (descriptionExpander) {
        console.log("DEBUG: 117 Scraper: Found '...more' button. Clicking to expand description.");
        descriptionExpander.click();
      } else {
        console.log("DEBUG: 118 Scraper: '...more' button not found, assuming description is already expanded.");
      }

      // Step 2: Wait for the specific transcript section container to appear
      console.log("DEBUG: 119 Scraper: Waiting for the transcript section container to appear...");
      const transcriptSectionContainer = await waitForElement('ytd-video-description-transcript-section-renderer');
      console.log("DEBUG: 120 Scraper: Found transcript section container.");

      // Step 3: Find the button within that container using its unique aria-label
      const showTranscriptButton = transcriptSectionContainer.querySelector('button[aria-label="Show transcript"]');

      if (!showTranscriptButton) {
        console.error("DEBUG: 121 Scraper: Could not find the 'Show transcript' button inside its container.");
        return { error: "Could not find the 'Show transcript' button. The video may not have a transcript or the UI has changed." };
      }
      
      console.log("DEBUG: 122 Scraper: Found 'Show transcript' button. Clicking it.");
      showTranscriptButton.click();

      // Step 4: Wait for the actual transcript content panel to render
      segmentsContainer = await waitForElement('ytd-transcript-segment-list-renderer');
      console.log("DEBUG: 123 Scraper: Transcript panel is now visible.");
    } else {
      console.log("DEBUG: 124 Scraper: Transcript panel was already open.");
    }

    // Step 5: Scrape the content
    await new Promise(resolve => setTimeout(resolve, 500)); // Small delay for content to load
    
    const segmentElements = segmentsContainer.querySelectorAll('ytd-transcript-segment-renderer');
    if (segmentElements.length === 0) {
      return { error: "Transcript panel is open, but no text segments were found." };
    }

    console.log(`DEBUG: 125 Scraper: Found ${segmentElements.length} transcript segments. Scraping text.`);
    let fullTranscript = "";
    segmentElements.forEach(segment => {
      const textElement = segment.querySelector('.segment-text');
      if (textElement) {
        fullTranscript += textElement.textContent.trim() + " ";
      }
    });

    return { transcript: fullTranscript.trim() };

  } catch (error) {
    console.error("DEBUG: 126 Transcript scraper error:", error);
    return { error: error.message };
  }
}

// Handle the scrape and overlay workflow
async function handleScrapeAndShowOverlay(bookmarkId, preliminaryBookmark) {
  console.log('DEBUG: 127 Starting scrape and overlay workflow');
  
  // Scrape page content
  let scrapedData;
  let transcript = null;
  const url = window.location.href;
  
  if (isYouTubeUrl(url)) {
    console.log('DEBUG: 128 Detected YouTube URL, using YouTube scraping');
    scrapedData = scrapeYouTubeContent();
    
    // Also try to get transcript for YouTube videos
    console.log('DEBUG: 129 Attempting to scrape transcript from DOM');
    const transcriptResult = await getTranscriptFromDOM();
    console.log('DEBUG: 130 Transcript result:', transcriptResult);
    
    if (transcriptResult && transcriptResult.transcript) {
      transcript = transcriptResult.transcript;
      console.log('DEBUG: 131 Transcript successfully scraped, length:', transcript.length);
    } else {
      console.warn('WARN: 132 No transcript available from DOM scraping');
    }
  } else {
    console.log('DEBUG: 134 Standard URL, using standard scraping');
    const bodyText = document.body.innerText || '';
    scrapedData = {
      url: window.location.href,
      title: document.title || 'Untitled',
      content: bodyText.substring(0, 2000),
      isYouTube: false,
      videoId: null
    };
  }
  console.log('DEBUG: 135 Scraped data:', scrapedData);
  
  // Send to background for AI processing
  console.log('DEBUG: 136 Sending to background for AI processing: processWithAI');

  // Show processing notification to user
  showNotification('Analyzing content...', 'info');

  const message = {
    action: 'processWithAI',
    scrapedData: scrapedData
  };

  // Add transcript to message if available
  if (transcript) {
    message.transcript = transcript;
    console.log('DEBUG: 137 Including transcript in AI processing request');
  }

  chrome.runtime.sendMessage(message).then(response => {
    if (!response.success) {
      throw new Error(response.error || 'AI processing failed');
    }
    
    console.log('DEBUG: 138 AI processing result:', response.result);
    
    // Inject overlay with AI results
    injectBookmarkOverlay(bookmarkId, {
      ...preliminaryBookmark,
      category: response.result.category,
      summary: response.result.summary,
      tags: response.result.tags
    });
  }).catch(error => {
    console.error('ERROR: 139 Scrape and overlay workflow failed:', error);
    // Show error overlay
    injectErrorOverlay(bookmarkId, error.message);
  });
}

// Inject the bookmark overlay into the current page
function injectBookmarkOverlay(bookmarkId, bookmarkData) {
  console.log('DEBUG: 145 Injecting bookmark overlay');
  
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
  
  console.log('DEBUG: 146 Overlay injected successfully');
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
  console.log('DEBUG: 147 Handling overlay action:', actionData);
  
  const overlay = document.getElementById('rv-bookmark-overlay');
  if (overlay) {
    overlay.remove();
  }
  
  if (actionData.action === 'save') {
    // Update bookmark with final data
    console.log('DEBUG: 148 Saving bookmark with final data');
    const response = await chrome.runtime.sendMessage({
      action: 'updateBookmark',
      bookmarkId: actionData.bookmarkId,
      updatedData: actionData.updatedData
    });
    
    if (response.success) {
      console.log('DEBUG: 149 Bookmark saved successfully');
      // Show success notification
      showNotification('Bookmark saved successfully!', 'success');
    } else {
      console.error('ERROR: 150 Failed to save bookmark:', response.error);
      showNotification('Failed to save bookmark', 'error');
    }
  } else if (actionData.action === 'cancel') {
    // Cancel and remove preliminary bookmark
    console.log('DEBUG: 151 Canceling bookmark');
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
  console.log('DEBUG: 152 Showing notification:', message);
  
  document.body.appendChild(notification);
  
  // Remove after 3 seconds
  setTimeout(() => {
    notification.remove();
  }, 3000);
}