import type { McpServer } from '@modelcontextprotocol/server';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import * as z from 'zod/v4';
import { businessToday, shiftDays } from '../domain/dates.js';
import { formatMoney } from '../domain/money.js';
import { buildSnapshot } from '../domain/reports.js';
import { say } from '../speech/say.js';
import { toolSpecs } from './specs.js';
import { guard, loadRefs, ok, type ToolContext, spoken } from './context.js';
import { UI } from './ui-assets.js';

const output = spoken({
  todayRevenueCents: z.number(),
  sameDayLastWeekCents: z.number(),
  byStage: z.array(z.object({ stage: z.string(), label: z.string(), count: z.number() })),
  dueToday: z.array(z.object({ orderId: z.string(), number: z.number(), label: z.string() })),
  low: z.array(z.object({ itemId: z.string(), name: z.string(), onHand: z.number(), reorderPoint: z.number() }))
});

export function registerSnapshot(server: McpServer, ctx: ToolContext): void {
  const spec = toolSpecs(ctx.profile).snapshot;

  registerAppTool(
    server,
    spec.name,
    {
      title: spec.title, description: spec.description,
      inputSchema: z.object({}), outputSchema: output,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: UI.snapshot } }
    },
    guard(async () => {
      const today = businessToday(ctx.business.timezone, ctx.now());
      // In calendar dates, not by subtracting 7×24 h from the instant: in the week daylight saving
      // time ends, that subtraction lands on another day and the range misses the same day last week.
      const weekAgo = shiftDays(today, -7);
      const [refs, items, payments] = await Promise.all([
        loadRefs(ctx),
        ctx.store.listItems(ctx.business.id),
        ctx.store.listPayments(ctx.business.id, weekAgo, today)
      ]);

      const snapshot = buildSnapshot({ profile: ctx.profile, refs, items, payments, today });
      const stages = snapshot.byStage.map(s => `${s.count} ${s.label}`);
      const low = snapshot.low.length;
      const open = stages.length > 0 ? `, with ${say.list(stages)}` : `, with no open ${ctx.profile.nouns.orders}`;
      const stock = low === 0
        ? 'Stock looks fine.'
        : `${low} ${low === 1 ? ctx.profile.nouns.item : ctx.profile.nouns.items} ${low === 1 ? 'is' : 'are'} running low.`;
      const text = `Today you've taken in ${formatMoney(snapshot.todayRevenueCents)}${open}. ${stock}`;

      return ok(text, snapshot);
    })
  );
}
