// Verifies WCAG 2.1 AA contrast for the colour pairs used in client/src/styles.css.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const css = readFileSync(path.resolve(import.meta.dirname, '../client/src/styles.css'), 'utf8');
const tokens = Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
const labels = [...css.matchAll(/\.label-(\w+) \{ background: (#[0-9a-f]{6}); color: (#[0-9a-f]{6}); \}/gi)];
const boardColors = [...readFileSync(path.resolve(import.meta.dirname, '../shared/validation.js'), 'utf8').match(/BOARD_COLORS = \[(.*?)\]/)[1].matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0]);

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const t = (k) => tokens[k];
const pairs = [
  ['body text', t('color-text'), t('color-bg'), 4.5],
  ['text on surface', t('color-text'), t('color-surface'), 4.5],
  ['muted text on surface', t('color-text-muted'), t('color-surface'), 4.5],
  ['muted text on page bg', t('color-text-muted'), t('color-bg'), 4.5],
  ['text on list', t('color-text'), t('color-list-bg'), 4.5],
  ['muted text on list', t('color-text-muted'), t('color-list-bg'), 4.5],
  ['link on surface', t('color-primary'), t('color-surface'), 4.5],
  ['primary button', t('color-on-primary'), t('color-primary'), 4.5],
  ['primary button hover', t('color-on-primary'), t('color-primary-hover'), 4.5],
  ['danger button', t('color-on-danger'), t('color-danger'), 4.5],
  ['danger link', t('color-danger'), t('color-surface'), 4.5],
  ['error message', t('color-error-text'), t('color-error-bg'), 4.5],
  ['success message', t('color-success-text'), t('color-success-bg'), 4.5],
  ['input border', t('color-border-strong'), t('color-surface'), 3],
  ['focus ring on page', t('color-focus'), t('color-text'), 3],
  ['cookie banner text', '#ffffff', t('color-text'), 4.5],
  ['cookie banner link', '#bfdbfe', t('color-text'), 4.5],
  ...labels.map((m) => [`label ${m[1]}`, m[3], m[2], 4.5]),
  ...boardColors.map((c) => [`white text on board ${c}`, '#ffffff', c, 4.5]),
];

let failed = 0;
for (const [name, fg, bg, min] of pairs) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) failed++;
  console.log(`${ok ? '✔' : '✖'} ${name.padEnd(30)} ${fg} on ${bg}  ${r.toFixed(2)}:1 (min ${min}:1)`);
}
if (failed) { console.error(`\n${failed} colour pair(s) fail WCAG AA.`); process.exit(1); }
console.log(`\n✔ All ${pairs.length} colour pairs meet WCAG AA.`);
