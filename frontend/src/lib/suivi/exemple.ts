/**
 * A made-up monitoring history to try the tool with: five wells, two
 * campaigns a year (high water in March, low water in September) from
 * 2019 to 2025, a chlorinated-solvent plume being dechlorinated at the
 * source, a hydrocarbon spot slowly attenuating, a plume front reaching a
 * downgradient well in 2022, a lab change lowering the LQ of vinyl
 * chloride, a well left dry once and one doubtful result. Every figure is
 * fictitious.
 */

import type { Mesure } from '../resultats/parse.ts'
import { lotsHistorique, type Historique, type LigneHistorique } from './historique.ts'
import type { FichierLu } from './import.ts'
import { nouvelId, type Releve } from './modele.ts'
import { anneeDecimale } from './stats.ts'

/** Deterministic pseudo-random numbers (mulberry32), so the example is the same every time. */
function aleatoire(graine: number) {
  let a = graine
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Def {
  nom: string
  cas: string
  famille: string
  unite: string
  /** LQ at a date (decimal year). */
  lq: (t: number) => number
}

const COMPOSES: Def[] = [
  { nom: 'Tétrachloroéthylène', cas: '127-18-4', famille: 'COHV', unite: 'µg/l', lq: () => 0.5 },
  { nom: 'Trichloroéthylène', cas: '79-01-6', famille: 'COHV', unite: 'µg/l', lq: () => 0.5 },
  { nom: 'cis-1,2-Dichloroéthylène', cas: '156-59-2', famille: 'COHV', unite: 'µg/l', lq: () => 0.5 },
  { nom: 'Chlorure de vinyle', cas: '75-01-4', famille: 'COHV', unite: 'µg/l', lq: (t) => (t < 2021.5 ? 1 : 0.2) },
  { nom: '1,1-Dichloroéthylène', cas: '75-35-4', famille: 'COHV', unite: 'µg/l', lq: () => 0.5 },
  { nom: 'Trichlorométhane (chloroforme)', cas: '67-66-3', famille: 'COHV', unite: 'µg/l', lq: () => 0.5 },
  { nom: 'Tétrachlorure de carbone', cas: '56-23-5', famille: 'COHV', unite: 'µg/l', lq: () => 0.5 },
  { nom: 'Benzène', cas: '71-43-2', famille: 'BTEX', unite: 'µg/l', lq: (t) => (t < 2021.5 ? 1 : 0.5) },
  { nom: 'Toluène', cas: '108-88-3', famille: 'BTEX', unite: 'µg/l', lq: () => 1 },
  { nom: 'Ethylbenzène', cas: '100-41-4', famille: 'BTEX', unite: 'µg/l', lq: () => 1 },
  { nom: 'Xylènes (m+p- et o-)', cas: '1330-20-7', famille: 'BTEX', unite: 'µg/l', lq: () => 2 },
  { nom: 'Naphtalène', cas: '91-20-3', famille: 'HAP', unite: 'µg/l', lq: () => 0.05 },
  { nom: 'Hydrocarbures C10-C40', cas: '', famille: 'Hydrocarbures', unite: 'µg/l', lq: () => 50 },
  { nom: 'Arsenic', cas: '7440-38-2', famille: 'Métaux', unite: 'µg/l', lq: () => 1 },
  { nom: 'Nickel', cas: '7440-02-0', famille: 'Métaux', unite: 'µg/l', lq: () => 2 },
]

type Profil = Partial<Record<string, (t: number, he: boolean, r: () => number) => number>>

/** Log-normal noise: ×/÷ about (1 + s). */
const bruit = (r: () => number, s: number) => Math.exp((r() + r() + r() - 1.5) * s * 1.2)

const decroit = (c0: number, demiVie: number) => (t: number) => c0 * Math.pow(0.5, (t - 2019.2) / demiVie)
const croit = (c0: number, doublement: number) => (t: number) => c0 * Math.pow(2, (t - 2019.2) / doublement)

const PROFILS: Record<string, Profil> = {
  PZ1: {
    Arsenic: (_t, _he, r) => 3.2 * bruit(r, 0.15),
    Nickel: (_t, _he, r) => (r() < 0.3 ? 2.5 * bruit(r, 0.2) : 0),
  },
  PZ2: {
    'Tétrachloroéthylène': (t, he, r) => decroit(820, 2.6)(t) * (he ? 1.35 : 0.85) * bruit(r, 0.2),
    'Trichloroéthylène': (t, he, r) => decroit(310, 4.5)(t) * (he ? 1.25 : 0.9) * bruit(r, 0.2),
    'cis-1,2-Dichloroéthylène': (t, _he, r) => croit(95, 2.8)(t) * bruit(r, 0.2),
    'Chlorure de vinyle': (t, _he, r) => (t < 2020 ? 0 : croit(4, 1.6)(t) * bruit(r, 0.25)),
    Arsenic: (_t, _he, r) => 6.5 * bruit(r, 0.2),
    Nickel: (_t, _he, r) => 8 * bruit(r, 0.2),
  },
  PZ3: {
    'Tétrachloroéthylène': (_t, he, r) => 38 * (he ? 1.2 : 0.85) * bruit(r, 0.25),
    'Trichloroéthylène': (_t, _he, r) => 16 * bruit(r, 0.25),
    'cis-1,2-Dichloroéthylène': (t, _he, r) => croit(9, 3)(t) * bruit(r, 0.2),
    'Chlorure de vinyle': (t, _he, r) => (t < 2022 ? 0 : 0.35 * Math.pow(2, (t - 2022) / 1.5) * bruit(r, 0.2)),
    Arsenic: (_t, _he, r) => 4.1 * bruit(r, 0.2),
  },
  PZ4: {
    'Trichloroéthylène': (t, _he, r) => (t < 2022.0 ? 1.8 * bruit(r, 0.3) : 24 * bruit(r, 0.2)),
    'Tétrachloroéthylène': (t, _he, r) => (t < 2022.0 ? 0 : 3.5 * bruit(r, 0.3)),
    Arsenic: (_t, _he, r) => 2.4 * bruit(r, 0.2),
  },
  PZ5: {
    'Benzène': (t, he, r) => decroit(48, 1.9)(t) * (he ? 1.3 : 0.85) * bruit(r, 0.2),
    'Toluène': (t, _he, r) => decroit(120, 1.4)(t) * bruit(r, 0.25),
    'Ethylbenzène': (t, _he, r) => decroit(35, 2.2)(t) * bruit(r, 0.25),
    'Xylènes (m+p- et o-)': (t, _he, r) => decroit(90, 1.8)(t) * bruit(r, 0.25),
    'Naphtalène': (_t, _he, r) => 6 * bruit(r, 0.3),
    'Hydrocarbures C10-C40': (t, _he, r) => decroit(1900, 3.2)(t) * bruit(r, 0.25),
    Arsenic: (_t, _he, r) => 11 * bruit(r, 0.15),
  },
}

const OUVRAGES = [
  { nom: 'PZ1', position: 'amont' as const, x: 652300, y: 6862420, repere: 54.2, charge: 52.6 },
  { nom: 'PZ2', position: 'droit' as const, x: 652355, y: 6862305, repere: 53.8, charge: 51.9 },
  { nom: 'PZ3', position: 'aval' as const, x: 652430, y: 6862205, repere: 53.1, charge: 51.2 },
  { nom: 'PZ4', position: 'aval' as const, x: 652530, y: 6862080, repere: 52.4, charge: 50.4 },
  { nom: 'PZ5', position: 'droit' as const, x: 652290, y: 6862215, repere: 53.5, charge: 51.5 },
]

const arrondi = (x: number) => Number(x.toPrecision(x < 1 ? 2 : 3))
const enTexte = (x: number) => String(arrondi(x)).replace('.', ',')

export function exemple(): FichierLu {
  const r = aleatoire(20260118)
  const lignes: LigneHistorique[] = []
  const niveaux: Historique['niveaux'] = []
  const releves: Releve[] = []
  for (let annee = 2019; annee <= 2025; annee++) {
    for (const [mois, jour, he] of [
      [3, 12, true],
      [9, 17, false],
    ] as const) {
      const date = `${annee}-${String(mois).padStart(2, '0')}-${jour}`
      const t = anneeDecimale(date)
      const campagne = `${he ? 'HE' : 'BE'} ${annee}`
      for (const o of OUVRAGES) {
        // PZ4 dry in low water 2020.
        if (o.nom === 'PZ4' && annee === 2020 && !he) continue
        const battement = (he ? 0.55 : -0.5) + (r() - 0.5) * 0.3 - (annee === 2022 ? 0.4 : 0)
        const charge = Number((o.charge + battement).toFixed(2))
        niveaux.push({ ouvrage: o.nom, date, profondeur: Number((o.repere - charge).toFixed(2)), charge })
        const reducteur = o.nom === 'PZ2' ? -40 - (t - 2019) * 22 : o.nom === 'PZ3' ? 20 - (t - 2019) * 8 : 160
        releves.push({
          ouvrage: o.nom,
          date,
          profondeur: null,
          charge: null,
          terrain: {
            orp: Math.round(reducteur + (r() - 0.5) * 30),
            od: Number(Math.max(0.1, (o.nom === 'PZ2' ? 0.6 : o.nom === 'PZ1' ? 6.5 : 2.5) * bruit(r, 0.2)).toFixed(2)),
            ph: Number((7.1 + (r() - 0.5) * 0.3).toFixed(2)),
            ce: Math.round((o.nom === 'PZ5' ? 980 : 720) * bruit(r, 0.08)),
          },
          source: 'Exemple',
        })
        for (const c of COMPOSES) {
          const lq = c.lq(t)
          const f = PROFILS[o.nom][c.nom]
          let v = f ? f(t, he, r) : 0
          // One doubtful result: PZ3, low water 2021.
          if (o.nom === 'PZ3' && c.nom === 'Tétrachloroéthylène' && annee === 2021 && !he) v *= 9
          const mesure: Mesure = v >= lq ? { brut: enTexte(v), valeur: arrondi(v), inferieur: false } : { brut: `<${enTexte(lq)}`, valeur: lq, inferieur: true }
          lignes.push({ ouvrage: o.nom, date, campagne, parametre: c.nom, cas: c.cas, unite: c.unite, mesure, famille: c.famille, regime: he ? 'HE' : 'BE' })
        }
      }
    }
  }
  const h: Historique = {
    lignes,
    ouvrages: OUVRAGES.map((o) => ({ nom: o.nom, position: o.position, x: o.x, y: o.y, repere: o.repere })),
    niveaux,
    ignorees: 0,
  }
  const lots = lotsHistorique(h).map((l) => ({
    id: nouvelId('l'),
    fichier: 'Exemple (données fictives)',
    lecture: l.lecture,
    date: l.date,
    origineDate: 'historique' as const,
    libelle: l.libelle,
    regime: l.regime,
  }))
  return {
    id: nouvelId('f'),
    nom: 'Exemple (données fictives)',
    type: 'historique',
    lots,
    releves: [...h.niveaux.map((n) => ({ ouvrage: n.ouvrage, date: n.date, profondeur: n.profondeur, charge: n.charge, terrain: {}, source: 'Exemple' })), ...releves],
    ouvrages: h.ouvrages,
    resume: `${lignes.length} résultats sur ${lots.length} campagnes · 5 ouvrages · niveaux et paramètres de terrain — données fictives`,
    avertissements: [],
  }
}
