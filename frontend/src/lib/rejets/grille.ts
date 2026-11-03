/**
 * The results grid of the discharge tool: one row per lab parameter, one
 * column per measurement. It is filled from the lab file or by hand, kept
 * as text so that every cell stays editable, and read into the reference
 * units for the conformity checks.
 */

import { lireMesure, type Lecture } from '../resultats/parse.ts'
import { lireNombre } from '../resultats/calc.ts'
import type { Controle, LigneEvaluee, Resultat } from './conformite.ts'
import { PAR_ID, reconnaitre, type ClasseCov } from './substances.ts'
import { conversionAir, conversionEau, type Milieu } from './unites.ts'

export interface Colonne {
  nom: string
  date: string
  /** Air, masses per tube: sampled volume in litres (normal conditions). */
  volume: string
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

export function ligneVide(milieu: Milieu, n: number): Ligne {
  return { id: nouvelId(), libelle: '', cas: '', unite: milieu === 'air' ? 'mg/m³' : 'mg/l', substance: null, classe: '', fraction: '', valeurs: Array(n).fill('') }
}

/** Rows of the lab file, the substances recognised. Air tubes: the control
 *  layer is added to the measuring one, the mass on the whole tube. */
export function grilleDepuisLecture(l: Lecture, milieu: Milieu): { colonnes: Colonne[]; lignes: Ligne[]; notes: string[] } {
  const notes: string[] = []
  const points = l.points
  const colonnes = points.map((p) => ({ nom: p.nom, date: '', volume: '' }))
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
export function lireGrilleSaisie(milieu: Milieu, lignes: Ligne[], colonnes: Colonne[]): { lignes: LigneEvaluee[]; problemes: Probleme[] } {
  const problemes: Probleme[] = []
  const out: LigneEvaluee[] = []
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
        const vol = lireNombre(colonnes[j]?.volume ?? '')
        if (!vol || vol <= 0) {
          problemes.push({ ligne: l.libelle, texte: `volume prélevé manquant pour « ${colonnes[j]?.nom ?? j + 1} »` })
          return null
        }
        // mg / (V l / 1000) = mg/m³.
        f = (f * 1000) / vol
      }
      return { valeur: m.valeur * f, inferieur: m.inferieur }
    })
    out.push({ libelle: l.libelle || s?.nom || '(sans nom)', substance: s, covLibre, valeurs })
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
