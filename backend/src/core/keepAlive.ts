// Keeps a Render free web service from sleeping: Render spins a free service down after 15 minutes without INBOUND traffic.
// This pings our own public URL (RENDER_EXTERNAL_URL, set automatically by Render) through Render's edge every 10 minutes, which
// counts as inbound traffic. Off locally (no RENDER_EXTERNAL_URL) or with KEEPALIVE=off.
// Optional KEEPALIVE_HOURS_IST="06-24" lets the service sleep outside those IST hours to save the shared 750 free hours/month.
import { reportService } from './health';

const INTERVAL_MS = 10 * 60_000;
let timer: ReturnType<typeof setInterval> | null = null;
let fetchImpl: typeof fetch = fetch;
export const __setKeepAliveFetch = (f: typeof fetch | null) => { fetchImpl = f ?? fetch; };

/** True when `now` falls inside "HH-HH" IST (end exclusive; "06-24" = 06:00-24:00). Unset/invalid = always. */
export function inActiveHours(spec: string | undefined, now = Date.now()): boolean {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec((spec ?? '').trim());
  if (!m) return true;
  const start = Number(m[1]), end = Number(m[2]);
  const h = new Date(now + 5.5 * 3600_000).getUTCHours();
  return start <= end ? h >= start && h < end : h >= start || h < end;
}

export async function pingOnce(env: NodeJS.ProcessEnv = process.env, now = Date.now()): Promise<boolean | null> {
  const base = env.RENDER_EXTERNAL_URL?.replace(/\/+$/, '');
  if (!base || env.KEEPALIVE?.toLowerCase() === 'off' || !inActiveHours(env.KEEPALIVE_HOURS_IST, now)) return null;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20_000);
  try {
    const res = await fetchImpl(`${base}/v1/health`, { signal: ctl.signal });
    reportService('keepalive', res.ok, `ping ${res.status}`);
    return res.ok;
  } catch (e) { reportService('keepalive', false, `ping failed: ${(e as Error)?.message ?? e}`); return false; }
  finally { clearTimeout(t); }
}

export function startKeepAlive(): void {
  if (timer || !process.env.RENDER_EXTERNAL_URL || process.env.KEEPALIVE?.toLowerCase() === 'off') return;
  timer = setInterval(() => void pingOnce(), INTERVAL_MS);
  timer.unref();
}
export function stopKeepAlive(): void { if (timer) clearInterval(timer); timer = null; }
