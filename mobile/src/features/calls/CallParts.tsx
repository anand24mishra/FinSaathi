import React from 'react';
import { Pressable, View } from 'react-native';
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

function Bar({ p }: { p: PersonaScore }) {
  const { colors } = useTheme(); const t = useT();
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
        <Text v="small" weight="semibold" style={{ flex: 1 }}>{p.label}</Text>
        <Text v="small" tone={p.score == null ? 'soft' : 'ink'} num weight="bold">{p.score == null ? t('calls.noData') : `${p.score}/100`}</Text>
      </View>
      <View style={{ height: 8, borderRadius: 8, backgroundColor: colors.surfaceAlt }}>{p.score != null ? <View style={{ height: 8, borderRadius: 8, width: `${Math.max(2, p.score)}%`, backgroundColor: colors.primary }} /> : null}</View>
      <Text v="small" tone="soft">{p.summary}</Text>
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
          <Text v="label" tone="primary" weight="bold">{t('calls.lenses').toUpperCase()}</Text>
          {call.personas.map((p) => <Bar key={p.key} p={p} />)}
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
