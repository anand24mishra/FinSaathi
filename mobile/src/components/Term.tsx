import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Platform, View } from 'react-native';
import type { Term as TermT } from '@/api/contract';
import { useApi } from '@/api/useApi';
import { highlightTerms } from '@/lib/terms';
import { useApp } from '@/state/AppState';
import { useTheme } from '@/theme/ThemeProvider';
import { useT } from '@/i18n';
import { Text, type Tone } from './Text';
import { Sheet } from './Sheet';
import type { Variant } from '@/theme/type';

type Ctx = { terms: TermT[]; open: (id: string) => void };
const TermCtx = createContext<Ctx>({ terms: [], open: () => {} });
export const useTerms = () => useContext(TermCtx);

export function TermProvider({ children }: { children: React.ReactNode }) {
  const { lang } = useApp();
  const t = useT();
  const q = useApi<TermT[]>('/education/terms', { fresh: 10 * 60000 });
  const [openId, setOpenId] = useState<string | null>(null);
  const terms = q.data ?? [];
  const open = useCallback((id: string) => setOpenId(id), []);
  const current = terms.find((x) => x.id === openId);
  const value = useMemo(() => ({ terms, open }), [terms, open]);
  return (
    <TermCtx.Provider value={value}>
      {children}
      <Sheet visible={!!current} onClose={() => setOpenId(null)} title={current ? current.term[lang] : ''}>
        {current ? (
          <View style={{ gap: 16 }}>
            <Text v="bodyLg">{current.simple[lang]}</Text>
            <View style={{ gap: 4 }}>
              <Text v="label" weight="semibold" tone="soft">{t('term.example')}</Text>
              <Text v="body">{current.example[lang]}</Text>
            </View>
            <Text v="small" tone="soft">{lang === 'en' ? current.term.hi : current.term.en}</Text>
          </View>
        ) : null}
      </Sheet>
    </TermCtx.Provider>
  );
}

/** A single tappable financial term. */
export function Term({ id, children, v = 'body', tone = 'ink' }: { id: string; children: React.ReactNode; v?: Variant; tone?: Tone }) {
  const { open } = useTerms();
  const { colors } = useTheme();
  const t = useT();
  return (
    <Text
      v={v} tone={tone} accessibilityRole="button" accessibilityLabel={`${t('term.explain')}: ${typeof children === 'string' ? children : ''}`} onPress={() => open(id)}
      style={{ textDecorationLine: 'underline', textDecorationStyle: 'dotted', textDecorationColor: colors.primary, ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null) }}>
      {children}
    </Text>
  );
}

/** Body text where known glossary terms become tappable (explanation opens in a sheet). */
export function RichText({ text, v = 'body', tone = 'ink', weight }: { text: string; v?: Variant; tone?: Tone; weight?: 'regular' | 'medium' | 'semibold' | 'bold' }) {
  const { terms } = useTerms();
  const { lang } = useApp();
  const segs = useMemo(() => highlightTerms(text, terms, lang), [text, terms, lang]);
  return (
    <Text v={v} tone={tone} weight={weight}>
      {segs.map((s, i) => s.termId ? <Term key={i} id={s.termId} v={v} tone={tone}>{s.text}</Term> : <React.Fragment key={i}>{s.text}</React.Fragment>)}
    </Text>
  );
}
