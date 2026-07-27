/* ============================================================
   store.js — settings, progress, spaced repetition, streaks
   Everything lives in localStorage; nothing leaves the device.
   ============================================================ */
import { load, save, dayKey, daysBetween, clamp } from './util.js';

const K_SET  = 'khutwa.settings.v1';
const K_PROG = 'khutwa.progress.v1';

/* ---------------------------------------------------------- settings */
const DEFAULT_SETTINGS = {
  theme: 'auto',            // auto | light | dark
  fontScale: 1,             // 0.9 – 1.3
  showTranslit: true,       // Arabic-letter pronunciation
  autoSpeak: true,          // speak automatically on new card
  rate: 0.82,               // speech rate (slow for beginners)
  voiceURI: '',             // chosen English voice
  dailyGoal: 20,            // new+review items per day
  haptics: true,
  hideArabicFirst: false,   // "challenge mode": hide meaning until revealed
};

export const settings = Object.assign({}, DEFAULT_SETTINGS, load(K_SET, {}));

export function setSetting(key, value) {
  settings[key] = value;
  save(K_SET, settings);
  applySettings();
  window.dispatchEvent(new CustomEvent('settings:change', { detail: { key, value } }));
}

export function applySettings() {
  document.documentElement.dataset.theme = settings.theme;
  document.documentElement.style.setProperty('--fs-scale', settings.fontScale);
}

/* ---------------------------------------------------------- progress */
/*  items: { [wordId]: { n, i, e, due, ok, ko, t } }
      n = successful reps, i = interval (days), e = ease factor,
      due = 'YYYY-MM-DD', ok/ko = right/wrong counts, t = last seen (ms)
    days:  { 'YYYY-MM-DD': { xp, learned, reviewed, minutes } }
    units: { [unitId]: { opened, completed } }                            */
const DEFAULT_PROGRESS = {
  items: {},
  days: {},
  units: {},
  streak: 0,
  bestStreak: 0,
  lastDay: '',
  totalXP: 0,
  createdAt: Date.now(),
  name: '',
};

export const progress = Object.assign({}, DEFAULT_PROGRESS, load(K_PROG, {}));

let saveTimer;
export function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save(K_PROG, progress), 160);
}
export function persistNow() { clearTimeout(saveTimer); save(K_PROG, progress); }

export function resetProgress() {
  Object.assign(progress, structuredClone(DEFAULT_PROGRESS), { createdAt: Date.now() });
  persistNow();
}

export function importProgress(obj) {
  if (!obj || typeof obj !== 'object') return false;
  Object.assign(progress, DEFAULT_PROGRESS, obj);
  persistNow();
  return true;
}

/* ---------------------------------------------------------- SRS core */
const INTERVALS = [1, 2, 4, 8, 16, 32, 60, 120];   // days after each success

export function itemOf(id) { return progress.items[id]; }

export function isNew(id)      { return !progress.items[id]; }
export function isLearning(id) { const it = progress.items[id]; return !!it && it.i < 8; }
export function isMastered(id) { const it = progress.items[id]; return !!it && it.i >= 16 && it.n >= 4; }

/** 0 = state unknown/new, 1 = learning, 2 = strong, 3 = mastered */
export function strength(id) {
  const it = progress.items[id];
  if (!it) return 0;
  if (isMastered(id)) return 3;
  return it.i >= 4 ? 2 : 1;
}

/** grade: 0 again · 1 hard · 2 good · 3 easy */
export function review(id, grade) {
  const today = dayKey();
  const it = progress.items[id] || { n: 0, i: 0, e: 2.5, due: today, ok: 0, ko: 0, t: 0 };

  if (grade === 0) {
    it.ko++;
    it.n = 0;
    it.i = 0;                              // repeat again today
    it.e = clamp(it.e - 0.2, 1.3, 2.9);
    it.due = today;
  } else {
    it.ok++;
    it.e = clamp(it.e + (grade === 3 ? 0.12 : grade === 2 ? 0 : -0.14), 1.3, 2.9);
    const base = INTERVALS[Math.min(it.n, INTERVALS.length - 1)];
    const mult = grade === 3 ? 1.35 : grade === 1 ? 0.7 : 1;
    it.n++;
    it.i = Math.max(1, Math.round(base * mult * (it.e / 2.5)));
    const d = new Date(); d.setDate(d.getDate() + it.i);
    it.due = dayKey(d);
  }
  it.t = Date.now();
  progress.items[id] = it;
  persist();
  return it;
}

/** Word ids that are due for review today (or overdue). */
export function dueIds(allIds) {
  const today = dayKey();
  return allIds.filter(id => {
    const it = progress.items[id];
    return it && it.due <= today;
  }).sort((a, b) => {
    const A = progress.items[a], B = progress.items[b];
    return (A.due < B.due ? -1 : A.due > B.due ? 1 : 0) || A.i - B.i;
  });
}

export function counts(allIds) {
  const today = dayKey();
  let learned = 0, mastered = 0, due = 0;
  for (const id of allIds) {
    const it = progress.items[id];
    if (!it) continue;
    learned++;
    if (isMastered(id)) mastered++;
    if (it.due <= today) due++;
  }
  return { total: allIds.length, learned, mastered, due, fresh: allIds.length - learned };
}

/* ---------------------------------------------------------- day / streak / xp */
export function today() {
  const k = dayKey();
  if (!progress.days[k]) progress.days[k] = { xp: 0, learned: 0, reviewed: 0 };
  return progress.days[k];
}

export function touchDay() {
  const k = dayKey();
  today();
  if (progress.lastDay !== k) {
    const gap = progress.lastDay ? daysBetween(progress.lastDay, k) : 999;
    progress.streak = gap === 1 ? progress.streak + 1 : 1;
    progress.bestStreak = Math.max(progress.bestStreak || 0, progress.streak);
    progress.lastDay = k;
    persistNow();
  }
}

export function addXP(n, kind) {
  const d = today();
  d.xp += n;
  if (kind === 'learn') d.learned++;
  if (kind === 'review') d.reviewed++;
  progress.totalXP = (progress.totalXP || 0) + n;
  touchDay();
  persist();
}

export function goalProgress() {
  const d = today();
  const done = d.learned + d.reviewed;
  return { done, goal: settings.dailyGoal, pct: Math.min(100, Math.round((done / settings.dailyGoal) * 100)) };
}

/** Last N days of activity, oldest first. */
export function lastDays(n = 28) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = dayKey(d);
    out.push({ key: k, ...(progress.days[k] || { xp: 0, learned: 0, reviewed: 0 }) });
  }
  return out;
}

export function markUnitOpened(unitId) {
  progress.units[unitId] = progress.units[unitId] || {};
  progress.units[unitId].opened = Date.now();
  persist();
}

/* ---------------------------------------------------------- level */
const LEVELS = [
  { xp: 0,    ar: 'مبتدئ جداً' }, { xp: 150,  ar: 'مبتدئ' },
  { xp: 450,  ar: 'متعلّم' },     { xp: 1000, ar: 'متقدّم قليلاً' },
  { xp: 2000, ar: 'جيد' },        { xp: 3500, ar: 'جيد جداً' },
  { xp: 6000, ar: 'ممتاز' },      { xp: 10000, ar: 'محترف' },
];
export function levelInfo() {
  const xp = progress.totalXP || 0;
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].xp) i++;
  const cur = LEVELS[i], next = LEVELS[i + 1];
  return {
    index: i + 1,
    name: cur.ar,
    xp,
    toNext: next ? next.xp - xp : 0,
    pct: next ? Math.round(((xp - cur.xp) / (next.xp - cur.xp)) * 100) : 100,
  };
}

applySettings();
