import { state, emit } from './state.js';
import { STATIC } from './base.js';

// SSE: хабарламалар мен мәртебелердің жедел жаңартулары. Үзілсе, өздігінен қайта қосылады.
let es = null;
let retryTimer = null;
let attempt = 0;

export function connectRealtime() {
  disconnectRealtime();
  if (typeof EventSource === 'undefined' || STATIC) return;
  es = new EventSource('/api/stream');
  es.addEventListener('hello', () => {
    attempt = 0;
    emit('rt-status', 'online');
  });
  es.addEventListener('notification', (e) => {
    const n = JSON.parse(e.data);
    state.unread += 1;
    emit('notification', n);
    emit('unread', state.unread);
  });
  es.addEventListener('request', (e) => emit('request-changed', JSON.parse(e.data)));
  es.addEventListener('disaster_event', (e) => emit('event-changed', JSON.parse(e.data)));
  es.addEventListener('message', (e) => emit('chat-message', JSON.parse(e.data)));
  es.onerror = () => {
    emit('rt-status', 'offline');
    // Браузер өзі қайта қосылады; жабылып қалса — біртіндеп ұзаратын үзіліспен қайта ашамыз
    if (es.readyState === EventSource.CLOSED) {
      attempt += 1;
      clearTimeout(retryTimer);
      retryTimer = setTimeout(connectRealtime, Math.min(30000, 2000 * attempt));
    }
  };
}

export function disconnectRealtime() {
  clearTimeout(retryTimer);
  if (es) es.close();
  es = null;
}
