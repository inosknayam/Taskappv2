# Deploying to Hostinger (Business Web Hosting)

This guide deploys TaskApp as a **Node.js web app** in Hostinger's hPanel. The app runs as one Node process that serves both the API and the built React site.

> Hostinger changes hPanel from time to time, so menu names below may differ slightly. If a step doesn't match what you see, search Hostinger's help centre for "Deploy Node.js app".

## Before you start

- **Plan:** Business or Cloud web hosting, where Node.js apps are available. Single and Premium plans can't run the backend.
- **Node.js version:** **22.13 or newer**. The database uses Node's built-in `node:sqlite`, which older versions don't have. If hPanel only offers older versions, stop here and ask for the database layer to be switched.
- **Domain:** a domain or subdomain connected to your Hostinger account, e.g. `tasks.yourdomain.com`.
- **Session secret:** generate one on your computer and keep it somewhere safe:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
  ```

## 1. Create the Node.js app

1. Log in to **hPanel** and go to **Websites**.
2. Click **Add website**, then choose **Node.js Apps** (or open an existing website and find **Node.js**).
3. Choose **Import Git repository** and connect your GitHub account.
4. Select the repository **inosknayam/Taskappv2** and the branch **main**.

## 2. Build settings

| Setting | Value |
|---|---|
| Framework / preset | **Other** (or "Express" if "Other" isn't offered) |
| Node.js version | **22.x or newer** (22.13+) |
| Root directory | `/` (the repository root) |
| Build command | `npm install && npm run build` |
| Start command | `npm start` |
| Entry file (only if asked) | `server/src/index.js` |
| Output directory (only if asked) | `client/dist` |

- **If hPanel asks for an entry file instead of a start command:** use `server/src/index.js`. In that case make sure `NODE_ENV=production` is set in step 3, because `npm start` normally sets it for you.

## 3. Environment variables

Add these in the app's **Environment variables** section. Some are needed during the build, so add them **before** the first deploy.

| Name | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Turns on HTTPS redirect, secure cookies and static serving |
| `SESSION_SECRET` | the value you generated | **Secret.** At least 32 characters. The app refuses to start without it |
| `VITE_PUBLIC_SITE_URL` | `https://tasks.yourdomain.com` | Used **at build time** for canonical URLs, social image URLs and the sitemap. No trailing slash |
| `DATABASE_FILE` | see step 4 | Where the SQLite database is stored |
| `VITE_PUBLIC_PLAUSIBLE_DOMAIN` | `tasks.yourdomain.com` | Optional. Leave it unset to disable analytics |

- **Don't set `PORT`.** Hostinger normally sets it, and the app reads it automatically.
- **Changing a `VITE_PUBLIC_` variable** only takes effect after a **redeploy**, because these values are baked into the build.

## 4. Keep the database safe across deploys

The database is a single file. By default it's stored inside the app folder (`server/data/taskapp.db`), and **a redeploy may replace that folder and delete all accounts and boards.**

1. Open **Files → File Manager** (or connect over SSH) and find your home directory, which usually looks like `/home/u123456789/`.
2. Create a folder **outside** the website and app folders, e.g. `/home/u123456789/taskapp-data/`.
3. Set `DATABASE_FILE=/home/u123456789/taskapp-data/taskapp.db`, using your real home path.
4. After the first deploy, sign up once. Then check in File Manager that `taskapp.db` appeared in that folder.

**Backups:** download `taskapp.db` regularly from File Manager. Also download the `taskapp.db-wal` file if it's there, preferably while the app is stopped.

## 5. Deploy

1. Click **Deploy** and watch the build log. A successful build prints the Vite `dist/` file list, and the app log shows:
   ```
   API listening on http://0.0.0.0:<port> (production)
   ```
2. Open `https://tasks.yourdomain.com/api/health`. It should return `{"ok":true}`.
3. Open the home page, sign up and create a board.

## 6. HTTPS

1. In hPanel go to **Security → SSL** and make sure an SSL certificate is **active** for the domain. Hostinger's free SSL is fine.
2. The app itself redirects HTTP to HTTPS and sends HSTS headers. It relies on the `X-Forwarded-Proto` header from Hostinger's proxy.
3. **If you see "too many redirects" or the site won't load:**
   1. Set `FORCE_HTTPS=false` in the environment variables and redeploy.
   2. Turn on **Force HTTPS** for the domain in hPanel instead, so Hostinger does the redirect.

## 7. Updating the site

- Push or merge changes to `main` on GitHub. If automatic deployment is enabled, Hostinger rebuilds and restarts the app.
- If it isn't enabled, click **Redeploy** in hPanel.
- Your data survives redeploys as long as `DATABASE_FILE` points outside the app folder (step 4).

## 8. After it's live

- [ ] Visit `https://tasks.yourdomain.com/sitemap.xml` and `/robots.txt`. They should list your real domain.
- [ ] Submit the sitemap in Google Search Console.
- [ ] Paste your URL into opengraph.xyz to check the social preview image.
- [ ] Try a made-up URL such as `/xyz`. You should see the custom 404 page.
- [ ] On a first visit in a private window, the cookie banner should appear.
- [ ] If analytics is enabled, click **Accept analytics** and check Plausible's realtime view.
- [ ] Work through the rest of [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md).

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Build fails with `node:sqlite` or "No such built-in module" | Node version is older than 22.13. Choose a newer version in the app settings |
| App crashes on start: `SESSION_SECRET must be set…` | Add `SESSION_SECRET` (32+ characters) and redeploy |
| Page says "Client not built" | The build command didn't run `npm run build`. Check the build settings |
| "Too many redirects" | See step 6.3 (`FORCE_HTTPS=false` plus hPanel's Force HTTPS) |
| Accounts disappear after a deploy | `DATABASE_FILE` is inside the app folder. See step 4 |
| Social image or canonical links point to localhost | `VITE_PUBLIC_SITE_URL` wasn't set before the build. Set it and redeploy |
| Login works but you're logged out immediately | The site is being opened over `http://`. Make sure SSL is active and you're using `https://` |
