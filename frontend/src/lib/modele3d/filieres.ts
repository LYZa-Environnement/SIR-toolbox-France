/**
 * Excavated soil by disposal route, sample by sample, then in volume.
 *
 * Each soil sample is read against:
 * - the inert-waste landfill criteria (ISDI): arrêté du 12 décembre 2014,
 *   annexe II, with its notes, as Résultats labo applies them
 *   (lib/resultats/expert/isdi.ts);
 * - the leaching limits for non-hazardous-waste landfills (ISDND) and
 *   hazardous-waste landfills (ISDD): décision 2003/33/CE du Conseil,
 *   annexe, points 2.2.2 and 2.4.1 (mg/kg MS at L/S = 10 l/kg), taken up
 *   by the arrêté du 15 février 2016 (ISDND) and the arrêté du 30 décembre
 *   2002 (ISDD).
 *
 * Route proposed: ISDI when every criterion is met; else ISDND when no
 * leaching result exceeds the ISDND limits; ISDD when one does but none
 * exceeds the ISDD limits; beyond the ISDD limits, a treatment first. A
 * sample whose pack is incomplete and has no exceedance stays undecided.
 * This is an orientation: whether a soil is a hazardous waste depends on
 * its hazardous properties (HP 1 to HP 15), not on leaching alone, and the
 * receiving site has the last word.
 *
 * Volumes: each block of the model within the site (parcels) and between
 * the ground and the base takes the route of the nearest sample (a vertical
 * metre counting as five horizontal ones), within three quarters of the
 * spacing of the sampled boreholes and a metre above and below a sampled
 * interval; the rest is not characterised. Pure.
 */

import { admissibiliteISDI, CRITERES_ISDI, trouverCritere, type VerdictISDI } from '../resultats/expert/isdi.ts'
import type { Lecture, Parametre } from '../resultats/parse.ts'
import { espacementMedian, valeurEn } from './interpolation.ts'
import { indexBloc, predicatEmprise, type Modele } from './modele.ts'
import type { ParametreSol } from './types.ts'

export type Filiere = 'isdi' | 'isdnd' | 'isdd' | 'traitement' | 'indetermine'

export const FILIERES: Record<Filiere, { libelle: string; court: string; couleur: string }> = {
  isdi: { libelle: 'Inerte : ISDI', court: 'ISDI', couleur: '#2f8f5b' },
  isdnd: { libelle: 'Non inerte, non dangereux : ISDND', court: 'ISDND', couleur: '#d9a521' },
  isdd: { libelle: 'Dangereux au vu de la lixiviation : ISDD', court: 'ISDD', couleur: '#e0662f' },
  traitement: { libelle: 'Au-delà des seuils ISDD : traitement préalable', court: 'Traitement', couleur: '#8c1d18' },
  indetermine: { libelle: 'Indéterminé (analyses incomplètes)', court: 'Indéterminé', couleur: '#8f9c9a' },
}

export const ORDRE_FILIERES: Filiere[] = ['isdi', 'isdnd', 'isdd', 'traitement', 'indetermine']

/** Leaching limits (mg/kg MS, L/S = 10): décision 2003/33/CE, annexe, 2.2.2 (ISDND) and 2.4.1 (ISDD). */
export const LIXIVIATION: Record<string, { isdnd: number; isdd: number }> = {
  As: { isdnd: 2, isdd: 25 },
  Ba: { isdnd: 100, isdd: 300 },
  Cd: { isdnd: 1, isdd: 5 },
  Cr: { isdnd: 10, isdd: 70 },
  Cu: { isdnd: 50, isdd: 100 },
  Hg: { isdnd: 0.2, isdd: 2 },
  Mo: { isdnd: 10, isdd: 30 },
  Ni: { isdnd: 10, isdd: 40 },
  Pb: { isdnd: 10, isdd: 50 },
  Sb: { isdnd: 0.7, isdd: 5 },
  Se: { isdnd: 0.5, isdd: 7 },
  Zn: { isdnd: 50, isdd: 200 },
  Cl: { isdnd: 15000, isdd: 25000 },
  F: { isdnd: 150, isdd: 500 },
  SO4: { isdnd: 20000, isdd: 50000 },
  COTe: { isdnd: 800, isdd: 1000 },
  FS: { isdnd: 60000, isdd: 100000 },
}

export interface Classement {
  cle: string
  forage: string
  echantillon: string
  filiere: Filiere
  /** Criteria behind it: ISDI exceedances, leaching above the ISDND / ISDD limits. */
  motifs: string[]
  manquants: number
  remarques: string[]
}

const ELUAT_FAMILLE = 'Lixiviation (éluat)'

/** The soil results of the model as a lab reading, for the ISDI module. */
function lectureSols(m: Modele, parametres: ParametreSol[]): { lecture: Lecture; ids: { cle: string; forage: string; echantillon: string; nom: string }[] } {
  const params: Parametre[] = parametres.map((p) => ({
    cle: p.cle,
    famille: p.eluat ? ELUAT_FAMILLE : p.famille,
    nom: p.nom,
    cas: p.cas,
    unite: p.unite,
    versMicrogrammes: 1,
    somme: false,
  }))
  const ids: { cle: string; forage: string; echantillon: string; nom: string }[] = []
  const valeurs: Lecture['valeurs']['CM'] = {}
  for (const pt of m.points)
    for (const e of pt.forage?.echantillons ?? []) {
      if (!Object.keys(e.resultats).length) continue
      const nom = `${pt.cle}\u0001${e.id}`
      ids.push({ cle: pt.cle, forage: pt.nom, echantillon: e.id, nom })
      valeurs[nom] = Object.fromEntries(Object.entries(e.resultats).map(([k, v]) => [k, { brut: v.brut, valeur: v.valeur, inferieur: v.inferieur }]))
    }
  return {
    lecture: { points: ids.map((i) => ({ nom: i.nom, libelles: {} })), parametres: { CM: params, CC: [] }, valeurs: { CM: valeurs, CC: {} }, coucheControle: false, lignesIgnorees: [], unites: [], mode: 'tout' },
    ids,
  }
}

/** Route of every soil sample with results. Null when the soil results hold too few ISDI criteria (3 at least). */
export function classerEchantillons(m: Modele, parametres: ParametreSol[]): Classement[] | null {
  const { lecture, ids } = lectureSols(m, parametres)
  const isdi = admissibiliteISDI(lecture, ids.map((i) => i.nom))
  if (!isdi) return null
  const parNom = new Map<string, VerdictISDI>(isdi.verdicts.map((v) => [v.echantillon, v]))
  const params = lecture.parametres.CM
  const eluats = CRITERES_ISDI.filter((c) => c.eluat && LIXIVIATION[c.code]).map((c) => ({ c, p: trouverCritere(params, c) }))
  return ids.map((id) => {
    const v = parNom.get(id.nom)
    const motifs: string[] = []
    let niveau = 0 // 0 ISDND, 1 ISDD, 2 beyond
    for (const { c, p } of eluats) {
      const r = p ? lecture.valeurs.CM[id.nom]?.[p.cle] : undefined
      if (!r || r.valeur === null || r.inferieur) continue
      const l = LIXIVIATION[c.code]
      if (r.valeur > l.isdd) {
        niveau = 2
        motifs.push(`${c.libelle} ${String(r.valeur).replace('.', ',')} > ${String(l.isdd).replace('.', ',')} (ISDD)`)
      } else if (r.valeur > l.isdnd) {
        niveau = Math.max(niveau, 1)
        motifs.push(`${c.libelle} ${String(r.valeur).replace('.', ',')} > ${String(l.isdnd).replace('.', ',')} (ISDND)`)
      }
    }
    let filiere: Filiere
    if (niveau === 2) filiere = 'traitement'
    else if (niveau === 1) filiere = 'isdd'
    else if (v?.admissible === true) filiere = 'isdi'
    else if (v && v.declassants.length) {
      filiere = 'isdnd'
      motifs.unshift(...v.declassants.map((d) => `${d} au-delà du critère ISDI`))
    } else filiere = 'indetermine'
    const cohv = parametres.some((p) => /COHV|chlor/i.test(p.famille) && !p.eluat && (() => {
      const r = lecture.valeurs.CM[id.nom]?.[p.cle]
      return r && !r.inferieur && r.valeur !== null
    })())
    return {
      cle: id.cle,
      forage: id.forage,
      echantillon: id.echantillon,
      filiere,
      motifs,
      manquants: v?.manquants.length ?? CRITERES_ISDI.length,
      remarques: [...(v?.remarques ?? []), ...(cohv ? ['COHV quantifiés : non visés par l’annexe II ; l’acceptation en ISDI reste à l’appréciation de l’exploitant.'] : [])],
    }
  })
}

export interface VolumesFilieres {
  echantillons: Classement[]
  /** 1 + index in ORDRE_FILIERES for each block, 0 when not characterised or outside. */
  valeurs: Uint8Array
  /** m³ by route, and not characterised within the site. */
  volumes: Record<Filiere | 'non-caracterise', number>
}

/** Volume of soil by route, block by block (see the header). */
export function volumesFilieres(m: Modele, parametres: ParametreSol[], anisotropie = 5): VolumesFilieres | null {
  const echantillons = classerEchantillons(m, parametres)
  if (!echantillons) return null
  const g = m.blocs
  const valeurs = new Uint8Array(g.nx * g.ny * g.nz)
  const volumes: VolumesFilieres['volumes'] = { isdi: 0, isdnd: 0, isdd: 0, traitement: 0, indetermine: 0, 'non-caracterise': 0 }
  const parCle = new Map(echantillons.map((c) => [`${c.cle}\u0001${c.echantillon}`, c]))
  const pts = m.points.flatMap((p) =>
    p.place
      ? (p.forage?.echantillons ?? []).flatMap((e) => {
          const c = parCle.get(`${p.cle}\u0001${e.id}`)
          return c ? [{ x: p.x, y: p.y, z: p.zSol - (e.de + e.a) / 2, haut: p.zSol - e.de + 1, bas: p.zSol - e.a - 1, rang: ORDRE_FILIERES.indexOf(c.filiere) }] : []
        })
      : [],
  )
  if (!pts.length) return { echantillons, valeurs, volumes }
  const sondages = [...new Map(pts.map((p) => [`${p.x},${p.y}`, { x: p.x, y: p.y }])).values()]
  const portee = Math.max(5, 0.75 * (espacementMedian(sondages) || m.portee))
  const dedans = predicatEmprise(m)
  const vBloc = g.dx * g.dy * g.dz
  const plusBas = Math.min(...pts.map((p) => p.bas))
  for (let j = 0; j < g.ny; j++) {
    const y = g.y0 + (j + 0.5) * g.dy
    for (let i = 0; i < g.nx; i++) {
      const x = g.x0 + (i + 0.5) * g.dx
      if (!dedans(x, y)) continue
      const s = valeurEn(m.sol, x, y)
      const b = valeurEn(m.base, x, y)
      const dh2 = pts.map((p) => (p.x - x) ** 2 + (p.y - y) ** 2)
      for (let k = 0; k < g.nz; k++) {
        const z = g.z0 + (k + 0.5) * g.dz
        if (z > s || z < b) continue
        let meilleur = -1
        let dMin = Number.POSITIVE_INFINITY
        for (let q = 0; q < pts.length; q++) {
          if (dh2[q] > portee * portee || z > pts[q].haut || z < pts[q].bas) continue
          const d = dh2[q] + (anisotropie * (pts[q].z - z)) ** 2
          if (d < dMin) [dMin, meilleur] = [d, q]
        }
        if (meilleur < 0) {
          // Only the ground actually dug into is counted as not characterised: down to the deepest sample.
          if (z >= plusBas) volumes['non-caracterise'] += vBloc
          continue
        }
        valeurs[indexBloc(g, i, j, k)] = pts[meilleur].rang + 1
        volumes[ORDRE_FILIERES[pts[meilleur].rang]] += vBloc
      }
    }
  }
  return { echantillons, valeurs, volumes }
}
