import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db.js';
import { createApp } from '../src/app.js';
import { createSessionToken, readSessionToken, hashPassword, verifyPassword } from '../src/auth.js';

test('HTTPS is enforced in production and HSTS is sent', async () => {
  const config = { isProd: true, sessionSecret: 'x'.repeat(40), forceHttps: true, clientDist: '/nonexistent' };
  const server = createApp({ db: openDatabase(':memory:'), config, serveClient: false });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const plain = await fetch(base + '/boards', { redirect: 'manual' });
  assert.equal(plain.status, 308);
  assert.match(plain.headers.get('location'), /^https:\/\//);
  const proxied = await fetch(base + '/api/nope', { headers: { 'X-Forwarded-Proto': 'https' } });
  assert.equal(proxied.status, 404);
  assert.match(proxied.headers.get('strict-transport-security'), /max-age=63072000/);
  server.close();
});

test('session tokens are signed and tamper-proof', () => {
  const token = createSessionToken(7, 'secret');
  assert.equal(readSessionToken(token, 'secret'), 7);
  assert.equal(readSessionToken(token, 'other'), null);
  assert.equal(readSessionToken(token.replace(/^./, 'A'), 'secret'), null);
});

test('passwords are hashed with scrypt', () => {
  const h = hashPassword('password1');
  assert.ok(h.startsWith('scrypt$'));
  assert.ok(verifyPassword('password1', h));
  assert.ok(!verifyPassword('password2', h));
});
