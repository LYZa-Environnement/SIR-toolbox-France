/// <reference lib="webworker" />
/** Worker of the 3D model: runs a calculation of calcul.ts by name. */

import { CALCULS, type NomCalcul } from './calcul.ts'

self.onmessage = (e: MessageEvent<{ id: number; nom: NomCalcul; args: unknown[] }>) => {
  const { id, nom, args } = e.data
  try {
    const resultat = (CALCULS[nom] as (...a: unknown[]) => unknown)(...args)
    self.postMessage({ id, resultat })
  } catch (err) {
    self.postMessage({ id, erreur: err instanceof Error ? err.message : String(err) })
  }
}
