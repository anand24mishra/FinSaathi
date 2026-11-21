import React, { useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { AuthFrame } from '@/components/AuthFrame';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Banner } from '@/components/Banner';
import { api, ApiError } from '@/api/client';
import type { AuthResponse } from '@/api/contract';
import { useApp } from '@/state/AppState';
import { useT } from '@/i18n';
import { ChevronLeft } from 'lucide-react-native';
import { space } from '@/theme/tokens';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Auth() {
  const { mode: m } = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<'register' | 'login'>(m === 'login' ? 'login' : 'register');
  const { lang, draftName, setDraftName, signIn, token } = useApp();
  const t = useT();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; form?: string }>({});
  if (token) return <Redirect href="/" />;

  const submit = async () => {
    const e: typeof errors = {};
    if (mode === 'register' && draftName.trim().length < 1) e.name = t('auth.errName');
    if (!EMAIL.test(email.trim())) e.email = t('auth.errEmail');
    if (password.length < (mode === 'register' ? 8 : 1)) e.password = mode === 'register' ? t('auth.errPasswordShort') : t('auth.errPassword');
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const body = mode === 'register' ? { name: draftName.trim(), email: email.trim().toLowerCase(), password, language: lang } : { email: email.trim().toLowerCase(), password };
      const r = await api.post<AuthResponse>(mode === 'register' ? '/auth/register' : '/auth/login', body, { timeoutMs: 20000 });
      signIn(r);
      router.replace('/');
    } catch (err) {
      const a = err as ApiError;
      setErrors({ form: a.isNetwork ? t('err.offlineBody') : a.code === 'unauthorized' || a.status === 401 ? t('auth.errWrong') : a.status === 409 ? t('auth.errExists') : a.message });
    } finally { setBusy(false); }
  };

  return (
    <AuthFrame>
      <Button label={t('common.back')} variant="ghost" icon={ChevronLeft} fullWidth={false} onPress={() => (router.canGoBack() ? router.back() : router.replace('/welcome'))} />
      <Text v="h1">{mode === 'register' ? t('auth.createTitle') : t('auth.loginTitle')}</Text>
      <Text v="body" tone="soft">{mode === 'register' ? t('auth.createBody') : t('auth.loginBody')}</Text>
      {errors.form ? <Banner tone="error" title={errors.form} /> : null}
      {mode === 'register' ? <Field label={t('welcome.yourName')} value={draftName} onChangeText={setDraftName} error={errors.name} autoComplete="name" /> : null}
      <Field label={t('auth.email')} value={email} onChangeText={setEmail} error={errors.email} keyboardType="email-address" autoComplete="email" />
      <Field label={t('auth.password')} value={password} onChangeText={setPassword} error={errors.password} secure autoComplete={mode === 'register' ? 'password-new' : 'password'} hint={mode === 'register' ? t('auth.passwordHint') : undefined} onSubmitEditing={submit} />
      <Button label={mode === 'register' ? t('auth.createCta') : t('auth.loginCta')} onPress={submit} loading={busy} />
      <Button label={mode === 'register' ? t('welcome.haveAccount') : t('auth.needAccount')} variant="ghost" onPress={() => { setErrors({}); setMode(mode === 'register' ? 'login' : 'register'); }} />
    </AuthFrame>
  );
}
