import type { Asset, Business, CatalogItem, Customer, Order, Payment, PurchaseOrder } from '../domain/types.js';
import type { Profile } from '../profiles/schema.js';

export class ConflictError extends Error {
  constructor(what: string) {
    super(`conflicto de versión en ${what}`);
    this.name = 'ConflictError';
  }
}

/** Perfil guardado de un negocio (spec B2 §5.1). `version` la elige quien escribe; META.profileVersion la repite. */
export interface ProfileRecord { profile: Profile; source: string; version: number }

export type DraftState = 'generating' | 'ready' | 'failed';

/** Borrador del asistente: uno por negocio. `expiresAt` va en segundos epoch, que es lo que lee el TTL de DynamoDB. */
export interface Draft {
  description: string;
  state: DraftState;
  profile?: Profile;
  catalog?: CatalogItem[];
  error?: string;
  createdAt: string;
  expiresAt: number;
}

/** Lo que escribe la activación de un negocio, todo o nada. */
export interface Activation { business: Business; profile: ProfileRecord; items: CatalogItem[] }

/**
 * Lecturas de un negocio que no existe devuelven vacío o null en los dos stores. Las escrituras suponen
 * un negocio existente: quien llama siempre lo resolvió antes por su token.
 */
export interface Store {
  putBusiness(b: Business): Promise<void>;
  getBusiness(bizId: string): Promise<Business | null>;
  putToken(tokenHash: string, bizId: string, createdAt?: string): Promise<void>;
  getBusinessByTokenHash(tokenHash: string): Promise<Business | null>;
  /** Consume el número antes de escribir la orden: si esa escritura falla, el número se salta. Aceptado (carryover §5). */
  takeOrderNumber(bizId: string): Promise<number>;
  listCustomers(bizId: string): Promise<Customer[]>;
  putCustomer(bizId: string, c: Customer): Promise<void>;
  listAssets(bizId: string): Promise<Asset[]>;
  putAsset(bizId: string, a: Asset): Promise<void>;
  listOrders(bizId: string): Promise<Order[]>;
  getOrder(bizId: string, orderId: string): Promise<Order | null>;
  putOrder(bizId: string, o: Order): Promise<void>;
  listItems(bizId: string): Promise<CatalogItem[]>;
  putItems(bizId: string, items: CatalogItem[]): Promise<void>;
  commitOrderWithItems(bizId: string, order: Order, items: CatalogItem[]): Promise<void>;
  commitClose(bizId: string, order: Order, payment: Payment): Promise<void>;
  listPayments(bizId: string, from: string, to: string): Promise<Payment[]>;
  listOpenPurchaseOrders(bizId: string): Promise<PurchaseOrder[]>;
  putPurchaseOrders(bizId: string, pos: PurchaseOrder[]): Promise<void>;
  getProfile(bizId: string): Promise<ProfileRecord | null>;
  putProfile(bizId: string, record: ProfileRecord): Promise<void>;
  getDraft(bizId: string): Promise<Draft | null>;
  putDraft(bizId: string, draft: Draft): Promise<void>;
  deleteDraft(bizId: string): Promise<void>;
  /** META con la regla de versiones, PROFILE, ítems con la regla de versiones, y borra DRAFT: todo o nada. */
  activateBusiness(bizId: string, activation: Activation): Promise<void>;
}
