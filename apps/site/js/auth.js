/* sosmn.org + admin.sosmn.org — sign-in (Google or Microsoft) and calls to the events server.
 * Shares the session with Meditation Copilot on sosmn.org (same storage key), so signing in once works for both.
 */
(function () {
  'use strict';
  var CFG = {
    apiBase: 'https://meditation-copilot-api.aknaik.workers.dev',
    googleClientId: '108186102394-sv306m8272h9p5eo4r5fvtolfgut3b09.apps.googleusercontent.com',
    microsoftClientId: 'cc706be3-4021-4460-9705-95d4cd0c00d0',
    copilotUrl: 'https://sosmn.org/copilot/',
    siteUrl: 'https://sosmn.org',
    center: 'mpls'
  };
  var SESSION_KEY = 'meditation-copilot:events-session', PKCE_KEY = 'sosmn:pkce';
  var MS_AUTH = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';

  function get(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  // For local testing only: point at a test events server
  var override = get('meditation-copilot:api-override', null);
  if (override && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(override)) CFG.apiBase = override;

  var session = get(SESSION_KEY, null);
  function valid() { return !!(session && session.token && session.exp > Date.now()); }
  var listeners = [];
  function changed() { listeners.forEach(function (f) { try { f(session); } catch (e) {} }); }

  function err(msg, status) { var e = new Error(msg); e.status = status; return e; }
  function api(method, path, body, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    if (valid()) headers.Authorization = 'Bearer ' + session.token;
    return fetch(CFG.apiBase + path, { method: method, headers: headers, body: body === undefined ? undefined : JSON.stringify(body) })
      .then(function (r) {
        if (opts.raw) return r;
        return r.text().then(function (t) {
          var j = {}; try { j = t ? JSON.parse(t) : {}; } catch (e) {}
          if (r.status === 401 && valid()) { session = null; del(SESSION_KEY); changed(); }
          if (!r.ok) throw err(j.error || ('Something went wrong (' + r.status + ')'), r.status);
          return j;
        });
      }, function () { throw err('Can’t reach the events server. Check your connection and try again.'); });
  }

  function startSession(provider, payload) {
    return api('POST', '/api/session', Object.assign({ provider: provider }, payload)).then(function (j) {
      session = { token: j.token, user: j.user, contact: j.contact || null, exp: j.exp ? j.exp - 60000 : Date.now() + 29 * 86400000, provider: provider };
      set(SESSION_KEY, session); changed();
      return session;
    });
  }

  /* ---- Google: a pop-up that returns an access token (email + profile only) ---- */
  var gClient = null, gPending = null;
  function loadScript(src) {
    return new Promise(function (res, rej) {
      if (document.querySelector('script[src="' + src + '"]')) return res();
      var s = document.createElement('script'); s.src = src; s.async = true; s.onload = res; s.onerror = function () { rej(err('Could not load the sign-in service.')); };
      document.head.appendChild(s);
    });
  }
  function prepareGoogle() {
    if (gClient) return Promise.resolve();
    return loadScript('https://accounts.google.com/gsi/client').then(function () {
      var o = window.google && window.google.accounts && window.google.accounts.oauth2;
      if (!o) throw err('Google sign-in is not available right now.');
      gClient = o.initTokenClient({
        client_id: CFG.googleClientId, scope: 'openid email profile', prompt: '',
        callback: function (r) {
          var h = gPending; gPending = null; if (!h) return;
          if (!r || r.error) return h.rej(err(r && r.error === 'access_denied' ? 'Sign-in was cancelled.' : 'Google sign-in failed.'));
          startSession('google', { accessToken: r.access_token }).then(h.res, h.rej);
        },
        error_callback: function (e) {
          var h = gPending; gPending = null; if (!h) return;
          h.rej(err(e && e.type === 'popup_failed_to_open' ? 'The sign-in window was blocked. Please allow pop-ups and try again.' : 'Sign-in was cancelled.'));
        }
      });
    });
  }
  function signInGoogle() {
    return prepareGoogle().then(function () {
      return new Promise(function (res, rej) { gPending = { res: res, rej: rej }; gClient.requestAccessToken(); });
    });
  }

  /* ---- Microsoft (personal accounts): full-page redirect with PKCE; comes back to the site's home page ---- */
  function b64url(bytes) {
    var s = ''; bytes = new Uint8Array(bytes);
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function rnd(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a); }
  function form(o) { return Object.keys(o).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(o[k]); }).join('&'); }
  function redirectUri() { return location.origin + '/'; }
  function signInMicrosoft() {
    var verifier = rnd(48), state = rnd(16);
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)).then(function (h) {
      set(PKCE_KEY, { verifier: verifier, state: state, at: Date.now(), back: location.pathname + location.search + location.hash });
      location.assign(MS_AUTH + '/authorize?' + form({
        client_id: CFG.microsoftClientId, response_type: 'code', redirect_uri: redirectUri(), response_mode: 'query',
        scope: 'openid profile email', state: state, code_challenge: b64url(h), code_challenge_method: 'S256', prompt: 'select_account'
      }));
      return new Promise(function () {});
    });
  }
  // Finish a Microsoft sign-in when we come back with ?code=…  (call once at start-up on every page)
  function handleRedirect() {
    var q = new URLSearchParams(location.search);
    // Only a real Microsoft return carries `state` (event QR links use ?code= for the door code)
    if (!q.has('state') || (!q.has('code') && !q.has('error'))) return Promise.resolve(false);
    var saved = get(PKCE_KEY, null); del(PKCE_KEY);
    var back = (saved && saved.back) || '/', here = location.pathname;
    history.replaceState(null, '', back);
    if (q.has('error')) return Promise.reject(err(q.get('error') === 'access_denied' ? 'Sign-in was cancelled.' : 'Microsoft sign-in failed.'));
    if (!saved || saved.state !== q.get('state') || Date.now() - saved.at > 15 * 60000) return Promise.reject(err('Sign-in could not be verified. Please try again.'));
    return fetch(MS_AUTH + '/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({ client_id: CFG.microsoftClientId, grant_type: 'authorization_code', code: q.get('code'), redirect_uri: redirectUri(), code_verifier: saved.verifier, scope: 'openid profile email' }) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.id_token) throw err('Microsoft sign-in failed.');
        return startSession('microsoft', { idToken: j.id_token });
      }).then(function () { if (back.split(/[?#]/)[0] !== here) location.replace(back); return true; });
  }

  function signOut() { session = null; del(SESSION_KEY); changed(); }
  function refreshMe() {
    if (!valid()) return Promise.resolve(null);
    return api('GET', '/api/me').then(function (j) { session.user = j.user; if (j.contact) session.contact = j.contact; set(SESSION_KEY, session); changed(); return session; });
  }
  function saveContact(c) {
    return api('PUT', '/api/me/contact', c).then(function (j) { session.contact = j.contact; set(SESSION_KEY, session); changed(); return j.contact; });
  }

  window.SOS = {
    CFG: CFG, api: api, valid: valid, session: function () { return valid() ? session : null; },
    user: function () { return valid() ? session.user : null; },
    contactOk: function () { return !!(valid() && session.contact && session.contact.confirmedAt); },
    signInGoogle: signInGoogle, signInMicrosoft: signInMicrosoft, prepareGoogle: prepareGoogle,
    // Local development only: the local server accepts a test sign-in with any email (DEV_LOGIN in api/.dev.vars)
    isLocal: /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(CFG.apiBase),
    signInTest: function (email, name) { return startSession('dev', { email: email, name: name }); },
    handleRedirect: handleRedirect, signOut: signOut, refreshMe: refreshMe, saveContact: saveContact,
    onChange: function (f) { listeners.push(f); }, store: { get: get, set: set, del: del },
    esc: function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  };
})();
