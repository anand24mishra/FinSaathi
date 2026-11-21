import React, { useState } from 'react';
import { ScrollView, useWindowDimensions } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { V as View, Tx as RNText, Pr as Pressable, PalProvider } from '@/lab/tw';
import { THEMES, type Dir, type Mode } from '@/lab/themes';
import { useLabData } from '@/lab/useLabData';
import { Brand, CallDetail, Hero, Home, Pulse } from '@/lab/Sections';

const DIRS: Dir[] = ['A', 'B', 'C', 'D'];
/** Design Lab: one scrolling page per direction showing landing, home, stock call and news/social pulse with live data. */
export default function DesignLab() {
  const q = useLocalSearchParams<{ d?: string; m?: string }>();
  const [dir, setDir] = useState<Dir>((DIRS.includes(q.d as Dir) ? q.d : 'A') as Dir);
  const [mode, setMode] = useState<Mode>(q.m === 'light' ? 'light' : 'dark');
  const t = THEMES[dir]; const data = useLabData(); const narrow = useWindowDimensions().width < 640;
  const Label = ({ n, children }: { n: number; children: string }) => <View style={{ width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 36 }}><RNText className="text-soft" style={{ fontFamily: t.font.num, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' }}>Screen {n} · {children}</RNText></View>;
  return (
    <PalProvider pal={t[mode]}><View className="bg-bg" style={{ flex: 1 }}>
      <View className="bg-surface border-b border-line" style={{ paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {DIRS.map((k) => (<Pressable key={k} onPress={() => setDir(k)} className={k === dir ? 'bg-brand' : 'bg-surface2'} style={{ borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }} accessibilityRole="button" accessibilityState={{ selected: k === dir }}><RNText className={k === dir ? 'text-onbrand' : 'text-ink'} style={{ fontWeight: '700', fontSize: 13 }}>{narrow ? k : `${k} · ${THEMES[k].name}`}</RNText></Pressable>))}
        </View>
        <Pressable onPress={() => setMode(mode === 'dark' ? 'light' : 'dark')} className="bg-surface2" style={{ borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }} accessibilityRole="button"><RNText className="text-ink" style={{ fontWeight: '700', fontSize: 13 }}>{mode === 'dark' ? '☾ Dark' : '☀ Light'}</RNText></Pressable>
      </View>
      <ScrollView>
        <View style={{ width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Brand t={t} /><RNText className="text-soft" style={{ fontSize: 12, flexShrink: 1, textAlign: 'right', marginLeft: 12 }}>{narrow ? `${t.key} · ${t.name}` : t.tagline}</RNText></View>
        {data.error ? <View style={{ padding: 20 }}><RNText className="text-loss">{data.error}</RNText></View> : null}
        <Label n={1}>Landing</Label><Hero t={t} d={data} />
        <Label n={2}>Home · daily command centre</Label><Home t={t} d={data} />
        <Label n={3}>Stock call</Label><CallDetail t={t} d={data} />
        <Label n={4}>News & social pulse</Label><Pulse t={t} d={data} />
        <View style={{ height: 60 }} />
      </ScrollView>
    </View></PalProvider>
  );
}
