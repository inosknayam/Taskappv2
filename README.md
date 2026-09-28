# TaskApp

A Trello-style Kanban task manager. Organise projects into **boards → lists → cards**, drag cards between lists, and add descriptions, due dates, labels and checklists.

- **Frontend:** React 18 + Vite + React Router (`client/`)
- **Backend:** zero-dependency Node.js API using built-in `http`, `node:sqlite` and `crypto` (`server/`)
- **Shared:** validation rules used by both sides (`shared/`)
- **One terminal:** `npm run dev` starts both the frontend and the backend.

## Quick start

Requires **Node.js 22.13 or newer** (for the built-in `node:sqlite`).

```bash
npm install          # installs the client dependencies (the server has none)
cp .env.example .env # optional in development
npm run dev          # api → http://localhost:4000, web → http://localhost:5173
```

Open http://localhost:5173. Output from both processes appears in the same terminal, prefixed `[api]` and `[web]`, and Ctrl+C stops both. Vite proxies `/api` to the server, so there is no CORS setup.

## Production

```bash
npm run build        # builds client/dist (plus sitemap.xml and robots.txt)
SESSION_SECRET=... VITE_PUBLIC_SITE_URL=https://your-domain npm start
```

In production, the Node server serves both the API and the built React app on one port, with HTTPS redirect, HSTS, Brotli/gzip compression and long-lived asset caching.

It deploys to any Node host (Render, Railway, Fly.io, a VPS):
- **Build command:** `npm install && npm run build`
- **Start command:** `npm start`
- **Health check:** `/api/health`

Mount a persistent disk for `DATABASE_FILE`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API + web dev servers in one terminal |
| `npm run build` | Production build of the client |
| `npm start` | Production server (API + static client) |
| `npm test` | API and security tests (`node --test`) |
| `npm run lint` | ESLint with strict `jsx-a11y` accessibility rules |
| `npm run check` | Secrets, colour contrast, images/alt text and broken-link checks |
| `npm run check:bundle` | JS/CSS gzip size budget (after build) |
| `npm run lighthouse` | Lighthouse CI performance, accessibility and SEO budgets |
| `npm run images` | Regenerate favicons and the social preview image |

## Environment variables

See [.env.example](.env.example).
- Only variables prefixed `VITE_PUBLIC_` reach the browser.
- `SESSION_SECRET` is required in production.

## Project structure

```
client/           React app (pages, components, lib, public assets)
server/src/       API: app.js, routes/, security.js, auth.js, db.js, static.js
server/test/      API + security tests
shared/           validation shared by client and server
scripts/          dev runner and quality checks
docs/             policies and guides (see below)
```

## API

All endpoints are under `/api`, send and receive JSON, and use cookie sessions. Mutating requests need the `X-Requested-With: XMLHttpRequest` header.

| Method | Path | |
|---|---|---|
| POST | `/auth/signup`, `/auth/login`, `/auth/logout` | account |
| GET / DELETE | `/auth/me` | current user / delete account |
| POST | `/auth/forgot-password`, `/auth/reset-password` | email a reset link / set a new password |
| GET / POST | `/boards` | list / create (creates To do, Doing, Done) |
| GET / PATCH / DELETE | `/boards/:id` | board with lists and cards |
| POST | `/boards/:id/lists` | add list |
| PATCH / DELETE | `/lists/:id` | rename, or move with `{ index }` |
| POST | `/lists/:id/cards` | add card |
| PATCH / DELETE | `/cards/:id` | edit fields, or move with `{ listId, index }` |
| POST | `/contact` | contact form |
| GET | `/health` | health check |

## Documentation

- [Deploy to Hostinger](docs/DEPLOY_HOSTINGER.md): step-by-step hPanel guide for Business hosting
- [Launch checklist](docs/LAUNCH_CHECKLIST.md): all 20 launch items and how each is verified
- [Privacy Policy](docs/PRIVACY_POLICY.md)
- [Terms & Conditions](docs/TERMS_AND_CONDITIONS.md)
- [Security](docs/SECURITY.md): frontend secrets, HTTPS, headers, auth, CSRF
- [Cookies & analytics](docs/COOKIES_AND_ANALYTICS.md): consent banner, Plausible setup, events
- [SEO](docs/SEO.md): meta tags, social image, favicon, sitemap, robots.txt, 404
- [Accessibility](docs/ACCESSIBILITY.md): alt text, colour contrast, mobile responsiveness
- [Performance](docs/PERFORMANCE.md): image compression, page speed budgets
- [Forms & spam](docs/FORMS_AND_SPAM.md): validation, honeypot, rate limiting
- [Implementation plan](PLAN.md)
