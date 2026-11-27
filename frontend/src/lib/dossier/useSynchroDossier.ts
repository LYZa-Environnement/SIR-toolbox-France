import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react'
import { abonner, demarrer, lireEtat, type EtatSession } from './session'
import { SynchroOutil, type EtatSynchro, type OptionsSynchro } from './synchro'

/**
 * Keeps a tool's work in the open dossier.
 *
 *   const sauve = useMemo(() => ({ fichiers, reglages }), [fichiers, reglages])
 *   useSynchroDossier({ outil: 'suivi-temporel', version: 1, etat: sauve, appliquer, estVide: fichiers.length === 0 })
 *
 * `etat` must be memoised: every new value is a change, saved a moment later
 * (nothing is written when it encodes to what is already on disk).
 */
export function useSynchroDossier<T>({
  outil,
  version,
  etat,
  appliquer,
  estVide,
  migrer,
}: {
  outil: string
  version: number
  etat: T
  appliquer: (donnees: T) => void
  estVide: boolean
  migrer?: OptionsSynchro<T>['migrer']
}): EtatSynchro {
  const options: OptionsSynchro<T> = { outil, version, lire: () => etat, appliquer, estVide: () => estVide, migrer }
  const [synchro] = useState(() => new SynchroOutil<T>(options))
  // The callbacks of this render, before any effect can call them.
  useLayoutEffect(() => synchro.configurer(options))
  useEffect(() => {
    synchro.attacher()
    return () => synchro.detacher()
  }, [synchro])
  useEffect(() => synchro.signaler(), [synchro, etat])
  return useSyncExternalStore(synchro.abonner, synchro.lireEtat)
}

/** The dossier open in this tab. */
export function useDossier(): EtatSession {
  useEffect(() => void demarrer(), [])
  return useSyncExternalStore(abonner, lireEtat)
}
