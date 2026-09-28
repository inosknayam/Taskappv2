import { config } from './config.js';
import { openDatabase } from './db.js';
import { createApp } from './app.js';

const db = openDatabase(config.databaseFile);
const server = createApp({ db, config });

server.listen(config.port, config.host, () => {
  console.log(`API listening on http://${config.host}:${config.port} (${config.isProd ? 'production' : 'development'})`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
