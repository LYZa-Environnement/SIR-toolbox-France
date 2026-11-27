/**
 * Boreholes for the 3D model, from the two places the logs live:
 * - the ERM logs workbook itself (Collars, Log Info, Lithology, Well
 *   Construction, PID, Water Level, Samples), read here as the Logs de
 *   forage page reads it (public/logs-forage.html, loadSheets) — the same
 *   sheet names and column headers, in English or in French;
 * - the Logs de forage page's file in the dossier (logs-forage.json), with
 *   the lab results it attached to the samples.
 */

import { cleOuvrage } from '../resultats/campagnes.ts'
import { normaliser } from '../resultats/guides.ts'
import type { Cell } from '../resultats/parse.ts'
import type { Feuille } from '../fichiers.ts'
import { classeLitho } from './lithologie.ts'
import type { EchantillonSol, Equipement, Forage, Observation, ParametreSol, Source, ValeurSol } from './types.ts'

const norm = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

const majuscules = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()

export function nombre(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v)
    .replace(/[\s  ]/g, '')
    .replace(',', '.')
  const n = Number.parseFloat(s)
  return Number.isFinite(n) && /^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(s) ? n : null
}

const texte = (v: unknown) => (v === null || v === undefined ? '' : v instanceof Date ? dateIso(v) : String(v).replace(/\s+/g, ' ').trim())

function dateIso(d: Date): string {
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** "12/03/2024", "12/03/2024 - 09h00", a Date or "2024-03-12" → "2024-03-12"; '' otherwise. */
export function lireDateLog(v: unknown): string {
  if (v instanceof Date) return dateIso(v)
  const s = texte(v)
  const fr = s.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/)
  if (fr) return `${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}`
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/)
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : ''
}

// Column headers, as logs-forage.html's SYN.
const SYN: Record<string, string[]> = {
  hole: ['holeid', 'hole', 'sondage', 'ouvrage', 'piezometre', 'forage', 'idouvrage', 'pointid'],
  east: ['easting', 'x', 'xlambert'],
  north: ['northing', 'y', 'ylambert'],
  elev: ['elevation', 'cote', 'z', 'altitude', 'cotetn', 'cotengf'],
  edepth: ['endingdepth', 'profondeurfinale'],
  depth: ['depth', 'profondeur', 'profondeurm'],
  start: ['startingdatetime', 'startingdate', 'dateheuredebut', 'datedebut'],
  from: ['from', 'de', 'depuis', 'profondeurdebut'],
  to: ['to', 'a', 'jusqua', 'profondeurfin'],
  item: ['item', 'element', 'equipement'],
  pid: ['pidppm', 'pid', 'valeurpid', 'pidvalue'],
  key: ['lithologykeyword', 'motcle', 'motclelithologie', 'keyword'],
  desc: ['lithologydescription', 'description', 'descriptionlithologique'],
  sid: ['sampleid', 'samplename', 'samplenumber', 'echantillon', 'sample', 'idechantillon', 'nomechantillon', 'nomdelechantillon', 'referenceechantillon'],
  sdate: ['date', 'datedeprelevement', 'dateprelevement', 'samplingdate'],
  rem: ['remarks', 'remarques', 'remarque'],
  org: ['organolepticobservations', 'observationsorganoleptiques', 'organoleptique'],
  moist: ['moistureindication', 'indicationhumidite', 'humidite', 'moisture'],
}

function feuille(feuilles: Feuille[], noms: string[]): Cell[][] | null {
  const voulus = noms.map(norm)
  return feuilles.find((f) => voulus.includes(norm(f.nom)))?.grille ?? null
}

interface Table {
  lignes: Cell[][]
  lire: (ligne: Cell[], cle: string) => Cell
}

function table(grille: Cell[][] | null): Table | null {
  if (!grille) return null
  const i = grille.findIndex((r) => r && r.filter((v) => v !== null && v !== undefined && v !== '').length >= 2)
  if (i < 0) return null
  const entete = grille[i].map(norm)
  const colonne = (cle: string) => {
    for (const s of SYN[cle] ?? [cle]) {
      const j = entete.indexOf(s)
      if (j >= 0) return j
    }
    return -1
  }
  const lignes = grille.slice(i + 1).filter((r) => r && r.some((v) => v !== null && v !== undefined && v !== ''))
  return {
    lignes,
    lire: (ligne, cle) => {
      const j = colonne(cle)
      return j < 0 ? null : ligne[j]
    },
  }
}

/** Well construction item, as logs-forage.html's itemKey. */
export function elementEquipement(v: string): string {
  const u = majuscules(v)
  if (/BENTO/.test(u) && /CIMENT/.test(u)) return 'BENTO/CIMENT'
  if (/BENTO/.test(u)) return 'BENTONITE'
  if (/MASSIF|GRAVIER FILTRANT|FILTRE/.test(u)) return 'MASSIF FILTRANT'
  if (/CREPINE|SCREEN/.test(u)) return 'CREPINE'
  if (/TUBE|CASING|PLEIN/.test(u)) return 'TUBE PLEIN'
  if (/CAPOT|BOUCHE A CLE|COVER/.test(u)) return 'CAPOT'
  if (/BOUCHON|BOTTOM CAP/.test(u)) return 'BOUCHON'
  if (/CUTTING/.test(u)) return 'CUTTINGS'
  if (/BETON|CONCRETE/.test(u)) return 'BETON'
  if (/CIMENT|CEMENT|GROUT/.test(u)) return 'CIMENT'
  if (/SABLE|SAND/.test(u)) return 'SABLE'
  return u
}

function nouveau(nom: string): Forage {
  return { nom, cle: cleOuvrage(nom), x: null, y: null, z: null, profondeur: 0, lithologie: [], equipement: [], pid: [], observations: [], niveauEau: null, echantillons: [], date: '' }
}

const parDe = <T extends { de: number }>(a: T, b: T) => a.de - b.de

/** Depth of a borehole: the log's, else the deepest interval described. */
function finir(f: Forage, profondeurDonnee: number | null) {
  f.lithologie.sort(parDe)
  f.equipement.sort(parDe)
  f.pid.sort(parDe)
  f.observations.sort(parDe)
  f.echantillons.sort(parDe)
  const fond = Math.max(0, ...f.lithologie.map((l) => l.a), ...f.equipement.map((e) => e.a), ...f.echantillons.map((e) => e.a))
  f.profondeur = profondeurDonnee !== null && profondeurDonnee > 0 ? profondeurDonnee : fond
}

const intervalleValide = (de: number | null, a: number | null): de is number => de !== null && a !== null && a > de

/** The ERM logs workbook; null when the file is not one (no Lithology sheet, or nothing in it). */
export function lireClasseurLogs(feuilles: Feuille[], fichier: string): Source | null {
  const lith = table(feuille(feuilles, ['Lithology', 'Lithologie']))
  if (!lith || !lith.lignes.length) return null
  const forages = new Map<string, Forage>()
  const profondeurs = new Map<string, number>()
  const F = (v: Cell) => {
    const nom = texte(v)
    if (!nom) return null
    if (!forages.has(nom)) forages.set(nom, nouveau(nom))
    return forages.get(nom)!
  }

  let t = table(feuille(feuilles, ['Collars', 'Collar', 'Têtes', 'Tetes de forage', 'Coordonnees']))
  if (t)
    for (const r of t.lignes) {
      const f = F(t.lire(r, 'hole'))
      if (!f) continue
      f.x = nombre(t.lire(r, 'east'))
      f.y = nombre(t.lire(r, 'north'))
      f.z = nombre(t.lire(r, 'elev'))
      const p = nombre(t.lire(r, 'edepth'))
      if (p !== null) profondeurs.set(f.nom, p)
    }

  t = table(feuille(feuilles, ['Log Info', 'Infos log', 'Informations']))
  if (t)
    for (const r of t.lignes) {
      const f = F(t.lire(r, 'hole'))
      if (!f) continue
      const p = nombre(t.lire(r, 'depth'))
      if (p !== null) profondeurs.set(f.nom, p)
      f.date = lireDateLog(t.lire(r, 'start'))
    }

  t = table(feuille(feuilles, ['Well Construction', 'Equipement', 'Construction']))
  if (t)
    for (const r of t.lignes) {
      const f = F(t.lire(r, 'hole'))
      const brut = texte(t.lire(r, 'item'))
      const de = nombre(t.lire(r, 'from'))
      const a = nombre(t.lire(r, 'to'))
      if (f && brut && intervalleValide(de, a)) f.equipement.push({ de, a: a!, element: elementEquipement(brut) })
    }

  t = table(feuille(feuilles, ['PID', 'PID (ppm)', 'Mesures PID']))
  if (t)
    for (const r of t.lignes) {
      const f = F(t.lire(r, 'hole'))
      const v = nombre(t.lire(r, 'pid'))
      const de = nombre(t.lire(r, 'from'))
      const a = nombre(t.lire(r, 'to'))
      if (f && v !== null && de !== null) f.pid.push({ de, a: a ?? de, valeur: v })
    }

  t = table(feuille(feuilles, ['Water Level', 'Niveau d eau', 'Niveaux', 'Niveau eau']))
  if (t)
    for (const r of t.lignes) {
      const f = F(t.lire(r, 'hole'))
      const p = nombre(t.lire(r, 'depth'))
      if (f && p !== null && f.niveauEau === null) f.niveauEau = p
    }

  for (const r of lith.lignes) {
    const f = F(lith.lire(r, 'hole'))
    const de = nombre(lith.lire(r, 'from'))
    const a = nombre(lith.lire(r, 'to'))
    if (!f || !intervalleValide(de, a)) continue
    const cle = majuscules(lith.lire(r, 'key'))
    const description = texte(lith.lire(r, 'desc'))
    f.lithologie.push({ de, a: a!, cle, description, classe: classeLitho(cle, description) })
  }

  t = table(feuille(feuilles, ['Comments', 'Commentaires', 'Observations']))
  if (t)
    for (const r of t.lignes) {
      const f = F(t.lire(r, 'hole'))
      const de = nombre(t.lire(r, 'from'))
      const o = { organoleptique: texte(t.lire(r, 'org')), remarque: texte(t.lire(r, 'rem')), humidite: texte(t.lire(r, 'moist')) }
      if (f && de !== null && (o.organoleptique || o.remarque || o.humidite)) f.observations.push({ de, a: nombre(t.lire(r, 'to')) ?? de, ...o } satisfies Observation)
    }

  t = table(feuille(feuilles, ['Samples', 'Echantillons', 'Échantillons', 'Sampling']))
  if (t)
    for (const r of t.lignes) {
      const f = F(t.lire(r, 'hole'))
      const de = nombre(t.lire(r, 'from'))
      const a = nombre(t.lire(r, 'to'))
      if (!f || de === null) continue
      const id = texte(t.lire(r, 'sid')) || `${f.nom} (${String(de).replace('.', ',')}-${String(a ?? de).replace('.', ',')} m)`
      f.echantillons.push({ id, de, a: a ?? de, date: lireDateLog(t.lire(r, 'sdate')), resultats: {} })
    }

  for (const f of forages.values()) finir(f, profondeurs.get(f.nom) ?? null)
  const liste = [...forages.values()].filter((f) => f.lithologie.length || f.equipement.length)
  if (!liste.length) return null
  const sansXY = liste.filter((f) => f.x === null || f.y === null).map((f) => f.nom)
  return {
    id: `fichier:${fichier}`,
    origine: 'fichier',
    nom: fichier,
    resume: resumeForages(liste),
    forages: liste,
    parametresSol: [],
    sols: [],
    eaux: null,
    avertissements: sansXY.length ? [`Sans coordonnées dans l'onglet Collars : ${sansXY.join(', ')}.`] : [],
  }
}

export function resumeForages(forages: Forage[]): string {
  const piezos = forages.filter((f) => f.equipement.some((e) => e.element === 'CREPINE')).length
  const ech = forages.reduce((s, f) => s + f.echantillons.length, 0)
  const analyses = forages.reduce((s, f) => s + f.echantillons.filter((e) => Object.keys(e.resultats).length).length, 0)
  return [
    `${forages.length} forage${forages.length > 1 ? 's' : ''}${piezos ? ` dont ${piezos} équipé${piezos > 1 ? 's' : ''} en piézomètre` : ''}`,
    ech ? `${ech} échantillon${ech > 1 ? 's' : ''} de sol${analyses ? `, ${analyses} avec résultats` : ''}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

// ---- Soil parameters --------------------------------------------------------------------------

const CAS = /^\d{2,7}-\d{2}-\d$/
const ELUAT = /[ée]luat|lixiv/i

/** Key of a soil parameter across sources: CAS number, else name; a leachate result apart. */
export function cleSol(nom: string, cas: string, eluat: boolean): string {
  return `${eluat ? 'eluat:' : ''}${CAS.test(cas.trim()) ? cas.trim() : `nom:${normaliser(nom)}`}`
}

// ---- logs-forage.json -------------------------------------------------------------------------

interface ValeurLabo {
  num?: number | null
  lt?: boolean
  gt?: boolean
  txt?: string
}

interface ParamLabo {
  name?: string
  unit?: string
  cas?: string
  fam?: string
  vals?: (ValeurLabo | null)[]
  eluat?: boolean
  computed?: boolean
}

interface EchantillonLog {
  id?: string
  from?: number | null
  to?: number | null
  date?: string
  labIdx?: number | null
}

interface ForageLog {
  id?: string
  collar?: { x?: number | null; y?: number | null; z?: number | null }
  info?: { start?: string }
  construction?: { from?: number | null; to?: number | null; item?: string }[]
  pid?: { from?: number | null; to?: number | null; value?: unknown }[]
  comments?: { from?: number | null; to?: number | null; rem?: string; org?: string; moist?: string }[]
  water?: { depth?: number | null }[]
  litho?: { from?: number | null; to?: number | null; key?: string; desc?: string }[]
  samples?: EchantillonLog[]
  depth?: number | null
}

const enListe = <T>(v: unknown): T[] => (v instanceof Map ? [...v.values()] : Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []) as T[]

const fmtNombre = (x: number) => String(Number(x.toPrecision(4))).replace('.', ',')

function valeurLabo(v: ValeurLabo | null | undefined): ValeurSol | null {
  if (!v) return null
  const num = typeof v.num === 'number' && Number.isFinite(v.num) ? v.num : null
  if (num === null && !v.lt) return null
  if (v.lt) return { valeur: num, inferieur: true, brut: num === null ? '< LQ' : `< ${fmtNombre(num)}` }
  return { valeur: num, inferieur: false, brut: `${v.gt ? '> ' : ''}${fmtNombre(num!)}` }
}

/** The Logs de forage page's state, as saved in the dossier (logs-forage.json). */
export function depuisLogsForage(donnees: unknown, nom = 'Logs de forage'): Source | null {
  if (!donnees || typeof donnees !== 'object') return null
  const d = donnees as { holes?: unknown; lab?: { params?: ParamLabo[]; fileName?: string } | null; fileName?: string }
  const trous = enListe<ForageLog>(d.holes)
  if (!trous.length) return null
  const params = (d.lab?.params ?? []).filter((p) => p && p.name)
  const parametresSol: ParametreSol[] = []
  const cles = params.map((p) => {
    const eluat = !!p.eluat || ELUAT.test(p.fam ?? '') || ELUAT.test(p.name ?? '')
    const cle = cleSol(p.name!, p.cas ?? '', eluat)
    if (!parametresSol.some((x) => x.cle === cle))
      parametresSol.push({ cle, nom: p.name!, cas: p.cas ?? '', unite: p.unit ?? '', famille: p.computed ? 'Sommes calculées' : (p.fam ?? ''), eluat })
    return cle
  })
  const forages: Forage[] = []
  for (const h of trous) {
    const nomForage = texte(h.id)
    if (!nomForage) continue
    const f = nouveau(nomForage)
    f.x = nombre(h.collar?.x)
    f.y = nombre(h.collar?.y)
    f.z = nombre(h.collar?.z)
    f.date = lireDateLog(h.info?.start)
    for (const c of h.construction ?? []) {
      const de = nombre(c.from)
      const a = nombre(c.to)
      if (intervalleValide(de, a) && c.item) f.equipement.push({ de, a: a!, element: elementEquipement(c.item) } satisfies Equipement)
    }
    for (const p of h.pid ?? []) {
      const de = nombre(p.from)
      const v = nombre(p.value)
      if (de !== null && v !== null) f.pid.push({ de, a: nombre(p.to) ?? de, valeur: v })
    }
    for (const c of h.comments ?? []) {
      const de = nombre(c.from)
      const o = { organoleptique: texte(c.org), remarque: texte(c.rem), humidite: texte(c.moist) }
      if (de !== null && (o.organoleptique || o.remarque || o.humidite)) f.observations.push({ de, a: nombre(c.to) ?? de, ...o })
    }
    const eau = (h.water ?? []).map((w) => nombre(w.depth)).find((x) => x !== null)
    f.niveauEau = eau ?? null
    for (const l of h.litho ?? []) {
      const de = nombre(l.from)
      const a = nombre(l.to)
      if (!intervalleValide(de, a)) continue
      const cle = majuscules(l.key)
      f.lithologie.push({ de, a: a!, cle, description: texte(l.desc), classe: classeLitho(cle, texte(l.desc)) })
    }
    for (const s of h.samples ?? []) {
      const de = nombre(s.from)
      if (de === null) continue
      const resultats: Record<string, ValeurSol> = {}
      if (typeof s.labIdx === 'number')
        params.forEach((p, i) => {
          const v = valeurLabo(p.vals?.[s.labIdx!])
          // Two lab rows of one parameter: the quantified one wins.
          if (v && (!resultats[cles[i]] || (resultats[cles[i]].inferieur && !v.inferieur))) resultats[cles[i]] = v
        })
      f.echantillons.push({ id: texte(s.id) || `${f.nom} (${de} m)`, de, a: nombre(s.to) ?? de, date: lireDateLog(s.date), resultats } satisfies EchantillonSol)
    }
    finir(f, nombre(h.depth))
    forages.push(f)
  }
  if (!forages.length) return null
  return {
    id: 'dossier:logs-forage',
    origine: 'dossier',
    outil: 'logs-forage',
    nom,
    resume: resumeForages(forages) + (d.lab?.fileName ? ` · résultats de « ${d.lab.fileName} »` : ''),
    forages,
    parametresSol,
    sols: [],
    eaux: null,
    avertissements: [],
  }
}
