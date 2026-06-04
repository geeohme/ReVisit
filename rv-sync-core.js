// rv-sync-core.js — pure, environment-agnostic sync logic. No chrome.*, no fetch.
(function (root, factory) {
  const mod = factory();
  root.RvSyncCore = mod;
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis, function () {

  function stampRecord(rec, isoNow) {
    return { ...rec, updatedAt: isoNow, _dirty: true };
  }

  // Content fingerprint that ignores sync-meta fields, so a record is only
  // considered "changed" when its actual data changed (not its stamp).
  function _contentKey(rec) {
    const c = { ...rec };
    delete c._dirty; delete c.updatedAt;
    return JSON.stringify(c);
  }

  // Stamp ONLY the records whose content changed vs `prevList` (keyed by `key`),
  // plus brand-new records. Unchanged records are returned untouched, preserving
  // any prior _dirty/updatedAt (so a not-yet-pushed edit stays pending, and a
  // freshly-pulled record is NOT re-stamped → no echo, and per-record LWW is
  // preserved across devices). Returns a new array; changed records are new objects.
  function stampChangedList(prevList, nextList, key, isoNow) {
    const prevMap = new Map((prevList || []).map(r => [r[key], r]));
    return (nextList || []).map(rec => {
      const prev = prevMap.get(rec[key]);
      if (!prev || _contentKey(prev) !== _contentKey(rec)) {
        return { ...rec, updatedAt: isoNow, _dirty: true };
      }
      return rec;
    });
  }

  // Newer updatedAt wins; ties keep remote (server is canonical on equal stamps).
  function mergeRecordLWW(local, remote) {
    if (!local) return remote;
    if (!remote) return local;
    return (new Date(remote.updatedAt) >= new Date(local.updatedAt)) ? remote : local;
  }

  // Apply a list of remote rows onto a local list keyed by `key`.
  // Honors deletedAt tombstones (removes locally when remote wins).
  function applyRemoteList(localList, remoteList, key) {
    const map = new Map(localList.map(r => [r[key], r]));
    for (const remote of remoteList) {
      const local = map.get(remote[key]);
      const winner = mergeRecordLWW(local, remote);
      if (winner === remote && remote.deletedAt) {
        map.delete(remote[key]);                 // tombstone wins → drop locally
      } else if (winner === remote) {
        const clean = { ...remote }; delete clean._dirty;
        map.set(remote[key], clean);
      } // else local wins → keep as-is
    }
    return Array.from(map.values());
  }

  // A session is only usable if it has the fields needed to authenticate AND refresh.
  // A blob missing refresh_token or user is stale/malformed → caller should force re-auth
  // rather than send a doomed `{refresh_token: undefined}` refresh or crash on `s.user.id`.
  function isValidSession(s) {
    return !!(s && s.access_token && s.refresh_token && s.user && s.user.id);
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function ensureUuid(rec, genUuid) {
    if (rec.id && UUID_RE.test(rec.id)) return rec;
    return { ...rec, id: genUuid(), legacyId: rec.id };
  }

  // ── secret encryption (PBKDF2 → AES-GCM) ──
  function _b64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
  function _unb64(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
  const _enc = new TextEncoder(); const _dec = new TextDecoder();

  // extractable=true so the caller can persist the derived key locally and re-import it
  // after a service-worker restart (avoids re-deriving — i.e. re-login — to sync secrets).
  // Safe under the "plaintext working copy is already local" model.
  async function deriveEncKey(password, salt) {
    const baseKey = await crypto.subtle.importKey('raw', _enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: _enc.encode(salt), iterations: 200000, hash: 'SHA-256' },
      baseKey, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
    );
  }
  async function encryptSecret(plaintext, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, _enc.encode(plaintext));
    return { ct: _b64(ct), iv: _b64(iv) };
  }
  async function decryptSecret(enc, key) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: _unb64(enc.iv) }, key, _unb64(enc.ct));
    return _dec.decode(pt);
  }

  // ── backup / restore ──
  function detectBackupVersion(backup) { return backup && backup.version ? backup.version : 1; }

  // Merge incoming backup bookmarks into existing, dedupe by id|legacyId|url, LWW.
  function mergeBackupBookmarks(existing, incoming, genUuid) {
    const byId = new Map(existing.map(b => [b.id, b]));
    const byLegacy = new Map(existing.filter(b => b.legacyId).map(b => [b.legacyId, b]));
    const byUrl = new Map(existing.filter(b => b.url).map(b => [b.url, b]));
    for (const raw of incoming) {
      const inc = ensureUuid(raw, genUuid);
      let match = byId.get(inc.id) || (inc.legacyId && byLegacy.get(inc.legacyId)) || (inc.url && byUrl.get(inc.url));
      if (match) {
        const winner = mergeRecordLWW(match, inc);
        if (winner === inc) { Object.assign(match, inc, { id: match.id, _dirty: true }); }
      } else {
        inc._dirty = true;
        byId.set(inc.id, inc);
        if (inc.legacyId) byLegacy.set(inc.legacyId, inc);
        if (inc.url) byUrl.set(inc.url, inc);
      }
    }
    return Array.from(byId.values());
  }

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

  return {
    stampRecord, stampChangedList, mergeRecordLWW, applyRemoteList, ensureUuid,
    isValidSession,
    deriveEncKey, encryptSecret, decryptSecret,
    detectBackupVersion, mergeBackupBookmarks,
    dedupeBookmarksByUrl
  };
});
