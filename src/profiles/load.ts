import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { profileSchema, TOOL_KEYS, type Profile } from './schema.js';

const DIR = path.join(import.meta.dirname, '.');

/** Propiedades que la tool de abrir orden ya usa; un campo propio con ese id la pisaría en silencio. */
const RESERVED_FIELD_IDS = new Set(['customerName', 'customerPhone', 'description', 'asset', 'due']);

export function parseProfile(raw: unknown): Profile {
  const p = profileSchema.parse(raw);
  const stageIds = new Set(p.stages.map(s => s.id));

  // Verificar que closedStage está en stages
  if (!stageIds.has(p.closedStage)) {
    throw new Error(`closedStage "${p.closedStage}" no está en stages`);
  }

  // Verificar que closeFrom contiene solo stages válidos y no incluye closedStage
  for (const s of p.closeFrom) {
    if (!stageIds.has(s)) throw new Error(`closeFrom contiene "${s}", que no está en stages`);
    if (s === p.closedStage) throw new Error(`closeFrom no puede incluir closedStage`);
  }

  // Verificar que no hay nombres de tools duplicados
  const names = TOOL_KEYS.map(k => p.toolNames[k]);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  if (dupes.length > 0) throw new Error(`nombre de tool duplicado: ${dupes[0]}`);

  // Si hay un activo, verificar que spokenAs solo usa campos definidos
  if (p.asset) {
    const fieldIds = new Set(p.asset.fields.map(f => f.id));
    for (const m of p.asset.spokenAs.matchAll(/\{([a-z0-9_]+)\}/g)) {
      if (!fieldIds.has(m[1]!)) throw new Error(`spokenAs usa "{${m[1]}}", que no es un campo del activo`);
    }
  }

  // Verificar que orderFields no usan ids reservados
  for (const f of p.orderFields) {
    if (RESERVED_FIELD_IDS.has(f.id)) throw new Error(`orderFields usa el id reservado "${f.id}"`);
  }

  return p;
}

export function loadProfile(id: string): Profile {
  const file = path.join(DIR, `${id}.yaml`);
  return parseProfile(parseYaml(fs.readFileSync(file, 'utf8')));
}
