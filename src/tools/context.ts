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

export function ok(text: string, structuredContent: unknown): ToolResult {
  return { content: [{ type: 'text', text }], structuredContent };
}

/** Error de dominio: solo texto. El SDK no valida outputSchema cuando isError es true. */
export function fail(text: string): ToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

const INTERNAL_TEXT = 'Something went wrong on my end. Nothing was changed.';

/**
 * Frontera de errores (§7.7, `INTERNAL`). Cualquier excepción que no sea un resultado de negocio
 * se registra en JSON con un identificador y se contesta con una sola frase. Sin esto, el SDK
 * convierte la excepción en el texto de la respuesta y el asistente lee el error en voz alta.
 * Los errores de negocio, `ConflictError` incluido, los resuelve cada tool antes de llegar aquí.
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

/** Une órdenes con su cliente y su activo. */
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
  registerUiResources(s);
}
