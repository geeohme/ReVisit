# LLM Gateway - Coding Agent Integration Guide

**Version:** 2.0.0
**Gateway URL:** `https://llmproxy.api.sparkbright.me`
**Purpose:** This guide is specifically designed for AI coding agents integrating the LLM Gateway into applications.

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start Checklist](#quick-start-checklist)
3. [API Key Generation](#api-key-generation)
4. [Authentication](#authentication)
5. [Endpoint Reference](#endpoint-reference)
6. [Provider-Specific Integration](#provider-specific-integration)
7. [Model Selection Guide](#model-selection-guide)
8. [Request Format Requirements](#request-format-requirements)
9. [Response Handling](#response-handling)
10. [Conversation Management](#conversation-management)
11. [Rate Limiting](#rate-limiting)
12. [Error Handling](#error-handling)
13. [Code Examples](#code-examples)
14. [Testing Your Integration](#testing-your-integration)
15. [Common Pitfalls](#common-pitfalls)

---

## Overview

The LLM Gateway provides a **unified interface to 16 LLM providers** with enterprise features:

- **16 LLM Providers:** OpenAI, Anthropic, Google, Groq, SambaNova, Moonshot, Deepseek, Alibaba/Qwen, Cohere, Mistral, xAI, Cerebras, Perplexity, OpenRouter, Together AI, Feather AI
- **API Key Authentication:** Per-app access control with Bearer tokens
- **Per-App Rate Limiting:** Configurable requests/minute
- **Conversation Caching:** 90-minute conversation history for multi-turn chats
- **Response Standardization:** Optional unified format across all providers
- **Usage Tracking:** Transaction logging (privacy-safe - no content logged)

---

## Quick Start Checklist

When integrating the LLM Gateway into your application, follow these steps:

- [ ] Generate an API key for your application
- [ ] Store the API key securely in environment variables
- [ ] Implement authentication header in all requests
- [ ] Choose your provider(s) and model(s)
- [ ] Implement proper error handling for 401, 429, and 500 errors
- [ ] Add conversation caching if building a chat application
- [ ] Test with multiple providers to ensure portability
- [ ] Monitor rate limit remaining in response metadata

---

## API Key Generation

### Step 1: Create Your Application

Call the admin endpoint to generate an API key for your application:

```bash
curl -X POST https://llmproxy.api.sparkbright.me/admin/apps \
  -H "Content-Type: application/json" \
  -d '{
    "appName": "My Application Name",
    "rateLimit": 120,
    "allowedProviders": ["openai", "anthropic", "google"]
  }'
```

**Request Parameters:**
- `appName` (required, string): Name of your application
- `rateLimit` (optional, number): Requests per minute (default: 60)
- `allowedProviders` (optional, array): List of allowed providers (default: all providers)

**Response:**
```json
{
  "success": true,
  "appName": "My Application Name",
  "apiKey": "kb-llm-myapplic-lm123abc456def",
  "config": {
    "name": "My Application Name",
    "enabled": true,
    "rateLimit": 120,
    "allowedProviders": ["openai", "anthropic", "google"],
    "createdAt": "2025-11-27T10:00:00.000Z"
  }
}
```

### Step 2: Store API Key Securely

**CRITICAL:** Save the API key immediately. It cannot be retrieved later.

**Node.js (.env file):**
```bash
LLM_GATEWAY_URL=https://llmproxy.api.sparkbright.me
LLM_GATEWAY_API_KEY=kb-llm-myapplic-lm123abc456def
```

**Python (.env file):**
```bash
LLM_GATEWAY_URL=https://llmproxy.api.sparkbright.me
LLM_GATEWAY_API_KEY=kb-llm-myapplic-lm123abc456def
```

---

## Authentication

All requests (except `/health`) require authentication via Bearer token.

**Required Header:**
```
Authorization: Bearer <your-api-key>
```

**Example:**
```bash
curl -X POST https://llmproxy.api.sparkbright.me/v1/chat/completions \
  -H "Authorization: Bearer kb-llm-myapplic-lm123abc456def" \
  -H "Content-Type: application/json" \
  -d '{...}'
```

**Authentication Errors:**

| Error | Cause | Solution |
|-------|-------|----------|
| `Missing or invalid authorization header` | No `Authorization` header | Add `Authorization: Bearer <key>` |
| `Invalid API key` | API key not found | Check API key is correct |
| `App is disabled` | App disabled in gateway | Contact administrator |

---

## Endpoint Reference

### 1. POST /v1/chat/completions

Create a chat completion.

**URL:** `https://llmproxy.api.sparkbright.me/v1/chat/completions`

**Method:** `POST`

**Authentication:** Required

**Request Body:**
```json
{
  "provider": "openai",
  "model": "gpt-4",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello!"}
  ],
  "conversationId": "optional-conversation-id",
  "standardFormat": false,
  "options": {
    "temperature": 0.7,
    "maxTokens": 1000
  }
}
```

**Response:**
```json
{
  "success": true,
  "provider": "openai",
  "model": "gpt-4",
  "response": {
    "id": "chatcmpl-123",
    "object": "chat.completion",
    "created": 1732704000,
    "model": "gpt-4",
    "choices": [{
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you today?"
      },
      "finish_reason": "stop"
    }],
    "usage": {
      "prompt_tokens": 15,
      "completion_tokens": 9,
      "total_tokens": 24
    }
  },
  "usage": {
    "prompt_tokens": 15,
    "completion_tokens": 9,
    "total_tokens": 24
  },
  "conversationId": "conv-abc123xyz",
  "metadata": {
    "requestId": "req-def456",
    "timestamp": "2025-11-27T10:00:00.000Z",
    "rateLimitRemaining": 119
  }
}
```

### 2. GET /v1/models

List available models from providers.

**URL:** `https://llmproxy.api.sparkbright.me/v1/models?provider=openai`

**Method:** `GET`

**Authentication:** Required

**Query Parameters:**
- `provider` (optional): Filter by specific provider. If omitted, returns all providers.

**Response (with provider):**
```json
{
  "data": [
    {
      "id": "gpt-4",
      "object": "model",
      "created": 1687882411,
      "owned_by": "openai"
    },
    {
      "id": "gpt-3.5-turbo",
      "object": "model",
      "created": 1677610602,
      "owned_by": "openai"
    }
  ]
}
```

**Response (all providers):**
```json
{
  "openai": {
    "data": [/* models */]
  },
  "anthropic": {
    "data": [/* models */]
  }
}
```

### 3. GET /health

Health check (no authentication required).

**URL:** `https://llmproxy.api.sparkbright.me/health`

**Method:** `GET`

**Authentication:** None

**Response:**
```json
{
  "status": "healthy",
  "service": "KB Creator LLM Gateway",
  "version": "2.0.0",
  "timestamp": "2025-11-27T10:00:00.000Z",
  "providers": 16,
  "endpoints": ["/health", "/v1/chat/completions", "/v1/models", "/admin/apps"]
}
```

---

## Provider-Specific Integration

### OpenAI

**Provider ID:** `openai`

**Available Models:**
- `gpt-4` - Most capable model
- `gpt-4-turbo` - Faster, cheaper GPT-4
- `gpt-3.5-turbo` - Fast and cost-effective

**Required Options:**
- None (all options are optional)

**Common Options:**
```json
{
  "temperature": 0.7,
  "maxTokens": 1000,
  "topP": 1.0,
  "frequencyPenalty": 0.0,
  "presencePenalty": 0.0,
  "stop": ["###"]
}
```

**Message Format:**
- Supports `system`, `user`, `assistant` roles
- Content can be string or array (for multimodal)

**Example:**
```json
{
  "provider": "openai",
  "model": "gpt-4",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Explain quantum computing"}
  ],
  "options": {
    "temperature": 0.7,
    "maxTokens": 500
  }
}
```

---

### Anthropic (Claude)

**Provider ID:** `anthropic`

**Available Models:**
- `claude-3-5-sonnet-20241022` - Latest, most capable
- `claude-3-opus-20240229` - Previous flagship
- `claude-3-haiku-20240307` - Fast and compact

**Required Options:**
- `maxTokens` - **REQUIRED** (Anthropic requires this)

**Common Options:**
```json
{
  "maxTokens": 1024,
  "temperature": 1.0,
  "topP": 1.0,
  "topK": 5
}
```

**Message Format:**
- Supports `user` and `assistant` roles
- System messages handled separately via `system` field in options

**IMPORTANT:** The gateway automatically handles system messages.

**Example:**
```json
{
  "provider": "anthropic",
  "model": "claude-3-5-sonnet-20241022",
  "messages": [
    {"role": "user", "content": "Explain quantum computing"}
  ],
  "options": {
    "maxTokens": 1024,
    "temperature": 1.0
  }
}
```

**Special Handling:**
- System messages in `messages` array are automatically extracted and passed as `system` parameter to Anthropic API
- Do NOT try to manually set system parameter in options

---

### Google AI (Gemini)

**Provider ID:** `google`

**Available Models:**
- `gemini-2.0-flash-exp` - Latest experimental
- `gemini-1.5-pro` - Most capable
- `gemini-1.5-flash` - Fast and efficient

**Required Options:**
- None

**Common Options:**
```json
{
  "temperature": 0.7,
  "maxTokens": 1000,
  "topP": 0.95,
  "topK": 40
}
```

**Message Format:**
- Supports `user` and `model` (assistant) roles
- System instructions handled via `systemInstruction` field

**IMPORTANT:** The gateway automatically handles system messages.

**Example:**
```json
{
  "provider": "google",
  "model": "gemini-1.5-pro",
  "messages": [
    {"role": "user", "content": "Explain quantum computing"}
  ],
  "options": {
    "temperature": 0.9,
    "maxTokens": 2048
  }
}
```

---

### Groq

**Provider ID:** `groq`

**Available Models:**
- `llama-3.1-70b-versatile` - Most capable
- `llama-3.1-8b-instant` - Fast inference
- `mixtral-8x7b-32768` - Long context

**Required Options:**
- None

**Common Options:**
```json
{
  "temperature": 0.7,
  "maxTokens": 1000,
  "topP": 1.0
}
```

**Message Format:**
- OpenAI-compatible format
- Supports `system`, `user`, `assistant` roles

**Example:**
```json
{
  "provider": "groq",
  "model": "llama-3.1-70b-versatile",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Explain quantum computing"}
  ],
  "options": {
    "temperature": 0.5,
    "maxTokens": 500
  }
}
```

---

### Deepseek

**Provider ID:** `deepseek`

**Available Models:**
- `deepseek-chat` - Chat model
- `deepseek-coder` - Specialized for code

**Required Options:**
- None

**Common Options:**
```json
{
  "temperature": 1.0,
  "maxTokens": 2048
}
```

**Message Format:**
- OpenAI-compatible format
- Supports `system`, `user`, `assistant` roles

**Example:**
```json
{
  "provider": "deepseek",
  "model": "deepseek-coder",
  "messages": [
    {"role": "user", "content": "Write a Python function to sort a list"}
  ],
  "options": {
    "temperature": 0.3,
    "maxTokens": 1000
  }
}
```

---

### Alibaba / Qwen

**Provider ID:** `alibaba` or `qwen`

**Available Models:**
- `qwen-max` - Most capable
- `qwen-plus` - Balanced
- `qwen-turbo` - Fast

**Required Options:**
- None

**Common Options:**
```json
{
  "temperature": 0.7,
  "maxTokens": 1500,
  "topP": 0.8
}
```

**Message Format:**
- OpenAI-compatible format
- Supports `system`, `user`, `assistant` roles

**Example:**
```json
{
  "provider": "qwen",
  "model": "qwen-max",
  "messages": [
    {"role": "user", "content": "用中文解释量子计算"}
  ],
  "options": {
    "temperature": 0.7
  }
}
```

---

### Perplexity

**Provider ID:** `perplexity`

**Available Models:**
- `llama-3.1-sonar-large-128k-online` - Online search enabled
- `llama-3.1-sonar-small-128k-online` - Smaller, online
- `llama-3.1-sonar-large-128k-chat` - Chat without search

**Required Options:**
- None

**Common Options:**
```json
{
  "temperature": 0.2,
  "maxTokens": 1000,
  "topP": 0.9
}
```

**Special Features:**
- Models with `-online` suffix can search the web for current information

**Example:**
```json
{
  "provider": "perplexity",
  "model": "llama-3.1-sonar-large-128k-online",
  "messages": [
    {"role": "user", "content": "What are the latest developments in AI?"}
  ],
  "options": {
    "temperature": 0.2
  }
}
```

---

### xAI (Grok)

**Provider ID:** `xai`

**Available Models:**
- `grok-beta` - Grok model

**Required Options:**
- None

**Common Options:**
```json
{
  "temperature": 0.7,
  "maxTokens": 2048
}
```

**Message Format:**
- OpenAI-compatible format

**Example:**
```json
{
  "provider": "xai",
  "model": "grok-beta",
  "messages": [
    {"role": "user", "content": "What's happening in the world?"}
  ]
}
```

---

### OpenRouter

**Provider ID:** `openrouter`

**Available Models:**
- Access to 100+ models from multiple providers
- Check available models via `/v1/models?provider=openrouter`

**Required Options:**
- None

**Common Options:**
```json
{
  "temperature": 0.7,
  "maxTokens": 1000
}
```

**Special Notes:**
- OpenRouter aggregates models from multiple providers
- Model naming follows pattern: `provider/model-name`

**Example:**
```json
{
  "provider": "openrouter",
  "model": "anthropic/claude-3-opus",
  "messages": [
    {"role": "user", "content": "Explain quantum computing"}
  ]
}
```

---

### Other Providers

**SambaNova** (`sambanova`):
- Llama models with fast inference
- OpenAI-compatible format

**Moonshot** (`moonshot`):
- Chinese LLM provider
- OpenAI-compatible format

**Cohere** (`cohere`):
- Command R+ and Command models
- Uses preamble for system messages

**Mistral** (`mistral`):
- Mistral Large, Medium, Small
- OpenAI-compatible format

**Cerebras** (`cerebras`):
- Ultra-fast Llama inference
- OpenAI-compatible format

**Together AI** (`together`):
- Open source models
- OpenAI-compatible format

**Feather AI** (`featherai`):
- Lightweight models
- OpenAI-compatible format

---

## Model Selection Guide

### Choosing the Right Provider & Model

**For Maximum Quality:**
- `anthropic/claude-3-5-sonnet-20241022` - Best overall
- `openai/gpt-4` - Strong alternative
- `google/gemini-1.5-pro` - Good for multimodal

**For Speed:**
- `groq/llama-3.1-8b-instant` - Fastest
- `cerebras/llama3.1-8b` - Very fast
- `openai/gpt-3.5-turbo` - Fast and reliable

**For Coding:**
- `deepseek/deepseek-coder` - Specialized for code
- `anthropic/claude-3-5-sonnet-20241022` - Excellent at code
- `openai/gpt-4` - Very good

**For Current Information:**
- `perplexity/llama-3.1-sonar-large-128k-online` - Web search enabled
- `xai/grok-beta` - Real-time data

**For Cost Efficiency:**
- `groq/llama-3.1-8b-instant` - Free tier available
- `google/gemini-1.5-flash` - Cost-effective
- `together/*` - Competitive pricing

**For Long Context:**
- `anthropic/claude-3-5-sonnet-20241022` - 200k tokens
- `google/gemini-1.5-pro` - 1M tokens
- `perplexity/llama-3.1-sonar-large-128k-online` - 128k tokens

### Provider Fallback Strategy

Implement fallback to handle provider failures:

```javascript
const providerPriority = [
  { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
  { provider: 'openai', model: 'gpt-4' },
  { provider: 'groq', model: 'llama-3.1-70b-versatile' }
];

async function callLLMWithFallback(messages, options = {}) {
  for (const { provider, model } of providerPriority) {
    try {
      return await callLLM(provider, model, messages, options);
    } catch (error) {
      console.warn(`Provider ${provider} failed, trying next...`);
    }
  }
  throw new Error('All providers failed');
}
```

---

## Request Format Requirements

### Standard Request Structure

```json
{
  "provider": "string (required)",
  "model": "string (required)",
  "messages": "array (required)",
  "conversationId": "string (optional)",
  "standardFormat": "boolean (optional, default: false)",
  "options": "object (optional)"
}
```

### Field Descriptions

**provider** (string, required)
- ID of the LLM provider to use
- Must be one of the supported providers
- Case-insensitive
- Examples: `"openai"`, `"anthropic"`, `"google"`

**model** (string, required)
- Specific model ID from the provider
- Provider-specific model names
- Examples: `"gpt-4"`, `"claude-3-5-sonnet-20241022"`, `"gemini-1.5-pro"`

**messages** (array, required)
- Array of message objects
- Each message must have `role` and `content` fields
- Minimum 1 message required
- Format:
  ```json
  [
    {"role": "system", "content": "System prompt"},
    {"role": "user", "content": "User message"},
    {"role": "assistant", "content": "Assistant response"}
  ]
  ```

**conversationId** (string, optional)
- Unique identifier for conversation
- Enables 90-minute conversation caching
- If provided, previous messages are automatically retrieved and merged
- If omitted, each request is independent
- Format: Any unique string (e.g., `"user-123-session-abc"`)

**standardFormat** (boolean, optional)
- If `true`, response is converted to OpenAI-compatible format
- If `false`, native provider response is returned
- Default: `false`
- Useful for code that needs consistent format across providers

**options** (object, optional)
- Provider-specific options
- Common fields: `temperature`, `maxTokens`, `topP`, `topK`
- Provider-specific requirements (e.g., Anthropic requires `maxTokens`)

### Message Role Requirements

**OpenAI-compatible providers** (OpenAI, Groq, Deepseek, etc.):
- `system` - System instructions (optional)
- `user` - User messages (required)
- `assistant` - Assistant responses (for conversation history)

**Anthropic:**
- `user` - User messages (required)
- `assistant` - Assistant responses (for conversation history)
- System messages are automatically extracted from `messages` array

**Google:**
- `user` - User messages (required)
- `model` - Assistant responses (for conversation history)
- System messages are automatically extracted

---

## Response Handling

### Standard Response Structure

```json
{
  "success": true,
  "provider": "string",
  "model": "string",
  "response": {
    /* Provider-specific response */
  },
  "usage": {
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0
  },
  "conversationId": "string",
  "metadata": {
    "requestId": "string",
    "timestamp": "ISO 8601 string",
    "rateLimitRemaining": 0
  }
}
```

### Extracting the Assistant's Message

The location of the assistant's message varies by provider:

**OpenAI-compatible (OpenAI, Groq, Deepseek, etc.):**
```javascript
const assistantMessage = response.response.choices[0].message.content;
```

**Anthropic:**
```javascript
const assistantMessage = response.response.content[0].text;
```

**Google:**
```javascript
const assistantMessage = response.response.candidates[0].content.parts[0].text;
```

**With standardFormat=true:**
```javascript
const assistantMessage = response.response.choices[0].message.content;
```

### Recommended Response Handling

```javascript
function extractMessage(gatewayResponse) {
  const { provider, response, standardFormat } = gatewayResponse;

  // If using standard format, always use OpenAI structure
  if (standardFormat) {
    return response.choices[0].message.content;
  }

  // Otherwise, handle provider-specific formats
  switch (provider.toLowerCase()) {
    case 'openai':
    case 'groq':
    case 'deepseek':
    case 'moonshot':
    case 'cerebras':
    case 'perplexity':
    case 'openrouter':
    case 'together':
    case 'featherai':
    case 'sambanova':
    case 'mistral':
    case 'xai':
      return response.choices[0].message.content;

    case 'anthropic':
      return response.content[0].text;

    case 'google':
      return response.candidates[0].content.parts[0].text;

    case 'cohere':
      return response.text;

    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
```

### Usage Tracking

All responses include normalized usage information:

```javascript
const usage = response.usage;
console.log(`Tokens used: ${usage.total_tokens}`);
console.log(`Prompt: ${usage.prompt_tokens}, Completion: ${usage.completion_tokens}`);
```

This is normalized across all providers:
- OpenAI: Direct `usage` field
- Anthropic: `input_tokens` → `prompt_tokens`, `output_tokens` → `completion_tokens`
- Google: `promptTokenCount` → `prompt_tokens`, `candidatesTokenCount` → `completion_tokens`

---

## Conversation Management

### Conversation Caching

The gateway automatically caches conversation history for 90 minutes.

**How it works:**
1. Client provides `conversationId` in request
2. Gateway retrieves cached messages (if any)
3. Gateway merges cached messages with new messages
4. Gateway sends full conversation to LLM
5. Gateway updates cache with new messages + response

### Single-Turn Request

```json
{
  "provider": "openai",
  "model": "gpt-4",
  "messages": [
    {"role": "user", "content": "What is 2+2?"}
  ]
}
```

Response includes generated `conversationId`:
```json
{
  "conversationId": "conv-abc123xyz"
}
```

### Multi-Turn Conversation

**Turn 1:**
```json
{
  "provider": "openai",
  "model": "gpt-4",
  "messages": [
    {"role": "user", "content": "My name is Alice. What is 2+2?"}
  ],
  "conversationId": "user-123-session-abc"
}
```

**Turn 2:** (only send new message)
```json
{
  "provider": "openai",
  "model": "gpt-4",
  "messages": [
    {"role": "user", "content": "What is my name?"}
  ],
  "conversationId": "user-123-session-abc"
}
```

Gateway automatically includes all previous messages from cache.

Response: "Your name is Alice."

### Conversation ID Strategies

**User-Session Based:**
```javascript
const conversationId = `user-${userId}-session-${Date.now()}`;
```

**Project-Article Based:**
```javascript
const conversationId = `project-${projectId}-article-${articleId}`;
```

**Random UUID:**
```javascript
const conversationId = `conv-${crypto.randomUUID()}`;
```

### Cache Behavior

- **TTL:** 90 minutes from last activity
- **Auto-extension:** Each request resets the TTL
- **Expiry:** Gracefully falls back to provided messages if cache expired
- **Privacy:** Isolated per app (apps cannot access each other's caches)

### Manual Message Management (Alternative)

If you prefer to manage conversation history yourself:

```javascript
// Store conversation in your own database
const conversation = await db.getConversation(conversationId);

// Build full message array
const allMessages = [
  ...conversation.messages,
  { role: 'user', content: newUserMessage }
];

// Call gateway without conversationId
const response = await callLLM('openai', 'gpt-4', allMessages);

// Save to your database
conversation.messages.push(
  { role: 'user', content: newUserMessage },
  { role: 'assistant', content: extractMessage(response) }
);
await db.saveConversation(conversation);
```

---

## Rate Limiting

### Per-App Rate Limits

Each application has its own rate limit configured during app creation.

**Default:** 60 requests per minute
**Configurable:** Set during app creation

### Rate Limit Window

- **Window size:** 60 seconds (1 minute)
- **Window type:** Fixed (resets every minute at XX:00)
- **Example:** 10:00:00 to 10:00:59, then resets at 10:01:00

### Checking Remaining Quota

Every response includes rate limit information:

```json
{
  "metadata": {
    "rateLimitRemaining": 58
  }
}
```

### Rate Limit Exceeded Response

**Status Code:** `429 Too Many Requests`

**Response:**
```json
{
  "error": "Rate limit exceeded",
  "details": "Rate limit exceeded: 60/60 requests per minute",
  "type": "rate_limit_error"
}
```

**Headers:**
```
Retry-After: 60
```

### Handling Rate Limits

**Recommended approach:**

```javascript
async function callLLMWithRetry(provider, model, messages, options = {}, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await callLLM(provider, model, messages, options);
    } catch (error) {
      if (error.status === 429) {
        const retryAfter = error.headers?.['retry-after'] || 60;
        console.log(`Rate limited. Retrying after ${retryAfter}s...`);
        await sleep(retryAfter * 1000);
      } else {
        throw error;
      }
    }
  }
  throw new Error('Max retries exceeded');
}
```

### Increasing Rate Limits

To increase your app's rate limit, create a new app with higher limits:

```bash
curl -X POST https://llmproxy.api.sparkbright.me/admin/apps \
  -H "Content-Type: application/json" \
  -d '{
    "appName": "My High Volume App",
    "rateLimit": 300
  }'
```

---

## Error Handling

### Common Error Types

| Error Type | HTTP Status | Cause | Solution |
|------------|-------------|-------|----------|
| `authentication_error` | 401 | Invalid/missing API key | Check Authorization header |
| `rate_limit_error` | 429 | Rate limit exceeded | Wait and retry |
| `invalid_request_error` | 400 | Invalid request body | Check request format |
| `provider_error` | 500 | Provider API error | Try different provider |
| `api_error` | 500 | Internal gateway error | Contact support |

### Error Response Format

```json
{
  "error": "Error message",
  "type": "error_type",
  "details": "Additional details if available"
}
```

### Comprehensive Error Handling

```javascript
async function callLLM(provider, model, messages, options = {}) {
  try {
    const response = await fetch(`${LLM_GATEWAY_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LLM_GATEWAY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ provider, model, messages, options }),
    });

    if (!response.ok) {
      const error = await response.json();

      switch (response.status) {
        case 401:
          throw new Error(`Authentication failed: ${error.error}`);
        case 429:
          throw new Error(`Rate limit exceeded: ${error.details}`);
        case 400:
          throw new Error(`Invalid request: ${error.error}`);
        case 500:
          throw new Error(`Gateway error: ${error.error}`);
        default:
          throw new Error(`Unexpected error: ${error.error}`);
      }
    }

    return await response.json();
  } catch (error) {
    console.error('LLM Gateway error:', error);
    throw error;
  }
}
```

---

## Code Examples

### Node.js / JavaScript

**Basic Setup:**

```javascript
// .env file
// LLM_GATEWAY_URL=https://llmproxy.api.sparkbright.me
// LLM_GATEWAY_API_KEY=kb-llm-yourapp-xyz123

import 'dotenv/config';

const LLM_GATEWAY_URL = process.env.LLM_GATEWAY_URL;
const LLM_GATEWAY_API_KEY = process.env.LLM_GATEWAY_API_KEY;

async function callLLM(provider, model, messages, options = {}) {
  const response = await fetch(`${LLM_GATEWAY_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LLM_GATEWAY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      provider,
      model,
      messages,
      options,
      standardFormat: true, // Use unified format
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }

  const data = await response.json();
  return data.response.choices[0].message.content;
}

// Usage
const answer = await callLLM('openai', 'gpt-4', [
  { role: 'user', content: 'Explain quantum computing in one sentence.' }
]);

console.log(answer);
```

**With Conversation Management:**

```javascript
class LLMConversation {
  constructor(provider, model, conversationId) {
    this.provider = provider;
    this.model = model;
    this.conversationId = conversationId || `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async chat(userMessage, options = {}) {
    const response = await fetch(`${LLM_GATEWAY_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LLM_GATEWAY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider: this.provider,
        model: this.model,
        messages: [{ role: 'user', content: userMessage }],
        conversationId: this.conversationId,
        standardFormat: true,
        options,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }

    const data = await response.json();
    return data.response.choices[0].message.content;
  }
}

// Usage
const conversation = new LLMConversation('anthropic', 'claude-3-5-sonnet-20241022');

const response1 = await conversation.chat('My name is George. What is 2+2?');
console.log(response1); // "Hello George! 2+2 equals 4."

const response2 = await conversation.chat('What is my name?');
console.log(response2); // "Your name is George."
```

---

### Python

**Basic Setup:**

```python
# .env file
# LLM_GATEWAY_URL=https://llmproxy.api.sparkbright.me
# LLM_GATEWAY_API_KEY=kb-llm-yourapp-xyz123

import os
import requests
from dotenv import load_dotenv

load_dotenv()

LLM_GATEWAY_URL = os.getenv('LLM_GATEWAY_URL')
LLM_GATEWAY_API_KEY = os.getenv('LLM_GATEWAY_API_KEY')

def call_llm(provider, model, messages, options=None):
    url = f'{LLM_GATEWAY_URL}/v1/chat/completions'
    headers = {
        'Authorization': f'Bearer {LLM_GATEWAY_API_KEY}',
        'Content-Type': 'application/json',
    }
    body = {
        'provider': provider,
        'model': model,
        'messages': messages,
        'standardFormat': True,
        'options': options or {},
    }

    response = requests.post(url, json=body, headers=headers)

    if not response.ok:
        error = response.json()
        raise Exception(error.get('error', 'Unknown error'))

    data = response.json()
    return data['response']['choices'][0]['message']['content']

# Usage
answer = call_llm('openai', 'gpt-4', [
    {'role': 'user', 'content': 'Explain quantum computing in one sentence.'}
])

print(answer)
```

**With Conversation Management:**

```python
import uuid

class LLMConversation:
    def __init__(self, provider, model, conversation_id=None):
        self.provider = provider
        self.model = model
        self.conversation_id = conversation_id or f'conv-{uuid.uuid4()}'

    def chat(self, user_message, options=None):
        url = f'{LLM_GATEWAY_URL}/v1/chat/completions'
        headers = {
            'Authorization': f'Bearer {LLM_GATEWAY_API_KEY}',
            'Content-Type': 'application/json',
        }
        body = {
            'provider': self.provider,
            'model': self.model,
            'messages': [{'role': 'user', 'content': user_message}],
            'conversationId': self.conversation_id,
            'standardFormat': True,
            'options': options or {},
        }

        response = requests.post(url, json=body, headers=headers)

        if not response.ok:
            error = response.json()
            raise Exception(error.get('error', 'Unknown error'))

        data = response.json()
        return data['response']['choices'][0]['message']['content']

# Usage
conversation = LLMConversation('anthropic', 'claude-3-5-sonnet-20241022')

response1 = conversation.chat('My name is George. What is 2+2?')
print(response1)  # "Hello George! 2+2 equals 4."

response2 = conversation.chat('What is my name?')
print(response2)  # "Your name is George."
```

---

## Testing Your Integration

### 1. Health Check Test

```bash
curl https://llmproxy.api.sparkbright.me/health
```

Expected: `{"status": "healthy", ...}`

### 2. Authentication Test

```bash
curl -X POST https://llmproxy.api.sparkbright.me/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openai",
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Say hello"}]
  }'
```

Expected: Valid response with assistant message

### 3. Multi-Provider Test

Test with different providers to ensure portability:

```javascript
const providers = [
  { provider: 'openai', model: 'gpt-3.5-turbo' },
  { provider: 'anthropic', model: 'claude-3-haiku-20240307', options: { maxTokens: 100 } },
  { provider: 'google', model: 'gemini-1.5-flash' },
];

for (const config of providers) {
  const response = await callLLM(
    config.provider,
    config.model,
    [{ role: 'user', content: 'Say hello' }],
    config.options || {}
  );
  console.log(`${config.provider}: ${response}`);
}
```

### 4. Conversation Test

```javascript
const conv = new LLMConversation('openai', 'gpt-4');

const r1 = await conv.chat('Remember: my favorite color is blue');
const r2 = await conv.chat('What is my favorite color?');

console.assert(r2.toLowerCase().includes('blue'), 'Conversation memory failed');
```

### 5. Rate Limit Test

```javascript
const promises = Array(65).fill(0).map((_, i) =>
  callLLM('openai', 'gpt-3.5-turbo', [{ role: 'user', content: 'Hi' }])
    .catch(e => ({ error: e.message, attempt: i + 1 }))
);

const results = await Promise.all(promises);
const rateLimitErrors = results.filter(r => r.error?.includes('Rate limit'));

console.log(`Rate limit hit after ${results.length - rateLimitErrors.length} requests`);
```

---

## Common Pitfalls

### 1. Forgetting maxTokens for Anthropic

**Problem:**
```json
{
  "provider": "anthropic",
  "model": "claude-3-5-sonnet-20241022",
  "messages": [...]
  // Missing options.maxTokens
}
```

**Error:** `Missing required parameter: max_tokens`

**Solution:**
```json
{
  "provider": "anthropic",
  "model": "claude-3-5-sonnet-20241022",
  "messages": [...],
  "options": {
    "maxTokens": 1024
  }
}
```

### 2. Incorrect Message Role for Google

**Problem:**
```json
{
  "provider": "google",
  "messages": [
    {"role": "assistant", "content": "..."}  // Wrong role
  ]
}
```

**Solution:** Gateway handles this automatically - just use standard roles.

### 3. Not Handling Provider-Specific Response Formats

**Problem:**
```javascript
// This breaks with Anthropic
const message = response.response.choices[0].message.content;
```

**Solution:** Use `standardFormat: true` or implement provider-specific extraction:

```javascript
function extractMessage(response) {
  if (response.standardFormat) {
    return response.response.choices[0].message.content;
  }
  // Provider-specific handling...
}
```

### 4. Exceeding Rate Limits Without Retry Logic

**Problem:** Application crashes when rate limit is hit

**Solution:** Implement retry with backoff:

```javascript
async function callWithRetry(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.status === 429 && i < maxRetries - 1) {
        await sleep(60000); // Wait 1 minute
      } else {
        throw error;
      }
    }
  }
}
```

### 5. Hardcoding Provider/Model

**Problem:** Code breaks if provider is unavailable

**Solution:** Implement fallback:

```javascript
const PROVIDER_FALLBACKS = [
  { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
  { provider: 'openai', model: 'gpt-4' },
  { provider: 'groq', model: 'llama-3.1-70b-versatile' }
];
```

### 6. Not Using Conversation Caching

**Problem:** Manually managing full conversation history in every request

**Solution:** Use `conversationId` to leverage automatic caching:

```json
{
  "conversationId": "user-123-session-abc",
  "messages": [
    // Only new message
    {"role": "user", "content": "What is my name?"}
  ]
}
```

### 7. Exposing API Key in Client-Side Code

**Problem:** API key in frontend JavaScript

**Solution:** Always proxy through your backend:

```javascript
// Backend (Node.js)
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;
  const response = await callLLM('openai', 'gpt-4', messages);
  res.json(response);
});

// Frontend
const response = await fetch('/api/chat', {
  method: 'POST',
  body: JSON.stringify({ messages }),
});
```

---

## Summary Checklist

When integrating the LLM Gateway, ensure you:

- [ ] Generated API key via `/admin/apps` endpoint
- [ ] Stored API key securely in environment variables
- [ ] Implemented Bearer token authentication
- [ ] Added error handling for 401, 429, and 500 errors
- [ ] Implemented rate limit retry logic
- [ ] Used `standardFormat: true` for consistent responses
- [ ] Added `conversationId` for multi-turn conversations
- [ ] Included `maxTokens` in options for Anthropic
- [ ] Tested with multiple providers for fallback readiness
- [ ] Implemented provider fallback strategy
- [ ] Never exposed API key in client-side code
- [ ] Monitored `rateLimitRemaining` in response metadata

---

**Questions or Issues?**

- Review the [SECURE-GATEWAY.md](./SECURE-GATEWAY.md) for advanced features
- Check the [README.md](./README.md) for provider-specific notes
- Verify your API key is active via `/admin/apps` endpoint

**Version:** 2.0.0
**Last Updated:** 2025-11-27
**Gateway URL:** https://llmproxy.api.sparkbright.me
