import React from 'react';
import { Pressable, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CalendarDays, MessageCircleQuestion, Newspaper, TrendingUp, Wallet, type LucideIcon } from 'lucide-react-native';
import { Text } from './Text';
import { useLayout } from './Layout';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { useT, type Key } from '@/i18n';

export const TABS: { name: string; key: Key; icon: LucideIcon }[] = [
  { name: 'index', key: 'tab.today', icon: CalendarDays },
  { name: 'markets', key: 'tab.markets', icon: TrendingUp },
  { name: 'news', key: 'tab.news', icon: Newspaper },
  { name: 'portfolio', key: 'tab.portfolio', icon: Wallet },
  { name: 'ask', key: 'tab.ask', icon: MessageCircleQuestion },
];
export const ROUTE: Record<string, string> = { index: '/', markets: '/markets', news: '/news', portfolio: '/portfolio', ask: '/ask' };
function activeTab(path: string): string {
  if (path === '/' || path === '') return 'index';
  const seg = path.split('/')[1];
  if (seg === 'stock' || seg === 'fund') return 'markets';
  if (seg === 'plan') return 'index';
  return ROUTE[seg] ? seg : '';
}

export function NavBar() {
  const { colors } = useTheme();
  const { isDesktop } = useLayout();
  const t = useT();
  const active = activeTab(usePathname());
  const router = useRouter();
  const go = (name: string) => router.navigate(ROUTE[name] as never);

  if (isDesktop) {
    return (
      <SafeAreaView edges={['top', 'bottom', 'left']} style={{ width: 240, backgroundColor: colors.surface, borderRightWidth: 1, borderRightColor: colors.line }}>
        <View style={{ padding: space.xl, paddingBottom: space.lg }}>
          <Text v="h2" tone="primary">फ़िनसाथी</Text>
          <Text v="small" tone="soft">FinSaathi</Text>
        </View>
        <View accessibilityRole="tablist" style={{ paddingHorizontal: space.md, gap: 4 }}>
          {TABS.map((tab) => {
            const sel = active === tab.name;
            const Icon = tab.icon;
            return (
              <Pressable key={tab.name} onPress={() => go(tab.name)} accessibilityRole="tab" accessibilityState={{ selected: sel }} accessibilityLabel={t(tab.key)}
                style={({ hovered }: { pressed: boolean; hovered?: boolean }) => ({ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, borderRadius: radius.md, backgroundColor: sel ? colors.primarySoft : hovered ? colors.surfaceAlt : 'transparent' })}>
                <Icon size={24} color={sel ? colors.primary : colors.inkSoft} strokeWidth={2} />
                <Text v="bodyLg" weight={sel ? 'bold' : 'medium'} tone={sel ? 'primary' : 'ink'}>{t(tab.key)}</Text>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={{ backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line }}>
      <View accessibilityRole="tablist" style={{ flexDirection: 'row' }}>
        {TABS.map((tab) => {
          const sel = active === tab.name;
          const Icon = tab.icon;
          return (
            <Pressable key={tab.name} onPress={() => go(tab.name)} accessibilityRole="tab" accessibilityState={{ selected: sel }} accessibilityLabel={t(tab.key)}
              style={{ flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 6, paddingHorizontal: 1, borderTopWidth: 3, borderTopColor: sel ? colors.primary : 'transparent' }}>
              <Icon size={24} color={sel ? colors.primary : colors.inkSoft} strokeWidth={2} />
              <Text v="small" weight={sel ? 'bold' : 'medium'} tone={sel ? 'primary' : 'soft'} numberOfLines={1} style={{ fontSize: 15, lineHeight: 20 }}>{t(tab.key)}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}
