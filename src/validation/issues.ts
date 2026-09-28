import type * as z from 'zod/v4';

/** Pistas por nombre de campo: el mensaje de zod dice qué está mal, esto dice cómo arreglarlo. */
const HINTS: Record<string, string> = {
  priceCents: 'write the price in cents as a whole number, e.g. 4500 for $45.00',
  kind: 'use one of part, labor, product, ingredient, supply',
  timezone: 'use an IANA time zone such as America/Chicago',
  id: 'use lowercase letters, digits and dashes',
  taxRateBps: 'write the tax rate in basis points, e.g. 825 for 8.25%'
};

/** `a.b[2].c` a partir de la ruta de un error de zod. */
function issuePath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((acc, key) =>
    typeof key === 'number' ? `${acc}[${key}]` : acc ? `${acc}.${String(key)}` : String(key), '');
}

/** Errores de zod como `ruta: mensaje — pista`, una línea por error. */
export function formatIssues(error: z.ZodError, prefix = ''): string[] {
  return error.issues.map(issue => {
    const at = issuePath(issue.path);
    const where = [prefix, at].filter(Boolean).join(prefix && at ? '.' : '');
    const last = issue.path.at(-1);
    const hint = typeof last === 'string' && HINTS[last] ? ` — ${HINTS[last]}` : '';
    return `${where || '(root)'}: ${issue.message}${hint}`;
  });
}
