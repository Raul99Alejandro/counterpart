import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { periodRange, type Period } from '../domain/dates.js';
import { formatMoney } from '../domain/money.js';
import { buildSalesReport } from '../domain/reports.js';
import { salesReportInput, toolSpecs } from './specs.js';
import { guard, ok, type ToolContext } from './context.js';

const output = z.object({
  from: z.string(), to: z.string(), prevFrom: z.string(), prevTo: z.string(),
  totalCents: z.number(), prevTotalCents: z.number(), count: z.number(), averageTicketCents: z.number(),
  daily: z.array(z.object({ date: z.string(), cents: z.number() })),
  topItems: z.array(z.object({ name: z.string(), quantity: z.number(), cents: z.number() }))
});

export function registerSalesReport(server: McpServer, ctx: ToolContext): void {
  const spec = toolSpecs(ctx.profile).salesReport;

  server.registerTool(
    spec.name,
    {
      title: spec.title, description: spec.description,
      inputSchema: salesReportInput, outputSchema: output,
      annotations: { readOnlyHint: true, idempotentHint: true }
    },
    guard(async (args: { period: Period; compare?: boolean }) => {
      const range = periodRange(args.period, ctx.business.timezone, ctx.now());
      const [payments, orders] = await Promise.all([
        ctx.store.listPayments(ctx.business.id, range.prevFrom, range.to),
        ctx.store.listOrders(ctx.business.id)
      ]);

      const report = buildSalesReport({ range, payments, orders });
      const sales = `${report.count} ${report.count === 1 ? 'sale' : 'sales'}`;
      const first = `${formatMoney(report.totalCents)} from ${sales}, averaging ${formatMoney(report.averageTicketCents)}.`;

      const trend = args.compare !== false && report.prevTotalCents > 0
        ? `That's ${report.totalCents >= report.prevTotalCents ? 'up' : 'down'} from ${formatMoney(report.prevTotalCents)} the period before`
        : '';
      const best = report.topItems[0]?.name;
      // Una sola segunda oración, sea cual sea la combinación.
      const second = trend && best ? ` ${trend}, and the best seller was ${best}.`
        : trend ? ` ${trend}.`
        : best ? ` The best seller was ${best}.`
        : '';

      return ok(first + second, report);
    })
  );
}
