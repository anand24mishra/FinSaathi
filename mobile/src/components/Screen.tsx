import React from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { Text } from './Text';
import { TopBar } from './TopBar';
import { Banner } from './Banner';
import { useLayout } from './Layout';
import { useConnectivity } from './Connectivity';
import { useTheme } from '@/theme/ThemeProvider';
import { MAX_WIDTH, space } from '@/theme/tokens';
import { useT } from '@/i18n';
import { useApp } from '@/state/AppState';
import { DISCLAIMER } from '@/api/contract';
import { formatTime } from '@/lib/format';

type Props = {
  title?: string; subtitle?: string; children: React.ReactNode; topBar?: boolean; back?: boolean; onRefresh?: () => void; refreshing?: boolean;
  disclaimer?: boolean; headerRight?: React.ReactNode; wide?: boolean;
};

export function Screen({ title, subtitle, children, topBar = true, back, onRefresh, refreshing, disclaimer = true, headerRight }: Props) {
  const { colors } = useTheme();
  const { gutter } = useLayout();
  const { online, apiUp, recheck, checking, lastOk } = useConnectivity();
  const { lang } = useApp();
  const t = useT();
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'left', 'right']}>
      <ScrollView
        style={{ flex: 1 }} keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ alignItems: 'center', paddingBottom: space.xxxl }}
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}>
        <View style={{ width: '100%', maxWidth: MAX_WIDTH, paddingHorizontal: gutter }}>
          {topBar ? <TopBar /> : null}
          {!online || !apiUp ? (
            <View style={{ marginTop: space.md }}>
              <Banner tone="offline" title={!online ? t('err.noInternet') : t('err.apiDown')} body={(lastOk ? t('err.lastWorked', { when: formatTime(lastOk, lang) }) + ' ' : '') + t('err.keepsTrying')} actionLabel={t('common.retry')} onAction={recheck} loading={checking} />
            </View>
          ) : null}
          {back ? (
            <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityRole="button" accessibilityLabel={t('common.back')}
              style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: space.sm, alignSelf: 'flex-start' }}>
              <ChevronLeft size={26} color={colors.primary} strokeWidth={2.25} />
              <Text v="bodyLg" weight="semibold" tone="primary">{t('common.back')}</Text>
            </Pressable>
          ) : null}
          {title ? (
            <View style={{ marginTop: back ? 0 : space.xl, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.md, flexWrap: 'wrap' }}>
              <View style={{ flex: 1, minWidth: 200 }}>
                <Text v={title.length > 36 ? 'h2' : 'h1'} accessibilityRole="header">{title}</Text>
                {subtitle ? <Text v="body" tone="soft" style={{ marginTop: 4 }}>{subtitle}</Text> : null}
              </View>
              {headerRight}
            </View>
          ) : null}
          {children}
          {disclaimer ? (
            <View style={{ marginTop: space.xxxl, paddingTop: space.lg, borderTopWidth: 1, borderTopColor: colors.line }}>
              <Text v="small" tone="soft">{DISCLAIMER[lang]}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
