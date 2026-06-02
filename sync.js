// sync.js — thin Supabase (GoTrue + PostgREST) client for ReVisit.
// No external deps; raw fetch, same style as the LLM gateway code.
(function (root) {
  const CONFIG_KEY  = 'rvSyncConfig';   // { url, anonKey }
  const SESSION_KEY = 'rvSession';      // { access_token, refresh_token, expires_at, user }

  async function getConfig() {
    const r = await chrome.storage.local.get(CONFIG_KEY);
    return r[CONFIG_KEY] || null;
  }
  async function setConfig(cfg) {
    await chrome.storage.local.set({ [CONFIG_KEY]: cfg });
  }
  async function getSession() {
    const r = await chrome.storage.local.get(SESSION_KEY);
    return r[SESSION_KEY] || null;
  }
  async function setSession(s) {
    if (s) await chrome.storage.local.set({ [SESSION_KEY]: s });
    else   await chrome.storage.local.remove(SESSION_KEY);
  }

  function authHeaders(cfg, accessToken) {
    return {
      'Content-Type': 'application/json',
      'apikey': cfg.anonKey,
      ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {})
    };
  }

  // Normalize a GoTrue token response into our session shape.
  function toSession(json) {
    const expiresAt = Date.now() + (json.expires_in ? json.expires_in * 1000 : 3600 * 1000);
    return {
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: expiresAt,
      user: json.user || null
    };
  }

  async function signUp(email, password) {
    const cfg = await getConfig();
    if (!cfg) throw new Error('Sync not configured');
    const res = await fetch(`${cfg.url}/auth/v1/signup`, {
      method: 'POST', headers: authHeaders(cfg),
      body: JSON.stringify({ email, password })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.msg || json.error_description || `Sign-up failed (${res.status})`);
    // If autoconfirm is on, signup returns a session; otherwise user must confirm.
    if (json.access_token) { const s = toSession(json); await setSession(s); return s; }
    return null;
  }

  async function signIn(email, password) {
    const cfg = await getConfig();
    if (!cfg) throw new Error('Sync not configured');
    const res = await fetch(`${cfg.url}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: authHeaders(cfg),
      body: JSON.stringify({ email, password })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error_description || json.msg || `Sign-in failed (${res.status})`);
    const s = toSession(json);
    await setSession(s);
    return s;
  }

  async function signOut() {
    await setSession(null);
  }

  // Refresh the access token if expired/near-expiry. Returns a valid session or null.
  async function ensureFreshSession() {
    const cfg = await getConfig();
    const s = await getSession();
    if (!cfg || !s) return null;
    const skewMs = 60 * 1000; // refresh 1 min before expiry
    if (Date.now() < (s.expires_at - skewMs)) return s;
    const res = await fetch(`${cfg.url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', headers: authHeaders(cfg),
      body: JSON.stringify({ refresh_token: s.refresh_token })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Refresh token revoked/expired — surface a re-login state, keep local data.
      await setSession(null);
      return null;
    }
    const fresh = toSession(json);
    await setSession(fresh);
    return fresh;
  }

  async function isLoggedIn() {
    return !!(await getSession());
  }

  // ── PostgREST helpers ──
  async function authedFetch(path, opts = {}) {
    const cfg = await getConfig();
    const s = await ensureFreshSession();
    if (!cfg || !s) throw new Error('Not authenticated');
    const res = await fetch(`${cfg.url}${path}`, {
      ...opts,
      headers: { ...authHeaders(cfg, s.access_token), ...(opts.headers || {}) }
    });
    return res;
  }

  // Upsert an array of rows into `table` (merge-duplicates on PK).
  async function upsertRows(table, rows) {
    if (!rows.length) return;
    const res = await authedFetch(`/rest/v1/${table}`, {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows)
    });
    if (!res.ok) { const t = await res.text(); throw new Error(`upsert ${table} failed (${res.status}): ${t}`); }
  }

  // Fetch rows updated after `sinceIso` (or all if null).
  async function fetchSince(table, sinceIso) {
    const q = sinceIso ? `?updated_at=gt.${encodeURIComponent(sinceIso)}` : '';
    const res = await authedFetch(`/rest/v1/${table}${q}`, { method: 'GET' });
    if (!res.ok) { const t = await res.text(); throw new Error(`fetch ${table} failed (${res.status}): ${t}`); }
    return res.json();
  }

  // ── sync engine ──
  const Core = (root.RvSyncCore) || (typeof require !== 'undefined' && require('./rv-sync-core.js'));

  // bookmark <-> row mapping (camelCase local <-> snake_case Postgres)
  function bookmarkToRow(b, userId) {
    return {
      id: b.id, legacy_id: b.legacyId || null, user_id: userId,
      url: b.url, title: b.title, category: b.category, summary: b.summary,
      tags: b.tags || [], user_notes: b.userNotes || '', added_timestamp: b.addedTimestamp || null,
      revisit_by: b.revisitBy || null, status: b.status, history: b.history || [],
      is_youtube: !!b.isYouTube, metadata: b.metadata || {},
      updated_at: b.updatedAt, deleted_at: b.deletedAt || null
    };
  }
  function rowToBookmark(r) {
    return {
      id: r.id, legacyId: r.legacy_id || undefined, url: r.url, title: r.title, category: r.category,
      summary: r.summary, tags: r.tags || [], userNotes: r.user_notes || '', addedTimestamp: r.added_timestamp,
      revisitBy: r.revisit_by, status: r.status, history: r.history || [], isYouTube: !!r.is_youtube,
      metadata: r.metadata || {}, updatedAt: r.updated_at, deletedAt: r.deleted_at || undefined
    };
  }
  function catToRow(c, userId) {
    return { user_id: userId, name: c.name, priority: c.priority, updated_at: c.updatedAt || new Date().toISOString(), deleted_at: c.deletedAt || null };
  }
  function rowToCat(r) { return { name: r.name, priority: r.priority, updatedAt: r.updated_at, deletedAt: r.deleted_at || undefined }; }

  async function getRvData() { const r = await chrome.storage.local.get('rvData'); return r.rvData || { bookmarks: [], categories: [], settings: {} }; }
  async function setRvData(d) { await chrome.storage.local.set({ rvData: d }); }
  async function getSyncState() { const r = await chrome.storage.local.get('rvSyncState'); return r.rvSyncState || { lastPulledAt: null }; }
  async function setSyncState(s) { await chrome.storage.local.set({ rvSyncState: s }); }

  async function pushLocalChanges() {
    const s = await ensureFreshSession(); if (!s) return;
    const userId = s.user.id;
    const data = await getRvData();
    // Backfill: convert any legacy rv- ids to UUIDs (mark converted dirty so they push).
    data.bookmarks = (data.bookmarks || []).map(b => {
      const conv = Core.ensureUuid(b, () => crypto.randomUUID());
      if (conv !== b) conv._dirty = true;
      return conv;
    });
    const dirtyBookmarks = data.bookmarks.filter(b => b._dirty);
    const dirtyCats = (data.categories || []).filter(c => c._dirty);
    if (dirtyBookmarks.length) await upsertRows('bookmarks', dirtyBookmarks.map(b => bookmarkToRow(b, userId)));
    if (dirtyCats.length)      await upsertRows('categories', dirtyCats.map(c => catToRow(c, userId)));
    // transcripts
    const tr = (await chrome.storage.local.get('rvTranscripts')).rvTranscripts || {};
    const dirtyTr = Object.entries(tr).filter(([, v]) => v && v._dirty)
      .map(([video_id, v]) => ({ video_id, user_id: userId, raw: v.raw || null, formatted: v.formatted || null, updated_at: v.updatedAt || new Date().toISOString(), deleted_at: v.deletedAt || null }));
    if (dirtyTr.length) {
      await upsertRows('transcripts', dirtyTr);
      for (const vid of Object.keys(tr)) if (tr[vid] && tr[vid]._dirty) delete tr[vid]._dirty;
      await chrome.storage.local.set({ rvTranscripts: tr });
    }
    // clear dirty flags + physically drop locally-confirmed tombstones
    data.bookmarks = data.bookmarks.map(b => { const c = { ...b }; delete c._dirty; return c; });
    data.categories = (data.categories || []).map(c => { const x = { ...c }; delete x._dirty; return x; });
    data.bookmarks = data.bookmarks.filter(b => !b.deletedAt);
    await setRvData(data);
  }

  async function pullRemoteChanges() {
    const s = await ensureFreshSession(); if (!s) return;
    const st = await getSyncState();
    const since = st.lastPulledAt;
    const [bRows, cRows, trRows] = await Promise.all([
      fetchSince('bookmarks', since), fetchSince('categories', since), fetchSince('transcripts', since)
    ]);
    const data = await getRvData();
    data.bookmarks  = Core.applyRemoteList(data.bookmarks || [], bRows.map(rowToBookmark), 'id');
    data.categories = Core.applyRemoteList(data.categories || [], cRows.map(rowToCat), 'name');
    await setRvData(data);
    if (trRows.length) {
      const tr = (await chrome.storage.local.get('rvTranscripts')).rvTranscripts || {};
      for (const r of trRows) {
        const local = tr[r.video_id] || null;
        const remote = { raw: r.raw, formatted: r.formatted, updatedAt: r.updated_at, deletedAt: r.deleted_at || undefined };
        const winner = Core.mergeRecordLWW(local, remote);
        if (winner === remote && r.deleted_at) delete tr[r.video_id];
        else if (winner === remote) tr[r.video_id] = remote;
      }
      await chrome.storage.local.set({ rvTranscripts: tr });
    }
    const newest = [...bRows, ...cRows, ...trRows].map(r => r.updated_at).filter(Boolean).sort().pop();
    if (newest) await setSyncState({ ...st, lastPulledAt: newest });
  }

  async function syncCycle() {
    try { await pushLocalChanges(); await pullRemoteChanges(); }
    catch (e) { console.warn('syncCycle failed (will retry):', e.message); }
  }

  root.RvSync = {
    getConfig, setConfig, getSession, setSession,
    signUp, signIn, signOut, ensureFreshSession, isLoggedIn,
    authHeaders, toSession, CONFIG_KEY, SESSION_KEY,
    authedFetch, upsertRows, fetchSince,
    pushLocalChanges, pullRemoteChanges, syncCycle,
    bookmarkToRow, rowToBookmark
  };
})(typeof self !== 'undefined' ? self : globalThis);
