import * as z from 'zod/v4';

export const TOOL_KEYS = ['snapshot', 'find', 'open', 'move', 'addLine', 'stock', 'reorder', 'closeOut', 'salesReport'] as const;
export type ToolKey = (typeof TOOL_KEYS)[number];

// Validator for tool names that match the regular expression
const toolName = z.string().regex(/^[a-z][a-z0-9_]{2,63}$/, 'invalid tool name');

// Definition of a field inside an asset or in orderFields
const fieldDef = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  type: z.enum(['string', 'integer']),
  required: z.boolean()
});

// Full business profile schema
export const profileSchema = z.object({
  id: z.string().min(1),
  nouns: z.object({
    order: z.string(), orders: z.string(), item: z.string(), items: z.string(), customer: z.string()
  }),
  synonyms: z.object({ order: z.array(z.string()), item: z.array(z.string()) }),
  toolNames: z.object(Object.fromEntries(TOOL_KEYS.map(k => [k, toolName])) as Record<ToolKey, typeof toolName>),
  stages: z.array(z.object({ id: z.string(), label: z.string() })).min(2),
  closedStage: z.string(),
  closeFrom: z.array(z.string()).min(1),
  asset: z.object({ noun: z.string(), fields: z.array(fieldDef).min(1), spokenAs: z.string() }).nullable(),
  orderFields: z.array(fieldDef),
  due: z.enum(['none', 'optional', 'required'])
});

export type FieldDef = z.infer<typeof fieldDef>;
export type Profile = z.infer<typeof profileSchema>;
export type StageDef = Profile['stages'][number];
export type AssetDef = NonNullable<Profile['asset']>;
