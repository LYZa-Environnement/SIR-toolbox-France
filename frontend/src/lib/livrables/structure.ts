/**
 * The headings of a deliverable — "2.1 Contexte", "CONCLUSIONS", "Annexe 3 :
 * Bulletins d'analyses" — told from its lines, so that a missing point can
 * be placed in the paragraph that should hold it. The table of contents is
 * left out: its lines end with a page number.
 */

import type { Texte } from './controles.ts'

export interface Section {
  /** "2.1", "Annexe 3", or empty for an unnumbered heading. */
  numero: string
  titre: string
  /** 1 for a chapter, 2 for "2.1"… */
  niveau: number
  /** Index of the page within the deliverable's text. */
  index: number
  page: number
  document?: string
  /** Title folded (lower case, no accents), for matching. */
  plie: string
}

const plier = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’`]/g, "'")
    .toLowerCase()

/** Headings that stand without a number. */
const TITRES_SEULS =
  /^(introduction|preambule|avant-propos|contexte( et objectifs?( de la mission)?)?|objet( de la mission| du (present )?(rapport|document))?|objectifs?( de la mission)?|resume( technique| non technique)?|synthese( technique| non technique| generale)?|conclusions?( generales?)?( et (recommandations|preconisations|perspectives))?|recommandations|preconisations|annexes|liste des annexes|bibliographie|references( bibliographiques| documentaires)?|documents (consultes|de reference)|glossaire|limites( de l'etude| et incertitudes)?|incertitudes|fiche signaletique|identification du document|historique des (versions|revisions|modifications))\s*:?$/

const ADRESSES = /^(rue|avenue|bd|boulevard|chemin|route|allee|place|impasse|quai|cours|janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre|m\b|cm\b|mm\b|mg|µg|ug|kg|t\b|ha\b|%|°|h\b|j\b|ans?\b|mois\b|sondages?\b|echantillons?\b|piezometres?\b)/

function titre(ligne: string): { numero: string; titre: string; niveau: number } | null {
  const l = ligne.replace(/\s+/g, ' ').trim()
  if (l.length < 3 || l.length > 120) return null
  // Table of contents: dot leaders, or a page number at the end.
  if (/(\.\s?){3,}|…/.test(l) || (/\s\d{1,3}$/.test(l) && !/^annexe\s+\d+$/i.test(l))) return null
  if (/[.;,]$/.test(l)) return null

  const annexe = /^(annexe\s+[\dA-Z]{1,3})\s*[:\-–—.]?\s*(.*)$/i.exec(l)
  if (annexe) return { numero: annexe[1].replace(/^a/, 'A').replace(/^ANNEXE/, 'Annexe'), titre: annexe[2] || annexe[1], niveau: 1 }

  const num = /^((?:\d{1,2}\.){0,3}\d{1,2})(\.?)\s+(?:[-–—:]\s*)?(\S.*)$/.exec(l)
  if (num) {
    const [, numero, point, reste] = num
    if (!/^[A-ZÀ-Ý]/.test(reste) || reste.length < 3) return null
    const p = plier(reste)
    if (ADRESSES.test(p)) return null
    const niveau = numero.split('.').length
    // A single number is a heading only with "1." or "1 INTRODUCTION" or a
    // known title: "3 Sondages ont été réalisés" is not one.
    if (niveau === 1 && !point && reste !== reste.toUpperCase() && !TITRES_SEULS.test(p)) return null
    if (Number(numero.split('.')[0]) > 30) return null
    // Mostly words: a line of a table ("2 12,5 0,3") is not a heading.
    if ((reste.match(/\p{L}/gu)?.length ?? 0) < reste.length * 0.5) return null
    return { numero, titre: reste.replace(/\s*:$/, ''), niveau }
  }

  const p = plier(l)
  if (TITRES_SEULS.test(p)) return { numero: '', titre: l.replace(/\s*:$/, ''), niveau: 1 }
  return null
}

/** Headings in reading order; a heading repeated (a running header) once. */
export function lireSections(t: Texte): Section[] {
  const out: Section[] = []
  const vus = new Set<string>()
  t.pages.forEach((page, index) => {
    const o = t.origines[index] ?? { document: '', page: index + 1 }
    for (const ligne of page.split(/\n/)) {
      const h = titre(ligne)
      if (!h) continue
      const cle = `${o.document}|${h.numero}|${plier(h.titre)}`
      if (vus.has(cle)) continue
      vus.add(cle)
      out.push({ ...h, index, page: o.page, document: t.plusieurs ? o.document : undefined, plie: plier(h.titre) })
    }
  })
  return out
}

/** "§ 2.1 « Contexte » (p. 5)". */
export function nommer(s: Section): string {
  const ou = `p. ${s.page}${s.document ? `, ${s.document}` : ''}`
  if (/^annexe/i.test(s.numero)) return `${s.numero}${s.titre !== s.numero ? ` « ${s.titre} »` : ''} (${ou})`
  return `${s.numero ? `§ ${s.numero} ` : 'paragraphe '}« ${s.titre} » (${ou})`
}
