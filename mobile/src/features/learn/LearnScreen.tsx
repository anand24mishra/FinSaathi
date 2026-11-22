import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Chip } from '@/components/Chip';
import { Field } from '@/components/Field';
import { Cluster, Panel, Section } from '@/components/Layout';
import { Async, EmptyState } from '@/components/Async';
import { SkeletonList } from '@/components/Skeleton';
import { useApi } from '@/api/useApi';
import type { Term } from '@/api/contract';
import { useApp } from '@/state/AppState';
import { useT, type Key } from '@/i18n';
import { dict } from '@/i18n/dict';
import { Accordion } from '@/components/Accordion';
import { space } from '@/theme/tokens';

export function LearnScreen() {
  const { lang } = useApp();
  const t = useT();
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  useEffect(() => { const id = setTimeout(() => setDq(q.trim()), 250); return () => clearTimeout(id); }, [q]);
  const all = useApi<Term[]>('/education/terms', { fresh: 600000 });
  const cats = useMemo(() => Array.from(new Set((all.data ?? []).map((x) => x.category))), [all.data]);
  const params = [dq ? `q=${encodeURIComponent(dq)}` : '', cat ? `category=${encodeURIComponent(cat)}` : ''].filter(Boolean).join('&');
  const res = useApi<Term[]>(`/education/terms${params ? '?' + params : ''}`, { fresh: 600000 });
  const cl = (c: string) => (`cat.${c}` in dict ? t(`cat.${c}` as Key) : c);
  const other = lang === 'en' ? 'hi' : 'en';
  return (
    <Screen back title={t('learn.title')} subtitle={t('learn.subtitle')} onRefresh={res.refetch} refreshing={res.refreshing}>
      <Section style={{ marginTop: space.lg }}>
        <Field label={t('learn.search')} value={q} onChangeText={setQ} placeholder={t('learn.placeholder')} />
        {cats.length ? (
          <View style={{ marginTop: space.md }}>
            <Cluster>
              <Chip label={t('learn.all')} selected={!cat} onPress={() => setCat(null)} />
              {cats.map((c) => <Chip key={c} label={cl(c)} selected={cat === c} onPress={() => setCat(c)} />)}
            </Cluster>
          </View>
        ) : null}
      </Section>
      <Section>
        <Async q={res} skeleton={<SkeletonList rows={6} />} isEmpty={(d) => !d.length} empty={<EmptyState title={t('learn.none')} body={t('learn.noneBody')} action={t('learn.clear')} onAction={() => { setQ(''); setCat(null); }} />}>
          {(list) => (
            <Panel pad={false} style={{ paddingHorizontal: space.lg }}>
              {list.map((x) => (
                <Accordion key={x.id} title={`${x.term[lang]}  ·  ${x.term[other]}`}>
                  <Text v="small" weight="semibold" tone="soft">{cl(x.category)}</Text>
                  <Text v="bodyLg">{x.simple[lang]}</Text>
                  <Text v="label" tone="soft"><Text v="label" weight="semibold" tone="soft">{t('term.example')}: </Text>{x.example[lang]}</Text>
                </Accordion>
              ))}
            </Panel>
          )}
        </Async>
      </Section>
    </Screen>
  );
}
