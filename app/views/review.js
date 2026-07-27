/* ============================================================
   views/review.js — spaced-repetition session
   Shows the meaning first, you recall the English, then grade
   yourself. Grades feed the SM-2-style scheduler in store.js.
   ============================================================ */
import { el, AR_NUM, haptic, pct } from '../util.js';
import { store, allWordIds, allItemIds, itemById } from '../data.js';
import { review, addXP, itemOf, counts, settings, dueIds } from '../store.js';
import { speakBtn, sessionHead, emptyState } from '../ui.js';
import { speak, unlock } from '../tts.js';
import { go, back } from '../router.js';

const MAX = 25;

export default function reviewView({ view }) {
  // words and sentences share one queue — both are scheduled the same way
  const ids = dueIds(allItemIds()).slice(0, MAX);
  const wrap = el('div', { class: 'wrap' });
  view.append(wrap);

  if (!ids.length) {
    const c = counts(allWordIds());
    wrap.append(el('div', { class: 'stack' }, [
      emptyState('✅', 'لا توجد مراجعات اليوم', 'كل شيء محدّث. تعلّم كلمات جديدة لتظهر هنا لاحقاً.'),
      el('div', { class: 'statgrid' }, [
        el('div', { class: 'statbox' }, [el('b', { text: AR_NUM(c.learned) }), el('span', { text: 'كلمة تعلمتها' })]),
        el('div', { class: 'statbox' }, [el('b', { text: AR_NUM(c.mastered) }), el('span', { text: 'كلمة متقنة' })]),
      ]),
      el('button', { class: 'btn btn--primary btn--lg btn--block', text: 'تعلّم كلمات جديدة', onclick: () => go('/units') }),
      el('button', { class: 'btn btn--ghost btn--block', text: 'اختبار سريع', onclick: () => go('/quiz/all?mode=mix') }),
    ]));
    return;
  }

  const queue = ids.map(itemById).filter(Boolean);
  let i = 0, revealed = false, done = 0, good = 0;

  function grade(g) {
    const w = queue[i];
    review(w.id, g, store.sentenceById.has(w.id) ? 'snt' : 'rec');
    done++;
    if (g > 0) { good++; addXP(8, 'review'); } else { addXP(3, 'review'); queue.push(w); }
    haptic(g > 0 ? 10 : [8, 40, 8]);
    i++; revealed = false;
    if (i >= queue.length) finish(); else draw();
  }

  function finish() {
    wrap.innerHTML = '';
    wrap.append(el('div', { class: 'result' }, [
      el('div', { class: 'result__emoji', text: '🧠' }),
      el('h2', { style: 'font-size:1.4rem;font-weight:800', text: 'انتهت المراجعة' }),
      el('div', { class: 'result__grid' }, [
        el('div', { class: 'mini', html: `<b>${AR_NUM(done)}</b><span>كلمة</span>` }),
        el('div', { class: 'mini', html: `<b>${AR_NUM(pct(good, done))}%</b><span>تذكّرت</span>` }),
        el('div', { class: 'mini', html: `<b>${AR_NUM(dueIds(allItemIds()).length)}</b><span>متبقٍ</span>` }),
      ]),
      el('div', { class: 'stack', style: 'width:100%;margin-top:var(--sp-5)' }, [
        el('button', { class: 'btn btn--primary btn--lg btn--block', text: 'متابعة', onclick: () => go('/') }),
      ]),
    ]));
  }

  function draw() {
    const w = queue[i];
    const it = itemOf(w.id);
    wrap.innerHTML = '';
    wrap.append(sessionHead({
      percent: (i / queue.length) * 100,
      onExit: () => back(),
      right: el('span', { class: 'chip chip--brand', text: `${AR_NUM(i + 1)}/${AR_NUM(queue.length)}` }),
    }));

    const card = el('div', { class: 'fcard' }, [
      el('div', { class: 'q-kicker', text: revealed ? 'الكلمة الصحيحة' : 'ما هي هذه الكلمة بالإنجليزية؟' }),
      w.emoji ? el('div', { class: 'fcard__emoji', text: w.emoji }) : null,
      el('div', { class: 'fcard__ar', text: w.ar }),
    ]);

    if (revealed) {
      card.append(el('div', { class: 'fcard__en', text: w.en }));
      if (settings.showTranslit && w.tr) card.append(el('div', { class: 'fcard__tr', text: w.tr }));
      card.append(speakBtn(() => w.en, 'fcard__speak'));
      if (w.ex?.en) card.append(el('div', { class: 'fcard__ex' }, [
        el('div', { class: 'en', text: w.ex.en }),
        el('div', { class: 'ar', text: w.ex.ar }),
      ]));
      if (it) card.append(el('div', { class: 'small muted', text: `تكرار ${AR_NUM(it.n)} · الفاصل ${AR_NUM(it.i)} يوم` }));
      unlock(); speak(w.en);
    } else {
      card.append(el('div', { class: 'reveal-hint', text: 'فكّر… ثم اضغط لعرض الإجابة' }));
      card.addEventListener('click', () => { revealed = true; draw(); });
    }
    wrap.append(card);

    wrap.append(revealed
      ? el('div', { class: 'stack stack--sm', style: 'margin-top:var(--sp-4)' }, [
          el('div', { style: 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px' }, [
            el('button', { class: 'btn btn--rose', text: 'نسيتها', onclick: () => grade(0) }),
            el('button', { class: 'btn btn--ghost', text: 'صعبة', onclick: () => grade(1) }),
            el('button', { class: 'btn btn--mint', text: 'سهلة', onclick: () => grade(3) }),
          ]),
          el('button', { class: 'btn btn--primary btn--block', text: 'تذكّرتها ✓', onclick: () => grade(2) }),
        ])
      : el('div', { style: 'margin-top:var(--sp-4)' }, [
          el('button', { class: 'btn btn--primary btn--lg btn--block', text: 'أظهر الإجابة', onclick: () => { revealed = true; draw(); } }),
        ]));
  }

  draw();
}
