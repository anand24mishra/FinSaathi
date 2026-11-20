import React, { useState } from 'react';
import { Pressable, TextInput, View, type KeyboardTypeOptions, type TextInputProps } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { Text } from './Text';
import { useTheme } from '@/theme/ThemeProvider';
import { useType } from '@/theme/type';
import { radius, space, TOUCH } from '@/theme/tokens';
import { useT } from '@/i18n';

type Props = {
  label: string; value: string; onChangeText: (s: string) => void; placeholder?: string; error?: string | null; secure?: boolean; keyboardType?: KeyboardTypeOptions;
  hint?: string; autoComplete?: TextInputProps['autoComplete']; multiline?: boolean; onSubmitEditing?: () => void; autoFocus?: boolean; prefix?: string; maxLength?: number;
};

export function Field({ label, value, onChangeText, placeholder, error, secure, keyboardType, hint, autoComplete, multiline, onSubmitEditing, autoFocus, prefix, maxLength }: Props) {
  const { colors } = useTheme();
  const t = useType();
  const tr = useT();
  const [show, setShow] = useState(false);
  const [focus, setFocus] = useState(false);
  const size = t.size('bodyLg');
  return (
    <View style={{ gap: space.xs }}>
      <Text v="label" weight="semibold">{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: TOUCH, borderRadius: radius.md, borderWidth: focus ? 2.5 : 1.5, borderColor: error ? colors.loss : focus ? colors.primary : colors.line, backgroundColor: colors.surface, paddingHorizontal: space.md }}>
        {prefix ? <Text v="bodyLg" tone="soft" style={{ marginRight: 4 }}>{prefix}</Text> : null}
        <TextInput
          value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.inkSoft}
          secureTextEntry={secure && !show} keyboardType={keyboardType} autoComplete={autoComplete} multiline={multiline} autoFocus={autoFocus} maxLength={maxLength}
          autoCapitalize={secure || keyboardType === 'email-address' ? 'none' : 'sentences'} autoCorrect={false}
          onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} onSubmitEditing={onSubmitEditing}
          accessibilityLabel={label} accessibilityHint={hint}
          style={[{ flex: 1, minHeight: TOUCH - 6, color: colors.ink, fontFamily: t.family.regular, fontSize: size, paddingVertical: 8 }, { outlineStyle: 'none' } as never]}
        />
        {secure ? (
          <Pressable onPress={() => setShow((s) => !s)} accessibilityRole="button" accessibilityLabel={show ? tr('auth.hidePassword') : tr('auth.showPassword')} style={{ minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, paddingLeft: 8 }}>
            {show ? <EyeOff size={22} color={colors.inkSoft} /> : <Eye size={22} color={colors.inkSoft} />}
            <Text v="small" tone="soft">{show ? tr('auth.hide') : tr('auth.show')}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text v="label" tone="loss" accessibilityLiveRegion="polite">{error}</Text> : hint ? <Text v="small" tone="soft">{hint}</Text> : null}
    </View>
  );
}
