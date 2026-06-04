// rv-spaces-core.js — pure, environment-agnostic Spaces logic. No chrome.*, no fetch, no Date.now().
(function (root, factory) {
  const mod = factory();
  root.RvSpacesCore = mod;
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  const core = (typeof self !== 'undefined' && self.RvSyncCore) ||
               (typeof require !== 'undefined' && require('./rv-sync-core.js'));

  const DEFAULT_SPACE_ID = 'default-space';

  // Composite identity for a category: a Space id is a UUID (or the reserved
  // "default-space" literal) — neither contains a space — so a single space char
  // is a safe separator that cannot collide across (spaceId, name) pairs.
  function catKey(c) { return c.spaceId + ' ' + c.name; }

  function defaultRvLocal() {
    return { enabledSpaceIds: [], defaultSpaceId: '', lastUsedListSpaceId: '' };
  }

  function nextSpacePriority(spacesList) {
    return (spacesList || []).reduce((m, s) => Math.max(m, s.priority || 0), 0) + 1;
  }
  function makeSpace(id, name, priority, isoNow) {
    return { id, name, priority, updatedAt: isoNow };
  }
  function liveSpaces(spacesList) {
    return (spacesList || []).filter(s => !s.deletedAt).sort((a, b) => (a.priority || 0) - (b.priority || 0));
  }
  function tombstoneSpace(spacesList, id, isoNow) {
    return (spacesList || []).map(s => s.id === id ? { ...s, deletedAt: isoNow, updatedAt: isoNow } : s);
  }

  return { DEFAULT_SPACE_ID, catKey, defaultRvLocal,
           nextSpacePriority, makeSpace, liveSpaces, tombstoneSpace };
});
