// Broken-link check for internal links in the React code and Markdown docs.
// Internal app links must match a real route or a file in client/public; doc links must point to existing files.
// External links are listed so they can be checked with `--external` (makes network requests).
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const ROUTES = [/^\/$/, /^\/(login|signup|contact|privacy|terms|boards)$/, /^\/boards\/:?\w+$/];
const problems = [];
const external = new Set();
const walk = (dir) => (existsSync(dir) ? readdirSync(dir).flatMap((f) => {
  const p = path.join(dir, f);
  if (['node_modules', 'dist', '.git'].includes(f)) return [];
  return statSync(p).isDirectory() ? walk(p) : [p];
}) : []);

function checkAppPath(href, where) {
  const [p] = href.split(/[?#]/);
  if (ROUTES.some((re) => re.test(p.replace(/\/$/, '') || '/'))) return;
  if (existsSync(path.join(root, 'client/public', p))) return;
  problems.push(`${where}: broken internal link ${href}`);
}

let count = 0;
for (const file of walk(path.join(root, 'client/src')).filter((f) => /\.(jsx?|css)$/.test(f))) {
  const src = readFileSync(file, 'utf8');
  const rel = path.relative(root, file);
  for (const m of src.matchAll(/\b(?:to|href|src)=["'{`]+([^"'`}]+)["'`}]/g)) {
    const href = m[1];
    if (href.includes('${')) continue;
    count++;
    if (/^https?:\/\//.test(href)) external.add(href);
    else if (href.startsWith('/')) checkAppPath(href, rel);
  }
}

for (const file of [...walk(path.join(root, 'docs')), path.join(root, 'README.md')].filter((f) => f.endsWith('.md') && existsSync(f))) {
  const src = readFileSync(file, 'utf8');
  const rel = path.relative(root, file);
  const legal = /PRIVACY_POLICY|TERMS_AND_CONDITIONS/.test(file); // rendered inside the app, so links are app routes
  for (const m of src.matchAll(/\]\(([^)\s]+)\)/g)) {
    const href = m[1];
    count++;
    if (/^https?:\/\//.test(href)) external.add(href);
    else if (/^mailto:/.test(href) || href.startsWith('#')) continue;
    else if (legal || href.startsWith('/')) checkAppPath(href, rel);
    else if (!existsSync(path.resolve(path.dirname(file), href.split('#')[0]))) problems.push(`${rel}: broken link ${href}`);
  }
}

if (process.argv.includes('--external')) {
  for (const url of external) {
    try {
      const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
      if (res.status >= 400) problems.push(`external link ${url} returned ${res.status}`);
    } catch (e) { problems.push(`external link ${url} failed: ${e.message}`); }
  }
}

if (problems.length) {
  console.error('✖ Link check failed:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(`✔ ${count} links checked, no broken internal links. ${external.size} external link(s)${process.argv.includes('--external') ? ' verified' : ' (run with --external to verify)'}.`);
