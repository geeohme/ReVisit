// rv-sync-core.js — pure, environment-agnostic sync logic. No chrome.*, no fetch.
(function (root, factory) {
  const mod = factory();
  root.RvSyncCore = mod;
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis, function () {

  function stampRecord(rec, isoNow) {
    return { ...rec, updatedAt: isoNow, _dirty: true };
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

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function ensureUuid(rec, genUuid) {
    if (rec.id && UUID_RE.test(rec.id)) return rec;
    return { ...rec, id: genUuid(), legacyId: rec.id };
  }

  // ── secret encryption (PBKDF2 → AES-GCM) ──
  function _b64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
  function _unb64(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
  const _enc = new TextEncoder(); const _dec = new TextDecoder();

  async function deriveEncKey(password, salt) {
    const baseKey = await crypto.subtle.importKey('raw', _enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: _enc.encode(salt), iterations: 200000, hash: 'SHA-256' },
      baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
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

  return {
    stampRecord, mergeRecordLWW, applyRemoteList, ensureUuid,
    deriveEncKey, encryptSecret, decryptSecret,
    detectBackupVersion, mergeBackupBookmarks
  };
});
