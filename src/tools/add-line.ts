import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { addLineToOrder, findItem } from '../domain/inventory.js';
import { recalcTotals } from '../domain/orders.js';
import { resolveOrder } from '../domain/resolver.js';
import { say } from '../speech/say.js';
import { ConflictError } from '../store/store.js';
import { addLineInput, toolSpecs } from './specs.js';
import { fail, guard, loadRefs, ok, openOnly, type ToolContext, spoken } from './context.js';

const output = spoken({
  orderId: z.string(), number: z.number(), itemName: z.string(), quantity: z.number(),
  backordered: z.number(), totalCents: z.number()
});

export function registerAddLine(server: McpServer, ctx: ToolContext): void {
  const spec = toolSpecs(ctx.profile).addLine;

  server.registerTool(
    spec.name,
    { title: spec.title, description: spec.description, inputSchema: addLineInput(ctx.profile), outputSchema: output,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
    guard(async (args: Record<string, unknown>) => {
      const order = String(args.order);
      const item = String(args.item);

      const open = openOnly(ctx, await loadRefs(ctx));
      const found = resolveOrder(order, open, ctx.profile);
      if (found.kind === 'none') return fail(say.notFound(ctx.profile, order, open));
      if (found.kind === 'ambiguous') return fail(say.ambiguous(ctx.profile, found.refs));

      const items = await ctx.store.listItems(ctx.business.id);
      const match = findItem(item, items);
      if (match.kind === 'none') return fail(say.unknownItem(ctx.profile, item, match.suggestions));
      if (match.kind === 'ambiguous') return fail(`Did you mean ${say.list(match.candidates.map(c => c.name))}?`);

      const quantity = typeof args.quantity === 'number' ? args.quantity : 1;
      const { line, itemUpdates } = addLineToOrder(match.item, quantity, items);
      const updated = recalcTotals(
        { ...found.ref.order, lines: [...found.ref.order.lines, line] },
        ctx.business.taxRateBps
      );

      try {
        await ctx.store.commitOrderWithItems(ctx.business.id, updated, itemUpdates);
      } catch (err) {
        if (err instanceof ConflictError) return fail(say.conflict(ctx.profile, updated.number));
        throw err;
      }

      return ok(say.lineAdded(ctx.profile, found.ref, line, updated.totalCents), {
        orderId: updated.id, number: updated.number, itemName: line.name,
        quantity: line.quantity, backordered: line.backordered, totalCents: updated.totalCents
      });
    })
  );
}
