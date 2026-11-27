/**
 * The monitoring history as one table: every result of every campaign,
 * well by well and compound by compound, in a common unit.
 *
 * Inputs are "lots" — a lab report, or one campaign of a history table —
 * gathered into dated campaigns. Within a campaign the lots are merged
 * (a lab may split a campaign into several reports). Then:
 * - samples are matched to wells by name ("PZ 01", "pz-1", "Pz1" are one
 *   well), unless the user attached a sample to another well; blanks and
 *   duplicates are set apart;
 * - compounds are matched across labs by CAS number, else by name, and
 *   brought to the unit of their oldest result (mg/l → µg/l…); a compound
 *   given in a unit that cannot be converted stays a separate series;
 * - the family sums (COHV, BTEX, 16 PAH, C10–C40) are computed for every
 *   sample the same way, whatever sums the labs gave;
 * - water levels and field readings of the sampling sheets are attached to
 *   the nearest campaign (within a month).
 *
 * Pure.
 */

import { cleCompose, cleOuvrage, FAMILLES, LIBELLES_FAMILLE, somme, type Famille } from '../resultats/campagnes.ts'
import { positionsAuto, type Position } from '../resultats/expert/amontAval.ts'
import { fusionnerLectures } from '../resultats/fusion.ts'
import { facteurUnite } from '../resultats/guides.ts'
import type { Lecture, Parametre } from '../resultats/parse.ts'
import { qualifierAuto, type TypeEchantillon } from '../resultats/qualite.ts'
import { PARAMS_TERRAIN, type ParamTerrain } from '../nappe/fiches.ts'
import { ecartJours, regimePropose } from './dates.ts'
import { anneeDecimale } from './stats.ts'

export type Regime = 'HE' | 'BE' | null
export type OrigineDate = 'rapport' | 'fichier' | 'historique' | 'saisie' | ''

export const LIBELLES_ORIGINE_DATE: Record<OrigineDate, string> = {
  rapport: 'lue dans le rapport',
  fichier: 'lue dans le nom du fichier',
  historique: 'tableau historique',
  saisie: 'saisie',
  '': 'à saisir',
}

/** A lab report, or one campaign of a history table. */
export interface Lot {
  id: string
  fichier: string
  lecture: Lecture
  /** Sampling date found (ISO), or ''. */
  date: string
  origineDate: OrigineDate
  /** Label of the campaign in a history table. */
  libelle: string
  regime: Regime
}

export interface CampagneSaisie {
  id: string
  date: string
  regime: Regime
  /** The regime was proposed from the month, not given. */
  regimeAuto: boolean
  lots: string[]
  libelle: string
}

/** Water level and field readings of a well on a date (sampling sheet, history table). */
export interface Releve {
  ouvrage: string
  date: string
  /** Depth to water below the measuring point (m). */
  profondeur: number | null
  /** Water level elevation (m NGF). */
  charge: number | null
  terrain: Partial<Record<ParamTerrain, number>>
  /** Elevation of the measuring point (m NGF), when the sheet gives it. */
  repere?: number | null
  source: string
}

export interface InfoOuvrage {
  nom?: string
  position?: Position
  x?: number | null
  y?: number | null
  repere?: number | null
  exclu?: boolean
}

export interface Corrections {
  /** Sample-name key → well key, when the user attaches a sample to another well. */
  rattachements: Record<string, string>
  /** By well key. */
  ouvrages: Record<string, InfoOuvrage>
  /** Comparison value chosen by the user, by compound key (null: none). */
  references: Record<string, number | null>
  /** Results set aside by the user (outlier, doubtful sample), by result id. */
  exclus: Record<string, true>
}

export const CORRECTIONS_VIDES: Corrections = { rattachements: {}, ouvrages: {}, references: {}, exclus: {} }

export interface Campagne {
  id: string
  date: string
  /** Decimal year. */
  t: number
  regime: Regime
  regimeAuto: boolean
  /** Where the regime comes from: given, proposed from the water levels, or from the month. */
  regimeSource: 'saisi' | 'piezo' | 'mois'
  libelle: string
  fichiers: string[]
}

export interface Ouvrage {
  cle: string
  nom: string
  /** Sample names met for this well. */
  noms: string[]
  position: Position
  positionAuto: boolean
  x: number | null
  y: number | null
  repere: number | null
  exclu: boolean
}

export interface Compose {
  cle: string
  nom: string
  cas: string
  famille: string
  unite: string
  /** A sum given by a lab. */
  somme: boolean
  /** A family sum computed here. */
  calcule: Famille | null
  /** A field reading of the sampling sheets. */
  terrain: ParamTerrain | null
  /** One lab row of the compound, for the comparison values. */
  parametre: Parametre
}

export interface Resultat {
  id: string
  ouvrage: string
  compose: string
  campagne: string
  date: string
  t: number
  /** In the compound's unit; the LQ itself when `inferieur`. */
  valeur: number
  inferieur: boolean
  brut: string
  fichier: string
  /** Set aside by the user. */
  exclu: boolean
}

export interface Niveau {
  ouvrage: string
  date: string
  t: number
  campagne: string | null
  profondeur: number | null
  charge: number | null
  source: string
}

export interface Controle {
  campagne: string
  echantillon: string
  type: TypeEchantillon
}

export interface Base {
  /** Dated campaigns, oldest first. */
  campagnes: Campagne[]
  ouvrages: Ouvrage[]
  composes: Compose[]
  resultats: Resultat[]
  niveaux: Niveau[]
  controles: Controle[]
  /** What the merge did: unit conversions, duplicates, merged files. */
  notes: string[]
  /** Campaigns left out for want of a date. */
  sansDate: CampagneSaisie[]
}

// ---- Campaigns -----------------------------------------------------------------------------

let compteur = 0
export const nouvelId = (prefixe: string) => `${prefixe}${Date.now().toString(36)}${(compteur++).toString(36)}`

/** Lots within this many days of a campaign belong to it. */
export const ECART_CAMPAGNE = 20

/**
 * New lots placed in the campaigns: with a campaign dated within 20 days,
 * else in a new campaign of their own, its regime proposed from the month.
 */
export function placerLots(campagnes: CampagneSaisie[], lots: Lot[]): CampagneSaisie[] {
  const suite = campagnes.map((c) => ({ ...c, lots: [...c.lots] }))
  for (const l of lots) {
    const proche = l.date
      ? suite.filter((c) => c.date && ecartJours(c.date, l.date) <= ECART_CAMPAGNE).sort((a, b) => ecartJours(a.date, l.date) - ecartJours(b.date, l.date))[0]
      : undefined
    if (proche) {
      proche.lots.push(l.id)
      if (l.date < proche.date) proche.date = l.date
      if (l.regime && proche.regimeAuto) {
        proche.regime = l.regime
        proche.regimeAuto = false
      }
      continue
    }
    suite.push({
      id: nouvelId('c'),
      date: l.date,
      regime: l.regime ?? (l.date ? regimePropose(l.date) : null),
      regimeAuto: !l.regime,
      lots: [l.id],
      libelle: l.libelle,
    })
  }
  return suite.filter((c) => c.lots.length).sort((a, b) => (a.date && b.date ? a.date.localeCompare(b.date) : a.date ? -1 : b.date ? 1 : 0))
}

// ---- Units -----------------------------------------------------------------------------------

const normUnite = (u: string) => u.toLowerCase().replace(/\s+/g, '').replace('μ', 'µ').replace(/^ug/, 'µg').replace(/^mcg/, 'µg')

const formatFr = (x: number) => String(Number(x.toPrecision(4))).replace('.', ',')

// ---- Positions ---------------------------------------------------------------------------------

const ORDRE_POSITION: Record<Position, number> = { amont: 0, droit: 1, autre: 2, aval: 3 }

/** Highest third of the mean heads upgradient, lowest third downgradient. */
function positionsParCharges(niveaux: Niveau[]): Record<string, Position> {
  const parOuvrage = new Map<string, number[]>()
  for (const n of niveaux) if (n.charge !== null) (parOuvrage.get(n.ouvrage) ?? parOuvrage.set(n.ouvrage, []).get(n.ouvrage)!).push(n.charge)
  if (parOuvrage.size < 3) return {}
  const moyennes = [...parOuvrage].map(([o, cs]) => ({ o, c: cs.reduce((a, b) => a + b, 0) / cs.length }))
  const max = Math.max(...moyennes.map((m) => m.c))
  const min = Math.min(...moyennes.map((m) => m.c))
  const tiers = (max - min) / 3
  if (tiers <= 0) return {}
  return Object.fromEntries(moyennes.map((m) => [m.o, m.c >= max - tiers ? 'amont' : m.c <= min + tiers ? 'aval' : 'droit'])) as Record<string, Position>
}

// ---- Regime from the water levels ---------------------------------------------------------------

/**
 * High or low water read on the levels themselves: for each well, its
 * level at the campaign against its median level over the history; the
 * campaign is "high water" when the wells stand above their median on
 * average. Applied only to campaigns whose regime was not given, and only
 * with 4 levels at least per well.
 */
function regimesPiezometriques(campagnes: Campagne[], niveaux: Niveau[]) {
  const parOuvrage = new Map<string, Niveau[]>()
  for (const n of niveaux) if (n.campagne) (parOuvrage.get(n.ouvrage) ?? parOuvrage.set(n.ouvrage, []).get(n.ouvrage)!).push(n)
  const valeur = (n: Niveau, enCharge: boolean) => (enCharge ? n.charge : n.profondeur !== null ? -n.profondeur : null)
  const ecarts = new Map<string, number[]>()
  for (const ns of parOuvrage.values()) {
    const enCharge = ns.every((n) => n.charge !== null)
    const vs = ns.map((n) => valeur(n, enCharge)).filter((v): v is number => v !== null)
    if (vs.length < 4) continue
    const s = [...vs].sort((a, b) => a - b)
    const med = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
    for (const n of ns) {
      const v = valeur(n, enCharge)
      if (v === null) continue
      ;(ecarts.get(n.campagne!) ?? ecarts.set(n.campagne!, []).get(n.campagne!)!).push(v - med)
    }
  }
  for (const c of campagnes) {
    const es = ecarts.get(c.id)
    if (!c.regimeAuto || !es?.length) continue
    const m = es.reduce((a, b) => a + b, 0) / es.length
    c.regime = m >= 0 ? 'HE' : 'BE'
    c.regimeSource = 'piezo'
  }
}

// ---- Base ------------------------------------------------------------------------------------

export interface Entrees {
  lots: Lot[]
  campagnes: CampagneSaisie[]
  releves: Releve[]
  /** Wells described in a history table (position, coordinates). */
  ouvragesDecrits: { nom: string; position: Position | null; x: number | null; y: number | null; repere: number | null }[]
  /** Investigation points of the open dossier: Lambert 93 and measuring point, matched by name. */
  pointsDossier?: { nom: string; x93: number; y93: number; repere?: number }[]
  corrections: Corrections
}

export function construireBase(e: Entrees): Base {
  const notes: string[] = []
  const parLot = new Map(e.lots.map((l) => [l.id, l]))
  const datees = e.campagnes.filter((c) => c.date && c.lots.some((id) => parLot.has(id))).sort((a, b) => a.date.localeCompare(b.date))
  const sansDate = e.campagnes.filter((c) => !c.date && c.lots.some((id) => parLot.has(id)))

  const campagnes: Campagne[] = datees.map((c) => ({
    id: c.id,
    date: c.date,
    t: anneeDecimale(c.date),
    regime: c.regime,
    regimeAuto: c.regimeAuto,
    regimeSource: c.regimeAuto ? 'mois' : 'saisi',
    libelle: c.libelle,
    fichiers: [...new Set(c.lots.map((id) => parLot.get(id)?.fichier).filter((f): f is string => !!f))],
  }))

  const ouvrages = new Map<string, { cle: string; noms: Map<string, number> }>()
  const cleDe = (nom: string) => {
    const k = cleOuvrage(nom)
    return e.corrections.rattachements[k] ?? k
  }
  const noterOuvrage = (cle: string, nom: string) => {
    let o = ouvrages.get(cle)
    if (!o) ouvrages.set(cle, (o = { cle, noms: new Map() }))
    o.noms.set(nom, (o.noms.get(nom) ?? 0) + 1)
  }

  const composes = new Map<string, Compose>()
  const ordreComposes: string[] = []
  const resultats = new Map<string, Resultat>()
  const controles: Controle[] = []
  const conversions = new Set<string>()
  let doublons = 0

  const ajouter = (r: Omit<Resultat, 'id' | 'exclu'>) => {
    const id = `${r.ouvrage}|${r.compose}|${r.campagne}`
    const vu = resultats.get(id)
    if (vu) {
      // Two samples of one well in one campaign: the quantified, higher one is kept.
      doublons++
      const mieux = (!r.inferieur && vu.inferieur) || (r.inferieur === vu.inferieur && r.valeur > vu.valeur)
      if (!mieux) return
    }
    resultats.set(id, { ...r, id, exclu: !!e.corrections.exclus[id] })
  }

  for (const c of campagnes) {
    const saisie = datees.find((x) => x.id === c.id)!
    const lots = saisie.lots.map((id) => parLot.get(id)).filter((l): l is Lot => !!l)
    let lecture: Lecture
    if (lots.length === 1) lecture = lots[0].lecture
    else {
      try {
        const f = fusionnerLectures(lots.map((l) => ({ lecture: l.lecture, nom: l.fichier })))
        lecture = f.lecture
        if (f.notes.length) notes.push(`Campagne du ${c.date} : ${f.notes.join(' ')}`)
      } catch {
        lecture = lots[0].lecture
        notes.push(`Campagne du ${c.date} : les fichiers n'ont pas pu être réunis, seul « ${lots[0].fichier} » est retenu.`)
      }
    }
    const fichier = lots.map((l) => l.fichier).join(' + ')
    const qualifications = qualifierAuto(lecture.points)
    for (const p of lecture.points) {
      const q = qualifications[p.nom]
      if (q && q.type !== 'echantillon') {
        controles.push({ campagne: c.id, echantillon: p.nom, type: q.type })
        continue
      }
      const ouvrage = cleDe(p.nom)
      noterOuvrage(ouvrage, p.nom)
      const valeurs = lecture.valeurs.CM[p.nom] ?? {}
      for (const pa of lecture.parametres.CM) {
        const m = valeurs[pa.cle]
        if (!m || m.valeur === null) continue
        let cle = cleCompose(pa)
        let comp = composes.get(cle)
        let facteur = 1
        if (comp && normUnite(comp.unite) !== normUnite(pa.unite)) {
          const f = facteurUnite(pa.unite, comp.unite)
          if (f === null) {
            cle = `${cle}@${normUnite(pa.unite)}`
            comp = composes.get(cle)
          } else {
            facteur = f
            conversions.add(`${comp.nom} : ${pa.unite} → ${comp.unite}`)
          }
        }
        if (!comp) {
          comp = { cle, nom: pa.nom, cas: pa.cas, famille: pa.famille, unite: pa.unite, somme: pa.somme, calcule: null, terrain: null, parametre: pa }
          composes.set(cle, comp)
          ordreComposes.push(cle)
        }
        if (!comp.cas && pa.cas) comp.cas = pa.cas
        if (!comp.famille && pa.famille) comp.famille = pa.famille
        const valeur = m.valeur * facteur
        ajouter({
          ouvrage,
          compose: cle,
          campagne: c.id,
          date: c.date,
          t: c.t,
          valeur,
          inferieur: m.inferieur,
          brut: facteur === 1 ? m.brut.replace(/(\d)\.(\d)/g, '$1,$2') : `${m.inferieur ? '<' : ''}${formatFr(valeur)}`,
          fichier,
        })
      }
      // Family sums, computed alike for every sample.
      for (const f of FAMILLES) {
        const s = somme(lecture, f, p.nom)
        if (!s) continue
        const cle = `somme:${f}`
        if (!composes.has(cle)) {
          const nom = `${LIBELLES_FAMILLE[f]} (calculée)`
          composes.set(cle, {
            cle,
            nom,
            cas: '',
            famille: 'Sommes calculées',
            unite: 'µg/l',
            somme: true,
            calcule: f,
            terrain: null,
            parametre: { cle, famille: 'Sommes calculées', nom, cas: '', unite: 'µg/l', versMicrogrammes: 1, somme: true },
          })
        }
        ajouter({
          ouvrage,
          compose: cle,
          campagne: c.id,
          date: c.date,
          t: c.t,
          valeur: s.valeur,
          inferieur: s.nonQuantifie,
          brut: s.nonQuantifie ? 'n.q.' : formatFr(s.valeur),
          fichier,
        })
      }
    }
  }
  if (conversions.size) notes.push(`Unités harmonisées : ${[...conversions].join(' ; ')}.`)
  if (doublons) notes.push(`${doublons} résultat${doublons > 1 ? 's' : ''} en double pour un même ouvrage et une même campagne (deux échantillons rattachés au même ouvrage) : le plus élevé est retenu.`)

  // Elevation of each well's measuring point: entered, from a history table, else from the sampling sheets.
  const decrits = new Map(e.ouvragesDecrits.map((o) => [cleDe(o.nom), o]))
  const duDossier = new Map((e.pointsDossier ?? []).map((p) => [cleDe(p.nom), p]))
  const reperesFiches = new Map<string, number>()
  for (const r of [...e.releves].sort((a, b) => a.date.localeCompare(b.date))) if (r.repere !== null && r.repere !== undefined) reperesFiches.set(cleDe(r.ouvrage), r.repere)
  const repereDe = (cle: string): number | null => {
    const info = e.corrections.ouvrages[cle]
    if (info?.repere !== undefined && info.repere !== null) return info.repere
    return decrits.get(cle)?.repere ?? reperesFiches.get(cle) ?? duDossier.get(cle)?.repere ?? null
  }

  // Water levels and field readings. A depth to water becomes a head when the measuring point elevation is known.
  const niveaux: Niveau[] = []
  for (const r of e.releves) {
    if (!r.date) continue
    const ouvrage = cleDe(r.ouvrage)
    noterOuvrage(ouvrage, r.ouvrage)
    const proche = campagnes
      .filter((c) => ecartJours(c.date, r.date) <= 31)
      .sort((a, b) => ecartJours(a.date, r.date) - ecartJours(b.date, r.date))[0]
    if (r.profondeur !== null || r.charge !== null) {
      const z = repereDe(ouvrage)
      const charge = r.charge ?? (z !== null && r.profondeur !== null ? Math.round((z - r.profondeur) * 1000) / 1000 : null)
      niveaux.push({ ouvrage, date: r.date, t: anneeDecimale(r.date), campagne: proche?.id ?? null, profondeur: r.profondeur, charge, source: r.source })
    }
    if (!proche) continue
    for (const [id, valeur] of Object.entries(r.terrain) as [ParamTerrain, number][]) {
      if (valeur === undefined || valeur === null || !Number.isFinite(valeur)) continue
      const def = PARAMS_TERRAIN.find((x) => x.id === id)!
      const cle = `terrain:${id}`
      if (!composes.has(cle)) {
        const nom = `${def.libelle} (terrain)`
        composes.set(cle, {
          cle,
          nom,
          cas: '',
          famille: 'Paramètres de terrain',
          unite: def.unite,
          somme: false,
          calcule: null,
          terrain: id,
          parametre: { cle, famille: 'Paramètres de terrain', nom, cas: '', unite: def.unite, versMicrogrammes: 1, somme: false },
        })
      }
      if (resultats.has(`${ouvrage}|${cle}|${proche.id}`)) continue
      ajouter({ ouvrage, compose: cle, campagne: proche.id, date: proche.date, t: proche.t, valeur, inferieur: false, brut: formatFr(valeur), fichier: r.source })
    }
  }
  niveaux.sort((a, b) => a.date.localeCompare(b.date))
  regimesPiezometriques(campagnes, niveaux)

  // Wells.
  for (const [cle, o] of decrits) noterOuvrage(cle, o.nom)
  const parNom = positionsAuto([...ouvrages.values()].flatMap((o) => [...o.noms.keys()].map((nom) => ({ nom, libelles: {} }))))
  const parCharges = positionsParCharges(niveaux)
  const listeOuvrages: Ouvrage[] = [...ouvrages.values()].map((o) => {
    const info = e.corrections.ouvrages[o.cle] ?? {}
    const decrit = decrits.get(o.cle)
    const noms = [...o.noms.entries()].sort((a, b) => b[1] - a[1])
    const nomAuto = noms.map(([n]) => parNom[n]).find(Boolean)
    const auto: Position = decrit?.position ?? nomAuto ?? parCharges[o.cle] ?? 'autre'
    return {
      cle: o.cle,
      nom: info.nom || noms[0][0],
      noms: noms.map(([n]) => n),
      position: info.position ?? auto,
      positionAuto: !info.position && !decrit?.position,
      x: info.x !== undefined ? info.x : (decrit?.x ?? null),
      y: info.y !== undefined ? info.y : (decrit?.y ?? null),
      repere: repereDe(o.cle),
      exclu: !!info.exclu,
    }
  })
  // Coordinates of the dossier's points (Lambert 93) only when no well has its own: one system for all the wells.
  if (duDossier.size && listeOuvrages.every((o) => o.x === null && o.y === null)) {
    let reprises = 0
    for (const o of listeOuvrages) {
      const p = duDossier.get(o.cle)
      if (!p || e.corrections.ouvrages[o.cle]?.x !== undefined) continue
      o.x = p.x93
      o.y = p.y93
      reprises++
    }
    if (reprises) notes.push(`Coordonnées de ${reprises} ouvrage${reprises > 1 ? 's' : ''} reprises des points d'investigation du dossier (Lambert 93).`)
  }
  listeOuvrages.sort((a, b) => ORDRE_POSITION[a.position] - ORDRE_POSITION[b.position] || a.nom.localeCompare(b.nom, 'fr', { numeric: true }))

  // Compounds: lab order (by family as first met), then the computed sums, then field readings.
  const listeComposes = [
    ...ordreComposes.map((k) => composes.get(k)!),
    ...[...composes.values()].filter((c) => c.calcule),
    ...[...composes.values()].filter((c) => c.terrain),
  ]
  const familles: string[] = []
  for (const c of listeComposes) if (!c.calcule && !c.terrain && !familles.includes(c.famille)) familles.push(c.famille)
  listeComposes.sort((a, b) => {
    const rang = (c: Compose) => (c.terrain ? 1e6 : c.calcule ? 1e5 : familles.indexOf(c.famille))
    return rang(a) - rang(b)
  })

  return {
    campagnes,
    ouvrages: listeOuvrages,
    composes: listeComposes,
    resultats: [...resultats.values()].sort((a, b) => a.t - b.t),
    niveaux,
    controles,
    notes,
    sansDate,
  }
}
