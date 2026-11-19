import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Lang } from '../../../shared/contract';
import { getProfile } from '../core/users';
import { getAnalystNote, manualRun } from './analyst';

const q = z.object({ lang: z.enum(['en', 'hi']).optional() });
const langOf = (req: FastifyRequest, v?: string): Lang => {
  if (v === 'hi' || v === 'en') return v;
  try { return getProfile((req as any).user?.id).language === 'hi' ? 'hi' : 'en'; } catch { return 'en'; }
};
const fail = (reply: FastifyReply) => reply.code(500).send({ error: { code: 'internal_error', message: 'Something went wrong on our side. Please try again.', retryable: true } });

export const agentPlugin: FastifyPluginAsync = async (app) => {
  app.get('/agent/note', async (req, reply) => { try { return await getAnalystNote(langOf(req, q.parse(req.query).lang)); } catch { return fail(reply); } });
  app.post('/agent/run', async (req, reply) => { try { return await manualRun(langOf(req, q.parse(req.query).lang)); } catch { return fail(reply); } });
};
