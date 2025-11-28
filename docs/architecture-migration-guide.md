# Architecture Migration Guide: From Local Storage to Cloud Sync

**Document Status:** Draft
**Last Updated:** 2025-11-28
**Purpose:** Step-by-step guide for migrating ReVisit from chrome.storage.local to cloud-synced architecture

---

## Executive Summary

This document provides a practical migration plan to transform ReVisit from a local-only browser extension to a cloud-synced, multi-device application with user authentication.

**Migration Goals:**
1. **Zero data loss:** Preserve all existing user data during migration
2. **Backward compatibility:** Support users on old versions during transition
3. **Gradual rollout:** Minimize risk with phased deployment
4. **Performance:** Maintain or improve extension responsiveness
5. **Privacy:** Protect user data throughout the process

**Timeline:** 3-6 months (depending on chosen backend)

---

## Current Architecture Overview

### Data Flow (Current State)

```
┌──────────────────────────────────────────────────────────┐
│                     Browser Extension                     │
│                                                            │
│  ┌──────────┐      ┌──────────────┐      ┌────────────┐  │
│  │ Content  │─────►│  Background  │─────►│   Popup    │  │
│  │ Script   │      │  Service     │      │   & UI     │  │
│  │          │◄─────│  Worker      │◄─────│            │  │
│  └──────────┘      └──────┬───────┘      └────────────┘  │
│                           │                               │
│                           │ Read/Write                    │
│                           ▼                               │
│                  ┌─────────────────┐                      │
│                  │ chrome.storage  │                      │
│                  │    .local       │                      │
│                  │   (10MB max)    │                      │
│                  └─────────────────┘                      │
│                                                            │
│  Data Structure:                                          │
│  • rvData: { bookmarks, categories, settings }            │
│  • rvTranscripts: { [videoId]: transcript }               │
└──────────────────────────────────────────────────────────┘
```

**Key Characteristics:**
- All data local to single browser
- No user authentication
- No cross-device sync
- Fast (in-memory access)
- Limited to 10MB storage
- Manual backup/restore via JSON export

---

## Target Architecture Overview

### Data Flow (Target State)

```
┌──────────────────────────────────────────────────────────┐
│                     Browser Extension                     │
│                                                            │
│  ┌──────────┐      ┌──────────────┐      ┌────────────┐  │
│  │ Content  │─────►│  Background  │─────►│   Popup    │  │
│  │ Script   │      │  Service     │      │   & UI     │  │
│  │          │◄─────│  Worker      │◄─────│            │  │
│  └──────────┘      └──────┬───────┘      └────────────┘  │
│                           │                               │
│                           │                               │
│                           ▼                               │
│                  ┌─────────────────┐                      │
│                  │   Data Layer    │                      │
│                  │   (Abstraction) │                      │
│                  └────────┬────────┘                      │
│                           │                               │
│                  ┌────────┴────────┐                      │
│                  │                 │                      │
│                  ▼                 ▼                      │
│         ┌────────────────┐  ┌──────────────┐             │
│         │   IndexedDB    │  │ Sync Service │             │
│         │ (Offline-first)│◄─┤  (Queue &    │             │
│         │                │  │   Conflict   │             │
│         │                │  │  Resolution) │             │
│         └────────────────┘  └──────┬───────┘             │
│                                    │                     │
└────────────────────────────────────┼─────────────────────┘
                                     │ HTTPS/WSS
                                     │ (Auth tokens)
                                     ▼
                    ┌─────────────────────────────┐
                    │     Cloud Backend           │
                    │   (Firebase/Supabase)       │
                    │                             │
                    │  ┌────────┐  ┌───────────┐  │
                    │  │  Auth  │  │ Database  │  │
                    │  │        │  │           │  │
                    │  └────────┘  └───────────┘  │
                    │                             │
                    │  ┌────────┐  ┌───────────┐  │
                    │  │Storage │  │ Real-time │  │
                    │  │        │  │   Sync    │  │
                    │  └────────┘  └───────────┘  │
                    └─────────────────────────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    │                                 │
                    ▼                                 ▼
          ┌──────────────────┐            ┌──────────────────┐
          │   Mobile App     │            │  Other Devices   │
          │  (iOS/Android)   │            │  (Laptop, etc.)  │
          └──────────────────┘            └──────────────────┘
```

**Key Characteristics:**
- User authentication (email, OAuth)
- Real-time or near-real-time sync across devices
- Offline-first (local IndexedDB cache)
- Conflict resolution for concurrent edits
- Unlimited storage (cloud-based)
- Privacy-focused (encrypted sensitive data)

---

## Migration Strategy: 4-Phase Approach

### Overview

| Phase | Duration | Risk | Description |
|-------|----------|------|-------------|
| **Phase 0: Preparation** | 2-4 weeks | Low | Setup infrastructure, create data layer abstraction |
| **Phase 1: Dual-Write** | 2-3 weeks | Low | Write to both local and cloud, read from local only |
| **Phase 2: Dual-Read** | 2-3 weeks | Medium | Read from cloud, verify against local, log discrepancies |
| **Phase 3: Cloud-First** | 2-3 weeks | Medium | Cloud is primary, local is cache/fallback |
| **Phase 4: Cleanup** | 1-2 weeks | Low | Remove old code, migrate all users, deprecate local-only |

**Total Timeline:** 9-15 weeks (2-4 months)

---

## Phase 0: Preparation

**Goal:** Set up infrastructure and abstract data layer without changing user-facing behavior.

### Tasks

#### 1. Choose Backend (Week 1)

Based on `storage-solutions-analysis.md`, make a decision:

**Recommended:** Supabase (best balance of features, cost, and flexibility)

**Setup Checklist:**
- [ ] Create Supabase project
- [ ] Set up PostgreSQL schema (see schema below)
- [ ] Configure Row-Level Security (RLS) policies
- [ ] Set up authentication (email + Google OAuth)
- [ ] Test API access from extension
- [ ] Set up development, staging, and production environments

---

#### 2. Design Database Schema (Week 1)

**PostgreSQL Schema (Supabase):**

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (managed by Supabase Auth, extend if needed)
-- This table is auto-created by Supabase Auth

-- User profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  user_name TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Settings table
CREATE TABLE settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  default_interval_days INT DEFAULT 7,
  priority_threshold_days INT DEFAULT 3,
  llm_gateway_config JSONB, -- Store encrypted in application
  onboarding_complete BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Categories table
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT, -- Future: custom category colors
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- Bookmarks table
CREATE TABLE bookmarks (
  id TEXT PRIMARY KEY, -- Keep existing 'rv-XXXXX' format
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  summary TEXT,
  tags TEXT[] DEFAULT '{}',
  user_notes TEXT,
  status TEXT DEFAULT 'Active' CHECK (status IN ('Active', 'ReVisited', 'Complete')),
  revisit_by TIMESTAMP,
  added_timestamp TIMESTAMP DEFAULT NOW(),
  is_youtube BOOLEAN DEFAULT FALSE,
  is_preliminary BOOLEAN DEFAULT FALSE,
  history JSONB DEFAULT '[]',

  -- Metadata for sync
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP, -- Soft delete for conflict resolution

  -- Version for optimistic locking
  version INT DEFAULT 1
);

-- Transcripts table
CREATE TABLE transcripts (
  video_id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  raw TEXT,
  formatted TEXT,
  metadata JSONB,
  retrieved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_bookmarks_user_id ON bookmarks(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_bookmarks_category_id ON bookmarks(category_id);
CREATE INDEX idx_bookmarks_status ON bookmarks(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_bookmarks_revisit_by ON bookmarks(revisit_by) WHERE deleted_at IS NULL;
CREATE INDEX idx_bookmarks_updated_at ON bookmarks(updated_at);
CREATE INDEX idx_categories_user_id ON categories(user_id);
CREATE INDEX idx_transcripts_user_id ON transcripts(user_id);

-- Row-Level Security (RLS) Policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Settings policies
CREATE POLICY "Users can view own settings" ON settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own settings" ON settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own settings" ON settings FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Categories policies
CREATE POLICY "Users can view own categories" ON categories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own categories" ON categories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own categories" ON categories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own categories" ON categories FOR DELETE USING (auth.uid() = user_id);

-- Bookmarks policies
CREATE POLICY "Users can view own bookmarks" ON bookmarks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own bookmarks" ON bookmarks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own bookmarks" ON bookmarks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own bookmarks" ON bookmarks FOR DELETE USING (auth.uid() = user_id);

-- Transcripts policies
CREATE POLICY "Users can view own transcripts" ON transcripts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own transcripts" ON transcripts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own transcripts" ON transcripts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own transcripts" ON transcripts FOR DELETE USING (auth.uid() = user_id);

-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bookmarks_updated_at BEFORE UPDATE ON bookmarks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transcripts_updated_at BEFORE UPDATE ON transcripts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

#### 3. Create Data Layer Abstraction (Weeks 2-3)

**Goal:** Create a unified API for data access that can switch between local and cloud.

**New File: `data-layer.js`**

```javascript
/**
 * Data Layer Abstraction
 * Provides unified interface for data access across local and cloud storage
 */

// Storage backends
const STORAGE_BACKEND = {
  LOCAL: 'local',
  CLOUD: 'cloud',
  HYBRID: 'hybrid'
};

class DataLayer {
  constructor() {
    this.backend = STORAGE_BACKEND.LOCAL; // Default to local
    this.syncEnabled = false;
    this.userId = null;
  }

  /**
   * Initialize data layer
   * @param {string} backend - STORAGE_BACKEND.LOCAL, CLOUD, or HYBRID
   * @param {string} userId - User ID for cloud storage
   */
  async initialize(backend = STORAGE_BACKEND.LOCAL, userId = null) {
    this.backend = backend;
    this.userId = userId;

    if (backend === STORAGE_BACKEND.CLOUD || backend === STORAGE_BACKEND.HYBRID) {
      if (!userId) {
        throw new Error('User ID required for cloud storage');
      }
      await this._initializeCloudConnection();
    }

    // Initialize IndexedDB for local or hybrid mode
    if (backend === STORAGE_BACKEND.LOCAL || backend === STORAGE_BACKEND.HYBRID) {
      await this._initializeIndexedDB();
    }
  }

  /**
   * Get all bookmarks
   * @returns {Promise<Array>}
   */
  async getBookmarks() {
    switch (this.backend) {
      case STORAGE_BACKEND.LOCAL:
        return this._getBookmarksLocal();
      case STORAGE_BACKEND.CLOUD:
        return this._getBookmarksCloud();
      case STORAGE_BACKEND.HYBRID:
        return this._getBookmarksHybrid();
      default:
        throw new Error('Unknown storage backend');
    }
  }

  /**
   * Save a bookmark
   * @param {Object} bookmark
   * @returns {Promise<Object>}
   */
  async saveBookmark(bookmark) {
    switch (this.backend) {
      case STORAGE_BACKEND.LOCAL:
        return this._saveBookmarkLocal(bookmark);
      case STORAGE_BACKEND.CLOUD:
        return this._saveBookmarkCloud(bookmark);
      case STORAGE_BACKEND.HYBRID:
        return this._saveBookmarkHybrid(bookmark);
      default:
        throw new Error('Unknown storage backend');
    }
  }

  /**
   * Update a bookmark
   * @param {string} id
   * @param {Object} updates
   * @returns {Promise<Object>}
   */
  async updateBookmark(id, updates) {
    switch (this.backend) {
      case STORAGE_BACKEND.LOCAL:
        return this._updateBookmarkLocal(id, updates);
      case STORAGE_BACKEND.CLOUD:
        return this._updateBookmarkCloud(id, updates);
      case STORAGE_BACKEND.HYBRID:
        return this._updateBookmarkHybrid(id, updates);
      default:
        throw new Error('Unknown storage backend');
    }
  }

  /**
   * Delete a bookmark
   * @param {string} id
   * @returns {Promise<void>}
   */
  async deleteBookmark(id) {
    switch (this.backend) {
      case STORAGE_BACKEND.LOCAL:
        return this._deleteBookmarkLocal(id);
      case STORAGE_BACKEND.CLOUD:
        return this._deleteBookmarkCloud(id);
      case STORAGE_BACKEND.HYBRID:
        return this._deleteBookmarkHybrid(id);
      default:
        throw new Error('Unknown storage backend');
    }
  }

  // Similar methods for categories, settings, transcripts...

  // ==================== LOCAL STORAGE METHODS ====================

  async _getBookmarksLocal() {
    // Read from chrome.storage.local (existing implementation)
    const data = await chrome.storage.local.get('rvData');
    return data.rvData?.bookmarks || [];
  }

  async _saveBookmarkLocal(bookmark) {
    const data = await chrome.storage.local.get('rvData');
    const rvData = data.rvData || { bookmarks: [], categories: [], settings: {} };
    rvData.bookmarks.push(bookmark);
    await chrome.storage.local.set({ rvData });
    return bookmark;
  }

  async _updateBookmarkLocal(id, updates) {
    const data = await chrome.storage.local.get('rvData');
    const rvData = data.rvData || { bookmarks: [], categories: [], settings: {} };
    const index = rvData.bookmarks.findIndex(b => b.id === id);

    if (index === -1) {
      throw new Error(`Bookmark ${id} not found`);
    }

    rvData.bookmarks[index] = { ...rvData.bookmarks[index], ...updates };
    await chrome.storage.local.set({ rvData });
    return rvData.bookmarks[index];
  }

  async _deleteBookmarkLocal(id) {
    const data = await chrome.storage.local.get('rvData');
    const rvData = data.rvData || { bookmarks: [], categories: [], settings: {} };
    rvData.bookmarks = rvData.bookmarks.filter(b => b.id !== id);
    await chrome.storage.local.set({ rvData });
  }

  // ==================== CLOUD STORAGE METHODS ====================

  async _initializeCloudConnection() {
    // Initialize Supabase client
    const { createClient } = await import('@supabase/supabase-js');
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
  }

  async _getBookmarksCloud() {
    const { data, error } = await this.supabase
      .from('bookmarks')
      .select('*')
      .eq('user_id', this.userId)
      .is('deleted_at', null)
      .order('added_timestamp', { ascending: false });

    if (error) throw error;
    return data;
  }

  async _saveBookmarkCloud(bookmark) {
    const { data, error } = await this.supabase
      .from('bookmarks')
      .insert({
        ...bookmark,
        user_id: this.userId
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async _updateBookmarkCloud(id, updates) {
    const { data, error } = await this.supabase
      .from('bookmarks')
      .update(updates)
      .eq('id', id)
      .eq('user_id', this.userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async _deleteBookmarkCloud(id) {
    // Soft delete
    const { error } = await this.supabase
      .from('bookmarks')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', this.userId);

    if (error) throw error;
  }

  // ==================== HYBRID STORAGE METHODS ====================

  async _initializeIndexedDB() {
    // Open IndexedDB for local caching
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('ReVisitDB', 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Bookmarks store
        if (!db.objectStoreNames.contains('bookmarks')) {
          const bookmarksStore = db.createObjectStore('bookmarks', { keyPath: 'id' });
          bookmarksStore.createIndex('userId', 'user_id', { unique: false });
          bookmarksStore.createIndex('status', 'status', { unique: false });
          bookmarksStore.createIndex('revisitBy', 'revisit_by', { unique: false });
        }

        // Categories store
        if (!db.objectStoreNames.contains('categories')) {
          const categoriesStore = db.createObjectStore('categories', { keyPath: 'id' });
          categoriesStore.createIndex('userId', 'user_id', { unique: false });
        }

        // Settings store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'user_id' });
        }

        // Transcripts store
        if (!db.objectStoreNames.contains('transcripts')) {
          const transcriptsStore = db.createObjectStore('transcripts', { keyPath: 'video_id' });
          transcriptsStore.createIndex('userId', 'user_id', { unique: false });
        }

        // Sync queue store (for offline changes)
        if (!db.objectStoreNames.contains('syncQueue')) {
          const syncQueueStore = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
          syncQueueStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  async _getBookmarksHybrid() {
    // Read from local IndexedDB first (fast)
    const localBookmarks = await this._getBookmarksFromIndexedDB();

    // If offline, return local data
    if (!navigator.onLine) {
      return localBookmarks;
    }

    // If online, sync in background and return local data immediately
    this._syncFromCloud().catch(err => {
      console.error('Background sync failed:', err);
    });

    return localBookmarks;
  }

  async _getBookmarksFromIndexedDB() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['bookmarks'], 'readonly');
      const store = transaction.objectStore('bookmarks');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async _saveBookmarkHybrid(bookmark) {
    // Save to IndexedDB first (fast)
    await this._saveBookmarkToIndexedDB(bookmark);

    // If online, sync to cloud
    if (navigator.onLine) {
      try {
        await this._saveBookmarkCloud(bookmark);
      } catch (error) {
        console.error('Failed to save to cloud, queuing for later:', error);
        await this._queueForSync('create', 'bookmark', bookmark);
      }
    } else {
      // Queue for sync when back online
      await this._queueForSync('create', 'bookmark', bookmark);
    }

    return bookmark;
  }

  async _saveBookmarkToIndexedDB(bookmark) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['bookmarks'], 'readwrite');
      const store = transaction.objectStore('bookmarks');
      const request = store.put(bookmark);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async _queueForSync(operation, entityType, data) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['syncQueue'], 'readwrite');
      const store = transaction.objectStore('syncQueue');
      const request = store.add({
        operation, // 'create', 'update', 'delete'
        entityType, // 'bookmark', 'category', etc.
        data,
        timestamp: Date.now()
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async _syncFromCloud() {
    // Get last sync timestamp
    const lastSync = await this._getLastSyncTime();

    // Fetch changes from cloud since last sync
    const { data: changes, error } = await this.supabase
      .from('bookmarks')
      .select('*')
      .eq('user_id', this.userId)
      .gte('updated_at', lastSync)
      .order('updated_at', { ascending: true });

    if (error) throw error;

    // Apply changes to IndexedDB
    for (const bookmark of changes) {
      await this._saveBookmarkToIndexedDB(bookmark);
    }

    // Update last sync time
    await this._setLastSyncTime(new Date().toISOString());
  }

  async _getLastSyncTime() {
    const data = await chrome.storage.local.get('lastSyncTime');
    return data.lastSyncTime || new Date(0).toISOString(); // Epoch if never synced
  }

  async _setLastSyncTime(timestamp) {
    await chrome.storage.local.set({ lastSyncTime: timestamp });
  }

  // ... similar methods for update, delete in hybrid mode
}

// Export singleton instance
export const dataLayer = new DataLayer();
```

---

#### 4. Refactor Existing Code (Week 3-4)

**Goal:** Replace direct chrome.storage calls with data layer API.

**Files to Update:**
- `background.js` (8 storage operations)
- `list-modal.js` (4 storage operations)
- `onboarding.js` (1 storage operation)
- `popup.js` (1 storage operation)

**Example Refactor (background.js):**

**Before:**
```javascript
// Old code
async function getStorageData() {
  const data = await chrome.storage.local.get('rvData');
  return data.rvData || { bookmarks: [], categories: [], settings: {} };
}

async function saveStorageData(data) {
  await chrome.storage.local.set({ rvData: data });
}
```

**After:**
```javascript
import { dataLayer } from './data-layer.js';

// Initialize data layer on extension startup
chrome.runtime.onInstalled.addListener(async () => {
  await dataLayer.initialize('local'); // Start with local-only
});

// Use data layer API
async function getStorageData() {
  const bookmarks = await dataLayer.getBookmarks();
  const categories = await dataLayer.getCategories();
  const settings = await dataLayer.getSettings();
  return { bookmarks, categories, settings };
}

async function saveBookmark(bookmark) {
  await dataLayer.saveBookmark(bookmark);
}
```

---

#### 5. Add Authentication UI (Week 4)

**New File: `auth.html` & `auth.js`**

**auth.html:**
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ReVisit - Sign In</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="auth-container">
    <h1>Welcome to ReVisit</h1>
    <p>Sign in to sync your bookmarks across devices</p>

    <div id="auth-options">
      <!-- Email Sign In -->
      <div class="auth-method">
        <h3>Sign in with Email</h3>
        <input type="email" id="email" placeholder="your@email.com" />
        <input type="password" id="password" placeholder="Password" />
        <button id="sign-in-btn">Sign In</button>
        <button id="sign-up-btn">Sign Up</button>
      </div>

      <div class="divider">OR</div>

      <!-- OAuth Sign In -->
      <div class="auth-method">
        <button id="google-sign-in" class="oauth-btn">
          Sign in with Google
        </button>
      </div>
    </div>

    <div id="skip-signin">
      <a href="#" id="skip-link">Skip for now (local-only mode)</a>
    </div>

    <div id="error-message" class="error"></div>
  </div>

  <script src="auth.js"></script>
</body>
</html>
```

**auth.js:**
```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Email sign in
document.getElementById('sign-in-btn').addEventListener('click', async () => {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    document.getElementById('error-message').textContent = error.message;
  } else {
    // Store session and redirect
    await chrome.storage.local.set({ session: data.session });
    window.location.href = 'list-modal.html';
  }
});

// Email sign up
document.getElementById('sign-up-btn').addEventListener('click', async () => {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  const { data, error } = await supabase.auth.signUp({
    email,
    password
  });

  if (error) {
    document.getElementById('error-message').textContent = error.message;
  } else {
    document.getElementById('error-message').textContent = 'Check your email for verification link!';
  }
});

// Google OAuth
document.getElementById('google-sign-in').addEventListener('click', async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: chrome.runtime.getURL('list-modal.html')
    }
  });

  if (error) {
    document.getElementById('error-message').textContent = error.message;
  }
});

// Skip sign in (local-only mode)
document.getElementById('skip-link').addEventListener('click', async () => {
  await chrome.storage.local.set({ authMode: 'local' });
  window.location.href = 'list-modal.html';
});
```

---

### Phase 0 Deliverables

- [x] Supabase project created and configured
- [x] Database schema deployed
- [x] Data layer abstraction implemented
- [x] Existing code refactored to use data layer
- [x] Authentication UI created
- [x] All existing tests passing

**Validation:** Extension works exactly as before, no user-facing changes.

---

## Phase 1: Dual-Write

**Goal:** Write to both local and cloud storage, but read from local only. This validates cloud writes without risking data loss.

**Duration:** 2-3 weeks

### Tasks

#### 1. Enable Dual-Write Mode (Week 1)

**Update `data-layer.js`:**

```javascript
class DataLayer {
  constructor() {
    this.backend = STORAGE_BACKEND.LOCAL;
    this.dualWriteEnabled = false; // NEW: Enable dual-write mode
  }

  async enableDualWrite(userId) {
    this.dualWriteEnabled = true;
    this.userId = userId;
    await this._initializeCloudConnection();
    await this._initializeIndexedDB();
  }

  async saveBookmark(bookmark) {
    // Write to local first (fast, synchronous)
    await this._saveBookmarkLocal(bookmark);

    // If dual-write enabled, also write to cloud
    if (this.dualWriteEnabled) {
      try {
        await this._saveBookmarkCloud(bookmark);
        console.log('[Dual-Write] Successfully saved to cloud:', bookmark.id);
      } catch (error) {
        console.error('[Dual-Write] Failed to save to cloud:', error);
        // Log error but don't fail the operation
        await this._logDualWriteError('save', 'bookmark', bookmark.id, error);
      }
    }

    return bookmark;
  }

  async _logDualWriteError(operation, entityType, entityId, error) {
    // Log errors for monitoring
    const errorLog = await chrome.storage.local.get('dualWriteErrors') || { dualWriteErrors: [] };
    errorLog.dualWriteErrors.push({
      timestamp: Date.now(),
      operation,
      entityType,
      entityId,
      error: error.message
    });
    await chrome.storage.local.set(errorLog);
  }
}
```

---

#### 2. Migrate Existing Users to Cloud (Week 1-2)

**New File: `migration.js`**

```javascript
/**
 * Migrate user's local data to cloud
 */
export async function migrateUserToCloud(userId) {
  console.log('[Migration] Starting migration for user:', userId);

  // Get all local data
  const data = await chrome.storage.local.get(['rvData', 'rvTranscripts']);
  const { rvData, rvTranscripts } = data;

  if (!rvData) {
    console.log('[Migration] No local data found, skipping migration');
    return;
  }

  const { bookmarks, categories, settings } = rvData;

  try {
    // 1. Migrate settings
    console.log('[Migration] Migrating settings...');
    await dataLayer.saveSettings(userId, settings);

    // 2. Migrate categories
    console.log('[Migration] Migrating categories...', categories.length);
    for (const categoryName of categories) {
      await dataLayer.saveCategory(userId, { name: categoryName });
    }

    // 3. Migrate bookmarks
    console.log('[Migration] Migrating bookmarks...', bookmarks.length);
    for (const bookmark of bookmarks) {
      // Map category name to category ID
      const category = await dataLayer.getCategoryByName(userId, bookmark.category);
      const bookmarkWithUserId = {
        ...bookmark,
        user_id: userId,
        category_id: category?.id || null
      };
      await dataLayer.saveBookmark(bookmarkWithUserId);
    }

    // 4. Migrate transcripts
    if (rvTranscripts) {
      console.log('[Migration] Migrating transcripts...', Object.keys(rvTranscripts).length);
      for (const [videoId, transcript] of Object.entries(rvTranscripts)) {
        await dataLayer.saveTranscript(userId, { video_id: videoId, ...transcript });
      }
    }

    // 5. Mark migration as complete
    await chrome.storage.local.set({ migrationComplete: true, migratedAt: Date.now() });

    console.log('[Migration] Migration complete!');
  } catch (error) {
    console.error('[Migration] Migration failed:', error);
    throw error;
  }
}
```

**Trigger migration after sign-in (auth.js):**

```javascript
// After successful sign-in
const { data, error } = await supabase.auth.signInWithPassword({ email, password });

if (!error) {
  const userId = data.user.id;

  // Enable dual-write mode
  await dataLayer.enableDualWrite(userId);

  // Check if migration needed
  const { migrationComplete } = await chrome.storage.local.get('migrationComplete');

  if (!migrationComplete) {
    // Show migration UI
    showMigrationProgress();

    // Migrate data
    await migrateUserToCloud(userId);

    // Hide migration UI
    hideMigrationProgress();
  }

  // Redirect to main app
  window.location.href = 'list-modal.html';
}
```

---

#### 3. Monitor Dual-Write Errors (Week 2-3)

**Add monitoring dashboard to settings:**

```javascript
// In list-modal.js or settings panel

async function showDualWriteStats() {
  const { dualWriteErrors } = await chrome.storage.local.get('dualWriteErrors');

  if (!dualWriteErrors || dualWriteErrors.length === 0) {
    return 'No errors';
  }

  // Group errors by type
  const errorsByType = dualWriteErrors.reduce((acc, err) => {
    const key = `${err.operation}-${err.entityType}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  console.log('Dual-Write Errors:', errorsByType);

  // Show in UI
  document.getElementById('dual-write-stats').innerHTML = `
    <h4>Cloud Sync Errors (Dual-Write Phase)</h4>
    <ul>
      ${Object.entries(errorsByType).map(([type, count]) => `
        <li>${type}: ${count} errors</li>
      `).join('')}
    </ul>
    <p>Last error: ${new Date(dualWriteErrors[dualWriteErrors.length - 1].timestamp).toLocaleString()}</p>
  `;
}
```

---

### Phase 1 Deliverables

- [x] Dual-write mode implemented and tested
- [x] User migration script working
- [x] All new data written to both local and cloud
- [x] Error monitoring in place
- [x] <5% dual-write error rate

**Validation:** All signed-in users have data in cloud that matches local data.

---

## Phase 2: Dual-Read

**Goal:** Read from cloud, verify against local, log discrepancies. Cloud becomes source of truth but local is still fallback.

**Duration:** 2-3 weeks

### Tasks

#### 1. Enable Dual-Read Mode (Week 1)

**Update `data-layer.js`:**

```javascript
class DataLayer {
  async enableDualRead(userId) {
    this.dualReadEnabled = true;
    this.userId = userId;
  }

  async getBookmarks() {
    if (!this.dualReadEnabled) {
      return this._getBookmarksLocal();
    }

    // Read from both local and cloud
    const [localBookmarks, cloudBookmarks] = await Promise.all([
      this._getBookmarksLocal(),
      this._getBookmarksCloud()
    ]);

    // Compare and log discrepancies
    const discrepancies = this._compareBookmarks(localBookmarks, cloudBookmarks);

    if (discrepancies.length > 0) {
      console.warn('[Dual-Read] Found discrepancies:', discrepancies);
      await this._logDiscrepancies('bookmarks', discrepancies);
    }

    // Return cloud data (source of truth)
    return cloudBookmarks;
  }

  _compareBookmarks(localBookmarks, cloudBookmarks) {
    const discrepancies = [];

    // Check for bookmarks in local but not in cloud
    for (const localBm of localBookmarks) {
      const cloudBm = cloudBookmarks.find(b => b.id === localBm.id);
      if (!cloudBm) {
        discrepancies.push({
          type: 'missing_in_cloud',
          bookmarkId: localBm.id,
          local: localBm,
          cloud: null
        });
      } else {
        // Check for field differences
        const differences = this._findDifferences(localBm, cloudBm);
        if (differences.length > 0) {
          discrepancies.push({
            type: 'field_mismatch',
            bookmarkId: localBm.id,
            differences
          });
        }
      }
    }

    // Check for bookmarks in cloud but not in local
    for (const cloudBm of cloudBookmarks) {
      const localBm = localBookmarks.find(b => b.id === cloudBm.id);
      if (!localBm) {
        discrepancies.push({
          type: 'missing_in_local',
          bookmarkId: cloudBm.id,
          local: null,
          cloud: cloudBm
        });
      }
    }

    return discrepancies;
  }

  _findDifferences(local, cloud) {
    const differences = [];
    const fieldsToCompare = ['title', 'url', 'status', 'category', 'summary', 'userNotes'];

    for (const field of fieldsToCompare) {
      if (local[field] !== cloud[field]) {
        differences.push({
          field,
          localValue: local[field],
          cloudValue: cloud[field]
        });
      }
    }

    return differences;
  }

  async _logDiscrepancies(entityType, discrepancies) {
    const { discrepancyLog } = await chrome.storage.local.get('discrepancyLog') || { discrepancyLog: [] };
    discrepancyLog.push({
      timestamp: Date.now(),
      entityType,
      count: discrepancies.length,
      discrepancies
    });
    await chrome.storage.local.set({ discrepancyLog });
  }
}
```

---

#### 2. Conflict Resolution (Week 2)

**Implement conflict resolution strategies:**

```javascript
class DataLayer {
  async resolveConflict(local, cloud, conflictType = 'last_write_wins') {
    switch (conflictType) {
      case 'last_write_wins':
        // Compare updated_at timestamps
        return local.updated_at > cloud.updated_at ? local : cloud;

      case 'cloud_wins':
        // Always prefer cloud
        return cloud;

      case 'local_wins':
        // Always prefer local
        return local;

      case 'manual':
        // Prompt user to choose
        return await this._promptUserForConflictResolution(local, cloud);

      default:
        throw new Error('Unknown conflict resolution strategy');
    }
  }

  async _promptUserForConflictResolution(local, cloud) {
    // Show modal to user
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.innerHTML = `
        <div class="conflict-modal">
          <h3>Conflict Detected for "${local.title}"</h3>
          <div class="conflict-options">
            <div class="option">
              <h4>Local Version</h4>
              <pre>${JSON.stringify(local, null, 2)}</pre>
              <button id="choose-local">Use This</button>
            </div>
            <div class="option">
              <h4>Cloud Version</h4>
              <pre>${JSON.stringify(cloud, null, 2)}</pre>
              <button id="choose-cloud">Use This</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      document.getElementById('choose-local').addEventListener('click', () => {
        modal.remove();
        resolve(local);
      });

      document.getElementById('choose-cloud').addEventListener('click', () => {
        modal.remove();
        resolve(cloud);
      });
    });
  }
}
```

---

#### 3. Monitor Discrepancies (Week 2-3)

**Add discrepancy dashboard:**

```javascript
async function showDiscrepancyReport() {
  const { discrepancyLog } = await chrome.storage.local.get('discrepancyLog');

  if (!discrepancyLog || discrepancyLog.length === 0) {
    return 'No discrepancies found';
  }

  const totalDiscrepancies = discrepancyLog.reduce((sum, log) => sum + log.count, 0);

  // Group by type
  const byType = discrepancyLog.flatMap(log => log.discrepancies).reduce((acc, d) => {
    acc[d.type] = (acc[d.type] || 0) + 1;
    return acc;
  }, {});

  console.log('Discrepancy Report:', {
    total: totalDiscrepancies,
    byType
  });

  // Show in UI
  document.getElementById('discrepancy-report').innerHTML = `
    <h4>Data Discrepancies (Dual-Read Phase)</h4>
    <p>Total: ${totalDiscrepancies}</p>
    <ul>
      ${Object.entries(byType).map(([type, count]) => `
        <li>${type}: ${count}</li>
      `).join('')}
    </ul>
  `;
}
```

---

### Phase 2 Deliverables

- [x] Dual-read mode implemented
- [x] Conflict resolution working
- [x] Discrepancy monitoring in place
- [x] <1% discrepancy rate
- [x] All conflicts resolved automatically or manually

**Validation:** Cloud data matches local data for >99% of bookmarks.

---

## Phase 3: Cloud-First

**Goal:** Cloud is primary source of truth, local is cache/fallback for offline use.

**Duration:** 2-3 weeks

### Tasks

#### 1. Enable Cloud-First Mode (Week 1)

**Update `data-layer.js`:**

```javascript
class DataLayer {
  async initialize(backend, userId) {
    this.backend = backend;

    if (backend === STORAGE_BACKEND.HYBRID) {
      await this._initializeIndexedDB();
      await this._initializeCloudConnection();
      this.userId = userId;

      // Subscribe to real-time changes
      this._subscribeToRealtimeUpdates();

      // Start background sync
      this._startBackgroundSync();
    }
  }

  _subscribeToRealtimeUpdates() {
    // Supabase real-time subscription
    this.supabase
      .channel('db-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookmarks',
          filter: `user_id=eq.${this.userId}`
        },
        (payload) => {
          console.log('[Real-time] Change received:', payload);
          this._handleRealtimeChange(payload);
        }
      )
      .subscribe();
  }

  async _handleRealtimeChange(payload) {
    const { eventType, new: newRecord, old: oldRecord } = payload;

    switch (eventType) {
      case 'INSERT':
        await this._saveBookmarkToIndexedDB(newRecord);
        this._notifyUI('bookmark_added', newRecord);
        break;

      case 'UPDATE':
        await this._saveBookmarkToIndexedDB(newRecord);
        this._notifyUI('bookmark_updated', newRecord);
        break;

      case 'DELETE':
        await this._deleteBookmarkFromIndexedDB(oldRecord.id);
        this._notifyUI('bookmark_deleted', oldRecord);
        break;
    }
  }

  _notifyUI(event, data) {
    // Send message to UI to refresh
    chrome.runtime.sendMessage({
      type: 'data_changed',
      event,
      data
    });
  }

  async _startBackgroundSync() {
    // Sync every 5 minutes
    setInterval(async () => {
      if (navigator.onLine) {
        await this._processSyncQueue();
      }
    }, 5 * 60 * 1000);

    // Also sync when coming back online
    window.addEventListener('online', async () => {
      console.log('[Sync] Back online, syncing...');
      await this._processSyncQueue();
    });
  }

  async _processSyncQueue() {
    const queue = await this._getSyncQueue();

    for (const item of queue) {
      try {
        await this._syncItem(item);
        await this._removeFRomSyncQueue(item.id);
      } catch (error) {
        console.error('[Sync] Failed to sync item:', item, error);
        // Will retry on next sync
      }
    }
  }
}
```

---

#### 2. Add Offline Indicator (Week 1)

**Add UI indicator for sync status:**

```javascript
// In list-modal.js

function updateSyncStatus() {
  const statusEl = document.getElementById('sync-status');

  if (!navigator.onLine) {
    statusEl.textContent = '🔴 Offline';
    statusEl.className = 'status offline';
  } else if (isSyncing) {
    statusEl.textContent = '🟡 Syncing...';
    statusEl.className = 'status syncing';
  } else {
    statusEl.textContent = '🟢 Synced';
    statusEl.className = 'status synced';
  }
}

window.addEventListener('online', updateSyncStatus);
window.addEventListener('offline', updateSyncStatus);

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'sync_started') {
    isSyncing = true;
    updateSyncStatus();
  } else if (message.type === 'sync_complete') {
    isSyncing = false;
    updateSyncStatus();
  }
});
```

---

#### 3. Gradual Rollout (Week 2-3)

**Implement feature flag for gradual rollout:**

```javascript
// In background.js

async function determineStorageBackend(userId) {
  // Check feature flag from server
  const { data: featureFlags } = await supabase
    .from('feature_flags')
    .select('cloud_sync_enabled')
    .eq('user_id', userId)
    .single();

  if (featureFlags?.cloud_sync_enabled) {
    return STORAGE_BACKEND.HYBRID;
  } else {
    // Still in dual-write mode
    return STORAGE_BACKEND.LOCAL;
  }
}

// Enable cloud-first for 10% of users
async function enableCloudSyncForUser(userId) {
  const hash = simpleHash(userId);
  const bucket = hash % 100;

  // Enable for 10% of users
  if (bucket < 10) {
    await supabase
      .from('feature_flags')
      .upsert({ user_id: userId, cloud_sync_enabled: true });
  }
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}
```

---

### Phase 3 Deliverables

- [x] Cloud-first mode implemented
- [x] Real-time sync working
- [x] Offline mode working
- [x] Sync queue processing correctly
- [x] Gradual rollout to 100% of users

**Validation:** All users successfully using cloud-first mode with <0.1% errors.

---

## Phase 4: Cleanup

**Goal:** Remove old code, deprecate local-only storage, simplify architecture.

**Duration:** 1-2 weeks

### Tasks

#### 1. Remove Dual-Write/Dual-Read Code (Week 1)

- Remove discrepancy logging
- Remove dual-write error tracking
- Simplify data layer to only support hybrid mode

#### 2. Deprecate chrome.storage.local for Data (Week 1)

- Keep chrome.storage.local only for:
  - Session tokens
  - Last sync time
  - Feature flags
- Remove `rvData` and `rvTranscripts` keys

#### 3. Update Documentation (Week 2)

- Update README with new architecture
- Add migration guide for developers
- Document sync behavior for users

#### 4. Celebrate! 🎉

Migration complete!

---

## Risk Mitigation

### Data Loss Prevention

**Strategies:**
- Always maintain local copy during migration
- Daily automated backups of cloud database
- Audit logs for all data modifications
- Ability to roll back to previous phase

**Recovery Plan:**
- If cloud data is corrupted, restore from local backup
- If sync fails, queue for retry (up to 7 days)
- Provide manual export/import as escape hatch

---

### Performance Monitoring

**Metrics to Track:**
- Sync latency (target: <500ms)
- Sync error rate (target: <0.1%)
- Offline queue size (target: <50 items)
- User-reported sync issues (target: <1% of users)

**Tools:**
- Sentry for error tracking
- Mixpanel/Amplitude for usage analytics
- Custom dashboard for sync metrics

---

### User Communication

**Before Each Phase:**
- Email announcement to all users
- In-app notification
- Blog post explaining changes

**During Each Phase:**
- Progress indicator in UI
- Clear error messages
- Support email for issues

**After Each Phase:**
- Success email to users
- Metrics review
- Bug fix sprint if needed

---

## Rollback Plan

**If Phase 1 Fails:**
- Disable dual-write for all users
- Stay on local-only mode
- Investigate and fix issues
- Retry after 2 weeks

**If Phase 2 Fails:**
- Revert to dual-write mode
- Continue reading from local
- Fix conflict resolution logic
- Retry after 1 week

**If Phase 3 Fails:**
- Revert to dual-read mode
- Keep local as primary
- Fix real-time sync issues
- Retry with smaller rollout (5% of users)

---

## Success Criteria

### Technical Success
- [x] Zero data loss across all users
- [x] <0.1% sync error rate
- [x] <500ms sync latency (p95)
- [x] 99.9% uptime for cloud services
- [x] All automated tests passing

### User Success
- [x] >90% user satisfaction with sync
- [x] <1% support tickets related to sync
- [x] >80% of users on cloud-first mode
- [x] Positive reviews mentioning cross-device sync

---

## Next Steps After Migration

1. **Build Mobile App** (see `mobile-app-vision.md`)
2. **Implement AI Features** (see `ai-features-roadmap.md`)
3. **Add Team/Collaboration Features**
4. **Monetization** (Premium tier for advanced features)

---

## Appendix: Testing Strategy

### Unit Tests

**Test Coverage:**
- Data layer CRUD operations
- Conflict resolution logic
- Sync queue processing
- IndexedDB operations

**Example Test:**
```javascript
describe('DataLayer', () => {
  it('should save bookmark to both local and cloud in dual-write mode', async () => {
    await dataLayer.enableDualWrite('user-123');

    const bookmark = {
      id: 'rv-test-123',
      title: 'Test Bookmark',
      url: 'https://example.com'
    };

    await dataLayer.saveBookmark(bookmark);

    // Verify local
    const localBookmarks = await dataLayer._getBookmarksLocal();
    expect(localBookmarks).toContainEqual(bookmark);

    // Verify cloud
    const cloudBookmarks = await dataLayer._getBookmarksCloud();
    expect(cloudBookmarks).toContainEqual(expect.objectContaining(bookmark));
  });
});
```

---

### Integration Tests

**Scenarios to Test:**
1. New user signs up → data migrates correctly
2. User goes offline → changes queue for sync
3. User comes back online → sync queue processes
4. User edits bookmark on Device A → appears on Device B within 5 seconds
5. Conflict occurs → resolved correctly

---

### Manual Testing Checklist

- [ ] Sign up new user
- [ ] Migrate existing user with 100+ bookmarks
- [ ] Test offline mode (disconnect internet)
- [ ] Test real-time sync (edit on two devices)
- [ ] Test conflict resolution (edit same bookmark on two devices while offline)
- [ ] Test error handling (invalid API key, network timeout)
- [ ] Test performance with 1000+ bookmarks

---

**Document End**
