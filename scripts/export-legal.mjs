// Writes docs/legal/<doc>.md from apps/web/lib/legal.ts (the in-app master) so counsel can review plain documents.
import { readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';
const src = readFileSync(new URL('../apps/web/lib/legal.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { LEGAL } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const gsrc = ts.transpileModule(readFileSync(new URL('../apps/web/lib/guides.ts', import.meta.url), 'utf8').replace(/^import type .*$/m, ''), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { GUIDES } = await import(`data:text/javascript;base64,${Buffer.from(gsrc).toString('base64')}`);
writeFileSync(new URL('../docs/merchant-guide.md', import.meta.url), [
  `# ${GUIDES.merchants.title}`, '', `_Last updated ${GUIDES.merchants.updated}. Send to launch merchants; fill in the [BRACKETED] items first. Also at /{locale}/guide/merchants._`, '',
  ...GUIDES.merchants.sections.flatMap((s) => [`## ${s.h}`, '', ...s.p.map((p) => `- ${p}`), '']),
].join('\n'));
console.log('wrote docs/merchant-guide.md');
for (const [key, d] of Object.entries(LEGAL)) {
  const body = [
    `# ${d.title}`, '',
    `_Last updated ${d.updated}. DRAFT for review by counsel: complete every [BRACKETED] item for each country before launch. Shown in the app at /{locale}/legal/${key}._`, '',
    ...d.sections.flatMap((s) => [`## ${s.h}`, '', ...s.p.flatMap((p) => [p, ''])]),
  ].join('\n');
  writeFileSync(new URL(`../docs/legal/${key}.md`, import.meta.url), body);
  console.log('wrote docs/legal/' + key + '.md');
}
