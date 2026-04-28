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
  --radius-md: 6px;
  --radius-lg: 8px;
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
  position: relative;
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
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-main);
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
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
  font-size: 14px;
  color: var(--color-text-secondary);
}

input, textarea, select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 15px;
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
  font-size: 15px;
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

/* Summary rendered markdown box */
.summary-label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.zoom-btn {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  padding: 2px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}
.zoom-btn:hover {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}
.summary-rendered {
  height: 110px;
  overflow-y: auto;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-input);
  color: var(--color-text-main);
  font-size: 15px;
  line-height: 1.5;
}
.summary-rendered > *:first-child { margin-top: 0; }
.summary-rendered > *:last-child { margin-bottom: 0; }
.summary-rendered p { margin: 0 0 0.6em; }
.summary-rendered h1, .summary-rendered h2, .summary-rendered h3,
.summary-rendered h4, .summary-rendered h5, .summary-rendered h6 {
  margin: 0.6em 0 0.3em; line-height: 1.25;
}
.summary-rendered h1 { font-size: 19px; }
.summary-rendered h2 { font-size: 18px; }
.summary-rendered h3 { font-size: 16px; }
.summary-rendered ul, .summary-rendered ol { margin: 0.3em 0 0.6em; padding-left: 1.4em; }
.summary-rendered li { margin: 0.15em 0; }
.summary-rendered code {
  background: rgba(0,0,0,0.07);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 0.88em;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.summary-rendered pre {
  background: rgba(0,0,0,0.07);
  padding: 10px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 0.5em 0;
}
.summary-rendered pre code { background: transparent; padding: 0; }
.summary-rendered a { color: var(--color-primary); text-decoration: underline; }
.summary-rendered blockquote {
  margin: 0.5em 0;
  padding: 4px 12px;
  border-left: 3px solid var(--color-border);
  color: var(--color-text-secondary);
}

/* Zoom overlay layer (within overlay-card) */
.summary-zoom {
  position: absolute;
  inset: 0;
  background: var(--color-bg-panel);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  opacity: 0;
  transform: scale(0.96);
  transform-origin: center;
  transition: opacity 0.2s ease, transform 0.2s ease;
  pointer-events: none;
  z-index: 20;
  box-shadow: var(--shadow-xl);
  border: 1px solid var(--color-border);
  overflow: hidden;
}
.summary-zoom.open {
  opacity: 1;
  transform: scale(1);
  pointer-events: auto;
}
.summary-zoom-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.summary-zoom-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-main);
}
.summary-zoom-body {
  flex: 1;
  padding: 20px 28px;
  overflow-y: auto;
  font-size: 16px;
  line-height: 1.6;
  color: var(--color-text-main);
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

// Try multiple selectors in order, return the first match (or null).
function querySelectorAny(selectors, root = document) {
  for (const sel of selectors) {
    const el = root.querySelector(sel);
    if (el) return el;
  }
  return null;
}

// Wait for any of the given selectors to appear.
function waitForAnyElement(selectors, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const existing = querySelectorAny(selectors);
    if (existing) return resolve(existing);

    const intervalTime = 100;
    let elapsedTime = 0;
    const interval = setInterval(() => {
      const el = querySelectorAny(selectors);
      if (el) {
        clearInterval(interval);
        resolve(el);
        return;
      }
      elapsedTime += intervalTime;
      if (elapsedTime >= timeout) {
        clearInterval(interval);
        reject(new Error(`None of selectors [${selectors.join(', ')}] found within ${timeout}ms.`));
      }
    }, intervalTime);
  });
}

// Selectors for the YouTube transcript segments container, in priority order.
// YouTube periodically renames these — list newest first, with older ones as fallbacks.
const TRANSCRIPT_CONTAINER_SELECTORS = [
  'yt-section-list-renderer[data-target-id="PAmodern_transcript_view"]',
  'div.ytSectionListRendererContents',
  'yt-section-list-renderer.ytSectionListRendererHost.style-scope.ytd-engagement-panel-section-list-renderer',
  'ytd-transcript-segment-list-renderer'
];

// Function to scrape transcript from YouTube DOM
async function getTranscriptFromDOM() {
  try {
    console.log('DEBUG: getTranscriptFromDOM start. Trying container selectors:', TRANSCRIPT_CONTAINER_SELECTORS);
    let segmentsContainer = querySelectorAny(TRANSCRIPT_CONTAINER_SELECTORS);
    console.log('DEBUG: Initial container match:', segmentsContainer ? segmentsContainer.tagName + (segmentsContainer.className ? '.' + segmentsContainer.className.split(' ').join('.') : '') : 'NONE');

    if (!segmentsContainer) {
      const descriptionExpander = document.querySelector('#expand.ytd-text-inline-expander');
      console.log('DEBUG: Description expander found:', !!descriptionExpander);
      if (descriptionExpander) descriptionExpander.click();

      // Try multiple ways to reveal the transcript panel.
      let showTranscriptButton = document.querySelector('button[aria-label="Show transcript"]');
      console.log('DEBUG: Direct Show transcript button found:', !!showTranscriptButton);

      if (!showTranscriptButton) {
        try {
          const transcriptSectionContainer = await waitForElement('ytd-video-description-transcript-section-renderer', 3000);
          showTranscriptButton = transcriptSectionContainer.querySelector('button[aria-label="Show transcript"]');
          console.log('DEBUG: Description-section transcript button found:', !!showTranscriptButton);
        } catch (e) {
          console.log('DEBUG: ytd-video-description-transcript-section-renderer not found:', e.message);
        }
      }

      if (!showTranscriptButton) return { error: "Could not find 'Show transcript' button. Container selectors also did not match. Check that the transcript panel is open or the page DOM has changed." };

      showTranscriptButton.click();
      console.log('DEBUG: Clicked Show transcript, waiting for container...');
      try {
        segmentsContainer = await waitForAnyElement(TRANSCRIPT_CONTAINER_SELECTORS, 8000);
      } catch (e) {
        return { error: `Transcript panel did not appear: ${e.message}` };
      }
      console.log('DEBUG: Container appeared after click:', segmentsContainer.tagName);
    }

    // Segments are lazy-rendered after the panel opens. Poll until they appear
    // (or a timeout). Search document-wide so a too-narrow container can't trap us.
    const SEGMENT_SELECTORS = [
      { selector: 'transcript-segment-view-model', text: '[role="text"]' },
      { selector: 'ytd-transcript-segment-renderer', text: '.segment-text' }
    ];

    const findSegments = () => {
      for (const candidate of SEGMENT_SELECTORS) {
        const inContainer = segmentsContainer.querySelectorAll(candidate.selector);
        if (inContainer.length > 0) return { ...candidate, elements: inContainer, scope: 'container' };
        const inDoc = document.querySelectorAll(candidate.selector);
        if (inDoc.length > 0) return { ...candidate, elements: inDoc, scope: 'document' };
      }
      return null;
    };

    let match = findSegments();
    const segmentTimeoutMs = 8000;
    const pollIntervalMs = 150;
    let waited = 0;
    while (!match && waited < segmentTimeoutMs) {
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      waited += pollIntervalMs;
      match = findSegments();
    }
    console.log(`DEBUG: Segment poll waited ${waited}ms, match:`, match ? `${match.elements.length} via ${match.selector} (${match.scope})` : 'NONE');

    if (!match) {
      return { error: `No text segments found after ${segmentTimeoutMs}ms. Container=${segmentsContainer.tagName}, tried selectors transcript-segment-view-model and ytd-transcript-segment-renderer.` };
    }
    const segmentElements = match.elements;
    const textSelector = match.text;
    const segmentSelector = match.selector;
    console.log(`DEBUG: Using segment selector "${segmentSelector}" with text selector "${textSelector}"`);

    let fullTranscript = "";
    let textHits = 0;
    segmentElements.forEach(segment => {
      const textElement = segment.querySelector(textSelector);
      if (textElement) {
        fullTranscript += textElement.textContent.trim() + " ";
        textHits++;
      }
    });
    console.log(`DEBUG: Segments with text matched: ${textHits}/${segmentElements.length}, transcript length: ${fullTranscript.length}`);

    if (!fullTranscript.trim()) {
      return { error: `Found ${segmentElements.length} segments but text selector "${textSelector}" matched nothing inside them.` };
    }
    return { transcript: fullTranscript.trim() };

  } catch (error) {
    console.error('ERROR in getTranscriptFromDOM:', error);
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

// Minimal safe markdown -> HTML renderer for the summary box.
// Escapes HTML first, then applies a small subset of markdown.
function renderMarkdown(md) {
  if (!md) return '';
  let text = String(md)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Fenced code blocks
  const codeBlocks = [];
  text = text.replace(/```([\s\S]*?)```/g, (_, code) => {
    const i = codeBlocks.push(code.replace(/^\n/, '').replace(/\n$/, '')) - 1;
    return ` CODEBLOCK${i} `;
  });

  // Inline code
  const inlineCodes = [];
  text = text.replace(/`([^`\n]+)`/g, (_, code) => {
    const i = inlineCodes.push(code) - 1;
    return ` INLINECODE${i} `;
  });

  // Headers
  text = text.replace(/^###### (.*)$/gm, '<h6>$1</h6>');
  text = text.replace(/^##### (.*)$/gm, '<h5>$1</h5>');
  text = text.replace(/^#### (.*)$/gm, '<h4>$1</h4>');
  text = text.replace(/^### (.*)$/gm, '<h3>$1</h3>');
  text = text.replace(/^## (.*)$/gm, '<h2>$1</h2>');
  text = text.replace(/^# (.*)$/gm, '<h1>$1</h1>');

  // Bold then italic (order matters)
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  text = text.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');

  // Links
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, url) => {
    const safe = /^https?:\/\//i.test(url) ? url : '#';
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${t}</a>`;
  });

  // Block-level grouping: lists, blockquotes, paragraphs
  const lines = text.split('\n');
  const out = [];
  let listType = null; // 'ul' | 'ol' | null
  let inBlockquote = false;
  let paraBuffer = [];

  const flushPara = () => {
    if (paraBuffer.length) {
      out.push('<p>' + paraBuffer.join('<br>') + '</p>');
      paraBuffer = [];
    }
  };
  const closeList = () => {
    if (listType) { out.push(`</${listType}>`); listType = null; }
  };
  const closeBlockquote = () => {
    if (inBlockquote) { out.push('</blockquote>'); inBlockquote = false; }
  };

  for (const raw of lines) {
    const line = raw;
    const trimmed = line.trim();
    const isHeading = /^<h\d>/.test(trimmed);
    const ulMatch = /^\s*[-*+]\s+(.*)$/.exec(line);
    const olMatch = /^\s*\d+\.\s+(.*)$/.exec(line);
    const bqMatch = /^\s*>\s?(.*)$/.exec(line);

    if (isHeading) {
      flushPara(); closeList(); closeBlockquote();
      out.push(trimmed);
      continue;
    }
    if (ulMatch) {
      flushPara(); closeBlockquote();
      if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; }
      out.push('<li>' + ulMatch[1] + '</li>');
      continue;
    }
    if (olMatch) {
      flushPara(); closeBlockquote();
      if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; }
      out.push('<li>' + olMatch[1] + '</li>');
      continue;
    }
    if (bqMatch) {
      flushPara(); closeList();
      if (!inBlockquote) { out.push('<blockquote>'); inBlockquote = true; }
      paraBuffer.push(bqMatch[1]);
      continue;
    }
    if (trimmed === '') {
      flushPara(); closeList(); closeBlockquote();
      continue;
    }
    paraBuffer.push(trimmed);
  }
  flushPara(); closeList(); closeBlockquote();

  let html = out.join('\n');

  // Restore code
  html = html.replace(/ INLINECODE(\d+) /g, (_, i) => `<code>${inlineCodes[+i]}</code>`);
  html = html.replace(/ CODEBLOCK(\d+) /g, (_, i) => `<pre><code>${codeBlocks[+i]}</code></pre>`);

  return html;
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
async function injectBookmarkOverlay(bookmarkId, bookmarkData) {
  console.log('DEBUG: Injecting bookmark overlay (Shadow DOM)');

  // Remove existing host if any
  const existingHost = document.getElementById('rv-overlay-host');
  if (existingHost) existingHost.remove();

  // Fetch existing categories from storage so the user can pick one
  const stored = await chrome.storage.local.get('rvData');
  const existingCategories = ((stored.rvData && stored.rvData.categories) || [])
    .map(c => (typeof c === 'string' ? c : c && c.name))
    .filter(Boolean);
  const suggested = bookmarkData.category || '';
  const categoryOptions = [...existingCategories];
  if (suggested && !categoryOptions.includes(suggested)) categoryOptions.unshift(suggested);

  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  categoryOptions.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));

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
          <input type="text" id="rv-title" value="${escapeHtml(bookmarkData.title || '')}">
        </div>

        <div class="form-group" style="position: relative;">
          <label>Category</label>
          <input type="text" id="rv-category" autocomplete="off" placeholder="Type to search or add a new category" value="${escapeHtml(suggested)}">
          <div id="rv-category-list" role="listbox" style="
            position: absolute; left: 0; right: 0; top: 100%;
            max-height: 200px; overflow-y: auto;
            background: var(--color-bg-input); border: 1px solid var(--color-border, #ccc);
            border-radius: 6px; margin-top: 2px; z-index: 10;
            display: none; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          "></div>
        </div>
        
        <div class="form-group">
          <div class="summary-label-row">
            <label>Summary</label>
            <button type="button" class="zoom-btn" id="rv-summary-zoom-btn">Zoom</button>
          </div>
          <div id="rv-summary" class="summary-rendered">${renderMarkdown(bookmarkData.summary || '')}</div>
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

      <div class="summary-zoom" id="rv-summary-zoom" aria-hidden="true">
        <div class="summary-zoom-header">
          <h3>Summary</h3>
          <button type="button" class="zoom-btn" id="rv-summary-zoom-close">Close</button>
        </div>
        <div class="summary-zoom-body" id="rv-summary-zoom-body"></div>
      </div>
    </div>
  `;

  shadow.appendChild(overlayContainer);

  // Stash the raw markdown so we can re-render in the zoom view and save it later.
  const summaryEl = shadow.getElementById('rv-summary');
  summaryEl.dataset.raw = bookmarkData.summary || '';

  // Zoom open/close (animated overlay within the overlay)
  const overlayCardEl = shadow.querySelector('.overlay-card');
  const zoomLayer = shadow.getElementById('rv-summary-zoom');
  const zoomBody = shadow.getElementById('rv-summary-zoom-body');
  let prevCardOverflow = '';
  const openZoom = () => {
    zoomBody.innerHTML = renderMarkdown(summaryEl.dataset.raw || '');
    zoomBody.scrollTop = 0;
    prevCardOverflow = overlayCardEl.style.overflowY;
    overlayCardEl.scrollTop = 0;
    overlayCardEl.style.overflowY = 'hidden';
    zoomLayer.classList.add('open');
    zoomLayer.setAttribute('aria-hidden', 'false');
  };
  const closeZoom = () => {
    zoomLayer.classList.remove('open');
    zoomLayer.setAttribute('aria-hidden', 'true');
    overlayCardEl.style.overflowY = prevCardOverflow || '';
  };
  shadow.getElementById('rv-summary-zoom-btn').addEventListener('click', openZoom);
  shadow.getElementById('rv-summary-zoom-close').addEventListener('click', closeZoom);
  shadow.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && zoomLayer.classList.contains('open')) {
      e.stopPropagation();
      closeZoom();
    }
  });
  
  // Event Listeners (attached to elements within shadow root)
  const closeHandler = () => {
    handleOverlayAction({ action: 'cancel', bookmarkId });
    host.remove();
  };
  
  shadow.getElementById('rv-close').addEventListener('click', closeHandler);
  shadow.getElementById('rv-cancel').addEventListener('click', closeHandler);

  const categoryInput = shadow.getElementById('rv-category');
  const categoryList = shadow.getElementById('rv-category-list');
  let activeIndex = -1;

  const renderList = () => {
    const query = categoryInput.value.trim().toLowerCase();
    const matches = query
      ? categoryOptions.filter(c => c.toLowerCase().includes(query))
      : categoryOptions.slice();
    if (matches.length === 0) {
      categoryList.style.display = 'none';
      return;
    }
    categoryList.innerHTML = matches.map((c, i) =>
      `<div class="rv-cat-item" data-value="${escapeHtml(c)}" style="
        padding: 8px 12px; cursor: pointer;
        ${i === activeIndex ? 'background: var(--color-bg-hover, rgba(0,0,0,0.08));' : ''}
      ">${escapeHtml(c)}</div>`
    ).join('');
    categoryList.style.display = '';
  };

  categoryInput.addEventListener('focus', () => {
    activeIndex = -1;
    categoryInput.select();
    renderList();
  });
  categoryInput.addEventListener('input', () => { activeIndex = -1; renderList(); });
  categoryInput.addEventListener('keydown', (e) => {
    const items = categoryList.querySelectorAll('.rv-cat-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      renderList();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, -1);
      renderList();
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      categoryInput.value = items[activeIndex].dataset.value;
      categoryList.style.display = 'none';
    } else if (e.key === 'Escape') {
      categoryList.style.display = 'none';
    }
  });
  categoryList.addEventListener('mousedown', (e) => {
    const item = e.target.closest('.rv-cat-item');
    if (!item) return;
    e.preventDefault();
    categoryInput.value = item.dataset.value;
    categoryList.style.display = 'none';
  });
  categoryInput.addEventListener('blur', () => {
    setTimeout(() => { categoryList.style.display = 'none'; }, 120);
  });

  shadow.getElementById('rv-save').addEventListener('click', () => {
    const updatedData = {
      title: shadow.getElementById('rv-title').value,
      category: categoryInput.value.trim(),
      summary: summaryEl.dataset.raw || '',
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