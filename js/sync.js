/* Meditation Copilot — sign-in and cloud sync
 *
 * Providers (no server of ours, no client secrets):
 *   Google    — Google Identity Services token client (pop-up), Drive API v3 appDataFolder
 *               (hidden folder only this app can see). Scope: drive.appdata (non-sensitive).
 *   Microsoft — OAuth 2.0 Authorization Code + PKCE (full-page redirect), personal accounts,
 *               Microsoft Graph app folder: OneDrive/Apps/Meditation Copilot. Scope: Files.ReadWrite.AppFolder.
 *
 * Data: one file "meditation-copilot.json" holding MC.snapshot(). Each sync = pull → merge → push
 * (push only when the merged data differs from what is in the cloud).
 */
(function () {
  'use strict';
  var MC = window.MC, CFG = window.MC_CONFIG || {};
  var FILE = 'meditation-copilot.json';
  var TOKENS_KEY = 'meditation-copilot:tokens';
  var SYNC_KEY = 'meditation-copilot:sync';
  var PKCE_KEY = 'meditation-copilot:pkce';

  var tokens = MC.store.get(TOKENS_KEY, {}) || {};
  function saveTokens() { MC.store.set(TOKENS_KEY, tokens); }
  var meta = Object.assign({ lastSyncAt: 0 }, MC.store.get(SYNC_KEY, {}));
  function saveMeta() { MC.store.set(SYNC_KEY, meta); }
  var state = { status: 'idle', error: '' };

  function err(msg, extra) { var e = new Error(msg); if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; }); return e; }

  function loadScript(src) {
    return new Promise(function (res, rej) {
      if (document.querySelector('script[data-src="' + src + '"]')) return res();
      var s = document.createElement('script');
      s.src = src; s.async = true; s.setAttribute('data-src', src);
      s.onload = function () { res(); };
      s.onerror = function () { s.remove(); rej(err('Could not load the sign-in library. Check your internet connection.')); };
      document.head.appendChild(s);
    });
  }

  /* ======================= Google ======================= */
  var G_SCOPE_DRIVE = 'https://www.googleapis.com/auth/drive.appdata';
  var gClient = null, gPending = null;
  var G = {
    id: 'google', name: 'Google', storeName: 'Google Drive',
    ready: !!CFG.googleClientId,
    email: function () { return (tokens.google && tokens.google.email) || ''; },
    canSync: function () { var t = tokens.google; return !!(t && t.access && t.exp > Date.now() + 60000); },
    // Load Google's library early so a tap can open the sign-in pop-up immediately
    // (Safari blocks pop-ups that open after an asynchronous wait).
    prepare: function () {
      if (!G.ready || gClient) return Promise.resolve();
      return loadScript('https://accounts.google.com/gsi/client').then(function () {
        var oauth2 = window.google && window.google.accounts && window.google.accounts.oauth2;
        if (!oauth2 || gClient) return;
        gClient = oauth2.initTokenClient({
          client_id: CFG.googleClientId,
          scope: 'openid email ' + G_SCOPE_DRIVE,
          prompt: '',
          callback: function (r) {
            var h = gPending; gPending = null; if (!h) return;
            if (!r || r.error) return h.rej(err(r && r.error === 'access_denied' ? 'Sign-in was cancelled.' : 'Google sign-in failed (' + ((r && r.error) || 'unknown') + ').'));
            if (oauth2.hasGrantedAllScopes && !oauth2.hasGrantedAllScopes(r, G_SCOPE_DRIVE)) {
              return h.rej(err('Please allow access to the app\u2019s own Google Drive folder so your data can be saved.'));
            }
            tokens.google = { access: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000, email: G.email() };
            saveTokens(); h.res();
          },
          error_callback: function (e) {
            var h = gPending; gPending = null; if (!h) return;
            h.rej(err(e && e.type === 'popup_failed_to_open' ? 'The sign-in window was blocked. Please allow pop-ups and try again.' : 'Sign-in was cancelled.'));
          }
        });
      });
    },
    signIn: function () {
      function open() {
        return new Promise(function (res, rej) {
          gPending = { res: res, rej: rej };
          gClient.requestAccessToken({ login_hint: G.email() || undefined });
        });
      }
      var p = gClient ? open() : G.prepare().then(function () {
        if (!gClient) throw err('Google sign-in is not available right now.');
        return open();
      });
      return p.then(function () {
        return gApi('https://www.googleapis.com/oauth2/v3/userinfo').then(function (u) {
          tokens.google.email = (u && u.email) || ''; saveTokens();
        });
      });
    },
    signOut: function () {
      var t = tokens.google;
      try { if (t && t.access && window.google && window.google.accounts) window.google.accounts.oauth2.revoke(t.access, function () {}); } catch (e) {}
      delete tokens.google; saveTokens();
      return Promise.resolve();
    },
    pull: function () {
      var q = encodeURIComponent("name='" + FILE + "' and trashed=false");
      return gApi('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=' + q + '&fields=files(id,modifiedTime)&orderBy=modifiedTime%20desc')
        .then(function (list) {
          var f = list && list.files && list.files[0];
          if (!f) return { data: null, ref: null };
          return gApi('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(f.id) + '?alt=media')
            .then(function (data) { return { data: data, ref: f.id }; });
        });
    },
    push: function (snap, ref) {
      var body = JSON.stringify(snap);
      if (ref) {
        return gApi('https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(ref) + '?uploadType=media&fields=id',
          { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: body });
      }
      var b = 'mc' + Math.random().toString(36).slice(2);
      var multipart = '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify({ name: FILE, parents: ['appDataFolder'], mimeType: 'application/json' }) + '\r\n' +
        '--' + b + '\r\nContent-Type: application/json\r\n\r\n' + body + '\r\n--' + b + '--';
      return gApi('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
        { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body: multipart });
    }
  };
  function gApi(url, opts) {
    if (!G.canSync()) return Promise.reject(err('Google sign-in has expired.', { needsAuth: true }));
    opts = opts || {};
    opts.headers = Object.assign({ Authorization: 'Bearer ' + tokens.google.access }, opts.headers || {});
    return fetch(url, opts).then(function (r) {
      if (r.status === 401) { tokens.google.exp = 0; saveTokens(); throw err('Google sign-in has expired.', { needsAuth: true }); }
      if (!r.ok) throw err('Google Drive error ' + r.status);
      return r.status === 204 ? null : r.json();
    });
  }

  /* ======================= Microsoft ======================= */
  var MS_AUTH = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
  var MS_SCOPE = 'openid profile offline_access User.Read Files.ReadWrite.AppFolder';
  var GRAPH = 'https://graph.microsoft.com/v1.0';
  function redirectUri() { return location.origin + location.pathname.replace(/index\.html$/, ''); }
  function b64url(bytes) {
    var s = ''; bytes = new Uint8Array(bytes);
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function randomString(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a); }
  function form(o) { return Object.keys(o).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(o[k]); }).join('&'); }
  function msSaveTokens(r) {
    tokens.microsoft = Object.assign(tokens.microsoft || {}, {
      access: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000,
      refresh: r.refresh_token || (tokens.microsoft && tokens.microsoft.refresh) || '',
      idToken: r.id_token || (tokens.microsoft && tokens.microsoft.idToken) || '',       // proves identity to our events server
      idExp: r.id_token ? Date.now() + 55 * 60000 : ((tokens.microsoft && tokens.microsoft.idExp) || 0)
    });
    saveTokens();
  }
  function msToken(params) {
    params.client_id = CFG.microsoftClientId;
    return fetch(MS_AUTH + '/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form(params) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok || !x.j.access_token) throw err('Microsoft sign-in failed' + (x.j && x.j.error ? ' (' + x.j.error + ')' : '') + '.', { needsAuth: true });
        msSaveTokens(x.j);
      });
  }
  var M = {
    id: 'microsoft', name: 'Microsoft', storeName: 'OneDrive',
    ready: !!CFG.microsoftClientId,
    email: function () { return (tokens.microsoft && tokens.microsoft.email) || ''; },
    canSync: function () { var t = tokens.microsoft; return !!(t && ((t.access && t.exp > Date.now() + 60000) || t.refresh)); },
    signIn: function () {
      // Full-page redirect to Microsoft; we come back to this page with ?code=…
      var verifier = randomString(48), st = randomString(16);
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)).then(function (hash) {
        MC.store.set(PKCE_KEY, { verifier: verifier, state: st, at: Date.now(), hash: location.hash || '#home' });
        location.assign(MS_AUTH + '/authorize?' + form({
          client_id: CFG.microsoftClientId, response_type: 'code', redirect_uri: redirectUri(),
          response_mode: 'query', scope: MS_SCOPE, state: st,
          code_challenge: b64url(hash), code_challenge_method: 'S256', prompt: 'select_account',
          login_hint: M.email() || ''
        }));
        return new Promise(function () {});   // the page is navigating away
      });
    },
    // Called once at start-up: finish a Microsoft sign-in if we were redirected back
    handleRedirect: function () {
      var q = new URLSearchParams(location.search);
      if (!q.has('code') && !q.has('error')) return Promise.resolve(false);
      var saved = MC.store.get(PKCE_KEY, null);
      MC.store.del(PKCE_KEY);
      var back = (saved && saved.hash) || '#home';
      history.replaceState(null, '', location.pathname + back);   // remove ?code from the address bar
      if (q.has('error')) return Promise.reject(err(q.get('error') === 'access_denied' ? 'Sign-in was cancelled.' : 'Microsoft sign-in failed (' + q.get('error') + ').'));
      if (!saved || saved.state !== q.get('state') || Date.now() - saved.at > 15 * 60000) return Promise.reject(err('Sign-in could not be verified. Please try again.'));
      return msToken({ grant_type: 'authorization_code', code: q.get('code'), redirect_uri: redirectUri(), code_verifier: saved.verifier, scope: MS_SCOPE })
        .then(function () { return msApi(GRAPH + '/me?$select=mail,userPrincipalName'); })
        .then(function (me) { tokens.microsoft.email = (me && (me.mail || me.userPrincipalName)) || ''; saveTokens(); return true; });
    },
    signOut: function () { delete tokens.microsoft; saveTokens(); return Promise.resolve(); },
    pull: function () {
      return msApi(GRAPH + '/me/drive/special/approot:/' + FILE, null, true).then(function (item) {
        if (!item) return { data: null, ref: null };
        var url = item['@microsoft.graph.downloadUrl'];
        if (!url) throw err('OneDrive did not return a download link.');
        return fetch(url).then(function (r) {
          if (!r.ok) throw err('OneDrive download error ' + r.status);
          return r.json();
        }).then(function (data) { return { data: data, ref: item.eTag }; });
      });
    },
    push: function (snap, ref) {
      var headers = { 'Content-Type': 'application/json' };
      if (ref) headers['If-Match'] = ref;
      return msApi(GRAPH + '/me/drive/special/approot:/' + FILE + ':/content', { method: 'PUT', headers: headers, body: JSON.stringify(snap) });
    }
  };
  function msEnsure() {
    var t = tokens.microsoft;
    if (t && t.access && t.exp > Date.now() + 60000) return Promise.resolve();
    if (t && t.refresh) return msToken({ grant_type: 'refresh_token', refresh_token: t.refresh, scope: MS_SCOPE });
    return Promise.reject(err('Microsoft sign-in has expired.', { needsAuth: true }));
  }
  function msApi(url, opts, allow404, retried) {
    return msEnsure().then(function () {
      var o = Object.assign({}, opts || {});
      o.headers = Object.assign({ Authorization: 'Bearer ' + tokens.microsoft.access }, (opts && opts.headers) || {});
      return fetch(url, o);
    }).then(function (r) {
      if (r.status === 401 && !retried) { tokens.microsoft.exp = 0; saveTokens(); return msApi(url, opts, allow404, true); }
      if (r.status === 401) { var t = tokens.microsoft; if (t) { t.refresh = ''; t.exp = 0; saveTokens(); } throw err('Microsoft sign-in has expired.', { needsAuth: true }); }
      if (r.status === 404 && allow404) return null;
      if (r.status === 412) throw err('The OneDrive copy changed during sync.', { conflict: true });
      if (!r.ok) throw err('OneDrive error ' + r.status);
      return r.status === 204 ? null : r.json();
    });
  }

  /* ======================= Sync engine ======================= */
  var providers = { google: G, microsoft: M };
  function current() { return providers[MC.account.mode()] || null; }
  function setStatus(s, e) { state.status = s; state.error = e || ''; MC.emit('sync', state); }

  // Compare data ignoring the save time, so we only upload real changes
  function fingerprint(x) {
    if (!x) return '';
    var ss = (x.sessions || []).slice().sort(function (a, b) { return a.id < b.id ? -1 : 1; });
    var dd = (x.deleted || []).slice().sort(function (a, b) { return a.id < b.id ? -1 : 1; });
    var cols = {};
    Object.keys(x.collections || {}).sort().forEach(function (n) {
      var c = x.collections[n];
      cols[n] = [(c.items || []).slice().sort(function (a, b) { return a.id < b.id ? -1 : 1; }),
                 (c.deleted || []).slice().sort(function (a, b) { return a.id < b.id ? -1 : 1; })];
    });
    return JSON.stringify([x.profile, x.profileUpdatedAt, x.settings, x.settingsUpdatedAt, ss, dd, cols]);
  }

  var running = null, again = false, timer = null;
  function attempt(p, n) {
    return p.pull().then(function (r) {
      if (r.data) MC.mergeSnapshot(r.data);
      var local = MC.snapshot();
      if (r.data && fingerprint(local) === fingerprint(r.data)) return;
      return p.push(local, r.ref);
    }).catch(function (e) {
      if (e.conflict && n < 2) return attempt(p, n + 1);
      throw e;
    });
  }
  function run() {
    var p = current();
    if (!p) return Promise.resolve();
    if (running) { again = true; return running; }
    if (!navigator.onLine) { setStatus('offline'); return Promise.resolve(); }
    if (!p.canSync()) { setStatus('needs-auth'); return Promise.resolve(); }
    setStatus('syncing');
    running = attempt(p, 0).then(function () {
      meta.lastSyncAt = Date.now(); saveMeta(); setStatus('ok');
      MC.diag.add('sync_ok', { provider: p.id });
    }).catch(function (e) {
      if (e.needsAuth) { setStatus('needs-auth'); MC.diag.add('sync_needs_auth', { provider: p.id }); }
      else { setStatus('error', e.message); MC.diag.add('sync_error', { provider: p.id, msg: String(e.message || e) }); }
    }).then(function () {
      running = null;
      if (again) { again = false; return run(); }
    });
    return running;
  }
  function schedule(ms) {
    if (!current()) return;
    clearTimeout(timer);
    timer = setTimeout(run, ms == null ? 4000 : ms);
  }

  MC.sync = {
    providers: providers,
    state: function () { return state; },
    lastSyncAt: function () { return meta.lastSyncAt; },
    provider: current,
    run: run,
    schedule: schedule,
    // Interactive sign-in from the welcome screen or Account sheet (must be called from a tap)
    signIn: function (id) {
      var p = providers[id];
      if (!p || !p.ready) return Promise.reject(err('This sign-in option is not available yet.'));
      setStatus('connecting');
      return p.signIn().then(function () {
        MC.account.setMode(id, p.email());
        MC.track('signin', { provider: id });
        return run();
      }).catch(function (e) { setStatus(current() ? 'needs-auth' : 'idle'); throw e; });
    },
    // "Reconnect" after a token expired (Google ~1 hour; Microsoft after about a day)
    reconnect: function () { var p = current(); return p ? MC.sync.signIn(p.id) : Promise.resolve(); },
    // Token our events server can verify: Google access token (audience-checked) or Microsoft ID token.
    // Returns a promise; for Microsoft it renews silently with the refresh token if needed.
    identityToken: function () {
      var p = current();
      if (!p) return Promise.reject(err('Please sign in with Google or Microsoft.', { needsAuth: true }));
      if (p.id === 'google') {
        return G.canSync() ? Promise.resolve({ provider: 'google', accessToken: tokens.google.access })
          : Promise.reject(err('Please reconnect Google.', { needsAuth: true }));
      }
      var t = tokens.microsoft || {};
      if (t.idToken && t.idExp > Date.now() + 60000) return Promise.resolve({ provider: 'microsoft', idToken: t.idToken });
      if (!t.refresh) return Promise.reject(err('Please reconnect Microsoft.', { needsAuth: true }));
      return msToken({ grant_type: 'refresh_token', refresh_token: t.refresh, scope: MS_SCOPE }).then(function () {
        var n = tokens.microsoft;
        if (!n.idToken) throw err('Please reconnect Microsoft.', { needsAuth: true });
        return { provider: 'microsoft', idToken: n.idToken };
      });
    },
    signOut: function (removeLocal) {
      var p = current();
      MC.emit('signout');
      return (p ? p.signOut() : Promise.resolve()).then(function () {
        MC.track('signout', { provider: p ? p.id : 'none' });
        meta.lastSyncAt = 0; saveMeta();
        if (removeLocal) MC.clearLocalData();
        setStatus('idle');
      });
    },
    // Start-up: finish a Microsoft redirect if present, then sync
    init: function () {
      if (MC.account.mode() === 'google' || MC.account.mode() === 'none' || MC.account.mode() === 'guest') G.prepare().catch(function () {});
      return M.handleRedirect().then(function (didSignIn) {
        if (didSignIn) {
          MC.account.setMode('microsoft', M.email());
          MC.track('signin', { provider: 'microsoft' });
          MC.toast('Signed in with Microsoft. Syncing with OneDrive…');
        }
        return run();
      }).catch(function (e) {
        MC.toast(e.message || 'Sign-in failed.', 4500);
        MC.diag.add('signin_error', { provider: 'microsoft', msg: String(e.message || e) });
      });
    }
  };

  // Sync after local changes, when the app returns to the foreground, and when back online
  MC.on('changed', function () { schedule(); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') schedule(500); });
  window.addEventListener('online', function () { schedule(500); });
  window.addEventListener('offline', function () { if (current()) setStatus('offline'); });
})();
