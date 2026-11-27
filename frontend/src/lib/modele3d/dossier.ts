/**
 * The other tools' work in the open dossier, read as sources of the model:
 * Logs de forage (boreholes, lithology, equipment, soil results attached to
 * the samples), Suivi temporel (every campaign, as grouped and corrected
 * there) and Résultats labo (one soil or groundwater campaign, with the
 * campaigns compared to it). Each tool's file is read as it is on disk,
 * without changing it.
 */

import type { Repertoire } from '../dossier/acces.ts'
import { lireTexte } from '../dossier/acces.ts'
import { lireEnveloppe, nomFichierOutil } from '../dossier/format.ts'
import type { Lecture } from '../resultats/parse.ts'
import type { Regime } from '../resultats/campagnes.ts'
import type { FicheTerrain, ParamTerrain } from '../nappe/fiches.ts'
import { convertir, lireNombre, volumeLitres } from '../resultats/calc.ts'
import { lireDate } from '../suivi/dates.ts'
import type { FichierLu } from '../suivi/import.ts'
import { nouvelId, type CampagneSaisie, type Corrections, type Lot, type Releve } from '../suivi/modele.ts'
import { cleSol, depuisLogsForage } from './logs.ts'
import type { LectureGaz, ParametreSol, Source, ValeurSol } from './types.ts'

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`

/** Suivi temporel's state (suivi-temporel.json). */
export function depuisSuiviTemporel(donnees: unknown): Source | null {
  const d = donnees as { fichiers?: FichierLu[]; campagnes?: CampagneSaisie[]; corrections?: Corrections } | null
  const fichiers = (d?.fichiers ?? []).filter((f) => f && Array.isArray(f.lots))
  if (!fichiers.length) return null
  const lots = fichiers.flatMap((f) => f.lots)
  const releves = fichiers.flatMap((f) => f.releves ?? [])
  const campagnes = (d?.campagnes ?? []).filter((c) => c.date)
  return {
    id: 'dossier:suivi-temporel',
    origine: 'dossier',
    outil: 'suivi-temporel',
    nom: 'Suivi temporel',
    resume: [pluriel(campagnes.length, 'campagne'), pluriel(fichiers.length, 'fichier'), releves.length ? pluriel(releves.length, 'relevé') : null].filter(Boolean).join(' · '),
    forages: [],
    parametresSol: [],
    sols: [],
    eaux: { lots, campagnes: d?.campagnes ?? [], releves, ouvrages: fichiers.flatMap((f) => f.ouvrages ?? []), corrections: d?.corrections ?? null },
    avertissements: [],
  }
}

interface EtatResultats {
  matrice?: 'eau' | 'sol' | 'air' | null
  lecture?: Lecture | null
  fichier?: string
  infoPrincipale?: { date?: string; regime?: Regime }
  autres?: { lecture: Lecture; fichier: string; date: string; regime: Regime }[]
  /** Conditions de la nappe: the groundwater sampling sheets read there. */
  etatNappe?: { fiches?: FicheTerrain[]; fichiersFiches?: string[] } | null
  /** Air and soil gas: "gaz du sol", "air intérieur"… */
  milieu?: string
  /** Air: sampling duration and flows entered (or read on the sheets), by sample. */
  saisies?: Record<string, { duree?: string; debitDebut?: string; debitFin?: string }>
}

/**
 * Soil gas of Résultats labo as concentrations (µg/m³): masses per support
 * converted with the sampled volume entered there (flow × duration, calc.ts),
 * concentrations given by the lab taken as they are. Measurement zone only.
 */
export function gazDeResultats(d: EtatResultats, nom: string): { gaz: LectureGaz; sansVolume: string[] } | null {
  const lecture = d.lecture
  if (!lecture) return null
  const concentration = lecture.mode === 'concentration'
  const parametres: ParametreSol[] = lecture.parametres.CM.map((p) => ({
    cle: cleSol(p.nom, p.cas, false),
    nom: p.nom,
    cas: p.cas,
    unite: concentration ? p.unite : 'µg/m³',
    famille: p.famille,
    eluat: false,
  }))
  const points: Record<string, Record<string, ValeurSol>> = {}
  const sansVolume: string[] = []
  for (const pt of lecture.points) {
    const s = d.saisies?.[pt.nom]
    const volume = concentration ? null : volumeLitres({ duree: lireNombre(s?.duree ?? ''), debitDebut: lireNombre(s?.debitDebut ?? ''), debitFin: lireNombre(s?.debitFin ?? '') })
    if (!concentration && !volume) {
      sansVolume.push(pt.nom)
      continue
    }
    const r: Record<string, ValeurSol> = {}
    lecture.parametres.CM.forEach((p, i) => {
      const m = lecture.valeurs.CM[pt.nom]?.[p.cle]
      if (!m || m.valeur === null) return
      if (concentration) r[parametres[i].cle] = { valeur: m.valeur, inferieur: m.inferieur, brut: m.brut }
      else {
        const c = convertir(m, p, volume, 'µg/m³')
        if (c) r[parametres[i].cle] = { valeur: c.valeur, inferieur: c.inferieur, brut: `${c.inferieur ? '<' : ''}${String(Number(c.valeur.toPrecision(3))).replace('.', ',')}` }
      }
    })
    points[pt.nom] = r
  }
  return { gaz: { fichier: nom, date: d.infoPrincipale?.date ?? '', parametres, points }, sansVolume }
}

/**
 * Water levels of the groundwater sampling sheets, as Suivi temporel reads
 * them (suivi/import.ts): static level below the measuring point, its
 * elevation, the head when the sheet gives it, end-of-purge readings. A
 * sheet without a readable date takes the campaign's date.
 */
export function relevesDesFiches(fiches: FicheTerrain[], dateCampagne: string, source: string): Releve[] {
  const releves: Releve[] = []
  for (const x of fiches) {
    if (x.vide) continue
    const date = lireDate(x.date) ?? dateCampagne
    if (!date) continue
    const terrain: Partial<Record<ParamTerrain, number>> = {}
    for (const [k, v] of Object.entries(x.finale ?? {}) as [ParamTerrain, { valeur: number } | undefined][]) if (v) terrain[k] = v.valeur
    releves.push({ ouvrage: x.ouvrage || x.onglet, date, profondeur: x.niveauStatique, charge: x.charge, terrain, repere: x.altitudeRepere, source })
  }
  return releves
}

/** Résultats labo's state (resultats-labo.json): soil results, or groundwater campaigns. */
export function depuisResultatsLabo(donnees: unknown): Source | null {
  const d = donnees as EtatResultats | null
  if (!d?.matrice || (!d.lecture && !d.etatNappe?.fiches?.length)) return null
  const nom = d.fichier || 'Résultats labo'
  if (d.matrice === 'sol' && d.lecture)
    return {
      id: 'dossier:resultats-labo',
      origine: 'dossier',
      outil: 'resultats-labo',
      nom: 'Résultats labo (sols)',
      resume: `${pluriel(d.lecture.points.length, 'échantillon')} de sol · ${nom}`,
      forages: [],
      parametresSol: [],
      sols: [{ fichier: nom, lecture: d.lecture, date: d.infoPrincipale?.date ?? '' }],
      eaux: null,
      avertissements: [],
    }
  if (d.matrice === 'air') {
    if (!/gaz/i.test(d.milieu ?? 'gaz du sol')) return null
    const g = gazDeResultats(d, nom)
    if (!g || !Object.keys(g.gaz.points).length) return null
    return {
      id: 'dossier:resultats-labo',
      origine: 'dossier',
      outil: 'resultats-labo',
      nom: 'Résultats labo (gaz du sol)',
      resume: `${pluriel(Object.keys(g.gaz.points).length, 'prélèvement')} de gaz du sol · ${nom}`,
      forages: [],
      parametresSol: [],
      sols: [],
      eaux: null,
      gaz: [g.gaz],
      avertissements: g.sansVolume.length ? [`volume prélevé inconnu (durée ou débit à saisir dans Résultats labo) : ${g.sansVolume.join(', ')}.`] : [],
    }
  }
  if (d.matrice !== 'eau') return null
  const campagnes = d.lecture ? [{ lecture: d.lecture, fichier: nom, date: d.infoPrincipale?.date ?? '', regime: d.infoPrincipale?.regime ?? null }, ...(d.autres ?? [])] : []
  const lots: Lot[] = campagnes.map((c) => ({ id: nouvelId('l'), fichier: c.fichier, lecture: c.lecture, date: c.date, origineDate: c.date ? 'saisie' : '', libelle: '', regime: c.regime }))
  const sansDate = lots.filter((l) => !l.date).length
  const fiches = d.etatNappe?.fiches ?? []
  const releves = relevesDesFiches(fiches, d.infoPrincipale?.date ?? '', 'Fiches de prélèvement (Résultats labo)')
  const fichesSansDate = fiches.filter((f) => !f.vide).length - releves.length
  return {
    id: 'dossier:resultats-labo',
    origine: 'dossier',
    outil: 'resultats-labo',
    nom: 'Résultats labo (eaux souterraines)',
    resume: [
      lots.length ? pluriel(lots.length, 'campagne') : null,
      d.lecture ? pluriel(d.lecture.points.length, 'échantillon') : null,
      releves.length ? `${pluriel(releves.length, 'fiche')} de prélèvement (${releves.filter((r) => r.profondeur !== null || r.charge !== null).length} niveau(x) d’eau)` : null,
    ]
      .filter(Boolean)
      .join(' · '),
    forages: [],
    parametresSol: [],
    sols: [],
    eaux: { lots, campagnes: [], releves, ouvrages: [], corrections: null },
    avertissements: [
      ...(sansDate ? ['date de campagne à saisir dans Résultats labo (une campagne sans date ne peut pas être placée dans le temps).'] : []),
      ...(fichesSansDate > 0 ? [`${pluriel(fichesSansDate, 'fiche')} de prélèvement sans date lisible ni date de campagne : niveaux non placés dans le temps.`] : []),
    ],
  }
}

const LECTEURS: { outil: 'logs-forage' | 'suivi-temporel' | 'resultats-labo'; lire: (d: unknown) => Source | null }[] = [
  { outil: 'logs-forage', lire: (d) => depuisLogsForage(d) },
  { outil: 'suivi-temporel', lire: depuisSuiviTemporel },
  { outil: 'resultats-labo', lire: depuisResultatsLabo },
]

export interface LectureDossier {
  sources: Source[]
  erreurs: string[]
  /** Files read and their last change: the same signature, nothing changed on disk. */
  signature: string
}

/** Every tool file of the dossier that can feed the model. */
export async function lireSourcesDossier(repertoire: Repertoire): Promise<LectureDossier> {
  const sources: Source[] = []
  const erreurs: string[] = []
  const signature: string[] = []
  for (const { outil, lire } of LECTEURS) {
    const nom = nomFichierOutil(outil)
    try {
      const lu = await lireTexte(repertoire, nom)
      if (!lu) continue
      signature.push(`${nom}:${lu.date}:${lu.texte.length}`)
      const s = lire(lireEnveloppe(lu.texte, outil, nom).donnees)
      if (s) sources.push(s)
    } catch (e) {
      erreurs.push(`${nom} : ${(e as Error).message}`)
    }
  }
  return { sources, erreurs, signature: signature.join('|') }
}
