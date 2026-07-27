/* ============================================================
   views/home.js — daily dashboard + adaptive plan
   ============================================================ */
import { el, pct, AR_NUM } from '../util.js';
import { store, allWordIds, allSentenceIds, allItemIds } from '../data.js';
import {
  counts, goalProgress, progress, levelInfo, touchDay, dueIds, weakest, settings,
} from '../store.js';
import { ring, quickCard, sectionTitle, sentRow, ICON, bar, wordRow } from '../ui.js';
import { go } from '../router.js';
import { dailySet } from './sentences.js';
import { showWordSheet } from './units.js';

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

/** What this learner should do today, in order of value. */
function buildPlan() {
  const dueAll = dueIds(allItemIds()).length;
  const dueSent = dueIds(allSentenceIds()).length;
  const weak = weakest(allWordIds(), 12);
  const nx = nextUnit();
  const sentToday = dailySet().length;

  const plan = [];
  if (dueAll) plan.push({
    icon: ICON.bolt, tone: 'amber', title: 'راجع ما استحق',
    sub: `${AR_NUM(dueAll)} عنصر جاهز`, go: '/review', weight: 3,
  });
  if (weak.length >= 4) plan.push({
    icon: ICON.star, tone: 'rose', title: 'درّب كلماتك الصعبة',
    sub: `${AR_NUM(weak.length)} كلمة تتعثر فيها`, go: '/quiz/weak?mode=mix', weight: 2,
  });
  if (sentToday) plan.push({
    icon: ICON.book, tone: 'mint', title: 'جمل اليوم',
    sub: `${AR_NUM(sentToday)} جملة`, go: '/sentence-study', weight: 2,
  });
  if (nx && nx.c.fresh) plan.push({
    icon: ICON.plus, tone: 'brand', title: 'تعلّم كلمات جديدة',
    sub: nx.unit.title.ar, go: '/learn/' + nx.unit.id, weight: 1,
  });
  if (!plan.length) plan.push({
    icon: ICON.check, tone: 'mint', title: 'أنهيت كل شيء اليوم',
    sub: 'اختبر نفسك للتثبيت', go: '/quiz/all?mode=mix', weight: 0,
  });
  return { plan, dueAll, dueSent, weak };
}

export default function home({ view }) {
  touchDay();

  const wordIds = allWordIds();
  const c = counts(wordIds);
  const cs = counts(allSentenceIds());
  const g = goalProgress();
  const lvl = levelInfo();
  const { plan, weak } = buildPlan();

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

  /* ---------- today's plan ---------- */
  wrap.append(sectionTitle('خطة اليوم'));
  wrap.append(el('div', { class: 'stack stack--sm anim-2' }, plan.map((p, i) => el('button', {
    class: 'card',
    style: 'padding:var(--sp-4);display:flex;gap:var(--sp-4);align-items:center;text-align:start;width:100%',
    onclick: () => go(p.go),
  }, [
    el('div', { class: 'qcard__ico bg-' + p.tone, html: p.icon, style: 'margin:0' }),
    el('div', { class: 'grow' }, [
      el('div', { style: 'font-weight:800', text: p.title }),
      el('div', { class: 'small muted', text: p.sub }),
    ]),
    i === 0 ? el('span', { class: 'chip chip--brand', text: 'ابدأ' }) : el('div', { class: 'unit__go', html: ICON.next }),
  ]))));

  /* ---------- quick actions ---------- */
  wrap.append(el('div', { class: 'qgrid anim-3', style: 'margin-top:var(--sp-4)' }, [
    quickCard({ icon: ICON.grid, tone: 'brand', title: 'اختبار سريع', sub: 'كل المستويات', onClick: () => go('/quiz/all?mode=mix') }),
    quickCard({ icon: ICON.book, tone: 'mint', title: 'الجمل اليومية', sub: `${AR_NUM(cs.total)} جملة`, onClick: () => go('/sentences') }),
    quickCard({ icon: ICON.abc, tone: 'rose', title: 'الحروف والأصوات', sub: 'ابدأ من هنا', onClick: () => go('/alphabet') }),
    quickCard({ icon: ICON.pen, tone: 'amber', title: 'اختبار كتابة', sub: 'تهجئة الكلمات', onClick: () => go('/quiz/all?mode=spell') }),
  ]));

  /* ---------- progress strip ---------- */
  wrap.append(sectionTitle('تقدّمك', 'التفاصيل', () => go('/stats')));
  wrap.append(el('div', { class: 'card stack stack--sm', style: 'padding:var(--sp-4)' }, [
    el('div', { class: 'row row--between' }, [
      el('span', { class: 'small muted', text: `كلمات: ${AR_NUM(c.learned)} / ${AR_NUM(c.total)}` }),
      el('span', { class: 'chip chip--mint', text: `متقن ${AR_NUM(c.mastered)}` }),
    ]),
    bar(pct(c.learned, c.total)),
    el('div', { class: 'row row--between', style: 'margin-top:6px' }, [
      el('span', { class: 'small muted', text: `جمل: ${AR_NUM(cs.learned)} / ${AR_NUM(cs.total)}` }),
      el('span', { class: 'chip chip--mint', text: `متقن ${AR_NUM(cs.mastered)}` }),
    ]),
    bar(pct(cs.learned, cs.total), 'bar--mint'),
  ]));

  /* ---------- words that keep slipping ---------- */
  if (weak.length) {
    wrap.append(sectionTitle('كلمات تتعثر فيها', 'درّبها', () => go('/quiz/weak?mode=mix')));
    wrap.append(el('div', { class: 'wordlist' },
      weak.slice(0, 4).map(id => store.wordById.get(id)).filter(Boolean)
        .map(w => wordRow(w, { onClick: showWordSheet }))));
  }

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
    wrap.append(sectionTitle('جملة اليوم', 'كل الجمل', () => go('/sentences')));
    wrap.append(sentRow(s));
  }

  view.append(wrap);
}
