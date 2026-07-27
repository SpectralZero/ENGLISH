/* ============================================================
   util.js — tiny DOM + helpers (no dependencies)
   ============================================================ */

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Escape text for safe innerHTML interpolation. */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Build an element: el('div', {class:'x'}, [child|'text']) */
export function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    n.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return n;
}

/* ---------------- arrays ---------------- */
export const rnd    = n => Math.floor(Math.random() * n);
export const pick   = a => a[rnd(a.length)];
export function shuffle(a) {
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--) { const j = rnd(i + 1); [x[i], x[j]] = [x[j], x[i]]; }
  return x;
}
export function sample(a, n) { return shuffle(a).slice(0, n); }
export const uniqBy = (a, f) => { const m = new Map(); a.forEach(x => m.set(f(x), x)); return [...m.values()]; };
export const clamp  = (v, a, b) => Math.min(b, Math.max(a, v));

/* ---------------- time ---------------- */
/** Local calendar day key, e.g. "2026-07-27" */
export function dayKey(d = new Date()) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 6e4);
  return z.toISOString().slice(0, 10);
}
export const DAY = 864e5;
export function addDays(days, from = new Date()) { return new Date(from.getTime() + days * DAY); }
export function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00').getTime() - new Date(a + 'T00:00').getTime()) / DAY);
}

/* ---------------- text ---------------- */
export const AR_NUM = n => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
export const norm = s => String(s || '').toLowerCase().trim().replace(/[’']/g, "'").replace(/\s+/g, ' ');
/** loose compare used by the spelling test */
export function sameWord(a, b) {
  return norm(a).replace(/[^a-z0-9' ]/g, '') === norm(b).replace(/[^a-z0-9' ]/g, '');
}
/** Levenshtein distance — used to say "almost right!" */
export function editDistance(a, b) {
  a = norm(a); b = norm(b);
  const m = a.length, n = b.length;
  if (!m || !n) return Math.max(m, n);
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/** JSON with keys in a stable order — needed whenever two objects that
    were built in different orders must compare equal. */
export function stableStringify(value) {
  const seen = new WeakSet();
  const walk = v => {
    if (v === null || typeof v !== 'object') return v;
    if (seen.has(v)) return null;
    seen.add(v);
    if (Array.isArray(v)) return v.map(walk);
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = walk(v[k]);
    return out;
  };
  return JSON.stringify(walk(value));
}

/* ---------------- storage ---------------- */
export function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
export function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; }
  catch { return false; }
}

/* ---------------- feedback ---------------- */
let toastTimer;
export function toast(msg, kind = '') {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast is-on ' + (kind ? 'is-' + kind : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 2400);
}

export function haptic(pattern = 12) {
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}

/* ---------------- bottom sheet ---------------- */
export function sheet(title, contentNode, { onClose } = {}) {
  const root = $('#modalRoot');
  const back = el('div', { class: 'sheet-back' });
  const box  = el('div', { class: 'sheet' }, [
    el('div', { class: 'sheet__grip' }),
    title ? el('div', { class: 'sheet__title', text: title }) : null,
    contentNode,
  ]);
  const close = () => { back.remove(); onClose?.(); };
  back.append(box);
  back.addEventListener('click', e => { if (e.target === back) close(); });
  root.append(back);
  return { close, box };
}

export function confirmSheet(title, message, { danger = false, okText = 'تأكيد' } = {}) {
  return new Promise(resolve => {
    let done = false;
    const body = el('div', { class: 'stack' }, [
      el('p', { class: 'muted', text: message }),
      el('button', {
        class: 'btn btn--block ' + (danger ? 'btn--rose' : 'btn--primary'),
        onclick: () => { done = true; s.close(); resolve(true); },
      }, okText),
      el('button', { class: 'btn btn--block btn--ghost', onclick: () => s.close() }, 'إلغاء'),
    ]);
    const s = sheet(title, body, { onClose: () => { if (!done) resolve(false); } });
  });
}

/* ---------------- misc ---------------- */
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export function debounce(fn, ms = 220) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
export const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

/** Download a text file (admin export). */
export function downloadFile(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' }));
  const a = el('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Read a file the user picked. */
export function readFile(accept = '.json') {
  return new Promise(resolve => {
    const inp = el('input', { type: 'file', accept, class: 'hide' });
    inp.addEventListener('change', () => {
      const f = inp.files?.[0];
      if (!f) return resolve(null);
      const r = new FileReader();
      r.onload = () => { resolve(String(r.result)); inp.remove(); };
      r.readAsText(f, 'utf-8');
    });
    document.body.append(inp); inp.click();
  });
}

export function slug(s) {
  return String(s || '').toLowerCase().trim()
    .replace(/[^a-z0-9؀-ۿ]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 40) || 'item';
}

/** Short stable id. */
export function uid(prefix = 'w') {
  return prefix + '_' + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6);
}
