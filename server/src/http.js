// Small HTTP helpers: errors, JSON bodies, cookies and a tiny router.

export class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export function sendJson(res, status, body, headers = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(payload);
}

export async function readJson(req, limit = 32 * 1024) {
  if (!['POST', 'PATCH', 'PUT'].includes(req.method)) return {};
  const hasBody = Number(req.headers['content-length'] || 0) > 0 || req.headers['transfer-encoding'];
  if (!hasBody) return {};
  const type = req.headers['content-type'] || '';
  if (!type.startsWith('application/json')) throw new HttpError(415, 'Content-Type must be application/json.');
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'Request body too large.');
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new HttpError(400, 'Malformed JSON body.');
  }
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    try { out[key] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore bad cookie */ }
  }
  return out;
}

export function serializeCookie(name, value, { maxAge, secure, httpOnly = true, sameSite = 'Lax', path = '/' } = {}) {
  let c = `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=${sameSite}`;
  if (maxAge !== undefined) c += `; Max-Age=${maxAge}`;
  if (httpOnly) c += '; HttpOnly';
  if (secure) c += '; Secure';
  return c;
}

export function createRouter() {
  const routes = [];
  const add = (method) => (pattern, ...handlers) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    routes.push({ method, re, keys, handlers });
  };
  return {
    get: add('GET'), post: add('POST'), patch: add('PATCH'), delete: add('DELETE'),
    match(method, pathname) {
      let pathMatched = false;
      for (const r of routes) {
        const m = pathname.match(r.re);
        if (!m) continue;
        pathMatched = true;
        if (r.method !== method) continue;
        const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        return { handlers: r.handlers, params };
      }
      return pathMatched ? { methodNotAllowed: true } : null;
    },
  };
}
