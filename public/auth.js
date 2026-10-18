'use strict';
/* ==========================================================
   Nova — accounts
   Supabase Auth handles passwords and Google sign-in.
   If it isn't configured (see config.js), guest mode still works.
   ========================================================== */

Object.assign(I, {
  'badge-check': '<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>',
});

(() => {
  const SB_URL = window.NOVA_SUPABASE_URL, SB_KEY = window.NOVA_SUPABASE_KEY;
  const configured = !!(SB_URL && SB_KEY && window.supabase && window.supabase.createClient);
  const sb = configured ? window.supabase.createClient(SB_URL, SB_KEY) : null;

  let mode = 'login', user = null, busy = false, recovering = false, appliedId = null;
  let session = null, dbReady = null, saveTimer = null, hist = null;
  const AVATAR_OK = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
  const NOT_SET = "Accounts aren't switched on for this site yet. You can continue as guest.";

  const api = window.novaAuth = {
    sb,
    get user() { return user; },
    get email() { return user ? user.email || '' : ''; },
    get dbReady() { return dbReady; },
    token: () => (session ? session.access_token : null),
    async freshToken() {
      if (!sb) return null;
      try { session = (await sb.auth.getSession()).data.session; } catch { /* offline */ }
      return session ? session.access_token : null;
    },
    saveName(name) {
      if (sb && user && name) sb.auth.updateUser({ data: { full_name: name } }).catch(() => {});
      api.saveProfile();
    },
    saveProfile() {
      if (!sb || !user) return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(pushProfile, 600);
    },
    toAuth: () => toAuth(),
    async signOut() {
      if (typeof joined === 'function' && joined()) return toast('Leave the meeting first');
      if (user && sb) await sb.auth.signOut().catch(() => {});
      user = null; session = null; appliedId = null; hist = null;
      sessionStorage.removeItem('nova.guest');
      toAuth();
    },
    async changePassword(pw) {
      if (!sb || !user) return 'You are not signed in.';
      const { error } = await sb.auth.updateUser({ password: pw });
      return error ? friendly(error.message) : '';
    },
    async fetchHistory() {
      if (!sb || !user) return null;
      const { data, error } = await sb.from('meetings').select('code,role,started_at,duration_s,max_people').order('started_at', { ascending: false }).limit(20);
      if (error) { dbReady = false; return null; }
      dbReady = true;
      return data;
    },
    async clearHistory() {
      if (!sb || !user) return false;
      const { error } = await sb.from('meetings').delete().eq('user_id', user.id);
      return !error;
    },
    async serverVerifies() {
      try { const r = await fetch((window.NOVA_SERVER || '') + '/api/info'); return !!(await r.json()).verify; } catch { return null; }
    },
    async meetingStarted(code, role) {
      if (!sb || !user || dbReady === false) return;
      try {
        const { data, error } = await sb.from('meetings').insert({ user_id: user.id, code, role }).select('id').single();
        if (error) throw error;
        dbReady = true;
        hist = { id: data.id, startedAt: Date.now(), max: state.users.size };
        hist.timer = setInterval(tickHist, 20000);
      } catch { dbReady = false; }
    },
  };

  /* ---------------- cloud profile + meeting history ---------------- */
  async function pushProfile() {
    if (!sb || !user) return;
    const { error } = await sb.from('profiles').upsert({
      id: user.id, display_name: nameInput.value.trim() || null, avatar: state.avatar || null, updated_at: new Date().toISOString(),
    });
    dbReady = !error;
    if (error) console.warn('Nova: profile not saved:', error.message);
  }
  async function loadProfile() {
    if (!sb || !user) return;
    const { data, error } = await sb.from('profiles').select('display_name,avatar').eq('id', user.id).maybeSingle();
    if (error) { dbReady = false; console.warn('Nova: profile not loaded:', error.message); return; }
    dbReady = true;
    if (!data) return pushProfile(); // first login: save what we have
    if (data.display_name) {
      nameInput.value = data.display_name;
      try { localStorage.setItem('nova.name', data.display_name); } catch { /* ignore */ }
    }
    if (data.avatar && AVATAR_OK.test(data.avatar)) {
      state.avatar = data.avatar;
      try { localStorage.setItem('nova.avatar', data.avatar); } catch { /* ignore */ }
    }
    renderLobby(); updateAcct();
  }
  const histPayload = () => {
    hist.max = Math.max(hist.max, state.users.size);
    return { duration_s: Math.round((Date.now() - hist.startedAt) / 1000), max_people: hist.max };
  };
  async function tickHist() {
    if (!hist || !sb) return;
    await sb.from('meetings').update(histPayload()).eq('id', hist.id);
  }
  // save the final duration even while the tab is closing
  window.addEventListener('pagehide', () => {
    if (!hist || !session) return;
    fetch(`${SB_URL}/rest/v1/meetings?id=eq.${hist.id}`, {
      method: 'PATCH', keepalive: true,
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(histPayload()),
    }).catch(() => {});
  });

  /* ---------------- small helpers ---------------- */
  const msg = (text, ok = false) => {
    const el = $('#auth-msg');
    el.textContent = text || '';
    el.classList.toggle('ok', ok);
  };
  const fail = (text) => { msg(text); sfx.play('alert'); };
  const friendly = (m = '') => {
    if (/invalid login/i.test(m)) return 'That email and password don\'t match.';
    if (/already registered|already been registered/i.test(m)) return 'That email already has an account. Try logging in.';
    if (/rate limit|too many/i.test(m)) return 'Too many tries. Wait a minute and try again.';
    if (/email not confirmed/i.test(m)) return 'Confirm your email first. Check your inbox for the link.';
    return m || 'Something went wrong. Please try again.';
  };
  const setBusy = (b) => {
    busy = b;
    const btn = $('#auth-submit');
    btn.disabled = b;
    btn.classList.toggle('loading', b);
  };

  const urlToAvatar = (url) => new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const S = 160, c = document.createElement('canvas');
        c.width = c.height = S;
        const m = Math.min(img.width, img.height);
        c.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, S, S);
        resolve(c.toDataURL('image/jpeg', 0.86));
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });

  /* ---------------- views ---------------- */
  function setMode(m) {
    mode = m;
    msg('');
    const login = m === 'login', signup = m === 'signup', reset = m === 'reset';
    $$('#auth-seg button').forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
    $('#auth-seg').hidden = reset;
    $('#f-name').hidden = !signup;
    $('#f-email').hidden = reset;
    $('#forgot').hidden = !login;
    $('#auth-or').hidden = reset;
    $('#google-btn').hidden = reset;
    $('#guest-btn').hidden = reset;
    $('#a-pass').autocomplete = login ? 'current-password' : 'new-password';
    $('#auth-title').textContent = login ? 'Welcome back' : signup ? 'Create your account' : 'Choose a new password';
    $('#auth-sub').textContent = login ? 'Log in to keep your name on every device.'
      : signup ? 'It takes a few seconds. Guests can still join without one.'
      : 'Pick a password you haven\'t used before.';
    $('#auth-submit').textContent = login ? 'Log in' : signup ? 'Create account' : 'Save password';
    const f = $('#auth-form');
    f.classList.remove('swap'); void f.offsetWidth; f.classList.add('swap');
  }

  function updateAcct() {
    const av = $('#acct-av'), nm = $('#acct-name'), btn = $('#acct-btn');
    if (user) {
      const name = nameInput.value.trim() || (user.email || 'You').split('@')[0];
      av.innerHTML = avatar({ name, avatar: state.avatar }, 'sm');
      nm.textContent = name;
      btn.textContent = 'Sign out';
    } else {
      av.innerHTML = '';
      nm.textContent = 'Guest';
      btn.textContent = 'Log in';
    }
  }

  function enterLobby() {
    recovering = false;
    showView('lobby');
    updateAcct();
    const stash = sessionStorage.getItem('nova.code');
    if (stash) {
      if (!$('#code-input').value) $('#code-input').value = stash;
      sessionStorage.removeItem('nova.code');
    }
  }
  function toAuth() {
    showView('auth');
    setMode('login');
  }

  function setUser(u) {
    user = u;
    if (u && appliedId !== u.id) {
      appliedId = u.id;
      sessionStorage.removeItem('nova.guest');
      const md = u.user_metadata || {};
      const name = md.full_name || md.name || (u.email || '').split('@')[0];
      if (name) {
        nameInput.value = name;
        try { localStorage.setItem('nova.name', name); } catch { /* ignore */ }
      }
      const pic = md.avatar_url || md.picture;
      if (pic && !state.avatar) {
        urlToAvatar(pic).then((a) => {
          if (!a || state.avatar) return;
          state.avatar = a;
          try { localStorage.setItem('nova.avatar', a); } catch { /* ignore */ }
          renderLobby(); updateAcct();
          api.saveProfile();
        });
      }
      renderLobby();
      setTimeout(loadProfile, 0); // not inside the auth callback
    }
    updateAcct();
  }

  /* ---------------- actions ---------------- */
  $$('#auth-seg button').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));

  const eye = $('#pw-eye');
  const paintEye = (show) => {
    $('#a-pass').type = show ? 'text' : 'password';
    eye.innerHTML = icon(show ? 'eye-off' : 'eye', 19);
    eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  };
  paintEye(false);
  eye.onclick = () => paintEye($('#a-pass').type === 'password');

  $('#auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!sb) return fail(NOT_SET);
    const email = $('#a-email').value.trim(), pass = $('#a-pass').value, name = $('#a-name').value.trim();
    if (mode !== 'reset' && !/^\S+@\S+\.\S+$/.test(email)) return fail('Enter a valid email address.');
    if (pass.length < 6) return fail('Password must be at least 6 characters.');
    if (mode === 'signup' && !name) return fail('Enter your name.');

    setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await sb.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
        sfx.play('welcome');
        enterLobby();
      } else if (mode === 'signup') {
        const { data, error } = await sb.auth.signUp({
          email, password: pass,
          options: { data: { full_name: name }, emailRedirectTo: location.origin + '/' },
        });
        if (error) throw error;
        if (data.session) { sfx.play('welcome'); enterLobby(); }
        else { setMode('login'); msg('Check your email to confirm your account, then log in.', true); sfx.play('notice'); }
      } else {
        const { error } = await sb.auth.updateUser({ password: pass });
        if (error) throw error;
        sfx.play('welcome');
        enterLobby();
      }
    } catch (err) {
      fail(friendly(err.message));
    } finally {
      setBusy(false);
    }
  });

  $('#forgot').onclick = async () => {
    if (!sb) return fail(NOT_SET);
    const email = $('#a-email').value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return fail('Type your email above first.');
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/' });
    if (error) return fail(friendly(error.message));
    msg('If that email has an account, a reset link is on its way.', true);
    sfx.play('notice');
  };

  $('#google-btn').onclick = async () => {
    if (!sb) return fail(NOT_SET);
    // remember which meeting they were joining; the page reloads during Google sign-in
    const m = location.pathname.match(CODE_RE) || $('#code-input').value.match(CODE_RE);
    if (m) sessionStorage.setItem('nova.code', m[1].toLowerCase());
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + '/' } });
    if (error) fail(friendly(error.message));
  };

  $('#guest-btn').onclick = () => {
    sessionStorage.setItem('nova.guest', '1');
    enterLobby();
  };

  $('#acct-btn').onclick = async () => {
    await api.signOut();
  };

  nameInput.addEventListener('change', () => { window.novaAuth.saveName(nameInput.value.trim()); updateAcct(); });
  nameInput.addEventListener('input', updateAcct);

  /* ---------------- start up ---------------- */
  const jc = location.pathname.match(CODE_RE);
  if (jc) {
    const j = $('#auth-join');
    j.hidden = false;
    j.textContent = `You're joining ${jc[1].toLowerCase()}`;
  }

  (async function init() {
    if (!sb) {
      $('#auth-note').hidden = false;
      setMode('login');
      if (sessionStorage.getItem('nova.guest')) enterLobby(); else showView('auth');
      return;
    }

    sb.auth.onAuthStateChange((event, sess) => {
      session = sess;
      if (event === 'PASSWORD_RECOVERY') {
        recovering = true;
        setUser(sess && sess.user);
        showView('auth'); setMode('reset');
        return;
      }
      if (event === 'SIGNED_OUT') { user = null; appliedId = null; updateAcct(); return; }
      if (sess && ['SIGNED_IN', 'USER_UPDATED', 'INITIAL_SESSION'].includes(event)) {
        setUser(sess.user);
        // only leave the sign-in page; never pull someone out of a meeting
        if (!recovering && !$('#auth').hidden) enterLobby();
      }
    });

    const isRecovery = /type=recovery/.test(location.hash + location.search);
    try { session = (await sb.auth.getSession()).data.session; } catch { /* offline */ }
    if (/[?#&](code|access_token|error)=/.test(location.search + location.hash)) {
      history.replaceState(null, '', location.pathname); // tidy the URL after Google sign-in
    }

    setMode('login');
    if (session) setUser(session.user);
    if (isRecovery && session) { recovering = true; showView('auth'); setMode('reset'); }
    else if (session || sessionStorage.getItem('nova.guest')) enterLobby();
    else showView('auth');
  })();
})();
