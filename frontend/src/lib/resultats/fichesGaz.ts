/**
 * Reads soil gas sampling sheets ("Fiche de prélèvement de gaz du sol"),
 * one sampling point per tab, for the sampling duration and flow that turn
 * a mass per support into an air concentration.
 *
 * As for the groundwater sheets (`../nappe/fiches.ts`), nothing is tied to
 * fixed cells: each detail is found by its label ("Ouvrage :", "Débit
 * d'échantillonnage :"…), the value being the first filled cell to the
 * right, and the purge / sampling table by its header row (an "Étape" cell
 * next to a flow column).
 *
 * The sheet gives up to three durations — measured by ERM, shown on the
 * pump, and the start and end times — the set flow ("Débit
 * d'échantillonnage") and the pump flows read during the sampling step.
 * Which ones are retained is the user's choice (`retenir`); disagreements
 * between them are reported, since they change the volume.
 *
 * Pure: takes grids of raw cell values.
 */

import { associationAuto } from '../nappe/donnees.ts'
import { cleOuvrage } from '../nappe/fiches.ts'
import { cleOuvrage as cleCampagne } from './campagnes.ts'
import type { Cell } from './parse.ts'

export interface DebitReleve {
  heure: string
  debit: number
  /** Reading on the first row of the sampling step (start of sampling). */
  debut: boolean
}

export interface FicheGaz {
  onglet: string
  ouvrage: string
  /** ISO date, or the text as written. */
  date: string
  nature: string
  /** Start and end times, in minutes since midnight. */
  heureDebut: number | null
  heureFin: number | null
  /** Durations in minutes. */
  dureeErm: number | null
  dureePompe: number | null
  dureeHoraires: number | null
  /** "Débit d'échantillonnage" (L/min). */
  debitConsigne: number | null
  /** Pump flows read during the sampling step (L/min). */
  releves: DebitReleve[]
  /** "Volume échantillonné" written on the sheet (L). */
  volumeFiche: number | null
  support: string
  referenceSupport: string
  laboratoire: string
  /** Flows given in mL/min on the sheet, converted to L/min. */
  millilitres: boolean
}

export type SourceDuree = 'erm' | 'pompe' | 'horaires'
export type SourceDebit = 'releves' | 'consigne'

export const LIBELLES_DUREE: Record<SourceDuree, string> = {
  erm: 'Durée mesurée par ERM',
  pompe: 'Durée affichée sur la pompe',
  horaires: 'Horaires de début et de fin',
}

const COURTS_DUREE: Record<SourceDuree, string> = { erm: 'mesurée par ERM', pompe: 'pompe', horaires: 'horaires' }

export const LIBELLES_DEBIT: Record<SourceDebit, string> = {
  releves: 'Débits relevés en début et en fin d’échantillonnage',
  consigne: 'Débit d’échantillonnage seul',
}

function texte(c: Cell): string {
  if (c === null || c === undefined) return ''
  if (c instanceof Date) return c.toISOString().slice(0, 10)
  return String(c).replace(/\s+/g, ' ').trim()
}

const SANS_MESURE = /^(-|n\.?\s*[amd]\.?|nm|na|nd|\/|—|–|\?)$/i

/** A number, or the number a text begins with ("0,5 L/min", "15,06 L"). */
function nombre(c: Cell): number | null {
  if (typeof c === 'number') return Number.isFinite(c) ? c : null
  const t = texte(c)
  if (!t || SANS_MESURE.test(t)) return null
  const m = /^[-+]?\d+(?:[.,]\d+)?/.exec(t.replace(/\s/g, ''))
  return m ? Number(m[0].replace(',', '.')) : null
}

/** "15h08", "15:08", "8 h 56", or an Excel time (fraction of a day) → minutes. */
export function lireHeure(c: Cell): number | null {
  if (c instanceof Date) return c.getHours() * 60 + c.getMinutes()
  if (typeof c === 'number') {
    if (!Number.isFinite(c) || c < 0) return null
    const f = c % 1
    return c >= 1 && Number.isInteger(c) ? null : Math.round(f * 1440)
  }
  const m = /(\d{1,2})\s*[h:]\s*(\d{2})?/i.exec(texte(c))
  if (!m) return null
  const h = Number(m[1])
  const min = m[2] ? Number(m[2]) : 0
  return h < 24 && min < 60 ? h * 60 + min : null
}

/** "30", "30 min", "1h30", "0:30" (Excel time) → minutes. */
export function lireDuree(c: Cell): number | null {
  if (typeof c === 'number') {
    if (!Number.isFinite(c) || c <= 0) return null
    // A duration typed as a time ("0:30") is stored as a fraction of a day.
    return c < 1 ? Math.round(c * 1440 * 10) / 10 : c
  }
  const t = texte(c)
  const hm = /^(\d{1,2})\s*h\s*(\d{1,2})?/i.exec(t)
  if (hm) return Number(hm[1]) * 60 + (hm[2] ? Number(hm[2]) : 0)
  const n = nombre(c)
  return n !== null && n > 0 ? n : null
}

/** Excel serial date (1900 system) or Date → ISO date. */
function dateIso(c: Cell): string {
  if (c instanceof Date) {
    const d = new Date(c.getTime() - c.getTimezoneOffset() * 60000)
    return d.toISOString().slice(0, 10)
  }
  if (typeof c === 'number' && c > 20000 && c < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(c) * 86400000).toISOString().slice(0, 10)
  }
  return texte(c)
}

/** First filled cell right of the label matching `motif`, with the label. */
function apres(grille: Cell[][], motif: RegExp, portee = 6): { valeur: Cell; libelle: string } {
  for (const ligne of grille) {
    for (let j = 0; j < (ligne?.length ?? 0); j++) {
      const libelle = texte(ligne[j])
      if (!motif.test(libelle)) continue
      for (let k = j + 1; k < Math.min(ligne.length, j + 1 + portee); k++) {
        if (texte(ligne[k])) return { valeur: ligne[k], libelle }
      }
    }
  }
  return { valeur: null, libelle: '' }
}

const valeur = (grille: Cell[][], motif: RegExp, portee?: number) => apres(grille, motif, portee).valeur

const ML = /m\s*l\s*\/\s*min/i

/** The purge / sampling table: flows read during the sampling step. */
function lireReleves(grille: Cell[][]): { releves: DebitReleve[]; millilitres: boolean } | null {
  let h = -1
  let cEtape = -1
  let cDebit = -1
  for (let i = 0; i < grille.length && h < 0; i++) {
    const r = grille[i] ?? []
    const e = r.findIndex((c) => /^[ée]tapes?$/i.test(texte(c)))
    const d = r.findIndex((c) => /d[ée]bit/i.test(texte(c)))
    if (e >= 0 && d >= 0) {
      h = i
      cEtape = e
      cDebit = d
    }
  }
  if (h < 0) return null
  const entete = grille[h]
  const cHeure = entete.findIndex((c) => /^heures?\b/i.test(texte(c)))
  const cRemarque = entete.findIndex((c) => /remarque|observation/i.test(texte(c)))
  const millilitres = ML.test(texte(entete[cDebit]))

  const releves: DebitReleve[] = []
  let etape = ''
  let premiere = -1
  let fini = false
  for (let i = h + 1; i < grille.length && !fini; i++) {
    const r = grille[i] ?? []
    const e = texte(r[cEtape])
    // The table ends where the next block of the sheet starts.
    if (/:\s*$|photo|analyses|laboratoire/i.test(e)) break
    if (e) etape = e
    const remarque = cRemarque >= 0 ? texte(r[cRemarque]) : ''
    const echantillonnage =
      (/[ée]chantillonnage|pr[ée]l[èe]vement/i.test(etape) && !/avant|purge/i.test(etape)) ||
      /d[ée]but d.?[ée]chantillonnage/i.test(remarque)
    if (!echantillonnage) continue
    if (premiere < 0) premiere = i
    const brut = nombre(r[cDebit])
    if (brut !== null && brut > 0) {
      releves.push({ heure: cHeure >= 0 ? texte(r[cHeure]) : '', debit: millilitres ? brut / 1000 : brut, debut: i === premiere })
    }
    if (/fin d.?[ée]chantillonnage/i.test(remarque)) fini = true
  }
  return { releves, millilitres }
}

export function lireFicheGaz(grille: Cell[][], onglet: string): FicheGaz | null {
  const titre = grille.slice(0, 5).flat().map(texte).join(' ')
  const debit = apres(grille, /d[ée]bit d.?[ée]chantillonnage/i)
  const table = lireReleves(grille)
  // A soil gas or air sampling sheet: its title, or a sampling flow.
  if (!/gaz|air|vapeur/i.test(titre) && debit.valeur === null && !table?.releves.length) return null

  const millilitresConsigne = ML.test(debit.libelle) || ML.test(texte(debit.valeur))
  const consigne = nombre(debit.valeur)
  const heureDebut = lireHeure(valeur(grille, /horaire de d[ée]but|heure de d[ée]but|d[ée]but (du |de l.)?(pr[ée]l[èe]vement|[ée]chantillonnage)\s*:/i))
  const heureFin = lireHeure(valeur(grille, /horaire de fin|heure de fin|fin (du |de l.)?(pr[ée]l[èe]vement|[ée]chantillonnage)\s*:/i))
  const dureeHoraires = heureDebut !== null && heureFin !== null ? (heureFin - heureDebut + 1440) % 1440 || null : null
  const nomCellule = texte(valeur(grille, /^(ouvrage|point de pr[ée]l[èe]vement|point|piézair|piezair)\s*:?$/i))

  return {
    onglet,
    ouvrage: nomCellule || onglet.trim(),
    date: dateIso(valeur(grille, /^date\s*:?$/i)),
    nature: texte(valeur(grille, /nature de l.ouvrage/i)),
    heureDebut,
    heureFin,
    dureeErm: lireDuree(valeur(grille, /dur[ée]e.*mesur[ée]e/i, 4)),
    dureePompe: lireDuree(valeur(grille, /dur[ée]e.*(affich|pompe)/i, 4)),
    dureeHoraires,
    debitConsigne: consigne === null || consigne <= 0 ? null : millilitresConsigne ? consigne / 1000 : consigne,
    releves: table?.releves ?? [],
    volumeFiche: nombre(valeur(grille, /volume ([ée]chantillonn|pr[ée]lev)/i, 4)),
    support: texte(valeur(grille, /type de support/i)),
    referenceSupport: texte(valeur(grille, /r[ée]f[ée]rence du support/i)),
    laboratoire: texte(valeur(grille, /nom du laboratoire/i)),
    millilitres: millilitresConsigne || !!table?.millilitres,
  }
}

export interface LectureFichesGaz {
  fiches: FicheGaz[]
  /** Tabs that are not sampling sheets. */
  ignores: string[]
}

export function lireFichesGaz(feuilles: { nom: string; grille: Cell[][] }[]): LectureFichesGaz {
  const fiches: FicheGaz[] = []
  const ignores: string[] = []
  for (const f of feuilles) {
    const fiche = lireFicheGaz(f.grille, f.nom)
    if (fiche) fiches.push(fiche)
    else ignores.push(f.nom)
  }
  return { fiches, ignores }
}

export interface Retenu {
  duree: number | null
  sourceDuree: SourceDuree | null
  debitDebut: number | null
  debitFin: number | null
  /** Where each flow comes from, as shown to the user. */
  origineDebits: string
  volume: number | null
  alertes: string[]
}

const ORDRE_DUREES: SourceDuree[] = ['erm', 'pompe', 'horaires']

export function dureeSelon(f: FicheGaz, s: SourceDuree): number | null {
  return s === 'erm' ? f.dureeErm : s === 'pompe' ? f.dureePompe : f.dureeHoraires
}

const fr = (x: number, chiffres = 3) => x.toLocaleString('fr-FR', { maximumFractionDigits: chiffres })

/**
 * Duration and flows retained for one sheet. The chosen duration, else the
 * first one given in the order ERM, pump, times. Flows: those read at the
 * start and end of the sampling step (the set flow standing for an unread
 * start), or the set flow alone.
 */
export function retenir(f: FicheGaz, sourceDuree: SourceDuree, sourceDebit: SourceDebit): Retenu {
  const alertes: string[] = []
  const ordre = [sourceDuree, ...ORDRE_DUREES.filter((s) => s !== sourceDuree)]
  const source = ordre.find((s) => dureeSelon(f, s) !== null) ?? null
  const duree = source ? dureeSelon(f, source) : null
  if (source && source !== sourceDuree) alertes.push(`${LIBELLES_DUREE[sourceDuree]} non renseignée : ${LIBELLES_DUREE[source].toLowerCase()} retenue`)
  if (duree === null) alertes.push('Aucune durée d’échantillonnage sur la fiche')

  const durees = ORDRE_DUREES.map((s) => ({ s, d: dureeSelon(f, s) })).filter((x): x is { s: SourceDuree; d: number } => x.d !== null)
  if (durees.length > 1) {
    const min = Math.min(...durees.map((x) => x.d))
    const max = Math.max(...durees.map((x) => x.d))
    if (max - min > 2) {
      alertes.push(`Durées discordantes : ${durees.map((x) => `${fr(x.d, 1)} min (${COURTS_DUREE[x.s]})`).join(', ')}`)
    }
  }

  let debitDebut: number | null = null
  let debitFin: number | null = null
  let origineDebits = ''
  const releves = f.releves
  if (sourceDebit === 'releves' && releves.length) {
    const premier = releves[0].debut ? releves[0] : null
    const dernier = releves[releves.length - 1]
    debitDebut = premier?.debit ?? f.debitConsigne
    debitFin = dernier === premier ? null : dernier.debit
    origineDebits = [
      premier ? 'début relevé' : f.debitConsigne !== null ? 'début : débit d’échantillonnage' : '',
      debitFin !== null ? 'fin relevée' : '',
    ]
      .filter(Boolean)
      .join(', ')
  } else {
    debitDebut = f.debitConsigne ?? releves[0]?.debit ?? null
    origineDebits = f.debitConsigne !== null ? 'débit d’échantillonnage' : debitDebut !== null ? 'premier débit relevé' : ''
  }
  if (sourceDebit === 'releves' && f.debitConsigne !== null && !releves.some((r) => !r.debut)) {
    alertes.push('Débit de fin d’échantillonnage non relevé : débit d’échantillonnage seul retenu')
  }
  if (debitDebut === null && debitFin === null) alertes.push('Aucun débit d’échantillonnage sur la fiche')
  if (debitDebut !== null && debitFin !== null && Math.abs(debitFin - debitDebut) / debitDebut > 0.1) {
    alertes.push(`Débit en fin d’échantillonnage écarté de plus de 10 % du débit de début (${fr(debitDebut)} → ${fr(debitFin)} L/min)`)
  }
  for (const d of [debitDebut, debitFin]) {
    if (d !== null && (d > 5 || d < 0.005)) {
      alertes.push(`Débit inhabituel (${fr(d)} L/min) : vérifier l’unité sur la fiche`)
      break
    }
  }

  const debits = [debitDebut, debitFin].filter((d): d is number => d !== null)
  const volume = duree !== null && debits.length ? (debits.reduce((a, b) => a + b, 0) / debits.length) * duree : null
  if (volume !== null && f.volumeFiche !== null && f.volumeFiche > 0 && Math.abs(volume - f.volumeFiche) / f.volumeFiche > 0.05) {
    alertes.push(`Volume calculé (${fr(volume, 1)} L) écarté de plus de 5 % du volume noté sur la fiche (${fr(f.volumeFiche, 1)} L)`)
  }
  return { duree, sourceDuree: source, debitDebut, debitFin, origineDebits, volume, alertes }
}

/** Sampling dates of the sheets, for the table's subtitle: "le 27/10/2026",
 *  "les 27 et 28/10/2026", "du 27/10/2026 au 03/11/2026". */
export function libelleDates(fiches: FicheGaz[]): string {
  const dates = [...new Set(fiches.map((f) => f.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort()
  if (!dates.length) return ''
  const enFr = (d: string) => d.split('-').reverse().join('/')
  if (dates.length === 1) return `le ${enFr(dates[0])}`
  const memeMois = dates.every((d) => d.slice(0, 7) === dates[0].slice(0, 7))
  if (memeMois && dates.length <= 4) {
    const jours = dates.map((d) => d.slice(8))
    return `les ${jours.slice(0, -1).join(', ')} et ${enFr(dates[dates.length - 1])}`
  }
  return `du ${enFr(dates[0])} au ${enFr(dates[dates.length - 1])}`
}

/** Index of the sheet a lab sample comes from, matched by name as the
 *  groundwater sheets are ("VP66" ≠ "VP66bis"); -1 when none. */
export function ficheDe(nomEchantillon: string, fiches: FicheGaz[]): number {
  const cle = associationAuto(nomEchantillon, fiches)
  const i = fiches.findIndex((f) => cleOuvrage(f.ouvrage) === cle)
  if (i >= 0) return i
  // "VP-019" ≈ "VP19": the looser key of the campaigns.
  const large = cleCampagne(nomEchantillon)
  return fiches.findIndex((f) => cleCampagne(f.ouvrage) === large)
}
