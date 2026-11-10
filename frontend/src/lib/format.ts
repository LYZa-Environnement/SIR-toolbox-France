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
