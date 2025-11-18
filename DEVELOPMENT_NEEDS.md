# ReVisit Development Needs & Enhancements

This document tracks planned features, enhancements, and fixes for the ReVisit project.

## 🔴 Priority 0: Critical Bugs (Must Fix Immediately)

### Bug #1: Missing updateBookmarkStatus Handler
**Status**: ✅ FIXED
**Priority**: CRITICAL
**Location**: `background.js:494-532`
**Fixed**: 2025-11-18

**What was fixed**:
- Added message handler in `background.js` for `updateBookmarkStatus` messages
- Implemented status update logic for both "Complete" and "ReVisited" actions
- "Complete" action now properly marks bookmarks as complete with history tracking
- "Keep" action (ReVisited) now updates the revisit date and maintains Active status

---

### Bug #5: Category Deduplication Missing
**Status**: ✅ FIXED
**Priority**: CRITICAL (Quick Win)
**Location**: `onboarding.js:29-34`
**Fixed**: 2025-11-18

**What was fixed**:
- Added `Array.from(new Set(...))` to deduplicate categories during onboarding
- Users can no longer create duplicate categories (e.g., "Tech, Tech, Tech")
- Categories are now properly deduplicated before saving to storage

---

## 🟡 Priority 0.5: Medium Priority Bugs & Issues

### Bug #6: XSS Vulnerability (Likely Fixed, Needs Audit)
**Status**: Partially Mitigated
**Priority**: High (Security)
**Estimated Time**: 2-3 hours

**Current State**:
- Some mitigations in place
- Needs comprehensive security audit

**Action Required**:
- Full security review of all user input rendering
- Test with malicious inputs (script tags, event handlers, etc.)
- Ensure all dynamic HTML uses proper sanitization
- Document security measures in code

---

### Bug #4: Race Condition in Content Script Injection
**Status**: Partially Fixed
**Priority**: Medium
**Estimated Time**: 2-3 hours for optimization

**Current State**:
- Retry logic implemented
- Script initialization may run twice in some edge cases

**Optimization Needed**:
- Review and optimize content script injection timing
- Prevent duplicate initialization more reliably
- Add better state management for script lifecycle

---

### Bug #8: Inconsistent Storage Access
**Status**: Improved, Not Optimized
**Priority**: Medium (Performance)
**Estimated Time**: 3-4 hours

**Issue**:
- Multiple storage reads in single operation
- Inefficient data passing between components

**Recommendation**:
- Pass data as parameters instead of re-loading from storage
- Batch storage operations where possible
- Reduce storage API calls by caching in memory when appropriate

---

### Missing API Error Handling
**Status**: Has Fallback Mechanisms
**Priority**: Medium (UX)
**Estimated Time**: 2-3 hours

**Issue**:
- No user-facing error messages for API failures
- Users don't know when/why LLM operations fail

**Required Improvements**:
- Add toast/notification system for errors
- Display meaningful error messages to users
- Provide retry options for failed operations
- Log errors for debugging while showing user-friendly messages

---

## 🧪 Testing Gaps

### Critical Tests Needed:
1. **Floating Modal ReVisit Actions**
   - Test Complete/Keep buttons (currently broken - Bug #1)
   - Verify bookmark status updates in storage
   - Test across different video platforms

2. **Security Testing**
   - XSS vulnerability testing with malicious inputs
   - Test all user input fields for injection attacks
   - Verify sanitization in transcript/summary display

3. **Load Testing**
   - Test with 500+ bookmarks to verify performance
   - Measure UI responsiveness with large datasets
   - Identify performance bottlenecks

4. **Cross-Browser Testing**
   - Test on Chrome, Firefox, Edge
   - Verify extension APIs work consistently
   - Test video platform compatibility

---

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

## 📋 Recommended Future Improvements

### High Priority Enhancements

**Virtual Scrolling for Bookmark Lists**
- **Status**: Planned
- **Priority**: High (Performance)
- **Estimated Time**: 4-6 hours
- **Benefit**: Improve performance with large bookmark collections
- **Description**: Implement virtual scrolling to render only visible bookmarks, reducing DOM nodes and improving rendering performance

**Streaming API for LLM Responses**
- **Status**: Planned
- **Priority**: High (UX)
- **Estimated Time**: 8-10 hours
- **Benefit**: Better user experience with real-time feedback during summary/transcript generation
- **Description**:
  - Implement streaming responses from LLM APIs
  - Show progressive results as they arrive
  - Add loading indicators and partial content display

---

### Medium Priority Enhancements

**Local LLM Support**
- **Status**: Research Phase
- **Priority**: Medium
- **Estimated Time**: 10-15 hours
- **Benefit**: Privacy, cost reduction, offline capability
- **Description**:
  - Support for local LLM models (Ollama, LM Studio, etc.)
  - Local inference for summaries and transcripts
  - Fallback to cloud APIs when needed

**Pagination for Large Lists**
- **Status**: Planned
- **Priority**: Medium
- **Estimated Time**: 3-4 hours
- **Benefit**: Better organization and navigation of bookmarks
- **Description**:
  - Implement pagination or infinite scroll
  - Add page size controls
  - Maintain scroll position across navigation

---

### Low Priority Enhancements

**IndexedDB Migration**
- **Status**: Research Phase
- **Priority**: Low (Future Scalability)
- **Estimated Time**: 15-20 hours
- **Benefit**: Better performance and larger storage capacity
- **Description**:
  - Migrate from localStorage to IndexedDB
  - Support larger datasets (transcripts, summaries)
  - Implement data migration strategy from existing localStorage data
  - Consider progressive enhancement approach

---

## Implementation Notes

### Development Order Suggestion:

#### Immediate (Sprint 1 - Critical Bugs)
1. **Bug #5: Category Deduplication** - 5 minutes, quick win
2. **Bug #1: Missing updateBookmarkStatus Handler** - 1 hour, critical functionality
3. **Transcript Display Alignment** - Quick fix, immediate UX improvement

#### Short Term (Sprint 2 - Foundation)
4. **Settings Panel & LLM Configuration** - Foundation for other features
5. **Bug #6: Security Audit** - Important for production readiness
6. **Missing API Error Handling** - Improve user experience

#### Medium Term (Sprint 3 - Optimization)
7. **Bug #8: Storage Access Optimization** - Performance improvements
8. **Bug #4: Content Script Race Condition** - Stability improvements
9. **Testing Suite** - Ensure reliability

#### Long Term (Sprint 4+ - Features)
10. **General UI Overhaul** - Do in parallel with other work
11. **Chat with Transcript** - Depends on settings panel being complete
12. **Virtual Scrolling** - Performance for large datasets
13. **Storage Options** - Research while implementing other features, implement last

### Technical Debt to Address:
- Ensure all LLM API calls use configured providers from settings
- Refactor existing hard-coded API key references
- Create abstraction layer for LLM provider interactions
- Add comprehensive error handling for network/API failures

---

## Completed Items

### ✅ Bug #1: Missing updateBookmarkStatus Handler (Fixed 2025-11-18)
- Added message handler in `background.js:494-532` for `updateBookmarkStatus` messages
- Implemented status update logic for "Complete" and "ReVisited" actions
- Floating modal buttons now work properly

### ✅ Bug #5: Category Deduplication (Fixed 2025-11-18)
- Added category deduplication in `onboarding.js:29-34`
- Prevents duplicate categories during onboarding
- Uses `Array.from(new Set(...))` to ensure unique categories

---

**Last Updated**: 2025-11-18 (Fixed Priority 0 Critical Bugs #1 and #5)
**Document Owner**: Development Team
