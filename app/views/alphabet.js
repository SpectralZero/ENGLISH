/* ============================================================
   views/alphabet.js — day-zero course: the 26 letters + sounds
   ============================================================ */
import { el, AR_NUM, sheet, shuffle, sample, haptic, pct } from '../util.js';
import { store } from '../data.js';
import { addXP } from '../store.js';
import { speakBtn, sectionTitle, emptyState, ICON } from '../ui.js';
import { speak, unlock } from '../tts.js';
import { back } from '../router.js';

export default function alphabet({ view }) {
  const data = store.alphabet || { letters: [], groups: [] };
  const wrap = el('div', { class: 'wrap stack' });

  wrap.append(el('section', { class: 'hero anim' }, [
    el('div', { class: 'hero__greet', text: 'الخطوة صفر' }),
    el('div', { class: 'hero__title', text: 'الحروف الإنجليزية وأصواتها' }),
    el('p', { style: 'margin-top:8px;font-size:.92rem;opacity:.92' },
      ['٢٦ حرفاً. اضغط على أي حرف لتسمع اسمه وصوته ومثالاً عليه.']),
  ]));

  wrap.append(el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-3)' }, [
    el('button', { class: 'btn btn--primary', text: '🔊 استمع للحروف كلها', onclick: playAll }),
    el('button', { class: 'btn btn--ghost', text: '🎯 اختبار الحروف', onclick: letterQuiz }),
  ]));

  wrap.append(sectionTitle('الحروف الكبيرة والصغيرة'));
  const grid = el('div', { class: 'abc-grid' });
  data.letters.forEach(L => {
    const b = el('button', { class: 'abc' }, [
      el('div', { class: 'abc__l', text: `${L.u} ${L.l}` }),
      el('div', { class: 'abc__n', text: L.name }),
      el('div', { class: 'abc__s', text: L.sound }),
    ]);
    b.addEventListener('click', () => letterSheet(L));
    grid.append(b);
  });
  wrap.append(grid);

  /* phonics groups (sh, ch, th …) */
  if (data.groups?.length) {
    wrap.append(sectionTitle('أصوات مركّبة مهمة'));
    wrap.append(el('div', { class: 'stack stack--sm' }, data.groups.map(g =>
      el('div', { class: 'wordrow' }, [
        el('div', { class: 'wordrow__main' }, [
          el('div', { class: 'wordrow__en', text: g.g }),
          el('div', { class: 'wordrow__tr', text: g.sound }),
          el('div', { class: 'wordrow__ar', text: g.ex.map(e => `${e.en} = ${e.ar}`).join(' · ') }),
        ]),
        speakBtn(() => g.ex.map(e => e.en).join(', ')),
      ])
    )));
  }

  if (!data.letters.length) wrap.append(emptyState('🔤', 'لم يتم تحميل الحروف'));
  view.append(wrap);

  /* ---------------- helpers ---------------- */
  async function playAll() {
    unlock();
    for (const L of data.letters) await speak(L.u + '.', { rate: 0.7 });
  }

  function letterSheet(L) {
    unlock();
    speak(`${L.u}. ${L.word.en}`, { rate: 0.7 });
    sheet('', el('div', { class: 'stack center' }, [
      el('div', { class: 'fcard__en', style: 'font-size:4rem', text: `${L.u} ${L.l}` }),
      el('div', { class: 'fcard__tr', style: 'justify-self:center', text: L.name }),
      el('div', { class: 'muted', text: 'الصوت: ' + L.sound }),
      el('div', { style: 'display:flex;justify-content:center;gap:10px' }, [
        speakBtn(() => L.u + '.', 'fcard__speak'),
      ]),
      el('div', { class: 'fcard__ex' }, [
        el('div', { style: 'font-size:2.4rem;text-align:center', text: L.word.emoji || '' }),
        el('div', { class: 'en', style: 'text-align:center;font-size:1.3rem', text: L.word.en }),
        el('div', { class: 'wordrow__tr', style: 'text-align:center', text: L.word.tr }),
        el('div', { class: 'ar', style: 'text-align:center', text: L.word.ar }),
        el('div', { style: 'display:flex;justify-content:center;margin-top:8px' },
          [speakBtn(() => L.word.en)]),
      ]),
    ]));
  }

  /* simple listen-and-pick letter quiz */
  function letterQuiz() {
    unlock();
    const qs = sample(data.letters, Math.min(10, data.letters.length));
    let i = 0, right = 0;
    const box = el('div', { class: 'stack' });
    const s = sheet('اختبار الحروف', box);
    draw();

    function draw() {
      if (i >= qs.length) {
        addXP(right * 4, 'review');
        box.innerHTML = '';
        box.append(el('div', { class: 'result' }, [
          el('div', { class: 'result__emoji', text: right >= qs.length - 1 ? '🏆' : '👏' }),
          el('div', { class: 'result__score', text: AR_NUM(pct(right, qs.length)) + '%' }),
          el('button', { class: 'btn btn--primary btn--block', text: 'تم', onclick: () => s.close() }),
        ]));
        return;
      }
      const L = qs[i];
      const opts = shuffle([L, ...sample(data.letters.filter(x => x.u !== L.u), 3)]);
      box.innerHTML = '';
      box.append(
        el('div', { class: 'center muted small', text: `${AR_NUM(i + 1)} / ${AR_NUM(qs.length)}` }),
        el('div', { class: 'center', style: 'margin:var(--sp-3) 0' }, [
          el('button', { class: 'fcard__speak', style: 'margin:0 auto;width:80px;height:80px', html: ICON.play,
            onclick: () => speak(L.u + '.', { rate: 0.6 }) }),
        ]),
        el('div', { class: 'center small muted', text: 'أي حرف سمعت؟' }),
        el('div', { class: 'opts', style: 'grid-template-columns:1fr 1fr;display:grid' },
          opts.map(o => {
            const b = el('button', { class: 'opt', style: 'justify-content:center' },
              [el('span', { class: 'en', style: 'font-size:1.6rem;font-weight:800', text: `${o.u} ${o.l}` })]);
            b.addEventListener('click', () => {
              const ok = o.u === L.u;
              b.classList.add(ok ? 'is-right' : 'is-wrong');
              if (ok) right++;
              haptic(ok ? 10 : [8, 40, 8]);
              speak(L.u + '.', { rate: 0.6 });
              setTimeout(() => { i++; draw(); }, 750);
            });
            return b;
          })),
      );
      speak(L.u + '.', { rate: 0.6 });
    }
  }
}
