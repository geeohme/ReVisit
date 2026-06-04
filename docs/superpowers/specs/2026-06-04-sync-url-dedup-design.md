# Sync URL De-duplication — Design

**Date:** 2026-06-04
**Status:** Approved (self-reviewed)

## Problem

Bookmarks are keyed by `id` (UUID) throughout live sync: `upsertRows` merges on
that primary key, and `applyRemoteList` (rv-sync-core.js) merges remote onto local
by `id` only. At **add-time**, a duplicate is defined as the **same `url`**
(background.js:796), guarded by a user confirmation dialog — but that check is
per-device and per-add.

The gap: two devices that each save the same URL *before* syncing generate two
different UUIDs. Live sync sees two distinct `id`s and treats them as distinct
bookmarks, so URL-duplicates accumulate in **both** local storage and the cloud.
The backup/restore path (`mergeBackupBookmarks`) already dedupes by
`id | legacyId | url`, but the live sync cycle does not.

## Goal

1. Detect and collapse duplicate bookmarks (same URL) across the local copy **and**
   the cloud copy, removing the redundant records.
2. Ensure the sync cycle does not create or leave duplicates — any newly-introduced
   cross-device duplicate is collapsed within one cycle.

## Decisions (from brainstorming)

- **Duplicate identity:** exact same `url` (byte-for-byte). Matches the existing
  add-time check. No URL normalization.
- **Merge rule:** newest `updatedAt` wins as the survivor (LWW, consistent with the
  rest of sync), then **gap-fill** — backfill any empty field on the survivor from
  the losers so user-entered data (notes, summary, tags, history) is not lost.
- **Mechanism:** Approach A — a pure dedupe pass inside the sync cycle, run right
  after pull when the local list already mirrors `cloud ∪ local`. Survivors are
  marked dirty; losers become tombstones. The existing push + tombstone machinery
  propagates the result to the cloud and to other devices. No new network code, no
  schema change.

## Scope

**Bookmarks only.** Categories are keyed by unique `name` and transcripts by
`video_id`, so neither can accumulate URL-duplicates. `isPreliminary`
(mid-enrichment) bookmarks are **excluded** from dedup — they are half-processed
and must not be tombstoned or chosen as a survivor (this mirrors the existing
"skip preliminary" rule in `pushLocalChanges`).

## Components

### 1. New pure function — `rv-sync-core.js`

```
dedupeBookmarksByUrl(list, isoNow) → { list, changed }
```

- Considers only **live** records: not `deletedAt`, not `isPreliminary`, and has a
  truthy `url`. All other records pass through untouched (original object
  references preserved).
- Groups eligible records by **exact** `url`.
- For each group with more than one record:
  - **Survivor selection:** the record with the newest `updatedAt`. Tie-break:
    the lowest `id` by lexicographic string comparison. (Determinism is required —
    see "Convergence" below.)
  - **Gap-fill:** for each of `summary`, `userNotes`, `tags`, `history`, if the
    survivor's value is empty (`''` for strings, length 0 for arrays), copy the
    value from the **newest loser** that has a non-empty value for that field.
    If any field was filled, the survivor becomes a new object with
    `updatedAt = isoNow` and `_dirty = true`.
  - **Losers:** each becomes a new object with `deletedAt = isoNow`,
    `updatedAt = isoNow`, `_dirty = true`, and remains in the returned list so the
    normal push sends the tombstone.
- Returns `{ list, changed }` where `changed` is the count of records that were
  modified (survivors gap-filled + losers tombstoned). The caller skips the
  follow-up push when `changed === 0`.
- **Pure:** no `chrome.*`, no `fetch`, no `Date.now()` — `isoNow` is injected by the
  caller. Returns a new array; modified records are new objects, untouched records
  keep their original reference.

### 2. Cycle integration — `sync.js` `_runCycle`

Insert the dedupe pass after the existing post-push pull, when local mirrors cloud:

```js
await pushLocalChanges(); await pushSettings();
await pullRemoteChanges(); await pullSettings();
// Collapse URL-duplicates across the unified local⋃cloud view.
const data = await getRvData();
const { list, changed } = Core.dedupeBookmarksByUrl(
  data.bookmarks || [], new Date().toISOString());
if (changed) {
  data.bookmarks = list;
  await setRvData(data);
  await pushLocalChanges();   // propagate survivor updates + loser tombstones
}
```

`pushLocalChanges` already upserts tombstones to the cloud and then physically
drops locally-confirmed `deletedAt` rows (sync.js:279), so both stores converge.
Other devices drop the losers on their next `pullRemoteChanges` via
`applyRemoteList`'s existing tombstone handling.

## Data flow

1. Device A and Device B each saved `https://x.com/page` → ids `A1` and `B1`.
2. After a normal pull, both ids exist in the local list (local mirrors cloud).
3. `dedupeBookmarksByUrl` groups them by url, picks the survivor deterministically
   (say `A1`, newest), gap-fills it, tombstones `B1`.
4. `pushLocalChanges` upserts the updated `A1` and the `B1` tombstone to the cloud,
   then drops `B1` locally.
5. The other device pulls the `B1` tombstone; `applyRemoteList` removes `B1` there.
   When it runs its own dedupe, only `A1` remains → no-op.

## Convergence (the subtle correctness point)

Two devices that both run dedupe on the same data **must pick the same survivor**,
or each would tombstone the other's choice and the bookmark would be deleted
entirely. Determinism guarantees convergence: newest `updatedAt` with a lowest-`id`
tie-break yields the same survivor for the same inputs on every device. Because
dedupe runs *after* pull, whichever device dedupes first pushes its tombstone, and
the other device pulls it and finds nothing left to collapse. Gap-fill is likewise
deterministic given the same inputs, so survivors converge field-for-field.

## Error handling

- Dedupe runs inside the existing `_runCycle` try/catch — a throw is logged and the
  cycle retries on the next trigger, same as today. The pure function does no I/O,
  so it cannot throw on network/storage errors.
- The follow-up `pushLocalChanges` is the existing, already-hardened path; it is a
  cheap no-op when nothing is dirty.

## Testing — `rv-sync-core.test.js`

Pure-function unit tests for `dedupeBookmarksByUrl`:

1. Two same-URL records where the survivor needs no gap-fill → one survivor
   (newest `updatedAt`, untouched), one tombstone (`deletedAt` set, `_dirty` true).
   Only the tombstone counts as modified → `changed === 1`.
2. Gap-fill: newest survivor has empty `userNotes`; older loser has notes →
   survivor ends with the loser's notes and is marked `_dirty`, loser is
   tombstoned. Both records modified → `changed === 2`.
3. Three-way duplicate → one survivor + two tombstones.
4. No duplicates → `changed === 0` and every record keeps its original reference.
5. Existing tombstones, `isPreliminary` records, and url-less records pass through
   untouched.
6. Determinism: the same input produces the same survivor `id` (tie-break on equal
   `updatedAt` picks the lowest `id`).

## Non-goals

- URL normalization (trailing slash, fragment, tracking params) — exact match only.
- Deduping categories or transcripts.
- Immediate server-side dedup queries (Approach B) — eventual consistency via the
  push/pull cycle is sufficient and avoids duplicate logic.
