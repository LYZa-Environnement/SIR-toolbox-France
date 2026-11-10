/**
 * Numbers as the tools write them in French text: three significant
 * figures, decimal comma, at most `decimales` decimals.
 *
 *   nombreFr(1234.5) → "1 230" ; nombreFr(0.012345, 6) → "0,0123"
 */
export function nombreFr(x: number, decimales = 2): string {
  return Number(x.toPrecision(3)).toLocaleString('fr-FR', { maximumFractionDigits: decimales })
}

/** Same, with "-" for a missing or non-finite value. */
export function nombreFrOuTiret(x: number | null | undefined, decimales = 2): string {
  return x === null || x === undefined || !Number.isFinite(x) ? '-' : nombreFr(x, decimales)
}

/**
 * Calendar day of a date in the user's time zone, "AAAA-MM-JJ". Not
 * `toISOString()`, which gives the UTC day: in France, a date read from
 * Excel (local midnight) or an export made after midnight would land on
 * the day before.
 */
export function jourIso(d: Date = new Date()): string {
  const deux = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`
}
