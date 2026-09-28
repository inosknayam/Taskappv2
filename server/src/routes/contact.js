import { validateContact } from '../../../shared/validation.js';
import { HttpError } from '../http.js';
import { checkSpam, rateLimiter } from '../security.js';

const contactLimit = rateLimiter({ windowMs: 60 * 60 * 1000, max: 5, name: 'contact' });

export function registerContactRoutes(router) {
  router.post('/api/contact', ({ req, body, db }) => {
    contactLimit(req);
    checkSpam(body, { minMs: 3000 });
    const v = validateContact(body);
    if (!v.ok) throw new HttpError(400, 'Please fix the highlighted fields.', v.errors);
    db.prepare('INSERT INTO contact_messages (name, email, message) VALUES (?, ?, ?)').run(v.data.name, v.data.email, v.data.message);
    return { status: 201, body: { ok: true } };
  });

  router.get('/api/health', () => ({ body: { ok: true } }));
}
