import type { Profile } from '../profiles/schema.js';
import type { Asset, Customer, Order } from './types.js';

export interface OrderRef { order: Order; customer: Customer; asset?: Asset }

const STOPWORDS = new Set(['the', 'a', 'an', 'mr', 'mrs', 'ms', 'number', 'no', 'for', 'to', 'of']);

/** Minúsculas, sin puntuación ni posesivos, sin palabras vacías. */
export function normalize(text: string, extraStopwords: string[] = []): string[] {
  const extra = new Set(extraStopwords.map(w => w.toLowerCase()));
  return text
    .toLowerCase()
    .replace(/['']s\b/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0 && !STOPWORDS.has(t) && !extra.has(t));
}

/** Distancia de edición con corte en 1: solo nos interesa "igual" o "a un error de distancia". */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function matches(queryToken: string, target: string[]): boolean {
  return target.some(t => t === queryToken || (queryToken.length >= 5 && withinOneEdit(queryToken, t)));
}

/** Fracción de tokens de la consulta que aparecen en el texto. 0 si la consulta queda vacía. */
export function tokenScore(query: string, haystack: string): number {
  const q = normalize(query);
  if (q.length === 0) return 0;
  const h = normalize(haystack);
  return q.filter(token => matches(token, h)).length / q.length;
}

export function resolveOrder(query: string, candidates: OrderRef[], profile: Profile):
  | { kind: 'one'; ref: OrderRef } | { kind: 'none' } | { kind: 'ambiguous'; refs: OrderRef[] } {
  const nouns = [profile.nouns.order, profile.nouns.orders].flatMap(n => n.split(/\s+/));
  const tokens = normalize(query, nouns);
  if (tokens.length === 0) return { kind: 'none' };

  const asNumber = tokens.find(t => /^\d+$/.test(t));
  if (asNumber) {
    const hit = candidates.find(c => c.order.number === Number(asNumber));
    if (hit) return { kind: 'one', ref: hit };
  }

  const haystack = (c: OrderRef): string => [
    c.customer.name, c.asset?.spokenLabel ?? '', String(c.asset?.fields.plate ?? ''),
    ...Object.values(c.order.fields), c.order.description ?? ''
  ].join(' ');

  const scored = candidates
    .map(ref => ({ ref, score: tokenScore(tokens.join(' '), haystack(ref)) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < 0.5) return { kind: 'none' };

  const tied = scored.filter(s => best.score - s.score <= 0.15);
  if (tied.length > 1) return { kind: 'ambiguous', refs: tied.slice(0, 5).map(s => s.ref) };
  return { kind: 'one', ref: best.ref };
}
