import type { Valeur } from '../../lib/pfas/lecture'
import type { Matrice } from '../../lib/pfas/reperes'

/** 3 significant digits at most, French separators. */
export function nombre(x: number): string {
  if (x === 0) return '0'
  const arrondi = Number(x.toPrecision(3))
  return arrondi.toLocaleString('fr-FR', { maximumFractionDigits: 6 })
}

/** A value in the tool's unit, switched to µg/l or mg/kg when large. */
export function grandeur(x: number, matrice: Matrice): string {
  if (matrice === 'eau') return x >= 1000 ? `${nombre(x / 1000)} µg/l` : `${nombre(x)} ng/l`
  return x >= 1000 ? `${nombre(x / 1000)} mg/kg MS` : `${nombre(x)} µg/kg MS`
}

export function valeurTexte(v: Valeur | null | undefined, matrice: Matrice): string {
  if (!v) return 'non analysé'
  return `${v.inferieur ? '< ' : ''}${grandeur(v.valeur, matrice)}`
}

/** Tick labels of a log axis, one per decade. */
export function graduation(puissance: number, matrice: Matrice): string {
  const x = 10 ** puissance
  if (matrice === 'eau') {
    if (x >= 1e6) return `${nombre(x / 1e6)} mg/l`
    if (x >= 1e3) return `${nombre(x / 1e3)} µg/l`
    return `${nombre(x)} ng/l`
  }
  if (x >= 1e6) return `${nombre(x / 1e6)} g/kg`
  if (x >= 1e3) return `${nombre(x / 1e3)} mg/kg`
  return `${nombre(x)} µg/kg`
}
