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
import type { FichierLu } from '../suivi/import.ts'
import { nouvelId, type CampagneSaisie, type Corrections, type Lot } from '../suivi/modele.ts'
import { depuisLogsForage } from './logs.ts'
import type { Source } from './types.ts'

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
}

/** Résultats labo's state (resultats-labo.json): soil results, or groundwater campaigns. */
export function depuisResultatsLabo(donnees: unknown): Source | null {
  const d = donnees as EtatResultats | null
  if (!d?.lecture || !d.matrice) return null
  const nom = d.fichier || 'Résultats labo'
  if (d.matrice === 'sol')
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
  if (d.matrice !== 'eau') return null
  const campagnes = [{ lecture: d.lecture, fichier: nom, date: d.infoPrincipale?.date ?? '', regime: d.infoPrincipale?.regime ?? null }, ...(d.autres ?? [])]
  const lots: Lot[] = campagnes.map((c) => ({ id: nouvelId('l'), fichier: c.fichier, lecture: c.lecture, date: c.date, origineDate: c.date ? 'saisie' : '', libelle: '', regime: c.regime }))
  const sansDate = lots.filter((l) => !l.date).length
  return {
    id: 'dossier:resultats-labo',
    origine: 'dossier',
    outil: 'resultats-labo',
    nom: 'Résultats labo (eaux souterraines)',
    resume: `${pluriel(lots.length, 'campagne')} · ${pluriel(d.lecture.points.length, 'échantillon')}`,
    forages: [],
    parametresSol: [],
    sols: [],
    eaux: { lots, campagnes: [], releves: [], ouvrages: [], corrections: null },
    avertissements: sansDate ? ['date de campagne à saisir dans Résultats labo (une campagne sans date ne peut pas être placée dans le temps).'] : [],
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
