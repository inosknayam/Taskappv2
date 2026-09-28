import { validateForgotPassword, validateResetPassword } from '../../../shared/validation.js';
import { HttpError } from '../http.js';
import { checkSpam, rateLimiter } from '../security.js';
import { createResetToken, createSessionToken, hashResetToken, hashPassword, sessionCookie } from '../auth.js';
import { transaction } from '../db.js';

const RESET_TTL_SECONDS = 60 * 60; // links expire after 1 hour
const forgotLimit = rateLimiter({ windowMs: 60 * 60 * 1000, max: 5, name: 'password reset' });
const resetLimit = rateLimiter({ windowMs: 15 * 60 * 1000, max: 20, name: 'password reset' });

const GENERIC = { message: 'If an account exists for that email, we have sent a link to reset your password.' };

function resetEmail(name, link) {
  return `Hi ${name},

Someone (hopefully you) asked to reset the password for your TaskApp account.

Choose a new password here:
${link}

This link works once and expires in 1 hour. If you did not ask for this, you can ignore this email and your password will stay the same.

- The TaskApp team
`;
}

export function registerPasswordRoutes(router) {
  // Always answers with the same message, so it cannot be used to discover which emails have accounts.
  router.post('/api/auth/forgot-password', async ({ req, body, db, config, mailer }) => {
    forgotLimit(req);
    checkSpam(body);
    const v = validateForgotPassword(body);
    if (!v.ok) throw new HttpError(400, 'Please fix the highlighted fields.', v.errors);
    const user = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(v.data.email);
    if (user) {
      const { token, hash } = createResetToken();
      transaction(db, () => {
        db.prepare('DELETE FROM password_resets WHERE user_id = ? OR expires_at < ?').run(user.id, Math.floor(Date.now() / 1000));
        db.prepare('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
          .run(user.id, hash, Math.floor(Date.now() / 1000) + RESET_TTL_SECONDS);
      });
      const link = `${config.siteUrl}/reset-password?token=${token}`;
      try {
        await mailer.send({ to: user.email, subject: 'Reset your TaskApp password', text: resetEmail(user.name, link) });
      } catch (err) {
        console.error('[mail] Failed to send password reset email:', err.message);
        throw new HttpError(502, 'We could not send the email right now. Please try again later.');
      }
    }
    return { body: GENERIC };
  });

  router.post('/api/auth/reset-password', ({ req, body, db, config }) => {
    resetLimit(req);
    const v = validateResetPassword(body);
    if (!v.ok) throw new HttpError(400, v.errors.token || 'Please fix the highlighted fields.', v.errors);
    const now = Math.floor(Date.now() / 1000);
    const reset = db.prepare('SELECT * FROM password_resets WHERE token_hash = ?').get(hashResetToken(v.data.token));
    if (!reset || reset.expires_at < now) {
      throw new HttpError(400, 'This reset link is invalid or has expired. Please request a new one.', { token: 'expired' });
    }
    transaction(db, () => {
      db.prepare('UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?').run(hashPassword(v.data.password), Date.now(), reset.user_id);
      // Single use: remove every outstanding link for this user.
      db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(reset.user_id);
    });
    const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(reset.user_id);
    const token = createSessionToken(Number(user.id), config.sessionSecret);
    return { body: { user: { id: user.id, name: user.name, email: user.email } }, headers: { 'Set-Cookie': sessionCookie(token, { secure: config.isProd }) } };
  });
}
