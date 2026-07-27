/* ============================================================
   admin/admin.js — hidden content console
   ------------------------------------------------------------
   Reached at #/console (or by tapping the version line 7×).
   Edits are kept as a local draft, previewable inside the app,
   then published to GitHub as real JSON commits.
   ============================================================ */
import {
  $, el, esc, toast, uid, slug, sheet, confirmSheet,
  downloadFile, readFile, AR_NUM, load, save,
} from '../util.js';
import {
  store, upsertUnit, removeUnit, updateIndex, buildIndexFromStore,
  draftFiles, hasDraft, clearDraft, reindex, getDraft,
} from '../data.js';
import { ICON } from '../ui.js';
import { translit } from './translit.js';
import * as gh from './github.js';
import { ADMIN, APP_VERSION } from '../config.js';
import { go } from '../router.js';

const K_PASS = 'khutwa.adminpass.v1';
const SESSION_KEY = 'khutwa.admin.session';

/* ============================================================ gate */
async function sha256(text) {
  if (!crypto?.subtle) return null;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function currentHash() { return load(K_PASS, null) || ADMIN.passHash; }

function gate(view) {
  return new Promise(resolve => {
    if (!ADMIN.alwaysAsk && sessionStorage.getItem(SESSION_KEY) === '1') return resolve(true);

    const input = el('input', { class: 'input', type: 'password', placeholder: 'كلمة المرور', autocomplete: 'off' });
    const msg = el('div', { class: 'small', style: 'color:var(--rose);min-height:20px' });

    const submit = async () => {
      const h = await sha256(input.value);
      if (h == null) { toast('المتصفح لا يدعم التحقق هنا', 'err'); }
      if (h === currentHash() || h == null) {
        sessionStorage.setItem(SESSION_KEY, '1');
        view.innerHTML = '';
        resolve(true);
      } else {
        msg.textContent = 'كلمة المرور غير صحيحة';
        input.value = '';
        input.focus();
      }
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });

    view.innerHTML = '';
    view.append(el('div', { class: 'wrap stack', style: 'padding-top:12vh;max-width:380px' }, [
      el('div', { class: 'center', style: 'font-size:3rem', text: '🔐' }),
      el('h1', { class: 'center', style: 'font-weight:800', text: 'لوحة التحكم' }),
      el('p', { class: 'center muted small', text: 'هذه الصفحة للمشرف فقط' }),
      input, msg,
      el('button', { class: 'btn btn--primary btn--block btn--lg', text: 'دخول', onclick: submit }),
      el('button', { class: 'btn btn--quiet btn--block', text: 'رجوع للتطبيق', onclick: () => go('/') }),
    ]));
    setTimeout(() => input.focus(), 120);
  });
}

/* ============================================================ entry */
export default async function admin({ view, setTitle }) {
  setTitle('لوحة التحكم');
  if (!(await gate(view))) return;
  renderConsole(view);
}

/* ============================================================ shell */
const TABS = [
  { id: 'content', label: '📚 المحتوى' },
  { id: 'quick',   label: '⚡ إضافة سريعة' },
  { id: 'import',  label: '📥 استيراد' },
  { id: 'publish', label: '☁️ النشر' },
  { id: 'tools',   label: '🛠️ أدوات' },
];
let activeTab = 'content';

function renderConsole(view) {
  view.innerHTML = '';
  const wrap = el('div', { class: 'wrap stack' });
  view.append(wrap);

  wrap.append(el('div', { class: 'row row--between' }, [
    el('div', {}, [
      el('div', { style: 'font-weight:800;font-size:1.15rem', text: 'لوحة التحكم' }),
      el('div', { class: 'small muted', text: `${AR_NUM(store.units.length)} درس · ${AR_NUM(store.words.length)} كلمة · ${AR_NUM(store.sentences.length)} جملة` }),
    ]),
    el('span', { class: 'admin-badge', text: hasDraft() ? 'تغييرات غير منشورة' : 'كل شيء منشور' }),
  ]));

  const tabs = el('div', { class: 'adm-tabs' });
  const panel = el('div', {});
  TABS.forEach(t => {
    const b = el('button', { class: t.id === activeTab ? 'is-on' : '', text: t.label });
    b.addEventListener('click', () => { activeTab = t.id; renderConsole(view); });
    tabs.append(b);
  });
  wrap.append(tabs, panel);

  ({ content: panContent, quick: panQuick, import: panImport, publish: panPublish, tools: panTools })[activeTab](panel, view);
}

const refresh = () => renderConsole($('#view'));

/* ============================================================ 1 · content */
function panContent(panel, view) {
  const list = el('div', { class: 'stack stack--sm' });

  panel.append(el('div', { class: 'stack' }, [
    el('button', {
      class: 'btn btn--primary btn--block', html: ICON.plus + '<span>درس جديد</span>',
      onclick: () => editUnit(null),
    }),
    list,
  ]));

  const draft = getDraft();
  store.units.forEach((u, idx) => {
    const dirty = !!draft.units?.[u.id];
    list.append(el('div', { class: 'adm-item' }, [
      el('span', { style: 'font-size:1.4rem', text: u.icon }),
      el('div', { class: 'adm-item__t' }, [
        el('b', { style: 'font-family:var(--font-ar);direction:rtl', text: u.title.ar }),
        el('span', { text: `${AR_NUM(u.words.length)} كلمة · ${AR_NUM(u.sentences.length)} جملة · مستوى ${AR_NUM(u.level)}` }),
      ]),
      dirty ? el('i', { class: 'dirty-dot', title: 'غير منشور' }) : null,
      el('button', { class: 'icon-btn', html: ICON.pen, onclick: () => editUnit(u.id) }),
      el('button', {
        class: 'icon-btn', html: '↑', onclick: () => move(idx, -1),
        style: 'font-size:1.1rem', title: 'أعلى',
      }),
      el('button', {
        class: 'icon-btn', html: '↓', onclick: () => move(idx, 1),
        style: 'font-size:1.1rem', title: 'أسفل',
      }),
    ]));
  });

  function move(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= store.units.length) return;
    [store.units[i], store.units[j]] = [store.units[j], store.units[i]];
    reindex();
    updateIndex(buildIndexFromStore());
    refresh();
  }
}

/* ---------------------------------------- unit editor */
function editUnit(unitId) {
  const isNew = !unitId;
  const src = isNew
    ? { id: '', title: { ar: '', en: '' }, icon: '📘', level: 1, color: 'brand', words: [], sentences: [] }
    : structuredClone(store.unitById.get(unitId));
  const u = src;

  const view = $('#view');
  view.innerHTML = '';
  const wrap = el('div', { class: 'wrap stack' });
  view.append(wrap);

  const f = {
    ar:    el('input', { class: 'input', value: u.title.ar, placeholder: 'مثال: الطعام والشراب' }),
    en:    el('input', { class: 'input en', value: u.title.en, placeholder: 'Food & Drink' }),
    icon:  el('input', { class: 'input', value: u.icon, style: 'max-width:80px;text-align:center;font-size:1.3rem' }),
    level: el('select', { class: 'select' }, [1, 2, 3, 4].map(n =>
      el('option', { value: n, text: 'المستوى ' + AR_NUM(n), selected: n === u.level }))),
    id:    el('input', { class: 'input mono', value: u.id, placeholder: 'food-drink', disabled: !isNew }),
  };
  f.ar.addEventListener('input', () => { if (isNew && !f.id.value) f.id.value = slug(f.en.value || f.ar.value); });
  f.en.addEventListener('input', () => { if (isNew) f.id.value = slug(f.en.value); });

  wrap.append(el('div', { class: 'row row--between' }, [
    el('button', { class: 'btn btn--sm btn--quiet', text: '‹ رجوع', onclick: refresh }),
    el('div', { style: 'font-weight:800', text: isNew ? 'درس جديد' : 'تعديل الدرس' }),
    el('button', { class: 'btn btn--sm btn--primary', text: 'حفظ', onclick: saveUnit }),
  ]));

  wrap.append(el('div', { class: 'card stack', style: 'padding:var(--sp-4)' }, [
    field('العنوان بالعربية', f.ar),
    field('العنوان بالإنجليزية', f.en),
    el('div', { class: 'row' }, [
      el('div', {}, [el('label', { class: 'label', text: 'الأيقونة' }), f.icon]),
      el('div', { class: 'grow' }, [el('label', { class: 'label', text: 'المستوى' }), f.level]),
    ]),
    field('المعرّف (اسم الملف)', f.id),
  ]));

  /* ---- words ---- */
  const wordsBox = el('div', { class: 'stack stack--sm' });
  wrap.append(el('div', { class: 'section-title' }, [
    el('h2', { text: `الكلمات (${AR_NUM(u.words.length)})` }),
    el('button', { class: 'btn btn--sm btn--primary', text: '+ كلمة', onclick: () => wordSheet(null) }),
  ]), wordsBox);

  function paintWords() {
    wordsBox.innerHTML = '';
    u.words.forEach((w, i) => {
      wordsBox.append(el('div', { class: 'adm-item' }, [
        el('div', { class: 'adm-item__t' }, [
          el('b', { text: (w.emoji ? w.emoji + ' ' : '') + w.en }),
          el('span', { text: `${w.ar}${w.tr ? ' · ' + w.tr : ''}` }),
        ]),
        !w.tr || !w.ar ? el('span', { class: 'chip chip--amber', text: 'ناقص' }) : null,
        el('button', { class: 'icon-btn', html: ICON.pen, onclick: () => wordSheet(i) }),
        el('button', {
          class: 'icon-btn icon-btn--danger', html: ICON.trash,
          onclick: async () => {
            if (await confirmSheet('حذف الكلمة؟', w.en, { danger: true, okText: 'حذف' })) {
              u.words.splice(i, 1); paintWords();
            }
          },
        }),
      ]));
    });
    if (!u.words.length) wordsBox.append(el('p', { class: 'muted small center', text: 'لا توجد كلمات بعد' }));
  }
  paintWords();

  /* ---- sentences ---- */
  const sentBox = el('div', { class: 'stack stack--sm' });
  wrap.append(el('div', { class: 'section-title' }, [
    el('h2', { text: `الجمل (${AR_NUM(u.sentences.length)})` }),
    el('button', { class: 'btn btn--sm btn--primary', text: '+ جملة', onclick: () => sentSheet(null) }),
  ]), sentBox);

  function paintSents() {
    sentBox.innerHTML = '';
    u.sentences.forEach((s, i) => {
      sentBox.append(el('div', { class: 'adm-item' }, [
        el('div', { class: 'adm-item__t' }, [el('b', { text: s.en }), el('span', { text: s.ar })]),
        el('button', { class: 'icon-btn', html: ICON.pen, onclick: () => sentSheet(i) }),
        el('button', {
          class: 'icon-btn icon-btn--danger', html: ICON.trash,
          onclick: () => { u.sentences.splice(i, 1); paintSents(); },
        }),
      ]));
    });
    if (!u.sentences.length) sentBox.append(el('p', { class: 'muted small center', text: 'لا توجد جمل بعد' }));
  }
  paintSents();

  /* ---- danger ---- */
  if (!isNew) {
    wrap.append(el('button', {
      class: 'btn btn--ghost btn--block', style: 'color:var(--rose);margin-top:var(--sp-6)',
      text: 'حذف الدرس كاملاً',
      onclick: async () => {
        if (await confirmSheet('حذف الدرس؟', `سيُحذف "${u.title.ar}" وكل كلماته.`, { danger: true, okText: 'حذف' })) {
          removeUnit(u.id); toast('تم الحذف'); refresh();
        }
      },
    }));
  }

  wrap.append(el('div', { class: 'pub-bar' }, [
    el('button', { class: 'btn btn--primary btn--lg btn--block', text: '💾 حفظ الدرس', onclick: saveUnit }),
  ]));

  /* ---- sheets ---- */
  function wordSheet(index) {
    const w = index == null
      ? { id: uid('w'), en: '', ar: '', tr: '', pos: '', emoji: '', ex: { en: '', ar: '', tr: '' } }
      : structuredClone(u.words[index]);
    w.ex = w.ex || { en: '', ar: '', tr: '' };

    const g = {
      en:    el('input', { class: 'input en', value: w.en, placeholder: 'water' }),
      ar:    el('input', { class: 'input', value: w.ar, placeholder: 'ماء' }),
      tr:    el('input', { class: 'input', value: w.tr, placeholder: 'ووتَر' }),
      emoji: el('input', { class: 'input', value: w.emoji, placeholder: '💧', style: 'max-width:90px;text-align:center' }),
      pos:   el('select', { class: 'select' }, [
        ['', '—'], ['n', 'اسم'], ['v', 'فعل'], ['adj', 'صفة'], ['adv', 'ظرف'],
        ['prep', 'حرف جر'], ['pron', 'ضمير'], ['num', 'عدد'], ['q', 'أداة سؤال'],
        ['conj', 'أداة ربط'], ['interj', 'تعبير'], ['phr', 'عبارة'],
      ].map(([v, t]) => el('option', { value: v, text: t, selected: v === w.pos }))),
      exEn:  el('input', { class: 'input en', value: w.ex.en, placeholder: 'I drink water.' }),
      exAr:  el('input', { class: 'input', value: w.ex.ar, placeholder: 'أنا أشرب الماء.' }),
      exTr:  el('input', { class: 'input', value: w.ex.tr, placeholder: 'آي درينك ووتَر' }),
    };
    g.en.addEventListener('blur', () => { if (!g.tr.value.trim() && g.en.value) g.tr.value = translit(g.en.value); });
    g.exEn.addEventListener('blur', () => { if (!g.exTr.value.trim() && g.exEn.value) g.exTr.value = translit(g.exEn.value); });

    const body = el('div', { class: 'stack' }, [
      field('الكلمة بالإنجليزية', g.en),
      field('المعنى بالعربية', g.ar),
      el('div', {}, [
        el('label', { class: 'label', text: 'النطق بالحروف العربية' }),
        el('div', { class: 'row' }, [
          g.tr,
          el('button', { class: 'btn btn--sm btn--ghost nowrap', text: '✨ توليد', onclick: () => { g.tr.value = translit(g.en.value); } }),
        ]),
      ]),
      el('div', { class: 'row' }, [
        el('div', {}, [el('label', { class: 'label', text: 'إيموجي' }), g.emoji]),
        el('div', { class: 'grow' }, [el('label', { class: 'label', text: 'النوع' }), g.pos]),
      ]),
      el('hr', { class: 'divider' }),
      el('div', { style: 'font-weight:800', text: 'جملة مثال (اختياري)' }),
      field('بالإنجليزية', g.exEn),
      field('بالعربية', g.exAr),
      field('النطق', g.exTr),
      el('button', {
        class: 'btn btn--primary btn--block btn--lg', text: 'حفظ الكلمة',
        onclick: () => {
          if (!g.en.value.trim() || !g.ar.value.trim()) return toast('الكلمة والمعنى مطلوبان', 'err');
          const out = {
            id: w.id || uid('w'),
            en: g.en.value.trim(), ar: g.ar.value.trim(), tr: g.tr.value.trim(),
            pos: g.pos.value, emoji: g.emoji.value.trim(),
            ex: { en: g.exEn.value.trim(), ar: g.exAr.value.trim(), tr: g.exTr.value.trim() },
          };
          if (index == null) u.words.push(out); else u.words[index] = out;
          s.close(); paintWords();
        },
      }),
    ]);
    const s = sheet(index == null ? 'كلمة جديدة' : 'تعديل كلمة', body);
    setTimeout(() => g.en.focus(), 150);
  }

  function sentSheet(index) {
    const st = index == null ? { id: uid('s'), en: '', ar: '', tr: '' } : structuredClone(u.sentences[index]);
    const g = {
      en: el('input', { class: 'input en', value: st.en, placeholder: 'How are you?' }),
      ar: el('input', { class: 'input', value: st.ar, placeholder: 'كيف حالك؟' }),
      tr: el('input', { class: 'input', value: st.tr, placeholder: 'هاو آر يو' }),
    };
    g.en.addEventListener('blur', () => { if (!g.tr.value.trim()) g.tr.value = translit(g.en.value); });
    const body = el('div', { class: 'stack' }, [
      field('الجملة بالإنجليزية', g.en),
      field('الترجمة بالعربية', g.ar),
      field('النطق بالحروف العربية', g.tr),
      el('button', {
        class: 'btn btn--primary btn--block btn--lg', text: 'حفظ الجملة',
        onclick: () => {
          if (!g.en.value.trim() || !g.ar.value.trim()) return toast('الجملة والترجمة مطلوبتان', 'err');
          const out = { id: st.id || uid('s'), en: g.en.value.trim(), ar: g.ar.value.trim(), tr: g.tr.value.trim() };
          if (index == null) u.sentences.push(out); else u.sentences[index] = out;
          s.close(); paintSents();
        },
      }),
    ]);
    const s = sheet(index == null ? 'جملة جديدة' : 'تعديل جملة', body);
    setTimeout(() => g.en.focus(), 150);
  }

  function saveUnit() {
    const id = slug(f.id.value || f.en.value || f.ar.value);
    if (!id) return toast('المعرّف مطلوب', 'err');
    if (isNew && store.unitById.has(id)) return toast('هذا المعرّف مستخدم', 'err');
    u.id = id;
    u.title = { ar: f.ar.value.trim() || id, en: f.en.value.trim() || id };
    u.icon = f.icon.value.trim() || '📘';
    u.level = Number(f.level.value);
    u.words.forEach(w => { w.unitId = id; });
    upsertUnit(u);
    updateIndex(buildIndexFromStore());
    toast('تم الحفظ محلياً — لا تنسَ النشر', 'ok');
    refresh();
  }
}

function field(label, input) {
  return el('div', {}, [el('label', { class: 'label', text: label }), input]);
}

/* ============================================================ 2 · quick add */
function panQuick(panel) {
  const unitSel = el('select', { class: 'select' },
    store.units.map(u => el('option', { value: u.id, text: `${u.icon} ${u.title.ar}` })));
  unitSel.value = load('khutwa.lastUnit', store.units[0]?.id || '');

  const g = {
    en:  el('input', { class: 'input en', placeholder: 'water', autocomplete: 'off' }),
    ar:  el('input', { class: 'input', placeholder: 'ماء' }),
    tr:  el('input', { class: 'input', placeholder: 'ووتَر' }),
    emo: el('input', { class: 'input', placeholder: '💧', style: 'max-width:90px;text-align:center' }),
    exEn: el('input', { class: 'input en', placeholder: 'I drink water.' }),
    exAr: el('input', { class: 'input', placeholder: 'أنا أشرب الماء.' }),
  };
  g.en.addEventListener('blur', () => { if (!g.tr.value.trim() && g.en.value) g.tr.value = translit(g.en.value); });

  const added = el('div', { class: 'stack stack--sm' });

  function add(keepOpen) {
    const uId = unitSel.value;
    const u = store.unitById.get(uId);
    if (!u) return toast('اختر درساً', 'err');
    if (!g.en.value.trim() || !g.ar.value.trim()) return toast('الكلمة والمعنى مطلوبان', 'err');
    const w = {
      id: uid('w'), en: g.en.value.trim(), ar: g.ar.value.trim(),
      tr: g.tr.value.trim() || translit(g.en.value), emoji: g.emo.value.trim(), pos: '',
      ex: { en: g.exEn.value.trim(), ar: g.exAr.value.trim(), tr: g.exEn.value ? translit(g.exEn.value) : '' },
    };
    const clone = structuredClone(store.unitById.get(uId));
    clone.words.push(w);
    upsertUnit(clone);
    updateIndex(buildIndexFromStore());
    save('khutwa.lastUnit', uId);

    added.prepend(el('div', { class: 'adm-item' }, [
      el('span', { text: '✅' }),
      el('div', { class: 'adm-item__t' }, [el('b', { text: w.en }), el('span', { text: w.ar })]),
    ]));
    ['en', 'ar', 'tr', 'emo', 'exEn', 'exAr'].forEach(k => { g[k].value = ''; });
    g.en.focus();
    if (!keepOpen) refresh();
  }

  panel.append(el('div', { class: 'stack' }, [
    field('الدرس', unitSel),
    el('div', { class: 'card stack', style: 'padding:var(--sp-4)' }, [
      field('الكلمة بالإنجليزية', g.en),
      field('المعنى بالعربية', g.ar),
      el('div', {}, [
        el('label', { class: 'label', text: 'النطق بالعربية (يُولّد تلقائياً)' }),
        el('div', { class: 'row' }, [g.tr, el('button', { class: 'btn btn--sm btn--ghost nowrap', text: '✨', onclick: () => { g.tr.value = translit(g.en.value); } })]),
      ]),
      field('إيموجي', g.emo),
      field('مثال بالإنجليزية', g.exEn),
      field('ترجمة المثال', g.exAr),
      el('button', { class: 'btn btn--primary btn--lg btn--block', text: '＋ حفظ وإضافة أخرى', onclick: () => add(true) }),
    ]),
    added,
  ]));
  setTimeout(() => g.en.focus(), 120);
}

/* ============================================================ 3 · bulk import */
function panImport(panel) {
  const unitSel = el('select', { class: 'select' }, [
    el('option', { value: '__new__', text: '➕ درس جديد…' }),
    ...store.units.map(u => el('option', { value: u.id, text: `${u.icon} ${u.title.ar}` })),
  ]);
  const newName = el('input', { class: 'input', placeholder: 'اسم الدرس الجديد بالعربية' });
  const newNameEn = el('input', { class: 'input en', placeholder: 'New lesson' });
  const newBox = el('div', { class: 'stack stack--sm' }, [newName, newNameEn]);
  unitSel.addEventListener('change', () => { newBox.classList.toggle('hide', unitSel.value !== '__new__'); });

  const ta = el('textarea', {
    class: 'textarea mono', style: 'min-height:220px',
    placeholder: 'كل سطر = كلمة\n\nwater | ماء | I drink water. | أنا أشرب الماء.\nbread | خبز\nsun | شمس | The sun is hot. | الشمس حارة.',
  });
  const info = el('div', { class: 'small muted' });
  const preview = el('div', { class: 'stack stack--sm' });

  function parse() {
    const rows = ta.value.split('\n').map(l => l.trim()).filter(Boolean);
    return rows.map(line => {
      const parts = line.split(/\s*[|\t]\s*|\s*;\s*/).map(p => p.trim());
      const [en, ar, exEn, exAr, tr] = parts;
      if (!en || !ar) return null;
      return {
        id: uid('w'), en, ar,
        tr: tr || translit(en), emoji: '', pos: '',
        ex: { en: exEn || '', ar: exAr || '', tr: exEn ? translit(exEn) : '' },
      };
    }).filter(Boolean);
  }

  ta.addEventListener('input', () => {
    const rows = parse();
    info.textContent = `${AR_NUM(rows.length)} كلمة جاهزة للاستيراد`;
    preview.innerHTML = '';
    rows.slice(0, 6).forEach(w => preview.append(el('div', { class: 'adm-item' }, [
      el('div', { class: 'adm-item__t' }, [el('b', { text: w.en }), el('span', { text: `${w.ar} · ${w.tr}` })]),
    ])));
    if (rows.length > 6) preview.append(el('div', { class: 'small muted center', text: `… و${AR_NUM(rows.length - 6)} أخرى` }));
  });

  panel.append(el('div', { class: 'stack' }, [
    el('div', { class: 'card', style: 'padding:var(--sp-4)' }, [
      el('div', { style: 'font-weight:800;margin-bottom:6px', text: 'الصيغة' }),
      el('div', { class: 'code-box mono' },
        ['english | العربية | example sentence | ترجمة المثال | النطق(اختياري)']),
      el('p', { class: 'small muted', style: 'margin-top:8px' },
        ['الفاصل | أو Tab. الحقلان الأولان مطلوبان فقط. يُولَّد النطق بالعربية تلقائياً ويمكنك تعديله لاحقاً.']),
    ]),
    field('استيراد إلى', unitSel),
    newBox,
    field('الكلمات', ta),
    info, preview,
    el('button', {
      class: 'btn btn--primary btn--lg btn--block', text: '📥 استيراد الآن',
      onclick: () => {
        const rows = parse();
        if (!rows.length) return toast('لا توجد أسطر صالحة', 'err');
        let unit;
        if (unitSel.value === '__new__') {
          const id = slug(newNameEn.value || newName.value);
          if (!id) return toast('اكتب اسم الدرس', 'err');
          unit = {
            id, title: { ar: newName.value.trim() || id, en: newNameEn.value.trim() || id },
            icon: '📘', level: 1, color: 'brand', words: [], sentences: [],
          };
        } else {
          unit = structuredClone(store.unitById.get(unitSel.value));
        }
        unit.words.push(...rows);
        upsertUnit(unit);
        updateIndex(buildIndexFromStore());
        toast(`تمت إضافة ${rows.length} كلمة`, 'ok');
        refresh();
      },
    }),
  ]));
  newBox.classList.toggle('hide', unitSel.value !== '__new__');
}

/* ============================================================ 4 · publish */
function panPublish(panel) {
  const files = draftFiles();

  /* ---- github settings ---- */
  const g = {
    owner:  el('input', { class: 'input mono', value: gh.cfg.owner, placeholder: 'my-github-username' }),
    repo:   el('input', { class: 'input mono', value: gh.cfg.repo, placeholder: 'english-app' }),
    branch: el('input', { class: 'input mono', value: gh.cfg.branch || 'main', placeholder: 'main' }),
    prefix: el('input', { class: 'input mono', value: gh.cfg.prefix, placeholder: '(اتركه فارغاً غالباً)' }),
    token:  el('input', { class: 'input mono', type: 'password', value: gh.cfg.token, placeholder: 'github_pat_…' }),
  };
  const status = el('div', { class: 'small muted' });
  const log = el('div', { class: 'stack stack--sm' });

  const saveCfg = () => gh.saveCfg({
    owner: g.owner.value.trim(), repo: g.repo.value.trim(),
    branch: g.branch.value.trim() || 'main', prefix: g.prefix.value.trim(),
    token: g.token.value.trim(),
  });

  panel.append(el('div', { class: 'stack' }, [

    el('div', { class: 'card stack', style: 'padding:var(--sp-4)' }, [
      el('div', { style: 'font-weight:800' }, [`ملفات بانتظار النشر (${AR_NUM(files.length)})`]),
      files.length
        ? el('div', { class: 'stack stack--sm' }, files.map(f => el('div', { class: 'adm-item' }, [
            el('i', { class: 'dirty-dot' }),
            el('div', { class: 'adm-item__t' }, [el('b', { class: 'mono', text: f.path })]),
            el('span', { class: 'small muted', text: f.json.words ? `${AR_NUM(f.json.words.length)} كلمة` : 'فهرس' }),
          ])))
        : el('p', { class: 'muted small', text: 'لا توجد تغييرات غير منشورة ✅' }),
    ]),

    el('div', { class: 'card stack', style: 'padding:var(--sp-4)' }, [
      el('div', { style: 'font-weight:800', text: 'إعدادات GitHub' }),
      field('اسم المستخدم / المنظمة', g.owner),
      field('اسم المستودع', g.repo),
      el('div', { class: 'row' }, [
        el('div', { class: 'grow' }, [el('label', { class: 'label', text: 'الفرع' }), g.branch]),
        el('div', { class: 'grow' }, [el('label', { class: 'label', text: 'مجلد فرعي' }), g.prefix]),
      ]),
      field('التوكن (يبقى على هذا الجهاز فقط)', g.token),
      el('div', { class: 'row' }, [
        el('button', {
          class: 'btn btn--sm btn--ghost', text: '🔌 اختبار الاتصال',
          onclick: async () => {
            saveCfg();
            status.textContent = 'جارٍ الاختبار…';
            try {
              const r = await gh.checkAccess();
              status.innerHTML = `<span style="color:var(--mint)">متصل بـ ${esc(r.name)} ${r.push ? '(صلاحية كتابة ✓)' : '(بدون صلاحية كتابة ✗)'}</span>`;
            } catch (e) { status.innerHTML = `<span style="color:var(--rose)">${esc(e.message)}</span>`; }
          },
        }),
        el('button', { class: 'btn btn--sm btn--quiet', text: 'حفظ الإعدادات', onclick: () => { saveCfg(); toast('تم الحفظ', 'ok'); } }),
        el('button', { class: 'btn btn--sm btn--quiet', text: 'حذف التوكن', onclick: () => { gh.forgetToken(); g.token.value = ''; toast('تم حذف التوكن'); } }),
      ]),
      status,
      el('details', {}, [
        el('summary', { class: 'small muted', style: 'cursor:pointer', text: 'كيف أنشئ التوكن؟' }),
        el('ol', { class: 'small muted', style: 'padding-inline-start:20px;line-height:1.9' }, [
          el('li', { text: 'GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens' }),
          el('li', { text: 'Generate new token → اختر هذا المستودع فقط' }),
          el('li', { text: 'Repository permissions → Contents → Read and write' }),
          el('li', { text: 'انسخ التوكن والصقه هنا (لن يظهر مرة أخرى في GitHub)' }),
        ]),
      ]),
    ]),

    el('button', {
      class: 'btn btn--primary btn--lg btn--block', disabled: !files.length,
      html: ICON.cloud + `<span>نشر ${AR_NUM(files.length)} ملف إلى GitHub</span>`,
      onclick: async ev => {
        saveCfg();
        if (!gh.configured()) return toast('أكمل إعدادات GitHub أولاً', 'err');
        const btn = ev.currentTarget;
        btn.disabled = true;
        log.innerHTML = '';
        try {
          await gh.publish(files, (path, state) => {
            if (state === 'jar') log.append(el('div', { class: 'small mono', dataset: { p: path }, text: '⏳ ' + path }));
            else {
              const row = [...log.children].find(c => c.dataset.p === path);
              if (row) { row.textContent = '✅ ' + path; }
            }
          });
          clearDraft();
          toast('تم النشر بنجاح 🎉', 'ok');
          log.append(el('p', { class: 'small', style: 'color:var(--mint)', text: 'انتهى. سيظهر التحديث على الموقع خلال دقيقة تقريباً.' }));
          setTimeout(refresh, 1200);
        } catch (e) {
          log.append(el('p', { class: 'small', style: 'color:var(--rose)', text: e.message }));
          btn.disabled = false;
        }
      },
    }),
    log,

    el('button', {
      class: 'btn btn--ghost btn--block', text: '⤓ تنزيل الملفات بدل النشر',
      onclick: () => {
        if (!files.length) return toast('لا توجد تغييرات');
        files.forEach(f => downloadFile(f.path.split('/').pop(), JSON.stringify(f.json, null, 2)));
        toast('تم تنزيل الملفات — ارفعها إلى GitHub يدوياً', 'ok');
      },
    }),

    files.length ? el('button', {
      class: 'btn btn--quiet btn--block', style: 'color:var(--rose)', text: 'تجاهل التغييرات غير المنشورة',
      onclick: async () => {
        if (await confirmSheet('تجاهل التغييرات؟', 'ستعود إلى آخر نسخة منشورة.', { danger: true, okText: 'تجاهل' })) {
          clearDraft(); location.reload();
        }
      },
    }) : null,
  ]));
}

/* ============================================================ 5 · tools */
function panTools(panel) {
  /* content audit */
  const missingTr = store.words.filter(w => !w.tr);
  const missingEx = store.words.filter(w => !w.ex?.en);
  const noEmoji  = store.words.filter(w => !w.emoji);
  const dupes = (() => {
    const seen = new Map(), out = [];
    store.words.forEach(w => {
      const k = w.en.toLowerCase();
      if (seen.has(k)) out.push(w); else seen.set(k, w);
    });
    return out;
  })();

  panel.append(el('div', { class: 'stack' }, [

    el('div', { class: 'card stack', style: 'padding:var(--sp-4)' }, [
      el('div', { style: 'font-weight:800', text: 'فحص المحتوى' }),
      el('div', { class: 'statgrid' }, [
        auditBox(store.words.length, 'كلمة'),
        auditBox(missingTr.length, 'بدون نطق'),
        auditBox(missingEx.length, 'بدون مثال'),
        auditBox(dupes.length, 'مكرّرة'),
      ]),
      dupes.length ? el('details', {}, [
        el('summary', { class: 'small', style: 'cursor:pointer', text: 'عرض المكرّر' }),
        el('div', { class: 'small mono' }, [dupes.map(d => d.en).join(', ')]),
      ]) : null,
      missingTr.length ? el('button', {
        class: 'btn btn--sm btn--ghost', text: '✨ توليد النطق الناقص تلقائياً',
        onclick: () => {
          const byUnit = new Map();
          missingTr.forEach(w => {
            if (!byUnit.has(w.unitId)) byUnit.set(w.unitId, structuredClone(store.unitById.get(w.unitId)));
            const u = byUnit.get(w.unitId);
            const t = u.words.find(x => x.id === w.id);
            if (t) t.tr = translit(t.en);
          });
          byUnit.forEach(u => upsertUnit(u));
          updateIndex(buildIndexFromStore());
          toast(`تم توليد ${missingTr.length} نطق`, 'ok');
          refresh();
        },
      }) : null,
    ]),

    el('div', { class: 'card stack', style: 'padding:var(--sp-4)' }, [
      el('div', { style: 'font-weight:800', text: 'نسخة احتياطية للمحتوى' }),
      el('p', { class: 'small muted', text: 'ملف واحد يحتوي كل الدروس والكلمات — احتفظ به دائماً.' }),
      el('button', {
        class: 'btn btn--ghost btn--block', text: '⤓ تنزيل كل المحتوى',
        onclick: () => downloadFile(`khutwa-content-${new Date().toISOString().slice(0, 10)}.json`,
          JSON.stringify({ index: buildIndexFromStore(), units: store.units, alphabet: store.alphabet }, null, 2)),
      }),
      el('button', {
        class: 'btn btn--ghost btn--block', text: '⤒ استعادة من ملف',
        onclick: async () => {
          const txt = await readFile('.json');
          if (!txt) return;
          try {
            const data = JSON.parse(txt);
            if (!Array.isArray(data.units)) throw new Error('bad');
            data.units.forEach(u => upsertUnit(u));
            updateIndex(data.index || buildIndexFromStore());
            toast('تم الاستيراد — راجع ثم انشر', 'ok');
            refresh();
          } catch { toast('ملف غير صالح', 'err'); }
        },
      }),
    ]),

    el('div', { class: 'card stack', style: 'padding:var(--sp-4)' }, [
      el('div', { style: 'font-weight:800', text: 'كلمة مرور اللوحة' }),
      passChanger(),
    ]),

    el('div', { class: 'card stack', style: 'padding:var(--sp-4)' }, [
      el('div', { class: 'small muted', text: `الإصدار ${APP_VERSION}` }),
      el('button', {
        class: 'btn btn--ghost btn--block', text: '🚪 خروج من اللوحة',
        onclick: () => { sessionStorage.removeItem(SESSION_KEY); go('/'); },
      }),
    ]),
  ]));
}

function auditBox(n, label) {
  return el('div', { class: 'statbox' }, [
    el('b', { text: AR_NUM(n), style: n && label !== 'كلمة' ? 'color:var(--amber)' : '' }),
    el('span', { text: label }),
  ]);
}

function passChanger() {
  const p1 = el('input', { class: 'input', type: 'password', placeholder: 'كلمة مرور جديدة' });
  const out = el('div', { class: 'small mono muted', style: 'word-break:break-all' });
  return el('div', { class: 'stack stack--sm' }, [
    p1,
    el('button', {
      class: 'btn btn--sm btn--ghost', text: 'تغيير',
      onclick: async () => {
        if (p1.value.length < 4) return toast('٤ أحرف على الأقل', 'err');
        const h = await sha256(p1.value);
        if (!h) return toast('غير مدعوم هنا', 'err');
        save(K_PASS, h);
        out.textContent = 'تم الحفظ على هذا الجهاز. للتثبيت على كل الأجهزة ضع هذا في app/config.js → passHash:\n' + h;
        p1.value = '';
        toast('تم تغيير كلمة المرور', 'ok');
      },
    }),
    out,
  ]);
}
