# Cloud Strategy & Cost Analysis for ReVisit

**Date:** December 26, 2025
**Status:** Proposed
**Target:** Solopreneur-friendly, Scalable Architecture

---

## 1. Current State Analysis

The current ReVisit Chrome extension operates on a **Local-First** architecture.

*   **Data Storage:** Uses `chrome.storage.local` for all data.
    *   `rvData`: Stores user settings, categories, and the main `bookmarks` array.
    *   `rvTranscripts`: Stores raw and formatted transcripts keyed by video ID.
*   **Data Volume:** Limited by Chrome's storage quotas (typically 5MB-10MB unless `unlimitedStorage` is requested). Storing full transcripts locally is the primary bottleneck for scalability.
*   **Compute:** All logic (scraping, parsing, API calls) happens client-side in the browser (Background Service Worker or Content Scripts).
*   **AI Integration:**
    *   **Logic:** `background.js` contains the orchestration logic (`processWithAI`, `callLLMGateway`).
    *   **Gateway:** A custom `llm-gateway.js` (inlined in background) handles provider switching.
    *   **Keys:** API keys are stored in local settings (user-provided).

**Limitations:**
*   **No Sync:** Data is trapped on a single device.
*   **No Web Access:** Users cannot access their library from a phone or another browser.
*   **Search:** Limited to simple text matching on the client. No semantic/vector search.
*   **Data Risk:** If the extension is uninstalled or the browser crashes, data is lost unless manually exported.

---

## 2. Recommended Cloud Stack

To meet the requirements (Auth, Web Access, Vector Search, LLM, RLHF) while keeping costs low for a solopreneur, I recommend a **Supabase + Next.js** stack.

### **Why Supabase?**
It is an open-source Firebase alternative that provides the "Backend-as-a-Service" (BaaS) experience but is built on **PostgreSQL**.
*   **Auth:** Built-in.
*   **Database:** PostgreSQL is robust, relational, and scalable.
*   **Vector Search:** `pgvector` is a native extension, meaning your vector database **IS** your primary database. No need for a separate Pinecone subscription.
*   **Realtime:** Built-in WebSocket support for syncing.
*   **Edge Functions:** Serverless compute for secure API calls.

### **Stack Components**

| Component | Recommendation | Justification |
| :--- | :--- | :--- |
| **Auth** | **Supabase Auth** | Free for 50k MAUs. Seamless integration with Postgres Row Level Security (RLS). |
| **Database** | **Supabase (PostgreSQL)** | Relational data (users, bookmarks) + JSONB (metadata) + Vectors (embeddings) in one place. |
| **Vector DB** | **pgvector** (on Supabase) | Zero extra cost. Simplifies architecture (no data sync between DB and Vector DB). |
| **Backend API** | **Supabase Edge Functions** | TypeScript (Deno). Fast cold starts. Perfect for proxying LLM calls securely. |
| **Web App** | **Next.js** (Vercel) | Industry standard. easy to build a dashboard. "Serverless" scaling. |
| **LLM Provider** | **Groq** (Primary) + **Anthropic** (Fallback) | **Groq** offers incredible speed/cost ratio for Llama 3 models. **Anthropic** for high-reasoning tasks. |

---

## 3. Architecture Decisions & Trade-offs

### **Decision 1: Supabase Cloud vs. Self-Hosted**
**Verdict:** **Supabase Cloud (Managed)**

*   **The "Solopreneur" Constraint:** Self-hosting Supabase requires managing multiple Docker containers (Postgres, GoTrue, PostgREST, Realtime, Storage, etc.), handling backups, security patches, and ensuring high availability.
*   **Hidden Costs:** While self-hosting saves the $25/mo subscription, it incurs "DevOps debt." If you spend 5 hours a month maintaining the server, and your time is worth even $50/hr, you've "spent" $250 to save $25.
*   **Recommendation:** Pay for the managed service. It buys you peace of mind, automated backups, and zero-maintenance infrastructure, allowing you to focus 100% on building features, not fixing servers.

### **Decision 2: Vercel vs. Cloudflare Workers**
**Verdict:** **Vercel (for Launch)**

*   **Next.js Native Support:** Vercel is built by the creators of Next.js. Features like Server Actions, Image Optimization, and Incremental Static Regeneration (ISR) work out-of-the-box with zero configuration.
*   **The Cloudflare Friction:** While Cloudflare Workers is cheaper at massive scale, running a full Next.js application on it (via `next-on-pages`) often involves compatibility friction. You lose access to Node.js APIs and must strictly adhere to the Edge Runtime, which can limit library choices.
*   **Speed to Market:** For a solopreneur, "it just works" is the most critical feature. The complexity of debugging Edge Runtime issues on Cloudflare is not worth the marginal cost savings at this stage.
*   **Migration Path:** If ReVisit scales to millions of users and Vercel bills become prohibitive, migrating the frontend to Cloudflare is a solvable problem for *Future You*.

---

## 4. Architecture Design

### **High-Level Diagram**

```mermaid
graph TD
    subgraph Client Side
        Ext[Chrome Extension]
        Web[Web Dashboard (Next.js)]
    end

    subgraph "Supabase (Backend-as-a-Service)"
        Auth[Auth Service]
        DB[(PostgreSQL DB)]
        Realtime[Realtime Engine]
        Edge[Edge Functions]
    end

    subgraph "AI Services"
        LLM[LLM APIs (Groq/Anthropic)]
        Embed[Embedding API (OpenAI/Cohere)]
    end

    %% Auth Flow
    Ext -->|Login/Token| Auth
    Web -->|Login/Token| Auth

    %% Data Flow
    Ext -->|Sync Data| DB
    Web -->|Read Data| DB
    DB -->|Push Updates| Realtime
    Realtime -->|Sync| Ext

    %% AI Flow
    Ext -->|Request Analysis| Edge
    Edge -->|1. Generate Embedding| Embed
    Edge -->|2. Summarize/Tag| LLM
    Edge -->|3. Store Result| DB
```

### **Data Model (PostgreSQL)**

1.  **`users`**: Managed by Supabase Auth.
2.  **`bookmarks`**:
    *   `id` (UUID)
    *   `user_id` (FK)
    *   `url`, `title`, `content_summary`
    *   `embedding` (vector(1536)) - *For Semantic Search*
    *   `tags` (text[])
    *   `metadata` (JSONB) - *Flexible storage for extra fields*
3.  **`transcripts`**:
    *   `video_id`
    *   `content` (Text)
    *   `embedding` (vector) - *Chunked embeddings for long videos*
4.  **`rlhf_logs`**: *For RLHF*
    *   `id`
    *   `input_prompt`
    *   `ai_output`
    *   `user_correction`
    *   `model_version`

### **RLHF Strategy (Reinforcement Learning from Human Feedback)**
To implement RLHF without massive complexity:
1.  **Capture:** When a user edits an AI-generated summary or tag list in the UI, save the *diff* to the `rlhf_logs` table.
2.  **Dataset:** This builds a proprietary dataset of "Bad AI Output" vs. "Good User Output".
3.  **Utilization:**
    *   *Phase 1 (Few-Shot):* Inject top 3 relevant corrections into the prompt context dynamically to improve immediate results.
    *   *Phase 2 (Fine-Tuning):* Once you have ~500 corrections, fine-tune a small Llama 3 model (hosted on Groq or Replicate) to specialize in the user's style.

---

## 5. Cost Analysis

### **Phase 1: Launch / Zero Users (Development)**
*Goal: Minimize fixed costs.*

| Service | Tier | Estimated Cost |
| :--- | :--- | :--- |
| **Supabase** | Free Tier | **$0.00** (500MB DB, 50k MAU) |
| **Vercel** | Hobby Tier | **$0.00** |
| **Groq API** | On-demand | **<$1.00** (Development usage) |
| **OpenAI (Embeddings)** | On-demand | **<$0.10** (text-embedding-3-small is dirt cheap) |
| **Total** | | **~$1.00 / month** |

### **Phase 2: Growth (1,000 Active Users)**
*Assumptions: 1k users, 5 bookmarks/day each, 50% are YouTube videos.*

| Service | Usage Estimate | Estimated Cost |
| :--- | :--- | :--- |
| **Supabase** | Pro Plan (if DB > 500MB) | **$25.00** |
| **Vercel** | Pro Plan (if limits hit) | **$20.00** |
| **LLM API (Groq)** | ~150k tokens/day (Llama 3) | **~$5.00** (Groq is extremely cheap) |
| **Embeddings** | ~5k docs/day | **~$0.50** |
| **Total** | | **~$50.50 / month** |

*Note: Costs scale linearly with usage. The primary cost driver will be the LLM API, not the infrastructure.*

---

## 6. Migration Plan

Moving from `LocalStorage` to Cloud requires a careful transition to avoid data loss.

### **Step 1: Hybrid "Dual-Write" Mode**
1.  Implement Supabase Auth in the extension popup.
2.  Update `background.js`:
    *   When saving a bookmark, write to `chrome.storage.local` (as usual).
    *   **IF** user is logged in, *also* send payload to Supabase Edge Function.
    *   This ensures the extension works offline and feels instant.

### **Step 2: The "Sync" Button**
1.  Create a utility in `utils.js` that iterates through all local `rvData.bookmarks`.
2.  Push them to Supabase in batches (e.g., 50 at a time).
3.  Mark them as `synced: true` locally.
4.  Add a UI in Settings: "Sync to Cloud".

### **Step 3: Cloud-First (with Local Cache)**
1.  Change the "Load Bookmarks" logic:
    *   Try to fetch from Supabase (fresh data).
    *   If offline/fail, fall back to `chrome.storage.local`.
2.  Implement **Realtime Listeners**:
    *   Subscribe to Supabase changes.
    *   When a change event arrives (e.g., bookmark added on phone), update `chrome.storage.local` immediately.

### **Step 4: Vector Backfill**
1.  Once data is in Supabase, run a background script (Edge Function) to generate embeddings for all existing bookmarks that lack them.
2.  This enables the "Search" feature to suddenly become "Smart Search".
