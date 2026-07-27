/* Validates every content file: JSON syntax, required fields,
   duplicate ids, missing translations.  Run: node scripts/check-content.mjs */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');
const read = p => JSON.parse(readFileSync(p, 'utf8'));

let errors = 0, warnings = 0;
const err = m => { console.error('  ✗ ' + m); errors++; };
const warn = m => { console.warn('  ! ' + m); warnings++; };

const index = read(join(DATA, 'index.json'));
const seenIds = new Map();
const seenEn = new Map();
let words = 0, sentences = 0, withEx = 0, withEmoji = 0;

for (const meta of index.units) {
  const file = join(DATA, meta.file || `units/${meta.id}.json`);
  if (!existsSync(file)) { err(`missing file for unit ${meta.id}`); continue; }
  let u;
  try { u = read(file); } catch (e) { err(`${meta.id}: bad JSON — ${e.message}`); continue; }

  if (u.id !== meta.id) err(`${meta.id}: id mismatch inside file (${u.id})`);
  if (!u.title?.ar || !u.title?.en) err(`${meta.id}: missing title`);

  for (const w of u.words || []) {
    words++;
    if (!w.id) err(`${meta.id}: word without id (${w.en})`);
    if (seenIds.has(w.id)) err(`duplicate id "${w.id}" in ${meta.id} and ${seenIds.get(w.id)}`);
    seenIds.set(w.id, meta.id);
    if (!w.en) err(`${meta.id}: word without english`);
    if (!w.ar) err(`${meta.id}: "${w.en}" has no Arabic meaning`);
    if (!w.tr) warn(`${meta.id}: "${w.en}" has no transliteration`);
    if (w.emoji) withEmoji++;
    if (w.ex?.en) {
      withEx++;
      if (!w.ex.ar) warn(`${meta.id}: example for "${w.en}" has no Arabic`);
    }
    const key = w.en.toLowerCase();
    if (seenEn.has(key) && seenEn.get(key) !== meta.id) {
      // same word in two units is intentional recycling, just report once
      seenEn.set(key, seenEn.get(key) + ',' + meta.id);
    } else seenEn.set(key, meta.id);
  }

  for (const s of u.sentences || []) {
    sentences++;
    if (!s.en || !s.ar) err(`${meta.id}: incomplete sentence "${s.en || s.ar}"`);
    if (seenIds.has(s.id)) err(`duplicate id "${s.id}"`);
    seenIds.set(s.id, meta.id);
  }
}

const abc = read(join(DATA, 'alphabet.json'));
if (abc.letters.length !== 26) err(`alphabet has ${abc.letters.length} letters, expected 26`);

const repeats = [...seenEn.entries()].filter(([, v]) => v.includes(','));

console.log('\n─────────────────────────────');
console.log(`  الدروس     : ${index.units.length}`);
console.log(`  الكلمات    : ${words}`);
console.log(`  الجمل      : ${sentences}`);
console.log(`  أمثلة      : ${withEx} (${Math.round(withEx / words * 100)}%)`);
console.log(`  إيموجي     : ${withEmoji} (${Math.round(withEmoji / words * 100)}%)`);
console.log(`  حروف       : ${abc.letters.length} + ${abc.groups.length} أصوات مركبة`);
console.log(`  كلمات مكررة عبر الدروس: ${repeats.length}`);
console.log('─────────────────────────────');
console.log(errors ? `\n❌ ${errors} error(s), ${warnings} warning(s)` : `\n✅ all good (${warnings} warning(s))`);
process.exit(errors ? 1 : 0);
