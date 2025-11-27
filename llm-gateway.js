/**
 * LLM Gateway API Wrapper
 *
 * Unified interface for accessing 16 LLM providers through the LLM Gateway.
 * Gateway URL: https://llmproxy.api.sparkbright.me
 * Documentation: LLM-INTEGRATION-GUIDE.md
 *
 * Supported Providers:
 * - OpenAI, Anthropic, Google, Groq, SambaNova, Moonshot, Deepseek
 * - Alibaba/Qwen, Cohere, Mistral, xAI, Cerebras, Perplexity
 * - OpenRouter, Together AI, Feather AI
 */

const LLM_GATEWAY_URL = 'https://llmproxy.api.sparkbright.me';

/**
 * Default settings schema for LLM Gateway configuration
 */
const DEFAULT_LLM_GATEWAY_SETTINGS = {
  enabled: true,
  apiKey: '',

  // Per-transaction provider/model settings
  transactions: {
    youtubeSummary: {
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      options: {
        temperature: 0.7,
        maxTokens: 10000
      }
    },
    transcriptFormatting: {
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      options: {
        temperature: 0.3,
        maxTokens: 64000
      }
    },
    pageSummary: {
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      options: {
        temperature: 0.7,
        maxTokens: 2500
      }
    }
  }
};

/**
 * Provider and model configurations
 * Source: LLM-INTEGRATION-GUIDE.md
 */
const PROVIDER_CONFIGS = {
  openai: {
    name: 'OpenAI',
    models: [
      { id: 'gpt-4', name: 'GPT-4 (Most Capable)' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo (Faster, Cheaper)' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo (Fast, Cost-Effective)' }
    ],
    requiresMaxTokens: false
  },
  anthropic: {
    name: 'Anthropic (Claude)',
    models: [
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (Latest)' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus (Flagship)' },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku (Fast)' }
    ],
    requiresMaxTokens: true
  },
  google: {
    name: 'Google AI (Gemini)',
    models: [
      { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (Experimental)' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Most Capable)' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Fast, Efficient)' }
    ],
    requiresMaxTokens: false
  },
  groq: {
    name: 'Groq (Fast Inference)',
    models: [
      { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B (Recommended)' },
      { id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70B (Versatile)' },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B (Ultra Fast)' },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B (Long Context)' }
    ],
    requiresMaxTokens: false
  },
  deepseek: {
    name: 'Deepseek',
    models: [
      { id: 'deepseek-chat', name: 'Deepseek Chat' },
      { id: 'deepseek-coder', name: 'Deepseek Coder (Specialized)' }
    ],
    requiresMaxTokens: false
  },
  qwen: {
    name: 'Alibaba/Qwen',
    models: [
      { id: 'qwen-max', name: 'Qwen Max (Most Capable)' },
      { id: 'qwen-plus', name: 'Qwen Plus (Balanced)' },
      { id: 'qwen-turbo', name: 'Qwen Turbo (Fast)' }
    ],
    requiresMaxTokens: false
  },
  perplexity: {
    name: 'Perplexity',
    models: [
      { id: 'llama-3.1-sonar-large-128k-online', name: 'Sonar Large (Online Search)' },
      { id: 'llama-3.1-sonar-small-128k-online', name: 'Sonar Small (Online)' },
      { id: 'llama-3.1-sonar-large-128k-chat', name: 'Sonar Large (Chat)' }
    ],
    requiresMaxTokens: false
  },
  xai: {
    name: 'xAI (Grok)',
    models: [
      { id: 'grok-beta', name: 'Grok Beta' }
    ],
    requiresMaxTokens: false
  },
  openrouter: {
    name: 'OpenRouter (100+ Models)',
    models: [
      { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus' },
      { id: 'openai/gpt-4', name: 'GPT-4' },
      { id: 'google/gemini-pro', name: 'Gemini Pro' }
    ],
    requiresMaxTokens: false
  },
  sambanova: {
    name: 'SambaNova',
    models: [
      { id: 'llama-3.1-70b', name: 'Llama 3.1 70B' },
      { id: 'llama-3.1-8b', name: 'Llama 3.1 8B' }
    ],
    requiresMaxTokens: false
  },
  mistral: {
    name: 'Mistral',
    models: [
      { id: 'mistral-large', name: 'Mistral Large' },
      { id: 'mistral-medium', name: 'Mistral Medium' },
      { id: 'mistral-small', name: 'Mistral Small' }
    ],
    requiresMaxTokens: false
  },
  cerebras: {
    name: 'Cerebras',
    models: [
      { id: 'llama3.1-8b', name: 'Llama 3.1 8B (Ultra Fast)' }
    ],
    requiresMaxTokens: false
  }
};

/**
 * Call LLM Gateway API
 *
 * @param {string} provider - Provider ID (e.g., 'groq', 'anthropic', 'openai')
 * @param {string} model - Model ID (e.g., 'openai/gpt-oss-120b')
 * @param {Array} messages - Array of message objects with role and content
 * @param {Object} options - Optional parameters (temperature, maxTokens, etc.)
 * @param {string} apiKey - LLM Gateway API key
 * @param {string} conversationId - Optional conversation ID for caching
 * @returns {Promise<Object>} Gateway response with standardized format
 * @throws {Error} Gateway error with detailed message
 */
async function callLLMGateway(provider, model, messages, options = {}, apiKey, conversationId = null) {
  if (!apiKey) {
    throw new Error('LLM Gateway API key is required. Please configure it in Settings.');
  }

  const requestBody = {
    provider,
    model,
    messages,
    options,
    standardFormat: true, // Use unified OpenAI-compatible format
  };

  if (conversationId) {
    requestBody.conversationId = conversationId;
  }

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

      // Handle specific error types
      switch (response.status) {
        case 401:
          throw new Error(`Authentication failed: ${errorData.error || 'Invalid API key'}. Please check your LLM Gateway API key in Settings.`);
        case 429:
          throw new Error(`Rate limit exceeded: ${errorData.details || 'Too many requests'}. Please wait a moment and try again.`);
        case 400:
          throw new Error(`Invalid request: ${errorData.error || 'Bad request'}. Please check your provider/model configuration.`);
        case 500:
          throw new Error(`Gateway error: ${errorData.error || 'Internal server error'}. The provider may be experiencing issues.`);
        default:
          throw new Error(`Unexpected error (${response.status}): ${errorData.error || 'Unknown error'}`);
      }
    }

    const data = await response.json();

    // Extract message content from standardized format
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
    // Re-throw with context if not already a formatted error
    if (error.message.includes('fetch') || error.message.includes('network')) {
      throw new Error(`Network error: Unable to reach LLM Gateway. Please check your internet connection.`);
    }
    throw error;
  }
}

/**
 * Extract JSON from LLM response (handles markdown code blocks)
 *
 * @param {string} content - Raw LLM response
 * @returns {Object} Parsed JSON object
 * @throws {Error} If JSON parsing fails
 */
function extractJSON(content) {
  try {
    // Try direct parse first
    return JSON.parse(content);
  } catch (e) {
    // Extract JSON from markdown code blocks
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      return JSON.parse(jsonStr);
    }
    throw new Error('Failed to extract valid JSON from LLM response');
  }
}

/**
 * Get available providers and models
 *
 * @returns {Object} Provider configurations
 */
function getProviderConfigs() {
  return PROVIDER_CONFIGS;
}

/**
 * Get default settings
 *
 * @returns {Object} Default LLM Gateway settings
 */
function getDefaultSettings() {
  return JSON.parse(JSON.stringify(DEFAULT_LLM_GATEWAY_SETTINGS));
}

/**
 * Test LLM Gateway connection
 *
 * @param {string} apiKey - LLM Gateway API key
 * @param {string} provider - Optional provider to test (default: 'groq')
 * @param {string} model - Optional model to test (default: 'openai/gpt-oss-120b')
 * @returns {Promise<Object>} Test result with success status
 */
async function testConnection(apiKey, provider = 'groq', model = 'openai/gpt-oss-120b') {
  try {
    const result = await callLLMGateway(
      provider,
      model,
      [{ role: 'user', content: 'Say "Hello" in one word.' }],
      { maxTokens: 10, temperature: 0.5 },
      apiKey
    );

    return {
      success: true,
      message: 'Connection successful!',
      provider: result.provider,
      model: result.model,
      usage: result.usage
    };
  } catch (error) {
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Get instructions for creating a new API key
 *
 * @returns {Object} Instructions with curl command and steps
 */
function getAPIKeyInstructions() {
  return {
    title: 'How to Generate an LLM Gateway API Key',
    steps: [
      '1. Open your terminal or command prompt',
      '2. Copy and paste the following curl command:',
      '',
      'curl -X POST https://llmproxy.api.sparkbright.me/admin/apps \\',
      '  -H "Content-Type: application/json" \\',
      '  -d \'{"appName": "ReVisit Extension", "rateLimit": 120}\'',
      '',
      '3. Press Enter to execute the command',
      '4. Copy the "apiKey" value from the response (starts with "kb-llm-")',
      '5. Paste it into the API Key field below',
      '6. Click "Test Connection" to verify it works',
      '',
      'Note: Save your API key immediately - it cannot be retrieved later!'
    ],
    curlCommand: 'curl -X POST https://llmproxy.api.sparkbright.me/admin/apps -H "Content-Type: application/json" -d \'{"appName": "ReVisit Extension", "rateLimit": 120}\''
  };
}

// Export functions for use in background.js and other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    callLLMGateway,
    extractJSON,
    getProviderConfigs,
    getDefaultSettings,
    testConnection,
    getAPIKeyInstructions,
    DEFAULT_LLM_GATEWAY_SETTINGS
  };
}
