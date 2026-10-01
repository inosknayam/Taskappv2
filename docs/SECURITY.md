# Security

How TaskApp handles secrets, HTTPS and common web attacks. Report vulnerabilities through the in-app [contact form](../client/src/pages/Contact.jsx) (`/contact`). Do not open public issues for them.

## Removing frontend secrets

- **Browser code only sees `VITE_PUBLIC_*` variables.** `client/vite.config.js` sets `envPrefix: 'VITE_PUBLIC_'`, so Vite drops every other variable from the bundle. Values starting with `VITE_PUBLIC_` are public by definition: they are not secrets.
- **Server secrets** (`SESSION_SECRET`, `DATABASE_FILE`) are read only by `server/src/config.js`. In production the server refuses to start without a `SESSION_SECRET` of at least 32 characters.
- **No tokens in JavaScript.** The session is stored in an `httpOnly` cookie, so page scripts cannot read it and an XSS bug cannot steal it.
- **`.env` is gitignored.** Only `.env.example` (with no values) is committed.
- **Source maps are disabled** in production builds (`build.sourcemap: false`).
- **Automated check:** `npm run check:secrets` fails if:
  - client code reads a non-public env var or `process.env`;
  - secret-looking strings (private keys, Stripe/AWS/GitHub/Slack tokens, hard-coded secrets) appear in `client/src` or `client/dist`;
  - a `.env` file is tracked by git.
  It runs in CI (`.github/workflows/ci.yml`).

If a secret was ever committed, **rotate it** (generate a new value). Deleting it from git is not enough.

## Enforcing HTTPS

- In production (`NODE_ENV=production`), `server/src/security.js › enforceHttps` redirects every plain-HTTP request to `https://` with a **308**. It reads `X-Forwarded-Proto`, so it works behind Render, Railway, Fly, Heroku, nginx and similar proxies. `/api/health` is exempt so health checks keep working.
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` tells browsers to use HTTPS only for two years.
- The CSP includes `upgrade-insecure-requests`, and the session and consent cookies are `Secure` on HTTPS.
- Set `FORCE_HTTPS=false` only for local production smoke tests over `http://localhost`.
- Tested in `server/test/security.test.js`.

## Security headers

Set on every response (`securityHeaders`):

| Header | Value / purpose |
|---|---|
| Content-Security-Policy | `default-src 'self'`; scripts only from self + plausible.io; `frame-ancestors 'none'`; `object-src 'none'` |
| X-Content-Type-Options | `nosniff` |
| X-Frame-Options | `DENY` (clickjacking) |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | camera, microphone and geolocation disabled |
| Cross-Origin-Opener-Policy | `same-origin` |

## Authentication

- Passwords are hashed with **scrypt** (N=16384, r=8, p=1, 16-byte random salt) and compared in constant time.
- The session token is an HMAC-SHA256 signed payload with a 7-day expiry, in a cookie set `HttpOnly; SameSite=Lax; Secure`.
- Login runs a dummy hash for unknown emails, so response timing doesn't reveal which accounts exist. The error message is always "Incorrect email or password".
- **Board access:** every board, list and card request checks the caller's role on that board (`boardAccess` in `server/src/routes/boards.js`).
  - People with no access get **404**, so board IDs can't be probed.
  - People with too low a role get **403**.

| Action | Owner | Editor | Viewer |
|---|---|---|---|
| View board, lists, cards and members | ✅ | ✅ | ✅ |
| Add, edit, move or delete lists and cards; rename or recolour the board | ✅ | ✅ | ❌ |
| Share, change roles, remove members | ✅ | ❌ | ❌ |
| Delete the board | ✅ | ❌ | ❌ |
| Leave the board | – | ✅ | ✅ |

- **Sharing:**
  - Only works with existing accounts, and is rate-limited to 30 share requests per IP every 15 minutes.
  - A board can have at most 50 members.
  - The invitee gets a best-effort notification email.
  - Deleting an account removes its memberships; deleting a board removes all of its shares.

## Password reset

- **Flow:**
  1. `POST /api/auth/forgot-password` emails a link to `/reset-password?token=…`.
  2. `POST /api/auth/reset-password` sets the new password and logs the user in.
- **Tokens:**
  - each token is 32 random bytes;
  - only its **SHA-256 hash** is stored (`password_resets` table), so a database leak doesn't expose usable links;
  - links expire after **1 hour** and are **single use**, and requesting a new link cancels older ones.
- **No account enumeration:** the forgot-password endpoint always returns the same message, whether or not the email has an account.
- **Old sessions are revoked:** a reset updates `users.password_changed_at`, and any session cookie issued before that is rejected. This means a reset logs out an attacker who had the old password.
- **Token kept out of logs and analytics:**
  - the reset page removes the token from the address bar as soon as it loads, and robots.txt disallows `/reset-password`;
  - analytics only records the path, never the query string.
- **Rate limits and spam:**
  - forgot-password: 5 requests per IP per hour;
  - reset: 20 attempts per IP every 15 minutes;
  - the forgot form also has the honeypot and time trap.
- **Email delivery:** `server/src/mailer.js` is a dependency-free SMTP client.
  - It uses implicit TLS on port 465, or STARTTLS on 587.
  - It refuses to send credentials over an unencrypted connection.
  - Configure it with `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM`, all **server-only** values. Without `SMTP_HOST`, emails are printed to the server console.

## File attachments

`server/src/routes/attachments.js`

- **Allowed types (allow-list):**
  - PNG, JPEG, GIF, WebP, PDF, TXT, CSV, DOCX, XLSX, PPTX and ZIP;
  - SVG, HTML and other formats that can run scripts are rejected.
- **Content check:** the first bytes of each file must match its declared type (for example, a PNG must start with the PNG signature), so a renamed HTML page or executable is rejected. Text files may not contain NUL bytes.
- **Size and count limits:**
  - `MAX_UPLOAD_MB` per file, 10 MB by default. The limit is checked against `Content-Length` and again while streaming, so oversized uploads are cut off and never fully written;
  - at most 20 attachments per card;
  - 60 uploads per IP every 15 minutes.
- **Storage:**
  - files are saved under random 32-character hex names in `UPLOAD_DIR`, outside the web root and never served as static files;
  - original file names are cleaned: paths, control characters and header-breaking characters are stripped.
- **Downloads go through the API and check board access:**
  - viewers can download, editors and owners can also upload and delete, and strangers get 404;
  - responses send `X-Content-Type-Options: nosniff` and a `sandbox` Content-Security-Policy;
  - only images are shown inline, and everything else is forced to download.
- **Cleanup:** a database trigger queues a file for deletion whenever its attachment row is removed. That includes rows removed because a card, list, board or account was deleted. The queue is purged after every delete request and at startup.

- The cookie is `SameSite=Lax`.
- Every non-GET API request must send `X-Requested-With: XMLHttpRequest`. Cross-site HTML forms cannot set custom headers, and CORS is not enabled, so other origins cannot send it either.
- If an `Origin` header is present, it must match the host.

## Abuse protection

See [FORMS_AND_SPAM.md](FORMS_AND_SPAM.md). The limits are:
- signup and login: 20 attempts per IP every 15 minutes;
- contact form: 5 messages per IP per hour;
- request bodies: capped at 32 KB.
