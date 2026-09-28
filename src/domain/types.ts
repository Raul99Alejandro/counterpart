export type BusinessStatus = 'blank' | 'active';
/** `profileVersion` es la versión del PROFILE vigente; 0 mientras el negocio está en blanco (spec B2 §5.1). */
export interface Business { id: string; name: string; status: BusinessStatus; profileVersion: number; timezone: string; taxRateBps: number; nextOrderNumber: number; version: number }
export interface Customer { id: string; name: string; nameNormalized: string; phone?: string }
export interface Asset { id: string; customerId: string; fields: Record<string, string | number>; spokenLabel: string }
export interface CatalogItem { id: string; name: string; synonyms: string[]; kind: 'part' | 'labor' | 'product' | 'ingredient' | 'supply'; unit: string; priceCents: number; taxable: boolean; stocked: boolean; onHand: number; reorderPoint: number; reorderQty: number; supplierId?: string; consumes: Record<string, number>; version: number }
export interface OrderLine { itemId: string; name: string; quantity: number; unitPriceCents: number; taxable: boolean; backordered: number }
export interface Order { id: string; number: number; customerId: string; assetId?: string; stage: string; fields: Record<string, string>; dueOn?: string; description?: string; lines: OrderLine[]; subtotalCents: number; taxCents: number; totalCents: number; stageHistory: Array<{ stage: string; at: string }>; createdAt: string; closedAt?: string; version: number }
export interface Payment { id: string; orderId: string; amountCents: number; method: 'cash' | 'card' | 'check'; paidAt: string; paidOn: string }
export interface PurchaseOrder { id: string; supplierId: string; lines: Array<{ itemId: string; qty: number }>; status: 'open' | 'received'; createdAt: string }
