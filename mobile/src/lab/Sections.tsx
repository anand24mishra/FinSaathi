import React from 'react';
import { useWindowDimensions, type TextStyle, type ViewStyle } from 'react-native';
import { V as View, Tx as RNText, Pr as Pressable } from './tw';
import type { LabData } from './useLabData';
import { ago, inr, pct, previewCall } from './useLabData';
import type { DirTheme } from './themes';

type CallName = ReturnType<typeof previewCall>;
const CALL_CLASS: Record<CallName, string> = {
  BUY: 'bg-gain text-bg', ACCUMULATE: 'bg-gainbg text-gain', HOLD: 'bg-surface2 text-soft', REDUCE: 'bg-lossbg text-loss', SELL: 'bg-loss text-bg',
};

/** Themed text. Font, size and weight come from the direction; colour from tokens. */
export function T({ t, k = 'body', cls = '', style, children, ...rest }: { t: DirTheme; k?: 'display' | 'h1' | 'h2' | 'body' | 'small' | 'label' | 'num' | 'numLg'; cls?: string; style?: TextStyle; children: React.ReactNode } & Record<string, unknown>) {
  const f = t.font;
  const sty: Record<string, TextStyle> = {
    display: { fontFamily: f.display, fontSize: 44, lineHeight: 48, fontWeight: t.key === 'B' ? '700' : '800', letterSpacing: t.key === 'B' ? -1 : -1.5 },
    h1: { fontFamily: f.display, fontSize: 26, lineHeight: 32, fontWeight: t.key === 'B' ? '700' : '700', letterSpacing: -0.5 },
    h2: { fontFamily: f.display, fontSize: 18, lineHeight: 24, fontWeight: '700' },
    body: { fontFamily: f.body, fontSize: 15, lineHeight: 22 },
    small: { fontFamily: f.body, fontSize: 13, lineHeight: 18 },
    label: { fontFamily: t.key === 'A' ? f.num : f.body, fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
    num: { fontFamily: f.num, fontSize: 15, lineHeight: 20, fontWeight: '600', fontVariant: ['tabular-nums'] },
    numLg: { fontFamily: f.num, fontSize: 30, lineHeight: 36, fontWeight: t.key === 'C' ? '300' : '700', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  };
  return <RNText className={`text-ink ${cls}`} style={[sty[k], style]} {...(rest as object)}>{children}</RNText>;
}

export function Card({ t, cls = '', style, children }: { t: DirTheme; cls?: string; style?: ViewStyle; children: React.ReactNode }) {
  const base: ViewStyle = { borderRadius: t.radius, borderWidth: 1 };
  const extra: ViewStyle = t.key === 'C' ? { shadowColor: '#0B7A5B', shadowOpacity: 0.08, shadowRadius: 24, shadowOffset: { width: 0, height: 8 } } : t.key === 'D' ? { borderWidth: 1 } : t.key === 'B' ? { borderTopWidth: 3 } : {};
  return <View className={`border-line ${t.key === 'D' ? 'bg-surface/70' : 'bg-surface'} ${t.key === 'B' ? 'border-t-ink' : ''} ${cls}`} style={{ ...base, ...extra, ...style }}>{children}</View>;
}

export function CallBadge({ t, call, big }: { t: DirTheme; call: CallName; big?: boolean }) {
  const [bg, fg] = CALL_CLASS[call].split(' ');
  return (
    <View className={bg} style={{ borderRadius: t.key === 'A' || t.key === 'B' ? 3 : 999, paddingHorizontal: big ? 14 : 9, paddingVertical: big ? 7 : 4, alignSelf: 'flex-start' }}>
      <RNText className={fg} style={{ fontFamily: t.font.num, fontSize: big ? 15 : 11, fontWeight: '800', letterSpacing: 0.8 }}>{call}</RNText>
    </View>
  );
}

export function Chip({ t, label, on, tone }: { t: DirTheme; label: string; on?: boolean; tone?: 'ok' | 'off' }) {
  return (
    <Pressable className={on ? 'bg-brand' : 'bg-surface2'} style={{ borderRadius: t.key === 'A' || t.key === 'B' ? 4 : 999, paddingHorizontal: 12, paddingVertical: 8 }} accessibilityRole="button">
      <RNText className={on ? 'text-onbrand' : tone === 'off' ? 'text-soft' : 'text-ink'} style={{ fontFamily: t.font.body, fontSize: 13, fontWeight: '600' }}>{label}</RNText>
    </Pressable>
  );
}

export const Delta = ({ t, v }: { t: DirTheme; v: number | null | undefined }) => <T t={t} k="num" cls={v == null ? 'text-soft' : v >= 0 ? 'text-gain' : 'text-loss'}>{pct(v)}</T>;

const useDesktop = () => useWindowDimensions().width >= 900;
const Wrap = ({ children, pad = 20 }: { children: React.ReactNode; pad?: number }) => <View style={{ width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: pad }}>{children}</View>;

export function Brand({ t }: { t: DirTheme }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
      <RNText className="text-brand" style={{ fontFamily: t.key === 'B' ? t.font.display : t.font.display, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 }}>FinSaathi</RNText>
      <RNText className="text-soft" style={{ fontFamily: 'Hind_600SemiBold, system-ui', fontSize: 14 }}>फ़िनसाथी</RNText>
    </View>
  );
}

/* ---------------- 1. LANDING HERO ---------------- */
export function Hero({ t, d }: { t: DirTheme; d: LabData }) {
  const desk = useDesktop();
  const nifty = d.overview?.india[0], sensex = d.overview?.india[1];
  const cta = (
    <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      <Pressable className="bg-brand" style={{ borderRadius: t.key === 'A' || t.key === 'B' ? 6 : 999, paddingHorizontal: 26, paddingVertical: 15 }} accessibilityRole="button">
        <RNText className="text-onbrand" style={{ fontFamily: t.font.body, fontWeight: '800', fontSize: 16 }}>Start free, no sign-up</RNText>
      </Pressable>
      <T t={t} k="small" cls="text-soft">Opens straight into today's calls.</T>
    </View>
  );
  const ticker = (
    <View style={{ flexDirection: 'row', gap: desk ? 28 : 16, flexWrap: 'wrap' }}>
      {[nifty, sensex].filter(Boolean).map((q) => (
        <View key={q!.symbol}>
          <T t={t} k="label" cls="text-soft">{q!.name}</T>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'baseline' }}><T t={t} k="numLg">{q!.price.toLocaleString('en-IN')}</T><Delta t={t} v={q!.changePct} /></View>
        </View>
      ))}
      {!nifty ? <T t={t} k="small" cls="text-soft">Live prices load when the server is running.</T> : null}
    </View>
  );
  const pad = desk ? 72 : 40;
  if (t.key === 'B') return (
    <Wrap><View style={{ paddingVertical: pad, alignItems: 'center', gap: 18 }}>
      <View style={{ width: '100%', borderTopWidth: 3, borderBottomWidth: 1 }} className="border-ink"><View style={{ paddingVertical: 8, flexDirection: 'row', justifyContent: 'space-between' }}><T t={t} k="label" cls="text-soft">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</T><T t={t} k="label" cls="text-soft">Today's edition</T></View></View>
      <T t={t} k="display" cls="text-center" style={{ fontSize: desk ? 64 : 40, lineHeight: desk ? 68 : 44, textAlign: 'center', maxWidth: 820 }}>What to buy, hold and sell, with the reasons.</T>
      <T t={t} k="body" cls="text-soft text-center" style={{ maxWidth: 560, textAlign: 'center', fontSize: 17, lineHeight: 26 }}>A veteran analyst's morning note for Indian stocks, IPOs and the news that moves them. Evidence on every call.</T>
      {cta}{ticker}
    </View></Wrap>);
  if (t.key === 'C') return (
    <Wrap><View style={{ paddingVertical: pad, gap: 24, alignItems: desk ? 'flex-start' : 'stretch' }}>
      <T t={t} k="label" cls="text-brand">Your daily market analyst</T>
      <T t={t} k="display" style={{ fontSize: desk ? 72 : 42, lineHeight: desk ? 76 : 46, fontWeight: '300', maxWidth: 900 }}>Know what to do with your money <RNText className="text-brand" style={{ fontWeight: '700' }}>today.</RNText></T>
      <T t={t} k="body" cls="text-soft" style={{ fontSize: 19, lineHeight: 28, maxWidth: 560 }}>One clear call per stock: buy, hold or sell, with plain-language reasons. No jargon. No sign-up.</T>
      {cta}
      <Card t={t} style={{ padding: 22, alignSelf: desk ? 'flex-start' : 'stretch' }}>{ticker}</Card>
    </View></Wrap>);
  if (t.key === 'D') return (
    <View style={{ overflow: 'hidden' }}>
      <View pointerEvents="none" style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(60% 60% at 20% 10%, rgba(124,108,255,0.45), transparent 70%), radial-gradient(50% 50% at 85% 30%, rgba(34,211,238,0.28), transparent 70%)' } as ViewStyle} />
      <Wrap><View style={{ paddingVertical: pad + 8, gap: 22, alignItems: desk ? 'flex-start' : 'stretch' }}>
        <View className="bg-surface2" style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start' }}><T t={t} k="label" cls="text-brand2">● Live · NSE · BSE</T></View>
        <T t={t} k="display" style={{ fontSize: desk ? 76 : 44, lineHeight: desk ? 78 : 46, maxWidth: 900 }}>Catch the move <RNText className="text-brand2">before</RNText> it makes the news.</T>
        <T t={t} k="body" cls="text-soft" style={{ fontSize: 18, lineHeight: 27, maxWidth: 560 }}>AI-driven calls on Indian stocks, scored from price, fundamentals, news and social buzz, refreshed every morning.</T>
        {cta}{ticker}
      </View></Wrap>
    </View>);
  return (
    <Wrap><View style={{ paddingVertical: pad, gap: 22, flexDirection: desk ? 'row' : 'column', justifyContent: 'space-between', alignItems: desk ? 'flex-end' : 'stretch' }}>
      <View style={{ gap: 16, maxWidth: 720 }}>
        <T t={t} k="label" cls="text-brand">▌SIGNAL · {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} IST</T>
        <T t={t} k="display" style={{ fontSize: desk ? 60 : 38, lineHeight: desk ? 62 : 40 }}>Buy. Hold. Sell.{'\n'}<RNText className="text-brand">With receipts.</RNText></T>
        <T t={t} k="body" cls="text-soft" style={{ maxWidth: 520 }}>Daily calls on Indian stocks with entry, target and stop, scored by a 20-year-veteran rule set. Every number has a source.</T>
        {cta}
      </View>
      <Card t={t} style={{ padding: 18, minWidth: desk ? 320 : undefined }}>{ticker}</Card>
    </View></Wrap>);
}

/* ---------------- 2. HOME DASHBOARD ---------------- */
export function Home({ t, d }: { t: DirTheme; d: LabData }) {
  const desk = useDesktop();
  const ov = d.overview;
  const pulse = ov ? [...ov.india, ...(ov.fx ? [ov.fx] : []), ...ov.commodities.slice(0, 2)] : [];
  const fav = d.ideas?.favourable.slice(0, 4) ?? [], cau = d.ideas?.cautious.slice(0, 2) ?? [];
  const Row = ({ i }: { i: NonNullable<LabData['ideas']>['favourable'][number] }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
      <View style={{ flex: 1 }}><T t={t} k="body" style={{ fontWeight: '700' }}>{i.name}</T><T t={t} k="small" cls="text-soft">{i.symbol.replace('.NS', '')} · score {i.score}</T></View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}><T t={t} k="num">{inr(i.price)}</T><Delta t={t} v={i.changePct} /></View>
      <View style={{ width: 104, alignItems: 'flex-end' }}><CallBadge t={t} call={previewCall(i.score, i.stance)} /></View>
    </View>
  );
  return (
    <Wrap><View style={{ paddingVertical: 28, gap: 22 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><T t={t} k="h1">Good morning</T><T t={t} k="small" cls="text-soft">{ov ? `Updated ${ago(ov.asOf)}` : 'Loading…'}</T></View>
      <Card t={t} style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: desk ? 36 : 20 }}>
          {pulse.map((q) => (<View key={q.symbol} style={{ minWidth: 120 }}><T t={t} k="label" cls="text-soft">{q.name}</T><T t={t} k="num" style={{ fontSize: 17 }}>{q.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</T><Delta t={t} v={q.changePct} /></View>))}
          {!pulse.length ? <T t={t} k="small" cls="text-soft">Market data unavailable.</T> : null}
        </View>
      </Card>
      <View style={{ flexDirection: desk ? 'row' : 'column', gap: 22, alignItems: 'flex-start' }}>
        <View style={{ flex: desk ? 1.7 : undefined, width: desk ? undefined : '100%', gap: 14 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{['Invest', 'Trade', 'Rising stars', 'Sell / Avoid', 'IPOs'].map((x, i) => <Chip key={x} t={t} label={x} on={i === 0} />)}</View>
          <Card t={t} style={{ paddingHorizontal: 18, paddingVertical: 6 }}>
            {fav.map((i, n) => (<View key={i.symbol} className={n ? 'border-t border-line' : ''}><Row i={i} /></View>))}
            {!fav.length ? <View style={{ padding: 24 }}><T t={t} k="small" cls="text-soft">No calls yet. They appear after the morning run.</T></View> : null}
          </Card>
          {cau.length ? (<><T t={t} k="label" cls="text-soft">Reduce or avoid today</T><Card t={t} style={{ paddingHorizontal: 18, paddingVertical: 6 }}>{cau.map((i, n) => (<View key={i.symbol} className={n ? 'border-t border-line' : ''}><Row i={i} /></View>))}</Card></>) : null}
        </View>
        <View style={{ flex: desk ? 1 : undefined, width: desk ? undefined : '100%', gap: 14 }}>
          <Card t={t} style={{ padding: 20, gap: 10 }}>
            <T t={t} k="label" cls="text-brand">Analyst's note</T>
            <T t={t} k="h2">{ov?.mood.headline ?? 'Market mood loads here'}</T>
            {ov?.mood.bullets.slice(0, 3).map((b) => <T key={b} t={t} k="small" cls="text-soft">• {b}</T>)}
            <T t={t} k="small" cls="text-soft" style={{ fontStyle: 'italic' }}>Research, not SEBI-registered advice.</T>
          </Card>
        </View>
      </View>
    </View></Wrap>
  );
}

/* ---------------- 3. STOCK CALL ---------------- */
export function CallDetail({ t, d }: { t: DirTheme; d: LabData }) {
  const desk = useDesktop();
  const a = d.top; const idea = d.ideas?.favourable[0];
  if (!a || !idea) return <Wrap><View style={{ padding: 40 }}><T t={t} k="small" cls="text-soft">Stock call unavailable right now.</T></View></Wrap>;
  const call = previewCall(a.score, a.stance); const L = a.levels;
  const Lvl = ({ l, v, c }: { l: string; v: string; c?: string }) => <View style={{ flex: 1, minWidth: 130, gap: 4 }}><T t={t} k="label" cls="text-soft">{l}</T><T t={t} k="num" cls={c ?? ''} style={{ fontSize: 18 }}>{v}</T></View>;
  const Bar = ({ l, v }: { l: string; v: number | null }) => (
    <View style={{ gap: 6 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T t={t} k="small">{l}</T><T t={t} k="num" cls={v == null ? 'text-soft' : ''}>{v == null ? 'pending' : `${v}/100`}</T></View>
      <View className="bg-surface2" style={{ height: 8, borderRadius: 8 }}>{v != null ? <View className="bg-brand" style={{ height: 8, borderRadius: 8, width: `${v}%` }} /> : null}</View></View>);
  return (
    <Wrap><View style={{ paddingVertical: 28, gap: 18 }}>
      <Card t={t} style={{ padding: desk ? 28 : 20, gap: 22 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <View style={{ gap: 6 }}><T t={t} k="label" cls="text-soft">Invest call · {a.horizon.label.split('(')[0].trim()}</T><T t={t} k="h1" style={{ fontSize: 30, lineHeight: 36 }}>{a.name}</T><View style={{ flexDirection: 'row', gap: 10, alignItems: 'baseline' }}><T t={t} k="numLg">{inr(idea.price)}</T><Delta t={t} v={idea.changePct} /></View></View>
          <View style={{ alignItems: 'flex-end', gap: 8 }}><CallBadge t={t} call={call} big /><T t={t} k="small" cls="text-soft">Conviction: {a.confidence}</T></View>
        </View>
        {L ? (<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}><Lvl l="Entry zone" v={`${inr(L.entryLow, 0)} – ${inr(L.entryHigh, 0)}`} /><Lvl l="Target" v={`${inr(L.targetLow, 0)} – ${inr(L.targetHigh, 0)}`} c="text-gain" /><Lvl l="Stop-loss" v={inr(L.stopLoss, 0)} c="text-loss" /></View>) : null}
        <T t={t} k="body" cls="text-soft">{a.thesis.split('. ').slice(0, 2).join('. ')}.</T>
      </Card>
      <View style={{ flexDirection: desk ? 'row' : 'column', gap: 18, alignItems: 'flex-start' }}>
        <Card t={t} style={{ flex: desk ? 1 : undefined, width: desk ? undefined : '100%', padding: 22, gap: 16 }}>
          <T t={t} k="label" cls="text-brand">Analyst lenses</T>
          <Bar l="Technical (rules engine)" v={a.score} /><Bar l="Buffett lens: quality & value" v={null} /><Bar l="Jhunjhunwala lens: India growth" v={null} /><Bar l="News & social sentiment" v={null} />
          <T t={t} k="small" cls="text-soft">The Buffett and Jhunjhunwala lenses switch on in the build.</T>
        </Card>
        <Card t={t} style={{ flex: desk ? 1.4 : undefined, width: desk ? undefined : '100%', padding: 22, gap: 12 }}>
          <T t={t} k="label" cls="text-brand">Why this call</T>
          {a.evidence.slice(0, 4).map((e) => (<View key={e.label} style={{ flexDirection: 'row', gap: 10 }}><T t={t} k="body" cls={e.direction === 'positive' ? 'text-gain' : e.direction === 'negative' ? 'text-loss' : 'text-soft'}>{e.direction === 'negative' ? '▼' : e.direction === 'positive' ? '▲' : '●'}</T><View style={{ flex: 1 }}><T t={t} k="body" style={{ fontWeight: '600' }}>{e.label}: {e.value}</T><T t={t} k="small" cls="text-soft">{e.detail}</T></View></View>))}
          <T t={t} k="label" cls="text-loss" style={{ marginTop: 8 }}>What could go wrong</T>
          {a.risks.slice(0, 2).map((r) => <T key={r} t={t} k="small" cls="text-soft">• {r}</T>)}
        </Card>
      </View>
    </View></Wrap>
  );
}

/* ---------------- 4. NEWS & SOCIAL PULSE ---------------- */
export function Pulse({ t, d }: { t: DirTheme; d: LabData }) {
  const desk = useDesktop();
  const items = d.news?.items.slice(0, 6) ?? [];
  const dot = (s: string) => (s === 'positive' ? 'bg-gain' : s === 'negative' ? 'bg-loss' : 'bg-soft');
  return (
    <Wrap><View style={{ paddingVertical: 28, gap: 18 }}>
      <T t={t} k="h1">News & social pulse</T>
      <View style={{ flexDirection: desk ? 'row' : 'column', gap: 18, alignItems: 'flex-start' }}>
        <Card t={t} style={{ flex: desk ? 1.8 : undefined, width: desk ? undefined : '100%', paddingHorizontal: 20, paddingVertical: 8 }}>
          {items.map((n, i) => (
            <View key={n.id} className={i ? 'border-t border-line' : ''} style={{ paddingVertical: 14, gap: 6 }}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><View className={dot(n.sentiment)} style={{ width: 8, height: 8, borderRadius: 8 }} /><T t={t} k="label" cls="text-soft">{n.source} · {ago(n.publishedAt)} · {n.sentiment}</T></View>
              <T t={t} k="body" style={{ fontWeight: '600' }}>{n.title}</T>
              {n.affectedSymbols.length ? <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>{n.affectedSymbols.slice(0, 3).map((s) => <View key={s} className="bg-surface2" style={{ borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 }}><T t={t} k="small" cls="text-brand">{s.replace('.NS', '')}</T></View>)}</View> : null}
            </View>))}
          {!items.length ? <View style={{ padding: 24 }}><T t={t} k="small" cls="text-soft">News is unavailable right now.</T></View> : null}
        </Card>
        <Card t={t} style={{ flex: desk ? 1 : undefined, width: desk ? undefined : '100%', padding: 20, gap: 12 }}>
          <T t={t} k="label" cls="text-brand">Sources</T>
          {[['Google News + finance RSS', 'live', true], ['Reddit · r/IndianStreetBets', 'next build', false], ['X (Twitter)', 'needs API key', false]].map(([n, s, on]) => (
            <View key={n as string} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><T t={t} k="small">{n as string}</T><View className={on ? 'bg-gainbg' : 'bg-surface2'} style={{ borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}><T t={t} k="label" cls={on ? 'text-gain' : 'text-soft'}>{s as string}</T></View></View>))}
          <T t={t} k="small" cls="text-soft">Buzz scores per stock appear once Reddit and X are connected.</T>
        </Card>
      </View>
    </View></Wrap>
  );
}
