import type { Lang, Term } from '@/api/contract';

export type Segment = { text: string; termId?: string };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Splits text into plain and glossary-term segments. Latin terms match on word boundaries, Devanagari by substring. Longest term wins; each term is linked once. */
export function highlightTerms(text: string, terms: Term[], lang: Lang): Segment[] {
  if (!text) return [];
  const entries = terms
    .map((t) => ({ id: t.id, label: (t.term[lang] || '').trim() }))
    .filter((e) => e.label.length >= 2)
    .sort((a, b) => b.label.length - a.label.length);
  if (!entries.length) return [{ text }];
  const taken: { start: number; end: number; id: string }[] = [];
  const used = new Set<string>();
  for (const e of entries) {
    if (used.has(e.id)) continue;
    const latin = /^[\x00-\x7F]+$/.test(e.label);
    const re = new RegExp(latin ? `(?<![A-Za-z0-9])${escape(e.label)}(?![A-Za-z0-9])` : escape(e.label), 'gi');
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0, end = start + m[0].length;
      if (taken.some((t) => start < t.end && end > t.start)) continue;
      taken.push({ start, end, id: e.id });
      used.add(e.id);
      break;
    }
  }
  taken.sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let pos = 0;
  for (const t of taken) {
    if (t.start > pos) out.push({ text: text.slice(pos, t.start) });
    out.push({ text: text.slice(t.start, t.end), termId: t.id });
    pos = t.end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos) });
  return out;
}
