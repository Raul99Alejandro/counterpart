import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { resolveDue } from '../domain/dates.js';
import { refLabel } from '../domain/reports.js';
import { MATCH_THRESHOLD, normalizeQuery, scoreOrder } from '../domain/resolver.js';
import { say } from '../speech/say.js';
import { findInput, toolSpecs } from './specs.js';
import { UI } from './ui-assets.js';
import { guard, loadRefs, ok, openOnly, stageLabel, type ToolContext, spoken } from './context.js';

const output = spoken({
  /** What the cards on screen show, e.g. "Work orders waiting on parts". */
  heading: z.string(),
  total: z.number(),
  orders: z.array(z.object({
    orderId: z.string(), number: z.number(), label: z.string(), customer: z.string(),
    stage: z.string(), stageLabel: z.string(), dueOn: z.string().optional(), totalCents: z.number()
  }))
});

export function registerFind(server: McpServer, ctx: ToolContext): void {
  const spec = toolSpecs(ctx.profile).find;

  server.registerTool(
    spec.name,
    {
      title: spec.title, description: spec.description,
      inputSchema: findInput(ctx.profile), outputSchema: output,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: UI.orders } }
    },
    guard(async (args: { query?: string; stage?: string; due?: string }) => {
      let refs = openOnly(ctx, await loadRefs(ctx));
      const orders = ctx.profile.nouns.orders;
      let heading = `Open ${orders}`;

      if (args.stage) {
        // "Work orders waiting on parts", but "Work orders: estimate" for a one-word stage.
        const label = stageLabel(ctx.profile, args.stage);
        heading = label.includes(' ') ? `${capitalize(orders)} ${label}` : `${capitalize(orders)}: ${label}`;
      }
      if (args.stage) refs = refs.filter(r => r.order.stage === args.stage);
      if (args.due) {
        const dueOn = resolveDue(args.due, ctx.business.timezone, ctx.now());
        refs = dueOn ? refs.filter(r => r.order.dueOn === dueOn) : [];
        heading = dueOn ? `${capitalize(orders)} due ${say.date(dueOn)}` : `${capitalize(orders)} due ${args.due}`;
      }
      if (args.query) {
        // Same rule as spoken references: same searched text, same ignored nouns.
        const tokens = normalizeQuery(args.query, ctx.profile);
        refs = tokens.length === 0 ? [] : refs.filter(r => scoreOrder(tokens, r) >= MATCH_THRESHOLD);
        heading = `${capitalize(orders)} matching "${args.query}"`;
      }

      const listed = refs.slice(0, 10).map(r => ({
        orderId: r.order.id, number: r.order.number, label: refLabel(r), customer: r.customer.name,
        stage: r.order.stage, stageLabel: stageLabel(ctx.profile, r.order.stage),
        dueOn: r.order.dueOn, totalCents: r.order.totalCents
      }));

      const text = refs.length === 0
        ? `I don't see any ${ctx.profile.nouns.orders} matching that.`
        : `${refs.length} ${refs.length === 1 ? ctx.profile.nouns.order : ctx.profile.nouns.orders}: `
          + `${say.list(refs.slice(0, 5).map(r => say.orderPhrase(ctx.profile, r)))}.`;

      return ok(text, { heading, total: refs.length, orders: listed });
    })
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
