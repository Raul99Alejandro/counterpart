import type { Asset, Business, CatalogItem, Customer, Order, Payment, PurchaseOrder } from '../domain/types.js';

export class ConflictError extends Error {
  constructor(what: string) {
    super(`conflicto de versión en ${what}`);
    this.name = 'ConflictError';
  }
}

export interface Store {
  putBusiness(b: Business): Promise<void>;
  getBusiness(bizId: string): Promise<Business | null>;
  putToken(tokenHash: string, bizId: string): Promise<void>;
  getBusinessByTokenHash(tokenHash: string): Promise<Business | null>;
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
}
