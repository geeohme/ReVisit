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

  // Assign every space-less bookmark + category to the reserved "default-space"
  // bucket, and create that Space record IFF one does not already exist. The
  // bucket id is the hard-coded literal (not a fresh UUID) so two browsers that
  // migrate independently produce the SAME id and LWW converges instead of forking.
  // Pure: returns a new shallow-cloned data object; only sets `spaceId` where absent.
  function migrateToDefaultSpace(data, chosenName, isoNow) {
    const out = { ...data };
    out.bookmarks = (data.bookmarks || []).map(b => b.spaceId ? b : { ...b, spaceId: DEFAULT_SPACE_ID });
    out.categories = (data.categories || []).map(c => c.spaceId ? c : { ...c, spaceId: DEFAULT_SPACE_ID });
    const existing = (data.spaces || []).find(s => s.id === DEFAULT_SPACE_ID);
    out.spaces = existing
      ? (data.spaces || []).slice()
      : [ ...(data.spaces || []), makeSpace(DEFAULT_SPACE_ID, chosenName, 1, isoNow) ];
    return out;
  }

  // Decide which setup flavor to run on list-page load.
  //   'none'    — rvLocal.defaultSpaceId is set, in enabledSpaceIds, and points at a LIVE Space.
  //   'migrate' — setup needed AND rvData.spaces has no live Space (pre-Spaces upgrade → Flavor A).
  //   'pick'    — setup needed AND live Spaces already exist (second-browser → Flavor B).
  function setupGateDecision(rvData, rvLocal) {
    const allSpaces = (rvData && rvData.spaces) || [];
    const live = liveSpaces(allSpaces);
    const liveIds = new Set(live.map(s => s.id));
    const rl = rvLocal || {};
    const def = rl.defaultSpaceId;
    const enabled = rl.enabledSpaceIds || [];
    const ok = !!def && liveIds.has(def) && enabled.includes(def);
    if (ok) return 'none';
    return allSpaces.length === 0 ? 'migrate' : 'pick';
  }

  // Build a version-3 backup payload. DELIBERATELY excludes rvLocal — per-install
  // selection (enabled/default/last-used) must never travel between installs.
  function buildBackupV3(rvData, transcripts, isoNow) {
    return {
      version: 3,
      exportedAt: isoNow,
      spaces: rvData.spaces || [],
      bookmarks: rvData.bookmarks || [],
      categories: rvData.categories || [],
      transcripts: transcripts || {},
    };
  }

  return { DEFAULT_SPACE_ID, catKey, defaultRvLocal,
           nextSpacePriority, makeSpace, liveSpaces, tombstoneSpace,
           migrateToDefaultSpace, setupGateDecision, buildBackupV3 };
});
