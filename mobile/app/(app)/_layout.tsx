import React from 'react';
import { View } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { isGuestUser, useApp } from '@/state/AppState';
import { useTheme } from '@/theme/ThemeProvider';
import { NavBar } from '@/components/NavBar';
import { useLayout } from '@/components/Layout';
import { SkeletonBlock } from '@/components/Skeleton';
import { useAlertNotifier, usePushRegistration } from '@/features/alerts/push';
import { LiveProvider } from '@/live/LiveProvider';

export default function AppLayout() {
  const { hydrated, token, user } = useApp();
  const { colors } = useTheme();
  const { isDesktop } = useLayout();
  usePushRegistration(!!token);
  useAlertNotifier(!!token);
  if (!hydrated) return <View style={{ flex: 1, backgroundColor: colors.bg, padding: 24 }}><SkeletonBlock lines={4} /></View>;
  if (!token || isGuestUser(user)) return <Redirect href="/welcome" />;
  return (
    <LiveProvider enabled={!!token}>
    <View style={{ flex: 1, flexDirection: isDesktop ? 'row' : 'column', backgroundColor: colors.bg }}>
      {isDesktop ? <NavBar /> : null}
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'none' }} />
      </View>
      {!isDesktop ? <NavBar /> : null}
    </View>
    </LiveProvider>
  );
}
