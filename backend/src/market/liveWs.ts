// WebSocket live quotes:  GET /v1/ws?token=<jwt>   (browsers / React Native cannot set headers on a WebSocket, so the JWT rides in the query).
// Protocol: LiveClientMsg / LiveServerMsg in shared/contract.ts.
//   server -> {type:'hello', source, intervalSec, delayNote, max}   right after connect
//   client -> {type:'subscribe'|'unsubscribe', symbols:['TCS.NS',...]} ; {type:'ping'} -> {type:'pong'}
//   server -> {type:'quote', quote}  on subscribe (latest known) and afterwards ONLY when price/asOf changed
//   server -> {type:'error', message}  unknown symbols are ignored with a message; subscribing beyond the cap is refused with a message
// Auth failure: an error message is sent, then the socket is closed with code 4401 'unauthorized'.
// ONE shared poll loop serves the union of all subscribed symbols (ref-counted); it starts with the first subscriber and stops with the last.
// Interval ~5s during NSE hours (09:15-15:30 IST Mon-Fri), ~60s otherwise (env LIVE_INTERVAL_OPEN_MS / LIVE_INTERVAL_CLOSED_MS).
import type { FastifyPluginAsync } from 'fastify';
import type { WebSocket } from 'ws';
import type { LiveClientMsg, LiveServerMsg, Quote } from '../../../shared/contract';
import { config } from '../config';
import { verifyJwt } from '../core/crypto';
import { getUser } from '../core/users';
import { createLiveFeed, type LiveFeed } from './liveFeed';
import { isNseOpen } from './providers/nseLive';
import { isEquity, normaliseSymbol } from './reference/nifty50';
import { ensureUniverse } from './universe';

export const WS_MAX_SYMBOLS = 50;
const HEARTBEAT_MS = 30_000;
const MAX_BUFFERED = 1_000_000;       // bytes queued on a socket before we skip pushing to it
const MAX_SKIPS = 20;                 // consecutive skipped pushes before the connection is dropped as a slow consumer

export interface LiveOptions {
  feed?: LiveFeed;
  intervalOpenMs?: number; intervalClosedMs?: number;
  isOpen?: () => boolean;
  authenticate?: (token: string) => boolean;
  heartbeatMs?: number;
}

interface Conn { ws: WebSocket; subs: Set<string>; sent: Map<string, string>; alive: boolean; skips: number }
const keyOf = (q: Quote) => `${q.price}|${q.asOf}`;

export class LiveHub {
  private conns = new Set<Conn>();
  private refs = new Map<string, number>();
  private last = new Map<string, Quote>();
  private timer: NodeJS.Timeout | null = null;
  private polling = false;
  private again = false;
  private closed = false;
  private hb: NodeJS.Timeout | null = null;
  polls = 0;
  constructor(public feed: LiveFeed, private o: Required<Pick<LiveOptions, 'intervalOpenMs' | 'intervalClosedMs' | 'isOpen' | 'heartbeatMs'>>) {}

  intervalMs() { return this.o.isOpen() ? this.o.intervalOpenMs : this.o.intervalClosedMs; }
  stats() { return { connections: this.conns.size, symbols: this.refs.size, running: !!this.timer || this.polling, polls: this.polls }; }
  private send(c: Conn, m: LiveServerMsg) { try { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(m)); } catch { /* socket gone */ } }

  add(ws: WebSocket): Conn {
    const c: Conn = { ws, subs: new Set(), sent: new Map(), alive: true, skips: 0 };
    this.conns.add(c);
    ws.on('pong', () => { c.alive = true; });
    if (!this.hb) {
      this.hb = setInterval(() => {
        for (const x of [...this.conns]) {
          if (!x.alive) { try { x.ws.terminate(); } catch { /* */ } this.remove(x); continue; }
          x.alive = false; try { x.ws.ping(); } catch { /* */ }
        }
      }, this.o.heartbeatMs);
      this.hb.unref();
    }
    this.send(c, { type: 'hello', source: this.feed.name, intervalSec: Math.round(this.intervalMs() / 1000), delayNote: this.feed.delayNote, max: WS_MAX_SYMBOLS });
    return c;
  }

  remove(c: Conn) {
    if (!this.conns.delete(c)) return;
    for (const s of c.subs) this.unref(s);
    c.subs.clear();
    if (!this.conns.size && this.hb) { clearInterval(this.hb); this.hb = null; }
    this.maybeStop();
  }

  async handle(c: Conn, raw: string) {
    let m: LiveClientMsg;
    try { m = JSON.parse(raw); } catch { return this.send(c, { type: 'error', message: 'Messages must be JSON.' }); }
    if (!m || typeof m !== 'object') return this.send(c, { type: 'error', message: 'Messages must be JSON objects.' });
    if (m.type === 'ping') return this.send(c, { type: 'pong' });
    if (m.type !== 'subscribe' && m.type !== 'unsubscribe') return this.send(c, { type: 'error', message: 'Unknown message type. Use subscribe, unsubscribe or ping.' });
    if (!Array.isArray(m.symbols) || m.symbols.length > 500 || m.symbols.some((s) => typeof s !== 'string')) return this.send(c, { type: 'error', message: 'symbols must be an array of SYMBOL.NS strings.' });
    await ensureUniverse();
    const unknown: string[] = [], good: string[] = [];
    for (const raw of m.symbols) {
      let s: string | null = null;
      try { s = normaliseSymbol(raw.slice(0, 40)); } catch { s = null; }
      if (s && isEquity(s)) good.push(s); else unknown.push(String(raw).slice(0, 24));
    }
    if (m.type === 'unsubscribe') {
      for (const s of good) if (c.subs.delete(s)) { c.sent.delete(s); this.unref(s); }
      if (unknown.length) this.send(c, { type: 'error', message: `Ignored unknown symbols: ${unknown.join(', ')}` });
      return this.maybeStop();
    }
    const added: string[] = []; const refused: string[] = [];
    for (const s of new Set(good)) {
      if (c.subs.has(s)) continue;
      if (c.subs.size >= WS_MAX_SYMBOLS) { refused.push(s); continue; }
      c.subs.add(s); this.refs.set(s, (this.refs.get(s) ?? 0) + 1); added.push(s);
    }
    if (unknown.length) this.send(c, { type: 'error', message: `Ignored unknown symbols: ${unknown.join(', ')}` });
    if (refused.length) this.send(c, { type: 'error', message: `Subscription limit is ${WS_MAX_SYMBOLS} symbols per connection; not subscribed: ${refused.slice(0, 10).join(', ')}${refused.length > 10 ? ', ...' : ''}` });
    for (const s of added) { const q = this.last.get(s); if (q) this.push(c, s, q); }
    if (added.some((s) => !this.last.has(s))) this.schedule(0);
    else this.schedule();
  }

  private unref(s: string) {
    const n = (this.refs.get(s) ?? 0) - 1;
    if (n <= 0) { this.refs.delete(s); this.last.delete(s); } else this.refs.set(s, n);
  }
  private maybeStop() {
    if (this.refs.size === 0 && this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  /** (Re)arm the single poll timer. delay 0 = poll now (new symbols without a cached quote). */
  private schedule(delay?: number) {
    if (this.closed || this.refs.size === 0) return;
    if (this.polling) { if (delay === 0) this.again = true; return; }   // the running tick re-arms itself
    if (this.timer && delay === undefined) return;  // already waiting for the next tick
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.tick(), delay ?? this.intervalMs());
    this.timer.unref?.();
  }

  private push(c: Conn, s: string, q: Quote) {
    const k = keyOf(q);
    if (c.sent.get(s) === k) return;
    if ((c.ws.bufferedAmount ?? 0) > MAX_BUFFERED) {
      if (++c.skips >= MAX_SKIPS) { try { c.ws.close(1013, 'slow consumer'); } catch { /* */ } }
      return;                                       // not marked as sent: the next tick retries with fresher data
    }
    c.skips = 0; c.sent.set(s, k);
    this.send(c, { type: 'quote', quote: q });
  }

  private async tick() {
    this.timer = null;
    if (this.closed || this.refs.size === 0 || this.polling) return;
    this.polling = true;
    try {
      const symbols = [...this.refs.keys()];
      this.polls++;
      const quotes = await this.feed.poll(symbols);
      for (const q of quotes) {
        if (!this.refs.has(q.symbol)) continue;
        this.last.set(q.symbol, q);
        for (const c of this.conns) if (c.subs.has(q.symbol)) this.push(c, q.symbol, q);
      }
    } catch { /* the feed must not throw; if it does, try again next tick */ }
    finally { this.polling = false; const now = this.again; this.again = false; this.schedule(now ? 0 : undefined); }
  }

  async close() {
    this.closed = true;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.hb) { clearInterval(this.hb); this.hb = null; }
    for (const c of [...this.conns]) { try { c.ws.close(1001, 'server shutting down'); } catch { /* */ } }
    this.conns.clear(); this.refs.clear(); this.last.clear();
    try { await this.feed.close?.(); } catch { /* */ }
  }
}

const defaultAuth = (token: string): boolean => {
  const claims = verifyJwt(token, config.jwtSecret);
  return !!claims && !!getUser(claims.sub);
};

export const livePlugin: FastifyPluginAsync<LiveOptions> = async (app, opts) => {
  const hub = new LiveHub(opts.feed ?? createLiveFeed(), {
    intervalOpenMs: opts.intervalOpenMs ?? Number(process.env.LIVE_INTERVAL_OPEN_MS || 5000),
    intervalClosedMs: opts.intervalClosedMs ?? Number(process.env.LIVE_INTERVAL_CLOSED_MS || 60_000),
    isOpen: opts.isOpen ?? (() => isNseOpen()),
    heartbeatMs: opts.heartbeatMs ?? HEARTBEAT_MS,
  });
  const authenticate = opts.authenticate ?? defaultAuth;
  app.decorate('liveHub', hub);
  app.addHook('onClose', async () => { await hub.close(); });

  app.get('/v1/ws', { websocket: true }, (socket: WebSocket, req) => {
    const token = (req.query as { token?: string } | undefined)?.token;
    let ok = false;
    try { ok = typeof token === 'string' && token.length < 2000 && authenticate(token); } catch { ok = false; }
    if (!ok) {
      const m: LiveServerMsg = { type: 'error', message: 'Unauthorized: pass a valid ?token=<jwt>.' };
      try { socket.send(JSON.stringify(m)); } catch { /* */ }
      socket.close(4401, 'unauthorized');
      return;
    }
    const c = hub.add(socket);
    socket.on('message', (data) => { void hub.handle(c, data.toString()).catch(() => undefined); });
    socket.on('close', () => hub.remove(c));
    socket.on('error', () => hub.remove(c));
  });
};

declare module 'fastify' { interface FastifyInstance { liveHub: LiveHub } }
// Same effect as fastify-plugin: do not encapsulate, so app.liveHub (stats, tests) is visible on the root instance.
(livePlugin as unknown as Record<symbol, boolean>)[Symbol.for('skip-override')] = true;
