/* ============================================================
   views/units.js — lesson index + single lesson detail
   ============================================================ */
import { el, pct, AR_NUM, toast } from '../util.js';
import { store, unitsByLevel, levelName } from '../data.js';
import { counts, markUnitOpened, settings } from '../store.js';
import { bar, ICON, wordRow, sentRow, sectionTitle, emptyState, speakBtn } from '../ui.js';
import { go } from '../router.js';
import { speak } from '../tts.js';

/* ------------------------------------------------ list of all lessons */
export function unitsView({ view }) {
  const wrap = el('div', { class: 'wrap' });

  wrap.append(el('p', { class: 'muted small', style: 'margin:0 2px var(--sp-2)' },
    ['ابدأ من الأعلى وانزل بالترتيب. كل درس يحتوي كلمات + جمل + اختبار.']));

  for (const [level, units] of unitsByLevel()) {
    wrap.append(el('div', { class: 'level-head' }, [
      el('b', { text: levelName(level) }),
      el('span'),
      el('span', { class: 'chip', text: `${AR_NUM(units.length)} دروس` }),
    ]));

    wrap.append(el('div', { class: 'unitgrid' }, units.map(u => {
      const c = counts(u.words.map(w => w.id));
      const done = c.total > 0 && c.learned === c.total;
      return el('a', { class: 'unit anim' + (done ? ' is-done' : ''), href: '#/unit/' + u.id }, [
        el('div', { class: 'unit__ico', text: u.icon }),
        el('div', { class: 'unit__body' }, [
          el('div', { class: 'unit__title', text: u.title.ar }),
          el('div', { class: 'unit__sub en', text: u.title.en }),
          el('div', { class: 'unit__meta' }, [
            bar(pct(c.learned, c.total), done ? 'bar--mint' : ''),
            el('span', { text: `${AR_NUM(c.learned)}/${AR_NUM(c.total)}` }),
          ]),
        ]),
        el('div', { class: 'unit__go', html: done ? ICON.check : ICON.next }),
      ]);
    })));
  }

  view.append(wrap);
}

/* ------------------------------------------------ one lesson */
export function unitView({ params, view, setTitle }) {
  const u = store.unitById.get(params.id);
  if (!u) { view.append(emptyState('🤔', 'هذا الدرس غير موجود')); return; }
  markUnitOpened(u.id);
  setTitle(u.title.ar);

  const c = counts(u.words.map(w => w.id));
  const wrap = el('div', { class: 'wrap stack' });

  /* header */
  wrap.append(el('section', { class: 'card anim', style: 'padding:var(--sp-5)' }, [
    el('div', { class: 'row', style: 'gap:var(--sp-4)' }, [
      el('div', { class: 'unit__ico', style: 'width:60px;height:60px;font-size:2rem', text: u.icon }),
      el('div', { class: 'grow' }, [
        el('h1', { style: 'font-size:1.3rem;font-weight:800', text: u.title.ar }),
        el('div', { class: 'muted en', text: u.title.en }),
      ]),
    ]),
    el('div', { style: 'margin:var(--sp-4) 0 6px' }, [bar(pct(c.learned, c.total))]),
    el('div', { class: 'row row--between small muted' }, [
      el('span', { text: `${AR_NUM(c.total)} كلمة · ${AR_NUM(u.sentences.length)} جملة` }),
      el('span', { text: `تعلّمت ${AR_NUM(c.learned)} · متقن ${AR_NUM(c.mastered)}` }),
    ]),
  ]));

  /* actions */
  wrap.append(el('div', { class: 'stack stack--sm anim-2' }, [
    el('button', {
      class: 'btn btn--primary btn--lg btn--block',
      onclick: () => go('/learn/' + u.id),
      html: ICON.book + '<span>' + (c.fresh ? 'تعلّم الكلمات' : 'راجع الكلمات') + '</span>',
    }),
    el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-2)' }, [
      el('button', { class: 'btn btn--ghost', onclick: () => go(`/quiz/${u.id}?mode=mix`), text: 'اختبار شامل' }),
      el('button', { class: 'btn btn--ghost', onclick: () => go(`/quiz/${u.id}?mode=spell`), text: 'اختبار كتابة' }),
    ]),
    el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-2)' }, [
      el('button', { class: 'btn btn--ghost', onclick: () => go(`/quiz/${u.id}?mode=mcq`), text: 'اختيار من متعدد' }),
      el('button', { class: 'btn btn--ghost', onclick: () => go(`/quiz/${u.id}?mode=listen`), text: 'اختبار استماع' }),
    ]),
  ]));

  /* words */
  wrap.append(sectionTitle(`الكلمات (${AR_NUM(u.words.length)})`, 'استمع للكل', async () => {
    toast('جارٍ تشغيل الكلمات…');
    for (const w of u.words) await speak(w.en);
  }));
  wrap.append(el('div', { class: 'wordlist' },
    u.words.map(w => wordRow(w, { onClick: showWordSheet }))));

  /* sentences */
  if (u.sentences.length) {
    wrap.append(sectionTitle(`جمل الدرس (${AR_NUM(u.sentences.length)})`));
    wrap.append(el('div', { class: 'stack stack--sm' }, u.sentences.map(sentRow)));
  }

  view.append(wrap);
}

/* ------------------------------------------------ word detail sheet */
export async function showWordSheet(w) {
  const { sheet } = await import('../util.js');
  const body = el('div', { class: 'stack center' }, [
    w.emoji ? el('div', { style: 'font-size:3rem', text: w.emoji }) : null,
    el('div', { class: 'fcard__en', text: w.en }),
    w.tr ? el('div', { class: 'fcard__tr', style: 'justify-self:center', text: w.tr }) : null,
    el('div', { class: 'fcard__ar', text: w.ar }),
    w.pos ? el('div', { class: 'fcard__pos', text: posAr(w.pos) }) : null,
    el('div', { style: 'display:flex;justify-content:center' }, [speakBtn(() => w.en, 'fcard__speak')]),
    w.ex?.en ? el('div', { class: 'fcard__ex' }, [
      el('div', { class: 'en', text: w.ex.en }),
      w.ex.tr && settings.showTranslit ? el('div', { class: 'wordrow__tr', text: w.ex.tr }) : null,
      el('div', { class: 'ar', text: w.ex.ar }),
      el('div', { style: 'display:flex;justify-content:center;margin-top:8px' },
        [speakBtn(() => w.ex.en, 'wordrow__play')]),
    ]) : null,
  ]);
  sheet('', body);
}

export function posAr(p) {
  return ({
    n: 'اسم', v: 'فعل', adj: 'صفة', adv: 'ظرف', prep: 'حرف جر',
    pron: 'ضمير', num: 'عدد', interj: 'تعبير', phr: 'عبارة', q: 'أداة سؤال', conj: 'أداة ربط',
  })[p] || p;
}
