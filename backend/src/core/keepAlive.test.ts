import { describe, it, expect } from 'vitest';
import { inActiveHours, pingOnce, __setKeepAliveFetch } from './keepAlive';

describe('keepAlive', () => {
  it('honours IST hour windows', () => {
    const at = (istHour: number) => Date.UTC(2026, 10, 23, istHour, 0) - 5.5 * 3600_000;
    expect(inActiveHours('06-24', at(7))).toBe(true);
    expect(inActiveHours('06-24', at(3))).toBe(false);
    expect(inActiveHours('22-06', at(23))).toBe(true);
    expect(inActiveHours(undefined, at(3))).toBe(true);
  });
  it('pings /v1/health, and skips when unconfigured or off', async () => {
    const urls: string[] = [];
    __setKeepAliveFetch((async (u: any) => { urls.push(String(u)); return new Response('{}', { status: 200 }); }) as any);
    expect(await pingOnce({ RENDER_EXTERNAL_URL: 'https://x.onrender.com/' } as any)).toBe(true);
    expect(urls).toEqual(['https://x.onrender.com/v1/health']);
    expect(await pingOnce({} as any)).toBeNull();
    expect(await pingOnce({ RENDER_EXTERNAL_URL: 'https://x.onrender.com', KEEPALIVE: 'off' } as any)).toBeNull();
    expect(urls.length).toBe(1);
  });
});
