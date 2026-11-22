import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell, Settings } from 'lucide-react-native';
import { Text } from './Text';
import { useApp } from '@/state/AppState';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { useT } from '@/i18n';
import { useApi } from '@/api/useApi';
import { withLang } from '@/api/client';
import type { Alert } from '@/api/contract';

function CtlButton({ children, onPress, label, selected, disabled, wide }: { children: React.ReactNode; onPress: () => void; label: string; selected?: boolean; disabled?: boolean; wide?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled, selected }}
      {...({ title: label } as object)}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
        minHeight: 44, minWidth: wide ? 64 : 44, paddingHorizontal: wide ? 14 : 8, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4,
        borderRadius: radius.pill, borderWidth: wide ? 1.5 : 0, borderColor: colors.line, backgroundColor: pressed || hovered ? colors.surfaceAlt : wide ? colors.surface : 'transparent', opacity: disabled ? 0.45 : 1,
      })}>
      {children}
    </Pressable>
  );
}

/** Always-visible controls: language, text size, alerts, settings. */
export function TopBar() {
  const { lang, setLang } = useApp();
  const { colors } = useTheme();
  const t = useT();
  const router = useRouter();
  const alerts = useApi<Alert[]>(withLang('/alerts', lang), { fresh: 30000, pollMs: 60000 });
  const unread = (alerts.data ?? []).filter((a) => !a.read).length;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, paddingTop: space.md }} accessibilityRole="toolbar">
      <Pressable onPress={() => router.navigate('/')} accessibilityRole="link" accessibilityLabel="FinSaathi" style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm, flexShrink: 1 }}>
        <Text v="h3" tone="primary" weight="bold">FinSaathi</Text>
        <Text v="small" tone="soft">फ़िनसाथी</Text>
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <CtlButton wide onPress={() => setLang(lang === 'en' ? 'hi' : 'en')} label={lang === 'en' ? t('top.switchToHindi') : t('top.switchToEnglish')}>
          <Text v="label" weight="semibold" tone="primary">{lang === 'en' ? 'हिन्दी' : 'English'}</Text>
        </CtlButton>
        <View>
          <CtlButton onPress={() => router.push('/alerts')} label={unread ? t('top.alertsUnread', { n: unread }) : t('top.alerts')}>
            <Bell size={22} color={colors.ink} strokeWidth={2} />
            {unread ? <Text v="small" weight="bold" tone="loss">{unread > 9 ? '9+' : unread}</Text> : null}
          </CtlButton>
        </View>
        <CtlButton onPress={() => router.push('/settings')} label={t('top.settings')}><Settings size={22} color={colors.ink} strokeWidth={2} /></CtlButton>
      </View>
    </View>
  );
}
