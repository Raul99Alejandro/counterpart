import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { findItem, planReorder } from '../domain/inventory.js';
import { say } from '../speech/say.js';
import { itemQueryInput, toolSpecs } from './specs.js';
import { fail, ok, type ToolContext } from './context.js';
import type { PurchaseOrder } from '../domain/types.js';

const output = z.object({
  ordered: z.array(z.object({ itemId: z.string(), name: z.string(), qty: z.number() })),
  skipped: z.array(z.object({ itemId: z.string(), name: z.string() })),
  purchaseOrderIds: z.array(z.string())
});

export function registerReorder(server: McpServer, ctx: ToolContext): void {
  const spec = toolSpecs(ctx.profile).reorder;

  server.registerTool(
    spec.name,
    {
      title: spec.title, description: spec.description,
      inputSchema: itemQueryInput(ctx.profile), outputSchema: output,
      annotations: { idempotentHint: true }
    },
    async (args: { item?: string }) => {
      const [items, orders, openPOs] = await Promise.all([
        ctx.store.listItems(ctx.business.id),
        ctx.store.listOrders(ctx.business.id),
        ctx.store.listOpenPurchaseOrders(ctx.business.id)
      ]);

      let only;
      if (args.item) {
        const match = findItem(args.item, items);
        if (match.kind === 'none') return fail(say.unknownItem(ctx.profile, args.item, match.suggestions));
        if (match.kind === 'ambiguous') return fail(`Did you mean ${say.list(match.candidates.map(c => c.name))}?`);
        only = match.item;
      }

      const open = orders.filter(o => o.stage !== ctx.profile.closedStage);
      const plan = planReorder(items, open, openPOs, only);
      const byId = new Map(items.map(i => [i.id, i]));

      const purchaseOrders: PurchaseOrder[] = plan.purchaseOrders.map(po => ({
        id: ctx.newId('po'), supplierId: po.supplierId, lines: po.lines,
        status: 'open', createdAt: ctx.now().toISOString()
      }));
      if (purchaseOrders.length > 0) await ctx.store.putPurchaseOrders(ctx.business.id, purchaseOrders);

      const ordered = plan.purchaseOrders.flatMap(po => po.lines.map(l => ({
        itemId: l.itemId, name: byId.get(l.itemId)?.name ?? l.itemId, qty: l.qty
      })));
      const skippedNames = plan.skipped.map(i => i.name);

      const parts: string[] = [];
      if (ordered.length > 0) parts.push(`Ordered ${say.list(ordered.map(o => `${o.qty} ${o.name}`))}.`);
      if (skippedNames.length > 0) parts.push(`${say.list(skippedNames)} ${skippedNames.length === 1 ? 'is' : 'are'} already on order.`);
      if (parts.length === 0) parts.push('Nothing needs reordering right now.');

      return ok(parts.join(' '), {
        ordered,
        skipped: plan.skipped.map(i => ({ itemId: i.id, name: i.name })),
        purchaseOrderIds: purchaseOrders.map(po => po.id)
      });
    }
  );
}
