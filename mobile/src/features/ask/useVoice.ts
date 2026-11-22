import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { IOSOutputFormat, AudioQuality, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { File } from 'expo-file-system';

export type VoiceState = 'idle' | 'recording' | 'processing';
export type VoiceError = 'denied' | 'failed' | 'tooShort';
export type Clip = { base64: string; mimeType: 'audio/aac' | 'audio/wav' | 'audio/webm' };

const MAX_SECONDS = 60;
// Android records AAC in an ADTS stream (plain .aac), iOS records 16-bit PCM WAV (Gemini does not reliably accept m4a), the web uses the browser's webm.
// 16 kHz mono is plenty for speech and keeps a 60-second clip well under 1 MB.
const OPTIONS =
  Platform.OS === 'android'
    ? { ...RecordingPresets.HIGH_QUALITY, extension: '.aac', sampleRate: 16000, numberOfChannels: 1, bitRate: 32000, android: { outputFormat: 'aac_adts' as const, audioEncoder: 'aac' as const } }
    : Platform.OS === 'ios'
      ? { ...RecordingPresets.HIGH_QUALITY, extension: '.wav', sampleRate: 16000, numberOfChannels: 1, ios: { outputFormat: IOSOutputFormat.LINEARPCM, audioQuality: AudioQuality.MEDIUM, linearPCMBitDepth: 16, linearPCMIsBigEndian: false, linearPCMIsFloat: false } }
      : RecordingPresets.HIGH_QUALITY;
const MIME: Clip['mimeType'] = Platform.OS === 'android' ? 'audio/aac' : Platform.OS === 'web' ? 'audio/webm' : 'audio/wav';

/** Chunked, because String.fromCharCode(...bigArray) overflows the call stack. */
function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function readClip(uri: string): Promise<Clip> {
  if (Platform.OS === 'web') {
    const buf = await (await fetch(uri)).arrayBuffer();
    return { base64: toBase64(buf), mimeType: MIME };
  }
  return { base64: toBase64(await new File(uri).arrayBuffer()), mimeType: MIME };
}

/** Tap-to-start, tap-to-stop voice recording. Returns the clip so the caller can send it to the server. */
export function useVoice() {
  const recorder = useAudioRecorder(OPTIONS);
  const [state, setState] = useState<VoiceState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<VoiceError | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);
  const auto = useRef<(() => void) | null>(null);

  const clearTimer = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
  useEffect(() => () => { clearTimer(); }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) { setError('denied'); return; }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      startedAt.current = Date.now(); setSeconds(0); setState('recording');
      timer.current = setInterval(() => {
        const s = Math.floor((Date.now() - startedAt.current) / 1000);
        setSeconds(s);
        if (s >= MAX_SECONDS) auto.current?.();
      }, 250);
    } catch { clearTimer(); setState('idle'); setError('failed'); }
  }, [recorder]);

  /** Stops recording and returns the clip, or null when it was too short or failed. */
  const stop = useCallback(async (): Promise<Clip | null> => {
    clearTimer();
    const ms = Date.now() - startedAt.current;
    setState('processing');
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      if (ms < 700 || !recorder.uri) { setState('idle'); setError('tooShort'); return null; }
      const clip = await readClip(recorder.uri);
      setState('idle');
      return clip;
    } catch { setState('idle'); setError('failed'); return null; }
  }, [recorder]);

  const cancel = useCallback(async () => {
    clearTimer();
    try { await recorder.stop(); } catch { /* not recording */ }
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    setState('idle');
  }, [recorder]);

  /** The caller registers what should happen when the 60-second limit is hit. */
  const onLimit = useCallback((fn: () => void) => { auto.current = fn; }, []);

  return { state, seconds, error, start, stop, cancel, onLimit, clearError: () => setError(null) };
}
