/* ============================================================
   views/quiz.js — the test engine
   Modes: mcq (EN→AR / AR→EN) · listen · spell (typing) ·
          tiles (letter building) · order (sentence building) · mix
   ============================================================ */
import { el, AR_NUM, shuffle, sample, pick, haptic, sameWord, editDistance, pct } from '../util.js';
import { store, distractors } from '../data.js';
import { review, addXP, isNew, settings, byPriority, weakest } from '../store.js';
import { ICON, sessionHead, emptyState, speakBtn } from '../ui.js';
import { speak, spell as spellOut, unlock } from '../tts.js';
import { go, back } from '../router.js';

const LEN = 10;
const EXAM_LEN = 20;      // امتحان — twice as long, every question type

/* -------------------------------------------------- pool selection */
/** Units belonging to a `level-N` target. */
function unitsOfLevel(unitId) {
  const lv = Number(unitId.slice('level-'.length));
  return store.units.filter(u => u.level === lv);
}

function poolFor(unitId) {
  if (unitId === 'all') {
    const seen = store.words.filter(w => !isNew(w.id));
    return seen.length >= 4 ? seen : store.words;
  }
  if (unitId === 'weak') {
    const ids = new Set(weakest(store.words.map(w => w.id), 40));
    const weak = store.words.filter(w => ids.has(w.id));
    return weak.length >= 4 ? weak : store.words.filter(w => !isNew(w.id));
  }
  if (unitId.startsWith('level-')) return unitsOfLevel(unitId).flatMap(u => u.words);
  return store.unitById.get(unitId)?.words || [];
}

/** Sentences short enough to rebuild or complete by hand. */
function sentencePool(unitId, max = 9) {
  const all = unitId === 'all' || unitId === 'weak'
    ? store.sentences
    : unitId.startsWith('level-')
      ? unitsOfLevel(unitId).flatMap(u => u.sentences)
      : (store.unitById.get(unitId)?.sentences || []);
  return all.filter(s => {
    const n = s.en.split(/\s+/).length;
    return n >= 3 && n <= max;
  });
}

/** Take the n highest-priority entries (overdue and shaky ones first). */
function pickAdaptive(list, n) {
  if (list.length <= n) return shuffle(list);
  const order = new Map(byPriority(list.map(x => x.id)).map((id, i) => [id, i]));
  return list.slice().sort((a, b) => order.get(a.id) - order.get(b.id)).slice(0, n);
}

const WORD_TYPES = {
  mcq:    ['mcq_en_ar', 'mcq_ar_en'],
  listen: ['listen'],
  spell:  ['spell', 'tiles'],
  mix:    ['mcq_en_ar', 'mcq_ar_en', 'listen', 'tiles', 'spell'],
  exam:   ['mcq_en_ar', 'mcq_ar_en', 'listen', 'spell', 'tiles', 'mcq_en_ar', 'listen'],
};

/* -------------------------------------------------- question builder */
function buildQuestions(unitId, mode) {
  const words = poolFor(unitId);
  const sents = sentencePool(unitId);
  const total = mode === 'exam' ? EXAM_LEN : LEN;

  /* sentence-only modes */
  if (mode === 'order' || mode === 'blank' || mode === 'sentences') {
    if (!sents.length) return [];
    const types = mode === 'sentences' ? ['order', 'blank', 's_listen'] : [mode];
    const chosen = pickAdaptive(sents, Math.min(total, sents.length));
    return shuffle(chosen.map((s, i) => makeSentence(s, types[i % types.length])).filter(Boolean));
  }

  if (!words.length) return [];
  const types = WORD_TYPES[mode] || WORD_TYPES.mix;
  /* an exam leans harder on sentences than a quick quiz does */
  const sentenceShare = mode === 'exam' ? 6 : 3;
  const withSentences = (mode === 'mix' || mode === 'exam') && sents.length >= sentenceShare;
  const wordCount = withSentences ? total - sentenceShare : total;
  const chosen = pickAdaptive(words, Math.min(wordCount, words.length));
  const qs = chosen.map((w, i) => makeWord(w, types[i % types.length]));

  if (withSentences) {
    const sTypes = ['order', 'blank', 's_listen'];
    pickAdaptive(sents, sentenceShare).forEach((s, i) => {
      const q = makeSentence(s, sTypes[i % sTypes.length]);
      if (q) qs.push(q);
    });
  }
  return shuffle(qs).slice(0, total);
}

function makeWord(w, type) {
  if (type === 'mcq_en_ar') return { type, w, skill: 'rec', options: shuffle([w, ...distractors(w, 3, 'ar')]), key: 'ar' };
  if (type === 'mcq_ar_en') return { type, w, skill: 'rec', options: shuffle([w, ...distractors(w, 3, 'en')]), key: 'en' };
  if (type === 'listen')    return { type, w, skill: 'lis', options: shuffle([w, ...distractors(w, 3, 'en')]), key: 'en' };
  if (type === 'tiles') {
    const letters = w.en.replace(/\s/g, '').split('');
    const extra = letters.length <= 6 ? 3 : 2;
    const noise = Array.from({ length: extra }, () => pick('abcdefghilmnoprstu'.split('')));
    return { type, w, skill: 'spl', tiles: shuffle([...letters, ...noise]) };
  }
  return { type: 'spell', w, skill: 'spl' };
}

function makeSentence(s, type) {
  if (type === 'order')  return { type, s, skill: 'snt' };
  if (type === 's_listen') {
    const others = sample(store.sentences.filter(x => x.id !== s.id && x.ar), 3);
    if (others.length < 3) return null;
    return { type, s, skill: 'snt', options: shuffle([s, ...others]) };
  }
  /* fill in the blank: hide one meaningful word */
  const parts = s.en.split(/\s+/);
  const candidates = parts
    .map((t, i) => [t.replace(/[.,!?]/g, ''), i])
    .filter(([t]) => t.length >= 3 && !/^(the|and|for|you|are|was|with|that|this)$/i.test(t));
  if (!candidates.length) return { type: 'order', s, skill: 'snt' };
  const [answer, at] = pick(candidates);
  const pool = store.words.map(w => w.en).filter(en => /^[a-z]+$/i.test(en) && en.toLowerCase() !== answer.toLowerCase());
  const opts = shuffle([answer, ...sample([...new Set(pool)], 3)]);
  return { type: 'blank', s, skill: 'snt', at, answer, options: opts };
}

/* -------------------------------------------------- view */
export default function quiz({ params, query, view }) {
  const unitId = params.id || 'all';
  const mode = query.mode || 'mix';
  const questions = buildQuestions(unitId, mode);

  if (questions.length < 1) {
    view.append(el('div', { class: 'wrap' }, [
      emptyState('🧩', 'لا توجد كلمات كافية للاختبار', 'تعلّم بعض الكلمات أولاً'),
      el('button', { class: 'btn btn--primary btn--block', text: 'إلى الدروس', onclick: () => go('/units') }),
    ]));
    return;
  }

  let i = 0, right = 0, wrongList = [], locked = false;
  const wrap = el('div', { class: 'wrap' });
  view.append(wrap);

  /* ---------- answer handling ---------- */
  function answer(ok, q, extra = {}) {
    if (locked) return;
    locked = true;
    const id = q.w?.id || q.s?.id;
    if (ok) {
      right++;
      if (id) review(id, 2, q.skill);
      addXP(10, 'review');
      haptic(12);
    } else {
      if (id) review(id, 0, q.skill);
      addXP(2, 'review');
      haptic([10, 60, 10]);
      wrongList.push(q);
    }
    showFeedback(ok, q, extra);
  }

  function showFeedback(ok, q, extra) {
    const target = q.s || q.w;
    const bar = el('div', { class: 'fbar ' + (ok ? 'fbar--ok' : 'fbar--no') }, [
      el('div', { class: 'fbar__t', html: (ok ? ICON.check : ICON.x) + (ok ? '<span>إجابة صحيحة!</span>' : '<span>الإجابة الصحيحة:</span>') }),
      el('div', { class: 'fbar__d' }, [
        el('span', { class: 'en', style: 'font-weight:800', text: target.en }),
        el('span', { text: ' — ' + target.ar }),
      ]),
      settings.showTranslit && target.tr ? el('div', { class: 'fbar__d', text: target.tr }) : null,
      extra.note ? el('div', { class: 'fbar__d', text: extra.note }) : null,
      el('button', { class: 'btn btn--block', text: i + 1 >= questions.length ? 'النتيجة' : 'التالي', onclick: next }),
    ]);
    wrap.append(bar);
    speak(target.en);
    document.addEventListener('keydown', onEnter);
    function onEnter(e) { if (e.key === 'Enter') { document.removeEventListener('keydown', onEnter); next(); } }
  }

  function next() {
    i++; locked = false;
    if (i >= questions.length) finish(); else draw();
  }

  /* ---------- results ---------- */
  function finish() {
    const score = pct(right, questions.length);
    const emoji = score >= 90 ? '🏆' : score >= 70 ? '🎉' : score >= 50 ? '💪' : '📚';
    const msg = score >= 90 ? 'ممتاز جداً!' : score >= 70 ? 'عمل جيد!' : score >= 50 ? 'تحسّن جيد، واصل!' : 'راجع الكلمات ثم أعد المحاولة';
    wrap.innerHTML = '';
    wrap.append(el('div', { class: 'result' }, [
      el('div', { class: 'result__emoji', text: emoji }),
      el('div', { class: 'result__score', text: AR_NUM(score) + '%' }),
      el('h2', { style: 'font-weight:800', text: msg }),
      el('div', { class: 'result__grid' }, [
        el('div', { class: 'mini', html: `<b>${AR_NUM(right)}</b><span>صحيحة</span>` }),
        el('div', { class: 'mini', html: `<b>${AR_NUM(questions.length - right)}</b><span>خاطئة</span>` }),
        el('div', { class: 'mini', html: `<b>+${AR_NUM(right * 10 + (questions.length - right) * 2)}</b><span>نقطة</span>` }),
      ]),
      wrongList.length ? el('div', { class: 'stack stack--sm', style: 'width:100%;margin-top:var(--sp-5);text-align:start' }, [
        el('div', { style: 'font-weight:800', text: 'تحتاج مراجعة' }),
        ...wrongList.map(q => q.s || q.w).map(t => el('div', { class: 'wordrow' }, [
          el('div', { class: 'wordrow__main' }, [
            el('div', { class: 'wordrow__en', text: t.en }),
            el('div', { class: 'wordrow__ar', text: t.ar }),
          ]),
          speakBtn(() => t.en),
        ])),
      ]) : null,
      el('div', { class: 'stack', style: 'width:100%;margin-top:var(--sp-5)' }, [
        el('button', { class: 'btn btn--primary btn--lg btn--block', text: 'اختبار جديد', onclick: () => { location.reload(); } }),
        el('button', { class: 'btn btn--ghost btn--block', text: 'رجوع', onclick: () => back() }),
      ]),
    ]));
  }

  /* ---------- renderers ---------- */
  function draw() {
    const q = questions[i];
    wrap.innerHTML = '';
    wrap.append(sessionHead({
      percent: (i / questions.length) * 100,
      onExit: () => back(),
      right: el('span', { class: 'chip chip--brand', text: `${AR_NUM(i + 1)}/${AR_NUM(questions.length)}` }),
    }));
    ({
      mcq_en_ar: drawMCQ, mcq_ar_en: drawMCQ, listen: drawListen,
      spell: drawSpell, tiles: drawTiles, order: drawOrder,
      blank: drawBlank, s_listen: drawSentenceListen,
    })[q.type](q);
  }

  function drawMCQ(q) {
    const enToAr = q.type === 'mcq_en_ar';
    wrap.append(el('div', { class: 'q-prompt' }, [
      el('div', { class: 'q-kicker', text: enToAr ? 'ما معنى هذه الكلمة؟' : 'ما هي هذه الكلمة بالإنجليزية؟' }),
      q.w.emoji ? el('div', { style: 'font-size:2.6rem', text: q.w.emoji }) : null,
      enToAr
        ? el('div', { class: 'q-word', text: q.w.en })
        : el('div', { class: 'q-word-ar', text: q.w.ar }),
      enToAr && settings.showTranslit && q.w.tr ? el('div', { class: 'q-tr', text: q.w.tr }) : null,
      enToAr ? speakBtn(() => q.w.en, 'fcard__speak') : null,
    ]));

    const opts = el('div', { class: 'opts' });
    q.options.forEach((o, n) => {
      const b = el('button', { class: 'opt' + (q.key === 'en' ? ' en' : '') }, [
        el('span', { class: 'opt__key', text: AR_NUM(n + 1) }),
        el('span', { class: 'grow', text: o[q.key] }),
      ]);
      b.addEventListener('click', () => {
        if (locked) return;
        const ok = o.id === q.w.id;
        b.classList.add(ok ? 'is-right' : 'is-wrong');
        if (!ok) [...opts.children].find(c => c.dataset.id === q.w.id)?.classList.add('is-right');
        [...opts.children].forEach(c => { if (c !== b) c.classList.add('is-dim'); });
        answer(ok, q);
      });
      b.dataset.id = o.id;
      opts.append(b);
    });
    wrap.append(opts);
  }

  function drawListen(q) {
    unlock();
    const big = el('button', { class: 'fcard__speak', style: 'width:96px;height:96px', html: ICON.play });
    big.addEventListener('click', () => speak(q.w.en));
    wrap.append(el('div', { class: 'q-prompt' }, [
      el('div', { class: 'q-kicker', text: 'استمع ثم اختر الكلمة الصحيحة' }),
      big,
      el('button', { class: 'btn btn--sm btn--ghost', text: 'ببطء 🐢', onclick: () => speak(q.w.en, { rate: 0.5 }) }),
    ]));
    setTimeout(() => speak(q.w.en), 380);

    const opts = el('div', { class: 'opts' });
    q.options.forEach((o, n) => {
      const b = el('button', { class: 'opt en' }, [
        el('span', { class: 'opt__key', text: AR_NUM(n + 1) }),
        el('span', { class: 'grow', text: o.en }),
      ]);
      b.dataset.id = o.id;
      b.addEventListener('click', () => {
        if (locked) return;
        const ok = o.id === q.w.id;
        b.classList.add(ok ? 'is-right' : 'is-wrong');
        if (!ok) [...opts.children].find(c => c.dataset.id === q.w.id)?.classList.add('is-right');
        answer(ok, q);
      });
      opts.append(b);
    });
    wrap.append(opts);
  }

  function drawSpell(q) {
    const input = el('input', {
      class: 'spell-input', type: 'text', autocomplete: 'off',
      autocorrect: 'off', autocapitalize: 'none', spellcheck: 'false',
      placeholder: '. . .', lang: 'en', dir: 'ltr',
    });
    wrap.append(el('div', { class: 'q-prompt' }, [
      el('div', { class: 'q-kicker', text: 'اكتب الكلمة بالإنجليزية' }),
      q.w.emoji ? el('div', { style: 'font-size:2.6rem', text: q.w.emoji }) : null,
      el('div', { class: 'q-word-ar', text: q.w.ar }),
      settings.showTranslit && q.w.tr ? el('div', { class: 'q-tr', text: q.w.tr }) : null,
      el('div', { class: 'row', style: 'gap:8px' }, [
        el('button', { class: 'btn btn--sm btn--ghost', text: '🔊 استمع', onclick: () => speak(q.w.en) }),
        el('button', { class: 'btn btn--sm btn--ghost', text: '🔤 تهجئة', onclick: () => spellOut(q.w.en) }),
        el('button', {
          class: 'btn btn--sm btn--ghost', text: '💡 تلميح',
          onclick: () => { input.value = q.w.en.slice(0, Math.max(1, Math.ceil(q.w.en.length / 3))); input.focus(); },
        }),
      ]),
    ]));
    wrap.append(el('div', { style: 'margin-top:var(--sp-5)' }, [input]));
    wrap.append(el('button', {
      class: 'btn btn--primary btn--lg btn--block', style: 'margin-top:var(--sp-4)',
      text: 'تحقّق', onclick: check,
    }));
    setTimeout(() => input.focus(), 120);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') check(); });

    function check() {
      if (locked) return;
      const ok = sameWord(input.value, q.w.en);
      input.classList.add(ok ? 'is-right' : 'is-wrong');
      input.blur();
      const close = !ok && editDistance(input.value, q.w.en) <= 1 && input.value.trim();
      answer(ok, q, { note: close ? 'قريب جداً! فرق حرف واحد فقط.' : '' });
    }
  }

  function drawTiles(q) {
    const target = q.w.en;
    const letters = target.replace(/\s/g, '').split('');
    let filled = [];

    wrap.append(el('div', { class: 'q-prompt' }, [
      el('div', { class: 'q-kicker', text: 'رتّب الحروف لتكوين الكلمة' }),
      q.w.emoji ? el('div', { style: 'font-size:2.6rem', text: q.w.emoji }) : null,
      el('div', { class: 'q-word-ar', text: q.w.ar }),
      settings.showTranslit && q.w.tr ? el('div', { class: 'q-tr', text: q.w.tr }) : null,
      el('button', { class: 'btn btn--sm btn--ghost', text: '🔊 استمع', onclick: () => speak(target) }),
    ]));

    const slots = el('div', { class: 'spell-slots', style: 'margin-top:var(--sp-5)' });
    const tiles = el('div', { class: 'tiles' });
    wrap.append(slots, tiles);

    const btn = el('button', {
      class: 'btn btn--primary btn--lg btn--block', style: 'margin-top:var(--sp-5)',
      text: 'تحقّق', onclick: check, disabled: true,
    });
    wrap.append(btn);

    function paint() {
      slots.innerHTML = '';
      letters.forEach((_, n) => slots.append(
        el('div', { class: 'slot' + (filled[n] ? ' is-filled' : ''), text: filled[n]?.ch || '' })));
      tiles.innerHTML = '';
      q.tiles.forEach((ch, n) => {
        const used = filled.some(f => f && f.n === n);
        const t = el('button', { class: 'tile' + (used ? ' is-used' : ''), text: ch });
        t.addEventListener('click', () => {
          if (filled.length >= letters.length) return;
          filled.push({ ch, n }); haptic(5); paint();
        });
        tiles.append(t);
      });
      btn.disabled = filled.length !== letters.length;
      slots.onclick = () => { if (filled.length) { filled.pop(); paint(); } };
    }
    paint();

    function check() {
      if (locked) return;
      const ok = filled.map(f => f.ch).join('').toLowerCase() === letters.join('').toLowerCase();
      answer(ok, q);
    }
  }

  /* fill in the missing word */
  function drawBlank(q) {
    const parts = q.s.en.split(/\s+/);
    const shown = parts.map((t, i) => (i === q.at ? '____' : t)).join(' ');

    wrap.append(el('div', { class: 'q-prompt' }, [
      el('div', { class: 'q-kicker', text: 'أكمل الكلمة الناقصة' }),
      el('div', { class: 'en', style: 'font-size:1.35rem;font-weight:800;text-align:center', text: shown }),
      el('div', { style: 'font-size:1.05rem;color:var(--ink-2)', text: q.s.ar }),
      el('button', { class: 'btn btn--sm btn--ghost', text: '🔊 استمع للجملة', onclick: () => speak(q.s.en) }),
    ]));

    const opts = el('div', { class: 'opts' });
    q.options.forEach((o, n) => {
      const b = el('button', { class: 'opt en' }, [
        el('span', { class: 'opt__key', text: AR_NUM(n + 1) }),
        el('span', { class: 'grow', text: o }),
      ]);
      b.addEventListener('click', () => {
        if (locked) return;
        const ok = o.toLowerCase() === q.answer.toLowerCase();
        b.classList.add(ok ? 'is-right' : 'is-wrong');
        if (!ok) [...opts.children].find(c => c.textContent.includes(q.answer))?.classList.add('is-right');
        answer(ok, q);
      });
      opts.append(b);
    });
    wrap.append(opts);
  }

  /* hear a whole sentence, pick its meaning */
  function drawSentenceListen(q) {
    unlock();
    const big = el('button', { class: 'fcard__speak', style: 'width:96px;height:96px', html: ICON.play });
    big.addEventListener('click', () => speak(q.s.en));
    wrap.append(el('div', { class: 'q-prompt' }, [
      el('div', { class: 'q-kicker', text: 'استمع للجملة واختر معناها' }),
      big,
      el('button', { class: 'btn btn--sm btn--ghost', text: 'ببطء 🐢', onclick: () => speak(q.s.en, { rate: 0.55 }) }),
    ]));
    setTimeout(() => speak(q.s.en), 400);

    const opts = el('div', { class: 'opts' });
    q.options.forEach(o => {
      const b = el('button', { class: 'opt', style: 'font-size:.98rem' }, [el('span', { class: 'grow', text: o.ar })]);
      b.addEventListener('click', () => {
        if (locked) return;
        const ok = o.id === q.s.id;
        b.classList.add(ok ? 'is-right' : 'is-wrong');
        if (!ok) [...opts.children].find(c => c.textContent.trim() === q.s.ar)?.classList.add('is-right');
        answer(ok, q);
      });
      opts.append(b);
    });
    wrap.append(opts);
  }

  function drawOrder(q) {
    const words = q.s.en.replace(/([.?!,])/g, ' $1').split(/\s+/).filter(Boolean);
    let picked = [];

    wrap.append(el('div', { class: 'q-prompt' }, [
      el('div', { class: 'q-kicker', text: 'رتّب الكلمات لتكوين الجملة' }),
      el('div', { style: 'font-size:1.25rem;font-weight:800', text: q.s.ar }),
      el('button', { class: 'btn btn--sm btn--ghost', text: '🔊 استمع', onclick: () => speak(q.s.en) }),
    ]));

    const line = el('div', {
      class: 'card en', style: 'min-height:70px;margin-top:var(--sp-5);padding:var(--sp-3);display:flex;flex-wrap:wrap;gap:6px;align-content:flex-start',
    });
    const bank = el('div', { class: 'tiles' });
    wrap.append(line, bank);
    const btn = el('button', {
      class: 'btn btn--primary btn--lg btn--block', style: 'margin-top:var(--sp-5)',
      text: 'تحقّق', onclick: check, disabled: true,
    });
    wrap.append(btn);

    const shuffled = shuffle(words.map((t, n) => ({ t, n })));
    function paint() {
      line.innerHTML = '';
      picked.forEach((p, idx) => {
        const t = el('button', { class: 'tile tile--word', text: p.t });
        t.addEventListener('click', () => { picked.splice(idx, 1); paint(); });
        line.append(t);
      });
      bank.innerHTML = '';
      shuffled.forEach(s => {
        const used = picked.some(p => p.n === s.n);
        const t = el('button', { class: 'tile tile--word' + (used ? ' is-used' : ''), text: s.t });
        t.addEventListener('click', () => { picked.push(s); haptic(5); paint(); });
        bank.append(t);
      });
      btn.disabled = picked.length !== words.length;
    }
    paint();

    function check() {
      if (locked) return;
      const ok = picked.map(p => p.t).join(' ') === words.join(' ');
      answer(ok, q);
    }
  }

  draw();
}
