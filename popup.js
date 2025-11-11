// Handle popup menu actions
document.getElementById('add-bookmark').addEventListener('click', async () => {
  const data = await chrome.storage.local.get('rvData');
  if (!data.rvData?.settings?.onboardingComplete) {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
  } else {
    chrome.tabs.create({ url: chrome.runtime.getURL('list-modal.html?action=add') });
  }
  window.close();
});

document.getElementById('open-list').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('list-modal.html') });
  window.close();
});