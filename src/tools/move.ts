import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { moveStage } from '../domain/orders.js';
import { resolveOrder } from '../domain/resolver.js';
import { say } from '../speech/say.js';
import { ConflictError } from '../store/store.js';
import { moveInput, toolSpecs } from './specs.js';
import { fail, guard, loadRefs, ok, openOnly, stageLabel, type ToolContext } from './context.js';

const output = z.object({ orderId: z.string(), number: z.number(), stage: z.string(), stageLabel: z.string() });

export function registerMove(server: McpServer, ctx: ToolContext): void {
  const spec = toolSpecs(ctx.profile).move;

  server.registerTool(
    spec.name,
    {
      title: spec.title, description: spec.description,
      inputSchema: moveInput(ctx.profile), outputSchema: output,
      annotations: { idempotentHint: true }
    },
    guard(async (args: Record<string, unknown>) => {
      const order = String(args.order);
      const stage = String(args.stage);

      const refs = await loadRefs(ctx);
      const open = openOnly(ctx, refs);
      const found = resolveOrder(order, open, ctx.profile);
      if (found.kind === 'none') return fail(say.notFound(ctx.profile, order, open));
      if (found.kind === 'ambiguous') return fail(say.ambiguous(ctx.profile, found.refs));

      const moved = moveStage(found.ref.order, stage, ctx.profile, ctx.now());
      if (!moved.ok) {
        if (moved.reason === 'use_close_out') {
          return fail(`To finish ${say.orderName(ctx.profile, found.ref.order.number)}, close it out instead.`);
        }
        if (moved.reason === 'closed') {
          return fail(`${say.orderName(ctx.profile, found.ref.order.number)} is already closed, so it can't be moved.`);
        }
        return fail(`I don't know the stage "${stage}".`);
      }

      try {
        await ctx.store.putOrder(ctx.business.id, moved.order);
      } catch (err) {
        if (err instanceof ConflictError) return fail(say.conflict(ctx.profile, moved.order.number));
        throw err;
      }
      const label = stageLabel(ctx.profile, stage);
      const ref = { ...found.ref, order: moved.order };
      return ok(say.moved(ctx.profile, ref, label), {
        orderId: moved.order.id, number: moved.order.number, stage: moved.order.stage, stageLabel: label
      });
    })
  );
}
