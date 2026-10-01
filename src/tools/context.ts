import * as z from 'zod/v4';
import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/server';
import type { Profile } from '../profiles/schema.js';
import type { OrderRef } from '../domain/resolver.js';
import type { Business } from '../domain/types.js';
import type { Store } from '../store/store.js';
import { currentRequest } from '../http/request-context.js';
import { log } from '../log.js';
import { instrument, internalResults } from './instrument.js';
import { registerUiResources } from './ui-assets.js';
import { registerSnapshot } from './snapshot.js';
import { registerFind } from './find.js';
import { registerStock } from './stock.js';
import { registerSalesReport } from './sales-report.js';
import { registerOpen } from './open.js';
import { registerMove } from './move.js';
import { registerAddLine } from './add-line.js';
import { registerReorder } from './reorder.js';
import { registerCloseOut } from './close-out.js';

export interface ToolContext {
  business: Business;
  profile: Profile;
  store: Store;
  now: () => Date;
  newId: (prefix: string) => string;
}

export type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: unknown;
  isError?: boolean;
};

/** Spoken text starts a sentence, even when it opens with "work order 41". */
function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * A tool's output schema with the spoken sentence in it. The bridge hands the model the JSON, not the
 * text, so the sentence has to be there too: with only amountCents, Nova said "eleven dollars" for $110.
 */
export function spoken<S extends z.ZodRawShape>(shape: S) {
  return z.object({ message: z.string(), ...shape });
}

export function ok(text: string, structuredContent: unknown): ToolResult {
  const spokenText = sentence(text);
  const data = structuredContent && typeof structuredContent === 'object' && !Array.isArray(structuredContent)
    ? { ...(structuredContent as Record<string, unknown>), message: spokenText }
    : structuredContent;
  return { content: [{ type: 'text', text: spokenText }], structuredContent: data };
}

/** Domain error: text only. The SDK does not validate outputSchema when isError is true. */
export function fail(text: string): ToolResult {
  return { content: [{ type: 'text', text: sentence(text) }], isError: true };
}

const INTERNAL_TEXT = 'Something went wrong on my end. Nothing was changed.';

/**
 * Error boundary (§7.7, `INTERNAL`). Any exception that is not a business result is
 * logged as JSON with an identifier and answered with a single phrase. Without this, the SDK
 * turns the exception into the response text and the assistant reads the error out loud.
 * Business errors, `ConflictError` included, are handled by each tool before reaching here.
 */
export function guard<A extends unknown[]>(
  handler: (...args: A) => Promise<ToolResult>
): (...args: A) => Promise<ToolResult> {
  return async (...args: A): Promise<ToolResult> => {
    try {
      return await handler(...args);
    } catch (err) {
      const failed = fail(INTERNAL_TEXT);
      internalResults.add(failed);
      log({
        level: 'error', msg: 'internal', code: 'INTERNAL',
        requestId: currentRequest()?.requestId ?? randomUUID(),
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        stack: err instanceof Error ? err.stack : undefined
      });
      return failed;
    }
  };
}

/** Joins orders with their customer and asset. */
export async function loadRefs(ctx: ToolContext): Promise<OrderRef[]> {
  const [orders, customers, assets] = await Promise.all([
    ctx.store.listOrders(ctx.business.id),
    ctx.store.listCustomers(ctx.business.id),
    ctx.store.listAssets(ctx.business.id)
  ]);
  const byCustomer = new Map(customers.map(c => [c.id, c]));
  const byAsset = new Map(assets.map(a => [a.id, a]));

  return orders.flatMap(order => {
    const customer = byCustomer.get(order.customerId);
    if (!customer) return [];
    const asset = order.assetId ? byAsset.get(order.assetId) : undefined;
    return [{ order, customer, asset }];
  });
}

export function openOnly(ctx: ToolContext, refs: OrderRef[]): OrderRef[] {
  return refs.filter(r => r.order.stage !== ctx.profile.closedStage);
}

export function stageLabel(profile: Profile, stageId: string): string {
  return profile.stages.find(s => s.id === stageId)?.label ?? stageId;
}

export function registerTools(server: McpServer, ctx: ToolContext): void {
  const s = instrument(server, ctx);
  registerSnapshot(s, ctx);
  registerFind(s, ctx);
  registerStock(s, ctx);
  registerSalesReport(s, ctx);
  registerOpen(s, ctx);
  registerMove(s, ctx);
  registerAddLine(s, ctx);
  registerReorder(s, ctx);
  registerCloseOut(s, ctx);
  registerUiResources(s, ['snapshot', 'sales-report', 'orders']);
}
