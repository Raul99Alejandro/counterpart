import type { Asset, Business, CatalogItem, Customer, Order, Payment, PurchaseOrder } from '../domain/types.js';
import { ConflictError, type Activation, type Draft, type ProfileRecord, type Store } from './store.js';

interface Tenant {
  business: Business;
  customers: Map<string, Customer>;
  assets: Map<string, Asset>;
  orders: Map<string, Order>;
  items: Map<string, CatalogItem>;
  payments: Payment[];
  purchaseOrders: Map<string, PurchaseOrder>;
  profile?: ProfileRecord;
  draft?: Draft;
}

const copy = <T>(value: T): T => structuredClone(value);

export class MemoryStore implements Store {
  private tenants = new Map<string, Tenant>();
  private tokens = new Map<string, string>();

  private tenant(bizId: string): Tenant {
    const t = this.tenants.get(bizId);
    if (!t) throw new Error(`negocio desconocido: ${bizId}`);
    return t;
  }

  async putBusiness(b: Business): Promise<void> {
    const existing = this.tenants.get(b.id);
    if (existing) {
      if (existing.business.version !== b.version) throw new ConflictError('business');
      existing.business = copy({ ...b, version: b.version + 1 });
      return;
    }
    this.tenants.set(b.id, {
      business: copy({ ...b, version: b.version + 1 }), customers: new Map(), assets: new Map(), orders: new Map(),
      items: new Map(), payments: [], purchaseOrders: new Map()
    });
  }

  async getBusiness(bizId: string): Promise<Business | null> {
    return this.tenants.has(bizId) ? copy(this.tenant(bizId).business) : null;
  }

  async putToken(tokenHash: string, bizId: string): Promise<void> {
    this.tokens.set(tokenHash, bizId);
  }

  async getBusinessByTokenHash(tokenHash: string): Promise<Business | null> {
    const bizId = this.tokens.get(tokenHash);
    return bizId ? this.getBusiness(bizId) : null;
  }

  async takeOrderNumber(bizId: string): Promise<number> {
    const t = this.tenant(bizId);
    const number = t.business.nextOrderNumber;
    t.business = { ...t.business, nextOrderNumber: number + 1, version: t.business.version + 1 };
    return number;
  }

  async listCustomers(bizId: string): Promise<Customer[]> { return copy([...this.tenant(bizId).customers.values()]); }
  async putCustomer(bizId: string, c: Customer): Promise<void> { this.tenant(bizId).customers.set(c.id, copy(c)); }
  async listAssets(bizId: string): Promise<Asset[]> { return copy([...this.tenant(bizId).assets.values()]); }
  async putAsset(bizId: string, a: Asset): Promise<void> { this.tenant(bizId).assets.set(a.id, copy(a)); }
  async listOrders(bizId: string): Promise<Order[]> { return copy([...this.tenant(bizId).orders.values()]); }
  async getOrder(bizId: string, orderId: string): Promise<Order | null> {
    const o = this.tenant(bizId).orders.get(orderId);
    return o ? copy(o) : null;
  }
  async listItems(bizId: string): Promise<CatalogItem[]> { return copy([...this.tenant(bizId).items.values()]); }

  async putOrder(bizId: string, o: Order): Promise<void> {
    const t = this.tenant(bizId);
    const current = t.orders.get(o.id);
    if (current && current.version !== o.version) throw new ConflictError(`order ${o.id}`);
    t.orders.set(o.id, copy({ ...o, version: o.version + 1 }));
  }

  async putItems(bizId: string, items: CatalogItem[]): Promise<void> {
    const t = this.tenant(bizId);
    for (const item of items) {
      const current = t.items.get(item.id);
      if (current && current.version !== item.version) throw new ConflictError(`item ${item.id}`);
    }
    for (const item of items) t.items.set(item.id, copy({ ...item, version: item.version + 1 }));
  }

  async commitOrderWithItems(bizId: string, order: Order, items: CatalogItem[]): Promise<void> {
    const t = this.tenant(bizId);
    // Validar orden
    const currentOrder = t.orders.get(order.id);
    if (currentOrder && currentOrder.version !== order.version) throw new ConflictError(`order ${order.id}`);
    // Validar items
    for (const item of items) {
      const current = t.items.get(item.id);
      if (current && current.version !== item.version) throw new ConflictError(`item ${item.id}`);
    }
    // Escribir items
    for (const item of items) t.items.set(item.id, copy({ ...item, version: item.version + 1 }));
    // Escribir orden
    t.orders.set(order.id, copy({ ...order, version: order.version + 1 }));
  }

  async commitClose(bizId: string, order: Order, payment: Payment): Promise<void> {
    await this.putOrder(bizId, order);
    this.tenant(bizId).payments.push(copy(payment));
  }

  async listPayments(bizId: string, from: string, to: string): Promise<Payment[]> {
    return copy(this.tenant(bizId).payments.filter(p => p.paidOn >= from && p.paidOn <= to));
  }

  async listOpenPurchaseOrders(bizId: string): Promise<PurchaseOrder[]> {
    return copy([...this.tenant(bizId).purchaseOrders.values()].filter(po => po.status === 'open'));
  }

  async putPurchaseOrders(bizId: string, pos: PurchaseOrder[]): Promise<void> {
    const t = this.tenant(bizId);
    for (const po of pos) t.purchaseOrders.set(po.id, copy(po));
  }

  async getProfile(bizId: string): Promise<ProfileRecord | null> {
    const profile = this.tenants.get(bizId)?.profile;
    return profile ? copy(profile) : null;
  }

  async putProfile(bizId: string, record: ProfileRecord): Promise<void> {
    this.tenant(bizId).profile = copy(record);
  }

  async getDraft(bizId: string): Promise<Draft | null> {
    const draft = this.tenants.get(bizId)?.draft;
    return draft ? copy(draft) : null;
  }

  async putDraft(bizId: string, draft: Draft): Promise<void> {
    this.tenant(bizId).draft = copy(draft);
  }

  async deleteDraft(bizId: string): Promise<void> {
    const t = this.tenants.get(bizId);
    if (t) delete t.draft;
  }

  async activateBusiness(bizId: string, a: Activation): Promise<void> {
    const t = this.tenant(bizId);
    // Validar todo antes de escribir nada, igual que la transacción de DynamoDB.
    if (t.business.version !== a.business.version) throw new ConflictError('business');
    for (const item of a.items) {
      const current = t.items.get(item.id);
      if (current && current.version !== item.version) throw new ConflictError(`item ${item.id}`);
    }
    t.business = copy({ ...a.business, version: a.business.version + 1 });
    t.profile = copy(a.profile);
    for (const item of a.items) t.items.set(item.id, copy({ ...item, version: item.version + 1 }));
    delete t.draft;
  }
}
