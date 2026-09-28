import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { openDatabase } from '../src/db.js';
import { createApp } from '../src/app.js';
import { sendSmtp, buildMessage } from '../src/mailer.js';

const sent = [];
const mailer = { send: async (m) => { sent.push(m); } };
const config = { isProd: false, sessionSecret: 'test-secret-test-secret-test-secret!!', forceHttps: false, clientDist: '/nonexistent', siteUrl: 'https://tasks.example.com' };
let server, base;

before(async () => {
  server = createApp({ db: openDatabase(':memory:'), config, serveClient: false, mailer });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

function client() {
  let cookie = '';
  return async (method, path, body) => {
    const headers = { 'X-Requested-With': 'XMLHttpRequest' };
    if (cookie) headers.Cookie = cookie;
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
}
const spam = () => ({ website: '', formStartedAt: Date.now() - 5000 });
const tokenFrom = (text) => text.match(/reset-password\?token=([\w-]+)/)[1];

test('password reset: full flow, single use, logs out old sessions', async () => {
  const email = `reset${Math.random()}@example.com`;
  const oldSession = client();
  assert.equal((await oldSession('POST', '/api/auth/signup', { name: 'Ada', email, password: 'oldpass123', acceptTerms: true, ...spam() })).status, 201);

  const anon = client();
  const r = await anon('POST', '/api/auth/forgot-password', { email, ...spam() });
  assert.equal(r.status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, email);
  assert.match(sent[0].text, /https:\/\/tasks\.example\.com\/reset-password\?token=/);
  const token = tokenFrom(sent[0].text);

  const mismatch = await anon('POST', '/api/auth/reset-password', { token, password: 'newpass123', confirmPassword: 'different1' });
  assert.equal(mismatch.status, 400);
  assert.ok(mismatch.body.fields.confirmPassword);

  const ok = await anon('POST', '/api/auth/reset-password', { token, password: 'newpass123', confirmPassword: 'newpass123' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.email, email);
  assert.equal((await anon('GET', '/api/boards')).status, 200, 'reset logs the user in');
  assert.equal((await oldSession('GET', '/api/boards')).status, 401, 'older sessions are revoked');

  assert.equal((await anon('POST', '/api/auth/reset-password', { token, password: 'another12', confirmPassword: 'another12' })).status, 400, 'token is single use');

  const login = client();
  assert.equal((await login('POST', '/api/auth/login', { email, password: 'oldpass123' })).status, 401);
  assert.equal((await login('POST', '/api/auth/login', { email, password: 'newpass123' })).status, 200);
});

test('forgot password does not reveal whether an email exists', async () => {
  const before = sent.length;
  const r = await client()('POST', '/api/auth/forgot-password', { email: 'nobody@example.com', ...spam() });
  assert.equal(r.status, 200);
  assert.match(r.body.message, /If an account exists/);
  assert.equal(sent.length, before);
});

test('reset rejects bad tokens and spam', async () => {
  const api = client();
  assert.equal((await api('POST', '/api/auth/reset-password', { token: 'x'.repeat(43), password: 'newpass123', confirmPassword: 'newpass123' })).status, 400);
  assert.equal((await api('POST', '/api/auth/reset-password', { token: 'short', password: 'newpass123', confirmPassword: 'newpass123' })).status, 400);
  assert.equal((await api('POST', '/api/auth/forgot-password', { email: 'a@example.com', website: 'spam', formStartedAt: Date.now() - 5000 })).status, 400);
});

// Minimal fake SMTP server to check the client speaks the protocol correctly.
function fakeSmtp({ starttls = false } = {}) {
  const log = [];
  const srv = net.createServer((sock) => {
    let inData = false;
    let buf = '';
    sock.write('220 fake ESMTP\r\n');
    sock.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        log.push(line);
        if (inData) { if (line === '.') { inData = false; sock.write('250 queued\r\n'); } continue; }
        if (line.startsWith('EHLO')) sock.write(`250-fake\r\n${starttls ? '250-STARTTLS\r\n' : ''}250 AUTH LOGIN\r\n`);
        else if (line === 'AUTH LOGIN') sock.write('334 VXNlcm5hbWU6\r\n');
        else if (log.at(-2) === 'AUTH LOGIN') sock.write('334 UGFzc3dvcmQ6\r\n');
        else if (log.at(-3) === 'AUTH LOGIN') sock.write(line === Buffer.from('secret').toString('base64') ? '235 ok\r\n' : '535 bad\r\n');
        else if (line.startsWith('MAIL FROM') || line.startsWith('RCPT TO')) sock.write('250 ok\r\n');
        else if (line === 'DATA') { inData = true; sock.write('354 go\r\n'); }
        else if (line === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
        else sock.write('502 unknown\r\n');
      }
    });
  });
  return { srv, log };
}

test('SMTP client authenticates and sends a message', async () => {
  const { srv, log } = fakeSmtp();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const smtp = { host: '127.0.0.1', port: srv.address().port, user: 'me@example.com', pass: 'secret', secure: false, allowInsecure: true };
  const raw = buildMessage({ from: 'TaskApp <me@example.com>', to: 'you@example.com', subject: 'Hello', text: 'Line one\n.dot line' });
  await sendSmtp(smtp, { from: 'TaskApp <me@example.com>', to: 'you@example.com', raw });
  srv.close();
  assert.ok(log.includes('MAIL FROM:<me@example.com>'));
  assert.ok(log.includes('RCPT TO:<you@example.com>'));
  assert.ok(log.includes('Subject: Hello'));
  assert.ok(log.includes('.'), 'message terminated');
});

test('SMTP client refuses to send credentials without TLS', async () => {
  const { srv } = fakeSmtp();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const smtp = { host: '127.0.0.1', port: srv.address().port, user: 'me', pass: 'secret', secure: false };
  await assert.rejects(sendSmtp(smtp, { from: 'a@b.co', to: 'c@d.co', raw: 'x' }), /STARTTLS/);
  srv.close();
});
