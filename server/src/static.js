import { createReadStream, existsSync, statSync } from 'node:fs';
import { createGzip, createBrotliCompress } from 'node:zlib';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.woff2': 'font/woff2',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.xml', '.webmanifest']);

// Routes the React app knows about. Anything else gets the app shell with a 404 status,
// so the custom 404 page renders and search engines see a real 404.
const SPA_ROUTES = [/^\/$/, /^\/(login|signup|privacy|terms|contact|boards|forgot-password|reset-password)\/?$/, /^\/boards\/\d+\/?$/];

function send(req, res, file, status, cacheControl) {
  const ext = path.extname(file);
  const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': cacheControl, Vary: 'Accept-Encoding' };
  const accept = req.headers['accept-encoding'] || '';
  let stream = createReadStream(file);
  if (COMPRESSIBLE.has(ext) && /\bbr\b/.test(accept)) { headers['Content-Encoding'] = 'br'; stream = stream.pipe(createBrotliCompress()); }
  else if (COMPRESSIBLE.has(ext) && /\bgzip\b/.test(accept)) { headers['Content-Encoding'] = 'gzip'; stream = stream.pipe(createGzip()); }
  else headers['Content-Length'] = statSync(file).size;
  res.writeHead(status, headers);
  if (req.method === 'HEAD') { res.end(); stream.destroy(); return; }
  stream.pipe(res);
}

export function createStaticHandler(distDir) {
  const indexFile = path.join(distDir, 'index.html');
  const available = existsSync(indexFile);
  return (req, res, pathname) => {
    if (!available) {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Client not built. Run "npm run build" first, or use "npm run dev".');
      return;
    }
    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch { decoded = '/'; }
    const file = path.join(distDir, path.normalize(decoded).replace(/^(\.\.[/\\])+/, ''));
    if (file.startsWith(distDir) && file !== distDir && existsSync(file) && statSync(file).isFile()) {
      const immutable = decoded.startsWith('/assets/');
      return send(req, res, file, 200, immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');
    }
    const known = SPA_ROUTES.some((re) => re.test(decoded));
    send(req, res, indexFile, known ? 200 : 404, 'no-cache');
  };
}

