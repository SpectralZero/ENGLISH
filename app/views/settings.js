/* ============================================================
   views/settings.js — learner preferences + backup
   (the admin door is hidden at the very bottom)
   ============================================================ */
import { el, AR_NUM, toast, downloadFile, readFile, confirmSheet, dayKey } from '../util.js';
import { settings, setSetting, progress, resetProgress, importProgress } from '../store.js';
import { englishVoices, speak, unlock } from '../tts.js';
import { sectionTitle } from '../ui.js';
import { go } from '../router.js';
import { APP_VERSION } from '../config.js';

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
  wrap.append(el('div', { class: 'setgroup' }, [
    row('السمة', 'فاتح أو داكن', seg(
      [{ v: 'auto', label: 'تلقائي' }, { v: 'light', label: 'فاتح' }, { v: 'dark', label: 'داكن' }],
      settings.theme, v => setSetting('theme', v))),
    row('حجم الخط', '', seg(
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
  wrap.append(el('div', { class: 'setgroup' }, [
    el('button', { class: 'setrow', style: 'width:100%;text-align:start' }, [
      el('div', { class: 'setrow__t', html: 'حفظ نسخة من تقدّمي<small>ملف يمكنك استرجاعه لاحقاً</small>' }),
    ]),
    el('button', { class: 'setrow', style: 'width:100%;text-align:start' }, [
      el('div', { class: 'setrow__t', html: 'استرجاع نسخة<small>من ملف محفوظ</small>' }),
    ]),
    el('button', { class: 'setrow', style: 'width:100%;text-align:start' }, [
      el('div', { class: 'setrow__t', style: 'color:var(--rose)', html: 'مسح كل التقدّم<small>لا يمكن التراجع</small>' }),
    ]),
  ]));
  const dataRows = wrap.querySelectorAll('.setgroup:last-child .setrow');
  dataRows[0].addEventListener('click', () => {
    downloadFile(`khutwa-progress-${dayKey()}.json`, JSON.stringify(progress, null, 2));
    toast('تم تنزيل النسخة', 'ok');
  });
  dataRows[1].addEventListener('click', async () => {
    const txt = await readFile('.json');
    if (!txt) return;
    try { importProgress(JSON.parse(txt)); toast('تم الاسترجاع', 'ok'); setTimeout(() => location.reload(), 700); }
    catch { toast('ملف غير صالح', 'err'); }
  });
  dataRows[2].addEventListener('click', async () => {
    if (await confirmSheet('مسح كل التقدّم؟', 'ستفقد كل الكلمات المتعلّمة والنقاط والسلسلة.', { danger: true, okText: 'مسح' })) {
      resetProgress(); toast('تم المسح'); setTimeout(() => location.reload(), 600);
    }
  });

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
