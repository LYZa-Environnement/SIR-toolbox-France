/**
 * Study folders ("dossiers"): what is written to disk, without touching the
 * disk. A dossier is a real folder, typically in a synchronised OneDrive
 * folder shared with colleagues:
 *
 *   2026-123 Usine X /
 *     dossier.json          the dossier's card: name, job number, site, who changed what
 *     resultats-labo.json   one file per tool used — two people on two tools never collide
 *     suivi-temporel.json
 *     sources/              files dropped in the tools, copied as they are
 *     exports/              workbooks and figures produced by the tools
 *
 * Every file carries a format number, so that a dossier saved today still
 * opens once the tools have changed, and a revision number, so that a save
 * can tell whether someone else wrote the file in the meantime.
 */

import type { Site } from '../../types/site'

export const APPLICATION = 'SIR Toolbox France'
/** Format of dossier.json and of the envelope of the tools' files. */
export const FORMAT = 1
export const FICHIER_FICHE = 'dossier.json'
export const REPERTOIRE_SOURCES = 'sources'
export const REPERTOIRE_EXPORTS = 'exports'

/** Last change of a tool's file, as recorded on the dossier's card. */
export interface Trace {
  le: string
  par: string
}

/** dossier.json: what the dossier is about, shared by every tool. */
export interface FicheDossier {
  application: typeof APPLICATION
  type: 'dossier'
  format: number
  id: string
  nom: string
  /** Job number. */
  affaire: string
  /** The study site, entered once and taken up by every tool that needs it. */
  site: Site | null
  cree: Trace
  modifie: Trace
  /** Tools used in the dossier and their last change. */
  outils: Record<string, Trace>
}

/** A tool's file: its state, wrapped with what is needed to share it. */
export interface Enveloppe<T = unknown> {
  application: typeof APPLICATION
  format: number
  outil: string
  /** Version of the tool's own data, for its migrations. */
  version: number
  /** Incremented on every save: a different number on disk means another writer. */
  revision: number
  modifie: Trace
  donnees: T
}

export class FichierIllisible extends Error {}

// ---- Encoding ---------------------------------------------------------------------------------

/** Typed arrays kept as such (digitised traces, for instance). */
const TABLEAUX_TYPES = {
  Float64Array,
  Float32Array,
  Int32Array,
  Uint32Array,
  Int16Array,
  Uint16Array,
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
} as const

type Marque = { $sir: string; v: unknown }

const estSimple = (v: object) => {
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

function trie(valeur: Record<string, unknown>): Record<string, unknown> {
  const copie: Record<string, unknown> = {}
  for (const k of Object.keys(valeur).sort()) copie[k] = valeur[k]
  return copie
}

function remplacerTrie(this: Record<string, unknown>, cle: string, valeur: unknown): unknown {
  const v = remplacer.call(this, cle, valeur)
  return v && typeof v === 'object' && !Array.isArray(v) && estSimple(v) && !('$sir' in v) ? trie(v as Record<string, unknown>) : v
}

function remplacer(this: Record<string, unknown>, cle: string, valeur: unknown): unknown {
  // Dates have already gone through toJSON(): the holder still has the Date.
  const brute = this[cle]
  if (brute instanceof Date) return { $sir: 'date', v: Number.isNaN(brute.getTime()) ? null : brute.toISOString() }
  if (typeof valeur === 'number' && !Number.isFinite(valeur)) return { $sir: 'nombre', v: String(valeur) }
  if (valeur instanceof Set) return { $sir: 'set', v: [...valeur] }
  if (valeur instanceof Map) return { $sir: 'map', v: [...valeur] }
  if (ArrayBuffer.isView(valeur) && !(valeur instanceof DataView)) {
    const nom = valeur.constructor.name
    if (nom in TABLEAUX_TYPES) return { $sir: nom, v: Array.from(valeur as unknown as ArrayLike<number>) }
  }
  return valeur
}

function reviver(_cle: string, valeur: unknown): unknown {
  if (!valeur || typeof valeur !== 'object' || Array.isArray(valeur)) return valeur
  const m = valeur as Marque
  if (typeof m.$sir !== 'string' || !('v' in m) || Object.keys(m).length !== 2) return valeur
  switch (m.$sir) {
    case 'date':
      return new Date(m.v === null ? Number.NaN : (m.v as string))
    case 'nombre':
      return Number(m.v)
    case 'set':
      return new Set(m.v as unknown[])
    case 'map':
      return new Map(m.v as [unknown, unknown][])
    default: {
      const Type = TABLEAUX_TYPES[m.$sir as keyof typeof TABLEAUX_TYPES]
      return Type ? new Type(m.v as number[]) : valeur
    }
  }
}

/**
 * JSON that keeps what plain JSON loses in a tool's state: dates, sets,
 * maps, typed arrays, NaN and infinities. Object keys are sorted: the same
 * value always gives the same text, whatever order its keys were set in,
 * which is how a save with nothing new is skipped — reopening a dossier
 * writes nothing.
 */
export function encoder(valeur: unknown, indentation?: number): string {
  return JSON.stringify(valeur, remplacerTrie, indentation)
}

/** Same, keys left in their order (the dossier's card, meant to be read). */
export function encoderTelQuel(valeur: unknown, indentation?: number): string {
  return JSON.stringify(valeur, remplacer, indentation)
}

export function decoder(texte: string): unknown {
  return JSON.parse(texte, reviver)
}

// ---- Card and envelopes -----------------------------------------------------------------------

export function nouvelIdentifiant(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `d${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
}

export function nouvelleFiche(nom: string, affaire: string, par: string, maintenant = new Date()): FicheDossier {
  const trace = { le: maintenant.toISOString(), par }
  return { application: APPLICATION, type: 'dossier', format: FORMAT, id: nouvelIdentifiant(), nom: nom.trim(), affaire: affaire.trim(), site: null, cree: trace, modifie: trace, outils: {} }
}

const estObjet = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const estTrace = (v: unknown): v is Trace => estObjet(v) && typeof v.le === 'string' && typeof v.par === 'string'

function analyser(texte: string, quoi: string): Record<string, unknown> {
  let brut: unknown
  try {
    brut = decoder(texte)
  } catch {
    throw new FichierIllisible(`${quoi} n'est pas un fichier JSON lisible (fichier tronqué ou modifié à la main ?).`)
  }
  if (!estObjet(brut) || brut.application !== APPLICATION) throw new FichierIllisible(`${quoi} n'a pas été écrit par SIR Toolbox France.`)
  if (typeof brut.format !== 'number' || brut.format > FORMAT)
    throw new FichierIllisible(`${quoi} a été écrit par une version plus récente de SIR Toolbox France : rechargez la page (Ctrl + F5) pour obtenir la dernière version.`)
  return brut
}

/** Reads dossier.json, filling what an older or hand-edited card lacks. */
export function lireFiche(texte: string, nomRepertoire = ''): FicheDossier {
  const brut = analyser(texte, 'dossier.json')
  if (brut.type !== 'dossier') throw new FichierIllisible("dossier.json ne décrit pas un dossier d'étude.")
  const inconnue: Trace = { le: '', par: '' }
  const outils: Record<string, Trace> = {}
  if (estObjet(brut.outils)) for (const [k, v] of Object.entries(brut.outils)) if (estTrace(v)) outils[k] = v
  const site = estObjet(brut.site) && typeof brut.site.lat === 'number' && typeof brut.site.lon === 'number' ? (brut.site as unknown as Site) : null
  return {
    application: APPLICATION,
    type: 'dossier',
    format: FORMAT,
    id: typeof brut.id === 'string' && brut.id ? brut.id : nouvelIdentifiant(),
    nom: typeof brut.nom === 'string' && brut.nom.trim() ? brut.nom : nomRepertoire,
    affaire: typeof brut.affaire === 'string' ? brut.affaire : '',
    site,
    cree: estTrace(brut.cree) ? brut.cree : inconnue,
    modifie: estTrace(brut.modifie) ? brut.modifie : inconnue,
    outils,
  }
}

export function ecrireFiche(fiche: FicheDossier): string {
  // Indented: the card is small and meant to be readable outside the tools.
  return encoderTelQuel(fiche, 2) + '\n'
}

export function lireEnveloppe(texte: string, outil: string, nomFichier: string): Enveloppe {
  const brut = analyser(texte, nomFichier)
  if (brut.outil !== outil) throw new FichierIllisible(`${nomFichier} contient les données d'un autre outil (${String(brut.outil)}).`)
  return {
    application: APPLICATION,
    format: FORMAT,
    outil,
    version: typeof brut.version === 'number' ? brut.version : 1,
    revision: typeof brut.revision === 'number' ? brut.revision : 0,
    modifie: estTrace(brut.modifie) ? brut.modifie : { le: '', par: '' },
    donnees: brut.donnees,
  }
}

export function ecrireEnveloppe(e: Enveloppe): string {
  return encoder(e)
}

// ---- Names on disk ----------------------------------------------------------------------------

const RESERVES = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i

/**
 * A dossier name usable as a folder name on Windows and OneDrive: no
 * \ / : * ? " < > |, no trailing dot or space, no reserved device name.
 */
export function nomDeRepertoire(nom: string): string {
  let n = nom
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
  if (n.length > 120) n = n.slice(0, 120).trim()
  if (RESERVES.test(n)) n += '_'
  return n
}

/** The name itself if free, else "nom (2).ext", "nom (3).ext"… */
export function nomLibre(nom: string, pris: (n: string) => boolean): string {
  if (!pris(nom)) return nom
  const point = nom.lastIndexOf('.')
  const base = point > 0 ? nom.slice(0, point) : nom
  const ext = point > 0 ? nom.slice(point) : ''
  for (let i = 2; ; i++) {
    const candidat = `${base} (${i})${ext}`
    if (!pris(candidat)) return candidat
  }
}

export const nomFichierOutil = (outil: string) => `${outil}.json`

// ---- Display ----------------------------------------------------------------------------------

/** "à 14:32" today, "hier à 09:10", else "le 12/11/2026 à 16:05". */
export function quand(iso: string, maintenant = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const jour = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`
  if (jour(d) === jour(maintenant)) return `à ${heure}`
  const hier = new Date(maintenant)
  hier.setDate(hier.getDate() - 1)
  if (jour(d) === jour(hier)) return `hier à ${heure}`
  return `le ${d.toLocaleDateString('fr-FR')} à ${heure}`
}

/** "il y a 3 min" for a recent change, used to warn of a colleague at work. */
export function ilYa(iso: string, maintenant = new Date()): string {
  const min = Math.round((maintenant.getTime() - new Date(iso).getTime()) / 60_000)
  if (!Number.isFinite(min)) return ''
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  return quand(iso, maintenant)
}
