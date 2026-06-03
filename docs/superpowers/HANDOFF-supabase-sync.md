# Supabase Sync — Implementation Handoff

**Branch:** `worktree-supabase-sync` (worktree at `.claude/worktrees/supabase-sync`)
**Status:** All 4 phases code-complete, reviewed, and committed. **NOT merged to `main`.** 23/23 unit tests pass; all files syntax-valid.
**Date:** 2026-06-03

This work was produced across this session plus two `i-am-stepping` fork runs, all committing linearly to the same branch (verified coherent — no clobbering, no reverts).

---

## What's done

- **Phase 1 — Auth:** email/password sign-in via GoTrue, persistent auto-refreshing session in `chrome.storage.local`, sign-in/out UI in the list-modal settings. **Manually verified working** (sign in / reload / persist / sign out).
- **Phase 2 — Sync engine:** PostgREST client, push/pull cycle, camelCase↔snake_case mapping, incremental watermark, soft-delete tombstones, legacy→UUID backfill, transcript sync, triggers (startup/alarm/save/list-open), "Sync to Cloud" button.
- **Phase 3 — Encrypted settings:** PBKDF2→AES-GCM, key derived from login password, secrets encrypted into `user_settings.secrets`, non-secret settings in `user_settings.data`; key persisted locally across SW restarts.
- **Phase 4 — Backup/restore:** versioned export, merge-LWW restore accepting legacy `rv-...` and UUID files, dedupe.
- **DB:** `db/schema.sql` applied to the live instance (4 tables, RLS, indexes) — verified.

## Review fixes applied (post-implementation)

| Ref | Issue | Fix | Commit |
|---|---|---|---|
| C1 | Blanket re-stamping every record on save defeated per-record LWW (cross-device data loss) | `RvSyncCore.stampChangedList` content-diff; stamp only changed records | `3ba99c7` |
| C2 | Watermark used client clock → skewed-clock device's rows could be skipped forever | 2-min skew buffer on `lastPulledAt` (re-fetch idempotent under LWW) | `fd64444` |
| I3 | Concurrent sync cycles raced on `rvData` read-modify-write | single-flight `syncCycle` guard | `fd64444` |
| — | Preliminary (mid-AI) bookmarks synced half-baked | skip `isPreliminary` in push | `e7a8b22` |
| — | Stale/malformed session crashed (`s.user.id`) / looped on `{}` refresh | `isValidSession` self-heal + single-flight refresh | `0ba764b` |
| — | Session longevity / SW-restart key loss | proactive transient-safe refresh + persist enc key locally | `fc964c5` |
| — | Malformed refresh → 422 retried forever | treat 422 as definitive logout | `67535b0` |
| A | "Bookmark not found" race (backfill rewrote `rv-…`→UUID mid-enrichment) | create bookmarks with `crypto.randomUUID()` at birth; backfill skips `isPreliminary` | `969fe51` |
| B | List page stale after a background pull (read `rvData` once, no listener) | `chrome.storage.onChanged` live-refresh listener | `969fe51` |
| B+ | `_selfWrite` flag could strand (no-op save) or be raced → next pull's render silently skipped | content-comparison listener instead of the boolean flag | (this session) |

Live contract tests (against the real instance) validated: signup/signin/refresh, RLS isolation, merge-duplicates upsert (no dup), incremental `gt` watermark, tombstone propagation, and `user_settings` JSONB + `{ct,iv}` secret-blob round-trip.

---

## Follow-ups (NOT blocking — your call)

1. **Settings sync is "chatty" + coarse (the deferred "I1").** Every 5-min alarm runs a full push/pull including an unconditional `user_settings` upsert even when nothing changed. It also has no per-field/timestamp LWW — the last device to sync wins the whole settings blob, and a not-yet-pushed local non-secret setting could be overwritten by a stale remote blob. Encrypted secrets are protected (local preserve-on-no-key logic), so this is **not** API-key loss, but settings propagation is unreliable. Proper fix = track a settings `updated_at`/dirty gate. Deferred deliberately (design choice) while you were away.
2. **`localEnabled` not enforced in dispatch (pre-existing).** `callOllama` falls back to `http://localhost:11434` even when `localEnabled=false`. Cosmetic now; tighten if it matters.
3. **`popup.js`/`popup.html` have no auth UI** — sign-in lives only in list-modal settings. By design for v1; add a popup status/entry if you want discoverability.
4. **Merge to `main` will touch `background.js`**, which has your uncommitted WIP (prompt tuning + `maxTokens`) on `main`. Expect a small merge to reconcile — likely no hard conflict (different regions), but review it.

---

## Manual acceptance tests (need your browser/account — could not be verified headlessly)

1. **Re-auth once:** reload the unpacked extension (`.claude/worktrees/supabase-sync`), **sign out then sign back in** — this clears any stale session and derives+persists the encryption key.
2. **Secret→DB:** re-save settings with your gateway/Ollama keys. In Supabase, confirm `user_settings.secrets` for your user holds the `{ct,iv}` blobs and `user_settings.data` has the keys **blanked** (`''`).
3. **Two-device sync:** sign in on a second profile/device; add/edit/delete a bookmark on one → confirm it propagates; offline-edit then reconnect reconciles.
4. **Legacy restore:** restore an old `rv-backup-*.json` → no duplicates on re-restore → UUID+`legacy_id` rows appear in the cloud after sync. (Recommend syncing before restoring — see plan §8.)
5. **Stay-logged-in:** confirm the session survives over hours (proactive refresh).
6. **Ollama defaults:** settings should show Ollama local **off** and the URL **empty** by default.

Cleanup:
- Throwaway auth users (`revisit-test-*`, `revisit-smoke-*`, `rv-contract-*` @example.com) from contract testing can be deleted in Studio → Authentication.
- From the earlier "Bookmark not found" failures you may have a few **stuck half-saved bookmarks** (preliminary, empty summary). These are leftover data, not a live bug — just delete them from the list.

---

## Migration note
`docs/edge-function-secret-migration.md` (added by the fork) describes moving the gateway call server-side so the API key never lives on the client — the stronger alternative to the current Option A (local plaintext working copy + encrypted DB copy).
