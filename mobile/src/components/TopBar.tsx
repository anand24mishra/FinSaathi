import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell, Settings } from 'lucide-react-native';
import { Text } from './Text';
import { useLayout } from './Layout';
import { useApp } from '@/state/AppState';
import { useTheme } from '@/theme/ThemeProvider';
import { nextScale, prevScale, TEXT_SCALES } from '@/theme/type';
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
        minHeight: 52, minWidth: wide ? 76 : 52, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6,
        borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: pressed || hovered ? colors.surfaceAlt : colors.surface, opacity: disabled ? 0.45 : 1,
      })}>
      {children}
    </Pressable>
  );
}

/** Always-visible controls: language, text size, alerts, settings. */
export function TopBar() {
  const { lang, setLang, textScale, setTextScale } = useApp();
  const { colors } = useTheme();
  const t = useT();
  const router = useRouter();
  const { isDesktop, width } = useLayout();
  const alerts = useApi<Alert[]>(withLang('/alerts', lang), { fresh: 30000, pollMs: 60000 });
  const unread = (alerts.data ?? []).filter((a) => !a.read).length;
  const idx = TEXT_SCALES.indexOf(textScale);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, paddingTop: space.md, flexWrap: 'wrap' }} accessibilityRole="toolbar">
      {!isDesktop && width >= 460 ? <Text v="h3" tone="primary" style={{ flexShrink: 1 }}>फ़िनसाथी</Text> : <View />}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
        <CtlButton wide onPress={() => setLang(lang === 'en' ? 'hi' : 'en')} label={lang === 'en' ? t('top.switchToHindi') : t('top.switchToEnglish')}>
          <Text v="label" weight="semibold" tone="primary">{lang === 'en' ? 'हिन्दी' : 'English'}</Text>
        </CtlButton>
        <CtlButton onPress={() => setTextScale(prevScale(textScale))} disabled={idx === 0} label={t('top.smaller')}><Text v="label" weight="bold" style={{ fontSize: 16, lineHeight: 22 }}>A−</Text></CtlButton>
        <CtlButton onPress={() => setTextScale(textScale === 1.3 ? nextScale(textScale) : TEXT_SCALES[idx + 1])} disabled={false} label={textScale === 1.3 ? t('top.resetSize') : t('top.larger')}>
          <Text v="label" weight="bold" style={{ fontSize: 20, lineHeight: 26 }}>A+</Text>
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
