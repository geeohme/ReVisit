// Shared theme controller for all ReVisit surfaces.
// Source of truth for the color SCHEME (paper | quiet | system) and the
// light/dark THEME. Persisted in localStorage; applied to <html> as
// data-scheme / data-theme, which styles.css maps to its token sets.
//
// Defaults: scheme = "paper" (Direction A · Paper & Ink), theme = "light".
// This file is pure presentation — it touches no rvData/rvLocal and no sync.
(function () {
  const SCHEME_KEY = 'rvScheme';
  const THEME_KEY = 'rvTheme';
  const SCHEMES = ['paper', 'quiet', 'system'];
  const THEMES = ['light', 'dark'];
  const DEFAULT_SCHEME = 'paper';
  const DEFAULT_THEME = 'light';

  const root = document.documentElement;

  function readScheme() {
    const s = localStorage.getItem(SCHEME_KEY);
    return SCHEMES.includes(s) ? s : DEFAULT_SCHEME;
  }
  function readTheme() {
    // One-time migration from the legacy 'theme' key used by the old list page.
    let t = localStorage.getItem(THEME_KEY);
    if (!THEMES.includes(t)) {
      const legacy = localStorage.getItem('theme');
      t = THEMES.includes(legacy) ? legacy : DEFAULT_THEME;
    }
    return t;
  }

  function apply() {
    root.setAttribute('data-scheme', readScheme());
    root.setAttribute('data-theme', readTheme());
    mirrorToChromeStorage();
  }

  // Mirror the choice into chrome.storage.local so the content-script capture card
  // (which can't see an extension page's localStorage) can match the active scheme.
  function mirrorToChromeStorage() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ rvScheme: readScheme(), rvTheme: readTheme() });
      }
    } catch (e) { /* not in an extension context */ }
  }

  // Apply as early as possible to avoid a flash of the wrong scheme.
  apply();

  window.RvTheme = {
    SCHEMES,
    THEMES,
    getScheme: readScheme,
    getTheme: readTheme,
    setScheme(s) {
      if (!SCHEMES.includes(s)) return;
      localStorage.setItem(SCHEME_KEY, s);
      apply();
      window.dispatchEvent(new CustomEvent('rv-theme-change', { detail: { scheme: s, theme: readTheme() } }));
    },
    setTheme(t) {
      if (!THEMES.includes(t)) return;
      localStorage.setItem(THEME_KEY, t);
      localStorage.setItem('theme', t); // keep legacy key in sync for any old reader
      apply();
      window.dispatchEvent(new CustomEvent('rv-theme-change', { detail: { scheme: readScheme(), theme: t } }));
    },
    toggleTheme() {
      this.setTheme(readTheme() === 'dark' ? 'light' : 'dark');
    },
    apply,
  };
})();
