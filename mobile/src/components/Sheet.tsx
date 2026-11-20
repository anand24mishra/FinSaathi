import React, { useEffect } from 'react';
import { Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { X } from 'lucide-react-native';
import { Text } from './Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { useLayout } from './Layout';
import { useT } from '@/i18n';

/** Bottom sheet on phones, side panel on desktop. */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  const { isDesktop } = useLayout();
  const t = useT();
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [visible, onClose]);
  return (
    <Modal visible={visible} transparent animationType={isDesktop ? 'fade' : 'slide'} onRequestClose={onClose} accessibilityViewIsModal>
      <View style={{ flex: 1, flexDirection: isDesktop ? 'row' : 'column', justifyContent: isDesktop ? 'flex-end' : 'flex-end' }}>
        <Pressable onPress={onClose} accessibilityLabel={t('common.close')} accessibilityRole="button" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlay }} />
        <View
          accessibilityRole={Platform.OS === 'web' ? ('dialog' as never) : undefined} accessibilityLabel={title}
          style={[
            { backgroundColor: colors.surface, borderColor: colors.line },
            isDesktop
              ? { width: 460, height: '100%', borderLeftWidth: 1, padding: space.xl }
              : { maxHeight: '85%', borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderTopWidth: 1, padding: space.lg, paddingBottom: space.xl },
          ]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.md, marginBottom: space.md }}>
            <Text v="h2" style={{ flex: 1 }}>{title}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} style={{ minHeight: 48, minWidth: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <X size={24} color={colors.ink} strokeWidth={2} />
              <Text v="label" tone="soft">{t('common.close')}</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: space.lg, gap: space.md }}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}
