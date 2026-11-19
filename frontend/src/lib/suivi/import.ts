/**
 * Files dropped on the page, recognised by their content: a history table
 * (or a previous export of this tool), groundwater sampling sheets, or a
 * lab report. Runs in the browser (SheetJS reads the workbook).
 */

import { lireFeuilles } from '../fichiers.ts'
import { lireFiches, type ParamTerrain } from '../nappe/fiches.ts'
import { LectureImpossible, lireClasseur } from '../resultats/parse.ts'
import { dateCampagne, dateDepuisNom, datesPrelevement, lireDate } from './dates.ts'
import { lireHistorique, lotsHistorique, type OuvrageHistorique } from './historique.ts'
import { nouvelId, type Lot, type Releve } from './modele.ts'

export type TypeFichier = 'labo' | 'historique' | 'fiches'

export interface FichierLu {
  id: string
  nom: string
  type: TypeFichier
  lots: Lot[]
  releves: Releve[]
  ouvrages: OuvrageHistorique[]
  /** One line telling what was read. */
  resume: string
  avertissements: string[]
}


const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`
const niveaux = (n: number) => `${n} niveau${n > 1 ? 'x' : ''} d'eau`

export async function lireFichier(f: File): Promise<FichierLu> {
  const feuilles = await lireFeuilles(f)
  const id = nouvelId('f')

  // 1. History table (or an export of this tool).
  const h = lireHistorique(feuilles)
  if (h && (h.lignes.length || h.niveaux.length || h.ouvrages.length)) {
    const lots: Lot[] = lotsHistorique(h).map((l) => ({
      id: nouvelId('l'),
      fichier: f.name,
      lecture: l.lecture,
      date: l.date,
      origineDate: 'historique',
      libelle: l.libelle,
      regime: l.regime,
    }))
    const releves: Releve[] = h.niveaux.map((n) => ({ ouvrage: n.ouvrage, date: n.date, profondeur: n.profondeur, charge: n.charge, terrain: {}, source: f.name }))
    const avertissements = h.ignorees ? [`${pluriel(h.ignorees, 'ligne')} sans ouvrage, date, paramètre ou résultat lisible, non reprise${h.ignorees > 1 ? 's' : ''}.`] : []
    return {
      id,
      nom: f.name,
      type: 'historique',
      lots,
      releves,
      ouvrages: h.ouvrages,
      resume: [
        h.lignes.length ? `${pluriel(h.lignes.length, 'résultat')} sur ${pluriel(lots.length, 'campagne')}` : null,
        h.niveaux.length ? niveaux(h.niveaux.length) : null,
        h.ouvrages.length ? `${pluriel(h.ouvrages.length, 'ouvrage')} décrit${h.ouvrages.length > 1 ? 's' : ''}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      avertissements,
    }
  }

  // 2. Groundwater sampling sheets: date, water level and field readings of each well.
  const fiches = lireFiches(feuilles).fiches.filter((x) => !x.vide)
  if (fiches.length) {
    const releves: Releve[] = []
    const sansDate: string[] = []
    for (const x of fiches) {
      const date = lireDate(x.date) ?? ''
      if (!date) {
        sansDate.push(x.ouvrage || x.onglet)
        continue
      }
      const terrain: Partial<Record<ParamTerrain, number>> = {}
      for (const [k, v] of Object.entries(x.finale) as [ParamTerrain, { valeur: number } | undefined][]) if (v) terrain[k] = v.valeur
      releves.push({ ouvrage: x.ouvrage || x.onglet, date, profondeur: x.niveauStatique, charge: x.charge, terrain, repere: x.altitudeRepere, source: f.name })
    }
    return {
      id,
      nom: f.name,
      type: 'fiches',
      lots: [],
      releves,
      ouvrages: [],
      resume: `${pluriel(fiches.length, 'fiche')} de prélèvement · ${niveaux(releves.filter((r) => r.profondeur !== null || r.charge !== null).length)}`,
      avertissements: sansDate.length ? [`Fiche${sansDate.length > 1 ? 's' : ''} sans date lisible : ${sansDate.join(', ')}.`] : [],
    }
  }

  // 3. Lab report.
  let lecture
  try {
    lecture = lireClasseur(feuilles, 'tout')
  } catch (e) {
    if (e instanceof LectureImpossible) throw new LectureImpossible(`« ${f.name} » : ${e.message}`)
    throw e
  }
  const avertissements: string[] = []
  if (/\/\s*kg/i.test(lecture.unites.join(' '))) avertissements.push('Ce fichier contient des unités en /kg : il semble s’agir de résultats sur sols.')
  const { parEchantillon, toutes } = datesPrelevement(feuilles, lecture)
  const datesRapport = Object.values(parEchantillon).length ? Object.values(parEchantillon) : toutes
  let date = dateCampagne(datesRapport)
  let origineDate: Lot['origineDate'] = date ? 'rapport' : ''
  if (!date) {
    const d = dateDepuisNom(f.name)
    if (d) {
      date = d
      origineDate = 'fichier'
    }
  }
  const distinctes = [...new Set(datesRapport)].sort()
  if (distinctes.length > 1) {
    const etendue = (Date.parse(distinctes[distinctes.length - 1]) - Date.parse(distinctes[0])) / 86400000
    if (etendue > 20) avertissements.push(`Prélèvements étalés sur ${Math.round(etendue)} jours (${distinctes[0]} → ${distinctes[distinctes.length - 1]}) : vérifiez qu'il s'agit d'une seule campagne.`)
  }
  return {
    id,
    nom: f.name,
    type: 'labo',
    lots: [{ id: nouvelId('l'), fichier: f.name, lecture, date, origineDate, libelle: '', regime: null }],
    releves: [],
    ouvrages: [],
    resume: `${pluriel(lecture.points.length, 'échantillon')} · ${pluriel(lecture.parametres.CM.length, 'paramètre')}`,
    avertissements,
  }
}
