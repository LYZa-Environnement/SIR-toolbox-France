import { useMemo, useRef, useState, type ClipboardEvent, type ReactNode } from 'react'
import { convertir, debitMoyen, formatConcentration, lireNombre, volumeLitres, type Prelevement, type UniteSortie } from '../lib/resultats/calc'
import { AnalyseApercu, ControleQualite, ExempleConversion } from '../components/ControleQualite'
import { telechargerClasseur } from '../lib/resultats/export'
import { estControle, qualifierAuto, type Qualification } from '../lib/resultats/qualite'
import { ajouterSommesCalculees } from '../lib/resultats/sommes'
import { fusionnerLectures } from '../lib/resultats/fusion'
import { ordonnerCOHV } from '../lib/resultats/cohv'
import { SignaturesApercu } from '../components/Signatures'
import { FichesGaz } from '../components/FichesGaz'
import { lireClasseurs, type EtatFichesGaz } from '../lib/resultats/lireFichesGaz'
import { QualiteGaz } from '../components/QualiteGaz'
import { CarteResultats } from '../components/resultats/CarteResultats'
import { NuageGaz } from '../components/resultats/NuageGaz'
import { FamillesOuvrages } from '../components/resultats/FamillesOuvrages'
import { ProfilHydraulique } from '../components/resultats/ProfilHydraulique'
import type { OuvrageHydro } from '../lib/resultats/hydraulique'
import type { Mesure as MesureFamille, Variable as VariableFamille } from '../lib/resultats/familles'
import { Tuile, Volet, type TeinteVolet } from '../components/resultats/Volet'
import { EnTete } from '../components/Tri'
import { useTri } from '../lib/tri'
import { lireFeuilles } from '../lib/fichiers'
import ZoneDepot from '../components/ZoneDepot'
import { acronyme } from '../lib/resultats/acronymes'
import { resumer } from '../lib/resultats/resume'
import { controleBlancs, controleDoublons, controlePercee } from '../lib/resultats/qualite'
import { LIBELLES_ETAT } from '../lib/nappe/synthese'
import { ConditionsNappe } from '../components/nappe/ConditionsNappe'
import type { Rapport as RapportNappe } from '../lib/nappe/export'
import { ficheDe, libelleDates, retenir, type FicheGaz, type SourceDebit, type SourceDuree } from '../lib/resultats/fichesGaz'
import { evaluerQualite, REFERENCES_QUALITE, syntheseQualite } from '../lib/resultats/qualiteGaz'
import { PositionsHydrauliques } from '../components/PositionsHydrauliques'
import { Campagnes, type AutreCampagne, type InfoCampagne } from '../components/Campagnes'
import { associer, composes, type Campagne, type Ouvrage } from '../lib/resultats/campagnes'
import { positionsAuto, type Position } from '../lib/resultats/expert/amontAval'
import { libelleProfondeur, lireProfondeur, ordonnerParProfondeur } from '../lib/resultats/expert/profondeur'
import {
  legendeGuides,
  valeurGuideEn,
  type ContexteMetaux,
  type Matrice,
  type OptionsGuides,
  type Repere,
} from '../lib/resultats/guides'
import { LectureImpossible, lireClasseur, type Couche, type Lecture, type Parametre } from '../lib/resultats/parse'

type Champ = 'duree' | 'debitDebut' | 'debitFin'
type Saisie = Record<Champ, string>
type MilieuAir = 'gaz du sol' | 'air ambiant' | 'air intérieur'

const MATRICES: { id: Matrice; titre: string; detail: string }[] = [
  { id: 'eau', titre: 'Eaux souterraines', detail: 'Résultats en µg/l, mg/l… comparés aux valeurs ERM eaux souterraines' },
  { id: 'sol', titre: 'Sols', detail: 'Résultats en mg/kg MS comparés aux valeurs ERM sols (bruit de fond, note interministérielle, ISDI)' },
  {
    id: 'air',
    titre: 'Gaz du sol / air',
    detail:
      'Tubes (µg/support, convertis en concentrations), ou résultats déjà en µg/m³ (canisters, Radiello…) repris tels quels ; comparés aux valeurs repères R1, R2, R3',
  },
]


const CHAMPS: { champ: Champ; libelle: string; aide: string }[] = [
  { champ: 'duree', libelle: 'Durée (min)', aide: 'Temps de prélèvement' },
  { champ: 'debitDebut', libelle: 'Débit début (L/min)', aide: 'Débit mesuré en début de prélèvement' },
  { champ: 'debitFin', libelle: 'Débit fin (L/min)', aide: 'Optionnel : le débit retenu est alors la moyenne début / fin' },
]

const vide: Saisie = { duree: '', debitDebut: '', debitFin: '' }

const SOUS_TITRE_DEFAUT = 'Echantillons prélevés par ERM le '

const enTexte = (x: number | null) => (x === null ? '' : String(Math.round(x * 1e6) / 1e6).replace('.', ','))

/** Duration and flows read on the sampling sheets, as entries of the
 *  sampling table — for the samples matched to a sheet. */
function saisiesFiches(
  noms: string[],
  fiches: FicheGaz[],
  manuelle: Record<string, number>,
  sourceDuree: SourceDuree,
  sourceDebit: SourceDebit,
): Record<string, Saisie> {
  const suite: Record<string, Saisie> = {}
  for (const nom of noms) {
    const i = manuelle[nom] ?? ficheDe(nom, fiches)
    if (i < 0 || !fiches[i]) continue
    const r = retenir(fiches[i], sourceDuree, sourceDebit)
    suite[nom] = { duree: enTexte(r.duree), debitDebut: enTexte(r.debitDebut), debitFin: enTexte(r.debitFin) }
  }
  return suite
}

/** Usual values for soils, given as examples only (mg/kg MS). */
function exempleFamille(famille: string): string | null {
  if (/halog|cohv/i.test(famille)) return 'ex. 0,25 (usage sensible) / 1 (usage non sensible)'
  if (/aromatiques volatils|\bcav\b|btex/i.test(famille)) return 'ex. benzène 0,25 (usage sensible) / 1 (usage non sensible)'
  if (/polycycl|\bhap\b/i.test(famille)) return 'ex. naphtalène 5 (usage sensible) / 10 (usage non sensible)'
  return null
}
const SANS_PRELEVEMENT: Prelevement = { duree: null, debitDebut: null, debitFin: null }

function versPrelevement(s: Saisie | undefined): Prelevement {
  return { duree: lireNombre(s?.duree ?? ''), debitDebut: lireNombre(s?.debitDebut ?? ''), debitFin: lireNombre(s?.debitFin ?? '') }
}

/** Lab values as French readers expect them: "0.69" → "0,69". */
const virgule = (brut: string) => brut.replace('.', ',')

const fr = (x: number, chiffres: number) => x.toLocaleString('fr-FR', { maximumFractionDigits: chiffres })

function libelleMatrice(m: Matrice, milieu: MilieuAir): string {
  return m === 'eau' ? 'eaux souterraines' : m === 'sol' ? 'sols' : milieu
}

function dansLa(libelle: string): string {
  return libelle.startsWith('air') ? `l'${libelle}` : `les ${libelle}`
}

/** A lab file as read, before the processing done on the whole campaign
 *  (computed sums, ordering) — so that two files can be merged first. */
async function lireBrut(fichier: File, matrice: Matrice): Promise<Lecture> {
  const feuilles = await lireFeuilles(fichier)
  if (matrice !== 'air') return lireClasseur(feuilles, 'tout')
  const essayer = (mode: 'support' | 'concentration') => {
    try {
      return lireClasseur(feuilles, mode)
    } catch (e) {
      if (!(e instanceof LectureImpossible)) throw e
      return null
    }
  }
  // Concentrations the lab already gives (canisters, bags, passive samplers
  // such as Radiello, where the lab applies the uptake rate) are taken as
  // they are, with no conversion — even when the report also lists the
  // mass on each tube. Masses per support are converted only when the lab
  // gives no concentration for the compounds.
  const support = essayer('support')
  const concentration = essayer('concentration')
  const lecture =
    concentration && (!support || concentration.parametres.CM.length >= support.parametres.CM.length) ? concentration : support
  return lecture ?? lireClasseur(feuilles, 'support')
}

function finaliser(brute: Lecture, matrice: Matrice): Lecture {
  const lecture = ordonnerCOHV(brute)
  if (matrice === 'eau') return ajouterSommesCalculees(lecture)
  return matrice === 'sol' ? ordonnerParProfondeur(lecture) : lecture
}

/** A file whose units belong to another matrix is most likely a wrong pick. */
function avertissementMatrice(matrice: Matrice, l: Lecture): string | null {
  const u = l.unites.join(' ').toLowerCase()
  if (matrice === 'eau' && /\/\s*kg/.test(u)) return 'Ce fichier contient des unités en /kg : il semble s’agir de résultats sur sols.'
  if (matrice === 'sol' && /\/\s*l\b/.test(u) && !/\/\s*kg/.test(u)) return 'Ce fichier contient des unités en /l : il semble s’agir de résultats sur eaux.'
  return null
}

export default function ResultatsLabo() {
  const [matrice, setMatrice] = useState<Matrice | null>(null)
  const [milieu, setMilieu] = useState<MilieuAir>('gaz du sol')
  const [lecture, setLecture] = useState<Lecture | null>(null)
  const [fichier, setFichier] = useState('')
  /** The campaign's lab files, as read: one or more, merged into `lecture`. */
  const [fichiers, setFichiers] = useState<{ nom: string; lecture: Lecture }[]>([])
  const [notesFusion, setNotesFusion] = useState<string[]>([])
  const inputAjout = useRef<HTMLInputElement>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [chargement, setChargement] = useState(false)
  const [saisies, setSaisies] = useState<Record<string, Saisie>>({})
  const [selection, setSelection] = useState<Record<string, boolean>>({})
  const [exclus, setExclus] = useState<Record<string, boolean>>({})
  const [aAppliquer, setAAppliquer] = useState<Saisie>(vide)
  const [unite, setUnite] = useState<UniteSortie>('µg/m³')
  const [metaux, setMetaux] = useState<ContexteMetaux>('sur site')
  const [repere, setRepere] = useState<Repere>('r1')
  /** Groundwater: what the sampling sheets and the lab tell of the aquifer. */
  const [rapportNappe, setRapportNappe] = useState<RapportNappe | null>(null)
  /** No reference values at all: the table without comparison. */
  const [sansReference, setSansReference] = useState(false)
  const [surcharges, setSurcharges] = useState<Record<string, string>>({})
  const [parFamille, setParFamille] = useState<Record<string, string>>({})
  const [qualifications, setQualifications] = useState<Record<string, Qualification>>({})
  const [seuilDoublon, setSeuilDoublon] = useState(30)
  const [positions, setPositions] = useState<Record<string, Position>>({})
  const [positionsDetectees, setPositionsDetectees] = useState<Record<string, Position>>({})
  const [facteurAmontAval, setFacteurAmontAval] = useState(2)
  const [infoPrincipale, setInfoPrincipale] = useState<InfoCampagne>({ date: '', regime: null })
  const [autres, setAutres] = useState<AutreCampagne[]>([])
  /** Wells matched by hand; null: matched by name. */
  const [ouvragesManuels, setOuvragesManuels] = useState<Ouvrage[] | null>(null)
  const [facteurEvolution, setFacteurEvolution] = useState(2)
  const [titre, setTitre] = useState('')
  const [sousTitre, setSousTitre] = useState(SOUS_TITRE_DEFAUT)
  /** Soil gas sampling sheets, and the samples matched to them by hand. */
  const [fichesGaz, setFichesGaz] = useState<EtatFichesGaz | null>(null)
  const [assocManuelle, setAssocManuelle] = useState<Record<string, number>>({})
  const [sourceDuree, setSourceDuree] = useState<SourceDuree>('erm')
  const [sourceDebit, setSourceDebit] = useState<SourceDebit>('releves')
  const [coucheApercu, setCoucheApercu] = useState<Couche>('CM')
  const [export_, setExport] = useState<'standard' | 'expert' | null>(null)

  // Conversion only for masses per support: concentrations given by the lab
  // (canisters, Radiello…) are used as they are.
  const conversion = matrice === 'air' && lecture?.mode !== 'concentration'
  const libelle = matrice ? libelleMatrice(matrice, milieu) : ''
  const titreParDefaut = `Tableau X - Résultats dans ${dansLa(libelle)}`
  const options: OptionsGuides = { metaux, repere }

  function choisirMatrice(m: Matrice) {
    if (m === matrice) return
    setMatrice(m)
    setLecture(null)
    setFichier('')
    setFichiers([])
    setNotesFusion([])
    setErreur(null)
    setSurcharges({})
    setParFamille({})
  }

  /** Reads each file; those that cannot be read are reported, the others kept. */
  async function lireTous(fs: File[], m: Matrice): Promise<{ lus: { nom: string; lecture: Lecture }[]; erreurs: string[]; derniere: unknown }> {
    const lus: { nom: string; lecture: Lecture }[] = []
    const erreurs: string[] = []
    let derniere: unknown = null
    for (const f of fs) {
      try {
        lus.push({ nom: f.name, lecture: await lireBrut(f, m) })
      } catch (e) {
        derniere = e
        erreurs.push(messageLecture(f, e))
      }
    }
    return { lus, erreurs, derniere }
  }

  /** The campaign's lab files — one, or several chosen together. */
  async function charger(fs: File[]) {
    if (!fs.length || !matrice) return
    setChargement(true)
    setErreur(null)
    try {
      const { lus, erreurs, derniere } = await lireTous(fs, matrice)
      if (!lus.length) {
        if (fs.length === 1) throw derniere
        throw new LectureImpossible(erreurs.join(' '))
      }
      const { lecture: brute, notes } = lus.length > 1 ? fusionnerLectures(lus) : { lecture: lus[0].lecture, notes: [] as string[] }
      const l = finaliser(brute, matrice)
      setLecture(l)
      setFichier(lus.map((x) => x.nom).join(' + '))
      setFichiers(lus)
      setNotesFusion(notes)
      if (erreurs.length) setErreur(`Fichier${erreurs.length > 1 ? 's' : ''} non lu${erreurs.length > 1 ? 's' : ''} : ${erreurs.join(' ')}`)
      setAssocManuelle({})
      setSaisies(fichesGaz ? saisiesFiches(l.points.map((p) => p.nom), fichesGaz.fiches, {}, sourceDuree, sourceDebit) : {})
      setSelection({})
      setExclus({})
      setAAppliquer(vide)
      setSurcharges({})
      setParFamille({})
      setQualifications(qualifierAuto(l.points))
      const detectees = positionsAuto(l.points)
      setPositions(detectees)
      setPositionsDetectees(detectees)
      setSeuilDoublon(matrice === 'sol' ? 50 : 30)
      setCoucheApercu('CM')
      setOuvragesManuels(null)
    } catch (e) {
      setLecture(null)
      setFichiers([])
      setErreur(
        e instanceof LectureImpossible
          ? `${e.message}${matrice === 'air' ? ' Pour des eaux ou des sols, choisissez la matrice correspondante.' : ''} Si ce fichier vient bien d'un laboratoire, transmettez-le pour que son format soit pris en charge.`
          : "Le fichier n'a pas pu être lu. Vérifiez qu'il s'agit d'un classeur Excel (.xlsx, .xls) ou d'un CSV.",
      )
    } finally {
      setChargement(false)
    }
  }

  /** Several files of one campaign in one table. What was entered for the
   *  samples already there (sampling, qualification, position) is kept. */
  function reunir(liste: { nom: string; lecture: Lecture }[]) {
    if (!matrice) return
    const { lecture: fusion, notes } = fusionnerLectures(liste)
    const l = finaliser(fusion, matrice)
    setFichiers(liste)
    setLecture(l)
    setFichier(liste.map((x) => x.nom).join(' + '))
    setNotesFusion(notes)
    if (fichesGaz) {
      const remplis = saisiesFiches(l.points.map((p) => p.nom), fichesGaz.fiches, assocManuelle, sourceDuree, sourceDebit)
      setSaisies((s) => ({ ...remplis, ...s }))
    }
    setQualifications((q) => ({ ...qualifierAuto(l.points), ...q }))
    const detectees = positionsAuto(l.points)
    setPositions((p) => ({ ...detectees, ...p }))
    setPositionsDetectees(detectees)
    setOuvragesManuels(null)
  }

  const messageLecture = (f: File, e: unknown) =>
    e instanceof LectureImpossible
      ? `${f.name} : ${e.message}`
      : `${f.name} n'a pas pu être lu. Vérifiez qu'il s'agit d'un classeur Excel (.xlsx, .xls) ou d'un CSV.`

  async function ajouterFichier(fs: File[]) {
    if (!fs.length || !matrice) return
    setChargement(true)
    setErreur(null)
    try {
      const { lus, erreurs } = await lireTous(fs, matrice)
      if (lus.length) reunir([...fichiers, ...lus])
      if (erreurs.length) setErreur(erreurs.join(' '))
    } finally {
      setChargement(false)
    }
  }

  const points = useMemo(() => lecture?.points ?? [], [lecture])
  const retenus = useMemo(() => points.filter((p) => !exclus[p.nom]), [points, exclus])
  const selectionnes = points.filter((p) => selection[p.nom])
  const prelevements = useMemo(
    () => Object.fromEntries(points.map((p) => [p.nom, versPrelevement(saisies[p.nom])])),
    [points, saisies],
  )
  /** The lab file as Conditions de la nappe reads it: the retained samples. */
  const laboNappe = useMemo(() => (lecture && matrice === 'eau' ? { lecture: { ...lecture, points: retenus }, nom: fichier } : null), [lecture, matrice, retenus, fichier])
  const sansVolume = conversion ? retenus.filter((p) => volumeLitres(prelevements[p.nom]) === null) : []
  const associationFiches = useMemo(
    () => (fichesGaz ? Object.fromEntries(points.map((p) => [p.nom, assocManuelle[p.nom] ?? ficheDe(p.nom, fichesGaz.fiches)])) : {}),
    [fichesGaz, points, assocManuelle],
  )

  /** Sheet values written over the entries of the given samples. */
  function remplirDepuisFiches(etat: EtatFichesGaz, manuelle: Record<string, number>, sD: SourceDuree, sDb: SourceDebit, noms = points.map((p) => p.nom)) {
    const remplis = saisiesFiches(noms, etat.fiches, manuelle, sD, sDb)
    setSaisies((s) => ({ ...s, ...remplis }))
  }

  function chargerFiches(lu: EtatFichesGaz) {
    const etat = fichesGaz
      ? { fiches: [...fichesGaz.fiches, ...lu.fiches], fichiers: [...fichesGaz.fichiers, ...lu.fichiers], ignores: [...fichesGaz.ignores, ...lu.ignores] }
      : lu
    setFichesGaz(etat)
    remplirDepuisFiches(etat, assocManuelle, sourceDuree, sourceDebit)
    const dates = libelleDates(etat.fiches)
    if (dates && sousTitre.trim() === SOUS_TITRE_DEFAUT.trim()) setSousTitre(`Echantillons prélevés par ERM ${dates}`)
  }

  function associerFiche(nom: string, fiche: number) {
    const manuelle = { ...assocManuelle, [nom]: fiche }
    setAssocManuelle(manuelle)
    if (fiche < 0) setSaisies((s) => ({ ...s, [nom]: vide }))
    else if (fichesGaz) remplirDepuisFiches(fichesGaz, manuelle, sourceDuree, sourceDebit, [nom])
  }

  /** ERM value per parameter, in the row's unit or the output unit. */
  const automatiques = useMemo(() => {
    const g: Record<string, { valeur: number; source: string } | null> = {}
    if (!lecture || !matrice || sansReference) return g
    for (const c of ['CM', 'CC'] as const) {
      for (const p of lecture.parametres[c]) g[p.cle] = valeurGuideEn(matrice, p, { metaux, repere }, conversion ? unite : p.unite)
    }
    return g
  }, [lecture, matrice, metaux, repere, conversion, unite, sansReference])

  /** Families holding parameters without an ERM value — where the user
   *  fills in the project's own value (e.g. what ERM experience gave). */
  const famillesSansValeur = useMemo(() => {
    if (!lecture || matrice !== 'sol' || sansReference) return []
    const parFam = new Map<string, { manquants: string[]; unite: string }>()
    for (const c of conversion ? (['CM', 'CC'] as const) : (['CM'] as const)) {
      for (const p of lecture.parametres[c]) {
        // Only concentrations take a guide value — not a pH, a % or a °C.
        if (automatiques[p.cle] || !/g\s*\//i.test(p.unite)) continue
        const f = p.famille || 'Autres paramètres'
        const e = parFam.get(f) ?? { manquants: [], unite: conversion ? unite : p.unite }
        if (!e.manquants.includes(p.nom)) e.manquants.push(p.nom)
        parFam.set(f, e)
      }
    }
    return [...parFam.entries()].map(([famille, e]) => ({ famille, ...e }))
  }, [lecture, matrice, automatiques, conversion, unite, sansReference])

  /** Retained value: per-parameter entry, else ERM value, else family entry. */
  const guides = useMemo(() => {
    const g: Record<string, { valeur: number; source: string } | null> = {}
    if (!lecture || sansReference) return g
    for (const c of ['CM', 'CC'] as const) {
      for (const p of lecture.parametres[c]) {
        const saisie = surcharges[p.cle]
        if (saisie !== undefined && saisie.trim() !== '') {
          const v = lireNombre(saisie)
          g[p.cle] = v === null ? null : { valeur: v, source: 'Saisie' }
          continue
        }
        const famille = lireNombre(parFamille[p.famille || 'Autres paramètres'] ?? '')
        g[p.cle] = automatiques[p.cle] ?? (famille === null ? null : { valeur: famille, source: 'Saisie' })
      }
    }
    return g
  }, [lecture, surcharges, parFamille, automatiques, sansReference])

  // Other campaigns of the same wells (groundwater).
  const campagnes = useMemo((): Campagne[] => {
    if (!lecture || matrice !== 'eau' || !autres.length) return []
    const principale: Campagne = {
      lecture: { ...lecture, points: retenus },
      fichier,
      ...infoPrincipale,
      controles: retenus.filter((p) => estControle(qualifications[p.nom])).map((p) => p.nom),
    }
    return [principale, ...autres]
  }, [lecture, matrice, autres, fichier, infoPrincipale, qualifications, retenus])
  const ouvrages = useMemo(() => ouvragesManuels ?? associer(campagnes), [ouvragesManuels, campagnes])

  /** Comparison value of each compound across the campaigns' files: the
   *  main file's, else the ERM value in the compound's unit. */
  const guidesCampagnes = useMemo(() => {
    const g: Record<string, { valeur: number; source: string } | null> = {}
    if (!campagnes.length || !matrice || sansReference) return g
    for (const c of composes(campagnes)) {
      const principal = c.parametres[0]
      const ref = c.parametres.find((x) => x && x.unite === c.unite)!
      g[c.cle] = principal && principal.unite === c.unite ? (guides[principal.cle] ?? null) : valeurGuideEn(matrice, ref, { metaux, repere }, c.unite)
    }
    return g
  }, [campagnes, guides, matrice, metaux, repere, sansReference])

  /** A lab file for a campaign: a new one, the main one (index 0), or one
   *  of the others, merged with that campaign's earlier files. */
  async function ajouterCampagne(fs: File[], cible: number | null): Promise<string | null> {
    const { lus, erreurs } = await lireTous(fs, 'eau')
    const message = erreurs.length ? `${erreurs.join(' ')} Si ce fichier vient bien d'un laboratoire, transmettez-le pour que son format soit pris en charge.` : null
    if (!lus.length) return message
    try {
      if (cible === 0) {
        reunir([...fichiers, ...lus])
        return message
      }
      const actuelle = cible === null ? null : autres[cible - 1]
      // Files chosen together make one campaign.
      const bruts = [...(actuelle?.bruts ?? []), ...lus]
      const l = finaliser(fusionnerLectures(bruts).lecture, 'eau')
      const q = qualifierAuto(l.points)
      // Blanks and duplicates: what was set aside stays so; the new samples by name.
      const controles = [...new Set([...(actuelle?.controles ?? []), ...l.points.filter((p) => !actuelle?.lecture.points.some((x) => x.nom === p.nom) && estControle(q[p.nom])).map((p) => p.nom)])]
      const campagne: AutreCampagne = { date: actuelle?.date ?? '', regime: actuelle?.regime ?? null, lecture: l, fichier: bruts.map((x) => x.nom).join(' + '), controles, bruts }
      setAutres((a) => (cible === null ? [...a, campagne] : a.map((c, k) => (k === cible - 1 ? campagne : c))))
      setOuvragesManuels(null)
      return message
    } catch (e) {
      return `${lus.map((x) => x.nom).join(', ')} : ${(e as Error).message}`
    }
  }

  function modifier(nom: string, champ: Champ, valeur: string) {
    setSaisies((s) => ({ ...s, [nom]: { ...vide, ...s[nom], [champ]: valeur } }))
  }

  // Pasting a column (or a block) copied from Excel fills the rows below.
  // Sampling table, sortable; a pasted column fills the rows as displayed.
  const triPrelevement = useTri(points, {
    nom: (p) => p.nom,
    duree: (p) => prelevements[p.nom]?.duree,
    debitDebut: (p) => prelevements[p.nom]?.debitDebut,
    debitFin: (p) => prelevements[p.nom]?.debitFin,
    debit: (p) => debitMoyen(prelevements[p.nom]),
    volume: (p) => volumeLitres(prelevements[p.nom]),
    inclus: (p) => (exclus[p.nom] ? 0 : 1),
  })

  function coller(e: ClipboardEvent<HTMLInputElement>, ligne: number, champ: Champ) {
    const texte = e.clipboardData.getData('text')
    if (!/[\n\t]/.test(texte.trim())) return
    e.preventDefault()
    const lignes = texte.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((l) => l.split('\t'))
    const debut = CHAMPS.findIndex((c) => c.champ === champ)
    setSaisies((s) => {
      const suite = { ...s }
      lignes.forEach((cols, i) => {
        const p = triPrelevement.tries[ligne + i]
        if (!p) return
        cols.forEach((v, j) => {
          const c = CHAMPS[debut + j]
          if (c) suite[p.nom] = { ...vide, ...suite[p.nom], [c.champ]: v.trim() }
        })
      })
      return suite
    })
  }

  function appliquer(cibles: string[]) {
    setSaisies((s) => {
      const suite = { ...s }
      for (const nom of cibles) {
        const actuel = { ...vide, ...suite[nom] }
        for (const { champ } of CHAMPS) if (aAppliquer[champ].trim()) actuel[champ] = aAppliquer[champ].trim()
        suite[nom] = actuel
      }
      return suite
    })
  }

  /** The soil gas quality sheet, when sampling sheets with readings are loaded. */
  function qualiteGazExport() {
    if (!conversion || !fichesGaz || !fichesGaz.fiches.some((f) => f.mesures.length)) return undefined
    const points = fichesGaz.fiches.map((f) => evaluerQualite(f, sourceDuree, sourceDebit))
    return { points, synthese: syntheseQualite(points), references: REFERENCES_QUALITE }
  }

  async function exporter(expert: boolean) {
    if (!lecture || !matrice) return
    setExport(expert ? 'expert' : 'standard')
    try {
      await telechargerClasseur(
        { ...lecture, points: retenus },
        {
          libelleMatrice: libelle,
          conversion,
          titre: titre || titreParDefaut,
          sousTitre,
          unite,
          prelevements,
          guides,
          libelleGuide: matrice === 'air' ? `Valeur repère ${repere.toUpperCase()}` : 'Valeur de comparaison',
          sansReference,
          qualiteGaz: qualiteGazExport(),
          nappe: matrice === 'eau' ? (rapportNappe ?? undefined) : undefined,
          legende: legendeGuides(matrice, options),
          qualifications,
          seuilDoublon,
          expert,
          positions: matrice === 'eau' ? positions : undefined,
          facteurAmontAval,
          campagnes: campagnes.length > 1 ? { campagnes, ouvrages, facteur: facteurEvolution, guides: guidesCampagnes } : undefined,
        },
        `Tableau X - Résultats ${libelle}${campagnes.length > 1 ? ' - comparaison campagnes' : ''}${expert ? ' - expert' : ''}.xlsx`,
      )
    } finally {
      setExport(null)
    }
  }

  // ---- Results at a glance -------------------------------------------------

  /** Volets the user opened: all folded at first. */
  const [ouverts, setOuverts] = useState<Set<string>>(new Set())
  const basculer = (id: string) =>
    setOuverts((o) => {
      const suite = new Set(o)
      if (suite.has(id)) suite.delete(id)
      else suite.add(id)
      return suite
    })
  /** From a summary tile: open its volet and bring it into view. */
  function ouvrir(id: string) {
    setOuverts((o) => new Set(o).add(id))
    requestAnimationFrame(() => document.getElementById(`volet-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const retenusAnalyse = useMemo(() => retenus.filter((p) => !estControle(qualifications[p.nom])), [retenus, qualifications])
  const controlesCampagne = retenus.length - retenusAnalyse.length
  const resume = useMemo(
    () =>
      lecture
        ? resumer(lecture, retenusAnalyse.map((p) => p.nom), sansReference ? {} : guides, conversion ? { prelevements, unite } : null)
        : { composes: 0, quantifies: 0, depassements: 0, composesDepasses: [], max: null },
    [lecture, retenusAnalyse, guides, sansReference, conversion, prelevements, unite],
  )
  const anomaliesQualite = useMemo(() => {
    if (!lecture) return { total: 0, detail: '' }
    const blancs = controleBlancs(lecture, qualifications).filter((b) => b.composes.length).length
    const doublons = controleDoublons(lecture, qualifications, seuilDoublon).filter((d) => d.ecarts.some((e) => e.conforme === false)).length
    const percee = conversion ? controlePercee(lecture).filter((p) => p.perceeGlobale || p.composes.some((c) => c.percee)).length : 0
    const parts = [
      blancs ? `${blancs} blanc${blancs > 1 ? 's' : ''} avec détection` : '',
      doublons ? `${doublons} doublon${doublons > 1 ? 's' : ''} hors tolérance` : '',
      percee ? `percée sur ${percee} tube${percee > 1 ? 's' : ''}` : '',
    ].filter(Boolean)
    return { total: blancs + doublons + percee, detail: parts.join(' · ') }
  }, [lecture, qualifications, seuilDoublon, conversion])
  const qualiteGaz = useMemo(() => {
    if (!conversion || !fichesGaz || !fichesGaz.fiches.some((f) => f.mesures.length)) return null
    return { points: fichesGaz.fiches.map((f) => evaluerQualite(f, sourceDuree, sourceDebit)) }
  }, [conversion, fichesGaz, sourceDuree, sourceDebit])

  /** Wells with a hydraulic head on their sheet, for the cross-section. */
  const ouvragesHydro = useMemo((): OuvrageHydro[] => {
    if (matrice !== 'eau' || !rapportNappe) return []
    const analyses = new Set(retenusAnalyse.map((p) => p.nom))
    return rapportNappe.evaluations
      .filter((e) => e.ouvrage.fiche?.charge !== null && e.ouvrage.fiche?.charge !== undefined)
      .map((e) => ({
        nom: e.ouvrage.nom,
        echantillons: e.ouvrage.echantillons.filter((x) => analyses.has(x)),
        repere: e.ouvrage.fiche!.altitudeRepere,
        niveau: e.ouvrage.fiche!.niveauStatique,
        charge: e.ouvrage.fiche!.charge!,
      }))
      .filter((o) => o.echantillons.length)
  }, [matrice, rapportNappe, retenusAnalyse])

  /** Field parameters of each sample, for the families of wells. */
  const terrainFamilles = useMemo((): { variables: VariableFamille[]; mesures: Record<string, Record<string, MesureFamille>> } | null => {
    const mesures: Record<string, Record<string, MesureFamille>> = {}
    const mettre = (e: string, cle: string, v: number | null | undefined) => {
      if (v === null || v === undefined || !Number.isFinite(v)) return
      ;(mesures[e] ??= {})[cle] = { valeur: v, inferieur: false }
    }
    if (matrice === 'eau' && rapportNappe) {
      for (const ev of rapportNappe.evaluations) {
        const t = rapportNappe.jeu.valeurs[ev.ouvrage.cle] ?? {}
        for (const e of ev.ouvrage.echantillons) {
          mettre(e, 't:ph', t.ph?.valeur)
          mettre(e, 't:orp', t.orp?.valeur)
          mettre(e, 't:od', t.od?.valeur)
          mettre(e, 't:ce', t.ce?.valeur)
          mettre(e, 't:t', t.t?.valeur)
        }
      }
      return {
        variables: [
          { cle: 't:ph', libelle: 'pH', groupe: 'terrain', unite: '', log: false },
          { cle: 't:orp', libelle: 'Redox', groupe: 'terrain', unite: 'mV', log: false },
          { cle: 't:od', libelle: 'O₂ dissous', groupe: 'terrain', unite: 'mg/l', log: false },
          { cle: 't:ce', libelle: 'Conductivité', groupe: 'terrain', unite: 'µS/cm', log: true },
          { cle: 't:t', libelle: 'Température', groupe: 'terrain', unite: '°C', log: false },
        ],
        mesures,
      }
    }
    if (qualiteGaz && fichesGaz) {
      for (const p of retenusAnalyse) {
        const i = associationFiches[p.nom] ?? -1
        const q = i >= 0 ? qualiteGaz.points[i] : null
        if (!q) continue
        mettre(p.nom, 't:o2', q.o2)
        mettre(p.nom, 't:co2', q.co2)
        mettre(p.nom, 't:pid', q.pidMax === null ? null : q.pidMax + 0.1)
      }
      return {
        variables: [
          { cle: 't:o2', libelle: 'O₂', groupe: 'terrain', unite: '%', log: false },
          { cle: 't:co2', libelle: 'CO₂', groupe: 'terrain', unite: 'ppm', log: true },
          { cle: 't:pid', libelle: 'PID', groupe: 'terrain', unite: 'ppm', log: true },
        ],
        mesures,
      }
    }
    return null
  }, [matrice, rapportNappe, qualiteGaz, fichesGaz, retenusAnalyse, associationFiches])

  // ---- Sampling sheets, chosen at step 2 -------------------------------------

  const [chargementFiches, setChargementFiches] = useState(false)
  const [erreurFiches, setErreurFiches] = useState<string | null>(null)
  /** Groundwater sheets: handed to Conditions de la nappe, which reads them. */
  const [fichesNappeACharger, setFichesNappeACharger] = useState<File[] | null>(null)
  const [fichiersNappe, setFichiersNappe] = useState<string[]>([])
  const [retraitNappe, setRetraitNappe] = useState(0)

  async function chargerFichesPrelevement(fs: File[]) {
    if (!fs.length || !matrice) return
    setErreurFiches(null)
    if (matrice === 'eau') {
      setFichesNappeACharger(fs)
      setFichiersNappe((n) => [...new Set([...n, ...fs.map((f) => f.name)])])
      return
    }
    setChargementFiches(true)
    try {
      const lu = await lireClasseurs(fs)
      if (!lu.fiches.length) {
        setErreurFiches(
          `Aucune fiche de prélèvement reconnue dans ${fs.map((f) => f.name).join(', ')} : chaque onglet doit porter le débit d'échantillonnage ou le tableau de purge et d'échantillonnage (colonnes « Étape » et « Débit »).`,
        )
        return
      }
      chargerFiches(lu)
    } catch {
      setErreurFiches("Le fichier n'a pas pu être lu. Vérifiez qu'il s'agit d'un classeur Excel (.xlsx, .xls).")
    } finally {
      setChargementFiches(false)
    }
  }

  function retirerFiches() {
    setErreurFiches(null)
    if (matrice === 'eau') {
      setFichesNappeACharger(null)
      setFichiersNappe([])
      setRetraitNappe((n) => n + 1)
      return
    }
    setFichesGaz(null)
    setAssocManuelle({})
  }

  const [exportNappe, setExportNappe] = useState<'rapport' | 'recap' | null>(null)
  async function exporterNappe(quoi: 'rapport' | 'recap') {
    if (!rapportNappe) return
    setExportNappe(quoi)
    try {
      const { telechargerRapport, telechargerRecap } = await import('../lib/nappe/export')
      if (quoi === 'rapport') await telechargerRapport(rapportNappe, 'Conditions nappe.xlsx')
      else if (rapportNappe.recap) await telechargerRecap('Récapitulatif des paramètres de terrain', rapportNappe.recap, 'Recap parametres terrain.xlsx')
    } finally {
      setExportNappe(null)
    }
  }

  const avertissement = matrice && lecture ? avertissementMatrice(matrice, lecture) : null
  const parametresApercu = lecture?.parametres[conversion ? coucheApercu : 'CM'] ?? []
  const valeurApercu = (pa: Parametre, nom: string): number | null => {
    const m = lecture?.valeurs[conversion ? coucheApercu : 'CM'][nom]?.[pa.cle]
    if (!m || m.valeur === null) return null
    if (!conversion) return m.inferieur ? -1 / (1 + m.valeur) : m.valeur
    const c = convertir(m, pa, volumeLitres(prelevements[nom] ?? SANS_PRELEVEMENT), unite)
    return c ? (c.inferieur ? -1 / (1 + c.valeur) : c.valeur) : null
  }
  // Sorting by a sample puts its quantified results first, the <LQ after.
  const triApercu = useTri(parametresApercu, {
    nom: (pa) => pa.nom,
    unite: (pa) => pa.unite,
    guide: (pa) => guides[pa.cle]?.valeur,
    source: (pa) => guides[pa.cle]?.source,
    ...Object.fromEntries(retenus.map((p) => [`e:${p.nom}`, (pa: Parametre) => valeurApercu(pa, p.nom)])),
  })
  const toutSelectionne = points.length > 0 && selectionnes.length === points.length

  return (
    <>
      <section className="section">
        <div className="container">
          <p className="eyebrow">Résultats de laboratoire</p>
          <h1 style={{ maxWidth: '24ch' }}>
            Mise en forme des résultats d'analyses
          </h1>
          <p className="lede">
            Chargez le fichier transmis par le laboratoire : les résultats sont restitués dans un tableau Excel au format des rapports
            ERM, avec un onglet mis en forme et un onglet comparé aux valeurs guides ERM. Pour les gaz du sol et l'air, les masses par
            support sont converties en concentrations.
          </p>

          <h2 className="etape">
            <span>1</span> Matrice
          </h2>
          <div className="grid grid--3 choix" role="radiogroup" aria-label="Matrice">
            {MATRICES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={matrice === m.id}
                className={`card choix__option${matrice === m.id ? ' choix__option--actif' : ''}`}
                onClick={() => choisirMatrice(m.id)}
              >
                <strong>{m.titre}</strong>
                <span>{m.detail}</span>
              </button>
            ))}
          </div>
          {matrice === 'air' && (
            <div className="grid grid--4" style={{ marginTop: '1rem', alignItems: 'end' }}>
              <label className="champ">
                Milieu
                <select value={milieu} onChange={(e) => setMilieu(e.target.value as MilieuAir)}>
                  <option value="gaz du sol">Gaz du sol</option>
                  <option value="air ambiant">Air ambiant</option>
                  <option value="air intérieur">Air intérieur</option>
                </select>
              </label>
              {lecture?.mode !== 'concentration' && (
                <label className="champ">
                  Unité de sortie
                  <select value={unite} onChange={(e) => setUnite(e.target.value as UniteSortie)}>
                    <option value="µg/m³">µg/m³</option>
                    <option value="mg/m³">mg/m³</option>
                  </select>
                </label>
              )}
            </div>
          )}

          {matrice && (
            <>
              <h2 className="etape">
                <span>2</span> Fichier du laboratoire
              </h2>
              <ZoneDepot
                titre="Déposez ici le ou les fichiers du laboratoire"
                aide={
                  <>
                    Excel (.xlsx, .xls) ou CSV — la disposition est reconnue automatiquement. Une campagne rendue en plusieurs fichiers :
                    sélectionnez-les ensemble (Ctrl ou Maj + clic), ils sont réunis dans un même tableau. Les fichiers sont lus dans votre
                    navigateur et ne sont envoyés nulle part.
                  </>
                }
                chargement={chargement}
                libelleChargement="Lecture…"
                multiple
                onFichiers={(fs) => void charger(fs)}
                actions={(choisir) => (
                  <button type="button" className="btn" onClick={choisir} disabled={chargement}>
                    Choisir un ou plusieurs fichiers
                  </button>
                )}
              />
            </>
          )}

          {erreur && (
            <p role="alert" className="alerte">
              {erreur}
            </p>
          )}

          {lecture && (
            <div className="card" style={{ marginTop: '1.5rem', maxWidth: '40rem' }}>
              {fichiers.length > 1 ? (
                <>
                  <strong>{fichiers.length} fichiers réunis dans un même tableau</strong>
                  <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem', fontSize: '0.9rem' }}>
                    {fichiers.map((x, i) => (
                      <li key={`${i}-${x.nom}`} style={{ marginBottom: '0.2rem' }}>
                        {x.nom}{' '}
                        <span style={{ color: 'var(--color-muted)' }}>
                          ({x.lecture.points.length} échantillon{x.lecture.points.length > 1 ? 's' : ''}, {x.lecture.parametres.CM.length} paramètres)
                        </span>{' '}
                        <button type="button" className="btn btn--ghost btn--petit" onClick={() => reunir(fichiers.filter((_, k) => k !== i))}>
                          Retirer
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <strong>{fichier}</strong>
              )}
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.9rem', color: 'var(--color-muted)' }}>
                {lecture.feuille && <>Feuille{lecture.feuille.includes(', ') ? 's' : ''} « {lecture.feuille} » · </>}
                {points.length} échantillon{points.length > 1 ? 's' : ''} · {lecture.parametres.CM.length} paramètres
                {lecture.coucheControle ? ' · couche de mesure et couche de contrôle' : ''} · unités : {lecture.unites.join(', ')}
              </p>
              {lecture.mode === 'concentration' && (
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
                  Résultats fournis directement en concentration dans l'air par le laboratoire (canister, sac, Radiello…) : l'étape de
                  conversion est sautée. Les masses par support et les colonnes en ppbV éventuelles ne sont pas reprises.
                </p>
              )}
              {conversion && lecture.lignesIgnorees.length > 0 && (
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: 'var(--color-muted)' }}>
                  Lignes non converties (unité autre qu'une masse par support) : {lecture.lignesIgnorees.join(', ')}
                </p>
              )}
              {notesFusion.map((n) => (
                <p key={n} style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
                  {n}
                </p>
              ))}
              {avertissement && <p className="alerte" style={{ margin: '0.75rem 0 0' }}>{avertissement}</p>}
              <input
                ref={inputAjout}
                type="file"
                multiple
                accept=".xlsx,.xlsm,.xls,.csv"
                style={{ display: 'none' }}
                onChange={(e) => {
                  void ajouterFichier([...(e.target.files ?? [])])
                  e.target.value = ''
                }}
              />
              <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', color: 'var(--color-muted)' }}>
                Le laboratoire a rendu la campagne en plusieurs fichiers ? Ajoutez les autres : échantillons et paramètres sont réunis dans un
                même tableau (un échantillon présent dans deux fichiers garde une seule colonne).
              </p>
              <button type="button" className="btn btn--petit" style={{ marginTop: '0.5rem' }} onClick={() => inputAjout.current?.click()} disabled={chargement}>
                {chargement ? 'Lecture…' : 'Ajouter des fichiers de la même campagne'}
              </button>
            </div>
          )}

          {lecture && (matrice === 'air' || matrice === 'eau') && (
            <DepotFiches
              matrice={matrice}
              chargement={chargementFiches}
              noms={matrice === 'air' ? (fichesGaz?.fichiers ?? []) : fichiersNappe}
              resume={
                matrice === 'air'
                  ? fichesGaz && `${fichesGaz.fiches.length} fiche${fichesGaz.fiches.length > 1 ? 's' : ''} lue${fichesGaz.fiches.length > 1 ? 's' : ''}${fichesGaz.ignores.length ? ` · onglets ignorés : ${fichesGaz.ignores.join(', ')}` : ''}`
                  : rapportNappe && `${rapportNappe.evaluations.filter((e) => e.ouvrage.fiche).length} ouvrage${rapportNappe.evaluations.filter((e) => e.ouvrage.fiche).length > 1 ? 's' : ''} avec fiche`
              }
              erreur={erreurFiches}
              onFichiers={chargerFichesPrelevement}
              onRetirer={retirerFiches}
            />
          )}
        </div>
      </section>

      {lecture && matrice && (
        <section className="section section--muted">
          <div className="container">
            <h2 className="etape">
              <span>3</span> Résultats et interprétation
            </h2>
            <p className="lede" style={{ marginBottom: '0.5rem' }}>
              Les chiffres clés de la campagne : cliquez une tuile pour ouvrir son détail, ou dépliez les volets ci-dessous. Les graphiques
              sont interactifs — un clic sur un point, une case ou un échantillon en donne la lecture.
            </p>
            <div className="grid grid--2" style={{ margin: '1.25rem 0 0.75rem', alignItems: 'end', maxWidth: '52rem' }}>
              <label className="champ">
                Valeurs de comparaison
                <select
                  value={sansReference ? 'aucune' : matrice === 'sol' ? metaux : matrice === 'air' ? repere : 'erm'}
                  onChange={(e) => {
                    const v = e.target.value
                    setSansReference(v === 'aucune')
                    if (matrice === 'sol' && v !== 'aucune') setMetaux(v as ContexteMetaux)
                    if (matrice === 'air' && v !== 'aucune') setRepere(v as Repere)
                  }}
                >
                  {matrice === 'eau' && <option value="erm">Valeurs indicatives ERM — eaux souterraines</option>}
                  {matrice === 'sol' && (
                    <>
                      <option value="sur site">Valeurs ERM sols — métaux : bruit de fond (réutilisation sur site)</option>
                      <option value="hors site">Valeurs ERM sols — métaux : seuil de vigilance (usage hors site)</option>
                    </>
                  )}
                  {matrice === 'air' && (
                    <>
                      <option value="r1">Valeurs repères R1 — air intérieur</option>
                      <option value="r2">Valeurs repères R2 — air intérieur</option>
                      <option value="r3">Valeurs repères R3 — air intérieur</option>
                    </>
                  )}
                  <option value="aucune">Aucune valeur de comparaison</option>
                </select>
              </label>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)', maxWidth: '52rem' }}>
              {sansReference
                ? "Résultats restitués sans comparaison : pas de colonne de valeur de comparaison, pas d'onglet « Valeurs guides ERM » dans l'export."
                : "Les valeurs de comparaison sont retrouvées par n° CAS ou par nom. Chacune peut être corrigée dans le tableau ci-dessous : une valeur saisie remplace la valeur ERM (« - » pour n'en retenir aucune)."}
            </p>

            <div className="tuiles">
              <Tuile teinte="ardoise" valeur={retenusAnalyse.length} libelle={`échantillon${retenusAnalyse.length > 1 ? 's' : ''} interprété${retenusAnalyse.length > 1 ? 's' : ''}`} detail={controlesCampagne ? `+ ${controlesCampagne} de contrôle (blancs, doublons)` : undefined} onClick={() => ouvrir('qualite')} />
              <Tuile teinte="bleu" valeur={`${resume.quantifies}/${resume.composes}`} libelle="composés quantifiés" detail={resume.quantifies ? 'au moins une fois' : 'aucun composé quantifié'} onClick={() => ouvrir('carte')} />
              {!sansReference && (
                <Tuile
                  teinte="brique"
                  etat={resume.depassements ? 'alerte' : 'ok'}
                  valeur={resume.depassements}
                  libelle={`dépassement${resume.depassements > 1 ? 's' : ''} de la valeur de comparaison`}
                  detail={
                    resume.max && resume.max.ratio > 1
                      ? `${resume.composesDepasses.length} composé${resume.composesDepasses.length > 1 ? 's' : ''} · jusqu’à ${resume.max.ratio >= 10 ? Math.round(resume.max.ratio).toLocaleString('fr-FR') : fr(resume.max.ratio, 1)} fois la valeur de comparaison (${acronyme(resume.max.compose)}, ${resume.max.echantillon})`
                      : 'tous les résultats sous la valeur de comparaison'
                  }
                  onClick={() => ouvrir('carte')}
                />
              )}
              <Tuile
                teinte="violet"
                etat={anomaliesQualite.total ? 'vigilance' : 'ok'}
                valeur={anomaliesQualite.total}
                libelle={`point${anomaliesQualite.total > 1 ? 's' : ''} de contrôle qualité à voir`}
                detail={anomaliesQualite.detail || 'blancs, doublons et percée conformes'}
                onClick={() => ouvrir('qualite')}
              />
              {qualiteGaz && (
                <Tuile
                  teinte="vert"
                  etat={qualiteGaz.points.every((q) => q.verdict === 'representatif') ? 'ok' : 'vigilance'}
                  valeur={`${qualiteGaz.points.filter((q) => q.verdict === 'representatif').length}/${qualiteGaz.points.length}`}
                  libelle="points de gaz du sol représentatifs"
                  detail={`${qualiteGaz.points.filter((q) => q.verdict !== 'representatif').length} à vérifier (étanchéité, mesures)`}
                  onClick={() => ouvrir('gaz')}
                />
              )}
              {matrice === 'eau' && rapportNappe && (
                <Tuile
                  teinte="vert"
                  valeur={rapportNappe.synthese.classement.length}
                  libelle="ouvrages décrits par leurs fiches"
                  detail={resumeNappe(rapportNappe)}
                  onClick={() => ouvrir('nappe')}
                />
              )}
            </div>

            <Volet
              id="carte"
              teinte="bleu"
              titre="Carte des résultats"
              resume={sansReference ? 'Chaque résultat situé dans la gamme de son composé' : 'Chaque résultat comparé à sa valeur de comparaison, échantillon par échantillon'}
              ouvert={ouverts.has('carte')}
              onBasculer={() => basculer('carte')}
              badges={!sansReference && resume.depassements > 0 ? <span className="badge badge--elevee">{resume.depassements} dépassement{resume.depassements > 1 ? 's' : ''}</span> : undefined}
            >
              <CarteResultats
                lecture={lecture}
                echantillons={retenusAnalyse.map((p) => p.nom)}
                guides={guides}
                conversion={conversion ? { prelevements, unite } : null}
                avecReference={!sansReference}
              />
              <AnalyseApercu
                lecture={lecture}
                qualifications={qualifications}
                guides={guides}
                conversion={conversion ? { prelevements, unite } : null}
              />
            </Volet>

            {conversion && (
              <Volet
                id="prelevement"
                teinte="ocre"
                titre="Conditions de prélèvement"
                resume="Durée, débits et volume de chaque échantillon : la base de la conversion µg/support → µg/m³"
                ouvert={ouverts.has('prelevement')}
                onBasculer={() => basculer('prelevement')}
                badges={sansVolume.length ? <span className="badge badge--moderee">{sansVolume.length} sans volume</span> : <span className="badge badge--faible">volumes complets</span>}
              >
              <p className="lede" style={{ marginBottom: '1.25rem' }}>
                Volume prélevé = débit × durée ; avec un débit de début et de fin, le débit retenu est leur moyenne. Les fiches de
                prélèvement chargées à l’étape 2 renseignent durée et débits de chaque échantillon. Sinon, cochez des échantillons,
                saisissez durée et débit sur la ligne « Valeurs à appliquer », puis appliquez-les à la sélection ; une colonne copiée
                depuis Excel peut aussi être collée directement dans la première case.
              </p>

              <FichesGaz
                points={points}
                etat={fichesGaz}
                association={associationFiches}
                sourceDuree={sourceDuree}
                sourceDebit={sourceDebit}
                onAssocier={associerFiche}
                onSourceDuree={(s) => {
                  setSourceDuree(s)
                  if (fichesGaz) remplirDepuisFiches(fichesGaz, assocManuelle, s, sourceDebit)
                }}
                onSourceDebit={(s) => {
                  setSourceDebit(s)
                  if (fichesGaz) remplirDepuisFiches(fichesGaz, assocManuelle, sourceDuree, s)
                }}
              />

              <ExempleConversion lecture={lecture} prelevements={prelevements} unite={unite} />

              <div className="tableau-defile">
                <table className="tableau">
                  <thead>
                    <tr>
                      <th style={{ width: '2.5rem' }}>
                        <input
                          type="checkbox"
                          checked={toutSelectionne}
                          aria-label="Sélectionner tous les échantillons"
                          onChange={(e) => setSelection(Object.fromEntries(points.map((p) => [p.nom, e.target.checked])))}
                        />
                      </th>
                      <EnTete cle="nom" tri={triPrelevement.tri} onTrier={triPrelevement.trier}>
                        Échantillon
                      </EnTete>
                      {CHAMPS.map((c) => (
                        <EnTete key={c.champ} cle={c.champ} tri={triPrelevement.tri} onTrier={triPrelevement.trier} title={c.aide}>
                          {c.libelle}
                        </EnTete>
                      ))}
                      <EnTete cle="debit" tri={triPrelevement.tri} onTrier={triPrelevement.trier}>
                        Débit retenu (L/min)
                      </EnTete>
                      <EnTete cle="volume" tri={triPrelevement.tri} onTrier={triPrelevement.trier}>
                        Volume (L)
                      </EnTete>
                      <EnTete cle="volume" tri={triPrelevement.tri} onTrier={triPrelevement.trier}>
                        Volume (m³)
                      </EnTete>
                      <EnTete cle="inclus" tri={triPrelevement.tri} onTrier={triPrelevement.trier}>
                        Dans le tableau
                      </EnTete>
                    </tr>
                    <tr className="tableau__tous">
                      <td />
                      <td>Valeurs à appliquer</td>
                      {CHAMPS.map((c) => (
                        <td key={c.champ}>
                          <input
                            inputMode="decimal"
                            value={aAppliquer[c.champ]}
                            aria-label={`${c.libelle} à appliquer`}
                            onChange={(e) => setAAppliquer({ ...aAppliquer, [c.champ]: e.target.value })}
                          />
                        </td>
                      ))}
                      <td colSpan={4}>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'nowrap' }}>
                          <button
                            type="button"
                            className="btn btn--petit"
                            disabled={!selectionnes.length}
                            onClick={() => appliquer(selectionnes.map((p) => p.nom))}
                          >
                            Appliquer à la sélection ({selectionnes.length})
                          </button>
                          <button type="button" className="btn btn--petit btn--ghost" onClick={() => appliquer(points.map((p) => p.nom))}>
                            Appliquer à tous
                          </button>
                        </div>
                      </td>
                    </tr>
                  </thead>
                  <tbody>
                    {triPrelevement.tries.map((p, i) => {
                      const pr = prelevements[p.nom]
                      const debit = debitMoyen(pr)
                      const vol = volumeLitres(pr)
                      return (
                        <tr key={p.nom} className={`${exclus[p.nom] ? 'tableau__exclu' : ''}${selection[p.nom] ? ' tableau__selection' : ''}`}>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={!!selection[p.nom]}
                              aria-label={`Sélectionner ${p.nom}`}
                              onChange={(e) => setSelection({ ...selection, [p.nom]: e.target.checked })}
                            />
                          </td>
                          <th scope="row">{p.nom}</th>
                          {CHAMPS.map((c) => (
                            <td key={c.champ}>
                              <input
                                inputMode="decimal"
                                value={saisies[p.nom]?.[c.champ] ?? ''}
                                aria-label={`${c.libelle} — ${p.nom}`}
                                aria-invalid={!!saisies[p.nom]?.[c.champ] && lireNombre(saisies[p.nom][c.champ]) === null}
                                onChange={(e) => modifier(p.nom, c.champ, e.target.value)}
                                onPaste={(e) => coller(e, i, c.champ)}
                              />
                            </td>
                          ))}
                          <td className="tableau__calcule">{debit === null ? '—' : fr(debit, 3)}</td>
                          <td className="tableau__calcule">{vol === null ? '—' : fr(vol, 1)}</td>
                          <td className="tableau__calcule">{vol === null ? '—' : fr(vol / 1000, 4)}</td>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={!exclus[p.nom]}
                              aria-label={`Inclure ${p.nom} dans le tableau`}
                              onChange={(e) => setExclus({ ...exclus, [p.nom]: !e.target.checked })}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              </Volet>
            )}

            {qualiteGaz && (
              <Volet
                id="gaz"
                teinte="vert"
                titre="Qualité des gaz du sol captés"
                resume="Étanchéité et représentativité d’après O₂, CO₂, H₂S, CO, LIE et PID des fiches (guide BRGM / INERIS 2016)"
                ouvert={ouverts.has('gaz')}
                onBasculer={() => basculer('gaz')}
                badges={<span className="badge badge--faible">{qualiteGaz.points.filter((q) => q.verdict === 'representatif').length} représentatifs</span>}
              >
                <NuageGaz points={qualiteGaz.points} />
                <details className="sous-volet">
                  <summary>Lecture point par point et synthèse</summary>
                  <QualiteGaz fiches={fichesGaz!.fiches} sourceDuree={sourceDuree} sourceDebit={sourceDebit} />
                </details>
              </Volet>
            )}

            {matrice === 'eau' && (
              <Volet
                id="nappe"
                teinte="vert"
                titre="Conditions de la nappe et qualité des purges"
                resume={rapportNappe ? 'États physico-chimiques, purges, déchloration réductrice et processus redox, ouvrage par ouvrage' : 'Chargez les fiches de prélèvement à l’étape 2'}
                ouvert={ouverts.has('nappe')}
                onBasculer={() => basculer('nappe')}
                badges={rapportNappe ? <span className="badge badge--faible">{rapportNappe.synthese.classement.length} ouvrages</span> : undefined}
              >
                <ConditionsNappe labo={laboNappe} aCharger={fichesNappeACharger} retrait={retraitNappe} onRapport={setRapportNappe} />
              </Volet>
            )}

            {matrice === 'eau' && (
              <Volet
                id="campagnes"
                teinte="violet"
                titre="Comparaison de campagnes"
                resume={campagnes.length > 1 ? `${campagnes.length} campagnes comparées, ouvrage par ouvrage` : 'Ajoutez les résultats de campagnes antérieures pour suivre les évolutions'}
                ouvert={ouverts.has('campagnes')}
                onBasculer={() => basculer('campagnes')}
              >
                <Campagnes
                campagnes={
                  campagnes.length
                    ? campagnes
                    : [
                        {
                          lecture,
                          fichier,
                          ...infoPrincipale,
                          controles: lecture.points.filter((p) => estControle(qualifications[p.nom])).map((p) => p.nom),
                        },
                      ]
                }
                ouvrages={ouvrages}
                onInfo={(i, info) => (i === 0 ? setInfoPrincipale((x) => ({ ...x, ...info })) : setAutres((a) => a.map((c, k) => (k === i - 1 ? { ...c, ...info } : c))))}
                onAjouter={ajouterCampagne}
                onRetirer={(i) => {
                  setAutres((a) => a.filter((_, k) => k !== i - 1))
                  setOuvragesManuels(null)
                }}
                onOuvrages={setOuvragesManuels}
                facteur={facteurEvolution}
                onFacteur={setFacteurEvolution}
              />
              </Volet>
            )}

            {matrice === 'eau' && (
              <Volet
                id="positions"
                teinte="ardoise"
                titre="Positions hydrauliques"
                resume={
                  ouvragesHydro.length >= 2
                    ? `Profil des ${ouvragesHydro.length} ouvrages d’après leurs charges, concentrations de l’amont à l’aval, contribution du site`
                    : 'Ouvrages amont, aval et dans le panache : contribution du site (export expert)'
                }
                ouvert={ouverts.has('positions')}
                onBasculer={() => basculer('positions')}
                badges={ouvragesHydro.length >= 2 ? <span className="badge badge--faible">{ouvragesHydro.length} cotes NGF</span> : undefined}
              >
                <ProfilHydraulique ouvrages={ouvragesHydro} lecture={lecture} guides={sansReference ? {} : guides} positions={positions} onPositions={setPositions} />
              <PositionsHydrauliques
                points={lecture.points.filter((p) => !estControle(qualifications[p.nom]))}
                positions={positions}
                auto={positionsDetectees}
                onPositions={setPositions}
                facteur={facteurAmontAval}
                onFacteur={setFacteurAmontAval}
              />
              </Volet>
            )}

            <Volet
              id="qualite"
              teinte="violet"
              titre="Contrôle qualité"
              resume="Blancs, doublons et percée des tubes ; qualification des échantillons"
              ouvert={ouverts.has('qualite')}
              onBasculer={() => basculer('qualite')}
              badges={anomaliesQualite.total ? <span className="badge badge--moderee">{anomaliesQualite.total} à voir</span> : <span className="badge badge--faible">conforme</span>}
            >
              <ControleQualite
                lecture={lecture}
                qualifications={qualifications}
                onQualifier={(nom, q) => setQualifications({ ...qualifications, [nom]: q })}
                seuilDoublon={seuilDoublon}
                onSeuilDoublon={setSeuilDoublon}
                conversion={conversion}
              />
            </Volet>

            <Volet
              id="tableau"
              teinte="ocre"
              titre="Tableau des résultats et valeurs de comparaison"
              resume="L’aperçu du tableau Excel ; chaque valeur de comparaison peut y être corrigée"
              ouvert={ouverts.has('tableau')}
              onBasculer={() => basculer('tableau')}
            >
            {famillesSansValeur.length > 0 && (
              <div className="card" style={{ margin: '1.25rem 0', maxWidth: '52rem' }}>
                <strong>Valeurs à renseigner par famille</strong>
                <p style={{ margin: '0.35rem 0 0.9rem', fontSize: '0.85rem', color: 'var(--color-muted)' }}>
                  Ces composés n'ont pas de valeur guide ERM publiée ; pour les COHV, CAV et HAP, la valeur retenue dépend de
                  l'usage du site (exemples indiqués à droite). Une valeur
                  saisie ici s'applique à tous les composés de la famille sans valeur guide ; une saisie composé par composé dans le
                  tableau reste prioritaire.
                </p>
                <div style={{ display: 'grid', gap: '0.6rem' }}>
                  {famillesSansValeur.map((f) => (
                    <label key={f.famille} className="famille-valeur">
                      <span>
                        <strong>{f.famille}</strong>
                        <small>
                          {f.manquants.length} composé{f.manquants.length > 1 ? 's' : ''} : {f.manquants.slice(0, 6).join(', ')}
                          {f.manquants.length > 6 ? '…' : ''}
                        </small>
                      </span>
                      <span className="famille-valeur__saisie">
                        <input
                          inputMode="decimal"
                          value={parFamille[f.famille] ?? ''}
                          placeholder="-"
                          aria-label={`Valeur guide pour la famille ${f.famille}`}
                          aria-invalid={!!parFamille[f.famille] && lireNombre(parFamille[f.famille]) === null}
                          onChange={(e) => setParFamille({ ...parFamille, [f.famille]: e.target.value })}
                        />
                        <span>{f.unite}</span>
                        {exempleFamille(f.famille) && <span className="famille-valeur__exemple">{exempleFamille(f.famille)}</span>}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {conversion && lecture.coucheControle && (
              <div role="tablist" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                {(['CM', 'CC'] as const).map((c) => (
                  <button
                    key={c}
                    role="tab"
                    type="button"
                    aria-selected={coucheApercu === c}
                    className={`btn btn--petit${coucheApercu === c ? '' : ' btn--ghost'}`}
                    onClick={() => setCoucheApercu(c)}
                  >
                    {c === 'CM' ? 'Couche de mesure' : 'Couche de contrôle'}
                  </button>
                ))}
              </div>
            )}

            <div className="tableau-defile">
              <table className="tableau tableau--resultats">
                <thead>
                  <tr>
                    <EnTete cle="nom" tri={triApercu.tri} onTrier={triApercu.trier} rowSpan={conversion ? 2 : 1}>
                      Composé
                    </EnTete>
                    {!conversion && (
                      <EnTete cle="unite" tri={triApercu.tri} onTrier={triApercu.trier}>
                        Unité
                      </EnTete>
                    )}
                    {!sansReference && (
                      <>
                        <EnTete cle="guide" tri={triApercu.tri} onTrier={triApercu.trier} rowSpan={conversion ? 2 : 1}>
                          {conversion ? `Valeur repère ${repere.toUpperCase()} (${unite})` : 'Valeur de comparaison'}
                        </EnTete>
                        <EnTete cle="source" tri={triApercu.tri} onTrier={triApercu.trier} rowSpan={conversion ? 2 : 1}>
                          Source
                        </EnTete>
                      </>
                    )}
                    {retenus.map((p) => (
                      <EnTete key={p.nom} cle={`e:${p.nom}`} tri={triApercu.tri} onTrier={triApercu.trier} colSpan={conversion ? 2 : 1}>
                        {p.nom}
                      </EnTete>
                    ))}
                  </tr>
                  {matrice === 'sol' && retenus.some((p) => lireProfondeur(p.nom)) && (
                    <tr>
                      <th colSpan={sansReference ? 2 : 4}>Profondeur (m)</th>
                      {retenus.map((p) => {
                        const z = lireProfondeur(p.nom)
                        return <th key={p.nom}>{z ? libelleProfondeur(z) : '-'}</th>
                      })}
                    </tr>
                  )}
                  {conversion && (
                    <tr>
                      {retenus.map((p) => (
                        <UnitesPoint key={p.nom} unite={unite} uniteBrute={parametresApercu[0]?.unite ?? 'µg/support'} />
                      ))}
                    </tr>
                  )}
                </thead>
                <tbody>
                  {triApercu.tries.map((pa, i) => (
                    <LigneFamille
                      key={pa.cle}
                      afficher={!triApercu.tri && (i === 0 || triApercu.tries[i - 1].famille !== pa.famille)}
                      famille={pa.famille}
                      colonnes={(conversion ? 1 : 2) + (sansReference ? 0 : 2) + (conversion ? 2 : 1) * retenus.length}
                    >
                      <tr>
                        <th scope="row" style={{ fontStyle: pa.somme ? 'italic' : undefined, textAlign: pa.somme ? 'right' : undefined }}>
                          {pa.nom}
                        </th>
                        {!conversion && <td>{pa.unite}</td>}
                        {!sansReference && (
                          <CelluleGuide
                            parametre={pa}
                            guide={guides[pa.cle]}
                            saisie={surcharges[pa.cle]}
                            onChange={(v) => setSurcharges({ ...surcharges, [pa.cle]: v })}
                          />
                        )}
                        {retenus.map((p) => {
                          const m = lecture.valeurs[conversion ? coucheApercu : 'CM'][p.nom]?.[pa.cle]
                          const g = guides[pa.cle]
                          if (!conversion) {
                            const depasse = !!m && !m.inferieur && m.valeur !== null && !!g && m.valeur > g.valeur
                            const lqSup = !!m && m.inferieur && m.valeur !== null && !!g && m.valeur > g.valeur
                            return (
                              <td
                                key={p.nom}
                                className={m?.inferieur ? `tableau__lq${lqSup ? ' tableau__lq-sup' : ''}` : depasse ? 'tableau__depasse' : undefined}
                                title={lqSup ? 'Limite de quantification supérieure à la valeur de comparaison' : undefined}
                              >
                                {m ? virgule(m.brut) : '-'}
                              </td>
                            )
                          }
                          const c = convertir(m, pa, volumeLitres(prelevements[p.nom] ?? SANS_PRELEVEMENT), unite)
                          const depasse = !!c && !c.inferieur && !!g && c.valeur > g.valeur
                          const lqSup = !!c && c.inferieur && !!g && c.valeur > g.valeur
                          return (
                            <ValeursPoint
                              key={p.nom}
                              brut={m ? virgule(m.brut) : '-'}
                              lq={!!m?.inferieur}
                              conc={formatConcentration(c)}
                              depasse={depasse}
                              lqSup={lqSup}
                            />
                          )
                        })}
                      </tr>
                    </LigneFamille>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="legende-apercu">
              <span className="tableau__lq">&lt;0,10</span> inférieur à la LQ
              {!sansReference && (
                <>
                  {' '}
                  · <span className="tableau__depasse">12</span> supérieur à la valeur de comparaison ·{' '}
                  <span className="tableau__lq tableau__lq-sup">&lt;20</span> LQ supérieure à la valeur de comparaison
                </>
              )}
            </p>
            </Volet>

            <Volet
              id="signatures"
              teinte="brique"
              titre="Signatures et familles de points"
              resume={`Points qui se ressemblent d’après tous les composés analysés${terrainFamilles ? ' et les paramètres de terrain' : ''} ; signature de chaque point`}
              ouvert={ouverts.has('signatures')}
              onBasculer={() => basculer('signatures')}
            >
              <FamillesOuvrages
                lecture={lecture}
                echantillons={retenusAnalyse.map((p) => p.nom)}
                conversion={conversion ? { prelevements, unite } : null}
                terrain={terrainFamilles}
              />
              <SignaturesApercu lecture={lecture} qualifications={qualifications} metaux={matrice === 'sol'} />
            </Volet>
          </div>
        </section>
      )}

      {lecture && matrice && (
        <section className="section">
          <div className="container">
            <h2 className="etape">
              <span>4</span> Export
            </h2>
            <p className="lede" style={{ marginBottom: '0.75rem' }}>
              Les fichiers Excel de la campagne, prêts pour le rapport.
            </p>
            <div className="grid grid--4" style={{ margin: '1.25rem 0 1.5rem', alignItems: 'end' }}>
              <label className="champ" style={{ gridColumn: 'span 2' }}>
                Titre du tableau
                <input value={titre} placeholder={titreParDefaut} onChange={(e) => setTitre(e.target.value)} />
              </label>
              <label className="champ" style={{ gridColumn: 'span 2' }}>
                Sous-titre
                <input value={sousTitre} onChange={(e) => setSousTitre(e.target.value)} />
              </label>
            </div>
            <div className="exports-liste">
              <FichierExport
                teinte="bleu"
                titre="Tableau des résultats"
                nom={`Tableau X - Résultats ${libelle}.xlsx`}
                description={`Mis en forme${sansReference ? '' : ', comparé aux valeurs de comparaison'}, analyse par composé, contrôle qualité${matrice === 'eau' && rapportNappe ? ', conditions physico-chimiques et qualité des purges' : ''}${qualiteGaz ? ', qualité des gaz du sol captés' : ''}.`}
                enCours={export_ === 'standard'}
                desactive={!!export_ || !retenus.length}
                onTelecharger={() => exporter(false)}
              />
              <FichierExport
                teinte="violet"
                titre="Export expert"
                nom={`Tableau X - Résultats ${libelle} - expert.xlsx`}
                description={`Le tableau des résultats, plus : dégradation des COHV, HAP, hydrocarbures et BTEX, signatures${matrice === 'eau' ? ', amont / aval' : ''}${matrice === 'eau' && rapportNappe ? ', atténuation naturelle (synthèse par ouvrage, criblage USEPA 1998)' : ''}${matrice === 'sol' ? ', admissibilité ISDI' : ''}, références des méthodes.`}
                enCours={export_ === 'expert'}
                desactive={!!export_ || !retenus.length}
                onTelecharger={() => exporter(true)}
              />
              {matrice === 'eau' && rapportNappe && (
                <FichierExport
                  teinte="vert"
                  titre="Conditions de la nappe"
                  nom="Conditions nappe.xlsx"
                  description="Rapport complet : synthèse générale, récapitulatif terrain, synthèse par ouvrage, criblage USEPA 1998, paramètres de terrain, données, méthode et sources."
                  enCours={exportNappe === 'rapport'}
                  desactive={!!exportNappe}
                  onTelecharger={() => exporterNappe('rapport')}
                />
              )}
              {matrice === 'eau' && rapportNappe?.recap && (
                <FichierExport
                  teinte="ardoise"
                  titre="Récapitulatif des paramètres de terrain"
                  nom="Recap parametres terrain.xlsx"
                  description="Minimum, maximum et moyenne de chaque paramètre de terrain, avec la synthèse en quelques phrases."
                  enCours={exportNappe === 'recap'}
                  desactive={!!exportNappe}
                  onTelecharger={() => exporterNappe('recap')}
                />
              )}
            </div>
            {sansVolume.length > 0 && (
              <p style={{ fontSize: '0.88rem', color: 'var(--color-muted)', marginTop: '1rem' }}>
                Sans débit ni durée, aucune concentration pour : {sansVolume.map((p) => p.nom).join(', ')}.
              </p>
            )}
          </div>
        </section>
      )}
    </>
  )
}

/** The groundwater conditions in a line, for the summary tile. */
function resumeNappe(rp: RapportNappe): string {
  const n = new Map<string, number>()
  for (const c of rp.synthese.classement) n.set(LIBELLES_ETAT[c.etat].toLowerCase(), (n.get(LIBELLES_ETAT[c.etat].toLowerCase()) ?? 0) + 1)
  const fiches = rp.evaluations.map((e) => e.ouvrage.fiche).filter((f) => f && !f.vide)
  const stables = fiches.filter((f) => {
    const st = Object.values(f!.stabilite)
    return st.length && st.every((x) => x === 'stable')
  }).length
  return `${[...n.entries()].map(([e, k]) => `${k} ${e}`).join(' · ')} — purges stabilisées : ${stables}/${fiches.length}`
}

/** Drop zone for the sampling sheets of the campaign (soil gas or groundwater). */
function DepotFiches({
  matrice,
  chargement,
  noms,
  resume,
  erreur,
  onFichiers,
  onRetirer,
}: {
  matrice: Matrice
  chargement: boolean
  noms: string[]
  resume: string | null | undefined
  erreur: string | null
  onFichiers: (f: File[]) => void
  onRetirer: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [survol, setSurvol] = useState(false)
  return (
    <div
      className={`depot depot--fiches${survol ? ' depot--survol' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setSurvol(true)
      }}
      onDragLeave={() => setSurvol(false)}
      onDrop={(e) => {
        e.preventDefault()
        setSurvol(false)
        onFichiers([...e.dataTransfer.files])
      }}
    >
      <input
        ref={input}
        type="file"
        multiple
        accept=".xlsx,.xlsm,.xls"
        style={{ display: 'none' }}
        onChange={(e) => {
          onFichiers([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
      <p style={{ margin: 0, fontWeight: 600 }}>{chargement ? 'Lecture des fiches…' : 'Fiches de prélèvement (facultatif)'}</p>
      <p style={{ margin: '0.25rem 0 0.75rem', fontSize: '0.88rem', color: 'var(--color-muted)' }}>
        {matrice === 'air'
          ? 'Le classeur des fiches de gaz du sol (une fiche par onglet) : durées et débits de prélèvement, et qualité du gaz capté (O₂, CO₂, H₂S, LIE, PID).'
          : 'Le classeur des fiches de prélèvement (une fiche par onglet) : conditions physico-chimiques de la nappe, qualité des purges, atténuation naturelle.'}
      </p>
      {noms.length > 0 && (
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.88rem' }}>
          <strong>{noms.join(', ')}</strong>
          {resume ? ` — ${resume}` : ''}
        </p>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn--petit" onClick={() => input.current?.click()} disabled={chargement}>
          {noms.length ? 'Ajouter des fiches' : 'Choisir les fiches'}
        </button>
        {noms.length > 0 && (
          <button type="button" className="btn btn--petit btn--ghost" onClick={onRetirer}>
            Retirer les fiches
          </button>
        )}
      </div>
      {erreur && (
        <p role="alert" className="alerte">
          {erreur}
        </p>
      )}
    </div>
  )
}

/** One Excel file of the export section. */
function FichierExport({
  teinte,
  titre,
  nom,
  description,
  enCours,
  desactive,
  onTelecharger,
}: {
  teinte: TeinteVolet
  titre: string
  nom: string
  description: string
  enCours: boolean
  desactive: boolean
  onTelecharger: () => void
}) {
  return (
    <div className={`fichier-export volet--${teinte}`}>
      <strong>{titre}</strong>
      <span className="fichier-export__nom">{nom}</span>
      <p>{description}</p>
      <button type="button" className="btn btn--petit" onClick={onTelecharger} disabled={desactive}>
        {enCours ? 'Préparation…' : 'Télécharger'}
      </button>
    </div>
  )
}

function CelluleGuide({
  parametre,
  guide,
  saisie,
  onChange,
}: {
  parametre: Parametre
  guide: { valeur: number; source: string } | null | undefined
  saisie: string | undefined
  onChange: (v: string) => void
}) {
  const auto = saisie === undefined || saisie.trim() === ''
  return (
    <>
      <td>
        <input
          className="tableau__guide"
          inputMode="decimal"
          value={saisie ?? ''}
          placeholder={guide ? fr(guide.valeur, 6) : '-'}
          aria-label={`Valeur guide — ${parametre.nom}`}
          onChange={(e) => onChange(e.target.value)}
        />
      </td>
      <td className="tableau__calcule" style={{ textAlign: 'center' }}>
        {auto ? (guide?.source ?? '-') : guide ? 'Saisie' : '-'}
      </td>
    </>
  )
}

function UnitesPoint({ unite, uniteBrute }: { unite: UniteSortie; uniteBrute: string }) {
  return (
    <>
      <th className="tableau__unite">{uniteBrute.replace(/\s+/g, '')}</th>
      <th className="tableau__unite tableau__conc">{unite}</th>
    </>
  )
}

function ValeursPoint({ brut, lq, conc, depasse, lqSup }: { brut: string; lq: boolean; conc: string; depasse: boolean; lqSup: boolean }) {
  return (
    <>
      <td className={lq ? 'tableau__lq' : undefined}>{brut}</td>
      <td
        className={`tableau__conc${lq ? ` tableau__lq${lqSup ? ' tableau__lq-sup' : ''}` : depasse ? ' tableau__depasse' : ''}`}
        title={lqSup ? 'Limite de quantification supérieure à la valeur de comparaison' : undefined}
      >
        {conc}
      </td>
    </>
  )
}

function LigneFamille({ afficher, famille, colonnes, children }: { afficher: boolean; famille: string; colonnes: number; children: ReactNode }) {
  return (
    <>
      {afficher && famille && (
        <tr className="tableau__famille">
          <td colSpan={colonnes}>{famille}</td>
        </tr>
      )}
      {children}
    </>
  )
}
