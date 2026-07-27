/* ============================================================
   tts.js — pronunciation via the device's built-in voices.
   No audio files, works offline on iPhone (Siri voices).
   ============================================================ */
import { settings } from './store.js';

const synth = window.speechSynthesis;
let voices = [];
let unlocked = false;

export const supported = !!synth;

function refresh() {
  if (!synth) return;
  voices = synth.getVoices() || [];
}
refresh();
if (synth) synth.onvoiceschanged = refresh;

/** English voices only, best quality first. */
export function englishVoices() {
  refresh();
  const en = voices.filter(v => /^en(-|_|$)/i.test(v.lang));
  const score = v => {
    let s = 0;
    if (/^en[-_]US/i.test(v.lang)) s += 3;
    if (/^en[-_]GB/i.test(v.lang)) s += 2;
    if (v.localService) s += 2;
    if (/samantha|siri|aaron|daniel|karen|google us/i.test(v.name)) s += 3;
    if (/enhanced|premium|neural/i.test(v.name)) s += 2;
    return -s;
  };
  return en.sort((a, b) => score(a) - score(b));
}

function chosenVoice() {
  refresh();
  if (settings.voiceURI) {
    const v = voices.find(v => v.voiceURI === settings.voiceURI);
    if (v) return v;
  }
  return englishVoices()[0] || null;
}

/** iOS needs a first utterance inside a real user gesture. */
export function unlock() {
  if (unlocked || !synth) return;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0; u.lang = 'en-US';
    synth.speak(u);
    unlocked = true;
  } catch { /* ignore */ }
}

let current = null;

export function speak(text, opts = {}) {
  if (!synth || !text) return Promise.resolve(false);
  return new Promise(resolve => {
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(String(text));
      const v = chosenVoice();
      if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = 'en-US'; }
      u.rate   = opts.rate ?? settings.rate ?? 0.85;
      u.pitch  = opts.pitch ?? 1;
      u.volume = opts.volume ?? 1;
      u.onend = u.onerror = () => { current = null; resolve(true); };
      current = u;
      // Safari occasionally drops an utterance queued too fast after cancel()
      setTimeout(() => { try { synth.speak(u); } catch { resolve(false); } }, 30);
    } catch { resolve(false); }
  });
}

/** Say it slowly, letter-friendly (used by the spelling drills). */
export function spell(word) {
  return speak(String(word).split('').join(' , '), { rate: 0.6 });
}

export function stop() { try { synth?.cancel(); } catch { /* noop */ } current = null; }
export const speaking = () => !!current;

/** Attach a speaker button behaviour to any element. */
export function bindSpeak(node, textGetter) {
  node.addEventListener('click', async e => {
    e.preventDefault(); e.stopPropagation();
    unlock();
    node.classList.add('is-speaking');
    await speak(typeof textGetter === 'function' ? textGetter() : textGetter);
    node.classList.remove('is-speaking');
  });
  return node;
}

document.addEventListener('pointerdown', unlock, { once: true, capture: true });
