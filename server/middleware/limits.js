import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { ERRORS } from '../messages.js';

const make = (windowMs, max) =>
  rateLimit({
    windowMs,
    limit: Math.max(1, Math.round(max * config.rateLimitScale)),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: ERRORS.RATE_LIMITED, code: 'RATE_LIMITED', params: { minutes: Math.ceil(windowMs / 60e3) } }),
  });

export const authLimiter = make(15 * 60e3, 20);
export const createLimiter = make(60 * 60e3, 15);
export const messageLimiter = make(60e3, 30);
export const actionLimiter = make(60e3, 60);
