// Where is the Nova server?
//
//  • Running with `npm start` or hosted on Render/Railway (server serves this page): leave it empty.
//  • Page hosted on Vercel, server hosted elsewhere: put the server address here, for example
//        window.NOVA_SERVER = 'https://nova-xxxx.onrender.com';
//
window.NOVA_SERVER = '';

// Load the matching Socket.IO client from the server itself.
document.write('<script src="' + window.NOVA_SERVER + '/socket.io/socket.io.js"><\/script>');

// Accounts (Supabase). Leave empty and Nova still works, with guest mode only.
// Project URL and the "anon public" key are in Supabase > Project Settings > API.
window.NOVA_SUPABASE_URL = '';
window.NOVA_SUPABASE_KEY = '';

// Wake a sleeping free-tier server as early as possible.
if (window.NOVA_SERVER) fetch(window.NOVA_SERVER + '/health', { mode: 'no-cors' }).catch(function () {});
