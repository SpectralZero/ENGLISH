/* ============================================================
   views/settings.js — learner preferences + backup
   (the admin door is hidden at the very bottom)
   ============================================================ */
import { el, esc, AR_NUM, toast, downloadFile, readFile, confirmSheet, sheet, dayKey } from '../util.js';
import { settings, setSetting, progress, resetProgress, importProgress } from '../store.js';
import { englishVoices, speak, unlock } from '../tts.js';
import { sectionTitle } from '../ui.js';
import { go } from '../router.js';
import { APP_VERSION, THEMES } from '../config.js';
import * as sync from '../sync.js';

export default function settingsView({ view }) {
  const wrap = el('div', { class: 'wrap stack' });

  /* ---------------- profile ---------------- */
  wrap.append(sectionTitle('حسابي'));
  const nameInput = el('input', { class: 'input', value: progress.name || '', placeholder: 'اسمك (اختياري)' });
  nameInput.addEventListener('change', () => { progress.name = nameInput.value.trim(); toast('تم الحفظ', 'ok'); });
  wrap.append(el('div', { class: 'setgroup' }, [
    el('div', { class: 'setrow' }, [el('div', { class: 'setrow__t', text: 'الاسم' }), el('div', { style: 'flex:1' }, [nameInput])]),
    row('هدف يومي', 'عدد الكلمات في اليوم', seg(
      [10, 20, 30, 50].map(n => ({ v: n, label: AR_NUM(n) })),
      settings.dailyGoal, v => setSetting('dailyGoal', v))),
  ]));

  /* ---------------- appearance ---------------- */
  wrap.append(sectionTitle('المظهر'));
  wrap.append(el('div', { class: 'card stack', style: 'padding:var(--sp-4)' }, [
    el('div', { class: 'label', style: 'margin:0', text: 'السمة' }),
    themePicker(),
  ]));
  wrap.append(el('div', { class: 'setgroup' }, [
    row('حجم الخط', 'اختر ما يريح عينك', seg(
      [{ v: 0.92, label: 'ص' }, { v: 1, label: 'م' }, { v: 1.12, label: 'ك' }, { v: 1.25, label: 'كك' }],
      settings.fontScale, v => setSetting('fontScale', v))),
  ]));

  /* ---------------- learning ---------------- */
  wrap.append(sectionTitle('التعلّم والنطق'));
  const voices = englishVoices();
  const voiceSel = el('select', { class: 'select', style: 'max-width:190px' },
    [el('option', { value: '', text: 'تلقائي (الأفضل)' }),
     ...voices.map(v => el('option', { value: v.voiceURI, text: `${v.name} · ${v.lang}` }))]);
  voiceSel.value = settings.voiceURI || '';
  voiceSel.addEventListener('change', () => {
    setSetting('voiceURI', voiceSel.value); unlock(); speak('Hello, how are you?');
  });

  const rateInput = el('input', {
    type: 'range', min: '0.5', max: '1.1', step: '0.05', value: String(settings.rate), style: 'flex:1',
  });
  rateInput.addEventListener('change', () => { setSetting('rate', Number(rateInput.value)); unlock(); speak('This is my speed.'); });

  wrap.append(el('div', { class: 'setgroup' }, [
    row('إظهار النطق بالحروف العربية', 'مثال: water = ووتَر', toggle(settings.showTranslit, v => setSetting('showTranslit', v))),
    row('نطق الكلمة تلقائياً', 'عند ظهور بطاقة جديدة', toggle(settings.autoSpeak, v => setSetting('autoSpeak', v))),
    row('الاهتزاز', 'ردّ فعل عند الإجابة', toggle(settings.haptics, v => setSetting('haptics', v))),
    row('الصوت', 'صوت النطق الإنجليزي', voiceSel),
    row('سرعة النطق', 'ابدأ ببطء', rateInput),
    el('div', { class: 'setrow' }, [
      el('button', { class: 'btn btn--sm btn--ghost', text: '🔊 جرّب النطق', onclick: () => { unlock(); speak('Good morning. My name is Ahmed.'); } }),
    ]),
  ]));

  /* ---------------- data ---------------- */
  wrap.append(sectionTitle('بياناتي'));

  const rowSave = el('button', { class: 'setrow', style: 'width:100%;text-align:start' }, [
    el('div', { class: 'setrow__t', html: 'حفظ نسخة من تقدّمي<small>ملف يمكنك استرجاعه لاحقاً</small>' }),
  ]);
  const rowLoad = el('button', { class: 'setrow', style: 'width:100%;text-align:start' }, [
    el('div', { class: 'setrow__t', html: 'استرجاع نسخة<small>من ملف محفوظ</small>' }),
  ]);
  const rowWipe = el('button', { class: 'setrow', style: 'width:100%;text-align:start' }, [
    el('div', { class: 'setrow__t', style: 'color:var(--rose)', html: 'مسح كل التقدّم<small>لا يمكن التراجع</small>' }),
  ]);

  rowSave.addEventListener('click', () => {
    downloadFile(`khutwa-progress-${dayKey()}.json`, JSON.stringify(progress, null, 2));
    toast('تم تنزيل النسخة', 'ok');
  });
  rowLoad.addEventListener('click', async () => {
    const txt = await readFile('.json');
    if (!txt) return;
    try { importProgress(JSON.parse(txt)); toast('تم الاسترجاع', 'ok'); setTimeout(() => location.reload(), 700); }
    catch { toast('ملف غير صالح', 'err'); }
  });
  rowWipe.addEventListener('click', async () => {
    if (await confirmSheet('مسح كل التقدّم؟', 'ستفقد كل الكلمات المتعلّمة والنقاط والسلسلة.', { danger: true, okText: 'مسح' })) {
      resetProgress(); toast('تم المسح'); setTimeout(() => location.reload(), 600);
    }
  });

  wrap.append(el('div', { class: 'setgroup' }, [
    syncRow(),
    rowSave, rowLoad, rowWipe,
  ]));

  /* ---------------- about + hidden admin door ---------------- */
  let taps = 0, tapTimer;
  const version = el('button', {
    class: 'muted small', style: 'display:block;margin:var(--sp-6) auto var(--sp-4);padding:10px',
    text: `خُطوة · الإصدار ${APP_VERSION}`,
  });
  version.addEventListener('click', () => {
    clearTimeout(tapTimer);
    taps++;
    tapTimer = setTimeout(() => { taps = 0; }, 1200);
    if (taps >= 7) { taps = 0; go('/console'); }
  });
  wrap.append(version);

  view.append(wrap);
}

/* ---------------- theme picker ---------------- */
function themePicker() {
  const box = el('div', { class: 'themes' });
  THEMES.forEach(t => {
    const card = el('button', { class: 'theme-card' + (settings.theme === t.id ? ' is-on' : ''), 'aria-label': t.ar }, [
      el('span', { class: 'theme-swatch', style: `background:${t.swatch[0]}` }, [
        el('i', { class: 'sw-accent', style: `background:${t.swatch[2]}` }),
        el('i', { style: `background:${t.swatch[1]}` }),
        el('i', { style: `background:${t.swatch[1]};width:70%` }),
      ]),
      el('span', { text: t.ar }),
    ]);
    card.addEventListener('click', () => {
      setSetting('theme', t.id);
      [...box.children].forEach(c => c.classList.remove('is-on'));
      card.classList.add('is-on');
    });
    box.append(card);
  });
  return box;
}

/* ---------------- sync row ---------------- */
function syncRow() {
  if (!sync.configured()) {
    const row = el('button', { class: 'setrow', style: 'width:100%;text-align:start' }, [
      el('div', { class: 'setrow__t', html: '☁️ تفعيل المزامنة<small>احفظ تقدّمك وانقله بين أجهزتك</small>' }),
      el('span', { class: 'chip chip--brand', text: 'إعداد' }),
    ]);
    row.addEventListener('click', () => syncSetupSheet(() => go('/settings')));
    return row;
  }

  const dot = el('i', { class: 'sync-dot' });
  const label = el('small');

  const paint = (s = sync.state) => {
    dot.className = 'sync-dot ' + ({ busy: 'is-busy', ok: 'is-ok', error: 'is-err' }[s] || 'is-ok');
    const t = sync.meta.lastPush || sync.meta.lastPull;
    label.textContent = s === 'busy' ? 'جارٍ المزامنة…'
      : sync.meta.error ? 'فشلت آخر مزامنة — اضغط للإعادة'
      : t ? 'آخر مزامنة: ' + new Date(t).toLocaleString('ar', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })
      : 'جاهز — لم تتم المزامنة بعد';
  };
  paint();
  const off = sync.onSync(s => paint(s));
  window.addEventListener('hashchange', off, { once: true });

  const btn = el('button', { class: 'btn btn--sm btn--ghost nowrap', text: '↻ مزامنة الآن' });
  btn.addEventListener('click', () => runSync(btn));

  const row = el('div', { class: 'setrow' }, [
    dot,
    el('div', { class: 'setrow__t' }, ['مزامنة التقدّم', label]),
    btn,
  ]);
  row.addEventListener('click', e => {
    if (e.target === btn || btn.contains(e.target)) return;
    syncSetupSheet(() => go('/settings'));
  });
  return row;
}

/** Runs a sync and reports it, from anywhere in the app. */
export async function runSync(btn) {
  if (!sync.configured()) return syncSetupSheet();
  btn?.setAttribute('disabled', '');
  const r = await sync.syncNow({ force: true });
  btn?.removeAttribute('disabled');
  if (r.ok) {
    toast(r.pulled ? 'تمت المزامنة — تم تحديث تقدّمك' : 'تم حفظ تقدّمك ✓', 'ok');
    if (r.pulled) setTimeout(() => location.reload(), 800);
  } else {
    toast('تعذّرت المزامنة: ' + (r.reason || ''), 'err');
  }
  return r;
}

/** First-run setup: ask for the token once, then remember it. */
export function syncSetupSheet(onDone) {
  const g = {
    owner: el('input', { class: 'input mono', value: sync.cfg.owner, placeholder: 'اسم المستخدم' }),
    repo:  el('input', { class: 'input mono', value: sync.cfg.repo, placeholder: 'اسم المستودع الخاص' }),
    token: el('input', { class: 'input mono', type: 'password', value: sync.cfg.token, placeholder: 'github_pat_…', autocomplete: 'off' }),
  };
  const status = el('div', { class: 'small', style: 'min-height:22px' });

  const save = async () => {
    sync.saveCfg({ owner: g.owner.value.trim(), repo: g.repo.value.trim(), token: g.token.value.trim() });
    if (!sync.configured()) { status.innerHTML = '<span style="color:var(--rose)">أكمل الحقول الثلاثة</span>'; return; }
    status.textContent = 'جارٍ التحقق…';
    try {
      const r = await sync.checkAccess();
      if (!r.push) throw new Error('التوكن بدون صلاحية الكتابة (Contents: Read and write)');
      status.innerHTML = `<span style="color:var(--mint)">متصل بـ ${esc(r.name)}${r.private ? ' (خاص ✓)' : ' — ⚠️ المستودع عام'}</span>`;
      sync.startAuto();
      const first = await sync.syncNow({ force: true });
      toast(first.ok ? 'تم تفعيل المزامنة ✓' : 'تم الحفظ، لكن المزامنة الأولى فشلت', first.ok ? 'ok' : 'err');
      s.close();
      onDone?.();
    } catch (e) {
      status.innerHTML = `<span style="color:var(--rose)">${esc(e.message)}</span>`;
    }
  };

  const body = el('div', { class: 'stack' }, [
    el('p', { class: 'small muted' }, [
      'تُحفظ نسخة من تقدّمك في مستودع GitHub خاص بك. التوكن يبقى على هذا الجهاز فقط، ويُطلب مرة واحدة ثم يُحفظ.',
    ]),
    field('اسم المستخدم على GitHub', g.owner),
    field('المستودع الخاص', g.repo),
    field('التوكن (Contents: Read and write)', g.token),
    status,
    el('button', { class: 'btn btn--primary btn--lg btn--block', text: 'تفعيل المزامنة', onclick: save }),
    sync.configured() ? el('button', {
      class: 'btn btn--quiet btn--block', style: 'color:var(--rose)', text: 'إيقاف المزامنة وحذف التوكن',
      onclick: () => { sync.forget(); toast('تم إيقاف المزامنة'); s.close(); onDone?.(); },
    }) : null,
    el('details', {}, [
      el('summary', { class: 'small muted', style: 'cursor:pointer', text: 'كيف أنشئ التوكن؟' }),
      el('ol', { class: 'small muted', style: 'padding-inline-start:20px;line-height:1.9' }, [
        el('li', { text: 'GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens' }),
        el('li', { text: 'Generate new token → Only select repositories → اختر المستودع الخاص' }),
        el('li', { text: 'Repository permissions → Contents → Read and write' }),
        el('li', { text: 'انسخ التوكن والصقه هنا' }),
      ]),
    ]),
  ]);
  const s = sheet('المزامنة بين الأجهزة', body);
  setTimeout(() => (sync.cfg.token ? g.token : g.owner).focus(), 150);
  return s;
}

function field(label, input) {
  return el('div', {}, [el('label', { class: 'label', text: label }), input]);
}

/* ---------------- small builders ---------------- */
function row(title, sub, control) {
  return el('div', { class: 'setrow' }, [
    el('div', { class: 'setrow__t', html: `${title}${sub ? `<small>${sub}</small>` : ''}` }),
    control,
  ]);
}

function toggle(checked, onChange) {
  const input = el('input', { type: 'checkbox', checked: !!checked });
  input.addEventListener('change', () => onChange(input.checked));
  return el('label', { class: 'switch' }, [input, el('i')]);
}

function seg(options, current, onPick) {
  const box = el('div', { class: 'seg' });
  options.forEach(o => {
    const b = el('button', { class: o.v === current ? 'is-on' : '', text: o.label });
    b.addEventListener('click', () => {
      [...box.children].forEach(c => c.classList.remove('is-on'));
      b.classList.add('is-on');
      onPick(o.v);
    });
    box.append(b);
  });
  return box;
}
