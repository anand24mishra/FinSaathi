import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AuthResponse, Lang } from '../../../shared/contract';
import { config } from '../config';
import { listAlerts, markAlertRead, refreshAlerts, unreadCount } from './alerts';
import { dummyVerify, hashPassword, signJwt, verifyJwt, verifyPassword } from './crypto';
import { getTerm, searchTerms } from './education';
import { getHealth } from './health';
import { LinkRateLimited, getTelegramStatus, startTelegramLink, unlinkTelegram } from './telegramBot';
import { getMarketOverview } from '../market/overview';
import { buildPlan, planRequestSchema } from './planner';
import { addHolding, deleteHolding, updateHolding, getPortfolioHealth, getPortfolioView, holdingInputSchema } from './portfolio';
import { apiError } from './security';
import { claimAccount, createUser, findUserRowByEmail, getUser, normalizeEmail, profileUpdateSchema, setPushToken, touchActive, updateProfile, getProfile } from './users';

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Please enter your name').max(80),
  email: z.string().trim().max(200).pipe(z.email('Please enter a valid email address')),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  language: z.enum(['en', 'hi']).optional(),
});
const loginSchema = z.object({ email: z.string().trim().max(200), password: z.string().min(1).max(128) });
const pushSchema = z.object({ token: z.string().min(5).max(300), platform: z.enum(['ios', 'android', 'web']) });

const langOf = (q: unknown, fallback: Lang): Lang => {
  const v = (q as { lang?: string } | undefined)?.lang;
  return v === 'hi' || v === 'en' ? v : fallback;
};


/** Public routes: health, auth, education. */
export const publicRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/health', async () => getHealth());

  /** Public landing-page ticker: just the headline Indian indices (market data, nothing personal). */
  app.get('/v1/public/pulse', async (_req, reply) => {
    try { const o = await getMarketOverview('en'); return { asOf: o.asOf, india: o.india, fx: o.fx }; }
    catch { return reply.code(502).send(apiError('upstream_unavailable', 'Market data is unavailable right now.')); }
  });

  app.post('/v1/auth/register', async (req, reply) => {
    const body = registerSchema.parse(req.body ?? {});
    if (findUserRowByEmail(body.email)) {
      await dummyVerify(body.password);
      return reply.code(409).send(apiError('email_taken', 'An account with this email already exists. Try logging in instead.'));
    }
    const { salt, hash } = await hashPassword(body.password);
    let user;
    try { user = createUser({ name: body.name, email: normalizeEmail(body.email), salt, hash, language: body.language }); }
    catch { return reply.code(409).send(apiError('email_taken', 'An account with this email already exists. Try logging in instead.')); }
    const token = signJwt({ sub: user.id }, config.jwtSecret, config.jwtTtlSec);
    const res: AuthResponse = { token, user };
    return reply.code(201).send(res);
  });

  /** Instant start: no form. Creates an anonymous account (random unguessable credentials) that is already onboarded. */
  app.post('/v1/auth/guest', async (req, reply) => {
    const body = z.object({ language: z.enum(['en', 'hi']).optional() }).parse(req.body ?? {});
    const { salt, hash } = await hashPassword(randomBytes(24).toString('hex'));
    const user0 = createUser({ name: 'Guest', email: `guest-${randomUUID()}@guest.finsaathi.app`, salt, hash, language: body.language });
    const user = updateProfile(user0.id, { onboarded: true, experience: 'beginner', riskLevel: 'balanced', goals: ['wealth'], horizonYears: 5 }) ?? user0;
    const res: AuthResponse = { token: signJwt({ sub: user.id }, config.jwtSecret, config.jwtTtlSec), user };
    return reply.code(201).send(res);
  });

  app.post('/v1/auth/login', async (req, reply) => {
    const body = loginSchema.parse(req.body ?? {});
    const row = findUserRowByEmail(body.email);
    if (!row) { await dummyVerify(body.password); return reply.code(401).send(apiError('invalid_credentials', 'Email or password is incorrect.')); }
    if (!(await verifyPassword(body.password, row.pw_salt, row.pw_hash))) return reply.code(401).send(apiError('invalid_credentials', 'Email or password is incorrect.'));
    const user = getUser(row.id)!;
    touchActive(user.id);
    const res: AuthResponse = { token: signJwt({ sub: user.id }, config.jwtSecret, config.jwtTtlSec), user };
    return res;
  });

  app.get('/v1/education/terms', async (req) => {
    const q = req.query as { q?: string; category?: string };
    return searchTerms(typeof q.q === 'string' ? q.q.slice(0, 100) : undefined, typeof q.category === 'string' ? q.category : undefined);
  });
  app.get('/v1/education/terms/:id', async (req, reply) => {
    const t = getTerm((req.params as { id: string }).id);
    return t ?? reply.code(404).send(apiError('not_found', 'That term was not found.'));
  });
};

const lastTouch = new Map<string, number>();

/** Authenticated routes. Market plugin is registered into this same scope by app.ts. */
export const authHook = async (req: FastifyRequest, reply: FastifyReply) => {
    const h = req.headers.authorization;
    const m = typeof h === 'string' ? /^Bearer\s+(\S+)$/i.exec(h) : null;
    const claims = m ? verifyJwt(m[1]!, config.jwtSecret) : null;
    if (!claims || !getUser(claims.sub)) return reply.code(401).send(apiError('unauthorized', 'Please log in again.'));
    req.user = { id: claims.sub };
    const now = Date.now();
    if (now - (lastTouch.get(claims.sub) ?? 0) > 60_000) { lastTouch.set(claims.sub, now); touchActive(claims.sub); }
};

export const authedRoutes: FastifyPluginAsync = async (app) => {

  app.get('/v1/me', async (req) => getUser(req.user!.id));
  /** Save a guest account: set a real name, email and password so the data survives a cleared browser or a new device. */
  app.post('/v1/me/claim', async (req, reply) => {
    const body = registerSchema.omit({ language: true }).parse(req.body ?? {});
    if (findUserRowByEmail(body.email)) { await dummyVerify(body.password); return reply.code(409).send(apiError('email_taken', 'An account with this email already exists. Try logging in instead.')); }
    const { salt, hash } = await hashPassword(body.password);
    let user;
    try { user = claimAccount(req.user!.id, { name: body.name, email: body.email, salt, hash }); }
    catch { return reply.code(409).send(apiError('email_taken', 'An account with this email already exists. Try logging in instead.')); }
    if (!user) return reply.code(400).send(apiError('not_a_guest', 'This account is already saved.'));
    return user;
  });
  app.put('/v1/me/profile', async (req) => {
    const patch = profileUpdateSchema.parse(req.body ?? {});
    return updateProfile(req.user!.id, patch);
  });
  app.post('/v1/me/push-token', async (req) => {
    const b = pushSchema.parse(req.body ?? {});
    setPushToken(req.user!.id, b.token, b.platform);
    return { ok: true };
  });

  // Telegram: link your own chat to receive alerts. No-ops with configured:false when TELEGRAM_BOT_TOKEN is absent.
  app.get('/v1/me/telegram', async (req) => getTelegramStatus(req.user!.id));
  app.post('/v1/me/telegram/link', async (req, reply) => {
    try { return await startTelegramLink(req.user!.id); }
    catch (e) { if (e instanceof LinkRateLimited) return reply.code(429).send(apiError('rate_limited', e.message, true)); throw e; }
  });
  app.delete('/v1/me/telegram', async (req) => unlinkTelegram(req.user!.id));

  app.get('/v1/portfolio', async (req) => getPortfolioView(req.user!.id));
  app.post('/v1/portfolio/holdings', async (req, reply) => {
    const input = holdingInputSchema.parse(req.body ?? {});
    return reply.code(201).send(await addHolding(req.user!.id, input));
  });
  app.put('/v1/portfolio/holdings/:id', async (req, reply) => {
    const input = holdingInputSchema.parse(req.body ?? {});
    const h = await updateHolding(req.user!.id, (req.params as { id: string }).id, input);
    return h ?? reply.code(404).send(apiError('not_found', 'That holding was not found.'));
  });
  app.delete('/v1/portfolio/holdings/:id', async (req, reply) => {
    if (!deleteHolding(req.user!.id, (req.params as { id: string }).id)) return reply.code(404).send(apiError('not_found', 'That holding was not found.'));
    return { ok: true };
  });
  app.get('/v1/portfolio/health', async (req) => getPortfolioHealth(req.user!.id, langOf(req.query, getProfile(req.user!.id).language)));

  app.post('/v1/planner', async (req) => {
    const body = planRequestSchema.parse(req.body ?? {});
    return buildPlan(body, langOf(req.query, getProfile(req.user!.id).language));
  });

  app.get('/v1/alerts', async (req) => listAlerts(req.user!.id, langOf(req.query, getProfile(req.user!.id).language)));
  app.get('/v1/alerts/unread-count', async (req) => ({ count: unreadCount(req.user!.id) }));
  app.post('/v1/alerts/refresh', async (req) => {
    await refreshAlerts(req.user!.id);
    return listAlerts(req.user!.id, langOf(req.query, getProfile(req.user!.id).language));
  });
  app.post('/v1/alerts/:id/read', async (req, reply) => {
    if (!markAlertRead(req.user!.id, (req.params as { id: string }).id)) return reply.code(404).send(apiError('not_found', 'That alert was not found.'));
    return { ok: true };
  });
};

