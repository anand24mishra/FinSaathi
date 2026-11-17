// Google News RSS (public RSS; headlines only, we link out to the publisher). Local prototype use.
import { XMLParser } from 'fast-xml-parser';
import { getText, Limiter } from '../http';
import type { Lang } from '../../../../shared/contract';

const limiter = new Limiter(3);
export const NEWS_SOURCE = 'Google News RSS';
export interface RawNews { title: string; url: string; publishedAt: string; publisher: string; lang: Lang }

export function parseRss(xml: string, lang: Lang): RawNews[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text' });
  const doc = parser.parse(xml);
  let items = doc?.rss?.channel?.item ?? [];
  if (!Array.isArray(items)) items = [items];
  const out: RawNews[] = [];
  for (const it of items) {
    let title = String(it.title ?? '').trim();
    const src = typeof it.source === 'object' ? String(it.source['#text'] ?? '') : String(it.source ?? '');
    let publisher = src.trim();
    // Google appends " - Publisher" to the title
    const m = title.match(/^(.*)\s[-–]\s([^-–]{2,60})$/);
    if (m) { title = m[1].trim(); if (!publisher) publisher = m[2].trim(); }
    const d = new Date(it.pubDate ?? '');
    if (!title || !it.link || isNaN(d.getTime())) continue;
    out.push({ title, url: String(it.link), publishedAt: d.toISOString(), publisher: publisher || 'Google News', lang });
  }
  return out;
}

export async function fetchNewsRss(query: string, lang: Lang): Promise<RawNews[]> {
  const loc = lang === 'hi' ? 'hl=hi&gl=IN&ceid=IN:hi' : 'hl=en-IN&gl=IN&ceid=IN:en';
  const xml = await getText(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&${loc}`, { headers: { 'User-Agent': 'Mozilla/5.0' }, limiter });
  return parseRss(xml, lang);
}
