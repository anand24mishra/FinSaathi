import React, { useEffect } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, useReducedMotion } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { useT } from '@/i18n';

export function Skeleton({ height = 18, width = '100%', style }: { height?: number; width?: number | string; style?: ViewStyle }) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => { if (!reduce) o.value = withRepeat(withTiming(0.5, { duration: 900 }), -1, true); }, [reduce, o]);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ height, width: width as number, borderRadius: radius.sm, backgroundColor: colors.line }, a, style]} />;
}

export function SkeletonBlock({ lines = 3 }: { lines?: number }) {
  const t = useT();
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={t('common.loading')} style={{ gap: space.md, paddingVertical: space.md }}>
      <Skeleton height={22} width="55%" />
      {Array.from({ length: lines }).map((_, i) => <Skeleton key={i} width={i === lines - 1 ? '70%' : '100%'} />)}
    </View>
  );
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  const t = useT();
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={t('common.loading')} style={{ gap: space.lg, paddingVertical: space.md }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.lg }}>
          <View style={{ flex: 1, gap: 8 }}><Skeleton width="60%" height={20} /><Skeleton width="35%" height={14} /></View>
          <Skeleton width={80} height={20} />
        </View>
      ))}
    </View>
  );
}
