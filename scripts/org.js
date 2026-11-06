// Ұйымдарды және олардың мүшелерін басқару (тек сервер әкімшісі іске қосады):
//   npm run org -- create "Ұйым атауы" [city_id]
//   npm run org -- add <org_id> user@example.com coordinator|volunteer
//   npm run org -- remove <org_id> user@example.com
//   npm run org -- list
import { pool } from '../server/db/pool.js';

const [cmd, a, b, c] = process.argv.slice(2);
const fail = (m) => { console.error(m); process.exit(1); };
try {
  if (cmd === 'create') {
    if (!a) fail('Қолданылуы: npm run org -- create "Ұйым атауы" [city_id]');
    const { rows } = await pool.query('INSERT INTO organizations (name, city_id) VALUES ($1,$2) RETURNING id', [a, b ? Number(b) : null]);
    console.log(`Ұйым жасалды: №${rows[0].id} «${a}»`);
  } else if (cmd === 'add' || cmd === 'remove') {
    if (!a || !b) fail('Қолданылуы: npm run org -- add <org_id> email coordinator|volunteer');
    const u = (await pool.query('SELECT id FROM users WHERE lower(email)=lower($1)', [b])).rows[0];
    if (!u) fail(`${b} аккаунты табылмады.`);
    if (cmd === 'remove') {
      const r = await pool.query('DELETE FROM organization_members WHERE org_id=$1 AND user_id=$2', [Number(a), u.id]);
      console.log(r.rowCount ? `${b} ұйымнан шығарылды.` : `${b} бұл ұйымның мүшесі емес.`);
    } else {
      const role = c === 'coordinator' ? 'coordinator' : 'volunteer';
      await pool.query(`INSERT INTO organization_members (org_id, user_id, role) VALUES ($1,$2,$3)
        ON CONFLICT (org_id, user_id) DO UPDATE SET role=EXCLUDED.role`, [Number(a), u.id, role]);
      console.log(`${b} → ұйым №${a}, рөлі: ${role}`);
    }
  } else if (cmd === 'list') {
    const { rows } = await pool.query(`SELECT o.id, o.name, count(m.user_id)::int AS members FROM organizations o
      LEFT JOIN organization_members m ON m.org_id=o.id GROUP BY o.id ORDER BY o.id`);
    for (const r of rows) console.log(`№${r.id}  ${r.name}  (мүшелер: ${r.members})`);
  } else {
    fail('Қолданылуы: npm run org -- create|add|remove|list …');
  }
} finally {
  await pool.end();
}
