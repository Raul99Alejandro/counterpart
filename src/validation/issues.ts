import type * as z from 'zod/v4';

/** Pistas por nombre de campo: el mensaje de zod dice qué está mal, esto dice cómo arreglarlo. */
const HINTS: Record<string, string> = {
  priceCents: 'write the price in cents as a whole number, e.g. 4500 for $45.00',
  kind: 'use one of part, labor, product, ingredient, supply',
  timezone: 'use an IANA time zone such as America/Chicago',
  id: 'use lowercase letters, digits and dashes',
  taxRateBps: 'write the tax rate in basis points, e.g. 825 for 8.25%'
};

/** Los ids de campos (de una orden o de un activo) llevan guion bajo; los de ítems, guion. */
const FIELD_ID_HINT = 'use lowercase letters, digits and underscores, starting with a letter';

/** Las llaves de `consumes` son ids de otros ítems. */
const CONSUMES_HINT = 'use the exact id of another item in the catalog (lowercase letters, digits and dashes)';

function hintFor(path: readonly PropertyKey[]): string {
  const last = path.at(-1);
  if (typeof last !== 'string') return '';
  if (path.at(-2) === 'consumes') return ` — ${CONSUMES_HINT}`;
  const inFields = path.some(key => key === 'fields' || key === 'orderFields');
  const hint = last === 'id' && inFields ? FIELD_ID_HINT : HINTS[last];
  return hint ? ` — ${hint}` : '';
}

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
    const hint = hintFor(issue.path);
    return `${where || '(root)'}: ${issue.message}${hint}`;
  });
}
