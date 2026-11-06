import os from 'node:os';
import { createApp } from './app.js';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { pool, query } from './db/pool.js';

async function main() {
  try {
    await migrate({ log: (m) => console.log(m) });
  } catch (err) {
    console.error('\n[QamqorMap] PostgreSQL-ге қосылу немесе миграция сәтсіз аяқталды.');
    console.error('Себебі:', err.message);
    console.error('.env файлындағы DATABASE_URL мәнін және PostgreSQL қызметінің іске қосылғанын тексеріңіз.\n');
    process.exit(1);
  }
  // Ескірген сессияларды тазалау
  setInterval(() => query('DELETE FROM sessions WHERE expires_at < now()').catch(() => {}), 3600e3).unref();

  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`[QamqorMap] Сайт іске қосылды: http://localhost:${config.port}`);
    // Телефондағы қосымша компьютердегі серверге осы мекенжайлардың бірі арқылы қосылады (бір Wi‑Fi желісінде)
    const lan = Object.values(os.networkInterfaces()).flat()
      .filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => `http://${n.address}:${config.port}`);
    if (lan.length) console.log(`[QamqorMap] Мобильді қосымша үшін API мекенжайы: ${lan.join('  немесе  ')}`);
    if (config.demoLogin) console.log('[QamqorMap] ДЕМО режимі: демо-кіру қосулы, дерекқор — оқу деректері.');
  });
  const stop = () => {
    server.close(() => pool.end().then(() => process.exit(0)));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main();
