// Minimal, dependency-free SMTP client for transactional email (password resets).
// Supports implicit TLS (port 465, e.g. smtp.hostinger.com) and STARTTLS (port 587).
// Without SMTP_HOST configured, emails are printed to the console instead (development).
import net from 'node:net';
import tls from 'node:tls';
import { randomBytes } from 'node:crypto';

function encodeHeader(value) {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value).toString('base64')}?=`;
}

function addressOnly(from) {
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim();
}

export function buildMessage({ from, to, subject, text }) {
  const body = Buffer.from(text.replace(/\r?\n/g, '\r\n')).toString('base64').replace(/.{76}/g, '$&\r\n');
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomBytes(12).toString('hex')}@${addressOnly(from).split('@')[1] || 'localhost'}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    body,
  ].join('\r\n');
}

// Reads SMTP replies line by line and resolves each complete (possibly multi-line) response.
function responseReader(getSocket) {
  let buffer = '';
  let waiting = null;
  const queue = [];
  const onData = (chunk) => {
    buffer += chunk.toString('utf8');
    let idx;
    while ((idx = buffer.search(/\r?\n/)) >= 0) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(buffer[idx] === '\r' ? idx + 2 : idx + 1);
      queue.push(line);
    }
    flush();
  };
  const lines = [];
  function flush() {
    while (queue.length && waiting) {
      const line = queue.shift();
      lines.push(line);
      if (/^\d{3} /.test(line) || /^\d{3}$/.test(line)) {
        const resolve = waiting;
        waiting = null;
        resolve({ code: Number(line.slice(0, 3)), lines: lines.splice(0) });
      }
    }
  }
  return {
    attach(socket) { socket.on('data', onData); },
    detach(socket) { socket.removeListener('data', onData); },
    next() {
      return new Promise((resolve) => { waiting = resolve; flush(); });
    },
    reset() { buffer = ''; queue.length = 0; },
    getSocket,
  };
}

export async function sendSmtp({ host, port, user, pass, secure = port === 465, allowInsecure = false, timeoutMs = 15000 }, { from, to, raw }) {
  let socket = secure ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
  const reader = responseReader(() => socket);
  reader.attach(socket);
  socket.setTimeout(timeoutMs, () => socket.destroy(new Error('SMTP timeout')));
  const failure = new Promise((_, reject) => socket.once('error', reject));

  const expect = async (codes, what) => {
    const r = await Promise.race([reader.next(), failure]);
    if (!codes.includes(r.code)) throw new Error(`SMTP ${what} failed: ${r.lines.join(' | ')}`);
    return r;
  };
  const cmd = (line, codes, what = line.split(' ')[0]) => {
    socket.write(`${line}\r\n`);
    return expect(codes, what);
  };

  try {
    await expect([220], 'greeting');
    let ehlo = await cmd('EHLO taskapp', [250]);
    if (!secure) {
      if (ehlo.lines.some((l) => /STARTTLS/i.test(l))) {
        await cmd('STARTTLS', [220]);
        reader.detach(socket);
        reader.reset();
        socket = tls.connect({ socket, servername: host });
        reader.attach(socket);
        await new Promise((resolve, reject) => { socket.once('secureConnect', resolve); socket.once('error', reject); });
        ehlo = await cmd('EHLO taskapp', [250]);
      } else if (!allowInsecure) {
        throw new Error('SMTP server does not support STARTTLS; refusing to send credentials unencrypted.');
      }
    }
    if (user) {
      await cmd('AUTH LOGIN', [334]);
      await cmd(Buffer.from(user).toString('base64'), [334], 'AUTH user');
      await cmd(Buffer.from(pass).toString('base64'), [235], 'AUTH password');
    }
    await cmd(`MAIL FROM:<${addressOnly(from)}>`, [250]);
    await cmd(`RCPT TO:<${addressOnly(to)}>`, [250, 251]);
    await cmd('DATA', [354]);
    // Dot-stuffing: lines starting with "." get an extra dot.
    await cmd(`${raw.replace(/\r\n\./g, '\r\n..')}\r\n.`, [250], 'message');
    await cmd('QUIT', [221]).catch(() => {});
  } finally {
    socket.end();
  }
}

export function createMailer(config) {
  const { smtp } = config;
  if (!smtp?.host) {
    return {
      configured: false,
      async send({ to, subject, text }) {
        if (config.isProd) console.warn('[mail] SMTP_HOST is not set, so the email was NOT sent. Configure SMTP to enable password resets.');
        console.log(`\n[mail] To: ${to}\n[mail] Subject: ${subject}\n${text}\n`);
      },
    };
  }
  return {
    configured: true,
    async send({ to, subject, text }) {
      const raw = buildMessage({ from: smtp.from, to, subject, text });
      await sendSmtp(smtp, { from: smtp.from, to, raw });
    },
  };
}
