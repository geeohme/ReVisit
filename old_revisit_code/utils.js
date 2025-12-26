// Shared utility functions for ReVisit extension

/**
 * Send message to content script with exponential backoff retry
 * @param {number} tabId - Tab ID to send message to
 * @param {Object} message - Message object to send
 * @param {number} maxRetries - Maximum number of retry attempts (default: 3)
 * @returns {Promise<Object>} Response from content script
 */
async function sendMessageWithRetry(tabId, message, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`DEBUG: Attempting to send message to tab ${tabId}, attempt ${i + 1}/${maxRetries}`);
      const response = await chrome.tabs.sendMessage(tabId, message);
      console.log(`DEBUG: Message sent successfully on attempt ${i + 1}`);
      return response;
    } catch (error) {
      console.warn(`WARN: Message send attempt ${i + 1} failed:`, error.message);

      if (i === maxRetries - 1) {
        console.error('ERROR: All retry attempts exhausted');
        throw new Error(`Failed to send message after ${maxRetries} attempts: ${error.message}`);
      }

      // Exponential backoff: 100ms, 200ms, 400ms
      const delay = Math.min(100 * Math.pow(2, i), 1000);
      console.log(`DEBUG: Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Check if URL is a YouTube video
 * @param {string} url - URL to check
 * @returns {boolean} True if YouTube video URL
 */
function isYouTubeUrl(url) {
  return url.includes('youtube.com/watch') || url.includes('youtu.be/');
}

/**
 * Extract video ID from YouTube URL
 * @param {string} url - YouTube URL
 * @returns {string} Video ID or empty string
 */
function extractVideoId(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.searchParams.get('v') || urlObj.pathname.split('/').pop();
  } catch (error) {
    console.error('ERROR: Failed to extract video ID:', error);
    return '';
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { sendMessageWithRetry, isYouTubeUrl, extractVideoId };
}
