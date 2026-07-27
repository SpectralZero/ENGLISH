/* ============================================================
   data.js — content loading, indexing and the admin draft layer
   ------------------------------------------------------------
   Published content lives in /data/*.json (edited only by the
   admin console, which commits it to GitHub).
   Unpublished admin edits live in localStorage as a "draft
   overlay" so the admin can preview before publishing.
   ============================================================ */
import { load, save } from './util.js';

const BASE = new URL('../data/', import.meta.url);
const K_DRAFT = 'khutwa.draft.v1';

export const store = {
  index: null,        // data/index.json
  units: [],          // full unit objects, ordered
  unitById: new Map(),
  wordById: new Map(),
  words: [],          // flat list of every word (with .unitId)
  sentences: [],      // flat list of every sentence (with .unitId)
  alphabet: null,
  ready: false,
};

/* ------------------------------------------------------ draft overlay */
export function getDraft() { return load(K_DRAFT, { units: {}, index: null, touched: {} }); }
export function saveDraft(d) { save(K_DRAFT, d); }
export function clearDraft() { localStorage.removeItem(K_DRAFT); }
export function hasDraft() {
  const d = getDraft();
  return !!(d.index || Object.keys(d.units || {}).length);
}
export function draftFileCount() {
  const d = getDraft();
  return Object.keys(d.units || {}).length + (d.index ? 1 : 0);
}

/* ------------------------------------------------------ fetching */
async function getJSON(path) {
  const res = await fetch(new URL(path, BASE).href, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`تعذّر تحميل ${path} (${res.status})`);
  return res.json();
}

export async function loadAll() {
  const draft = getDraft();

  const index = draft.index || await getJSON('index.json');
  const files = index.units.map(u => u.file || `units/${u.id}.json`);

  const loaded = await Promise.all(index.units.map(async (meta, i) => {
    if (draft.units?.[meta.id]) return draft.units[meta.id];
    try { return await getJSON(files[i]); }
    catch (e) { console.warn('unit failed:', meta.id, e); return null; }
  }));

  let alphabet = null;
  try { alphabet = draft.units?.__alphabet__ || await getJSON('alphabet.json'); }
  catch { alphabet = { letters: [], sounds: [] }; }

  store.index = index;
  store.alphabet = alphabet;
  store.units = loaded
    .map((u, i) => u && normalizeUnit(u, index.units[i]))
    .filter(Boolean);

  reindex();
  store.ready = true;
  return store;
}

function normalizeUnit(unit, meta = {}) {
  const u = {
    id: unit.id || meta.id,
    title: unit.title || meta.title || { ar: unit.id, en: unit.id },
    icon: unit.icon || meta.icon || '📘',
    level: unit.level ?? meta.level ?? 1,
    color: unit.color || meta.color || 'brand',
    words: Array.isArray(unit.words) ? unit.words : [],
    sentences: Array.isArray(unit.sentences) ? unit.sentences : [],
  };
  u.words = u.words.map(w => ({
    id: w.id || `${u.id}:${w.en}`.toLowerCase().replace(/\s+/g, '_'),
    en: w.en || '', ar: w.ar || '', tr: w.tr || '', pos: w.pos || '',
    emoji: w.emoji || '', ex: w.ex || null,
    unitId: u.id,
  }));
  u.sentences = u.sentences.map((s, i) => ({
    id: s.id || `${u.id}:s${i}`,
    en: s.en || '', ar: s.ar || '', tr: s.tr || '',
    unitId: u.id,
  }));
  return u;
}

export function reindex() {
  store.unitById = new Map(store.units.map(u => [u.id, u]));
  store.words = store.units.flatMap(u => u.words);
  store.sentences = store.units.flatMap(u => u.sentences);
  store.wordById = new Map(store.words.map(w => [w.id, w]));
}

/* ------------------------------------------------------ queries */
export const allWordIds = () => store.words.map(w => w.id);

export function unitsByLevel() {
  const map = new Map();
  for (const u of store.units) {
    if (!map.has(u.level)) map.set(u.level, []);
    map.get(u.level).push(u);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
}

export function levelName(n) {
  return store.index?.levels?.find(l => l.id === n)?.ar || `المستوى ${n}`;
}

export function search(q) {
  const s = q.trim().toLowerCase();
  if (s.length < 1) return { words: [], sentences: [] };
  const hit = t => String(t || '').toLowerCase().includes(s);
  return {
    words: store.words.filter(w => hit(w.en) || hit(w.ar) || hit(w.tr)).slice(0, 60),
    sentences: store.sentences.filter(x => hit(x.en) || hit(x.ar)).slice(0, 30),
  };
}

/** Distractors for MCQ: same unit first, then anywhere. */
export function distractors(word, n = 3, field = 'ar') {
  const sameUnit = store.words.filter(w => w.unitId === word.unitId && w.id !== word.id && w[field]);
  const others   = store.words.filter(w => w.unitId !== word.unitId && w[field]);
  const out = [];
  const pool = [...shuffleLite(sameUnit), ...shuffleLite(others)];
  for (const w of pool) {
    if (out.length >= n) break;
    if (out.some(x => x[field] === w[field]) || w[field] === word[field]) continue;
    out.push(w);
  }
  return out;
}
function shuffleLite(a) { return a.slice().sort(() => Math.random() - 0.5); }

/* ------------------------------------------------------ admin writes */
export function upsertUnit(unit) {
  const d = getDraft();
  d.units = d.units || {};
  d.units[unit.id] = stripUnit(unit);
  d.touched = d.touched || {};
  d.touched[unit.id] = Date.now();
  saveDraft(d);

  const i = store.units.findIndex(u => u.id === unit.id);
  const norm = normalizeUnit(unit);
  if (i >= 0) store.units[i] = norm; else store.units.push(norm);
  reindex();
}

export function updateIndex(index) {
  const d = getDraft();
  d.index = index;
  saveDraft(d);
  store.index = index;
}

export function removeUnit(unitId) {
  const idx = structuredClone(store.index);
  idx.units = idx.units.filter(u => u.id !== unitId);
  updateIndex(idx);
  const d = getDraft();
  delete d.units?.[unitId];
  saveDraft(d);
  store.units = store.units.filter(u => u.id !== unitId);
  reindex();
}

/** The exact JSON payloads that should be committed to the repo. */
export function draftFiles() {
  const d = getDraft();
  const files = [];
  if (d.index) files.push({ path: 'data/index.json', json: d.index });
  for (const [id, unit] of Object.entries(d.units || {})) {
    if (id === '__alphabet__') files.push({ path: 'data/alphabet.json', json: unit });
    else files.push({ path: `data/units/${id}.json`, json: unit });
  }
  return files;
}

/** Remove runtime-only fields before writing to disk. */
function stripUnit(u) {
  return {
    id: u.id,
    title: u.title,
    icon: u.icon,
    level: u.level,
    color: u.color,
    words: (u.words || []).map(w => {
      const o = { id: w.id, en: w.en, ar: w.ar, tr: w.tr };
      if (w.pos) o.pos = w.pos;
      if (w.emoji) o.emoji = w.emoji;
      if (w.ex && (w.ex.en || w.ex.ar)) o.ex = { en: w.ex.en || '', ar: w.ex.ar || '', tr: w.ex.tr || '' };
      return o;
    }),
    sentences: (u.sentences || []).map(s => ({ id: s.id, en: s.en, ar: s.ar, tr: s.tr || '' })),
  };
}

export function buildIndexFromStore() {
  const idx = structuredClone(store.index) || { version: 1, levels: [], units: [] };
  idx.updated = new Date().toISOString().slice(0, 10);
  idx.units = store.units.map(u => ({
    id: u.id, file: `units/${u.id}.json`, title: u.title,
    icon: u.icon, level: u.level, color: u.color, count: u.words.length,
  }));
  return idx;
}
