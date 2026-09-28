import http from 'node:http';
import { HttpError, createRouter, readJson, sendJson } from './http.js';
import { checkCsrf, enforceHttps, securityHeaders } from './security.js';
import { currentSession } from './auth.js';
import { createMailer } from './mailer.js';
import { createStaticHandler } from './static.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerBoardRoutes } from './routes/boards.js';
import { registerContactRoutes } from './routes/contact.js';
import { registerPasswordRoutes } from './routes/password.js';

export function createApp({ db, config, serveClient = config.isProd, mailer = createMailer(config) }) {
  const router = createRouter();
  registerAuthRoutes(router);
  registerBoardRoutes(router);
  registerContactRoutes(router);
  registerPasswordRoutes(router);
  const serveStatic = serveClient ? createStaticHandler(config.clientDist) : null;

  async function handleApi(req, res, pathname) {
    const match = router.match(req.method, pathname);
    if (!match) throw new HttpError(404, 'API route not found.');
    if (match.methodNotAllowed) throw new HttpError(405, 'Method not allowed.');
    checkCsrf(req);
    const body = await readJson(req);
    const session = currentSession(req, config.sessionSecret);
    const row = session ? db.prepare('SELECT id, name, email, password_changed_at FROM users WHERE id = ?').get(session.uid) : null;
    // A password change (e.g. via reset) logs out every session issued before it.
    const user = row && session.iat >= row.password_changed_at ? { id: row.id, name: row.name, email: row.email } : null;
    const ctx = { req, res, params: match.params, body, db, config, user, mailer };
    let out;
    for (const handler of match.handlers) out = await handler(ctx);
    const { status = 200, body: resBody, headers = {} } = out || {};
    sendJson(res, status, status === 204 ? undefined : resBody, headers);
  }

  return http.createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    try {
      if (config.forceHttps && pathname !== '/api/health' && enforceHttps(req, res)) return;
      securityHeaders(res, config);
      if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname);
      if (serveStatic && ['GET', 'HEAD'].includes(req.method)) return serveStatic(req, res, pathname);
      throw new HttpError(404, 'Not found.');
    } catch (err) {
      if (!(err instanceof HttpError)) console.error(err);
      const status = err instanceof HttpError ? err.status : 500;
      const headers = err.retryAfter ? { 'Retry-After': String(err.retryAfter) } : {};
      if (res.headersSent) return res.end();
      sendJson(res, status, { error: status === 500 ? 'Something went wrong.' : err.message, fields: err.fields }, headers);
    }
  });
}
