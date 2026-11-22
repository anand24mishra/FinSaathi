import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TopBar } from '@/components/TopBar';
import { useConnectivity } from '@/components/Connectivity';
import { useType } from '@/theme/type';
import { MAX_WIDTH } from '@/theme/tokens';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { Send, Trash2, FileText } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Field } from '@/components/Field';
import { Banner } from '@/components/Banner';
import { Cluster, useLayout } from '@/components/Layout';
import { RichText } from '@/components/Term';
import { api, ApiError } from '@/api/client';
import type { ChatResponse, Citation } from '@/api/contract';
import { useApp } from '@/state/AppState';
import { useT, type Key } from '@/i18n';
import { getJSON, setJSON } from '@/lib/storage';
import { formatDateTime } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

type Msg = { id: string; role: 'user' | 'assistant'; text: string; citations?: Citation[]; followUps?: string[]; refused?: boolean; generatedBy?: 'rules' | 'llm'; error?: boolean };
const SUGG: Key[] = ['ask.s1', 'ask.s2', 'ask.s3', 'ask.s4', 'ask.s5'];
const KEY = 'finsaathi.chat';

function Dot({ i }: { i: number }) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const o = useSharedValue(0.4);
  useEffect(() => { if (!reduce) o.value = withDelay(i * 160, withRepeat(withSequence(withTiming(1, { duration: 400 }), withTiming(0.3, { duration: 400 })), -1)); }, [o, i, reduce]);
  const s = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.inkSoft }, s]} />;
}
function Typing() {
  const t = useT();
  return (
    <View accessibilityLiveRegion="polite" accessibilityLabel={t('ask.thinking')} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md }}>
      <Dot i={0} /><Dot i={1} /><Dot i={2} /><Text v="label" tone="soft">{t('ask.thinking')}</Text>
    </View>
  );
}

function Bubble({ m, onFollow }: { m: Msg; onFollow: (q: string) => void }) {
  const { colors } = useTheme();
  const { lang } = useApp();
  const t = useT();
  if (m.role === 'user') {
    return (
      <View style={{ alignSelf: 'flex-end', maxWidth: '90%', backgroundColor: colors.primary, borderRadius: radius.lg, borderBottomRightRadius: 4, padding: space.md }} accessible accessibilityLabel={`${t('ask.you')}: ${m.text}`}>
        <Text v="body" tone="onPrimary">{m.text}</Text>
      </View>
    );
  }
  if (m.error) return <Banner tone="offline" title={m.text} />;
  return (
    <View style={{ gap: space.sm, maxWidth: '100%' }}>
      <Text v="label" weight="semibold" tone="soft">{t('ask.assistant')}</Text>
      {m.refused ? (
        <Banner tone="info" title={t('ask.refusedTitle')} body={m.text} />
      ) : (
        <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, borderTopLeftRadius: 4, padding: space.lg }}>
          <RichText text={m.text} v="body" />
        </View>
      )}
      {m.citations?.length ? (
        <View style={{ gap: 6 }}>
          <Text v="small" weight="semibold" tone="soft">{t('ask.sources')}</Text>
          <Cluster gap={6}>
            {m.citations.map((c, i) => (
              <View key={i} accessible accessibilityLabel={`${c.label}${c.asOf ? ', ' + formatDateTime(c.asOf, lang) : ''}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
                <FileText size={16} color={colors.inkSoft} strokeWidth={2} />
                <Text v="small" tone="soft">{c.label}{c.asOf ? ` · ${formatDateTime(c.asOf, lang)}` : ''}</Text>
              </View>
            ))}
          </Cluster>
        </View>
      ) : null}
      {m.followUps?.length ? <Cluster>{m.followUps.map((f) => <Chip key={f} label={f} onPress={() => onFollow(f)} />)}</Cluster> : null}
      {m.generatedBy ? <Text v="small" tone="soft">{m.generatedBy === 'llm' ? t('research.byAi') : t('research.byRules')}</Text> : null}
    </View>
  );
}

export function AskScreen() {
  const { lang } = useApp();
  const { colors } = useTheme();
  const t = useT();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [disclaimer, setDisclaimer] = useState<string | null>(null);
  const msgsRef = useRef<Msg[]>([]);
  msgsRef.current = msgs;

  useEffect(() => { getJSON<Msg[]>(KEY).then((m) => { if (m?.length) setMsgs(m); }); }, []);
  const persist = (m: Msg[]) => { setMsgs(m); setJSON(KEY, m.slice(-40)); };

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const prev = msgsRef.current;
    const history = prev.filter((m) => !m.error && !m.refused).slice(-12).map((m) => ({ role: m.role, text: m.text }));
    const withUser = [...prev, { id: `u${Date.now()}`, role: 'user' as const, text: q }];
    persist(withUser); setInput(''); setBusy(true);
    try {
      const r = await api.post<ChatResponse>('/assistant/chat', { message: q, lang, history }, { timeoutMs: 60000 });
      setDisclaimer(r.disclaimer);
      persist([...withUser, { id: `a${Date.now()}`, role: 'assistant', text: r.answer, citations: r.citations, followUps: r.followUps, refused: r.refused, generatedBy: r.generatedBy }]);
    } catch (e) {
      const err = e as ApiError;
      persist([...withUser, { id: `e${Date.now()}`, role: 'assistant', text: err.isNetwork ? t('ask.errOffline') : err.message || t('err.generic'), error: true }]);
    } finally { setBusy(false); }
  };

  const scroller = useRef<{ scrollToEnd: (o?: { animated?: boolean }) => void } | null>(null);
  const goEnd = () => scroller.current?.scrollToEnd({ animated: true });
  const { gutter } = useLayout();
  const ty = useType();
  const { online, apiUp } = useConnectivity();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'left', 'right']}>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <View style={{ flex: 1, width: '100%', maxWidth: MAX_WIDTH, paddingHorizontal: gutter }}>
          <TopBar />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, marginTop: space.md, flexWrap: 'wrap' }}>
            <Text v="h1">{t('tab.ask')}</Text>
            {msgs.length ? <Button label={t('ask.clear')} variant="ghost" icon={Trash2} fullWidth={false} compact onPress={() => { persist([]); setDisclaimer(null); }} /> : null}
          </View>
          <ScrollView ref={scroller as never} style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: space.lg, gap: space.xl }} keyboardShouldPersistTaps="handled" onContentSizeChange={goEnd}>
            <Text v="label" tone="soft">{disclaimer ?? t('ask.note')}</Text>
            {!msgs.length ? (
              <View style={{ gap: space.md }}>
                <Text v="h3">{t('ask.try')}</Text>
                <Cluster>{SUGG.map((k) => <Chip key={k} label={t(k)} onPress={() => send(t(k))} />)}</Cluster>
              </View>
            ) : null}
            {msgs.map((m) => <Bubble key={m.id} m={m} onFollow={send} />)}
            {busy ? <Typing /> : null}
          </ScrollView>
          <View style={{ paddingTop: space.sm, paddingBottom: space.md, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg, flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
            <TextInput
              value={input} onChangeText={setInput} placeholder={t('ask.placeholder')} placeholderTextColor={colors.inkSoft} accessibilityLabel={t('ask.label')}
              onSubmitEditing={() => send(input)} returnKeyType="send" editable
              style={[{ flex: 1, minHeight: 56, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.surface, color: colors.ink, fontFamily: ty.family.regular, fontSize: ty.size('bodyLg'), paddingHorizontal: space.md }, { outlineStyle: 'none' } as never]}
            />
            <View style={{ minWidth: 104 }}><Button label={t('ask.send')} icon={Send} onPress={() => send(input)} loading={busy} disabled={!input.trim() || !online || !apiUp} /></View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
