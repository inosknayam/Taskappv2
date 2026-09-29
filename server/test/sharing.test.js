import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db.js';
import { createApp } from '../src/app.js';

const sent = [];
const config = { isProd: false, sessionSecret: 'test-secret-test-secret-test-secret!!', forceHttps: false, clientDist: '/nonexistent', siteUrl: 'https://tasks.example.com' };
let server, base;

before(async () => {
  server = createApp({ db: openDatabase(':memory:'), config, serveClient: false, mailer: { send: async (m) => { sent.push(m); } } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function user(name) {
  let cookie = '';
  const email = `${name}${Math.random()}@example.com`;
  const api = async (method, path, body) => {
    const headers = { 'X-Requested-With': 'XMLHttpRequest' };
    if (cookie) headers.Cookie = cookie;
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  const r = await api('POST', '/api/auth/signup', { name, email, password: 'password1', acceptTerms: true, website: '', formStartedAt: Date.now() - 5000 });
  api.id = r.body.user.id;
  api.email = r.body.user.email;
  return api;
}

test('owner shares a board; editors can edit, viewers can only read', async () => {
  const owner = await user('Olive');
  const editor = await user('Eddie');
  const viewer = await user('Vera');
  const board = (await owner('POST', '/api/boards', { title: 'Team' })).body.board;
  const listId = board.lists[0].id;

  assert.equal((await editor('GET', `/api/boards/${board.id}`)).status, 404, 'no access before sharing');

  const shared = await owner('POST', `/api/boards/${board.id}/members`, { email: editor.email, role: 'editor' });
  assert.equal(shared.status, 201);
  assert.deepEqual(shared.body.members.map((m) => m.role), ['owner', 'editor']);
  assert.equal(sent.at(-1).to, editor.email);
  assert.match(sent.at(-1).text, new RegExp(`/boards/${board.id}`));
  await owner('POST', `/api/boards/${board.id}/members`, { email: viewer.email.toUpperCase(), role: 'viewer' });

  // Shared boards appear in the member's list with their role and the owner's name.
  const list = (await editor('GET', '/api/boards')).body.boards;
  assert.equal(list[0].role, 'editor');
  assert.equal(list[0].owner, 'Olive');

  // Editor can add and move cards, and rename the board.
  const card = await editor('POST', `/api/lists/${listId}/cards`, { title: 'From editor' });
  assert.equal(card.status, 201);
  assert.equal((await editor('PATCH', `/api/cards/${card.body.card.id}`, { listId: board.lists[1].id, index: 0 })).status, 200);
  assert.equal((await editor('PATCH', `/api/boards/${board.id}`, { title: 'Team board' })).status, 200);

  // Viewer can read but not change anything.
  const seen = await viewer('GET', `/api/boards/${board.id}`);
  assert.equal(seen.status, 200);
  assert.equal(seen.body.board.role, 'viewer');
  assert.equal(seen.body.board.lists[1].cards[0].title, 'From editor');
  assert.equal((await viewer('POST', `/api/lists/${listId}/cards`, { title: 'nope' })).status, 403);
  assert.equal((await viewer('PATCH', `/api/cards/${card.body.card.id}`, { title: 'nope' })).status, 403);
  assert.equal((await viewer('DELETE', `/api/cards/${card.body.card.id}`)).status, 403);
  assert.equal((await viewer('POST', `/api/boards/${board.id}/lists`, { title: 'nope' })).status, 403);

  // Only the owner deletes the board or manages sharing.
  assert.equal((await editor('DELETE', `/api/boards/${board.id}`)).status, 403);
  assert.equal((await editor('POST', `/api/boards/${board.id}/members`, { email: 'x@example.com', role: 'viewer' })).status, 403);
  assert.equal((await editor('DELETE', `/api/boards/${board.id}/members/${viewer.id}`)).status, 403);

  // Owner changes a role, then removes a member.
  assert.equal((await owner('PATCH', `/api/boards/${board.id}/members/${viewer.id}`, { role: 'editor' })).status, 200);
  assert.equal((await viewer('POST', `/api/lists/${listId}/cards`, { title: 'now allowed' })).status, 201);
  assert.equal((await owner('DELETE', `/api/boards/${board.id}/members/${viewer.id}`)).status, 204);
  assert.equal((await viewer('GET', `/api/boards/${board.id}`)).status, 404);

  // A member can leave on their own.
  assert.equal((await editor('DELETE', `/api/boards/${board.id}/members/${editor.id}`)).status, 204);
  assert.equal((await editor('GET', '/api/boards')).body.boards.length, 0);
});

test('sharing validation', async () => {
  const owner = await user('Otto');
  const friend = await user('Fran');
  const board = (await owner('POST', '/api/boards', { title: 'Mine' })).body.board;
  const url = `/api/boards/${board.id}/members`;
  assert.equal((await owner('POST', url, { email: 'nobody@example.com', role: 'editor' })).status, 404);
  assert.equal((await owner('POST', url, { email: owner.email, role: 'editor' })).status, 400);
  assert.equal((await owner('POST', url, { email: friend.email, role: 'admin' })).status, 400);
  assert.equal((await owner('POST', url, { email: friend.email, role: 'viewer' })).status, 201);
  assert.equal((await owner('POST', url, { email: friend.email, role: 'viewer' })).status, 409);
  // Strangers can't see the member list.
  const stranger = await user('Sam');
  assert.equal((await stranger('GET', url)).status, 404);
});

test('deleting a member account removes their access; deleting the board removes shares', async () => {
  const owner = await user('Ona');
  const friend = await user('Finn');
  const board = (await owner('POST', '/api/boards', { title: 'Temp' })).body.board;
  await owner('POST', `/api/boards/${board.id}/members`, { email: friend.email, role: 'editor' });
  assert.equal((await friend('DELETE', '/api/auth/me')).status, 204);
  assert.equal((await owner('GET', `/api/boards/${board.id}/members`)).body.members.length, 1);
  assert.equal((await owner('DELETE', `/api/boards/${board.id}`)).status, 204);
});
