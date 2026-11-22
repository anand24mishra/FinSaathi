import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Check, Pencil, Trash2 } from 'lucide-react-native';
import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { Async, EmptyState } from '@/components/Async';
import { api } from '@/api/client';
import { clearApiCache, useApi } from '@/api/useApi';
import type { ConversationSummary } from '@/api/contract';
import { useApp } from '@/state/AppState';
import { useT } from '@/i18n';
import { timeAgo } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { useType } from '@/theme/type';
import { radius, space } from '@/theme/tokens';

/** Past conversations, newest first. Tap to open; pencil renames; bin deletes. Chats live on the server, so they follow the account to any phone. */
export function ChatHistorySheet({ visible, onClose, currentId, onOpen, onDeleted, onNew }: {
  visible: boolean; onClose: () => void; currentId: string | null; onOpen: (id: string) => void; onDeleted: (id: string) => void; onNew: () => void;
}) {
  const t = useT();
  const { lang } = useApp();
  const { colors } = useTheme();
  const ty = useType();
  const q = useApi<ConversationSummary[]>('/assistant/conversations', { enabled: visible, fresh: 0 });
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);

  const refresh = async () => { clearApiCache(); await q.refetch(); };
  const rename = async (id: string) => {
    const v = title.trim();
    setEditing(null);
    if (v) { try { await api.patch(`/assistant/conversations/${id}`, { title: v }); await refresh(); } catch { /* list stays as it was */ } }
  };
  const remove = async (id: string) => {
    setConfirm(null);
    try { await api.del(`/assistant/conversations/${id}`); onDeleted(id); await refresh(); } catch { /* list stays as it was */ }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t('ask.history')}>
      <Button label={t('ask.newChat')} onPress={() => { onNew(); onClose(); }} />
      <Async q={q} isEmpty={(d) => !d.length} empty={<EmptyState title={t('ask.noChats')} body={t('ask.noChatsBody')} />}>
        {(rows) => (
          <View style={{ gap: space.sm }}>
            {rows.map((c) => {
              const sel = c.id === currentId;
              return (
                <View key={c.id} style={{ borderWidth: 1, borderColor: sel ? colors.primary : colors.line, borderRadius: radius.md, backgroundColor: sel ? colors.primarySoft : colors.surface }}>
                  {editing === c.id ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.sm }}>
                      <TextInput
                        value={title} onChangeText={setTitle} autoFocus maxLength={100} onSubmitEditing={() => rename(c.id)} returnKeyType="done" accessibilityLabel={t('ask.rename')}
                        style={[{ flex: 1, minHeight: 48, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: space.sm, color: colors.ink, fontFamily: ty.family.regular, fontSize: ty.size('body') }, { outlineStyle: 'none' } as never]}
                      />
                      <Pressable onPress={() => rename(c.id)} accessibilityRole="button" accessibilityLabel={t('ask.saveName')} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Check size={24} color={colors.primary} /></Pressable>
                    </View>
                  ) : confirm === c.id ? (
                    <View style={{ padding: space.md, gap: space.sm }}>
                      <Text v="body">{t('ask.deleteAsk')}</Text>
                      <View style={{ flexDirection: 'row', gap: space.sm }}>
                        <View style={{ flex: 1 }}><Button label={t('common.cancel')} variant="secondary" onPress={() => setConfirm(null)} /></View>
                        <View style={{ flex: 1 }}><Button label={t('common.remove')} variant="danger" onPress={() => remove(c.id)} /></View>
                      </View>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Pressable onPress={() => { onOpen(c.id); onClose(); }} accessibilityRole="button" accessibilityLabel={c.title} style={{ flex: 1, minHeight: 64, padding: space.md, justifyContent: 'center', gap: 2 }}>
                        <Text v="body" weight="semibold" numberOfLines={1}>{c.title}</Text>
                        <Text v="small" tone="soft" numberOfLines={1}>{timeAgo(c.updatedAt, lang)}{c.preview ? ` · ${c.preview}` : ''}</Text>
                      </Pressable>
                      <Pressable onPress={() => { setTitle(c.title); setEditing(c.id); }} accessibilityRole="button" accessibilityLabel={t('ask.rename')} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Pencil size={20} color={colors.inkSoft} /></Pressable>
                      <Pressable onPress={() => setConfirm(c.id)} accessibilityRole="button" accessibilityLabel={t('common.remove')} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Trash2 size={20} color={colors.inkSoft} /></Pressable>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </Async>
    </Sheet>
  );
}
