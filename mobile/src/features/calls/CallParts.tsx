import React from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { Activity, Newspaper, Rocket, Scale, type LucideIcon } from 'lucide-react-native';
import { Text } from '@/components/Text';
import { Panel } from '@/components/Layout';
import { Change } from '@/components/Change';
import { useTheme } from '@/theme/ThemeProvider';
import { useT, type Key } from '@/i18n';
import { formatINR } from '@/lib/format';
import { radius, space } from '@/theme/tokens';
import type { CallAction, PersonaScore, StockCall } from '@/api/contract';

export function useActionStyle() {
  const { colors: c } = useTheme();
  return (a: CallAction) => ({
    BUY: { bg: c.gain, fg: c.bg }, ACCUMULATE: { bg: c.gainBg, fg: c.gain }, HOLD: { bg: c.surfaceAlt, fg: c.inkSoft },
    REDUCE: { bg: c.lossBg, fg: c.loss }, SELL: { bg: c.loss, fg: c.bg },
  }[a]);
}

export function CallBadge({ action, big }: { action: CallAction; big?: boolean }) {
  const t = useT(); const st = useActionStyle()(action);
  return (
    <View accessibilityLabel={t(`calls.${action}` as Key)} style={{ backgroundColor: st.bg, borderRadius: radius.pill, paddingHorizontal: big ? space.lg : space.md, paddingVertical: big ? space.sm : 5, alignSelf: 'flex-start' }}>
      <Text v={big ? 'bodyLg' : 'small'} weight="bold" style={{ color: st.fg, letterSpacing: 0.6 }}>{t(`calls.${action}` as Key)}</Text>
    </View>
  );
}

/** One line in a call list: name, price, change, call badge. */
export function CallRow({ call, onPress, last, live }: { call: StockCall; onPress?: () => void; last?: boolean; live?: { price: number; changePct: number | null } }) {
  const { colors } = useTheme(); const t = useT();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${call.name}, ${t(`calls.${call.action}` as Key)}`} onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.line, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text v="body" weight="semibold" numberOfLines={1}>{call.name}</Text>
        <Text v="small" tone="soft">{call.symbol.replace('.NS', '')} · {t('calls.score', { n: call.score })}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text v="money" num>{formatINR(live?.price ?? call.price)}</Text>
        <Change pct={live ? live.changePct : call.changePct} />
      </View>
      <View style={{ width: 118, alignItems: 'flex-end' }}><CallBadge action={call.action} /></View>
    </Pressable>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Strong, fair or weak: the same three bands everywhere so a glance is enough. */
function useBand() {
  const { colors: c } = useTheme();
  return (score: number | null) =>
    score == null ? { key: 'none' as const, fg: c.inkSoft, bg: c.surfaceAlt }
    : score >= 65 ? { key: 'strong' as const, fg: c.gain, bg: c.gainBg }
    : score >= 40 ? { key: 'fair' as const, fg: c.caution, bg: c.cautionBg }
    : { key: 'weak' as const, fg: c.loss, bg: c.lossBg };
}

/** Circular score that fills in when the card appears. */
function Ring({ score, color, track, size = 68 }: { score: number | null; color: string; track: string; size?: number }) {
  const reduce = useReducedMotion();
  const stroke = 7; const r = (size - stroke) / 2; const C = 2 * Math.PI * r;
  const target = score == null ? 0 : Math.max(2, Math.min(100, score)) / 100;
  const p = useSharedValue(reduce ? target : 0);
  React.useEffect(() => { p.value = reduce ? target : withDelay(150, withTiming(target, { duration: 900, easing: Easing.out(Easing.cubic) })); }, [p, target, reduce]);
  const arc = useAnimatedProps(() => ({ strokeDashoffset: C * (1 - p.value) }));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" strokeDasharray={score == null ? [4, 6] : undefined} />
        {score != null ? <AnimatedCircle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} strokeLinecap="round" fill="none" strokeDasharray={[C, C]} animatedProps={arc} rotation={-90} origin={`${size / 2}, ${size / 2}`} /> : null}
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Text v="bodyLg" weight="bold" num style={{ color, lineHeight: 22 }}>{score == null ? '—' : score}</Text>
      </View>
    </View>
  );
}

const LENS_ICON: Record<PersonaScore['key'], LucideIcon> = { buffett: Scale, jhunjhunwala: Rocket, technical: Activity, sentiment: Newspaper };

function Bar({ p }: { p: PersonaScore }) {
  const { colors } = useTheme(); const t = useT();
  const band = useBand()(p.score);
  const Icon = LENS_ICON[p.key] ?? Scale;
  return (
    <View accessible accessibilityLabel={`${p.label}, ${p.score == null ? t('calls.noData') : `${p.score} / 100, ${t(`lens.${band.key}` as Key)}`}. ${p.summary}`}
      style={{ flexDirection: 'row', gap: space.md, alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderLeftWidth: 4, borderLeftColor: band.fg, borderRadius: radius.md, padding: space.md }}>
      <Ring score={p.score} color={band.fg} track={band.bg} />
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: band.bg, alignItems: 'center', justifyContent: 'center' }}><Icon size={16} color={band.fg} strokeWidth={2.25} /></View>
          <Text v="small" weight="bold" style={{ flex: 1 }}>{p.label}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <View style={{ backgroundColor: band.bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
            <Text v="small" weight="bold" style={{ color: band.fg }}>{p.score == null ? t('calls.noData') : t(`lens.${band.key}` as Key)}</Text>
          </View>
        </View>
        <Text v="small" tone="soft">{p.summary}</Text>
      </View>
    </View>
  );
}

const Bullets = ({ items, mark, tone }: { items: string[]; mark: string; tone: 'gain' | 'loss' | 'soft' }) => (
  <View style={{ gap: space.sm }}>{items.map((x, i) => (
    <View key={i} style={{ flexDirection: 'row', gap: space.sm }}><Text v="body" tone={tone}>{mark}</Text><Text v="body" style={{ flex: 1 }}>{x}</Text></View>))}</View>
);

/** The full call: levels, analyst lenses, bull vs bear, evidence, risks. */
export function CallCard({ call, wide }: { call: StockCall; wide: boolean }) {
  const t = useT(); const { colors } = useTheme();
  const L = call.levels;
  const Lvl = ({ k, v, tone }: { k: Key; v: string; tone?: 'gain' | 'loss' }) => (
    <View style={{ flex: 1, minWidth: 130, gap: 2 }}><Text v="label" tone="soft">{t(k)}</Text><Text v="money" tone={tone} num style={{ fontSize: 20, lineHeight: 26 }}>{v}</Text></View>);
  return (
    <View style={{ gap: space.lg }}>
      <Panel style={{ gap: space.lg, borderRadius: radius.lg, padding: space.xl }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: space.md }}>
          <View style={{ gap: 4, flexShrink: 1 }}>
            <Text v="label" tone="soft">{t(`calls.mode.${call.mode}` as Key)} · {call.horizon.label.split('(')[0].trim()}</Text>
            <Text v="h1">{call.name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}><Text v="money" num style={{ fontSize: 32, lineHeight: 38 }}>{formatINR(call.price)}</Text><Change pct={call.changePct} /></View>
          </View>
          <View style={{ alignItems: 'flex-end', gap: space.sm }}><CallBadge action={call.action} big /><Text v="small" tone="soft">{t('calls.conviction', { level: t(`calls.level.${call.conviction}` as Key) })}</Text></View>
        </View>
        {L ? (<>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.lg }}>
            <Lvl k="calls.entry" v={`${formatINR(L.entryLow)} – ${formatINR(L.entryHigh)}`} />
            <Lvl k="calls.target" v={`${formatINR(L.targetLow)} – ${formatINR(L.targetHigh)}`} tone="gain" />
            <Lvl k="calls.stop" v={formatINR(L.stopLoss)} tone="loss" />
          </View>
          <Text v="small" tone="soft">{L.basis}</Text>
        </>) : null}
      </Panel>
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: space.lg, alignItems: 'flex-start' }}>
        <Panel style={{ flex: wide ? 1 : undefined, width: wide ? undefined : '100%', gap: space.lg, borderRadius: radius.lg, padding: space.xl }}>
          <View style={{ gap: 2 }}>
            <Text v="label" tone="primary" weight="bold">{t('calls.lenses').toUpperCase()}</Text>
            <Text v="small" tone="soft">{t('lens.hint')}</Text>
          </View>
          <View style={{ gap: space.md }}>{call.personas.map((p) => <Bar key={p.key} p={p} />)}</View>
        </Panel>
        <Panel style={{ flex: wide ? 1.2 : undefined, width: wide ? undefined : '100%', gap: space.lg, borderRadius: radius.lg, padding: space.xl }}>
          <Text v="label" tone="gain" weight="bold">{t('calls.bull').toUpperCase()}</Text>
          <Bullets items={call.bull} mark="▲" tone="gain" />
          <Text v="label" tone="loss" weight="bold">{t('calls.bear').toUpperCase()}</Text>
          <Bullets items={call.bear} mark="▼" tone="loss" />
        </Panel>
      </View>
      <Panel style={{ gap: space.md, borderRadius: radius.lg, padding: space.xl }}>
        <Text v="label" tone="primary" weight="bold">{t('calls.evidence').toUpperCase()}</Text>
        {call.evidence.slice(0, 8).map((e, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: space.sm, paddingBottom: space.sm, borderBottomWidth: i === Math.min(7, call.evidence.length - 1) ? 0 : 1, borderBottomColor: colors.line }}>
            <Text v="body" tone={e.direction === 'positive' ? 'gain' : e.direction === 'negative' ? 'loss' : 'soft'}>{e.direction === 'negative' ? '▼' : e.direction === 'positive' ? '▲' : '●'}</Text>
            <View style={{ flex: 1 }}><Text v="body" weight="semibold">{e.label}: {e.value}</Text><Text v="small" tone="soft">{e.detail}</Text></View>
          </View>))}
        <Text v="label" tone="loss" weight="bold" style={{ marginTop: space.sm }}>{t('calls.risks').toUpperCase()}</Text>
        <Bullets items={call.risks} mark="•" tone="soft" />
        <Text v="small" tone="soft">{call.disclaimer}</Text>
      </Panel>
    </View>
  );
}
