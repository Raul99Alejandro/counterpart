import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { normalizeName, spokenLabel } from '../domain/assets.js';
import { resolveDue } from '../domain/dates.js';
import { newOrder } from '../domain/orders.js';
import type { OrderRef } from '../domain/resolver.js';
import { say } from '../speech/say.js';
import { openInput, toolSpecs } from './specs.js';
import { fail, loadRefs, ok, type ToolContext } from './context.js';

const output = z.object({
  orderId: z.string(), number: z.number(), stage: z.string(), label: z.string(), dueOn: z.string().optional()
});

const TWO_MINUTES_MS = 2 * 60 * 1000;

export function registerOpen(server: McpServer, ctx: ToolContext): void {
  const spec = toolSpecs(ctx.profile).open;

  server.registerTool(
    spec.name,
    { title: spec.title, description: spec.description, inputSchema: openInput(ctx.profile), outputSchema: output },
    async (args: Record<string, unknown>) => {
      const now = ctx.now();
      const customerName = String(args.customerName);
      const assetFields = (args.asset ?? {}) as Record<string, string | number>;
      const label = ctx.profile.asset ? spokenLabel(ctx.profile.asset, assetFields) : customerName;

      let dueOn: string | undefined;
      if (typeof args.due === 'string') {
        const resolved = resolveDue(args.due, ctx.business.timezone, now);
        if (!resolved) return fail(`I didn't catch the due date "${args.due}". Try a weekday or a date.`);
        dueOn = resolved;
      }

      // Idempotencia: misma orden recién creada.
      const refs = await loadRefs(ctx);
      const duplicate = refs.find(r =>
        normalizeName(r.customer.name) === normalizeName(customerName)
        && (r.asset?.spokenLabel ?? r.customer.name) === label
        && now.getTime() - new Date(r.order.createdAt).getTime() < TWO_MINUTES_MS);
      if (duplicate) {
        return ok(say.opened(ctx.profile, duplicate), toOutput(duplicate));
      }

      const customers = await ctx.store.listCustomers(ctx.business.id);
      let customer = customers.find(c => c.nameNormalized === normalizeName(customerName));
      if (!customer) {
        customer = { id: ctx.newId('cust'), name: customerName, nameNormalized: normalizeName(customerName) };
        if (typeof args.customerPhone === 'string') customer.phone = args.customerPhone;
        await ctx.store.putCustomer(ctx.business.id, customer);
      }

      let assetId: string | undefined;
      if (ctx.profile.asset) {
        const assets = await ctx.store.listAssets(ctx.business.id);
        const existing = assets.find(a => a.customerId === customer!.id && a.spokenLabel === label);
        if (existing) {
          assetId = existing.id;
        } else {
          assetId = ctx.newId('asset');
          await ctx.store.putAsset(ctx.business.id, { id: assetId, customerId: customer.id, fields: assetFields, spokenLabel: label });
        }
      }

      const fields = Object.fromEntries(
        ctx.profile.orderFields
          .filter(f => typeof args[f.id] === 'string' || typeof args[f.id] === 'number')
          .map(f => [f.id, String(args[f.id])])
      );

      const order = newOrder({
        id: ctx.newId('ord'),
        number: await ctx.store.takeOrderNumber(ctx.business.id),
        customerId: customer.id, assetId, fields, dueOn,
        description: typeof args.description === 'string' ? args.description : undefined,
        stage: ctx.profile.stages[0]!.id, now
      });
      await ctx.store.putOrder(ctx.business.id, order);

      const ref: OrderRef = {
        order, customer,
        asset: assetId ? { id: assetId, customerId: customer.id, fields: assetFields, spokenLabel: label } : undefined
      };
      return ok(say.opened(ctx.profile, ref), toOutput(ref));
    }
  );
}

function toOutput(ref: OrderRef) {
  return {
    orderId: ref.order.id, number: ref.order.number, stage: ref.order.stage,
    label: ref.asset?.spokenLabel ?? ref.customer.name, dueOn: ref.order.dueOn
  };
}
