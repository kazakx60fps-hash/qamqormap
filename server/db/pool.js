import pg from 'pg';
import { config } from '../config.js';

// timestamptz мәндері JS Date ретінде, numeric — сан ретінде оқылады
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

pool.on('error', (err) => {
  console.error('[db] Күтпеген қате:', err.message);
});

export function query(text, params) {
  return pool.query(text, params);
}

/** Транзакция ішінде функцияны орындау. */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
