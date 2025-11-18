# ReVisit Development Needs & Enhancements

This document tracks planned features, enhancements, and fixes for the ReVisit project.

## Priority 1: Settings Panel & LLM Configuration

### Settings Panel Implementation
**Status**: Planned
**Priority**: High
**Description**: Create a comprehensive settings panel for managing LLM providers and models.

#### Requirements:

**API Key Management**
- Form to add/manage API keys for all three supported providers (OpenAI, Anthropic, Google)
- Secure storage of API keys in localStorage (consider encryption)
- "Test API Key" button for each provider
  - Validates key by calling the provider's "Get Models" API
  - On success, stores available models list in localStorage
  - Provides clear success/error feedback to user

**Provider & Model Selection**
- Initial question: "Use the same provider for summarization and transcript formatting?"
  - **If Yes**: Display unified configuration
    - Single "AI Provider" dropdown (shows only providers with valid stored keys)
    - Single "Model" dropdown (populated with models for selected provider)
  - **If No**: Display separate configuration
    - "Summarization AI Provider" dropdown + corresponding "Model" dropdown
    - "Transcript Formatting AI Provider" dropdown + corresponding "Model" dropdown

**Dynamic UI Behavior**
- Provider dropdowns only show providers with valid, tested API keys
- Model dropdowns update dynamically based on selected provider
- Persist user selections to localStorage
- Load saved settings on application startup

**Technical Considerations**
- Models list should be cached per provider to avoid repeated API calls
- Implement proper error handling for API key validation failures
- Consider adding a "Refresh Models" option to update cached model lists

---

## Priority 2: UI/UX Improvements

### Transcript Display Alignment
**Status**: Bug
**Priority**: High
**Description**: Transcript markdown display is currently center-aligned, which looks poor. Need to change to left-justified.

**Tasks**:
- Identify CSS styles controlling transcript markdown alignment
- Update to use left-justification (text-align: left)
- Test with various transcript lengths and formats
- Ensure other markdown elements (headings, lists, code blocks) also render properly

### General UI Overhaul
**Status**: Planned
**Priority**: Medium
**Description**: Comprehensive review and improvement of the application's user interface.

**Areas to Address**:
- Consistent spacing and padding across all screens
- Improved typography and readability
- Better visual hierarchy
- Responsive design improvements
- Accessibility enhancements (ARIA labels, keyboard navigation, contrast)
- Modern, clean aesthetic aligned with the application's purpose

---

## Priority 3: New Features

### Chat with Transcript
**Status**: Planned
**Priority**: Medium
**Description**: Add an interactive chat interface that allows users to ask questions about a transcript using AI.

**Requirements**:
- New screen/modal for chat interface
- Context-aware chat using selected LLM provider/model from settings
- Include full transcript as context for AI responses
- Maintain chat history for the session
- Clear visual distinction between user questions and AI responses
- Option to reference specific parts of the transcript
- Copy/export chat conversation functionality

**Technical Considerations**:
- Token limit management (transcripts can be long)
- Consider chunking strategy for very large transcripts
- Streaming responses for better UX
- Persist chat history (localStorage or session-only?)

---

## Priority 4: Infrastructure & Storage

### Storage Options & Cloud Sync
**Status**: Research Phase
**Priority**: Low-Medium
**Description**: Explore enhanced storage options and cloud synchronization capabilities.

**Areas to Explore**:
- **Current State**: Review existing localStorage usage and limitations
- **Cloud Sync Options**:
  - User account system (authentication)
  - Backend storage service (Firebase, Supabase, custom API)
  - Sync strategy (real-time, manual, automatic with conflict resolution)
- **Data to Sync**:
  - Bookmarks and transcripts
  - AI summaries
  - User settings and preferences
  - API keys (security considerations!)
- **Offline-First Approach**: Ensure app works offline, syncs when online
- **Export/Import**: Allow users to backup/restore their data
- **Privacy Considerations**: End-to-end encryption for sensitive data

**Questions to Answer**:
- Do we need user accounts, or can we use anonymous sync (device pairing)?
- What's the expected data size per user?
- Should this be optional or core functionality?
- What's the hosting/cost model for cloud storage?

---

## Implementation Notes

### Development Order Suggestion:
1. **Settings Panel & LLM Configuration** - Foundation for other features
2. **Transcript Display Alignment** - Quick fix, immediate UX improvement
3. **General UI Overhaul** - Do in parallel with other work
4. **Chat with Transcript** - Depends on settings panel being complete
5. **Storage Options** - Research while implementing other features, implement last

### Technical Debt to Address:
- Ensure all LLM API calls use configured providers from settings
- Refactor existing hard-coded API key references
- Create abstraction layer for LLM provider interactions
- Add comprehensive error handling for network/API failures

---

## Completed Items

_(Move items here as they are completed)_

---

**Last Updated**: 2025-11-18
**Document Owner**: Development Team
