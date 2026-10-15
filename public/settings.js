'use strict';
/* ==========================================================
   Nova — settings UI + applying preferences
   Loaded after app.js.
   ========================================================== */

Object.assign(I, {
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
  volume: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
  sliders: '<line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/>',
});
$$('[data-icon]').forEach((el) => (el.innerHTML = icon(el.dataset.icon, +el.dataset.size || 20)));

const ACCENTS = {
  ice: ['#3C8CEB', '#2166C9', 'Ice'],
  ocean: ['#2F6FE4', '#1C4FB8', 'Ocean'],
  peri: ['#6E87F2', '#4A62D8', 'Periwinkle'],
  teal: ['#27A8CC', '#16809F', 'Glacier'],
  mist: ['#5B9BD5', '#3A78B0', 'Mist'],
};

/* ---------------- apply preferences ---------------- */
function applyOutput(v) {
  if (!v || v.muted) return;
  v.volume = Math.max(0, Math.min(1, S.volume));
  if (S.spkId && typeof v.setSinkId === 'function') v.setSinkId(S.spkId).catch(() => {});
}

function applyPrefs() {
  const b = document.body.classList;
  b.toggle('no-anim', !S.anim);
  b.toggle('fit-fill', S.fit === 'fill');
  b.toggle('no-mirror', !S.mirror);
  b.toggle('hide-names', !S.showNames);
  b.toggle('hide-status', !S.showStatus);
  b.toggle('no-ring', !S.speakingRing);
  document.body.dataset.corners = S.corners;
  const a = ACCENTS[S.accent] || ACCENTS.ice;
  document.documentElement.style.setProperty('--blue', a[0]);
  document.documentElement.style.setProperty('--blue-d', a[1]);
  state.peers.forEach((p) => applyOutput(p.audioEl));
  if (joined()) layout();
}

/* ---------------- devices ---------------- */
const devices = { cams: [], mics: [], spks: [] };
async function refreshDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  try {
    const list = await navigator.mediaDevices.enumerateDevices();
    devices.cams = list.filter((d) => d.kind === 'videoinput');
    devices.mics = list.filter((d) => d.kind === 'audioinput');
    devices.spks = list.filter((d) => d.kind === 'audiooutput');
  } catch { /* ignore */ }
  if ($('.settings') && (tab === 'video' || tab === 'audio')) renderTab();
}
if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
  navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
}

async function reacquireMic() {
  if (!state.micTrack) return;
  const wasOn = state.micOn;
  state.micTrack.stop();
  state.micTrack = null;
  const t = await getTrack('audio');
  if (!t) { state.micOn = false; toast('Could not switch microphone'); await pushAudio(); localChanged(); return; }
  state.micTrack = t;
  t.enabled = wasOn;
  await pushAudio();
  if (joined()) watchAudio(state.myId, new MediaStream([t]));
  if ($('.settings') && tab === 'audio') startMeter();
}
async function reacquireCam() {
  if (!state.camTrack) return;
  state.camTrack.stop();
  state.camTrack = null;
  const t = await getTrack('video');
  if (!t) { state.camOn = false; toast('Could not switch camera'); }
  else state.camTrack = t;
  rebuildPreview();
  await pushVideo();
  localChanged();
  const pv = $('#set-preview');
  if (pv) pv.srcObject = state.previewStream;
}

/* ---------------- mic meter ---------------- */
let meterStop = null;
function stopMeter() { if (meterStop) { meterStop(); meterStop = null; } }
function startMeter() {
  stopMeter();
  const bar = $('#meter-fill');
  if (!bar || !state.micTrack) return;
  try {
    const c = getCtx();
    const an = c.createAnalyser();
    an.fftSize = 512;
    const src = c.createMediaStreamSource(new MediaStream([state.micTrack]));
    src.connect(an);
    const data = new Uint8Array(an.fftSize);
    let raf;
    const loop = () => {
      an.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) { const x = (v - 128) / 128; sum += x * x; }
      bar.style.transform = `scaleX(${Math.min(1, Math.sqrt(sum / data.length) * 4)})`;
      raf = requestAnimationFrame(loop);
    };
    loop();
    meterStop = () => { cancelAnimationFrame(raf); try { src.disconnect(); } catch { /* ignore */ } };
  } catch { /* ignore */ }
}

/* ---------------- UI builders ---------------- */
const TABS = [
  { id: 'profile', label: 'Profile', ico: 'user' },
  { id: 'video', label: 'Video', ico: 'video' },
  { id: 'audio', label: 'Audio', ico: 'mic' },
  { id: 'sounds', label: 'Sounds', ico: 'volume' },
  { id: 'alerts', label: 'Notifications', ico: 'bell' },
  { id: 'look', label: 'Appearance', ico: 'sparkles' },
  { id: 'meeting', label: 'Meeting', ico: 'sliders' },
];
let tab = 'profile';

const row = (title, sub, control) =>
  `<div class="srow"><div class="txt"><b>${title}</b>${sub ? `<span>${sub}</span>` : ''}</div>${control}</div>`;
const sw = (key) => `<button class="switch" type="button" role="switch" aria-checked="${!!S[key]}" data-set="${key}" aria-label="${key}"></button>`;
const seg = (key, opts) =>
  `<div class="seg" data-seg="${key}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${S[key] === v ? 'active' : ''}">${l}</button>`).join('')}</div>`;
const rng = (key, min, max, step, fmt) =>
  `<div class="rng"><input type="range" data-range="${key}" min="${min}" max="${max}" step="${step}" value="${S[key]}"><span class="val" id="val-${key}">${fmt(S[key])}</span></div>`;
const pct = (v) => Math.round(v * 100) + '%';
const devSelect = (key, list, fallback) =>
  `<select class="sel" data-dev="${key}" aria-label="${fallback}"><option value="">System default</option>${list.map((d, i) =>
    `<option value="${esc(d.deviceId)}" ${S[key] === d.deviceId ? 'selected' : ''}>${esc(d.label || `${fallback} ${i + 1}`)}</option>`).join('')}</select>`;
const play = (name) => `<button class="btn sm" type="button" data-preview="${name}">Play</button>`;

function tabHTML(id) {
  switch (id) {
    case 'profile': {
      const u = { name: nameInput.value.trim() || 'You', avatar: state.avatar };
      return `
        <div class="profile-set">
          <div class="pfp-big">${avatar(u)}</div>
          <div class="pfp-actions">
            <label class="btn sm" for="set-pfp">${icon('camera', 16)}Change photo</label>
            <input id="set-pfp" type="file" accept="image/*" hidden>
            <button class="btn sm" type="button" data-act="remove-pfp" ${state.avatar ? '' : 'disabled'}>Remove</button>
          </div>
        </div>
        <div class="srow col"><label for="set-name"><b>Display name</b></label>
          <input type="text" id="set-name" class="txt-in" maxlength="40" value="${esc(nameInput.value)}" placeholder="Your name"></div>
        <p class="hint">${joined() ? 'Changes appear to everyone in the meeting right away.' : 'Shown to everyone when you join.'}</p>`;
    }
    case 'video':
      return `
        <div class="set-preview-wrap"><div class="set-preview ${state.camOn && state.camTrack ? '' : 'off'}"><video id="set-preview" autoplay playsinline muted></video><span>Camera is off</span></div></div>
        ${row('Camera', '', devSelect('camId', devices.cams, 'Camera'))}
        ${row('Quality', 'Lower quality uses less data', seg('quality', [['sd', '360p'], ['hd', '720p'], ['fhd', '1080p']]))}
        ${row('Video fit', 'Fit shows the whole picture without cropping', seg('fit', [['fit', 'Fit'], ['fill', 'Fill']]))}
        ${row('Mirror my video', 'Only changes how you see yourself', sw('mirror'))}
        ${row('Show my own tile', 'Hide yourself when others are in the meeting', sw('selfView'))}
        ${row('Show names on tiles', '', sw('showNames'))}
        ${row('Show status on tiles', 'Speaking, presenting, away and so on', sw('showStatus'))}
        ${row('Highlight who is speaking', '', sw('speakingRing'))}`;
    case 'audio':
      return `
        ${row('Microphone', '', devSelect('micId', devices.mics, 'Microphone'))}
        ${row('Mic test', state.micTrack ? (state.micOn ? 'Say something to see the bar move' : 'Your mic is muted. Unmute to test') : 'No microphone detected',
          '<div class="meter"><i id="meter-fill"></i></div>')}
        ${'setSinkId' in HTMLMediaElement.prototype ? row('Speaker', '', devSelect('spkId', devices.spks, 'Speaker')) : ''}
        ${row('Output volume', 'Volume of other people', rng('volume', 0, 1, 0.05, pct))}
        ${row('Noise suppression', 'Reduces background noise', sw('noise'))}
        ${row('Echo cancellation', '', sw('echo'))}
        ${row('Automatic gain', 'Keeps your volume steady', sw('agc'))}
        ${row('Speaker test', 'Plays a short chime', play('welcome'))}`;
    case 'sounds':
      return `
        ${row('Sound effects', 'Turn every sound on or off', sw('sound'))}
        ${row('Effects volume', '', rng('sfxVol', 0, 1, 0.05, pct))}
        ${row('Buttons and menus', 'Taps, toggles, panels, pinning', sw('sUi') + play('toggleOn'))}
        ${row('Hover sounds', 'A soft tick when you hover buttons', sw('hoverSnd'))}
        ${row('People joining and leaving', 'Also the waiting room knock', sw('sPeople') + play('join'))}
        ${row('Chat messages', 'Everyone, private and group', sw('sChat') + play('message'))}
        ${row('Raised hands', '', sw('sHand') + play('hand'))}
        ${row('Reactions', '', sw('sReact') + play('react'))}
        ${row('Mic and camera', 'Mute, unmute, camera on and off', sw('sMic') + play('unmute'))}
        ${row('Screen sharing', '', sw('sShare') + play('shareStart'))}
        ${row('Alerts and host actions', 'Host mutes you, removed, meeting ended', sw('sAlert') + play('notice'))}`;
    case 'alerts':
      return `
        ${row('Pop-up notices', 'General notices such as a new host', sw('toasts'))}
        ${row('Joined and left', 'A pop-up when someone enters or leaves', sw('joinToasts'))}
        ${row('Chat messages', 'A pop-up for messages while chat is closed', sw('chatToasts'))}
        <p class="hint">Errors and host actions always show, so you never miss something important.</p>`;
    case 'look':
      return `
        ${row('Accent color', '', `<div class="swatches">${Object.entries(ACCENTS).map(([k, a]) =>
          `<button type="button" class="swatch ${S.accent === k ? 'active' : ''}" data-accent="${k}" style="background:${a[0]}" aria-label="${a[2]}" title="${a[2]}"></button>`).join('')}</div>`)}
        ${row('Animations', 'Turn off if you prefer a calmer screen', sw('anim'))}
        ${row('Reaction animations', 'Emojis floating over tiles', sw('reactionAnim'))}
        ${row('Tile corners', '', seg('corners', [['sharp', 'Square'], ['round', 'Round'], ['soft', 'Extra round']]))}`;
    case 'meeting':
      return `
        ${row('Join with mic off', '', sw('joinMuted'))}
        ${row('Join with camera off', '', sw('joinCamOff'))}
        ${row('Keyboard shortcuts', 'M mic, V camera, H raise hand', sw('shortcuts'))}
        ${row('Confirm before leaving', '', sw('confirmLeave'))}
        <div class="srow"><div class="txt"><b>Reset all settings</b><span>Back to the Nova defaults</span></div><button class="btn sm danger" type="button" data-act="reset">Reset</button></div>`;
  }
  return '';
}

function renderTab() {
  const body = $('#s-body');
  if (!body) return;
  const keep = body.scrollTop;
  body.innerHTML = tabHTML(tab);
  body.scrollTop = keep;
  $('#s-title').textContent = TABS.find((t) => t.id === tab).label;
  $$('.snav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  if (tab === 'video') { const pv = $('#set-preview'); if (pv) pv.srcObject = state.previewStream; }
  if (tab === 'audio') startMeter(); else stopMeter();
}

function openSettings(startTab) {
  if (typeof startTab === 'string') tab = startTab;
  closeMenu();
  const root = $('#overlay-root');
  root.innerHTML = `
    <div class="modal-bg"><div class="modal settings" role="dialog" aria-modal="true" aria-label="Settings">
      <nav class="snav" aria-label="Settings sections">
        ${TABS.map((t) => `<button type="button" data-tab="${t.id}">${icon(t.ico, 18)}<span>${t.label}</span></button>`).join('')}
      </nav>
      <section class="spane">
        <header><h3 id="s-title"></h3><button class="icon-btn" type="button" data-close aria-label="Close settings">${icon('x', 20)}</button></header>
        <div class="sbody" id="s-body"></div>
      </section>
    </div></div>`;
  sfx.play('open');
  const modal = $('.settings', root);
  modal.addEventListener('click', onClick);
  modal.addEventListener('input', onInput);
  modal.addEventListener('change', onChange);
  root.querySelector('.modal-bg').addEventListener('mousedown', (e) => { if (e.target.classList.contains('modal-bg')) closeModal(); });
  refreshDevices();
  renderTab();
}

/* ---------------- events ---------------- */
function setName(v) {
  nameInput.value = v;
  try { localStorage.setItem('nova.name', v); } catch { /* ignore */ }
  renderLobby();
  if (joined() && v.trim()) socket.emit('profile', { name: v.trim() });
}

function onClick(e) {
  if (e.target.closest('[data-close]')) return closeModal();

  const t = e.target.closest('[data-tab]');
  if (t) { tab = t.dataset.tab; sfx.play('tab'); return renderTab(); }

  const s = e.target.closest('.switch[data-set]');
  if (s) {
    const k = s.dataset.set;
    S[k] = !S[k];
    s.setAttribute('aria-checked', S[k]);
    savePrefs(); applyPrefs();
    sfx.play(S[k] ? 'toggleOn' : 'toggleOff');
    if (['noise', 'echo', 'agc'].includes(k)) reacquireMic();
    return;
  }

  const g = e.target.closest('.seg button');
  if (g) {
    const k = g.parentElement.dataset.seg;
    S[k] = g.dataset.v;
    $$('button', g.parentElement).forEach((b) => b.classList.toggle('active', b === g));
    savePrefs(); applyPrefs();
    sfx.play('tab');
    if (k === 'quality') reacquireCam();
    return;
  }

  const a = e.target.closest('[data-accent]');
  if (a) {
    S.accent = a.dataset.accent;
    $$('.swatch').forEach((b) => b.classList.toggle('active', b === a));
    savePrefs(); applyPrefs();
    return;
  }

  const p = e.target.closest('[data-preview]');
  if (p) return sfx.play(p.dataset.preview, true);

  const act = e.target.closest('[data-act]');
  if (!act) return;
  if (act.dataset.act === 'remove-pfp') {
    state.avatar = null;
    try { localStorage.removeItem('nova.avatar'); } catch { /* ignore */ }
    renderLobby();
    if (joined()) socket.emit('profile', { avatar: null });
    renderTab();
  }
  if (act.dataset.act === 'reset') {
    Object.assign(S, DEFAULTS);
    savePrefs(); applyPrefs();
    reacquireMic(); reacquireCam();
    renderTab();
    toast('Settings reset to defaults', 2500, 'info');
  }
}

function onInput(e) {
  const r = e.target.closest('[data-range]');
  if (r) {
    const k = r.dataset.range;
    S[k] = +r.value;
    $('#val-' + k).textContent = pct(S[k]);
    savePrefs(); applyPrefs();
    return;
  }
  if (e.target.id === 'set-name') {
    // update the lobby avatar initials live; the name is sent on change
    nameInput.value = e.target.value;
    renderLobby();
  }
}

async function onChange(e) {
  const el = e.target;
  if (el.matches('[data-range]') && el.dataset.range === 'sfxVol') return sfx.play('toggleOn');
  if (el.id === 'set-name') return setName(el.value);
  if (el.id === 'set-pfp') {
    const f = el.files[0];
    if (!f) return;
    try {
      state.avatar = await fileToAvatar(f);
      try { localStorage.setItem('nova.avatar', state.avatar); } catch { /* ignore */ }
      renderLobby();
      if (joined()) socket.emit('profile', { avatar: state.avatar });
      renderTab();
    } catch { toast('That image could not be used'); }
    return;
  }
  const d = el.closest('[data-dev]');
  if (d) {
    const k = d.dataset.dev;
    S[k] = d.value;
    savePrefs(); applyPrefs();
    if (k === 'camId') reacquireCam();
    if (k === 'micId') reacquireMic();
    sfx.play('tab');
  }
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('.settings')) closeModal(); });
$('#lobby-settings').onclick = () => openSettings();
$('#btn-settings').onclick = () => openSettings();

applyPrefs();
refreshDevices();
