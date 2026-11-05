/**
 * Checks of a deliverable against what the texts require of it. Each check
 * is a point the document must hold: searched in its text, it is found
 * (with the passage, page by page), missing, or left for the reader to
 * judge when a text search cannot decide. A check carries its official
 * source and, when it fails, where to find the information or how to word
 * the correction.
 */

import type { Document } from './extraction.ts'

export interface Source {
  libelle: string
  url: string
}

export type Niveau = 'obligatoire' | 'attendu'

export type Statut = 'present' | 'absent' | 'invalide' | 'a-verifier'

export interface Extrait {
  page: number
  texte: string
}

export interface Verdict {
  statut: Statut
  detail?: string
  extraits?: Extrait[]
}

export interface Point {
  id: string
  /** Section of the checklist. */
  groupe: string
  intitule: string
  /** What the text requires, quoted or faithfully paraphrased. */
  exigence: string
  sources: Source[]
  /** Required by a text, or expected by the standard / good practice. */
  niveau: Niveau
  /** Found when one of these matches (all of them with `tous`). */
  chercher?: RegExp[]
  tous?: boolean
  /** A check finer than presence: a number to validate, a date to compare. */
  valider?: (doc: Texte) => Verdict
  /** Where to find the information when missing; how to correct. */
  aide: string
  correction?: string
}

export interface Referentiel {
  id: string
  titre: string
  accroche: string
  description: string
  /** Main texts, shown above the checklist. */
  cadre: Source[]
  points: Point[]
  /** Said once, above the results: what the tool cannot check. */
  limites: string[]
}

/** Each page in a searchable form of the same length: accents and case
 *  folded character by character, so that a match points back into the
 *  original text for the passage shown. */
export interface Texte {
  pages: string[]
  plies: string[]
}

function plierMemeLongueur(t: string): string {
  let r = ''
  for (const c of t) {
    const base = c.normalize('NFD')[0] ?? c
    r += (base.length === c.length ? base : c).toLowerCase().replace(/[’`]/, "'")
  }
  return r.length === t.length ? r : t.toLowerCase()
}

export function preparer(doc: Document): Texte {
  return { pages: doc.pages, plies: doc.pages.map(plierMemeLongueur) }
}

/** Every match of a pattern, with its passage (one per page at most). */
export function trouver(t: Texte, re: RegExp, max = 3): Extrait[] {
  const out: Extrait[] = []
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
  t.plies.forEach((p, i) => {
    if (out.length >= max) return
    g.lastIndex = 0
    const m = g.exec(p)
    if (!m) return
    const a = Math.max(0, m.index - 70)
    const b = Math.min(p.length, m.index + m[0].length + 90)
    const brut = t.pages[i].slice(a, b).replace(/\s+/g, ' ').trim()
    out.push({ page: i + 1, texte: `${a > 0 ? '… ' : ''}${brut}${b < p.length ? ' …' : ''}` })
  })
  return out
}

export function verifier(p: Point, t: Texte): Verdict {
  if (p.valider) return p.valider(t)
  if (!p.chercher?.length) return { statut: 'a-verifier', detail: 'À vérifier à la lecture : une recherche dans le texte ne peut pas en juger.' }
  const resultats = p.chercher.map((re) => trouver(t, re))
  const ok = p.tous ? resultats.every((r) => r.length) : resultats.some((r) => r.length)
  if (!ok) return { statut: 'absent', detail: 'Non trouvé dans le texte du document.' }
  return { statut: 'present', extraits: resultats.flat().slice(0, 3) }
}

// ---- Validators shared by the referentials ------------------------------------

/** SIRET: 14 digits passing the Luhn check (La Poste excepted). */
export function siretValide(s: string): boolean {
  const d = s.replace(/\D/g, '')
  if (d.length !== 14) return false
  if (d.startsWith('356000000')) return [...d].reduce((a, c) => a + Number(c), 0) % 5 === 0
  let somme = 0
  for (let i = 0; i < 14; i++) {
    let n = Number(d[13 - i])
    if (i % 2 === 1) {
      n *= 2
      if (n > 9) n -= 9
    }
    somme += n
  }
  return somme % 10 === 0
}

export function validerSiret(t: Texte): Verdict {
  const extraits: Extrait[] = []
  const invalides: string[] = []
  const valides: string[] = []
  t.plies.forEach((p, i) => {
    for (const m of p.matchAll(/siret[^0-9]{0,30}((?:\d[\s.]?){13}\d)/g)) {
      const n = m[1].replace(/\D/g, '')
      ;(siretValide(n) ? valides : invalides).push(n)
      if (extraits.length < 3) extraits.push({ page: i + 1, texte: t.pages[i].slice(Math.max(0, m.index - 30), m.index + m[0].length + 20).replace(/\s+/g, ' ').trim() })
    }
  })
  if (invalides.length) return { statut: 'invalide', detail: `N° SIRET invalide (clé de contrôle fausse) : ${[...new Set(invalides)].join(', ')}.`, extraits }
  if (valides.length) return { statut: 'present', detail: `N° SIRET valide : ${[...new Set(valides)].join(', ')}.`, extraits }
  return { statut: 'absent', detail: 'Aucun n° SIRET (14 chiffres) trouvé.' }
}
