import type { Profile } from '../profiles/schema.js';
import type { Asset, Customer, Order } from './types.js';

export interface OrderRef { order: Order; customer: Customer; asset?: Asset }

const STOPWORDS = new Set(['the', 'a', 'an', 'mr', 'mrs', 'ms', 'number', 'no', 'for', 'to', 'of']);

/**
 * Lowercase, no punctuation or possessives, no stopwords. Dashes and letter-digit boundaries
 * split words: Alexa transcribes "CX-5" as "CX 5" and the agent sometimes passes it as
 * "CX5", and all three forms must yield the same tokens.
 */
export function normalize(text: string, extraStopwords: string[] = []): string[] {
  const extra = new Set(extraStopwords.map(w => w.toLowerCase()));
  return text
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/([a-z])(?=\d)|(\d)(?=[a-z])/g, '$1$2 ')
    .split(/\s+/)
    .filter(t => t.length > 0 && !STOPWORDS.has(t) && !extra.has(t));
}

/** Edit distance capped at 1: we only care about "equal" or "one typo away". */
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

/** A word and its -s or -es plural count as the same ("box" and "boxes"). */
function samePlural(a: string, b: string): boolean {
  return a === `${b}s` || b === `${a}s` || a === `${b}es` || b === `${a}es`;
}

function matches(queryToken: string, target: string[]): boolean {
  return target.some(t =>
    t === queryToken || samePlural(queryToken, t) || (queryToken.length >= 5 && withinOneEdit(queryToken, t)));
}

/** Fraction of query tokens that appear in the text. 0 if the query ends up empty. */
export function tokenScore(query: string, haystack: string): number {
  const q = normalize(query);
  if (q.length === 0) return 0;
  const h = normalize(haystack);
  return q.filter(token => matches(token, h)).length / q.length;
}

/**
 * Query tokens without stopwords or the profile's nouns: "the work order" does not
 * tell one order from another in a repair shop, just like "cake" in a bakery.
 */
export function normalizeQuery(query: string, profile: Profile): string[] {
  const nouns = [profile.nouns.order, profile.nouns.orders].flatMap(n => n.split(/\s+/));
  return normalize(query, nouns);
}

/** All the text an order can be referred to by when speaking (§7.5). */
export function orderHaystack(ref: OrderRef): string {
  return [
    ref.customer.name, ref.asset?.spokenLabel ?? '',
    ...Object.values(ref.asset?.fields ?? {}).map(String),
    ...Object.values(ref.order.fields), ref.order.description ?? ''
  ].join(' ');
}

/** Score of an order against already-normalized tokens. One rule for both resolving and searching. */
export function scoreOrder(tokens: string[], ref: OrderRef): number {
  return tokenScore(tokens.join(' '), orderHaystack(ref));
}

/** Shared threshold: below this it does not count as a match. */
export const MATCH_THRESHOLD = 0.5;

/** Candidates within this distance of the best one count as a tie. */
export const TIE_MARGIN = 0.15;

/** One rule for choosing among scored candidates: orders and items use the same one (carryover §5). */
export function pickBest<T>(scored: Array<{ value: T; score: number }>):
  | { kind: 'one'; value: T } | { kind: 'none' } | { kind: 'ambiguous'; values: T[] } {
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const best = sorted[0];
  if (!best || best.score < MATCH_THRESHOLD) return { kind: 'none' };
  const tied = sorted.filter(s => best.score - s.score <= TIE_MARGIN);
  if (tied.length > 1) return { kind: 'ambiguous', values: tied.slice(0, 5).map(s => s.value) };
  return { kind: 'one', value: best.value };
}

export function resolveOrder(query: string, candidates: OrderRef[], profile: Profile):
  | { kind: 'one'; ref: OrderRef } | { kind: 'none' } | { kind: 'ambiguous'; refs: OrderRef[] } {
  const tokens = normalizeQuery(query, profile);
  if (tokens.length === 0) return { kind: 'none' };

  // The number shortcut applies only when the number is the whole reference ("order 44"): inside a
  // model name ("CX-5", "F-150") the number is part of the name, and order 5 is not the CX-5.
  const asNumber = tokens.find(t => /^\d+$/.test(t));
  const byNumber = asNumber ? candidates.find(c => c.order.number === Number(asNumber)) : undefined;
  if (byNumber && tokens.length === 1) return { kind: 'one', ref: byNumber };

  const picked = pickBest(candidates.map(ref => ({ value: ref, score: scoreOrder(tokens, ref) })));
  if (picked.kind === 'none') return byNumber ? { kind: 'one', ref: byNumber } : { kind: 'none' };
  if (picked.kind === 'ambiguous') return { kind: 'ambiguous', refs: picked.values };
  return { kind: 'one', ref: picked.value };
}
