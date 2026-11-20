import React from 'react';
import { View } from 'react-native';
import { Inbox } from 'lucide-react-native';
import type { ApiState } from '@/api/useApi';
import { Banner } from './Banner';
import { Button } from './Button';
import { Text } from './Text';
import { SkeletonBlock } from './Skeleton';
import { useT } from '@/i18n';
import { useApp } from '@/state/AppState';
import { formatTime, timeAgo } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export function ErrorState({ error, onRetry, title }: { error: { code?: string; message: string; isNetwork?: boolean } | null; onRetry: () => void; title?: string }) {
  const t = useT();
  const net = (error as { isNetwork?: boolean } | null)?.isNetwork;
  return (
    <Banner tone={net ? 'offline' : 'error'} title={title ?? (net ? t('err.offlineTitle') : t('err.title'))} body={net ? t('err.offlineBody') : error?.message || t('err.generic')} actionLabel={t('common.retry')} onAction={onRetry} />
  );
}

export function EmptyState({ title, body, action, onAction }: { title: string; body?: string; action?: string; onAction?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ paddingVertical: space.xxl, gap: space.md, alignItems: 'flex-start' }}>
      <Inbox size={28} color={colors.inkSoft} strokeWidth={1.75} />
      <Text v="h3">{title}</Text>
      {body ? <Text v="body" tone="soft">{body}</Text> : null}
      {action && onAction ? <Button label={action} onPress={onAction} fullWidth={false} variant="secondary" /> : null}
    </View>
  );
}

type Props<T> = {
  q: ApiState<T>; children: (data: T) => React.ReactNode; skeleton?: React.ReactNode;
  isEmpty?: (d: T) => boolean; empty?: React.ReactNode;
};
/** Handles loading skeleton, error-with-retry, empty and stale states around an API result. */
export function Async<T>({ q, children, skeleton, isEmpty, empty }: Props<T>) {
  const t = useT();
  const { lang } = useApp();
  if (q.loading && q.data === undefined) return <>{skeleton ?? <SkeletonBlock />}</>;
  if (q.error && q.data === undefined) return <ErrorState error={q.error} onRetry={q.refetch} />;
  if (q.data === undefined) return <>{skeleton ?? <SkeletonBlock />}</>;
  return (
    <View style={{ gap: space.md }}>
      {q.stale ? <Banner tone="caution" title={t('err.stale', { when: q.updatedAt ? `${formatTime(q.updatedAt, lang)} (${timeAgo(q.updatedAt, lang)})` : '' })} actionLabel={t('common.retry')} onAction={q.refetch} loading={q.refreshing} /> : null}
      {isEmpty && isEmpty(q.data) ? (empty ?? <EmptyState title={t('common.nothingHere')} />) : children(q.data)}
    </View>
  );
}
