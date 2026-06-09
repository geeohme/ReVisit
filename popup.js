// Handle popup menu actions
document.getElementById('add-bookmark').addEventListener('click', async () => {
  const data = await chrome.storage.local.get('rvData');
  if (!data.rvData?.settings?.onboardingComplete) {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
  } else {
    // Send message to background to start the bookmark addition process.
    // Await the ACK so the service worker has a chance to wake up and
    // receive the message before the popup tears down — otherwise the
    // first click after a fresh page load can be silently dropped.
    console.log('DEBUG: Sending addBookmark message to background');
    try {
      const response = await chrome.runtime.sendMessage({ action: 'addBookmark' });
      if (response && !response.success) {
        console.error('ERROR: Background processing failed:', response.error);
      }
    } catch (err) {
      console.error('ERROR: Failed to send addBookmark message:', err);
    }
  }
  window.close();
});

document.getElementById('summarize-only').addEventListener('click', async () => {
  const data = await chrome.storage.local.get('rvData');
  if (!data.rvData?.settings?.onboardingComplete) {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
  } else {
    // Mirror addBookmark: await the ACK so the service worker wakes up before
    // the popup tears down. No bookmark is created in this flow up front.
    try {
      const response = await chrome.runtime.sendMessage({ action: 'summarizeOnly' });
      if (response && !response.success) {
        console.error('ERROR: Background summarize-only failed:', response.error);
      }
    } catch (err) {
      console.error('ERROR: Failed to send summarizeOnly message:', err);
    }
  }
  window.close();
});

document.getElementById('open-list').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('list-modal.html') });
  window.close();
});