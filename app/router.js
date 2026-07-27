/* ============================================================
   router.js — hash router with per-view teardown
   ============================================================ */
import { $, $$ } from './util.js';
import { stop as stopSpeech } from './tts.js';

const routes = [];
let currentTeardown = null;
export let currentPath = '/';

export function route(pattern, handler, opts = {}) {
  const keys = [];
  const body = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')          // literal chars ('*' becomes a no-match)
    .replace(/:[^/]+/g, m => { keys.push(m.slice(1)); return '([^/]+)'; });
  const rx = new RegExp('^' + body + '$');
  routes.push({ rx, keys, handler, opts, pattern });
}

export function go(path, { replace = false } = {}) {
  const h = '#' + path;
  if (location.hash === h) return render();
  if (replace) history.replaceState(null, '', h); else location.hash = h;
}

export function back() {
  if (history.length > 1) history.back();
  else go('/');
}

function parse() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs || '')) };
}

export async function render() {
  const { path, query } = parse();
  currentPath = path;

  stopSpeech();
  try { currentTeardown?.(); } catch { /* ignore */ }
  currentTeardown = null;

  const view = $('#view');
  const match = routes.find(r => r.rx.test(path)) || routes.find(r => r.pattern === '*');
  if (!match) { go('/', { replace: true }); return; }

  const m = path.match(match.rx) || [];
  const params = Object.fromEntries(match.keys.map((k, i) => [k, decodeURIComponent(m[i + 1] ?? '')]));

  // chrome: full-screen views (learn / quiz) hide the tab bar
  const plain = !!match.opts.plain;
  $('#tabbar').hidden = plain;
  $('#topbar').hidden = plain && match.opts.noTopbar !== false;
  view.classList.toggle('is-plain', plain);
  $('#btnBack').hidden = !!match.opts.root;
  $('#btnSearch').hidden = !!match.opts.hideSearch;
  $('#topTitle').textContent = match.opts.title || 'خُطوة';

  window.dispatchEvent(new CustomEvent('route:change', { detail: { path, plain } }));

  view.innerHTML = '';
  view.scrollTop = 0;
  window.scrollTo(0, 0);

  markTabs(path);

  const result = await match.handler({ params, query, view, setTitle: t => { $('#topTitle').textContent = t; } });
  if (typeof result === 'function') currentTeardown = result;
  view.focus({ preventScroll: true });
}

function markTabs(path) {
  const top = '/' + (path.split('/')[1] || '');
  $$('.tab').forEach(t => t.classList.toggle('is-active', t.dataset.tab === (top === '/' ? '/' : top)));
}

export function startRouter() {
  window.addEventListener('hashchange', render);
  render();
}
