import { useEffect, useState } from 'react'
import type { CALCULS, NomCalcul } from '../../lib/modele3d/calcul'
import { executer } from '../../lib/modele3d/executeur'

type Resultat<N extends NomCalcul> = ReturnType<(typeof CALCULS)[N]>

/**
 * A calculation of the model run in the worker. `args` must be memoised (a
 * new array is a new calculation); null runs nothing. While a new result is
 * computed, the previous one is kept on screen.
 */
export function useCalcul<N extends NomCalcul>(nom: N, args: Readonly<Parameters<(typeof CALCULS)[N]>> | null): { resultat: Resultat<N> | null; enCours: boolean; erreur: string | null } {
  const [etat, setEtat] = useState<{ args: unknown; resultat: Resultat<N> | null; erreur: string | null } | null>(null)
  useEffect(() => {
    if (!args) return
    let actif = true
    executer(nom, ...(args as Parameters<(typeof CALCULS)[N]>))
      .then((resultat) => actif && setEtat({ args, resultat, erreur: null }))
      .catch((e: unknown) => actif && setEtat({ args, resultat: null, erreur: e instanceof Error ? e.message : String(e) }))
    return () => {
      actif = false
    }
  }, [nom, args])
  if (!args) return { resultat: null, enCours: false, erreur: null }
  const courant = etat?.args === args
  return { resultat: etat?.resultat ?? null, enCours: !courant, erreur: courant ? (etat?.erreur ?? null) : null }
}
