import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { dark, light, type Palette } from './tokens';
import { useApp } from '@/state/AppState';

type ThemeCtx = { colors: Palette; isDark: boolean };
const Ctx = createContext<ThemeCtx>({ colors: light, isDark: false });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const sys = useColorScheme();
  const { theme } = useApp();
  const isDark = theme === 'system' ? sys === 'dark' : theme === 'dark';
  const value = useMemo(() => ({ colors: isDark ? dark : light, isDark }), [isDark]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useTheme = () => useContext(Ctx);
