import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TopBar } from '@/components/TopBar';
import { useConnectivity } from '@/components/Connectivity';
import { useType } from '@/theme/type';
import { MAX_WIDTH } from '@/theme/tokens';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { Send, FileText, Mic, Square, History, SquarePen, Volume2, VolumeX } from 'lucide-react-native';
import * as Speech from 'expo-speech';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Field } from '@/components/Field';
import { Banner } from '@/components/Banner';
import { Cluster, useLayout } from '@/components/Layout';
import { RichText } from '@/components/Term';
import { api, ApiError } from '@/api/client';
import type { ChatMessage, ChatResponse, Citation, Conversation, ReplyStyle } from '@/api/contract';
import { useVoice } from './useVoice';
import { ChatHistorySheet } from './ChatHistorySheet';
import { useApp } from '@/state/AppState';
import { useT, type Key } from '@/i18n';
import { getJSON, removeKey, setJSON } from '@/lib/storage';
import { formatDateTime } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

type Msg = { id: string; role: 'user' | 'assistant'; text: string; citations?: Citation[]; followUps?: string[]; refused?: boolean; generatedBy?: 'rules' | 'llm'; error?: boolean; style?: ReplyStyle; viaVoice?: boolean };
const fromServer = (m: ChatMessage): Msg => ({ id: m.id, role: m.role, text: m.text, citations: m.citations, followUps: m.followUps, refused: m.refused, style: m.style, viaVoice: m.viaVoice });
const SUGG: Key[] = ['ask.tip', 'ask.s1', 'ask.s2', 'ask.s3', 'ask.s4', 'ask.s5'];
const KEY = 'finsaathi.chat';              // old on-phone history, uploaded once then removed
const CUR = 'finsaathi.chat.current';      // id of the conversation to resume

/** Hindi is read in a Hindi voice; Hinglish (Hindi in English letters) reads best in an Indian-English voice. */
const speak = (text: string, style?: ReplyStyle) => {
  Speech.stop();
  Speech.speak(text.replace(/[•*_#]/g, ' ').replace(/\s+/g, ' '), { language: style === 'hi' ? 'hi-IN' : 'en-IN', rate: 0.92 });
};

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
        {m.viaVoice ? <Mic size={14} color={colors.onPrimary} style={{ marginBottom: 2 }} /> : null}
        <Text v="body" tone="onPrimary">{m.text}</Text>
      </View>
    );
  }
  if (m.error) return <Banner tone="offline" title={m.text} />;
  return (
    <View style={{ gap: space.sm, maxWidth: '100%' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Text v="label" weight="semibold" tone="soft">{t('ask.assistant')}</Text>
        <Pressable onPress={() => speak(m.text, m.style)} accessibilityRole="button" accessibilityLabel={t('ask.speak')} hitSlop={8} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Volume2 size={20} color={colors.inkSoft} />
        </Pressable>
      </View>
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
  const [convId, setConvId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [disclaimer, setDisclaimer] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const msgsRef = useRef<Msg[]>([]);
  msgsRef.current = msgs;
  const voice = useVoice();
  const { q: prefill } = useLocalSearchParams<{ q?: string }>();
  // "Ask FinSaathi about this" on a news story opens a fresh chat with the headline typed in, ready to send.
  useEffect(() => { if (prefill) { setInput(`${prefill}`); } }, [prefill]);

  const remember = (id: string | null) => { setConvId(id); if (id) setJSON(CUR, id); else removeKey(CUR); };

  const open = async (id: string): Promise<boolean> => {
    try {
      const c = await api.get<Conversation>(`/assistant/conversations/${id}`);
      Speech.stop(); setMsgs(c.messages.map(fromServer)); setDisclaimer(null); remember(c.id); return true;
    } catch { return false; }
  };
  const newChat = () => { Speech.stop(); setMsgs([]); setDisclaimer(null); setNotice(null); remember(null); };

  // On entry: resume the last conversation. Chats that only exist on this phone from before are uploaded once.
  useEffect(() => {
    let off = false;
    (async () => {
      const old = await getJSON<Msg[]>(KEY);
      if (old?.length) {
        try {
          const r = await api.post<{ id: string | null }>('/assistant/conversations/import', { messages: old.filter((m) => !m.error && m.text).map((m) => ({ role: m.role, text: m.text })) });
          await removeKey(KEY);
          if (r.id && !off) { await open(r.id); return; }
        } catch { /* try again next time */ }
      }
      const cur = await getJSON<string>(CUR);
      if (cur && !off && !(await open(cur))) remember(null);
    })();
    return () => { off = true; Speech.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fail = (e: unknown, userTurn: Msg[]) => {
    const err = e as ApiError;
    const text = err.isNetwork ? t('ask.errOffline') : err.code === 'voice_unavailable' || err.code === 'no_speech' ? err.message : err.message || t('err.generic');
    setMsgs([...userTurn, { id: `e${Date.now()}`, role: 'assistant', text, error: true }]);
  };

  const accept = (r: ChatResponse, base: Msg[], viaVoice: boolean) => {
    setDisclaimer(r.disclaimer);
    if (r.conversationId && r.conversationId !== convId) remember(r.conversationId);
    const reply: Msg = { id: `a${Date.now()}`, role: 'assistant', text: r.answer, citations: r.citations, followUps: r.followUps, refused: r.refused, generatedBy: r.generatedBy, style: r.style };
    setMsgs([...base, reply]);
    if (viaVoice && !r.refused) speak(r.answer, r.style); // he asked by voice, so he gets the answer by voice too
  };

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    Speech.stop(); setNotice(null);
    const withUser = [...msgsRef.current, { id: `u${Date.now()}`, role: 'user' as const, text: q }];
    setMsgs(withUser); setInput(''); setBusy(true);
    try {
      // the server keeps the conversation, so only the new message travels
      accept(await api.post<ChatResponse>('/assistant/chat', { message: q, lang, conversationId: convId ?? undefined }, { timeoutMs: 60000 }), withUser, false);
    } catch (e) { fail(e, withUser); } finally { setBusy(false); }
  };

  const finishVoice = async () => {
    const clip = await voice.stop();
    if (!clip) return;
    Speech.stop(); setNotice(null); setBusy(true);
    const base = msgsRef.current;
    try {
      const r = await api.post<ChatResponse>('/assistant/voice', { audio: clip.base64, mimeType: clip.mimeType, conversationId: convId ?? undefined, lang }, { timeoutMs: 90000 });
      const heard: Msg = { id: `u${Date.now()}`, role: 'user', text: r.transcript ?? '', viaVoice: true };
      accept(r, [...base, heard], true);
    } catch (e) {
      const err = e as ApiError;
      setNotice(err.isNetwork ? t('ask.errOffline') : err.code === 'no_speech' || err.code === 'voice_unavailable' ? err.message : t('ask.voiceFail'));
    } finally { setBusy(false); }
  };
  voice.onLimit(() => { finishVoice(); });
  const toggleMic = () => { if (voice.state === 'recording') finishVoice(); else if (voice.state === 'idle' && !busy) { Speech.stop(); voice.start(); } };

  const scroller = useRef<{ scrollToEnd: (o?: { animated?: boolean }) => void } | null>(null);
  const goEnd = () => scroller.current?.scrollToEnd({ animated: true });
  const { gutter } = useLayout();
  const ty = useType();
  const { online, apiUp } = useConnectivity();
  const recording = voice.state === 'recording';
  const micMsg = voice.error === 'denied' ? t('ask.micDenied') : voice.error === 'tooShort' ? t('ask.micShort') : voice.error === 'failed' ? t('ask.voiceFail') : null;
  const mm = String(Math.floor(voice.seconds / 60)).padStart(1, '0') + ':' + String(voice.seconds % 60).padStart(2, '0');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'left', 'right']}>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <View style={{ flex: 1, width: '100%', maxWidth: MAX_WIDTH, paddingHorizontal: gutter }}>
          <TopBar />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, marginTop: space.md, flexWrap: 'wrap' }}>
            <Text v="h1">{t('tab.ask')}</Text>
            <View style={{ flexDirection: 'row', gap: space.xs }}>
              <Button label={t('ask.history')} variant="ghost" icon={History} fullWidth={false} compact onPress={() => setHistoryOpen(true)} />
              {msgs.length ? <Button label={t('ask.newChat')} variant="ghost" icon={SquarePen} fullWidth={false} compact onPress={newChat} /> : null}
            </View>
          </View>
          <ScrollView ref={scroller as never} style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: space.lg, gap: space.xl }} keyboardShouldPersistTaps="handled" onContentSizeChange={goEnd}>
            <Text v="label" tone="soft">{disclaimer ?? t('ask.note')}</Text>
            {!msgs.length ? (
              <View style={{ gap: space.md }}>
                <Text v="h3">{t('ask.try')}</Text>
                <Text v="body" tone="soft">{t('ask.voiceHint')}</Text>
                <Cluster>{SUGG.map((k) => <Chip key={k} label={t(k)} onPress={() => send(t(k))} />)}</Cluster>
              </View>
            ) : null}
            {msgs.map((m) => <Bubble key={m.id} m={m} onFollow={send} />)}
            {busy ? <Typing /> : null}
          </ScrollView>
          {notice || micMsg ? <View style={{ paddingBottom: space.sm }}><Banner tone="caution" title={(notice ?? micMsg) as string} /></View> : null}
          {recording ? (
            <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingBottom: space.sm }}>
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.loss }} />
              <Text v="label" weight="semibold">{t('ask.listening')} {mm}</Text>
            </View>
          ) : null}
          <View style={{ paddingTop: space.sm, paddingBottom: space.md, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg, flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
            <Pressable
              onPress={toggleMic} disabled={busy || voice.state === 'processing' || !online || !apiUp} accessibilityRole="button" accessibilityLabel={recording ? t('ask.micStop') : t('ask.mic')} accessibilityState={{ disabled: busy }}
              style={{ width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: recording ? colors.loss : colors.primary, opacity: busy || !online || !apiUp ? 0.5 : 1 }}>
              {recording ? <Square size={24} color={colors.onPrimary} fill={colors.onPrimary} /> : <Mic size={28} color={colors.onPrimary} />}
            </Pressable>
            <TextInput
              value={input} onChangeText={setInput} placeholder={recording ? t('ask.listening') : t('ask.placeholder')} placeholderTextColor={colors.inkSoft} accessibilityLabel={t('ask.label')}
              onSubmitEditing={() => send(input)} returnKeyType="send" editable={!recording}
              style={[{ flex: 1, minHeight: 56, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.surface, color: colors.ink, fontFamily: ty.family.regular, fontSize: ty.size('bodyLg'), paddingHorizontal: space.md }, { outlineStyle: 'none' } as never]}
            />
            <Pressable onPress={() => send(input)} disabled={!input.trim() || busy || !online || !apiUp} accessibilityRole="button" accessibilityLabel={t('ask.send')}
              style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt, borderWidth: 1.5, borderColor: colors.line, opacity: !input.trim() || busy ? 0.5 : 1 }}>
              <Send size={24} color={colors.primary} />
            </Pressable>
          </View>
        </View>
      </View>
      <ChatHistorySheet visible={historyOpen} onClose={() => setHistoryOpen(false)} currentId={convId} onOpen={open} onNew={newChat} onDeleted={(id) => { if (id === convId) newChat(); }} />
    </SafeAreaView>
  );
}
