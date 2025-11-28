# Storage Solutions Analysis: Cloud Sync for ReVisit

**Document Status:** Draft
**Last Updated:** 2025-11-28
**Purpose:** Technical analysis of storage solutions for adding user authentication and cloud sync to ReVisit

---

## Executive Summary

ReVisit currently uses Chrome's local storage (10MB limit), which is fast but restricts users to a single device. This document analyzes five technical approaches for adding cloud sync with user authentication, evaluating each on cost, complexity, scalability, and feature fit.

**Current State:**
- Storage: `chrome.storage.local` (10MB limit)
- Data: Bookmarks, transcripts, categories, settings
- Issue: No cross-device sync, capacity constraints with 100+ YouTube transcripts

**Target State:**
- User authentication with email/social login
- Real-time or near-real-time sync across devices
- Support for future mobile app
- Scalable to 1000+ bookmarks per user
- Privacy-focused (encrypted sensitive data)

---

## Solution Options

### Option 1: Firebase (Google)

**Architecture:**
- Authentication: Firebase Auth (email, Google, Apple, etc.)
- Database: Cloud Firestore (NoSQL document store)
- Storage: Firebase Storage (for large transcript files)
- Hosting: Firebase Hosting (optional for web version)

#### Benefits

✅ **All-in-one platform**
- Single SDK for auth, database, storage, analytics
- Unified billing and dashboard
- Official Chrome Extension support

✅ **Developer Experience**
- Excellent documentation and community
- Real-time sync built-in (WebSocket-based)
- Offline persistence with automatic conflict resolution
- Zero backend code required

✅ **Scalability**
- Automatic scaling (0 to millions of users)
- Global CDN for low latency
- 1GB Firestore storage free tier

✅ **Mobile-Ready**
- Native SDKs for iOS and Android
- Same codebase for extension and mobile sync logic
- Push notifications included

✅ **Security**
- Row-level security rules (Firestore Security Rules)
- Automatic HTTPS and encryption at rest
- Built-in user email verification

#### Downsides

❌ **Cost Structure**
- **Free tier:** 50K reads/day, 20K writes/day, 1GB storage
- **After free tier:** $0.06 per 100K reads, $0.18 per 100K writes
- **Concern:** Real-time sync can rack up reads quickly
- **Estimate:** 100 active users = ~$20-50/month

❌ **Vendor Lock-in**
- Proprietary database (hard to migrate away)
- Firebase-specific query language
- Google ecosystem dependency

❌ **NoSQL Limitations**
- No complex queries (no JOINs)
- Limited aggregation capabilities
- Must denormalize data (duplicate across collections)

❌ **Privacy Concerns**
- Data stored on Google servers
- Subject to Google's privacy policies
- GDPR/CCPA compliance is your responsibility

#### Technical Implementation

```javascript
// Initialize Firebase
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "revisit-app.firebaseapp.com",
  projectId: "revisit-app"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Real-time sync for bookmarks
function syncBookmarks(userId) {
  const bookmarksRef = collection(db, `users/${userId}/bookmarks`);

  return onSnapshot(bookmarksRef, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        // Add bookmark to local IndexedDB
      }
      if (change.type === 'modified') {
        // Update bookmark in local IndexedDB
      }
      if (change.type === 'removed') {
        // Remove bookmark from local IndexedDB
      }
    });
  });
}
```

#### Data Model

```
users/{userId}
  ├── profile (doc)
  │   ├── email
  │   ├── userName
  │   └── createdAt
  │
  ├── settings (doc)
  │   ├── defaultIntervalDays
  │   ├── priorityThresholdDays
  │   └── llmGateway (encrypted)
  │
  ├── bookmarks (collection)
  │   └── {bookmarkId} (doc)
  │       ├── url
  │       ├── title
  │       ├── category
  │       ├── summary
  │       ├── tags []
  │       ├── status
  │       ├── revisitBy
  │       └── addedTimestamp
  │
  └── transcripts (collection)
      └── {videoId} (doc)
          ├── raw (Firebase Storage reference)
          ├── formatted
          └── metadata
```

#### Migration Effort
- **Complexity:** Low-Medium
- **Time Estimate:** 2-3 weeks
- **Skills Needed:** JavaScript, Firebase SDK
- **Risk:** Low (well-documented, proven technology)

---

### Option 2: Supabase (Open Source Firebase Alternative)

**Architecture:**
- Authentication: Supabase Auth (email, OAuth providers)
- Database: PostgreSQL (relational database)
- Storage: Supabase Storage (S3-compatible)
- Realtime: PostgreSQL Change Data Capture (CDC)

#### Benefits

✅ **Open Source**
- Based on PostgreSQL, PostgREST, Realtime
- Self-hostable (escape hatch from SaaS)
- No vendor lock-in (standard SQL)

✅ **SQL Power**
- Full PostgreSQL capabilities (JOINs, transactions, views)
- Complex queries for future AI features
- Better for analytics and reporting
- Row-Level Security (RLS) policies

✅ **Developer Experience**
- Similar DX to Firebase (auto-generated REST API)
- Real-time subscriptions via WebSockets
- Auto-generated TypeScript types
- Excellent documentation

✅ **Cost Efficiency**
- **Free tier:** 500MB database, 1GB storage, 2GB bandwidth
- **Pro:** $25/month (8GB database, 100GB storage, 50GB bandwidth)
- More predictable pricing than Firebase
- Unlimited API requests (no per-read charges)

✅ **Privacy-Focused**
- Open source (auditable code)
- EU data residency options
- Self-hosting option for sensitive data

✅ **Mobile-Ready**
- SDKs for iOS, Android, Flutter
- Same Postgres backend for all platforms

#### Downsides

❌ **Smaller Ecosystem**
- Less mature than Firebase (founded 2020)
- Smaller community and fewer tutorials
- Some features still in beta

❌ **Self-Hosting Complexity**
- Free tier is generous, but self-hosting requires DevOps skills
- Must manage PostgreSQL, Realtime server, Auth server
- No automatic scaling (must provision servers)

❌ **Real-time Limitations**
- Realtime uses PostgreSQL CDC (more server overhead)
- Performance degrades with very large tables
- Must carefully tune RLS policies for performance

❌ **Chrome Extension Support**
- Not "officially" supported (but works fine)
- Less documentation for extension-specific use cases

#### Technical Implementation

```javascript
// Initialize Supabase
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://your-project.supabase.co',
  'your-anon-key'
);

// Authentication
async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  return data.user;
}

// Real-time sync for bookmarks
function syncBookmarks(userId) {
  const channel = supabase
    .channel('bookmarks-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'bookmarks',
        filter: `user_id=eq.${userId}`
      },
      (payload) => {
        console.log('Change received!', payload);
        // Update local IndexedDB
      }
    )
    .subscribe();

  return channel;
}

// Query with SQL-like syntax
async function getActiveBookmarks(userId) {
  const { data, error } = await supabase
    .from('bookmarks')
    .select(`
      *,
      categories (name, color)
    `)
    .eq('user_id', userId)
    .eq('status', 'Active')
    .order('revisitBy', { ascending: true })
    .limit(50);

  return data;
}
```

#### Data Model (PostgreSQL Schema)

```sql
-- Users table (managed by Supabase Auth)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Settings table
CREATE TABLE settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  user_name TEXT,
  default_interval_days INT DEFAULT 7,
  priority_threshold_days INT DEFAULT 3,
  llm_gateway JSONB, -- Encrypted in app before storing
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Categories table
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- Bookmarks table
CREATE TABLE bookmarks (
  id TEXT PRIMARY KEY, -- Keep existing 'rv-' prefixed IDs
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  category_id UUID REFERENCES categories(id),
  summary TEXT,
  tags TEXT[],
  user_notes TEXT,
  status TEXT DEFAULT 'Active',
  revisit_by TIMESTAMP,
  added_timestamp TIMESTAMP DEFAULT NOW(),
  is_youtube BOOLEAN DEFAULT FALSE,
  history JSONB DEFAULT '[]',
  CONSTRAINT valid_status CHECK (status IN ('Active', 'ReVisited', 'Complete'))
);

-- Transcripts table
CREATE TABLE transcripts (
  video_id TEXT PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  raw TEXT,
  formatted TEXT,
  metadata JSONB,
  retrieved_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_bookmarks_user_id ON bookmarks(user_id);
CREATE INDEX idx_bookmarks_category ON bookmarks(category_id);
CREATE INDEX idx_bookmarks_status ON bookmarks(status);
CREATE INDEX idx_bookmarks_revisit_by ON bookmarks(revisit_by);

-- Row-Level Security (RLS) policies
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only see their own bookmarks"
  ON bookmarks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own bookmarks"
  ON bookmarks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bookmarks"
  ON bookmarks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bookmarks"
  ON bookmarks FOR DELETE
  USING (auth.uid() = user_id);
```

#### Migration Effort
- **Complexity:** Medium
- **Time Estimate:** 2-4 weeks
- **Skills Needed:** JavaScript, SQL, PostgreSQL basics
- **Risk:** Low-Medium (newer platform, but well-documented)

---

### Option 3: AWS Amplify (Amazon)

**Architecture:**
- Authentication: Amazon Cognito
- Database: AWS AppSync (GraphQL) + DynamoDB
- Storage: Amazon S3
- API: AWS AppSync or API Gateway + Lambda

#### Benefits

✅ **Enterprise Scale**
- Battle-tested by massive companies
- Unlimited scalability
- 99.99% SLA for most services

✅ **GraphQL API**
- Auto-generated GraphQL API from schema
- Real-time subscriptions built-in
- Efficient data fetching (request only what you need)

✅ **AWS Ecosystem Integration**
- Easy to add Lambda functions for AI processing
- S3 for transcript storage (cheap: $0.023/GB/month)
- CloudWatch for monitoring and logging
- SageMaker for future ML features

✅ **Fine-Grained Control**
- Complete control over infrastructure
- Custom business logic via Lambda
- VPC for additional security

✅ **Generous Free Tier**
- Cognito: 50,000 MAUs free
- DynamoDB: 25GB storage, 25 read/write units
- Lambda: 1M requests/month
- S3: 5GB storage

#### Downsides

❌ **Complexity**
- Steeper learning curve (IAM, CloudFormation, etc.)
- More moving parts (Cognito + AppSync + DynamoDB + S3)
- Amplify CLI can be confusing for beginners

❌ **DynamoDB Limitations**
- NoSQL database (no JOINs, limited queries)
- Must design for access patterns upfront
- Secondary indexes cost extra

❌ **GraphQL Overhead**
- Must learn GraphQL (queries, mutations, subscriptions)
- Schema management adds complexity
- Debugging is harder than REST

❌ **Cost Unpredictability**
- Many services = many line items
- Can get expensive if misconfigured
- Requires cost monitoring and alerts

❌ **Developer Experience**
- Not as polished as Firebase or Supabase
- More boilerplate code
- Longer setup time

#### Technical Implementation

```javascript
// Initialize Amplify
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/api';
import { signIn } from 'aws-amplify/auth';

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: 'us-east-1_XXXXXXXX',
      userPoolClientId: 'XXXXXXXXXXXXXXXXXXXXXXXXXX'
    }
  },
  API: {
    GraphQL: {
      endpoint: 'https://XXXXX.appsync-api.us-east-1.amazonaws.com/graphql',
      region: 'us-east-1',
      defaultAuthMode: 'userPool'
    }
  }
});

const client = generateClient();

// GraphQL schema
const createBookmark = /* GraphQL */ `
  mutation CreateBookmark($input: CreateBookmarkInput!) {
    createBookmark(input: $input) {
      id
      url
      title
      category
      summary
      tags
      status
      revisitBy
    }
  }
`;

// Real-time subscription
const onBookmarkChange = /* GraphQL */ `
  subscription OnBookmarkChange($userId: ID!) {
    onBookmarkChange(userId: $userId) {
      id
      url
      title
      status
    }
  }
`;

async function subscribeToBookmarks(userId) {
  const subscription = client.graphql({
    query: onBookmarkChange,
    variables: { userId }
  }).subscribe({
    next: ({ data }) => {
      console.log('Bookmark changed:', data);
      // Update local IndexedDB
    },
    error: (error) => console.error(error)
  });

  return subscription;
}
```

#### Data Model (DynamoDB)

```javascript
// Single-table design for DynamoDB
{
  PK: "USER#<userId>",
  SK: "PROFILE",
  email: "user@example.com",
  userName: "John Doe",
  createdAt: "2024-11-28T00:00:00Z"
}

{
  PK: "USER#<userId>",
  SK: "BOOKMARK#<bookmarkId>",
  url: "https://...",
  title: "...",
  category: "Tech",
  summary: "...",
  tags: ["ai", "ml"],
  status: "Active",
  revisitBy: "2024-12-05T00:00:00Z",
  addedTimestamp: "2024-11-28T10:00:00Z",
  GSI1PK: "USER#<userId>#CATEGORY#Tech", // Global Secondary Index for category queries
  GSI1SK: "BOOKMARK#<bookmarkId>"
}

{
  PK: "USER#<userId>",
  SK: "TRANSCRIPT#<videoId>",
  raw: "...",
  formatted: "...",
  metadata: { ... },
  retrievedAt: "2024-11-28T10:00:00Z"
}
```

#### Migration Effort
- **Complexity:** High
- **Time Estimate:** 4-6 weeks
- **Skills Needed:** JavaScript, GraphQL, DynamoDB, AWS basics
- **Risk:** Medium (complex setup, but enterprise-proven)

---

### Option 4: Custom Backend (Node.js + PostgreSQL + Redis)

**Architecture:**
- Authentication: Passport.js or Auth0
- Database: PostgreSQL (self-hosted or managed)
- Cache: Redis (for session management)
- API: Express.js (REST or GraphQL)
- Real-time: Socket.io or Server-Sent Events (SSE)
- Hosting: Railway, Render, Fly.io, or AWS EC2

#### Benefits

✅ **Complete Control**
- Full control over data model, business logic, and infrastructure
- No vendor lock-in (use standard technologies)
- Can switch hosting providers anytime

✅ **Cost Efficiency at Scale**
- $5-10/month for small VPS can handle 1000+ users
- No per-request or per-read charges
- Predictable monthly cost

✅ **Flexibility**
- Use any database (PostgreSQL, MySQL, MongoDB)
- Use any auth provider (Auth0, OAuth, custom)
- Add custom AI processing logic easily

✅ **Learning & Ownership**
- Deepest understanding of system architecture
- Easier to debug and optimize
- Full access to logs and metrics

✅ **Privacy Control**
- Data stays where you want it
- Full GDPR/CCPA compliance control
- Can encrypt everything end-to-end

#### Downsides

❌ **Development Time**
- Must build everything from scratch
- Auth, API, database schema, real-time sync
- 4-8 weeks of development

❌ **Maintenance Burden**
- Must manage servers, updates, backups
- Security patches are your responsibility
- Must handle scaling manually

❌ **DevOps Skills Required**
- Database management (PostgreSQL)
- Server provisioning and monitoring
- SSL certificates, DNS, load balancing

❌ **No Automatic Scaling**
- Must provision servers for peak load
- Scaling requires manual intervention
- Harder to handle traffic spikes

❌ **Higher Initial Risk**
- More code = more potential bugs
- Must implement security best practices yourself
- Requires thorough testing

#### Technical Implementation

```javascript
// Express.js API server
const express = require('express');
const { Pool } = require('pg');
const passport = require('passport');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const redis = require('redis');
const { Server } = require('socket.io');

const app = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const redisClient = redis.createClient({ url: process.env.REDIS_URL });
const io = new Server(server, {
  cors: { origin: 'chrome-extension://YOUR_EXTENSION_ID' }
});

// Session management
app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: true, maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
}));

app.use(passport.initialize());
app.use(passport.session());

// Authentication middleware
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// REST API endpoints
app.get('/api/bookmarks', isAuthenticated, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM bookmarks WHERE user_id = $1 ORDER BY revisit_by ASC',
    [req.user.id]
  );
  res.json(rows);
});

app.post('/api/bookmarks', isAuthenticated, async (req, res) => {
  const { id, url, title, category, summary, tags, status, revisitBy } = req.body;

  const { rows } = await pool.query(
    `INSERT INTO bookmarks (id, user_id, url, title, category, summary, tags, status, revisit_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [id, req.user.id, url, title, category, summary, tags, status, revisitBy]
  );

  // Broadcast to user's connected clients
  io.to(`user:${req.user.id}`).emit('bookmark:created', rows[0]);

  res.json(rows[0]);
});

// Real-time sync with Socket.io
io.on('connection', (socket) => {
  const userId = socket.handshake.auth.userId;

  // Join user-specific room
  socket.join(`user:${userId}`);

  // Listen for bookmark updates from client
  socket.on('bookmark:update', async (bookmark) => {
    // Update database
    await pool.query(
      'UPDATE bookmarks SET status = $1, user_notes = $2 WHERE id = $3 AND user_id = $4',
      [bookmark.status, bookmark.userNotes, bookmark.id, userId]
    );

    // Broadcast to other clients
    socket.to(`user:${userId}`).emit('bookmark:updated', bookmark);
  });
});

app.listen(3000, () => console.log('Server running on port 3000'));
```

#### Data Model
Same PostgreSQL schema as Supabase (Option 2)

#### Hosting Options

| Provider | Cost | Pros | Cons |
|----------|------|------|------|
| **Railway** | $5-20/month | Easy deployment, built-in PostgreSQL & Redis | Limited free tier |
| **Render** | $7-25/month | Simple pricing, auto-scaling | Slower cold starts |
| **Fly.io** | $0-15/month | Global edge deployment, generous free tier | Steeper learning curve |
| **DigitalOcean** | $6-18/month | Simple VPS, predictable pricing | Manual setup required |
| **AWS EC2** | $5-50/month | Full control, integrates with AWS services | Complex setup and billing |

#### Migration Effort
- **Complexity:** Very High
- **Time Estimate:** 6-10 weeks
- **Skills Needed:** Node.js, PostgreSQL, Redis, Socket.io, DevOps, security
- **Risk:** High (many moving parts, requires ongoing maintenance)

---

### Option 5: Hybrid (IndexedDB + PocketBase)

**Architecture:**
- Local: IndexedDB for offline-first storage
- Sync: PocketBase (open-source backend, single executable)
- Authentication: PocketBase Auth (email, OAuth2)
- Real-time: Server-Sent Events (SSE)
- Hosting: Self-host on $5 VPS or use PocketHost ($5-15/month)

#### Benefits

✅ **Offline-First**
- All data in IndexedDB for instant access
- Works without internet connection
- Sync only when online (like Notion)

✅ **Simplicity**
- PocketBase is a single Go binary (~10MB)
- No complex setup (no Docker, no separate database)
- Built-in admin UI for managing data

✅ **Cost Efficient**
- Free to self-host on any $5 VPS
- No per-request pricing
- Embedded SQLite database (no separate DB server)

✅ **Developer Experience**
- Auto-generated REST API from schema
- Real-time subscriptions via SSE
- JavaScript SDK included
- File upload support

✅ **Flexibility**
- Can migrate to PostgreSQL later if needed
- Open source (can fork and modify)
- Easy to backup (single SQLite file)

✅ **Good for MVPs**
- Fastest time to market (1-2 weeks)
- Minimal infrastructure
- Easy to iterate and experiment

#### Downsides

❌ **SQLite Limitations**
- Not ideal for high concurrency (>1000 concurrent writes/sec)
- Single server (no horizontal scaling)
- Max ~281TB database size (impractical to reach)

❌ **Smaller Community**
- Less mature than Firebase/Supabase (founded 2022)
- Fewer integrations and tutorials
- Smaller ecosystem

❌ **Self-Hosting Required (sort of)**
- Must run PocketBase somewhere (VPS or PocketHost)
- No fully-managed SaaS option from creators
- Backups are manual (copy SQLite file)

❌ **Real-time Limitations**
- SSE is one-way (server to client)
- Not as sophisticated as Firebase or Supabase
- Must poll or use SSE for updates

#### Technical Implementation

```javascript
// Initialize PocketBase client
import PocketBase from 'pocketbase';

const pb = new PocketBase('https://your-app.pockethost.io');

// Authentication
async function signIn(email, password) {
  const authData = await pb.collection('users').authWithPassword(email, password);
  return authData.record;
}

// CRUD operations
async function createBookmark(bookmark) {
  const record = await pb.collection('bookmarks').create({
    ...bookmark,
    user: pb.authStore.model.id
  });

  // Save to local IndexedDB
  await saveToIndexedDB('bookmarks', record);

  return record;
}

// Real-time sync with SSE
pb.collection('bookmarks').subscribe('*', function (e) {
  console.log('Bookmark changed:', e.action, e.record);

  if (e.action === 'create') {
    saveToIndexedDB('bookmarks', e.record);
  } else if (e.action === 'update') {
    updateInIndexedDB('bookmarks', e.record);
  } else if (e.action === 'delete') {
    deleteFromIndexedDB('bookmarks', e.record.id);
  }
});

// Offline-first: Read from IndexedDB
async function getBookmarks() {
  // Always read from local IndexedDB for instant access
  const bookmarks = await getAllFromIndexedDB('bookmarks');

  // Sync in background if online
  if (navigator.onLine) {
    syncFromServer();
  }

  return bookmarks;
}

// Background sync
async function syncFromServer() {
  const lastSync = await getLastSyncTime();

  const records = await pb.collection('bookmarks').getFullList({
    filter: `updated >= '${lastSync}'`,
    sort: '-updated'
  });

  for (const record of records) {
    await saveToIndexedDB('bookmarks', record);
  }

  await setLastSyncTime(new Date().toISOString());
}
```

#### Data Model (PocketBase Collections)

```javascript
// users collection (built-in, auto-created)
{
  id: "RECORD_ID",
  email: "user@example.com",
  username: "johndoe",
  verified: true,
  created: "2024-11-28 10:00:00.000Z",
  updated: "2024-11-28 10:00:00.000Z"
}

// settings collection
{
  id: "RECORD_ID",
  user: "USER_ID", // Relation to users
  userName: "John Doe",
  defaultIntervalDays: 7,
  priorityThresholdDays: 3,
  llmGateway: {...}, // JSON field (encrypted before storing)
  created: "2024-11-28 10:00:00.000Z",
  updated: "2024-11-28 10:00:00.000Z"
}

// bookmarks collection
{
  id: "RECORD_ID",
  rvId: "rv-1732800000-abc123", // Keep original ID for compatibility
  user: "USER_ID", // Relation to users
  url: "https://...",
  title: "...",
  category: "Tech",
  summary: "...",
  tags: ["ai", "ml"], // JSON field
  userNotes: "...",
  status: "Active", // Select field: Active, ReVisited, Complete
  revisitBy: "2024-12-05 00:00:00.000Z",
  addedTimestamp: "2024-11-28 10:00:00.000Z",
  isYouTube: false,
  history: [...], // JSON field
  created: "2024-11-28 10:00:00.000Z",
  updated: "2024-11-28 10:00:00.000Z"
}

// transcripts collection
{
  id: "RECORD_ID",
  videoId: "dQw4w9WgXcQ",
  user: "USER_ID",
  raw: "...", // Text field
  formatted: "...", // Text field
  metadata: {...}, // JSON field
  retrievedAt: "2024-11-28 10:00:00.000Z",
  created: "2024-11-28 10:00:00.000Z",
  updated: "2024-11-28 10:00:00.000Z"
}
```

#### Schema Definition (PocketBase Admin UI)

```javascript
// Example: bookmarks collection schema
{
  name: "bookmarks",
  type: "base",
  schema: [
    { name: "rvId", type: "text", required: true },
    { name: "user", type: "relation", required: true, options: { collectionId: "_pb_users_auth_", maxSelect: 1 } },
    { name: "url", type: "url", required: true },
    { name: "title", type: "text", required: true },
    { name: "category", type: "text" },
    { name: "summary", type: "text" },
    { name: "tags", type: "json" },
    { name: "userNotes", type: "text" },
    { name: "status", type: "select", options: { values: ["Active", "ReVisited", "Complete"] } },
    { name: "revisitBy", type: "date" },
    { name: "addedTimestamp", type: "date" },
    { name: "isYouTube", type: "bool" },
    { name: "history", type: "json" }
  ],
  indexes: [
    "CREATE INDEX idx_bookmarks_user ON bookmarks(user)",
    "CREATE INDEX idx_bookmarks_status ON bookmarks(status)",
    "CREATE INDEX idx_bookmarks_revisitBy ON bookmarks(revisitBy)"
  ],
  listRule: "@request.auth.id = user",
  viewRule: "@request.auth.id = user",
  createRule: "@request.auth.id = user",
  updateRule: "@request.auth.id = user",
  deleteRule: "@request.auth.id = user"
}
```

#### Migration Effort
- **Complexity:** Low-Medium
- **Time Estimate:** 1-3 weeks
- **Skills Needed:** JavaScript, basic SQL, IndexedDB
- **Risk:** Low (simple architecture, easy to rollback)

---

## Side-by-Side Comparison

| Criteria | Firebase | Supabase | AWS Amplify | Custom Backend | PocketBase |
|----------|----------|----------|-------------|----------------|------------|
| **Setup Time** | 1-2 weeks | 2-3 weeks | 4-6 weeks | 6-10 weeks | 1-2 weeks |
| **Learning Curve** | Low | Low-Medium | High | Very High | Low |
| **Monthly Cost (100 users)** | $20-50 | $0-25 | $10-30 | $5-15 | $0-10 |
| **Monthly Cost (1000 users)** | $100-300 | $25-75 | $50-150 | $15-50 | $10-25 |
| **Vendor Lock-in** | High | Low | High | None | Low |
| **Real-time Sync** | Excellent | Excellent | Good | Good | Fair |
| **Offline Support** | Excellent | Good | Fair | Custom | Excellent |
| **Scalability** | Unlimited | High | Unlimited | Manual | Medium |
| **Mobile SDKs** | Yes (official) | Yes (official) | Yes (official) | DIY | Yes (community) |
| **SQL Support** | No (NoSQL) | Yes (PostgreSQL) | No (DynamoDB) | Yes (any DB) | Yes (SQLite) |
| **Privacy Control** | Low | Medium | Medium | High | High |
| **Maintenance** | None | Low | Low | High | Low-Medium |
| **Community Support** | Excellent | Good | Good | N/A | Fair |
| **Best For** | Quick MVP, mobile-first | Startups, SQL needs | Enterprise, AWS shops | Full control, learning | Side projects, MVPs |

---

## Recommendations

### For Quick Launch (1-2 months)
**Recommendation:** PocketBase (Option 5) or Firebase (Option 1)

**Rationale:**
- PocketBase if you want offline-first, low cost, and simplicity
- Firebase if you need proven scale and best mobile SDKs

**Path:**
1. Migrate local storage to IndexedDB (1 week)
2. Set up PocketBase or Firebase (1-2 days)
3. Implement auth flow (3-4 days)
4. Add sync logic (5-7 days)
5. Test and refine (3-5 days)

### For Long-Term Product (3-6 months)
**Recommendation:** Supabase (Option 2)

**Rationale:**
- Best balance of features, cost, and flexibility
- SQL database enables future AI features (complex queries)
- No vendor lock-in (can self-host or migrate)
- Excellent DX and documentation

**Path:**
1. Set up Supabase project (1 day)
2. Design PostgreSQL schema (2-3 days)
3. Implement auth flow (3-5 days)
4. Migrate local storage to IndexedDB (1 week)
5. Add sync logic with conflict resolution (1-2 weeks)
6. Implement RLS policies for security (2-3 days)
7. Build mobile app with same backend (future)

### For Enterprise/Learning
**Recommendation:** Custom Backend (Option 4)

**Rationale:**
- Deepest learning experience
- Full control over costs and features
- Best for portfolio/resume building

**Path:**
1. Set up Express.js + PostgreSQL (1 week)
2. Implement auth with Passport.js or Auth0 (1 week)
3. Build REST API (1-2 weeks)
4. Add real-time sync with Socket.io (1 week)
5. Deploy to Railway or Render (3-5 days)
6. Monitor and optimize (ongoing)

---

## Migration Strategy (Any Option)

### Phase 1: Dual-Write (Weeks 1-2)
- Keep chrome.storage.local as primary
- Write to cloud (Firebase/Supabase/etc.) in parallel
- Read from local only
- Monitor for errors

### Phase 2: Dual-Read (Weeks 3-4)
- Read from both local and cloud
- Compare results for inconsistencies
- Use cloud as source of truth for conflicts
- Log discrepancies

### Phase 3: Cloud-First (Weeks 5-6)
- Read from cloud first
- Use local as fallback if offline
- Migrate all existing users
- Monitor performance

### Phase 4: Local Cache Only (Week 7+)
- Cloud is source of truth
- Local storage is cache only
- Remove chrome.storage.local dependency
- Full IndexedDB + cloud sync

---

## Security Considerations (All Options)

### Must-Have
- **Encrypt API keys:** Never store LLM Gateway API key in plaintext
- **Use HTTPS:** All API calls must be encrypted in transit
- **Validate inputs:** Sanitize all user input (XSS, SQL injection)
- **Rate limiting:** Prevent abuse of API endpoints
- **Session management:** Use secure, HTTP-only cookies

### Nice-to-Have
- **End-to-end encryption:** Encrypt user notes before sending to server
- **2FA:** Two-factor authentication for accounts
- **Audit logs:** Track all data access and modifications
- **GDPR compliance:** User data export and deletion
- **SOC2 compliance:** For enterprise customers (future)

---

## Next Steps

1. **Review this document** and decide on preferred option
2. **Prototype** chosen solution (1-2 week spike)
3. **Review mobile app vision** (see `mobile-app-vision.md`)
4. **Review AI features roadmap** (see `ai-features-roadmap.md`)
5. **Create migration plan** (see `architecture-migration-guide.md`)
6. **Start implementation** with Phase 1 (dual-write)

---

## Questions to Consider

- How many users do you expect in Year 1? Year 2?
- What's your budget for infrastructure?
- Do you want to learn backend development or focus on features?
- How important is data privacy to your users?
- Will you monetize via subscriptions or one-time purchases?
- Do you need enterprise features (SSO, compliance, etc.)?

---

**Document End**
