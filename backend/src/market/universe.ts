// The whole NSE equity universe (~2,600 symbols) from NSE's public EQUITY_L.csv listing file.
//
// Source: https://archives.nseindia.com/content/equities/EQUITY_L.csv (static file, plain browser User-Agent is enough).
// Series kept: EQ (normal rolling settlement, the vast majority), BE (trade-for-trade / book entry), BZ (surveillance
// or non-compliant companies, shown but flagged by the series field). The file contains no SM/ST rows: NSE Emerge (SME)
// names live in a separate file (SME_EQUITY_L.csv); if a row with series SM or ST ever appears here we keep it too.
// Cached in memory for 24h and persisted to backend/data/equity_l.csv so search keeps working offline.
// Titles: the file's company name is kept, only the trailing " Limited"/" Ltd" is dropped for display (`name`).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getText } from './http';

export const UNIVERSE_URL = 'https://archives.nseindia.com/content/equities/EQUITY_L.csv';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const KEEP_SERIES = new Set(['EQ', 'BE', 'BZ', 'SM', 'ST']);
const TTL_MS = 24 * 3600_000;
const here = path.dirname(fileURLToPath(import.meta.url));
export const UNIVERSE_FILE = process.env.FINSAATHI_UNIVERSE_FILE ?? path.resolve(here, '../../data/equity_l.csv');

export interface UniverseItem { symbol: string; name: string; fullName: string; series: string; isin: string | null; listedOn: string | null }

// ---------- parsing ----------
/** Minimal RFC-4180 style CSV line splitter (handles quoted commas and doubled quotes). */
function splitCsv(line: string): string[] {
  const out: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}
export function tidyName(full: string): string {
  const t = full.replace(/\s+/g, ' ').trim();
  const s = t.replace(/\s+(limited|ltd\.?)$/i, '').trim();
  return s.length >= 2 ? s : t;
}
/** NSE's date of listing is "DD-MON-YYYY"; return ISO date or null. */
function listedIso(s: string | undefined): string | null {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec((s ?? '').trim());
  if (!m) return null;
  const mon = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].indexOf(m[2]!.toUpperCase());
  return mon < 0 ? null : `${m[3]}-${String(mon + 1).padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
}
export function parseEquityCsv(text: string): UniverseItem[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const head = splitCsv(lines[0]!).map((h) => h.replace(/^﻿/, '').trim().toUpperCase());
  const col = (n: string) => head.indexOf(n);
  const iSym = col('SYMBOL'), iName = col('NAME OF COMPANY'), iSer = col('SERIES'), iDate = col('DATE OF LISTING'), iIsin = col('ISIN NUMBER');
  if (iSym < 0 || iName < 0 || iSer < 0) return [];
  const seen = new Set<string>(); const out: UniverseItem[] = [];
  for (const line of lines.slice(1)) {
    const c = splitCsv(line);
    const sym = (c[iSym] ?? '').toUpperCase();
    const series = (c[iSer] ?? '').toUpperCase();
    if (!/^[A-Z0-9&-]{1,20}$/.test(sym) || !KEEP_SERIES.has(series) || seen.has(sym)) continue;
    seen.add(sym);
    const fullName = (c[iName] ?? '').replace(/\s+/g, ' ').trim() || sym;
    out.push({ symbol: `${sym}.NS`, name: tidyName(fullName), fullName, series, isin: (iIsin >= 0 && c[iIsin]) || null, listedOn: listedIso(iDate >= 0 ? c[iDate] : undefined) });
  }
  return out;
}

// ---------- state ----------
let items: UniverseItem[] = [];
let bySymbol = new Map<string, UniverseItem>();
let loadedAt = 0;          // when the in-memory copy was fetched (0 = never from network)
let diskTried = false;
let refreshing: Promise<void> | null = null;
let fetchImpl: (() => Promise<string>) | null = null;
const offline = () => process.env.FINSAATHI_UNIVERSE_OFFLINE === '1' && !fetchImpl;

function install(list: UniverseItem[], at: number) {
  items = list; bySymbol = new Map(list.map((x) => [x.symbol, x])); loadedAt = at;
}
function loadDiskOnce() {
  if (diskTried || items.length) return;
  diskTried = true;
  if (offline()) return;
  try { if (existsSync(UNIVERSE_FILE)) install(parseEquityCsv(readFileSync(UNIVERSE_FILE, 'utf8')), 0); } catch { /* ignore */ }
}

/** Test hook: inject CSV text (or a loader) and reset state. Pass null to reset to the default network loader. */
export function setUniverseImpl(impl: (() => Promise<string>) | null) { fetchImpl = impl; items = []; bySymbol = new Map(); loadedAt = 0; diskTried = false; refreshing = null; }
/** Test hook: load a CSV string directly. */
export function setUniverseCsv(csv: string) { diskTried = true; install(parseEquityCsv(csv), Date.now()); }

/** Make sure the universe is loaded and < 24h old; never throws (offline => disk copy, else whatever is in memory). */
export async function ensureUniverse(): Promise<void> {
  loadDiskOnce();
  if (items.length && Date.now() - loadedAt < TTL_MS && loadedAt > 0) return;
  if (offline()) return;
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const text = fetchImpl ? await fetchImpl() : await getText(UNIVERSE_URL, { headers: { 'User-Agent': UA, Accept: 'text/csv,*/*' }, retries: 1, timeoutMs: 15000 });
        const list = parseEquityCsv(text);
        if (list.length < (fetchImpl ? 1 : 100)) throw new Error('universe file looks truncated');
        install(list, Date.now());
        if (!fetchImpl) { try { mkdirSync(path.dirname(UNIVERSE_FILE), { recursive: true }); writeFileSync(UNIVERSE_FILE, text); } catch { /* read-only FS */ } }
      } catch { /* keep whatever we have (disk copy or older memory copy) */ }
    })().finally(() => { refreshing = null; });
  }
  // Already have usable data (stale/disk): do not make the caller wait for the refresh.
  if (items.length) return;
  await refreshing;
}

// ---------- queries ----------
const toNs = (s: string) => { const u = s.trim().toUpperCase(); return u.endsWith('.NS') ? u : `${u}.NS`; };
export function universeSize(): number { loadDiskOnce(); return items.length; }
export function universeItem(symbolOrNs: string): UniverseItem | undefined { loadDiskOnce(); return bySymbol.get(toNs(symbolOrNs)); }
export function isListed(symbolOrNs: string): boolean { return !!universeItem(symbolOrNs); }
export function allUniverse(): readonly UniverseItem[] { loadDiskOnce(); return items; }

const norm = (s: string) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const squash = (s: string) => norm(s).replace(/ /g, '');
/**
 * Rank: exact symbol 100, symbol prefix 80, name starts with query 70, a name word starts with query 60,
 * symbol substring 50, name substring 40 (also punctuation-insensitive, "&" == "and"). EQ beats BE/BZ; shorter symbols first.
 */
export function searchUniverse(q: string, limit = 25): UniverseItem[] {
  loadDiskOnce();
  const raw = q.trim();
  if (!raw) return [];
  const n = norm(raw), sq = squash(raw), symq = raw.toUpperCase().replace(/\.NS$/, '');
  const scored: { it: UniverseItem; s: number }[] = [];
  for (const it of items) {
    const sym = it.symbol.slice(0, -3);
    const nn = norm(it.fullName), ns = squash(it.fullName);
    let s = 0;
    if (sym === symq) s = 100;
    else if (sym.startsWith(symq)) s = 80;
    else if (nn.startsWith(n)) s = 70;
    else if (nn.split(' ').some((w) => w.startsWith(n)) || (n.includes(' ') && nn.includes(n))) s = 60;
    else if (sym.includes(symq) && symq.length >= 2) s = 50;
    else if (nn.includes(n) || (sq.length >= 3 && ns.includes(sq))) s = 40;
    if (s) scored.push({ it, s: s + (it.series === 'EQ' ? 3 : 0) - Math.min(sym.length, 20) / 100 });
  }
  return scored.sort((a, b) => b.s - a.s || a.it.symbol.localeCompare(b.it.symbol)).slice(0, limit).map((x) => x.it);
}
