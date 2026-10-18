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
public/auth.js     sign-in page (Supabase)
public/config.js   server + Supabase addresses
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

## Accounts

Nova opens on a sign-in page: Log in, Sign up, Sign in with Google, or Continue as guest. Guests always work.
Accounts use a free Supabase project:

1. Create a project at supabase.com. In **Project Settings > API**, copy the **Project URL** and the **anon public** key
   into `public/config.js` (`NOVA_SUPABASE_URL` and `NOVA_SUPABASE_KEY`).
2. In **SQL Editor > New query**, paste everything from `supabase/setup.sql` and press **Run**. This creates the
   private tables for profiles and meeting history.
3. In **Authentication > URL Configuration**, set **Site URL** to your main link and add each address you use under
   **Redirect URLs**, for example `https://your-site.vercel.app/**`, `https://your-app.onrender.com/**`, `http://localhost:3000/**`.
4. Email sign-up works out of the box. While testing you can switch off **Confirm email** under
   **Authentication > Sign In / Providers > Email**.
5. For Google, create an OAuth client in Google Cloud Console (type Web application), add Supabase's callback URL
   as an authorized redirect URI, then paste the client ID and secret into **Authentication > Sign In / Providers > Google**.
6. Commit and push. The Nova server reads the same Supabase keys from `public/config.js`, so there is nothing else to set.

What accounts give you:

- **Verified badge.** When someone joins, the server checks their sign-in with Supabase. Verified people get a check mark
  next to their name. Guests join as before.
- **Synced profile.** Name and photo are saved to your account and follow you to every device.
- **Meeting history.** Settings > Account lists recent meetings (date, length, people) with a Rejoin button.
- **Room ownership.** Whoever starts a room while signed in owns it. If they leave and rejoin while the room is still
  running, they get the host role back, even if the room is locked or has a waiting room.
- **Signed-in people only.** Hosts can switch this on in Host tools so guests can't join.
- **Account settings.** Change password, clear history, sign out.

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
