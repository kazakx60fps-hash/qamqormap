// SSE арқылы жедел жаңартулар. Қосылымдар процесс жадында сақталады.
const clients = new Map(); // userId | 'anon' -> Set<res>
let nextId = 1;

export function addClient(userId, res) {
  const key = userId ?? 'anon';
  if (!clients.has(key)) clients.set(key, new Set());
  clients.get(key).add(res);
  return () => {
    const set = clients.get(key);
    if (!set) return;
    set.delete(res);
    if (!set.size) clients.delete(key);
  };
}

function write(res, event, data) {
  res.write(`id: ${nextId++}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function sendToUser(userId, event, data) {
  for (const res of clients.get(userId) || []) write(res, event, data);
}

/** Жария өзгеріс: барлық қосылымға тек id, қала және мәртебе жіберіледі (жеке дерек жоқ). */
export function broadcastPublic(event, data) {
  for (const set of clients.values()) for (const res of set) write(res, event, data);
}

export function connectionCount() {
  let n = 0;
  for (const s of clients.values()) n += s.size;
  return n;
}
