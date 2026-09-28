# Cookies, Consent Banner & Analytics

## Cookies used

| Cookie | Type | Purpose | Lifetime |
|---|---|---|---|
| `taskapp_session` | Essential, httpOnly | Keeps you logged in | 7 days |
| `taskapp_consent` | Essential | Remembers the banner choice (`granted` / `denied`) | ~6 months |

No analytics or advertising cookies are set. Plausible Analytics is cookieless.

## Cookie consent banner

`client/src/components/CookieBanner.jsx`

- Shows on the first visit, until the visitor makes a choice.
- Two equally weighted buttons: **Reject analytics** and **Accept analytics**. Neither is pre-selected, and there are no dark patterns.
- It links to the [Privacy Policy](PRIVACY_POLICY.md) cookie section (`/privacy#cookies`).
- The choice is stored by `client/src/lib/consent.js` and broadcast as a `consentchange` event.
- **Cookie settings** in the footer clears the choice and shows the banner again, so users can withdraw consent at any time.
- It is a labelled `region` landmark, reachable by keyboard, and its colours meet AA contrast.

## Analytics setup

`client/src/lib/analytics.js` uses [Plausible Analytics](https://plausible.io).

1. Create a site in Plausible for your domain.
2. Set `VITE_PUBLIC_PLAUSIBLE_DOMAIN=yourdomain.com` in `.env`, then rebuild.
3. The script (`script.manual.js`) is injected **only after consent is granted**. Without a domain configured, analytics stays fully off.

**Tracked automatically:**
- page views on every route change;
- board URLs normalised to `/boards/:id`, so no personal identifiers are sent.

**Custom events** (add them as Goals in Plausible to see conversions):

| Event | Fired when |
|---|---|
| `Signup` | account created, **the primary conversion** |
| `Login` | user logs in |
| `Board Created` | new board |
| `Card Created` | new card |
| `Contact Sent` | contact form submitted |

The CSP in `server/src/security.js` already allows `https://plausible.io` in `script-src` and `connect-src`.

### Switching to Google Analytics 4

If you prefer GA4:
- change `load()` in `analytics.js` to inject `https://www.googletagmanager.com/gtag/js?id=G-XXXX`, and call `gtag('event', …)`;
- add `googletagmanager.com` and `google-analytics.com` to the CSP;
- GA4 sets cookies, so update the cookie table above and the Privacy Policy.
