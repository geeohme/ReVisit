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

  root.RvSync = {
    getConfig, setConfig, getSession, setSession,
    signUp, signIn, signOut, ensureFreshSession, isLoggedIn,
    authHeaders, toSession, CONFIG_KEY, SESSION_KEY
  };
})(typeof self !== 'undefined' ? self : globalThis);
