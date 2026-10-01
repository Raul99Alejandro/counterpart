import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { businessToday } from '../domain/dates.js';
import { closeOut } from '../domain/orders.js';
import { resolveOrder } from '../domain/resolver.js';
import { say } from '../speech/say.js';
import { ConflictError } from '../store/store.js';
import { closeOutInput, toolSpecs } from './specs.js';
import { fail, guard, loadRefs, ok, stageLabel, type ToolContext, spoken } from './context.js';
import type { Payment } from '../domain/types.js';
import { askToConfirm, takeConfirmation } from './confirmations.js';

/** For the model, not the person: the bridge shows it the JSON, and it kept confirming in the same turn. */
const ASK_FIRST = 'End the turn now and wait for the owner to answer. Call this tool again with confirm: true only after the owner says yes in their next turn.';

const output = spoken({
  status: z.enum(['needs_confirmation', 'closed', 'already_closed']),
  next: z.string().optional(),
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
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    guard(async (args: Record<string, unknown>) => {
      const orderQuery = String(args.order);
      const paymentMethod = args.paymentMethod as Payment['method'];
      const confirm = args.confirm === true;

      const today = businessToday(ctx.business.timezone, ctx.now());
      const refs = await loadRefs(ctx);
      // Candidates: open ones, plus those closed today in the business's date, so repeating the close-out is idempotent.
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
        // The method that was recorded, not the one requested now.
        const paidOn = businessToday(ctx.business.timezone, new Date(order.closedAt ?? ctx.now()));
        const recorded = (await ctx.store.listPayments(ctx.business.id, paidOn, paidOn)).find(p => p.orderId === order.id);
        return ok(say.alreadyClosed(ctx.profile, found.ref, order.totalCents), {
          status: 'already_closed', orderId: order.id, number: order.number, amountCents: order.totalCents,
          method: recorded?.method ?? paymentMethod, alreadyClosed: true
        });
      }

      const result = closeOut(order, paymentMethod, ctx.profile, ctx.now(), ctx.newId('pay'), today);
      if (!result.ok) {
        return fail(`${say.orderName(ctx.profile, order.number)} is still ${stageLabel(ctx.profile, order.stage)}. `
          + `Move it to ${stageLabel(ctx.profile, ctx.profile.closeFrom[0]!)} first.`);
      }

      // Money moves only after the owner hears the amount and says yes, in a later turn. A yes for
      // another amount or method, or too soon to be a person's, asks again.
      const key = `${ctx.business.id}:${order.id}`;
      if (!confirm || !takeConfirmation(ctx.store, key, order.totalCents, paymentMethod, ctx.now())) {
        askToConfirm(ctx.store, key, order.totalCents, paymentMethod, ctx.now());
        return ok(say.confirmClose(ctx.profile, found.ref, order.totalCents, paymentMethod), {
          status: 'needs_confirmation', next: ASK_FIRST, orderId: order.id, number: order.number,
          amountCents: order.totalCents, method: paymentMethod, alreadyClosed: false
        });
      }

      try {
        await ctx.store.commitClose(ctx.business.id, result.order, result.payment);
      } catch (err) {
        if (err instanceof ConflictError) return fail(say.conflict(ctx.profile, result.order.number));
        throw err;
      }

      return ok(say.closed(ctx.profile, { ...found.ref, order: result.order }, result.payment), {
        status: 'closed', orderId: result.order.id, number: result.order.number,
        amountCents: result.payment.amountCents, method: result.payment.method, alreadyClosed: false
      });
    })
  );
}
