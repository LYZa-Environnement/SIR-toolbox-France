/**
 * Reads the sampling sheet workbooks of a soil gas campaign (one sheet per
 * tab), in the browser.
 */

import type { Cell } from './parse.ts'
import { lireFichesGaz, type FicheGaz } from './fichesGaz.ts'

export interface EtatFichesGaz {
  fiches: FicheGaz[]
  fichiers: string[]
  ignores: string[]
}

/** Reads the sampling sheet workbooks (one sheet per tab). */
export async function lireClasseurs(liste: File[]): Promise<EtatFichesGaz> {
  const XLSX = await import('xlsx')
  const etat: EtatFichesGaz = { fiches: [], fichiers: [], ignores: [] }
  for (const f of liste) {
    const classeur = XLSX.read(await f.arrayBuffer(), { type: 'array' })
    const feuilles = classeur.SheetNames.map((nom) => ({
      nom,
      grille: XLSX.utils.sheet_to_json<Cell[]>(classeur.Sheets[nom], { header: 1, raw: true, defval: null }),
    }))
    const { fiches, ignores } = lireFichesGaz(feuilles)
    etat.fiches.push(...fiches)
    etat.ignores.push(...ignores.map((o) => (liste.length > 1 ? `${f.name} › ${o}` : o)))
    etat.fichiers.push(f.name)
  }
  return etat
}

