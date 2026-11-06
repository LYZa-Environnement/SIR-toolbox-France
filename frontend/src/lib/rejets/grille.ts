/**
 * The results grid of the discharge tool: one row per lab parameter, one
 * column per measurement. It is filled from the lab file or by hand, kept
 * as text so that every cell stays editable, and read into the reference
 * units for the conformity checks.
 */

import { normaliser } from '../resultats/guides.ts'
import { LectureImpossible, lireClasseur, lireGrille, lireMesure, type Cell, type Couche, type Lecture, type Mode, type Parametre } from '../resultats/parse.ts'
import { lireNombre, volumeLitres, type Prelevement } from '../resultats/calc.ts'
import type { Controle, LigneEvaluee, Resultat } from './conformite.ts'
import { PAR_ID, reconnaitre, type ClasseCov } from './substances.ts'
import { conversionAir, conversionEau, type Milieu } from './unites.ts'

export interface Colonne {
  nom: string
  date: string
  /** Air, results per sample (mass on the tube): sampling duration (min)
   *  and flow at the start and end (L/min), as in the formatting tool. */
  duree: string
  debitDebut: string
  debitFin: string
}

export const colonneVide = (nom: string): Colonne => ({ nom, date: '', duree: '', debitDebut: '', debitFin: '' })

/** Conditions of the sampled air, to bring the volume to normal
 *  conditions (273,15 K, 101,325 kPa) as article 24 requires; empty: the
 *  volume is taken as pumped. */
export interface Conditions {
  temperature: string
  pression: string
}

export function prelevement(c: Colonne | undefined): Prelevement {
  return { duree: lireNombre(c?.duree ?? ''), debitDebut: lireNombre(c?.debitDebut ?? ''), debitFin: lireNombre(c?.debitFin ?? '') }
}

/** Factor from the pumped volume to normal conditions; 1 when none is given. */
export function facteurNormal(cond: Conditions | undefined): number {
  const t = lireNombre(cond?.temperature ?? '')
  const p = lireNombre(cond?.pression ?? '')
  return (t === null || t <= -273.15 ? 1 : 273.15 / (273.15 + t)) * (p === null || p <= 0 ? 1 : p / 101.325)
}

/** Sampled volume (litres, normal conditions when they are given):
 *  flow × duration, the flow the mean of start and end. */
export function volumeColonne(c: Colonne | undefined, cond?: Conditions): number | null {
  const v = volumeLitres(prelevement(c))
  return v === null ? null : v * facteurNormal(cond)
}

export interface Ligne {
  id: string
  libelle: string
  cas: string
  unite: string
  /** Substance of the arrêté; null: none. */
  substance: string | null
  /** Air, VOC of no listed substance. */
  classe: ClasseCov | ''
  fraction: string
  valeurs: string[]
}

let compteur = 0
export const nouvelId = () => `l${++compteur}`

export function ligneVide(milieu: Milieu, n: number, unite?: string): Ligne {
  return { id: nouvelId(), libelle: '', cas: '', unite: unite || (milieu === 'air' ? 'mg/m³' : 'mg/l'), substance: null, classe: '', fraction: '', valeurs: Array(n).fill('') }
}

/** Every sheet of the workbook that reads as results of this medium, their
 *  samples side by side: lab reports often give one sample per sheet
 *  (inlet, between the carbon beds, outlet). A sheet with no parameter of
 *  the arrêté (methods, LQ table) is left out. */
export function lireOnglets(feuilles: { nom: string; grille: Cell[][] }[], mode: Mode, milieu: Milieu): { lecture: Lecture; onglets: string[] } {
  const lus: Lecture[] = []
  for (const f of feuilles) {
    try {
      lus.push(lireGrille(f.grille, mode, f.nom))
    } catch (e) {
      if (!(e instanceof LectureImpossible)) throw e
    }
  }
  const utiles = lus.filter((l) => [...l.parametres.CM, ...l.parametres.CC].some((p) => reconnaitre(p.nom, p.cas, milieu)))
  if (!utiles.length) {
    const l = lireClasseur(feuilles, mode)
    return { lecture: l, onglets: l.feuille ? [l.feuille] : [] }
  }
  return { lecture: utiles.length === 1 ? utiles[0] : fusionner(utiles), onglets: utiles.map((l) => l.feuille ?? '') }
}

/** Sheets merged: one row per parameter (same name and unit), one column per sample. */
function fusionner(lectures: Lecture[]): Lecture {
  const points: Lecture['points'] = []
  const parametres: Record<Couche, Parametre[]> = { CM: [], CC: [] }
  const valeurs: Lecture['valeurs'] = { CM: {}, CC: {} }
  const cles: Record<Couche, Map<string, string>> = { CM: new Map(), CC: new Map() }
  for (const l of lectures) {
    const noms = new Map<string, string>()
    for (const p of l.points) {
      // The same sample name on two sheets: told apart by the sheet.
      let nom = points.some((x) => x.nom === p.nom) ? `${p.nom} (${l.feuille})` : p.nom
      for (let k = 2; points.some((x) => x.nom === nom); k++) nom = `${p.nom} (${l.feuille} ${k})`
      noms.set(p.nom, nom)
      points.push({ ...p, nom })
    }
    for (const c of ['CM', 'CC'] as Couche[]) {
      for (const pa of l.parametres[c]) {
        const k = `${normaliser(pa.nom)}|${pa.unite.toLowerCase().replace(/\s+/g, '')}`
        let cle = cles[c].get(k)
        if (!cle) {
          cle = parametres[c].some((x) => x.cle === pa.cle) ? `${pa.cle}|${pa.unite}` : pa.cle
          cles[c].set(k, cle)
          parametres[c].push({ ...pa, cle })
        }
        for (const [ancien, nouveau] of noms) {
          const m = l.valeurs[c][ancien]?.[pa.cle]
          if (m) (valeurs[c][nouveau] ??= {})[cle] = m
        }
      }
    }
  }
  return {
    points,
    parametres,
    valeurs,
    coucheControle: lectures.some((l) => l.coucheControle),
    lignesIgnorees: [...new Set(lectures.flatMap((l) => l.lignesIgnorees))],
    unites: [...new Set(lectures.flatMap((l) => l.unites))],
    mode: lectures[0].mode,
    feuille: lectures.map((l) => l.feuille).join(', '),
  }
}

/** Rows of the lab file, the substances recognised. Air tubes: the control
 *  layer is added to the measuring one, the mass on the whole tube. */
export function grilleDepuisLecture(l: Lecture, milieu: Milieu): { colonnes: Colonne[]; lignes: Ligne[]; notes: string[] } {
  const notes: string[] = []
  const points = l.points
  const colonnes = points.map((p) => colonneVide(p.nom))
  const avecCC = l.coucheControle && l.parametres.CC.length > 0
  if (avecCC) notes.push('Tubes : masses de la zone de contrôle ajoutées à celles de la zone de mesure (masse totale piégée).')
  const lignes: Ligne[] = []
  let sommes = 0
  for (const p of l.parametres.CM) {
    const s = reconnaitre(p.nom, p.cas, milieu)
    // The lab's sums are left out — the regulatory ones are recomputed —,
    // but not a "total" that is itself a regulated parameter (phosphore
    // total, cyanures totaux).
    if (p.somme && !s) {
      sommes++
      continue
    }
    const valeurs = points.map((pt) => {
      const m = l.valeurs.CM[pt.nom]?.[p.cle]
      const cc = avecCC ? l.valeurs.CC[pt.nom]?.[p.cle] : undefined
      if (!m || m.valeur === null) return ''
      if (!cc || cc.valeur === null) return m.brut
      // Quantified on either zone: the sum of the quantified masses.
      const q = [m, cc].filter((x) => !x.inferieur).reduce((s, x) => s + x.valeur!, 0)
      const total = q > 0 ? q : m.valeur + cc.valeur
      return `${q > 0 ? '' : '<'}${Number(total.toPrecision(4))}`.replace('.', ',')
    })
    if (!valeurs.some(Boolean)) continue
    lignes.push({ id: nouvelId(), libelle: p.nom, cas: p.cas, unite: p.unite, substance: s?.id ?? null, classe: '', fraction: '', valeurs })
  }
  if (sommes) notes.push(`${sommes} ligne${sommes > 1 ? 's' : ''} de somme du laboratoire écartée${sommes > 1 ? 's' : ''} : les sommes réglementaires sont recalculées.`)
  return { colonnes, lignes, notes }
}

export interface Probleme {
  ligne: string
  texte: string
}

/** The grid in reference units, for the checks. */
export function lireGrilleSaisie(milieu: Milieu, lignes: Ligne[], colonnes: Colonne[], conditions?: Conditions): { lignes: LigneEvaluee[]; problemes: Probleme[] } {
  const problemes: Probleme[] = []
  const out: LigneEvaluee[] = []
  /** Columns with results per sample but no duration or flow. */
  const sansVolume = new Set<number>()
  for (const l of lignes) {
    const s = l.substance ? (PAR_ID.get(l.substance) ?? null) : null
    const covLibre =
      milieu === 'air' && !s && l.classe ? { classe: l.classe, fractionCarbone: lireNombre(l.fraction) } : undefined
    if (!s && !covLibre) {
      out.push({ libelle: l.libelle || '(sans nom)', substance: null, valeurs: l.valeurs.map(() => null) })
      continue
    }
    const conv = milieu === 'air' ? conversionAir(l.unite, s) : conversionEau(l.unite, s, l.libelle)
    if (conv.facteur === null) {
      problemes.push({ ligne: l.libelle, texte: `unité « ${l.unite || '(vide)'} » non convertible en ${milieu === 'air' ? 'mg/m³' : 'mg/l'}` })
      out.push({ libelle: l.libelle, substance: s, covLibre, valeurs: l.valeurs.map(() => null) })
      continue
    }
    const valeurs = l.valeurs.map((v, j): Resultat | null => {
      const m = lireMesure(v)
      if (!m || m.valeur === null) return null
      let f = conv.facteur!
      if (conv.support) {
        const vol = volumeColonne(colonnes[j], conditions)
        if (!vol || vol <= 0) {
          sansVolume.add(j)
          return null
        }
        // mg / (V l / 1000) = mg/m³.
        f = (f * 1000) / vol
      }
      return { valeur: m.valeur * f, inferieur: m.inferieur }
    })
    out.push({ libelle: l.libelle || s?.nom || '(sans nom)', substance: s, covLibre, valeurs })
  }
  if (sansVolume.size) {
    const noms = [...sansVolume].sort((a, b) => a - b).map((j) => `« ${colonnes[j]?.nom || `Mesure ${j + 1}`} »`)
    problemes.push({
      ligne: 'Résultats par échantillon',
      texte: `durée et débit de prélèvement à saisir pour ${noms.join(', ')} : sans eux, ces masses ne sont pas converties en concentration`,
    })
  }
  // One message per row and kind.
  const vus = new Set<string>()
  return { lignes: out, problemes: problemes.filter((p) => (vus.has(p.ligne + p.texte) ? false : (vus.add(p.ligne + p.texte), true))) }
}

/** A column pasted from Excel: one value per line. */
export function collage(texte: string): string[] {
  return texte.replace(/\r/g, '').split('\n').map((x) => x.split('\t')[0].trim()).filter((x, i, a) => x || i < a.length - 1)
}

/** Rows with results that no check of the arrêté takes in. */
export function nonVisees(lignes: Ligne[], controles: Controle[]): string[] {
  const prises = new Set(controles.flatMap((c) => c.composantes))
  // Kjeldahl nitrogen, nitrates and nitrites make up a computed global nitrogen.
  const azote = controles.some((c) => c.composantes.some((x) => x.startsWith('Azote global calculé')))
  return lignes
    .filter((l) => l.valeurs.some((v) => v.trim()) && !prises.has(l.libelle) && !(azote && ['ntk', 'nitrates', 'nitrites'].includes(l.substance ?? '')))
    .map((l) => l.libelle || '(sans nom)')
}
