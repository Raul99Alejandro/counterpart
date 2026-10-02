import type { Store } from '../store/store.js';

/** A person needs longer than this to hear the amount and answer; a model confirming in the same turn does not. */
export const MIN_CONFIRM_MS = 4000;
/** A question older than this is asked again: the owner has moved on. */
export const CONFIRM_TTL_MS = 10 * 60 * 1000;

interface Pending { totalCents: number; method: string; at: number }

/**
 * Close-outs waiting for the owner's yes. Kept per store, so every MCP session and the demo's in-process
 * sessions of one deployment share them, and tests with their own store never see each other's.
 */
const byStore = new WeakMap<Store, Map<string, Pending>>();

function pendingFor(store: Store): Map<string, Pending> {
  let map = byStore.get(store);
  if (!map) { map = new Map(); byStore.set(store, map); }
  return map;
}

/** Records that the amount was read back for this order and payment method. */
export function askToConfirm(store: Store, key: string, totalCents: number, method: string, now: Date): void {
  pendingFor(store).set(key, { totalCents, method, at: now.getTime() });
}

/**
 * True when this yes answers a question asked for the same total and method, in an earlier turn, and
 * recently enough to still be about it. The question is used up either way. When the caller knows when the
 * user's turn began, "earlier turn" is exact; otherwise a person needs at least MIN_CONFIRM_MS to answer.
 */
export function takeConfirmation(
  store: Store, key: string, totalCents: number, method: string, now: Date, turnStartedAt?: number
): boolean {
  const map = pendingFor(store);
  const pending = map.get(key);
  if (!pending) return false;
  const age = now.getTime() - pending.at;
  const earlierTurn = turnStartedAt !== undefined ? pending.at < turnStartedAt : age >= MIN_CONFIRM_MS;
  if (!earlierTurn) return false;
  map.delete(key);
  return pending.totalCents === totalCents && pending.method === method && age <= CONFIRM_TTL_MS;
}
