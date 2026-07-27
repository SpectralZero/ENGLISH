/* ============================================================
   config.js — app-wide constants
   ============================================================ */

export const APP_VERSION = '1.2.0';
export const APP_NAME = 'خُطوة';

/* Selectable themes. `swatch` drives the little preview tile in
   Settings: [page background, card, accent]. Keep in sync with the
   [data-theme="…"] blocks in css/theme.css. */
export const THEMES = [
  { id: 'auto',     ar: 'تلقائي',       swatch: ['linear-gradient(135deg,#f4f5fb 0 50%,#080b18 50% 100%)', '#8e93b5', 'linear-gradient(135deg,#6c5cff,#22d3ee)'] },
  { id: 'light',    ar: 'فاتح',         swatch: ['#f4f5fb', '#ffffff', 'linear-gradient(135deg,#6c5cff,#22d3ee)'] },
  { id: 'dark',     ar: 'داكن',         swatch: ['#080b18', '#171d33', 'linear-gradient(135deg,#6c5cff,#22d3ee)'] },
  { id: 'midnight', ar: 'منتصف الليل',  swatch: ['#000000', '#12121c', 'linear-gradient(135deg,#7c5cff,#2ee6ff)'] },
  { id: 'ember',    ar: 'ليلي دافئ',    swatch: ['#15110d', '#28211a', 'linear-gradient(135deg,#f5a524,#e0568a)'] },
];

/* The hidden admin console.
   NOTE: this is a static site — the console code is downloadable by
   anyone who looks hard enough. The gate below keeps it out of the
   learner's way; the real protection is the GitHub token, which
   never leaves this device and is required to publish anything. */
export const ADMIN = {
  route: '/console',
  /* SHA-256 of the admin passphrase. Default passphrase: khutwa
     Change it inside the console (أدوات → كلمة المرور) — it stores the
     new hash on this device and prints it so you can paste it here. */
  passHash: '050abf6407a8cdc050da38081720d30bbcf49186faa997cad78336c9503ed320',
  /* Set to true to require the passphrase every time the console opens. */
  alwaysAsk: false,
};
