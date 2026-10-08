/**
 * Compositional signatures of the organic families: for each family (COHV,
 * BTEX, HAP, PFAS, hydrocarbon fractions…) and each sample, the share of
 * every quantified compound in the family total. A COHV signature dominated
 * by PCE points at a source, one dominated by cis-DCE and VC at
 * degradation; a heavy or light hydrocarbon profile tells product types
 * apart.
 *
 * Totals and aggregates ("BTEX totaux", "xylènes", sums) are left out so
 * that nothing is counted twice; results below the LQ count as zero.
 */

import { facteurUnite } from './guides.ts'
import type { Lecture, Parametre } from './parse.ts'

export interface Part {
  nom: string
  valeur: number
}

export interface Signature {
  echantillon: string
  total: number
  parts: Part[]
}

export interface SignatureFamille {
  famille: string
  unite: string
  composes: Parametre[]
  /** One per sample with at least one quantified compound. */
  echantillons: Signature[]
  /** All samples together (sum of the results). */
  ensemble: Signature
}

const NON_ORGANIQUE = /m[ée]ta(l|ux)|inorgan|\bions?\b|anions?|cations?|physico|lixiv|[ée]luat|divers|cyanure|\betm\b|[ée]l[ée]ments?|param[èe]tres? g[ée]n[ée]raux|pr[ée]paration|pr[ée]traitement|mati[èe]re s[èe]che/i

export function signatures(lecture: Lecture, echantillons: string[]): SignatureFamille[] {
  const familles = new Map<string, Parametre[]>()
  for (const p of lecture.parametres.CM) {
    if (!p.famille || NON_ORGANIQUE.test(p.famille) || p.somme || !/g\s*\//i.test(p.unite)) continue
    familles.set(p.famille, [...(familles.get(p.famille) ?? []), p])
  }
  const out: SignatureFamille[] = []
  for (const [famille, composes] of familles) {
    if (composes.length < 2) continue
    const unite = composes[0].unite
    const facteurs = composes.map((c) => facteurUnite(c.unite, unite) ?? (c.unite === unite ? 1 : null))
    const parEchantillon: Signature[] = []
    const cumul = new Map<string, number>()
    for (const nom of echantillons) {
      const parts: Part[] = []
      composes.forEach((c, i) => {
        const m = lecture.valeurs.CM[nom]?.[c.cle]
        if (!m || m.inferieur || m.valeur === null || facteurs[i] === null || m.valeur <= 0) return
        const v = m.valeur * facteurs[i]!
        parts.push({ nom: c.nom, valeur: v })
        cumul.set(c.nom, (cumul.get(c.nom) ?? 0) + v)
      })
      if (parts.length) parEchantillon.push({ echantillon: nom, total: parts.reduce((a, p) => a + p.valeur, 0), parts })
    }
    if (!parEchantillon.length) continue
    const partsEnsemble = composes.filter((c) => cumul.has(c.nom)).map((c) => ({ nom: c.nom, valeur: cumul.get(c.nom)! }))
    out.push({
      famille,
      unite,
      composes,
      echantillons: parEchantillon,
      ensemble: { echantillon: 'Ensemble des échantillons', total: partsEnsemble.reduce((a, p) => a + p.valeur, 0), parts: partsEnsemble },
    })
  }
  return out
}

/** A stable colour per compound, the same in every pie of a family. */
export const PALETTE = ['#0d2421', '#00a37e', '#82a78d', '#f2a541', '#c34a35', '#5c6bc0', '#2a8f9e', '#7c3f8f', '#d6572e', '#1f6fa8', '#446d5d', '#b5893a']
export const COULEUR_AUTRES = '#c8ccc9'
export const SEUIL_AUTRES = 0.03

/** Slices under 3 % merged into "Autres", colours fixed by compound order. */
export function preparerParts(parts: Part[], ordre: string[]): { nom: string; part: number; couleur: string }[] {
  const total = parts.reduce((a, p) => a + p.valeur, 0)
  if (!total) return []
  const grandes = parts.filter((p) => p.valeur / total >= SEUIL_AUTRES)
  const petites = parts.filter((p) => p.valeur / total < SEUIL_AUTRES)
  const out = grandes
    .sort((a, b) => ordre.indexOf(a.nom) - ordre.indexOf(b.nom))
    .map((p) => ({ nom: p.nom, part: p.valeur / total, couleur: PALETTE[ordre.indexOf(p.nom) % PALETTE.length] }))
  if (petites.length) out.push({ nom: `Autres (${petites.length})`, part: petites.reduce((a, p) => a + p.valeur, 0) / total, couleur: COULEUR_AUTRES })
  return out
}
