// Large-cap universe (~50 Nifty 50 names + a few recent/former constituents): STATIC reference snapshot (symbol, name, sector).
// As-of: compiled from the publicly known NSE Nifty 50 list (approx. late-2025 composition). The index is rebalanced
// twice a year, so this list can lag; it is NOT live-verified against NSE. Each symbol was checked to resolve on
// Yahoo Finance (scripts/verify-universe.ts; all resolved on 2026-11-20) and any that did not resolve would be dropped. A licensed index feed
// replaces this in production. Sector labels are our own simple grouping for display only.
// `hi` = common Hindi spelling(s) used for name matching and display in the assistant; `alias` = extra English spellings.

import { NIFTY_NEXT } from './niftyNext';
import { isListed, universeItem } from '../universe';
export interface RefStock { symbol: string; name: string; sector: string; hi: string[]; alias: string[] }
export const NIFTY50_ASOF = '2025-12 (static snapshot)';

const S = (symbol: string, name: string, sector: string, hi: string[], alias: string[] = []): RefStock => ({ symbol, name, sector, hi, alias });

export const NIFTY50: RefStock[] = [
  S('RELIANCE.NS', 'Reliance Industries', 'Energy & Conglomerate', ['रिलायंस', 'रिलायन्स', 'रिलायंस इंडस्ट्रीज'], ['reliance', 'ril']),
  S('TCS.NS', 'Tata Consultancy Services', 'IT', ['टीसीएस', 'टाटा कंसल्टेंसी'], ['tcs', 'tata consultancy']),
  S('HDFCBANK.NS', 'HDFC Bank', 'Banking', ['एचडीएफसी बैंक', 'एचडीएफसी'], ['hdfc bank', 'hdfcbank']),
  S('ICICIBANK.NS', 'ICICI Bank', 'Banking', ['आईसीआईसीआई बैंक', 'आईसीआईसीआई'], ['icici bank', 'icici']),
  S('INFY.NS', 'Infosys', 'IT', ['इंफोसिस', 'इन्फोसिस'], ['infosys', 'infy']),
  S('BHARTIARTL.NS', 'Bharti Airtel', 'Telecom', ['भारती एयरटेल', 'एयरटेल'], ['airtel', 'bharti']),
  S('SBIN.NS', 'State Bank of India', 'Banking', ['एसबीआई', 'स्टेट बैंक', 'भारतीय स्टेट बैंक'], ['sbi', 'state bank']),
  S('ITC.NS', 'ITC', 'FMCG', ['आईटीसी'], ['itc']),
  S('HINDUNILVR.NS', 'Hindustan Unilever', 'FMCG', ['हिंदुस्तान यूनिलीवर', 'हिन्दुस्तान यूनिलीवर'], ['hul', 'hindustan unilever']),
  S('LT.NS', 'Larsen & Toubro', 'Infrastructure', ['एलएंडटी', 'लार्सन', 'लार्सन एंड टुब्रो'], ['l&t', 'larsen']),
  S('KOTAKBANK.NS', 'Kotak Mahindra Bank', 'Banking', ['कोटक महिंद्रा बैंक', 'कोटक बैंक', 'कोटक'], ['kotak']),
  S('AXISBANK.NS', 'Axis Bank', 'Banking', ['एक्सिस बैंक', 'एक्सिस'], ['axis']),
  S('BAJFINANCE.NS', 'Bajaj Finance', 'Financial Services', ['बजाज फाइनेंस'], ['bajaj finance']),
  S('BAJAJFINSV.NS', 'Bajaj Finserv', 'Financial Services', ['बजाज फिनसर्व'], ['bajaj finserv']),
  S('MARUTI.NS', 'Maruti Suzuki', 'Auto', ['मारुति सुजुकी', 'मारुति'], ['maruti']),
  S('M&M.NS', 'Mahindra & Mahindra', 'Auto', ['महिंद्रा एंड महिंद्रा', 'महिंद्रा'], ['mahindra', 'm&m']),
  S('SUNPHARMA.NS', 'Sun Pharmaceutical', 'Pharma', ['सन फार्मा'], ['sun pharma']),
  S('NTPC.NS', 'NTPC', 'Power', ['एनटीपीसी'], ['ntpc']),
  S('POWERGRID.NS', 'Power Grid Corporation', 'Power', ['पावर ग्रिड'], ['power grid', 'powergrid']),
  S('ONGC.NS', 'Oil & Natural Gas Corporation', 'Energy & Conglomerate', ['ओएनजीसी'], ['ongc']),
  S('COALINDIA.NS', 'Coal India', 'Metals & Mining', ['कोल इंडिया'], ['coal india']),
  S('TATASTEEL.NS', 'Tata Steel', 'Metals & Mining', ['टाटा स्टील'], ['tata steel']),
  S('JSWSTEEL.NS', 'JSW Steel', 'Metals & Mining', ['जेएसडब्ल्यू स्टील', 'जेएसडब्ल्यू'], ['jsw steel', 'jsw']),
  S('HINDALCO.NS', 'Hindalco Industries', 'Metals & Mining', ['हिंडाल्को'], ['hindalco']),
  S('ULTRACEMCO.NS', 'UltraTech Cement', 'Cement', ['अल्ट्राटेक सीमेंट', 'अल्ट्राटेक'], ['ultratech']),
  S('GRASIM.NS', 'Grasim Industries', 'Cement', ['ग्रासिम'], ['grasim']),
  S('ASIANPAINT.NS', 'Asian Paints', 'Consumer', ['एशियन पेंट्स', 'एशियन पेंट'], ['asian paints']),
  S('TITAN.NS', 'Titan Company', 'Consumer', ['टाइटन'], ['titan']),
  S('NESTLEIND.NS', 'Nestle India', 'FMCG', ['नेस्ले इंडिया', 'नेस्ले'], ['nestle']),
  S('BRITANNIA.NS', 'Britannia Industries', 'FMCG', ['ब्रिटानिया'], ['britannia']),
  S('TATACONSUM.NS', 'Tata Consumer Products', 'FMCG', ['टाटा कंज्यूमर'], ['tata consumer']),
  S('WIPRO.NS', 'Wipro', 'IT', ['विप्रो'], ['wipro']),
  S('HCLTECH.NS', 'HCL Technologies', 'IT', ['एचसीएल टेक', 'एचसीएल'], ['hcl tech', 'hcl']),
  S('TECHM.NS', 'Tech Mahindra', 'IT', ['टेक महिंद्रा'], ['tech mahindra']),
  S('CIPLA.NS', 'Cipla', 'Pharma', ['सिप्ला'], ['cipla']),
  S('DRREDDY.NS', "Dr. Reddy's Laboratories", 'Pharma', ['डॉ रेड्डी', 'डॉ. रेड्डीज'], ['dr reddy', 'dr reddys', 'drreddy']),
  S('APOLLOHOSP.NS', 'Apollo Hospitals', 'Healthcare', ['अपोलो हॉस्पिटल', 'अपोलो'], ['apollo hospitals', 'apollo']),
  S('EICHERMOT.NS', 'Eicher Motors', 'Auto', ['आइशर मोटर्स', 'रॉयल एनफील्ड'], ['eicher', 'royal enfield']),
  S('BAJAJ-AUTO.NS', 'Bajaj Auto', 'Auto', ['बजाज ऑटो'], ['bajaj auto']),
  S('HEROMOTOCO.NS', 'Hero MotoCorp', 'Auto', ['हीरो मोटोकॉर्प', 'हीरो'], ['hero motocorp', 'hero']),
  S('ADANIENT.NS', 'Adani Enterprises', 'Conglomerate', ['अदाणी एंटरप्राइजेज', 'अडानी एंटरप्राइजेज', 'अडानी'], ['adani enterprises', 'adani']),
  S('ADANIPORTS.NS', 'Adani Ports & SEZ', 'Infrastructure', ['अदाणी पोर्ट्स', 'अडानी पोर्ट्स'], ['adani ports']),
  S('BPCL.NS', 'Bharat Petroleum', 'Energy & Conglomerate', ['भारत पेट्रोलियम', 'बीपीसीएल'], ['bpcl', 'bharat petroleum']),
  S('INDUSINDBK.NS', 'IndusInd Bank', 'Banking', ['इंडसइंड बैंक'], ['indusind']),
  S('SBILIFE.NS', 'SBI Life Insurance', 'Insurance', ['एसबीआई लाइफ'], ['sbi life']),
  S('HDFCLIFE.NS', 'HDFC Life Insurance', 'Insurance', ['एचडीएफसी लाइफ'], ['hdfc life']),
  S('SHRIRAMFIN.NS', 'Shriram Finance', 'Financial Services', ['श्रीराम फाइनेंस'], ['shriram finance', 'shriram']),
  S('TRENT.NS', 'Trent', 'Consumer', ['ट्रेंट'], ['trent', 'westside']),
  S('BEL.NS', 'Bharat Electronics', 'Defence', ['भारत इलेक्ट्रॉनिक्स', 'बीईएल'], ['bel', 'bharat electronics']),
  S('ETERNAL.NS', 'Eternal (Zomato)', 'Consumer Internet', ['एटरनल', 'ज़ोमैटो', 'जोमैटो'], ['eternal', 'zomato']),
  S('JIOFIN.NS', 'Jio Financial Services', 'Financial Services', ['जियो फाइनेंशियल', 'जियो फाइनेंस'], ['jio financial', 'jio finance', 'jiofin']),
  S('TMPV.NS', 'Tata Motors Passenger Vehicles', 'Auto', ['टाटा मोटर्स'], ['tata motors', 'tatamotors']),
  S('MAXHEALTH.NS', 'Max Healthcare Institute', 'Healthcare', ['मैक्स हेल्थकेयर'], ['max healthcare']),
  S('INDIGO.NS', 'InterGlobe Aviation (IndiGo)', 'Aviation', ['इंडिगो'], ['indigo', 'interglobe']),
];

export const NIFTY_INDEX = { '^NSEI': 'Nifty 50', '^BSESN': 'Sensex', '^NSEBANK': 'Bank Nifty' } as const;

// Symbols the series route will accept (whitelist): universe + indices + global + commodities + FX + gold/silver ETFs.
export const EXTRA_SYMBOLS: Record<string, string> = {
  '^NSEI': 'Nifty 50', '^BSESN': 'Sensex', '^NSEBANK': 'Bank Nifty',
  '^IXIC': 'Nasdaq Composite', '^GSPC': 'S&P 500', '^DJI': 'Dow Jones', '^N225': 'Nikkei 225', '^HSI': 'Hang Seng',
  'GC=F': 'Gold (USD/oz)', 'SI=F': 'Silver (USD/oz)', 'BZ=F': 'Brent crude (USD/bbl)', 'USDINR=X': 'USD/INR',
  'NIFTYBEES.NS': 'Nippon India Nifty 50 BeES (ETF)', 'GOLDBEES.NS': 'Nippon India Gold BeES (ETF)', 'SILVERBEES.NS': 'Nippon India Silver BeES (ETF)',
};
const BY_SYMBOL = new Map([...NIFTY50, ...NIFTY_NEXT].map((s) => [s.symbol, s]));  // NIFTY_NEXT: 'rising stars' universe (see niftyNext.ts)
export const refStock = (symbol: string): RefStock | undefined => BY_SYMBOL.get(symbol.toUpperCase());
/** Curated names, indices/FX/commodities, and (new) every NSE-listed equity from the universe file (market/universe.ts). */
export const isWhitelisted = (symbol: string): boolean => BY_SYMBOL.has(symbol.toUpperCase()) || symbol in EXTRA_SYMBOLS || (/\.NS$/i.test(symbol) && isListed(symbol));
/** True for a stock we can analyse: curated or listed on NSE (not an index/FX/commodity). */
export const isEquity = (symbol: string): boolean => BY_SYMBOL.has(symbol.toUpperCase()) || (/\.NS$/i.test(symbol) && isListed(symbol));
export const displayName = (symbol: string): string => refStock(symbol)?.name ?? EXTRA_SYMBOLS[symbol] ?? universeItem(symbol)?.name ?? symbol;

/** Accept "reliance", "RELIANCE", "RELIANCE.NS", "BAJAJ-AUTO" and return the canonical symbol or null. */
export function normaliseSymbol(input: string): string | null {
  const s = decodeURIComponent(input).trim().toUpperCase();
  if (isWhitelisted(s)) return BY_SYMBOL.has(s) ? BY_SYMBOL.get(s)!.symbol : s;
  const ns = s.endsWith('.NS') ? s : s + '.NS';
  return BY_SYMBOL.has(ns) || isListed(ns) ? ns : null;
}
