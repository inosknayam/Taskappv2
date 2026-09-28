// Image quality gate:
//  - every <img> in the React code has alt text (alt="" allowed for decorative images) plus width/height (prevents layout shift)
//  - every image in client/public stays within its size budget (compression check)
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const problems = [];
const walk = (dir) => (existsSync(dir) ? readdirSync(dir).flatMap((f) => {
  const p = path.join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
}) : []);

let imgCount = 0;
for (const file of walk(path.join(root, 'client/src')).filter((f) => f.endsWith('.jsx'))) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/<img\b[\s\S]*?\/?>/g)) {
    imgCount++;
    const tag = m[0];
    const rel = path.relative(root, file);
    if (!/\balt=/.test(tag)) problems.push(`${rel}: <img> without alt attribute: ${tag.slice(0, 60)}…`);
    if (!/\bwidth=/.test(tag) || !/\bheight=/.test(tag)) problems.push(`${rel}: <img> without width/height: ${tag.slice(0, 60)}…`);
    const srcAttr = tag.match(/src="([^"]+)"/)?.[1];
    if (srcAttr?.startsWith('/') && !existsSync(path.join(root, 'client/public', srcAttr))) problems.push(`${rel}: image ${srcAttr} does not exist`);
  }
}

const BUDGET = { '.svg': 20, '.png': 100, '.ico': 20, '.jpg': 150, '.jpeg': 150, '.webp': 150, '.avif': 150, '.gif': 100 }; // KB
const images = walk(path.join(root, 'client/public')).filter((f) => BUDGET[path.extname(f).toLowerCase()]);
for (const f of images) {
  const kb = statSync(f).size / 1024;
  const max = BUDGET[path.extname(f).toLowerCase()];
  const line = `${path.relative(root, f).padEnd(44)} ${kb.toFixed(1).padStart(7)} KB (budget ${max} KB)`;
  if (kb > max) problems.push(`over budget: ${line}`);
  else console.log(`✔ ${line}`);
}

if (problems.length) {
  console.error('✖ Image check failed:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(`✔ ${imgCount} <img> tags have alt text and dimensions; ${images.length} image files within budget.`);
