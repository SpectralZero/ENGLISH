/* ============================================================
   config.js — app-wide constants
   ============================================================ */

export const APP_VERSION = '1.0.0';
export const APP_NAME = 'خُطوة';

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
