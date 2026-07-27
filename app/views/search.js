/* ============================================================
   views/search.js — search every word and sentence
   ============================================================ */
import { el, debounce, AR_NUM } from '../util.js';
import { search } from '../data.js';
import { wordRow, sentRow, emptyState, sectionTitle, ICON } from '../ui.js';
import { showWordSheet } from './units.js';

export default function searchView({ view, query }) {
  const wrap = el('div', { class: 'wrap stack' });

  const input = el('input', {
    type: 'search', placeholder: 'ابحث بالعربية أو الإنجليزية…',
    value: query.q || '', 'aria-label': 'بحث',
  });
  wrap.append(el('div', { class: 'searchbar' }, [
    el('span', { html: '<svg viewBox="0 0 24 24" class="ico"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.2-3.2"/></svg>' }),
    input,
  ]));

  const results = el('div', { class: 'stack' });
  wrap.append(results);
  view.append(wrap);

  const run = () => {
    const q = input.value.trim();
    results.innerHTML = '';
    if (!q) {
      results.append(emptyState('🔎', 'ابحث عن أي كلمة', 'اكتب كلمة بالعربية أو الإنجليزية'));
      return;
    }
    const r = search(q);
    if (!r.words.length && !r.sentences.length) {
      results.append(emptyState('🤷', 'لا توجد نتائج', 'جرّب كلمة أخرى'));
      return;
    }
    if (r.words.length) {
      results.append(sectionTitle(`كلمات (${AR_NUM(r.words.length)})`));
      results.append(el('div', { class: 'wordlist' }, r.words.map(w => wordRow(w, { onClick: showWordSheet }))));
    }
    if (r.sentences.length) {
      results.append(sectionTitle(`جمل (${AR_NUM(r.sentences.length)})`));
      results.append(el('div', { class: 'stack stack--sm' }, r.sentences.map(sentRow)));
    }
  };

  input.addEventListener('input', debounce(run, 180));
  run();
  setTimeout(() => input.focus(), 150);
}
