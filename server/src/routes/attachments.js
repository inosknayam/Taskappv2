import { createWriteStream, mkdirSync, rmSync, existsSync, statSync, createReadStream } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { HttpError } from '../http.js';
import { requireUser } from '../auth.js';
import { rateLimiter } from '../security.js';
import { boardAccess, cardAccess } from './boards.js';

const MAX_PER_CARD = 20;
const uploadLimit = rateLimiter({ windowMs: 15 * 60 * 1000, max: 60, name: 'upload' });

// Allow-list of file types. SVG, HTML and other scriptable formats are deliberately excluded.
export const ALLOWED_TYPES = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
  'application/pdf': 'pdf', 'text/plain': 'txt', 'text/csv': 'csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/zip': 'zip',
};
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

// Magic-number checks so a renamed executable or HTML page can't pose as an image or PDF.
const SIGNATURES = {
  'image/png': [[0x89, 0x50, 0x4e, 0x47]],
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/gif': [[0x47, 0x49, 0x46, 0x38]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
  'application/zip': [[0x50, 0x4b, 0x03, 0x04], [0x50, 0x4b, 0x05, 0x06]],
};
for (const t of ['docx', 'xlsx', 'pptx']) {
  SIGNATURES[Object.keys(ALLOWED_TYPES).find((k) => ALLOWED_TYPES[k] === t)] = SIGNATURES['application/zip'];
}

function matchesSignature(mime, head) {
  const sigs = SIGNATURES[mime];
  if (!sigs) return !head.subarray(0, 512).includes(0); // text types: no NUL bytes
  if (mime === 'image/webp' && head.subarray(8, 12).toString('latin1') !== 'WEBP') return false;
  return sigs.some((sig) => sig.every((b, i) => head[i] === b));
}

export function mapAttachment(a) {
  return { id: a.id, name: a.original_name, mime: a.mime, size: a.size, isImage: IMAGE_TYPES.has(a.mime), createdAt: a.created_at };
}

export function cardAttachments(db, cardId) {
  return db.prepare('SELECT * FROM attachments WHERE card_id = ? ORDER BY id').all(cardId).map(mapAttachment);
}

function cleanName(raw) {
  let name = '';
  try { name = decodeURIComponent(raw || ''); } catch { /* fall through */ }
  // Strip any path, control characters and characters that are awkward in headers.
  name = name.split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f"<>|:*?]/g, '').trim().slice(0, 200);
  return name || 'file';
}

function filePath(config, storedName) {
  return path.join(config.uploadDir, storedName);
}

// Removes files queued in file_trash (filled by a trigger whenever an attachment row is deleted).
export function purgeDeletedFiles(db, config) {
  const rows = db.prepare('SELECT stored_name FROM file_trash').all();
  for (const { stored_name: name } of rows) {
    if (/^[a-f0-9]{32}$/.test(name)) rmSync(filePath(config, name), { force: true });
    db.prepare('DELETE FROM file_trash WHERE stored_name = ?').run(name);
  }
}

// Streams the request body to disk, enforcing the size limit and checking the file signature.
function saveUpload(req, dest, maxBytes, mime) {
  return new Promise((resolve, reject) => {
    const out = createWriteStream(dest, { flags: 'wx' });
    let size = 0;
    let head = Buffer.alloc(0);
    let failed = false;
    const fail = (err) => {
      if (failed) return;
      failed = true;
      req.unpipe?.(out);
      out.destroy();
      rmSync(dest, { force: true });
      req.resume();
      reject(err);
    };
    req.on('data', (chunk) => {
      size += chunk.length;
      if (head.length < 512) head = Buffer.concat([head, chunk]).subarray(0, 512);
      if (size > maxBytes) fail(new HttpError(413, `Files can be at most ${Math.round(maxBytes / 1024 / 1024)} MB.`));
      else if (!out.write(chunk)) { req.pause(); out.once('drain', () => req.resume()); }
    });
    req.on('end', () => {
      if (failed) return;
      if (size === 0) return fail(new HttpError(400, 'The file is empty.'));
      if (!matchesSignature(mime, head)) return fail(new HttpError(415, "The file's contents don't match its type."));
      out.end(() => resolve(size));
    });
    req.on('error', fail);
    out.on('error', fail);
  });
}

export function registerAttachmentRoutes(router) {
  // Raw upload: the body is the file itself, Content-Type is its type, X-File-Name its (URL-encoded) name.
  async function upload(ctx) {
    const user = requireUser(ctx);
    uploadLimit(ctx.req);
    const card = cardAccess(ctx.db, user.id, ctx.params.id, 'editor');
    const mime = (ctx.req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_TYPES[mime]) throw new HttpError(415, 'This file type is not allowed. Upload images, PDFs, text, CSV, Office documents or ZIP files.');
    const maxBytes = ctx.config.maxUploadMb * 1024 * 1024;
    if (Number(ctx.req.headers['content-length'] || 0) > maxBytes) throw new HttpError(413, `Files can be at most ${ctx.config.maxUploadMb} MB.`);
    const { n } = ctx.db.prepare('SELECT COUNT(*) AS n FROM attachments WHERE card_id = ?').get(card.id);
    if (n >= MAX_PER_CARD) throw new HttpError(400, `A card can have at most ${MAX_PER_CARD} attachments.`);

    mkdirSync(ctx.config.uploadDir, { recursive: true });
    const storedName = randomBytes(16).toString('hex');
    const size = await saveUpload(ctx.req, filePath(ctx.config, storedName), maxBytes, mime);
    const { lastInsertRowid } = ctx.db.prepare(`INSERT INTO attachments (card_id, uploader_id, stored_name, original_name, mime, size)
      VALUES (?, ?, ?, ?, ?, ?)`).run(card.id, user.id, storedName, cleanName(ctx.req.headers['x-file-name']), mime, size);
    return { status: 201, body: { attachment: mapAttachment(ctx.db.prepare('SELECT * FROM attachments WHERE id = ?').get(lastInsertRowid)) } };
  }
  upload.rawBody = true;
  router.post('/api/cards/:id/attachments', upload);

  router.get('/api/attachments/:id', (ctx) => {
    const user = requireUser(ctx);
    const a = ctx.db.prepare(`SELECT a.*, l.board_id FROM attachments a JOIN cards c ON c.id = a.card_id
      JOIN lists l ON l.id = c.list_id WHERE a.id = ?`).get(Number(ctx.params.id) || 0);
    if (!a) throw new HttpError(404, 'Attachment not found.');
    boardAccess(ctx.db, user.id, a.board_id);
    const file = filePath(ctx.config, a.stored_name);
    if (!existsSync(file)) throw new HttpError(404, 'Attachment file is missing.');
    const inline = IMAGE_TYPES.has(a.mime);
    const ascii = a.original_name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    ctx.res.writeHead(200, {
      'Content-Type': a.mime,
      'Content-Length': statSync(file).size,
      // Images display inline; everything else is always downloaded, never rendered by the browser.
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(a.original_name)}`,
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    createReadStream(file).pipe(ctx.res);
    return { handled: true };
  });

  router.delete('/api/attachments/:id', (ctx) => {
    const user = requireUser(ctx);
    const a = ctx.db.prepare('SELECT * FROM attachments WHERE id = ?').get(Number(ctx.params.id) || 0);
    if (!a) throw new HttpError(404, 'Attachment not found.');
    cardAccess(ctx.db, user.id, a.card_id, 'editor');
    ctx.db.prepare('DELETE FROM attachments WHERE id = ?').run(a.id);
    return { status: 204 };
  });
}

