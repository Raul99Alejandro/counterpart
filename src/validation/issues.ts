import type * as z from 'zod/v4';

/** Hints by field name: the zod message says what is wrong, this says how to fix it. */
const HINTS: Record<string, string> = {
  priceCents: 'write the price in cents as a whole number, e.g. 4500 for $45.00',
  kind: 'use one of part, labor, product, ingredient, supply',
  timezone: 'use an IANA time zone such as America/Chicago',
  id: 'use lowercase letters, digits and dashes',
  taxRateBps: 'write the tax rate in basis points, e.g. 825 for 8.25%'
};

/** Field ids (of an order or an asset) use underscores; item ids use dashes. */
const FIELD_ID_HINT = 'use lowercase letters, digits and underscores, starting with a letter';

/** The keys of `consumes` are ids of other items. */
const CONSUMES_HINT = 'use the exact id of another item in the catalog (lowercase letters, digits and dashes)';

function hintFor(path: readonly PropertyKey[]): string {
  const last = path.at(-1);
  if (typeof last !== 'string') return '';
  if (path.at(-2) === 'consumes') return ` — ${CONSUMES_HINT}`;
  const inFields = path.some(key => key === 'fields' || key === 'orderFields');
  const hint = last === 'id' && inFields ? FIELD_ID_HINT : HINTS[last];
  return hint ? ` — ${hint}` : '';
}

/** `a.b[2].c` from the path of a zod error. */
function issuePath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((acc, key) =>
    typeof key === 'number' ? `${acc}[${key}]` : acc ? `${acc}.${String(key)}` : String(key), '');
}

/** Zod errors as `path: message — hint`, one line per error. */
export function formatIssues(error: z.ZodError, prefix = ''): string[] {
  return error.issues.map(issue => {
    const at = issuePath(issue.path);
    const where = [prefix, at].filter(Boolean).join(prefix && at ? '.' : '');
    const hint = hintFor(issue.path);
    return `${where || '(root)'}: ${issue.message}${hint}`;
  });
}
