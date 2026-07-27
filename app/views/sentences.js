/* ============================================================
   views/sentences.js — الجمل اليومية
   A daily set of sentences to study, plus the full phrasebook.
   Sentences are scheduled by the same SRS that handles words.
   ============================================================ */
import { el, AR_NUM, pct, haptic, debounce, dayKey } from '../util.js';
import { store, allSentenceIds } from '../data.js';
import {
  counts, dueIds, isNew, review, addXP, settings, strength, byPriority, touchDay,
} from '../store.js';
import { sentRow, sectionTitle, bar, ring, ICON, emptyState, speakBtn, sessionHead } from '../ui.js';
import { speak, unlock } from '../tts.js';
import { go, back } from '../router.js';

const DAILY = 8;

/** Today's set: what is due first, then new ones in course order.
    Deliberately stable — the list should not reshuffle on every open. */
export function dailySet(n = DAILY) {
  const ids = allSentenceIds();
  const due = dueIds(ids);
  const fresh = ids.filter(id => isNew(id));
  return [...due, ...fresh].slice(0, n).map(id => store.sentenceById.get(id)).filter(Boolean);
}

/* ============================================================ index */
export default function sentences({ view }) {
  touchDay();
  const ids = allSentenceIds();
  const c = counts(ids);
  const today = dailySet();
  const doneToday = today.filter(s => !isNew(s.id) && !dueIds([s.id]).length).length;

  const wrap = el('div', { class: 'wrap stack' });

  /* hero */
  wrap.append(el('section', { class: 'hero anim' }, [
    el('div', { class: 'hero__greet', text: 'جمل اليوم' }),
    el('div', { class: 'hero__title', text: doneToday >= today.length ? 'أنهيت جمل اليوم 🎉' : 'تعلّم ٨ جمل اليوم' }),
    el('div', { class: 'hero__row' }, [
      ring(pct(doneToday, today.length || 1), `${AR_NUM(doneToday)}/${AR_NUM(today.length)}`, 'اليوم'),
      el('div', { class: 'hero__stats' }, [
        el('div', { class: 'hero__stat', html: `${ICON.book}<b>${AR_NUM(c.learned)}</b> جملة تعلمتها` }),
        el('div', { class: 'hero__stat', html: `${ICON.star}<b>${AR_NUM(c.mastered)}</b> جملة متقنة` }),
        el('div', { class: 'hero__stat', html: `${ICON.bolt}<b>${AR_NUM(c.total)}</b> جملة في التطبيق` }),
      ]),
    ]),
  ]));

  /* actions */
  wrap.append(el('div', { class: 'stack stack--sm anim-2' }, [
    el('button', {
      class: 'btn btn--primary btn--lg btn--block',
      html: ICON.book + '<span>ابدأ جلسة الجمل</span>',
      onclick: () => go('/sentence-study'),
    }),
    el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-2)' }, [
      el('button', { class: 'btn btn--ghost', text: '🧩 أكمل الناقص', onclick: () => go('/quiz/all?mode=blank') }),
      el('button', { class: 'btn btn--ghost', text: '🔀 رتّب الجملة', onclick: () => go('/quiz/all?mode=order') }),
    ]),
    el('button', { class: 'btn btn--ghost btn--block', text: '👂 اختبار استماع للجمل', onclick: () => go('/quiz/all?mode=sentences') }),
  ]));

  /* today's list */
  wrap.append(sectionTitle('مجموعة اليوم'));
  wrap.append(el('div', { class: 'stack stack--sm' },
    today.length ? today.map(s => sentenceCard(s)) : [emptyState('✅', 'لا جديد اليوم', 'عد غداً أو تصفّح كل الجمل')]));

  /* browse everything */
  wrap.append(sectionTitle(`كل الجمل (${AR_NUM(c.total)})`));

  const input = el('input', { type: 'search', placeholder: 'ابحث في الجمل…', 'aria-label': 'بحث في الجمل' });
  wrap.append(el('div', { class: 'searchbar' }, [
    el('span', { html: '<svg viewBox="0 0 24 24" class="ico"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.2-3.2"/></svg>' }),
    input,
  ]));

  const list = el('div', { class: 'stack stack--sm' });
  wrap.append(list);

  const paint = () => {
    const q = input.value.trim().toLowerCase();
    list.innerHTML = '';
    const units = store.units.filter(u => u.sentences.length);
    let shown = 0;
    for (const u of units) {
      const hits = q
        ? u.sentences.filter(s => s.en.toLowerCase().includes(q) || s.ar.includes(q) || (s.tr || '').includes(q))
        : u.sentences;
      if (!hits.length) continue;
      shown += hits.length;
      const box = el('div', { class: 'stack stack--sm', style: 'margin-bottom:var(--sp-3)' });
      const head = el('button', {
        class: 'row row--between',
        style: 'width:100%;padding:10px 12px;border-radius:var(--r-md);background:var(--surface-2);border:1px solid var(--line)',
      }, [
        el('span', { style: 'font-weight:700', text: `${u.icon} ${u.title.ar}` }),
        el('span', { class: 'chip', text: AR_NUM(hits.length) }),
      ]);
      /* Rows are built only when a group is opened. With ~950 sentences,
         rendering them all up front made the page enormous on a phone. */
      const body = el('div', { class: 'stack stack--sm' });
      let built = false;
      const build = () => {
        if (built) return;
        built = true;
        body.append(...hits.map(sentRow));
      };
      if (q) { build(); } else { body.classList.add('hide'); }
      head.addEventListener('click', () => {
        build();
        body.classList.toggle('hide');
      });
      box.append(head, body);
      list.append(box);
    }
    if (!shown) list.append(emptyState('🤷', 'لا نتائج'));
  };
  input.addEventListener('input', debounce(paint, 180));
  paint();

  view.append(wrap);
}

/** one sentence in today's set, with its learning state */
function sentenceCard(s) {
  const st = strength(s.id);
  return el('div', { class: 'sent' }, [
    speakBtn(() => s.en),
    el('div', { class: 'sent__body' }, [
      el('div', { class: 'sent__en', text: s.en }),
      settings.showTranslit && s.tr ? el('div', { class: 'sent__tr', text: s.tr }) : null,
      el('div', { class: 'sent__ar', text: s.ar }),
    ]),
    el('i', { class: 'dot-state s' + st, title: ['جديدة', 'قيد التعلّم', 'جيدة', 'متقنة'][st] }),
  ]);
}

/* ============================================================ study session */
export function sentenceStudy({ view }) {
  const queue = dailySet(DAILY);
  const wrap = el('div', { class: 'wrap' });
  view.append(wrap);

  if (!queue.length) {
    wrap.append(
      emptyState('✅', 'لا جمل مستحقة اليوم', 'أحسنت! يمكنك تصفّح الجمل أو مراجعة الكلمات'),
      el('button', { class: 'btn btn--primary btn--block', text: 'رجوع', onclick: () => go('/sentences') }),
    );
    return;
  }

  let i = 0, revealed = false, known = 0;

  function grade(g) {
    const s = queue[i];
    review(s.id, g, 'snt');
    if (g > 0) { known++; addXP(8, 'learn'); } else { addXP(3, 'learn'); queue.push(s); }
    haptic(g > 0 ? 10 : [8, 40, 8]);
    i++; revealed = false;
    if (i >= queue.length) finish(); else draw();
  }

  function finish() {
    wrap.innerHTML = '';
    wrap.append(el('div', { class: 'result' }, [
      el('div', { class: 'result__emoji', text: '💬' }),
      el('h2', { style: 'font-size:1.4rem;font-weight:800', text: 'أنهيت جمل اليوم' }),
      el('div', { class: 'result__grid' }, [
        el('div', { class: 'mini', html: `<b>${AR_NUM(queue.length)}</b><span>جملة</span>` }),
        el('div', { class: 'mini', html: `<b>${AR_NUM(known)}</b><span>تذكّرتها</span>` }),
        el('div', { class: 'mini', html: `<b>+${AR_NUM(known * 8)}</b><span>نقطة</span>` }),
      ]),
      el('div', { class: 'stack', style: 'width:100%;margin-top:var(--sp-5)' }, [
        el('button', { class: 'btn btn--primary btn--lg btn--block', text: 'اختبر جمل اليوم', onclick: () => go('/quiz/all?mode=sentences') }),
        el('button', { class: 'btn btn--ghost btn--block', text: 'رجوع', onclick: () => go('/sentences') }),
      ]),
    ]));
  }

  function draw() {
    const s = queue[i];
    wrap.innerHTML = '';
    wrap.append(sessionHead({
      percent: (i / queue.length) * 100,
      onExit: () => back(),
      right: el('span', { class: 'chip chip--brand', text: `${AR_NUM(i + 1)}/${AR_NUM(queue.length)}` }),
    }));

    const card = el('div', { class: 'fcard' }, [
      el('div', { class: 'q-kicker', text: revealed ? 'الجملة بالإنجليزية' : 'كيف تقولها بالإنجليزية؟' }),
      el('div', { style: 'font-size:1.35rem;font-weight:800;line-height:1.7', text: s.ar }),
    ]);

    if (revealed) {
      card.append(el('div', { class: 'en', style: 'font-size:1.5rem;font-weight:800;line-height:1.6', text: s.en }));
      if (settings.showTranslit && s.tr) card.append(el('div', { class: 'fcard__tr', text: s.tr }));
      card.append(speakBtn(() => s.en, 'fcard__speak'));
      card.append(el('button', {
        class: 'btn btn--sm btn--ghost', text: '🐢 ببطء', onclick: () => speak(s.en, { rate: 0.55 }),
      }));
      unlock(); speak(s.en);
    } else {
      card.append(el('div', { class: 'reveal-hint', text: 'فكّر… ثم اضغط لعرض الإجابة' }));
      card.addEventListener('click', () => { revealed = true; draw(); });
    }
    wrap.append(card);

    wrap.append(revealed
      ? el('div', { class: 'stack stack--sm', style: 'margin-top:var(--sp-4)' }, [
          el('div', { style: 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px' }, [
            el('button', { class: 'btn btn--rose', text: 'صعبة', onclick: () => grade(0) }),
            el('button', { class: 'btn btn--ghost', text: 'متوسطة', onclick: () => grade(1) }),
            el('button', { class: 'btn btn--mint', text: 'سهلة', onclick: () => grade(3) }),
          ]),
          el('button', { class: 'btn btn--primary btn--block', text: 'تذكّرتها ✓', onclick: () => grade(2) }),
        ])
      : el('div', { style: 'margin-top:var(--sp-4)' }, [
          el('button', { class: 'btn btn--primary btn--lg btn--block', text: 'أظهر الجملة', onclick: () => { revealed = true; draw(); } }),
        ]));
  }

  draw();
}
