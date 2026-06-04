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
    if (json.access_token) {
      const s = toSession(json); await setSession(s);
      try { await deriveKeyForSession(password); } catch (e) { console.warn('enc key derive failed:', e.message); }
      return s;
    }
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
    try { await deriveKeyForSession(password); } catch (e) { console.warn('enc key derive failed:', e.message); }
    return s;
  }

  async function signOut() {
    await setSession(null);
    _encKey = null;
    await chrome.storage.local.remove([SALT_KEY, ENCKEY_KEY]);
    // Force the next login to pull-before-push again (re-hydrate from the server)
    // so a different/returning account can't be clobbered by stale local state.
    const st = await getSyncState();
    await setSyncState({ ...st, hydrated: false });
  }

  // Single-flight refresh: the cycle fires several authedFetch calls (e.g. 3 parallel
  // fetchSince in pullRemoteChanges) that each call ensureFreshSession. GoTrue rotates
  // refresh tokens, so concurrent refreshes with the same token make all-but-one fail
  // with "Refresh token is not valid". Coalesce them onto one in-flight promise.
  // Refresh proactively, well before expiry, so the periodic alarm renews the token long
  // before any request needs it — the user stays logged in without manual re-auth.
  const SKEW_MS = 5 * 60 * 1000; // refresh up to 5 min before expiry
  let _refreshInFlight = null;
  function _refreshSession(cfg) {
    if (_refreshInFlight) return _refreshInFlight;
    _refreshInFlight = (async () => {
      try {
        // Re-read inside the flight: a prior flight may have already refreshed, in which
        // case we must NOT refresh again with the now-rotated (invalid) token.
        const s = await getSession();
        if (!Core.isValidSession(s)) { await setSession(null); return null; }
        if (Date.now() < (s.expires_at - SKEW_MS)) return s;
        const res = await fetch(`${cfg.url}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST', headers: authHeaders(cfg),
          body: JSON.stringify({ refresh_token: s.refresh_token })
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          // Only a definitive auth rejection means the refresh token is truly dead →
          // require re-login. Transient failures (5xx / rate-limit) must NOT log the user
          // out; keep the session and let the next cycle retry. (Network errors throw from
          // fetch above and propagate without clearing the session — same intent.)
          // 422 = malformed/unprocessable refresh request (e.g. a structurally bad
          // token from an older build); treat as definitive so we don't retry it forever.
          if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 422) {
            await setSession(null);
            return null;
          }
          throw new Error(`token refresh failed transiently (${res.status})`);
        }
        const fresh = toSession(json);
        // Carry forward fields the refresh response may omit, so we never store a partial session.
        if (!fresh.user) fresh.user = s.user;
        if (!fresh.refresh_token) fresh.refresh_token = s.refresh_token;
        await setSession(fresh);
        return fresh;
      } finally { _refreshInFlight = null; }
    })();
    return _refreshInFlight;
  }

  // Refresh the access token if expired/near-expiry. Returns a valid session or null.
  async function ensureFreshSession() {
    const cfg = await getConfig();
    const s = await getSession();
    if (!cfg || !s) return null;
    // Self-heal a stale/malformed session (missing refresh_token or user) left by an
    // older build: clearing it forces a clean re-auth instead of a doomed `{}` refresh
    // or a `s.user.id` crash downstream.
    if (!Core.isValidSession(s)) { await setSession(null); return null; }
    if (Date.now() < (s.expires_at - SKEW_MS)) return s;
    return _refreshSession(cfg);
  }

  async function isLoggedIn() {
    return !!(await getSession());
  }

  // ── settings-secret encryption key (derived from the login password) ──
  const SALT_KEY   = 'rvEncSalt';
  const ENCKEY_KEY = 'rvEncKeyRaw';  // base64 raw AES key, persisted so it survives SW restarts
  let _encKey = null;                // in-memory CryptoKey cache

  function _b64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
  function _unb64(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }

  async function ensureSaltRow(userId) {
    const res = await authedFetch(`/rest/v1/user_settings?user_id=eq.${userId}&select=enc_salt`, { method: 'GET' });
    const rows = res.ok ? await res.json() : [];
    if (rows.length && rows[0].enc_salt) return rows[0].enc_salt;
    const salt = crypto.randomUUID();
    await upsertRows('user_settings', [{ user_id: userId, enc_salt: salt, updated_at: new Date().toISOString() }]);
    return salt;
  }

  async function deriveKeyForSession(password) {
    const s = await getSession(); if (!s || !s.user) return;
    const salt = await ensureSaltRow(s.user.id);
    _encKey = await root.RvSyncCore.deriveEncKey(password, salt);
    // Persist the raw key so secret sync keeps working across service-worker restarts
    // without forcing a re-login (Option A: plaintext working copy is already local).
    const raw = await crypto.subtle.exportKey('raw', _encKey);
    await chrome.storage.local.set({ [SALT_KEY]: salt, [ENCKEY_KEY]: _b64(raw) });
  }

  // Async: returns the cached key, else lazily re-imports the persisted raw key.
  async function getEncKey() {
    if (_encKey) return _encKey;
    const r = await chrome.storage.local.get(ENCKEY_KEY);
    if (r[ENCKEY_KEY]) {
      try {
        _encKey = await crypto.subtle.importKey('raw', _unb64(r[ENCKEY_KEY]), 'AES-GCM', false, ['encrypt', 'decrypt']);
      } catch (e) { /* corrupt key blob — ignore, secrets just won't sync until re-login */ }
    }
    return _encKey || null;
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
    // Every column MUST be present with a non-undefined value: JSON.stringify drops
    // undefined-valued keys, and PostgREST's bulk upsert rejects a batch whose rows
    // have mismatched key sets with 400 PGRST102 ("All object keys must match").
    // Legacy records (pre-sync, no updatedAt/summary/etc.) would otherwise omit keys.
    // `updated_at` is NOT NULL in the schema, so it must always be a real timestamp;
    // fall back to the bookmark's added time, then to now.
    return {
      id: b.id, legacy_id: b.legacyId || null, user_id: userId,
      url: b.url ?? null, title: b.title ?? null, category: b.category ?? null, summary: b.summary ?? null,
      tags: b.tags || [], user_notes: b.userNotes || '', added_timestamp: b.addedTimestamp || null,
      revisit_by: b.revisitBy || null, status: b.status ?? null, history: b.history || [],
      is_youtube: !!b.isYouTube, metadata: b.metadata || {},
      updated_at: b.updatedAt || (b.addedTimestamp ? new Date(b.addedTimestamp).toISOString() : new Date().toISOString()),
      deleted_at: b.deletedAt || null
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
      if (b.isPreliminary) return b;  // never rewrite a bookmark's id while it's mid-enrichment
      const conv = Core.ensureUuid(b, () => crypto.randomUUID());
      if (conv !== b) conv._dirty = true;
      return conv;
    });
    // Skip preliminary (mid-AI-enrichment) bookmarks — don't sync half-processed
    // placeholders. When enrichment completes, the content change re-stamps them.
    const dirtyBookmarks = data.bookmarks.filter(b => b._dirty && !b.isPreliminary);
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
    if (newest) {
      // updated_at is the PUSHING client's clock. Rewind the watermark by a skew
      // buffer so a row written by a device whose clock is slightly behind isn't
      // permanently skipped by the `gt` filter. Re-fetching the recent window is
      // cheap and idempotent (applyRemoteList is LWW, local edits still win).
      const WATERMARK_SKEW_MS = 2 * 60 * 1000;
      const rewound = new Date(Date.parse(newest) - WATERMARK_SKEW_MS).toISOString();
      await setSyncState({ ...st, lastPulledAt: rewound });
    }
  }

  // ── settings sync (non-secret plaintext in `data`, secrets encrypted in `secrets`) ──
  const SECRET_PATHS = [['llmGateway', 'apiKey'], ['ollama', 'cloudApiKey']];
  function getPath(o, p) { return p.reduce((x, k) => (x ? x[k] : undefined), o); }
  function setPath(o, p, v) { let x = o; for (let i = 0; i < p.length - 1; i++) { x[p[i]] = x[p[i]] || {}; x = x[p[i]]; } x[p[p.length - 1]] = v; }

  async function pushSettings() {
    const s = await ensureFreshSession(); if (!s) return;
    const key = await getEncKey();
    const data = await getRvData();
    const settings = JSON.parse(JSON.stringify(data.settings || {}));
    const secrets = {};
    if (key) {
      for (const path of SECRET_PATHS) {
        const val = getPath(settings, path);
        if (val) { secrets[path.join('.')] = await root.RvSyncCore.encryptSecret(val, key); setPath(settings, path, ''); }
      }
    } else {
      // No key available: never upload plaintext secrets; leave server `secrets` untouched.
      for (const path of SECRET_PATHS) setPath(settings, path, '');
    }
    const row = { user_id: s.user.id, data: settings, updated_at: new Date().toISOString() };
    // Only write `secrets` when we actually have encrypted values. Uploading an
    // empty {} would overwrite (wipe) the server's stored secrets via the
    // merge-duplicates upsert — e.g. a fresh device whose local secrets are still
    // empty must NOT clobber the user's encrypted keys.
    if (key && Object.keys(secrets).length > 0) row.secrets = secrets;
    await upsertRows('user_settings', [row]);
  }

  async function pullSettings() {
    const s = await ensureFreshSession(); if (!s) return;
    const res = await authedFetch(`/rest/v1/user_settings?user_id=eq.${s.user.id}&select=data,secrets`, { method: 'GET' });
    if (!res.ok) return;
    const rows = await res.json(); if (!rows.length) return;
    const remote = rows[0].data || {};
    const key = await getEncKey();
    if (key && rows[0].secrets) {
      for (const path of SECRET_PATHS) {
        const enc = rows[0].secrets[path.join('.')];
        if (enc) { try { setPath(remote, path, await root.RvSyncCore.decryptSecret(enc, key)); } catch (e) { /* keep local secret */ } }
      }
    }
    const data = await getRvData();
    const localSettings = data.settings || {};
    // Preserve local secret values wherever remote can't supply a real one (no key / decrypt failed).
    for (const path of SECRET_PATHS) {
      const rv = getPath(remote, path);
      if (!rv) { const lv = getPath(localSettings, path); if (lv) setPath(remote, path, lv); }
    }
    data.settings = { ...localSettings, ...remote };
    await setRvData(data);
  }

  // Single-flight guard: triggers (save, alarm, list-open, syncPush) can overlap.
  // Concurrent cycles do read-modify-write on rvData and would clobber each other,
  // so coalesce — while one cycle runs, callers await the in-flight promise. If a
  // trigger arrives mid-cycle, run exactly one more cycle afterward (so the latest
  // local change isn't missed).
  let _inFlight = null;
  let _rerun = false;
  async function _runCycle() {
    try {
      // Bootstrap: on this device's FIRST sync, pull BEFORE push. Local settings
      // and secrets start empty on a fresh install; pushing them first would
      // upsert an empty `secrets`/default `data` over the server's, wiping the
      // user's encrypted API keys before pullSettings could restore them.
      const st = await getSyncState();
      if (!st.hydrated) {
        await pullRemoteChanges(); await pullSettings();
        await setSyncState({ ...(await getSyncState()), hydrated: true });
      }
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
  }
  async function syncCycle() {
    if (_inFlight) { _rerun = true; return _inFlight; }
    _inFlight = (async () => {
      try {
        do { _rerun = false; await _runCycle(); } while (_rerun);
      } finally { _inFlight = null; }
    })();
    return _inFlight;
  }

  root.RvSync = {
    getConfig, setConfig, getSession, setSession,
    signUp, signIn, signOut, ensureFreshSession, isLoggedIn,
    authHeaders, toSession, CONFIG_KEY, SESSION_KEY,
    authedFetch, upsertRows, fetchSince,
    pushLocalChanges, pullRemoteChanges, syncCycle,
    pushSettings, pullSettings, deriveKeyForSession, getEncKey,
    bookmarkToRow, rowToBookmark
  };
})(typeof self !== 'undefined' ? self : globalThis);
