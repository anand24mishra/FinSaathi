// Design Lab data: real backend data (guest account, same mechanism as the planned instant onboarding).
import { useEffect, useState } from 'react';
import { API_BASE } from '@/api/client';
import type { Analysis, DailyIdeas, MarketOverview, NewsFeed } from '@/api/contract';

export interface LabData { overview: MarketOverview | null; ideas: DailyIdeas | null; top: Analysis | null; news: NewsFeed | null; loading: boolean; error: string | null }
const KEY = 'finsaathi.lab.guest';

async function token(): Promise<string> {
  try { const t = localStorage.getItem(KEY); if (t) return t; } catch { /* ignore */ }
  const id = Math.random().toString(36).slice(2, 10);
  const r = await fetch(`${API_BASE}/v1/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Guest', email: `guest-${id}@finsaathi.app`, password: `Lab-${id}-${Date.now()}`, language: 'en' }) });
  if (!r.ok) throw new Error('Could not reach the FinSaathi server');
  const t = (await r.json()).token as string;
  try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
  return t;
}

export function useLabData(): LabData {
  const [d, setD] = useState<LabData>({ overview: null, ideas: null, top: null, news: null, loading: true, error: null });
  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const t = await token();
        const get = async <T,>(p: string): Promise<T | null> => { try { const r = await fetch(`${API_BASE}/v1${p}`, { headers: { authorization: `Bearer ${t}` } }); return r.ok ? ((await r.json()) as T) : null; } catch { return null; } };
        const [overview, ideas, news] = await Promise.all([get<MarketOverview>('/market/overview?lang=en'), get<DailyIdeas>('/ideas/daily?lang=en'), get<NewsFeed>('/news?lang=en')]);
        const sym = ideas?.favourable[0]?.symbol;
        const top = sym ? await get<Analysis>(`/stocks/${sym}/analysis?lang=en`) : null;
        if (!off) setD({ overview, ideas, top, news, loading: false, error: overview || ideas || news ? null : 'Data is unavailable right now' });
      } catch (e: any) { if (!off) setD((p) => ({ ...p, loading: false, error: e?.message ?? 'error' })); }
    })();
    return () => { off = true; };
  }, []);
  return d;
}

/** PREVIEW ONLY: maps the current rules score to a call label so the lab can show the planned look. The real calls engine ships in phase 2. */
export const previewCall = (score: number, stance: string): 'BUY' | 'ACCUMULATE' | 'HOLD' | 'REDUCE' | 'SELL' =>
  stance === 'cautious' ? (score < 35 ? 'SELL' : 'REDUCE') : score >= 78 ? 'BUY' : score >= 62 ? 'ACCUMULATE' : 'HOLD';
export const inr = (n: number | null | undefined, d = 2) => (n == null ? '–' : '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const pct = (n: number | null | undefined) => (n == null ? '–' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`);
export const ago = (iso: string) => { const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
