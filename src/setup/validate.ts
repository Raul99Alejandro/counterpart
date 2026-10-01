import * as z from 'zod/v4';
import { catalogProblems, catalogSchema, toCatalogItems } from '../catalog/schema.js';
import type { CatalogItem } from '../domain/types.js';
import { parseProfile } from '../profiles/load.js';
import { profileSchema, TOOL_KEYS, type Profile } from '../profiles/schema.js';
import { formatIssues } from '../validation/issues.js';

export const SETUP_TOOL_NAMES = ['set_up_my_business', 'review_business_setup', 'activate_business_setup'] as const;
export const MAX_STAGES = 8;
export const MIN_ITEMS = 5;
export const MAX_ITEMS = 60;

/** What Nova must return. Its tool's JSON schema is derived from this too (spec B2 §5.3). */
export const draftSchema = z.object({ profile: profileSchema, catalog: catalogSchema }).strict();

export interface ValidSetup { profile: Profile; items: CatalogItem[] }
export type SetupCheck = { ok: true; setup: ValidSetup } | { ok: false; errors: string[] };

export const STAGES_QUESTION = "I couldn't tell how an order moves from start to finish. What steps does an order go through?";
export const CATALOG_QUESTION = "I couldn't put together what you sell. What are a few things you sell, and about how much they cost?";
export const GENERIC_QUESTION = "I couldn't finish your setup. Tell me a bit more about what you sell and the steps an order goes through.";

/** Three-layer validation (spec B2 §5.3): schema, the server's profile rules, and the assistant's own rules. */
export function validateSetup(raw: unknown): SetupCheck {
  const parsed = draftSchema.safeParse(withDashedConsumes(raw));
  if (!parsed.success) return { ok: false, errors: formatIssues(parsed.error) };

  let profile: Profile;
  try {
    profile = withoutDateFields(parseProfile(parsed.data.profile));
  } catch (err) {
    return { ok: false, errors: [`profile: ${err instanceof Error ? err.message : String(err)}`] };
  }

  const items = parsed.data.catalog.items;
  const errors: string[] = [];
  const reserved: readonly string[] = SETUP_TOOL_NAMES;
  for (const key of TOOL_KEYS) {
    const name = profile.toolNames[key];
    if (reserved.includes(name)) errors.push(`profile.toolNames.${key}: "${name}" is reserved for the setup tools; pick another name`);
  }
  // Rules a hand-written YAML never broke but a model-written profile can.
  if (profile.closedStage === profile.stages[0]?.id) {
    errors.push(`profile.closedStage: "${profile.closedStage}" is the first stage, so every new order would open already closed; close on the last stage`);
  }
  const seenStages = new Set<string>();
  profile.stages.forEach((stage, i) => {
    if (seenStages.has(stage.id)) errors.push(`profile.stages[${i}].id: "${stage.id}" is used twice; every stage needs its own id`);
    seenStages.add(stage.id);
  });
  for (const [noun, word] of Object.entries(profile.nouns)) {
    if (word.trim() === '') errors.push(`profile.nouns.${noun}: empty; say what the business calls it`);
  }
  if (profile.stages.length > MAX_STAGES) {
    errors.push(`profile.stages: ${profile.stages.length} stages is too many; use at most ${MAX_STAGES}`);
  }
  if (items.length < MIN_ITEMS || items.length > MAX_ITEMS) {
    errors.push(`catalog.items: ${items.length} items; use between ${MIN_ITEMS} and ${MAX_ITEMS}`);
  }
  // Prices > 0 are already required by the item schema (positive `priceCents`).
  errors.push(...catalogProblems(items, 'catalog.items'));

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, setup: { profile, items: toCatalogItems(items) } };
}

/**
 * Nova tends to add a required "event_date" on top of `due`, and the order would ask for two dates.
 * It is removed here, without spending a repair: `due` already holds the order's date.
 */
function withoutDateFields(profile: Profile): Profile {
  if (profile.due === 'none') return profile;
  return { ...profile, orderFields: profile.orderFields.filter(f => !/(^|_)date(_|$)/.test(f.id)) };
}

/** The phrase for the user when the draft could not be fixed: asks about what was missing. */
/**
 * Nova sometimes writes an item id in `consumes` with underscores ("rose_stem") even though the item is
 * called "rose-stem", and the repair does not always fix it. It is the same item, so it is fixed here.
 */
function withDashedConsumes(raw: unknown): unknown {
  const items = (raw as { catalog?: { items?: unknown } } | null)?.catalog?.items;
  if (!Array.isArray(items)) return raw;
  const fixed = items.map(item => {
    const consumes = (item as { consumes?: unknown } | null)?.consumes;
    if (!consumes || typeof consumes !== 'object' || Array.isArray(consumes)) return item;
    return {
      ...item,
      consumes: Object.fromEntries(Object.entries(consumes).map(([id, n]) => [/^[a-z0-9_-]+$/.test(id) ? id.replace(/_/g, '-') : id, n]))
    };
  });
  const draft = raw as { catalog: object };
  return { ...draft, catalog: { ...draft.catalog, items: fixed } };
}

export function spokenFailure(errors: string[]): string {
  if (errors.some(e => /^profile(\.stages|\.closedStage|\.closeFrom|: (closedStage|closeFrom))/.test(e))) return STAGES_QUESTION;
  if (errors.some(e => e.startsWith('catalog'))) return CATALOG_QUESTION;
  return GENERIC_QUESTION;
}
