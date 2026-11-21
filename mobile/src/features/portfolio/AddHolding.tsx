import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Sheet } from '@/components/Sheet';
import { Field } from '@/components/Field';
import { Button } from '@/components/Button';
import { Segmented } from '@/components/Chip';
import { Row } from '@/components/Layout';
import { Banner } from '@/components/Banner';
import { Text } from '@/components/Text';
import { api, ApiError } from '@/api/client';
import { clearApiCache } from '@/api/useApi';
import type { FundSummary, Holding, HoldingInput, StockListItem } from '@/api/contract';
import { useT } from '@/i18n';
import { formatINR, simpleAmount } from '@/lib/format';
import { useApp } from '@/state/AppState';
import { useApi } from '@/api/useApi';
import { space } from '@/theme/tokens';

export type Preset = { type: 'stock' | 'fund'; symbol?: string; schemeCode?: number; name: string; price?: number };
const pnum = (s: string) => { const n = parseFloat(s.replace(/,/g, '')); return isFinite(n) ? n : NaN; };

function Picker({ type, onPick }: { type: 'stock' | 'fund'; onPick: (p: Preset) => void }) {
  const t = useT();
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  useEffect(() => { const id = setTimeout(() => setDq(q.trim()), 300); return () => clearTimeout(id); }, [q]);
  const stocks = useApi<StockListItem[]>(type === 'stock' ? `/stocks?query=${encodeURIComponent(dq)}` : null);
  const funds = useApi<FundSummary[]>(type === 'fund' && dq.length >= 2 ? `/funds/search?q=${encodeURIComponent(dq)}` : null);
  const rows: Preset[] = type === 'stock'
    ? (stocks.data ?? []).slice(0, 8).map((s) => ({ type: 'stock', symbol: s.symbol, name: s.name, price: s.quote?.price }))
    : (funds.data ?? []).slice(0, 8).map((f) => ({ type: 'fund', schemeCode: f.schemeCode, name: f.name }));
  return (
    <View style={{ gap: space.md }}>
      <Field label={type === 'stock' ? t('add.searchStock') : t('add.searchFund')} value={q} onChangeText={setQ} placeholder={t('stocks.searchPlaceholder')} />
      {type === 'fund' && dq.length < 2 ? <Text v="label" tone="soft">{t('funds.typeToSearch')}</Text> : null}
      {rows.map((r, i) => <Row key={r.symbol ?? r.schemeCode} title={r.name} subtitle={r.symbol?.replace('.NS', '')} onPress={() => onPick(r)} last={i === rows.length - 1} chevron />)}
    </View>
  );
}

export function AddHoldingSheet({ visible, onClose, preset, onAdded, initial, replaceId }: { visible: boolean; onClose: () => void; preset?: Preset; onAdded?: () => void; initial?: { qty: string; price: string }; replaceId?: string }) {
  const t = useT();
  const { lang } = useApp();
  const [type, setType] = useState<'stock' | 'fund'>('stock');
  const [picked, setPicked] = useState<Preset | null>(null);
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => { if (visible) { setPicked(preset ?? null); setQty(initial?.qty ?? ''); setPrice(initial?.price ?? (preset?.price ? String(preset.price) : '')); setErr(null); setDone(false); if (preset) setType(preset.type); }   // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, preset?.symbol, preset?.schemeCode, initial?.qty, initial?.price]);
  const current = picked;
  const q = pnum(qty), p = pnum(price);
  const submit = async () => {
    if (!current) return;
    if (!(q > 0)) { setErr(t('add.errQty')); return; }
    if (!(p > 0)) { setErr(t('add.errPrice')); return; }
    setBusy(true); setErr(null);
    try {
      const body: HoldingInput = { type: current.type, quantity: q, avgPrice: p, ...(current.type === 'stock' ? { symbol: current.symbol } : { schemeCode: current.schemeCode }) };
      if (replaceId) {
        try { await api.put<Holding>(`/portfolio/holdings/${replaceId}`, body); }
        catch (e) {
          // older backends have no PUT: fall back to add + delete
          if (e instanceof ApiError && (e.status === 404 || e.status === 405)) { await api.post<Holding>('/portfolio/holdings', body); await api.del(`/portfolio/holdings/${replaceId}`); }
          else throw e;
        }
      } else await api.post<Holding>('/portfolio/holdings', body);
      clearApiCache(); setDone(true); onAdded?.();
    } catch (e) { setErr(e instanceof ApiError ? (e.isNetwork ? t('err.offlineBody') : e.message) : t('err.generic')); } finally { setBusy(false); }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={replaceId ? t('add.editTitle') : t('add.title')}>
      {done ? (
        <View style={{ gap: space.md }}>
          <Banner tone="info" title={t('add.done', { name: current?.name ?? '' })} />
          <Button label={t('common.close')} onPress={onClose} />
        </View>
      ) : !current ? (
        <View style={{ gap: space.md }}>
          <Segmented<'stock' | 'fund'> label={t('add.type')} value={type} onChange={setType} options={[{ value: 'stock', label: t('add.stock') }, { value: 'fund', label: t('add.fund') }]} />
          <Picker type={type} onPick={(r) => { setPicked(r); if (r.price) setPrice(String(r.price)); }} />
        </View>
      ) : (
        <View style={{ gap: space.md }}>
          <Text v="bodyLg" weight="semibold">{current.name}</Text>
          <Field label={t('add.qty')} value={qty} onChangeText={setQty} keyboardType="decimal-pad" hint={t('add.qtyHint')} />
          <Field label={t('add.avg')} value={price} onChangeText={setPrice} prefix="₹" keyboardType="decimal-pad" hint={p > 0 && q > 0 ? `${t('add.total')}: ${formatINR(p * q)}${simpleAmount(p * q, lang) ? ' · ' + simpleAmount(p * q, lang) : ''}` : t('add.avgHint')} />
          {err ? <Banner tone="error" title={err} /> : null}
          <Button label={t('add.cta')} onPress={submit} loading={busy} />
          {!preset ? <Button label={t('add.change')} variant="ghost" onPress={() => setPicked(null)} /> : null}
        </View>
      )}
    </Sheet>
  );
}
