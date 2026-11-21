import React, { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Chip';
import { useT } from '@/i18n';
import { space } from '@/theme/tokens';
import { View } from 'react-native';
import { StocksTab } from './StocksTab';
import { MoversTab } from './MoversTab';
import { IposTab } from './IposTab';
import { FundsTab } from './FundsTab';
import { BeyondTab } from './BeyondTab';
import { NewsTab } from './NewsTab';

type Tab = 'stocks' | 'movers' | 'ipos' | 'funds' | 'beyond' | 'news';
const TABS: Tab[] = ['stocks', 'movers', 'ipos', 'funds', 'beyond', 'news'];

export function MarketsScreen() {
  const t = useT();
  const { tab: p } = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(TABS.includes(p as Tab) ? (p as Tab) : 'stocks');
  const [lastParam, setLastParam] = useState(p);
  if (p !== lastParam) { setLastParam(p); if (TABS.includes(p as Tab)) setTab(p as Tab); }
  return (
    <Screen title={t('tab.markets')}>
      <View style={{ marginTop: space.lg }}>
        <Segmented<Tab> label={t('markets.sections')} value={tab} onChange={setTab} options={TABS.map((x) => ({ value: x, label: t(`markets.${x}` as never) }))} />
      </View>
      {tab === 'stocks' ? <StocksTab /> : tab === 'movers' ? <MoversTab /> : tab === 'ipos' ? <IposTab /> : tab === 'funds' ? <FundsTab /> : tab === 'beyond' ? <BeyondTab /> : <NewsTab />}
    </Screen>
  );
}
