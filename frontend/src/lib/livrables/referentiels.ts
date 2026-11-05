/** The deliverables the tool checks. */

import { REFERENTIELS_ATTES } from './attes.ts'
import type { Referentiel } from './controles.ts'
import { REFERENTIEL_IOTA } from './iota.ts'
import { REFERENTIELS_NORMES } from './normes.ts'

const reglementaires: Referentiel[] = [
  ...REFERENTIELS_ATTES.map((r) => ({ ...r, categorie: 'Attestations ATTES (arrêté du 9 février 2022)', complements: r.id === 'attes-alur' ? ['nf5-alur'] : [] })),
  { ...REFERENTIEL_IOTA, categorie: 'Dossiers réglementaires' },
]

export const REFERENTIELS: Referentiel[] = [...reglementaires, ...REFERENTIELS_NORMES]

export const PAR_ID = new Map(REFERENTIELS.map((r) => [r.id, r]))

/** The checklists offered to choose from, by heading. */
export function categories(): [string, Referentiel[]][] {
  const m = new Map<string, Referentiel[]>()
  for (const r of REFERENTIELS) if (!r.masque) m.set(r.categorie ?? 'Autres', [...(m.get(r.categorie ?? 'Autres') ?? []), r])
  const ordre = (c: string) => {
    const i = ORDRE.findIndex((x) => c.startsWith(x))
    return i < 0 ? ORDRE.length : i
  }
  return [...m].sort(([a], [b]) => ordre(a) - ordre(b))
}

const ORDRE = ['Attestations', 'Dossiers réglementaires', 'Rapports d’études', 'Ingénierie des travaux', 'Exécution des travaux', 'Exigences communes']
