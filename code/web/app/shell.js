(function () {
  'use strict';

  // The site is served from the domain root; kept as a constant so callers still
  // build their URLs in one place.
  window.AD_BASE = '';

  window.AD_href = function (route, params) {
    var u = window.AD_BASE + '/' + route;
    var qs = [];
    Object.keys(params || {}).forEach(function (k) {
      var v = params[k];
      if (v !== null && v !== undefined && v !== '') {
        qs.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
      }
    });
    return qs.length ? u + '?' + qs.join('&') : u;
  };

  window.AD_setParam = function (key, value) {
    var u = new URL(location.href);
    if (value === null || value === undefined || value === '') u.searchParams.delete(key);
    else u.searchParams.set(key, value);
    history.replaceState(null, '', u);
  };
  window.AD_getParam = function (key) {
    return new URL(location.href).searchParams.get(key);
  };

  var BUNDLE = window.AD_I18N || { languages: ['en'], defaultLang: 'en', strings: {} };
  var LANG_KEY = 'ad-lang';

  function langLabel(code) {
    return window.t('lang.endonym.' + code.replace(/-/g, '_').toLowerCase());
  }

  // English is the default. The browser's own language is deliberately not consulted:
  // whoever opens this gets the same page as the link they were sent, and the picker
  // in the top-right corner is one click away. Order: URL, then the visitor's own
  // earlier choice, then English.
  function resolveLang() {
    var fromUrl = window.AD_getParam('lang');
    if (fromUrl && BUNDLE.languages.indexOf(fromUrl) >= 0) return fromUrl;
    var saved = null;
    try { saved = localStorage.getItem(LANG_KEY); } catch (e) {  }
    if (saved && BUNDLE.languages.indexOf(saved) >= 0) return saved;
    return BUNDLE.defaultLang;
  }

  window.AD_LANG = resolveLang();
  window.AD_LANGS = BUNDLE.languages;

  window.t = function (token, params) {
    var entry = BUNDLE.strings[token];
    var text = token;
    if (entry) text = entry[window.AD_LANG] || entry[BUNDLE.defaultLang] || token;
    if (params) {
      text = text.replace(/\{(\w+)\}/g, function (m, k) {
        return Object.prototype.hasOwnProperty.call(params, k) ? String(params[k]) : m;
      });
    }
    return text;
  };

  window.AD_hasToken = function (token) {
    return Object.prototype.hasOwnProperty.call(BUNDLE.strings, token);
  };

  window.AD_applyI18n = function (root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = window.t(el.getAttribute('data-i18n'));
    });
    root.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      el.title = window.t(el.getAttribute('data-i18n-title'));
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      el.placeholder = window.t(el.getAttribute('data-i18n-placeholder'));
    });
    root.querySelectorAll('[data-i18n-content]').forEach(function (el) {
      el.setAttribute('content', window.t(el.getAttribute('data-i18n-content')));
    });
    root.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      el.setAttribute('aria-label', window.t(el.getAttribute('data-i18n-aria')));
    });
  };

  var langListeners = [];
  window.AD_onLangChange = function (fn) { langListeners.push(fn); };

  window.AD_setLang = function (lang) {
    if (BUNDLE.languages.indexOf(lang) < 0 || lang === window.AD_LANG) return;
    window.AD_LANG = lang;
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) {  }
    window.AD_setParam('lang', lang);
    document.documentElement.lang = lang;
    window.AD_applyI18n(document);
    langListeners.forEach(function (fn) { try { fn(lang); } catch (e) { console.error(e); } });
  };

  window.AD_langPicker = function (host) {
    if (!host) return null;
    var pick = document.createElement('div');
    pick.className = 'langpick';
    var sel = document.createElement('select');
    sel.setAttribute('data-i18n-aria', 'common.language');
    BUNDLE.languages.forEach(function (l) {
      var o = document.createElement('option');
      o.value = l;
      o.textContent = langLabel(l);
      sel.appendChild(o);
    });
    sel.value = window.AD_LANG;
    sel.addEventListener('change', function () { window.AD_setLang(sel.value); });
    window.AD_onLangChange(function (lang) { sel.value = lang; });
    pick.appendChild(sel);
    host.appendChild(pick);
    window.AD_applyI18n(pick);
    return sel;
  };

  var NAV = ['demo'];

  function buildHeader() {
    var host = document.getElementById('ad-header');
    if (!host) return;
    var cur = location.pathname.split('/').filter(Boolean).pop() || 'demo';
    var lang = window.AD_LANG;

    var brand = document.createElement('a');
    brand.className = 'brand';
    brand.href = window.AD_href('demo', { lang: lang });
    brand.setAttribute('data-i18n', 'app.name');
    host.appendChild(brand);

    var nav = document.createElement('nav');
    nav.className = 'mainnav';
    NAV.forEach(function (route) {
      var a = document.createElement('a');
      a.href = window.AD_href(route, { lang: lang });
      a.setAttribute('data-i18n', 'nav.' + route);
      if (cur === route) a.className = 'on';
      nav.appendChild(a);
    });
    host.appendChild(nav);

    var sel = window.AD_langPicker(host);
    if (sel) sel.id = 'ad-lang';
  }

  function syncLinks() {
    document.querySelectorAll('a[href^="' + window.AD_BASE + '/"]').forEach(function (a) {
      var u = new URL(a.href, location.origin);
      u.searchParams.set('lang', window.AD_LANG);
      a.href = u.pathname + u.search;
    });
  }
  window.AD_onLangChange(syncLinks);

  window.AD_num = function (v, digits) {
    if (typeof v !== 'number' || !isFinite(v)) return String(v);
    try {
      return v.toLocaleString(window.AD_LANG, {
        minimumFractionDigits: digits === undefined ? 0 : digits,
        maximumFractionDigits: digits === undefined ? 4 : digits
      });
    } catch (e) {
      return digits === undefined ? String(v) : v.toFixed(digits);
    }
  };

  document.addEventListener('DOMContentLoaded', function () {
    document.documentElement.lang = window.AD_LANG;
    buildHeader();
    window.AD_applyI18n(document);
    syncLinks();
    if (!window.AD_getParam('lang')) window.AD_setParam('lang', window.AD_LANG);
    document.body.classList.add('ready');
  });
})();
