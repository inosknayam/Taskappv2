import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDatabase } from '../src/db.js';
import { createApp } from '../src/app.js';

test('serves the SPA with a real 404 status for unknown pages', async () => {
  const dist = mkdtempSync(path.join(tmpdir(), 'taskapp-dist-'));
  mkdirSync(path.join(dist, 'assets'));
  writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>app</title>');
  writeFileSync(path.join(dist, 'assets/app.js'), 'console.log(1)');
  const config = { isProd: true, sessionSecret: 'x'.repeat(40), forceHttps: false, clientDist: dist };
  const server = createApp({ db: openDatabase(':memory:'), config });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/`)).status, 200);
    assert.equal((await fetch(`${base}/boards/12`)).status, 200);
    const missing = await fetch(`${base}/this-page-does-not-exist`);
    assert.equal(missing.status, 404);
    assert.match(await missing.text(), /<title>app<\/title>/);
    const asset = await fetch(`${base}/assets/app.js`);
    assert.match(asset.headers.get('cache-control'), /immutable/);
    assert.equal((await fetch(`${base}/%2e%2e/%2e%2e/etc/passwd`)).status, 404);
  } finally {
    server.close();
  }
});
