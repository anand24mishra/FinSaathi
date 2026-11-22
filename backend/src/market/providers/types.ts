// Provider adapter interfaces: swap unofficial sources for a licensed feed in production.
import type { Range } from '../../../../shared/contract';

export interface Candle { t: number; o: number; h: number; l: number; c: number; v: number }
export interface ChartMeta {
  symbol: string; name: string; currency: string; exchange: string | null;
  price: number; prevClose: number | null; dayHigh: number | null; dayLow: number | null;
  fiftyTwoWeekHigh: number | null; fiftyTwoWeekLow: number | null;
  marketTime: number; // epoch ms
  marketState: 'open' | 'closed' | 'unknown';
}
export interface ChartData { meta: ChartMeta; candles: Candle[]; fetchedAt: number }
export interface ChartProvider { chart(symbol: string, range: Range | '5d' | '1d'): Promise<ChartData> }

export interface FundamentalsRaw {
  marketCapCr: number | null; pe: number | null; pb: number | null; roePct: number | null;
  debtToEquity: number | null; dividendYieldPct: number | null; epsTtm: number | null;
  revenueGrowthPct: number | null; profitMarginPct: number | null; sector: string | null; industry: string | null;
  /** Which site supplied these numbers (set by the provider); the API labels the data with it. */
  source?: string;
}
export interface FundamentalsProvider { fundamentals(symbol: string): Promise<FundamentalsRaw> }
