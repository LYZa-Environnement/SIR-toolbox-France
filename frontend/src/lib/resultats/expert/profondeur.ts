/**
 * Soil results against depth. Sample names often carry the borehole and the
 * depth interval — "MW6 (4-4,5)", "S3 (0,5-1 m)", "T2 (2 m)" — which is all a
 * vertical profile needs.
 *
 * For each borehole with at least two depths: family totals (BTEX, COHV,
 * PAH, petroleum hydrocarbons…) and one key compound, chosen as the one
 * with the largest exceedance of its comparison value or, failing that, the
 * strongest signal above its quantification limit. Each profile is read in
 * plain terms: depth of the maximum, trend with depth (Spearman rank
 * correlation), and whether the vertical extent is delimited — a result
 * still quantified, or still above the comparison value, at the bottom of
 * the borehole means it is not.
 */

import { facteurUnite } from '../guides.ts'
import type { Lecture, Mesure, Parametre } from '../parse.ts'

export interface Profondeur {
  sondage: string
  haut: number
  bas: number
  milieu: number
}

const NOMBRE = String.raw`(\d+(?:[.,]\d+)?)`
const INTERVALLE = new RegExp(String.raw`^(.*?)[\s_-]*\(\s*${NOMBRE}\s*(?:m\s*)?(?:[-–/à]|a)\s*${NOMBRE}\s*m?\s*\)\s*$`, 'i')
const PONCTUELLE = new RegExp(String.raw`^(.*?)[\s_-]*\(\s*${NOMBRE}\s*m?\s*\)\s*$`, 'i')

const nb = (s: string) => Number(s.replace(',', '.'))

/** "MW6 (4-4,5)" → { sondage: "MW6", haut: 4, bas: 4.5, milieu: 4.25 } */
export function lireProfondeur(nom: string): Profondeur | null {
  const i = nom.match(INTERVALLE)
  if (i && i[1].trim()) {
    const haut = nb(i[2])
    const bas = nb(i[3])
    if (bas >= haut && bas < 200) return { sondage: i[1].trim(), haut, bas, milieu: (haut + bas) / 2 }
  }
  const p = nom.match(PONCTUELLE)
  if (p && p[1].trim()) {
    const z = nb(p[2])
    if (z < 200) return { sondage: p[1].trim(), haut: z, bas: z, milieu: z }
  }
  return null
}

export interface Valeur {
  valeur: number
  /** Below the LQ: `valeur` is the LQ. */
  inferieur: boolean
}

export interface SerieProfondeur {
  nom: string
  couleur: string
  unite: string
  valeurs: Record<string, Valeur | null>
}

const FAMILLES: { nom: string; couleur: string; total: RegExp; membres: (p: Parametre) => boolean }[] = [
  {
    nom: 'BTEX',
    couleur: '#E69F00',
    total: /^(btex( totaux)?|somme des btex)$/i,
    membres: (p) => /^(benz[eè]ne|tolu[eè]ne|[ée]thylbenz[eè]ne|xyl[eè]nes?|ortho-?xyl[eè]ne|o-xyl[eè]ne|para-? et m[ée]taxyl[eè]ne|m\+p-xyl[eè]ne)$/i.test(p.nom),
  },
  { nom: 'COHV', couleur: '#1F3864', total: /somme.*cohv/i, membres: (p) => /^COHV —/.test(p.famille) && !p.somme },
  { nom: 'Chlorobenzènes', couleur: '#17BECF', total: /somme.*chlorobenz/i, membres: (p) => /chlorobenz/i.test(p.famille) && !p.somme },
  { nom: 'HAP', couleur: '#7C3F8F', total: /^(somme (de |des )?(16 )?hap|hap totaux|somme de hap)/i, membres: (p) => /polycycl|\bhap\b/i.test(p.famille) && !p.somme },
  { nom: 'Hydrocarbures C5-C10', couleur: '#C0392B', total: /hydrocarbures? volatils|^c5\s*-\s*c10 total/i, membres: () => false },
  { nom: 'Hydrocarbures C10-C40', couleur: '#00A37E', total: /(hydrocarbures totaux|indice hydrocarbures?).*c10.*c40/i, membres: () => false },
  { nom: 'PCB', couleur: '#8C564B', total: /pcb.*(totaux|7)|somme.*pcb/i, membres: (p) => /pcb|polychlorobiph/i.test(p.famille) && !p.somme },
]

const UNITE = 'mg/kg MS'

function enMgKg(p: Parametre, m: Mesure): number | null {
  const f = facteurUnite(p.unite, 'mg/kg')
  return f === null || m.valeur === null ? null : m.valeur * f
}

function serieFamille(lecture: Lecture, f: (typeof FAMILLES)[number], echantillons: string[]): SerieProfondeur | null {
  const params = lecture.parametres.CM.filter((p) => /g\s*\/\s*kg/i.test(p.unite))
  const total = params.find((p) => p.somme && f.total.test(p.nom))
  const membres = params.filter((p) => !p.somme && f.membres(p))
  if (!total && membres.length < 2) return null
  const valeurs: SerieProfondeur['valeurs'] = {}
  for (const e of echantillons) {
    if (total) {
      const m = lecture.valeurs.CM[e]?.[total.cle]
      const v = m ? enMgKg(total, m) : null
      valeurs[e] = v === null ? null : { valeur: v, inferieur: m!.inferieur }
      continue
    }
    let somme = 0
    let lq = 0
    let mesure = false
    for (const p of membres) {
      const m = lecture.valeurs.CM[e]?.[p.cle]
      const v = m ? enMgKg(p, m) : null
      if (v === null) continue
      mesure = true
      if (m!.inferieur) lq = Math.max(lq, v)
      else somme += v
    }
    valeurs[e] = !mesure ? null : somme > 0 ? { valeur: somme, inferieur: false } : { valeur: lq, inferieur: true }
  }
  return Object.values(valeurs).some((v) => v && !v.inferieur) ? { nom: f.nom, couleur: f.couleur, unite: UNITE, valeurs } : null
}

export interface Lecture1D {
  /** Depth (mid-interval) and value of the maximum. */
  max: { echantillon: string; profondeur: Profondeur; valeur: number } | null
  tendance: string
  extension: string
  depassement: string | null
}

/** Spearman rank correlation. */
function spearman(x: number[], y: number[]): number | null {
  const n = x.length
  if (n < 3) return null
  const rang = (v: number[]) => {
    const tries = v.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x)
    const r = new Array(n).fill(0)
    for (let i = 0; i < n; ) {
      let j = i
      while (j + 1 < n && tries[j + 1].x === tries[i].x) j++
      for (let k = i; k <= j; k++) r[tries[k].i] = (i + j) / 2 + 1
      i = j + 1
    }
    return r
  }
  const rx = rang(x)
  const ry = rang(y)
  const mx = rx.reduce((a, b) => a + b, 0) / n
  const my = ry.reduce((a, b) => a + b, 0) / n
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mx) * (ry[i] - my)
    dx += (rx[i] - mx) ** 2
    dy += (ry[i] - my) ** 2
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : null
}

const fr = (x: number) => String(Number(x.toPrecision(3))).replace('.', ',')
const z = (p: Profondeur) => (p.haut === p.bas ? `${fr(p.haut)} m` : `${fr(p.haut)}-${fr(p.bas)} m`)

/** Plain-language reading of one series along one borehole. */
export function lireProfil(points: { profondeur: Profondeur; echantillon: string; v: Valeur }[], guide: number | null, unite: string): Lecture1D {
  const tries = [...points].sort((a, b) => a.profondeur.milieu - b.profondeur.milieu)
  const quantifies = tries.filter((p) => !p.v.inferieur)
  if (!quantifies.length) return { max: null, tendance: 'Non quantifié sur toute la hauteur du sondage.', extension: '', depassement: null }
  const max = quantifies.reduce((a, b) => (b.v.valeur > a.v.valeur ? b : a))
  const rho = spearman(
    tries.map((p) => p.profondeur.milieu),
    tries.map((p) => (p.v.inferieur ? p.v.valeur / 2 : p.v.valeur)),
  )
  const iMax = tries.indexOf(max)
  const nonQuantifies = tries.filter((p) => p.v.inferieur)
  const plusProfondQ = Math.max(...quantifies.map((p) => p.profondeur.milieu))
  const plusHautQ = Math.min(...quantifies.map((p) => p.profondeur.milieu))
  let tendance: string
  // Quantified only above (or only below) everything else: say so plainly,
  // a rank correlation on a run of identical LQs says little.
  if (nonQuantifies.length && plusProfondQ < Math.min(...nonQuantifies.map((p) => p.profondeur.milieu)))
    tendance = 'Limité aux horizons superficiels du sondage.'
  else if (nonQuantifies.length && plusHautQ > Math.max(...nonQuantifies.map((p) => p.profondeur.milieu)))
    tendance = `Présent seulement en profondeur, à partir de ${z(quantifies[0].profondeur)} : migration verticale, accumulation au niveau de la nappe, ou apport latéral.`
  else if (rho !== null && rho <= -0.5) tendance = `Décroît avec la profondeur (ρ de Spearman ${fr(rho)}) : apport depuis la surface ou les horizons superficiels.`
  else if (rho !== null && rho >= 0.5) tendance = `Augmente avec la profondeur (ρ de Spearman ${fr(rho)}) : migration verticale, accumulation en profondeur ou au niveau de la nappe.`
  else if (iMax > 0 && iMax < tries.length - 1) tendance = `Pic à ${z(max.profondeur)}, plus faible au-dessus et en dessous : niveau d'accumulation préférentiel (horizon plus perméable ou plus organique, zone de battement de nappe…).`
  else tendance = rho === null ? 'Trop peu de profondeurs pour dégager une tendance.' : `Pas de tendance nette avec la profondeur (ρ de Spearman ${fr(rho)}).`
  const fond = tries[tries.length - 1]
  const dernier = quantifies[quantifies.length - 1]
  const extension =
    fond === dernier
      ? `Encore quantifié au fond du sondage (${z(fond.profondeur)}, ${fr(fond.v.valeur)} ${unite}) : extension verticale non délimitée.`
      : `Quantifié jusqu'à ${z(dernier.profondeur)} ; inférieur à la LQ au-delà, jusqu'au fond du sondage (${z(fond.profondeur)}).`
  let depassement: string | null = null
  if (guide !== null) {
    const au = tries.filter((p) => !p.v.inferieur && p.v.valeur > guide)
    if (!au.length) depassement = `Aucun dépassement de la valeur de comparaison (${fr(guide)} ${unite}).`
    else {
      const bas = au[au.length - 1]
      depassement =
        bas === fond
          ? `Dépasse la valeur de comparaison (${fr(guide)} ${unite}) jusqu'au fond du sondage (${z(fond.profondeur)}) : extension du dépassement non délimitée.`
          : `Dépasse la valeur de comparaison (${fr(guide)} ${unite}) de ${z(au[0].profondeur)} à ${z(bas.profondeur)}.`
    }
  }
  return { max: { echantillon: max.echantillon, profondeur: max.profondeur, valeur: max.v.valeur }, tendance, extension, depassement }
}

export interface Sondage {
  nom: string
  echantillons: { echantillon: string; profondeur: Profondeur }[]
}

export interface ComposeCle {
  parametre: Parametre
  serie: SerieProfondeur
  guide: number | null
  raison: string
}

export interface AnalyseProfondeur {
  sondages: Sondage[]
  familles: SerieProfondeur[]
  cle: ComposeCle | null
  /** Next strongest compounds, for the reader to know what else stands out. */
  suivants: { nom: string; score: string }[]
}

const NON_ORGANIQUE = /m[ée]ta(l|ux)|inorgan|[ée]luat|lixiv|physico|mati[èe]re s[èe]che/i

export function analyseProfondeur(lecture: Lecture, echantillons: string[], guides: Record<string, { valeur: number; source: string } | null>): AnalyseProfondeur | null {
  const parSondage = new Map<string, Sondage>()
  for (const e of echantillons) {
    const p = lireProfondeur(e)
    if (!p) continue
    const s = parSondage.get(p.sondage) ?? { nom: p.sondage, echantillons: [] }
    s.echantillons.push({ echantillon: e, profondeur: p })
    parSondage.set(p.sondage, s)
  }
  const sondages = [...parSondage.values()].filter((s) => s.echantillons.length >= 2)
  if (!sondages.length) return null
  sondages.forEach((s) => s.echantillons.sort((a, b) => a.profondeur.milieu - b.profondeur.milieu))
  const dansProfils = sondages.flatMap((s) => s.echantillons.map((x) => x.echantillon))

  const familles = FAMILLES.map((f) => serieFamille(lecture, f, dansProfils)).filter((s): s is SerieProfondeur => !!s)

  // Key compound: largest exceedance of the comparison value, else the
  // strongest signal above the LQ among organic compounds.
  const candidats = lecture.parametres.CM.filter((p) => !p.somme && /g\s*\/\s*kg/i.test(p.unite)).flatMap((p) => {
    const vals = dansProfils.map((e) => lecture.valeurs.CM[e]?.[p.cle]).filter((m): m is Mesure => !!m && m.valeur !== null)
    const q = vals.filter((m) => !m.inferieur).map((m) => m.valeur!)
    if (q.length < 2) return []
    const max = Math.max(...q)
    const g = guides[p.cle]
    const lqs = vals.filter((m) => m.inferieur).map((m) => m.valeur!).sort((a, b) => a - b)
    const lq = lqs.length ? lqs[Math.floor(lqs.length / 2)] : Math.min(...q)
    return [{ p, max, g, ratioGuide: g && g.valeur > 0 ? max / g.valeur : null, ratioLQ: max / lq, organique: !NON_ORGANIQUE.test(p.famille) }]
  })
  const auDessus = candidats.filter((c) => c.ratioGuide !== null && c.ratioGuide > 1).sort((a, b) => b.ratioGuide! - a.ratioGuide!)
  const signal = candidats.filter((c) => c.organique).sort((a, b) => b.ratioLQ - a.ratioLQ)
  const choix = auDessus[0] ?? signal[0] ?? null
  let cle: ComposeCle | null = null
  if (choix) {
    const valeurs: SerieProfondeur['valeurs'] = {}
    for (const e of dansProfils) {
      const m = lecture.valeurs.CM[e]?.[choix.p.cle]
      const v = m ? enMgKg(choix.p, m) : null
      valeurs[e] = v === null ? null : { valeur: v, inferieur: m!.inferieur }
    }
    const fGuide = choix.g ? facteurUnite(choix.p.unite, 'mg/kg') : null
    cle = {
      parametre: choix.p,
      serie: { nom: choix.p.nom, couleur: '#C0392B', unite: UNITE, valeurs },
      guide: choix.g && fGuide !== null ? choix.g.valeur * fGuide : null,
      raison:
        choix === auDessus[0]
          ? `plus fort dépassement de sa valeur de comparaison (maximum ${fr(choix.max)} ${choix.p.unite}, soit ${fr(choix.ratioGuide!)} fois la valeur)`
          : `signal le plus marqué au-dessus de la limite de quantification (maximum ${fr(choix.max)} ${choix.p.unite}, soit ${fr(choix.ratioLQ)} fois la LQ usuelle)`,
    }
  }
  const suivants = (auDessus.length ? auDessus : signal)
    .filter((c) => c !== choix)
    .slice(0, 4)
    .map((c) => ({ nom: c.p.nom, score: c.ratioGuide !== null && c.ratioGuide > 1 ? `${fr(c.ratioGuide)} × valeur de comparaison` : `${fr(c.ratioLQ)} × LQ` }))
  return { sondages, familles, cle, suivants }
}
