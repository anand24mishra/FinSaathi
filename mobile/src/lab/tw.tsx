// Tiny token-class resolver for the Design Lab: turns "text-ink bg-surface/70 border-line" into plain style objects using the
// active direction's palette. Plain style props win over react-native-web defaults and work on native too.
import React, { createContext, useContext, useMemo } from 'react';
import { Pressable as RNPressable, Text as RNText, View as RNView, type PressableProps, type TextProps, type ViewProps } from 'react-native';

export type Pal = Record<string, string>;
const PalCtx = createContext<Pal>({});
export const PalProvider = ({ pal, children }: { pal: Pal; children: React.ReactNode }) => <PalCtx.Provider value={pal}>{children}</PalCtx.Provider>;

const alpha = (hex: string, a: number) => {
  const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
export function useTw() {
  const pal = useContext(PalCtx);
  return useMemo(() => (cls?: string) => {
    const s: Record<string, unknown> = {};
    for (const tok of (cls ?? '').split(/\s+/).filter(Boolean)) {
      let m: RegExpMatchArray | null;
      const col = (name: string, a?: string) => { const c = pal[`--${name}`]; return c ? (a ? alpha(c, Number(a) / 100) : c) : undefined; };
      if ((m = tok.match(/^text-([a-z0-9]+)$/))) { const c = col(m[1]); if (c) s.color = c; }
      else if ((m = tok.match(/^bg-([a-z0-9]+)(?:\/(\d+))?$/))) { const c = col(m[1], m[2]); if (c) s.backgroundColor = c; }
      else if ((m = tok.match(/^border-t-([a-z0-9]+)$/))) { const c = col(m[1]); if (c) s.borderTopColor = c; }
      else if ((m = tok.match(/^border-([a-z0-9]+)$/)) && !['t', 'b'].includes(m[1])) { const c = col(m[1]); if (c) s.borderColor = c; }
      else if (tok === 'border') s.borderWidth = 1;
      else if (tok === 'border-t') s.borderTopWidth = 1;
      else if (tok === 'border-b') s.borderBottomWidth = 1;
    }
    return s;
  }, [pal]);
}
export function V({ className, style, ...p }: ViewProps & { className?: string }) { const tw = useTw(); return <RNView {...p} style={[tw(className), style]} />; }
export function Tx({ className, style, ...p }: TextProps & { className?: string }) { const tw = useTw(); return <RNText {...p} style={[tw(className), style]} />; }
export function Pr({ className, style, ...p }: PressableProps & { className?: string; style?: object }) { const tw = useTw(); return <RNPressable {...p} style={[tw(className), style] as never} />; }
