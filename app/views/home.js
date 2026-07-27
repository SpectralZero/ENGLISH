/* ============================================================
   views/home.js — daily dashboard
   ============================================================ */
import { el, pct, AR_NUM } from '../util.js';
import { store, allWordIds } from '../data.js';
import { counts, goalProgress, progress, levelInfo, touchDay, dueIds } from '../store.js';
import { ring, quickCard, sectionTitle, sentRow, ICON, bar } from '../ui.js';
import { go } from '../router.js';

function greeting() {
  const h = new Date().getHours();
  if (h < 5)  return 'ليلة سعيدة';
  if (h < 12) return 'صباح الخير';
  if (h < 17) return 'مساء الخير';
  return 'مساء الخير';
}

/** first unit that still has unlearned words */
function nextUnit() {
  for (const u of store.units) {
    const c = counts(u.words.map(w => w.id));
    if (c.fresh > 0) return { unit: u, c };
  }
  return store.units.length ? { unit: store.units[0], c: counts(store.units[0].words.map(w => w.id)) } : null;
}

export default function home({ view }) {
  touchDay();

  const ids = allWordIds();
  const c = counts(ids);
  const due = dueIds(ids).length;
  const g = goalProgress();
  const lvl = levelInfo();
  const nx = nextUnit();

  const wrap = el('div', { class: 'wrap stack' });

  /* ---------- hero ---------- */
  wrap.append(el('section', { class: 'hero anim' }, [
    el('div', { class: 'hero__greet', text: greeting() + (progress.name ? '، ' + progress.name : ' 👋') }),
    el('div', { class: 'hero__title', text: g.done >= g.goal ? 'أنهيت هدف اليوم! 🎉' : 'هدف اليوم في انتظارك' }),
    el('div', { class: 'hero__row' }, [
      ring(g.pct, AR_NUM(g.done) + '/' + AR_NUM(g.goal), 'اليوم'),
      el('div', { class: 'hero__stats' }, [
        el('div', { class: 'hero__stat', html: `${ICON.fire}<b>${AR_NUM(progress.streak || 0)}</b> يوم متتالي` }),
        el('div', { class: 'hero__stat', html: `${ICON.bolt}<b>${AR_NUM(progress.totalXP || 0)}</b> نقطة` }),
        el('div', { class: 'hero__stat', html: `${ICON.star}<b>${lvl.name}</b>` }),
      ]),
    ]),
  ]));

  /* ---------- continue ---------- */
  if (nx) {
    const p = pct(nx.c.learned, nx.c.total);
    wrap.append(el('button', {
      class: 'card anim-2',
      style: 'padding:var(--sp-4);display:flex;gap:var(--sp-4);align-items:center;text-align:start;width:100%',
      onclick: () => go('/learn/' + nx.unit.id),
    }, [
      el('div', { class: 'unit__ico', text: nx.unit.icon }),
      el('div', { class: 'grow' }, [
        el('div', { class: 'small muted', text: 'أكمل من حيث توقفت' }),
        el('div', { style: 'font-weight:800', text: nx.unit.title.ar }),
        el('div', { style: 'margin-top:8px' }, [bar(p)]),
      ]),
      el('div', { class: 'unit__go', html: ICON.next }),
    ]));
  }

  /* ---------- quick actions ---------- */
  wrap.append(el('div', { class: 'qgrid anim-3' }, [
    quickCard({
      icon: ICON.book, tone: 'brand', title: 'تعلّم جديد',
      sub: `${AR_NUM(c.fresh)} كلمة جديدة`, onClick: () => go('/units'),
    }),
    quickCard({
      icon: ICON.bolt, tone: 'amber', title: 'مراجعة اليوم',
      sub: due ? `${AR_NUM(due)} كلمة جاهزة` : 'لا شيء الآن', onClick: () => go('/review'),
    }),
    quickCard({
      icon: ICON.grid, tone: 'mint', title: 'اختبار سريع',
      sub: 'اختبر نفسك', onClick: () => go('/quiz/all?mode=mix'),
    }),
    quickCard({
      icon: ICON.abc, tone: 'rose', title: 'الحروف والأصوات',
      sub: 'ابدأ من هنا', onClick: () => go('/alphabet'),
    }),
  ]));

  /* ---------- progress strip ---------- */
  wrap.append(sectionTitle('تقدّمك', 'التفاصيل', () => go('/stats')));
  wrap.append(el('div', { class: 'card', style: 'padding:var(--sp-4)' }, [
    el('div', { class: 'row row--between', style: 'margin-bottom:10px' }, [
      el('span', { class: 'small muted', text: `تعلّمت ${AR_NUM(c.learned)} من ${AR_NUM(c.total)} كلمة` }),
      el('span', { class: 'chip chip--mint', text: `متقن ${AR_NUM(c.mastered)}` }),
    ]),
    bar(pct(c.learned, c.total)),
  ]));

  /* ---------- next lessons ---------- */
  const upcoming = store.units.filter(u => counts(u.words.map(w => w.id)).fresh > 0).slice(0, 3);
  if (upcoming.length) {
    wrap.append(sectionTitle('دروس مقترحة', 'الكل', () => go('/units')));
    wrap.append(el('div', { class: 'unitgrid' }, upcoming.map(u => {
      const uc = counts(u.words.map(w => w.id));
      return el('a', { class: 'unit', href: '#/unit/' + u.id }, [
        el('div', { class: 'unit__ico', text: u.icon }),
        el('div', { class: 'unit__body' }, [
          el('div', { class: 'unit__title', text: u.title.ar }),
          el('div', { class: 'unit__sub en', text: u.title.en }),
          el('div', { class: 'unit__meta' }, [
            bar(pct(uc.learned, uc.total)),
            el('span', { text: `${AR_NUM(uc.learned)}/${AR_NUM(uc.total)}` }),
          ]),
        ]),
        el('div', { class: 'unit__go', html: ICON.next }),
      ]);
    })));
  }

  /* ---------- sentence of the day ---------- */
  if (store.sentences.length) {
    const seed = Number(new Date().toISOString().slice(0, 10).replace(/-/g, ''));
    const s = store.sentences[seed % store.sentences.length];
    wrap.append(sectionTitle('جملة اليوم'));
    wrap.append(sentRow(s));
  }

  view.append(wrap);
}
