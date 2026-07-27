/* ============================================================
   views/stats.js — progress, streak calendar, per-lesson mastery
   ============================================================ */
import { el, AR_NUM, pct } from '../util.js';
import { store, allWordIds } from '../data.js';
import { counts, progress, levelInfo, lastDays, settings } from '../store.js';
import { bar, sectionTitle, ICON } from '../ui.js';
import { go } from '../router.js';

export default function stats({ view }) {
  const ids = allWordIds();
  const c = counts(ids);
  const lvl = levelInfo();
  const days = lastDays(28);
  const maxXP = Math.max(20, ...days.map(d => d.xp));
  const activeDays = days.filter(d => d.xp > 0).length;

  const wrap = el('div', { class: 'wrap stack' });

  wrap.append(el('section', { class: 'hero anim' }, [
    el('div', { class: 'hero__greet', text: 'مستواك الحالي' }),
    el('div', { class: 'hero__title', text: lvl.name }),
    el('div', { style: 'margin:var(--sp-4) 0 6px;background:rgba(255,255,255,.25);height:9px;border-radius:99px;overflow:hidden' },
      [el('i', { style: `display:block;height:100%;width:${lvl.pct}%;background:#fff;border-radius:99px` })]),
    el('div', { class: 'small', style: 'opacity:.9' },
      [lvl.toNext ? `${AR_NUM(lvl.toNext)} نقطة للمستوى التالي` : 'أعلى مستوى 🏆']),
  ]));

  wrap.append(el('div', { class: 'statgrid' }, [
    statBox(AR_NUM(c.learned), 'كلمة تعلمتها'),
    statBox(AR_NUM(c.mastered), 'كلمة متقنة'),
    statBox(AR_NUM(progress.streak || 0), 'أيام متتالية'),
    statBox(AR_NUM(progress.totalXP || 0), 'مجموع النقاط'),
  ]));

  wrap.append(sectionTitle('نشاطك آخر ٤ أسابيع'));
  wrap.append(el('div', { class: 'card', style: 'padding:var(--sp-4)' }, [
    el('div', { class: 'heat' }, days.map(d => {
      const lv = d.xp === 0 ? 0 : d.xp < maxXP * .25 ? 1 : d.xp < maxXP * .5 ? 2 : d.xp < maxXP * .8 ? 3 : 4;
      return el('i', { class: lv ? 'h' + lv : '', title: `${d.key} — ${d.xp} نقطة` });
    })),
    el('div', { class: 'row row--between small muted', style: 'margin-top:10px' }, [
      el('span', { text: `${AR_NUM(activeDays)} يوم نشط` }),
      el('span', { text: `أطول سلسلة: ${AR_NUM(progress.bestStreak || 0)}` }),
    ]),
  ]));

  wrap.append(sectionTitle('إتقان الدروس'));
  wrap.append(el('div', { class: 'stack stack--sm' }, store.units.map(u => {
    const uc = counts(u.words.map(w => w.id));
    return el('a', { class: 'wordrow', href: '#/unit/' + u.id }, [
      el('span', { style: 'font-size:1.3rem', text: u.icon }),
      el('div', { class: 'wordrow__main' }, [
        el('div', { style: 'font-weight:700', text: u.title.ar }),
        el('div', { style: 'margin-top:6px' }, [bar(pct(uc.learned, uc.total), uc.learned === uc.total ? 'bar--mint' : '')]),
      ]),
      el('span', { class: 'small muted nowrap', text: `${AR_NUM(uc.learned)}/${AR_NUM(uc.total)}` }),
    ]);
  })));

  view.append(wrap);
}

function statBox(value, label) {
  return el('div', { class: 'statbox' }, [el('b', { text: value }), el('span', { text: label })]);
}
