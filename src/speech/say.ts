import { formatMoney } from '../domain/money.js';
import { refLabel } from '../domain/reports.js';
import type { OrderRef } from '../domain/resolver.js';
import type { CatalogItem, OrderLine, Payment } from '../domain/types.js';
import type { Profile } from '../profiles/schema.js';

const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five'];

function list(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

export const say = {
  list,

  orderName(profile: Profile, number: number): string {
    return `${profile.nouns.order} ${number}`;
  },

  orderPhrase(profile: Profile, ref: OrderRef): string {
    const label = refLabel(ref);
    return label === ref.customer.name
      ? `${say.orderName(profile, ref.order.number)} for ${ref.customer.name}`
      : `${say.orderName(profile, ref.order.number)}, ${ref.customer.name}'s ${label}`;
  },

  opened(profile: Profile, ref: OrderRef): string {
    const due = ref.order.dueOn ? ` It's due ${ref.order.dueOn}.` : '';
    return `Opened ${say.orderPhrase(profile, ref)}.${due}`;
  },

  moved(profile: Profile, ref: OrderRef, stageLabel: string): string {
    return `${say.orderPhrase(profile, ref)} is now ${stageLabel}.`;
  },

  lineAdded(profile: Profile, ref: OrderRef, line: OrderLine, totalCents: number): string {
    const backorder = line.backordered > 0
      ? ` Only ${line.quantity - line.backordered} in stock, so ${line.backordered} is backordered.`
      : '';
    return `Added ${line.quantity} ${line.name} to ${say.orderName(profile, ref.order.number)}. `
      + `The total is now ${formatMoney(totalCents)}.${backorder}`;
  },

  closed(profile: Profile, ref: OrderRef, payment: Payment): string {
    return `Closed ${say.orderPhrase(profile, ref)}. They paid ${formatMoney(payment.amountCents)} by ${payment.method}.`;
  },

  alreadyClosed(profile: Profile, ref: OrderRef, amountCents: number): string {
    return `${say.orderName(profile, ref.order.number)} was already closed out for ${formatMoney(amountCents)}.`;
  },

  notFound(profile: Profile, query: string, open: OrderRef[]): string {
    if (open.length === 0) return `I couldn't find "${query}", and there are no open ${profile.nouns.orders} right now.`;
    const names = open.slice(0, 5).map(r => say.orderPhrase(profile, r));
    return `I couldn't find an open ${profile.nouns.order} for "${query}". Open ones are ${list(names)}.`;
  },

  ambiguous(profile: Profile, refs: OrderRef[]): string {
    const count = COUNT_WORDS[refs.length] ?? String(refs.length);
    return `I found ${count}: ${list(refs.map(r => say.orderPhrase(profile, r)))}. Which one?`;
  },

  unknownItem(profile: Profile, query: string, suggestions: CatalogItem[]): string {
    if (suggestions.length === 0) return `I don't have "${query}" in the ${profile.nouns.items} list.`;
    return `I don't have "${query}" in the ${profile.nouns.items} list. `
      + `Closest matches are ${list(suggestions.map(s => s.name))}.`;
  }
};
