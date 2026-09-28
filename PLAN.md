# TaskApp v2 — Implementation Plan

A Trello-style Kanban task manager: boards → lists → cards, drag-and-drop, auth.
Frontend and backend live in one repo and start together from **one terminal** with `npm run dev`.

> **Implementation note:** the backend was built with zero dependencies instead of Express/Prisma/zod/concurrently. It uses Node's built-in `http`, `node:sqlite` and `crypto`, `shared/validation.js`, and `scripts/dev.mjs`. The frontend uses plain CSS (not Tailwind) and native HTML5 drag and drop, with Move controls for touch and keyboard. Same features, fewer moving parts. See README.md.

---

## 1. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Monorepo | npm workspaces (`client/`, `server/`) + `concurrently` | One `npm install`, one `npm run dev` runs both |
| Frontend | React 18 + Vite + TypeScript, React Router | Fast dev server, small bundles |
| Styling | Tailwind CSS | Responsive utilities, easy contrast control |
| Drag & drop | `@dnd-kit` | Accessible (keyboard + screen reader) |
| Data fetching | TanStack Query | Caching, optimistic card moves |
| Forms | `react-hook-form` + `zod` | Schemas shared with the backend |
| Backend | Node + Express + TypeScript | Simple REST API |
| Database | SQLite via Prisma (Postgres in production) | No setup needed locally |
| Auth | JWT in an httpOnly, Secure, SameSite cookie + bcrypt | No tokens in JS |
| Security | helmet, cors, express-rate-limit, csurf-style double-submit token | |
| Analytics | Plausible (cookieless) or GA4, loaded only after consent | |

### Single-terminal setup
```jsonc
// root package.json
"workspaces": ["client", "server", "shared"],
"scripts": {
  "dev": "concurrently -n api,web -c blue,green \"npm:dev -w server\" \"npm:dev -w client\"",
  "build": "npm run build -w shared -w client -w server",
  "start": "npm start -w server"   // prod: Express serves client/dist
}
```
Vite proxies `/api` → `http://localhost:4000`, so there are no CORS issues in dev. In production, Express serves the built React app, so there is one process and one port.

---

## 2. Folder structure
```
Taskappv2/
├─ package.json            # workspaces + dev script
├─ .env.example            # documented vars (no real secrets)
├─ client/                 # React app
│  ├─ public/              # favicon.svg, og-image.png, robots.txt, sitemap.xml
│  └─ src/
│     ├─ pages/            # Landing, Login, Signup, Boards, Board, Privacy, Terms, NotFound
│     ├─ components/       # List, Card, CardModal, CookieBanner, Seo, Header, Footer
│     ├─ lib/              # api client, analytics, consent
│     └─ main.tsx
├─ server/
│  ├─ prisma/schema.prisma
│  └─ src/
│     ├─ routes/           # auth, boards, lists, cards, contact
│     ├─ middleware/       # auth, httpsRedirect, rateLimit, validate, honeypot
│     └─ index.ts
├─ shared/                 # zod schemas and types used by both sides
└─ docs/                   # all the checklist README files (see §5)
```

---

## 3. Features (MVP)

1. **Auth**: sign up, log in, log out, session check (`/api/auth/me`).
2. **Boards**: create, rename, delete, list my boards, pick a background colour.
3. **Lists**: add, rename, reorder (drag), archive.
4. **Cards**: add, edit title/description, due date, labels, checklist, drag between lists (fractional `position` ordering).
5. **Card modal** with keyboard support (Esc closes, focus is trapped inside).
6. **Search/filter** cards on a board.
7. **Public pages**: Landing (one CTA, "Start for free"), Privacy, Terms, Contact form, 404.

**Data model**: `User 1—* Board 1—* List 1—* Card`, `Card *—* Label`, `Card 1—* ChecklistItem`.

**API** (all under `/api`, JSON):
`POST /auth/signup|login|logout`, `GET /auth/me`,
`GET|POST /boards`, `GET|PATCH|DELETE /boards/:id`,
`POST /boards/:id/lists`, `PATCH|DELETE /lists/:id`,
`POST /lists/:id/cards`, `PATCH|DELETE /cards/:id` (a PATCH with `listId` + `position` moves the card),
`POST /contact`.

---

## 4. Launch checklist: how each item is handled

| # | Item | Implementation |
|---|---|---|
| 1 | Privacy policy | `/privacy` page + `docs/PRIVACY_POLICY.md` (what data is collected, cookies, analytics, retention, contact) |
| 2 | Terms & conditions | `/terms` page + `docs/TERMS_AND_CONDITIONS.md` |
| 3 | Remove frontend secrets | Only `VITE_PUBLIC_*` vars reach the client. Secrets (`JWT_SECRET`, `DATABASE_URL`) live in the server's `.env`, which is gitignored. A `.env.example` documents every var. A CI step runs `gitleaks` and greps `client/dist` for secret patterns |
| 4 | Enforce HTTPS | Express middleware redirects `http`→`https` behind a proxy (`trust proxy`, `x-forwarded-proto`). HSTS through helmet. Cookies set `Secure` |
| 5 | Cookie consent banner | `CookieBanner` with Accept / Reject / Customize choices. The choice is stored in the `consent` cookie. Analytics load only after the user accepts. Essential auth cookie is disclosed |
| 6 | Meta titles/descriptions | `<Seo>` component (react-helmet-async) gives every route a unique title and description, plus a canonical URL |
| 7 | Social preview image | `public/og-image.png` (1200×630) with `og:*` and `twitter:card` tags |
| 8 | Favicon | `favicon.svg`, `favicon.ico`, `apple-touch-icon.png`, `site.webmanifest` |
| 9 | Sitemap & robots.txt | `sitemap.xml` generated at build for public routes. `robots.txt` disallows `/app`, `/api` and links the sitemap |
| 10 | Image alt text | Every `<img>` has an `alt` attribute (decorative images use `alt=""`). Enforced by the `eslint-plugin-jsx-a11y` `alt-text` rule |
| 11 | Image compression | `vite-plugin-image-optimizer` (sharp) at build, WebP/AVIF output, `loading="lazy"`, explicit width/height |
| 12 | Page load speed check | Lighthouse CI (`@lhci/cli`) with budgets: Performance ≥ 90, LCP < 2.5s, CLS < 0.1. Route-level code splitting. gzip/brotli through `compression` |
| 13 | Color contrast fixes | Tailwind palette tokens chosen to meet WCAG AA (4.5:1 for text, 3:1 for UI). Checked with axe-core in tests |
| 14 | Mobile responsiveness | Mobile-first layout. Board lists scroll horizontally with snap. Touch sensors for drag. Tested at 360px, 768px and 1280px |
| 15 | Custom 404 page | `NotFound` route catch-all (`*`) on the client, and the server returns 404 JSON for unknown `/api/*` routes |
| 16 | Broken link fixes | `linkinator` runs against the built site in CI. Internal links use `<Link>` only |
| 17 | Form validation | Shared zod schemas: inline errors on the client, the same schemas re-validated on the server (400 with field errors) |
| 18 | Spam protection | Honeypot field + minimum time-to-submit on signup and contact forms, `express-rate-limit` on auth and contact, optional Cloudflare Turnstile |
| 19 | Analytics setup | `lib/analytics.ts` wrapper (page views + key events such as signup, board_created). Gated by consent. Measurement ID read from a public env var |
| 20 | Single clear CTA | The landing page has one primary button, "Start for free" → `/signup`. Other actions are styled as secondary links |

---

## 5. Documentation files to create
- `README.md`: overview, quick start (`npm install && npm run dev`), scripts, environment vars, deployment
- `docs/PRIVACY_POLICY.md`
- `docs/TERMS_AND_CONDITIONS.md`
- `docs/SECURITY.md`: secrets handling, HTTPS, headers, rate limits
- `docs/COOKIES_AND_ANALYTICS.md`: consent flow, analytics events
- `docs/SEO.md`: meta tags, OG image, favicon, sitemap, robots
- `docs/ACCESSIBILITY.md`: alt text, contrast, keyboard use, mobile
- `docs/PERFORMANCE.md`: image compression, Lighthouse budgets, results
- `docs/FORMS_AND_SPAM.md`: validation and spam protection
- `docs/LAUNCH_CHECKLIST.md`: the 20 items as a tickable checklist, each linked to its code

---

## 6. Build phases

1. **Scaffold**: workspaces, Vite + React, Express, Prisma, `concurrently`, lint/format, `.env.example`.
2. **Backend core**: schema and migrations, auth, CRUD for boards, lists and cards, validation, error handler, security middleware.
3. **Frontend core**: routing, auth pages, boards dashboard, board view with drag-and-drop, card modal.
4. **Public and legal pages**: landing page with its CTA, privacy, terms, contact, 404, header and footer links.
5. **SEO and assets**: Seo component, favicon set, OG image, sitemap, robots, image optimisation.
6. **Compliance**: cookie banner and consent-gated analytics, HTTPS/HSTS, spam protection.
7. **Quality pass**: jsx-a11y + axe contrast checks, responsive QA, Lighthouse, linkinator, secret scan.
8. **Docs**: all files in §5, final README.

## 7. Open decisions (defaults assumed)
- **Analytics provider**: Plausible (privacy-friendly) by default. Switch to GA4 if preferred.
- **Deployment target**: one Node host (Render/Railway/Fly) running Express, which serves the client. Vercel would split the frontend and API.
- **Company/contact details** for the legal pages: placeholders until provided.
