// Fails if secrets could reach the browser:
//  1. client code may only read import.meta.env.VITE_PUBLIC_* (plus Vite built-ins),
//  2. no secret-looking strings in client source or the built bundle,
//  3. no real .env files are tracked by git.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const problems = [];
const BUILTINS = new Set(['MODE', 'DEV', 'PROD', 'SSR', 'BASE_URL']);
const PATTERNS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/\b(sk|rk)_(live|test)_[0-9a-zA-Z]{16,}/, 'Stripe secret key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key'],
  [/\bgh[pousr]_[0-9A-Za-z]{30,}/, 'GitHub token'],
  [/\bxox[baprs]-[0-9A-Za-z-]{10,}/, 'Slack token'],
  [/\bsk-[A-Za-z0-9_-]{32,}/, 'API secret key'],
  [/(SESSION_SECRET|JWT_SECRET|DATABASE_URL|PRIVATE_KEY|API_SECRET)\s*[:=]\s*['"][^'"]{8,}/, 'hard-coded secret'],
];

function walk(dir, exts) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p, exts) : exts.some((e) => p.endsWith(e)) ? [p] : [];
  });
}

for (const file of walk(path.join(root, 'client/src'), ['.js', '.jsx'])) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/import\.meta\.env\.([A-Z0-9_]+)/g)) {
    if (!BUILTINS.has(m[1]) && !m[1].startsWith('VITE_PUBLIC_')) problems.push(`${path.relative(root, file)}: reads non-public env var ${m[1]}`);
  }
  if (/process\.env/.test(src)) problems.push(`${path.relative(root, file)}: uses process.env in browser code`);
}

const scan = [...walk(path.join(root, 'client/src'), ['.js', '.jsx', '.css']), ...walk(path.join(root, 'client/dist'), ['.js', '.html', '.css', '.map'])];
for (const file of scan) {
  const src = readFileSync(file, 'utf8');
  for (const [re, what] of PATTERNS) if (re.test(src)) problems.push(`${path.relative(root, file)}: looks like a ${what}`);
  if (file.endsWith('.map')) problems.push(`${path.relative(root, file)}: source maps should not be deployed`);
}

try {
  const tracked = execSync('git ls-files', { cwd: root, encoding: 'utf8' }).split('\n');
  for (const f of tracked) if (/(^|\/)\.env(\.|$)/.test(f) && !f.endsWith('.env.example')) problems.push(`${f}: .env file is committed to git`);
} catch { /* not a git checkout */ }

if (problems.length) {
  console.error('✖ Secret check failed:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(`✔ Secret check passed (${scan.length} files scanned, only VITE_PUBLIC_* env vars exposed).`);
