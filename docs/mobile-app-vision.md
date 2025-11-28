# ReVisit Mobile App: Vision & Feature Roadmap

**Document Status:** Draft
**Last Updated:** 2025-11-28
**Purpose:** Define the vision, features, and capabilities for a ReVisit mobile application

---

## Executive Summary

A ReVisit mobile app would extend the browser extension's capabilities to mobile devices, enabling users to:
- Access saved bookmarks and videos on-the-go
- Capture new content from mobile browsers and apps
- Get smart notifications for revisit reminders
- Consume content during commute/downtime
- Leverage AI for daily activity planning

**Core Philosophy:** The mobile app should complement (not duplicate) the browser extension, focusing on consumption, quick capture, and AI-assisted productivity.

---

## 1. Core Mobile Features

### 1.1 Bookmark Consumption & Management

**Use Case:** User is commuting, waiting in line, or has downtime and wants to revisit saved content.

#### Features

**📱 Mobile-Optimized Bookmark List**
- Swipe gestures for quick actions (mark complete, reschedule, delete)
- Pull-to-refresh for latest sync
- Infinite scroll with lazy loading
- Dark mode support
- Priority bookmarks pinned to top

**🔍 Smart Filters & Search**
- Quick filters: Today, This Week, Overdue, All
- Category tabs (similar to extension)
- Full-text search across titles, summaries, and notes
- Saved searches/views (e.g., "Tech articles for commute")

**📖 In-App Content Reader**
- Built-in reader mode for articles (like Safari Reader)
- Text-to-speech for hands-free consumption
- Video player for YouTube (with transcript overlay)
- Adjustable text size, font, and background color
- Highlight and annotate while reading

**✏️ Quick Editing**
- Edit notes with voice dictation
- Change category with quick picker
- Reschedule revisit date with smart suggestions ("Tomorrow", "Next Week", "Next Month")
- Add tags with suggestions from AI

**✅ Status Management**
- Mark as "ReVisited" with one tap
- Mark as "Complete" with swipe gesture
- Snooze for later (1 hour, tomorrow, next week)

---

### 1.2 Content Capture from Mobile

**Use Case:** User finds interesting content on mobile (Safari, Chrome, Twitter, LinkedIn, etc.) and wants to save it to ReVisit.

#### Features

**📲 Share Sheet Integration**
- Add ReVisit to iOS/Android share menu
- Share from any app (browser, Twitter, Reddit, LinkedIn, YouTube, etc.)
- One-tap save with AI processing in background
- Offline queueing (save even without internet)

**🎬 YouTube Integration**
- Deep link support for YouTube app
- Auto-fetch transcript when saving video
- Show estimated watch time
- Save specific timestamp within video

**🔗 Universal Deep Linking**
- Open any bookmark in appropriate app (YouTube, Twitter, etc.)
- Fallback to in-app browser if app not installed
- Remember user preference per domain

**📸 Screenshot & OCR Capture**
- Take screenshot, extract text with OCR
- Save as bookmark with image attachment
- AI processes extracted text for summary

**🎙️ Voice Capture**
- Record voice note as bookmark
- AI transcribes and generates summary
- Useful for podcast episodes, lectures, or quick thoughts

---

### 1.3 Smart Notifications & Reminders

**Use Case:** User forgets to revisit content. App proactively reminds them at optimal times.

#### Features

**⏰ Intelligent Reminders**
- Push notification when revisit date approaches
- Smart timing based on user behavior (e.g., "You usually read at 8 PM")
- Batch notifications to avoid spam (daily digest option)
- Rich notifications with bookmark preview and quick actions

**🧠 AI-Powered Suggestions**
- "You have 20 minutes before your next meeting. Here are 3 short articles you can read now."
- "You commute for 45 minutes. Here's a YouTube video to watch."
- "You haven't revisited these 5 bookmarks in 2 weeks. Should we reschedule or mark complete?"

**📊 Weekly Digest**
- Summary of week's activity (added, revisited, completed)
- Upcoming revisits for next week
- Suggestions for content to prioritize
- Gamification: "You completed 12 bookmarks this week! 🎉"

---

### 1.4 Offline Support

**Use Case:** User is on a plane, subway, or area with poor connectivity.

#### Features

**💾 Offline Reading**
- Download articles for offline reading
- Cache YouTube transcripts
- Sync when back online
- Show offline indicator with sync status

**🔄 Offline Capture**
- Save bookmarks to queue when offline
- Auto-sync when connection restored
- Show pending sync count in UI

**⚙️ Smart Sync Settings**
- Sync on WiFi only (save mobile data)
- Auto-download priority bookmarks
- Sync frequency (real-time, hourly, manual)

---

## 2. Advanced Features (V2+)

### 2.1 Built-In Browser with Capture Overlay

**Use Case:** User wants to browse and capture content without leaving ReVisit app.

#### Features

**🌐 In-App Browser**
- Full-featured browser (WebView-based)
- Floating action button to "Save to ReVisit" from any page
- Highlight text to save as quote with context
- Ad blocker and reader mode built-in

**📌 Quick Capture Toolbar**
- Always visible "+" button while browsing
- Auto-populate title, URL, and meta description
- AI generates summary in background
- Show confirmation toast when saved

**🔖 Browser History Integration**
- Automatically suggest saving pages you spend >2 minutes on
- "Looks like you're researching X. Save this for later?"
- One-tap dismiss if not interested

---

### 2.2 Content Discovery & Recommendations

**Use Case:** User runs out of saved content and wants new recommendations.

#### Features

**🎯 Personalized Recommendations**
- "Based on your interest in AI, here are trending articles"
- Integration with Hacker News, Reddit, Medium, etc.
- Show recommendations at bottom of bookmark list
- Save recommendations with one tap

**🔥 Trending in Your Categories**
- Show popular content in user's saved categories
- Filter by timeframe (today, this week, this month)
- Upvote/downvote to improve recommendations

**👥 Collaborative Collections**
- Share collections with friends or publicly
- Follow other users' public collections
- Import bookmarks from shared collections

---

### 2.3 Enhanced Multimedia Support

**Use Case:** User saves podcasts, PDFs, courses, and other media types.

#### Features

**🎧 Podcast Integration**
- Deep link to Apple Podcasts, Spotify, Overcast
- Save specific episodes with timestamp
- Auto-download episode transcript (if available)
- Mark episode as listened when finished

**📄 PDF & Document Support**
- Upload PDFs as bookmarks
- In-app PDF viewer with highlighting
- AI generates summary from PDF text
- Sync highlights and notes

**🎓 Online Course Tracking**
- Save Udemy, Coursera, YouTube playlist links
- Track progress through course
- Set reminder for next lesson
- Certificate tracking when complete

**📚 E-Book Integration**
- Deep link to Kindle, Apple Books
- Save book with chapter/page number
- Resume reading from where you left off
- AI generates chapter summaries

---

### 2.4 Social & Collaboration

**Use Case:** User wants to share interesting content with team or friends.

#### Features

**👨‍👩‍👧‍👦 Team Workspaces**
- Create shared workspace for team/family
- Collaborative bookmark collections
- Assign bookmarks to team members
- Comment threads on bookmarks

**💬 Discussion Threads**
- Add comments to bookmarks
- @mention team members
- Attach images/files to discussions
- Mark discussion as resolved

**📤 Easy Sharing**
- Share bookmark via link (public or private)
- Generate shareable collection (e.g., "Top 10 AI Articles")
- Export to other apps (Notion, Obsidian, Roam)
- Email digest of bookmarks

---

## 3. AI-Powered Productivity Features

### 3.1 Daily Activity Planning

**Use Case:** User has 1 hour of free time and wants AI to suggest what to work on.

#### Features

**🤖 AI Daily Planner**
- Morning notification: "Good morning! Here's your plan for today:"
- Analyze user's calendar (with permission)
- Suggest time blocks for specific bookmarks
- "You have 30 minutes at 2 PM. Watch this 25-minute video?"

**📅 Smart Scheduling**
- User sets goals: "I want to complete 5 bookmarks per week"
- AI creates weekly plan distributed across days
- Adjusts plan based on completion rate
- Reschedules automatically if user misses a day

**⏱️ Time-Boxing Assistant**
- "You have 2 hours tonight. Here's what you can complete:"
- Group bookmarks by estimated time (5-min read, 30-min video, etc.)
- Suggest optimal order based on energy levels
- "Start with easy wins, end with deep reading"

**🎯 Focus Sessions**
- Start Pomodoro timer for focused reading/watching
- Block notifications during focus time
- Track focus streaks and total time
- Celebrate milestones ("10 hours of focused learning!")

---

### 3.2 Goal & Priority Alignment

**Use Case:** User has vague goals ("learn AI") but needs help organizing bookmarks to achieve them.

#### Features

**🎯 Goal Setting Wizard**
- User defines goals: "Learn AI/ML", "Stay updated on tech", "Improve writing"
- AI suggests relevant categories and tags
- Maps existing bookmarks to goals
- Identifies gaps: "You have no bookmarks about neural networks yet"

**📊 Goal Progress Tracking**
- Visual dashboard showing progress per goal
- "You've completed 12/30 AI bookmarks this month"
- Trend charts (weekly completion rate)
- Adjust goals based on actual usage

**🏆 Priority Matrix**
- AI categorizes bookmarks by urgency & importance (Eisenhower Matrix)
- **Do First:** High urgency, high importance (overdue + priority)
- **Schedule:** Low urgency, high importance (aligned with goals)
- **Delegate/Delete:** Low importance items
- User can override AI suggestions

**💡 Insight Summaries**
- Weekly summary: "You learned about X, Y, and Z this week"
- Monthly themes: "Your top interests this month: AI, productivity, health"
- AI-generated connections: "These 3 articles are related, create a collection?"
- Suggest follow-up content based on completed bookmarks

---

### 3.3 Contextual AI Assistant

**Use Case:** User wants to ask questions about saved content without re-reading everything.

#### Features

**💬 Chat with Your Library**
- Chat interface: "What did I save about transformers?"
- AI searches and summarizes relevant bookmarks
- Cite sources with links to original bookmarks
- Follow-up questions: "Tell me more about attention mechanisms"

**🔎 Semantic Search**
- Search by meaning, not just keywords
- "Show me articles about making money online" matches "monetization strategies", "passive income", etc.
- Powered by embeddings (OpenAI, Cohere, etc.)

**📝 Auto-Generated Study Guides**
- Select multiple bookmarks, AI creates study guide
- Outline key concepts, terms, and takeaways
- Generate quiz questions for self-testing
- Export as PDF or Markdown

**🗂️ Smart Collections**
- AI suggests grouping bookmarks into collections
- "You have 8 bookmarks about React hooks, create a collection?"
- Auto-update collections as new relevant bookmarks added
- Generate collection summary and learning path

---

## 4. Technical Implementation Considerations

### 4.1 Platform Choice

**Option A: Native Apps (Swift + Kotlin)**
- **Pros:** Best performance, full OS integration, better UX
- **Cons:** Maintain 2 codebases, longer development time
- **Best for:** Long-term product with large user base

**Option B: React Native / Flutter**
- **Pros:** Single codebase, faster development, good performance
- **Cons:** Limited access to some native APIs, larger app size
- **Best for:** MVP and rapid iteration

**Option C: Progressive Web App (PWA)**
- **Pros:** Works on all platforms, no app store approval, instant updates
- **Cons:** Limited OS integration, no App Store visibility
- **Best for:** Testing mobile viability with low investment

**Recommendation:** Start with React Native (easier to share logic with extension) or Flutter (best performance). Add PWA for quick testing.

---

### 4.2 Deep Linking Strategy

**Universal Links (iOS) / App Links (Android)**
- Register custom URL scheme: `revisit://`
- Handle web URLs: `https://revisit.app/bookmark/{id}`
- Fallback to web if app not installed
- Track deep link attribution (where users came from)

**Integration Examples:**

**YouTube Deep Link**
```javascript
// When user taps YouTube bookmark
const youtubeUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const deepLink = `youtube://watch?v=dQw4w9WgXcQ`;

// Try opening in YouTube app
Linking.openURL(deepLink).catch(() => {
  // Fallback to in-app browser or Safari
  Linking.openURL(youtubeUrl);
});
```

**Twitter Deep Link**
```javascript
const tweetUrl = "https://twitter.com/user/status/12345";
const deepLink = `twitter://status?id=12345`;

Linking.openURL(deepLink).catch(() => {
  Linking.openURL(tweetUrl);
});
```

**Custom Deep Links for Inter-App Communication**
```
revisit://bookmark/{bookmarkId}
revisit://category/{categoryName}
revisit://search?q={query}
revisit://add?url={encodedUrl}
revisit://today (show today's revisits)
```

---

### 4.3 Share Sheet Integration

**iOS Share Extension**
- Create iOS Share Extension target
- Receive URL, title, and selected text from sharing app
- Show mini UI for quick customization (category, notes)
- Save to ReVisit and sync

**Android Share Intent**
- Register intent filter for ACTION_SEND
- Handle text, URLs, and images
- Show Activity for editing bookmark details
- Save and sync

**Example Code (React Native)**

```javascript
// iOS/Android share receiver
import ShareExtension from 'react-native-share-extension';

ShareExtension.data().then(({ type, value }) => {
  if (type === 'URL') {
    // Pre-populate bookmark form
    const newBookmark = {
      url: value,
      title: '', // Fetch from metadata
      category: 'Uncategorized',
      status: 'Active',
      revisitBy: getDefaultRevisitDate()
    };

    // Show quick-add modal
    navigation.navigate('QuickAdd', { bookmark: newBookmark });
  }
});
```

---

### 4.4 Browsing Capability

**Option A: WebView-Based Browser**
- Use `react-native-webview` or native WebView
- Inject JavaScript to detect content types
- Floating "Save to ReVisit" button
- Capture page metadata and selected text

**Option B: Integration with Existing Browsers**
- Deep link to Safari/Chrome with custom scheme
- Use browser's share functionality
- No in-app browsing required

**Recommendation:** Start with Option B (simpler), add Option A later for advanced users.

---

## 5. User Flows & Wireframes

### 5.1 Quick Capture Flow

```
1. User finds article in Safari on iPhone
2. Taps Share button
3. Selects "ReVisit" from share menu
4. Mini popup appears with:
   - Auto-filled title and URL
   - Category picker (default: last used)
   - Revisit date (default: 7 days)
   - Quick note field (optional)
   - "Save" button
5. Tap "Save"
6. Toast notification: "Saved to ReVisit ✓"
7. AI processes summary in background
8. Push notification when summary ready (optional)
```

---

### 5.2 Morning Routine Flow

```
1. User wakes up at 7 AM
2. Push notification: "Good morning! You have 5 bookmarks to revisit today 📚"
3. User taps notification
4. App opens to "Today" view
5. Prioritized list:
   - 🔴 Overdue: 1 bookmark (3 days late)
   - 🟡 Priority: 2 bookmarks (due today)
   - 🟢 Scheduled: 2 bookmarks (due within 3 days)
6. User taps first bookmark
7. In-app reader opens with content
8. User reads for 5 minutes
9. Swipes left to mark "Complete" ✓
10. Confetti animation 🎉
11. Next bookmark automatically appears
```

---

### 5.3 AI Daily Planner Flow

```
1. User opens app at 9 AM
2. Home screen shows:
   - "Your Daily Plan" card at top
   - AI-generated schedule:
     - 9:30 AM - 10:00 AM: Read "AI alignment" article (30 min)
     - 12:00 PM - 12:15 PM: Watch "Quick Python tip" video (15 min)
     - 8:00 PM - 9:00 PM: Deep dive into "Machine Learning course" (1 hour)
3. User taps "Start 9:30 AM session"
4. App opens article in reader mode
5. Timer starts (30 minutes)
6. Notification when 5 minutes left
7. User finishes reading, marks complete
8. App shows next scheduled item
9. "You have 2 hours until your next ReVisit. Relax or add more?"
```

---

## 6. Monetization Opportunities

### 6.1 Free Tier
- Up to 100 bookmarks
- Basic AI summaries (limited to 10/day)
- Manual sync only
- Standard categories and tags
- No goal tracking or daily planner

### 6.2 Premium Tier ($4.99/month or $49/year)
- Unlimited bookmarks
- Unlimited AI summaries and processing
- Real-time sync across devices
- Advanced AI features (daily planner, chat with library)
- Offline downloads
- Custom categories and views
- Priority support

### 6.3 Pro Tier ($9.99/month or $99/year)
- All Premium features
- Team workspaces (up to 10 members)
- Advanced analytics and insights
- API access for integrations
- White-label option (for enterprises)
- Custom AI model selection
- Export to Notion, Obsidian, Roam

### 6.4 Enterprise Tier (Custom Pricing)
- All Pro features
- Unlimited team members
- SSO/SAML authentication
- Dedicated support
- Custom deployment (on-premise option)
- SLA guarantees
- Training and onboarding

---

## 7. Roadmap & Milestones

### Phase 1: MVP (Months 1-3)
- [ ] Basic bookmark list and viewing
- [ ] Quick capture via share sheet
- [ ] Category filtering
- [ ] Status management (Active/Complete)
- [ ] Cloud sync with chosen backend (Supabase/Firebase)
- [ ] Push notifications for revisit reminders
- [ ] In-app reader for articles
- [ ] YouTube deep linking

**Success Metric:** 100 beta users, 50% weekly active

---

### Phase 2: Enhanced Consumption (Months 4-6)
- [ ] Video player with transcript overlay
- [ ] Text-to-speech for articles
- [ ] Offline downloads
- [ ] Search functionality
- [ ] Edit notes and categories
- [ ] Swipe gestures for quick actions
- [ ] Dark mode

**Success Metric:** 500 users, 65% weekly active, 4.5+ App Store rating

---

### Phase 3: AI Features (Months 7-9)
- [ ] AI daily planner
- [ ] Goal setting and tracking
- [ ] Smart scheduling
- [ ] Weekly digests
- [ ] Priority matrix
- [ ] Time-boxing assistant

**Success Metric:** 1000 users, 70% weekly active, 20% paid conversion

---

### Phase 4: Advanced Features (Months 10-12)
- [ ] In-app browser with capture
- [ ] Chat with library (semantic search)
- [ ] Team workspaces
- [ ] Content recommendations
- [ ] Study guides and quizzes
- [ ] API access

**Success Metric:** 2500 users, 75% weekly active, 30% paid conversion, $5K MRR

---

## 8. Technical Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Mobile App (React Native / Flutter)  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐        │
│  │   UI Layer │  │ Share Ext  │  │ Notification│       │
│  │            │  │            │  │  Service    │       │
│  └─────┬──────┘  └──────┬─────┘  └──────┬──────┘       │
│        │                │               │              │
│  ┌─────▼────────────────▼───────────────▼──────┐       │
│  │          Business Logic Layer               │       │
│  │  (State Management - Redux/MobX/Zustand)    │       │
│  └─────┬──────────────────────────────┬────────┘       │
│        │                              │                │
│  ┌─────▼──────┐               ┌───────▼───────┐        │
│  │  IndexedDB │               │  Cloud Sync   │        │
│  │  (Offline) │◄─────────────►│   Service     │        │
│  └────────────┘               └───────┬───────┘        │
└────────────────────────────────────────┼────────────────┘
                                         │
                                         │ HTTPS/WSS
                                         │
                         ┌───────────────▼───────────────┐
                         │   Cloud Backend               │
                         │   (Firebase / Supabase)       │
                         │                               │
                         │  ┌─────────┐  ┌────────────┐  │
                         │  │  Auth   │  │  Database  │  │
                         │  └─────────┘  └────────────┘  │
                         │  ┌─────────┐  ┌────────────┐  │
                         │  │ Storage │  │  Functions │  │
                         │  └─────────┘  └────────────┘  │
                         └───────────────────────────────┘
```

**Key Principles:**
1. **Offline-First:** All data in local DB, sync when online
2. **Optimistic Updates:** Update UI immediately, sync in background
3. **Conflict Resolution:** Last-write-wins with tombstones for deletes
4. **Background Sync:** Use OS background tasks for periodic sync
5. **Push Notifications:** Firebase Cloud Messaging (FCM) / APNs

---

## 9. Success Metrics & KPIs

### Engagement Metrics
- **Daily Active Users (DAU):** Target 60% of installs
- **Weekly Active Users (WAU):** Target 75% of installs
- **Monthly Active Users (MAU):** Target 85% of installs
- **Average Session Duration:** Target 5-10 minutes
- **Sessions per Day:** Target 2-3 sessions
- **Bookmarks Added per Week:** Target 5-10 per user

### Retention Metrics
- **Day 1 Retention:** Target 70%
- **Day 7 Retention:** Target 50%
- **Day 30 Retention:** Target 35%
- **Day 90 Retention:** Target 25%

### Conversion Metrics
- **Free to Premium:** Target 20-30%
- **Trial to Paid:** Target 40-50%
- **Annual vs Monthly:** Target 60% annual

### Business Metrics
- **Customer Acquisition Cost (CAC):** Target <$10
- **Lifetime Value (LTV):** Target >$100
- **LTV/CAC Ratio:** Target >10:1
- **Churn Rate:** Target <5% monthly
- **Net Revenue Retention:** Target >100%

---

## 10. Risk & Mitigation

### Technical Risks
- **Risk:** Sync conflicts and data loss
- **Mitigation:** Implement conflict resolution, regular backups, audit logs

- **Risk:** Poor performance with 1000+ bookmarks
- **Mitigation:** Pagination, lazy loading, IndexedDB indexing

- **Risk:** AI processing costs too high
- **Mitigation:** Rate limits, batch processing, cheaper models for summaries

### Business Risks
- **Risk:** Low user adoption
- **Mitigation:** Focus on marketing, referral program, App Store optimization

- **Risk:** High churn rate
- **Mitigation:** User onboarding, engagement emails, feature tutorials

- **Risk:** Competition (Pocket, Instapaper, Notion)
- **Mitigation:** Differentiate with AI features, better UX, tighter integration

### Regulatory Risks
- **Risk:** GDPR/CCPA compliance issues
- **Mitigation:** Privacy policy, user data export/deletion, consent forms

---

## 11. Next Steps

1. **Validate Assumptions**
   - Survey existing extension users about mobile needs
   - Build clickable prototype (Figma)
   - Run usability tests with 5-10 users

2. **Choose Tech Stack**
   - Decide: React Native vs Flutter vs Native
   - Pick backend: Firebase vs Supabase (see `storage-solutions-analysis.md`)
   - Set up CI/CD pipeline

3. **Build MVP (Phase 1)**
   - Focus on core consumption features
   - Get to App Store/Play Store quickly
   - Gather feedback and iterate

4. **Measure & Iterate**
   - Track metrics closely
   - A/B test key features
   - Talk to users weekly

---

**Document End**
