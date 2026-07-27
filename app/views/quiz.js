/* ============================================================
   views/quiz.js — the test engine
   Modes: mcq (EN→AR / AR→EN) · listen · spell (typing) ·
          tiles (letter building) · order (sentence building) · mix
   ============================================================ */
import { el, AR_NUM, shuffle, sample, pick, haptic, sameWord, editDistance, pct } from '../util.js';
import { store, distractors } from '../data.js';
import { review, addXP, isNew, settings } from '../store.js';
import { ICON, sessionHead, emptyState, speakBtn } from '../ui.js';
import { speak, spell as spellOut, unlock } from '../tts.js';
import { go, back } from '../router.js';

const LEN = 10;

/* -------------------------------------------------- pool selection */
function poolFor(unitId) {
  if (unitId === 'all') {
    const seen = store.words.filter(w => !isNew(w.id));
    return seen.length >= 4 ? seen : store.words;
  }
  return store.unitById.get(unitId)?.words || [];
}

function sentencePool(unitId) {
  const all = unitId === 'all' ? store.sentences : (store.unitById.get(unitId)?.sentences || []);
  return all.filter(s => s.en.split(/\s+/).length >= 3 && s.en.split(/\s+/).length <= 8);
}

/* -------------------------------------------------- question builder */
function buildQuestions(unitId, mode) {
  const words = poolFor(unitId);
  const sents = sentencePool(unitId);
  if (!words.length) return [];

  const chosen = sample(words, Math.min(LEN, words.length));
  const types = {
    mcq:    ['mcq_en_ar', 'mcq_ar_en'],
    listen: ['listen'],
    spell:  ['spell', 'tiles'],
    order:  ['order'],
    mix:    ['mcq_en_ar', 'mcq_ar_en', 'listen', 'tiles', 'spell'],
  }[mode] || ['mcq_en_ar'];

  const qs = chosen.map((w, i) => make(w, types[i % types.length]));

  // sprinkle sentence-order questions into the mixed test
  if ((mode === 'mix' || mode === 'order') && sents.length) {
    const n = mode === 'order' ? LEN : 2;
    for (const s of sample(sents, Math.min(n, sents.length))) qs.push({ type: 'order', s });
    if (mode === 'order') qs.splice(0, qs.length - Math.min(LEN, sents.length));
  }
  return shuffle(qs).slice(0, LEN);
}

function make(w, type) {
  if (type === 'mcq_en_ar') {
    return { type, w, options: shuffle([w, ...distractors(w, 3, 'ar')]), key: 'ar' };
  }
  if (type === 'mcq_ar_en') {
    return { type, w, options: shuffle([w, ...distractors(w, 3, 'en')]), key: 'en' };
  }
  if (type === 'listen') {
    return { type, w, options: shuffle([w, ...distractors(w, 3, 'en')]), key: 'en' };
  }
  if (type === 'tiles') {
    const letters = w.en.replace(/\s/g, '').split('');
    const extra = letters.length <= 6 ? 3 : 2;
    const noise = Array.from({ length: extra }, () => pick('abcdefghilmnoprstu'.split('')));
    return { type, w, tiles: shuffle([...letters, ...noise]) };
  }
  return { type: 'spell', w };
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
    const id = q.w?.id;
    if (ok) {
      right++;
      if (id) review(id, 2);
      addXP(10, 'review');
      haptic(12);
    } else {
      if (id) review(id, 0);
      addXP(2, 'review');
      haptic([10, 60, 10]);
      wrongList.push(q);
    }
    showFeedback(ok, q, extra);
  }

  function showFeedback(ok, q, extra) {
    const target = q.type === 'order' ? q.s : q.w;
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
        el('div', { style: 'font-weight:800', text: 'كلمات تحتاج مراجعة' }),
        ...wrongList.filter(q => q.w).map(q => el('div', { class: 'wordrow' }, [
          el('div', { class: 'wordrow__main' }, [
            el('div', { class: 'wordrow__en', text: q.w.en }),
            el('div', { class: 'wordrow__ar', text: q.w.ar }),
          ]),
          speakBtn(() => q.w.en),
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
