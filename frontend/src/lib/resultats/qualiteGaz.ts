/**
 * Quality of the soil gas drawn, read from the multigas and PID readings of
 * the sampling sheets: was it soil gas, or air from the surface?
 *
 * What the guide says (BRGM / INERIS, « Guide pratique pour la
 * caractérisation des gaz du sol et de l'air intérieur », RP-65870-FR /
 * INERIS-DRC-16-156183-01401A, 2016):
 *
 * - § 5.5.1 (p. 57): the simplest and most usual leak test is to pump soil
 *   gas and measure O2 and CO2; values comparable to outdoor air (O2 ≈ 21 %,
 *   CO2 ≈ 400 ppmv) make an air inlet likely, and the point is to be sealed
 *   again;
 * - § 5.5.2 (p. 58): purge until the relevant parameters measured
 *   continuously (PID, O2, CO2, H2S, relative humidity…) are stable, or at
 *   least 5 dead volumes, at a flow similar to the sampling flow;
 * - § 6.3.3 (p. 62-63): multigas readings (O2 shows a clogged or leaking
 *   point; CO2, H2S, CH4, CO) and PID before sampling — PID values are only
 *   indicative; soil gas humidity can exceed 90 % and interfere with
 *   adsorption on tubes;
 * - § 2 and § 3.1.2: CH4, CO2, CO and H2S can come from biological activity
 *   in soils polluted by biodegradable substances; O2 and CO2 readings help
 *   find where such activity takes place;
 * - § 7.4.3, tableau 11 (p. 101): flow rules, applied in `fichesGaz.ts`.
 *
 * The guide gives no figure for "comparable to outdoor air", for a marked
 * depletion or for a significant drift: the thresholds below are the tool's
 * own, stated as such wherever they are used. Safety marks for the
 * operator: French binding occupational limits (INRS, fiches toxicologiques
 * 32 and 47) and the usual first alarm of explosimeters (10 % LIE).
 *
 * Pure.
 */

import { retenir, type FicheGaz, type MesureGaz, type SourceDebit, type SourceDuree } from './fichesGaz.ts'

export type Verdict = 'representatif' | 'a-verifier' | 'air-ambiant' | 'non-evalue'

export const LIBELLES_VERDICT: Record<Verdict, string> = {
  representatif: 'Gaz du sol représentatif',
  'a-verifier': 'À vérifier',
  'air-ambiant': 'Air ambiant probable',
  'non-evalue': 'Non évaluable',
}

export type Niveau = 'alerte' | 'vigilance' | 'info'

export interface Constat {
  niveau: Niveau
  texte: string
}

export interface QualitePoint {
  ouvrage: string
  /** CO2 readings set aside as below outdoor air. */
  co2NonPlausible: boolean
  /** Reading retained as the gas drawn: end of sampling, else the last one. */
  o2: number | null
  co2: number | null
  co2Superieur: boolean
  /** Change between the start (or end of purge) and the end of sampling. */
  deltaO2: number | null
  deltaCo2: number | null
  h2sMax: number | null
  coMax: number | null
  lieMax: number | null
  ch4Max: number | null
  pidMax: number | null
  humidite: number | null
  verdict: Verdict
  constats: Constat[]
}

/** Tool thresholds (not from the guide). */
export const SEUILS = {
  /** O2 at or above, with CO2 at or below: like outdoor air. */
  o2Ambiant: 20.5,
  co2Ambiant: 1000,
  /** CO2 below outdoor air (≈ 400 ppm): not a plausible reading. */
  co2Min: 300,
  /** Without a usable CO2, O2 alone shows soil gas only below this. */
  o2Seul: 20,
  /** A drift towards outdoor air during sampling. */
  hausseO2: 0.5,
  baisseCo2: 0.25,
  /** Marked biological activity. */
  o2Appauvri: 15,
  co2Enrichi: 50000,
  /** Humidity interfering with adsorption on tubes (guide: soil gas can exceed 90 %). */
  humidite: 90,
}

/** Safety marks for the operator. */
export const SECURITE = {
  lieAlarme: 10,
  h2sVlep: 5,
  h2sVlct: 10,
  coVlep: 20,
  coVlct: 100,
}

const fr = (x: number, chiffres = 1) => x.toLocaleString('fr-FR', { maximumFractionDigits: chiffres })

const max = (ms: MesureGaz[], k: 'pid' | 'h2s' | 'lie' | 'co' | 'ch4' | 'humidite'): number | null => {
  const v = ms.map((m) => m[k]).filter((x): x is number => typeof x === 'number')
  return v.length ? Math.max(...v) : null
}

/** Readings outside what a meter can give for soil gas: O2 above 21,5 %
 *  (typing slip, « 185 » for 18,5) or CO2 below outdoor air (drift, zero
 *  or calibration of the analyser). */
const o2Plausible = (v: number | null) => v !== null && v >= 0 && v <= 21.5
const co2Plausible = (m: MesureGaz) => m.co2 !== null && (m.co2Superieur || m.co2 >= SEUILS.co2Min)

interface Lu {
  valeur: number
  superieur: boolean
}

/** Last plausible reading of O2 or CO2 among `ms`. */
function derniere(ms: MesureGaz[], k: 'o2' | 'co2'): Lu | null {
  for (let i = ms.length - 1; i >= 0; i--) {
    const m = ms[i]
    if (k === 'o2' && o2Plausible(m.o2)) return { valeur: m.o2!, superieur: false }
    if (k === 'co2' && co2Plausible(m)) return { valeur: m.co2!, superieur: m.co2Superieur }
  }
  return null
}

const ppm = (l: Lu) => `${l.superieur ? '> ' : ''}${fr(l.valeur, 0)} ppm`

export function evaluerQualite(f: FicheGaz, sourceDuree: SourceDuree = 'erm', sourceDebit: SourceDebit = 'releves'): QualitePoint {
  const ms = f.mesures
  const echantillonnage = ms.filter((m) => m.etape === 'echantillonnage')
  const purge = ms.filter((m) => m.etape === 'purge')
  const constats: Constat[] = []

  let verdict: Verdict = 'representatif'
  const degrader = (v: Verdict) => {
    const ordre: Verdict[] = ['representatif', 'a-verifier', 'non-evalue', 'air-ambiant']
    if (ordre.indexOf(v) > ordre.indexOf(verdict)) verdict = v
  }

  // Readings no meter gives for soil gas are set aside, and said so.
  const o2Faux = ms.filter((m) => m.o2 !== null && !o2Plausible(m.o2))
  if (o2Faux.length) {
    constats.push({ niveau: 'vigilance', texte: `O2 non plausible écarté (${o2Faux.map((m) => `${fr(m.o2!)} %${m.heure ? ` à ${m.heure}` : ''}`).join(', ')}) : erreur de saisie probable.` })
  }
  const co2Faux = ms.filter((m) => m.co2 !== null && !co2Plausible(m))
  if (co2Faux.length) {
    constats.push({
      niveau: 'vigilance',
      texte: `CO2 inférieur à celui de l’air extérieur (${co2Faux.map((m) => fr(m.co2!, 0)).join(', ')} ppm, contre ≈ 400 ppm) : mesure non plausible (dérive, zéro ou étalonnage de l’analyseur), écartée.`,
    })
  }

  // The gas drawn: the sampling readings, else the end of the purge.
  const tirees = echantillonnage.some((m) => o2Plausible(m.o2) || co2Plausible(m)) ? echantillonnage : purge
  const o2 = derniere(tirees, 'o2')
  const co2 = derniere(tirees, 'co2')

  // Start of sampling: its own reading, else the end of the purge just before.
  const avantEch = [...purge, ...echantillonnage.filter((m) => m.debutEchantillonnage)]
  const debutO2 = derniere(avantEch, 'o2')
  const debutCo2 = derniere(avantEch, 'co2')
  const finO2 = derniere(echantillonnage, 'o2')
  const finCo2 = derniere(echantillonnage, 'co2')
  const deltaO2 = debutO2 && finO2 ? finO2.valeur - debutO2.valeur : null
  // A CO2 beyond the meter's range has no measurable change.
  const deltaCo2 = debutCo2 && finCo2 && !debutCo2.superieur && !finCo2.superieur ? (finCo2.valeur - debutCo2.valeur) / debutCo2.valeur : null

  // 1. Soil gas or outdoor air (guide § 5.5.1).
  if (!o2 && !co2) {
    degrader('non-evalue')
    constats.push({ niveau: 'vigilance', texte: 'Pas de mesure exploitable d’O2 ni de CO2 : l’étanchéité du point ne peut pas être vérifiée (guide § 5.5.1).' })
  } else if (co2 && !co2.superieur && co2.valeur <= SEUILS.co2Ambiant && (!o2 || o2.valeur >= SEUILS.o2Ambiant)) {
    degrader('air-ambiant')
    constats.push({
      niveau: 'alerte',
      texte: `Gaz prélevé comparable à l’air extérieur (${o2 ? `O2 ${fr(o2.valeur)} %, ` : ''}CO2 ${ppm(co2)} ; air extérieur : O2 ≈ 21 %, CO2 ≈ 400 ppmv) : entrée d’air dans l’ouvrage probable, étanchéité à refaire (guide § 5.5.1).`,
    })
  } else if (!co2 && o2 && o2.valeur >= SEUILS.o2Seul) {
    degrader('a-verifier')
    constats.push({
      niveau: 'vigilance',
      texte: `O2 de ${fr(o2.valeur)} %, proche de l’air extérieur, sans CO2 exploitable pour trancher : étanchéité non démontrée (guide § 5.5.1).`,
    })
  } else {
    const signes: string[] = []
    if (co2 && (co2.superieur || co2.valeur > SEUILS.co2Ambiant)) {
      signes.push(co2.superieur ? `CO2 au-delà de la gamme de l’analyseur (${ppm(co2)})` : `CO2 ${ppm(co2)}, soit ${fr(co2.valeur / 400, 0)} fois l’air extérieur`)
    }
    if (o2 && o2.valeur < SEUILS.o2Ambiant) signes.push(`O2 ${fr(o2.valeur)} %, sous les 21 % de l’air extérieur`)
    constats.push({ niveau: 'info', texte: `Signature de gaz du sol : ${signes.join(' ; ')}.` })
    if (!co2) constats.push({ niveau: 'info', texte: 'CO2 non exploitable : signature appréciée sur l’O2 seul.' })
  }

  // 2. Drift during sampling: towards outdoor air means an air inlet.
  if ((deltaO2 !== null && deltaO2 >= SEUILS.hausseO2) || (deltaCo2 !== null && deltaCo2 <= -SEUILS.baisseCo2)) {
    degrader('a-verifier')
    const parts: string[] = []
    if (deltaO2 !== null && deltaO2 >= SEUILS.hausseO2) parts.push(`O2 ${fr(debutO2!.valeur)} → ${fr(finO2!.valeur)} %`)
    if (deltaCo2 !== null && deltaCo2 <= -SEUILS.baisseCo2) parts.push(`CO2 ${ppm(debutCo2!)} → ${ppm(finCo2!)}`)
    constats.push({
      niveau: 'vigilance',
      texte: `Évolution vers l’air extérieur pendant le prélèvement (${parts.join(', ')}) : entrée d’air possible en cours d’échantillonnage.`,
    })
  } else if (deltaCo2 !== null && Math.abs(deltaCo2) > 0.2) {
    constats.push({
      niveau: 'info',
      texte: `CO2 ${deltaCo2 > 0 ? 'en hausse' : 'en baisse'} de ${fr(Math.abs(deltaCo2) * 100, 0)} % entre la fin de la purge et la fin du prélèvement : paramètres pas encore stabilisés en fin de purge (guide § 5.5.2 : purge jusqu’à stabilisation ou d’au moins 5 volumes morts)${deltaCo2 > 0 ? ', le gaz prélevé s’enrichissant en gaz du sol' : ''}.`,
    })
  }

  // 3. Biological activity (guide § 2 and § 3.1.2).
  const ch4Max = max(ms, 'ch4')
  const h2sMax = max(ms, 'h2s')
  const coMax = max(ms, 'co')
  if ((o2 && o2.valeur < SEUILS.o2Appauvri) || (co2 && co2.valeur >= SEUILS.co2Enrichi)) {
    constats.push({
      niveau: 'info',
      texte: `Appauvrissement en O2 ou enrichissement en CO2 marqué : activité biologique probable dans les sols (biodégradation de composés organiques ; guide § 3.1.2).`,
    })
  }
  const produits = [ch4Max ? `CH4 ${fr(ch4Max)} %` : '', h2sMax ? `H2S ${fr(h2sMax)} ppm` : '', coMax ? `CO ${fr(coMax)} ppm` : ''].filter(Boolean)
  if (produits.length) {
    constats.push({
      niveau: 'info',
      texte: `${produits.join(', ')} : gaz pouvant provenir de l’activité biologique dans un sol pollué par des substances biodégradables (guide § 2).`,
    })
  }

  // 4. Safety of the operator.
  const lieMax = max(ms, 'lie')
  if (lieMax !== null && lieMax >= SECURITE.lieAlarme) {
    constats.push({ niveau: 'alerte', texte: `LIE ${fr(lieMax)} % : au-dessus du premier seuil d’alarme usuel des explosimètres (10 % de la LIE), atmosphère explosive possible dans l’ouvrage.` })
  } else if (lieMax) {
    constats.push({ niveau: 'info', texte: `LIE ${fr(lieMax)} % : gaz inflammables détectés, sous le premier seuil d’alarme usuel (10 % de la LIE).` })
  }
  if (h2sMax !== null && h2sMax >= SECURITE.h2sVlep) {
    constats.push({
      niveau: 'vigilance',
      texte: `H2S ${fr(h2sMax)} ppm dans la ligne de prélèvement : au-dessus de la VLEP 8 h (5 ppm${h2sMax >= SECURITE.h2sVlct ? ' ; VLCT 10 ppm également dépassée' : ''}) — repère de sécurité pour l’intervenant.`,
    })
  }
  if (coMax !== null && coMax >= SECURITE.coVlep) {
    constats.push({
      niveau: 'vigilance',
      texte: `CO ${fr(coMax)} ppm dans la ligne de prélèvement : au-dessus de la VLEP 8 h (20 ppm${coMax >= SECURITE.coVlct ? ' ; VLCT 100 ppm également dépassée' : ''}) — repère de sécurité pour l’intervenant.`,
    })
  }

  // 5. Humidity on the tubes (guide § 6.3.3).
  const humidite = max(echantillonnage.length ? echantillonnage : ms, 'humidite')
  if (humidite !== null && humidite >= SEUILS.humidite) {
    constats.push({
      niveau: 'vigilance',
      texte: `Humidité relative ${fr(humidite, 0)} % : risque d’interférence de l’humidité sur l’adsorption (tubes), filtre à humidité à envisager s’il est compatible avec les composés recherchés (guide § 6.3.3).`,
    })
  }

  // 6. Flow (guide tableau 11), through the retained flows.
  const r = retenir(f, sourceDuree, sourceDebit)
  for (const a of r.alertes) {
    if (/non représentatif/.test(a)) {
      degrader('a-verifier')
      constats.push({ niveau: 'vigilance', texte: a })
    } else if (/débit minimum/.test(a)) constats.push({ niveau: 'info', texte: a })
  }

  const pidMax = max(ms, 'pid')
  if (pidMax !== null && pidMax > 0) {
    constats.push({ niveau: 'info', texte: `PID jusqu’à ${fr(pidMax)} ppm (valeur indicative seulement, à ne pas utiliser pour une évaluation des risques — guide § 6.3.3).` })
  }

  return { ouvrage: f.ouvrage, co2NonPlausible: co2Faux.length > 0, o2: o2?.valeur ?? null, co2: co2?.valeur ?? null, co2Superieur: !!co2?.superieur, deltaO2, deltaCo2, h2sMax, coMax, lieMax, ch4Max, pidMax, humidite, verdict, constats }
}

/** A few sentences on the whole campaign. */
export function syntheseQualite(points: QualitePoint[]): string[] {
  if (!points.length) return []
  const phrases: string[] = []
  const par = (v: Verdict) => points.filter((p) => p.verdict === v)
  const liste = (ps: QualitePoint[]) => ps.map((p) => p.ouvrage).join(', ')
  const rep = par('representatif')
  const amb = par('air-ambiant')
  const ver = par('a-verifier')
  const ne = par('non-evalue')
  phrases.push(
    `${rep.length} point${rep.length > 1 ? 's' : ''} sur ${points.length} présente${rep.length > 1 ? 'nt' : ''} une signature de gaz du sol sans indice d’entrée d’air.`,
  )
  if (amb.length) phrases.push(`Gaz prélevé comparable à l’air extérieur, entrée d’air probable : ${liste(amb)} — résultats à interpréter avec prudence, prélèvement à refaire après reprise de l’étanchéité.`)
  if (ver.length) phrases.push(`À vérifier (évolution vers l’air extérieur, mesure incomplète ou débit non conforme) : ${liste(ver)}.`)
  if (ne.length) phrases.push(`Sans mesure d’O2 ni de CO2, non évaluables : ${liste(ne)}.`)
  const sature = points.filter((p) => p.co2Superieur)
  const mesures = points.filter((p) => p.co2 !== null && !p.co2Superieur)
  const o2s = points.map((p) => p.o2).filter((x): x is number => x !== null)
  if (sature.length || mesures.length) {
    const tries = [...mesures].sort((a, b) => b.co2! - a.co2!)
    const morceaux: string[] = []
    if (mesures.length) morceaux.push(`CO2 mesuré de ${fr(tries[tries.length - 1].co2!, 0)} à ${fr(tries[0].co2!, 0)} ppm`)
    if (o2s.length) morceaux.push(`O2 de ${fr(Math.min(...o2s))} à ${fr(Math.max(...o2s))} %`)
    const fortes = sature.length
      ? `CO2 au-delà de la gamme de l’analyseur en ${liste(sature)}`
      : tries
          .slice(0, 3)
          .map((p) => `${p.ouvrage} (${fr(p.co2!, 0)} ppm)`)
          .join(', ')
    phrases.push(`${morceaux.join(', ')} ; signature de gaz du sol la plus marquée : ${fortes}.`)
  }
  const douteux = points.filter((p) => p.co2NonPlausible)
  if (douteux.length >= 3) {
    phrases.push(
      `CO2 inférieur à celui de l’air extérieur sur ${douteux.length} points (${liste(douteux)}) : l’analyseur de CO2 est à vérifier (zéro, étalonnage) ; sur ces points, seul l’O2 a été interprété.`,
    )
  }
  const securite = points.filter((p) => (p.lieMax ?? 0) >= SECURITE.lieAlarme || (p.h2sMax ?? 0) >= SECURITE.h2sVlep || (p.coMax ?? 0) >= SECURITE.coVlep)
  if (securite.length) phrases.push(`Repères de sécurité dépassés (LIE, H2S ou CO) : ${liste(securite)}.`)
  else if (points.some((p) => p.lieMax !== null || p.h2sMax !== null || p.coMax !== null)) phrases.push('Aucun repère de sécurité (LIE, H2S, CO) atteint.')
  return phrases
}

export const REFERENCES_QUALITE = [
  'BRGM / INERIS, Guide pratique pour la caractérisation des gaz du sol et de l’air intérieur en lien avec une pollution des sols et/ou des eaux souterraines, RP-65870-FR / INERIS-DRC-16-156183-01401A, 2016 : § 5.5.1 (test d’étanchéité O2 / CO2), § 5.5.2 (purge), § 6.3.3 (mesures multigaz, PID, humidité), tableau 11 (débits).',
  'INRS, fiches toxicologiques 32 (sulfure d’hydrogène : VLEP 8 h 5 ppm, VLCT 10 ppm) et 47 (monoxyde de carbone : VLEP 8 h 20 ppm, VLCT 100 ppm).',
  `Seuils propres à l’outil (le guide n’en fixe pas) : air extérieur si O2 ≥ ${fr(SEUILS.o2Ambiant)} % et CO2 ≤ ${fr(SEUILS.co2Ambiant, 0)} ppm ; CO2 < ${fr(SEUILS.co2Min, 0)} ppm et O2 > 21,5 % jugés non plausibles et écartés ; sans CO2 exploitable, signature de gaz du sol si O2 < ${fr(SEUILS.o2Seul, 0)} % ; dérive si l’O2 gagne ${fr(SEUILS.hausseO2)} point ou si le CO2 perd ${fr(SEUILS.baisseCo2 * 100, 0)} % pendant le prélèvement ; activité biologique marquée si O2 < ${fr(SEUILS.o2Appauvri, 0)} % ou CO2 ≥ ${fr(SEUILS.co2Enrichi / 10000, 0)} %.`,
]
