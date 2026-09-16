import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { businessToday } from '../domain/dates.js';
import { formatMoney } from '../domain/money.js';
import { buildSnapshot } from '../domain/reports.js';
import { say } from '../speech/say.js';
import { toolSpecs } from './specs.js';
import { guard, loadRefs, ok, type ToolContext } from './context.js';

const output = z.object({
  todayRevenueCents: z.number(),
  sameDayLastWeekCents: z.number(),
  byStage: z.array(z.object({ stage: z.string(), label: z.string(), count: z.number() })),
  dueToday: z.array(z.object({ orderId: z.string(), number: z.number(), label: z.string() })),
  low: z.array(z.object({ itemId: z.string(), name: z.string(), onHand: z.number(), reorderPoint: z.number() }))
});

export function registerSnapshot(server: McpServer, ctx: ToolContext): void {
  const spec = toolSpecs(ctx.profile).snapshot;

  server.registerTool(
    spec.name,
    {
      title: spec.title, description: spec.description,
      inputSchema: z.object({}), outputSchema: output,
      annotations: { readOnlyHint: true, idempotentHint: true }
    },
    guard(async () => {
      const today = businessToday(ctx.business.timezone, ctx.now());
      const weekAgo = new Date(ctx.now().getTime() - 7 * 24 * 3600 * 1000);
      const [refs, items, payments] = await Promise.all([
        loadRefs(ctx),
        ctx.store.listItems(ctx.business.id),
        ctx.store.listPayments(ctx.business.id, businessToday(ctx.business.timezone, weekAgo), today)
      ]);

      const snapshot = buildSnapshot({ profile: ctx.profile, refs, items, payments, today });
      const stages = snapshot.byStage.map(s => `${s.count} ${s.label}`);
      const text = `Today you've taken in ${formatMoney(snapshot.todayRevenueCents)}. `
        + (stages.length > 0 ? `You have ${say.list(stages)}. ` : `No open ${ctx.profile.nouns.orders}. `)
        + (snapshot.low.length > 0 ? `${snapshot.low.length} ${ctx.profile.nouns.items} are running low.` : 'Stock looks fine.');

      return ok(text, snapshot);
    })
  );
}
