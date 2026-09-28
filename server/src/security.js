import { HttpError } from './http.js';

export function securityHeaders(res, { isProd }) {
  const csp = [
    "default-src 'self'",
    "script-src 'self' https://plausible.io",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self' https://plausible.io",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ];
  if (isProd) csp.push('upgrade-insecure-requests');
  res.setHeader('Content-Security-Policy', csp.join('; '));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (isProd) res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
}

// Redirect plain HTTP to HTTPS. Works behind proxies/load balancers that set X-Forwarded-Proto.
export function enforceHttps(req, res) {
  const proto = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const secure = req.socket.encrypted || proto === 'https';
  if (secure) return false;
  const host = req.headers.host;
  if (!host) return false;
  res.writeHead(308, { Location: `https://${host}${req.url}` });
  res.end();
  return true;
}

// CSRF defence: the session cookie is SameSite=Lax, and every state-changing API call must
// carry the custom X-Requested-With header (cross-site forms cannot set it, and CORS is not enabled).
// If an Origin header is present it must match the Host.
export function checkCsrf(req) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  if (req.headers['x-requested-with'] !== 'XMLHttpRequest') throw new HttpError(403, 'Missing CSRF header.');
  const origin = req.headers.origin;
  if (origin) {
    let host;
    try { host = new URL(origin).host; } catch { throw new HttpError(403, 'Bad origin.'); }
    const allowed = [req.headers.host, req.headers['x-forwarded-host']].filter(Boolean);
    if (!allowed.includes(host)) throw new HttpError(403, 'Cross-origin request blocked.');
  }
}

// Fixed-window in-memory rate limiter keyed by client IP.
export function rateLimiter({ windowMs, max, name }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs).unref();
  return (req) => {
    const ip = clientIp(req);
    const now = Date.now();
    let entry = hits.get(ip);
    if (!entry || entry.reset < now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(ip, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      const err = new HttpError(429, `Too many ${name} attempts. Please try again later.`);
      err.retryAfter = Math.ceil((entry.reset - now) / 1000);
      throw err;
    }
  };
}

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (fwd ? fwd.split(',')[0] : req.socket.remoteAddress || '').trim();
}

// Spam protection for public forms: a hidden honeypot field that must stay empty and a
// minimum time between rendering the form and submitting it.
export function checkSpam(body, { minMs = 2000 } = {}) {
  if (typeof body.website === 'string' && body.website.trim() !== '') throw new HttpError(400, 'Submission rejected.');
  const started = Number(body.formStartedAt);
  if (!Number.isFinite(started) || Date.now() - started < minMs) throw new HttpError(400, 'Form submitted too quickly. Please try again.');
}
