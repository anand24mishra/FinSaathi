import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { useLayout } from './Layout';
import { space } from '@/theme/tokens';

/** Centred narrow column used by welcome, sign-in and setup. */
export function AuthFrame({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const { gutter } = useLayout();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ alignItems: 'center', paddingBottom: space.xxxl }}>
          <View style={{ width: '100%', maxWidth: 560, paddingHorizontal: gutter, paddingTop: space.xl, gap: space.lg }}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
