/** A judge's sandbox lives a day: long enough to come back, short enough that public tokens go stale. */
export const SANDBOX_TTL_MS = 24 * 3600 * 1000;

/** True for a sandbox business (`demo-<epoch36>-<rand>-<kind>`) older than its TTL. Every other business never expires. */
export function sandboxExpired(businessId: string, now: Date): boolean {
  const match = /^demo-([a-z0-9]+)-[a-z0-9]+-/.exec(businessId);
  if (!match) return false;
  return now.getTime() - parseInt(match[1]!, 36) > SANDBOX_TTL_MS;
}
