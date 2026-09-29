import { validateBoard, validateCard, validateList } from '../../../shared/validation.js';
import { HttpError } from '../http.js';
import { requireUser } from '../auth.js';
import { transaction } from '../db.js';

function id(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(404, 'Not found.');
  return n;
}

function mapCard(c) {
  return {
    id: c.id, listId: c.list_id, title: c.title, description: c.description, dueDate: c.due_date,
    labels: JSON.parse(c.labels), checklist: JSON.parse(c.checklist), position: c.position,
  };
}

// Roles, lowest to highest. Owners can do everything; editors can change lists and cards;
// viewers can only look. Users without access get a 404 so board ids can't be probed.
const LEVEL = { viewer: 1, editor: 2, owner: 3 };

export function boardAccess(db, userId, boardId, need = 'viewer') {
  const board = db.prepare(`SELECT b.*, CASE WHEN b.user_id = ? THEN 'owner' ELSE m.role END AS role
    FROM boards b LEFT JOIN board_members m ON m.board_id = b.id AND m.user_id = ?
    WHERE b.id = ? AND (b.user_id = ? OR m.user_id IS NOT NULL)`).get(userId, userId, id(boardId), userId);
  if (!board) throw new HttpError(404, 'Board not found.');
  if (LEVEL[board.role] < LEVEL[need]) {
    throw new HttpError(403, need === 'owner' ? 'Only the board owner can do that.' : 'You have view-only access to this board.');
  }
  return board;
}

function listAccess(db, userId, listId, need) {
  const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(id(listId));
  if (!list) throw new HttpError(404, 'List not found.');
  boardAccess(db, userId, list.board_id, need);
  return list;
}

function cardAccess(db, userId, cardId, need) {
  const card = db.prepare('SELECT c.*, l.board_id FROM cards c JOIN lists l ON l.id = c.list_id WHERE c.id = ?').get(id(cardId));
  if (!card) throw new HttpError(404, 'Card not found.');
  boardAccess(db, userId, card.board_id, need);
  return card;
}

function invalid(v) {
  if (!v.ok) throw new HttpError(400, 'Please fix the highlighted fields.', v.errors);
  return v.data;
}

// Rewrites positions 0..n-1 for the rows in `ids` (already in the desired order).
function renumber(db, table, ids) {
  const stmt = db.prepare(`UPDATE ${table} SET position = ? WHERE id = ?`);
  ids.forEach((rowId, i) => stmt.run(i, rowId));
}

function clampIndex(index, length) {
  const n = Number(index);
  if (!Number.isInteger(n)) throw new HttpError(400, 'Index must be an integer.', { index: 'Index must be an integer.' });
  return Math.max(0, Math.min(n, length));
}

function boardPayload(db, board, role) {
  const lists = db.prepare('SELECT * FROM lists WHERE board_id = ? ORDER BY position').all(board.id);
  const cards = db.prepare(`SELECT c.* FROM cards c JOIN lists l ON l.id = c.list_id WHERE l.board_id = ? ORDER BY c.position`).all(board.id);
  return {
    id: board.id, title: board.title, color: board.color, role,
    owner: db.prepare('SELECT name FROM users WHERE id = (SELECT user_id FROM boards WHERE id = ?)').get(board.id)?.name,
    memberCount: db.prepare('SELECT COUNT(*) AS n FROM board_members WHERE board_id = ?').get(board.id).n,
    lists: lists.map((l) => ({ id: l.id, title: l.title, position: l.position, cards: cards.filter((c) => c.list_id === l.id).map(mapCard) })),
  };
}

export function registerBoardRoutes(router) {
  router.get('/api/boards', (ctx) => {
    const user = requireUser(ctx);
    const boards = ctx.db.prepare(`SELECT b.id, b.title, b.color, u.name AS owner_name,
      CASE WHEN b.user_id = ? THEN 'owner' ELSE m.role END AS role,
      (SELECT COUNT(*) FROM cards c JOIN lists l ON l.id = c.list_id WHERE l.board_id = b.id) AS card_count
      FROM boards b JOIN users u ON u.id = b.user_id
      LEFT JOIN board_members m ON m.board_id = b.id AND m.user_id = ?
      WHERE b.user_id = ? OR m.user_id IS NOT NULL
      ORDER BY b.created_at DESC, b.id DESC`).all(user.id, user.id, user.id);
    return {
      body: {
        boards: boards.map((b) => ({ id: b.id, title: b.title, color: b.color, cardCount: b.card_count, role: b.role, owner: b.owner_name })),
      },
    };
  });

  router.post('/api/boards', (ctx) => {
    const user = requireUser(ctx);
    const data = invalid(validateBoard(ctx.body));
    const board = transaction(ctx.db, () => {
      const { lastInsertRowid } = ctx.db.prepare('INSERT INTO boards (user_id, title, color) VALUES (?, ?, ?)')
        .run(user.id, data.title, data.color || '#1d4ed8');
      const insert = ctx.db.prepare('INSERT INTO lists (board_id, title, position) VALUES (?, ?, ?)');
      ['To do', 'Doing', 'Done'].forEach((t, i) => insert.run(lastInsertRowid, t, i));
      return ctx.db.prepare('SELECT * FROM boards WHERE id = ?').get(lastInsertRowid);
    });
    return { status: 201, body: { board: boardPayload(ctx.db, board, 'owner') } };
  });

  router.get('/api/boards/:id', (ctx) => {
    const board = boardAccess(ctx.db, requireUser(ctx).id, ctx.params.id);
    return { body: { board: boardPayload(ctx.db, board, board.role) } };
  });

  router.patch('/api/boards/:id', (ctx) => {
    const userId = requireUser(ctx).id;
    const board = boardAccess(ctx.db, userId, ctx.params.id, 'editor');
    const data = invalid(validateBoard(ctx.body, { partial: true }));
    ctx.db.prepare('UPDATE boards SET title = ?, color = ? WHERE id = ?').run(data.title ?? board.title, data.color ?? board.color, board.id);
    return { body: { board: boardPayload(ctx.db, boardAccess(ctx.db, userId, board.id), board.role) } };
  });

  router.delete('/api/boards/:id', (ctx) => {
    const board = boardAccess(ctx.db, requireUser(ctx).id, ctx.params.id, 'owner');
    ctx.db.prepare('DELETE FROM boards WHERE id = ?').run(board.id);
    return { status: 204 };
  });

  router.post('/api/boards/:id/lists', (ctx) => {
    const board = boardAccess(ctx.db, requireUser(ctx).id, ctx.params.id, 'editor');
    const data = invalid(validateList(ctx.body));
    const { n } = ctx.db.prepare('SELECT COUNT(*) AS n FROM lists WHERE board_id = ?').get(board.id);
    const { lastInsertRowid } = ctx.db.prepare('INSERT INTO lists (board_id, title, position) VALUES (?, ?, ?)').run(board.id, data.title, n);
    return { status: 201, body: { list: { id: Number(lastInsertRowid), title: data.title, position: n, cards: [] } } };
  });

  // PATCH a list: { title } renames, { index } moves it within its board.
  router.patch('/api/lists/:id', (ctx) => {
    const list = listAccess(ctx.db, requireUser(ctx).id, ctx.params.id, 'editor');
    if (ctx.body.title !== undefined) {
      const data = invalid(validateList(ctx.body));
      ctx.db.prepare('UPDATE lists SET title = ? WHERE id = ?').run(data.title, list.id);
    }
    if (ctx.body.index !== undefined) {
      transaction(ctx.db, () => {
        const ids = ctx.db.prepare('SELECT id FROM lists WHERE board_id = ? AND id != ? ORDER BY position').all(list.board_id, list.id).map((r) => r.id);
        ids.splice(clampIndex(ctx.body.index, ids.length), 0, list.id);
        renumber(ctx.db, 'lists', ids);
      });
    }
    const board = boardAccess(ctx.db, ctx.user.id, list.board_id);
    return { body: { board: boardPayload(ctx.db, board, board.role) } };
  });

  router.delete('/api/lists/:id', (ctx) => {
    const list = listAccess(ctx.db, requireUser(ctx).id, ctx.params.id, 'editor');
    transaction(ctx.db, () => {
      ctx.db.prepare('DELETE FROM lists WHERE id = ?').run(list.id);
      renumber(ctx.db, 'lists', ctx.db.prepare('SELECT id FROM lists WHERE board_id = ? ORDER BY position').all(list.board_id).map((r) => r.id));
    });
    return { status: 204 };
  });

  router.post('/api/lists/:id/cards', (ctx) => {
    const list = listAccess(ctx.db, requireUser(ctx).id, ctx.params.id, 'editor');
    const data = invalid(validateCard(ctx.body));
    const { n } = ctx.db.prepare('SELECT COUNT(*) AS n FROM cards WHERE list_id = ?').get(list.id);
    const { lastInsertRowid } = ctx.db.prepare('INSERT INTO cards (list_id, title, position) VALUES (?, ?, ?)').run(list.id, data.title, n);
    return { status: 201, body: { card: mapCard(ctx.db.prepare('SELECT * FROM cards WHERE id = ?').get(lastInsertRowid)) } };
  });

  // PATCH a card: any of title/description/dueDate/labels/checklist, and/or { listId, index } to move it.
  router.patch('/api/cards/:id', (ctx) => {
    const userId = requireUser(ctx).id;
    const card = cardAccess(ctx.db, userId, ctx.params.id, 'editor');
    const data = invalid(validateCard(ctx.body, { partial: true }));
    transaction(ctx.db, () => {
      ctx.db.prepare('UPDATE cards SET title = ?, description = ?, due_date = ?, labels = ?, checklist = ? WHERE id = ?').run(
        data.title ?? card.title,
        data.description ?? card.description,
        data.dueDate !== undefined ? data.dueDate : card.due_date,
        data.labels ? JSON.stringify(data.labels) : card.labels,
        data.checklist ? JSON.stringify(data.checklist) : card.checklist,
        card.id,
      );
      if (ctx.body.index !== undefined || ctx.body.listId !== undefined) {
        const target = ctx.body.listId !== undefined ? listAccess(ctx.db, userId, ctx.body.listId, 'editor') : { id: card.list_id, board_id: card.board_id };
        if (target.board_id !== card.board_id) throw new HttpError(400, 'Cards can only move within their board.');
        const ids = ctx.db.prepare('SELECT id FROM cards WHERE list_id = ? AND id != ? ORDER BY position').all(target.id, card.id).map((r) => r.id);
        ids.splice(clampIndex(ctx.body.index ?? ids.length, ids.length), 0, card.id);
        ctx.db.prepare('UPDATE cards SET list_id = ? WHERE id = ?').run(target.id, card.id);
        renumber(ctx.db, 'cards', ids);
        if (target.id !== card.list_id) {
          renumber(ctx.db, 'cards', ctx.db.prepare('SELECT id FROM cards WHERE list_id = ? ORDER BY position').all(card.list_id).map((r) => r.id));
        }
      }
    });
    return { body: { card: mapCard(ctx.db.prepare('SELECT * FROM cards WHERE id = ?').get(card.id)) } };
  });

  router.delete('/api/cards/:id', (ctx) => {
    const card = cardAccess(ctx.db, requireUser(ctx).id, ctx.params.id, 'editor');
    transaction(ctx.db, () => {
      ctx.db.prepare('DELETE FROM cards WHERE id = ?').run(card.id);
      renumber(ctx.db, 'cards', ctx.db.prepare('SELECT id FROM cards WHERE list_id = ? ORDER BY position').all(card.list_id).map((r) => r.id));
    });
    return { status: 204 };
  });
}
