// Performance budget for the production build (run after `npm run build`).
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const dir = path.resolve(import.meta.dirname, '../client/dist/assets');
if (!existsSync(dir)) { console.error('Run `npm run build` first.'); process.exit(1); }
const BUDGET_KB = { js: 90, css: 15 }; // gzipped, per file
let failed = false;
let total = 0;
for (const f of readdirSync(dir)) {
  const ext = path.extname(f).slice(1);
  if (!BUDGET_KB[ext]) continue;
  const kb = gzipSync(readFileSync(path.join(dir, f))).length / 1024;
  total += kb;
  const ok = kb <= BUDGET_KB[ext];
  if (!ok) failed = true;
  console.log(`${ok ? '✔' : '✖'} ${f.padEnd(40)} ${kb.toFixed(1)} KB gzip (budget ${BUDGET_KB[ext]} KB)`);
}
console.log(`Total: ${total.toFixed(1)} KB gzip`);
if (failed) process.exit(1);
