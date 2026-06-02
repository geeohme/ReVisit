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

  return { stampRecord, mergeRecordLWW, applyRemoteList };
});
