import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Field } from '@/components/Field';
import { Panel, Row, Section, Cluster } from '@/components/Layout';
import { Async, EmptyState } from '@/components/Async';
import { SkeletonList } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { Chip } from '@/components/Chip';
import { useApi } from '@/api/useApi';
import type { FundSummary } from '@/api/contract';
import { useT, type Key } from '@/i18n';
import { space } from '@/theme/tokens';

const IDEAS = ['funds.s1', 'funds.s2', 'funds.s3', 'funds.s4'] as const;

export function FundsTab() {
  const t = useT();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  useEffect(() => { const id = setTimeout(() => setDq(q.trim()), 350); return () => clearTimeout(id); }, [q]);
  const res = useApi<FundSummary[]>(dq.length >= 2 ? `/funds/search?q=${encodeURIComponent(dq)}` : null);
  return (
    <Section title={t('markets.funds')} style={{ marginTop: space.xl }}>
      <Field label={t('funds.search')} value={q} onChangeText={setQ} placeholder={t('funds.placeholder')} />
      {dq.length < 2 ? (
        <View style={{ gap: space.md, marginTop: space.lg }}>
          <Text v="body" tone="soft">{t('funds.typeToSearch')}</Text>
          <Cluster>{IDEAS.map((k) => <Chip key={k} label={t(k as Key)} onPress={() => setQ(t(k as Key))} />)}</Cluster>
        </View>
      ) : (
        <View style={{ marginTop: space.lg }}>
          <Async q={res} skeleton={<SkeletonList rows={6} />} isEmpty={(d) => !d.length} empty={<EmptyState title={t('funds.none')} body={t('funds.noneBody')} />}>
            {(list) => (
              <Panel pad={false} style={{ paddingHorizontal: space.lg }}>
                {list.slice(0, 40).map((f, i, a) => <Row key={f.schemeCode} title={f.name} titleLines={3} subtitle={`${t('funds.code')} ${f.schemeCode}`} chevron last={i === a.length - 1} onPress={() => router.push(`/fund/${f.schemeCode}`)} />)}
              </Panel>
            )}
          </Async>
        </View>
      )}
    </Section>
  );
}
