/**
 * Admission of excavated soil to an inert waste landfill (ISDI): arrêté du
 * 12 décembre 2014, annexe II — leaching test NF EN 12457-2 (mg/kg MS at
 * L/S = 10 l/kg) and total content (mg/kg MS), with the table notes:
 *
 * (1) chloride, sulphate, soluble fraction: a waste exceeding one of them is
 *     still compliant if it meets either the chloride and sulphate values,
 *     or the soluble fraction value;
 * (2) sulphate above 1 000 mg/kg may still be accepted on a percolation test
 *     (1 500 mg/l at L/S = 0,1 and 6 000 mg/kg at L/S = 10) — not in a
 *     standard lab report, hence flagged rather than decided;
 * (3) COT on eluate above 500 mg/kg may be retested at pH 7,5–8;
 * total COT note: for soils a higher value may be admitted if the COT on
 *     eluate (500 mg/kg MS) is met.
 */

import { normaliser } from '../guides.ts'
import type { Lecture, Mesure, Parametre } from '../parse.ts'

export interface Critere {
  code: string
  libelle: string
  valeur: number
  eluat: boolean
  variantes: string[]
}

export const CRITERES_ISDI: Critere[] = [
  { code: 'As', libelle: 'Arsenic (éluat)', valeur: 0.5, eluat: true, variantes: ['arsenic', 'as'] },
  { code: 'Ba', libelle: 'Baryum (éluat)', valeur: 20, eluat: true, variantes: ['baryum', 'barium', 'ba'] },
  { code: 'Cd', libelle: 'Cadmium (éluat)', valeur: 0.04, eluat: true, variantes: ['cadmium', 'cd'] },
  { code: 'Cr', libelle: 'Chrome total (éluat)', valeur: 0.5, eluat: true, variantes: ['chrome', 'chrometotal', 'cr'] },
  { code: 'Cu', libelle: 'Cuivre (éluat)', valeur: 2, eluat: true, variantes: ['cuivre', 'cu'] },
  { code: 'Hg', libelle: 'Mercure (éluat)', valeur: 0.01, eluat: true, variantes: ['mercure', 'hg'] },
  { code: 'Mo', libelle: 'Molybdène (éluat)', valeur: 0.5, eluat: true, variantes: ['molybdene', 'mo'] },
  { code: 'Ni', libelle: 'Nickel (éluat)', valeur: 0.4, eluat: true, variantes: ['nickel', 'ni'] },
  { code: 'Pb', libelle: 'Plomb (éluat)', valeur: 0.5, eluat: true, variantes: ['plomb', 'pb'] },
  { code: 'Sb', libelle: 'Antimoine (éluat)', valeur: 0.06, eluat: true, variantes: ['antimoine', 'sb'] },
  { code: 'Se', libelle: 'Sélénium (éluat)', valeur: 0.1, eluat: true, variantes: ['selenium', 'se'] },
  { code: 'Zn', libelle: 'Zinc (éluat)', valeur: 4, eluat: true, variantes: ['zinc', 'zn'] },
  { code: 'Cl', libelle: 'Chlorures (éluat)', valeur: 800, eluat: true, variantes: ['chlorures', 'chlorure', 'chlorureslibres', 'chlorurelibre'] },
  { code: 'F', libelle: 'Fluorures (éluat)', valeur: 10, eluat: true, variantes: ['fluorures', 'fluorure'] },
  { code: 'SO4', libelle: 'Sulfates (éluat)', valeur: 1000, eluat: true, variantes: ['sulfates', 'sulfate'] },
  { code: 'Phenols', libelle: 'Indice phénols (éluat)', valeur: 1, eluat: true, variantes: ['indicephenol', 'indicephenols', 'phenolsindice'] },
  { code: 'COTe', libelle: 'COT sur éluat', valeur: 500, eluat: true, variantes: ['cot', 'codcotsureluat', 'cotsureluat', 'cod'] },
  { code: 'FS', libelle: 'Fraction soluble (éluat)', valeur: 4000, eluat: true, variantes: ['fractionsoluble', 'fs'] },
  { code: 'COT', libelle: 'COT (sol brut)', valeur: 30000, eluat: false, variantes: ['cot', 'cotsursolbrut', 'carboneorganiquetotal'] },
  { code: 'BTEX', libelle: 'BTEX', valeur: 6, eluat: false, variantes: ['btextotaux', 'btex', 'sommedesbtex'] },
  { code: 'PCB', libelle: 'PCB (7 congénères)', valeur: 1, eluat: false, variantes: ['pcb7', 'pcbtotaux7', 'pcb7congeneres', 'sommedes7pcb', 'pcbsommedes7congeneres'] },
  { code: 'HCT', libelle: 'Hydrocarbures C10-C40', valeur: 500, eluat: false, variantes: ['hydrocarburestotauxc10c40', 'indicehydrocarburesc10c40', 'hydrocarburesc10c40', 'hctc10c40'] },
  { code: 'HAP', libelle: 'HAP (somme)', valeur: 50, eluat: false, variantes: ['sommedehap15etnaphtalenevolatil', 'sommedes16hap', 'hap16', 'sommedeshap', 'haptotaux', 'sommehap', 'somme16hap'] },
]

const ELUAT = /[ée]luat|lixiv/i
const compact = (nom: string) => normaliser(nom.replace(/\(([^)]*)\)/g, ' $1 ')).replace(/ /g, '')

export type Statut = 'conforme' | 'depassement' | 'manquant'

export interface VerdictISDI {
  echantillon: string
  /** `affichage`: the result in mg/kg MS, as compared to the limit. */
  resultats: Record<string, { mesure: Mesure | null; affichage: string; statut: Statut }>
  admissible: boolean | null
  declassants: string[]
  manquants: string[]
  remarques: string[]
}

export function trouverCritere(params: Parametre[], c: Critere): Parametre | undefined {
  return params.find((p) => {
    if (c.eluat !== (ELUAT.test(p.famille) || ELUAT.test(p.nom))) return false
    if (!/mg\s*\/\s*kg/i.test(p.unite)) return false
    // µg/kg PCB are converted by the caller; only mg/kg rows compared here.
    return c.variantes.includes(compact(p.nom))
  })
}

function enMgKg(p: Parametre, m: Mesure): number {
  return m.valeur! * (/^µg|^ug/i.test(p.unite.trim()) ? 0.001 : 1)
}

export function admissibiliteISDI(lecture: Lecture, echantillons: string[]): { criteres: Critere[]; verdicts: VerdictISDI[] } | null {
  const params = lecture.parametres.CM
  const trouves = CRITERES_ISDI.map((c) => ({
    c,
    p:
      trouverCritere(params, c) ??
      // PCB are often reported in µg/kg MS.
      (c.code === 'PCB' ? params.find((p) => c.variantes.includes(compact(p.nom)) && /g\s*\/\s*kg/i.test(p.unite)) : undefined),
  }))
  if (trouves.filter((t) => t.p).length < 3) return null
  const verdicts: VerdictISDI[] = []
  for (const ech of echantillons) {
    const resultats: VerdictISDI['resultats'] = {}
    for (const { c, p } of trouves) {
      const m = p ? lecture.valeurs.CM[ech]?.[p.cle] : undefined
      if (!p || !m || m.valeur === null) {
        resultats[c.code] = { mesure: null, affichage: 'n.a.', statut: 'manquant' }
        continue
      }
      const v = enMgKg(p, m)
      const affichage = `${m.inferieur ? '<' : ''}${String(Number(v.toPrecision(3))).replace('.', ',')}`
      resultats[c.code] = { mesure: m, affichage, statut: !m.inferieur && v > c.valeur ? 'depassement' : 'conforme' }
    }
    if (Object.values(resultats).every((r) => r.statut === 'manquant')) continue
    const remarques: string[] = []
    const depasse = (code: string) => resultats[code]?.statut === 'depassement'
    const ok = (code: string) => resultats[code]?.statut === 'conforme'
    // Note (1): chloride / sulphate / soluble fraction compensate.
    if (depasse('Cl') || depasse('SO4') || depasse('FS')) {
      if (ok('Cl') && ok('SO4')) {
        resultats.FS.statut = 'conforme'
        remarques.push('Fraction soluble dépassée mais chlorures et sulfates conformes : conforme (note 1).')
      } else if (ok('FS')) {
        if (depasse('Cl')) resultats.Cl.statut = 'conforme'
        if (depasse('SO4')) resultats.SO4.statut = 'conforme'
        remarques.push('Chlorures ou sulfates dépassés mais fraction soluble conforme : conforme (note 1).')
      }
    }
    if (depasse('SO4')) remarques.push('Sulfates > 1 000 mg/kg : admissible si un essai de percolation respecte 1 500 mg/l (L/S = 0,1) et 6 000 mg/kg (L/S = 10) (note 2).')
    if (depasse('COTe')) remarques.push('COT sur éluat > 500 mg/kg : un nouvel essai à pH 7,5–8 peut être réalisé (note 3).')
    // Total COT: for soils, admitted if COT on eluate is met.
    if (depasse('COT') && ok('COTe')) {
      resultats.COT.statut = 'conforme'
      remarques.push('COT sur sol brut > 30 000 mg/kg admis pour un sol, le COT sur éluat étant conforme.')
    }
    const declassants = CRITERES_ISDI.filter((c) => resultats[c.code].statut === 'depassement').map((c) => c.libelle)
    const manquants = CRITERES_ISDI.filter((c) => resultats[c.code].statut === 'manquant').map((c) => c.libelle)
    verdicts.push({
      echantillon: ech,
      resultats,
      admissible: declassants.length ? false : manquants.length ? null : true,
      declassants,
      manquants,
      remarques,
    })
  }
  return verdicts.length ? { criteres: CRITERES_ISDI, verdicts } : null
}
