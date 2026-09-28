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

function ownedBoard(db, userId, boardId) {
  const board = db.prepare('SELECT * FROM boards WHERE id = ? AND user_id = ?').get(id(boardId), userId);
  if (!board) throw new HttpError(404, 'Board not found.');
  return board;
}

function ownedList(db, userId, listId) {
  const list = db.prepare('SELECT l.* FROM lists l JOIN boards b ON b.id = l.board_id WHERE l.id = ? AND b.user_id = ?').get(id(listId), userId);
  if (!list) throw new HttpError(404, 'List not found.');
  return list;
}

function ownedCard(db, userId, cardId) {
  const card = db.prepare(`SELECT c.*, l.board_id FROM cards c JOIN lists l ON l.id = c.list_id JOIN boards b ON b.id = l.board_id
    WHERE c.id = ? AND b.user_id = ?`).get(id(cardId), userId);
  if (!card) throw new HttpError(404, 'Card not found.');
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

function boardPayload(db, board) {
  const lists = db.prepare('SELECT * FROM lists WHERE board_id = ? ORDER BY position').all(board.id);
  const cards = db.prepare(`SELECT c.* FROM cards c JOIN lists l ON l.id = c.list_id WHERE l.board_id = ? ORDER BY c.position`).all(board.id);
  return {
    id: board.id, title: board.title, color: board.color,
    lists: lists.map((l) => ({ id: l.id, title: l.title, position: l.position, cards: cards.filter((c) => c.list_id === l.id).map(mapCard) })),
  };
}

export function registerBoardRoutes(router) {
  router.get('/api/boards', (ctx) => {
    const user = requireUser(ctx);
    const boards = ctx.db.prepare(`SELECT b.id, b.title, b.color,
      (SELECT COUNT(*) FROM cards c JOIN lists l ON l.id = c.list_id WHERE l.board_id = b.id) AS card_count
      FROM boards b WHERE b.user_id = ? ORDER BY b.created_at DESC, b.id DESC`).all(user.id);
    return { body: { boards: boards.map((b) => ({ id: b.id, title: b.title, color: b.color, cardCount: b.card_count })) } };
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
    return { status: 201, body: { board: boardPayload(ctx.db, board) } };
  });

  router.get('/api/boards/:id', (ctx) => {
    const board = ownedBoard(ctx.db, requireUser(ctx).id, ctx.params.id);
    return { body: { board: boardPayload(ctx.db, board) } };
  });

  router.patch('/api/boards/:id', (ctx) => {
    const board = ownedBoard(ctx.db, requireUser(ctx).id, ctx.params.id);
    const data = invalid(validateBoard(ctx.body, { partial: true }));
    ctx.db.prepare('UPDATE boards SET title = ?, color = ? WHERE id = ?').run(data.title ?? board.title, data.color ?? board.color, board.id);
    return { body: { board: boardPayload(ctx.db, ownedBoard(ctx.db, board.user_id, board.id)) } };
  });

  router.delete('/api/boards/:id', (ctx) => {
    const board = ownedBoard(ctx.db, requireUser(ctx).id, ctx.params.id);
    ctx.db.prepare('DELETE FROM boards WHERE id = ?').run(board.id);
    return { status: 204 };
  });

  router.post('/api/boards/:id/lists', (ctx) => {
    const board = ownedBoard(ctx.db, requireUser(ctx).id, ctx.params.id);
    const data = invalid(validateList(ctx.body));
    const { n } = ctx.db.prepare('SELECT COUNT(*) AS n FROM lists WHERE board_id = ?').get(board.id);
    const { lastInsertRowid } = ctx.db.prepare('INSERT INTO lists (board_id, title, position) VALUES (?, ?, ?)').run(board.id, data.title, n);
    return { status: 201, body: { list: { id: Number(lastInsertRowid), title: data.title, position: n, cards: [] } } };
  });

  // PATCH a list: { title } renames, { index } moves it within its board.
  router.patch('/api/lists/:id', (ctx) => {
    const list = ownedList(ctx.db, requireUser(ctx).id, ctx.params.id);
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
    return { body: { board: boardPayload(ctx.db, { id: list.board_id, ...ctx.db.prepare('SELECT title, color FROM boards WHERE id = ?').get(list.board_id) }) } };
  });

  router.delete('/api/lists/:id', (ctx) => {
    const list = ownedList(ctx.db, requireUser(ctx).id, ctx.params.id);
    transaction(ctx.db, () => {
      ctx.db.prepare('DELETE FROM lists WHERE id = ?').run(list.id);
      renumber(ctx.db, 'lists', ctx.db.prepare('SELECT id FROM lists WHERE board_id = ? ORDER BY position').all(list.board_id).map((r) => r.id));
    });
    return { status: 204 };
  });

  router.post('/api/lists/:id/cards', (ctx) => {
    const list = ownedList(ctx.db, requireUser(ctx).id, ctx.params.id);
    const data = invalid(validateCard(ctx.body));
    const { n } = ctx.db.prepare('SELECT COUNT(*) AS n FROM cards WHERE list_id = ?').get(list.id);
    const { lastInsertRowid } = ctx.db.prepare('INSERT INTO cards (list_id, title, position) VALUES (?, ?, ?)').run(list.id, data.title, n);
    return { status: 201, body: { card: mapCard(ctx.db.prepare('SELECT * FROM cards WHERE id = ?').get(lastInsertRowid)) } };
  });

  // PATCH a card: any of title/description/dueDate/labels/checklist, and/or { listId, index } to move it.
  router.patch('/api/cards/:id', (ctx) => {
    const userId = requireUser(ctx).id;
    const card = ownedCard(ctx.db, userId, ctx.params.id);
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
        const target = ctx.body.listId !== undefined ? ownedList(ctx.db, userId, ctx.body.listId) : { id: card.list_id, board_id: card.board_id };
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
    const card = ownedCard(ctx.db, requireUser(ctx).id, ctx.params.id);
    transaction(ctx.db, () => {
      ctx.db.prepare('DELETE FROM cards WHERE id = ?').run(card.id);
      renumber(ctx.db, 'cards', ctx.db.prepare('SELECT id FROM cards WHERE list_id = ? ORDER BY position').all(card.list_id).map((r) => r.id));
    });
    return { status: 204 };
  });
}
