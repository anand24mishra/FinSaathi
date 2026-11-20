import type { Lang } from '@/api/contract';
import { dict, type Key } from './dict';
import { useApp } from '@/state/AppState';

export type { Key };

export function translate(lang: Lang, key: Key, vars?: Record<string, string | number>): string {
  const pair = dict[key];
  let s = pair ? pair[lang === 'hi' ? 1 : 0] || pair[0] : String(key);
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

export function useT() {
  const { lang } = useApp();
  return (key: Key, vars?: Record<string, string | number>) => translate(lang, key, vars);
}
