// Fails CI when any locale is missing a key present in the base locale (en).
import fs from 'node:fs';
import path from 'node:path';
const dirs = ['packages/i18n/locales'].filter((d) => fs.existsSync(d));
let failed = false;
const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, `${p}${k}.`) : [`${p}${k}`]));
for (const dir of dirs) {
  const base = new Set(flat(JSON.parse(fs.readFileSync(path.join(dir, 'en.json'), 'utf8'))));
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const keys = new Set(flat(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))));
    const missing = [...base].filter((k) => !keys.has(k));
    const extra = [...keys].filter((k) => !base.has(k));
    if (missing.length || extra.length) {
      failed = true;
      console.error(`${f}: missing ${missing.length} [${missing.slice(0, 5).join(', ')}] extra ${extra.length}`);
    }
  }
}
if (failed) process.exit(1);
console.log('i18n: all locales complete');
