import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Minimal .env loader (KEY=value lines). Real environment variables win.
for (const file of [path.join(ROOT, '.env'), path.join(ROOT, 'server/.env')]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const env = process.env;
const isProd = env.NODE_ENV === 'production';

if (isProd && (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32)) {
  throw new Error('SESSION_SECRET must be set to at least 32 characters in production.');
}

export const config = {
  isProd,
  port: Number(env.PORT) || 4000,
  host: env.HOST || (isProd ? '0.0.0.0' : '127.0.0.1'),
  sessionSecret: env.SESSION_SECRET || 'dev-only-insecure-secret-change-me-please',
  databaseFile: env.DATABASE_FILE || path.join(ROOT, 'server/data/taskapp.db'),
  siteUrl: (env.SITE_URL || `http://localhost:5173`).replace(/\/$/, ''),
  // HTTPS is enforced in production unless explicitly disabled (e.g. local prod smoke tests).
  forceHttps: isProd && env.FORCE_HTTPS !== 'false',
  clientDist: path.join(ROOT, 'client/dist'),
};
