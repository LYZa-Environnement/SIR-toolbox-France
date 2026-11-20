/**
 * What the usual lab packages say about a petroleum product, without
 * pristane or phytane (which most French labs do not offer): the 16 PAH
 * (US EPA list), the BTEX, the C5–C10 and C10–C40 indices and their
 * fractions.
 *
 * - Origin of the PAH: petrogenic or pyrolytic, from the 2–3 / 4–6 ring
 *   balance (Wang et al., 1999), phenanthrene / anthracene (BRGM
 *   RP-64174-FR, table 25, after Bocard, 2006) and the isomer ratios of
 *   Yunker et al. (2002) already used by the expert export.
 * - Weathering sequence: compounds disappear in a known order — light
 *   n-alkanes, BTEX, alkylbenzenes, isoprenoids and naphthalenes, then the
 *   other PAH (BRGM § 2.3, after Oudijk, 2009); PAH of 2–3 rings go before
 *   those of 4–6 rings (BRGM § 2.3 c and § 5.2.2, after Douglas et al.,
 *   2007); BTEX and propylbenzenes are gone once about 20–25 % of the
 *   product mass is degraded (BRGM § 2.3 b). Read on naphthalene /
 *   phenanthrene, the 2–3 / 4–6 ring balance and the presence of BTEX.
 *   The cut-offs (1 and 0.1 on naphthalene / phenanthrene) are tool
 *   markers, not published thresholds.
 * - BTEX: benzene leaves a free product first (most soluble) but resists
 *   longer than toluene, ethylbenzene and xylenes without oxygen (BRGM
 *   § 2.3 b) ; loss of toluene with ethylbenzene enriched relative to the
 *   xylenes points to anaerobic degradation (ITRC, 2018, after Beller et
 *   al., 1995).
 */

import { compact, HAP, NOMS_HAP, RATIOS_HAP } from '../resultats/expert/diagnostics.ts'
import type { Lecture, Parametre } from '../resultats/parse.ts'
import { nombreFr } from '../format.ts'
import type { Fraction } from './profil.ts'

export type CodeBtex = 'B' | 'T' | 'E' | 'X'

export interface Composes {
  /** PAH by code (Nap, Phe…): value, 0 when below the LQ; missing key: not analysed. */
  hap: Partial<Record<string, number>>
  btex: Partial<Record<CodeBtex, number>>
  /** n-C17, pristane, n-C18, phytane when the lab gives them. */
  isoprenoides: Partial<Record<'c17' | 'pr' | 'c18' | 'ph', number>>
  hct: number | null
  c5c10: number | null
  fractions: Fraction[]
  /** Unit of the values (all brought to the same one). */
  unite: string
}

export const COMPOSES_VIDES: Composes = { hap: {}, btex: {}, isoprenoides: {}, hct: null, c5c10: null, fractions: [], unite: '' }

type Niveau = 'info' | 'attention' | 'fort'
export interface ConstatComposes {
  texte: string
  refs: string[]
  niveau: Niveau
}

export interface IndiceComposes {
  libelle: string
  valeur: number | null
  lecture: string
  refs: string[]
}

export interface EtapeSequence {
  /** 0 (light compounds still there) to 3 (2–3 ring PAH largely gone); null: not judged. */
  code: number | null
  libelle: string
  texte: string
  refs: string[]
}

export interface LectureComposes {
  origine: { verdict: 'pétrogénique' | 'pyrolytique' | 'mixte' | null; texte: string; refs: string[] } | null
  sequence: EtapeSequence | null
  constats: ConstatComposes[]
  indices: IndiceComposes[]
}

const fr = (v: number) => nombreFr(v, 2)

const ETAPES = [
  'Composés légers encore présents',
  'Altération engagée',
  'Altération avancée',
  'Altération très avancée, ou apport de combustion',
]

export function lireComposes(c: Composes, matrice: 'sol' | 'eau'): LectureComposes {
  const constats: ConstatComposes[] = []
  const indices: IndiceComposes[] = []
  const h = (code: string) => c.hap[code]
  const analyses = Object.keys(c.hap).filter((k) => HAP[k])
  const quantifies = analyses.filter((k) => (c.hap[k] ?? 0) > 0)
  let lmw = 0
  let hmw = 0
  for (const k of quantifies) {
    if (HAP[k].cycles <= 3) lmw += c.hap[k]!
    else hmw += c.hap[k]!
  }
  const somme = lmw + hmw

  // ---- Origin of the PAH ----
  let origine: LectureComposes['origine'] = null
  if (quantifies.length >= 3) {
    const votes: { libelle: string; origine: 'pétrogénique' | 'pyrolytique' | 'mixte' }[] = []
    if (lmw > 0 && hmw > 0) {
      const r = lmw / hmw
      votes.push({ libelle: `HAP 2–3 cycles / 4–6 cycles = ${fr(r)}`, origine: r > 1 ? 'pétrogénique' : 'pyrolytique' })
    }
    const phe = h('Phe')
    const ant = h('Ant')
    if (phe && ant) {
      const r = phe / ant
      votes.push({ libelle: `phénanthrène / anthracène = ${fr(r)}`, origine: r > 25 ? 'pétrogénique' : r < 10 ? 'pyrolytique' : 'mixte' })
    }
    for (const r of RATIOS_HAP) {
      const a = h(r.num)
      const b = h(r.autre)
      if (!a || !b) continue
      const v = a / (a + b)
      let i = r.seuils.findIndex((s) => v < s)
      if (i < 0) i = r.lectures.length - 1
      votes.push({ libelle: `${r.code} = ${fr(v)} (${r.lectures[i]})`, origine: r.origines[i] })
    }
    if (votes.length) {
      const petro = votes.filter((v) => v.origine === 'pétrogénique').length
      const pyro = votes.filter((v) => v.origine === 'pyrolytique').length
      const verdict = petro > pyro ? 'pétrogénique' : pyro > petro ? 'pyrolytique' : 'mixte'
      origine = {
        verdict,
        texte: `${verdict === 'pétrogénique' ? 'HAP plutôt pétrogéniques (issus du produit pétrolier lui-même)' : verdict === 'pyrolytique' ? 'HAP plutôt pyrolytiques (combustion : suies, mâchefers, goudrons, huiles usagées)' : 'Origine des HAP mixte ou indéterminée'} — ${petro} indice(s) pétrogénique(s), ${pyro} pyrolytique(s) sur ${votes.length} : ${votes.map((v) => v.libelle).join(' ; ')}. Ces rapports confirment ou non une origine pétrolière mais ne distinguent pas deux produits pétroliers entre eux.`,
        refs: ['wang1999', 'brgm2014', 'yunker2002'],
      }
      indices.push({ libelle: 'HAP 2–3 cycles / 4–6 cycles', valeur: lmw > 0 && hmw > 0 ? lmw / hmw : null, lecture: 'Supérieur à 1 : pétrogénique ; inférieur : pyrolytique, ou produit très altéré (les légers partent les premiers).', refs: ['wang1999', 'brgm2014'] })
    }
  }

  // ---- Weathering sequence ----
  const btexAnalyses = (Object.keys(c.btex) as CodeBtex[]).length > 0
  const btexPresents = (Object.values(c.btex) as number[]).some((v) => v > 0)
  const nap = h('Nap')
  const phe = h('Phe')
  const napPhe = nap !== undefined && phe ? nap / phe : null
  if (napPhe !== null) indices.push({ libelle: 'Naphtalène / phénanthrène', valeur: napPhe, lecture: 'Le naphtalène (2 cycles) disparaît bien avant le phénanthrène (3 cycles) : le rapport baisse avec l’altération. Supérieur à 1 pour un distillat peu altéré (repère de l’outil).', refs: ['brgm2014'] })
  let sequence: EtapeSequence | null = null
  const refsSeq = ['brgm2014', 'oudijk2009']
  if (origine?.verdict === 'pyrolytique') {
    sequence = {
      code: null,
      libelle: 'Non évaluable',
      texte: 'HAP surtout pyrolytiques : leur profil reflète la combustion, non le vieillissement d’un produit pétrolier.',
      refs: ['brgm2014'],
    }
  } else if (napPhe !== null || (btexAnalyses && somme > 0)) {
    const ratio = lmw > 0 && hmw > 0 ? lmw / hmw : null
    let code: number
    const raisons: string[] = []
    if (napPhe !== null) raisons.push(`naphtalène / phénanthrène = ${fr(napPhe)}`)
    if (ratio !== null) raisons.push(`HAP 2–3 / 4–6 cycles = ${fr(ratio)}`)
    if (btexAnalyses) raisons.push(btexPresents ? 'BTEX quantifiés' : 'BTEX sous la LQ')
    if (ratio !== null && ratio < 1 && (napPhe === null || napPhe < 0.1)) code = 3
    else if (napPhe !== null && napPhe < 0.1) code = 2
    else if ((napPhe !== null && napPhe < 1) || (btexAnalyses && !btexPresents)) code = 1
    else code = 0
    const sens = [
      'les composés qui partent les premiers (BTEX, naphtalène) sont encore là : produit peu altéré, ou apport récent.',
      `les premiers composés à disparaître ${btexAnalyses && !btexPresents ? '(BTEX) ont disparu — ce qui suppose déjà 20 à 25 % de la masse dégradée pour un carburant —' : 'commencent à manquer :'} le naphtalène recule devant le phénanthrène.`,
      'le naphtalène a presque disparu ; les HAP à 3 cycles dominent encore les 4–6 cycles.',
      'les HAP à 2–3 cycles ont largement disparu au profit des 4–6 cycles — ou les HAP viennent en partie d’une combustion.',
    ]
    sequence = { code, libelle: ETAPES[code], texte: `${raisons.join(', ')} : ${sens[code]}`, refs: refsSeq }
  }

  // ---- BTEX ----
  const { B, T, E, X } = c.btex
  if (B !== undefined && T !== undefined && E !== undefined && X !== undefined) {
    const total = B + T + E + X
    if (total > 0) {
      indices.push({ libelle: 'Part du benzène dans les BTEX', valeur: B / total, lecture: 'Le benzène quitte le premier un produit libre (dissolution), mais résiste plus que les TEX sans oxygène.', refs: ['brgm2014'] })
      if (matrice === 'eau' && B > T + E + X) {
        constats.push({ niveau: 'info', texte: `Benzène majoritaire parmi les BTEX dissous (${Math.round((B / total) * 100)} %) : sans oxygène, toluène, éthylbenzène et xylènes se dégradent avant lui — conditions réductrices, ou panache déjà ancien.`, refs: ['brgm2014'] })
      }
      if (matrice === 'sol' && B < 0.02 * total && T + E + X > 0) {
        constats.push({ niveau: 'info', texte: 'Benzène presque absent des BTEX du sol : il quitte le premier un produit libre par dissolution et volatilisation — produit qui a vieilli au contact de l’eau ou de l’air.', refs: ['brgm2014'] })
      }
      if (E > 0 && X > 0 && T < E && E / X > 0.5) {
        constats.push({ niveau: 'info', texte: `Toluène inférieur à l’éthylbenzène et éthylbenzène / xylènes = ${fr(E / X)} : toluène consommé et éthylbenzène relativement enrichi, signe de dégradation anaérobie (repères de l’outil : T < E, E/X > 0,5).`, refs: ['itrc2018'] })
      }
    }
  }

  // ---- Light fraction ----
  if (c.c5c10 !== null && c.hct !== null && c.c5c10 + c.hct > 0) {
    const part = c.c5c10 / (c.c5c10 + c.hct)
    indices.push({ libelle: 'Part de C5–C10 dans C5–C40', valeur: part, lecture: 'Forte pour une essence fraîche ; diminue quand les volatils s’évaporent.', refs: ['brgm2014'] })
    if (part > 0.5) constats.push({ niveau: 'info', texte: `Fraction volatile C5–C10 majoritaire (${Math.round(part * 100)} % de C5–C40) : essence ou solvant léger, encore peu évaporé.`, refs: ['brgm2014'] })
  }

  if (somme > 0 && origine?.verdict !== 'pyrolytique') {
    const lourds = quantifies.filter((k) => HAP[k].cycles >= 5)
    if (!lourds.length && quantifies.includes('Nap')) {
      constats.push({ niveau: 'info', texte: `HAP limités aux 2–4 cycles (${quantifies.map((k) => NOMS_HAP[k].toLowerCase()).join(', ')}) : profil d’un distillat (gazole, kérosène, essence) plutôt que d’un produit lourd ou de goudrons.`, refs: ['brgm2014'] })
    }
  }

  return { origine, sequence, constats, indices }
}

// ---- From the lab's results file ----------------------------------------------------------

const BTEX_NOMS: Record<CodeBtex, string[]> = {
  B: ['benzene'],
  T: ['toluene'],
  E: ['ethylbenzene'],
  X: ['xylenes', 'xylenestotaux', 'sommedesxylenes', 'xylene', 'sommexylenes', 'xylenessomme', 'xylenestotal', 'xylenesom'],
}
const XYLENES_PARTIELS = [['orthoxylene', 'oxylene'], ['paraetmetaxylene', 'metaetparaxylene', 'mpxylene', 'xylenemetapara', 'mxylenepxylene', 'metaparaxylene']]
const ISO_NOMS = {
  c17: ['nheptadecane', 'heptadecane', 'nc17'],
  pr: ['pristane'],
  c18: ['noctadecane', 'octadecane', 'nc18'],
  ph: ['phytane'],
}
const HCT = /hydrocarbures?.*c\s*10\s*[-–àa]+\s*c\s*40|indice\s+(d.)?hydrocarbure|^hct\b/i
const C5C10 = /c\s*5\s*[-–àa]+\s*c\s*10|hydrocarbures?\s+volatils/i

/** Carbon bounds of a fraction name: "fraction C10-C12", "> C12 - C16" → [10, 12]. */
function bornes(nom: string): [number, number] | null {
  const m = nom.match(/c\s*(\d+)\s*(?:[-–à]|a)\s*>?\s*n?c\s*(\d+)/i)
  return m ? [Number(m[1]), Number(m[2])] : null
}

/** Samples of a lab file that have at least one value in the families read here. */
export function echantillonsComposes(l: Lecture): string[] {
  return l.points.map((p) => p.nom).filter((n) => Object.keys(l.valeurs.CM[n] ?? {}).length > 0)
}

/**
 * The PAH, BTEX, isoprenoids, indices and fractions of one sample, all in
 * the unit of the first one found (µg-based conversion of the lab's units).
 */
export function composesDepuisLecture(l: Lecture, echantillon: string): Composes {
  const params = l.parametres.CM
  const valeurs = l.valeurs.CM[echantillon] ?? {}
  let unite = ''
  let facteurRef = 1
  const lire = (p: Parametre | undefined): number | undefined => {
    if (!p) return undefined
    const m = valeurs[p.cle]
    if (!m || m.valeur === null) return undefined
    if (!unite) {
      unite = p.unite
      facteurRef = p.versMicrogrammes || 1
    }
    return m.inferieur ? 0 : (m.valeur * (p.versMicrogrammes || 1)) / facteurRef
  }
  const trouver = (variantes: string[]) => params.find((p) => !p.somme && variantes.includes(compact(p.nom)))
  const c: Composes = { hap: {}, btex: {}, isoprenoides: {}, hct: null, c5c10: null, fractions: [], unite: '' }
  for (const [code, def] of Object.entries(HAP)) {
    const v = lire(trouver(def.variantes))
    if (v !== undefined) c.hap[code] = v
  }
  for (const code of ['B', 'T', 'E'] as CodeBtex[]) {
    const v = lire(trouver(BTEX_NOMS[code]))
    if (v !== undefined) c.btex[code] = v
  }
  const xTotal = lire(params.find((p) => BTEX_NOMS.X.includes(compact(p.nom))))
  if (xTotal !== undefined) c.btex.X = xTotal
  else {
    const parts = XYLENES_PARTIELS.map((v) => lire(trouver(v)))
    if (parts.some((v) => v !== undefined)) c.btex.X = parts.reduce<number>((s, v) => s + (v ?? 0), 0)
  }
  for (const [k, v] of Object.entries(ISO_NOMS)) {
    const x = lire(trouver(v))
    if (x !== undefined) c.isoprenoides[k as keyof Composes['isoprenoides']] = x
  }
  const hct = params.find((p) => HCT.test(p.nom))
  c.hct = lire(hct) ?? null
  const legers = params.find((p) => C5C10.test(p.nom) && !HCT.test(p.nom))
  c.c5c10 = lire(legers) ?? null
  for (const p of params) {
    if (p === hct || p === legers || /aliph|arom|total|indice|somme|%/i.test(p.nom)) continue
    const b = bornes(p.nom)
    if (!b || b[1] <= b[0] || b[1] - b[0] > 20 || b[0] < 10) continue
    const v = lire(p)
    if (v !== undefined) c.fractions.push({ bas: b[0], haut: b[1], valeur: v })
  }
  c.unite = unite
  return c
}
