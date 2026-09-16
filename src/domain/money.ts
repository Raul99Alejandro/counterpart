/** Formatea centavos como dólares para texto hablado o UI. */
export function formatMoney(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Impuesto sobre el subtotal gravable, en centavos, con redondeo half-up una sola vez. */
export function taxOn(taxableSubtotalCents: number, taxRateBps: number): number {
  return Math.floor((taxableSubtotalCents * taxRateBps) / 10_000 + 0.5);
}
