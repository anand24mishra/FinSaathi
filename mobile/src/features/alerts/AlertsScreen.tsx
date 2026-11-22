import React, { useState } from 'react';
import { View } from 'react-native';
import { Check, RefreshCw } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { Tag } from '@/components/Chip';
import { Panel, Hairline, Cluster, Section } from '@/components/Layout';
import { Async, EmptyState } from '@/components/Async';
import { SkeletonList } from '@/components/Skeleton';
import { Banner } from '@/components/Banner';
import { RichText } from '@/components/Term';
import { api, ApiError, withLang } from '@/api/client';
import { clearApiCache, useApi } from '@/api/useApi';
import type { Alert } from '@/api/contract';
import { useApp } from '@/state/AppState';
import { useT, type Key } from '@/i18n';
import { timeAgo } from '@/lib/format';
import { SeverityTag } from '../shared';
import { requestWebNotifications, webNotifyState } from './push';
import { space } from '@/theme/tokens';

export function AlertsScreen() {
  const { lang } = useApp();
  const t = useT();
  const path = withLang('/alerts', lang);
  const q = useApi<Alert[]>(path, { fresh: 20000 });
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [perm, setPerm] = useState(webNotifyState());

  const refresh = async () => {
    setBusy(true); setErr(null);
    try { await api.post<Alert[]>(withLang('/alerts/refresh', lang)); clearApiCache(); await q.refetch(); }
    catch (e) { setErr(e instanceof ApiError ? (e.isNetwork ? t('err.offlineBody') : e.message) : t('err.generic')); } finally { setBusy(false); }
  };
  const markRead = async (id: string) => {
    setReadIds((s) => new Set(s).add(id));
    try { await api.post(`/alerts/${id}/read`); clearApiCache(); } catch { setReadIds((s) => { const n = new Set(s); n.delete(id); return n; }); }
  };
  return (
    <Screen back title={t('alerts.title')} subtitle={t('alerts.subtitle')} onRefresh={refresh} refreshing={busy}
      headerRight={<View style={{ minWidth: 200 }}><Button label={t('alerts.refresh')} icon={RefreshCw} variant="secondary" onPress={refresh} loading={busy} /></View>}>
      <Section style={{ marginTop: space.lg }}>
        {perm === 'default' ? <View style={{ marginBottom: space.md }}><Banner tone="info" title={t('alerts.enableWeb')} body={t('alerts.webWhy')} actionLabel={t('alerts.enableWeb')} onAction={async () => setPerm(await requestWebNotifications())} /></View> : null}
        {perm === 'granted' ? <Text v="small" tone="soft" style={{ marginBottom: space.md }}>{t('alerts.webOn')}</Text> : null}
        {perm === 'denied' ? <Text v="small" tone="soft" style={{ marginBottom: space.md }}>{t('alerts.webBlocked')}</Text> : null}
        {err ? <View style={{ marginBottom: space.md }}><Banner tone="error" title={err} /></View> : null}
        <Async q={q} skeleton={<SkeletonList rows={4} />} isEmpty={(d) => !d.length} empty={<EmptyState title={t('alerts.empty')} body={t('alerts.emptyBody')} />}>
          {(list) => (
            <Panel pad={false} style={{ paddingHorizontal: space.lg }}>
              {list.map((a, i) => {
                const read = a.read || readIds.has(a.id);
                return (
                  <View key={a.id} style={{ paddingVertical: space.lg, gap: space.sm }} accessible={false}>
                    {i > 0 ? <Hairline style={{ position: 'absolute', top: 0, left: 0, right: 0 }} /> : null}
                    <Cluster gap={space.sm}>
                      <SeverityTag s={a.severity} />
                      <Tag tone={read ? 'soft' : 'primary'} label={read ? t('alerts.read') : t('alerts.unread')} />
                      <Text v="small" tone="soft">{t(`alertkind.${a.kind}` as Key)} · {timeAgo(a.createdAt, lang)}</Text>
                    </Cluster>
                    <Text v="bodyLg" weight={read ? 'medium' : 'bold'}>{a.title}</Text>
                    <RichText text={a.body} v="body" tone={read ? 'soft' : 'ink'} />
                    {!read ? <Button compact fullWidth={false} variant="secondary" icon={Check} label={t('alerts.markRead')} accessibilityLabel={`${t('alerts.markRead')}: ${a.title}`} onPress={() => markRead(a.id)} /> : null}
                  </View>
                );
              })}
            </Panel>
          )}
        </Async>
      </Section>
    </Screen>
  );
}
