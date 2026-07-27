/* ============================================================
   sync.js — keep one learner's progress in step across devices
   ------------------------------------------------------------
   Progress is stored as a single JSON file inside a PRIVATE
   GitHub repo the user owns. The token lives only in this
   browser's localStorage and is never part of the site.
   A device with no token configured stays purely local — which
   is exactly what happens for anyone you share the app link
   with, so their progress can never touch yours.
   ============================================================ */
import { load, save, dayKey } from './util.js';
import { progress, persistNow, importProgress } from './store.js';

const K_CFG = 'khutwa.sync.v1';
const K_META = 'khutwa.syncmeta.v1';

export const cfg = Object.assign(
  { owner: '', repo: '', branch: 'main', path: 'progress/main.json', token: '', auto: true },
  load(K_CFG, {})
);

export const meta = Object.assign({ lastPull: 0, lastPush: 0, sha: '', error: '' }, load(K_META, {}));

export function saveCfg(patch) { Object.assign(cfg, patch); save(K_CFG, cfg); }
export function saveMeta(patch) { Object.assign(meta, patch); save(K_META, meta); }
export function forget() { saveCfg({ token: '' }); }
export const configured = () => !!(cfg.owner && cfg.repo && cfg.token && cfg.path);

/* --------------------------------------------------- state events */
const listeners = new Set();
export let state = 'idle';            // idle | busy | ok | error
export function onSync(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function setState(s, detail = '') {
  state = s;
  listeners.forEach(fn => { try { fn(s, detail); } catch { /* ignore */ } });
}

/* --------------------------------------------------- github calls */
function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function api(path, options = {}) {
  const res = await fetch('https://api.github.com' + path, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + cfg.token,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  if (!res.ok) {
    const e = new Error(json?.message || res.statusText);
    e.status = res.status;
    throw e;
  }
  return json;
}

const fileURL = () =>
  `/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURI(cfg.path)}`;

export async function checkAccess() {
  const r = await api(`/repos/${cfg.owner}/${cfg.repo}`);
  return { name: r.full_name, private: r.private, push: !!r.permissions?.push };
}

async function fetchRemote() {
  try {
    const r = await api(`${fileURL()}?ref=${cfg.branch}`);
    return { json: JSON.parse(b64decode(r.content)), sha: r.sha };
  } catch (e) {
    if (e.status === 404) return { json: null, sha: '' };
    throw e;
  }
}

async function writeRemote(obj, sha) {
  const body = {
    message: `تقدّم: ${dayKey()} (${obj.totalXP || 0} نقطة)`,
    content: b64encode(JSON.stringify(obj, null, 2) + '\n'),
    branch: cfg.branch,
    ...(sha ? { sha } : {}),
  };
  const r = await api(fileURL(), { method: 'PUT', body: JSON.stringify(body) });
  return r.content.sha;
}

/* --------------------------------------------------- merging
   Two devices can both study offline. Rather than letting the
   newer file win outright (which would erase a session), the two
   records are merged field by field, keeping the better value. */
export function merge(a, b) {
  if (!a) return structuredClone(b);
  if (!b) return structuredClone(a);
  const out = structuredClone(a.updatedAt >= b.updatedAt ? a : b);

  // words: keep whichever review record was touched last
  out.items = {};
  const ids = new Set([...Object.keys(a.items || {}), ...Object.keys(b.items || {})]);
  for (const id of ids) {
    const x = a.items?.[id], y = b.items?.[id];
    if (!x) { out.items[id] = structuredClone(y); continue; }
    if (!y) { out.items[id] = structuredClone(x); continue; }
    const keep = structuredClone((x.t || 0) >= (y.t || 0) ? x : y);
    keep.ok = Math.max(x.ok || 0, y.ok || 0);
    keep.ko = Math.max(x.ko || 0, y.ko || 0);
    out.items[id] = keep;
  }

  // days: sum is wrong (same session synced twice), so take the best per day
  out.days = {};
  const days = new Set([...Object.keys(a.days || {}), ...Object.keys(b.days || {})]);
  for (const d of days) {
    const x = a.days?.[d] || {}, y = b.days?.[d] || {};
    out.days[d] = {
      xp: Math.max(x.xp || 0, y.xp || 0),
      learned: Math.max(x.learned || 0, y.learned || 0),
      reviewed: Math.max(x.reviewed || 0, y.reviewed || 0),
    };
  }

  out.units = { ...(b.units || {}), ...(a.units || {}) };
  out.totalXP = Math.max(a.totalXP || 0, b.totalXP || 0);
  out.streak = Math.max(a.streak || 0, b.streak || 0);
  out.bestStreak = Math.max(a.bestStreak || 0, b.bestStreak || 0);
  out.lastDay = (a.lastDay || '') > (b.lastDay || '') ? a.lastDay : b.lastDay;
  out.createdAt = Math.min(a.createdAt || Date.now(), b.createdAt || Date.now());
  out.name = a.name || b.name || '';
  out.updatedAt = Date.now();
  return out;
}

/* --------------------------------------------------- public API */
let running = null;

/** Pull remote, merge with local, push back if anything changed. */
export function syncNow({ silent = false } = {}) {
  if (!configured()) return Promise.resolve({ ok: false, reason: 'not-configured' });
  if (running) return running;

  running = (async () => {
    setState('busy');
    try {
      const remote = await fetchRemote();
      const local = structuredClone(progress);
      local.updatedAt = local.updatedAt || Date.now();

      const merged = merge(local, remote.json);
      const changedLocally = JSON.stringify(stripVolatile(merged)) !== JSON.stringify(stripVolatile(local));
      const changedRemotely = JSON.stringify(stripVolatile(merged)) !== JSON.stringify(stripVolatile(remote.json));

      if (changedLocally) {
        importProgress(merged);
        window.dispatchEvent(new CustomEvent('sync:applied'));
      }
      if (changedRemotely || !remote.sha) {
        const sha = await writeRemote(merged, remote.sha);
        saveMeta({ sha, lastPush: Date.now() });
      }
      saveMeta({ lastPull: Date.now(), error: '' });
      persistNow();
      setState('ok');
      return { ok: true, pulled: changedLocally, pushed: changedRemotely };
    } catch (e) {
      saveMeta({ error: e.message || String(e) });
      setState('error', e.message);
      if (!silent) console.warn('sync failed:', e);
      return { ok: false, reason: e.message };
    } finally {
      running = null;
    }
  })();
  return running;
}

function stripVolatile(o) {
  if (!o) return null;
  const c = structuredClone(o);
  delete c.updatedAt;
  return c;
}

/** Overwrite this device from the cloud (used by "استرجاع من السحابة"). */
export async function pullOverwrite() {
  const remote = await fetchRemote();
  if (!remote.json) throw new Error('لا توجد نسخة محفوظة في المستودع بعد');
  importProgress(remote.json);
  saveMeta({ sha: remote.sha, lastPull: Date.now(), error: '' });
  window.dispatchEvent(new CustomEvent('sync:applied'));
  return true;
}

/** Overwrite the cloud from this device. */
export async function pushOverwrite() {
  const remote = await fetchRemote();
  const local = structuredClone(progress);
  local.updatedAt = Date.now();
  const sha = await writeRemote(local, remote.sha);
  saveMeta({ sha, lastPush: Date.now(), error: '' });
  return true;
}

/* --------------------------------------------------- auto sync */
let dirty = false;
export function markDirty() { dirty = true; }

export function startAuto() {
  if (!configured() || !cfg.auto) return;

  // on launch (and whenever the app returns to the foreground)
  const maybe = () => {
    if (!navigator.onLine) return;
    const stale = Date.now() - (meta.lastPull || 0) > 3 * 60 * 1000;
    if (stale || dirty) { dirty = false; syncNow({ silent: true }); }
  };
  maybe();

  window.addEventListener('progress:change', markDirty);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') maybe();
    else if (dirty && navigator.onLine) { dirty = false; syncNow({ silent: true }); }
  });
  window.addEventListener('online', maybe);
  // last chance before the app is closed
  window.addEventListener('pagehide', () => { if (dirty) navigatorPush(); });
}

/** Fire-and-forget push while the page is being torn down. */
function navigatorPush() {
  if (!configured()) return;
  try {
    const body = JSON.stringify({
      message: `تقدّم: ${dayKey()}`,
      content: b64encode(JSON.stringify({ ...progress, updatedAt: Date.now() }, null, 2) + '\n'),
      branch: cfg.branch,
      ...(meta.sha ? { sha: meta.sha } : {}),
    });
    fetch('https://api.github.com' + fileURL(), {
      method: 'PUT', keepalive: true, body,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + cfg.token,
        'Content-Type': 'application/json',
      },
    }).catch(() => {});
  } catch { /* ignore */ }
}
