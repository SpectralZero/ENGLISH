/* ============================================================
   ui.js — shared building blocks used by several views
   ============================================================ */
import { el, esc, haptic } from './util.js';
import { speak, unlock } from './tts.js';
import { settings, strength } from './store.js';

export const ICON = {
  play:  '<svg viewBox="0 0 24 24" class="ico"><path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  next:  '<svg viewBox="0 0 24 24" class="ico"><path d="M9 5l7 7-7 7"/></svg>',
  check: '<svg viewBox="0 0 24 24" class="ico"><path d="M4 12.5l5 5L20 6.5"/></svg>',
  x:     '<svg viewBox="0 0 24 24" class="ico"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  star:  '<svg viewBox="0 0 24 24" class="ico"><path d="M12 3.5l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-2.9L6.7 20l1.1-6L3.4 9.9l6-.8z"/></svg>',
  fire:  '<svg viewBox="0 0 24 24" class="ico"><path d="M12 3s5 4.2 5 8.6A5 5 0 0 1 7 12c0-1.4.5-2.4 1.2-3.3.3 1.5 1.3 2.1 2 2.1 1.4 0 1.9-2.4 1.8-7.8z"/></svg>',
  bolt:  '<svg viewBox="0 0 24 24" class="ico"><path d="M13 3L5 14h6l-1 7 8-11h-6z"/></svg>',
  book:  '<svg viewBox="0 0 24 24" class="ico"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H19v3H6.5A2.5 2.5 0 0 1 4 20.5z"/></svg>',
  pen:   '<svg viewBox="0 0 24 24" class="ico"><path d="M4 20l4-1 10-10-3-3L5 16z"/><path d="M14.5 6.5l3 3"/></svg>',
  trash: '<svg viewBox="0 0 24 24" class="ico"><path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6 7l1 13h10l1-13"/></svg>',
  plus:  '<svg viewBox="0 0 24 24" class="ico"><path d="M12 5v14M5 12h14"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" class="ico"><path d="M7 18a4 4 0 0 1 .6-8 5.5 5.5 0 0 1 10.4 1.6A3.5 3.5 0 0 1 17.5 18z"/><path d="M12 15V9M9.5 11.5L12 9l2.5 2.5"/></svg>',
  ear:   '<svg viewBox="0 0 24 24" class="ico"><path d="M8 9a4 4 0 1 1 8 0c0 3-3 3.5-3 6a2 2 0 0 1-4 .3"/><path d="M9.5 19.5a2 2 0 0 0 3 .3"/></svg>',
  grid:  '<svg viewBox="0 0 24 24" class="ico"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/></svg>',
  abc:   '<svg viewBox="0 0 24 24" class="ico"><path d="M3 17l3.5-9L10 17M4.3 14h4.4"/><path d="M13 8h3a2 2 0 0 1 0 4h-3zM13 12h3.3a2.5 2.5 0 0 1 0 5H13z"/></svg>',
};

/** big speaker button */
export function speakBtn(getText, cls = 'wordrow__play') {
  const b = el('button', { class: cls, 'aria-label': 'استمع', html: ICON.play });
  b.addEventListener('click', async e => {
    e.preventDefault(); e.stopPropagation();
    unlock(); haptic(8);
    b.classList.add('is-speaking');
    await speak(typeof getText === 'function' ? getText() : getText);
    b.classList.remove('is-speaking');
  });
  return b;
}

/** one vocabulary row (list view) */
export function wordRow(w, { onClick } = {}) {
  const s = strength(w.id);
  const row = el('div', { class: 'wordrow' }, [
    el('i', { class: 'dot-state s' + s, 'aria-hidden': 'true' }),
    el('div', { class: 'wordrow__main' }, [
      el('div', { class: 'wordrow__en' }, [(w.emoji ? w.emoji + ' ' : '') + w.en]),
      settings.showTranslit && w.tr ? el('div', { class: 'wordrow__tr', text: w.tr }) : null,
      el('div', { class: 'wordrow__ar', text: w.ar }),
    ]),
    speakBtn(() => w.en),
  ]);
  if (onClick) row.addEventListener('click', () => onClick(w));
  return row;
}

/** one sentence card */
export function sentRow(s) {
  return el('div', { class: 'sent' }, [
    speakBtn(() => s.en),
    el('div', { class: 'sent__body' }, [
      el('div', { class: 'sent__en', text: s.en }),
      settings.showTranslit && s.tr ? el('div', { class: 'sent__tr', text: s.tr }) : null,
      el('div', { class: 'sent__ar', text: s.ar }),
    ]),
  ]);
}

/** circular progress ring (hero) */
export function ring(percent, top, bottom) {
  const R = 40, C = 2 * Math.PI * R;
  const off = C - (Math.min(100, percent) / 100) * C;
  return el('div', { class: 'ring' }, [
    el('div', {
      html: `<svg viewBox="0 0 92 92">
        <circle class="ring__bg" cx="46" cy="46" r="${R}"></circle>
        <circle class="ring__fg" cx="46" cy="46" r="${R}"
          stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"></circle>
      </svg>`,
    }),
    el('div', { class: 'ring__num', html: `<b>${esc(top)}</b><span>${esc(bottom)}</span>` }),
  ]);
}

export function bar(percent, cls = '') {
  return el('div', { class: 'bar ' + cls }, [el('i', { style: `width:${Math.min(100, percent)}%` })]);
}

export function emptyState(emoji, title, sub) {
  return el('div', { class: 'empty' }, [
    el('div', { class: 'empty__e', text: emoji }),
    el('div', { style: 'font-weight:800;color:var(--ink)', text: title }),
    sub ? el('div', { class: 'small', text: sub }) : null,
  ]);
}

export function sectionTitle(text, linkText, onLink) {
  return el('div', { class: 'section-title' }, [
    el('h2', { text }),
    linkText ? el('button', { class: 'link', text: linkText, onclick: onLink }) : null,
  ]);
}

/** primary card-style action used on the home screen */
export function quickCard({ icon, tone = 'brand', title, sub, href, onClick }) {
  const node = el(href ? 'a' : 'button', { class: 'qcard', href: href || null }, [
    el('div', { class: 'qcard__ico bg-' + tone, html: icon }),
    el('div', { class: 'qcard__t', text: title }),
    el('div', { class: 'qcard__s', text: sub }),
  ]);
  if (onClick) node.addEventListener('click', onClick);
  return node;
}

/** progress dots row for a session */
export function sessionHead({ percent, onExit, right }) {
  return el('div', { class: 'learn-top' }, [
    el('button', { class: 'learn-top__x btn btn--icon btn--quiet', html: ICON.x, onclick: onExit, 'aria-label': 'خروج' }),
    bar(percent),
    right || null,
  ]);
}
