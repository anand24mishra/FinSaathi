// Shared HTTP plumbing for all market providers: timeouts, retry with backoff,
// concurrency limit (be polite to free endpoints), TTL cache with request coalescing.
//
// NOTE: several upstreams (Yahoo Finance, NSE, Google News RSS) are UNOFFICIAL endpoints used
// for this LOCAL PROTOTYPE only. In production they must be replaced by a licensed data feed;
// every provider sits behind a small adapter interface (providers/types.ts) so that is a swap.

export const httpConfig = { timeoutMs: 8000, retries: 2, backoffMs: 400 };

export class Limiter {
  private active = 0;
  private queue: (() => void)[] = [];
  constructor(private max: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((res) => this.queue.push(res));
    this.active++;
    try { return await fn(); }
    finally { this.active--; this.queue.shift()?.(); }
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class HttpError extends Error {
  constructor(public status: number, msg: string) { super(msg); }
}

export interface GetOpts { headers?: Record<string, string>; timeoutMs?: number; retries?: number; limiter?: Limiter }

/** fetch with timeout + retry (429/5xx/network). Returns the Response (body unread). */
export async function httpFetch(url: string, opts: GetOpts = {}): Promise<Response> {
  const retries = opts.retries ?? httpConfig.retries;
  const run = async (): Promise<Response> => {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? httpConfig.timeoutMs);
      try {
        const res = await fetch(url, { headers: opts.headers, signal: ctl.signal, redirect: 'follow' });
        clearTimeout(timer);
        if (res.status === 429 || res.status >= 500) throw new HttpError(res.status, `HTTP ${res.status} from ${new URL(url).host}`);
        if (!res.ok) throw new HttpError(res.status, `HTTP ${res.status} from ${new URL(url).host}`);
        return res;
      } catch (e) {
        clearTimeout(timer);
        lastErr = e;
        const status = e instanceof HttpError ? e.status : 0;
        const retryable = status === 0 || status === 429 || status >= 500;
        if (!retryable || attempt === retries) break;
        await sleep(httpConfig.backoffMs * 2 ** attempt + Math.random() * 100);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  };
  return opts.limiter ? opts.limiter.run(run) : run();
}

export async function getJson<T = any>(url: string, opts?: GetOpts): Promise<T> {
  const res = await httpFetch(url, { ...opts, headers: { Accept: 'application/json', ...(opts?.headers ?? {}) } });
  return (await res.json()) as T;
}
export async function getText(url: string, opts?: GetOpts): Promise<string> {
  const res = await httpFetch(url, opts);
  return await res.text();
}

// ---------- TTL cache with coalescing + stale fallback ----------
interface Entry<V> { value: V; at: number }
export interface Cached<V> { value: V; at: number; stale: boolean }

export class TtlCache<V> {
  private map = new Map<string, Entry<V>>();
  private inflight = new Map<string, Promise<Entry<V>>>();
  constructor(private ttlMs: number, private maxStaleMs = 24 * 3600_000) {}

  peek(key: string): Entry<V> | undefined { return this.map.get(key); }
  clear() { this.map.clear(); this.inflight.clear(); }

  async wrap(key: string, loader: () => Promise<V>): Promise<Cached<V>> {
    const hit = this.map.get(key);
    const now = Date.now();
    if (hit && now - hit.at < this.ttlMs) return { value: hit.value, at: hit.at, stale: false };
    let p = this.inflight.get(key);
    if (!p) {
      p = loader().then((value) => {
        const e = { value, at: Date.now() };
        this.map.set(key, e);
        return e;
      }).finally(() => this.inflight.delete(key));
      this.inflight.set(key, p);
    }
    try {
      const e = await p;
      return { value: e.value, at: e.at, stale: false };
    } catch (err) {
      // Stale value served ONLY if recent enough; callers surface staleness via the datum's own asOf.
      if (hit && now - hit.at < this.maxStaleMs) return { value: hit.value, at: hit.at, stale: true };
      throw err;
    }
  }
}

export const TTL = { quote: 60_000, series: 15 * 60_000, fundamentals: 6 * 3600_000, news: 10 * 60_000, funds: 3600_000, ipo: 15 * 60_000, flows: 15 * 60_000, analysis: 15 * 60_000 };
export const iso = (ms: number = Date.now()) => new Date(ms).toISOString();
