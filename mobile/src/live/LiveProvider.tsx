// One shared WebSocket for live quotes. Screens call useLive(symbols); the provider keeps a ref-counted union of symbols,
// opens the socket lazily, reconnects with backoff, and falls back to polling when the socket cannot be used.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, API_BASE, getAuthToken } from '@/api/client';
import type { LiveClientMsg, LiveServerMsg, Quote, StockDetail } from '@/api/contract';

export type LiveStatus = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'polling';
type Hello = { source: string; intervalSec: number; delayNote: string; max: number } | null;
interface Ctx { quotes: Record<string, Quote>; status: LiveStatus; hello: Hello; subscribe: (symbols: string[]) => () => void }
const LiveCtx = createContext<Ctx>({ quotes: {}, status: 'idle', hello: null, subscribe: () => () => {} });

const wsUrl = (token: string) => `${API_BASE.replace(/^http/, 'ws')}/v1/ws?token=${encodeURIComponent(token)}`;
const MAX_FAILS_BEFORE_POLLING = 3;

export function LiveProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [status, setStatus] = useState<LiveStatus>('idle');
  const [hello, setHello] = useState<Hello>(null);
  const refs = useRef(new Map<string, number>());       // symbol -> subscriber count
  const sent = useRef(new Set<string>());               // symbols the server knows about on the current socket
  const ws = useRef<WebSocket | null>(null);
  const fails = useRef(0);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const pending = useRef<Record<string, Quote>>({});
  const flushT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const on = useRef(enabled); on.current = enabled;

  const flush = useCallback(() => {
    flushT.current = null;
    const p = pending.current; pending.current = {};
    if (Object.keys(p).length) setQuotes((q) => ({ ...q, ...p }));
  }, []);
  const push = useCallback((q: Quote) => { pending.current[q.symbol] = q; if (!flushT.current) flushT.current = setTimeout(flush, 250); }, [flush]);

  const send = (m: LiveClientMsg) => { try { if (ws.current?.readyState === 1) ws.current.send(JSON.stringify(m)); } catch { /* socket closing */ } };
  const sync = useCallback(() => {
    const want = new Set(refs.current.keys());
    const add = [...want].filter((s) => !sent.current.has(s)); const del = [...sent.current].filter((s) => !want.has(s));
    if (add.length) { send({ type: 'subscribe', symbols: add }); add.forEach((s) => sent.current.add(s)); }
    if (del.length) { send({ type: 'unsubscribe', symbols: del }); del.forEach((s) => sent.current.delete(s)); }
  }, []);

  const stopPolling = () => { if (poll.current) { clearInterval(poll.current); poll.current = null; } };
  const startPolling = useCallback(() => {
    if (poll.current) return;
    setStatus('polling');
    const tick = async () => {
      for (const s of [...refs.current.keys()].slice(0, 8)) {
        try { const d = await api.get<StockDetail>(`/stocks/${encodeURIComponent(s)}`, undefined, { retries: 0, timeoutMs: 8000 }); push(d.quote); } catch { /* next tick */ }
      }
    };
    tick(); poll.current = setInterval(tick, 15000);
  }, [push]);

  const close = useCallback(() => {
    if (retry.current) { clearTimeout(retry.current); retry.current = null; }
    const s = ws.current; ws.current = null; sent.current.clear();
    if (s) { s.onclose = null; s.onerror = null; s.onmessage = null; try { s.close(); } catch { /* ignore */ } }
  }, []);

  const connect = useCallback(() => {
    const token = getAuthToken();
    if (!on.current || !token || ws.current || refs.current.size === 0) return;
    if (!poll.current) setStatus(fails.current ? 'reconnecting' : 'connecting'); // keep showing 'polling' while the fallback runs
    let s: WebSocket;
    try { s = new WebSocket(wsUrl(token)); } catch { fails.current++; startPolling(); return; }
    ws.current = s;
    s.onopen = () => { fails.current = 0; stopPolling(); setStatus('live'); sent.current.clear(); sync(); };
    s.onmessage = (e) => {
      let m: LiveServerMsg; try { m = JSON.parse(String(e.data)); } catch { return; }
      if (m.type === 'hello') setHello({ source: m.source, intervalSec: m.intervalSec, delayNote: m.delayNote, max: m.max });
      else if (m.type === 'quote') push(m.quote);
    };
    const lost = () => {
      if (ws.current !== s) return; ws.current = null; sent.current.clear(); fails.current++;
      if (fails.current >= MAX_FAILS_BEFORE_POLLING) startPolling(); else if (!poll.current) setStatus('reconnecting');
      if (refs.current.size && on.current) retry.current = setTimeout(connect, Math.min(30000, 1000 * 2 ** Math.min(fails.current, 5)));
    };
    s.onclose = lost; s.onerror = lost;
  }, [push, startPolling, sync]);

  const subscribe = useCallback((symbols: string[]) => {
    const list = [...new Set(symbols.filter(Boolean))];
    if (idleT.current) { clearTimeout(idleT.current); idleT.current = null; }
    for (const s of list) refs.current.set(s, (refs.current.get(s) ?? 0) + 1);
    if (ws.current?.readyState === 1) sync(); else if (!ws.current && !retry.current) connect();
    return () => {
      for (const s of list) { const n = (refs.current.get(s) ?? 1) - 1; if (n <= 0) refs.current.delete(s); else refs.current.set(s, n); }
      // Tear the socket down only after a short grace period, so swapping the visible symbols does not reconnect.
      if (refs.current.size === 0) { if (!idleT.current) idleT.current = setTimeout(() => { idleT.current = null; if (refs.current.size === 0) { close(); stopPolling(); setStatus('idle'); } }, 3000); } else sync();
    };
  }, [close, connect, sync]);

  useEffect(() => { if (!enabled) { close(); stopPolling(); setStatus('idle'); setQuotes({}); } else if (refs.current.size) connect(); }, [enabled, close, connect]);
  useEffect(() => () => { close(); stopPolling(); if (flushT.current) clearTimeout(flushT.current); if (idleT.current) clearTimeout(idleT.current); }, [close]);

  const value = useMemo(() => ({ quotes, status, hello, subscribe }), [quotes, status, hello, subscribe]);
  return <LiveCtx.Provider value={value}>{children}</LiveCtx.Provider>;
}

/** Live quotes for these symbols (SYMBOL.NS). Returns only the ones that have ticked. */
export function useLive(symbols: string[]) {
  const { quotes, status, hello, subscribe } = useContext(LiveCtx);
  const key = symbols.join(',');
  useEffect(() => (symbols.length ? subscribe(symbols) : undefined), [key, subscribe]); // eslint-disable-line react-hooks/exhaustive-deps
  const mine = useMemo(() => { const o: Record<string, Quote> = {}; for (const s of symbols) if (quotes[s]) o[s] = quotes[s]; return o; }, [quotes, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return { quotes: mine, status, hello };
}
