# Nova

Video meetings in chilly blue. WebRTC video, Socket.IO signaling, no build step.

## Run it in VS Code

1. Install Node.js 18 or newer.
2. Open this folder in VS Code (`File > Open Folder`).
3. Open the terminal (`Ctrl+\``) and run:

```bash
npm install
npm start
```

4. Open http://localhost:3000, enter your name, and press **New meeting**.
5. Copy the invite link from the top bar and open it in a second tab or another device to test.

Use `npm run dev` to restart the server automatically when you edit `server.js`.

## Features

- Webcam (never stretched or cropped), mic, screen sharing, participant count, live status
- Sound effects and animations on almost everything, with a full Settings panel
- Name and profile photo (upload a photo, or get a coloured initials avatar)
- Mute and unmute, pin and unpin (double-click a tile), raise hand with queue order
- Reactions that float over your tile
- Status: Available, Busy, Away, Be right back, plus automatic Speaking and Presenting
- Chat inside the meeting: Everyone, private messages, and group chats you create
- Host tools: lock meeting, waiting room, mute all, mute or stop video for one person,
  stop someone's screen share, remove, make host, co-host, lower hands, turn chat,
  private chat, self-unmute and screen sharing on or off, end meeting for all
- Shortcuts: `M` mic, `V` camera, `H` raise hand

## Files

```
server.js          rooms, chat, host controls, signaling
public/index.html  page structure
public/styles.css  chilly blue theme
public/app.js      WebRTC, UI, panels
public/prefs.js    saved settings + sound effects
public/settings.js settings panel
```

## Using it from another device on the same Wi-Fi

Run `npm install` once more (HTTPS support was added), then `npm start`. The terminal prints two kinds of address:

```
This computer     http://localhost:3000
Other devices     https://192.168.x.x:3443
```

Open the **Other devices** address on your phone or another computer. Your browser will warn that the
certificate isn't trusted (Nova makes its own); choose **Advanced > Proceed**. Camera and mic only work on that
https address. If it won't load, allow Node.js through your firewall (Windows asks the first time) and make
sure both devices are on the same network with no "guest" or "client isolation" mode.

## Hosting

Nova needs a server that stays running (Socket.IO keeps live connections open). Vercel only runs short
serverless functions that stop after a few minutes, so it can host the page but not the server.

1. Deploy this repo to **Render** (Build `npm install`, Start `npm start`). That link already works as the full app.
2. Optional, to keep a Vercel link: deploy the same repo to Vercel (Framework: Other, Output Directory: `public`;
   `vercel.json` sets this), then edit `public/config.js` and set `window.NOVA_SERVER` to your Render address.

## Good to know

- Browsers only allow camera and mic on `localhost` or `https`. To test from a phone,
  expose the server over https (for example with a tunnel such as ngrok or Cloudflare Tunnel).
- Each person connects directly to every other person (mesh), which works well for
  roughly 2 to 8 people. For bigger rooms, put an SFU such as LiveKit or mediasoup behind it.
- Only Google STUN servers are configured. Some strict networks need a TURN server;
  add one to the `ICE` list at the top of `public/app.js`.
- Rooms live in memory and disappear when the server restarts.
