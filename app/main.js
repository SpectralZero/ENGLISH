/* ============================================================
   main.js — boot, routes, chrome
   ============================================================ */
import { $, toast, AR_NUM } from './util.js';
import { loadAll, allWordIds } from './data.js';
import { applySettings, touchDay, dueIds } from './store.js';
import { route, startRouter, go, back, render } from './router.js';
import { APP_VERSION } from './config.js';
import { startAuto, configured as syncOn, onSync, state as syncState, pause as syncPause, resume as syncResume } from './sync.js';

import home        from './views/home.js';
import { unitsView, unitView } from './views/units.js';
import learn       from './views/learn.js';
import quiz        from './views/quiz.js';
import reviewView  from './views/review.js';
import alphabet    from './views/alphabet.js';
import searchView  from './views/search.js';
import stats       from './views/stats.js';
import settingsView from './views/settings.js';

export { APP_VERSION };

/* ------------------------------------------------ routes */
route('/',          home,         { root: true, title: 'خُطوة' });
route('/units',     unitsView,    { root: true, title: 'الدروس' });
route('/unit/:id',  unitView,     { title: 'الدرس' });
route('/learn/:id', learn,        { plain: true });
route('/quiz/:id',  quiz,         { plain: true });
route('/review',    reviewView,   { root: true, title: 'المراجعة' });
route('/alphabet',  alphabet,     { title: 'الحروف' });
route('/search',    searchView,   { title: 'بحث', hideSearch: true });
route('/stats',     stats,        { root: true, title: 'تقدّمي' });
route('/settings',  settingsView, { root: true, title: 'الإعدادات' });
route('/console',   ctx => import('./admin/admin.js').then(m => m.default(ctx)), { title: 'لوحة التحكم', hideSearch: true });
route('*',          home,         { root: true, title: 'خُطوة' });

/* ------------------------------------------------ chrome */
function wireChrome() {
  $('#btnBack').addEventListener('click', () => back());
  $('#btnSearch').addEventListener('click', () => go('/search'));

  /* one-tap sync, always within reach while studying */
  const btnSync = $('#btnSync');
  const paintSync = (s = syncState) => {
    btnSync.hidden = !syncOn();
    btnSync.dataset.state = s;
  };
  btnSync.addEventListener('click', async () => {
    const m = await import('./views/settings.js');
    m.runSync(btnSync);
  });
  onSync(s => paintSync(s));
  window.addEventListener('sync:config', () => paintSync());
  paintSync();
  $('#view').addEventListener('scroll', () => {}, { passive: true });
  window.addEventListener('scroll', () => {
    $('#topbar').classList.toggle('is-stuck', window.scrollY > 6);
  }, { passive: true });
  window.addEventListener('hashchange', updateBadge);
  // don't let a background sync swap the data mid-lesson
  window.addEventListener('route:change', e => (e.detail?.plain ? syncPause() : syncResume()));
  // only settings that change what is on screen force a redraw
  window.addEventListener('settings:change', e => {
    if (['showTranslit', 'dailyGoal'].includes(e.detail?.key)) render();
  });
}

export function updateBadge() {
  const badge = $('#dueBadge');
  if (!badge) return;
  const n = dueIds(allWordIds()).length;
  badge.hidden = n === 0;
  badge.textContent = AR_NUM(Math.min(99, n));
}

/* ------------------------------------------------ service worker */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;

  // If a worker is already in charge, a new one taking over means the app
  // was updated — reload once so the user actually sees the new version
  // instead of last week's cached shell.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });

  navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), { scope: './' })
    .then(reg => {
      reg.update?.();
      setInterval(() => reg.update?.(), 60 * 60 * 1000);   // check hourly
    })
    .catch(err => console.warn('SW failed', err));
}

/* ------------------------------------------------ boot */
(async function boot() {
  applySettings();
  try {
    await loadAll();
  } catch (err) {
    console.error(err);
    $('#boot').innerHTML =
      `<div class="empty"><div class="empty__e">⚠️</div>
       <div style="font-weight:800;color:var(--ink)">تعذّر تحميل المحتوى</div>
       <div class="small">${err.message || err}</div>
       <button class="btn btn--primary" onclick="location.reload()">إعادة المحاولة</button></div>`;
    return;
  }

  touchDay();
  wireChrome();
  $('#topbar').hidden = false;
  $('#tabbar').hidden = false;
  startRouter();
  updateBadge();

  const boot = $('#boot');
  boot.classList.add('is-gone');
  setTimeout(() => boot.remove(), 500);

  registerSW();

  // progress sync — silent, and only on a device where the owner set it up
  if (syncOn()) {
    startAuto();
    window.addEventListener('sync:applied', () => { updateBadge(); render(); });
  }
})();
