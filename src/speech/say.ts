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

/** A catalog name mid-sentence: "Front brake pads" → "front brake pads"; acronyms such as "ABS sensor" stay. */
function itemName(name: string): string {
  return /^[A-Z][a-z]/.test(name) ? name[0]!.toLowerCase() + name.slice(1) : name;
}

function date(dateIso: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC'
  });
  return formatter.format(new Date(`${dateIso}T12:00:00Z`));
}

export const say = {
  list,
  date,

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
    const due = ref.order.dueOn ? ` It's due ${say.date(ref.order.dueOn)}.` : '';
    return `Opened ${say.orderPhrase(profile, ref)}.${due}`;
  },

  moved(profile: Profile, ref: OrderRef, stageLabel: string): string {
    // "work order 41, Dana Lee's blue sedan" as the subject needs the closing comma.
    const subject = say.orderPhrase(profile, ref);
    return `${subject}${subject.includes(', ') ? ',' : ''} is now ${stageLabel}.`;
  },

  lineAdded(profile: Profile, ref: OrderRef, line: OrderLine, totalCents: number): string {
    const orderName = say.orderName(profile, ref.order.number);
    const total = `The total is now ${formatMoney(totalCents)}.`;
    const what = line.quantity === 1 ? itemName(line.name) : `${line.quantity} ${itemName(line.name)}`;
    if (line.backordered === 0) return `Added ${what} to ${orderName}. ${total}`;

    const inStock = line.quantity - line.backordered;
    const stock = inStock <= 0 ? 'none were in stock' : `only ${inStock} ${inStock === 1 ? 'was' : 'were'} in stock`;
    return `Added ${what} to ${orderName}, but ${stock}, `
      + `so ${line.backordered} ${line.backordered === 1 ? 'is' : 'are'} backordered. ${total}`;
  },

  confirmClose(profile: Profile, ref: OrderRef, amountCents: number, method: Payment['method']): string {
    const subject = say.orderPhrase(profile, ref);
    return `${subject}${subject.includes(', ') ? ',' : ''} comes to ${formatMoney(amountCents)}. Should I close it out by ${method}?`;
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
    const which = names.length === 1 ? `The only open one is ${names[0]}.` : `Open ones are ${list(names)}.`;
    return `I couldn't find an open ${profile.nouns.order} for "${query}". ${which}`;
  },

  ambiguous(profile: Profile, refs: OrderRef[]): string {
    const count = COUNT_WORDS[refs.length] ?? String(refs.length);
    return `I found ${count}: ${list(refs.map(r => say.orderPhrase(profile, r)))}. Which one?`;
  },

  unknownItem(profile: Profile, query: string, suggestions: CatalogItem[]): string {
    if (suggestions.length === 0) return `I don't have "${query}" in the ${profile.nouns.items} list.`;
    return `I don't have "${query}" in the ${profile.nouns.items} list. `
      + `Closest matches are ${list(suggestions.map(s => s.name))}.`;
  },

  // Version clash on write: another call changed the same record first.
  conflict(profile: Profile, orderNumber?: number): string {
    const what = orderNumber !== undefined ? say.orderName(profile, orderNumber) : `the ${profile.nouns.items} list`;
    return `Someone else just updated ${what}. Please try again.`;
  }
};
