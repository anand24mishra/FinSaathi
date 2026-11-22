import React, { createContext, useContext } from 'react';
import { light, type Palette } from './tokens';

// FinSaathi is light-only: bright, high-contrast screens are easier to read for most of our users. No dark theme.
type ThemeCtx = { colors: Palette; isDark: false };
const value: ThemeCtx = { colors: light, isDark: false };
const Ctx = createContext<ThemeCtx>(value);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useTheme = () => useContext(Ctx);
