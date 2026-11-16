// FX fallback (ECB reference rates via frankfurter.dev) used only if Yahoo USDINR=X fails.
import { getJson } from '../http';
export async function usdInr(): Promise<{ rate: number; prev: number | null; date: string }> {
  const latest = await getJson<any>('https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR');
  const rate = latest?.rates?.INR;
  if (typeof rate !== 'number') throw new Error('frankfurter: no INR rate');
  let prev: number | null = null;
  try {
    const d = new Date(latest.date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 4);
    const hist = await getJson<any>(`https://api.frankfurter.dev/v1/${d.toISOString().slice(0, 10)}..${latest.date}?base=USD&symbols=INR`);
    const days = Object.keys(hist?.rates ?? {}).sort();
    if (days.length >= 2) prev = hist.rates[days[days.length - 2]].INR;
  } catch { /* prev stays null */ }
  return { rate, prev, date: latest.date };
}
