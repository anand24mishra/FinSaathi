import type { Term } from '../../../shared/contract';
import { TERMS } from './educationData';

const norm = (s: string) => s.toLowerCase().normalize('NFKC').trim();

export const listCategories = (): string[] => [...new Set(TERMS.map((t) => t.category))];

export function searchTerms(q?: string, category?: string): Term[] {
  const cat = category ? norm(category) : '';
  const query = q ? norm(q) : '';
  let out = TERMS.filter((t) => !cat || t.category === cat);
  if (query) {
    const score = (t: Term): number => {
      const names = [t.id, t.term.en, t.term.hi].map(norm);
      if (names.some((n) => n === query)) return 3;
      if (names.some((n) => n.includes(query))) return 2;
      if ([t.simple.en, t.simple.hi, t.example.en, t.example.hi].some((x) => norm(x).includes(query))) return 1;
      return 0;
    };
    out = out.map((t) => ({ t, s: score(t) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.t);
  }
  return out;
}

export const getTerm = (id: string): Term | null => TERMS.find((t) => t.id === id) ?? null;
