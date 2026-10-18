/**
 * Nova — signaling + room server
 * Express serves the client, Socket.IO handles rooms, chat, host controls and
 * WebRTC signaling (video/audio flows peer-to-peer between browsers).
 */
const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const https = require('https');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server({
  maxHttpBufferSize: 2e6,
  cors: { origin: '*' },        // lets the Vercel site talk to this server
  pingInterval: 20000,
  pingTimeout: 30000,
});
io.attach(server); // the HTTPS server is attached too, so both share the same rooms

const PUBLIC = path.join(__dirname, 'public');
app.get('/health', (_req, res) => res.send('ok'));
app.get('/api/info', (_req, res) => { res.set('Access-Control-Allow-Origin', '*'); res.json({ verify: VERIFY_ON }); });
app.use(express.static(PUBLIC));
// Meeting links look like /abc-defg-hij — serve the app for them.
app.get('/:code([a-z]{3}-[a-z]{4}-[a-z]{3})', (_req, res) =>
  res.sendFile(path.join(PUBLIC, 'index.html'))
);

/* ------------------------------ helpers ------------------------------ */

// Account checking. Uses the same Supabase URL + anon key the page already has in public/config.js
// (or SUPABASE_URL / SUPABASE_ANON_KEY environment variables, if you prefer).
function readClientConfig() {
  try {
    const t = fs.readFileSync(path.join(PUBLIC, 'config.js'), 'utf8');
    const get = (k) => { const m = t.match(new RegExp(k + "\\s*=\\s*'([^']*)'")); return m ? m[1] : ''; };
    return { url: get('NOVA_SUPABASE_URL'), key: get('NOVA_SUPABASE_KEY') };
  } catch { return { url: '', key: '' }; }
}
const clientCfg = readClientConfig();
const SB_URL = (process.env.SUPABASE_URL || clientCfg.url || '').replace(/\/$/, '');
const SB_KEY = process.env.SUPABASE_ANON_KEY || clientCfg.key || '';
const VERIFY_ON = !!(SB_URL && SB_KEY);

async function verifyToken(token) {
  if (!VERIFY_ON || typeof token !== 'string' || token.length > 4000) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 5000);
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` }, signal: ctl.signal });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? { uid: u.id, email: u.email || '' } : null;
  } catch { return null; } finally { clearTimeout(timer); }
}
const rooms = new Map();
const STATUSES = ['available', 'busy', 'away', 'brb'];
const AVATAR_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

const validCode = (c) => /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(c);
const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40);
const cleanText = (s) =>
  String(s || '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, 2000);
const isMod = (u) => !!u && (u.role === 'host' || u.role === 'cohost');

const pub = (u) => ({
  id: u.id, name: u.name, avatar: u.avatar, role: u.role,
  muted: u.muted, camOn: u.camOn, sharing: u.sharing,
  hand: u.hand, handAt: u.handAt, status: u.status, verified: !!u.verified,
});

function newRoom(code) {
  return {
    code,
    users: new Map(),     // socketId -> user (join order preserved)
    waiting: new Map(),   // socketId -> user
    groups: new Map(),    // groupId -> { id, name, members[], createdBy }
    history: [],          // last 100 "everyone" messages
    settings: {
      locked: false,
      accountsOnly: false, // only signed-in (verified) people may join
      waiting: false,     // waiting room
      chat: true,         // participants can use everyone-chat
      dm: true,           // participants can use private + group chat
      selfUnmute: true,   // participants can unmute themselves
      share: 'all',       // 'all' | 'host' — who can share their screen
    },
  };
}

function pushWaiting(room) {
  const list = [...room.waiting.values()].map((u) => ({ id: u.id, name: u.name, avatar: u.avatar, verified: !!u.verified }));
  for (const u of room.users.values()) if (isMod(u)) io.to(u.id).emit('waiting-list', list);
}

function enter(socket, room, user) {
  socket.data.code = room.code;
  socket.data.pending = null;
  room.users.set(user.id, user);
  socket.join(room.code);
  socket.emit('joined', {
    code: room.code,
    me: pub(user),
    participants: [...room.users.values()].filter((u) => u.id !== user.id).map(pub),
    groups: [...room.groups.values()].filter((g) => g.members.includes(user.id)),
    settings: room.settings,
    history: room.history,
  });
  socket.to(room.code).emit('participant-joined', pub(user));
  if (isMod(user)) pushWaiting(room);
}

function leave(socket) {
  if (socket.data.pending) {
    const room = rooms.get(socket.data.pending);
    socket.data.pending = null;
    if (room) { room.waiting.delete(socket.id); pushWaiting(room); }
    return;
  }
  const code = socket.data.code;
  if (!code) return;
  socket.data.code = null;
  socket.leave(code);
  const room = rooms.get(code);
  if (!room) return;

  const user = room.users.get(socket.id);
  room.users.delete(socket.id);
  room.groups.forEach((g) => { g.members = g.members.filter((m) => m !== socket.id); });
  io.to(code).emit('participant-left', socket.id);

  if (room.users.size === 0) {
    room.waiting.forEach((_u, id) => {
      io.to(id).emit('entry-denied', { reason: 'The meeting has ended.' });
      const s = io.sockets.sockets.get(id);
      if (s) s.data.pending = null;
    });
    rooms.delete(code);
    return;
  }
  if (user && user.role === 'host') {
    const all = [...room.users.values()];
    const next = all.find((u) => u.role === 'cohost') || all[0];
    next.role = 'host';
    io.to(code).emit('participant-updated', { id: next.id, patch: { role: 'host' } });
    io.to(code).emit('notice', { message: `${next.name} is now the host` });
    pushWaiting(room);
  }
}

/* ------------------------------ sockets ------------------------------ */
io.on('connection', (socket) => {
  const ctx = () => {
    const room = rooms.get(socket.data.code);
    const user = room && room.users.get(socket.id);
    return user ? { room, user } : null;
  };
  const deny = (message) => socket.emit('denied', { message });

  socket.on('join', async (p, ack = () => {}) => {
    p = p || {};
    const code = String(p.code || '').toLowerCase();
    if (!validCode(code)) return ack({ error: 'invalid' });
    if (socket.data.code || socket.data.pending || socket.data.joining) return ack({ error: 'busy' });

    // Check the sign-in token with Supabase (if the person is logged in and checking is on)
    socket.data.joining = true;
    const acct = p.token ? await verifyToken(p.token) : null;
    socket.data.joining = false;
    if (!socket.connected) return;

    const user = {
      id: socket.id,
      uid: acct ? acct.uid : null,
      verified: !!acct,
      name: cleanName(p.name) || 'Guest',
      avatar: typeof p.avatar === 'string' && p.avatar.length < 400000 && AVATAR_RE.test(p.avatar) ? p.avatar : null,
      role: 'participant',
      muted: !!p.muted,
      camOn: !!p.camOn,
      sharing: false,
      hand: false,
      handAt: 0,
      status: 'available',
    };

    let room = rooms.get(code);
    let isOwner = false;
    if (!room) {
      room = newRoom(code);
      room.ownerUid = acct ? acct.uid : null; // the signed-in person who starts a room owns it
      rooms.set(code, room);
      user.role = 'host';
    } else {
      isOwner = !!(acct && room.ownerUid && room.ownerUid === acct.uid);
      if (!isOwner) {
        if (room.settings.accountsOnly && !acct) return ack({ error: 'accounts-only' });
        if (room.settings.locked) return ack({ error: 'locked' });
        if (room.settings.waiting) {
          room.waiting.set(socket.id, user);
          socket.data.pending = code;
          pushWaiting(room);
          return ack({ waiting: true });
        }
      }
    }

    // The room owner always gets the host role back when they rejoin
    let demoted = null;
    if (isOwner && room.users.size) {
      const h = [...room.users.values()].find((u) => u.role === 'host');
      if (h && h.uid && h.uid === user.uid) user.role = 'cohost';
      else { user.role = 'host'; if (h) { h.role = 'cohost'; demoted = h; } }
    }

    enter(socket, room, user);
    ack({ ok: true });

    if (demoted) {
      io.to(code).emit('participant-updated', { id: demoted.id, patch: { role: 'cohost' } });
      io.to(code).emit('notice', { message: `${user.name} (room owner) is now the host` });
    }
    if (p.token && !acct && VERIFY_ON) socket.emit('notice', { message: 'Could not verify your account, so you joined as a guest. Try logging in again.' });
  });

  socket.on('signal', ({ to, data } = {}) => {
    const c = ctx();
    if (c && c.room.users.has(to)) io.to(to).emit('signal', { from: socket.id, data });
  });

  socket.on('update', (patch = {}) => {
    const c = ctx(); if (!c) return;
    const { room, user } = c;
    const out = {};

    if (typeof patch.muted === 'boolean') {
      if (!patch.muted && !room.settings.selfUnmute && !isMod(user)) {
        deny('The host has turned off unmuting for participants.');
        socket.emit('force-mute');
        user.muted = true; out.muted = true;
      } else { user.muted = patch.muted; out.muted = patch.muted; }
    }
    if (typeof patch.camOn === 'boolean') { user.camOn = patch.camOn; out.camOn = patch.camOn; }
    if (typeof patch.sharing === 'boolean') {
      if (patch.sharing && room.settings.share === 'host' && !isMod(user)) {
        deny('Only hosts can share their screen.');
        socket.emit('force-stop-share');
        user.sharing = false; out.sharing = false;
      } else { user.sharing = patch.sharing; out.sharing = patch.sharing; }
    }
    if (STATUSES.includes(patch.status)) { user.status = patch.status; out.status = patch.status; }

    if (Object.keys(out).length) io.to(room.code).emit('participant-updated', { id: user.id, patch: out });
  });

  socket.on('profile', (p = {}) => {
    const c = ctx(); if (!c) return;
    const out = {};
    const n = cleanName(p.name);
    if (n) { c.user.name = n; out.name = n; }
    if (p.avatar === null) { c.user.avatar = null; out.avatar = null; }
    else if (typeof p.avatar === 'string' && p.avatar.length < 400000 && AVATAR_RE.test(p.avatar)) { c.user.avatar = p.avatar; out.avatar = p.avatar; }
    if (Object.keys(out).length) io.to(c.room.code).emit('participant-updated', { id: c.user.id, patch: out });
  });

  socket.on('hand', (raised) => {
    const c = ctx(); if (!c) return;
    c.user.hand = !!raised;
    c.user.handAt = raised ? Date.now() : 0;
    io.to(c.room.code).emit('participant-updated', { id: c.user.id, patch: { hand: c.user.hand, handAt: c.user.handAt } });
  });

  socket.on('reaction', (emoji) => {
    const c = ctx(); if (!c) return;
    if (typeof emoji !== 'string' || emoji.length > 8) return;
    io.to(c.room.code).emit('reaction', { id: socket.id, emoji });
  });

  /* ---- chat: everyone / private (dm) / group ---- */
  socket.on('chat', ({ scope, to, text } = {}) => {
    const c = ctx(); if (!c) return;
    const { room, user } = c;
    text = cleanText(text);
    if (!text) return;
    const msg = { id: crypto.randomUUID(), scope, from: user.id, name: user.name, text, ts: Date.now() };

    if (scope === 'all') {
      if (!room.settings.chat && !isMod(user)) return deny('Chat is turned off by the host.');
      room.history.push(msg);
      if (room.history.length > 100) room.history.shift();
      io.to(room.code).emit('chat', msg);
    } else if (scope === 'dm') {
      if (!room.settings.dm && !isMod(user)) return deny('Private chat is turned off by the host.');
      const target = room.users.get(to);
      if (!target || target.id === user.id) return;
      msg.to = target.id;
      io.to(target.id).emit('chat', msg);
      socket.emit('chat', msg);
    } else if (scope === 'group') {
      if (!room.settings.dm && !isMod(user)) return deny('Group chat is turned off by the host.');
      const g = room.groups.get(to);
      if (!g || !g.members.includes(user.id)) return;
      msg.to = g.id;
      g.members.forEach((m) => io.to(m).emit('chat', msg));
    }
  });

  socket.on('group-create', ({ name, members } = {}) => {
    const c = ctx(); if (!c) return;
    const { room, user } = c;
    if (!room.settings.dm && !isMod(user)) return deny('Group chat is turned off by the host.');
    const ids = [...new Set([user.id, ...(Array.isArray(members) ? members : [])])].filter((id) => room.users.has(id));
    if (ids.length < 2) return;
    const g = { id: crypto.randomUUID().slice(0, 8), name: cleanName(name).slice(0, 30) || 'Group', members: ids, createdBy: user.id };
    room.groups.set(g.id, g);
    ids.forEach((id) => io.to(id).emit('group-created', g));
  });

  /* ---- host / co-host controls ---- */
  socket.on('host-action', ({ action, target } = {}) => {
    const c = ctx(); if (!c) return;
    const { room, user } = c;
    if (!isMod(user)) return deny('Only the host can do that.');
    const isHost = user.role === 'host';
    const t = room.users.get(target);

    switch (action) {
      case 'mute':
        if (t && t.id !== user.id) io.to(t.id).emit('force-mute');
        break;
      case 'mute-all':
        room.users.forEach((u) => { if (u.id !== user.id && !isMod(u)) io.to(u.id).emit('force-mute'); });
        break;
      case 'stop-video':
        if (t && t.id !== user.id) io.to(t.id).emit('force-cam-off');
        break;
      case 'stop-share':
        if (t && t.id !== user.id) io.to(t.id).emit('force-stop-share');
        break;
      case 'lower-hand':
        if (t) { t.hand = false; t.handAt = 0; io.to(room.code).emit('participant-updated', { id: t.id, patch: { hand: false, handAt: 0 } }); }
        break;
      case 'lower-all-hands':
        room.users.forEach((u) => {
          if (u.hand) { u.hand = false; u.handAt = 0; io.to(room.code).emit('participant-updated', { id: u.id, patch: { hand: false, handAt: 0 } }); }
        });
        break;
      case 'remove': {
        if (!t || t.id === user.id || t.role === 'host') return;
        if (t.role === 'cohost' && !isHost) return;
        io.to(t.id).emit('removed');
        const s = io.sockets.sockets.get(t.id);
        if (s) leave(s);
        break;
      }
      case 'make-host': {
        if (!isHost || !t || t.id === user.id) return;
        user.role = 'cohost'; t.role = 'host';
        io.to(room.code).emit('participant-updated', { id: user.id, patch: { role: 'cohost' } });
        io.to(room.code).emit('participant-updated', { id: t.id, patch: { role: 'host' } });
        io.to(room.code).emit('notice', { message: `${t.name} is now the host` });
        pushWaiting(room);
        break;
      }
      case 'make-cohost':
      case 'remove-cohost': {
        if (!isHost || !t || t.role === 'host') return;
        t.role = action === 'make-cohost' ? 'cohost' : 'participant';
        io.to(room.code).emit('participant-updated', { id: t.id, patch: { role: t.role } });
        pushWaiting(room);
        break;
      }
      case 'admit': {
        const w = room.waiting.get(target); if (!w) return;
        room.waiting.delete(target);
        const s = io.sockets.sockets.get(target);
        if (s) enter(s, room, w);
        pushWaiting(room);
        break;
      }
      case 'admit-all':
        [...room.waiting.entries()].forEach(([id, w]) => {
          const s = io.sockets.sockets.get(id);
          room.waiting.delete(id);
          if (s) enter(s, room, w);
        });
        pushWaiting(room);
        break;
      case 'deny': {
        if (!room.waiting.has(target)) return;
        room.waiting.delete(target);
        io.to(target).emit('entry-denied', { reason: 'The host declined your request to join.' });
        const s = io.sockets.sockets.get(target);
        if (s) s.data.pending = null;
        pushWaiting(room);
        break;
      }
      case 'end': {
        if (!isHost) return;
        io.to(room.code).emit('meeting-ended');
        room.users.forEach((_u, id) => {
          const s = io.sockets.sockets.get(id);
          if (s) { s.data.code = null; s.leave(room.code); }
        });
        room.waiting.forEach((_u, id) => {
          io.to(id).emit('entry-denied', { reason: 'The meeting has ended.' });
          const s = io.sockets.sockets.get(id);
          if (s) s.data.pending = null;
        });
        rooms.delete(room.code);
        break;
      }
    }
  });

  socket.on('setting', ({ key, value } = {}) => {
    const c = ctx(); if (!c) return;
    const { room, user } = c;
    if (!isMod(user)) return deny('Only the host can change meeting settings.');
    const bool = ['locked', 'waiting', 'chat', 'dm', 'selfUnmute', 'accountsOnly'];
    if (key === 'accountsOnly' && value && !VERIFY_ON) return deny('Account checking is off on this server. Add your Supabase keys to public/config.js first.');
    if (bool.includes(key)) room.settings[key] = !!value;
    else if (key === 'share' && (value === 'all' || value === 'host')) room.settings.share = value;
    else return;

    if (key === 'waiting' && !value) {
      [...room.waiting.entries()].forEach(([id, w]) => {
        const s = io.sockets.sockets.get(id);
        room.waiting.delete(id);
        if (s) enter(s, room, w);
      });
      pushWaiting(room);
    }
    io.to(room.code).emit('settings', room.settings);
  });

  socket.on('leave', () => leave(socket));
  socket.on('disconnect', () => leave(socket));
});

/* ------------------------------ start ------------------------------ */
const lanIps = () =>
  Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && (i.family === 'IPv4' || i.family === 4) && !i.internal)
    .map((i) => i.address);

// Browsers only allow camera/mic on https (or localhost), so for other devices on
// your network we also serve https with an auto-generated self-signed certificate.
async function loadCert(ips) {
  const dir = path.join(__dirname, 'certs');
  const keyF = path.join(dir, 'key.pem'), certF = path.join(dir, 'cert.pem'), metaF = path.join(dir, 'ips.txt');
  const sig = ips.join(',');
  if (fs.existsSync(keyF) && fs.existsSync(certF) && fs.existsSync(metaF) && fs.readFileSync(metaF, 'utf8') === sig) {
    return { key: fs.readFileSync(keyF), cert: fs.readFileSync(certF) };
  }
  const selfsigned = require('selfsigned');
  const altNames = [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }, ...ips.map((ip) => ({ type: 7, ip }))];
  const pems = await Promise.resolve(selfsigned.generate([{ name: 'commonName', value: 'Nova local' }], {
    days: 365, keySize: 2048, algorithm: 'sha256',
    extensions: [{ name: 'basicConstraints', cA: true }, { name: 'subjectAltName', altNames }],
  }));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(keyF, pems.private);
  fs.writeFileSync(certF, pems.cert);
  fs.writeFileSync(metaF, sig);
  return { key: pems.private, cert: pems.cert };
}

const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

server.listen(PORT, '0.0.0.0', async () => {
  const ips = lanIps();
  console.log('\n  ✦ Nova is running\n');
  console.log(`    This computer     http://localhost:${PORT}`);
  // Hosting platforms (Render, Railway, Fly...) already provide https, so skip the self-signed one there.
  const hosted = process.env.NO_LOCAL_HTTPS || process.env.RENDER || process.env.RAILWAY_ENVIRONMENT || process.env.FLY_APP_NAME || process.env.NODE_ENV === 'production';
  if (hosted) return console.log('    Running in hosted mode (https is handled by your host)\n');
  try {
    const creds = await loadCert(ips);
    const httpsServer = https.createServer(creds, app);
    io.attach(httpsServer);
    httpsServer.on('error', (e) => console.log('\n    HTTPS could not start:', e.message, '\n'));
    httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
      if (ips.length) ips.forEach((ip) => console.log(`    Other devices     https://${ip}:${HTTPS_PORT}`));
      else console.log(`    Other devices     https://<this-computer-ip>:${HTTPS_PORT}`);
      console.log('\n    On the other device, accept the one-time security warning');
      console.log('    (Advanced → Proceed). Camera and mic need that https address.\n');
    });
  } catch (e) {
    console.log('\n    HTTPS is off. Run "npm install" to enable it for other devices.');
    console.log('    (' + e.message.split('\n')[0] + ')\n');
  }
});
