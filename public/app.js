'use strict';
/* ==========================================================
   Nova — client
   WebRTC mesh (one peer connection per participant) + Socket.IO signaling
   ========================================================== */

// Same-origin by default. On Vercel, config.js points this at the always-on Nova server.
const socket = io(window.NOVA_SERVER || undefined, { transports: ['websocket', 'polling'] });
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
const QUALITY = {
  sd: { width: { ideal: 640 }, height: { ideal: 360 } },
  hd: { width: { ideal: 1280 }, height: { ideal: 720 } },
  fhd: { width: { ideal: 1920 }, height: { ideal: 1080 } },
};
const videoC = (withDevice = true) => ({
  ...QUALITY[S.quality] || QUALITY.hd, frameRate: { ideal: 30 },
  ...(withDevice && S.camId ? { deviceId: { exact: S.camId } } : { facingMode: 'user' }),
});
const audioC = (withDevice = true) => ({
  echoCancellation: S.echo, noiseSuppression: S.noise, autoGainControl: S.agc,
  ...(withDevice && S.micId ? { deviceId: { exact: S.micId } } : {}),
});
const REACTIONS = ['👍', '👏', '❤️', '😂', '😮', '🎉', '😢', '🙏'];
const STATUS_LIST = [
  { id: 'available', label: 'Available', cls: 'ok' },
  { id: 'busy', label: 'Busy', cls: 'bad' },
  { id: 'away', label: 'Away', cls: 'warn' },
  { id: 'brb', label: 'Be right back', cls: 'warn' },
];

/* ---------------- icons ---------------- */
const I = {
  mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>',
  'mic-off': '<line x1="2" x2="22" y1="2" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><line x1="12" x2="12" y1="19" y2="22"/>',
  video: '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  'video-off': '<path d="M10.66 6H14a2 2 0 0 1 2 2v2.5l5.248-3.062A.5.5 0 0 1 22 7.87v8.196"/><path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/><path d="m2 2 20 20"/>',
  monitor: '<path d="m9 10 3-3 3 3"/><path d="M12 13V7"/><rect width="20" height="14" x="2" y="3" rx="2"/><path d="M12 17v4"/><path d="M8 21h8"/>',
  smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/>',
  hand: '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"/>',
  'user-x': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" x2="22" y1="8" y2="13"/><line x1="22" x2="17" y1="8" y2="13"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  phone: '<path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="22" x2="2" y1="2" y2="22"/>',
  pin: '<line x1="12" x2="12" y1="17" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>',
  'pin-off': '<line x1="2" x2="22" y1="2" y2="22"/><line x1="12" x2="12" y1="17" y2="22"/><path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h12"/><path d="M15 9.34V6h1a2 2 0 0 0 0-4H7.89"/>',
  more: '<circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/><circle cx="5" cy="12" r="1.2"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  crown: '<path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>',
  'hand-off': '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
  star: '<path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z" fill="currentColor" stroke="none"/>',
};
const icon = (n, size = 20) =>
  `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;
$$('[data-icon]').forEach((el) => (el.innerHTML = icon(el.dataset.icon, +el.dataset.size || 20)));
$$('[data-logo]').forEach((el) => (el.innerHTML = icon('star', 24)));

/* ---------------- utils ---------------- */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hash = (s) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
const initials = (n) => (n || '?').trim().split(/\s+/).slice(0, 2).map((w) => (w[0] || '').toUpperCase()).join('') || '?';
const avatar = (u, cls = '') =>
  u.avatar
    ? `<span class="av ${cls}"><img src="${u.avatar}" alt=""></span>`
    : `<span class="av ${cls}" style="--h:${195 + (hash(u.name || '?') % 40)}">${esc(initials(u.name))}</span>`;
const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const genCode = () => {
  const r = (n) => Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('');
  return `${r(3)}-${r(4)}-${r(3)}`;
};
const CODE_RE = /([a-z]{3}-[a-z]{4}-[a-z]{3})/i;

function toast(msg, ms = 3200, type = 'important') {
  if ((type === 'info' && !S.toasts) || (type === 'join' && !S.joinToasts) || (type === 'chat' && !S.chatToasts)) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, ms);
}

/* ---------------- state ---------------- */
const state = {
  myId: null, code: null, name: '', avatar: null,
  users: new Map(), peers: new Map(), streams: new Map(), tiles: new Map(), levels: new Map(),
  speaking: new Set(), waiting: [], settings: {}, groups: new Map(),
  threads: new Map(), active: 'all',
  micOn: true, camOn: true, sharing: false,
  micTrack: null, camTrack: null, screenTrack: null, silent: null, blank: null,
  previewStream: null, outStream: new MediaStream(),
  pinned: null, panel: null, audioCtx: null, joinedAt: 0,
};
const me = () => state.users.get(state.myId);
const isMod = (u) => !!u && (u.role === 'host' || u.role === 'cohost');
const joined = () => !!me();

/* ==========================================================
   MEDIA
   ========================================================== */
const getCtx = () => {
  state.audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
  return state.audioCtx;
};

function makeBlankTrack() {
  // Keeps drawing so the stream always delivers frames (a frozen canvas can stall remote playback).
  const c = document.createElement('canvas');
  c.width = 640; c.height = 360;
  const g = c.getContext('2d');
  let n = 0;
  const draw = () => { g.fillStyle = n++ % 2 ? '#DCEAFB' : '#DDEBFC'; g.fillRect(0, 0, 640, 360); };
  draw();
  const track = c.captureStream(5).getVideoTracks()[0];
  setInterval(draw, 400);
  return track;
}
const makeSilentTrack = () => getCtx().createMediaStreamDestination().stream.getAudioTracks()[0];

async function getTrack(kind) {
  for (const withDevice of [true, false]) {
    try {
      const s = await navigator.mediaDevices.getUserMedia(kind === 'video' ? { video: videoC(withDevice) } : { audio: audioC(withDevice) });
      return s.getTracks()[0];
    } catch {
      if (withDevice && (kind === 'video' ? S.camId : S.micId)) continue; // saved device missing: retry with default
      break;
    }
  }
  return null;
}

async function initMedia() {
  state.blank = makeBlankTrack();
  state.silent = makeSilentTrack();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    state.camOn = state.micOn = false;
    renderLobby();
    return;
  }
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: videoC(), audio: audioC() });
    state.camTrack = s.getVideoTracks()[0] || null;
    state.micTrack = s.getAudioTracks()[0] || null;
  } catch {
    state.camTrack = await getTrack('video');
    state.micTrack = await getTrack('audio');
  }
  if (S.joinCamOff && state.camTrack) { state.camTrack.stop(); state.camTrack = null; }
  state.camOn = !!state.camTrack;
  state.micOn = !!state.micTrack && !S.joinMuted;
  if (state.micTrack) state.micTrack.enabled = state.micOn;
  rebuildPreview();
  renderLobby();
  if (typeof refreshDevices === 'function') refreshDevices();
}

const videoOut = () => (state.sharing && state.screenTrack ? state.screenTrack : state.camOn && state.camTrack ? state.camTrack : state.blank);
const audioOut = () => state.micTrack || state.silent;

function rebuildPreview() {
  state.previewStream = state.camTrack && state.camOn ? new MediaStream([state.camTrack]) : null;
}
async function pushVideo() {
  const t = videoOut();
  await Promise.all([...state.peers.values()].map((p) => p.senders.video.replaceTrack(t).catch(() => {})));
}
async function pushAudio() {
  const t = audioOut();
  await Promise.all([...state.peers.values()].map((p) => p.senders.audio.replaceTrack(t).catch(() => {})));
}

async function setMic(on) {
  if (on && joined() && !state.settings.selfUnmute && !isMod(me())) return toast('The host has turned off unmuting for participants');
  if (on && !state.micTrack) {
    const t = await getTrack('audio');
    if (!t) return toast('No microphone found, or permission was denied');
    state.micTrack = t;
    await pushAudio();
    if (joined()) watchAudio(state.myId, new MediaStream([t]));
  }
  state.micOn = on;
  if (state.micTrack) state.micTrack.enabled = on;
  sfx.play(on ? 'unmute' : 'mute');
  localChanged();
}

async function setCamera(on) {
  if (on) {
    if (!state.camTrack) {
      const t = await getTrack('video');
      if (!t) return toast('No camera found, or permission was denied');
      state.camTrack = t;
    }
    state.camOn = true;
  } else {
    if (state.camTrack) state.camTrack.stop();
    state.camTrack = null;
    state.camOn = false;
  }
  rebuildPreview();
  await pushVideo();
  sfx.play(on ? 'camOn' : 'camOff');
  localChanged();
}

async function toggleShare() {
  if (state.sharing) return stopShare();
  if (state.settings.share === 'host' && !isMod(me())) return toast('Only hosts can share their screen');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) return toast('Screen sharing is not supported in this browser');
  try {
    const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
    state.screenTrack = s.getVideoTracks()[0];
  } catch { return; }
  state.screenTrack.onended = stopShare;
  state.sharing = true;
  await pushVideo();
  localChanged();
}
async function stopShare() {
  if (!state.sharing) return;
  if (state.screenTrack) state.screenTrack.stop();
  state.screenTrack = null;
  state.sharing = false;
  await pushVideo();
  localChanged();
}

function localChanged() {
  renderLobbyControls();
  const m = me();
  if (!m) return;
  Object.assign(m, { muted: !state.micOn, camOn: state.camOn, sharing: state.sharing });
  socket.emit('update', { muted: m.muted, camOn: m.camOn, sharing: m.sharing, status: m.status });
  refreshAll();
}

/* ---- speaking detection ---- */
function watchAudio(id, stream) {
  unwatchAudio(id);
  if (!stream.getAudioTracks().length) return;
  try {
    const ctx = getCtx();
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    const src = ctx.createMediaStreamSource(stream);
    src.connect(an);
    state.levels.set(id, { an, src, data: new Uint8Array(an.fftSize) });
  } catch { /* analyser is optional */ }
}
function unwatchAudio(id) {
  const l = state.levels.get(id);
  if (l) { try { l.src.disconnect(); } catch {} state.levels.delete(id); }
  state.speaking.delete(id);
}
setInterval(() => {
  let changed = false;
  for (const [id, l] of state.levels) {
    l.an.getByteTimeDomainData(l.data);
    let sum = 0;
    for (const v of l.data) { const x = (v - 128) / 128; sum += x * x; }
    const speaking = Math.sqrt(sum / l.data.length) > 0.03;
    if (speaking !== state.speaking.has(id)) {
      speaking ? state.speaking.add(id) : state.speaking.delete(id);
      updateTile(id);
      changed = true;
    }
  }
  if (changed && state.panel === 'people') renderPeople();
}, 160);

/* ==========================================================
   LOBBY
   ========================================================== */
const nameInput = $('#name-input');
nameInput.value = localStorage.getItem('nova.name') || '';
state.avatar = localStorage.getItem('nova.avatar') || null;
const urlCode = location.pathname.match(CODE_RE);
if (urlCode) $('#code-input').value = urlCode[1].toLowerCase();

function showView(v) {
  for (const id of ['auth', 'lobby', 'waiting', 'room']) $('#' + id).hidden = id !== v;
  const el = $('#' + v);
  el.classList.remove('view-in'); void el.offsetWidth; el.classList.add('view-in');
  if (v === 'lobby') startMedia();
}
// Ask for camera/mic only once the lobby is showing, not on the sign-in page.
let mediaStarted = false;
function startMedia() { if (mediaStarted) return; mediaStarted = true; initMedia(); }

function setCtl(btn, name, tip, cls = '') {
  const key = name + '|' + cls, changed = btn.dataset.key && btn.dataset.key !== key;
  btn.dataset.key = key;
  btn.className = 'ctl ' + cls;
  if (changed) {
    btn.classList.add('pop');
    btn.addEventListener('animationend', () => btn.classList.remove('pop'), { once: true });
  }
  btn.dataset.tip = tip;
  btn.setAttribute('aria-label', tip);
  btn.innerHTML = icon(name, 22);
}

function renderLobbyControls() {
  setCtl($('#lobby-mic'), state.micOn ? 'mic' : 'mic-off', state.micOn ? 'Turn off microphone' : 'Turn on microphone', state.micOn ? '' : 'off');
  setCtl($('#lobby-cam'), state.camOn ? 'video' : 'video-off', state.camOn ? 'Turn off camera' : 'Turn on camera', state.camOn ? '' : 'off');
  const v = $('#lobby-video');
  if (v.srcObject !== state.previewStream) v.srcObject = state.previewStream;
  $('.preview').classList.toggle('cam-off', !state.camOn || !state.camTrack);
}
function renderLobby() {
  const u = { name: nameInput.value.trim() || 'You', avatar: state.avatar };
  $('#pfp-preview').innerHTML = avatar(u);
  $('#lobby-avatar').innerHTML = avatar(u);
  let note = '';
  if (!navigator.mediaDevices) note = 'Camera and mic need localhost or https';
  else if (!state.camTrack && !state.micTrack) note = 'No camera or mic found. You can still join.';
  $('#lobby-note').textContent = note;
  renderLobbyControls();
}

nameInput.addEventListener('input', renderLobby);
$('#lobby-mic').onclick = () => setMic(!state.micOn);
$('#lobby-cam').onclick = () => setCamera(!state.camOn);

$('#pfp-input').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    state.avatar = await fileToAvatar(f);
    localStorage.setItem('nova.avatar', state.avatar);
    if (window.novaAuth) window.novaAuth.saveProfile();
    renderLobby();
  } catch { toast('That image could not be used'); }
});
function fileToAvatar(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const S = 160, c = document.createElement('canvas');
      c.width = c.height = S;
      const m = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, S, S);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.86));
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function startJoin(code) {
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.focus();
    nameInput.parentElement.classList.remove('shake'); void nameInput.offsetWidth; nameInput.parentElement.classList.add('shake');
    return toast('Enter your name first');
  }
  localStorage.setItem('nova.name', name);
  state.name = name;
  if (!socket.connected) return toast('Still connecting to the server. Try again in a few seconds.');
  getCtx().resume();
  const token = window.novaAuth ? await window.novaAuth.freshToken() : null;
  socket.emit('join', { code, name, token, avatar: state.avatar, muted: !state.micOn, camOn: state.camOn && !!state.camTrack }, (res) => {
    if (res.error === 'locked') return toast('This meeting is locked by the host');
    if (res.error === 'accounts-only') return toast('This meeting only allows signed-in people. Log in and try again.');
    if (res.error) return toast('Could not join that meeting');
    state.code = code;
    if (res.waiting) showView('waiting');
  });
}
$('#new-meeting').onclick = () => startJoin(genCode());
$('#join-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const m = $('#code-input').value.match(CODE_RE);
  if (!m) return toast('Enter a code like abc-defg-hij');
  startJoin(m[1].toLowerCase());
});
$('#wait-cancel').onclick = () => { socket.emit('leave'); showView('lobby'); };

/* ==========================================================
   SOCKET EVENTS
   ========================================================== */
socket.on('connect', () => { if (state.myId) location.reload(); });
socket.on('disconnect', () => { if (state.myId) toast('Connection lost. Reconnecting…', 6000); });

socket.on('joined', (d) => {
  state.myId = d.me.id;
  state.code = d.code;
  state.settings = d.settings;
  state.users = new Map([[d.me.id, d.me], ...d.participants.map((p) => [p.id, p])]);
  state.threads = new Map([['all', { id: 'all', kind: 'all', title: 'Everyone', msgs: [...d.history], unread: 0 }]]);
  state.active = 'all';
  d.groups.forEach(addGroupThread);
  state.joinedAt = Date.now();

  showView('room');
  sfx.play('welcome');
  if (window.novaAuth) window.novaAuth.meetingStarted(d.code, d.me.role);
  history.replaceState(null, '', '/' + d.code);
  $('#code-text').textContent = d.code;
  if (state.micTrack) watchAudio(state.myId, new MediaStream([state.micTrack]));
  d.participants.forEach((p) => callPeer(p.id));
  applySettingsUI();
  refreshAll();
  if (!state.camOn && !state.micOn) toast('You joined with camera and mic off', 3200, 'info');
});

socket.on('participant-joined', (u) => {
  state.users.set(u.id, u);
  toast(`${u.name} joined`, 2200, 'join');
  sfx.play('join');
  refreshAll();
});
socket.on('participant-left', (id) => {
  const u = state.users.get(id);
  if (u) { toast(`${u.name} left`, 2200, 'join'); sfx.play('leave'); }
  closePeer(id);
  state.users.delete(id);
  if (state.pinned === id) state.pinned = null;
  const dm = state.threads.get('dm:' + id);
  if (dm) dm.left = true;
  refreshAll();
  if (state.panel === 'chat') renderChat();
});
socket.on('participant-updated', ({ id, patch }) => {
  const u = state.users.get(id);
  if (!u) return;
  const wasMod = isMod(me());
  const prev = { hand: u.hand, sharing: u.sharing };
  Object.assign(u, patch);
  if ('hand' in patch && patch.hand !== prev.hand) {
    if (patch.hand) sfx.play('hand'); else if (id === state.myId) sfx.play('handDown');
  }
  if ('sharing' in patch && patch.sharing !== prev.sharing) sfx.play(patch.sharing ? 'shareStart' : 'shareStop');
  if ('name' in patch) { const th = state.threads.get('dm:' + id); if (th) th.title = u.name; if (state.panel === 'chat') renderChat(); }
  if (id === state.myId && 'role' in patch) {
    if (patch.role === 'host') toast('You are now the host');
    else if (patch.role === 'cohost') toast('You are now a co-host');
    else if (wasMod) toast('You are no longer a co-host');
    applySettingsUI();
  }
  refreshAll();
});
socket.on('reaction', ({ id, emoji }) => { sfx.play('react'); floatEmoji(id, emoji); });
socket.on('notice', ({ message }) => { sfx.play('notice'); toast(message, 3200, 'info'); });
socket.on('denied', ({ message }) => { sfx.play('alert'); toast(message); });
socket.on('settings', (s) => {
  state.settings = s;
  sfx.play('notice');
  applySettingsUI();
  if (state.panel === 'host') renderHost();
  if (state.panel === 'chat') renderChat();
});
socket.on('waiting-list', (list) => {
  const known = new Set(state.waiting.map((w) => w.id));
  const fresh = list.filter((w) => !known.has(w.id));
  fresh.forEach((w) => toast(`${w.name} is waiting to join`, 4000));
  if (fresh.length) sfx.play('knock');
  state.waiting = list;
  applySettingsUI();
  if (state.panel === 'people') renderPeople();
});
socket.on('entry-denied', ({ reason }) => { toast(reason); showView('lobby'); });
socket.on('removed', () => { sfx.play('ended'); toast('The host removed you from the meeting'); setTimeout(() => (location.href = '/'), 1600); });
socket.on('meeting-ended', () => { sfx.play('ended'); toast('The host ended the meeting'); setTimeout(() => (location.href = '/'), 1600); });
socket.on('force-mute', () => { if (state.micOn) { sfx.play('alert'); setMic(false); toast('The host muted you'); } });
socket.on('force-cam-off', () => { if (state.camOn) { setCamera(false); toast('The host turned off your camera'); } });
socket.on('force-stop-share', () => { if (state.sharing) { stopShare(); toast('Your screen share was stopped by the host'); } });
socket.on('group-created', (g) => {
  addGroupThread(g);
  if (g.createdBy === state.myId) { state.active = 'g:' + g.id; openPanel('chat', true); }
  else { toast(`You were added to the group “${g.name}”`); updateBadges(); if (state.panel === 'chat') renderChat(); }
});
socket.on('chat', onChat);

/* ==========================================================
   WEBRTC
   ========================================================== */
function createPeer(id) {
  const pc = new RTCPeerConnection({ iceServers: ICE });
  const peer = { id, pc, pending: [], senders: {} };
  pc.onicecandidate = (e) => e.candidate && socket.emit('signal', { to: id, data: { candidate: e.candidate } });
  pc.ontrack = (e) => {
    if (e.track.kind === 'audio') {
      // Audio plays through its own element so it never waits on video frames
      // (this is what made mics seem dead until a camera was toggled).
      if (peer.audioEl) return;
      const stream = new MediaStream([e.track]);
      const a = new Audio();
      a.autoplay = true;
      a.srcObject = stream;
      peer.audioEl = a;
      applyOutput(a);
      playAudio(a);
      watchAudio(id, stream);
    } else {
      const stream = new MediaStream([e.track]);
      state.streams.set(id, stream);
      const t = state.tiles.get(id);
      if (t) { t.video.srcObject = stream; t.video.play().catch(() => {}); }
    }
  };
  pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') toast(`Connection to ${state.users.get(id)?.name || 'a participant'} failed`); };
  peer.senders.audio = pc.addTrack(audioOut(), state.outStream);
  peer.senders.video = pc.addTrack(videoOut(), state.outStream);
  state.peers.set(id, peer);
  return peer;
}
async function callPeer(id) {
  const p = createPeer(id);
  await p.pc.setLocalDescription(await p.pc.createOffer());
  socket.emit('signal', { to: id, data: { sdp: p.pc.localDescription } });
}
function playAudio(a) {
  a.play().catch(() => {
    toast('Tap anywhere to turn on sound', 6000);
    document.addEventListener('pointerdown', () => state.peers.forEach((p) => p.audioEl && p.audioEl.play().catch(() => {})), { once: true });
  });
}
function closePeer(id) {
  const p = state.peers.get(id);
  if (p) {
    if (p.audioEl) { p.audioEl.srcObject = null; p.audioEl = null; }
    p.pc.close(); state.peers.delete(id);
  }
  state.streams.delete(id);
  unwatchAudio(id);
}
socket.on('signal', async ({ from, data }) => {
  const p = state.peers.get(from) || createPeer(from);
  if (data.sdp) {
    await p.pc.setRemoteDescription(data.sdp);
    while (p.pending.length) await p.pc.addIceCandidate(p.pending.shift()).catch(() => {});
    if (data.sdp.type === 'offer') {
      await p.pc.setLocalDescription(await p.pc.createAnswer());
      socket.emit('signal', { to: from, data: { sdp: p.pc.localDescription } });
    }
  } else if (data.candidate) {
    if (p.pc.remoteDescription) await p.pc.addIceCandidate(data.candidate).catch(() => {});
    else p.pending.push(data.candidate);
  }
});

/* ==========================================================
   ROOM: tiles + layout
   ========================================================== */
function statusOf(u) {
  if (u.sharing) return { text: 'Presenting', cls: 'blue' };
  if (u.status === 'busy') return { text: 'Busy', cls: 'bad' };
  if (u.status === 'away') return { text: 'Away', cls: 'warn' };
  if (u.status === 'brb') return { text: 'Be right back', cls: 'warn' };
  if (state.speaking.has(u.id)) return { text: 'Speaking', cls: 'blue' };
  if (u.hand) return { text: 'Hand raised', cls: 'warn' };
  return { text: 'Available', cls: 'ok' };
}
const handQueue = () => [...state.users.values()].filter((u) => u.hand).sort((a, b) => a.handAt - b.handAt).map((u) => u.id);

function makeTile(id) {
  const el = document.createElement('div');
  el.className = 'tile enter';
  el.dataset.id = id;
  el.addEventListener('animationend', (e) => { if (e.target === el) el.classList.remove('enter'); });
  el.innerHTML = `
    <video playsinline autoplay></video>
    <div class="tile-avatar"></div>
    <div class="present-note">${icon('monitor', 34)}<span>You're presenting to everyone</span></div>
    <div class="tile-top"><span class="pill hand" hidden></span><span class="pill pin" hidden>${icon('pin', 13)}</span></div>
    <div class="tile-actions">
      <button type="button" data-act="pin" aria-label="Pin"></button>
      <button type="button" data-act="menu" aria-label="More options">${icon('more', 18)}</button>
    </div>
    <div class="tile-label"><span class="mic"></span><span class="crown"></span><span class="dot"></span><span class="nm"></span><span class="vf"></span><span class="st"></span></div>
    <div class="tile-fx"></div>`;
  const t = {
    el, key: '',
    video: $('video', el), avatar: $('.tile-avatar', el), hand: $('.pill.hand', el), pin: $('.pill.pin', el),
    pinBtn: $('[data-act=pin]', el), mic: $('.mic', el), crown: $('.crown', el), dot: $('.dot', el),
    nm: $('.nm', el), vf: $('.vf', el), st: $('.st', el), fx: $('.tile-fx', el),
  };
  t.video.muted = true; // sound comes from a separate <audio> element per person
  if (id !== state.myId && state.streams.has(id)) t.video.srcObject = state.streams.get(id);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'pin') togglePin(id);
    if (b.dataset.act === 'menu') userMenu(id, b);
  });
  el.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) togglePin(id); });
  state.tiles.set(id, t);
  return t;
}

function updateTile(id) {
  const u = state.users.get(id), t = state.tiles.get(id);
  if (!u || !t) return;
  const isMe = id === state.myId;
  const showVideo = isMe ? state.camOn && !!state.camTrack && !state.sharing : u.camOn || u.sharing;

  t.el.classList.toggle('video-off', !showVideo);
  t.el.classList.toggle('contain', !isMe && u.sharing);
  t.el.classList.toggle('mirror', isMe);
  t.el.classList.toggle('presenting-self', isMe && state.sharing);
  t.el.classList.toggle('speaking', state.speaking.has(id));
  t.el.classList.toggle('pinned', state.pinned === id);

  if (isMe && t.video.srcObject !== state.previewStream) t.video.srcObject = state.previewStream;

  const key = u.name + '|' + (u.avatar ? u.avatar.length : 0);
  if (t.key !== key) { t.avatar.innerHTML = avatar(u, 'xl'); t.key = key; }

  const st = statusOf(u);
  t.nm.textContent = u.name + (isMe ? ' (You)' : '');
  t.mic.innerHTML = u.muted ? icon('mic-off', 15) : '';
  t.crown.innerHTML = u.role === 'host' ? icon('crown', 14) : '';
  t.crown.title = u.role === 'host' ? 'Host' : '';
  t.vf.innerHTML = u.verified ? icon('badge-check', 15) : '';
  t.vf.title = u.verified ? 'Signed-in account' : '';
  t.dot.className = 'dot ' + st.cls;
  t.st.textContent = st.text === 'Available' ? '' : st.text;

  if (u.hand) {
    const pos = handQueue().indexOf(id) + 1;
    if (t.hand.hidden) { t.hand.classList.remove('pop'); void t.hand.offsetWidth; t.hand.classList.add('pop'); }
    t.hand.hidden = false;
    t.hand.innerHTML = `${icon('hand', 14)}<span>${pos}</span>`;
    t.hand.title = 'Hand raised';
  } else t.hand.hidden = true;
  if (t.pin.hidden && state.pinned === id) { t.pin.classList.remove('pop'); void t.pin.offsetWidth; t.pin.classList.add('pop'); }
  t.pin.hidden = state.pinned !== id;
  t.pinBtn.innerHTML = icon(state.pinned === id ? 'pin-off' : 'pin', 17);
  t.pinBtn.title = state.pinned === id ? 'Unpin' : 'Pin';
}

function setChildren(parent, els) {
  const cur = [...parent.children];
  if (cur.length === els.length && cur.every((c, i) => c === els[i])) return;
  parent.replaceChildren(...els);
  els.forEach((e) => { const v = $('video', e); if (v) v.play().catch(() => {}); });
}
function bestCols(n, w, h) {
  let best = 1, bestArea = 0;
  for (let c = 1; c <= n; c++) {
    const r = Math.ceil(n / c), ar = 16 / 9;
    const tw = Math.min(w / c, (h / r) * ar);
    const area = tw * (tw / ar);
    if (area > bestArea) { bestArea = area; best = c; }
  }
  return best;
}

function layout() {
  for (const id of state.users.keys()) if (!state.tiles.has(id)) makeTile(id);
  for (const [id, t] of state.tiles) if (!state.users.has(id)) { t.el.remove(); state.tiles.delete(id); }
  if (state.pinned && !state.users.has(state.pinned)) state.pinned = null;

  const stage = $('#stage'), grid = $('#grid'), feat = $('#featured');
  let ids = [...state.users.keys()];
  if (!S.selfView && ids.length > 1) ids = ids.filter((id) => id !== state.myId);
  const presenter = ids.find((id) => state.users.get(id).sharing);
  const featured = state.pinned || presenter;
  const spot = !!featured && ids.length > 1;
  stage.classList.toggle('spotlight', spot);

  if (spot) {
    setChildren(feat, [state.tiles.get(featured).el]);
    setChildren(grid, ids.filter((id) => id !== featured).map((id) => state.tiles.get(id).el));
    grid.style.gridTemplateColumns = grid.style.gridTemplateRows = '';
    grid.classList.remove('tiled');
  } else {
    setChildren(feat, []);
    setChildren(grid, ids.map((id) => state.tiles.get(id).el));
    // 16:9 tiles, sized to fit the stage, so video is never stretched or cropped
    const { width, height } = grid.getBoundingClientRect();
    const n = ids.length, cols = bestCols(n, width, height), rows = Math.ceil(n / cols), gap = 12;
    const cw = (width - gap * (cols - 1)) / cols, ch = (height - gap * (rows - 1)) / rows;
    const tw = Math.max(90, Math.floor(Math.min(cw, (ch * 16) / 9))), th = Math.floor((tw * 9) / 16);
    grid.style.gridTemplateColumns = `repeat(${cols}, ${tw}px)`;
    grid.style.gridTemplateRows = `repeat(${rows}, ${th}px)`;
    grid.classList.add('tiled');
  }
}
new ResizeObserver(() => { if (joined()) layout(); }).observe($('#stage'));

function togglePin(id) {
  sfx.play(state.pinned === id ? 'unpin' : 'pin');
  state.pinned = state.pinned === id ? null : id;
  refreshAll();
}

function floatEmoji(id, emoji) {
  const t = state.tiles.get(id);
  if (!t || !S.reactionAnim) return;
  const s = document.createElement('span');
  s.className = 'float-emoji';
  s.style.setProperty('--dx', Math.round(Math.random() * 90 - 45) + 'px');
  s.textContent = emoji;
  s.style.left = 15 + Math.random() * 65 + '%';
  t.fx.append(s);
  setTimeout(() => s.remove(), 2700);
}

function setNum(el, v) {
  if (el.textContent === String(v)) return;
  el.textContent = v;
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}

function refreshAll() {
  if (!joined()) return;
  layout();
  for (const id of state.tiles.keys()) updateTile(id);
  renderDock();
  setNum($('#count'), state.users.size);
  setNum($('#people-badge'), state.users.size);
  if (state.panel === 'people') renderPeople();
  if (state.panel === 'host') renderHost();
}

/* ==========================================================
   DOCK
   ========================================================== */
function renderDock() {
  const m = me();
  setCtl($('#btn-mic'), state.micOn ? 'mic' : 'mic-off', state.micOn ? 'Mute (M)' : 'Unmute (M)', state.micOn ? '' : 'off');
  setCtl($('#btn-cam'), state.camOn ? 'video' : 'video-off', state.camOn ? 'Turn off camera (V)' : 'Turn on camera (V)', state.camOn ? '' : 'off');
  setCtl($('#btn-share'), 'monitor', state.sharing ? 'Stop presenting' : 'Present screen', state.sharing ? 'on' : '');
  setCtl($('#btn-react'), 'smile', 'Reactions');
  setCtl($('#btn-hand'), 'hand', m.hand ? 'Lower hand (H)' : 'Raise hand (H)', m.hand ? 'soft-on' : '');
  setCtl($('#btn-leave'), 'phone', 'Leave', 'leave');
  $('#btn-status').className = 'ctl';
  $('#status-ico').innerHTML = icon('user', 22);
  const st = STATUS_LIST.find((s) => s.id === m.status) || STATUS_LIST[0];
  $('#status-dot').style.background = `var(--${st.cls === 'blue' ? 'blue' : st.cls})`;
  $('#btn-status').dataset.tip = `Status: ${st.label}`;
  $('#btn-chat').classList.toggle('soft-on', state.panel === 'chat');
  $('#btn-people').classList.toggle('soft-on', state.panel === 'people');
  $('#btn-host').classList.toggle('soft-on', state.panel === 'host');
}

function applySettingsUI() {
  const m = me();
  $('#lock-ind').hidden = !state.settings.locked;
  $('#btn-host').hidden = !isMod(m);
  const n = isMod(m) ? state.waiting.length : 0;
  const hb = $('#host-badge');
  hb.hidden = !n; hb.textContent = n; hb.classList.add('alert');
  if (!isMod(m) && state.panel === 'host') closePanel();
}

const toggleHand = () => { const m = me(); socket.emit('hand', !m.hand); };

const leaveNow = () => { if (S.confirmLeave && !confirm('Leave this meeting?')) return; location.href = '/'; };

$('#btn-mic').onclick = () => setMic(!state.micOn);
$('#btn-cam').onclick = () => setCamera(!state.camOn);
$('#btn-share').onclick = toggleShare;
$('#btn-hand').onclick = toggleHand;
$('#btn-chat').onclick = () => openPanel('chat');
$('#btn-people').onclick = () => openPanel('people');
$('#btn-host').onclick = () => openPanel('host');
$('#panel-close').onclick = closePanel;

$('#btn-react').onclick = (e) => {
  const row = document.createElement('div');
  row.className = 'emoji-row';
  REACTIONS.forEach((r) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = r; b.setAttribute('aria-label', 'React ' + r);
    b.style.animationDelay = row.children.length * 28 + 'ms';
    b.onclick = () => { socket.emit('reaction', r); closeMenu(); };
    row.append(b);
  });
  openPopover(e.currentTarget, row);
};
$('#btn-status').onclick = (e) => {
  const m = me();
  openMenu(e.currentTarget, [
    { title: 'Your status' },
    ...STATUS_LIST.map((s) => ({
      label: s.label, html: `<span class="dot ${s.cls}" style="margin:0 5px"></span>`, check: m.status === s.id,
      onClick: () => { m.status = s.id; socket.emit('update', { status: s.id }); refreshAll(); },
    })),
  ]);
};
$('#btn-leave').onclick = (e) => {
  const m = me();
  if (m.role === 'host' && state.users.size > 1) {
    openMenu(e.currentTarget, [
      { label: 'Leave meeting', icon: 'phone', onClick: leaveNow },
      { label: 'End meeting for everyone', icon: 'x', danger: true, onClick: () => hostAct('end') },
    ]);
  } else leaveNow();
};
$('#code-chip').onclick = async () => {
  const url = `${location.origin}/${state.code}`;
  try { await navigator.clipboard.writeText(url); toast('Invite link copied'); }
  catch { prompt('Copy this invite link', url); }
};
setInterval(() => {
  if (!state.joinedAt) return;
  const s = Math.floor((Date.now() - state.joinedAt) / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  $('#timer').textContent = (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sec).padStart(2, '0');
}, 1000);

document.addEventListener('keydown', (e) => {
  if (!joined() || !S.shortcuts || e.metaKey || e.ctrlKey || e.altKey) return;
  if (/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === 'm') setMic(!state.micOn);
  else if (k === 'v') setCamera(!state.camOn);
  else if (k === 'h') toggleHand();
  else if (k === 'escape') { closeMenu(); closeModal(); }
});

/* ==========================================================
   PANELS
   ========================================================== */
const PANEL_TITLES = { people: 'People', chat: 'Chat', host: 'Host tools' };
function openPanel(name, force = false) {
  if (state.panel === name && !force) return closePanel();
  if (!state.panel) sfx.play('open');
  state.panel = name;
  $('#panel').classList.remove('closing');
  $('#panel').hidden = false;
  $('#panel-title').textContent = PANEL_TITLES[name];
  if (name === 'people') renderPeople(true);
  if (name === 'chat') renderChat();
  if (name === 'host') renderHost();
  renderDock();
}
function closePanel() {
  if (!state.panel) return;
  state.panel = null;
  sfx.play('close');
  const p = $('#panel');
  const done = () => { if (!state.panel) p.hidden = true; p.classList.remove('closing'); layout(); };
  if (S.anim) { p.classList.add('closing'); setTimeout(done, 190); } else done();
  renderDock();
}
new ResizeObserver(() => { /* stage observer handles relayout */ }).observe($('#panel'));

/* ---------- people ---------- */
const hostAct = (action, target) => socket.emit('host-action', { action, target });

function sortedUsers() {
  const rank = { host: 0, cohost: 1, participant: 2 };
  return [...state.users.values()].sort((a, b) =>
    (a.id === state.myId ? -1 : b.id === state.myId ? 1 : 0) ||
    rank[a.role] - rank[b.role] ||
    (b.hand - a.hand) || (a.handAt - b.handAt) ||
    a.name.localeCompare(b.name));
}

function renderPeople(animate = false) {
  const body = $('#panel-body');
  const mod = isMod(me());
  let html = '';
  if (mod && state.waiting.length) {
    html += `<div class="sec"><div class="sec-h">Waiting to join <span class="count">${state.waiting.length}</span>
      <button class="link" data-act="admit-all">Admit all</button></div>
      ${state.waiting.map((w) => `
        <div class="row">${avatar(w)}
          <div class="row-main"><div class="row-name"><span class="t">${esc(w.name)}</span></div></div>
          <button class="btn sm" data-act="deny" data-id="${w.id}">Deny</button>
          <button class="btn sm primary" data-act="admit" data-id="${w.id}">Admit</button>
        </div>`).join('')}</div>`;
  }
  html += `<div class="sec"><div class="sec-h">In this meeting <span class="count">${state.users.size}</span>
    ${[...state.users.values()].some((u) => u.hand) && mod ? '<button class="link" data-act="lower-all">Lower all hands</button>' : ''}</div>`;
  let i = 0;
  for (const u of sortedUsers()) {
    i++;
    const st = statusOf(u), isMe = u.id === state.myId;
    html += `<div class="row${animate ? ' enter' : ''}" style="--i:${i}" data-id="${u.id}">${avatar(u)}
      <div class="row-main">
        <div class="row-name"><span class="t">${esc(u.name)}</span>${u.verified ? `<span class="vf" title="Signed-in account">${icon('badge-check', 15)}</span>` : ''}${isMe ? '<span class="tag">You</span>' : ''}${u.role === 'host' ? '<span class="tag host">Host</span>' : u.role === 'cohost' ? '<span class="tag">Co-host</span>' : ''}</div>
        <div class="row-status"><i class="dot ${st.cls}"></i>${st.text}</div>
      </div>
      <div class="row-icons">
        ${u.hand ? `<span class="hand" title="Hand raised">${icon('hand', 17)}</span>` : ''}
        ${u.sharing ? `<span title="Presenting" style="color:var(--blue)">${icon('monitor', 17)}</span>` : ''}
        <span class="${u.muted ? 'bad' : ''}" title="${u.muted ? 'Muted' : 'Mic on'}">${icon(u.muted ? 'mic-off' : 'mic', 17)}</span>
        <span class="${u.camOn ? '' : 'bad'}" title="${u.camOn ? 'Camera on' : 'Camera off'}">${icon(u.camOn ? 'video' : 'video-off', 17)}</span>
      </div>
      <button class="icon-btn" data-act="menu" aria-label="Options for ${esc(u.name)}">${icon('more', 18)}</button>
    </div>`;
  }
  html += '</div>';
  body.innerHTML = html;
}
$('#panel-body').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || state.panel !== 'people') return;
  const id = b.dataset.id || b.closest('[data-id]')?.dataset.id;
  switch (b.dataset.act) {
    case 'admit': hostAct('admit', id); break;
    case 'deny': hostAct('deny', id); break;
    case 'admit-all': hostAct('admit-all'); break;
    case 'lower-all': hostAct('lower-all-hands'); break;
    case 'menu': userMenu(id, b); break;
  }
});

function userMenu(id, anchor) {
  const u = state.users.get(id), m = me();
  if (!u) return;
  const isMe = id === state.myId, iHost = m.role === 'host';
  const items = [
    { label: state.pinned === id ? 'Unpin' : 'Pin to screen', icon: state.pinned === id ? 'pin-off' : 'pin', onClick: () => togglePin(id) },
  ];
  if (!isMe) items.push({ label: 'Send private message', icon: 'message', onClick: () => startDM(id) });
  if (u.hand && (isMe || isMod(m))) items.push({ label: 'Lower hand', icon: 'hand-off', onClick: () => (isMe ? toggleHand() : hostAct('lower-hand', id)) });

  if (isMod(m) && !isMe) {
    items.push('sep');
    if (!u.muted) items.push({ label: 'Mute', icon: 'mic-off', onClick: () => hostAct('mute', id) });
    if (u.camOn) items.push({ label: 'Stop video', icon: 'video-off', onClick: () => hostAct('stop-video', id) });
    if (u.sharing) items.push({ label: 'Stop screen share', icon: 'monitor', onClick: () => hostAct('stop-share', id) });
    if (iHost && u.role !== 'host') {
      items.push({ label: u.role === 'cohost' ? 'Remove co-host' : 'Make co-host', icon: 'shield', onClick: () => hostAct(u.role === 'cohost' ? 'remove-cohost' : 'make-cohost', id) });
      items.push({ label: 'Make host', icon: 'crown', onClick: () => hostAct('make-host', id) });
    }
    if (u.role !== 'host' && !(u.role === 'cohost' && !iHost)) {
      items.push('sep');
      items.push({ label: 'Remove from meeting', icon: 'user-x', danger: true, onClick: () => hostAct('remove', id) });
    }
  }
  openMenu(anchor, items);
}

/* ---------- chat ---------- */
function addGroupThread(g) {
  state.groups.set(g.id, g);
  state.threads.set('g:' + g.id, { id: 'g:' + g.id, kind: 'group', gid: g.id, title: g.name, msgs: [], unread: 0 });
}
function startDM(peer) {
  const u = state.users.get(peer);
  if (!u) return;
  const key = 'dm:' + peer;
  if (!state.threads.has(key)) state.threads.set(key, { id: key, kind: 'dm', peer, title: u.name, msgs: [], unread: 0 });
  state.active = key;
  openPanel('chat', true);
}
function onChat(m) {
  let key;
  if (m.scope === 'all') key = 'all';
  else if (m.scope === 'group') key = 'g:' + m.to;
  else {
    const peer = m.from === state.myId ? m.to : m.from;
    key = 'dm:' + peer;
    if (!state.threads.has(key)) state.threads.set(key, { id: key, kind: 'dm', peer, title: state.users.get(peer)?.name || m.name, msgs: [], unread: 0 });
  }
  const th = state.threads.get(key);
  if (!th) return;
  th.msgs.push(m);
  if (m.from !== state.myId) sfx.play(m.scope === 'all' ? 'message' : 'dm');
  const viewing = state.panel === 'chat' && state.active === key;
  if (!viewing && m.from !== state.myId) {
    th.unread++;
    const where = th.kind === 'all' ? '' : th.kind === 'dm' ? ' (private)' : ` (${th.title})`;
    toast(`${m.name}${where}: ${m.text.slice(0, 70)}`, 4000, 'chat');
  }
  updateBadges();
  if (state.panel === 'chat') renderChat();
}
function updateBadges() {
  const n = [...state.threads.values()].reduce((a, t) => a + t.unread, 0);
  const b = $('#chat-badge');
  b.hidden = !n; b.textContent = n;
}
function threadGate(th) {
  const mod = isMod(me());
  if (th.kind === 'all' && !state.settings.chat && !mod) return 'The host has turned off chat';
  if (th.kind !== 'all' && !state.settings.dm && !mod) return 'The host has turned off private and group chat';
  if (th.kind === 'dm' && !state.users.has(th.peer)) return `${th.title} left the meeting`;
  return '';
}

function renderChat() {
  const body = $('#panel-body');
  let th = state.threads.get(state.active);
  if (!th) { state.active = 'all'; th = state.threads.get('all'); }
  th.unread = 0;
  updateBadges();

  const old = $('#chat-input');
  const draft = old ? old.value : '';
  const focused = old && document.activeElement === old;
  const gate = threadGate(th);
  const seen = th.seen === undefined ? th.msgs.length : th.seen;
  th.seen = th.msgs.length;

  const chips = [...state.threads.values()].map((t) => {
    const ico = t.kind === 'all' ? 'users' : t.kind === 'dm' ? 'user' : 'message';
    return `<button class="cchip ${t.id === th.id ? 'active' : ''}" data-thread="${esc(t.id)}">${icon(ico, 15)}${esc(t.title)}${t.unread ? '<i class="unread"></i>' : ''}</button>`;
  }).join('');

  let info = 'Visible to everyone in this meeting.';
  if (th.kind === 'dm') info = `Private. Only you and ${esc(th.title)} can see this.`;
  if (th.kind === 'group') {
    const g = state.groups.get(th.gid);
    const names = (g ? g.members : []).map((id) => (id === state.myId ? 'You' : state.users.get(id)?.name || 'Left')).join(', ');
    info = `Group chat. Members: ${esc(names)}`;
  }

  const msgs = th.msgs.length
    ? th.msgs.map((m, idx) => {
        const mine = m.from === state.myId;
        return `<div class="msg ${mine ? 'mine' : ''}${idx >= seen ? ' new' : ''}"><div class="meta">${mine ? '' : `<b>${esc(m.name)}</b> · `}${fmtTime(m.ts)}</div><div class="bubble">${esc(m.text)}</div></div>`;
      }).join('')
    : `<div class="empty">No messages yet. Say hello to start the conversation.</div>`;

  body.innerHTML = `
    <div class="chips">${chips}<button class="cchip add" data-act="new-chat" aria-label="New chat">${icon('plus', 16)}New</button></div>
    <div class="thread-info">${info}</div>
    <div class="msgs" id="msgs">${msgs}</div>
    <form class="compose" id="compose" autocomplete="off">
      <input id="chat-input" type="text" maxlength="2000" placeholder="${esc(gate || 'Send a message')}" ${gate ? 'disabled' : ''}>
      <button class="send" type="submit" aria-label="Send" ${gate ? 'disabled' : ''}>${icon('send', 19)}</button>
    </form>`;

  const msgsEl = $('#msgs');
  msgsEl.scrollTop = msgsEl.scrollHeight;
  const input = $('#chat-input');
  input.value = draft;
  if (focused || !draft) { if (!gate) input.focus(); }

  $('#compose').onsubmit = (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    const payload = { scope: th.kind === 'all' ? 'all' : th.kind, text };
    if (th.kind === 'dm') payload.to = th.peer;
    if (th.kind === 'group') payload.to = th.gid;
    socket.emit('chat', payload);
    sfx.play('send');
    input.value = '';
  };
}
$('#panel-body').addEventListener('click', (e) => {
  if (state.panel !== 'chat') return;
  const chip = e.target.closest('[data-thread]');
  if (chip) { state.active = chip.dataset.thread; return renderChat(); }
  const add = e.target.closest('[data-act=new-chat]');
  if (add) {
    const others = [...state.users.values()].filter((u) => u.id !== state.myId);
    openMenu(add, [
      { title: 'Private message' },
      ...(others.length
        ? others.map((u) => ({ label: u.name, html: avatar(u, 'sm'), onClick: () => startDM(u.id) }))
        : [{ title: 'No one else is here yet' }]),
      'sep',
      { label: 'New group chat…', icon: 'users', onClick: openGroupModal },
    ]);
  }
});

function openGroupModal() {
  const others = [...state.users.values()].filter((u) => u.id !== state.myId);
  if (!others.length) return toast('No one else is in the meeting yet');
  const root = $('#overlay-root');
  root.innerHTML = `
    <div class="modal-bg"><div class="modal" role="dialog" aria-modal="true" aria-label="New group chat">
      <h3>New group chat</h3>
      <div class="mb">
        <input type="text" id="g-name" maxlength="30" placeholder="Group name">
        ${others.map((u) => `<label class="pick">${avatar(u, 'sm')}<span style="flex:1">${esc(u.name)}</span><input type="checkbox" value="${u.id}"></label>`).join('')}
      </div>
      <div class="mf"><button class="btn sm" type="button" data-x>Cancel</button><button class="btn sm primary" type="button" data-ok>Create group</button></div>
    </div></div>`;
  sfx.play('open');
  $('#g-name').focus();
  root.querySelector('[data-x]').onclick = closeModal;
  root.querySelector('.modal-bg').addEventListener('mousedown', (e) => { if (e.target.classList.contains('modal-bg')) closeModal(); });
  root.querySelector('[data-ok]').onclick = () => {
    const members = $$('.pick input:checked', root).map((c) => c.value);
    if (!members.length) return toast('Pick at least one person');
    socket.emit('group-create', { name: $('#g-name').value, members });
    closeModal();
  };
}
function closeModal() {
  const r = $('#overlay-root');
  if (!r.innerHTML) return;
  if (typeof stopMeter === 'function') stopMeter();
  sfx.play('close');
  r.innerHTML = '';
}

/* ---------- host tools ---------- */
function renderHost() {
  const s = state.settings, iHost = me().role === 'host';
  const sw = (key, title, sub, on) => `
    <div class="setting"><div class="txt"><b>${title}</b><span>${sub}</span></div>
      <button class="switch" role="switch" aria-checked="${on}" aria-label="${title}" data-key="${key}"></button></div>`;
  $('#panel-body').innerHTML = `
    <div class="sec">
      ${sw('locked', 'Lock meeting', 'No one new can join while locked', s.locked)}
      ${sw('waiting', 'Waiting room', 'Let people in one at a time', s.waiting)}
      ${sw('accountsOnly', 'Signed-in people only', 'Guests cannot join this meeting', s.accountsOnly)}
      ${sw('chat', 'Everyone chat', 'Participants can post to the main chat', s.chat)}
      ${sw('dm', 'Private and group chat', 'Participants can message each other', s.dm)}
      ${sw('selfUnmute', 'Unmute themselves', 'Participants can turn their own mic on', s.selfUnmute)}
      ${sw('share', 'Screen sharing', 'Allow participants to present', s.share === 'all')}
    </div>
    <div class="stack">
      <button class="btn" data-hact="mute-all">${icon('mic-off', 18)}Mute everyone</button>
      <button class="btn" data-hact="lower-all-hands">${icon('hand-off', 18)}Lower all hands</button>
      ${iHost ? `<button class="btn danger" data-hact="end">${icon('x', 18)}End meeting for everyone</button>` : ''}
    </div>`;
}
$('#panel-body').addEventListener('click', (e) => {
  if (state.panel !== 'host') return;
  const sw = e.target.closest('.switch');
  if (sw) {
    const key = sw.dataset.key, on = sw.getAttribute('aria-checked') === 'true';
    sfx.play(on ? 'toggleOff' : 'toggleOn');
    socket.emit('setting', { key, value: key === 'share' ? (on ? 'host' : 'all') : !on });
    return;
  }
  const b = e.target.closest('[data-hact]');
  if (!b) return;
  if (b.dataset.hact === 'end' && !confirm('End this meeting for everyone?')) return;
  hostAct(b.dataset.hact);
});

/* ==========================================================
   MENUS / POPOVERS
   ========================================================== */
let menuEl = null, menuAnchor = null;
function closeMenu() {
  if (menuEl) menuEl.remove();
  menuEl = menuAnchor = null;
}
function mountPopover(anchor, el) {
  if (menuEl && menuAnchor === anchor) return closeMenu();
  closeMenu();
  el.classList.add('menu');
  document.body.append(el);
  const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
  const above = r.top > window.innerHeight / 2;
  let top = above ? r.top - h - 10 : r.bottom + 8;
  top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
  let left = r.left + r.width / 2 - w / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
  el.style.top = top + 'px';
  el.style.left = left + 'px';
  menuEl = el; menuAnchor = anchor;
  sfx.play('open');
}
function openPopover(anchor, node) {
  const el = document.createElement('div');
  el.append(node);
  mountPopover(anchor, el);
}
function openMenu(anchor, items) {
  const el = document.createElement('div');
  el.setAttribute('role', 'menu');
  for (const it of items) {
    if (it === 'sep') { el.insertAdjacentHTML('beforeend', '<div class="menu-sep"></div>'); continue; }
    if (it.title) { el.insertAdjacentHTML('beforeend', `<div class="menu-title">${esc(it.title)}</div>`); continue; }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'menu-item' + (it.danger ? ' danger' : '');
    b.setAttribute('role', 'menuitem');
    b.innerHTML = (it.html || (it.icon ? icon(it.icon, 18) : '')) + `<span class="grow">${esc(it.label)}</span>` + (it.check ? icon('check', 16) : '');
    b.onclick = () => { closeMenu(); it.onClick && it.onClick(); };
    b.style.setProperty('--i', el.children.length);
    el.append(b);
  }
  mountPopover(anchor, el);
}
document.addEventListener('pointerdown', (e) => {
  if (menuEl && !menuEl.contains(e.target) && !(menuAnchor && menuAnchor.contains(e.target))) closeMenu();
}, true);
window.addEventListener('resize', closeMenu);

/* ---------------- boot ---------------- */
renderLobby();
// Safety net: if the sign-in script ever fails to load, fall back to the lobby.
setTimeout(() => { if ($$('#app > section').every((s) => s.hidden)) showView('lobby'); }, 2500);
