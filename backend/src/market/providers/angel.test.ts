import { describe, it, expect, beforeEach } from 'vitest';
import { totp } from '../../core/totp';
import { __setAngelFetch, __setAngelMinGapMs, angelLogin, angelRowToBulkRow, clearAngelBulkCache, getAngelBulk, getAngelIndexQuote, parseScripMaster } from './angel';

describe('totp', () => {
  it('matches RFC 6238 vectors (SHA1)', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    expect(totp(secret, 59_000)).toBe('287082');
    expect(totp(secret, 1111111109_000)).toBe('081804');
    expect(totp(secret, 20000000000_000)).toBe('353130');
  });
});

describe('angel provider', () => {
  beforeEach(() => {
    Object.assign(process.env, { ANGEL_API_KEY: 'k', ANGEL_CLIENT_CODE: 'C1', ANGEL_PIN: '1234', ANGEL_TOTP_SECRET: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' });
    __setAngelMinGapMs(0); clearAngelBulkCache();
  });
  it('parses rows using Angel netChange/percentChange and previous close', () => {
    const r = angelRowToBulkRow('RELIANCE.NS', 'RELIANCE', { ltp: 1500, close: 1480, netChange: 20, percentChange: 1.35, tradeVolume: 1000, exchFeedTime: '20-Nov-2026 15:29:59' })!;
    expect(r.price).toBe(1500); expect(r.prevClose).toBe(1480); expect(r.changePct).toBe(1.35); expect(r.updatedAt).toBeGreaterThan(0);
  });
  it('parses the scrip master to SYMBOL.NS', () => {
    const { equities } = parseScripMaster([{ exch_seg: 'NSE', symbol: 'RELIANCE-EQ', name: 'RELIANCE', token: '2885' }, { exch_seg: 'NFO', symbol: 'X', name: 'X', token: '1' }]);
    expect(equities.get('RELIANCE.NS')?.token).toBe('2885'); expect(equities.size).toBe(1);
  });
  it('logs in, quotes, and re-logs in once on an expired session', async () => {
    let logins = 0, quoteCalls = 0;
    __setAngelFetch((async (url: any, init: any) => {
      const u = String(url);
      if (u.includes('loginByPassword')) {
        logins++; const b = JSON.parse(init.body); expect(b.totp).toMatch(/^\d{6}$/); expect(b.password).toBe('1234');
        return new Response(JSON.stringify({ status: true, data: { jwtToken: `Bearer tok${logins}` } }), { status: 200 });
      }
      if (u.includes('quote')) {
        quoteCalls++;
        if (quoteCalls === 1) return new Response(JSON.stringify({ status: false, message: 'Invalid Token' }), { status: 401 });
        expect(init.headers.Authorization).toBe('Bearer tok2');
        return new Response(JSON.stringify({ status: true, data: { fetched: [{ symbolToken: '99926000', ltp: 24000, close: 23900, netChange: 100, percentChange: 0.42 }] } }), { status: 200 });
      }
      throw new Error(`unexpected ${u}`);
    }) as any);
    expect(await angelLogin()).toBe(true);
    const q = await getAngelIndexQuote('^NSEI');
    expect(q?.price).toBe(24000); expect(logins).toBe(2);
  });
  it('is unconfigured without env', async () => {
    delete process.env.ANGEL_API_KEY; expect(await getAngelBulk()).toBeNull();
  });
});

describe('angel error shape', () => {
  it('treats success:false (e.g. Invalid API Key) as an error, not empty data', async () => {
    Object.assign(process.env, { ANGEL_API_KEY: 'k', ANGEL_CLIENT_CODE: 'C1', ANGEL_PIN: '1234', ANGEL_TOTP_SECRET: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' });
    __setAngelMinGapMs(0); clearAngelBulkCache();
    __setAngelFetch((async (url: any) => String(url).includes('login')
      ? new Response(JSON.stringify({ status: true, data: { jwtToken: 'Bearer t' } }), { status: 200 })
      : new Response(JSON.stringify({ success: false, message: 'Invalid API Key', errorCode: 'AG8004' }), { status: 200 })) as any);
    expect(await getAngelIndexQuote('^NSEI')).toBeNull();
  });
});
