// Қорғауға арналған бөлек демо дерекқор.
//   node scripts/demo.mjs setup  — дерекқорды жасау (болмаса), миграциялар және оқу деректері
//   node scripts/demo.mjs reset  — демо дерекқорды тазалап, қайта толтыру (тек атауы _demo-мен аяқталса)
//   node scripts/demo.mjs start  — серверді демо дерекқормен және демо-кіру қосулы күйде іске қосу
// Негізгі дерекқорға (DATABASE_URL) ешқандай өзгеріс енгізілмейді.
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();
const mainUrl = process.env.DATABASE_URL || 'postgres://qamqor:qamqor_dev@localhost:5432/qamqormap';
const demoUrl = process.env.DEMO_DATABASE_URL || (() => {
  const u = new URL(mainUrl);
  u.pathname = `/${u.pathname.replace(/^\//, '') || 'qamqormap'}_demo`;
  return u.toString();
})();
const demoDb = decodeURIComponent(new URL(demoUrl).pathname.replace(/^\//, ''));
const cmd = process.argv[2] || 'start';

if (!/_demo$/.test(demoDb)) {
  console.error(`[demo] Қауіпсіздік үшін демо дерекқордың атауы _demo-мен аяқталуы керек (қазір: ${demoDb}).`);
  process.exit(1);
}
if (demoUrl === mainUrl) {
  console.error('[demo] DEMO_DATABASE_URL негізгі DATABASE_URL-мен бірдей болмауы керек.');
  process.exit(1);
}

async function ensureDatabase() {
  const probe = new pg.Client({ connectionString: demoUrl });
  try {
    await probe.connect();
    await probe.end();
    return;
  } catch (err) {
    if (err.code !== '3D000') throw err; // дерекқор жоқ емес, басқа қате
  }
  const admin = new pg.Client({ connectionString: mainUrl });
  await admin.connect();
  try {
    const owner = new URL(demoUrl).username || new URL(mainUrl).username;
    await admin.query(`CREATE DATABASE "${demoDb.replace(/"/g, '')}" OWNER "${owner.replace(/"/g, '')}"`);
    console.log(`[demo] Дерекқор жасалды: ${demoDb}`);
  } catch (err) {
    console.error(`[demo] ${demoDb} дерекқорын жасау мүмкін болмады: ${err.message}`);
    console.error(`        PostgreSQL әкімшісі ретінде орындаңыз:  psql -U postgres -c "CREATE DATABASE ${demoDb} OWNER qamqor"`);
    process.exit(1);
  } finally {
    await admin.end();
  }
}

process.env.DATABASE_URL = demoUrl;
process.env.DEMO_LOGIN = 'true';

if (cmd === 'setup' || cmd === 'reset') {
  await ensureDatabase();
  if (cmd === 'reset') {
    const c = new pg.Client({ connectionString: demoUrl });
    await c.connect();
    await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await c.end();
    console.log(`[demo] ${demoDb} тазаланды.`);
  }
  const { migrate } = await import('../server/db/migrate.js');
  const { seed, DEMO_PASSWORD } = await import('../server/db/seed.js');
  const { pool } = await import('../server/db/pool.js');
  await migrate();
  await seed();
  await pool.end();
  console.log(`[demo] Демо дерекқор дайын: ${demoDb}. Барлық демо аккаунттың құпиясөзі: ${DEMO_PASSWORD}`);
  console.log('[demo] Енді іске қосыңыз:  npm run demo');
} else if (cmd === 'start') {
  await ensureDatabase();
  console.log(`[demo] Демо дерекқор: ${demoDb}`);
  await import('../server/index.js');
} else {
  console.error('Қолданылуы: node scripts/demo.mjs setup|reset|start');
  process.exit(1);
}
