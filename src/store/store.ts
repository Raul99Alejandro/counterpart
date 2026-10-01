import type { Asset, Business, CatalogItem, Customer, Order, Payment, PurchaseOrder } from '../domain/types.js';
import type { Profile } from '../profiles/schema.js';

export class ConflictError extends Error {
  constructor(what: string) {
    super(`version conflict on ${what}`);
    this.name = 'ConflictError';
  }
}

/** A business's saved profile (spec B2 §5.1). The writer picks `version`; META.profileVersion repeats it. */
export interface ProfileRecord { profile: Profile; source: string; version: number }

export type DraftState = 'generating' | 'ready' | 'failed';

/** Assistant draft: one per business. `expiresAt` is in epoch seconds, which is what DynamoDB TTL reads. */
export interface Draft {
  description: string;
  state: DraftState;
  profile?: Profile;
  catalog?: CatalogItem[];
  error?: string;
  createdAt: string;
  expiresAt: number;
}

/** What activating a business writes, all or nothing. */
export interface Activation { business: Business; profile: ProfileRecord; items: CatalogItem[] }

/**
 * Reads for a business that does not exist return empty or null in both stores. Writes assume
 * an existing business: the caller always resolved it first from its token.
 */
export interface Store {
  putBusiness(b: Business): Promise<void>;
  getBusiness(bizId: string): Promise<Business | null>;
  putToken(tokenHash: string, bizId: string, createdAt?: string): Promise<void>;
  getBusinessByTokenHash(tokenHash: string): Promise<Business | null>;
  /** Takes the number before writing the order: if that write fails, the number is skipped. Accepted (carryover §5). */
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
  /** META with the versioning rule, PROFILE, items with the versioning rule, and deletes DRAFT: all or nothing. */
  activateBusiness(bizId: string, activation: Activation): Promise<void>;
}
