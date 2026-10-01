import * as z from 'zod/v4';
import { spokenId } from '../tools/specs.js';
import type { ReviewResult } from './service.js';

/** Data for the draft UI (spec B2 §5.4). The tool's text is enough on its own; this is the visual extra. */
export const setupViewSchema = z.object({
  state: z.enum(['none', 'generating', 'failed', 'ready']),
  businessName: z.string(),
  message: z.string(),
  nouns: z.object({ order: z.string(), orders: z.string(), item: z.string(), items: z.string(), customer: z.string() }).optional(),
  stages: z.array(z.object({ label: z.string(), closing: z.boolean() })).optional(),
  orderFields: z.array(z.object({ label: z.string(), required: z.boolean() })).optional(),
  asset: z.object({ noun: z.string(), fields: z.array(z.string()) }).nullable().optional(),
  items: z.array(z.object({
    name: z.string(), kind: z.string(), priceCents: z.number(), stocked: z.boolean(), onHand: z.number()
  })).optional()
});

export type SetupView = z.infer<typeof setupViewSchema>;

export function setupView(businessName: string, review: ReviewResult, message: string): SetupView {
  if (review.state !== 'ready') return { state: review.state, businessName, message };
  const { profile, items } = review;
  return {
    state: 'ready', businessName, message,
    nouns: profile.nouns,
    stages: profile.stages.map(s => ({ label: s.label, closing: s.id === profile.closedStage })),
    orderFields: profile.orderFields.map(f => ({ label: spokenId(f.id), required: f.required })),
    asset: profile.asset ? { noun: profile.asset.noun, fields: profile.asset.fields.map(f => spokenId(f.id)) } : null,
    items: items.map(i => ({ name: i.name, kind: i.kind, priceCents: i.priceCents, stocked: i.stocked, onHand: i.onHand }))
  };
}
