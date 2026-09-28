import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { businessToday } from '../domain/dates.js';
import { closeOut } from '../domain/orders.js';
import { resolveOrder } from '../domain/resolver.js';
import { say } from '../speech/say.js';
import { ConflictError } from '../store/store.js';
import { closeOutInput, toolSpecs } from './specs.js';
import { fail, guard, loadRefs, ok, stageLabel, type ToolContext } from './context.js';
import type { Payment } from '../domain/types.js';

const output = z.object({
  orderId: z.string(), number: z.number(), amountCents: z.number(),
  method: z.string(), alreadyClosed: z.boolean()
});

export function registerCloseOut(server: McpServer, ctx: ToolContext): void {
  const spec = toolSpecs(ctx.profile).closeOut;

  server.registerTool(
    spec.name,
    {
      title: spec.title, description: spec.description,
      inputSchema: closeOutInput(ctx.profile), outputSchema: output,
      annotations: { idempotentHint: true }
    },
    guard(async (args: Record<string, unknown>) => {
      const orderQuery = String(args.order);
      const paymentMethod = args.paymentMethod as Payment['method'];

      const today = businessToday(ctx.business.timezone, ctx.now());
      const refs = await loadRefs(ctx);
      // Candidatas: abiertas, más las cerradas hoy en la fecha del negocio, para que repetir el cierre sea idempotente.
      const closedToday = (closedAt: string | undefined): boolean =>
        closedAt !== undefined && businessToday(ctx.business.timezone, new Date(closedAt)) === today;
      const candidates = refs.filter(r =>
        r.order.stage !== ctx.profile.closedStage || closedToday(r.order.closedAt));

      const found = resolveOrder(orderQuery, candidates, ctx.profile);
      if (found.kind === 'none') {
        return fail(say.notFound(ctx.profile, orderQuery, candidates.filter(c => c.order.stage !== ctx.profile.closedStage)));
      }
      if (found.kind === 'ambiguous') return fail(say.ambiguous(ctx.profile, found.refs));

      const order = found.ref.order;

      if (order.stage === ctx.profile.closedStage) {
        // El método que quedó registrado, no el que se pidió ahora.
        const paidOn = businessToday(ctx.business.timezone, new Date(order.closedAt ?? ctx.now()));
        const recorded = (await ctx.store.listPayments(ctx.business.id, paidOn, paidOn)).find(p => p.orderId === order.id);
        return ok(say.alreadyClosed(ctx.profile, found.ref, order.totalCents), {
          orderId: order.id, number: order.number, amountCents: order.totalCents,
          method: recorded?.method ?? paymentMethod, alreadyClosed: true
        });
      }

      const result = closeOut(order, paymentMethod, ctx.profile, ctx.now(), ctx.newId('pay'), today);
      if (!result.ok) {
        return fail(`${say.orderName(ctx.profile, order.number)} is still ${stageLabel(ctx.profile, order.stage)}. `
          + `Move it to ${stageLabel(ctx.profile, ctx.profile.closeFrom[0]!)} first.`);
      }

      try {
        await ctx.store.commitClose(ctx.business.id, result.order, result.payment);
      } catch (err) {
        if (err instanceof ConflictError) return fail(say.conflict(ctx.profile, result.order.number));
        throw err;
      }

      return ok(say.closed(ctx.profile, { ...found.ref, order: result.order }, result.payment), {
        orderId: result.order.id, number: result.order.number,
        amountCents: result.payment.amountCents, method: result.payment.method, alreadyClosed: false
      });
    })
  );
}
