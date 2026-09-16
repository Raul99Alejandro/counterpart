import { createHash } from 'node:crypto';
import type { Business } from '../domain/types.js';
import type { Store } from '../store/store.js';

/** Hash SHA-256 en hex. Solo esto se guarda o se registra; el token en claro nunca. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Extrae el token de un header "Authorization: Bearer <token>" (case-insensitive). */
export function bearerFrom(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1]!.trim() : null;
}

/** Resuelve el negocio dueño de un token, si existe. */
export async function businessFor(store: Store, token: string): Promise<Business | null> {
  return store.getBusinessByTokenHash(hashToken(token));
}
