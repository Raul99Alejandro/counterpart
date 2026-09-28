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

/** Lo que Nova tiene que devolver. De aquí sale también el esquema JSON de su herramienta (spec B2 §5.3). */
export const draftSchema = z.object({ profile: profileSchema, catalog: catalogSchema }).strict();

export interface ValidSetup { profile: Profile; items: CatalogItem[] }
export type SetupCheck = { ok: true; setup: ValidSetup } | { ok: false; errors: string[] };

export const STAGES_QUESTION = "I couldn't tell how an order moves from start to finish. What steps does an order go through?";
export const CATALOG_QUESTION = "I couldn't put together what you sell. What are a few things you sell, and about how much they cost?";
export const GENERIC_QUESTION = "I couldn't finish your setup. Tell me a bit more about what you sell and the steps an order goes through.";

/** Validación en tres capas (spec B2 §5.3): esquema, reglas del perfil del servidor y reglas propias del asistente. */
export function validateSetup(raw: unknown): SetupCheck {
  const parsed = draftSchema.safeParse(raw);
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
  // Reglas que un YAML escrito a mano nunca rompía y un perfil del modelo sí puede romper.
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
  // Precios > 0 ya los exige el esquema del ítem (`priceCents` positivo).
  errors.push(...catalogProblems(items, 'catalog.items'));

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, setup: { profile, items: toCatalogItems(items) } };
}

/**
 * Nova tiende a agregar un "event_date" obligatorio además de `due`, y la orden pediría dos fechas.
 * Se quita aquí, sin gastar una reparación: `due` ya guarda la fecha de la orden.
 */
function withoutDateFields(profile: Profile): Profile {
  if (profile.due === 'none') return profile;
  return { ...profile, orderFields: profile.orderFields.filter(f => !/(^|_)date(_|$)/.test(f.id)) };
}

/** La frase para el usuario cuando el borrador no se pudo arreglar: pregunta por lo que faltó. */
export function spokenFailure(errors: string[]): string {
  if (errors.some(e => /^profile(\.stages|\.closedStage|\.closeFrom|: (closedStage|closeFrom))/.test(e))) return STAGES_QUESTION;
  if (errors.some(e => e.startsWith('catalog'))) return CATALOG_QUESTION;
  return GENERIC_QUESTION;
}
