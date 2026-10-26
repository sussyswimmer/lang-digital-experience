// Validates content/strings/*.json: kinds, both languages present, dot.case ids, no id defined twice,
// and every literal id used in src/ (t('…'), bind(el, '…'), say('…'), queue('…')) exists.
// Exits 1 on errors; ids built at runtime (template strings) are reported as prefixes only.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const KINDS = new Set(['ui', 'narration', 'label', 'alt']);
const errors = [];
const warnings = [];
const all = {};
for (const f of readdirSync('content/strings').filter((x) => x.endsWith('.json')).sort()) {
  const data = JSON.parse(readFileSync(`content/strings/${f}`, 'utf8'));
  for (const [id, e] of Object.entries(data)) {
    if (all[id]) errors.push(`${id}: defined in ${all[id].file} and ${f}`);
    all[id] = { ...e, file: f };
    if (!/^[a-z0-9]+(\.[a-z0-9-]+)+$/.test(id)) errors.push(`${f} ${id}: id is not dot.case`);
    if (!KINDS.has(e.kind)) errors.push(`${f} ${id}: kind "${e.kind}"`);
    if (!e.en?.trim()) errors.push(`${f} ${id}: missing en`);
    if (!e.vi?.trim()) errors.push(`${f} ${id}: missing vi`);
    else if (e.vi === e.en && !/^[\d\s.,!?%·:/-]*$/.test(e.en)) warnings.push(`${f} ${id}: vi identical to en`);
    for (const v of (e.en.match(/\{\w+\}/g) || [])) if (!e.vi?.includes(v)) errors.push(`${f} ${id}: vi lacks ${v}`);
  }
}

function* walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(ts|js)$/.test(f)) yield p;
  }
}
const used = new Set();
const prefixes = new Set();
const call = /\b(?:t|bind|say|queue|replay|caption|speak)\(\s*(?:[\w.]+,\s*)?(['"`])([a-z0-9]+\.[a-z0-9.\-]*)(\$\{)?/g;
for (const file of walk('src')) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(call)) {
    if (m[3]) prefixes.add(m[2]);
    else if (!used.has(m[2])) {
      used.add(m[2]);
      if (!all[m[2]]) errors.push(`${file}: uses unknown string "${m[2]}"`);
    }
  }
}
for (const p of prefixes) if (!Object.keys(all).some((id) => id.startsWith(p))) errors.push(`no strings start with "${p}" (template id)`);

const n = Object.keys(all).length;
const machine = Object.values(all).filter((e) => e.viStatus !== 'reviewed').length;
console.log(`${n} strings, ${machine} Vietnamese drafts awaiting review, ${used.size} literal ids used in src`);
for (const w of warnings) console.warn('warn  ' + w);
for (const e of errors) console.error('error ' + e);
process.exit(errors.length ? 1 : 0);
