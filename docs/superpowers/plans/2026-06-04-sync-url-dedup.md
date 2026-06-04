# Sync URL De-duplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse same-URL bookmark duplicates across local and cloud storage during the sync cycle, so duplicates are removed and not recreated.

**Architecture:** Add a pure `dedupeBookmarksByUrl(list, isoNow)` to `rv-sync-core.js`. The sync cycle runs it right after the post-push pull (when the local list mirrors `cloud ∪ local`): newest-`updatedAt` survivor with deterministic tie-break, empty fields gap-filled from losers, losers turned into tombstones. The existing push + tombstone machinery propagates the result to the cloud and other devices. No new network code, no schema change.

**Tech Stack:** Plain ES (Chrome MV3 service worker), no build step. Tests via `node:test` + `node:assert`, run with `npm test` (`node --test`). `rv-sync-core.js` is the pure, unit-tested layer; `sync.js` is the chrome/`fetch` glue (no unit harness).

**Spec:** `docs/superpowers/specs/2026-06-04-sync-url-dedup-design.md`

---

### Task 1: Pure `dedupeBookmarksByUrl` in rv-sync-core.js

**Files:**
- Modify: `rv-sync-core.js` (add function + add to the returned module object near line 122-127)
- Test: `rv-sync-core.test.js` (append tests)

- [ ] **Step 1: Write the first failing test**

Append to `rv-sync-core.test.js`:

```js
// ── dedupeBookmarksByUrl ──
test('dedupeBookmarksByUrl: two same-url records collapse to survivor + tombstone', () => {
  const list = [
    { id: 'b1', url: 'https://x.com/p', title: 'newer', summary: 's', userNotes: 'n', tags: ['t'], history: ['h'], updatedAt: '2026-02-01T00:00:00.000Z' },
    { id: 'a1', url: 'https://x.com/p', title: 'older', summary: 's', userNotes: 'n', tags: ['t'], history: ['h'], updatedAt: '2026-01-01T00:00:00.000Z' },
  ];
  const { list: out, changed } = core.dedupeBookmarksByUrl(list, '2026-09-09T00:00:00.000Z');
  const live = out.filter(b => !b.deletedAt);
  const dead = out.filter(b => b.deletedAt);
  assert.strictEqual(live.length, 1);
  assert.strictEqual(live[0].id, 'b1');                 // newest updatedAt survives
  assert.strictEqual(live[0]._dirty, undefined);        // survivor needed no gap-fill → untouched
  assert.strictEqual(dead.length, 1);
  assert.strictEqual(dead[0].id, 'a1');
  assert.strictEqual(dead[0]._dirty, true);
  assert.strictEqual(dead[0].deletedAt, '2026-09-09T00:00:00.000Z');
  assert.strictEqual(changed, 1);                       // only the tombstone counts
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `core.dedupeBookmarksByUrl is not a function`.

- [ ] **Step 3: Implement the function**

In `rv-sync-core.js`, add this block immediately before the `return {` near line 122:

```js
  // ── URL de-duplication ──
  // Collapse bookmarks that share an EXACT `url` into one survivor. Survivor =
  // newest updatedAt, tie-broken by lowest id (lexicographic) so EVERY device
  // picks the same survivor and they converge instead of tombstoning each other.
  // Empty survivor fields are gap-filled from the newest loser that has a value,
  // so notes/summary/tags/history added on an older copy aren't lost. Losers
  // become tombstones; the normal push/pull path removes them everywhere.
  // Pure: no I/O, no Date.now() — `isoNow` is injected by the caller. Tombstoned,
  // preliminary, and url-less records pass through untouched (original reference).
  const GAP_FILL_FIELDS = ['summary', 'userNotes', 'tags', 'history'];
  function _isEmptyField(v) {
    if (Array.isArray(v)) return v.length === 0;
    return v === undefined || v === null || v === '';
  }
  function dedupeBookmarksByUrl(list, isoNow) {
    const groups = new Map();   // url -> eligible records
    const out = [];             // start with the pass-through (untouched) records
    for (const b of (list || [])) {
      if (b.deletedAt || b.isPreliminary || !b.url) { out.push(b); continue; }
      const g = groups.get(b.url); if (g) g.push(b); else groups.set(b.url, [b]);
    }
    let changed = 0;
    for (const group of groups.values()) {
      if (group.length === 1) { out.push(group[0]); continue; }
      // newest-first; tie-break on lowest id for cross-device determinism
      const sorted = [...group].sort((a, b) => {
        const ta = Date.parse(a.updatedAt) || 0, tb = Date.parse(b.updatedAt) || 0;
        if (tb !== ta) return tb - ta;
        return String(a.id) < String(b.id) ? -1 : 1;
      });
      const losers = sorted.slice(1);   // already newest-first
      let survivor = sorted[0];
      const merged = { ...survivor };
      let filled = false;
      for (const field of GAP_FILL_FIELDS) {
        if (!_isEmptyField(merged[field])) continue;
        const donor = losers.find(l => !_isEmptyField(l[field]));
        if (donor) { merged[field] = donor[field]; filled = true; }
      }
      if (filled) { merged.updatedAt = isoNow; merged._dirty = true; survivor = merged; changed++; }
      out.push(survivor);
      for (const l of losers) {
        out.push({ ...l, deletedAt: isoNow, updatedAt: isoNow, _dirty: true });
        changed++;
      }
    }
    return { list: out, changed };
  }
```

Then add `dedupeBookmarksByUrl` to the returned module object. Change:

```js
    detectBackupVersion, mergeBackupBookmarks
  };
```

to:

```js
    detectBackupVersion, mergeBackupBookmarks,
    dedupeBookmarksByUrl
  };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS for the new test; all pre-existing tests still PASS.

- [ ] **Step 5: Add the remaining behavior tests**

Append to `rv-sync-core.test.js`:

```js
test('dedupeBookmarksByUrl: gap-fills empty survivor fields from older loser', () => {
  const list = [
    { id: 'b1', url: 'https://x.com/p', userNotes: '', summary: '', tags: [], history: [], updatedAt: '2026-02-01T00:00:00.000Z' },
    { id: 'a1', url: 'https://x.com/p', userNotes: 'keep me', summary: 'old summary', tags: ['x'], history: ['h1'], updatedAt: '2026-01-01T00:00:00.000Z' },
  ];
  const { list: out, changed } = core.dedupeBookmarksByUrl(list, '2026-09-09T00:00:00.000Z');
  const survivor = out.find(b => b.id === 'b1');
  assert.strictEqual(survivor.userNotes, 'keep me');
  assert.strictEqual(survivor.summary, 'old summary');
  assert.deepStrictEqual(survivor.tags, ['x']);
  assert.deepStrictEqual(survivor.history, ['h1']);
  assert.strictEqual(survivor.updatedAt, '2026-09-09T00:00:00.000Z'); // re-stamped
  assert.strictEqual(survivor._dirty, true);
  assert.strictEqual(changed, 2);  // survivor gap-filled + loser tombstoned
});

test('dedupeBookmarksByUrl: three same-url records collapse to one survivor + two tombstones', () => {
  const list = [
    { id: 'c', url: 'https://x.com/p', updatedAt: '2026-03-01T00:00:00.000Z' },
    { id: 'a', url: 'https://x.com/p', updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'b', url: 'https://x.com/p', updatedAt: '2026-02-01T00:00:00.000Z' },
  ];
  const { list: out } = core.dedupeBookmarksByUrl(list, '2026-09-09T00:00:00.000Z');
  assert.strictEqual(out.filter(b => !b.deletedAt).length, 1);
  assert.strictEqual(out.find(b => !b.deletedAt).id, 'c');           // newest survives
  assert.strictEqual(out.filter(b => b.deletedAt).length, 2);
});

test('dedupeBookmarksByUrl: no duplicates → changed 0 and original references kept', () => {
  const r1 = { id: 'a', url: 'https://x.com/1', updatedAt: '2026-01-01T00:00:00.000Z' };
  const r2 = { id: 'b', url: 'https://x.com/2', updatedAt: '2026-01-01T00:00:00.000Z' };
  const { list: out, changed } = core.dedupeBookmarksByUrl([r1, r2], '2026-09-09T00:00:00.000Z');
  assert.strictEqual(changed, 0);
  assert.strictEqual(out.find(b => b.id === 'a'), r1);  // same reference, untouched
  assert.strictEqual(out.find(b => b.id === 'b'), r2);
});

test('dedupeBookmarksByUrl: tombstones, preliminaries, and url-less records pass through untouched', () => {
  const tomb  = { id: 't', url: 'https://x.com/p', deletedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
  const live  = { id: 'p', url: 'https://x.com/p', updatedAt: '2026-02-01T00:00:00.000Z' };
  const prelim = { id: 'pre', url: 'https://x.com/p', isPreliminary: true, updatedAt: '2026-02-01T00:00:00.000Z' };
  const nourl = { id: 'n', updatedAt: '2026-02-01T00:00:00.000Z' };
  const { list: out, changed } = core.dedupeBookmarksByUrl([tomb, live, prelim, nourl], '2026-09-09T00:00:00.000Z');
  // The lone live record is not collapsed against a tombstone/preliminary → nothing changes.
  assert.strictEqual(changed, 0);
  assert.strictEqual(out.find(b => b.id === 't'), tomb);
  assert.strictEqual(out.find(b => b.id === 'pre'), prelim);
  assert.strictEqual(out.find(b => b.id === 'n'), nourl);
  assert.strictEqual(out.find(b => b.id === 'p'), live);
});

test('dedupeBookmarksByUrl: equal updatedAt → deterministic survivor (lowest id)', () => {
  const same = '2026-02-01T00:00:00.000Z';
  const mk = () => [
    { id: 'zzz', url: 'https://x.com/p', updatedAt: same },
    { id: 'aaa', url: 'https://x.com/p', updatedAt: same },
  ];
  const out1 = core.dedupeBookmarksByUrl(mk(), '2026-09-09T00:00:00.000Z').list;
  const out2 = core.dedupeBookmarksByUrl(mk().reverse(), '2026-09-09T00:00:00.000Z').list;
  assert.strictEqual(out1.find(b => !b.deletedAt).id, 'aaa');  // lowest id wins
  assert.strictEqual(out2.find(b => !b.deletedAt).id, 'aaa');  // order-independent → converges
});
```

- [ ] **Step 6: Run the full suite to verify all pass**

Run: `npm test`
Expected: PASS — all new `dedupeBookmarksByUrl` tests and every pre-existing test.

- [ ] **Step 7: Commit**

```bash
git add rv-sync-core.js rv-sync-core.test.js
git commit -m "feat(sync): add pure dedupeBookmarksByUrl (newest-wins + gap-fill, deterministic)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Run the dedupe pass inside the sync cycle

**Files:**
- Modify: `sync.js` — `_runCycle` (currently lines 377-391)

- [ ] **Step 1: Wire the dedupe pass into `_runCycle`**

In `sync.js`, find the body of `_runCycle` (the `try` block ending at the push/pull lines):

```js
      await pushLocalChanges(); await pushSettings();
      await pullRemoteChanges(); await pullSettings();
    } catch (e) { console.warn('syncCycle failed (will retry):', e.message); }
```

Replace it with:

```js
      await pushLocalChanges(); await pushSettings();
      await pullRemoteChanges(); await pullSettings();
      // Local now mirrors cloud (cloud ∪ local). Collapse exact-URL duplicates:
      // survivors gap-filled, losers tombstoned. The follow-up push propagates the
      // survivor updates + tombstones to the cloud and (via pull) to other devices,
      // so a duplicate created on another device is cleaned within one cycle.
      const ddData = await getRvData();
      const { list: ddList, changed: ddChanged } =
        Core.dedupeBookmarksByUrl(ddData.bookmarks || [], new Date().toISOString());
      if (ddChanged) {
        ddData.bookmarks = ddList;
        await setRvData(ddData);
        await pushLocalChanges();
      }
    } catch (e) { console.warn('syncCycle failed (will retry):', e.message); }
```

- [ ] **Step 2: Verify the test suite still passes (no regressions)**

Run: `npm test`
Expected: PASS — `sync.js` has no unit harness, but this confirms `rv-sync-core.js` (imported by `sync.js`) is intact.

- [ ] **Step 3: Static sanity check of the edit**

Run: `node --check sync.js`
Expected: no output (file parses).

- [ ] **Step 4: Manual verification reasoning (no code change)**

Confirm by reading the edited `_runCycle`:
- `Core` is already defined at sync.js:219 and exposes `dedupeBookmarksByUrl` after Task 1.
- `getRvData`/`setRvData` are defined at sync.js:245-246.
- `pushLocalChanges` (sync.js:250) upserts dirty rows + tombstones, then drops locally-confirmed `deletedAt` rows (sync.js:279) — so survivors push, losers tombstone-then-vanish locally.
- When `ddChanged === 0`, no extra storage write or push happens.

- [ ] **Step 5: Commit**

```bash
git add sync.js
git commit -m "feat(sync): collapse URL duplicates each cycle via dedupeBookmarksByUrl

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Manual smoke test (optional, after both tasks)

Load the unpacked extension in Chrome with two signed-in profiles (or simulate by
seeding `rvData.bookmarks` with two records sharing a `url` but different `id`s via
the service-worker console), trigger a sync, and confirm:
- After one cycle, only one bookmark for that URL remains locally.
- The cloud `bookmarks` table shows the loser row with `deleted_at` set and the
  survivor updated.
- A second device pulling afterward ends with exactly one bookmark for that URL.
