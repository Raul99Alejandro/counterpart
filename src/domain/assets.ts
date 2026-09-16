import type { AssetDef } from '../profiles/schema.js';

/** Rellena la plantilla spokenAs del perfil con los campos del activo. */
export function spokenLabel(asset: AssetDef, fields: Record<string, string | number>): string {
  return asset.spokenAs
    .replace(/\{([a-z0-9_]+)\}/g, (_, key: string) => String(fields[key] ?? ''))
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}
