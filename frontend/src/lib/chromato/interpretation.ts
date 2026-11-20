/**
 * Reading of a hydrocarbon chromatogram (or of the lab's figures): nature
 * of the product, origin, weathering, approximate age, and what to analyse
 * next. Every reading cites its source (references.ts).
 *
 * The approach is the second level of the graded method of the BRGM report
 * RP-64174-FR (§ 6.2): GC-FID fingerprint, product cut, weathering state
 * and the three isoprenoid ratios n-C17/pristane, n-C18/phytane and
 * pristane/phytane. Thresholds that are conventions of this tool, not of a
 * source, are said so in the text ("repère de l'outil").
 */

import { nombreFr } from '../format.ts'
import { PRODUITS, PRODUIT_PAR_ID, type Produit } from './produits.ts'
import { distributionProfil, indicateursProfil, type Distribution, type EtatDoublet, type IndicateursProfil, type Pic, type Profil } from './profil.ts'

export type Matrice = 'sol' | 'eau'
export type OuiNon = 'oui' | 'non' | null

export interface Entree {
  nom: string
  matrice: Matrice
  source: 'chromatogramme' | 'fractions' | 'saisie'
  distribution: Distribution | null
  indicateurs: IndicateursProfil | null
  /** Peak heights (chromatogram) or concentrations (lab), same unit for the four. */
  c17: number | null
  pr: number | null
  c18: number | null
  ph: number | null
  doublets?: { c17: EtatDoublet; c18: EtatDoublet }
  btex?: { B: number; T: number; E: number; X: number } | null
  plomb?: OuiNon
  oxygenes?: OuiNon
  /** C10–C40 index and its quantification limit, same unit. */
  hct?: number | null
  lq?: number | null
  /** Product family chosen by the user, overriding the automatic reading. */
  produitImpose?: string | null
}

export type Niveau = 'info' | 'attention' | 'fort'

export interface Constat {
  texte: string
  refs: string[]
  niveau: Niveau
}

export interface Candidat {
  produit: Produit
  score: number
  verdict: 'compatible' | 'possible' | 'peu compatible'
  raisons: string[]
}

export interface Stade {
  /** 0 (no sign) to 4 (only the hump left); null when it cannot be judged. */
  code: number | null
  libelle: string
  /** Matching levels of the Peters and Moldowan scale. */
  pm: string
  texte: string
  refs: string[]
  confiance: 'bonne' | 'moyenne' | 'faible'
}

export interface Age {
  methode: string
  applicable: boolean
  valeur: string
  detail: string
  refs: string[]
  /** Central estimate and range in years, when computed. */
  annees?: { centre: number; bas: number; haut: number }
}

export interface Ratio {
  libelle: string
  valeur: number | null
  format: (v: number) => string
  lecture: string
  refs: string[]
}

export interface Lecture {
  qualite: Constat[]
  candidats: Candidat[]
  produit: Produit | null
  melange: Constat | null
  origine: Constat[]
  stade: Stade
  alteration: Constat[]
  ages: Age[]
  ratios: Ratio[]
  suites: Constat[]
  synthese: string
}

const fr = (v: number, d = 2) => nombreFr(v, d)
const C = (v: number) => `C${fr(v, 1)}`

/** Initial n-C17/pristane of diesels, 2.1 to 2.5 (BRGM RP-64174-FR, § 5.5.2 b). */
export const R0_GAZOLE: [number, number] = [2.1, 2.5]

/** Peaks picked by hand on the chromatogram, replacing the automatic reading. */
export interface PicsManuels {
  c17?: Pic | null
  pr?: Pic | null
  c18?: Pic | null
  ph?: Pic | null
}

/**
 * The input of the reading from a digitised chromatogram. A missing n-alkane
 * next to a found isoprenoid counts as zero (degraded away); otherwise
 * unknown.
 */
export function entreeDepuisProfil(nom: string, matrice: Matrice, p: Profil, manuels: PicsManuels = {}): Entree {
  const d = distributionProfil(p)
  const c17 = manuels.c17 !== undefined ? manuels.c17 : p.alcanes[17]
  const pr = manuels.pr !== undefined ? manuels.pr : p.pristane
  const c18 = manuels.c18 !== undefined ? manuels.c18 : p.alcanes[18]
  const ph = manuels.ph !== undefined ? manuels.ph : p.phytane
  return {
    nom,
    matrice,
    source: 'chromatogramme',
    distribution: d,
    indicateurs: d ? indicateursProfil(p, d) : null,
    c17: c17 ? c17.hauteur : pr ? 0 : null,
    pr: pr ? pr.hauteur : null,
    c18: c18 ? c18.hauteur : ph ? 0 : null,
    ph: ph ? ph.hauteur : null,
    doublets: {
      c17: manuels.pr || manuels.c17 ? 'resolu' : p.doublets.c17,
      c18: manuels.ph || manuels.c18 ? 'resolu' : p.doublets.c18,
    },
  }
}

// ---- Product ---------------------------------------------------------------------------

function partDans(d: Distribution, a: number, b: number): number {
  if (!d.aire) return 0
  let s = 0
  for (const bin of d.bins) {
    const recouvrement = Math.max(0, Math.min(bin.n + 1, b) - Math.max(bin.n, a))
    s += bin.total * recouvrement
  }
  return s / d.aire
}

export function evaluerProduits(d: Distribution, ind: IndicateursProfil | null): Candidat[] {
  return PRODUITS.map((p) => {
    const raisons: string[] = []
    const dedans = partDans(d, p.plage[0] - 0.5, p.plage[1] + 0.5)
    raisons.push(`${Math.round(dedans * 100)} % de l’aire entre C${p.plage[0]} et C${p.plage[1]}`)
    const ecart = d.q50 < p.centre[0] ? p.centre[0] - d.q50 : d.q50 > p.centre[1] ? d.q50 - p.centre[1] : 0
    const fCentre = Math.exp(-ecart / 1.5)
    if (ecart > 0) raisons.push(`médiane à ${C(d.q50)}, attendue entre ${C(p.centre[0])} et ${C(p.centre[1])}`)
    // A product spread over a wide range is not matched by a narrow profile
    // (a crude oil spans C10–C40, a diesel does not).
    const etendue = p.plage[1] - p.plage[0]
    const fEtendue = Math.min(1, (d.q95 - d.q05) / (0.6 * etendue))
    if (fEtendue < 0.9) raisons.push(`profil plus étroit (${C(d.q05)}–${C(d.q95)}) que le produit`)
    let fForme = fEtendue
    if (d.partUcm !== null) {
      if (p.ucm === 'faible' && d.partUcm > 0.6) {
        fForme *= 0.75
        raisons.push(`bosse de ${Math.round(d.partUcm * 100)} % de l’aire pour un produit peu ramifié (altération ?)`)
      }
      if (p.ucm === 'fort' && d.partUcm < 0.3) {
        fForme *= 0.6
        raisons.push(`bosse faible (${Math.round(d.partUcm * 100)} %) pour un produit lourd`)
      }
    }
    if (ind) {
      if (p.serie && ind.serie < 0.2) {
        fForme *= 0.8
        raisons.push('n-alcanes peu visibles (produit altéré, ou autre produit)')
      }
      if (!p.serie && ind.serie > 0.6 && p.id !== 'leger') {
        fForme *= 0.55
        raisons.push('série régulière de n-alcanes, inhabituelle pour ce produit')
      }
    }
    const score = dedans * fCentre * fForme
    return { produit: p, score, verdict: score >= 0.6 ? 'compatible' : score >= 0.35 ? 'possible' : 'peu compatible', raisons } as Candidat
  }).sort((a, b) => b.score - a.score)
}

function produitLePlusProche(c: number): Produit {
  return PRODUITS.filter((p) => p.id !== 'brut').reduce((m, p) => {
    const d = (q: Produit) => (c < q.centre[0] ? q.centre[0] - c : c > q.centre[1] ? c - q.centre[1] : 0)
    return d(p) < d(m) ? p : m
  })
}

// ---- Weathering --------------------------------------------------------------------------

const STADES = [
  { libelle: 'Pas de signe de biodégradation', pm: 'PM 0' },
  { libelle: 'Biodégradation légère', pm: 'PM 1–2' },
  { libelle: 'Biodégradation modérée', pm: 'PM 2–3' },
  { libelle: 'Biodégradation avancée', pm: 'PM 3–4' },
  { libelle: 'Biodégradation sévère', pm: 'PM ≥ 5' },
]

function stade(code: number, texte: string, refs: string[], confiance: Stade['confiance']): Stade {
  return { code, ...STADES[code], texte, refs, confiance }
}

export function evaluerStade(e: Entree, produit: Produit | null): Stade {
  const d = e.distribution
  const ind = e.indicateurs
  const bosseNative = produit?.id === 'huile' || produit?.id === 'bitume'
  const iso = e.pr !== null && e.pr > 0
  const alc = e.c17 !== null && e.c17 > 0

  if (iso && e.c17 !== null) {
    const r = e.c17 / e.pr!
    const f = r / ((R0_GAZOLE[0] + R0_GAZOLE[1]) / 2)
    const base = `n-C17/pristane = ${fr(r)}, soit environ ${Math.round(Math.min(1, f) * 100)} % du rapport d’un gazole frais (2,1 à 2,5) : n-C17, plus biodégradable que le pristane, `
    const refs = ['brgm2014', 'petersMoldowan2005', 'itrc2018']
    if (!alc) return stade(3, 'n-C17 n’est plus détecté alors que le pristane subsiste : les n-alcanes ont été consommés, les isoprénoïdes restent.', refs, 'bonne')
    if (f >= 0.8) return stade(0, base + 'est presque intact.', refs, 'bonne')
    if (f >= 0.4) return stade(1, base + 'a commencé à disparaître.', refs, 'bonne')
    if (f >= 0.1) return stade(2, base + 'est en grande partie consommé ; les isoprénoïdes dominent les doublets.', refs, 'bonne')
    return stade(3, base + 'a presque disparu.', refs, 'bonne')
  }
  if (!d) return { code: null, libelle: 'Non évaluable', pm: '—', texte: 'Ni chromatogramme ni teneurs en n-C17 et pristane.', refs: [], confiance: 'faible' }

  // No isoprenoid reading: the shape of the profile only.
  if (bosseNative) {
    return {
      code: null,
      libelle: 'Non évaluable sur la forme',
      pm: '—',
      texte: `Pour une huile ou un produit très lourd, la bosse sans n-alcanes est la forme du produit neuf : elle ne dit rien de son âge. Seuls les biomarqueurs (hopanes, stéranes) en CG/SM permettent de juger son altération.`,
      refs: ['brgm2014'],
      confiance: 'faible',
    }
  }
  const ucm = d.partUcm
  const serie = ind?.serie ?? null
  const pristaneAbsent = e.doublets?.c17 === 'absent' || (e.doublets?.c17 === 'resolu' && !iso)
  if (serie !== null && ucm !== null) {
    const refs = ['brgm2014', 'itrc2018', 'petersMoldowan2005']
    if (serie < 0.15 && ucm > 0.6 && pristaneAbsent) {
      return stade(4, `Ni série de n-alcanes ni pristane visibles, bosse de ${Math.round(ucm * 100)} % de l’aire : seule l’enveloppe non résolue subsiste. Au-delà, la CG/DIF ne permet plus de juger ; la CG/SM (hopanes, stéranes) prend le relais.`, refs, 'moyenne')
    }
    if (serie < 0.2 && ucm > 0.5) return stade(3, `Peu de n-alcanes visibles (${Math.round(serie * 100)} % des carbones) au-dessus d’une bosse de ${Math.round(ucm * 100)} % de l’aire : n-alcanes largement consommés. Les doublets isoprénoïdes n’étant pas lus, le stade reste approximatif.`, refs, 'faible')
    if (serie < 0.6) return stade(1, `Série de n-alcanes incomplète (${Math.round(serie * 100)} % des carbones), bosse de ${Math.round(ucm * 100)} % de l’aire : altération engagée possible. Doublets isoprénoïdes non lus : stade approximatif.`, refs, 'faible')
    return stade(0, `Série de n-alcanes complète (${Math.round(serie * 100)} % des carbones), bosse de ${Math.round(ucm * 100)} % de l’aire : pas de signe net de biodégradation. Doublets isoprénoïdes non lus : à confirmer.`, refs, 'faible')
  }
  return { code: null, libelle: 'Non évaluable', pm: '—', texte: 'Les fractions du laboratoire ne suffisent pas à juger la biodégradation : il faut le chromatogramme ou les teneurs en n-C17 et pristane.', refs: ['brgm2014'], confiance: 'faible' }
}

// ---- Ages ----------------------------------------------------------------------------------

/** Christensen and Larsen (1993): T = −8.4 × (n-C17/Pr) + 19.8 years, ± 2 years. */
export function ageChristensenLarsen(r: number): number {
  return -8.4 * r + 19.8
}

/** Kaplan et al. (1996): Rb = (B + T)/(E + X) = 6.0 × exp(−0.308 t) → t = ln(6 / Rb) / 0.308. */
export function ageKaplan(rb: number): number {
  return Math.log(6 / rb) / 0.308
}

function evaluerAges(e: Entree, produit: Produit | null, distillatDansMelange: boolean): Age[] {
  const ages: Age[] = []
  const iso = e.pr !== null && e.pr > 0
  const distillat = !!produit?.distillatMoyen || distillatDansMelange
  const cl: Age = {
    methode: 'n-C17/pristane (Christensen et Larsen, 1993)',
    applicable: false,
    valeur: '—',
    detail: '',
    refs: ['christensenLarsen1993', 'brgm2014', 'hurstSchmidt2005', 'oudijk2009'],
  }
  if (!iso || e.c17 === null) {
    cl.detail = 'Rapport n-C17/pristane non disponible : doublet non résolu sur le chromatogramme, ou teneurs non fournies. Demander au laboratoire le dosage des n-alcanes, du pristane et du phytane.'
  } else if (!distillat) {
    cl.detail = `La relation a été établie sur des gazoles dans des sols ; le produit lu ici (${produit?.nom.toLowerCase() ?? 'indéterminé'}) n’est pas un distillat moyen. Choisir « gazole » si le contexte du site l’établit.`
  } else {
    const r = e.c17 / e.pr!
    const t = ageChristensenLarsen(r)
    cl.applicable = true
    if (r <= 0) {
      cl.valeur = 'au moins 20 ans environ'
      cl.detail = 'n-C17 n’est plus détecté : le modèle ne donne qu’une borne basse (le n-C17 a presque entièrement disparu après une vingtaine d’années).'
      cl.annees = { centre: 19.8, bas: 17.8, haut: 40 }
    } else if (t < 2) {
      cl.valeur = 'récent (moins de 2 ans environ)'
      cl.detail = `n-C17/Pr = ${fr(r)}, au niveau d’un gazole frais (2,1 à 2,5, soit 0 à 2 ans par l’équation) : pas de biodégradation mesurable du n-C17. Le modèle ne distingue pas les âges inférieurs à 1 ou 2 ans.`
      cl.annees = { centre: 0, bas: 0, haut: 2 }
    } else {
      cl.valeur = `environ ${fr(t, 0)} ans (${fr(Math.max(0, t - 2), 0)} à ${fr(t + 2, 0)} ans)`
      cl.detail = `${distillatDansMelange && !produit?.distillatMoyen ? 'Calcul sur la part distillat moyen du mélange (les doublets C17 et C18 lui appartiennent). ' : ''}T = −8,4 × ${fr(r)} + 19,8 = ${fr(t, 1)} ans. La fourchette ± 2 ans (95 %) ne vaut que pour le sol, la profondeur et la région du calage ; ailleurs l’incertitude est de 3 à 10 ans selon l’activité microbienne, l’oxygène et le type de sol. Le rapport initial varie aussi d’un gazole à l’autre (2,1 à 2,5).`
      cl.annees = { centre: t, bas: Math.max(0, t - 2), haut: t + 2 }
    }
  }
  ages.push(cl)

  if (e.btex) {
    const { B, T, E, X } = e.btex
    const k: Age = {
      methode: 'Rapport BTEX (B + T)/(E + X) (Kaplan et al., 1996)',
      applicable: false,
      valeur: '—',
      detail: '',
      refs: ['kaplan1997', 'brgm2014'],
    }
    if (E + X <= 0 || B + T <= 0) {
      k.detail = 'Il faut le benzène ou le toluène, et l’éthylbenzène ou les xylènes, quantifiés.'
    } else {
      const rb = (B + T) / (E + X)
      const t = ageKaplan(rb)
      k.applicable = true
      k.valeur = t <= 0 ? 'récent' : `environ ${fr(t, 1)} ans`
      k.detail = `Rb = ${fr(rb)} ; Rb = 6,0 × exp(−0,308 t). Valable pour une essence, si le rapport initial de la phase pure est connu (6 dans le modèle) ; méthode très critiquée (Alvarez et al., 2003), car en anaérobie le benzène se dégrade mal et les TEX vite : indication seulement.`
      if (t > 0) k.annees = { centre: t, bas: t, haut: t }
    }
    ages.push(k)
  }

  if (e.plomb === 'oui') {
    ages.push({
      methode: 'Additifs au plomb',
      applicable: true,
      valeur: 'antérieur à 2000 (probable)',
      detail:
        'Alkyl-plomb (plomb tétraéthyle, tétraméthyle…) présents : essence plombée, dont la commercialisation est interdite en France depuis le 1er janvier 2000 (directive 98/70/CE, sans report demandé). Restent possibles un stock ancien ou les petites quantités autorisées pour les véhicules anciens.',
      refs: ['directive9870', 'brgm2014'],
    })
  } else if (e.plomb === 'non' && e.oxygenes === 'oui') {
    ages.push({
      methode: 'Additifs oxygénés',
      applicable: true,
      valeur: 'essence sans plomb',
      detail:
        'Éthers (MTBE, ETBE, TAME) sans alkyl-plomb : essence de l’ère sans plomb, les composés oxygénés ayant remplacé le plomb comme antidétonants. Leur solubilité limite leur durée de vie : présence et absence se lisent dans la phase pure plutôt que dans l’eau.',
      refs: ['brgm2014'],
    })
  }
  return ages
}

// ---- Full reading -------------------------------------------------------------------------

export function interpreter(e: Entree): Lecture {
  const d = e.distribution
  const ind = e.indicateurs
  const qualite: Constat[] = []
  const origine: Constat[] = []
  const alteration: Constat[] = []
  const suites: Constat[] = []

  if (e.hct != null && e.lq != null && e.lq > 0 && e.hct < 5 * e.lq) {
    qualite.push({
      niveau: 'attention',
      texte: `Indice de ${fr(e.hct)} pour une LQ de ${fr(e.lq)} (moins de 5 fois la LQ, repère de l’outil) : le chromatogramme est proche du bruit de fond, sa forme est peu fiable et des composés non pétroliers peuvent peser lourd.`,
      refs: ['itrc2018'],
    })
  }
  if (e.source === 'chromatogramme' && e.doublets && (e.doublets.c17 === 'non-resolu' || e.doublets.c18 === 'non-resolu')) {
    qualite.push({
      niveau: 'info',
      texte: 'Doublets n-C17/pristane ou n-C18/phytane non séparés à la résolution de l’image : rendez la page à plus haute résolution, cadrez plus serré autour de C16–C19, ou désignez les sommets à la main.',
      refs: ['brgm2014', 'nistRi'],
    })
  }

  // Product.
  const candidats = d ? evaluerProduits(d, ind) : []
  const impose = e.produitImpose ? PRODUIT_PAR_ID[e.produitImpose] ?? null : null
  // Plant waxes: the profile is not a petroleum product at all.
  const biogene = (ind?.cpi ?? 0) >= 2
  const produit = impose ?? (!biogene && candidats[0] && candidats[0].verdict !== 'peu compatible' ? candidats[0].produit : null)

  let melange: Constat | null = null
  let distillatDansMelange = false
  if (d && d.lobes.length >= 2) {
    const [a, b] = [d.lobes[0], d.lobes[d.lobes.length - 1]]
    if (b - a >= 5) {
      const pa = produitLePlusProche(a)
      const pb = produitLePlusProche(b)
      distillatDansMelange = !!(pa.distillatMoyen || pb.distillatMoyen)
      melange = {
        niveau: 'attention',
        texte: `Profil à plusieurs maxima (vers ${C(a)} et ${C(b)}) : mélange possible de deux produits (${pa.nom.toLowerCase()} et ${pb.nom.toLowerCase()}), ou fioul lourd (résidu coupé par un distillat). La CG/DIF seule ne tranche pas un mélange avec un fond de pollution déjà présent.`,
        refs: ['brgm2014'],
      }
    }
  }

  // Origin.
  if (ind?.cpi != null) {
    if (ind.cpi >= 2) {
      origine.push({
        niveau: 'fort',
        texte: `CPI = ${fr(ind.cpi)} : forte prédominance des n-alcanes impairs entre C25 et C33, signature de cires végétales (hydrocarbures biogènes). Une partie de l’indice « hydrocarbures » peut ne pas être pétrolière (sols riches en matière organique, racines, tourbe).`,
        refs: ['brgm2014', 'brayEvans1961', 'itrc2018'],
      })
    } else if (ind.cpi >= 1.3) {
      origine.push({
        niveau: 'attention',
        texte: `CPI = ${fr(ind.cpi)} : légère prédominance des impairs lourds (repère de l’outil : 1,3 à 2) — apport végétal possible à côté d’un produit pétrolier.`,
        refs: ['brgm2014', 'brayEvans1961'],
      })
    } else {
      origine.push({
        niveau: 'info',
        texte: `CPI = ${fr(ind.cpi)}, voisin de 1 : pas de préférence pair/impair, comme les produits pétroliers.`,
        refs: ['brgm2014', 'brayEvans1961'],
      })
    }
  }
  if (ind && d && ind.serie < 0.3 && ind.dominance > 0.6 && (d.partUcm ?? 0) < 0.5) {
    origine.push({
      niveau: 'fort',
      texte: `Quelques pics isolés (${Math.round(ind.dominance * 100)} % de la hauteur cumulée des pics dans les trois plus grands), sans série régulière de n-alcanes : profil peu pétrolier. Le détecteur FID n’est pas sélectif — solvants, composés chlorés, HAP de goudrons ou de créosote, matière organique naturelle sont comptés dans l’indice. À confirmer en CG/SM.`,
      refs: ['itrc2018', 'brgm2014'],
    })
  }
  if (e.matrice === 'eau' && d && partDans(d, 15, 40) > 0.5 && (d.partUcm ?? 0) > 0.4) {
    origine.push({
      niveau: 'attention',
      texte: `Eau : ${Math.round(partDans(d, 15, 40) * 100)} % de l’aire au-delà de C15, en bosse. Ces composés ne sont pas solubles à ces teneurs : hydrocarbures non dissous (gouttelettes, émulsion, particules) ou métabolites polaires de biodégradation. Une purification sur gel de silice les départage (la bosse disparaît si elle est polaire).`,
      refs: ['itrc2018'],
    })
    suites.push({ niveau: 'attention', texte: 'Faire refaire l’indice avec purification sur gel de silice pour séparer hydrocarbures et composés polaires.', refs: ['itrc2018'] })
  }

  // Weathering.
  const st: Stade =
    biogene && !impose
      ? { code: null, libelle: 'Non évaluable', pm: '—', texte: 'Profil dominé par des n-alcanes végétaux : les repères de biodégradation des produits pétroliers ne s’appliquent pas.', refs: ['brgm2014'], confiance: 'faible' }
      : evaluerStade(e, produit)
  if (d && produit?.distillatMoyen && d.q05 > 13) {
    alteration.push({
      niveau: 'attention',
      texte: `L’aire ne commence qu’à ${C(d.q05)} (5 % cumulés) alors qu’un ${produit.id === 'kerosene' ? 'kérosène' : 'gazole'} frais débute vers C10–C11 : composés légers perdus par évaporation ou dissolution — indice d’un produit non frais (repère de l’outil : au-delà de C13).`,
      refs: ['brgm2014'],
    })
  }
  if (d && produit?.distillatMoyen && (d.partUcm ?? 0) > 0.6) {
    alteration.push({
      niveau: 'info',
      texte: `Bosse non résolue de ${Math.round(d.partUcm! * 100)} % de l’aire pour un distillat moyen : enveloppe « patatoïde » d’un produit biodégradé, ou mélange avec un produit plus lourd.`,
      refs: ['brgm2014', 'itrc2018'],
    })
  }
  if (e.c18 != null && e.ph != null && e.ph > 0 && e.c17 != null && e.pr) {
    const r17 = e.c17 / e.pr
    const r18 = e.c18 / e.ph
    if (Math.abs(r17 - r18) / Math.max(r17, r18, 1e-9) > 0.5) {
      alteration.push({
        niveau: 'info',
        texte: `n-C17/Pr (${fr(r17)}) et n-C18/Ph (${fr(r18)}) divergent : intégration douteuse d’un doublet, ou mélange de produits.`,
        refs: ['brgm2014'],
      })
    }
  }

  const ages = evaluerAges(e, produit, distillatDansMelange)

  const prph = e.pr && e.ph ? e.pr / e.ph : null
  const ratios: Ratio[] = [
    {
      libelle: 'n-C17 / pristane',
      valeur: e.c17 !== null && e.pr ? e.c17 / e.pr : null,
      format: (v) => fr(v),
      lecture: 'Diminue avec la biodégradation (n-C17 consommé avant le pristane). Gazole frais : 2,1 à 2,5.',
      refs: ['brgm2014', 'christensenLarsen1993'],
    },
    {
      libelle: 'n-C18 / phytane',
      valeur: e.c18 !== null && e.ph ? e.c18 / e.ph : null,
      format: (v) => fr(v),
      lecture: 'Même lecture que n-C17/pristane, sur le doublet suivant.',
      refs: ['brgm2014'],
    },
    {
      libelle: 'Pristane / phytane',
      valeur: prph,
      format: (v) => fr(v),
      lecture: 'Stable au vieillissement tant que les isoprénoïdes subsistent : empreinte de la source, à comparer entre échantillons et avec les produits suspectés.',
      refs: ['brgm2014'],
    },
    {
      libelle: 'CPI (C24–C34)',
      valeur: ind?.cpi ?? null,
      format: (v) => fr(v),
      lecture: 'Voisin de 1 : pétrolier ; nettement supérieur : cires végétales.',
      refs: ['brayEvans1961', 'brgm2014'],
    },
    {
      libelle: 'Part de la bosse (UCM)',
      valeur: d?.partUcm ?? null,
      format: (v) => `${Math.round(v * 100)} %`,
      lecture: 'Croît avec la biodégradation ; forte d’origine pour les huiles et les résidus.',
      refs: ['brgm2014', 'itrc2018'],
    },
    {
      libelle: 'Série de n-alcanes',
      valeur: ind?.serie ?? null,
      format: (v) => `${Math.round(v * 100)} %`,
      lecture: 'Part des carbones de la distribution portant un pic de n-alcane.',
      refs: ['itrc2018'],
    },
  ]

  // Next steps (graded approach of the BRGM report, § 6).
  if (!(e.pr && e.c17 !== null)) {
    suites.push({
      niveau: 'info',
      texte: 'Niveau 2 : demander au laboratoire le dosage individuel des n-alcanes, du pristane et du phytane (CG/DIF haute résolution), pour les rapports n-C17/Pr, n-C18/Ph et Pr/Ph.',
      refs: ['brgm2014'],
    })
  }
  if ((st.code ?? 0) >= 3 || melange) {
    suites.push({
      niveau: 'info',
      texte: 'Niveau 3 : biomarqueurs en CG/SM (hopanes, stéranes, sesquiterpanes pour les gazoles et kérosènes), HAP alkylés et dibenzothiophènes (rapports C2-DBT/C2-phénanthrène et C3-DBT/C3-phénanthrène, stables à l’altération) pour relier l’échantillon à une source malgré la dégradation.',
      refs: ['brgm2014', 'wangStout2007'],
    })
  }
  if (produit?.id === 'leger' || (d && partDans(d, 10, 12) > 0.3)) {
    suites.push({
      niveau: 'attention',
      texte: 'Fraction légère : l’indice C10–C40 ne voit pas l’essence. Analyser les hydrocarbures volatils C5–C10, les BTEX, les éthers (MTBE, ETBE, TAME) et, pour une pollution ancienne, les alkyl-plomb ; la méthode PIANO caractérise les essences récentes.',
      refs: ['brgm2014', 'kaplan1997'],
    })
  }
  if (produit?.id === 'gazole') {
    suites.push({ niveau: 'info', texte: 'Gazole ou fioul domestique : seul le colorant du fioul, recherché par HPLC, les distingue.', refs: ['brgm2014'] })
  }
  suites.push({
    niveau: 'info',
    texte: 'Comparer au chromatogramme des produits suspectés (cuve, conduite, produit en stock) analysés par le même laboratoire et la même méthode : la démarche suppose une source candidate.',
    refs: ['brgm2014'],
  })

  // Summary.
  const morceaux: string[] = []
  if (d) morceaux.push(`Profil centré sur ${C(d.q50)} (90 % de l’aire entre ${C(d.q05)} et ${C(d.q95)})${d.partUcm !== null ? `, bosse non résolue de ${Math.round(d.partUcm * 100)} %` : ''}.`)
  if (impose) morceaux.push(`Produit retenu par l’utilisateur : ${impose.nom.toLowerCase()}.`)
  else if (biogene) morceaux.push(`Signature de cires végétales (CPI = ${fr(ind!.cpi!)}) : hydrocarbures biogènes plutôt que pétroliers.`)
  else if (produit) morceaux.push(`Produit le plus compatible : ${produit.nom.toLowerCase()}${candidats[1] && candidats[1].verdict !== 'peu compatible' ? ` (ou ${candidats[1].produit.nom.toLowerCase()})` : ''}.`)
  else if (d) morceaux.push('Aucun produit de référence ne correspond nettement.')
  if (melange) morceaux.push('Plusieurs maxima : mélange possible.')
  if (origine.some((o) => o.niveau === 'fort')) morceaux.push('Origine pétrolière à confirmer (voir « Origine »).')
  morceaux.push(`${st.libelle}${st.code !== null ? ` (${st.pm})` : ''}.`)
  const age = ages.find((a) => a.applicable)
  if (age) morceaux.push(`Âge approché (${age.methode}) : ${age.valeur}.`)

  return { qualite, candidats, produit, melange, origine, stade: st, alteration, ages, ratios, suites, synthese: morceaux.join(' ') }
}

// ---- Comparison between samples -----------------------------------------------------------

export type NiveauCorrespondance = 'correspondance' | 'probable' | 'indeterminee' | 'aucune'

export const LIBELLES_CORRESPONDANCE: Record<NiveauCorrespondance, string> = {
  correspondance: 'Correspondance',
  probable: 'Correspondance probable',
  indeterminee: 'Correspondance indéterminée',
  aucune: 'Pas de correspondance',
}

export interface Comparaison {
  similarite: number | null
  prPh: [number, number] | null
  niveau: NiveauCorrespondance
  texte: string
}

/** Pearson correlation of the two profiles by carbon number (C10–C40). */
export function similarite(a: Distribution, b: Distribution): number | null {
  const x = a.bins.map((v) => v.total / (a.aire || 1))
  const y = b.bins.map((v) => v.total / (b.aire || 1))
  const mx = x.reduce((s, v) => s + v, 0) / x.length
  const my = y.reduce((s, v) => s + v, 0) / y.length
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < x.length; i++) {
    num += (x[i] - mx) * (y[i] - my)
    dx += (x[i] - mx) ** 2
    dy += (y[i] - my) ** 2
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : null
}

/**
 * The four qualitative conclusions of the BRGM report (§ 6.2) from the
 * correlation of the profiles and the pristane/phytane ratio. The
 * correlation thresholds (0.95, 0.85, 0.6) and the 20 % tolerance on Pr/Ph
 * are conventions of the tool.
 */
export function comparer(a: Entree, b: Entree, la: Lecture, lb: Lecture): Comparaison {
  const s = a.distribution && b.distribution ? similarite(a.distribution, b.distribution) : null
  const prPh: [number, number] | null = a.pr && a.ph && b.pr && b.ph ? [a.pr / a.ph, b.pr / b.ph] : null
  let niveau: NiveauCorrespondance = s === null ? 'indeterminee' : s >= 0.95 ? 'correspondance' : s >= 0.85 ? 'probable' : s >= 0.6 ? 'indeterminee' : 'aucune'
  const textes: string[] = []
  if (s !== null) textes.push(`Corrélation des profils : ${s.toFixed(2).replace(".", ",")}.`)
  if (prPh) {
    const ecart = Math.abs(prPh[0] - prPh[1]) / Math.max(prPh[0], prPh[1])
    textes.push(`Pr/Ph : ${fr(prPh[0])} et ${fr(prPh[1])} (écart ${Math.round(ecart * 100)} %).`)
    if (ecart > 0.2) {
      if (niveau === 'correspondance' || niveau === 'probable') niveau = 'indeterminee'
      textes.push('Rapport stable au vieillissement mais différent : deux sources distinctes probables.')
    }
  }
  const sa = la.stade.code
  const sb = lb.stade.code
  if (sa !== null && sb !== null && sa !== sb && niveau !== 'aucune') {
    textes.push(`Stades d’altération différents (${la.stade.libelle.toLowerCase()} / ${lb.stade.libelle.toLowerCase()}) : les écarts de profil peuvent venir de la dégradation d’un même produit.`)
    if (niveau === 'correspondance') niveau = 'probable'
  }
  return { similarite: s, prPh, niveau, texte: textes.join(' ') }
}
