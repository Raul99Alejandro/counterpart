import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { resolveDue } from '../domain/dates.js';
import { refLabel } from '../domain/reports.js';
import { tokenScore } from '../domain/resolver.js';
import { say } from '../speech/say.js';
import { findInput, toolSpecs } from './specs.js';
import { guard, loadRefs, ok, openOnly, stageLabel, type ToolContext } from './context.js';

const output = z.object({
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
      annotations: { readOnlyHint: true, idempotentHint: true }
    },
    guard(async (args: { query?: string; stage?: string; due?: string }) => {
      let refs = openOnly(ctx, await loadRefs(ctx));

      if (args.stage) refs = refs.filter(r => r.order.stage === args.stage);
      if (args.due) {
        const dueOn = resolveDue(args.due, ctx.business.timezone, ctx.now());
        refs = dueOn ? refs.filter(r => r.order.dueOn === dueOn) : [];
      }
      if (args.query) {
        refs = refs.filter(r => tokenScore(args.query!, `${r.customer.name} ${refLabel(r)}`) >= 0.5);
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

      return ok(text, { total: refs.length, orders: listed });
    })
  );
}
