// Handle popup menu actions
document.getElementById('add-bookmark').addEventListener('click', async () => {
  const data = await chrome.storage.local.get('rvData');
  if (!data.rvData?.settings?.onboardingComplete) {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
  } else {
    // Send message to background to start the bookmark addition process
    console.log('DEBUG: Sending addBookmark message to background');
    chrome.runtime.sendMessage({ action: 'addBookmark' }, (response) => {
      if (response && !response.success) {
        console.error('ERROR: Background processing failed:', response.error);
      }
    });
  }
  window.close();
});

document.getElementById('open-list').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('list-modal.html') });
  window.close();
});