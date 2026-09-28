import { validateLogin, validateSignup } from '../../../shared/validation.js';
import { HttpError } from '../http.js';
import { checkSpam, rateLimiter } from '../security.js';
import { checkPasswordOrDummy, clearSessionCookie, createSessionToken, hashPassword, requireUser, sessionCookie } from '../auth.js';

const authLimit = rateLimiter({ windowMs: 15 * 60 * 1000, max: 20, name: 'login' });

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email };
}

export function registerAuthRoutes(router) {
  router.post('/api/auth/signup', ({ req, body, db, config }) => {
    authLimit(req);
    checkSpam(body);
    const v = validateSignup(body);
    if (!v.ok) throw new HttpError(400, 'Please fix the highlighted fields.', v.errors);
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(v.data.email)) {
      throw new HttpError(409, 'An account with this email already exists.', { email: 'An account with this email already exists.' });
    }
    const { lastInsertRowid } = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
      .run(v.data.name, v.data.email, hashPassword(v.data.password));
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(lastInsertRowid);
    const token = createSessionToken(Number(user.id), config.sessionSecret);
    return { status: 201, body: { user: publicUser(user) }, headers: { 'Set-Cookie': sessionCookie(token, { secure: config.isProd }) } };
  });

  router.post('/api/auth/login', ({ req, body, db, config }) => {
    authLimit(req);
    const v = validateLogin(body);
    if (!v.ok) throw new HttpError(400, 'Please fix the highlighted fields.', v.errors);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(v.data.email);
    if (!checkPasswordOrDummy(v.data.password, user?.password_hash)) throw new HttpError(401, 'Incorrect email or password.');
    const token = createSessionToken(Number(user.id), config.sessionSecret);
    return { body: { user: publicUser(user) }, headers: { 'Set-Cookie': sessionCookie(token, { secure: config.isProd }) } };
  });

  router.post('/api/auth/logout', ({ config }) => ({
    status: 204, headers: { 'Set-Cookie': clearSessionCookie({ secure: config.isProd }) },
  }));

  router.get('/api/auth/me', (ctx) => ({ body: { user: publicUser(requireUser(ctx)) } }));

  router.delete('/api/auth/me', (ctx) => {
    const user = requireUser(ctx);
    ctx.db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    return { status: 204, headers: { 'Set-Cookie': clearSessionCookie({ secure: ctx.config.isProd }) } };
  });
}
