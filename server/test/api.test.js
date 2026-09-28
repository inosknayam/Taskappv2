import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db.js';
import { createApp } from '../src/app.js';

const config = { isProd: false, sessionSecret: 'test-secret-test-secret-test-secret!!', forceHttps: false, clientDist: '/nonexistent' };
let server, base;

before(async () => {
  server = createApp({ db: openDatabase(':memory:'), config, serveClient: false });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

function client() {
  let cookie = '';
  return async (method, path, body, extraHeaders = {}) => {
    const headers = { 'X-Requested-With': 'XMLHttpRequest', ...extraHeaders };
    if (cookie) headers.Cookie = cookie;
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
  };
}

const signup = (overrides = {}) => ({
  name: 'Ada', email: `ada${Math.random()}@example.com`, password: 'password1', acceptTerms: true,
  website: '', formStartedAt: Date.now() - 5000, ...overrides,
});

test('rejects invalid signup with field errors', async () => {
  const api = client();
  const r = await api('POST', '/api/auth/signup', signup({ email: 'nope', password: 'short' }));
  assert.equal(r.status, 400);
  assert.ok(r.body.fields.email);
  assert.ok(r.body.fields.password);
});

test('honeypot and too-fast submissions are rejected', async () => {
  const api = client();
  assert.equal((await api('POST', '/api/auth/signup', signup({ website: 'http://spam' }))).status, 400);
  assert.equal((await api('POST', '/api/auth/signup', signup({ formStartedAt: Date.now() }))).status, 400);
});

test('CSRF header is required for mutations', async () => {
  const res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 403);
  const api = client();
  const r = await api('POST', '/api/auth/login', { email: 'a@b.co', password: 'x' }, { Origin: 'https://evil.example' });
  assert.equal(r.status, 403);
});

test('full board / list / card flow', async () => {
  const api = client();
  const s = await api('POST', '/api/auth/signup', signup());
  assert.equal(s.status, 201);
  assert.match(s.headers.get('set-cookie'), /HttpOnly/);
  assert.equal((await api('GET', '/api/auth/me')).body.user.name, 'Ada');

  const b = await api('POST', '/api/boards', { title: 'Launch' });
  assert.equal(b.status, 201);
  const [todo, doing] = b.body.board.lists;
  assert.equal(b.body.board.lists.length, 3);

  const c1 = (await api('POST', `/api/lists/${todo.id}/cards`, { title: 'One' })).body.card;
  const c2 = (await api('POST', `/api/lists/${todo.id}/cards`, { title: 'Two' })).body.card;
  const moved = await api('PATCH', `/api/cards/${c2.id}`, { listId: doing.id, index: 0, labels: ['red'], dueDate: '2030-01-01' });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.card.listId, doing.id);
  assert.deepEqual(moved.body.card.labels, ['red']);

  await api('PATCH', `/api/cards/${c1.id}`, { listId: doing.id, index: 0 });
  const board = (await api('GET', `/api/boards/${b.body.board.id}`)).body.board;
  assert.deepEqual(board.lists[1].cards.map((c) => c.title), ['One', 'Two']);
  assert.equal(board.lists[0].cards.length, 0);

  const reordered = await api('PATCH', `/api/lists/${todo.id}`, { index: 2 });
  assert.deepEqual(reordered.body.board.lists.map((l) => l.title), ['Doing', 'Done', 'To do']);

  assert.equal((await api('GET', '/api/boards')).body.boards[0].cardCount, 2);
  assert.equal((await api('DELETE', `/api/cards/${c1.id}`)).status, 204);
  assert.equal((await api('DELETE', `/api/boards/${b.body.board.id}`)).status, 204);
});

test('users cannot access other users boards', async () => {
  const alice = client();
  const bob = client();
  await alice('POST', '/api/auth/signup', signup());
  await bob('POST', '/api/auth/signup', signup());
  const board = (await alice('POST', '/api/boards', { title: 'Private' })).body.board;
  assert.equal((await bob('GET', `/api/boards/${board.id}`)).status, 404);
  assert.equal((await bob('POST', `/api/lists/${board.lists[0].id}/cards`, { title: 'x' })).status, 404);
});

test('login, logout and unauthenticated access', async () => {
  const api = client();
  const data = signup();
  await api('POST', '/api/auth/signup', data);
  await api('POST', '/api/auth/logout');
  assert.equal((await api('GET', '/api/boards')).status, 401);
  assert.equal((await api('POST', '/api/auth/login', { email: data.email, password: 'wrongpass1' })).status, 401);
  assert.equal((await api('POST', '/api/auth/login', { email: data.email, password: data.password })).status, 200);
  assert.equal((await api('GET', '/api/boards')).status, 200);
});

test('contact form validates and stores messages', async () => {
  const api = client();
  const bad = await api('POST', '/api/contact', { name: '', email: 'x', message: 'hi', formStartedAt: Date.now() - 5000 });
  assert.equal(bad.status, 400);
  const ok = await api('POST', '/api/contact', { name: 'Grace', email: 'g@example.com', message: 'Hello there, nice app!', website: '', formStartedAt: Date.now() - 5000 });
  assert.equal(ok.status, 201);
});

test('unknown API routes return JSON 404 and security headers are set', async () => {
  const res = await fetch(base + '/api/nope');
  assert.equal(res.status, 404);
  assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
});
