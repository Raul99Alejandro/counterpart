import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { findItem, lowStock } from '../domain/inventory.js';
import type { CatalogItem } from '../domain/types.js';
import { say } from '../speech/say.js';
import { itemQueryInput, toolSpecs } from './specs.js';
import { fail, guard, ok, type ToolContext, spoken } from './context.js';

const output = spoken({
  items: z.array(z.object({
    itemId: z.string(), name: z.string(), unit: z.string(),
    onHand: z.number(), reorderPoint: z.number(), low: z.boolean()
  }))
});

export function registerStock(server: McpServer, ctx: ToolContext): void {
  const spec = toolSpecs(ctx.profile).stock;

  server.registerTool(
    spec.name,
    {
      title: spec.title, description: spec.description,
      inputSchema: itemQueryInput(ctx.profile), outputSchema: output,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    guard(async (args: { item?: string }) => {
      const items = await ctx.store.listItems(ctx.business.id);

      if (!args.item) {
        const low = lowStock(items);
        const text = low.length === 0
          ? `Nothing is running low.`
          : `${low.length} ${ctx.profile.nouns.items} running low: ${say.list(low.map(i => `${i.name}, ${i.onHand} left`))}.`;
        return ok(text, { items: low.map(view) });
      }

      const found = findItem(args.item, items);
      if (found.kind === 'none') return fail(say.unknownItem(ctx.profile, args.item, found.suggestions));
      if (found.kind === 'ambiguous') {
        return fail(`Did you mean ${say.list(found.candidates.map(c => c.name))}?`);
      }

      const item = found.item;
      const text = item.stocked
        ? `${item.onHand} ${item.name} on hand.${item.onHand <= item.reorderPoint ? ' That is at or below the reorder point.' : ''}`
        : notCounted(item);
      return ok(text, { items: [view(item)] });
    })
  );
}

/** Why there is nothing to count: it depends on the item kind, not the business. */
function notCounted(item: CatalogItem): string {
  if (item.kind === 'labor') return `${item.name} is a service, so there is nothing to count.`;
  if (item.kind === 'product') return `${item.name} is made to order, so there is nothing to count.`;
  return `${item.name} isn't stocked, so there is nothing to count.`;
}

function view(i: { id: string; name: string; unit: string; onHand: number; reorderPoint: number; stocked: boolean }) {
  return {
    itemId: i.id, name: i.name, unit: i.unit, onHand: i.onHand,
    reorderPoint: i.reorderPoint, low: i.stocked && i.onHand <= i.reorderPoint
  };
}
