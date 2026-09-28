# Performance: Image Compression & Page Load Speed

## Image compression

- **SVG first:** the logo, hero illustration and 404 illustration are hand-written SVGs under 2 KB each.
- **Raster images are pre-compressed** by `npm run images` (`scripts/generate-images.mjs`):
  - `og-image.jpg`: 1200×630 JPEG at quality 82, about 60 KB;
  - PNG icons: 2–10 KB each.
- **Size budgets:** `npm run check:images` fails if an image goes over budget:
  - SVG: 20 KB;
  - PNG: 100 KB;
  - JPEG, WebP or AVIF: 150 KB.
- Every `<img>` has explicit `width` and `height`, which prevents layout shift (CLS). Add `loading="lazy"` to any image below the fold.
- **Adding photos:** export them as WebP or AVIF at quality 75–80, no wider than 2× their display size. Use `npx @squoosh/cli` or `sharp` if needed.

## Page load speed

Built in:
- **Code splitting:** every page except the landing page is `React.lazy`-loaded, and React is in its own long-cached `react` chunk.
- **Compression:** the Node server compresses HTML, JS, CSS, SVG and JSON with **Brotli**, falling back to gzip.
- **Caching:** hashed `/assets/*` files get `Cache-Control: public, max-age=31536000, immutable`. HTML is `no-cache`.
- No web fonts (system font stack), no CSS framework and no analytics until consent.
- Small dependency footprint: only React, ReactDOM and React Router ship to the browser.

## Checking speed

```bash
npm run build
npm run check:bundle   # gzip size budget per JS/CSS file (JS ≤ 90 KB, CSS ≤ 15 KB)
npm run lighthouse     # Lighthouse CI, 3 runs each on /, /signup, /privacy and a 404 URL
```

`lighthouserc.json` fails the run unless:

| Metric | Budget |
|---|---|
| Performance score | ≥ 90 |
| Accessibility score | ≥ 95 |
| Best Practices score | ≥ 90 |
| SEO score | ≥ 90 |
| Largest Contentful Paint | < 2.5 s |
| Cumulative Layout Shift | < 0.1 |
| Total Blocking Time | < 200 ms |

Reports are saved to `.lighthouseci/`. For a quick manual check, open Chrome DevTools → Lighthouse → Mobile, or use https://pagespeed.web.dev once deployed.
