// Regenerates raster icons and the social preview image from SVG/HTML using headless Chromium.
// Usage: node scripts/generate-images.mjs   (requires Playwright; see docs/PERFORMANCE.md)
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { const m = await import(process.env.PLAYWRIGHT_MODULE || 'playwright'); chromium = m.chromium || m.default.chromium; }

const pub = path.resolve(import.meta.dirname, '../client/public');
const favicon = readFileSync(path.join(pub, 'favicon.svg'), 'utf8');
const preview = readFileSync(path.join(pub, 'images/board-preview.svg'), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();

async function png(size, file, padding = 0) {
  await page.setViewportSize({ width: size, height: size });
  const bg = padding ? '#1d4ed8' : 'transparent';
  await page.setContent(`<style>html,body{margin:0;background:${bg}}svg{display:block;width:${size - padding * 2}px;height:${size - padding * 2}px;margin:${padding}px}</style>${favicon}`);
  const buf = await page.screenshot({ omitBackground: !padding, type: 'png' });
  if (file) writeFileSync(path.join(pub, file), buf);
  return buf;
}

await png(180, 'apple-touch-icon.png', 18);
await png(192, 'icon-192.png');
await png(512, 'icon-512.png');
const ico32 = await png(32);

// ICO container holding a single 32x32 PNG image.
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
header.writeUInt8(32, 6); header.writeUInt8(32, 7); header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
header.writeUInt32LE(ico32.length, 14); header.writeUInt32LE(22, 18);
writeFileSync(path.join(pub, 'favicon.ico'), Buffer.concat([header, ico32]));

// 1200x630 Open Graph / Twitter card image, saved as a compressed JPEG.
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(`<style>
  body{margin:0;width:1200px;height:630px;display:flex;align-items:center;gap:56px;padding:0 72px;box-sizing:border-box;
    background:linear-gradient(135deg,#eff6ff,#dbeafe);font-family:system-ui,sans-serif;color:#0f172a}
  h1{font-size:64px;line-height:1.05;margin:0 0 20px} p{font-size:28px;color:#334155;margin:0}
  .brand{display:flex;align-items:center;gap:14px;font-size:30px;font-weight:700;margin-bottom:28px}
  .brand svg{width:52px;height:52px} .art svg{width:520px;height:auto;border-radius:18px;box-shadow:0 20px 40px rgb(15 23 42/.2)}
</style><div><div class="brand">${favicon}TaskApp</div><h1>Organise every project on one simple board</h1><p>Free Kanban boards, lists and cards.</p></div><div class="art">${preview}</div>`);
writeFileSync(path.join(pub, 'og-image.jpg'), await page.screenshot({ type: 'jpeg', quality: 82 }));

await browser.close();
console.log('Generated icons, favicon.ico and og-image.jpg in client/public');
