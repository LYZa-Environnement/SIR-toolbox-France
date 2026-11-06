/**
 * Summary of the field parameters across wells — minimum and maximum (with
 * the well where each is reached), mean — and a short reading of the
 * physico-chemical conditions of the groundwater (five sentences at most):
 * pH, mineralisation, oxygen and redox, temperature, quality of the
 * measurements.
 *
 * Only field measurements are summarised: values from the sampling sheets
 * (end of purge) and those typed in the tool. A pH or a conductivity
 * measured by the laboratory is left out, and counted.
 *
 * Pure: takes the data set and the evaluations of the page.
 */

import type { Jeu } from './donnees.ts'
import type { Evaluation, Favorabilite } from './evaluation.ts'
import type { ParamId, Valeur } from './parametres.ts'

export type IdRecap = 'ph' | 'orp' | 'eh' | 'od' | 'ce' | 't'

export interface Extreme {
  valeur: number
  /** Below the quantification limit (typed "<0,1"): `valeur` is the limit. */
  inferieur: boolean
  /** Wells where it is reached (several when tied). */
  ouvrages: string[]
}

export interface LigneRecap {
  id: IdRecap
  libelle: string
  unite: string
  /** Decimals shown for the mean. */
  decimales: number
  n: number
  min: Extreme | null
  max: Extreme | null
  moyenne: number | null
  /** Some values are below a limit: the mean counts them at the limit. */
  avecInferieurs: boolean
}

export interface Recap {
  lignes: LigneRecap[]
  /** Wells with at least one field value. */
  ouvrages: number
  /** Field parameters measured by the laboratory only, left out ("pH (Pz3)"). */
  exclus: string[]
}

const DEFS: { id: IdRecap; libelle: string; unite: string; decimales: number }[] = [
  { id: 'ph', libelle: 'pH', unite: 'unité pH', decimales: 2 },
  { id: 'orp', libelle: 'Potentiel redox mesuré (Ag/AgCl)', unite: 'mV', decimales: 0 },
  { id: 'eh', libelle: 'Potentiel redox Eh (ENH, calculé)', unite: 'mV', decimales: 0 },
  { id: 'od', libelle: 'Oxygène dissous', unite: 'mg/l', decimales: 2 },
  { id: 'ce', libelle: 'Conductivité', unite: 'µS/cm', decimales: 0 },
  { id: 't', libelle: 'Température', unite: '°C', decimales: 1 },
]

const LIB_COURT: Record<string, string> = { ph: 'pH', orp: 'redox', od: 'O₂ dissous', ce: 'conductivité', t: 'température' }

/** A value measured in the field: from a sampling sheet or typed in the tool. */
const deTerrain = (v: Valeur | undefined): v is Valeur => !!v && (v.source.startsWith('Fiche') || v.source === 'Saisie')

function extreme(points: { v: Valeur; ouvrage: string }[], sens: 1 | -1): Extreme | null {
  if (!points.length) return null
  const cible = points.reduce((m, p) => (sens * (p.v.valeur - m) > 0 ? p.v.valeur : m), points[0].v.valeur)
  const atteints = points.filter((p) => p.v.valeur === cible)
  return { valeur: cible, inferieur: atteints.some((p) => p.v.inferieur), ouvrages: atteints.map((p) => p.ouvrage) }
}

/**
 * @param decalage offset from the measured redox to Eh (mV); the Eh row is
 *   given only when it is set, Eh being otherwise the measured redox.
 */
export function recapTerrain(jeu: Jeu, evaluations: Evaluation[], decalage: number): Recap {
  const exclus: string[] = []
  const avecValeur = new Set<string>()
  const lignes: LigneRecap[] = []
  for (const d of DEFS) {
    if (d.id === 'eh' && !decalage) continue
    const points: { v: Valeur; ouvrage: string }[] = []
    for (const e of evaluations) {
      const t = jeu.valeurs[e.ouvrage.cle] ?? {}
      const brut = t[(d.id === 'eh' ? 'orp' : d.id) as ParamId]
      if (!brut) continue
      if (!deTerrain(brut)) {
        if (d.id !== 'eh') exclus.push(`${LIB_COURT[d.id]} (${e.ouvrage.nom})`)
        continue
      }
      avecValeur.add(e.ouvrage.cle)
      points.push({ v: d.id === 'eh' ? { ...brut, valeur: brut.valeur + decalage } : brut, ouvrage: e.ouvrage.nom })
    }
    lignes.push({
      ...d,
      n: points.length,
      min: extreme(points, -1),
      max: extreme(points, 1),
      moyenne: points.length ? points.reduce((s, p) => s + p.v.valeur, 0) / points.length : null,
      avecInferieurs: points.some((p) => p.v.inferieur),
    })
  }
  return { lignes, ouvrages: avecValeur.size, exclus }
}

// ---- Formatting ------------------------------------------------------------------------

export function nombreFr(x: number, decimales = 3): string {
  return x.toLocaleString('fr-FR', { maximumFractionDigits: decimales, minimumFractionDigits: 0 })
}

/** Typographic minus; a plus sign on redox potentials. */
const signe = (x: number, d: number, id: IdRecap) => {
  const t = nombreFr(Math.abs(x), d)
  if (x < 0 && t !== '0') return `−${t}`
  return (id === 'orp' || id === 'eh') && x > 0 ? `+${t}` : t
}

/** "6,8 (Pz1)", "<0,1 (Pz2, Pz4)". */
export function formatExtreme(x: Extreme | null, id: IdRecap): string {
  if (!x) return '-'
  return `${x.inferieur ? '<' : ''}${signe(x.valeur, 3, id)} (${x.ouvrages.join(', ')})`
}

export function formatMoyenne(l: LigneRecap): string {
  if (l.moyenne === null) return '-'
  return `${l.avecInferieurs ? '≤ ' : ''}${signe(l.moyenne, l.decimales, l.id)}`
}

/** "Pz1, Pz2 et Pz3"; past five wells, only their number. */
function liste(noms: string[]): string {
  if (noms.length > 5) return `${noms.length} ouvrages`
  return noms.length <= 1 ? noms.join('') : `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`
}

function etendue(l: LigneRecap, unite: string, moyenne = true): string {
  const u = unite ? ` ${unite}` : ''
  const v = (x: Extreme) => `${x.inferieur ? '<' : ''}${signe(x.valeur, 3, l.id)}`
  if (l.n === 1 || l.min!.valeur === l.max!.valeur) return `est de ${v(l.min!)}${u} (${liste(l.min!.ouvrages)})`
  return `varie de ${v(l.min!)} (${liste(l.min!.ouvrages)}) à ${v(l.max!)}${u} (${liste(l.max!.ouvrages)})${moyenne ? `, pour une moyenne de ${formatMoyenne(l)}${u}` : ''}`
}

// ---- Reading ---------------------------------------------------------------------------

function classePh(ph: number): string {
  if (ph < 5.5) return 'acides'
  if (ph < 6.5) return 'légèrement acides'
  if (ph <= 8.5) return 'proches de la neutralité'
  if (ph <= 9.5) return 'basiques'
  return 'très basiques'
}

/** Mineralisation from the conductivity (Rodier, L'analyse de l'eau). */
function classeCe(ce: number): string {
  if (ce < 100) return 'très faible'
  if (ce < 200) return 'faible'
  if (ce < 333) return 'moyenne'
  if (ce < 666) return 'moyenne accentuée'
  if (ce < 1000) return 'importante'
  return 'élevée'
}

const deA = (a: string, b: string) => (a === b ? a : `${a} à ${b}`)

/** Seuils USEPA (1998) : O₂ 0,5 et 5 mg/l, redox −100 et 50 mV (Ag/AgCl). */
const LIB_CONDITIONS: Record<Exclude<Favorabilite, 'indetermine'>, string> = {
  favorable: 'réductrices',
  possible: 'anoxiques faiblement réductrices',
  limite: 'peu réductrices',
  defavorable: 'oxydantes',
}

const enumerer = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} et ${xs[xs.length - 1]}`)

/**
 * Up to five sentences on the physico-chemical conditions of the
 * groundwater, from the field data only.
 */
export function syntheseTerrain(recap: Recap, evaluations: Evaluation[]): string[] {
  const l = (id: IdRecap) => recap.lignes.find((x) => x.id === id && x.n > 0)
  const phrases: string[] = []

  const ph = l('ph')
  if (ph) {
    let p = `Le pH ${etendue(ph, '')}`
    p += ` : eaux ${deA(classePh(ph.min!.valeur), classePh(ph.max!.valeur))}`
    if (ph.max!.valeur > 9.5) p += ' ; un pH supérieur à 9,5 évoque l’influence d’un ciment (cimentation de l’ouvrage), de remblais ou de chaux'
    phrases.push(`${p}.`)
  }

  const ce = l('ce')
  if (ce) {
    let p = `La conductivité ${etendue(ce, 'µS/cm')}, soit une minéralisation ${deA(classeCe(ce.min!.valeur), classeCe(ce.max!.valeur))}`
    const facteur = ce.min!.valeur > 0 ? ce.max!.valeur / ce.min!.valeur : 0
    if (ce.n > 1 && facteur >= 2) p += ` ; le contraste entre ouvrages (facteur ${nombreFr(facteur, 1)}) traduit des eaux d’origine ou d’influence différentes (apports latéraux, infiltration, panache) à rapprocher du schéma conceptuel`
    phrases.push(`${p}.`)
  }

  const od = l('od')
  const orp = l('orp')
  if (od || orp) {
    const parties: string[] = []
    if (od) parties.push(`l’oxygène dissous ${etendue(od, 'mg/l', false)}`)
    if (orp) parties.push(`le redox mesuré contre Ag/AgCl ${etendue(orp, 'mV', false)}`)
    let p = parties.join(' et ')
    p = p.charAt(0).toUpperCase() + p.slice(1)
    const groupes = (['favorable', 'possible', 'limite', 'defavorable'] as const)
      .map((c) => ({ c, noms: evaluations.filter((e) => e.lecture.conditions === c).map((e) => e.ouvrage.nom) }))
      .filter((g) => g.noms.length)
    if (groupes.length === 1 && groupes[0].noms.length === evaluations.length) p += ` : conditions ${LIB_CONDITIONS[groupes[0].c]} dans ${evaluations.length > 1 ? 'tous les ouvrages' : 'l’ouvrage'}`
    else if (groupes.length) p += ` : conditions ${enumerer(groupes.map((g) => `${LIB_CONDITIONS[g.c]} à ${liste(g.noms)}`))}`
    phrases.push(`${p}.`)
  }

  const t = l('t')
  if (t) {
    let p = `La température ${etendue(t, '°C')}`
    if (t.min!.valeur < 8 || t.max!.valeur > 18) {
      p += ' ; des valeurs hors de la gamme habituelle des nappes peu profondes (de l’ordre de 10 à 15 °C) peuvent traduire un réchauffement de l’eau dans la cellule de mesure, une influence des eaux de surface ou une source de chaleur (réseaux, bâtiments)'
    } else if (t.n > 1 && t.max!.valeur - t.min!.valeur > 4) {
      p += ' ; l’écart entre ouvrages dépasse 4 °C (profondeur de pompage, influence des eaux de surface ou réchauffement en surface à vérifier)'
    } else p += ', dans la gamme habituelle des nappes peu profondes'
    phrases.push(`${p}.`)
  }

  const avecFiche = evaluations.filter((e) => e.ouvrage.fiche && !e.ouvrage.fiche.vide)
  if (avecFiche.length) {
    const instables = avecFiche
      .map((e) => ({ nom: e.ouvrage.nom, p: Object.entries(e.ouvrage.fiche!.stabilite).filter(([, s]) => s === 'instable').map(([k]) => LIB_COURT[k]) }))
      .filter((x) => x.p.length)
    const douteux = evaluations.filter((e) => e.alertes.some((a) => /sursatur|incohéren|sonde à oxygène|calibration|dérive/i.test(a.texte))).map((e) => e.ouvrage.nom)
    let p: string
    if (!instables.length) p = `Les paramètres sont stabilisés en fin de purge dans ${avecFiche.length > 1 ? `les ${avecFiche.length} ouvrages` : 'l’ouvrage'}`
    else {
      const stables = avecFiche.length - instables.length
      p = `Les paramètres sont stabilisés en fin de purge dans ${stables} ouvrage${stables > 1 ? 's' : ''} sur ${avecFiche.length} ; non stabilisés à ${instables.length > 5 ? `${instables.length} ouvrages` : instables.map((x) => `${x.nom} (${x.p.join(', ')})`).join(', ')}, valeurs à lire avec prudence`
    }
    p += douteux.length ? ` ; mesures à vérifier (sursaturation en O₂, incohérence O₂ / redox, sonde) à ${liste(douteux)}` : ' ; aucune incohérence relevée entre oxygène et redox'
    phrases.push(`${p}.`)
  }

  return phrases.slice(0, 5)
}
