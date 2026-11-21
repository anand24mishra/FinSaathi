import '@/styles';
import { GluestackUIProvider } from '../components/ui/gluestack-ui-provider';
import React, { useEffect } from 'react';
import { Platform, useColorScheme, View } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Hind_400Regular, Hind_500Medium, Hind_600SemiBold, Hind_700Bold } from '@expo-google-fonts/hind';
import { AppProvider, useApp } from '@/state/AppState';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { ConnectivityProvider } from '@/components/Connectivity';
import { TermProvider } from '@/components/Term';
import { light, dark } from '@/theme/tokens';

function WebChrome() {
  const { colors } = useTheme();
  const { lang } = useApp();
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    document.title = 'FinSaathi · फ़िनसाथी';
    document.documentElement.lang = lang === 'hi' ? 'hi' : 'en';
    document.body.style.backgroundColor = colors.bg;
    let el = document.getElementById('finsaathi-global');
    if (!el) { el = document.createElement('style'); el.id = 'finsaathi-global'; document.head.appendChild(el); }
    el.textContent = `
      html,body{-webkit-text-size-adjust:100%;overscroll-behavior-y:none}
      *:focus{outline:none}
      *:focus-visible{outline:3px solid ${colors.focus} !important;outline-offset:2px !important;border-radius:6px}
      input:focus-visible,textarea:focus-visible{outline:none !important}
      [role="button"],[role="tab"]{cursor:pointer}
      @media (prefers-reduced-motion: reduce){*{scroll-behavior:auto !important}}
    `;
  }, [colors, lang]);
  return null;
}

function Inner() {
  const { colors, isDark } = useTheme();
  return (
    <GluestackUIProvider mode={isDark ? 'dark' : 'light'}>
      <WebChrome />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'fade' }} />
    </GluestackUIProvider>
  );
}

export default function Root() {
  const [loaded] = useFonts({ Hind_400Regular, Hind_500Medium, Hind_600SemiBold, Hind_700Bold });
  const sys = useColorScheme();
  if (!loaded) return <View style={{ flex: 1, backgroundColor: (sys === 'dark' ? dark : light).bg }} />;
  return (
    <SafeAreaProvider>
      <AppProvider>
        <ThemeProvider>
          <ConnectivityProvider>
            <TermProvider>
              <Inner />
            </TermProvider>
          </ConnectivityProvider>
        </ThemeProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}
