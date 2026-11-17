import { useMemo, useState } from 'react'

export type Sens = 'asc' | 'desc'
export interface EtatTri {
  cle: string
  sens: Sens
}
export type Valeur = string | number | null | undefined

/** Numbers before text, missing values last whatever the direction; names in natural order (Pz2 < Pz10). */
export function comparer(a: Valeur, b: Valeur, sens: Sens): number {
  const vide = (x: Valeur) => x === null || x === undefined || x === '' || (typeof x === 'number' && !Number.isFinite(x))
  if (vide(a) && vide(b)) return 0
  if (vide(a)) return 1
  if (vide(b)) return -1
  const s = sens === 'asc' ? 1 : -1
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * s
  return String(a).localeCompare(String(b), 'fr', { numeric: true, sensitivity: 'base' }) * s
}

/**
 * Rows sorted by a column the user clicks: each click on a heading sorts by
 * it, a second click on the same heading reverses the order.
 */
export function useTri<T>(lignes: T[], cles: Record<string, (x: T) => Valeur>, initial: EtatTri | null = null) {
  const [tri, setTri] = useState<EtatTri | null>(initial)
  const tries = useMemo(() => {
    if (!tri || !cles[tri.cle]) return lignes
    const f = cles[tri.cle]
    return lignes
      .map((x, i) => ({ x, i }))
      .sort((a, b) => comparer(f(a.x), f(b.x), tri.sens) || a.i - b.i)
      .map((y) => y.x)
    // The accessors are rebuilt on each render; the order only depends on the rows and the sort.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lignes, tri])
  const trier = (cle: string) => setTri((t) => (t?.cle === cle ? { cle, sens: t.sens === 'asc' ? 'desc' : 'asc' } : { cle, sens: 'asc' }))
  return { tries, tri, trier, setTri }
}

