/**
 * Reads groundwater sampling sheets ("Fiche de prélèvement d'eau
 * souterraine"), one well per tab: the well, the date, the purge readings
 * of the multiparameter probe and what was noted on site.
 *
 * Nothing is tied to fixed cells, since rows shift from one sheet to the
 * next (a longer purge, an extra remark): the purge table is found by its
 * header row (a "pH" cell next to a redox cell), its columns by their
 * headings, and the well details by their labels ("Piézomètre :",
 * "Date :"…), the value being the first filled cell to the right.
 *
 * The value retained for each parameter is the one of the last complete
 * reading (end of purge, just before sampling). A parameter missing on that
 * reading ("n.m") takes its last earlier value, flagged as such. Template
 * rows left blank — or holding only a formula result, such as the
 * "corrected redox" of an empty row — are not readings.
 *
 * Pure: takes grids of raw cell values.
 */

import type { Cell } from '../resultats/parse.ts'

export type ParamTerrain = 'ph' | 'orp' | 'od' | 'ce' | 't'

export const PARAMS_TERRAIN: { id: ParamTerrain; libelle: string; unite: string }[] = [
  { id: 'ph', libelle: 'pH', unite: 'unité pH' },
  { id: 'orp', libelle: 'Potentiel redox mesuré', unite: 'mV' },
  { id: 'od', libelle: 'Oxygène dissous', unite: 'mg/l' },
  { id: 'ce', libelle: 'Conductivité', unite: 'µS/cm' },
  { id: 't', libelle: 'Température', unite: '°C' },
]

export interface Lecture {
  duree: number | null
  volume: number | null
  ph: number | null
  orp: number | null
  /** Corrected redox as written on the sheet (often a formula). */
  ehFiche: number | null
  od: number | null
  ce: number | null
  t: number | null
  niveau: number | null
  turbidite: string
  couleur: string
  odeur: string
  remarque: string
}

export interface ValeurFinale {
  valeur: number
  /** Taken from an earlier reading, the parameter not being measured at the end of the purge. */
  anterieure: boolean
}

export type Stabilite = 'stable' | 'instable' | 'insuffisant'

export interface Tolerances {
  ph: number
  orp: number
  od: number
  /** Relative, in %, above 500 µS/cm. */
  ce: number
  /** Relative, in %, below 500 µS/cm. */
  ceFaible: number
  t: number
}

/** The criteria printed on the ERM sheet (and in most low-flow purge guides). */
export const TOLERANCES_DEFAUT: Tolerances = { ph: 0.2, orp: 10, od: 0.3, ce: 2, ceFaible: 5, t: 0.5 }

export interface FicheTerrain {
  onglet: string
  ouvrage: string
  /** ISO date, or the text as written. */
  date: string
  prelevePar: string
  niveauStatique: number | null
  flottant: string
  profondeurPompage: number | null
  debitPurge: number | null
  typePompe: string
  substances: string
  sonde: string
  calibration: string
  derive: string
  lectures: Lecture[]
  /** Index of the reading retained (end of purge), -1 when none. */
  ligneFinale: number
  finale: Partial<Record<ParamTerrain, ValeurFinale>>
  stabilite: Partial<Record<ParamTerrain, Stabilite>>
  /** Offset added to the measured redox on the sheet (corrected − measured), mV. */
  decalage: number | null
  tolerances: Tolerances
  /** Distinct colours, odours, turbidities and remarks noted during the purge. */
  observations: string[]
  /** Sheet with no reading at all (template copied, well not sampled). */
  vide: boolean
}

function texte(c: Cell): string {
  if (c === null || c === undefined) return ''
  if (c instanceof Date) return c.toISOString().slice(0, 10)
  return String(c).replace(/\s+/g, ' ').trim()
}

const SANS_MESURE = /^(-|n\.?\s*[amd]\.?|nm|na|nd|\/|—|–|\?)$/i

function nombre(c: Cell): number | null {
  if (typeof c === 'number') return Number.isFinite(c) ? c : null
  const t = texte(c)
  if (!t || SANS_MESURE.test(t)) return null
  const n = t.replace(/\s/g, '').replace(',', '.')
  return /^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(n) ? Number(n) : null
}

/** Excel serial date (1900 system) or Date → ISO date. */
function dateIso(c: Cell): string {
  if (c instanceof Date) {
    // SheetJS builds dates at local midnight; keep the calendar day.
    const d = new Date(c.getTime() - c.getTimezoneOffset() * 60000)
    return d.toISOString().slice(0, 10)
  }
  if (typeof c === 'number' && c > 20000 && c < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(c) * 86400000).toISOString().slice(0, 10)
  }
  return texte(c)
}

/** First filled cell right of the label matching `motif`. */
function apres(grille: Cell[][], motif: RegExp, portee = 6): Cell {
  for (const ligne of grille) {
    for (let j = 0; j < ligne.length; j++) {
      if (!motif.test(texte(ligne[j]))) continue
      for (let k = j + 1; k < Math.min(ligne.length, j + 1 + portee); k++) {
        if (texte(ligne[k])) return ligne[k]
      }
    }
  }
  return null
}

const COLONNES: [keyof Lecture, RegExp][] = [
  ['duree', /dur[ée]e|temps/i],
  ['volume', /volume/i],
  ['ph', /^ph\b/i],
  ['ehFiche', /(redox|orp|potentiel).*(corrig|enh|she)|^eh\b/i],
  ['orp', /redox|orp|potentiel/i],
  ['od', /oxyg|^o2\b|^od\b/i],
  ['ce', /conductiv/i],
  ['t', /^t\s*°|^t°|temp[ée]rature|^t\s*\(/i],
  ['niveau', /niveau/i],
  ['turbidite', /turbidit/i],
  ['couleur', /couleur/i],
  ['odeur', /odeur/i],
  ['remarque', /remarque|observation/i],
]

function enTete(grille: Cell[][]): number {
  for (let i = 0; i < grille.length; i++) {
    const r = grille[i] ?? []
    if (r.some((c) => /^ph$/i.test(texte(c))) && r.some((c) => /redox|orp|potentiel/i.test(texte(c)))) return i
  }
  return -1
}

/** "± 0,2", "± 2%\n± 5% si <500µS/cm", "± 10 mV" → numbers. */
function lireTolerances(ligne: Cell[], col: Partial<Record<keyof Lecture, number>>): Tolerances {
  const tol = { ...TOLERANCES_DEFAUT }
  const lire = (j: number | undefined) =>
    j === undefined
      ? []
      : [...texte(ligne[j]).matchAll(/±\s*([0-9]+(?:[.,][0-9]+)?)/g)].map((m) => Number(m[1].replace(',', '.')))
  const [ph] = lire(col.ph)
  const [orp] = lire(col.orp)
  const [od] = lire(col.od)
  const [ce, ceFaible] = lire(col.ce)
  const [t] = lire(col.t)
  if (ph) tol.ph = ph
  if (orp) tol.orp = orp
  if (od) tol.od = od
  if (ce) tol.ce = ce
  if (ceFaible) tol.ceFaible = ceFaible
  if (t) tol.t = t
  return tol
}

const MESURES: ParamTerrain[] = ['ph', 'orp', 'od', 'ce', 't']

function stabilite(serie: number[], p: ParamTerrain, tol: Tolerances): Stabilite {
  if (serie.length < 3) return 'insuffisant'
  const derniers = serie.slice(-3)
  for (let k = 1; k < derniers.length; k++) {
    const a = derniers[k - 1]
    const b = derniers[k]
    const ecart = Math.abs(b - a)
    const limite = p === 'ce' ? (Math.abs(a) * (Math.abs(a) < 500 ? tol.ceFaible : tol.ce)) / 100 : tol[p]
    if (ecart > limite + 1e-9) return 'instable'
  }
  return 'stable'
}

export function lireFiche(grille: Cell[][], onglet: string): FicheTerrain | null {
  const h = enTete(grille)
  if (h < 0) return null
  const ligneEnTete = grille[h]
  const col: Partial<Record<keyof Lecture, number>> = {}
  ligneEnTete.forEach((c, j) => {
    const t = texte(c)
    if (!t) return
    for (const [cle, motif] of COLONNES) {
      if (col[cle] !== undefined || !motif.test(t)) continue
      // The measured redox is the redox column that is not the corrected one.
      if (cle === 'orp' && COLONNES[3][1].test(t)) continue
      col[cle] = j
      break
    }
  })

  const lectures: Lecture[] = []
  let tolerances = TOLERANCES_DEFAUT
  let vides = 0
  for (let i = h + 1; i < grille.length && vides < 4; i++) {
    const r = grille[i] ?? []
    if (/rappel|jug[ée]s? stables?/i.test(r.map(texte).join(' '))) {
      tolerances = lireTolerances(r, col)
      break
    }
    const num = (k: keyof Lecture) => (col[k] === undefined ? null : nombre(r[col[k]!]))
    const txt = (k: keyof Lecture) => {
      const t = col[k] === undefined ? '' : texte(r[col[k]!])
      return t === '-' ? '' : t
    }
    const l: Lecture = {
      duree: num('duree'),
      volume: num('volume'),
      ph: num('ph'),
      orp: num('orp'),
      ehFiche: num('ehFiche'),
      od: num('od'),
      ce: num('ce'),
      t: num('t'),
      niveau: num('niveau'),
      turbidite: txt('turbidite'),
      couleur: txt('couleur'),
      odeur: txt('odeur'),
      remarque: txt('remarque'),
    }
    if (!r.some((c) => texte(c))) {
      vides++
      continue
    }
    vides = 0
    lectures.push(l)
  }

  const mesuree = (l: Lecture) => MESURES.some((p) => l[p] !== null)
  const complete = (l: Lecture) => (['ph', 'orp', 'ce', 't'] as const).filter((p) => l[p] !== null).length >= 2
  let ligneFinale = -1
  for (let k = lectures.length - 1; k >= 0 && ligneFinale < 0; k--) if (complete(lectures[k])) ligneFinale = k
  for (let k = lectures.length - 1; k >= 0 && ligneFinale < 0; k--) if (mesuree(lectures[k])) ligneFinale = k

  const finale: FicheTerrain['finale'] = {}
  const stab: FicheTerrain['stabilite'] = {}
  if (ligneFinale >= 0) {
    const retenues = lectures.slice(0, ligneFinale + 1)
    for (const p of MESURES) {
      const serie = retenues.map((l) => l[p]).filter((v): v is number => v !== null)
      const derniere = retenues[ligneFinale][p]
      if (derniere !== null) finale[p] = { valeur: derniere, anterieure: false }
      else if (serie.length) finale[p] = { valeur: serie[serie.length - 1], anterieure: true }
      if (serie.length) stab[p] = stabilite(serie, p, tolerances)
    }
  }

  const ecarts = lectures.filter((l) => l.orp !== null && l.ehFiche !== null).map((l) => l.ehFiche! - l.orp!)
  ecarts.sort((a, b) => a - b)
  const decalage = ecarts.length ? Math.round(ecarts[Math.floor(ecarts.length / 2)] * 10) / 10 : null

  const observations: string[] = []
  const vu = new Set<string>()
  const noter = (prefixe: string, v: string) => {
    if (!v || /^(-|non|aucune?|ras|néant)$/i.test(v)) return
    const t = `${prefixe}${v}`
    if (!vu.has(t.toLowerCase())) {
      vu.add(t.toLowerCase())
      observations.push(t)
    }
  }
  for (const l of lectures.slice(0, ligneFinale + 1)) {
    noter('Turbidité : ', l.turbidite)
    noter('Couleur : ', l.couleur)
    noter('Odeur : ', l.odeur)
    noter('', l.remarque)
  }

  const nomCellule = texte(apres(grille, /^pi[ée]zom[èe]tre\s*:?$|^ouvrage\s*:?$|^point de pr[ée]l[èe]vement\s*:?$/i))
  return {
    onglet,
    ouvrage: nomCellule || onglet.trim(),
    date: dateIso(apres(grille, /^date\s*:?$/i)),
    prelevePar: texte(apres(grille, /pr[ée]lev[ée] par/i)),
    niveauStatique: nombre(apres(grille, /niveau statique/i)),
    flottant: texte(apres(grille, /flottant/i, 2)),
    profondeurPompage: nombre(apres(grille, /prof\.?\s*(de\s*)?pompage/i)),
    debitPurge: nombre(apres(grille, /d[ée]bit de purge/i)),
    typePompe: texte(apres(grille, /type de pompe/i)),
    substances: texte(apres(grille, /substances analys/i)),
    sonde: texte(apres(grille, /sonde multi/i)),
    calibration: texte(apres(grille, /calibration valid/i, 2)),
    derive: texte(apres(grille, /constat de d[ée]rive/i, 2)),
    lectures,
    ligneFinale,
    finale,
    stabilite: stab,
    decalage,
    tolerances,
    observations,
    vide: ligneFinale < 0,
  }
}

export interface LectureFiches {
  fiches: FicheTerrain[]
  /** Tabs that are not sampling sheets. */
  ignores: string[]
}

export function lireFiches(feuilles: { nom: string; grille: Cell[][] }[]): LectureFiches {
  const fiches: FicheTerrain[] = []
  const ignores: string[] = []
  for (const f of feuilles) {
    const fiche = lireFiche(f.grille, f.nom)
    if (fiche) fiches.push(fiche)
    else ignores.push(f.nom)
  }
  return { fiches, ignores }
}

/** Key to match a well across sheets and lab files: "MW1 (5-9m)" ≈ "MW1 5-9" ≈ "mw1-(5-9 m)". */
export function cleOuvrage(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/(\d)\s*m\b/g, '$1')
    .replace(/[^a-z0-9]+/g, '')
}
