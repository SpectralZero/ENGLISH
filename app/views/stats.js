/* ============================================================
   views/stats.js — progress, skills, weak spots, lesson mastery
   ============================================================ */
import { el, AR_NUM, pct } from '../util.js';
import { store, allWordIds, allSentenceIds } from '../data.js';
import {
  counts, progress, levelInfo, lastDays, weakest, skillStats, isLeech, difficulty,
} from '../store.js';
import { bar, sectionTitle, ICON, wordRow, emptyState } from '../ui.js';
import { go } from '../router.js';
import { showWordSheet } from './units.js';

const SKILL_LABEL = {
  rec: ['التعرّف على المعنى', '🧠'],
  lis: ['الاستماع', '👂'],
  spl: ['الكتابة والتهجئة', '✍️'],
  snt: ['الجمل', '💬'],
};

export default function stats({ view }) {
  const wordIds = allWordIds();
  const sentIds = allSentenceIds();
  const c = counts(wordIds);
  const cs = counts(sentIds);
  const lvl = levelInfo();
  const days = lastDays(28);
  const maxXP = Math.max(20, ...days.map(d => d.xp));
  const activeDays = days.filter(d => d.xp > 0).length;
  const skills = skillStats([...wordIds, ...sentIds]);
  const weak = weakest(wordIds, 12);
  const leeches = wordIds.filter(isLeech);

  const wrap = el('div', { class: 'wrap stack' });

  /* level */
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
    statBox(AR_NUM(cs.learned), 'جملة تعلمتها'),
    statBox(AR_NUM(progress.streak || 0), 'أيام متتالية'),
    statBox(AR_NUM(progress.totalXP || 0), 'مجموع النقاط'),
  ]));

  /* ---------- skills ---------- */
  const anySkill = Object.values(skills).some(s => s[1] > 0);
  wrap.append(sectionTitle('مهاراتك'));
  wrap.append(el('div', { class: 'card stack', style: 'padding:var(--sp-4)' },
    anySkill
      ? Object.entries(skills).filter(([, s]) => s[1] > 0).map(([k, s]) => {
          const p = pct(s[0], s[1]);
          return el('div', { class: 'stack stack--sm' }, [
            el('div', { class: 'row row--between small' }, [
              el('span', { style: 'font-weight:700', text: `${SKILL_LABEL[k][1]} ${SKILL_LABEL[k][0]}` }),
              el('span', { class: 'muted', text: `${AR_NUM(p)}% · ${AR_NUM(s[1])} محاولة` }),
            ]),
            bar(p, p >= 80 ? 'bar--mint' : ''),
          ]);
        })
      : [el('p', { class: 'muted small', text: 'ابدأ الاختبارات وستظهر هنا نقاط قوتك وضعفك في كل مهارة.' })]
  ));
  if (anySkill) {
    const worst = Object.entries(skills).filter(([, s]) => s[1] >= 5)
      .sort((a, b) => pct(a[1][0], a[1][1]) - pct(b[1][0], b[1][1]))[0];
    if (worst) {
      const target = { rec: 'mcq', lis: 'listen', spl: 'spell', snt: 'sentences' }[worst[0]];
      wrap.append(el('button', {
        class: 'btn btn--ghost btn--block',
        text: `درّب أضعف مهارة: ${SKILL_LABEL[worst[0]][0]}`,
        onclick: () => go(`/quiz/all?mode=${target}`),
      }));
    }
  }

  /* ---------- weak words ---------- */
  wrap.append(sectionTitle('كلمات تحتاج جهداً أكبر', weak.length ? 'درّبها' : '', () => go('/quiz/weak?mode=mix')));
  wrap.append(weak.length
    ? el('div', { class: 'wordlist' }, weak.map(id => {
        const w = store.wordById.get(id);
        if (!w) return null;
        const row = wordRow(w, { onClick: showWordSheet });
        row.insertBefore(el('span', {
          class: 'chip ' + (isLeech(id) ? 'chip--rose' : 'chip--amber'),
          text: isLeech(id) ? 'صعبة جداً' : `${AR_NUM(Math.round(difficulty(id) * 100))}%`,
        }), row.lastChild);
        return row;
      }).filter(Boolean))
    : el('div', { class: 'card', style: 'padding:var(--sp-5)' },
        [emptyState('👌', 'لا توجد كلمات متعثرة', 'أخطاؤك قليلة — استمر!')]));

  if (leeches.length) {
    wrap.append(el('p', { class: 'small muted' }, [
      `${AR_NUM(leeches.length)} كلمة تنساها كثيراً. جرّب ربطها بجملة أو صورة ذهنية، وستراها في التدريب أولاً.`,
    ]));
  }

  /* ---------- activity ---------- */
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

  /* ---------- lessons ---------- */
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
