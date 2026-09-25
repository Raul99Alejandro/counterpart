const ARTICLES = new Set(['the', 'a', 'an']);

function words(value: string): string[] {
  const tokens = value.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter(Boolean);
  while (tokens.length > 0 && ARTICLES.has(tokens[0]!)) tokens.shift();
  return tokens;
}

/**
 * ¿La llamada del modelo trae los argumentos clave de la frase de oro? Texto: todas las palabras
 * esperadas aparecen, sin importar mayúsculas, puntuación ni artículo inicial. Números: por valor.
 * Objetos: recursivo sobre las llaves esperadas. Lo que el modelo agregue de más no cuenta.
 */
export function argsMatch(expected: unknown, actual: unknown): boolean {
  if (typeof expected === 'number') return Number(actual) === expected;
  if (typeof expected === 'boolean') return actual === expected;
  if (typeof expected === 'string') {
    if (typeof actual !== 'string') return false;
    if (/^[a-z]+(_[a-z]+)+$/.test(expected)) return actual === expected; // enum: exacto
    const got = new Set(words(actual));
    return words(expected).every(w => got.has(w));
  }
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object') return false;
    return Object.entries(expected).every(([key, value]) => argsMatch(value, (actual as Record<string, unknown>)[key]));
  }
  return expected === actual;
}
