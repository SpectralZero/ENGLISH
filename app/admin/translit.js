/* ============================================================
   admin/translit.js — English → Arabic-letter pronunciation
   A rough first draft the admin can correct by hand. It exists
   to save typing, not to replace judgement.
   ============================================================ */

const RULES = [
  ['tion', 'شِن'], ['sion', 'ژِن'], ['ough', 'أو'], ['augh', 'أو'],
  ['igh', 'آي'],  ['air', 'يِر'],  ['ear', 'يِر'], ['our', 'اوَر'],
  ['ck', 'ك'], ['ch', 'تْش'], ['sh', 'ش'], ['th', 'ث'], ['ph', 'ف'],
  ['wh', 'و'], ['gh', ''],   ['ng', 'نغ'], ['qu', 'كْوِ'], ['kn', 'ن'],
  ['ee', 'يي'], ['ea', 'يي'], ['oo', 'وو'], ['ou', 'آو'], ['ow', 'آو'],
  ['oa', 'و'],  ['ai', 'يه'], ['ay', 'يه'], ['oy', 'وي'], ['oi', 'وي'],
  ['au', 'و'],  ['aw', 'و'],  ['ie', 'اي'], ['ei', 'يه'], ['ew', 'يو'],
  ['ue', 'يو'], ['ur', 'ير'], ['er', 'ـَر'], ['ir', 'ير'], ['ar', 'ار'], ['or', 'ور'],
  ['a', 'ا'], ['b', 'ب'], ['c', 'ك'], ['d', 'د'], ['e', 'ِ'],
  ['f', 'ف'], ['g', 'غ'], ['h', 'ه'], ['i', 'ِي'], ['j', 'ج'],
  ['k', 'ك'], ['l', 'ل'], ['m', 'م'], ['n', 'ن'], ['o', 'و'],
  ['p', 'ب'], ['q', 'ك'], ['r', 'ر'], ['s', 'س'], ['t', 'ت'],
  ['u', 'َ'], ['v', 'ڤ'], ['w', 'و'], ['x', 'كس'], ['y', 'ي'], ['z', 'ز'],
];

function word(w) {
  let s = w.toLowerCase().replace(/[^a-z']/g, '');
  if (!s) return '';
  // silent final e  (make → ميك, not ميكِ)
  if (s.length > 3 && s.endsWith('e') && !/[aeiou]e$/.test(s.slice(-2))) s = s.slice(0, -1);
  // soft c / g before e, i, y
  s = s.replace(/c(?=[eiy])/g, 'ş').replace(/g(?=[eiy])/g, 'ǰ');

  let out = '';
  for (let i = 0; i < s.length;) {
    if (s[i] === 'ş') { out += 'س'; i++; continue; }
    if (s[i] === 'ǰ') { out += 'ج'; i++; continue; }
    const hit = RULES.find(([k]) => s.startsWith(k, i));
    if (hit) { out += hit[1]; i += hit[0].length; }
    else i++;
  }
  return out;
}

/** Draft transliteration for a word or a whole sentence. */
export function translit(text) {
  return String(text || '')
    .split(/(\s+)/)
    .map(t => (/\s/.test(t) ? t : word(t)))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}
