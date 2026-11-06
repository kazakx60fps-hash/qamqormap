// Координатор құқығын беру/алу (тек сервер әкімшісі іске қосады):
//   npm run make-coordinator -- user@example.com
//   npm run make-coordinator -- user@example.com --remove
import { pool } from '../server/db/pool.js';

const email = process.argv[2];
const remove = process.argv.includes('--remove');
if (!email) {
  console.error('Қолданылуы: npm run make-coordinator -- email@example.com [--remove]');
  process.exit(1);
}
const { rowCount } = await pool.query('UPDATE users SET is_coordinator=$2, updated_at=now() WHERE lower(email)=lower($1)', [email, !remove]);
console.log(rowCount ? `${email}: координатор құқығы ${remove ? 'алынды' : 'берілді'}.` : `${email} аккаунты табылмады.`);
await pool.end();
