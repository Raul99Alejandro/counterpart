const ARTICLES = new Set(['the', 'a', 'an']);

function words(value: string): string[] {
  const tokens = value.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter(Boolean);
  while (tokens.length > 0 && ARTICLES.has(tokens[0]!)) tokens.shift();
  // Singular and plural count the same ("brake rotors" = "brake rotor"); "glass" keeps its s.
  return tokens.map(singular);
}

function singular(word: string): string {
  if (/(x|ch|sh|ss)es$/.test(word)) return word.slice(0, -2); // boxes → box
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/**
 * Does the model's call carry the golden phrase's key arguments? Text: every expected word
 * appears, ignoring case, punctuation and a leading article. Numbers: by value.
 * Objects: recursive over the expected keys. Anything extra the model adds does not count.
 */
export function argsMatch(expected: unknown, actual: unknown): boolean {
  if (typeof expected === 'number') return Number(actual) === expected;
  if (typeof expected === 'boolean') return actual === expected;
  if (typeof expected === 'string') {
    if (typeof actual !== 'string') return false;
    if (/^[a-z]+(_[a-z]+)+$/.test(expected)) return actual === expected; // enum: exact
    const got = new Set(words(actual));
    return words(expected).every(w => got.has(w));
  }
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object') return false;
    return Object.entries(expected).every(([key, value]) => argsMatch(value, (actual as Record<string, unknown>)[key]));
  }
  return expected === actual;
}
