/** Which Host values /mcp accepts. /ping is never validated: the load balancer calls it with the task's IP. */
export type HostPolicy = { kind: 'any' } | { kind: 'list'; hosts: string[] } | { kind: 'closed' };

/**
 * Reads COUNTERPART_ALLOWED_HOSTS. "bootstrap" is the value for the first deployment, when the public
 * hostname does not exist yet: the process starts healthy and /mcp stays closed until the update.
 */
export function hostPolicy(env: NodeJS.ProcessEnv): HostPolicy {
  const raw = env.COUNTERPART_ALLOWED_HOSTS?.trim();
  if (raw === 'bootstrap') return { kind: 'closed' };
  const hosts = (raw ?? '').split(',').map(h => h.trim().toLowerCase()).filter(h => h.length > 0);
  if (hosts.length > 0) return { kind: 'list', hosts };
  // Fail closed: exposed to the internet, without a host list only the bearer token stands in front.
  if (env.NODE_ENV === 'production') {
    throw new Error('In production (NODE_ENV=production) set COUNTERPART_ALLOWED_HOSTS to the public hostname, or "bootstrap" on the first deployment');
  }
  return { kind: 'any' };
}
