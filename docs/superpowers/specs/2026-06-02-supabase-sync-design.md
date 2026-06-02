# Supabase Cloud Sync, Auth & Multi-Device — Design Spec

**Date:** 2026-06-02
**Status:** Approved (pending written-spec review)
**Scope:** Move ReVisit data from `chrome.storage.local` to a self-hosted Supabase instance, with persistent login, multi-device support, and bidirectional sync. Backup/restore is updated to remain compatible.

---

## 1. Goals

1. **Migrate data** from `chrome.storage.local` to self-hosted Supabase (Postgres + GoTrue + PostgREST).
2. **Persistent login** — the user signs in once per device and is not asked again (long-lived, auto-refreshed sessions).
3. **Multi-device** — the same account, signed in on multiple devices, sees the same data.
4. **Sync** — local changes push to the server; server changes pull down to local storage; local-first behavior (instant, offline-capable) is preserved.
5. **Backup/restore** continues to work and accepts both legacy and new backup files.

### Explicitly out of scope (later phases)
- Vector / semantic search (`pgvector`, embeddings).
- The Next.js / web dashboard (and therefore Vercel — see `CLOUD_STRATEGY_AND_COSTS.md`; not on the critical path).
- Edge Functions (reserved for future LLM-proxy / embeddings work).
- RLHF logging.

---

## 2. Locked Decisions

| Decision | Choice |
| :--- | :--- |
| Auth method | **Email + password** via GoTrue. No SMTP required (email confirmation disabled). |
| Conflict resolution | **Last-write-wins per record** (`updated_at` timestamp). |
| Sync scope | **Bookmarks + categories + settings + transcripts.** |
| Sync trigger | **On key events + periodic `chrome.alarms` tick.** Push-then-pull each cycle. |
| Settings secrets | **Stored on server, client-side encrypted.** Key **derived from the login password** (KDF + per-user salt). End-to-end: server only ever holds ciphertext. |
| Bookmark IDs | **Convert to UUIDs** going forward. Original `rv-...` IDs preserved as `legacy_id` for backup/restore compatibility. |
| Backend shape | **Direct-to-Supabase** (PostgREST + GoTrue) with **Row-Level Security**. No custom server, no Edge Functions this phase. |

---

## 3. Architecture

```
┌─────────────── Chrome Extension (MV3) ──────────────────┐
│  popup.js / list-modal.js   (UI: login, sync status,    │
│                              settings, backup/restore)  │
│  background.js (service worker)                         │
│    └── sync.js  ← NEW MODULE (inlined, like llm-gateway)│
│         • Supabase client w/ chrome.storage adapter     │
│         • auth: signIn / signOut / getSession           │
│         • crypto: deriveKey / encrypt / decrypt secrets │
│         • pushLocalChanges()   (dirty records → server) │
│         • pullRemoteChanges()  (server → local, LWW)    │
│         • chrome.alarms periodic tick                   │
└───────────────────────────┬─────────────────────────────┘
                            │ HTTPS (PostgREST + GoTrue)
                ┌───────────▼────────────┐
                │  Self-hosted Supabase  │
                │  GoTrue (auth)         │
                │  PostgREST + Postgres  │
                │  RLS: user_id = auth.uid()
                └────────────────────────┘
```

### Enabling technical decisions
1. **Custom storage adapter.** `supabase-js` defaults to `localStorage`, which does not exist in an MV3 service worker. We provide a small adapter backed by `chrome.storage.local` (`getItem`/`setItem`/`removeItem`) so the session token persists and survives service-worker restarts.
2. **All cloud logic lives in `sync.js`**, inlined into `background.js` (the existing pattern used for `llm-gateway.js`). `background.js` only calls `pushLocalChanges()` after writes and `pullRemoteChanges()` on triggers. Local-first writes stay instant; sync is additive.
3. **Logged-out users are unaffected** — the extension behaves exactly as it does today. Cloud features are purely additive.

---

## 4. Data Model (Postgres)

All tables carry `user_id uuid NOT NULL` and an RLS policy `user_id = auth.uid()` for select/insert/update/delete. All carry `updated_at timestamptz NOT NULL` (LWW key) and `deleted_at timestamptz` (soft-delete tombstone).

```sql
-- bookmarks
bookmarks (
  id              uuid PRIMARY KEY,        -- NEW canonical id
  legacy_id       text,                    -- original 'rv-...' id (nullable, indexed)
  user_id         uuid NOT NULL,
  url             text,
  title           text,
  category        text,
  summary         text,
  tags            text[],
  user_notes      text,
  added_timestamp bigint,
  revisit_by      timestamptz,
  status          text,
  history         jsonb,
  is_youtube      boolean,
  metadata        jsonb,                   -- catch-all for future / unknown fields
  updated_at      timestamptz NOT NULL,
  deleted_at      timestamptz
)
-- index on (user_id, updated_at) for incremental pull
-- index on (user_id, legacy_id) for restore dedupe

-- categories
categories (
  user_id     uuid NOT NULL,
  name        text NOT NULL,
  priority    int,
  updated_at  timestamptz NOT NULL,
  deleted_at  timestamptz,
  PRIMARY KEY (user_id, name)
)

-- transcripts (heavy data; raw + formatted text per video)
transcripts (
  video_id    text NOT NULL,
  user_id     uuid NOT NULL,
  raw         text,
  formatted   text,
  updated_at  timestamptz NOT NULL,
  deleted_at  timestamptz,
  PRIMARY KEY (video_id, user_id)
)

-- user_settings (single row per user; secrets encrypted client-side)
user_settings (
  user_id     uuid PRIMARY KEY,
  data        jsonb,        -- non-secret settings in plaintext (queryable)
  secrets     jsonb,        -- { llmGatewayApiKey: {ct, iv}, ollamaCloudApiKey: {ct, iv} }
  enc_salt    text,         -- per-user salt for KDF (NOT secret)
  updated_at  timestamptz NOT NULL
)
```

**Notes**
- **Soft deletes** are required: without tombstones, a delete on device A would be re-created from device B on the next sync. A periodic job (or restore step) purges tombstones older than N days.
- **`metadata` JSONB** absorbs any bookmark fields not explicitly columned, so the schema tolerates future additions without migration.
- **Settings split:** non-secret settings live in `data` (plaintext JSONB — queryable, dashboard-friendly later); only the two secret fields live in `secrets` as ciphertext.

---

## 5. Auth & Persistent Login

- **Email + password** via GoTrue. A login form lives in the popup and in the list-modal settings (logged-out state shows "Sign in"; logged-in shows account + "Sign out").
- **Session persistence:** on successful sign-in, `supabase-js` stores `{access_token, refresh_token}` via the `chrome.storage.local` adapter.
- **Why it stays logged in:** the access JWT is short-lived (~1h) but the **refresh token is long-lived and rotates**. `autoRefreshToken: true` silently exchanges it for a fresh JWT; the periodic alarm also refreshes proactively on wake. Because the session lives in `chrome.storage.local`, it survives service-worker death and browser restarts. Net effect: **one sign-in per device**, never asked again unless the user signs out (or the device is idle past the refresh-token lifetime).
- **Multi-device:** each device signs into the same account, gets its own session; RLS scopes both to the same `user_id`; identical data everywhere.

### Self-hosted GoTrue configuration (to document in the plan)
- `GOTRUE_MAILER_AUTOCONFIRM=true` (or disable email confirm) — no SMTP needed.
- `GOTRUE_JWT_EXP` — generous access-token lifetime.
- Long refresh-token validity / refresh-token reuse interval tuned for long-lived sessions.
- Exact env-var list and values produced during planning.

---

## 6. Settings Secret Encryption

**Threat model:** protect API keys against a server / database / backup compromise. A local-device compromise is out of scope (a local attacker already has full `chrome.storage.local` access).

- **Encrypted fields:** `settings.llmGateway.apiKey` and `settings.ollama.cloudApiKey`. Everything else in settings is non-secret and stored plaintext in `user_settings.data`.
- **Key derivation:** at sign-in (we have the plaintext password in the login handler), derive `encKey = PBKDF2(password, enc_salt, highIterations, SHA-256)` via WebCrypto. `enc_salt` is generated once per user, stored server-side in `user_settings.enc_salt` (salt is not secret).
- **Encryption:** AES-GCM (WebCrypto). Each secret stored as `{ ct, iv }` (base64) in `user_settings.secrets`.
- **Key caching:** `encKey` is cached in `chrome.storage.local` so the service worker can encrypt/decrypt on wake without re-prompting. (Acceptable under the threat model above.)
- **New device:** user logs in with the same password → same `enc_salt` (pulled from server) → same `encKey` → secrets decrypt automatically.
- **Password change:** re-derive `encKey`, re-encrypt secrets, re-upload `user_settings.secrets`. (Handled in the change-password flow.)
- **Password reset / forgotten password:** encrypted secrets become unrecoverable — the user re-enters their API keys. This is the accepted trade-off for end-to-end secret encryption.

---

## 7. Sync Engine (`sync.js`)

### Local data shape additions
Each synced record gains, in `chrome.storage.local`:
- `updatedAt` (ISO timestamp) — set on every local write; the LWW key.
- `_dirty: true` — set on every local write; cleared after a successful push.
- `deletedAt` — set on delete (soft delete locally; record kept until tombstone confirmed/purged).

A new top-level key `rvSyncState`:
```js
rvSyncState = { userId, lastPulledAt, encSalt }
```

### Push — `pushLocalChanges()`
1. Collect all records with `_dirty === true` (bookmarks, categories, transcripts, settings).
2. Encrypt secret settings fields before upload (Section 6).
3. Upsert to the server (PostgREST). Deletes are upserts with `deleted_at` set.
4. On success, clear `_dirty`. On failure, leave `_dirty` for retry next cycle.

### Pull — `pullRemoteChanges()`
1. Fetch rows where `updated_at > rvSyncState.lastPulledAt` (incremental — cheap regardless of library size).
2. For each remote row, apply **last-write-wins per record**: if remote `updated_at` > local `updatedAt`, overwrite local; otherwise keep local.
3. Honor tombstones: remote `deleted_at` set → remove the record locally.
4. Decrypt secret settings fields after download.
5. Advance `lastPulledAt` to the newest `updated_at` seen.

### Order & triggers
- **Order:** push, then pull, each cycle — local edits land before reconciliation.
- **Triggers (locked):**
  - extension startup (`onStartup` / `onInstalled`)
  - list-modal open
  - after each local write (debounced)
  - `chrome.alarms` tick every few minutes
- All sync calls **fail soft**: offline or server-down never breaks local-first; dirty records retry next cycle.

---

## 8. Backup / Restore Changes

Existing behavior (`list-modal.js:1223-1271`): export writes `{ bookmarks, categories, transcripts }` (no version, no settings); import **wholesale-replaces** bookmarks, **merges** categories by name, **overwrites** transcripts.

### Export (`exportData`)
- New versioned format:
  ```js
  { version: 2, exportedAt: "<ISO>", bookmarks, categories, transcripts }
  ```
- Settings remain **excluded** from the backup file (a local file containing plaintext API keys is a leak risk; matches the current UI note). Bookmarks in v2 backups carry UUID `id` + `legacy_id`.

### Restore (`importData`)
- **Detect format:** no `version` field (or `version` absent) ⇒ **legacy v1** (bookmarks have `rv-...` ids, no UUIDs). `version: 2` ⇒ new format.
- **Legacy import mapping:** for each legacy bookmark, generate a UUID `id`, set `legacy_id = <rv-... id>`.
- **Dedupe (no duplicates on re-import):** match incoming records against existing local records by `id`, then `legacy_id`, then `url`. On a match, apply **last-write-wins** (compare `updatedAt`); otherwise insert.
- **Merge, not wholesale-replace:** restore now merges into the local store (LWW) rather than overwriting `bookmarks` wholesale. This prevents an old backup from clobbering newer cloud data and then propagating deletions to other devices. (Behavioral change from current code — intentional.)
- **Post-restore:** mark all inserted/updated records `_dirty` and set `updatedAt`, so the next sync cycle pushes them to the server.
- Categories: keep current name-merge behavior, plus `updatedAt`/`_dirty` stamping. Transcripts: merge by `video_id` with LWW instead of wholesale overwrite.

---

## 9. Rollout (staged, safe)

Mirrors the migration plan in `CLOUD_STRATEGY_AND_COSTS.md` §6.

1. **Auth + schema.** Ship login UI; create tables + RLS on the self-hosted instance; configure GoTrue env. No behavior change for logged-out users.
2. **Dual-write + first backfill.** When logged in, writes go to both local and server. A one-time "Sync to Cloud" pushes the existing local library up in batches (generating UUIDs + `legacy_id` for existing `rv-...` bookmarks).
3. **Cloud-first with local cache.** Reads prefer local cache (instant); background pull keeps it fresh; offline still fully works.
4. **Backup/restore update.** Ship versioned export + merge-based restore (Section 8).

---

## 10. Error Handling

- **Offline / server down:** all sync calls fail soft; local-first never breaks; dirty records retry next cycle.
- **Auth refresh failure (token revoked):** surface a non-destructive "please sign in again" state; local data untouched.
- **Encryption/decryption failure** (e.g., wrong key after an out-of-band password change): surface a clear message; do not overwrite local plaintext secrets with garbage; prompt re-entry of keys.
- **Partial push failure:** per-record `_dirty` retry; no all-or-nothing batch loss.

---

## 11. Testing

- **Unit (pure functions, no network):** LWW merge logic, tombstone handling, legacy→UUID mapping + dedupe, settings encrypt/decrypt round-trip, backup-format detection.
- **Mock Supabase client:** push/pull cycle, incremental watermark advancement, conflict resolution.
- **Manual two-device acceptance checklist:** sign in on two devices; add/edit/delete on one; confirm propagation; offline edit then reconnect; restore a legacy backup and confirm no duplicates + correct sync-up.

---

## 12. New / Changed Files

- **`sync.js`** (new) — Supabase client, auth, crypto, push/pull, alarms. Inlined into `background.js`.
- **`background.js`** — call `pushLocalChanges()` after writes; `pullRemoteChanges()` on triggers; register `chrome.alarms`; add auth message actions.
- **`list-modal.js` / `list-modal.html`** — login/account UI in settings; "Sync to Cloud" + sync status; versioned export + merge-based restore.
- **`popup.js` / `popup.html`** — login entry point / status.
- **DB migration SQL** — tables, indexes, RLS policies (applied to the self-hosted instance).
- **GoTrue env configuration** — documented values.
