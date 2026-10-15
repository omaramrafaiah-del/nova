'use strict';
/* ==========================================================
   Nova — preferences + sound effects
   Loaded before app.js. Sounds are synthesized with WebAudio,
   so there are no audio files to download.
   ========================================================== */

const DEFAULTS = {
  // devices + video
  camId: '', micId: '', spkId: '', quality: 'hd', fit: 'fit', mirror: true,
  selfView: true, showNames: true, showStatus: true, speakingRing: true,
  // audio
  volume: 1, noise: true, echo: true, agc: true,
  // sounds
  sound: true, sfxVol: 0.6, sUi: true, sPeople: true, sChat: true, sHand: true,
  sReact: true, sMic: true, sShare: true, sAlert: true, hoverSnd: false,
  // notifications
  toasts: true, joinToasts: true, chatToasts: true,
  // appearance
  anim: true, reactionAnim: true, accent: 'ice', corners: 'round',
  // meeting
  joinMuted: false, joinCamOff: false, shortcuts: true, confirmLeave: false,
};

let stored = {};
try { stored = JSON.parse(localStorage.getItem('nova.prefs') || '{}'); } catch { /* ignore */ }
const S = Object.assign({}, DEFAULTS, stored);
const savePrefs = () => { try { localStorage.setItem('nova.prefs', JSON.stringify(S)); } catch { /* ignore */ } };

/* ---------------- sound effects ---------------- */
const sfx = (() => {
  let master = null, lastSpecific = 0;
  const recent = {};

  const ready = () => {
    const c = getCtx(); // shared AudioContext from app.js
    if (!master) { master = c.createGain(); master.connect(c.destination); }
    master.gain.value = S.sfxVol;
    if (c.state === 'suspended') c.resume();
    return c;
  };

  const tone = (c, t, f, d, o = {}) => {
    const { type = 'sine', v = 0.3, to = null, a = 0.006 } = o;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    osc.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + d + 0.03);
  };
  // notes: [frequency, delay, duration]
  const seq = (c, t, notes, o) => notes.forEach(([f, dt, d]) => tone(c, t + dt, f, d, o));

  const sounds = {
    // interface
    click:     { cat: 'sUi', gap: 30, fn: (c, t) => tone(c, t, 1400, 0.035, { type: 'triangle', v: 0.14, to: 900 }) },
    hover:     { cat: 'hoverSnd', gap: 90, fn: (c, t) => tone(c, t, 2000, 0.02, { v: 0.05 }) },
    tab:       { cat: 'sUi', fn: (c, t) => tone(c, t, 1000, 0.05, { type: 'triangle', v: 0.14 }) },
    toggleOn:  { cat: 'sUi', fn: (c, t) => seq(c, t, [[660, 0, 0.09], [990, 0.07, 0.12]], { v: 0.26 }) },
    toggleOff: { cat: 'sUi', fn: (c, t) => seq(c, t, [[990, 0, 0.09], [660, 0.07, 0.12]], { v: 0.26 }) },
    open:      { cat: 'sUi', fn: (c, t) => tone(c, t, 420, 0.16, { v: 0.2, to: 720 }) },
    close:     { cat: 'sUi', fn: (c, t) => tone(c, t, 720, 0.14, { v: 0.2, to: 420 }) },
    pin:       { cat: 'sUi', fn: (c, t) => seq(c, t, [[880, 0, 0.06], [1320, 0.05, 0.1]], { type: 'triangle', v: 0.2 }) },
    unpin:     { cat: 'sUi', fn: (c, t) => seq(c, t, [[1320, 0, 0.06], [880, 0.05, 0.1]], { type: 'triangle', v: 0.2 }) },
    // chat
    send:      { cat: 'sChat', fn: (c, t) => tone(c, t, 600, 0.1, { v: 0.24, to: 1000 }) },
    message:   { cat: 'sChat', gap: 200, fn: (c, t) => seq(c, t, [[880, 0, 0.09], [1175, 0.08, 0.16]], { v: 0.28 }) },
    dm:        { cat: 'sChat', gap: 200, fn: (c, t) => seq(c, t, [[988, 0, 0.08], [1319, 0.08, 0.08], [1760, 0.16, 0.16]], { v: 0.26 }) },
    // people
    join:      { cat: 'sPeople', gap: 250, fn: (c, t) => seq(c, t, [[523, 0, 0.14], [784, 0.1, 0.24]], { v: 0.3 }) },
    leave:     { cat: 'sPeople', gap: 250, fn: (c, t) => seq(c, t, [[659, 0, 0.14], [440, 0.1, 0.26]], { v: 0.3 }) },
    knock:     { cat: 'sPeople', fn: (c, t) => seq(c, t, [[190, 0, 0.1], [190, 0.17, 0.1]], { type: 'triangle', v: 0.5, to: 100 }) },
    welcome:   { cat: 'sPeople', fn: (c, t) => seq(c, t, [[523, 0, 0.16], [659, 0.09, 0.16], [784, 0.18, 0.16], [1047, 0.27, 0.36]], { v: 0.28 }) },
    // hands + reactions
    hand:      { cat: 'sHand', gap: 200, fn: (c, t) => seq(c, t, [[1047, 0, 0.12], [1568, 0.09, 0.3]], { type: 'triangle', v: 0.3 }) },
    handDown:  { cat: 'sHand', fn: (c, t) => seq(c, t, [[784, 0, 0.1], [523, 0.08, 0.2]], { type: 'triangle', v: 0.24 }) },
    react:     { cat: 'sReact', gap: 110, fn: (c, t) => tone(c, t, 380, 0.12, { v: 0.28, to: 900 }) },
    // mic + camera
    mute:      { cat: 'sMic', fn: (c, t) => tone(c, t, 520, 0.12, { v: 0.26, to: 300 }) },
    unmute:    { cat: 'sMic', fn: (c, t) => tone(c, t, 360, 0.12, { v: 0.26, to: 700 }) },
    camOn:     { cat: 'sMic', fn: (c, t) => seq(c, t, [[600, 0, 0.07], [900, 0.06, 0.1]], { type: 'triangle', v: 0.22 }) },
    camOff:    { cat: 'sMic', fn: (c, t) => seq(c, t, [[900, 0, 0.07], [600, 0.06, 0.1]], { type: 'triangle', v: 0.22 }) },
    // screen share
    shareStart:{ cat: 'sShare', fn: (c, t) => { tone(c, t, 350, 0.3, { type: 'sawtooth', v: 0.07, to: 1100 }); tone(c, t, 700, 0.3, { v: 0.14, to: 1500 }); } },
    shareStop: { cat: 'sShare', fn: (c, t) => { tone(c, t, 1100, 0.26, { type: 'sawtooth', v: 0.06, to: 330 }); tone(c, t, 1400, 0.26, { v: 0.12, to: 500 }); } },
    // alerts + host actions
    alert:     { cat: 'sAlert', gap: 300, fn: (c, t) => seq(c, t, [[170, 0, 0.13], [150, 0.15, 0.18]], { type: 'square', v: 0.1 }) },
    notice:    { cat: 'sAlert', gap: 300, fn: (c, t) => seq(c, t, [[740, 0, 0.12], [740, 0.14, 0.16]], { v: 0.22 }) },
    ended:     { cat: 'sAlert', fn: (c, t) => seq(c, t, [[659, 0, 0.2], [523, 0.17, 0.2], [392, 0.34, 0.42]], { v: 0.28 }) },
  };

  return {
    get last() { return lastSpecific; },
    play(name, force = false) {
      const s = sounds[name];
      if (!s || !S.sound) return;
      if (!force && !S[s.cat]) return;
      const now = performance.now();
      if (recent[name] && now - recent[name] < (s.gap || 60)) return;
      recent[name] = now;
      if (name !== 'click' && name !== 'hover') lastSpecific = now;
      try { const c = ready(); s.fn(c, c.currentTime + 0.005); } catch { /* audio is optional */ }
    },
  };
})();

// Generic tap sound for any button that didn't trigger a more specific sound.
document.addEventListener('click', (e) => {
  if (!e.target.closest('button, .cchip, .menu-item, .pick, label.pfp, .swatch')) return;
  const t = performance.now();
  setTimeout(() => { if (sfx.last < t) sfx.play('click'); }, 25);
}, true);

document.addEventListener('pointerover', (e) => {
  if (!S.hoverSnd || e.pointerType === 'touch') return;
  const b = e.target.closest('button, .cchip');
  if (b && !b.contains(e.relatedTarget)) sfx.play('hover');
});
