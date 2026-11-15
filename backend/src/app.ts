import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config, type AppConfig } from './config';
import { initDb } from './db';
import { marketPlugin } from './market/index';
import { agentPlugin } from './agent/routes';
import { authHook, authedRoutes, publicRoutes } from './core/routes';
import { apiError, installSecurity, isAllowedOrigin } from './core/security';
import { livePlugin, type LiveOptions } from './market/liveWs';

export interface BuildOptions { logger?: boolean; rate?: AppConfig['rate']; dbPath?: string; skipDbInit?: boolean; live?: LiveOptions }

export async function buildApp(opts: BuildOptions = {}): Promise<FastifyInstance> {
  if (!opts.skipDbInit) initDb(opts.dbPath ?? config.dbPath);

  const app = Fastify({
    bodyLimit: config.bodyLimitBytes,
    logger: opts.logger === false ? false : {
      level: process.env.LOG_LEVEL ?? 'info',
      redact: { paths: ['req.headers.authorization', 'req.headers.cookie', 'req.body', 'res.headers["set-cookie"]'], censor: '[redacted]' },
      serializers: { req: (r) => ({ method: r.method, url: String(r.url).split('?')[0], remoteAddress: r.ip }) },
    },
    trustProxy: false,
  });

  // Tolerate POSTs that send content-type JSON with an empty body (e.g. /alerts/refresh).
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const text = typeof body === 'string' ? body : body.toString('utf8');
    if (text.trim() === '') return done(null, undefined);
    try { done(null, JSON.parse(text)); } catch { const e = new Error('Request body is not valid JSON') as Error & { statusCode: number; code: string }; e.statusCode = 400; e.code = 'bad_json'; done(e, undefined); }
  });

  await app.register(cors, {
    origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['authorization', 'content-type'],
    maxAge: 600,
  });
  installSecurity(app, opts.rate ?? config.rate);

  app.setErrorHandler((err: Error & { statusCode?: number; code?: string }, req, reply) => {
    if (err instanceof z.ZodError) {
      const msg = err.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ');
      return reply.code(400).send(apiError('validation_error', msg));
    }
    const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
    if (status >= 500) {
      req.log.error({ err: { name: err.name, message: err.message, stack: err.stack } }, 'request failed');
      return reply.code(500).send(apiError('internal_error', 'Something went wrong on our side. Please try again.', true));
    }
    const code = status === 413 ? 'payload_too_large' : status === 429 ? 'rate_limited' : err.code === 'bad_json' ? 'bad_request' : 'bad_request';
    return reply.code(status).send(apiError(code, status === 413 ? 'That request is too large.' : err.message || 'Bad request', status === 429));
  });
  app.setNotFoundHandler((_req, reply) => reply.code(404).send(apiError('not_found', 'That route does not exist.')));

  // Live quotes over WebSocket (/v1/ws?token=<jwt>): auth is the JWT in the query string, so it lives outside the header-auth scope.
  await app.register(websocket, { options: { maxPayload: 16 * 1024 } });
  await app.register(livePlugin, opts.live ?? {});
  await app.register(publicRoutes);
  await app.register(async (scope) => {
    scope.addHook('preHandler', authHook);
    await scope.register(authedRoutes);
    // Market routes live in the authenticated scope. They may be stubs; never let them break boot.
    try { await scope.register(agentPlugin, { prefix: '/v1' }); } catch (e) { app.log.error({ err: (e as Error).message }, 'agent plugin failed to register'); }
    try { await scope.register(marketPlugin, { prefix: '/v1' }); } catch (e) { app.log.error({ err: (e as Error).message }, 'market plugin failed to register'); }
  });

  return app;
}
