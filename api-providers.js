/**
 * LLM Provider Abstraction Layer
 * Supports multiple AI providers for different tasks
 */

// Provider configurations
const PROVIDERS = {
  anthropic: {
    name: 'Anthropic',
    endpoint: 'https://api.anthropic.com/v1/messages',
    models: {
      haiku: 'claude-haiku-4-5-20251001',
      sonnet: 'claude-sonnet-4-5-20251001'
    },
    pricing: {
      input: 0.25,  // per 1M tokens
      output: 1.25  // per 1M tokens
    }
  },
  groq: {
    name: 'Groq',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    models: {
      llama4: 'llama-4-70b',  // Placeholder for Llama 4
      llama3: 'llama-3.1-70b-versatile'
    },
    pricing: {
      input: 0.00,  // Free tier or very low cost
      output: 0.00
    }
  },
  sambanova: {
    name: 'SambaNova',
    endpoint: 'https://api.sambanova.ai/v1/chat/completions',
    models: {
      llama4: 'Meta-Llama-4-70B',  // Placeholder
      llama3: 'Meta-Llama-3.1-70B-Instruct'
    },
    pricing: {
      input: 0.10,
      output: 0.10
    }
  }
};

/**
 * Call Anthropic Claude API
 * @param {string} prompt - The prompt to send
 * @param {string} apiKey - Anthropic API key
 * @param {string} model - Model name (default: haiku)
 * @param {number} maxTokens - Max tokens to generate
 * @returns {Promise<string>} API response text
 */
async function callAnthropic(prompt, apiKey, model = 'haiku', maxTokens = 10000) {
  const modelId = PROVIDERS.anthropic.models[model] || PROVIDERS.anthropic.models.haiku;

  console.log(`DEBUG: Calling Anthropic ${modelId}, max_tokens: ${maxTokens}`);

  const response = await fetch(PROVIDERS.anthropic.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: modelId,
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

/**
 * Call Groq API (OpenAI-compatible)
 * @param {string} prompt - The prompt to send
 * @param {string} apiKey - Groq API key
 * @param {string} model - Model name (default: llama4)
 * @param {number} maxTokens - Max tokens to generate
 * @returns {Promise<string>} API response text
 */
async function callGroq(prompt, apiKey, model = 'llama4', maxTokens = 8000) {
  const modelId = PROVIDERS.groq.models[model] || PROVIDERS.groq.models.llama4;

  console.log(`DEBUG: Calling Groq ${modelId}, max_tokens: ${maxTokens}`);

  const response = await fetch(PROVIDERS.groq.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: maxTokens,
      temperature: 0.3,  // Lower temperature for formatting task
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

/**
 * Call SambaNova API (OpenAI-compatible)
 * @param {string} prompt - The prompt to send
 * @param {string} apiKey - SambaNova API key
 * @param {string} model - Model name (default: llama4)
 * @param {number} maxTokens - Max tokens to generate
 * @returns {Promise<string>} API response text
 */
async function callSambaNova(prompt, apiKey, model = 'llama4', maxTokens = 8000) {
  const modelId = PROVIDERS.sambanova.models[model] || PROVIDERS.sambanova.models.llama4;

  console.log(`DEBUG: Calling SambaNova ${modelId}, max_tokens: ${maxTokens}`);

  const response = await fetch(PROVIDERS.sambanova.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelId,
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
    console.error('ERROR: SambaNova API request failed:', response.status, errorData);
    throw new Error(`SambaNova API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

/**
 * Generic API caller with automatic provider selection
 * @param {string} provider - Provider name ('anthropic', 'groq', 'sambanova')
 * @param {string} prompt - The prompt to send
 * @param {string} apiKey - API key for the provider
 * @param {Object} options - Additional options (model, maxTokens)
 * @returns {Promise<string>} API response text
 */
async function callLLM(provider, prompt, apiKey, options = {}) {
  const { model, maxTokens } = options;

  switch (provider) {
    case 'anthropic':
      return await callAnthropic(prompt, apiKey, model, maxTokens);
    case 'groq':
      return await callGroq(prompt, apiKey, model, maxTokens);
    case 'sambanova':
      return await callSambaNova(prompt, apiKey, model, maxTokens);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Format transcript using fast/cheap provider (Groq by default)
 * @param {string} transcript - Raw transcript text
 * @param {Object} settings - User settings with API keys
 * @returns {Promise<string>} Formatted markdown transcript
 */
async function formatTranscriptFast(transcript, settings) {
  // Use Groq by default, fallback to Anthropic if Groq key missing
  const provider = settings.groqApiKey ? 'groq' : 'anthropic';
  const apiKey = settings.groqApiKey || settings.apiKey;

  if (!apiKey) {
    throw new Error('No API key available for transcript formatting');
  }

  console.log(`DEBUG: Formatting transcript with ${provider}`);

  const prompt = `Reformat this YouTube transcript to make it "pretty" and readable for humans in markdown format.
Add timestamps in a clean format and improve readability:

${transcript}

Return ONLY the formatted markdown transcript.`;

  try {
    const formatted = await callLLM(provider, prompt, apiKey, {
      model: provider === 'groq' ? 'llama4' : 'haiku',
      maxTokens: 8000
    });

    console.log(`DEBUG: Transcript formatted successfully with ${provider}`);
    return formatted;

  } catch (error) {
    console.error(`ERROR: ${provider} formatting failed:`, error);

    // Fallback to Anthropic if Groq fails
    if (provider === 'groq' && settings.apiKey) {
      console.log('DEBUG: Falling back to Anthropic for formatting');
      return await callLLM('anthropic', prompt, settings.apiKey, {
        model: 'haiku',
        maxTokens: 8000
      });
    }

    throw error;
  }
}

/**
 * Process YouTube video with AI (smart summarization)
 * @param {string} title - Video title
 * @param {string} description - Video description
 * @param {string} transcript - Full transcript
 * @param {Object} settings - User settings
 * @param {Array} categories - Available categories
 * @returns {Promise<Object>} {summary, category, tags}
 */
async function summarizeYouTubeVideo(title, description, transcript, settings, categories) {
  // Always use Anthropic for smart summarization
  if (!settings.apiKey) {
    throw new Error('Anthropic API key required for video summarization');
  }

  console.log('DEBUG: Summarizing YouTube video with Anthropic Haiku');

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

  const response = await callAnthropic(prompt, settings.apiKey, 'haiku', 10000);

  // Parse JSON from response
  const match = response.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('Invalid API response format');
  }

  return JSON.parse(match[0]);
}

// Export functions for use in background.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PROVIDERS,
    callAnthropic,
    callGroq,
    callSambaNova,
    callLLM,
    formatTranscriptFast,
    summarizeYouTubeVideo
  };
}
