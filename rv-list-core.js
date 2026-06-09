// rv-list-core.js — pure, environment-agnostic list/avatar/status logic.
// No chrome.*, no fetch, no Date.now(). Mirrors rv-spaces-core.js UMD style.
(function (root, factory) {
  const mod = factory();
  root.RvListCore = mod;
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis, function () {

  // Default avatar palette (kept in sync with FAV_COLORS in list-modal.js).
  const PALETTE = ['#3E7C5A', '#C8801E', '#7159B5', '#2F6FE4', '#D6492B', '#0E7C86', '#B5346F', '#4B7A1E'];

  // settings.defaultIntervalDays: number => that many days; null => None (no reminder);
  // missing/undefined => 7-day default.
  function resolveInterval(settings) {
    if (!settings) return 7;
    const v = settings.defaultIntervalDays;
    if (v === null) return null;
    if (v === undefined) return 7;
    return v;
  }

  // The "ReVisit — remind again" action. Returns the status + new revisitBy.
  // intervalDays null => leave revisitBy to the caller (undefined here).
  function revisitTransition(now, intervalDays) {
    if (intervalDays === null || intervalDays === undefined) {
      return { status: 'ReVisited', revisitBy: undefined };
    }
    return {
      status: 'ReVisited',
      revisitBy: new Date(now.getTime() + intervalDays * 86400000).toISOString(),
    };
  }

  // Letter shown on the avatar tile: category first letter, else host first letter, else bullet.
  function avatarLetter(categoryName, host) {
    const cat = (categoryName || '').trim();
    if (cat && cat[0]) return cat[0].toUpperCase();
    const h = (host || '').trim();
    if (h && h[0]) return h[0].toUpperCase();
    return '•';
  }

  // Avatar colour resolution: bookmark override > category colour > deterministic palette.
  function avatarColor(bookmarkLetterColor, categoryColor, host, palette) {
    const pal = palette || PALETTE;
    if (bookmarkLetterColor) return bookmarkLetterColor;
    if (categoryColor) return categoryColor;
    const key = host || '';
    let n = 0;
    for (let i = 0; i < key.length; i++) n = (n + key.charCodeAt(i)) % pal.length;
    return pal[n];
  }

  // Choose a colour for a new category: the first palette colour not already used,
  // else fall back to the first palette colour.
  function nextCategoryColor(usedColors, palette) {
    const pal = palette || PALETTE;
    const used = new Set((usedColors || []).map(c => (c || '').toLowerCase()));
    const free = pal.find(c => !used.has(c.toLowerCase()));
    return free || pal[0];
  }

  // Remove a tag string from every bookmark. Mutates in place, stamps changed ones
  // dirty for sync. Returns the count of bookmarks changed.
  function removeTagFromBookmarks(bookmarks, tag, isoNow) {
    let changed = 0;
    for (const b of bookmarks || []) {
      const tags = b.tags || [];
      if (tags.includes(tag)) {
        b.tags = tags.filter(t => t !== tag);
        b._dirty = true;
        b.updatedAt = isoNow;
        changed++;
      }
    }
    return changed;
  }

  return { PALETTE, resolveInterval, revisitTransition, avatarLetter, avatarColor, nextCategoryColor, removeTagFromBookmarks };
});
