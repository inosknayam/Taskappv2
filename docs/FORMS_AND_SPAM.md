# Form Validation & Spam Protection

## Form validation

- **One set of rules** in `shared/validation.js`, imported by both the React forms and the API, so client and server can never disagree:

| Form | Rules |
|---|---|
| Sign up | name 1–60 chars; valid email; password 8–128 chars with a letter and a number; Terms must be accepted |
| Log in | valid email; password required |
| Board / list | title 1–100 chars; colour from the allowed list |
| Card | title 1–200; description ≤ 5000; due date `YYYY-MM-DD`; labels from the allowed set; ≤ 50 checklist items |
| Contact | name 1–60; valid email; message 10–2000 chars |
| Forgot password | valid email |
| Reset password | same password rules as sign up; confirmation must match |

- **Client side** (`client/src/lib/useFormState.js`, `FormField.jsx`):
  - fields are validated on blur and on submit, with inline error messages;
  - errors are announced through `aria-describedby`, and focus moves to the first invalid field;
  - forms use `noValidate`, so the accessible custom messages replace the browser's inconsistent built-in ones.
- **Server side:** every endpoint re-validates. Invalid input returns **400** with `{ error, fields }`, and the form maps `fields` back onto its inputs. Signing up with an email that already has an account returns 409 on the `email` field.
- JSON body size is capped at 32 KB, and non-JSON bodies are rejected with 415.

## Spam protection

Signup, contact and forgot-password forms use three layers, and login is rate-limited:

1. **Honeypot field.** An invisible `website` input (`Honeypot.jsx`) is hidden from people and screen readers, but naive bots fill it in. The server rejects any submission where it isn't empty.
2. **Time trap.** The form sends the time it was rendered (`formStartedAt`). Submissions faster than 2 s (signup) or 3 s (contact) are rejected, because humans aren't that fast.
3. **Rate limiting** per IP (`server/src/security.js › rateLimiter`):
   - signup and login: 20 attempts per 15 minutes;
   - contact: 5 per hour;
   - forgot password: 5 per hour; reset password: 20 per 15 minutes;
   - the server returns **429** with a `Retry-After` header.

All three are covered by `server/test/api.test.js`.

**Stronger protection if needed:** add Cloudflare Turnstile or hCaptcha.
1. Render the widget in the form.
2. Send its token with the form data.
3. Verify it in `checkSpam()` with a server-side `fetch` using a **server-only** secret key. Never use a `VITE_PUBLIC_` variable for it.
4. Allow the widget's domain in the CSP.

For multi-instance deployments, move the rate limiter to a shared store such as Redis.
