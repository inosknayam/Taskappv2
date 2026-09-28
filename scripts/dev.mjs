// Runs the API server and the Vite dev server together in ONE terminal, with prefixed,
// colour-coded output. Ctrl+C stops both. No extra dependencies needed.
import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const procs = [
  { name: 'api', color: 34, args: ['run', 'dev', '-w', 'server'] },
  { name: 'web', color: 32, args: ['run', 'dev', '-w', 'client'] },
];

let shuttingDown = false;
const children = procs.map(({ name, color, args }) => {
  const child = spawn(npm, args, { stdio: ['inherit', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: '1' }, shell: process.platform === 'win32' });
  const prefix = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) out.write(prefix + line + '\n');
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    if (shuttingDown) return;
    console.log(`${prefix}exited with code ${code}. Stopping the other process.`);
    stop(code ?? 1);
  });
  return child;
});

function stop(code = 0) {
  shuttingDown = true;
  for (const c of children) if (c.exitCode === null) c.kill('SIGTERM');
  setTimeout(() => process.exit(code), 300);
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
console.log('\x1b[1mTaskApp dev: web → http://localhost:5173   api → http://localhost:4000\x1b[0m');
