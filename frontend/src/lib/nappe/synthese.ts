/**
 * General summary from the field parameters: the site as a whole (ranges,
 * medians, outliers), the wells ranked from the most reducing to the most
 * oxygenated with a one-sentence description of their water, and the
 * vertical profiles of nested wells ("TPz2 (15)", "TPz2 (25)"…).
 *
 * Descriptive terms:
 * - dissolved oxygen: < 0.5 mg/l anoxic and > 5 mg/l well oxygenated are the
 *   USEPA (1998) thresholds; 0.5–2 "weakly", 2–5 "oxygenated" split the
 *   interval for description only;
 * - redox measured against Ag/AgCl: < −100 mV reducing, −100 to 50 mV weakly
 *   reducing (USEPA 1998 thresholds), 50 to 200 mV moderately oxidising,
 *   ≥ 200 mV oxidising (descriptive);
 * - conductivity: mineralisation classes of Rodier (L'analyse de l'eau):
 *   < 100 very weak, 100–200 weak, 200–333 moderately accentuated,
 *   333–666 moderate, 666–1000 high (« importante »), > 1000 µS/cm elevated;
 * - pH: < 5.5 acid, 5.5–6.5 slightly acid, 6.5–7.5 near neutral, 7.5–8.5
 *   slightly basic, > 8.5 basic.
 */

import type { Jeu } from './donnees.ts'
import type { Evaluation, Favorabilite } from './evaluation.ts'
import type { ParamId, Valeur } from './parametres.ts'

type Table = Partial<Record<ParamId, Valeur>>

const fr = (x: number, d = 2) => Number(x.toPrecision(3)).toLocaleString('fr-FR', { maximumFractionDigits: d })
const signe = (x: number) => `${x > 0 ? '+' : ''}${fr(x, 0)}`

export function qualifierPH(ph: number): string {
  if (ph < 5.5) return 'acide'
  if (ph < 6.5) return 'légèrement acide'
  if (ph <= 7.5) return 'proche de la neutralité'
  if (ph <= 8.5) return 'légèrement basique'
  return 'basique'
}

export function qualifierO2(od: number): string {
  if (od < 0.5) return 'anoxique'
  if (od < 2) return 'faiblement oxygénée'
  if (od <= 5) return 'oxygénée'
  return 'bien oxygénée'
}

export function qualifierRedox(orp: number): string {
  if (orp < -100) return 'réducteur'
  if (orp < 50) return 'faiblement réducteur'
  if (orp < 200) return 'modérément oxydant'
  return 'oxydant'
}

export function qualifierCE(ce: number): string {
  if (ce < 100) return 'très faible'
  if (ce < 200) return 'faible'
  if (ce < 333) return 'moyenne accentuée'
  if (ce < 666) return 'moyenne'
  if (ce < 1000) return 'importante'
  return 'élevée'
}

function mediane(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export interface DescriptionOuvrage {
  cle: string
  nom: string
  rang: number
  conditions: Favorabilite
  description: string
  /** Measurement caveats (probe, stabilisation). */
  reserve: string | null
}

export interface Profil {
  base: string
  texte: string
}

export interface Synthese {
  /** Site-level paragraphs. */
  site: string[]
  classement: DescriptionOuvrage[]
  profils: Profil[]
  /** Wells standing out from the rest of the site. */
  singularites: string[]
}

const ORDRE: Favorabilite[] = ['favorable', 'possible', 'limite', 'defavorable', 'indetermine']

export function decrire(t: Table, eh: number | null, saturation: number | null): string {
  const parts: string[] = []
  if (t.ph) parts.push(`${qualifierPH(t.ph.valeur)} (pH ${fr(t.ph.valeur)})`)
  if (t.od) {
    const v = t.od.valeur
    parts.push(
      t.od.inferieur
        ? `anoxique (O₂ < ${fr(v)} mg/l)`
        : `${qualifierO2(v)} (O₂ ${fr(v)} mg/l${saturation !== null ? `, ${fr(saturation, 0)} % de la saturation` : ''})`,
    )
  } else parts.push('oxygène non mesuré')
  if (t.orp) parts.push(`au potentiel ${qualifierRedox(t.orp.valeur)} (redox ${signe(t.orp.valeur)} mV Ag/AgCl${eh !== null ? `, Eh ${signe(eh)} mV` : ''})`)
  if (t.ce) parts.push(`de minéralisation ${qualifierCE(t.ce.valeur)} (${fr(t.ce.valeur, 0)} µS/cm)`)
  if (t.t) parts.push(`à ${fr(t.t.valeur, 1)} °C`)
  if (!parts.length) return 'Pas de mesure de terrain.'
  const [premier, ...reste] = parts
  return `Eau ${premier}${reste.length ? `, ${reste.join(', ')}` : ''}.`
}

const RESERVE = /sursatur|sonde à oxygène|incohérent|Stabilisation non atteinte|Calibration|Dérive|Phase flottante/

export function synthetiser(jeu: Jeu, evaluations: Evaluation[]): Synthese {
  const val = (e: Evaluation) => jeu.valeurs[e.ouvrage.cle] ?? {}
  const avecTerrain = evaluations.filter((e) => ['ph', 'orp', 'od', 'ce', 't'].some((p) => val(e)[p as ParamId]))
  const site: string[] = []
  const singularites: string[] = []
  if (!avecTerrain.length) return { site: ['Aucune mesure de terrain.'], classement: [], profils: [], singularites }

  const serie = (p: ParamId) => avecTerrain.filter((e) => val(e)[p]).map((e) => ({ e, v: val(e)[p]!.valeur }))
  const dates = avecTerrain.map((e) => e.ouvrage.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
  const datesFr = (d: string) => d.split('-').reverse().join('/')
  site.push(
    `${avecTerrain.length} ouvrage${avecTerrain.length > 1 ? 's' : ''} décrit${avecTerrain.length > 1 ? 's' : ''} par les mesures de fin de purge${
      dates.length ? ` (${dates[0] === dates[dates.length - 1] ? `le ${datesFr(dates[0])}` : `du ${datesFr(dates[0])} au ${datesFr(dates[dates.length - 1])}`})` : ''
    }.`,
  )

  // pH
  const ph = serie('ph')
  if (ph.length) {
    const xs = ph.map((x) => x.v)
    const m = mediane(xs)
    const ecart = Math.max(...xs) - Math.min(...xs)
    site.push(
      `pH de ${fr(Math.min(...xs))} à ${fr(Math.max(...xs))} (médiane ${fr(m)}) : eaux ${qualifierPH(m) === 'proche de la neutralité' ? 'proches de la neutralité' : qualifierPH(m).replace(/e$/, 'es')}${
        ecart <= 1 ? ', homogènes sur le site' : ', contrastées d’un ouvrage à l’autre'
      } ; domaine favorable à la biodégradation (5 < pH < 9, USEPA 1998)${xs.some((x) => x <= 5 || x >= 9) ? ' sauf pour quelques ouvrages' : ''}.`,
    )
    for (const x of ph) if (Math.abs(x.v - m) > 1) singularites.push(`${x.e.ouvrage.nom} : pH ${fr(x.v)}, éloigné de la médiane du site (${fr(m)}).`)
  }

  // Conductivity
  const ce = serie('ce')
  if (ce.length) {
    const xs = ce.map((x) => x.v)
    const m = mediane(xs)
    site.push(
      `Conductivité de ${fr(Math.min(...xs), 0)} à ${fr(Math.max(...xs), 0)} µS/cm (médiane ${fr(m, 0)}) : minéralisation ${qualifierCE(m)} (classes de Rodier).`,
    )
    for (const x of ce) {
      if (x.v > 1.5 * m) singularites.push(`${x.e.ouvrage.nom} : conductivité ${fr(x.v, 0)} µS/cm, nettement au-dessus de la médiane (${fr(m, 0)}) — eau plus minéralisée (autre niveau aquifère, panache salin ou lixiviat, sels de déverglaçage…).`)
      else if (x.v < m / 1.5) singularites.push(`${x.e.ouvrage.nom} : conductivité ${fr(x.v, 0)} µS/cm, nettement en dessous de la médiane (${fr(m, 0)}) — eau moins minéralisée (recharge locale, infiltration récente, autre niveau).`)
    }
  }

  // Temperature
  const t = serie('t')
  if (t.length) {
    const xs = t.map((x) => x.v)
    const m = mediane(xs)
    site.push(`Température de ${fr(Math.min(...xs), 1)} à ${fr(Math.max(...xs), 1)} °C (médiane ${fr(m, 1)})${xs.some((x) => x > 20) ? ' ; au-dessus de 20 °C, les processus biologiques sont accélérés (USEPA 1998)' : ''}.`)
    for (const x of t) if (Math.abs(x.v - m) > 2) singularites.push(`${x.e.ouvrage.nom} : ${fr(x.v, 1)} °C, ${x.v > m ? 'plus chaude' : 'plus froide'} que la médiane (${fr(m, 1)} °C) — influence de surface, ouvrage peu profond ou réchauffement de la cellule de mesure.`)
  }

  // Oxygen
  const od = serie('od')
  const sansOD = avecTerrain.length - od.length
  if (od.length) {
    const classes = new Map<string, string[]>()
    for (const x of od) {
      const q = val(x.e).od!.inferieur ? 'anoxique' : qualifierO2(x.v)
      classes.set(q, [...(classes.get(q) ?? []), x.e.ouvrage.nom])
    }
    const ordre = ['anoxique', 'faiblement oxygénée', 'oxygénée', 'bien oxygénée']
    const libelles: Record<string, string> = {
      anoxique: 'anoxiques (O₂ < 0,5 mg/l)',
      'faiblement oxygénée': 'faiblement oxygénés (0,5 à 2 mg/l)',
      oxygénée: 'oxygénés (2 à 5 mg/l)',
      'bien oxygénée': 'bien oxygénés (> 5 mg/l)',
    }
    site.push(
      `Oxygène dissous : ${ordre
        .filter((q) => classes.get(q))
        .map((q) => `${classes.get(q)!.length} ouvrage${classes.get(q)!.length > 1 ? 's' : ''} ${libelles[q]}`)
        .join(', ')}${sansOD ? ` ; non mesuré sur ${sansOD} ouvrage${sansOD > 1 ? 's' : ''}` : ''}.`,
    )
  } else site.push('Oxygène dissous non mesuré.')

  // Redox
  const orp = serie('orp')
  if (orp.length) {
    const xs = orp.map((x) => x.v)
    const n = (f: (x: number) => boolean) => xs.filter(f).length
    const ouvrages = (k: number) => `${k} ouvrage${k > 1 ? 's' : ''}`
    site.push(
      `Redox mesuré (Ag/AgCl) de ${signe(Math.min(...xs))} à ${signe(Math.max(...xs))} mV : ${ouvrages(n((x) => x < -100))} sous −100 mV (voie réductrice probable), ${ouvrages(
        n((x) => x >= -100 && x < 50),
      )} entre −100 et 50 mV (possible), ${ouvrages(n((x) => x >= 50))} au-dessus de 50 mV (milieu peu réducteur).`,
    )
  }

  // Conditions and caveats
  const comptes = new Map<Favorabilite, number>()
  for (const e of avecTerrain) comptes.set(e.lecture.conditions, (comptes.get(e.lecture.conditions) ?? 0) + 1)
  const LIB: Record<Favorabilite, string> = { favorable: 'favorables', possible: 'possibles', limite: 'peu favorables', defavorable: 'défavorables', indetermine: 'non déterminées' }
  site.push(
    `Conditions pour la déchloration réductrice : ${ORDRE.filter((c) => comptes.get(c))
      .map((c) => `${comptes.get(c)} ${comptes.get(c) === 1 ? LIB[c].replace(/s$/, '') : LIB[c]}`)
      .join(', ')}.`,
  )
  const douteux = avecTerrain.filter((e) => e.alertes.some((a) => /sursatur|sonde à oxygène|incohérent/.test(a.texte)))
  if (douteux.length) {
    site.push(
      `Mesures d’oxygène à vérifier sur ${douteux.length} ouvrage${douteux.length > 1 ? 's' : ''} (${douteux.map((e) => e.ouvrage.nom).join(', ')}) : sursaturation ou oxygène nul avec un redox élevé, leur classement est à confirmer.`,
    )
  }

  // Ranking: most reducing first.
  const tri = [...avecTerrain].sort((a, b) => {
    const c = ORDRE.indexOf(a.lecture.conditions) - ORDRE.indexOf(b.lecture.conditions)
    if (c) return c
    const ra = val(a).orp?.valeur ?? Infinity
    const rb = val(b).orp?.valeur ?? Infinity
    if (ra !== rb) return ra - rb
    return (val(a).od?.valeur ?? Infinity) - (val(b).od?.valeur ?? Infinity)
  })
  const classement = tri.map((e, k) => {
    const reserves = e.alertes.filter((a) => a.niveau !== 'info' && RESERVE.test(a.texte)).map((a) => a.texte.split(' : ')[0].split(' (')[0])
    return {
      cle: e.ouvrage.cle,
      nom: e.ouvrage.nom,
      rang: k + 1,
      conditions: e.lecture.conditions,
      description: decrire(val(e), e.eh, e.saturationO2),
      reserve: reserves.length ? [...new Set(reserves)].join(' ; ') : null,
    }
  })
  if (tri.length > 1) {
    const reducteurs = tri.filter((e) => e.lecture.conditions === 'favorable' || e.lecture.conditions === 'possible').slice(0, 5)
    const oxygenes = [...tri].reverse().filter((e) => e.lecture.conditions === 'defavorable' || e.lecture.conditions === 'limite').slice(0, 5)
    if (reducteurs.length) site.push(`Ouvrages les plus réducteurs : ${reducteurs.map((e) => e.ouvrage.nom).join(', ')}.`)
    if (oxygenes.length) site.push(`Ouvrages les plus oxygénés ou oxydants : ${oxygenes.map((e) => e.ouvrage.nom).join(', ')}.`)
  }

  return { site, classement, profils: profils(avecTerrain, val), singularites }
}

/** "TPz2 (15)" → { base: "TPz2", profondeur: 15 }; "MW1 (5-9m)" → { base: "MW1", profondeur: 5 }. */
function niveau(nom: string): { base: string; profondeur: number } | null {
  const m = nom.match(/^(.*?)\s*\(\s*(\d+(?:[.,]\d+)?)/)
  if (!m || !m[1].trim()) return null
  return { base: m[1].trim(), profondeur: Number(m[2].replace(',', '.')) }
}

function profils(evals: Evaluation[], val: (e: Evaluation) => Table): Profil[] {
  const groupes = new Map<string, { e: Evaluation; z: number }[]>()
  for (const e of evals) {
    const n = niveau(e.ouvrage.nom)
    if (!n) continue
    const k = n.base.toLowerCase().replace(/\s+/g, '')
    groupes.set(k, [...(groupes.get(k) ?? []), { e, z: n.profondeur }])
  }
  const out: Profil[] = []
  for (const g of groupes.values()) {
    if (g.length < 2 || new Set(g.map((x) => x.z)).size < 2) continue
    g.sort((a, b) => a.z - b.z)
    const base = niveau(g[0].e.ouvrage.nom)!.base
    const suite = (p: ParamId) => {
      const vs = g.map((x) => val(x.e)[p]?.valeur)
      return vs.every((v) => v !== undefined) ? (vs as number[]) : null
    }
    const morceaux: string[] = []
    const tendances: string[] = []
    const orp = suite('orp')
    if (orp) {
      morceaux.push(`redox ${orp.map((v) => signe(v)).join(' → ')} mV`)
      const d = orp[orp.length - 1] - orp[0]
      if (Math.abs(d) >= 50) tendances.push(d < 0 ? 'plus réducteur en profondeur' : 'plus oxydant en profondeur')
    }
    const od = suite('od')
    if (od) {
      morceaux.push(`O₂ ${od.map((v) => fr(v)).join(' → ')} mg/l`)
      const d = od[od.length - 1] - od[0]
      if (Math.abs(d) >= 1) tendances.push(d < 0 ? 'moins oxygéné en profondeur' : 'plus oxygéné en profondeur')
    }
    const ce = suite('ce')
    if (ce) {
      morceaux.push(`CE ${ce.map((v) => fr(v, 0)).join(' → ')} µS/cm`)
      const r = ce[ce.length - 1] / ce[0]
      if (r > 1.1 || r < 1 / 1.1) tendances.push(r > 1 ? 'plus minéralisé en profondeur' : 'moins minéralisé en profondeur')
    }
    if (!morceaux.length) continue
    out.push({
      base,
      texte: `${base} (${g.map((x) => fr(x.z, 1)).join(' → ')} m) : ${morceaux.join(', ')}${
        tendances.length ? ` — ${tendances.join(', ')}` : ' — pas de contraste net entre les niveaux'
      }.`,
    })
  }
  return out
}
