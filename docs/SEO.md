# SEO: Meta Tags, Social Preview, Favicon, Sitemap & robots.txt

## Meta titles and descriptions

- `client/index.html` holds the default title, description, canonical, Open Graph and Twitter tags. These are what crawlers and link unfurlers see before JavaScript runs.
- Each page calls `useSeo({ title, description, path, noindex })` from `client/src/lib/seo.js`. The hook sets a **unique** `<title>` ("Page | TaskApp"), meta description, canonical URL, `og:*`/`twitter:*` title, description and URL, and `robots`.

| Route | Title | Indexed |
|---|---|---|
| `/` | TaskApp – Simple Kanban boards for getting things done | yes |
| `/signup` | Create your free account \| TaskApp | yes |
| `/login` | Log in \| TaskApp | yes |
| `/contact` | Contact us \| TaskApp | yes |
| `/privacy` | Privacy Policy \| TaskApp | yes |
| `/terms` | Terms & Conditions \| TaskApp | yes |
| `/boards`, `/boards/:id` | (private) | `noindex` |
| 404 | Page not found \| TaskApp | `noindex` |

Keep titles under about 60 characters and descriptions between 70 and 160.

## Social preview image

- `client/public/og-image.jpg` is 1200×630 and about 60 KB. It is referenced by `og:image` and `twitter:image` (with `summary_large_image`), plus `og:image:alt`.
- The URLs are absolute and built from `VITE_PUBLIC_SITE_URL`, so **set it to your production URL before building**.
- Regenerate it with `npm run images` (uses Playwright/Chromium, see `scripts/generate-images.mjs`).
- Test it with the Facebook Sharing Debugger, the LinkedIn Post Inspector or opengraph.xyz.

## Favicon

| File | Use |
|---|---|
| `favicon.svg` | modern browsers (scales perfectly) |
| `favicon.ico` | legacy browsers, 32×32 |
| `apple-touch-icon.png` | iOS home screen, 180×180 |
| `icon-192.png`, `icon-512.png` | Android / PWA via `site.webmanifest` |

## Sitemap and robots.txt

Both files are **generated at build time** by the `taskapp-seo-files` plugin in `client/vite.config.js`, using `VITE_PUBLIC_SITE_URL`:

- `dist/sitemap.xml` lists the public routes, with `lastmod` set to the build date.
- `dist/robots.txt` allows everything except `/boards` and `/api/`, and links to the sitemap.

When you add a public page:
1. add it to `PUBLIC_ROUTES` in `vite.config.js`;
2. add it to `SPA_ROUTES` in `server/src/static.js`;
3. add it to the route list in `scripts/check-links.mjs`.

Then submit the sitemap in Google Search Console and Bing Webmaster Tools.

## Real 404 status

Unknown URLs are served the app shell with **HTTP 404** (`server/src/static.js`), so search engines don't index soft-404s. The React `NotFound` page renders the friendly message.
