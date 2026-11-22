// Market + AI routes. Registered by core in the authenticated scope with prefix '/v1'.
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { ApiError, Lang } from '../../../shared/contract';
import { DataError, getSeries, listStocks, getStockDetail, getAnalysis, getDailyIdeas } from './data';
import { getMarketOverview } from './overview';
import { getNews } from './news';
import { getNewsHub } from './hub';
import { getNewsChannel } from './newsChannels';
import { getIpoFeed } from './ipo';
import { getIpoGuide } from './ipoGuide';
import { searchFunds, getFundDetail, runSipSim } from './funds';
import { getAlternatives } from './alternatives';
import { getBriefing } from './briefing';
import { chat } from '../ai/assistant';
import { geminiTranscribe } from '../ai/llm';
import { detectStyle } from '../ai/lang';
import { deleteConversation, getConversation, importLocal, listConversations, renameConversation } from '../ai/conversations';
import { getProfile } from '../core/users';
import { RANGES } from './data';
import { isWhitelisted } from './reference/nifty50';
import { getStockCall, getCallsFeed } from './analysis/calls';
import { getMoversFeed } from './movers';
import { ensureUniverse } from './universe';

const errBody = (code: string, message: string, retryable: boolean): ApiError => ({ error: { code, message, retryable } });
const userId = (req: FastifyRequest): string => (req as any).user?.id ?? 'anonymous';
async function langOf(req: FastifyRequest, q?: string | null): Promise<Lang> {
  if (q === 'hi' || q === 'en') return q;
  try { return (await getProfile(userId(req))).language === 'hi' ? 'hi' : 'en'; } catch { return 'en'; }
}
function fail(reply: FastifyReply, e: unknown) {
  if (e instanceof z.ZodError) return reply.code(400).send(errBody('bad_request', 'Invalid request parameters', false));
  if (e instanceof DataError) {
    const status = e.code === 'unknown_symbol' ? 404 : e.code === 'bad_request' ? 400 : 502;
    return reply.code(status).send(errBody(e.code, e.message, e.retryable));
  }
  return reply.code(500).send(errBody('internal_error', 'Something went wrong on our side. Please try again.', true));
}
const wrap = <Q = any>(fn: (req: FastifyRequest<{ Querystring: Q; Params: any; Body: any }>, reply: FastifyReply) => Promise<unknown>) =>
  async (req: FastifyRequest<{ Querystring: Q; Params: any; Body: any }>, reply: FastifyReply) => { try { return await fn(req, reply); } catch (e) { return fail(reply, e); } };

const langQ = z.object({ lang: z.enum(['en', 'hi']).optional() });
const sipBody = z.object({ schemeCode: z.number().int().positive(), monthly: z.number().min(100).max(10_000_000), years: z.number().int().min(1).max(30), lang: z.enum(['en', 'hi']).optional() });
const AUDIO_TYPES = ['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg'] as const;
const voiceBody = z.object({ audio: z.string().min(100).max(8_500_000), mimeType: z.enum(AUDIO_TYPES), conversationId: z.string().min(1).max(64).optional(), lang: z.enum(['en', 'hi']).default('en') });
const importBody = z.object({ messages: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(4000) })).max(200) });
const chatBody = z.object({ message: z.string().min(1).max(1000), lang: z.enum(['en', 'hi']).default('en'), conversationId: z.string().min(1).max(64).optional(), history: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(2000) })).max(20).optional() });

export const marketPlugin: FastifyPluginAsync = async (app) => {
  app.get('/market/overview', wrap(async (req) => getMarketOverview(await langOf(req, langQ.parse(req.query).lang))));

  app.get('/market/series', wrap(async (req, reply) => {
    const q = z.object({ symbol: z.string().min(1), range: z.enum(['1mo', '3mo', '6mo', '1y', '5y']).default('1y') }).safeParse(req.query);
    await ensureUniverse();
    if (!q.success) return reply.code(400).send(errBody('bad_request', `symbol and range (${RANGES.join('|')}) are required`, false));
    if (!isWhitelisted(q.data.symbol.toUpperCase()) && !isWhitelisted(q.data.symbol)) return reply.code(404).send(errBody('unknown_symbol', 'This symbol is not supported', false));
    const sym = isWhitelisted(q.data.symbol) ? q.data.symbol : q.data.symbol.toUpperCase();
    return getSeries(sym, q.data.range);
  }));

  app.get('/market/movers', wrap(async (req) => {
    const lang = await langOf(req, langQ.parse(req.query).lang);
    try { return await getMoversFeed(lang); }
    catch (e) { throw new DataError('upstream_unavailable', `Market-wide movers are unavailable right now (${(e as Error).message})`, true); }
  }));

  app.get('/stocks', wrap(async (req) => listStocks(z.object({ query: z.string().max(60).optional() }).parse(req.query).query)));
  app.get('/stocks/:symbol', wrap(async (req) => getStockDetail((req.params as any).symbol, await langOf(req, langQ.parse(req.query).lang))));
  app.get('/stocks/:symbol/analysis', wrap(async (req) => getAnalysis((req.params as any).symbol, await langOf(req, langQ.parse(req.query).lang))));
  app.get('/calls', wrap(async (req) => getCallsFeed(await langOf(req, langQ.parse(req.query).lang))));
  app.get('/calls/:symbol', wrap(async (req) => {
    const q = z.object({ lang: z.enum(['en', 'hi']).optional(), mode: z.enum(['invest', 'trade']).default('invest') }).parse(req.query);
    return getStockCall((req.params as any).symbol, q.mode, await langOf(req, q.lang));
  }));
  app.get('/ideas/daily', wrap(async (req) => getDailyIdeas(await langOf(req, langQ.parse(req.query).lang))));

  app.get('/news', wrap(async (req) => {
    const q = z.object({ lang: z.enum(['en', 'hi']).optional(), topic: z.enum(['market', 'economy', 'stocks', 'ipo', 'gold', 'funds']).default('market') }).parse(req.query);
    return getNews(await langOf(req, q.lang), q.topic);
  }));
  app.get('/news/channel', wrap(async (req) => {
    const q = z.object({ lang: z.enum(['en', 'hi']).optional(), id: z.string().max(20).optional() }).parse(req.query);
    return getNewsChannel(await langOf(req, q.lang), q.id ?? 'all');
  }));
  app.get('/news/hub', wrap(async (req) => getNewsHub(await langOf(req, langQ.parse(req.query).lang))));
  app.get('/ipos/guide', wrap(async (req) => getIpoGuide(await langOf(req, langQ.parse(req.query).lang))));
  app.get('/ipos', wrap(async (req) => getIpoFeed(await langOf(req, langQ.parse(req.query).lang))));

  app.get('/funds/search', wrap(async (req) => searchFunds(z.object({ q: z.string().max(80).default('') }).parse(req.query).q)));
  app.get('/funds/:schemeCode', wrap(async (req, reply) => {
    const code = Number((req.params as any).schemeCode);
    if (!Number.isInteger(code) || code <= 0) return reply.code(400).send(errBody('bad_request', 'schemeCode must be a positive integer', false));
    return getFundDetail(code);
  }));
  app.post('/funds/sip-sim', wrap(async (req, reply) => {
    const b = sipBody.safeParse(req.body);
    if (!b.success) return reply.code(400).send(errBody('bad_request', 'Provide schemeCode, monthly (100 to 1 crore) and years (1 to 30)', false));
    return runSipSim(b.data.schemeCode, b.data.monthly, b.data.years, await langOf(req, b.data.lang));
  }));

  app.get('/alternatives', wrap(async (req) => getAlternatives(await langOf(req, langQ.parse(req.query).lang))));
  app.get('/briefing/daily', wrap(async (req) => getBriefing(userId(req), await langOf(req, langQ.parse(req.query).lang))));
  app.post('/assistant/chat', wrap(async (req, reply) => {
    const b = chatBody.safeParse(req.body);
    if (!b.success) return reply.code(400).send(errBody('bad_request', 'message (1 to 1000 characters) is required', false));
    return chat(userId(req), b.data);
  }));

  // Voice: audio -> Gemini transcript (+ detected Hindi/Hinglish/English) -> the same chat pipeline.
  app.post('/assistant/voice', { bodyLimit: 8 * 1024 * 1024 }, wrap(async (req, reply) => {
    const b = voiceBody.safeParse(req.body);
    if (!b.success) return reply.code(400).send(errBody('bad_request', 'audio (base64, up to about 6 MB) and a supported mimeType are required', false));
    const audio = Buffer.from(b.data.audio, 'base64');
    if (audio.length < 200) return reply.code(422).send(errBody('no_speech', 'We could not hear anything. Please try again. / कुछ सुनाई नहीं दिया, कृपया फिर कोशिश करें।', false));
    const t = await geminiTranscribe(audio, b.data.mimeType);
    if (!t) return reply.code(503).send(errBody('voice_unavailable', 'Voice is not available right now. Please type your question. / अभी आवाज़ उपलब्ध नहीं है, कृपया लिखकर पूछें।', true));
    if (!t.transcript) return reply.code(422).send(errBody('no_speech', 'We could not hear that clearly. Please try again. / साफ़ सुनाई नहीं दिया, कृपया फिर कोशिश करें।', false));
    // Trust the script we can see over the model's label (a Devanagari transcript is Hindi; Latin Hindi words are Hinglish).
    const style = detectStyle(t.transcript) === 'en' && t.style !== 'en' ? t.style : detectStyle(t.transcript);
    const res = await chat(userId(req), { message: t.transcript, lang: b.data.lang, style, conversationId: b.data.conversationId }, { viaVoice: true });
    return { ...res, transcript: t.transcript };
  }));

  // Saved chats
  app.get('/assistant/conversations', wrap(async (req) => listConversations(userId(req))));
  app.get('/assistant/conversations/:id', wrap(async (req, reply) => {
    const c = await getConversation(userId(req), String((req.params as any).id));
    return c ?? reply.code(404).send(errBody('not_found', 'Conversation not found', false));
  }));
  app.patch('/assistant/conversations/:id', wrap(async (req, reply) => {
    const b = z.object({ title: z.string().min(1).max(100) }).safeParse(req.body);
    if (!b.success) return reply.code(400).send(errBody('bad_request', 'title is required', false));
    return (await renameConversation(userId(req), String((req.params as any).id), b.data.title)) ? { ok: true } : reply.code(404).send(errBody('not_found', 'Conversation not found', false));
  }));
  app.delete('/assistant/conversations/:id', wrap(async (req, reply) => (await deleteConversation(userId(req), String((req.params as any).id))) ? { ok: true } : reply.code(404).send(errBody('not_found', 'Conversation not found', false))));
  app.post('/assistant/conversations/import', wrap(async (req, reply) => {
    const b = importBody.safeParse(req.body);
    if (!b.success) return reply.code(400).send(errBody('bad_request', 'messages[] is required', false));
    return { id: await importLocal(userId(req), b.data.messages) };
  }));
};
export { marketPlugin as default };
