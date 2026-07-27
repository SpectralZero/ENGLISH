/* ============================================================
   admin/github.js — commit content files straight to the repo
   ------------------------------------------------------------
   Uses the GitHub Contents API with a fine-grained token that
   is stored ONLY in this browser's localStorage.
   ============================================================ */
import { load, save } from '../util.js';

const K_CFG = 'khutwa.gh.v1';

/* Pre-filled for this project — only the token is missing, and it
   must be pasted once inside the console on each device you publish from. */
export const cfg = Object.assign(
  { owner: 'SpectralZero', repo: 'ENGLISH', branch: 'main', token: '', prefix: '' },
  load(K_CFG, {})
);

export function saveCfg(patch) {
  Object.assign(cfg, patch);
  save(K_CFG, cfg);
}
export function forgetToken() { saveCfg({ token: '' }); }
export const configured = () => !!(cfg.owner && cfg.repo && cfg.token);

/* ---------------------------------------------------------- utils */
function b64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

async function api(path, options = {}) {
  const res = await fetch('https://api.github.com' + path, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + cfg.token,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  if (!res.ok) {
    const msg = json?.message || res.statusText;
    const err = new Error(`GitHub ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

const full = p => (cfg.prefix ? cfg.prefix.replace(/\/+$/, '') + '/' : '') + p;

/* ---------------------------------------------------------- calls */
export async function checkAccess() {
  const r = await api(`/repos/${cfg.owner}/${cfg.repo}`);
  return { name: r.full_name, private: r.private, branch: r.default_branch, push: !!r.permissions?.push };
}

export async function getSha(path) {
  try {
    const r = await api(`/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURI(full(path))}?ref=${cfg.branch}`);
    return Array.isArray(r) ? null : r.sha;
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

export async function putFile(path, content, message) {
  const sha = await getSha(path);
  return api(`/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURI(full(path))}`, {
    method: 'PUT',
    body: JSON.stringify({
      message, content: b64(content), branch: cfg.branch, ...(sha ? { sha } : {}),
    }),
  });
}

/** Commit a batch of files one by one, reporting progress. */
export async function publish(files, onStep) {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const done = [];
  for (const f of files) {
    onStep?.(f.path, 'jar');
    await putFile(f.path, JSON.stringify(f.json, null, 2) + '\n', `محتوى: تحديث ${f.path} (${stamp})`);
    done.push(f.path);
    onStep?.(f.path, 'ok');
  }
  return done;
}
