import { validateShare } from '../../../shared/validation.js';
import { HttpError } from '../http.js';
import { requireUser } from '../auth.js';
import { rateLimiter } from '../security.js';
import { boardAccess } from './boards.js';

const MAX_MEMBERS = 50;
const shareLimit = rateLimiter({ windowMs: 15 * 60 * 1000, max: 30, name: 'sharing' });

function memberId(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(404, 'Member not found.');
  return n;
}

function listMembers(db, boardId) {
  const owner = db.prepare('SELECT u.id, u.name, u.email FROM boards b JOIN users u ON u.id = b.user_id WHERE b.id = ?').get(boardId);
  const members = db.prepare(`SELECT u.id, u.name, u.email, m.role FROM board_members m JOIN users u ON u.id = m.user_id
    WHERE m.board_id = ? ORDER BY m.added_at, u.name`).all(boardId);
  return [{ ...owner, role: 'owner' }, ...members];
}

function shareEmail(inviter, board, link) {
  return `Hi,

${inviter} shared the board "${board}" with you on TaskApp.

Open it here:
${link}

It will also appear on your Boards page.

- The TaskApp team
`;
}

export function registerMemberRoutes(router) {
  // Anyone with access can see who else is on the board.
  router.get('/api/boards/:id/members', (ctx) => {
    const board = boardAccess(ctx.db, requireUser(ctx).id, ctx.params.id);
    return { body: { members: listMembers(ctx.db, board.id) } };
  });

  // Owner shares with an existing TaskApp account by email.
  router.post('/api/boards/:id/members', async (ctx) => {
    const user = requireUser(ctx);
    shareLimit(ctx.req);
    const board = boardAccess(ctx.db, user.id, ctx.params.id, 'owner');
    const v = validateShare(ctx.body);
    if (!v.ok) throw new HttpError(400, 'Please fix the highlighted fields.', v.errors);
    const invitee = ctx.db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(v.data.email);
    if (!invitee) {
      throw new HttpError(404, 'No TaskApp account uses that email. Ask them to sign up first, then share again.', { email: 'No account with this email.' });
    }
    if (invitee.id === user.id) throw new HttpError(400, 'You already own this board.', { email: 'That is you.' });
    if (ctx.db.prepare('SELECT 1 FROM board_members WHERE board_id = ? AND user_id = ?').get(board.id, invitee.id)) {
      throw new HttpError(409, 'This person already has access.', { email: 'Already shared with this person.' });
    }
    const { n } = ctx.db.prepare('SELECT COUNT(*) AS n FROM board_members WHERE board_id = ?').get(board.id);
    if (n >= MAX_MEMBERS) throw new HttpError(400, `A board can be shared with at most ${MAX_MEMBERS} people.`);
    ctx.db.prepare('INSERT INTO board_members (board_id, user_id, role) VALUES (?, ?, ?)').run(board.id, invitee.id, v.data.role);

    // Best effort: sharing still succeeds if the notification email fails.
    ctx.mailer.send({
      to: invitee.email,
      subject: `${user.name} shared "${board.title}" with you`,
      text: shareEmail(user.name, board.title, `${ctx.config.siteUrl}/boards/${board.id}`),
    }).catch((err) => console.error('[mail] Failed to send share notification:', err.message));

    return { status: 201, body: { members: listMembers(ctx.db, board.id) } };
  });

  router.patch('/api/boards/:id/members/:userId', (ctx) => {
    const board = boardAccess(ctx.db, requireUser(ctx).id, ctx.params.id, 'owner');
    const v = validateShare(ctx.body, { partial: true });
    if (!v.ok) throw new HttpError(400, 'Please fix the highlighted fields.', v.errors);
    const { changes } = ctx.db.prepare('UPDATE board_members SET role = ? WHERE board_id = ? AND user_id = ?').run(v.data.role, board.id, memberId(ctx.params.userId));
    if (!changes) throw new HttpError(404, 'Member not found.');
    return { body: { members: listMembers(ctx.db, board.id) } };
  });

  // The owner can remove anyone; members can remove themselves ("Leave board").
  router.delete('/api/boards/:id/members/:userId', (ctx) => {
    const user = requireUser(ctx);
    const target = memberId(ctx.params.userId);
    const board = boardAccess(ctx.db, user.id, ctx.params.id, target === user.id ? 'viewer' : 'owner');
    const { changes } = ctx.db.prepare('DELETE FROM board_members WHERE board_id = ? AND user_id = ?').run(board.id, target);
    if (!changes) throw new HttpError(404, 'Member not found.');
    return { status: 204 };
  });
}
