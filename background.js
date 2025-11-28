// Background service worker for ReVisit extension

// Default data structure
const DEFAULT_DATA = {
  bookmarks: [],
  categories: [
    { name: "Articles", priority: 1 },
    { name: "Research", priority: 2 },
    { name: "Work", priority: 3 },
    { name: "Personal", priority: 4 }
  ],
  settings: {
    userName: "",
    defaultIntervalDays: 7,
    onboardingComplete: false,
    priorityThresholdDays: 3,
    llmGateway: {
      enabled: true,
      apiKey: '',
      transactions: {
        youtubeSummary: {
          provider: 'groq',
          model: 'openai/gpt-oss-120b',  // GROQ requires provider-prefixed model names
          options: { temperature: 0.7, maxTokens: 10000 }  // maxTokens removed by formatProviderRequest
        },
        transcriptFormatting: {
          provider: 'groq',
          model: 'openai/gpt-oss-120b',  // GROQ requires provider-prefixed model names
          options: { temperature: 0.3, maxTokens: 64000 }  // maxTokens removed by formatProviderRequest
        },
        pageSummary: {
          provider: 'groq',
          model: 'openai/gpt-oss-120b',  // GROQ requires provider-prefixed model names
          options: { temperature: 0.7, maxTokens: 2500 }  // maxTokens removed by formatProviderRequest
        }
      }
    }
  }
};

// Helper function to migrate old category format (string array) to new format (object array)
function migrateCategoriesFormat(categories) {
  if (!categories || categories.length === 0) return [];

  // Check if already in new format (array of objects with name and priority)
  if (typeof categories[0] === 'object' && categories[0].name !== undefined) {
    return categories;
  }

  // Migrate from old format (string array) to new format
  return categories.map((cat, index) => ({
    name: cat,
    priority: index + 1
  }));
}

// Helper function to get category names as array (for backward compatibility)
function getCategoryNames(categories) {
  if (!categories || categories.length === 0) return [];

  // If already strings, return as is
  if (typeof categories[0] === 'string') return categories;

  // Extract names from objects, sorted by priority
  return categories
    .sort((a, b) => a.priority - b.priority)
    .map(cat => cat.name);
}

// ============================================================================
// LLM GATEWAY INTEGRATION
// Note: Inline code from llm-gateway.js for service worker compatibility
// ============================================================================

const LLM_GATEWAY_URL = 'https://llmproxy.api.sparkbright.me';

/**
 * Format request body for provider-specific requirements
 *
 * Different providers have different requirements for token limits and request structure.
 * This function transforms the generic options into provider-specific format.
 *
 * PROVIDER-SPECIFIC REQUIREMENTS:
 *
 * GROQ:
 *   - Does NOT support maxTokens parameter (will error if included)
 *   - Model names MUST include provider prefix
 *   - Examples: "openai/gpt-oss-120b", "moonshotai/kimi-k2-instruct-0905", "meta-llama/llama-guard-4-12b", "qwen/qwen3-32b"
 *   - Only temperature is supported in options
 *
 * OPENAI:
 *   - Does NOT support maxTokens parameter (error: "Unrecognized request argument supplied: maxTokens")
 *   - Model names are simple: "gpt-4-0613", "gpt-5.1", "gpt-3.5-turbo"
 *   - Only temperature is supported in options
 *
 * ANTHROPIC:
 *   - Does NOT support maxTokens in options
 *   - REQUIRES max_tokens as TOP-LEVEL field (not in options)
 *   - Model names: "claude-haiku-4-5-20251001", "claude-opus-4-5-20251101", "claude-sonnet-4-5-20250929"
 *   - Temperature goes in options
 *
 * MISTRAL:
 *   - Does NOT support maxTokens (camelCase)
 *   - Uses max_tokens (snake_case) in options
 *   - Model names: "mistral-large-latest", "mistral-medium-2505"
 *   - Temperature goes in options
 *
 * @param {string} provider - Provider name (groq, openai, anthropic, mistral, etc.)
 * @param {string} model - Model identifier (format varies by provider)
 * @param {Array} messages - Array of message objects
 * @param {Object} options - Options object (maxTokens, temperature, etc.)
 * @returns {Object} Formatted request body for the specific provider
 */
function formatProviderRequest(provider, model, messages, options = {}) {
  const normalizedProvider = provider.toLowerCase();
  const requestBody = {
    provider: normalizedProvider,
    model,
    messages,
    standardFormat: true,
  };

  // Extract maxTokens from options
  const maxTokens = options.maxTokens || options.max_tokens;
  const temperature = options.temperature;

  // GROQ: No token limits supported, model names must include provider prefix
  // Examples: "openai/gpt-oss-120b", "moonshotai/kimi-k2-instruct-0905", "qwen/qwen3-32b"
  if (normalizedProvider === 'groq') {
    // Remove all token-related options
    const cleanOptions = { ...options };
    delete cleanOptions.maxTokens;
    delete cleanOptions.max_tokens;

    if (temperature !== undefined) {
      requestBody.options = { temperature };
    }
  }

  // OPENAI: No maxTokens parameter supported
  else if (normalizedProvider === 'openai') {
    // Remove all token-related options
    const cleanOptions = { ...options };
    delete cleanOptions.maxTokens;
    delete cleanOptions.max_tokens;

    if (temperature !== undefined) {
      requestBody.options = { temperature };
    }
  }

  // ANTHROPIC: max_tokens as TOP-LEVEL field (not in options)
  else if (normalizedProvider === 'anthropic') {
    if (maxTokens) {
      requestBody.max_tokens = maxTokens;
    }

    // Add temperature to options if provided
    if (temperature !== undefined) {
      requestBody.options = { temperature };
    }
  }

  // MISTRAL: max_tokens in options (not maxTokens)
  else if (normalizedProvider === 'mistral') {
    const providerOptions = {};

    if (maxTokens) {
      providerOptions.max_tokens = maxTokens;
    }
    if (temperature !== undefined) {
      providerOptions.temperature = temperature;
    }

    if (Object.keys(providerOptions).length > 0) {
      requestBody.options = providerOptions;
    }
  }

  // Other providers: use standard options format
  else {
    if (Object.keys(options).length > 0) {
      requestBody.options = options;
    }
  }

  return requestBody;
}

async function callLLMGateway(provider, model, messages, options = {}, apiKey, conversationId = null) {
  if (!apiKey) {
    throw new Error('LLM Gateway API key is required. Please configure it in Settings.');
  }

  const requestBody = formatProviderRequest(provider, model, messages, options);

  if (conversationId) {
    requestBody.conversationId = conversationId;
  }

  // Debug logging - show formatted request body
  console.log('DEBUG: LLM Gateway Request:', {
    url: `${LLM_GATEWAY_URL}/v1/chat/completions`,
    provider,
    model,
    messageCount: messages.length,
    formattedRequestBody: JSON.stringify(requestBody, null, 2)
  });

  try {
    const response = await fetch(`${LLM_GATEWAY_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      // Log full error details
      console.error('DEBUG: LLM Gateway Error Response:', {
        status: response.status,
        errorData,
        provider,
        model
      });

      switch (response.status) {
        case 401:
          throw new Error(`Authentication failed: ${errorData.error || 'Invalid API key'}. Please check your LLM Gateway API key in Settings.`);
        case 429:
          throw new Error(`Rate limit exceeded: ${errorData.details || 'Too many requests'}. Please wait a moment and try again.`);
        case 400:
          throw new Error(`Invalid request: ${errorData.error || 'Bad request'}. Please check your provider/model configuration.`);
        case 500:
          const details = errorData.details ? ` Details: ${JSON.stringify(errorData.details)}` : '';
          throw new Error(`Gateway error: ${errorData.error || 'Internal server error'}.${details} Provider: ${provider}, Model: ${model}`);
        default:
          throw new Error(`Unexpected error (${response.status}): ${errorData.error || 'Unknown error'}`);
      }
    }

    const data = await response.json();
    const content = data.response?.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Invalid response format from gateway: Missing message content');
    }

    return {
      content,
      usage: data.usage,
      metadata: data.metadata,
      provider: data.provider,
      model: data.model
    };
  } catch (error) {
    if (error.message.includes('fetch') || error.message.includes('network')) {
      throw new Error(`Network error: Unable to reach LLM Gateway. Please check your internet connection.`);
    }
    throw error;
  }
}

function extractJSON(content) {
  try {
    return JSON.parse(content);
  } catch (e) {
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      return JSON.parse(jsonStr);
    }
    throw new Error('Failed to extract valid JSON from LLM response');
  }
}

// ============================================================================
// DEPRECATED: Old Direct API Functions (COMMENTED OUT - Use LLM Gateway instead)
// ============================================================================

/*
async function callAnthropic(prompt, apiKey, maxTokens = 64000) {
  console.log(`DEBUG: Calling Anthropic Haiku, max_tokens: ${maxTokens}`);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('ERROR: Anthropic API request failed:', response.status, errorData);
    throw new Error(`Anthropic API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

async function callGroq(prompt, apiKey, maxTokens = 64000) {
  console.log(`DEBUG: Calling Groq GPT-OSS-20b, max_tokens: ${maxTokens}`);

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-20b',
      max_tokens: maxTokens,
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that formats transcripts into clean, readable markdown.'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('ERROR: Groq API request failed:', response.status, errorData);
    throw new Error(`Groq API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}
*/

// ============================================================================
// LLM GATEWAY WRAPPER FUNCTIONS
// ============================================================================

async function formatTranscriptFast(transcript, settings) {
  const gatewayConfig = settings.llmGateway?.transactions?.transcriptFormatting;

  if (!gatewayConfig) {
    throw new Error('LLM Gateway configuration not found. Please configure it in Settings.');
  }

  const { provider, model, options } = gatewayConfig;
  const apiKey = settings.llmGateway?.apiKey;

  console.log(`DEBUG: Formatting transcript with LLM Gateway - Provider: ${provider}, Model: ${model}`);

  const prompt = `Reformat this YouTube transcript to make it "pretty" and readable for humans in markdown format.
Add timestamps in a clean format and improve readability:

${transcript}

Return ONLY the formatted markdown transcript.`;

  try {
    const result = await callLLMGateway(
      provider,
      model,
      [{ role: 'user', content: prompt }],
      options,
      apiKey
    );

    console.log('DEBUG: Transcript formatted successfully with LLM Gateway');
    return result.content;
  } catch (error) {
    console.error('ERROR: LLM Gateway transcript formatting failed:', error);
    throw error;
  }
}

async function summarizeYouTubeVideo(title, description, transcript, settings, categories) {
  const gatewayConfig = settings.llmGateway?.transactions?.youtubeSummary;

  if (!gatewayConfig) {
    throw new Error('LLM Gateway configuration not found. Please configure it in Settings.');
  }

  const { provider, model, options } = gatewayConfig;
  const apiKey = settings.llmGateway?.apiKey;

  console.log(`DEBUG: Summarizing YouTube video with LLM Gateway - Provider: ${provider}, Model: ${model}`);

  const prompt = `Analyze this YouTube video and provide:
1. Analyze the transcript and create a structured summary following this format below. If the transcript is not in english, create a summary in the native language, then translate it to english using natural language to communicate the meaning over literal translation. Only return the English version:

# {{Title}}

## Right Up Front
#### [Relevant Emoji] * Very Short and Concise Summary Line 1 [what am I going to read]
#### [Relevant Emoji] * Very Short and Concise Summary Line 2 [what am I going to read]
#### [Relevant Emoji] * Very Short and Concise Summary Line 3 [what am I going to read]

Brief overview (2-3 sentences)

# The Real Real [include this section only if applicable. If not applicable, skip it]
## Say What??
### - [Relevant emoji] [Identify Sensationalistic, Exaggerated, or Conspiratorial keywords, statements and claims. For each include:]
* Explain what is implied
* Provide a brief realistic statement on the known or likely facts about this point.
* If applicable, provide a consensus view of scientists, experts, doctors or other professionals in the field.

## 📌 Key Categories
[For each major theme, include:]
### - [Relevant emoji] Category Name
* Important points, critical data, arguments, conclusions, or novel insights as bullets
* Supporting details/examples

#### 🔗 Referenced URLs/Websites
[List all mentioned, as hyperlinks if possible]

#️⃣ Tags: [Up to 8 relevant topic tags]

Guidelines:
- Prioritize AI business cases when present
- Use clear, descriptive headings
- Group related points together
- Include all significant data/insights
- Maintain logical flow
- Be concise, but thorough and comprehensive
- Use markdown formatting

2. A category (use existing if fitting: ${categories.join(', ')}, else suggest new)
3. Up to 10 relevant tags

Video Title: ${title}
Description: ${description}

Transcript:
${transcript}

Return ONLY a JSON object with this exact structure:
{
  "summary": "markdown summary",
  "category": "single category name",
  "tags": ["tag1", "tag2", "tag3"]
}`;

  try {
    const result = await callLLMGateway(
      provider,
      model,
      [{ role: 'user', content: prompt }],
      options,
      apiKey
    );

    console.log('DEBUG: YouTube video summarized successfully with LLM Gateway');
    return extractJSON(result.content);
  } catch (error) {
    console.error('ERROR: LLM Gateway YouTube summarization failed:', error);
    throw error;
  }
}

// ============================================================================
// End of LLM Provider Functions
// ============================================================================

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
  let data = result.rvData || DEFAULT_DATA;

  // Migrate categories format if needed
  if (data.categories) {
    const migratedCategories = migrateCategoriesFormat(data.categories);
    if (JSON.stringify(migratedCategories) !== JSON.stringify(data.categories)) {
      data.categories = migratedCategories;
      await saveStorageData(data);
      console.log('Migrated categories to new format with priorities');
    }
  }

  return data;
}

// Helper to save storage data
async function saveStorageData(data) {
  await chrome.storage.local.set({ rvData: data });
}

// Helper function to verify content script is ready
async function verifyContentScript(tabId) {
  try {
    console.log('DEBUG: 201 Sending ping to content script for verification');
    const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    console.log('DEBUG: 202 Ping response received:', response);
    return true;
  } catch (error) {
    console.warn('WARN: 203 Ping failed - content script not ready:', error.message);
    return false;
  }
}

// Helper function to send message with retry (exponential backoff)
// 3 retries = ~700ms worst case (vs 5 retries = ~2.5s)
async function sendMessageWithRetry(tabId, message, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      // Wait before first attempt (and longer for subsequent attempts)
      const delay = i === 0 ? 100 : Math.min(100 * Math.pow(2, i), 1000);
      console.log(`DEBUG: 204 Waiting ${delay}ms before attempt ${i + 1}`);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      console.log(`DEBUG: 205 Sending message (attempt ${i + 1}/${maxRetries})`);
      const response = await chrome.tabs.sendMessage(tabId, message);
      console.log('DEBUG: 206 Message sent successfully, response:', response);
      return response;
    } catch (error) {
      console.warn(`WARN: 207 Attempt ${i + 1} failed:`, error.message);
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
        // Use the provided tabId or fall back to active tab
        let targetTabId = request.tabId;
        if (!targetTabId) {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          targetTabId = tab.id;
        }

        // First inject content script to enable notifications
        try {
          await chrome.scripting.executeScript({
            target: { tabId: targetTabId },
            files: ['content.js']
          });
        } catch (err) {
          // Content script may already be injected, that's okay
          console.log('Content script already injected or injection failed:', err.message);
        }

        // Wait a moment for content script to initialize
        await new Promise(resolve => setTimeout(resolve, 100));

        // Inject the floating modal
        await chrome.scripting.executeScript({
          target: { tabId: targetTabId },
          func: injectFloatingModal,
          args: [request.bookmarkId, request.revisitBy]
        });

        sendResponse({ success: true });
      } else if (request.action === 'addBookmark') {
        console.log('DEBUG: 208 Background received addBookmark request');

        // Get current tab
        const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        console.log('DEBUG: 209 Current tab:', currentTab);

        if (!currentTab) {
          throw new Error('No active tab found');
        }

        // FIRST: Inject content script to enable notifications
        console.log('DEBUG: 210 Ensuring content script is loaded for notifications');
        try {
          await chrome.scripting.executeScript({
            target: { tabId: currentTab.id },
            files: ['content.js']
          });
          // Wait for content script to initialize
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (err) {
          console.log('Content script already injected:', err.message);
        }

        // SECOND: Show initial "Gathering Details" notification
        console.log('DEBUG: 211 Sending initial notification');
        try {
          await chrome.tabs.sendMessage(currentTab.id, {
            action: 'showNotification',
            message: 'Gathering Details...',
            type: 'info'
          });
        } catch (err) {
          console.warn('Could not show initial notification:', err.message);
        }

        // Check if this is a YouTube URL
        const isYouTube = currentTab.url && (currentTab.url.includes('youtube.com/watch') || currentTab.url.includes('youtu.be/'));
        console.log('DEBUG: 212 Is YouTube URL:', isYouTube);

        // Get storage data
        const data = await getStorageData();
        const settings = data.settings || {};
        const categoriesData = data.categories || [];

        // Extract category names for AI processing
        const categories = getCategoryNames(categoriesData);

        console.log('DEBUG: 213 Settings loaded in addBookmark:', settings);
        console.log('DEBUG: 214 LLM Gateway API Key present in addBookmark:', !!settings.llmGateway?.apiKey);
        console.log('DEBUG: 215 Categories in addBookmark:', categories);
        
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
          isPreliminary: true, // Mark as preliminary
          isYouTube: isYouTube // Mark if YouTube video
        };

        console.log('DEBUG: 216 Preliminary bookmark created:', preliminaryBookmark);

        // Save preliminary bookmark
        data.bookmarks = data.bookmarks || [];
        data.bookmarks.push(preliminaryBookmark);
        await saveStorageData(data);
        
        // For YouTube videos, inject content script for DOM scraping
        if (isYouTube) {
          console.log('DEBUG: 215 YouTube video detected, injecting content script for transcript scraping');

          // First, check if content script is already loaded
          console.log('DEBUG: 216 Checking if content script is already loaded...');
          const isAlreadyLoaded = await verifyContentScript(currentTab.id);

          if (!isAlreadyLoaded) {
            // Only inject if not already loaded
            console.log('DEBUG: 217 Content script not loaded, injecting now for tab:', currentTab.id);
            try {
              const injectionResult = await chrome.scripting.executeScript({
                target: { tabId: currentTab.id },
                files: ['content.js']
              });
              console.log('DEBUG: 218 Injection result:', injectionResult);

              // Wait after injection for script to initialize
              console.log('DEBUG: 219 Waiting 500ms after injection for script to initialize');
              await new Promise(resolve => setTimeout(resolve, 500));

            } catch (injectionError) {
              console.error('ERROR: 220 Content script injection failed:', injectionError);
              throw new Error(`Content script injection failed: ${injectionError.message}`);
            }

            // Verify content script is ready after injection
            console.log('DEBUG: 221 Verifying content script is ready...');
            const isReady = await verifyContentScript(currentTab.id);
            if (!isReady) {
              console.error('ERROR: 222 Content script verification failed after injection');
              throw new Error('Content script is not responding to ping');
            }
            console.log('DEBUG: 223 Content script verification successful');
          } else {
            console.log('DEBUG: 224 Content script already loaded and ready, skipping injection');
          }

          // Send message to content script to scrape and show overlay
          console.log('DEBUG: 225 Sending scrapeAndShowOverlay to tab:', currentTab.id);
          const response = await sendMessageWithRetry(currentTab.id, {
            action: 'scrapeAndShowOverlay',
            bookmarkId: preliminaryBookmark.id,
            bookmarkData: preliminaryBookmark
          });
        } else {
          console.log('DEBUG: 226 Non-YouTube page, scraping directly in background');
          // For non-YouTube pages, scrape page content using executeScript
          const scrapeResult = await chrome.scripting.executeScript({
            target: { tabId: currentTab.id },
            func: scrapePageContent
          });

          const scrapedData = scrapeResult[0].result;
          console.log('DEBUG: 227 Page scraped successfully, content length:', scrapedData.content.length);

          // Process with AI
          const result = await processWithAI(scrapedData, settings, categories, null);
          console.log('DEBUG: 228 AI processing completed for non-YouTube page');

          // Update the preliminary bookmark with AI results
          const bookmarkIndex = data.bookmarks.findIndex(b => b.id === preliminaryBookmark.id);
          if (bookmarkIndex !== -1) {
            data.bookmarks[bookmarkIndex] = {
              ...data.bookmarks[bookmarkIndex],
              ...result,
              isPreliminary: false
            };
            await saveStorageData(data);
          }

          // Content script already injected at the beginning, just send overlay message
          console.log('DEBUG: 229 Sending injectOverlayWithAIResults message');
          await chrome.tabs.sendMessage(currentTab.id, {
            action: 'injectOverlayWithAIResults',
            bookmarkId: preliminaryBookmark.id,
            bookmarkData: {
              ...preliminaryBookmark,
              category: result.category,
              summary: result.summary,
              tags: result.tags
            }
          });
        }
        
        sendResponse({ success: true, bookmarkId: preliminaryBookmark.id });
      } else if (request.action === 'processWithAI') {
        // Process scraped content with AI
        console.log('DEBUG: 229 Background processing AI request');

        // Load settings and categories from storage
        const data = await getStorageData();
        const settings = data.settings || {};
        const categoriesData = data.categories || [];

        // Extract category names for AI processing
        const categories = getCategoryNames(categoriesData);

        console.log('DEBUG: 230 Settings loaded:', settings);
        console.log('DEBUG: 231 LLM Gateway API Key present:', !!settings.llmGateway?.apiKey);
        console.log('DEBUG: 232 Categories:', categories);
        console.log('DEBUG: 233 Transcript provided:', !!request.transcript);
        console.log('DEBUG: 234 Is YouTube:', request.scrapedData.isYouTube);

        // Pass settings and sender.tab.id to processWithAI
        const result = await processWithAI(request.scrapedData, settings, categories, request.transcript, sender?.tab?.id);
        sendResponse({ success: true, result });
      } else if (request.action === 'updateBookmark') {
        // Update bookmark with final data
        console.log('DEBUG: 235 Background updating bookmark:', request.bookmarkId);
        const data = await getStorageData();
        const bookmarkIndex = data.bookmarks.findIndex(b => b.id === request.bookmarkId);
        
        if (bookmarkIndex !== -1) {
          // Check if category has been updated by user and is new
          const updatedCategory = request.updatedData.category;
          const existingCategories = data.categories || [];

          // Check if category exists (handle both old string format and new object format)
          const categoryExists = existingCategories.some(cat =>
            typeof cat === 'string' ? cat === updatedCategory : cat.name === updatedCategory
          );

          if (updatedCategory && !categoryExists) {
            console.log('DEBUG: 236 New category detected, adding to categories list:', updatedCategory);
            // Add new category to the categories array
            // Find the highest priority and add 1
            const maxPriority = existingCategories.reduce((max, cat) => {
              const priority = typeof cat === 'object' ? cat.priority : 0;
              return Math.max(max, priority);
            }, 0);

            existingCategories.push({ name: updatedCategory, priority: maxPriority + 1 });
            existingCategories.sort((a, b) => a.priority - b.priority);
            data.categories = existingCategories;
          }
          
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
        console.log('DEBUG: 237 Background canceling bookmark:', request.bookmarkId);
        const data = await getStorageData();
        data.bookmarks = data.bookmarks.filter(b => b.id !== request.bookmarkId);
        await saveStorageData(data);
        sendResponse({ success: true });
      } else if (request.action === 'updateBookmarkStatus') {
        // Update bookmark status from floating modal actions
        console.log('DEBUG: 243 Background updating bookmark status:', request.bookmarkId, request.actionType);
        const data = await getStorageData();
        const bookmarkIndex = data.bookmarks.findIndex(b => b.id === request.bookmarkId);

        if (bookmarkIndex !== -1) {
          const bookmark = data.bookmarks[bookmarkIndex];

          if (request.actionType === 'Complete') {
            // Mark as complete
            bookmark.status = 'Complete';
            bookmark.history = bookmark.history || [];
            bookmark.history.push({
              timestamp: Date.now(),
              action: 'Marked as Complete'
            });
            console.log('DEBUG: 244 Bookmark marked as Complete');
          } else if (request.actionType === 'ReVisited') {
            // Update revisit date
            const defaultIntervalDays = data.settings?.defaultIntervalDays || 7;
            bookmark.revisitBy = new Date(Date.now() + defaultIntervalDays * 24 * 60 * 60 * 1000).toISOString();
            bookmark.status = 'Active';
            bookmark.history = bookmark.history || [];
            bookmark.history.push({
              timestamp: Date.now(),
              action: 'ReVisited - Updated revisit date'
            });
            console.log('DEBUG: 245 Bookmark revisit date updated');
          }

          data.bookmarks[bookmarkIndex] = bookmark;
          await saveStorageData(data);
          console.log('DEBUG: 246 Bookmark status updated successfully');
          sendResponse({ success: true });
        } else {
          console.error('ERROR: 247 Bookmark not found:', request.bookmarkId);
          throw new Error('Bookmark not found');
        }
      } else if (request.action === 'getTranscript') {
        // Get transcript for a video
        console.log('DEBUG: 238 Background getting transcript for video:', request.videoId);
        const transcriptData = await getTranscript(request.videoId);
        sendResponse({ success: true, transcript: transcriptData });
      } else if (request.action === 'testGatewayConnection') {
        // Test LLM Gateway connection and fetch models
        console.log('DEBUG: Testing LLM Gateway connection');
        try {
          // Step 1: Check /health endpoint (no auth required)
          const healthResponse = await fetch(`${LLM_GATEWAY_URL}/health`);

          if (!healthResponse.ok) {
            throw new Error(`Health check failed: Gateway may be down (status: ${healthResponse.status})`);
          }

          const healthData = await healthResponse.json();
          console.log('DEBUG: Gateway health check passed:', healthData);

          // Step 2: Test authentication by fetching models
          const modelsResponse = await fetch(`${LLM_GATEWAY_URL}/v1/models`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${request.apiKey}`,
              'Content-Type': 'application/json',
            },
          });

          if (!modelsResponse.ok) {
            const errorData = await modelsResponse.json().catch(() => ({}));

            if (modelsResponse.status === 401) {
              throw new Error('Authentication failed: Invalid API key');
            }

            throw new Error(`Failed to fetch models: ${errorData.error || 'Unknown error'}`);
          }

          const modelsData = await modelsResponse.json();
          console.log('DEBUG: Models fetched successfully');

          sendResponse({
            success: true,
            message: 'Connection successful!',
            healthData,
            modelsData
          });
        } catch (error) {
          console.error('ERROR: Gateway connection test failed:', error);
          sendResponse({
            success: false,
            message: error.message
          });
        }
      }

    } catch (error) {
      console.error('ERROR: 239 Background processing failed:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true; // Keep message channel open for async response
});

// Transcript storage helper functions
async function saveTranscript(videoId, transcriptData) {
  const result = await chrome.storage.local.get('rvTranscripts');
  const transcripts = result.rvTranscripts || {};
  
  transcripts[videoId] = {
    ...transcripts[videoId],
    ...transcriptData
  };
  console.log('DEBUG: 240 Saving transcript for video:', videoId);
  
  await chrome.storage.local.set({ rvTranscripts: transcripts });
}

async function getTranscript(videoId) {
  console.log('DEBUG: 241 Retrieving transcript for video:', videoId);
  const result = await chrome.storage.local.get('rvTranscripts');
  const transcript = result.rvTranscripts ? result.rvTranscripts[videoId] : null;
  console.log('DEBUG: 242 Transcript found:', !!transcript);
  return transcript;
}

async function updateTranscript(videoId, updates) {
  const result = await chrome.storage.local.get('rvTranscripts');
  const transcripts = result.rvTranscripts || {};
  console.log('DEBUG: 242 Updating transcript for video:', videoId);
  
  if (transcripts[videoId]) {
    transcripts[videoId] = {
      ...transcripts[videoId],
      ...updates
    };
    await chrome.storage.local.set({ rvTranscripts: transcripts });
  }
}

// Enhanced AI processing function
async function processWithAI(scrapedData, settings, categories, transcript = null, tabId = null) {
  console.log('DEBUG: 247 processWithAI called with settings:', settings);
  console.log('DEBUG: 248 LLM Gateway API Key in processWithAI:', settings.llmGateway?.apiKey ? 'PRESENT' : 'MISSING');
  console.log('DEBUG: 249 Is YouTube video:', scrapedData.isYouTube);
  console.log('DEBUG: 250 Transcript provided:', !!transcript);

  // Validate API key
  if (!settings.llmGateway?.apiKey) {
    throw new Error('LLM Gateway API key not found in settings. Please configure your API key in the extension settings.');
  }

  // Handle YouTube videos with transcript
  if (scrapedData.isYouTube && scrapedData.videoId && transcript) {
    console.log('DEBUG: 251 Processing YouTube video with DOM-scraped transcript');
    return await processYouTubeVideoWithTranscript(scrapedData, settings, categories, transcript, tabId);
  } else if (scrapedData.isYouTube && scrapedData.videoId) {
    console.log('DEBUG: 252 Processing YouTube video without transcript');
    return await processStandardPage(scrapedData, settings, categories);
  } else {
    console.log('DEBUG: 253 Processing non-YouTube page');
    return await processStandardPage(scrapedData, settings, categories);
  }
}

// Process YouTube video with transcript using parallel API calls
async function processYouTubeVideoWithTranscript(scrapedData, settings, categories, transcript, tabId) {
  console.log('DEBUG: 254 Processing YouTube video with parallel API calls');
  console.log('DEBUG: 255 Transcript length:', transcript.length);
  console.log('DEBUG: 256 LLM Gateway configured:', !!settings.llmGateway?.apiKey);

  try {
    // Save the raw transcript
    await saveTranscript(scrapedData.videoId, {
      raw: transcript,
      metadata: {
        title: scrapedData.title,
        videoId: scrapedData.videoId,
        retrievedAt: Date.now(),
        source: 'dom-scraping'
      }
    });
    console.log('DEBUG: 257 Raw transcript saved to storage');

    // PARALLEL API CALLS: Summary (Haiku) + Formatting (Groq)
    console.log('DEBUG: 258 Launching parallel API calls (Haiku + Groq)');
    const startTime = Date.now();

    const [aiResult, formattedTranscript] = await Promise.all([
      // Call 1: Anthropic Haiku for smart summarization
      summarizeYouTubeVideo(
        scrapedData.title,
        scrapedData.content,
        transcript,
        settings,
        categories
      ),

      // Call 2: Groq for fast transcript formatting
      formatTranscriptFast(transcript, settings)
    ]);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`DEBUG: 259 Both API calls completed in ${elapsed}s`);
    console.log('DEBUG: 260 AI summarization result:', aiResult);
    console.log('DEBUG: 261 Formatted transcript length:', formattedTranscript.length);

    // Save formatted transcript (non-blocking - happens in background)
    if (formattedTranscript) {
      console.log('DEBUG: 262 Saving formatted transcript in background');
      updateTranscript(scrapedData.videoId, { formatted: formattedTranscript })
        .then(() => {
          console.log('DEBUG: 263 Formatted transcript saved successfully');
          // Show success notification to user
          if (tabId) {
            chrome.tabs.sendMessage(tabId, {
              action: 'showNotification',
              message: 'Transcript Saved',
              type: 'success'
            }).catch(err => console.warn('WARN: Could not show transcript saved notification:', err));
          }
        })
        .catch(err => console.error('ERROR: 264 Failed to save formatted transcript:', err));
    }

    // Return summary immediately (formatted transcript save is non-blocking)
    return aiResult;

  } catch (error) {
    console.error('ERROR: 265 YouTube video processing failed:', error);
    // Fall back to standard processing without transcript
    return await processStandardPage(scrapedData, settings, categories);
  }
}

// Process standard page (using LLM Gateway)
async function processStandardPage(scrapedData, settings, categories) {
  const gatewayConfig = settings.llmGateway?.transactions?.pageSummary;

  if (!gatewayConfig) {
    throw new Error('LLM Gateway configuration not found. Please configure it in Settings.');
  }

  const { provider, model, options } = gatewayConfig;
  const apiKey = settings.llmGateway?.apiKey;

  console.log(`DEBUG: Processing standard page with LLM Gateway - Provider: ${provider}, Model: ${model}`);

  const prompt = `Summarize the following webpage content in under 200 words using markdown. Categorize it: Use an existing category if fitting (existing: ${categories.join(', ')}), else suggest a new one. Generate up to 10 relevant tags.

Content: ${scrapedData.content}

Return ONLY a JSON object with this exact structure:
{
  "summary": "markdown summary",
  "category": "single category name",
  "tags": ["tag1", "tag2", "tag3"]
}`;

  try {
    const result = await callLLMGateway(
      provider,
      model,
      [{ role: 'user', content: prompt }],
      options,
      apiKey
    );

    console.log('DEBUG: Standard page processed successfully with LLM Gateway');
    return extractJSON(result.content);
  } catch (error) {
    console.error('ERROR: LLM Gateway page processing failed:', error);
    throw error;
  }
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
