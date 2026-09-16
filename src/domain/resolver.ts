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

/**
 * Tokens de la consulta sin palabras vacías ni los sustantivos del perfil: "the work order"
 * no distingue una orden de otra en un taller, igual que "cake" en una pastelería.
 */
export function normalizeQuery(query: string, profile: Profile): string[] {
  const nouns = [profile.nouns.order, profile.nouns.orders].flatMap(n => n.split(/\s+/));
  return normalize(query, nouns);
}

/** Todo el texto por el que se puede nombrar una orden hablando (§7.5). */
export function orderHaystack(ref: OrderRef): string {
  return [
    ref.customer.name, ref.asset?.spokenLabel ?? '',
    ...Object.values(ref.asset?.fields ?? {}).map(String),
    ...Object.values(ref.order.fields), ref.order.description ?? ''
  ].join(' ');
}

/** Puntaje de una orden contra tokens ya normalizados. Un solo criterio para resolver y para buscar. */
export function scoreOrder(tokens: string[], ref: OrderRef): number {
  return tokenScore(tokens.join(' '), orderHaystack(ref));
}

/** Umbral compartido: por debajo de esto no se considera coincidencia. */
export const MATCH_THRESHOLD = 0.5;

export function resolveOrder(query: string, candidates: OrderRef[], profile: Profile):
  | { kind: 'one'; ref: OrderRef } | { kind: 'none' } | { kind: 'ambiguous'; refs: OrderRef[] } {
  const tokens = normalizeQuery(query, profile);
  if (tokens.length === 0) return { kind: 'none' };

  const asNumber = tokens.find(t => /^\d+$/.test(t));
  if (asNumber) {
    const hit = candidates.find(c => c.order.number === Number(asNumber));
    if (hit) return { kind: 'one', ref: hit };
  }

  const scored = candidates
    .map(ref => ({ ref, score: scoreOrder(tokens, ref) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < MATCH_THRESHOLD) return { kind: 'none' };

  const tied = scored.filter(s => best.score - s.score <= 0.15);
  if (tied.length > 1) return { kind: 'ambiguous', refs: tied.slice(0, 5).map(s => s.ref) };
  return { kind: 'one', ref: best.ref };
}
