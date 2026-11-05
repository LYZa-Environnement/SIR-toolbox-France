/**
 * From a lab reading (`resultats/parse.ts`) to PFAS samples: each row is
 * matched to one of the 22 substances, to the lab's "sum of the 20", to a
 * fluorine sum parameter (AOF, EOF), or set aside as another PFAS the tool
 * does not interpret. Values are brought to one unit per matrix — ng/l for
 * water, µg/kg dry matter for soils.
 *
 * Matching, in order: the CAS number when the lab gives it, then the
 * abbreviation in the name ("Acide perfluorooctanesulfonique (PFOS)"), then
 * the chemical name in French or English. A row naming two substances
 * ("Somme PFOS + PFOA") is not a substance. PFOS (or any substance) given
 * as linear and branched isomers is read as such; the total is the lab's
 * total row when there is one, else the sum of the isomers.
 */

import type { Lecture, Mesure, Parametre } from '../resultats/parse.ts'
import { qualifierAuto, type TypeEchantillon } from '../resultats/qualite.ts'
import type { Matrice } from './reperes.ts'
import { PAR_ID, SUBSTANCES, VINGT, type IdSubstance } from './substances.ts'

export type Isomere = 'lineaire' | 'ramifie'

export interface Valeur {
  /** In the tool's unit (ng/l or µg/kg MS); the LQ when `inferieur`. */
  valeur: number
  inferieur: boolean
  /** As written by the lab, with its unit. */
  brut: string
}

export interface EchantillonPfas {
  nom: string
  type: TypeEchantillon
  substances: Partial<Record<IdSubstance, Valeur>>
  isomeres: Partial<Record<IdSubstance, Partial<Record<Isomere, Valeur>>>>
  /** The lab's sum of the 20, or the tool's when the lab gives none. */
  somme: Valeur | null
  sommeCalculee: boolean
  /** Adsorbable / extractable organic fluorine, as fluorine (ng F/l, µg F/kg). */
  aof: Valeur | null
  eof: Valeur | null
}

export type Identification =
  | { genre: 'substance'; id: IdSubstance; isomere?: Isomere }
  | { genre: 'somme20' }
  | { genre: 'sommeIncertaine' }
  | { genre: 'aof' }
  | { genre: 'eof' }
  | { genre: 'autre' }

export interface LecturePfas {
  matrice: Matrice
  echantillons: EchantillonPfas[]
  /** Substances the file has a row for (analysed), whatever the results. */
  analysees: IdSubstance[]
  libelleSomme: string | null
  /** PFAS rows the tool does not interpret (GenX, ADONA, 8:2 FTS…). */
  autres: string[]
  /** How each PFAS row was read, for the user to check. */
  correspondances: { ligne: string; lu: string }[]
  avertissements: string[]
}

const sansAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const ABREVIATIONS = new Map<string, IdSubstance>()
for (const s of SUBSTANCES) {
  if (s.id === 'FTS62') continue
  ABREVIATIONS.set(s.abreviation.toLowerCase(), s.id)
  for (const v of s.variantes) ABREVIATIONS.set(v, s.id)
}
const PAR_CAS = new Map<string, IdSubstance>(SUBSTANCES.map((s) => [s.cas, s.id]))
// The PFOS anion, as some labs report it.
PAR_CAS.set('45298-90-6', 'PFOS')

const RADICAUX = ['but', 'pent', 'hex', 'hept', 'oct', 'non', 'dec', 'undec', 'dodec', 'tridec']
const RADICAL = '(tridec|dodec|undec|dec|non|oct|hept|hex|pent|but)'
const NOM_PFCA = new RegExp(`perfluoro${RADICAL}(an)?(oique|oic|oate|yr)`)
const NOM_PFSA = new RegExp(`perfluoro${RADICAL}(an)?e?sulfon`)
const NOM_PFSA_FR = new RegExp(`sulfon\\w*deperfluoro${RADICAL}`)
const FTS62 = /(^|[^0-9])6:?2(fts|fluorotelom\w*sulfon)|h4pfos|1h1h2h2hperfluorooctan\w*sulfon/
const AUTRE_PFAS =
  /perfluor|polyfluor|fluorotel|\bpf[a-z]{2,7}\b|\bgenx\b|hfpo|adona|\b\w*fosaa?\b|dipap|\bftca\b|\bftab\b|\bfts[a]?\b|pfesa|f-?53b|\d+:\d+/

/** Reads which PFAS quantity a lab row holds, if any. */
export function identifier(p: Pick<Parametre, 'nom' | 'cas'>): Identification | null {
  const n = sansAccents(p.nom)
  // "Perfluoro-n-butanoic acid", "perfluoro-1-butanesulfonate": the locant
  // says the chain is linear and is not part of the radical.
  const compact = n.replace(/perfluoro\s*-?\s*(n|1)\s*-/g, 'perfluoro').replace(/[^a-z0-9:]/g, '')
  const mots = n.split(/[^a-z0-9]+/).filter(Boolean)

  const estSomme = /somme|\bsum\b|\btotal|σ|∑|\btot\b/.test(n)
  const estPfas = /pfas|pfc|perfluor/.test(n)
  if (estSomme && estPfas && !/\b4\b|pfas ?4/.test(n)) {
    if (/\b20\b|directive|2184|\bdwd\b|edch|eau potable|drinking/.test(n)) return { genre: 'somme20' }
    if (/^(somme|sum|total|σ|∑)\s*(des\s+|of\s+)?pfas$/.test(n.trim())) return { genre: 'sommeIncertaine' }
  }
  if (mots.includes('aof') || /fluor\w* organique\w* adsorbable|adsorbable organic\w* (bound )?fluor|organisch gebundene\w* fluor/.test(n)) return { genre: 'aof' }
  if (mots.includes('eof') || /fluor\w* organique\w* extractible|extractable organic\w* fluor/.test(n)) return { genre: 'eof' }

  const lin = /lineaire|linear/.test(n) || /(^|[^a-z])[ln]-pf/.test(n)
  const ram = /ramifi|branch|(^|[^a-z])br-?pf|\bbr\b|\biso\b/.test(n)
  const isomere: Isomere | undefined = lin && !ram ? 'lineaire' : ram && !lin ? 'ramifie' : undefined
  const avec = (id: IdSubstance): Identification => ({ genre: 'substance', id, ...(isomere ? { isomere } : {}) })

  if (p.cas && PAR_CAS.has(p.cas)) return avec(PAR_CAS.get(p.cas)!)
  if (FTS62.test(compact)) return avec('FTS62')
  if (mots.includes('tfa') || compact.includes('trifluoroacet')) return avec('TFA')

  // Abbreviations: exactly one substance named, else a combined row.
  const nommes = new Set(mots.map((m) => ABREVIATIONS.get(m)).filter((x): x is IdSubstance => !!x))
  if (nommes.size === 1 && !(estSomme && /\+/.test(n))) return avec([...nommes][0])
  if (nommes.size > 1) return { genre: 'autre' }

  if (!/amid|fluorotelom|chloro|ether|oxa|acetamido|sulfonamido/.test(compact)) {
    const sansSeparateurs = compact.replace(/:/g, '')
    const pfca = sansSeparateurs.match(NOM_PFCA)
    if (pfca) return avec(VINGT.filter((s) => s.famille === 'PFCA')[RADICAUX.indexOf(pfca[1])].id)
    const pfsa = sansSeparateurs.match(NOM_PFSA) ?? sansSeparateurs.match(NOM_PFSA_FR)
    if (pfsa) return avec(VINGT.filter((s) => s.famille === 'PFSA')[RADICAUX.indexOf(pfsa[1])].id)
  }
  if (AUTRE_PFAS.test(n)) return { genre: 'autre' }
  return null
}

/**
 * Factor bringing a value in `unite` to ng/l (water) or µg/kg (soil), or
 * null when the unit is not of that kind. "µg F/l", "ng/g MS", "mg/kg PS"
 * are understood.
 */
export function facteurUnite(unite: string, matrice: Matrice): number | null {
  const u = unite.toLowerCase().replace(/\s+/g, '').replace('μ', 'µ')
  const m = u.match(/^(ng|µg|ug|mcg|mg|g)[a-z()]*\/(ml|l|kg|g)/)
  if (!m) return null
  const numerateur = { ng: 1e-3, µg: 1, ug: 1, mcg: 1, mg: 1e3, g: 1e6 }[m[1]]!
  const denominateur = m[2]
  if (matrice === 'eau') {
    if (denominateur === 'l') return numerateur * 1000
    if (denominateur === 'ml') return numerateur * 1e6
    return null
  }
  if (denominateur === 'kg') return numerateur
  if (denominateur === 'g') return numerateur * 1000
  return null
}

/** The matrix the units point to: per kilogram → soil, per litre → water. */
export function matriceProbable(lecture: Lecture): Matrice {
  const lignes = lecture.parametres.CM.filter((p) => identifier(p))
  const sol = lignes.filter((p) => facteurUnite(p.unite, 'sol') !== null).length
  const eau = lignes.filter((p) => facteurUnite(p.unite, 'eau') !== null).length
  return sol > eau ? 'sol' : 'eau'
}

function convertir(m: Mesure, p: Parametre, facteur: number): Valeur {
  return { valeur: m.valeur! * facteur, inferieur: m.inferieur, brut: `${m.brut.replace('.', ',')} ${p.unite}` }
}

/** Repo convention for sums: quantified values added; none → "<" sum of LQs. */
export function sommer(valeurs: Valeur[]): Valeur | null {
  if (!valeurs.length) return null
  const q = valeurs.filter((v) => !v.inferieur)
  const total = (q.length ? q : valeurs).reduce((a, v) => a + v.valeur, 0)
  return { valeur: total, inferieur: !q.length, brut: '' }
}

const LIBELLE: Record<IdSubstance, string> = Object.fromEntries(SUBSTANCES.map((s) => [s.id, s.abreviation])) as Record<IdSubstance, string>

export function lirePfas(lecture: Lecture, matrice: Matrice): LecturePfas {
  const parametres = lecture.parametres.CM
  const avertissements: string[] = []
  const correspondances: LecturePfas['correspondances'] = []
  const autres: string[] = []
  const lignes: { p: Parametre; id: Identification; facteur: number }[] = []
  let libelleSomme: string | null = null
  let sommeIncertaine: Parametre | null = null
  const unitesRefusees = new Set<string>()

  for (const p of parametres) {
    const id = identifier(p)
    if (!id) continue
    if (id.genre === 'autre') {
      autres.push(p.nom)
      continue
    }
    const facteur = facteurUnite(p.unite, matrice)
    if (facteur === null) {
      unitesRefusees.add(`${p.nom} (${p.unite})`)
      continue
    }
    if (id.genre === 'sommeIncertaine') {
      sommeIncertaine ??= p
      continue
    }
    if (id.genre === 'somme20') libelleSomme ??= p.nom
    lignes.push({ p, id, facteur })
    correspondances.push({
      ligne: p.nom,
      lu:
        id.genre === 'substance'
          ? `${LIBELLE[id.id]}${id.isomere ? ` (isomères ${id.isomere === 'lineaire' ? 'linéaires' : 'ramifiés'})` : ''}`
          : id.genre === 'somme20'
            ? 'Somme des 20 PFAS (laboratoire)'
            : id.genre === 'aof'
              ? 'AOF — fluor organique adsorbable'
              : 'EOF — fluor organique extractible',
    })
  }
  if (!libelleSomme && sommeIncertaine) {
    const facteur = facteurUnite(sommeIncertaine.unite, matrice)!
    lignes.push({ p: sommeIncertaine, id: { genre: 'somme20' }, facteur })
    libelleSomme = sommeIncertaine.nom
    correspondances.push({ ligne: sommeIncertaine.nom, lu: 'Somme des 20 PFAS (libellé à vérifier)' })
    avertissements.push(
      `La somme du laboratoire est intitulée « ${sommeIncertaine.nom} », sans préciser qu’il s’agit des 20 PFAS de la directive : vérifiez sur le rapport qu’elle ne porte pas sur une autre liste.`,
    )
  }
  if (unitesRefusees.size) {
    avertissements.push(
      `Lignes écartées, unité non convertible en ${matrice === 'eau' ? 'ng/l' : 'µg/kg MS'} : ${[...unitesRefusees].join(' ; ')}. Vérifiez la matrice choisie.`,
    )
  }

  const analysees = [...new Set(lignes.flatMap((l) => (l.id.genre === 'substance' ? [l.id.id] : [])))]
  const qualifications = qualifierAuto(lecture.points)

  const echantillons: EchantillonPfas[] = lecture.points.map((point) => {
    const e: EchantillonPfas = {
      nom: point.nom,
      type: qualifications[point.nom]?.type ?? 'echantillon',
      substances: {},
      isomeres: {},
      somme: null,
      sommeCalculee: false,
      aof: null,
      eof: null,
    }
    for (const { p, id, facteur } of lignes) {
      const m = lecture.valeurs.CM[point.nom]?.[p.cle]
      if (!m || m.valeur === null) continue
      const v = convertir(m, p, facteur)
      if (id.genre === 'substance') {
        if (id.isomere) ((e.isomeres[id.id] ??= {})[id.isomere] ??= v)
        else e.substances[id.id] ??= v
      } else if (id.genre === 'somme20') e.somme ??= v
      else if (id.genre === 'aof') e.aof ??= v
      else if (id.genre === 'eof') e.eof ??= v
    }
    // A substance given only as isomers: their sum is its total.
    for (const [id, iso] of Object.entries(e.isomeres) as [IdSubstance, Partial<Record<Isomere, Valeur>>][]) {
      if (e.substances[id]) continue
      const total = sommer(Object.values(iso))
      if (total) e.substances[id] = { ...total, brut: 'somme des isomères' }
    }
    if (!e.somme) {
      const somme = sommer(VINGT.flatMap((s) => (e.substances[s.id] ? [e.substances[s.id]!] : [])))
      if (somme) {
        e.somme = { ...somme, brut: 'calculée' }
        e.sommeCalculee = true
      }
    }
    return e
  })

  const manquantes = VINGT.filter((s) => !analysees.includes(s.id))
  if (!libelleSomme) {
    avertissements.push(
      analysees.length
        ? 'Le fichier ne contient pas de ligne « somme des 20 PFAS » : la somme est calculée par l’outil (valeurs quantifiées additionnées, sinon somme des LQ précédée de « < »).'
        : 'Aucun des 20 PFAS de la directive n’a été reconnu dans ce fichier.',
    )
  }
  if (analysees.length && manquantes.length && manquantes.length < VINGT.length) {
    avertissements.push(
      `${VINGT.length - manquantes.length} des 20 PFAS de la directive figurent dans le fichier ; absents : ${manquantes.map((s) => s.abreviation).join(', ')}. Une somme qui ne porte pas sur les 20 n’est pas comparable aux seuils.`,
    )
  }
  for (const id of ['TFA', 'FTS62'] as IdSubstance[]) {
    if (!analysees.includes(id)) avertissements.push(`${PAR_ID[id].abreviation} : pas de ligne dans le fichier (non analysé, ou rapport à part à ajouter).`)
  }

  return { matrice, echantillons, analysees, libelleSomme, autres, correspondances, avertissements }
}
