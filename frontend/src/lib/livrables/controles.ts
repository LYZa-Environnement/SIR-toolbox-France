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

export type Statut = 'present' | 'absent' | 'invalide' | 'a-verifier' | 'sans-objet'

export interface Extrait {
  /** Page within its document. */
  page: number
  /** The document it comes from, when the deliverable has several. */
  document?: string
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
  /** Only when the document is about it (a pumping, a discharge…). */
  siConcerne?: { motif: RegExp; libelle: string }
  /** Where to find the information when missing; how to correct. */
  aide: string
  correction?: string
}

/** What the reader decides, over the automatic reading. */
export type Decision = '' | 'conforme' | 'non-conforme' | 'sans-objet'

export interface Resultat {
  point: Point
  verdict: Verdict
  decision: Decision
  commentaire: string
}

/** A document a deliverable is made of, told by its title. */
export interface Piece {
  libelle: string
  motif: RegExp
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
  /** Separate documents the deliverable usually comes as. */
  pieces?: Piece[]
}

/** Each page in a searchable form of the same length: accents and case
 *  folded character by character, so that a match points back into the
 *  original text for the passage shown. */
export interface Texte {
  pages: string[]
  plies: string[]
  /** Where each page comes from: document and page within it. */
  origines: { document: string; page: number }[]
  /** More than one document: passages name theirs. */
  plusieurs: boolean
}

function plierMemeLongueur(t: string): string {
  let r = ''
  for (const c of t) {
    const base = c.normalize('NFD')[0] ?? c
    r += (base.length === c.length ? base : c).toLowerCase().replace(/[’`]/, "'")
  }
  return r.length === t.length ? r : t.toLowerCase()
}

/** One or several documents read as one deliverable (an IOTA declaration
 *  is three: document d'incidences, Natura 2000, résumé non technique). */
export function preparer(docs: Document | Document[]): Texte {
  const liste = Array.isArray(docs) ? docs : [docs]
  const pages = liste.flatMap((d) => d.pages)
  return {
    pages,
    plies: pages.map(plierMemeLongueur),
    origines: liste.flatMap((d) => d.pages.map((_, i) => ({ document: d.nom, page: i + 1 }))),
    plusieurs: liste.length > 1,
  }
}

/** The page reference of a passage. */
export function extrait(t: Texte, i: number, texte: string): Extrait {
  const o = t.origines[i] ?? { document: '', page: i + 1 }
  return { page: o.page, document: t.plusieurs ? o.document : undefined, texte }
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
    out.push(extrait(t, i, `${a > 0 ? '… ' : ''}${brut}${b < p.length ? ' …' : ''}`))
  })
  return out
}

export const contient = (t: Texte, re: RegExp) => t.plies.some((p) => re.test(p))

export function verifier(p: Point, t: Texte): Verdict {
  if (p.siConcerne && !contient(t, p.siConcerne.motif)) return { statut: 'sans-objet', detail: `Sans objet : le document ne mentionne pas ${p.siConcerne.libelle}.` }
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
      if (extraits.length < 3) extraits.push(extrait(t, i, t.pages[i].slice(Math.max(0, m.index - 30), m.index + m[0].length + 20).replace(/\s+/g, ' ').trim()))
    }
  })
  if (invalides.length) return { statut: 'invalide', detail: `N° SIRET invalide (clé de contrôle fausse) : ${[...new Set(invalides)].join(', ')}.`, extraits }
  if (valides.length) return { statut: 'present', detail: `N° SIRET valide : ${[...new Set(valides)].join(', ')}.`, extraits }
  return { statut: 'absent', detail: 'Aucun n° SIRET (14 chiffres) trouvé.' }
}
