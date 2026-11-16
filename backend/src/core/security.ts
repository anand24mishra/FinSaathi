import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ApiError } from '../../../shared/contract';

export const apiError = (code: string, message: string, retryable = false): ApiError => ({ error: { code, message, retryable } });

// ---------- token-bucket rate limiter ----------
class Bucket {
  tokens: number; last: number;
  constructor(public capacity: number, public refillPerSec: number, now: number) { this.tokens = capacity; this.last = now; }
  take(now: number): { ok: boolean; retryAfterSec: number } {
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.refillPerSec);
    this.last = now;
    if (this.tokens >= 1) { this.tokens -= 1; return { ok: true, retryAfterSec: 0 }; }
    return { ok: false, retryAfterSec: Math.ceil((1 - this.tokens) / this.refillPerSec) };
  }
}

export interface RateOptions { generalPerMin: number; authPerMin: number }

export function installSecurity(app: FastifyInstance, rate: RateOptions): void {
  const buckets = new Map<string, Bucket>();
  const sweep = setInterval(() => {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [k, b] of buckets) if (b.last < cutoff) buckets.delete(k);
  }, 60 * 1000);
  sweep.unref();
  app.addHook('onClose', async () => clearInterval(sweep));

  const limit = (key: string, perMin: number, reply: FastifyReply): boolean => {
    const now = Date.now();
    let b = buckets.get(key);
    if (!b) { b = new Bucket(perMin, perMin / 60, now); buckets.set(key, b); }
    const r = b.take(now);
    if (!r.ok) {
      reply.header('retry-after', String(r.retryAfterSec)).code(429).send(apiError('rate_limited', 'Too many requests. Please wait a little and try again.', true));
      return false;
    }
    return true;
  };

  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const path = req.url.split('?')[0]!;
    if (req.method === 'OPTIONS') return;
    if (path.startsWith('/v1/auth/')) {
      if (!limit(`auth:${req.ip}`, rate.authPerMin, reply)) return reply;
    }
    if (!limit(`gen:${req.ip}`, rate.generalPerMin, reply)) return reply;
  });

  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
    reply.header('cross-origin-resource-policy', 'same-site');
    reply.header('cache-control', 'no-store');
    return payload;
  });
}

/** Browser/Expo dev origins we accept. Native apps send no Origin header and are always allowed. */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    if (u.protocol === 'exp:' || u.protocol === 'exps:') return true;
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const h = u.hostname;
    if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1') return true;
    // LAN dev servers (Expo web / device on same Wi-Fi)
    return /^(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(h) || h.endsWith('.local');
  } catch { return false; }
}
