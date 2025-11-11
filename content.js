// Content script for page scraping and floating modal communication
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scrapePage') {
    const bodyText = document.body.innerText || '';
    const truncated = bodyText.substring(0, 2000);
    sendResponse({
      url: window.location.href,
      title: document.title || 'Untitled',
      content: truncated
    });
  }
  return true;
});

// Listen for floating modal actions (from injected script)
window.addEventListener('message', (event) => {
  if (event.data.type === 'REVISIT_ACTION') {
    // Forward to background script
    chrome.runtime.sendMessage({
      action: 'updateBookmarkStatus',
      bookmarkId: event.data.bookmarkId,
      actionType: event.data.action
    });
  }
});