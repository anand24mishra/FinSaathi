// End-to-end against a real MongoDB (skipped when MONGODB_URI is not set). Uses a throwaway database that is dropped afterwards.
import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoClient } from 'mongodb';

const URI = process.env.MONGODB_URI;
const TEST_DB = `finsaathi_test_${Date.now()}`;
process.env.MONGODB_DB = TEST_DB;
process.env.JWT_SECRET ||= 'test-secret-test-secret-test-secret';

describe.skipIf(!URI)('accounts on MongoDB', () => {
  let app: Awaited<ReturnType<typeof import('../app').buildApp>>;
  beforeAll(async () => {
    const { buildApp } = await import('../app');
    app = await buildApp({ logger: false, rate: { generalPerMin: 10_000, authPerMin: 10_000 } });
  });
  afterAll(async () => {
    await app?.close();
    const { closeStore } = await import('../store'); await closeStore();
    const c = new MongoClient(URI!); await c.connect(); await c.db(TEST_DB).dropDatabase(); await c.close();
  });
  const post = (url: string, payload: unknown, token?: string) => app.inject({ method: 'POST', url, payload: payload as any, headers: token ? { authorization: `Bearer ${token}` } : {} });
  const get = (url: string, token: string) => app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });
  const del = (url: string, token: string) => app.inject({ method: 'DELETE', url, headers: { authorization: `Bearer ${token}` } });

  it('registers, rejects duplicates, logs in, rejects a wrong password', async () => {
    const reg = await post('/v1/auth/register', { name: 'Test Dad', email: 'Dad@Example.com', password: 'longenough1' });
    expect(reg.statusCode).toBe(201); const { token, user } = reg.json();
    expect(user.email).toBe('dad@example.com');
    expect((await post('/v1/auth/register', { name: 'x', email: 'dad@example.com', password: 'longenough1' })).statusCode).toBe(409);
    expect((await post('/v1/auth/login', { email: 'dad@example.com', password: 'wrong-password' })).statusCode).toBe(401);
    expect((await post('/v1/auth/login', { email: 'DAD@example.com', password: 'longenough1' })).statusCode).toBe(200);
    expect((await get('/v1/me', token)).json().id).toBe(user.id);
    expect((await get('/v1/me', 'garbage')).statusCode).toBe(401);
  });

  it('guest, profile update, portfolio holdings and alerts persist', async () => {
    const g = (await post('/v1/auth/guest', { language: 'hi' })).json();
    const upd = await app.inject({ method: 'PUT', url: '/v1/me/profile', payload: { riskLevel: 'growth', language: 'hi' }, headers: { authorization: `Bearer ${g.token}` } });
    expect(upd.json().profile.riskLevel).toBe('growth');
    const add = await post('/v1/portfolio/holdings', { type: 'stock', symbol: 'TCS', quantity: 2, avgPrice: 3000 }, g.token);
    expect(add.statusCode).toBe(201); const h = add.json();
    expect((await get('/v1/portfolio', g.token)).json().holdings.length).toBe(1);
    const put = await app.inject({ method: 'PUT', url: `/v1/portfolio/holdings/${h.id}`, payload: { type: 'stock', symbol: 'TCS', quantity: 5, avgPrice: 3100 }, headers: { authorization: `Bearer ${g.token}` } });
    expect(put.json().quantity).toBe(5);
    const other = (await post('/v1/auth/guest', {})).json();
    expect((await del(`/v1/portfolio/holdings/${h.id}`, other.token)).statusCode).toBe(404);   // not someone else's
    expect((await del(`/v1/portfolio/holdings/${h.id}`, g.token)).statusCode).toBe(200);
    expect((await get('/v1/alerts/unread-count', g.token)).json()).toEqual({ count: 0 });
    const { saveAlerts, listAlerts, markAlertRead } = await import('./alerts');
    const cand = { dedupeKey: 'k1', kind: 'market', severity: 'info', title: { en: 'T', hi: 'ट' }, body: { en: 'B', hi: 'ब' } } as any;
    expect((await saveAlerts(g.user.id, [cand])).length).toBe(1);
    expect((await saveAlerts(g.user.id, [cand])).length).toBe(0);   // deduped
    const list = await listAlerts(g.user.id, 'hi'); expect(list[0]!.title).toBe('ट');
    expect((await get('/v1/alerts/unread-count', g.token)).json()).toEqual({ count: 1 });
    expect(await markAlertRead(g.user.id, list[0]!.id)).toBe(true);
  });

  it('a guest can claim an account', async () => {
    const g = (await post('/v1/auth/guest', {})).json();
    const c = await post('/v1/me/claim', { name: 'Papa', email: 'papa@example.com', password: 'longenough1' }, g.token);
    expect(c.statusCode).toBe(200); expect(c.json().email).toBe('papa@example.com');
    expect((await post('/v1/auth/login', { email: 'papa@example.com', password: 'longenough1' })).statusCode).toBe(200);
  });

  it('telegram link codes are single use', async () => {
    const g = (await post('/v1/auth/guest', {})).json();
    const { createLinkCode, consumeLinkCode, bindChat, chatForUser, userForChat, unlinkUser } = await import('./telegramBot');
    const code = await createLinkCode(g.user.id);
    expect(await consumeLinkCode(code)).toBe(g.user.id);
    expect(await consumeLinkCode(code)).toBeNull();
    await bindChat(g.user.id, '555'); expect(await chatForUser(g.user.id)).toBe('555'); expect(await userForChat('555')).toBe(g.user.id);
    expect(await unlinkUser(g.user.id)).toBe(true); expect(await chatForUser(g.user.id)).toBeNull();
  });

  it('Google sign-in verifies the token, re-uses the account, links by email, and rejects bad tokens', async () => {
    const { __setGoogleFetch, GOOGLE_CLIENT_IDS } = await import('./google');
    const claims = (over: Record<string, unknown> = {}) => ({ iss: 'https://accounts.google.com', aud: GOOGLE_CLIENT_IDS[0], exp: String(Math.floor(Date.now() / 1000) + 3600), sub: 'g-123', email: 'son@gmail.com', email_verified: 'true', name: 'Son', ...over });
    let next: any = claims();
    __setGoogleFetch((async () => new Response(JSON.stringify(next), { status: next.error ? 400 : 200 })) as any);
    const idToken = 'x'.repeat(40);
    const a = await post('/v1/auth/google', { idToken }); expect(a.statusCode).toBe(200);
    const b = await post('/v1/auth/google', { idToken }); expect(b.json().user.id).toBe(a.json().user.id);
    expect((await get('/v1/me', a.json().token)).statusCode).toBe(200);
    const reg = (await post('/v1/auth/register', { name: 'Mom', email: 'mom@gmail.com', password: 'longenough1' })).json();
    next = claims({ sub: 'g-456', email: 'mom@gmail.com' });
    expect((await post('/v1/auth/google', { idToken })).json().user.id).toBe(reg.user.id);   // linked, not duplicated
    for (const bad of [claims({ aud: 'someone-elses-app.apps.googleusercontent.com' }), claims({ exp: '1' }), claims({ email_verified: 'false', sub: 'g-789' }), { error: 'invalid_token' }]) {
      next = bad; expect((await post('/v1/auth/google', { idToken })).statusCode).toBe(401);
    }
    __setGoogleFetch(null);
  });
});
