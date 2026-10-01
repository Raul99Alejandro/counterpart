/** Formats cents as dollars for spoken text or UI. */
export function formatMoney(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Tax on the taxable subtotal, in cents, rounded half-up exactly once. */
export function taxOn(taxableSubtotalCents: number, taxRateBps: number): number {
  return Math.floor((taxableSubtotalCents * taxRateBps) / 10_000 + 0.5);
}
