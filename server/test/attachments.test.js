import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDatabase } from '../src/db.js';
import { createApp } from '../src/app.js';

const uploadDir = mkdtempSync(path.join(tmpdir(), 'taskapp-uploads-'));
const config = { isProd: false, sessionSecret: 'test-secret-test-secret-test-secret!!', forceHttps: false, clientDist: '/nonexistent', siteUrl: 'http://x', uploadDir, maxUploadMb: 1 };
let server, base;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 1)]);
const files = () => readdirSync(uploadDir);

before(async () => {
  server = createApp({ db: openDatabase(':memory:'), config, serveClient: false, mailer: { send: async () => {} } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function user(name) {
  let cookie = '';
  const api = async (method, p, body, { raw, type, fileName } = {}) => {
    const headers = { 'X-Requested-With': 'XMLHttpRequest' };
    if (cookie) headers.Cookie = cookie;
    let payload;
    if (raw) { headers['Content-Type'] = type; headers['X-File-Name'] = encodeURIComponent(fileName); payload = raw; }
    else if (body) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(base + p, { method, headers, body: payload });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const isJson = (res.headers.get('content-type') || '').includes('json');
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, headers: res.headers, body: isJson ? (buf.length ? JSON.parse(buf) : null) : buf };
  };
  const r = await api('POST', '/api/auth/signup', { name, email: `${name}${Math.random()}@example.com`, password: 'password1', acceptTerms: true, website: '', formStartedAt: Date.now() - 5000 });
  api.email = r.body.user.email;
  api.id = r.body.user.id;
  return api;
}

test('upload, list, download and delete an attachment', async () => {
  const me = await user('Ann');
  const board = (await me('POST', '/api/boards', { title: 'B' })).body.board;
  const card = (await me('POST', `/api/lists/${board.lists[0].id}/cards`, { title: 'C' })).body.card;

  const up = await me('POST', `/api/cards/${card.id}/attachments`, null, { raw: PNG, type: 'image/png', fileName: '../../résumé photo.png' });
  assert.equal(up.status, 201);
  assert.equal(up.body.attachment.name, 'résumé photo.png', 'path components stripped, unicode kept');
  assert.equal(up.body.attachment.isImage, true);
  assert.equal(files().length, 1);

  const full = (await me('GET', `/api/boards/${board.id}`)).body.board;
  assert.equal(full.lists[0].cards[0].attachments.length, 1);
  // Editing a card keeps its attachments in the response.
  assert.equal((await me('PATCH', `/api/cards/${card.id}`, { title: 'C2' })).body.card.attachments.length, 1);

  const dl = await me('GET', `/api/attachments/${up.body.attachment.id}`);
  assert.equal(dl.status, 200);
  assert.deepEqual(dl.body, PNG);
  assert.equal(dl.headers.get('content-type'), 'image/png');
  assert.match(dl.headers.get('content-disposition'), /^inline;.*filename\*=UTF-8''r%C3%A9sum%C3%A9/);
  assert.match(dl.headers.get('content-security-policy'), /sandbox/);

  assert.equal((await me('DELETE', `/api/attachments/${up.body.attachment.id}`)).status, 204);
  assert.equal(files().length, 0, 'file removed from disk');
});

test('rejects disallowed types, spoofed contents, oversize and empty files', async () => {
  const me = await user('Ben');
  const board = (await me('POST', '/api/boards', { title: 'B' })).body.board;
  const card = (await me('POST', `/api/lists/${board.lists[0].id}/cards`, { title: 'C' })).body.card;
  const url = `/api/cards/${card.id}/attachments`;
  const before = files().length;
  assert.equal((await me('POST', url, null, { raw: '<script>alert(1)</script>', type: 'text/html', fileName: 'x.html' })).status, 415);
  assert.equal((await me('POST', url, null, { raw: '<svg onload=alert(1)>', type: 'image/svg+xml', fileName: 'x.svg' })).status, 415);
  assert.equal((await me('POST', url, null, { raw: '<html>not a png</html>', type: 'image/png', fileName: 'x.png' })).status, 415);
  assert.equal((await me('POST', url, null, { raw: Buffer.alloc(1024 * 1024 + 10, 0x41), type: 'text/plain', fileName: 'big.txt' })).status, 413);
  assert.equal((await me('POST', url, null, { raw: Buffer.alloc(0), type: 'text/plain', fileName: 'empty.txt' })).status, 400);
  assert.equal((await me('POST', url, null, { raw: 'hello, world', type: 'text/plain', fileName: 'ok.txt' })).status, 201);
  assert.equal(files().length, before + 1, 'rejected uploads leave no files behind');
  const txt = (await me('GET', `/api/boards/${board.id}`)).body.board.lists[0].cards[0].attachments[0];
  assert.match((await me('GET', `/api/attachments/${txt.id}`)).headers.get('content-disposition'), /^attachment;/);
});

test('sharing roles apply to attachments; deleting a board removes its files', async () => {
  const owner = await user('Cat');
  const viewer = await user('Dan');
  const stranger = await user('Eve');
  const board = (await owner('POST', '/api/boards', { title: 'B' })).body.board;
  const card = (await owner('POST', `/api/lists/${board.lists[0].id}/cards`, { title: 'C' })).body.card;
  await owner('POST', `/api/boards/${board.id}/members`, { email: viewer.email, role: 'viewer' });
  const a = (await owner('POST', `/api/cards/${card.id}/attachments`, null, { raw: PNG, type: 'image/png', fileName: 'a.png' })).body.attachment;
  const before = files().length;

  assert.equal((await viewer('GET', `/api/attachments/${a.id}`)).status, 200);
  assert.equal((await viewer('DELETE', `/api/attachments/${a.id}`)).status, 403);
  assert.equal((await viewer('POST', `/api/cards/${card.id}/attachments`, null, { raw: PNG, type: 'image/png', fileName: 'b.png' })).status, 403);
  assert.equal((await stranger('GET', `/api/attachments/${a.id}`)).status, 404);

  assert.equal((await owner('DELETE', `/api/boards/${board.id}`)).status, 204);
  assert.equal(files().length, before - 1, 'cascade delete removed the file');
});
