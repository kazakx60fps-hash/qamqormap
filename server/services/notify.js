import { sendToUser } from './realtime.js';
import { NOTIFICATIONS, fill } from '../messages.js';

/**
 * Ішкі хабарламаны транзакция ішінде сақтайды. Хабарлама тұрақты түр (type) және параметрлер (params)
 * ретінде жазылады: frontend оны алушының таңдаған тілінде (kk/ru/en) көрсетеді.
 * title/body бағандарында тек қазақша қосалқы мәтін сақталады.
 * SSE жіберу транзакция сәтті аяқталғаннан кейін орындалады (after тізімі).
 */
export async function notify(db, after, { userIds, requestId = null, type, params = {} }) {
  const unique = [...new Set(userIds.filter(Boolean))];
  const [titleTpl, bodyTpl] = NOTIFICATIONS[type] || [type, ''];
  for (const uid of unique) {
    const { rows } = await db.query(
      `INSERT INTO notifications (user_id, request_id, type, title, body, params)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, request_id, type, title, body, params, read_at, created_at`,
      [uid, requestId, type, fill(titleTpl, params).slice(0, 300), fill(bodyTpl, params).slice(0, 600), JSON.stringify(params)],
    );
    after.push(() => sendToUser(uid, 'notification', rows[0]));
  }
}

export async function coordinatorIds(db) {
  const { rows } = await db.query('SELECT id FROM users WHERE is_coordinator');
  return rows.map((r) => r.id);
}
