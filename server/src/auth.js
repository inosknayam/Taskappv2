import { scryptSync, randomBytes, timingSafeEqual, createHmac, createHash } from 'node:crypto';
import { HttpError, parseCookies, serializeCookie } from './http.js';

export const SESSION_COOKIE = 'taskapp_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, saltB64, hashB64] = String(stored).split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(expected, actual);
}

// A dummy hash so that login timing does not reveal whether an email exists.
const DUMMY_HASH = hashPassword('not-a-real-password-1');

export function checkPasswordOrDummy(password, stored) {
  return verifyPassword(password, stored || DUMMY_HASH) && Boolean(stored);
}

function sign(data, secret) {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function createSessionToken(userId, secret) {
  const payload = Buffer.from(JSON.stringify({ uid: userId, iat: Date.now(), exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS })).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export function readSessionToken(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof data.uid !== 'number' || data.exp < Date.now() / 1000) return null;
    return { uid: data.uid, iat: Number(data.iat) || 0 };
  } catch {
    return null;
  }
}

export function sessionCookie(token, { secure }) {
  return serializeCookie(SESSION_COOKIE, token, { maxAge: SESSION_TTL_SECONDS, secure });
}

export function clearSessionCookie({ secure }) {
  return serializeCookie(SESSION_COOKIE, '', { maxAge: 0, secure });
}

export function currentSession(req, secret) {
  return readSessionToken(parseCookies(req.headers.cookie)[SESSION_COOKIE], secret);
}

// Random single-use token for password-reset links. Only its SHA-256 hash is stored.
export function createResetToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashResetToken(token) };
}

export function hashResetToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function requireUser(ctx) {
  if (!ctx.user) throw new HttpError(401, 'Please log in.');
  return ctx.user;
}
