/* ============================================================
   views/learn.js — flashcard session (teach, then rate)
   ============================================================ */
import { el, AR_NUM, haptic, sample, shuffle } from '../util.js';
import { store } from '../data.js';
import { review, addXP, isNew, settings, dueIds } from '../store.js';
import { speakBtn, sessionHead, ICON, emptyState } from '../ui.js';
import { speak, unlock } from '../tts.js';
import { go, back } from '../router.js';
import { posAr } from './units.js';

const SESSION = 10;   // cards per session

function buildQueue(unitId) {
  const pool = unitId === 'all' ? store.words : (store.unitById.get(unitId)?.words || []);
  const fresh = pool.filter(w => isNew(w.id));
  const due   = new Set(dueIds(pool.map(w => w.id)));
  const rev   = pool.filter(w => due.has(w.id));
  const queue = [...fresh.slice(0, SESSION), ...rev.slice(0, Math.max(0, SESSION - fresh.length))];
  return queue.length ? queue : sample(pool, Math.min(SESSION, pool.length));
}

export default function learn({ params, view }) {
  const unitId = params.id;
  const unit = store.unitById.get(unitId);
  const queue = buildQueue(unitId);

  if (!queue.length) {
    view.append(el('div', { class: 'wrap' }, [emptyState('📭', 'لا توجد كلمات في هذا الدرس')]));
    return;
  }

  let i = 0, revealed = false, learnedCount = 0;
  const wrap = el('div', { class: 'wrap' });
  view.append(wrap);

  function exit() { back(); }

  function finish() {
    wrap.innerHTML = '';
    wrap.append(el('div', { class: 'result' }, [
      el('div', { class: 'result__emoji', text: '🎉' }),
      el('h2', { style: 'font-size:1.4rem;font-weight:800', text: 'أحسنت! أنهيت الجلسة' }),
      el('p', { class: 'muted', text: `تعلّمت ${AR_NUM(learnedCount)} كلمة الآن` }),
      el('div', { class: 'result__grid' }, [
        el('div', { class: 'mini', html: `<b>${AR_NUM(queue.length)}</b><span>بطاقة</span>` }),
        el('div', { class: 'mini', html: `<b>${AR_NUM(learnedCount)}</b><span>أعرفها</span>` }),
        el('div', { class: 'mini', html: `<b>+${AR_NUM(learnedCount * 5)}</b><span>نقطة</span>` }),
      ]),
      el('div', { class: 'stack', style: 'width:100%;margin-top:var(--sp-5)' }, [
        el('button', {
          class: 'btn btn--primary btn--lg btn--block', text: 'اختبر نفسك الآن',
          onclick: () => go(`/quiz/${unitId}?mode=mix`),
        }),
        el('button', { class: 'btn btn--ghost btn--block', text: 'متابعة', onclick: () => go('/units') }),
      ]),
    ]));
  }

  function rate(grade) {
    const w = queue[i];
    review(w.id, grade);
    if (grade > 0) { learnedCount++; addXP(5, 'learn'); } else { addXP(1, 'learn'); }
    haptic(grade > 0 ? 10 : [8, 40, 8]);
    if (grade === 0) queue.push(w);            // show it again at the end
    i++;
    revealed = false;
    if (i >= queue.length) finish(); else draw();
  }

  function draw() {
    const w = queue[i];
    wrap.innerHTML = '';
    wrap.append(sessionHead({
      percent: (i / queue.length) * 100,
      onExit: exit,
      right: el('span', { class: 'chip', text: `${AR_NUM(i + 1)}/${AR_NUM(queue.length)}` }),
    }));

    const card = el('div', { class: 'fcard' }, [
      w.emoji ? el('div', { class: 'fcard__emoji', text: w.emoji }) : null,
      el('div', { class: 'fcard__en', text: w.en }),
      speakBtn(() => w.en, 'fcard__speak'),
      revealed ? null : el('div', { class: 'reveal-hint', text: 'اضغط على البطاقة لرؤية المعنى 👆' }),
    ]);

    if (revealed) {
      if (settings.showTranslit && w.tr) card.append(el('div', { class: 'fcard__tr', text: w.tr }));
      card.append(el('div', { class: 'fcard__ar', text: w.ar }));
      if (w.pos) card.append(el('div', { class: 'fcard__pos', text: posAr(w.pos) }));
      if (w.ex?.en) {
        card.append(el('div', { class: 'fcard__ex' }, [
          el('div', { class: 'en', text: w.ex.en }),
          settings.showTranslit && w.ex.tr ? el('div', { class: 'wordrow__tr', text: w.ex.tr }) : null,
          el('div', { class: 'ar', text: w.ex.ar }),
          el('div', { style: 'display:flex;justify-content:center;margin-top:6px' },
            [speakBtn(() => w.ex.en, 'wordrow__play')]),
        ]));
      }
    }

    card.addEventListener('click', () => {
      if (revealed) return;
      revealed = true; haptic(6); draw();
    });
    wrap.append(card);

    wrap.append(revealed
      ? el('div', { class: 'learn-actions' }, [
          el('button', { class: 'btn btn--lg btn--ghost', text: 'لم أعرفها', onclick: () => rate(0) }),
          el('button', { class: 'btn btn--lg btn--mint', text: 'أعرفها ✓', onclick: () => rate(2) }),
        ])
      : el('div', { style: 'margin-top:var(--sp-4)' }, [
          el('button', { class: 'btn btn--primary btn--lg btn--block', text: 'أظهر المعنى', onclick: () => { revealed = true; draw(); } }),
        ]));

    if (settings.autoSpeak) { unlock(); speak(w.en); }
  }

  draw();
}
