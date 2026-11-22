import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import * as Speech from 'expo-speech';
import { setAudioModeAsync } from 'expo-audio';
import { ArrowUp, ChevronDown, ChevronUp, History, Mic, Square, SquarePen, Trash2, Volume2 } from 'lucide-react-native';
import { Text } from '@/components/Text';
import { Chip } from '@/components/Chip';
import { Banner } from '@/components/Banner';
import { TopBar } from '@/components/TopBar';
import { Cluster, useLayout } from '@/components/Layout';
import { RichText } from '@/components/Term';
import { useConnectivity } from '@/components/Connectivity';
import { api, ApiError } from '@/api/client';
import type { ChatMessage, ChatResponse, Citation, Conversation, ReplyStyle } from '@/api/contract';
import { useApp } from '@/state/AppState';
import { useT, type Key } from '@/i18n';
import { getJSON, removeKey, setJSON } from '@/lib/storage';
import { formatDateTime } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { useType } from '@/theme/type';
import { MAX_WIDTH, radius, space } from '@/theme/tokens';
import { useVoice } from './useVoice';
import { ChatHistorySheet } from './ChatHistorySheet';

type Msg = { id: string; role: 'user' | 'assistant'; text: string; citations?: Citation[]; followUps?: string[]; refused?: boolean; generatedBy?: 'rules' | 'llm'; error?: boolean; style?: ReplyStyle; viaVoice?: boolean };
const fromServer = (m: ChatMessage): Msg => ({ id: m.id, role: m.role, text: m.text, citations: m.citations, followUps: m.followUps, refused: m.refused, style: m.style, viaVoice: m.viaVoice });
const STARTERS: Key[] = ['ask.s2', 'ask.s1', 'ask.s3', 'ask.s4'];
const KEY = 'finsaathi.chat';              // old on-phone history, uploaded once then removed
const CUR = 'finsaathi.chat.current';      // id of the conversation to resume

/** Hindi is read in a Hindi voice; Hinglish (Hindi in English letters) reads best in an Indian-English voice. */
const speak = (text: string, style?: ReplyStyle) => {
  Speech.stop();
  setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {}); // iPhone: read aloud even when the silent switch is on
  Speech.speak(text.replace(/[•*_#]/g, ' ').replace(/\s+/g, ' '), { language: style === 'hi' ? 'hi-IN' : 'en-IN', rate: 0.92 });
};

function Dot({ i }: { i: number }) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const o = useSharedValue(0.35);
  useEffect(() => { if (!reduce) o.value = withDelay(i * 160, withRepeat(withSequence(withTiming(1, { duration: 400 }), withTiming(0.3, { duration: 400 })), -1)); }, [o, i, reduce]);
  const s = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: -3 * o.value }] }));
  return <Animated.View style={[{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary }, s]} />;
}
function Typing() {
  const t = useT();
  const { colors } = useTheme();
  return (
    <View accessibilityLiveRegion="polite" accessibilityLabel={t('ask.thinking')} style={{ alignSelf: 'flex-start', flexDirection: 'row', gap: 6, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, borderTopLeftRadius: 4, paddingHorizontal: space.lg, paddingVertical: space.md }}>
      <Dot i={0} /><Dot i={1} /><Dot i={2} />
    </View>
  );
}

/** Live level meter shown while the microphone is recording. */
function Meter({ color }: { color: string }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 28 }}>{[0.5, 0.9, 0.6, 1, 0.7, 0.9, 0.5].map((h, i) => <MeterBar key={i} i={i} h={h} color={color} />)}</View>;
}
function MeterBar({ i, h, color }: { i: number; h: number; color: string }) {
  const s = useSharedValue(0.3);
  useEffect(() => { s.value = withDelay(i * 90, withRepeat(withSequence(withTiming(h, { duration: 320, easing: Easing.inOut(Easing.quad) }), withTiming(0.2, { duration: 320 })), -1)); }, [s, i, h]);
  const st = useAnimatedStyle(() => ({ transform: [{ scaleY: s.value }] }));
  return <Animated.View style={[{ width: 4, height: 28, borderRadius: 2, backgroundColor: color }, st]} />;
}

function Bubble({ m, onFollow, showFollow }: { m: Msg; onFollow: (q: string) => void; showFollow: boolean }) {
  const { colors } = useTheme();
  const { lang } = useApp();
  const t = useT();
  const [src, setSrc] = useState(false);
  if (m.role === 'user') {
    return (
      <Animated.View entering={FadeInDown.duration(220)} style={{ alignSelf: 'flex-end', maxWidth: '86%', backgroundColor: colors.primary, borderRadius: radius.lg, borderBottomRightRadius: 4, paddingHorizontal: space.lg, paddingVertical: space.md, gap: 2 }} accessible accessibilityLabel={`${t('ask.you')}: ${m.text}`}>
        {m.viaVoice ? <Mic size={14} color={colors.onPrimary} /> : null}
        <Text v="bodyLg" tone="onPrimary">{m.text}</Text>
      </Animated.View>
    );
  }
  if (m.error) return <Banner tone="offline" title={m.text} />;
  return (
    <Animated.View entering={FadeInDown.duration(260)} style={{ gap: space.sm, maxWidth: '100%' }}>
      {m.refused ? (
        <Banner tone="info" title={t('ask.refusedTitle')} body={m.text} />
      ) : (
        <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, borderTopLeftRadius: 4, padding: space.lg, gap: space.sm }}>
          <RichText text={m.text} v="bodyLg" />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            {m.citations?.length ? (
              <Pressable onPress={() => setSrc((v) => !v)} accessibilityRole="button" accessibilityLabel={t('ask.sources')} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40 }}>
                <Text v="small" tone="soft" weight="semibold">{t('ask.sources')} ({m.citations.length})</Text>
                {src ? <ChevronUp size={16} color={colors.inkSoft} /> : <ChevronDown size={16} color={colors.inkSoft} />}
              </Pressable>
            ) : <View />}
            <Pressable onPress={() => speak(m.text, m.style)} accessibilityRole="button" accessibilityLabel={t('ask.speak')} hitSlop={8} style={{ width: 44, height: 40, alignItems: 'flex-end', justifyContent: 'center' }}>
              <Volume2 size={20} color={colors.primary} />
            </Pressable>
          </View>
          {src ? (
            <View style={{ gap: 4 }}>
              {m.citations!.map((c, i) => <Text key={i} v="small" tone="soft">• {c.label}{c.asOf ? ` · ${formatDateTime(c.asOf, lang)}` : ''}</Text>)}
            </View>
          ) : null}
        </View>
      )}
      {showFollow && m.followUps?.length ? <Cluster>{m.followUps.slice(0, 2).map((f) => <Chip key={f} label={f} onPress={() => onFollow(f)} />)}</Cluster> : null}
    </Animated.View>
  );
}

/** A big breathing mic on an empty chat: the one obvious thing to do. */
function EmptyState({ onPick, onMic }: { onPick: (q: string) => void; onMic: () => void }) {
  const { colors } = useTheme();
  const t = useT();
  const reduce = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => { if (!reduce) p.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false); }, [p, reduce]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.35 * (1 - p.value), transform: [{ scale: 1 + 0.9 * p.value }] }));
  return (
    <View style={{ alignItems: 'center', gap: space.lg, paddingTop: space.xl }}>
      <Pressable onPress={onMic} accessibilityRole="button" accessibilityLabel={t('ask.mic')} style={{ width: 120, height: 120, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primary }, ring]} />
        <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}><Mic size={38} color={colors.onPrimary} /></View>
      </Pressable>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Text v="h2" center>{t('ask.hello')}</Text>
        <Text v="body" tone="soft" center>{t('ask.helloSub')}</Text>
      </View>
      <View style={{ alignSelf: 'stretch', gap: space.sm }}>
        {STARTERS.map((k) => (
          <Pressable key={k} onPress={() => onPick(t(k))} accessibilityRole="button" accessibilityLabel={t(k)}
            style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface }}>
            <Text v="body" weight="medium" style={{ flex: 1 }}>{t(k)}</Text>
          </Pressable>
        ))}
      </View>
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const msgsRef = useRef<Msg[]>([]);
  msgsRef.current = msgs;
  const voice = useVoice();
  const { q: prefill } = useLocalSearchParams<{ q?: string }>();
  // "Ask FinSaathi about this" on a news story opens the chat with the question typed in, ready to send.
  useEffect(() => { if (prefill) setInput(`${prefill}`); }, [prefill]);

  const remember = (id: string | null) => { setConvId(id); if (id) setJSON(CUR, id); else removeKey(CUR); };
  const open = async (id: string): Promise<boolean> => {
    try {
      const c = await api.get<Conversation>(`/assistant/conversations/${id}`);
      Speech.stop(); setMsgs(c.messages.map(fromServer)); remember(c.id); return true;
    } catch { return false; }
  };
  const newChat = () => { Speech.stop(); setMsgs([]); setNotice(null); remember(null); };

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
    if (r.conversationId && r.conversationId !== convId) remember(r.conversationId);
    setMsgs([...base, { id: `a${Date.now()}`, role: 'assistant', text: r.answer, citations: r.citations, followUps: r.followUps, refused: r.refused, generatedBy: r.generatedBy, style: r.style }]);
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
      accept(r, [...base, { id: `u${Date.now()}`, role: 'user', text: r.transcript ?? '', viaVoice: true }], true);
    } catch (e) {
      const err = e as ApiError;
      setNotice(err.isNetwork ? t('ask.errOffline') : err.code === 'no_speech' || err.code === 'voice_unavailable' ? err.message : t('ask.voiceFail'));
    } finally { setBusy(false); }
  };
  voice.onLimit(() => { finishVoice(); });
  const startMic = () => { if (voice.state === 'idle' && !busy) { Speech.stop(); voice.start(); } };

  const scroller = useRef<{ scrollToEnd: (o?: { animated?: boolean }) => void } | null>(null);
  const { gutter } = useLayout();
  const ty = useType();
  const { online, apiUp } = useConnectivity();
  const recording = voice.state === 'recording';
  const offline = !online || !apiUp;
  const hasText = !!input.trim();
  const micMsg = voice.error === 'denied' ? t('ask.micDenied') : voice.error === 'tooShort' ? t('ask.micShort') : voice.error === 'failed' ? t('ask.voiceFail') : null;
  const mm = `${Math.floor(voice.seconds / 60)}:${String(voice.seconds % 60).padStart(2, '0')}`;
  const action = recording ? 'stop' : hasText ? 'send' : 'mic';
  const onAction = () => (action === 'stop' ? finishVoice() : action === 'send' ? send(input) : startMic());

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={{ flex: 1, alignItems: 'center' }} behavior="padding" keyboardVerticalOffset={0}>
        <View style={{ flex: 1, width: '100%', maxWidth: 720, paddingHorizontal: gutter }}>
          <TopBar />
          {msgs.length ? (
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: space.xs, paddingTop: space.xs }}>
              <Pressable onPress={() => setHistoryOpen(true)} accessibilityRole="button" accessibilityLabel={t('ask.history')} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.sm }}>
                <History size={20} color={colors.primary} /><Text v="label" tone="primary" weight="semibold">{t('ask.history')}</Text>
              </Pressable>
              <Pressable onPress={newChat} accessibilityRole="button" accessibilityLabel={t('ask.newChat')} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.sm }}>
                <SquarePen size={20} color={colors.primary} /><Text v="label" tone="primary" weight="semibold">{t('ask.newChat')}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingTop: space.xs }}>
              <Pressable onPress={() => setHistoryOpen(true)} accessibilityRole="button" accessibilityLabel={t('ask.history')} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.sm }}>
                <History size={20} color={colors.primary} /><Text v="label" tone="primary" weight="semibold">{t('ask.history')}</Text>
              </Pressable>
            </View>
          )}
          <ScrollView ref={scroller as never} style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: space.md, gap: space.lg, flexGrow: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
            onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}>
            {!msgs.length && !busy ? <EmptyState onPick={send} onMic={startMic} /> : null}
            {msgs.map((m, idx) => <Bubble key={m.id} m={m} onFollow={send} showFollow={idx === msgs.length - 1 && !busy} />)}
            {busy ? <Typing /> : null}
          </ScrollView>
          {notice || micMsg ? <View style={{ paddingBottom: space.sm }}><Banner tone="caution" title={(notice ?? micMsg) as string} /></View> : null}
          <View style={{ paddingTop: space.sm, paddingBottom: space.sm, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: recording ? colors.loss : colors.line, borderRadius: 32, paddingLeft: space.lg, paddingRight: 6, paddingVertical: 6, minHeight: 64 }}>
              {recording ? (
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 52 }}>
                  <Pressable onPress={() => { voice.cancel(); }} accessibilityRole="button" accessibilityLabel={t('common.cancel')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Trash2 size={22} color={colors.inkSoft} /></Pressable>
                  <Meter color={colors.loss} />
                  <Text v="body" weight="semibold" num>{mm}</Text>
                  <Text v="small" tone="soft" style={{ flex: 1 }} numberOfLines={1}>{t('ask.listening')}</Text>
                </View>
              ) : (
                <TextInput
                  value={input} onChangeText={setInput} placeholder={t('ask.placeholder')} placeholderTextColor={colors.inkSoft} accessibilityLabel={t('ask.label')} multiline maxLength={1000}
                  style={[{ flex: 1, maxHeight: 120, minHeight: 52, paddingTop: 12, paddingBottom: 12, color: colors.ink, fontFamily: ty.family.regular, fontSize: ty.size('bodyLg') }, { outlineStyle: 'none' } as never]}
                />
              )}
              <Pressable onPress={onAction} disabled={busy || offline || voice.state === 'processing'} accessibilityRole="button"
                accessibilityLabel={action === 'stop' ? t('ask.micStop') : action === 'send' ? t('ask.send') : t('ask.mic')}
                style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: action === 'stop' ? colors.loss : colors.primary, opacity: busy || offline ? 0.45 : 1 }}>
                {action === 'stop' ? <Square size={20} color={colors.onPrimary} fill={colors.onPrimary} /> : action === 'send' ? <ArrowUp size={26} color={colors.onPrimary} strokeWidth={2.5} /> : <Mic size={26} color={colors.onPrimary} />}
              </Pressable>
            </View>
            <Text v="small" tone="soft" center>{t('gate.legal')}</Text>
          </View>
        </View>
      </KeyboardAvoidingView>
      <ChatHistorySheet visible={historyOpen} onClose={() => setHistoryOpen(false)} currentId={convId} onOpen={open} onNew={newChat} onDeleted={(id) => { if (id === convId) newChat(); }} />
    </SafeAreaView>
  );
}
