/** Numbers of the model's panels, in French: three significant figures under 1, two decimals above, whole numbers past 1 000. */
export function fr(x: number | null | undefined, chiffres = 3): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '–'
  const a = Math.abs(x)
  const v = a >= 1000 ? Math.round(x) : a >= 1 ? Number(x.toFixed(2)) : Number(x.toPrecision(chiffres))
  return v.toLocaleString('fr-FR', { maximumFractionDigits: 6 })
}

/** A length in metres, to the centimetre. */
export const frM = (x: number | null | undefined) => (x === null || x === undefined ? '–' : `${fr(Math.round(x * 100) / 100)} m`)
