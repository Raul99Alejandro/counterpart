/** Qué valores de Host acepta /mcp. /ping nunca se valida: el balanceador lo llama con la IP de la tarea. */
export type HostPolicy = { kind: 'any' } | { kind: 'list'; hosts: string[] } | { kind: 'closed' };

/**
 * Lee COUNTERPART_ALLOWED_HOSTS. "bootstrap" es el valor del primer despliegue, cuando el hostname
 * público todavía no existe: el proceso arranca sano y /mcp queda cerrado hasta la actualización.
 */
export function hostPolicy(env: NodeJS.ProcessEnv): HostPolicy {
  const raw = env.COUNTERPART_ALLOWED_HOSTS?.trim();
  if (raw === 'bootstrap') return { kind: 'closed' };
  const hosts = (raw ?? '').split(',').map(h => h.trim().toLowerCase()).filter(h => h.length > 0);
  if (hosts.length > 0) return { kind: 'list', hosts };
  // Fallar cerrado: expuesto a internet, sin lista de hosts solo queda el bearer token delante.
  if (env.NODE_ENV === 'production') {
    throw new Error('En producción (NODE_ENV=production) define COUNTERPART_ALLOWED_HOSTS con el hostname público, o "bootstrap" en el primer despliegue');
  }
  return { kind: 'any' };
}
