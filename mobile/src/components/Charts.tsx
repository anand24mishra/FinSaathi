import React, { useCallback, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import type { SeriesPoint } from '@/api/contract';
import { Text } from './Text';
import { useTheme } from '@/theme/ThemeProvider';
import { useApp } from '@/state/AppState';
import { downsample, summarizeSeries } from '@/lib/chartData';
import { formatDate, formatNumber } from '@/lib/format';
import { radius, space } from '@/theme/tokens';
import { useT } from '@/i18n';

/** Interactive line/area chart with scrub readout, axis labels and a text summary. Data must be real. */
export function LineChart({ points, height = 220, label, unit = '₹' }: { points: SeriesPoint[]; height?: number; label?: string; unit?: string }) {
  const { colors } = useTheme();
  const { lang } = useApp();
  const t = useT();
  const [w, setW] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const data = useMemo(() => downsample(points, 240), [points]);
  const summary = useMemo(() => summarizeSeries(points, lang, label, unit), [points, lang, label, unit]);
  const lo = useMemo(() => Math.min(...data.map((p) => p.c)), [data]);
  const hi = useMemo(() => Math.max(...data.map((p) => p.c)), [data]);
  const pad = (hi - lo) * 0.08 || 1;
  const minY = lo - pad, maxY = hi + pad;
  const x = useCallback((i: number) => (data.length < 2 ? 0 : (i / (data.length - 1)) * w), [data.length, w]);
  const y = useCallback((c: number) => height - ((c - minY) / (maxY - minY)) * height, [height, minY, maxY]);
  const line = useMemo(() => data.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.c).toFixed(1)}`).join(' '), [data, x, y]);
  const area = line + ` L${w},${height} L0,${height} Z`;
  const wref = useRef(0); wref.current = w;
  const setFromX = useCallback((px: number) => {
    if (!wref.current || data.length < 2) return;
    const i = Math.round(Math.min(1, Math.max(0, px / wref.current)) * (data.length - 1));
    setHover(i);
  }, [data.length]);
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => setFromX(e.nativeEvent.locationX),
    onPanResponderMove: (e) => setFromX(e.nativeEvent.locationX),
    onPanResponderRelease: () => setHover(null), onPanResponderTerminate: () => setHover(null),
  }), [setFromX]);
  if (data.length < 2) return null;
  const sel = hover != null ? data[hover] : data[data.length - 1];
  const webProps = Platform.OS === 'web' ? ({
    onPointerMove: (e: { nativeEvent: { offsetX: number } }) => setFromX(e.nativeEvent.offsetX),
    onPointerLeave: () => setHover(null),
    tabIndex: 0,
    onKeyDown: (e: { key: string; preventDefault: () => void }) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setHover((h) => Math.max(0, Math.min(data.length - 1, (h ?? data.length - 1) + (e.key === 'ArrowLeft' ? -1 : 1)))); }
      if (e.key === 'Escape') setHover(null);
    },
    onBlur: () => setHover(null),
  } as object) : {};
  return (
    <View style={{ gap: space.sm }}>
      <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.md, flexWrap: 'wrap', minHeight: 30 }}>
        <Text v="bodyLg" weight="bold" num>{unit}{formatNumber(sel.c, 2)}</Text>
        <Text v="label" tone="soft">{formatDate(sel.t, lang)}</Text>
        {hover == null ? <Text v="small" tone="soft">{t('chart.hint')}</Text> : null}
      </View>
      <View accessible accessibilityRole="image" accessibilityLabel={summary} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
        style={{ height, borderBottomWidth: 1, borderBottomColor: colors.line, ...(Platform.OS === 'web' ? ({ touchAction: 'pan-y', cursor: 'crosshair' } as object) : null) }}
        {...pan.panHandlers} {...webProps}>
        {w > 0 ? (
          <Svg width={w} height={height} pointerEvents="none">
            {[0.25, 0.5, 0.75].map((g) => <Line key={g} x1={0} x2={w} y1={height * g} y2={height * g} stroke={colors.line} strokeWidth={1} strokeDasharray="3 5" />)}
            <Path d={area} fill={colors.primary} opacity={0.1} />
            <Path d={line} stroke={colors.primary} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            {hover != null ? (<>
              <Line x1={x(hover)} x2={x(hover)} y1={0} y2={height} stroke={colors.inkSoft} strokeWidth={1.5} />
              <Circle cx={x(hover)} cy={y(sel.c)} r={6} fill={colors.surface} stroke={colors.primary} strokeWidth={3} />
            </>) : <Circle cx={x(data.length - 1)} cy={y(sel.c)} r={5} fill={colors.primary} />}
          </Svg>
        ) : null}
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, backgroundColor: colors.bg, paddingRight: 6 }}><Text v="small" tone="soft" num>{t('chart.high')} {unit}{formatNumber(hi, 2)}</Text></View>
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, bottom: 0, backgroundColor: colors.bg, paddingRight: 6 }}><Text v="small" tone="soft" num>{t('chart.low')} {unit}{formatNumber(lo, 2)}</Text></View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text v="small" tone="soft">{formatDate(data[0].t, lang)}</Text>
        <Text v="small" tone="soft">{formatDate(data[data.length - 1].t, lang)}</Text>
      </View>
      <Text v="small" tone="soft">{summary}</Text>
    </View>
  );
}

const SERIES_COLORS = { light: ['#1747C7', '#B85400', '#0B7A3E', '#6A3FA0', '#00778B', '#8A6D00'], dark: ['#7AA2FF', '#FFA05C', '#4CD08A', '#C79BFF', '#5CD0E6', '#F0D060'] };

/** Labelled horizontal stacked bar + legend list, so no information is carried by colour alone. */
export function AllocationBar({ items, format }: { items: { key: string; label: string; pct: number; detail?: string }[]; format?: (n: number) => string }) {
  const { colors, isDark } = useTheme();
  const pal = isDark ? SERIES_COLORS.dark : SERIES_COLORS.light;
  const total = items.reduce((s, i) => s + i.pct, 0) || 1;
  const fmt = format ?? ((n: number) => `${formatNumber(n, n % 1 ? 1 : 0)}%`);
  const spoken = items.map((i) => `${i.label} ${fmt(i.pct)}`).join(', ');
  return (
    <View style={{ gap: space.md }}>
      <View accessible accessibilityRole="image" accessibilityLabel={spoken} style={{ flexDirection: 'row', height: 36, borderRadius: radius.sm, overflow: 'hidden', borderWidth: 1, borderColor: colors.line }}>
        {items.map((it, i) => (
          <View key={it.key} style={{ width: `${(it.pct / total) * 100}%`, backgroundColor: pal[i % pal.length], borderRightWidth: i < items.length - 1 ? 2 : 0, borderRightColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
            {it.pct / total >= 0.1 ? <Text v="small" weight="bold" style={{ color: isDark ? '#0B1018' : '#FFFFFF' }} numberOfLines={1}>{i + 1}</Text> : null}
          </View>
        ))}
      </View>
      <View style={{ gap: 2 }}>
        {items.map((it, i) => (
          <View key={it.key} accessible accessibilityLabel={`${i + 1}. ${it.label} ${fmt(it.pct)}${it.detail ? ', ' + it.detail : ''}`} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 36 }}>
            <View style={{ width: 24, height: 24, borderRadius: 4, backgroundColor: pal[i % pal.length], alignItems: 'center', justifyContent: 'center' }}>
              <Text v="small" weight="bold" style={{ color: isDark ? '#0B1018' : '#FFFFFF', fontSize: 14, lineHeight: 18 }}>{i + 1}</Text>
            </View>
            <Text v="body" style={{ flex: 1 }} numberOfLines={2}>{it.label}</Text>
            {it.detail ? <Text v="label" tone="soft" num>{it.detail}</Text> : null}
            <Text v="body" weight="bold" num>{fmt(it.pct)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Simple labelled horizontal bars (sector weights etc.). Value is always printed. */
export function BarList({ items, max = 100 }: { items: { label: string; pct: number }[]; max?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space.md }}>
      {items.map((it) => (
        <View key={it.label} accessible accessibilityLabel={`${it.label} ${formatNumber(it.pct, 1)} percent`} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
            <Text v="label" style={{ flex: 1 }}>{it.label}</Text>
            <Text v="label" weight="bold" num>{formatNumber(it.pct, 1)}%</Text>
          </View>
          <View style={{ height: 12, backgroundColor: colors.surfaceAlt, borderRadius: 6, overflow: 'hidden' }}>
            <View style={{ width: `${Math.min(100, (it.pct / max) * 100)}%`, height: 12, backgroundColor: colors.primary, borderRadius: 6 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** 0-100 score drawn as a bar with segment markers, always accompanied by words. */
export function ScoreMeter({ score, caption }: { score: number; caption: string }) {
  const { colors } = useTheme();
  const s = Math.max(0, Math.min(100, score));
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={caption} accessibilityValue={{ min: 0, max: 100, now: s }} style={{ gap: 6 }}>
      <View style={{ height: 14, backgroundColor: colors.surfaceAlt, borderRadius: 7, borderWidth: 1, borderColor: colors.line }}>
        <View style={{ width: `${s}%`, height: 12, backgroundColor: colors.primary, borderRadius: 6 }} />
        {[25, 50, 75].map((m) => <View key={m} style={{ position: 'absolute', left: `${m}%`, top: 0, bottom: 0, width: 2, backgroundColor: colors.surface }} />)}
      </View>
      <Text v="label" tone="soft">{caption}</Text>
    </View>
  );
}
