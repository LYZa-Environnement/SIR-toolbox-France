import { useCallback, useEffect, useMemo, useState } from 'react'
import ZoneDepot from '../components/ZoneDepot'
import Delimitation from '../components/modele3d/Delimitation'
import Evolution from '../components/modele3d/Evolution'
import Fiche, { type ForageVirtuel, type SelectionPage } from '../components/modele3d/Fiche'
import Filieres from '../components/modele3d/Filieres'
import Formations from '../components/modele3d/Formations'
import Frise, { type Etape } from '../components/modele3d/Frise'
import Legende from '../components/modele3d/Legende'
import MethodeLimites from '../components/modele3d/Methode'
import { dansRampe, divergente, RAMPE_INCERTITUDE, RAMPE_PID } from '../components/modele3d/palettes'
import Points from '../components/modele3d/Points'
import Schema from '../components/modele3d/Schema'
import Tableaux from '../components/modele3d/Tableaux'
import Vue3D from '../components/modele3d/Vue3D'
import type { Colonne, Couches, Coupe, MarqueurEaux, MarqueurGaz, MarqueurSol, Mesure, NomCouche, Outil, Rendu3D, Vue } from '../components/modele3d/rendu'
import { useCalcul } from '../components/modele3d/useCalcul'
import type { Repertoire } from '../lib/dossier/acces'
import type { PointDossier } from '../lib/dossier/points'
import { useDossier, usePointsDossier, useSynchroDossier } from '../lib/dossier/useSynchroDossier'
import { lireFeuilles, telechargerBlob } from '../lib/fichiers'
import { jourIso } from '../lib/format'
import { ringsOfGeometry, toLambert93 } from '../lib/geo'
import { assembler } from '../lib/modele3d/assemblage'
import { chargerCibles, type Cibles } from '../lib/modele3d/cibles'
import { schemaConceptuel, schemaSvg } from '../lib/modele3d/conceptuel'
import type { Systeme } from '../lib/modele3d/coordonnees'
import { couleurChamp, couleurValeur, etendue, type Echelle } from '../lib/modele3d/couleurs'
import { gazDeResultats, lireSourcesDossier } from '../lib/modele3d/dossier'
import type { Proposition } from '../lib/modele3d/delimitation'
import { aquifereDe, HYDRO_DEFAUT, hypothesesDe, masqueAquifere, RAPPORT_ANISOTROPIE, type ReglagesHydro } from '../lib/modele3d/hydrogeologie'
import { exemple } from '../lib/modele3d/exemple'
import { FILIERES, ORDRE_FILIERES } from '../lib/modele3d/filieres'
import { fr, frM } from '../lib/modele3d/format'
import { motsCles, type ConfigFormations } from '../lib/modele3d/formations'
import { chargerMnt, FONDS, urlFond, type FondSol } from '../lib/modele3d/ign'
import { valeurEn, type Grille } from '../lib/modele3d/interpolation'
import { LIBELLES_METHODE, type Methode } from '../lib/modele3d/krigeage'
import { CLASSES_LITHO } from '../lib/modele3d/lithologie'
import { lireClasseurLogs } from '../lib/modele3d/logs'
import {
  construireModele,
  isolignes,
  limitesCoursDEau,
  nappeCampagne,
  nappeForation,
  nappeNiveaux,
  niveauxIsolignes,
  panache,
  pointsSol,
  predicatEmprise,
  relevesSansCampagne,
  type Representation,
  type SaisiePoint,
} from '../lib/modele3d/modele'
import type { Source } from '../lib/modele3d/types'
import { valeurGuideEn } from '../lib/resultats/guides'
import { LectureImpossible } from '../lib/resultats/parse'
import { CLASSES, reference } from '../lib/suivi/analyse'
import { formatDate } from '../lib/suivi/dates'
import { lireFichier } from '../lib/suivi/import'
import type { Compose, Niveau } from '../lib/suivi/modele'
import { anneeDecimale } from '../lib/suivi/stats'

interface Reglages {
  couches: Couches
  fond: FondSol
  opaciteSol: number
  /** null: chosen from the model's proportions. */
  exag: number | null
  classesMasquees: string[]
  pointsMasques: string[]
  /** null: the compound that exceeds most often; '': none. */
  compose: string | null
  panache: boolean
  parametreSol: string | null
  seuilSol: string
  enveloppe: boolean
  coupe: { axe: Coupe['axe']; valeur: number | null; inverse: boolean }
  /** null: the latest date. */
  etape: number | null
  /** Date compared with the one shown (index), or null. */
  comparaison: number | null
  solsALaDate: boolean
  etendre: boolean
  systeme: Systeme | 'auto'
  saisies: Record<string, SaisiePoint>
  methode: Methode
  representation: Representation
  formations: ConfigFormations | null
  /** Exploded view: metres between formations. */
  ecart: number
  parametreGaz: string | null
  incertitude: boolean
  /** Water table coloured by the probability of exceeding the comparison value. */
  probabilite: boolean
  /** Number of wells proposed to delineate the plume. */
  propositions: number
  /** Hydrogeology and behaviour of the compound for the plume and its delineation. */
  hydro: ReglagesHydro
  limitesCoursEau: boolean
  revanche: number
  porosite: number
  epaisseur: number
  densite: number
  valeursSurvol: boolean
  /** Items of the conceptual model kept or set aside by the user. */
  schema: Record<string, boolean>
}

const COUCHES_DEFAUT: Couches = {
  sol: true,
  geologie: true,
  forages: true,
  equipement: true,
  pid: false,
  observations: true,
  nappe: true,
  isopiezes: true,
  eaux: true,
  echantillons: true,
  enveloppe: true,
  filieres: false,
  gaz: true,
  delimitation: true,
  batiments: false,
  coursdeau: true,
  etiquettes: true,
  cadre: true,
}

const REGLAGES_DEFAUT: Reglages = {
  couches: COUCHES_DEFAUT,
  fond: 'aucun',
  opaciteSol: 0.45,
  exag: null,
  classesMasquees: [],
  pointsMasques: [],
  compose: null,
  panache: true,
  parametreSol: null,
  seuilSol: '',
  enveloppe: false,
  coupe: { axe: 'aucune', valeur: null, inverse: false },
  etape: null,
  comparaison: null,
  solsALaDate: false,
  etendre: false,
  systeme: 'auto',
  saisies: {},
  methode: 'krigeage',
  representation: 'formations',
  formations: null,
  ecart: 0,
  parametreGaz: null,
  incertitude: false,
  probabilite: false,
  propositions: 3,
  hydro: HYDRO_DEFAUT,
  limitesCoursEau: false,
  revanche: 0.5,
  porosite: 0.2,
  epaisseur: 5,
  densite: 1.8,
  valeursSurvol: false,
  schema: {},
}

const LIBELLES_COUCHES: [NomCouche, string][] = [
  ['sol', 'Surface du sol'],
  ['geologie', 'Géologie'],
  ['forages', 'Forages (lithologie)'],
  ['equipement', 'Crépines et tubes'],
  ['pid', 'Mesures PID'],
  ['observations', 'Observations organoleptiques'],
  ['nappe', 'Surface de la nappe'],
  ['isopiezes', 'Isopièzes'],
  ['eaux', 'Ouvrages : niveau et concentration'],
  ['echantillons', 'Échantillons de sol'],
  ['gaz', 'Gaz du sol'],
  ['filieres', 'Terres par filière'],
  ['delimitation', 'Délimitation du panache (limite des ouvrages, emplacements proposés)'],
  ['batiments', 'Bâtiments (BD TOPO)'],
  ['coursdeau', 'Cours d’eau (BD TOPO)'],
  ['etiquettes', 'Noms des forages'],
  ['cadre', 'Cadre, cotes, parcelles et nord'],
]

const VUES: [Vue, string][] = [
  ['3d', 'Perspective'],
  ['dessus', 'Plan'],
  ['sud', 'Depuis le sud'],
  ['est', 'Depuis l’est'],
]

type Preset = 'geologie' | 'nappe' | 'sols' | 'ensemble'

const PRESETS: Record<Preset, { libelle: string; couches: Partial<Couches>; opaciteSol: number; coupe: Reglages['coupe']; vue: Vue }> = {
  geologie: {
    libelle: 'Géologie',
    couches: { geologie: true, forages: true, nappe: false, isopiezes: false, eaux: false, echantillons: false, gaz: false, filieres: false, observations: false, pid: false, batiments: false, delimitation: false },
    opaciteSol: 0.25,
    coupe: { axe: 'y', valeur: null, inverse: false },
    vue: 'sud',
  },
  nappe: {
    libelle: 'Nappe et panache',
    couches: { geologie: false, forages: true, equipement: true, nappe: true, isopiezes: true, eaux: true, echantillons: false, gaz: false, filieres: false, observations: false, pid: false, coursdeau: true, delimitation: true },
    opaciteSol: 0.35,
    coupe: { axe: 'aucune', valeur: null, inverse: false },
    vue: '3d',
  },
  sols: {
    libelle: 'Sols et gaz',
    couches: { geologie: false, forages: true, nappe: false, isopiezes: false, eaux: false, echantillons: true, gaz: true, observations: true, pid: true, filieres: false, delimitation: false },
    opaciteSol: 0.3,
    coupe: { axe: 'aucune', valeur: null, inverse: false },
    vue: '3d',
  },
  ensemble: {
    libelle: 'Vue d’ensemble',
    couches: { ...COUCHES_DEFAUT, batiments: false },
    opaciteSol: 0.45,
    coupe: { axe: 'aucune', valeur: null, inverse: false },
    vue: '3d',
  },
}

type Onglet = 'calques' | 'geologie' | 'eaux' | 'sols' | 'vue'
const ONGLETS: [Onglet, string][] = [
  ['calques', 'Calques'],
  ['geologie', 'Géologie'],
  ['eaux', 'Eaux'],
  ['sols', 'Sols et gaz'],
  ['vue', 'Coupe et vue'],
]

const lireNombre = (s: string) => {
  const n = Number(s.replace(/\s/g, '').replace(',', '.'))
  return s.trim() && Number.isFinite(n) && n > 0 ? n : null
}

/** No dossier points: one empty list, so that the data are not put together again for nothing. */
const AUCUN_POINT: PointDossier[] = []
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`

/** Soil guide values (ERM, sur site) by soil parameter key. */
function guidesSol(parametres: { cle: string; nom: string; cas: string; unite: string; famille: string }[]) {
  const m = new Map<string, { valeur: number; source: string }>()
  for (const p of parametres) {
    const g = valeurGuideEn('sol', { cle: p.cle, famille: p.famille, nom: p.nom, cas: p.cas, unite: p.unite, versMicrogrammes: 1, somme: false }, { metaux: 'sur site', repere: 'r1' }, p.unite)
    if (g) m.set(p.cle, g)
  }
  return m
}

// Elevation grids and surroundings already fetched, by extent: going back to a dossier asks nothing again.
const MNT = new Map<string, Grille | null>()
const CIBLES = new Map<string, Cibles>()
const AUCUNE: Source[] = []
const AUCUNE_ERREUR: string[] = []
const RIEN: never[] = []
const AUCUNE_PROPOSITION: Proposition[] = []
/** Marks of the timeline: the delineation's verdict at each campaign. */
const VERDICTS = {
  delimite: { couleur: '#2f8f5b', libelle: 'délimité' },
  'a-confirmer': { couleur: '#d9a521', libelle: 'délimité, à confirmer' },
  'non-delimite': { couleur: '#b3261e', libelle: 'non délimité' },
  'aucun-depassement': { couleur: '#b8c2c0', libelle: 'sans dépassement' },
} as const

export default function Modele3D() {
  const [fichiers, setFichiers] = useState<Source[]>([])
  const [avecExemple, setAvecExemple] = useState(false)
  const [exclues, setExclues] = useState<string[]>([])
  const [reglages, setReglages] = useState<Reglages>(REGLAGES_DEFAUT)
  const [chargement, setChargement] = useState(false)
  const [erreurs, setErreurs] = useState<string[]>([])
  const [selection, setSelection] = useState<SelectionPage | null>(null)
  const [rendu, setRendu] = useState<Rendu3D | null>(null)
  const [etatFond, setEtatFond] = useState<{ url: string; etat: 'ok' | 'erreur' } | null>(null)
  const [vignetteKo, setVignetteKo] = useState<string | null>(null)
  const [outil, setOutil] = useState<Outil>('selection')
  const [mesure, setMesure] = useState<Mesure | null>(null)
  const [onglet, setOnglet] = useState<Onglet>('calques')
  const [legendeOuverte, setLegendeOuverte] = useState(() => typeof window === 'undefined' || window.matchMedia?.('(min-width: 641px)').matches !== false)

  const regler = useCallback(<K extends keyof Reglages>(k: K, v: Reglages[K]) => setReglages((r) => ({ ...r, [k]: v })), [])

  // ---- Dossier ---------------------------------------------------------------------------------
  const dossier = useDossier()
  const repertoire = dossier.etat === 'ouvert' ? dossier.dossier.repertoire : null
  const siteDossier = dossier.etat === 'ouvert' ? dossier.dossier.fiche.site : null
  // The dossier's investigation points: coordinates and elevations the files do not give.
  const etatPoints = usePointsDossier()
  const pointsDossier = etatPoints.etat === 'pret' ? etatPoints.points : AUCUN_POINT
  // What the dossier's tools hold, read again on demand and when coming back to the tab
  // (the logs or the monitoring may have changed in another tab); kept when nothing changed on disk.
  const [demande, setDemande] = useState(0)
  const [lu, setLu] = useState<{ repertoire: Repertoire; demande: number; sources: Source[]; erreurs: string[]; signature: string } | null>(null)
  useEffect(() => {
    if (!repertoire) return
    let actif = true
    lireSourcesDossier(repertoire)
      .then((l) => {
        if (actif) setLu((avant) => (avant && avant.repertoire === repertoire && avant.signature === l.signature ? { ...avant, demande } : { repertoire, demande, ...l }))
      })
      .catch((e) => actif && setLu({ repertoire, demande, sources: [], erreurs: [`Lecture du dossier impossible : ${(e as Error).message}`], signature: '' }))
    return () => {
      actif = false
    }
  }, [repertoire, demande])
  useEffect(() => {
    const retour = () => {
      if (document.visibilityState === 'visible') setDemande((d) => d + 1)
    }
    document.addEventListener('visibilitychange', retour)
    return () => document.removeEventListener('visibilitychange', retour)
  }, [])
  const luCourant = repertoire && lu?.repertoire === repertoire ? lu : null
  const sourcesDossier = luCourant?.sources ?? AUCUNE
  const erreursDossier = luCourant?.erreurs ?? AUCUNE_ERREUR
  const lectureDossier = !!repertoire && luCourant?.demande !== demande
  const relire = () => setDemande((d) => d + 1)

  const sauve = useMemo(() => ({ fichiers, avecExemple, exclues, reglages }), [fichiers, avecExemple, exclues, reglages])
  useSynchroDossier({
    outil: 'modele-3d',
    version: 1,
    etat: sauve,
    estVide: !fichiers.length && !avecExemple && JSON.stringify(reglages) === JSON.stringify(REGLAGES_DEFAUT),
    appliquer: (d) => {
      setFichiers(d.fichiers)
      setAvecExemple(d.avecExemple)
      setExclues(d.exclues)
      setReglages({ ...REGLAGES_DEFAUT, ...d.reglages, couches: { ...COUCHES_DEFAUT, ...d.reglages?.couches }, hydro: { ...HYDRO_DEFAUT, ...d.reglages?.hydro } })
      setSelection(null)
      setErreurs([])
    },
  })

  // ---- Sources and model -------------------------------------------------------------------
  const sourceExemple = useMemo(() => (avecExemple ? exemple() : null), [avecExemple])
  const sources = useMemo(
    () => [...sourcesDossier.filter((s) => !exclues.includes(s.id)), ...(sourceExemple ? [sourceExemple] : []), ...fichiers],
    [sourcesDossier, exclues, sourceExemple, fichiers],
  )
  const donnees = useMemo(() => (sources.length ? assembler(sources, pointsDossier) : null), [sources, pointsDossier])
  // The parcels of the dossier's site (Lambert 93); else those of a source (the example's).
  const parcellesSite = useMemo(
    () => (siteDossier?.emprise ? ringsOfGeometry(siteDossier.emprise).map((a) => a.map(([lon, lat]) => toLambert93(lat, lon) as [number, number])) : undefined),
    [siteDossier],
  )
  const { etendre, systeme, saisies, methode, representation, formations: configFormations } = reglages
  const optionsBase = useMemo(
    () => ({ etendre, systeme, saisies, methode, representation, formations: configFormations, ...(parcellesSite ? { parcelles: parcellesSite } : {}) }),
    [etendre, systeme, saisies, methode, representation, configFormations, parcellesSite],
  )
  const presente = !!donnees && (donnees.forages.length > 0 || (donnees.base?.ouvrages.length ?? 0) > 0)
  // Extent and system first, without the geology (fast, in place): the relief to fetch depends on them.
  const apercu = useMemo(() => (presente ? construireModele(donnees!, { ...optionsBase, sansGeologie: true }) : null), [presente, donnees, optionsBase])
  // The example's elevations are made up: IGN's relief of the real place under it would not match them.
  const avecMnt = sources.some((x) => x.origine !== 'exemple')
  const cleEmprise = apercu?.georef
    ? [apercu.emprise.xmin + apercu.origine.x, apercu.emprise.ymin + apercu.origine.y, apercu.emprise.xmax + apercu.origine.x, apercu.emprise.ymax + apercu.origine.y].map((v) => Math.round(v)).join(',')
    : null
  const cleMnt = avecMnt ? cleEmprise : null
  const [erreurMnt, setErreurMnt] = useState<{ cle: string; message: string } | null>(null)
  const [, setRecus] = useState(0)
  useEffect(() => {
    if (!cleMnt || MNT.has(cleMnt)) return
    let actif = true
    const [x0, y0, x1, y1] = cleMnt.split(',').map(Number)
    chargerMnt(x0, y0, x1, y1)
      .then((g) => {
        MNT.set(cleMnt, g)
        if (!actif) return
        if (!g) setErreurMnt({ cle: cleMnt, message: 'le service n’a pas donné assez d’altitudes sur l’emprise' })
        setRecus((n) => n + 1)
      })
      .catch((e) => actif && setErreurMnt({ cle: cleMnt, message: (e as Error).message }))
    return () => {
      actif = false
    }
  }, [cleMnt])
  const grilleMnt = cleMnt ? (MNT.get(cleMnt) ?? null) : null
  const mntPret = !cleMnt || MNT.has(cleMnt) || erreurMnt?.cle === cleMnt
  const argsModele = useMemo(() => (presente && mntPret ? ([donnees!, { ...optionsBase, mnt: grilleMnt ? { grille: grilleMnt } : null }] as const) : null), [presente, mntPret, donnees, optionsBase, grilleMnt])
  const calculModele = useCalcul('construireModele', argsModele)
  const modele = calculModele.resultat
  const base = donnees?.base ?? null

  // Surroundings (buildings, watercourses, abstractions), once per extent.
  const [cibles, setCibles] = useState<{ cle: string; cibles: Cibles } | null>(null)
  useEffect(() => {
    if (!cleEmprise || !modele?.georef) return
    const deja = CIBLES.get(cleEmprise)
    let actif = true
    ;(deja ? Promise.resolve(deja) : chargerCibles(modele)).then((c) => {
      CIBLES.set(cleEmprise, c)
      if (actif) setCibles({ cle: cleEmprise, cibles: c })
    })
    return () => {
      actif = false
    }
  }, [cleEmprise, modele])
  const ciblesCourantes = cibles && cibles.cle === cleEmprise ? cibles.cibles : null
  const etatCibles = !modele?.georef ? 'indisponible' : ciblesCourantes ? 'ok' : 'chargement'
  const lignesCoursEau = useMemo(() => ciblesCourantes?.coursDEau.flatMap((c) => c.lignes) ?? RIEN, [ciblesCourantes])
  // On the site: within its parcels, else between the boreholes.
  const dansSite = useMemo(() => (modele ? predicatEmprise({ ...modele, etendre: false }) : null), [modele])
  const batimentSurSite = useCallback((b: { anneau: [number, number][] }) => !!dansSite && b.anneau.some(([x, y]) => dansSite(x, y)), [dansSite])

  // ---- Dates -------------------------------------------------------------------------------
  const etapes = useMemo(() => {
    const liste: (Etape & { campagne: string | null; date: string; niveaux?: Niveau[] })[] = []
    const forages = modele?.points.filter((p) => p.forage?.niveauEau != null) ?? []
    if (forages.length) {
      const dates = forages.map((p) => p.forage!.date).filter(Boolean).sort()
      liste.push({
        id: 'foration',
        libelle: 'À la foration',
        detail: dates.length ? `niveaux relevés en forant (${formatDate(dates[0])}${dates[dates.length - 1] !== dates[0] ? ` – ${formatDate(dates[dates.length - 1])}` : ''})` : 'niveaux relevés en forant',
        campagne: null,
        date: dates[dates.length - 1] ?? '',
        t: dates.length ? anneeDecimale(dates[0]) : null,
        type: 'foration',
        regime: null,
      })
    }
    const dates: (Etape & { campagne: string | null; date: string; niveaux?: Niveau[] })[] = []
    for (const c of base?.campagnes ?? [])
      dates.push({ id: c.id, libelle: formatDate(c.date), detail: c.regime === 'HE' ? 'hautes eaux' : c.regime === 'BE' ? 'basses eaux' : '', campagne: c.id, date: c.date, t: c.t, type: 'campagne', regime: c.regime })
    // Water levels of sampling sheets with no lab campaign within a month: rounds of their own.
    for (const t of base ? relevesSansCampagne(base) : [])
      dates.push({
        id: t.id,
        libelle: t.fin !== t.debut ? `${formatDate(t.debut)} – ${formatDate(t.fin)}` : formatDate(t.debut),
        detail: `niveaux d’eau seuls (${pluriel(new Set(t.niveaux.map((n) => n.ouvrage)).size, 'ouvrage')}, sans analyses)`,
        campagne: null,
        date: t.debut,
        niveaux: t.niveaux,
        t: anneeDecimale(t.debut),
        type: 'releve',
        regime: null,
      })
    return [...liste, ...dates.sort((a, b) => a.date.localeCompare(b.date))]
  }, [modele, base])
  const indexEtape = reglages.etape === null ? etapes.length - 1 : Math.min(Math.max(0, reglages.etape), etapes.length - 1)
  const etape = etapes[indexEtape] ?? null
  const campagne = etape?.campagne ?? null
  const etapeA = reglages.comparaison !== null && reglages.comparaison !== indexEtape ? (etapes[reglages.comparaison] ?? null) : null
  const surIndex = useCallback((i: number) => regler('etape', i), [regler])
  const surComparaison = useCallback((i: number | null) => regler('comparaison', i), [regler])

  // ---- Groundwater -------------------------------------------------------------------------
  const corrections = donnees?.corrections
  const composeAuto = useMemo(() => {
    if (!base || !corrections) return null
    let meilleur: Compose | null = null
    let score = -1
    for (const c of base.composes) {
      if (c.terrain) continue
      const ref = reference(c, corrections)?.valeur ?? null
      const q = base.resultats.filter((r) => r.compose === c.cle && !r.inferieur && !r.exclu)
      const s = (ref ? q.filter((r) => r.valeur > ref).length * 1000 : 0) + q.length
      if (s > score) [meilleur, score] = [c, s]
    }
    return meilleur?.cle ?? null
  }, [base, corrections])
  const cleCompose = reglages.compose === null ? composeAuto : reglages.compose || null
  const compose = base?.composes.find((c) => c.cle === cleCompose) ?? null
  const refEaux = compose && corrections ? reference(compose, corrections) : null
  const echelleEaux = useMemo<Echelle | null>(() => {
    if (!compose || !base) return null
    const lineaire = !!compose.terrain
    return { reference: lineaire ? null : (refEaux?.valeur ?? null), lineaire, ...etendue(base.resultats.filter((r) => r.compose === compose.cle && !r.exclu), lineaire) }
  }, [compose, base, refEaux])
  const argsTendances = useMemo(() => (base && corrections && base.campagnes.length >= 2 ? ([base, corrections] as const) : null), [base, corrections])
  const tendances = useCalcul('tendances', argsTendances).resultat ?? RIEN

  // Watercourses as fixed heads (optional, approximate).
  const limites = useMemo(
    () => (modele && reglages.limitesCoursEau && lignesCoursEau.length ? limitesCoursDEau(modele, lignesCoursEau, reglages.revanche) : RIEN),
    [modele, reglages.limitesCoursEau, lignesCoursEau, reglages.revanche],
  )
  const nappeDe = useCallback(
    (e: (typeof etapes)[number] | null) => {
      if (!modele || !e) return null
      if (e.campagne && base) return nappeCampagne(modele, base, e.campagne, limites)
      if (e.niveaux) return nappeNiveaux(modele, e.niveaux, limites)
      return e.id === 'foration' ? nappeForation(modele, limites) : null
    },
    [modele, base, limites],
  )
  const nappe = useMemo(() => nappeDe(etape), [nappeDe, etape])
  const nappeA = useMemo(() => nappeDe(etapeA), [nappeDe, etapeA])
  // The latest campaign's water table: the conceptual model's, and the flow when the date shown has none.
  const nappeSchema = useMemo(() => nappeDe(etapes.filter((e) => e.campagne).at(-1) ?? etapes.at(-1) ?? null), [nappeDe, etapes])
  const ecoulement = nappe?.ecoulement ?? nappeSchema?.ecoulement ?? null
  const avalDelimitation = ecoulement?.azimut ?? null
  // The plume as the geology shapes it: stretched along the flow, within the aquifer the wells are screened in.
  const hydro = reglages.hydro
  const aquifere = useMemo(() => (modele && base ? aquifereDe(modele, base) : null), [modele, base])
  const masque = useMemo(() => (modele && hydro.limiterAquifere ? masqueAquifere(modele, aquifere) : null), [modele, aquifere, hydro.limiterAquifere])
  const optionsPanache = useMemo(
    () => ({ anisotropie: hydro.anisotropie && avalDelimitation !== null ? { azimut: avalDelimitation, rapport: RAPPORT_ANISOTROPIE } : null, garder: masque }),
    [hydro.anisotropie, avalDelimitation, masque],
  )
  const pan = useMemo(() => (modele && base && compose && campagne ? panache(modele, base, compose.cle, campagne, !!compose.terrain, true, optionsPanache) : null), [modele, base, compose, campagne, optionsPanache])
  const panA = useMemo(
    () => (modele && base && compose && etapeA?.campagne ? panache(modele, base, compose.cle, etapeA.campagne, !!compose.terrain, false, optionsPanache) : null),
    [modele, base, compose, etapeA, optionsPanache],
  )
  const comparaisonConc = !!(pan?.champ && panA?.champ && reglages.panache && !compose?.terrain)

  // ---- Delineation of the plume ------------------------------------------------------------
  const chargesDate = useMemo(() => Object.fromEntries((nappe?.charges ?? []).map((c) => [c.cle, c.charge])), [nappe])
  const argsDelimitation = useMemo(
    () =>
      modele && base && compose && !compose.terrain && campagne && refEaux?.valeur
        ? ([
            modele,
            base,
            compose.cle,
            campagne,
            refEaux.valeur,
            {
              aval: avalDelimitation,
              gradient: ecoulement?.gradient ?? null,
              nappe: nappe ? { grille: nappe.grille, plan: nappe.plan } : null,
              charges: chargesDate,
              propositions: reglages.propositions,
              hypotheses: hypothesesDe(hydro, compose.cle),
              anisotropie: hydro.anisotropie ? RAPPORT_ANISOTROPIE : null,
              limiterAquifere: hydro.limiterAquifere,
            },
          ] as const)
        : null,
    [modele, base, compose, campagne, refEaux, avalDelimitation, ecoulement, nappe, chargesDate, reglages.propositions, hydro],
  )
  const delimitation = useCalcul('delimiterPanache', argsDelimitation).resultat
  // The verdict at every campaign, each with its own flow: when the plume opened or closed.
  const argsVerdicts = useMemo(
    () =>
      modele && base && compose && !compose.terrain && refEaux?.valeur
        ? ([
            modele,
            base,
            compose.cle,
            refEaux.valeur,
            { aval: avalDelimitation, hypotheses: hypothesesDe(hydro, compose.cle), anisotropie: hydro.anisotropie ? RAPPORT_ANISOTROPIE : null, limiterAquifere: hydro.limiterAquifere },
          ] as const)
        : null,
    [modele, base, compose, refEaux, avalDelimitation, hydro],
  )
  const verdicts = useCalcul('delimitationsParCampagne', argsVerdicts).resultat
  const marquesFrise = useMemo(() => {
    if (!verdicts?.length) return null
    const parEtape: Record<string, { couleur: string; titre: string }> = {}
    for (const v of verdicts) parEtape[v.campagne] = { couleur: VERDICTS[v.verdict].couleur, titre: `panache ${VERDICTS[v.verdict].libelle}` }
    return { parEtape, legende: (Object.keys(VERDICTS) as (keyof typeof VERDICTS)[]).filter((k) => verdicts.some((v) => v.verdict === k)).map((k) => ({ couleur: VERDICTS[k].couleur, libelle: `panache ${VERDICTS[k].libelle}` })) }
  }, [verdicts])
  const couleursNappe = useMemo(() => {
    if (!nappe?.grille) return null
    const g = nappe.grille
    if (etapeA && comparaisonConc && pan?.champ && panA?.champ) {
      // Ratio of the concentrations, from ÷10 (green) to ×10 (red).
      const a = panA.champ
      return Array.from(pan.champ, (v, q) => (Number.isFinite(v) && Number.isFinite(a[q]) ? divergente(v - a[q], '#2f8f5b', '#b3261e') : null))
    }
    if (etapeA && nappeA?.grille) {
      // Change of head, ±1 m at full colour: blue up, brown down.
      const a = nappeA.grille.valeurs
      return Array.from(g.valeurs, (v, q) => (Number.isFinite(v) && Number.isFinite(a[q]) ? divergente(v - a[q], '#9c5b1f', '#1f5f9c') : null))
    }
    if (reglages.probabilite && delimitation?.probabilite && delimitation.probabilite.length === g.nx * g.ny) {
      // Probability of exceeding the comparison value: green certain below, grey doubtful, red certain above.
      return Array.from(delimitation.probabilite, (v) => (Number.isFinite(v) ? divergente(2 * v - 1, '#2f8f5b', '#b3261e') : null))
    }
    if (reglages.incertitude && nappe.incertitude) {
      const vs = [...nappe.incertitude].filter((x) => Number.isFinite(x))
      const max = Math.max(0.01, ...vs)
      return Array.from(nappe.incertitude, (v) => (Number.isFinite(v) ? dansRampe(RAMPE_INCERTITUDE, v / max) : null))
    }
    if (reglages.panache && pan?.champ && echelleEaux) return Array.from(pan.champ, (v) => couleurChamp(v, echelleEaux))
    return null
  }, [nappe, nappeA, etapeA, comparaisonConc, pan, panA, reglages.probabilite, delimitation, reglages.incertitude, reglages.panache, echelleEaux])
  const lignesIso = useMemo(() => (nappe?.grille && reglages.couches.isopiezes ? isolignes(nappe.grille, niveauxIsolignes(nappe.grille)) : RIEN), [nappe, reglages.couches.isopiezes])
  const marqueursEaux = useMemo<MarqueurEaux[]>(() => {
    if (!modele) return []
    const liste: MarqueurEaux[] = []
    for (const p of modele.points) {
      const c = nappe?.charges.find((x) => x.cle === p.cle)
      const r = pan?.valeurs.find((x) => x.cle === p.cle)?.resultat
      if (!c && !r) continue
      const z = p.crepine ? p.zSol - (p.crepine.de + p.crepine.a) / 2 : c ? c.charge - 1 : p.zSol - 3
      liste.push({ cle: p.cle, charge: c?.charge ?? null, valeur: r && echelleEaux ? { z, couleur: couleurValeur(r.valeur, r.inferieur, echelleEaux) } : null })
    }
    return liste
  }, [modele, nappe, pan, echelleEaux])

  // ---- Soils and gas -----------------------------------------------------------------------
  const parametresSol = useMemo(() => donnees?.parametresSol ?? [], [donnees])
  const guides = useMemo(() => guidesSol(parametresSol), [parametresSol])
  const parametreAuto = useMemo(() => {
    if (!modele || !parametresSol.length) return null
    let meilleur = parametresSol[0].cle
    let score = -1
    for (const p of parametresSol) {
      if (p.eluat) continue
      const g = guides.get(p.cle)?.valeur ?? null
      const pts = pointsSol(modele, p.cle).filter((x) => !x.inferieur && x.valeur !== null)
      const s = (g ? pts.filter((x) => x.valeur! > g).length * 1000 : 0) + pts.length
      if (s > score) [meilleur, score] = [p.cle, s]
    }
    return meilleur
  }, [modele, parametresSol, guides])
  const cleParametre = reglages.parametreSol === null ? parametreAuto : reglages.parametreSol || null
  const parametreSol = parametresSol.find((p) => p.cle === cleParametre) ?? null
  const guide = parametreSol ? (guides.get(parametreSol.cle) ?? null) : null
  const sols = useMemo(() => {
    if (!modele || !parametreSol) return []
    const tous = pointsSol(modele, parametreSol.cle)
    return reglages.solsALaDate && etape?.date ? tous.filter((p) => !p.date || p.date <= etape.date) : tous
  }, [modele, parametreSol, reglages.solsALaDate, etape])
  const echelleSol = useMemo<Echelle>(() => ({ reference: guide?.valeur ?? null, lineaire: false, ...etendue(sols, false) }), [guide, sols])
  const marqueursSol = useMemo<MarqueurSol[]>(
    () => sols.map((s) => ({ cle: s.cle, echantillon: s.echantillon, x: s.x, y: s.y, z: s.z, couleur: couleurValeur(s.valeur, s.inferieur, echelleSol), petit: s.inferieur })),
    [sols, echelleSol],
  )
  const seuil = lireNombre(reglages.seuilSol) ?? guide?.valeur ?? null
  const argsEnveloppe = useMemo(() => (modele && parametreSol && seuil && reglages.enveloppe ? ([modele, parametreSol.cle, seuil] as const) : null), [modele, parametreSol, seuil, reglages.enveloppe])
  const enveloppe = useCalcul('enveloppeSols', argsEnveloppe).resultat
  const argsFilieres = useMemo(() => (modele && parametresSol.length ? ([modele, parametresSol] as const) : null), [modele, parametresSol])
  const filieres = useCalcul('volumesFilieres', argsFilieres).resultat

  const parametresGaz = useMemo(() => donnees?.parametresGaz ?? [], [donnees])
  const guidesGaz = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of parametresGaz) {
      const g = valeurGuideEn('air', { cle: p.cle, famille: p.famille, nom: p.nom, cas: p.cas, unite: p.unite, versMicrogrammes: 1, somme: false }, { metaux: 'sur site', repere: 'r1' }, p.unite)
      if (g) m.set(p.cle, g.valeur)
    }
    return m
  }, [parametresGaz])
  const gazAuto = useMemo(() => {
    let meilleur: string | null = null
    let max = -1
    for (const p of parametresGaz) {
      const r = guidesGaz.get(p.cle) ?? null
      const n = (donnees?.gaz ?? []).filter((g) => g.resultats[p.cle] && !g.resultats[p.cle].inferieur && (r === null || g.resultats[p.cle].valeur! > r)).length
      if (n > max) [meilleur, max] = [p.cle, n]
    }
    return meilleur
  }, [parametresGaz, guidesGaz, donnees])
  const cleGaz = reglages.parametreGaz === null ? gazAuto : reglages.parametreGaz || null
  const parametreGaz = parametresGaz.find((p) => p.cle === cleGaz) ?? null
  const echelleGaz = useMemo<Echelle | null>(() => {
    if (!parametreGaz) return null
    return { reference: guidesGaz.get(parametreGaz.cle) ?? null, lineaire: false, ...etendue((donnees?.gaz ?? []).flatMap((g) => (g.resultats[parametreGaz.cle] ? [g.resultats[parametreGaz.cle]] : [])), false) }
  }, [parametreGaz, guidesGaz, donnees])
  const marqueursGaz = useMemo<MarqueurGaz[]>(() => {
    if (!modele || !parametreGaz || !echelleGaz) return []
    return (donnees?.gaz ?? []).flatMap((g) => {
      const p = modele.points.find((x) => x.cle === g.cle)
      const v = g.resultats[parametreGaz.cle]
      if (!p || !v) return []
      const z = p.crepine ? p.zSol - (p.crepine.de + p.crepine.a) / 2 : p.zSol - (p.forage?.profondeur ?? 1)
      return [{ cle: p.cle, x: p.x, y: p.y, z, couleur: couleurValeur(v.valeur, v.inferieur, echelleGaz) }]
    })
  }, [modele, parametreGaz, echelleGaz, donnees])

  const pid = useMemo(() => {
    const vs = (modele?.points ?? []).flatMap((p) => (p.forage?.pid ?? []).map((m) => m.valeur)).filter((v) => v > 0)
    if (!modele || !vs.length) return RIEN
    const [min, max] = [Math.min(...vs), Math.max(...vs)]
    const t = (v: number) => (max > min ? (Math.log10(Math.max(v, min)) - Math.log10(min)) / (Math.log10(max) - Math.log10(min)) : 0.5)
    return modele.points.flatMap((p) => (p.forage?.pid ?? []).map((m, index) => ({ cle: p.cle, index, de: m.de, a: m.a, couleur: dansRampe(RAMPE_PID, t(m.valeur)) })))
  }, [modele])
  const observations = useMemo(() => (modele ? modele.points.flatMap((p) => (p.forage?.observations ?? []).map((o, index) => ({ cle: p.cle, index, z: p.zSol - (o.de + o.a) / 2 }))) : RIEN), [modele])

  // ---- Labels ------------------------------------------------------------------------------
  const libelles = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const p of modele?.points ?? []) {
      const r = pan?.valeurs.find((x) => x.cle === p.cle)?.resultat
      const t = compose ? tendances.find((x) => x.ouvrage === p.cle && x.compose === compose.cle) : undefined
      const lignes = [p.nom]
      if (!reglages.valeursSurvol && reglages.couches.eaux) {
        if (etapeA && comparaisonConc) {
          // Ratio of the concentrations at the well, as the surface shows it.
          const ra = panA?.valeurs.find((x) => x.cle === p.cle)?.resultat
          if (r && ra && r.valeur > 0 && ra.valeur > 0) {
            const k = r.valeur / ra.valeur
            lignes.push(k >= 1 ? `× ${fr(k, 2)}` : `÷ ${fr(1 / k, 2)}`)
          }
        } else if (etapeA && nappe && nappeA) {
          const c = nappe.charges.find((x) => x.cle === p.cle)
          const ca = nappeA.charges.find((x) => x.cle === p.cle)
          if (c && ca) lignes.push(`Δ ${c.charge - ca.charge >= 0 ? '+' : '−'}${fr(Math.abs(c.charge - ca.charge), 2)} m`)
        } else if (r && compose) lignes.push(`${r.brut} ${compose.unite}${t && t.classe !== 'insuffisant' ? ` ${CLASSES[t.classe].symbole}` : ''}`)
      }
      m.set(p.cle, lignes)
    }
    return m
  }, [modele, pan, panA, comparaisonConc, compose, tendances, reglages.valeursSurvol, reglages.couches.eaux, etapeA, nappe, nappeA])

  // ---- Evolution of the plume --------------------------------------------------------------
  const argsEvolution = useMemo(
    () =>
      modele && base && compose && !compose.terrain && base.campagnes.length >= 2
        ? ([modele, base, compose.cle, refEaux?.valeur ?? null, reglages.porosite, reglages.epaisseur, optionsPanache] as const)
        : null,
    [modele, base, compose, refEaux, reglages.porosite, reglages.epaisseur, optionsPanache],
  )
  const evolution = useCalcul('evolutionPanache', argsEvolution).resultat

  // ---- Conceptual model --------------------------------------------------------------------
  const schema = useMemo(
    () =>
      modele && donnees
        ? schemaConceptuel({
            modele,
            donnees,
            guideSol: (c) => guides.get(c)?.valeur ?? null,
            referenceEau: (c) => {
              const k = base?.composes.find((x) => x.cle === c)
              return k && corrections ? (reference(k, corrections)?.valeur ?? null) : null
            },
            referenceGaz: (c) => guidesGaz.get(c) ?? null,
            nappe: nappeSchema,
            cibles: ciblesCourantes,
          })
        : null,
    [modele, donnees, guides, base, corrections, guidesGaz, nappeSchema, ciblesCourantes],
  )

  // ---- View --------------------------------------------------------------------------------
  const exagAuto = modele ? Math.min(25, Math.max(1, Math.round((0.3 * Math.max(modele.emprise.xmax - modele.emprise.xmin, modele.emprise.ymax - modele.emprise.ymin)) / Math.max(1, modele.zmax - modele.zmin)))) : 1
  const exag = reglages.exag ?? exagAuto
  const classesVisibles = useMemo(() => {
    if (!reglages.classesMasquees.length) return null
    const ids = modele?.formations ? modele.formations.formations.map((f) => f.id) : Object.keys(CLASSES_LITHO)
    return new Set(ids.filter((c) => !reglages.classesMasquees.includes(c)))
  }, [reglages.classesMasquees, modele])
  const pointsVisibles = useMemo(
    () => (modele && reglages.pointsMasques.length ? new Set(modele.points.map((p) => p.cle).filter((c) => !reglages.pointsMasques.includes(c))) : null),
    [modele, reglages.pointsMasques],
  )
  const bornesCoupe = useMemo(() => {
    if (!modele) return null
    const e = modele.emprise
    return { x: [e.xmin, e.xmax], y: [e.ymin, e.ymax], z: [modele.zmin, modele.zmax] } as Record<'x' | 'y' | 'z', [number, number]>
  }, [modele])
  const coupe = useMemo<Coupe>(() => {
    const c = reglages.coupe
    if (c.axe === 'aucune' || !bornesCoupe) return { axe: 'aucune', valeur: 0, inverse: false }
    const [a, b] = bornesCoupe[c.axe]
    // West–east section kept north of the plane by default, to be seen from the south.
    return { axe: c.axe, valeur: c.valeur ?? (a + b) / 2, inverse: c.axe === 'y' ? !c.inverse : c.inverse }
  }, [reglages.coupe, bornesCoupe])
  const urlSol = modele?.georef && reglages.fond !== 'aucun' ? urlFond(reglages.fond, modele.emprise.xmin + modele.origine.x, modele.emprise.ymin + modele.origine.y, modele.emprise.xmax + modele.origine.x, modele.emprise.ymax + modele.origine.y) : null
  const etatSol = urlSol ? (etatFond?.url === urlSol ? etatFond.etat : 'chargement') : null
  const surFond = useCallback((etat: 'ok' | 'erreur') => setEtatFond(urlSol ? { url: urlSol, etat } : null), [urlSol])

  // ---- Virtual borehole --------------------------------------------------------------------
  const virtuelAsk = selection?.type === 'virtuel' ? selection : null
  const virtuel = useMemo<ForageVirtuel | null>(() => {
    if (!modele || !virtuelAsk) return null
    const { x, y } = virtuelAsk
    const s = modele.sol
    const i = Math.round((x - s.x0) / s.dx)
    const j = Math.round((y - s.y0) / s.dy)
    const q = j * s.nx + i
    const dansGrille = i >= 0 && j >= 0 && i < s.nx && j < s.ny
    const sol = valeurEn(s, x, y)
    const couches: ForageVirtuel['couches'] = []
    const dedans = predicatEmprise(modele)(x, y)
    if (dedans && modele.formations && dansGrille) {
      const r = modele.formations
      r.formations.forEach((f, k) => {
        if (r.toits[k][q] - r.murs[k][q] > 0.01) couches.push({ nom: f.nom, couleur: f.couleur, haut: r.toits[k][q], bas: r.murs[k][q], ecart: k > 0 ? r.ecarts[k][q] : null })
      })
    } else if (dedans && modele.geologie) {
      const b = modele.blocs
      const bi = Math.floor((x - b.x0) / b.dx)
      const bj = Math.floor((y - b.y0) / b.dy)
      for (let k = b.nz - 1; k >= 0; k--) {
        const v = modele.geologie.valeurs[(k * b.ny + bj) * b.nx + bi]
        if (!v) continue
        const c = modele.geologie.classes[v - 1]
        const nom = CLASSES_LITHO[c]?.libelle ?? c
        const haut = b.z0 + (k + 1) * b.dz
        const der = couches[couches.length - 1]
        if (der && der.nom === nom && Math.abs(der.bas - haut) < 1e-6) der.bas = haut - b.dz
        else couches.push({ nom, couleur: CLASSES_LITHO[c]?.couleur ?? '#cccccc', haut, bas: haut - b.dz, ecart: null })
      }
    }
    const g = nappe?.grille
    const charge = g && dansGrille && Number.isFinite(g.valeurs[q]) ? g.valeurs[q] : null
    const champ = dansGrille ? pan?.champ?.[q] : undefined
    const ec = dansGrille ? pan?.incertitude?.[q] : undefined
    return {
      x,
      y,
      xa: modele.georef || modele.origine.x ? x + modele.origine.x : null,
      ya: modele.georef || modele.origine.y ? y + modele.origine.y : null,
      sol,
      couches,
      charge,
      ecartCharge: charge !== null ? (nappe?.incertitude?.[q] ?? null) : null,
      concentration:
        champ !== undefined && Number.isFinite(champ) && pan
          ? {
              valeur: pan.lineaire ? champ : 10 ** champ,
              facteur: !pan.lineaire && ec !== undefined && Number.isFinite(ec) ? 10 ** ec : null,
              probabilite: dansGrille && delimitation?.probabilite && Number.isFinite(delimitation.probabilite[q]) ? delimitation.probabilite[q] : null,
            }
          : null,
    }
  }, [modele, virtuelAsk, nappe, pan, delimitation])
  const colonneVirtuelle = useMemo<Colonne | null>(() => (virtuel ? { x: virtuel.x, y: virtuel.y, couches: virtuel.couches.map((c) => ({ haut: c.haut, bas: c.bas, couleur: c.couleur })) } : null), [virtuel])
  const surSol = useCallback((x: number, y: number) => setSelection({ type: 'virtuel', x, y }), [])

  const texteSurvol = useCallback(
    (s: SelectionPage): string => {
      if (!modele) return ''
      if (s.type === 'point') {
        const p = modele.points.find((x) => x.cle === s.cle)
        if (!p) return ''
        const r = pan?.valeurs.find((x) => x.cle === s.cle)?.resultat
        const c = nappe?.charges.find((x) => x.cle === s.cle)
        return [p.nom, p.forage?.profondeur ? `${frM(p.forage.profondeur)} de profondeur` : '', c && !modele.relatif ? `eau à ${fr(c.charge)} m NGF` : '', r && compose ? `${compose.nom} : ${r.brut} ${compose.unite}` : '']
          .filter(Boolean)
          .join(' · ')
      }
      if (s.type === 'echantillon') {
        const v = sols.find((x) => x.cle === s.cle && x.echantillon === s.echantillon)
        return v && parametreSol ? `${s.echantillon} · ${parametreSol.nom} : ${v.brut} ${parametreSol.unite}` : s.echantillon
      }
      if (s.type === 'bloc') return `${CLASSES_LITHO[s.classe]?.libelle ?? s.classe} · ${modele.relatif ? `${frM(-s.z)} sous le sol` : `${fr(s.z)} m NGF`}`
      if (s.type === 'formation') return `${modele.formations?.formations[s.index]?.nom ?? ''} · ${modele.relatif ? `${frM(-s.z)} sous le sol` : `${fr(s.z)} m NGF`}`
      if (s.type === 'filiere') return FILIERES[ORDRE_FILIERES[s.rang]].libelle
      if (s.type === 'pid') {
        const m = modele.points.find((x) => x.cle === s.cle)?.forage?.pid[s.index]
        return m ? `PID ${fr(m.valeur)} ppm (${fr(m.de)}–${fr(m.a)} m)` : ''
      }
      if (s.type === 'observation') {
        const o = modele.points.find((x) => x.cle === s.cle)?.forage?.observations[s.index]
        return o ? `${o.organoleptique || o.remarque} (${fr(o.de)}–${fr(o.a)} m)` : ''
      }
      if (s.type === 'gaz') {
        const g = donnees?.gaz.find((x) => x.cle === s.cle)
        const v = parametreGaz ? g?.resultats[parametreGaz.cle] : undefined
        return g ? `${g.nom}${v && parametreGaz ? ` · ${parametreGaz.nom} : ${v.brut} ${parametreGaz.unite}` : ''}` : ''
      }
      if (s.type === 'batiment') return ciblesCourantes?.batiments[s.index]?.usage ?? 'Bâtiment'
      if (s.type === 'enveloppe') return parametreSol && seuil ? `${parametreSol.nom} ≥ ${fr(seuil)} ${parametreSol.unite} (interpolé)` : ''
      if (s.type === 'proposition') {
        const x = delimitation?.propositions.find((p) => p.rang === s.rang)
        return x ? `N${x.rang} · emplacement proposé${x.probabilite !== null ? ` · dépassement probable à ${Math.round(x.probabilite * 100)} %` : ''}` : ''
      }
      return ''
    },
    [modele, pan, nappe, compose, sols, parametreSol, seuil, donnees, parametreGaz, ciblesCourantes, delimitation],
  )

  // ---- Files -------------------------------------------------------------------------------
  async function charger(liste: File[]) {
    setChargement(true)
    const lus: Source[] = []
    const errs: string[] = []
    for (const f of liste) {
      const id = `fichier:${f.name}:${Date.now().toString(36)}${lus.length}`
      try {
        const logs = lireClasseurLogs(await lireFeuilles(f, { cellDates: true }), f.name)
        if (logs) {
          lus.push({ ...logs, id })
          continue
        }
        const fl = await lireFichier(f)
        const lot = fl.lots[0]
        const unites = lot?.lecture.unites.join(' ') ?? ''
        if (fl.type === 'labo' && lot && /\/\s*kg/i.test(unites))
          lus.push({ id, origine: 'fichier', nom: f.name, resume: `Résultats sur sols · ${fl.resume}`, forages: [], parametresSol: [], sols: [{ fichier: f.name, lecture: lot.lecture, date: lot.date }], eaux: null, avertissements: [] })
        else if (fl.type === 'labo' && lot && /g\s*\/\s*m\s*[3³]/i.test(unites) && !/\/\s*l\b/i.test(unites)) {
          const g = gazDeResultats({ lecture: { ...lot.lecture, mode: 'concentration' }, infoPrincipale: { date: lot.date } }, f.name)
          if (g) lus.push({ id, origine: 'fichier', nom: f.name, resume: `Gaz du sol · ${fl.resume}`, forages: [], parametresSol: [], sols: [], eaux: null, gaz: [g.gaz], avertissements: [] })
        } else
          lus.push({
            id,
            origine: 'fichier',
            nom: f.name,
            resume: `Eaux souterraines · ${fl.resume}`,
            forages: [],
            parametresSol: [],
            sols: [],
            eaux: { lots: fl.lots, campagnes: [], releves: fl.releves, ouvrages: fl.ouvrages, corrections: null },
            avertissements: fl.avertissements,
          })
      } catch (e) {
        errs.push(e instanceof LectureImpossible ? e.message : `« ${f.name} » : ${(e as Error).message}`)
      }
    }
    setFichiers((fs) => [...fs, ...lus])
    setErreurs(errs)
    setChargement(false)
  }

  function daterLot(source: string, lot: string, date: string) {
    setFichiers((fs) =>
      fs.map((s) => (s.id === source && s.eaux ? { ...s, eaux: { ...s.eaux, lots: s.eaux.lots.map((l) => (l.id === lot ? { ...l, date, origineDate: 'saisie' as const } : l)) } } : s)),
    )
  }

  async function exporterImage() {
    if (!rendu) return
    const titre = [dossier.etat === 'ouvert' ? dossier.dossier.fiche.nom : '', 'Modèle 3D', etape ? etape.libelle : '', compose && reglages.couches.eaux ? compose.nom : ''].filter(Boolean).join(' · ')
    const blob = await rendu.capture(titre)
    telechargerBlob(blob, `Modele 3D ${etape?.date || jourIso()}.png`)
  }

  function exporterSchema() {
    if (!schema) return
    const choisi = { ...schema, elements: schema.elements.map((e) => ({ ...e, retenu: reglages.schema[e.id] ?? e.retenu })) }
    const titre = `Schéma conceptuel${dossier.etat === 'ouvert' ? ` · ${dossier.dossier.fiche.nom}` : ''}`
    telechargerBlob(new Blob([schemaSvg(choisi, titre)], { type: 'image/svg+xml' }), `Schema conceptuel ${jourIso()}.svg`)
  }

  function appliquerPreset(p: Preset) {
    const d = PRESETS[p]
    setReglages((r) => ({ ...r, couches: { ...r.couches, ...d.couches }, opaciteSol: d.opaciteSol, coupe: d.coupe }))
    rendu?.vue(d.vue)
  }

  const basculerCouche = (k: NomCouche) => regler('couches', { ...reglages.couches, [k]: !reglages.couches[k] })
  const avertissements = [
    ...(donnees?.avertissements ?? []),
    ...(modele?.avertissements ?? []),
    ...(calculModele.erreur ? [`Calcul du modèle : ${calculModele.erreur}`] : []),
    ...(cleMnt && erreurMnt?.cle === cleMnt ? [`Relief IGN indisponible (${erreurMnt.message}) : le sol passe par les cotes des forages.`] : []),
    ...(etatSol === 'erreur'
      ? [
          reglages.fond === 'geologie' && vignetteKo !== urlSol
            ? 'Carte géologique BRGM : le serveur n’autorise pas son usage dans une vue 3D, elle ne peut pas être drapée sur le sol ; elle est montrée en vignette sur l’emprise du modèle.'
            : `${FONDS[reglages.fond].libelle} : l’image n’a pas pu être chargée (service injoignable, ou qui n’autorise pas son usage dans une vue 3D). Les autres fonds restent disponibles.`,
        ]
      : []),
    ...(ciblesCourantes?.erreurs ?? []),
  ]
  const nbForages = modele?.points.filter((p) => p.forage?.lithologie.length).length ?? 0
  const lienLog = useCallback((nom: string) => `${import.meta.env.BASE_URL}logs-forage.html#forage=${encodeURIComponent(nom)}`, [])
  const motsClesLogs = useMemo(() => motsCles(donnees?.forages ?? []), [donnees])

  return (
    <>
      <section className="section">
        <div className="container">
          <p className="eyebrow">Synthèse · modèle conceptuel du site</p>
          <h1 style={{ maxWidth: '24ch' }}>Modèle 3D du site</h1>
          <p className="lede">
            Les logs de forage, la géologie, les eaux souterraines et les résultats d’analyses réunis dans une même vue en trois dimensions : formations géologiques continues
            dans les parcelles du site, nappe krigée et sens d’écoulement à chaque date, panache, son évolution et sa délimitation, sols par filière, gaz du sol, schéma conceptuel. On choisit
            ce qu’on affiche, on coupe le modèle, on compare deux dates.
          </p>

          <h2 className="etape">
            <span>1</span> Données
          </h2>
          <div className="card m3d-sources">
            <div className="st-entete-carte">
              <strong>Dossier d’étude</strong>
              {repertoire && (
                <button type="button" className="btn btn--ghost btn--petit" onClick={relire} disabled={lectureDossier}>
                  {lectureDossier ? 'Lecture…' : 'Relire le dossier'}
                </button>
              )}
            </div>
            {!repertoire ? (
              <p className="st-note">
                Ouvrez un dossier d’étude (bandeau « Dossier » en haut de page) : le modèle reprend directement le travail des autres outils — Logs de forage (lithologie,
                équipement, PID, observations, résultats rattachés aux échantillons), Suivi temporel (toutes les campagnes, telles que regroupées et corrigées), Résultats labo
                (sols, eaux et leurs fiches de prélèvement, gaz du sol) — les points d’investigation (coordonnées et cotes) et les parcelles du site.
              </p>
            ) : sourcesDossier.length === 0 && !lectureDossier ? (
              <p className="st-note">Aucune donnée exploitable dans ce dossier pour l’instant : utilisez Logs de forage, Suivi temporel ou Résultats labo, ou déposez les fichiers ci-dessous.</p>
            ) : (
              <ul className="m3d-liste-sources">
                {sourcesDossier.map((s) => (
                  <li key={s.id}>
                    <label className="st-coche">
                      <input type="checkbox" checked={!exclues.includes(s.id)} onChange={(e) => setExclues((x) => (e.target.checked ? x.filter((i) => i !== s.id) : [...x, s.id]))} />
                      <strong>{s.nom}</strong>
                    </label>
                    <span className="st-note">{s.resume}</span>
                  </li>
                ))}
                {pointsDossier.length > 0 && (
                  <li>
                    <strong>Points d’investigation</strong>{' '}
                    <span className="st-note">
                      {pointsDossier.length} point(s) : coordonnées (Lambert 93) et cotes là où les logs et le suivi n’en donnent pas
                    </span>
                  </li>
                )}
                {siteDossier?.emprise && (
                  <li>
                    <strong>Parcelles du site</strong> <span className="st-note">{siteDossier.parcelles?.length ?? 1} parcelle(s) : la géologie et les volumes de terres y sont limités</span>
                  </li>
                )}
              </ul>
            )}
            {erreursDossier.map((e) => (
              <p key={e} role="alert" className="alerte">
                {e}
              </p>
            ))}
          </div>

          <ZoneDepot
            multiple
            chargement={chargement}
            libelleChargement="Lecture…"
            titre="Ou déposez ici les fichiers, en une ou plusieurs fois"
            aide={
              <>
                Classeur de saisie des logs (format ERM : Collars, Lithology, Well Construction, PID, Water Level, Comments, Samples), rapports du laboratoire sur sols (rattachés
                aux forages par le nom des échantillons, « S3 (0,5-1 m) »), sur eaux souterraines ou sur gaz du sol (en µg/m³), fiches de prélèvement, tableau historique de
                surveillance. Les fichiers sont lus dans votre navigateur et ne sont envoyés nulle part.
              </>
            }
            onFichiers={(f) => void charger(f)}
            actions={(choisir) => (
              <div className="st-boutons">
                <button type="button" className="btn" onClick={choisir} disabled={chargement}>
                  Choisir des fichiers
                </button>
                {!avecExemple && (
                  <button type="button" className="btn btn--ghost" onClick={() => setAvecExemple(true)}>
                    Essayer avec un exemple
                  </button>
                )}
              </div>
            )}
          />
          {erreurs.map((e) => (
            <p key={e} role="alert" className="alerte">
              {e}
            </p>
          ))}
          {(fichiers.length > 0 || avecExemple) && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <div className="st-entete-carte">
                <strong>Fichiers déposés</strong>
                <button
                  type="button"
                  className="btn btn--ghost btn--petit"
                  onClick={() => {
                    setFichiers([])
                    setAvecExemple(false)
                    setErreurs([])
                  }}
                >
                  Tout retirer
                </button>
              </div>
              <ul className="m3d-liste-sources">
                {sourceExemple && (
                  <li>
                    <strong>{sourceExemple.nom}</strong> <span className="st-note">{sourceExemple.resume}</span>{' '}
                    <button type="button" className="btn btn--ghost btn--petit" onClick={() => setAvecExemple(false)}>
                      Retirer
                    </button>
                  </li>
                )}
                {fichiers.map((s) => (
                  <li key={s.id}>
                    <strong>{s.nom}</strong> <span className="st-note">{s.resume}</span>{' '}
                    <button type="button" className="btn btn--ghost btn--petit" onClick={() => setFichiers((fs) => fs.filter((x) => x.id !== s.id))}>
                      Retirer
                    </button>
                    {s.eaux?.lots
                      .filter((l) => !l.date || l.origineDate === 'saisie')
                      .map((l) => (
                        <label key={l.id} className="champ m3d-date-lot">
                          <span>Date de prélèvement (introuvable dans le rapport)</span>
                          <input type="date" value={l.date} onChange={(e) => daterLot(s.id, l.id, e.target.value)} />
                        </label>
                      ))}
                    {s.avertissements.map((a) => (
                      <p key={a} className="st-note">
                        {a}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {presente && (
        <section className="section section--muted">
          <div className="m3d-conteneur">
            <h2 className="etape">
              <span>2</span> Modèle
            </h2>
            {!modele ? (
              <p className="m3d-resume" aria-live="polite">
                Calcul du modèle{cleMnt && !mntPret ? ' (relief IGN en cours de chargement)' : ''}…
              </p>
            ) : (
              <>
                <p className="m3d-resume" aria-live="polite">
                  {pluriel(modele.points.length, 'point')} · {pluriel(nbForages, 'log')} · {base ? pluriel(base.campagnes.length, 'campagne') : 'pas de suivi des eaux'}
                  {modele.georef ? ` · Lambert 93${grilleMnt ? ', relief IGN' : ''}` : ' · coordonnées locales'}
                  {modele.parcelles ? ' · limité aux parcelles du site' : ''} · {LIBELLES_METHODE[modele.methode].toLowerCase()} · exagération ×{exag}
                  {calculModele.enCours ? ' · mise à jour…' : ''}
                </p>
                {avertissements.length > 0 && (
                  <details className="m3d-avertissements">
                    <summary>{pluriel(avertissements.length, 'remarque')} sur les données</summary>
                    <ul>
                      {avertissements.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  </details>
                )}

                <div className="m3d-disposition">
                  <div className="m3d-principal">
                    <div className="m3d-barre" role="toolbar" aria-label="Préréglages">
                      <span className="m3d-barre__titre">Préréglages</span>
                      {(Object.keys(PRESETS) as Preset[]).map((k) => (
                        <button key={k} type="button" className="btn btn--ghost btn--petit" onClick={() => appliquerPreset(k)}>
                          {PRESETS[k].libelle}
                        </button>
                      ))}
                      <span className="m3d-barre__espace" />
                      <button type="button" className="btn btn--petit" onClick={() => void exporterImage()} disabled={!rendu}>
                        Image PNG
                      </button>
                    </div>
                    <div className="m3d-barre" role="toolbar" aria-label="Caméra et outils">
                      {VUES.map(([v, l]) => (
                        <button key={v} type="button" className="btn btn--ghost btn--petit" onClick={() => rendu?.vue(v)}>
                          {l}
                        </button>
                      ))}
                      <span className="m3d-barre__espace" />
                      <span className="m3d-barre__titre">Outil</span>
                      {(
                        [
                          ['selection', 'Sélection'],
                          ['virtuel', 'Forage virtuel'],
                          ['mesure', 'Mesure'],
                        ] as [Outil, string][]
                      ).map(([o, l]) => (
                        <button key={o} type="button" className={`btn btn--petit${outil === o ? '' : ' btn--ghost'}`} aria-pressed={outil === o} onClick={() => setOutil(o)}>
                          {l}
                        </button>
                      ))}
                    </div>
                    <Vue3D
                      modele={modele}
                      exageration={exag}
                      couches={reglages.couches}
                      classes={classesVisibles}
                      ecart={reglages.ecart}
                      points={pointsVisibles}
                      coupe={coupe}
                      fond={urlSol}
                      opaciteSol={reglages.opaciteSol}
                      nappe={nappe}
                      couleursNappe={couleursNappe}
                      marqueursEaux={marqueursEaux}
                      isolignes={lignesIso}
                      echantillons={marqueursSol}
                      enveloppe={reglages.enveloppe ? (enveloppe ?? null) : null}
                      filieres={reglages.couches.filieres ? (filieres ?? null) : null}
                      pid={pid}
                      observations={observations}
                      gaz={marqueursGaz}
                      delimitation={reglages.couches.delimitation && delimitation ? delimitation : null}
                      batiments={ciblesCourantes?.batiments ?? RIEN}
                      batimentSurSite={batimentSurSite}
                      coursDEau={lignesCoursEau}
                      libelles={libelles}
                      selection={selection && selection.type !== 'virtuel' ? selection : null}
                      outil={outil}
                      virtuel={colonneVirtuelle}
                      surSelection={setSelection}
                      texteSurvol={texteSurvol}
                      surSol={surSol}
                      surMesure={setMesure}
                      surFond={surFond}
                      surRendu={setRendu}
                    >
                      <Legende
                        ouverte={legendeOuverte}
                        surBascule={() => setLegendeOuverte(!legendeOuverte)}
                        compose={reglages.couches.eaux || couleursNappe ? compose : null}
                        echelleEaux={echelleEaux}
                        comparaison={etapeA ? (comparaisonConc ? 'concentration' : 'charge') : null}
                        incertitude={!etapeA && reglages.incertitude && !(reglages.probabilite && delimitation?.probabilite) && !!nappe?.incertitude}
                        probabilite={!etapeA && reglages.probabilite && !!delimitation?.probabilite ? (refEaux?.valeur ?? null) : null}
                        delimitation={reglages.couches.delimitation && !!delimitation && (delimitation.bord.length > 0 || delimitation.propositions.length > 0)}
                        parametre={reglages.couches.echantillons ? parametreSol : null}
                        echelleSol={echelleSol}
                        gaz={reglages.couches.gaz ? parametreGaz : null}
                        echelleGaz={echelleGaz}
                        filieres={reglages.couches.filieres && !!filieres}
                        pid={reglages.couches.pid && pid.length > 0}
                        enveloppe={reglages.enveloppe ? (enveloppe ?? null) : null}
                        seuil={seuil}
                      />
                      {reglages.fond === 'geologie' && etatSol === 'erreur' && urlSol && vignetteKo !== urlSol && (
                        <figure className="m3d-vignette">
                          <img src={urlSol} alt="Carte géologique 1/50 000 du BRGM sur l’emprise du modèle, nord en haut" onError={() => setVignetteKo(urlSol)} />
                          <figcaption>Carte géologique 1/50 000 (BRGM) · emprise du modèle, nord en haut</figcaption>
                        </figure>
                      )}
                      {mesure && outil === 'mesure' && (
                        <p className="m3d-mesure-resultat" aria-live="polite">
                          <strong>{frM(mesure.totale)}</strong> · horizontale {frM(mesure.horizontale)} · dénivelé {mesure.verticale >= 0 ? '+' : '−'}
                          {frM(Math.abs(mesure.verticale))}
                        </p>
                      )}
                      {selection && (selection.type !== 'virtuel' || virtuel) && (
                        <Fiche
                          selection={selection}
                          modele={modele}
                          base={base}
                          nappe={nappe}
                          campagne={campagne}
                          compose={compose}
                          echelleEaux={echelleEaux}
                          tendances={tendances}
                          parametresSol={parametresSol}
                          parametreSol={parametreSol}
                          guideSol={(c) => guides.get(c) ?? null}
                          enveloppe={enveloppe ?? null}
                          seuil={seuil}
                          filieres={filieres ?? null}
                          parametresGaz={parametresGaz}
                          gaz={donnees?.gaz ?? RIEN}
                          guideGaz={(c) => guidesGaz.get(c) ?? null}
                          batiments={ciblesCourantes?.batiments ?? RIEN}
                          propositions={delimitation?.propositions ?? AUCUNE_PROPOSITION}
                          referenceEaux={refEaux?.valeur ?? null}
                          virtuel={virtuel}
                          lienLog={lienLog}
                          surFermer={() => setSelection(null)}
                        />
                      )}
                    </Vue3D>
                    <p className="st-note m3d-aide">
                      {outil === 'virtuel'
                        ? 'Forage virtuel : cliquez sur le sol, la colonne du modèle s’y affiche avec la nappe et la concentration estimées.'
                        : outil === 'mesure'
                          ? 'Mesure : cliquez deux points (sol, forage, couche) ; un troisième clic recommence.'
                          : 'Glisser pour tourner, clic droit (ou deux doigts) pour déplacer, molette pour zoomer · clic sur un objet pour sa fiche · les noms qui se chevauchent sont masqués, ils réapparaissent en zoomant.'}
                    </p>
                    {etapes.length > 0 && (
                      <Frise etapes={etapes} index={indexEtape} surIndex={surIndex} comparaison={reglages.comparaison} surComparaison={surComparaison} marques={marquesFrise} />
                    )}
                    {nappe?.ecoulement && (
                      <p className="st-note">
                        {etape?.libelle} : écoulement vers {direction(nappe.ecoulement.azimut)}, gradient {fr(nappe.ecoulement.gradient * 1000, 2)} ‰ (plan ajusté sur{' '}
                        {pluriel(nappe.charges.length, 'ouvrage')})
                        {nappe.validation ? ` · validation croisée de la nappe : écart quadratique moyen ${frM(nappe.validation.rmse)}` : ''}
                        {nappe.limites ? ` · ${nappe.limites} points de cours d’eau imposés` : ''}.
                      </p>
                    )}
                  </div>

                  <aside className="m3d-panneau" aria-label="Réglages du modèle">
                    <div className="m3d-onglets" role="tablist" aria-label="Réglages">
                      {ONGLETS.map(([o, l]) => (
                        <button key={o} type="button" role="tab" aria-selected={onglet === o} className={`m3d-onglet${onglet === o ? ' m3d-onglet--actif' : ''}`} onClick={() => setOnglet(o)}>
                          {l}
                        </button>
                      ))}
                    </div>

                    {onglet === 'calques' && (
                      <fieldset role="tabpanel">
                        <legend>Calques</legend>
                        {LIBELLES_COUCHES.map(([k, l]) => (
                          <label key={k} className="st-coche">
                            <input type="checkbox" checked={reglages.couches[k]} onChange={() => basculerCouche(k)} /> {l}
                          </label>
                        ))}
                        <div className="m3d-sous">
                          <label className="champ">
                            <span>Fond du sol</span>
                            <select value={reglages.fond} onChange={(e) => regler('fond', e.target.value as FondSol)} disabled={!modele.georef}>
                              {(Object.keys(FONDS) as FondSol[]).map((f) => (
                                <option key={f} value={f}>
                                  {FONDS[f].libelle}
                                </option>
                              ))}
                            </select>
                          </label>
                          {!modele.georef && <p className="st-note">Fonds IGN et BRGM : coordonnées en Lambert 93 nécessaires.</p>}
                          {etatSol === 'chargement' && <p className="st-note">Chargement de l’image…</p>}
                          {urlSol && etatSol !== 'erreur' && <p className="st-note">Source : {FONDS[reglages.fond].source}</p>}
                          <label className="champ">
                            <span>Opacité du sol : {Math.round(reglages.opaciteSol * 100)} %</span>
                            <input type="range" min={0.1} max={1} step={0.05} value={reglages.opaciteSol} onChange={(e) => regler('opaciteSol', Number(e.target.value))} />
                          </label>
                          <label className="st-coche">
                            <input type="checkbox" checked={reglages.valeursSurvol} onChange={(e) => regler('valeursSurvol', e.target.checked)} /> Valeurs au survol seulement (étiquettes plus légères)
                          </label>
                        </div>
                      </fieldset>
                    )}

                    {onglet === 'geologie' && (
                      <fieldset role="tabpanel">
                        <legend>Géologie</legend>
                        <label className="champ">
                          <span>Représentation</span>
                          <select value={reglages.representation} onChange={(e) => regler('representation', e.target.value as Representation)}>
                            <option value="formations">Formations continues (couches)</option>
                            <option value="blocs">Blocs (lithologie dominante, lentilles visibles)</option>
                          </select>
                        </label>
                        {modele.formations ? (
                          <>
                            <ul className="m3d-classes">
                              {modele.formations.formations.map((f, i) => (
                                <li key={f.id}>
                                  <label className="st-coche">
                                    <input
                                      type="checkbox"
                                      checked={!reglages.classesMasquees.includes(f.id)}
                                      onChange={(e) => regler('classesMasquees', e.target.checked ? reglages.classesMasquees.filter((x) => x !== f.id) : [...reglages.classesMasquees, f.id])}
                                    />
                                    <span className="m3d-pastille" style={{ background: f.couleur }} aria-hidden="true" />
                                    {f.nom}
                                  </label>
                                  <span className="st-note m3d-num">{fr(modele.formations!.volumes[i])} m³</span>
                                </li>
                              ))}
                            </ul>
                            <label className="champ">
                              <span>Vue éclatée : {fr(reglages.ecart)} m entre formations</span>
                              <input type="range" min={0} max={6} step={0.25} value={reglages.ecart} onChange={(e) => regler('ecart', Number(e.target.value))} />
                            </label>
                            <p className="st-note">Regroupement des mots-clés en formations : section « Formations géologiques » sous la vue.</p>
                          </>
                        ) : modele.geologie ? (
                          <ul className="m3d-classes">
                            {modele.geologie.classes.map((c) => (
                              <li key={c}>
                                <label className="st-coche">
                                  <input
                                    type="checkbox"
                                    checked={!reglages.classesMasquees.includes(c)}
                                    onChange={(e) => regler('classesMasquees', e.target.checked ? reglages.classesMasquees.filter((x) => x !== c) : [...reglages.classesMasquees, c])}
                                  />
                                  <span className="m3d-pastille" style={{ background: CLASSES_LITHO[c]?.couleur }} aria-hidden="true" />
                                  {CLASSES_LITHO[c]?.libelle ?? c}
                                </label>
                                <span className="st-note m3d-num">{fr(modele.geologie!.volumes[c] ?? 0)} m³</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="st-note">Pas de lithologie dans les logs.</p>
                        )}
                        {modele.parcelles ? (
                          <p className="st-note">Modélisée dans les parcelles du site{siteDossier?.emprise ? ' (dossier d’étude)' : ''}.</p>
                        ) : (
                          <>
                            <label className="st-coche">
                              <input type="checkbox" checked={reglages.etendre} onChange={(e) => regler('etendre', e.target.checked)} /> Étendre à toute l’emprise
                            </label>
                            <p className="st-note">Sans parcelles du site ni cette option : entre les forages et à moins de {fr(modele.portee)} m au-delà.</p>
                          </>
                        )}
                      </fieldset>
                    )}

                    {onglet === 'eaux' && (
                      <fieldset role="tabpanel">
                        <legend>Eaux souterraines</legend>
                        {base && base.composes.length > 0 ? (
                          <>
                            <label className="champ">
                              <span>Composé ou paramètre</span>
                              <select value={cleCompose ?? ''} onChange={(e) => regler('compose', e.target.value)}>
                                <option value="">Aucun</option>
                                {groupes(base.composes).map(([famille, cs]) => (
                                  <optgroup key={famille} label={famille}>
                                    {cs.map((c) => (
                                      <option key={c.cle} value={c.cle}>
                                        {c.nom}
                                      </option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>
                            </label>
                            {compose && (
                              <>
                                <label className="st-coche">
                                  <input type="checkbox" checked={reglages.panache} onChange={(e) => regler('panache', e.target.checked)} /> Colorer la nappe (panache)
                                </label>
                                <p className="st-note">
                                  {refEaux && !compose.terrain
                                    ? `Valeur de comparaison : ${fr(refEaux.valeur)} ${compose.unite} (${refEaux.saisie ? 'saisie dans Suivi temporel' : `valeurs ERM, source ${refEaux.source}`}).`
                                    : compose.terrain
                                      ? 'Paramètre de terrain : échelle de la plus faible à la plus forte valeur mesurée.'
                                      : 'Pas de valeur de comparaison : échelle des concentrations mesurées (logarithmique).'}
                                  {pan?.validation && !compose.terrain ? ` Validation croisée du panache : facteur ×/÷ ${fr(10 ** pan.validation.rmse, 2)} en moyenne.` : ''}
                                </p>
                              </>
                            )}
                          </>
                        ) : (
                          <p className="st-note">Pas de résultats d’eaux souterraines.</p>
                        )}
                        <label className="st-coche">
                          <input type="checkbox" checked={reglages.incertitude} onChange={(e) => regler('incertitude', e.target.checked)} disabled={reglages.methode !== 'krigeage'} /> Colorer la nappe selon l’incertitude du krigeage
                        </label>
                        <label className="st-coche">
                          <input
                            type="checkbox"
                            checked={reglages.probabilite}
                            onChange={(e) => regler('probabilite', e.target.checked)}
                            disabled={reglages.methode !== 'krigeage' || !refEaux || !!compose?.terrain}
                          />{' '}
                          Colorer la nappe selon la probabilité de dépasser la valeur de comparaison
                        </label>
                        <label className="st-coche">
                          <input type="checkbox" checked={reglages.limitesCoursEau} onChange={(e) => regler('limitesCoursEau', e.target.checked)} disabled={!lignesCoursEau.length} /> Cours d’eau comme limites de la nappe
                        </label>
                        {reglages.limitesCoursEau && (
                          <div className="m3d-sous">
                            <label className="champ">
                              <span>Niveau du cours d’eau sous le sol (m)</span>
                              <input type="number" min={0} max={5} step={0.1} value={reglages.revanche} onChange={(e) => regler('revanche', Number(e.target.value) || 0)} />
                            </label>
                            <p className="st-note">Approximation : cote du relief au droit du cours d’eau moins cette valeur. À vérifier sur un niveau mesuré.</p>
                          </div>
                        )}
                      </fieldset>
                    )}

                    {onglet === 'sols' && (
                      <fieldset role="tabpanel">
                        <legend>Sols et gaz</legend>
                        {parametresSol.length > 0 ? (
                          <>
                            <label className="champ">
                              <span>Paramètre (sols)</span>
                              <select value={cleParametre ?? ''} onChange={(e) => regler('parametreSol', e.target.value)}>
                                <option value="">Aucun</option>
                                {groupes(parametresSol).map(([famille, ps]) => (
                                  <optgroup key={famille} label={famille}>
                                    {ps.map((p) => (
                                      <option key={p.cle} value={p.cle}>
                                        {p.nom}
                                        {p.eluat ? ' (éluat)' : ''}
                                      </option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>
                            </label>
                            {parametreSol && (
                              <>
                                <p className="st-note">{guide ? `Valeur guide ERM (sols, sur site) : ${fr(guide.valeur)} ${parametreSol.unite}, source ${guide.source}.` : 'Pas de valeur guide ERM : échelle des résultats mesurés.'}</p>
                                {etapes.length > 0 && (
                                  <label className="st-coche">
                                    <input type="checkbox" checked={reglages.solsALaDate} onChange={(e) => regler('solsALaDate', e.target.checked)} /> Seulement les échantillons prélevés à la date affichée ou avant
                                  </label>
                                )}
                                <label className="st-coche">
                                  <input type="checkbox" checked={reglages.enveloppe} onChange={(e) => regler('enveloppe', e.target.checked)} /> Enveloppe des sols au-dessus du seuil
                                </label>
                                {reglages.enveloppe && (
                                  <div className="m3d-sous">
                                    <label className="champ">
                                      <span>Seuil ({parametreSol.unite})</span>
                                      <input type="text" inputMode="decimal" value={reglages.seuilSol} placeholder={guide ? String(guide.valeur).replace('.', ',') : 'à saisir'} onChange={(e) => regler('seuilSol', e.target.value)} />
                                    </label>
                                    {enveloppe && (
                                      <p>
                                        {enveloppe.depassements ? (
                                          <>
                                            Volume interpolé : <strong>{fr(enveloppe.volume)} m³</strong> ({pluriel(enveloppe.depassements, 'échantillon')} au-dessus du seuil)
                                          </>
                                        ) : (
                                          'Aucun échantillon au-dessus du seuil.'
                                        )}
                                      </p>
                                    )}
                                    {!seuil && <p className="st-note">Saisissez un seuil.</p>}
                                  </div>
                                )}
                              </>
                            )}
                            <label className="st-coche">
                              <input type="checkbox" checked={reglages.couches.filieres} onChange={() => basculerCouche('filieres')} disabled={!filieres} /> Terres par filière d’évacuation
                            </label>
                            {!filieres && <p className="st-note">Filières : critères de l’annexe II (ISDI) trop peu analysés.</p>}
                          </>
                        ) : (
                          <p className="st-note">Pas de résultats sur sols.</p>
                        )}
                        {parametresGaz.length > 0 && (
                          <label className="champ">
                            <span>Paramètre (gaz du sol)</span>
                            <select value={cleGaz ?? ''} onChange={(e) => regler('parametreGaz', e.target.value)}>
                              <option value="">Aucun</option>
                              {parametresGaz.map((p) => (
                                <option key={p.cle} value={p.cle}>
                                  {p.nom}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        {parametreGaz && <p className="st-note">{echelleGaz?.reference ? `Comparé à la valeur repère R1 de l’air intérieur (${fr(echelleGaz.reference)} µg/m³), à titre de repère.` : 'Pas de valeur repère : échelle des concentrations mesurées.'}</p>}
                      </fieldset>
                    )}

                    {onglet === 'vue' && (
                      <fieldset role="tabpanel">
                        <legend>Coupe, échelle, calcul</legend>
                        <label className="champ">
                          <span>Couper le modèle</span>
                          <select
                            value={reglages.coupe.axe}
                            onChange={(e) => {
                              const axe = e.target.value as Coupe['axe']
                              regler('coupe', { axe, valeur: null, inverse: false })
                              rendu?.vue(axe === 'x' ? 'est' : axe === 'y' ? 'sud' : '3d')
                            }}
                          >
                            <option value="aucune">Pas de coupe</option>
                            <option value="y">Coupe ouest–est (vue depuis le sud)</option>
                            <option value="x">Coupe nord–sud (vue depuis l’est)</option>
                            <option value="z">Coupe horizontale (à une cote)</option>
                          </select>
                        </label>
                        {reglages.coupe.axe !== 'aucune' && bornesCoupe && (
                          <div className="m3d-sous">
                            <label className="champ">
                              <span>{libelleCoupe(reglages.coupe.axe, coupe.valeur, bornesCoupe, modele.relatif)}</span>
                              <input
                                type="range"
                                min={bornesCoupe[reglages.coupe.axe][0]}
                                max={bornesCoupe[reglages.coupe.axe][1]}
                                step={(bornesCoupe[reglages.coupe.axe][1] - bornesCoupe[reglages.coupe.axe][0]) / 200}
                                value={coupe.valeur}
                                onChange={(e) => regler('coupe', { ...reglages.coupe, valeur: Number(e.target.value) })}
                              />
                            </label>
                            <label className="st-coche">
                              <input type="checkbox" checked={reglages.coupe.inverse} onChange={(e) => regler('coupe', { ...reglages.coupe, inverse: e.target.checked })} /> Garder l’autre côté
                            </label>
                          </div>
                        )}
                        <label className="champ">
                          <span>
                            Exagération verticale : ×{exag}
                            {reglages.exag === null ? ' (automatique)' : ''}
                          </span>
                          <input type="range" min={1} max={30} step={1} value={exag} onChange={(e) => regler('exag', Number(e.target.value))} />
                        </label>
                        <label className="champ">
                          <span>Interpolation (géologie, nappe, panache)</span>
                          <select value={reglages.methode} onChange={(e) => regler('methode', e.target.value as Methode)}>
                            {(Object.keys(LIBELLES_METHODE) as Methode[]).map((m) => (
                              <option key={m} value={m}>
                                {LIBELLES_METHODE[m]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <fieldset className="m3d-sous-groupe">
                          <legend>Forages et ouvrages affichés</legend>
                          <div className="st-boutons">
                            <button type="button" className="btn btn--ghost btn--petit" onClick={() => regler('pointsMasques', [])}>
                              Tous
                            </button>
                            <button type="button" className="btn btn--ghost btn--petit" onClick={() => regler('pointsMasques', modele.points.map((p) => p.cle))}>
                              Aucun
                            </button>
                          </div>
                          <ul className="m3d-points">
                            {modele.points.map((p) => (
                              <li key={p.cle}>
                                <label className="st-coche">
                                  <input
                                    type="checkbox"
                                    checked={!reglages.pointsMasques.includes(p.cle)}
                                    onChange={(e) => regler('pointsMasques', e.target.checked ? reglages.pointsMasques.filter((x) => x !== p.cle) : [...reglages.pointsMasques, p.cle])}
                                  />
                                  {p.nom}
                                </label>
                                <button type="button" className="m3d-lien" onClick={() => setSelection({ type: 'point', cle: p.cle })}>
                                  fiche
                                </button>
                              </li>
                            ))}
                          </ul>
                        </fieldset>
                        <button type="button" className="btn btn--ghost btn--petit" onClick={() => setReglages((r) => ({ ...REGLAGES_DEFAUT, saisies: r.saisies, formations: r.formations, systeme: r.systeme, schema: r.schema, hydro: r.hydro }))}>
                          Réglages de vue par défaut
                        </button>
                      </fieldset>
                    )}
                  </aside>
                </div>

                {evolution && compose && evolution.etats.length >= 2 && (
                  <details className="m3d-tableaux" open>
                    <summary>Évolution du panache · {compose.nom}</summary>
                    <Evolution
                      evolution={evolution}
                      nom={compose.nom}
                      unite={compose.unite}
                      reference={refEaux?.valeur ?? null}
                      campagne={campagne}
                      porosite={reglages.porosite}
                      epaisseur={reglages.epaisseur}
                      surPorosite={(v) => regler('porosite', v)}
                      surEpaisseur={(v) => regler('epaisseur', v)}
                    />
                  </details>
                )}

                {compose && !compose.terrain && (
                  <details className="m3d-tableaux" open>
                    <summary>
                      Délimitation du panache · {compose.nom}
                      {etape ? ` · ${etape.libelle}` : ''}
                    </summary>
                    {!refEaux ? (
                      <p className="st-note">Pas de valeur de comparaison pour ce composé : la saisir dans Suivi temporel, elle est reprise ici.</p>
                    ) : !campagne ? (
                      <p className="st-note">Choisissez dans la frise une campagne d’analyses (la date affichée n’a que des niveaux d’eau).</p>
                    ) : delimitation ? (
                      <Delimitation
                        d={delimitation}
                        nom={compose.nom}
                        unite={compose.unite}
                        date={etape?.libelle ?? ''}
                        georef={modele.georef}
                        nombre={reglages.propositions}
                        surNombre={(n) => regler('propositions', n)}
                        surProposition={(rang) => setSelection({ type: 'proposition', rang })}
                        hydro={hydro}
                        compose={compose.cle}
                        surHydro={(h) => regler('hydro', { ...hydro, ...h })}
                      />
                    ) : (
                      <p className="st-note">Calcul…</p>
                    )}
                  </details>
                )}

                {filieres && <Filieres filieres={filieres} densite={reglages.densite} surDensite={(v) => regler('densite', v)} />}

                {schema && (
                  <details className="m3d-tableaux">
                    <summary>Schéma conceptuel</summary>
                    <Schema
                      schema={schema}
                      choix={reglages.schema}
                      surChoix={(id, v) => regler('schema', { ...reglages.schema, [id]: v })}
                      surExport={exporterSchema}
                      cibles={etatCibles}
                      erreursCibles={ciblesCourantes?.erreurs ?? RIEN}
                    />
                  </details>
                )}

                {modele.formations && modele.configFormations && (
                  <details className="m3d-tableaux">
                    <summary>Formations géologiques</summary>
                    <Formations config={modele.configFormations} motsCles={motsClesLogs} volumes={modele.formations.volumes} surChange={(c) => regler('formations', c)} />
                  </details>
                )}

                <details className="m3d-tableaux">
                  <summary>Points, coordonnées et cotes</summary>
                  <Points
                    modele={modele}
                    systeme={reglages.systeme}
                    saisies={reglages.saisies}
                    surSysteme={(s) => regler('systeme', s)}
                    surSaisie={(cle, s) => {
                      const suite = { ...reglages.saisies }
                      if (s) suite[cle] = s
                      else delete suite[cle]
                      regler('saisies', suite)
                    }}
                  />
                </details>

                <Tableaux
                  modele={modele}
                  nappe={nappe}
                  nappeA={nappeA}
                  etape={etape}
                  etapeA={etapeA}
                  pan={pan}
                  compose={compose}
                  echelleEaux={echelleEaux}
                  tendances={tendances}
                  parametreSol={parametreSol}
                  sols={sols}
                  guide={guide}
                  echelleSol={echelleSol}
                />

                <MethodeLimites />
              </>
            )}
          </div>
        </section>
      )}
    </>
  )
}

const ROSE = ['le nord', 'le nord-est', 'l’est', 'le sud-est', 'le sud', 'le sud-ouest', 'l’ouest', 'le nord-ouest']
const direction = (azimut: number) => `${ROSE[Math.round(azimut / 45) % 8]} (${Math.round(azimut)}°)`

function libelleCoupe(axe: 'x' | 'y' | 'z', v: number, bornes: Record<'x' | 'y' | 'z', [number, number]>, relatif: boolean): string {
  if (axe === 'z') return relatif ? `À ${frM(-v)} sous le sol` : `À ${fr(v)} m NGF`
  const d = v - bornes[axe][0]
  return axe === 'x' ? `À ${frM(d)} du bord ouest` : `À ${frM(d)} du bord sud`
}

/** Items grouped by family, in their order. */
function groupes<T extends { famille: string }>(liste: T[]): [string, T[]][] {
  const m = new Map<string, T[]>()
  for (const x of liste) {
    const f = x.famille || 'Autres'
    if (!m.has(f)) m.set(f, [])
    m.get(f)!.push(x)
  }
  return [...m]
}
