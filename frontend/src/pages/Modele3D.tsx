import { useCallback, useEffect, useMemo, useState } from 'react'
import ZoneDepot from '../components/ZoneDepot'
import Fiche from '../components/modele3d/Fiche'
import Frise, { type Etape } from '../components/modele3d/Frise'
import Vue3D from '../components/modele3d/Vue3D'
import type { Couches, Coupe, MarqueurEaux, MarqueurSol, NomCouche, Rendu3D, Selection, Vue } from '../components/modele3d/rendu'
import type { Repertoire } from '../lib/dossier/acces'
import { useDossier, useSynchroDossier } from '../lib/dossier/useSynchroDossier'
import { lireFeuilles, telechargerBlob } from '../lib/fichiers'
import { jourIso } from '../lib/format'
import { assembler } from '../lib/modele3d/assemblage'
import { COULEUR_NQ, couleurChamp, couleurValeur, etendue, RAMPE, type Echelle } from '../lib/modele3d/couleurs'
import { lireSourcesDossier } from '../lib/modele3d/dossier'
import { exemple } from '../lib/modele3d/exemple'
import { fr, frM } from '../lib/modele3d/format'
import { chargerMnt, FONDS, urlFond, type FondSol } from '../lib/modele3d/ign'
import type { Grille } from '../lib/modele3d/interpolation'
import { CLASSES_LITHO } from '../lib/modele3d/lithologie'
import { lireClasseurLogs } from '../lib/modele3d/logs'
import { CLASSES_CONCENTRATION, construireModele, enveloppeSols, nappeCampagne, nappeForation, nappeNiveaux, panache, pointsSol, relevesSansCampagne, type ClasseConcentration } from '../lib/modele3d/modele'
import type { Source } from '../lib/modele3d/types'
import { valeurGuideEn } from '../lib/resultats/guides'
import { LectureImpossible } from '../lib/resultats/parse'
import { reference } from '../lib/suivi/analyse'
import { formatDate } from '../lib/suivi/dates'
import { lireFichier } from '../lib/suivi/import'
import type { Compose, Niveau } from '../lib/suivi/modele'

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
  solsALaDate: boolean
  etendre: boolean
}

const COUCHES_DEFAUT: Couches = { sol: true, geologie: true, forages: true, equipement: true, nappe: true, echantillons: true, enveloppe: true, eaux: true, etiquettes: true, cadre: true }

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
  solsALaDate: false,
  etendre: false,
}

const LIBELLES_COUCHES: [NomCouche, string][] = [
  ['sol', 'Surface du sol'],
  ['geologie', 'Modèle géologique (blocs)'],
  ['forages', 'Forages (lithologie)'],
  ['equipement', 'Crépines et tubes des piézomètres'],
  ['nappe', 'Surface de la nappe'],
  ['eaux', 'Ouvrages : niveau et concentration'],
  ['etiquettes', 'Noms des forages'],
  ['cadre', 'Cadre, cotes et nord'],
]

const VUES: [Vue, string][] = [
  ['3d', 'Perspective'],
  ['dessus', 'Plan'],
  ['sud', 'Depuis le sud'],
  ['est', 'Depuis l’est'],
]

const lireNombre = (s: string) => {
  const n = Number(s.replace(/\s/g, '').replace(',', '.'))
  return s.trim() && Number.isFinite(n) && n > 0 ? n : null
}

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

// Elevation grids already fetched, by extent: going back to a dossier asks IGN nothing.
const MNT = new Map<string, Grille | null>()
const AUCUNE: Source[] = []
const AUCUNE_ERREUR: string[] = []

export default function Modele3D() {
  const [fichiers, setFichiers] = useState<Source[]>([])
  const [avecExemple, setAvecExemple] = useState(false)
  const [exclues, setExclues] = useState<string[]>([])
  const [reglages, setReglages] = useState<Reglages>(REGLAGES_DEFAUT)
  const [chargement, setChargement] = useState(false)
  const [erreurs, setErreurs] = useState<string[]>([])
  const [selection, setSelection] = useState<Selection | null>(null)
  const [rendu, setRendu] = useState<Rendu3D | null>(null)
  const [etatFond, setEtatFond] = useState<{ url: string; etat: 'ok' | 'erreur' } | null>(null)
  const [vignetteKo, setVignetteKo] = useState<string | null>(null)

  const regler = useCallback(<K extends keyof Reglages>(k: K, v: Reglages[K]) => setReglages((r) => ({ ...r, [k]: v })), [])

  // ---- Dossier ---------------------------------------------------------------------------------
  const dossier = useDossier()
  const repertoire = dossier.etat === 'ouvert' ? dossier.dossier.repertoire : null
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
      setReglages({ ...REGLAGES_DEFAUT, ...d.reglages, couches: { ...COUCHES_DEFAUT, ...d.reglages?.couches } })
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
  const donnees = useMemo(() => (sources.length ? assembler(sources) : null), [sources])
  const { etendre } = reglages
  const modeleBrut = useMemo(() => (donnees && (donnees.forages.length || donnees.base?.ouvrages.length) ? construireModele(donnees, { etendre }) : null), [donnees, etendre])
  // The example's elevations are made up: IGN's relief of the real place under it would not match them.
  const avecMnt = sources.some((x) => x.origine !== 'exemple')
  const cleMnt = modeleBrut?.georef && avecMnt
    ? [modeleBrut.emprise.xmin + modeleBrut.origine.x, modeleBrut.emprise.ymin + modeleBrut.origine.y, modeleBrut.emprise.xmax + modeleBrut.origine.x, modeleBrut.emprise.ymax + modeleBrut.origine.y]
        .map((v) => Math.round(v))
        .join(',')
    : null
  const [erreurMnt, setErreurMnt] = useState<{ cle: string; message: string } | null>(null)
  const [, setMntRecu] = useState(0)
  useEffect(() => {
    if (!cleMnt || MNT.has(cleMnt)) return
    let actif = true
    const [x0, y0, x1, y1] = cleMnt.split(',').map(Number)
    chargerMnt(x0, y0, x1, y1)
      .then((g) => {
        MNT.set(cleMnt, g)
        if (!actif) return
        if (!g) setErreurMnt({ cle: cleMnt, message: 'le service n’a pas donné assez d’altitudes sur l’emprise' })
        setMntRecu((n) => n + 1)
      })
      .catch((e) => actif && setErreurMnt({ cle: cleMnt, message: (e as Error).message }))
    return () => {
      actif = false
    }
  }, [cleMnt])
  const grilleMnt = cleMnt ? (MNT.get(cleMnt) ?? null) : null
  const mntCourant = cleMnt && (MNT.has(cleMnt) || erreurMnt?.cle === cleMnt) ? { grille: grilleMnt, erreur: erreurMnt?.cle === cleMnt ? erreurMnt.message : undefined } : null
  const modele = useMemo(
    () => (donnees && modeleBrut && grilleMnt ? construireModele(donnees, { mnt: { grille: grilleMnt }, etendre }) : modeleBrut),
    [donnees, modeleBrut, grilleMnt, etendre],
  )
  const base = donnees?.base ?? null

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
      })
    }
    const dates: (Etape & { campagne: string | null; date: string; niveaux?: Niveau[] })[] = []
    for (const c of base?.campagnes ?? [])
      dates.push({ id: c.id, libelle: formatDate(c.date), detail: c.regime === 'HE' ? 'hautes eaux' : c.regime === 'BE' ? 'basses eaux' : '', campagne: c.id, date: c.date })
    // Water levels of sampling sheets with no lab campaign within a month: rounds of their own.
    for (const t of base ? relevesSansCampagne(base) : [])
      dates.push({
        id: t.id,
        libelle: t.fin !== t.debut ? `${formatDate(t.debut)} – ${formatDate(t.fin)}` : formatDate(t.debut),
        detail: `niveaux d’eau seuls (${pluriel(new Set(t.niveaux.map((n) => n.ouvrage)).size, 'ouvrage')}, sans analyses)`,
        campagne: null,
        date: t.debut,
        niveaux: t.niveaux,
      })
    return [...liste, ...dates.sort((a, b) => a.date.localeCompare(b.date))]
  }, [modele, base])
  const indexEtape = reglages.etape === null ? etapes.length - 1 : Math.min(Math.max(0, reglages.etape), etapes.length - 1)
  const etape = etapes[indexEtape] ?? null
  const campagne = etape?.campagne ?? null
  const surIndex = useCallback((i: number) => regler('etape', i), [regler])

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

  const nappe = useMemo(() => {
    if (!modele || !etape) return null
    if (etape.campagne && base) return nappeCampagne(modele, base, etape.campagne)
    if (etape.niveaux) return nappeNiveaux(modele, etape.niveaux)
    return etape.id === 'foration' ? nappeForation(modele) : null
  }, [modele, base, etape])
  const pan = useMemo(() => (modele && base && compose && campagne ? panache(modele, base, compose.cle, campagne, !!compose.terrain) : null), [modele, base, compose, campagne])
  const couleursNappe = useMemo(
    () => (reglages.panache && pan?.champ && echelleEaux && nappe?.grille ? Array.from(pan.champ, (v) => couleurChamp(v, echelleEaux)) : null),
    [reglages.panache, pan, echelleEaux, nappe],
  )
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
  const libelles = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const p of modele?.points ?? []) {
      const r = pan?.valeurs.find((x) => x.cle === p.cle)?.resultat
      m.set(p.cle, [p.nom, ...(r && compose && reglages.couches.eaux ? [`${r.brut} ${compose.unite}`] : [])])
    }
    return m
  }, [modele, pan, compose, reglages.couches.eaux])

  // ---- Soils -------------------------------------------------------------------------------
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
    () => (reglages.couches.echantillons ? sols.map((s) => ({ cle: s.cle, echantillon: s.echantillon, x: s.x, y: s.y, z: s.z, couleur: couleurValeur(s.valeur, s.inferieur, echelleSol), petit: s.inferieur })) : []),
    [sols, echelleSol, reglages.couches.echantillons],
  )
  const seuil = lireNombre(reglages.seuilSol) ?? guide?.valeur ?? null
  const enveloppe = useMemo(
    () => (modele && parametreSol && seuil && reglages.enveloppe ? enveloppeSols(modele, parametreSol.cle, seuil) : null),
    [modele, parametreSol, seuil, reglages.enveloppe],
  )

  // ---- View --------------------------------------------------------------------------------
  const exagAuto = modele ? Math.min(25, Math.max(1, Math.round((0.3 * Math.max(modele.emprise.xmax - modele.emprise.xmin, modele.emprise.ymax - modele.emprise.ymin)) / Math.max(1, modele.zmax - modele.zmin)))) : 1
  const exag = reglages.exag ?? exagAuto
  const classesVisibles = useMemo(() => (reglages.classesMasquees.length ? new Set(Object.keys(CLASSES_LITHO).filter((c) => !reglages.classesMasquees.includes(c))) : null), [reglages.classesMasquees])
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

  const texteSurvol = useCallback(
    (s: Selection): string => {
      if (s.type === 'point') {
        const p = modele?.points.find((x) => x.cle === s.cle)
        if (!p) return ''
        const r = pan?.valeurs.find((x) => x.cle === s.cle)?.resultat
        const c = nappe?.charges.find((x) => x.cle === s.cle)
        return [p.nom, p.forage?.profondeur ? `${frM(p.forage.profondeur)} de profondeur` : '', c && !modele?.relatif ? `eau à ${fr(c.charge)} m NGF` : '', r && compose ? `${compose.nom} : ${r.brut} ${compose.unite}` : '']
          .filter(Boolean)
          .join(' · ')
      }
      if (s.type === 'echantillon') {
        const v = sols.find((x) => x.cle === s.cle && x.echantillon === s.echantillon)
        return v && parametreSol ? `${s.echantillon} · ${parametreSol.nom} : ${v.brut} ${parametreSol.unite}` : s.echantillon
      }
      if (s.type === 'bloc') return `${CLASSES_LITHO[s.classe]?.libelle ?? s.classe} · ${modele?.relatif ? `${frM(-s.z)} sous le sol` : `${fr(s.z)} m NGF`}`
      return parametreSol && seuil ? `${parametreSol.nom} ≥ ${fr(seuil)} ${parametreSol.unite} (interpolé)` : ''
    },
    [modele, pan, nappe, compose, sols, parametreSol, seuil],
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
        if (fl.type === 'labo' && lot && /\/\s*kg/i.test(lot.lecture.unites.join(' ')))
          lus.push({ id, origine: 'fichier', nom: f.name, resume: `Résultats sur sols · ${fl.resume}`, forages: [], parametresSol: [], sols: [{ fichier: f.name, lecture: lot.lecture, date: lot.date }], eaux: null, avertissements: [] })
        else
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

  const basculerCouche = (k: NomCouche) => regler('couches', { ...reglages.couches, [k]: !reglages.couches[k] })
  const avertissements = [
    ...(donnees?.avertissements ?? []),
    ...(modele?.avertissements ?? []),
    ...(mntCourant?.erreur ? [`Relief IGN indisponible (${mntCourant.erreur}) : le sol passe par les cotes des forages.`] : []),
    ...(etatSol === 'erreur'
      ? [
          reglages.fond === 'geologie' && vignetteKo !== urlSol
            ? 'Carte géologique BRGM : le serveur n’autorise pas son usage dans une vue 3D, elle ne peut pas être drapée sur le sol ; elle est montrée en vignette sur l’emprise du modèle.'
            : `${FONDS[reglages.fond].libelle} : l’image n’a pas pu être chargée (service injoignable, ou qui n’autorise pas son usage dans une vue 3D). Les autres fonds restent disponibles.`,
        ]
      : []),
  ]
  const nbForages = modele?.points.filter((p) => p.forage?.lithologie.length).length ?? 0

  return (
    <>
      <section className="section">
        <div className="container">
          <p className="eyebrow">Synthèse · modèle conceptuel du site</p>
          <h1 style={{ maxWidth: '24ch' }}>Modèle 3D du site</h1>
          <p className="lede">
            Les logs de forage, la géologie, les eaux souterraines et les résultats d’analyses réunis dans une même vue en trois dimensions : sondages et piézomètres à leur
            place, modèle géologique interpolé entre les logs, surface de la nappe et sens d’écoulement à chaque campagne, panache d’un composé, sols au-dessus d’un seuil. On
            choisit ce qu’on affiche, on coupe le modèle et on parcourt les dates.
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
                équipement, résultats rattachés aux échantillons), Suivi temporel (toutes les campagnes, telles que regroupées et corrigées) et Résultats labo.
              </p>
            ) : sourcesDossier.length === 0 && !lectureDossier ? (
              <p className="st-note">Aucune donnée exploitable dans ce dossier pour l’instant : utilisez Logs de forage, Suivi temporel ou Résultats labo, ou déposez les fichiers ci-dessous.</p>
            ) : (
              <ul className="m3d-liste-sources">
                {sourcesDossier.map((s) => (
                  <li key={s.id}>
                    <label className="st-coche">
                      <input
                        type="checkbox"
                        checked={!exclues.includes(s.id)}
                        onChange={(e) => setExclues((x) => (e.target.checked ? x.filter((i) => i !== s.id) : [...x, s.id]))}
                      />
                      <strong>{s.nom}</strong>
                    </label>
                    <span className="st-note">{s.resume}</span>
                  </li>
                ))}
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
                Classeur de saisie des logs (format ERM : Collars, Lithology, Well Construction, Water Level, Samples), rapports du laboratoire sur sols (rattachés aux forages par
                le nom des échantillons, « S3 (0,5-1 m) ») ou sur eaux souterraines, fiches de prélèvement, tableau historique de surveillance. Les fichiers sont lus dans votre
                navigateur et ne sont envoyés nulle part.
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

      {modele && (
        <section className="section section--muted">
          <div className="m3d-conteneur">
            <h2 className="etape">
              <span>2</span> Modèle
            </h2>
            <p className="m3d-resume">
              {pluriel(modele.points.length, 'point')} · {pluriel(nbForages, 'log')} · {base ? pluriel(base.campagnes.length, 'campagne') : 'pas de suivi des eaux'}
              {modele.georef ? ` · Lambert 93${mntCourant?.grille ? ', relief IGN' : cleMnt && !mntCourant ? ', relief IGN en cours de chargement…' : ''}` : ' · coordonnées locales'} · exagération
              verticale ×{exag}
            </p>
            {avertissements.length > 0 && (
              <details className="m3d-avertissements">
                <summary>
                  {pluriel(avertissements.length, 'remarque')} sur les données
                </summary>
                <ul>
                  {avertissements.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </details>
            )}

            <div className="m3d-disposition">
              <div className="m3d-principal">
                <div className="m3d-barre" role="toolbar" aria-label="Vue">
                  {VUES.map(([v, l]) => (
                    <button key={v} type="button" className="btn btn--ghost btn--petit" onClick={() => rendu?.vue(v)}>
                      {l}
                    </button>
                  ))}
                  <span className="m3d-barre__espace" />
                  <button type="button" className="btn btn--petit" onClick={() => void exporterImage()} disabled={!rendu}>
                    Image PNG
                  </button>
                </div>
                <Vue3D
                  modele={modele}
                  exageration={exag}
                  couches={reglages.couches}
                  classes={classesVisibles}
                  points={pointsVisibles}
                  coupe={coupe}
                  fond={urlSol}
                  opaciteSol={reglages.opaciteSol}
                  nappe={nappe}
                  couleursNappe={couleursNappe}
                  marqueursEaux={marqueursEaux}
                  echantillons={marqueursSol}
                  enveloppe={enveloppe}
                  libelles={libelles}
                  selection={selection}
                  surSelection={setSelection}
                  texteSurvol={texteSurvol}
                  surFond={surFond}
                  surRendu={setRendu}
                >
                  <Legende
                    compose={reglages.couches.eaux || couleursNappe ? compose : null}
                    echelleEaux={echelleEaux}
                    refEaux={refEaux}
                    parametre={reglages.couches.echantillons ? parametreSol : null}
                    echelleSol={echelleSol}
                    guide={guide}
                    enveloppe={enveloppe}
                    seuil={seuil}
                  />
                  {reglages.fond === 'geologie' && etatSol === 'erreur' && urlSol && vignetteKo !== urlSol && (
                    <figure className="m3d-vignette">
                      <img src={urlSol} alt="Carte géologique 1/50 000 du BRGM sur l’emprise du modèle, nord en haut" onError={() => setVignetteKo(urlSol)} />
                      <figcaption>Carte géologique 1/50 000 (BRGM) · emprise du modèle, nord en haut</figcaption>
                    </figure>
                  )}
                  {selection && (
                    <Fiche
                      selection={selection}
                      modele={modele}
                      base={base}
                      nappe={nappe}
                      campagne={campagne}
                      compose={compose}
                      echelleEaux={echelleEaux}
                      parametresSol={parametresSol}
                      parametreSol={parametreSol}
                      guideSol={(c) => guides.get(c) ?? null}
                      enveloppe={enveloppe}
                      seuil={seuil}
                      surFermer={() => setSelection(null)}
                    />
                  )}
                </Vue3D>
                <p className="st-note m3d-aide">
                  Glisser pour tourner, clic droit (ou deux doigts) pour déplacer, molette pour zoomer · clic sur un forage, un échantillon ou un bloc pour sa fiche · les blocs géologiques cachent les forages : coupez le modèle ou masquez des lithologies pour voir dedans.
                </p>
                {etapes.length > 0 && <Frise etapes={etapes} index={indexEtape} surIndex={surIndex} />}
                {nappe?.ecoulement && (
                  <p className="st-note">
                    {etape?.libelle} : écoulement vers {direction(nappe.ecoulement.azimut)}, gradient {fr(nappe.ecoulement.gradient * 1000, 2)} ‰ (plan ajusté sur{' '}
                    {pluriel(nappe.charges.length, 'ouvrage')}).
                  </p>
                )}
              </div>

              <aside className="m3d-panneau" aria-label="Réglages du modèle">
                <fieldset>
                  <legend>Calques</legend>
                  {LIBELLES_COUCHES.map(([k, l]) => (
                    <label key={k} className="st-coche">
                      <input type="checkbox" checked={reglages.couches[k]} onChange={() => basculerCouche(k)} /> {l}
                    </label>
                  ))}
                  {reglages.couches.sol && (
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
                    </div>
                  )}
                </fieldset>

                {modele.geologie && reglages.couches.geologie && (
                  <fieldset>
                    <legend>Géologie</legend>
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
                    <label className="st-coche">
                      <input type="checkbox" checked={reglages.etendre} onChange={(e) => regler('etendre', e.target.checked)} /> Étendre à toute l’emprise
                    </label>
                    <p className="st-note">Sans cette option, rien n’est modélisé à plus de {fr(modele.portee)} m d’un forage.</p>
                  </fieldset>
                )}

                {base && base.composes.length > 0 && (
                  <fieldset>
                    <legend>Eaux souterraines</legend>
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
                          <input type="checkbox" checked={reglages.panache} onChange={(e) => regler('panache', e.target.checked)} /> Colorer la nappe (panache interpolé)
                        </label>
                        <p className="st-note">
                          {refEaux && !compose.terrain
                            ? `Valeur de comparaison : ${fr(refEaux.valeur)} ${compose.unite} (${refEaux.saisie ? 'saisie dans Suivi temporel' : `valeurs ERM, source ${refEaux.source}`}).`
                            : compose.terrain
                              ? 'Paramètre de terrain : échelle de la plus faible à la plus forte valeur mesurée.'
                              : 'Pas de valeur de comparaison : échelle des concentrations mesurées (logarithmique).'}
                        </p>
                      </>
                    )}
                  </fieldset>
                )}

                {parametresSol.length > 0 && (
                  <fieldset>
                    <legend>Sols</legend>
                    <label className="st-coche">
                      <input type="checkbox" checked={reglages.couches.echantillons} onChange={() => basculerCouche('echantillons')} /> Échantillons analysés
                    </label>
                    <label className="champ">
                      <span>Paramètre</span>
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
                            <p className="st-note">Ordre de grandeur pour orienter les investigations, pas une cubature : interpolation inverse distance, sans géostatistique.</p>
                          </div>
                        )}
                      </>
                    )}
                  </fieldset>
                )}

                <fieldset>
                  <legend>Coupe et échelle</legend>
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
                </fieldset>

                <fieldset>
                  <legend>Forages et ouvrages</legend>
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

                <button type="button" className="btn btn--ghost btn--petit" onClick={() => setReglages(REGLAGES_DEFAUT)}>
                  Réglages par défaut
                </button>
              </aside>
            </div>

            <details className="m3d-tableaux">
              <summary>Tableaux des valeurs affichées</summary>
              {nappe && nappe.charges.length + (pan?.valeurs.length ?? 0) > 0 && (
                <>
                  <h3>Eaux souterraines · {etape?.libelle}</h3>
                  <div className="tableau-defile">
                    <table className="tableau">
                      <thead>
                        <tr>
                          <th>Ouvrage</th>
                          <th>Niveau d’eau</th>
                          <th>Profondeur de l’eau</th>
                          {compose && <th>{`${compose.nom} (${compose.unite})`}</th>}
                          {compose && echelleEaux?.reference && <th>Rapport à la valeur de comparaison</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {modele.points
                          .filter((p) => nappe.charges.some((c) => c.cle === p.cle) || pan?.valeurs.some((v) => v.cle === p.cle))
                          .map((p) => {
                            const c = nappe.charges.find((x) => x.cle === p.cle)
                            const r = pan?.valeurs.find((x) => x.cle === p.cle)?.resultat
                            return (
                              <tr key={p.cle}>
                                <th scope="row">{p.nom}</th>
                                <td>{c ? (modele.relatif ? `${frM(-c.charge)} sous le sol` : `${fr(c.charge)} m NGF`) : '–'}</td>
                                <td>{c?.profondeur != null ? frM(c.profondeur) : '–'}</td>
                                {compose && (
                                  <td>
                                    {r && echelleEaux && <span className="m3d-pastille" style={{ background: couleurValeur(r.valeur, r.inferieur, echelleEaux) }} aria-hidden="true" />}
                                    {r ? r.brut : '–'}
                                  </td>
                                )}
                                {compose && echelleEaux?.reference && <td>{r && !r.inferieur ? `× ${fr(r.valeur / echelleEaux.reference, 2)}` : '–'}</td>}
                              </tr>
                            )
                          })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {parametreSol && sols.length > 0 && (
                <>
                  <h3>Sols · {parametreSol.nom}</h3>
                  <div className="tableau-defile">
                    <table className="tableau">
                      <thead>
                        <tr>
                          <th>Échantillon</th>
                          <th>Forage</th>
                          <th>Profondeur</th>
                          <th>Date</th>
                          <th>{`Résultat (${parametreSol.unite})`}</th>
                          {guide && <th>Rapport à la valeur guide</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {sols.map((s) => (
                          <tr key={`${s.cle}|${s.echantillon}`}>
                            <th scope="row">{s.echantillon}</th>
                            <td>{s.forage}</td>
                            <td>
                              {fr(s.de)} – {fr(s.a)} m
                            </td>
                            <td>{s.date ? formatDate(s.date) : '–'}</td>
                            <td>
                              <span className="m3d-pastille" style={{ background: couleurValeur(s.valeur, s.inferieur, echelleSol) }} aria-hidden="true" />
                              {s.brut}
                            </td>
                            {guide && <td>{!s.inferieur && s.valeur !== null ? `× ${fr(s.valeur / guide.valeur, 2)}` : '–'}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </details>

            <details className="m3d-tableaux">
              <summary>Méthode et limites</summary>
              <ul>
                <li>
                  <strong>Position et cotes</strong> : coordonnées de l’onglet Collars des logs, sinon de l’onglet Ouvrages du suivi ; cote du sol du log, sinon du MNT IGN (RGE
                  ALTI®, en Lambert 93), sinon de la cote du repère de l’ouvrage. Le sol passe par les cotes nivelées des forages, le MNT donnant le relief entre eux.
                </li>
                <li>
                  <strong>Géologie</strong> : chaque bloc prend la lithologie dominante des forages voisins à la même cote, pondérée par l’inverse du carré de la distance (un mètre
                  vertical comptant pour dix horizontaux), entre le sol et le fond des forages, à moins de {fr(modele.portee)} m d’un forage. Les couches sont regroupées par leur
                  composant principal, le premier mot-clé du log (« sable argileux » est un sable). Entre les forages, c’est une lecture possible, pas une observation.
                </li>
                <li>
                  <strong>Nappe</strong> : cote piézométrique de chaque ouvrage (mesurée, sinon cote du repère − profondeur de l’eau), plan des moindres carrés et écarts répartis
                  par inverse distance. Le sens d’écoulement et le gradient sont ceux du plan (comme dans Suivi temporel, 3 ouvrages au moins).
                </li>
                <li>
                  <strong>Panache</strong> : interpolation inverse distance sur le logarithme des concentrations (la moitié de la LQ pour un résultat non quantifié), montrée près
                  des ouvrages seulement. Les classes comparent à la valeur de comparaison de Suivi temporel (ou saisie là-bas).
                </li>
                <li>
                  <strong>Sols</strong> : échantillons au milieu de leur intervalle ; enveloppe au-dessus d’un seuil par inverse distance en trois dimensions sur le logarithme des
                  résultats (un mètre vertical pour cinq horizontaux), limitée aux trois quarts de l’espacement des sondages échantillonnés autour de chacun et à 1 m
                  au-dessus et au-dessous de l’intervalle prélevé. Valeurs guides ERM pour les sols, sur site.
                </li>
              </ul>
            </details>
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

function Legende(p: {
  compose: Compose | null
  echelleEaux: Echelle | null
  refEaux: { valeur: number; source: string } | null
  parametre: { nom: string; unite: string } | null
  echelleSol: Echelle
  guide: { valeur: number; source: string } | null
  enveloppe: { volume: number } | null
  seuil: number | null
}) {
  const blocs: { titre: string; echelle: Echelle; unite: string }[] = []
  if (p.compose && p.echelleEaux) blocs.push({ titre: `Eaux : ${p.compose.nom}`, echelle: p.echelleEaux, unite: p.compose.unite })
  if (p.parametre) blocs.push({ titre: `Sols : ${p.parametre.nom}`, echelle: p.echelleSol, unite: p.parametre.unite })
  if (!blocs.length && !p.enveloppe) return null
  return (
    <div className="m3d-legende">
      {blocs.map((b) => (
        <div key={b.titre} className="m3d-legende__bloc">
          <strong>{b.titre}</strong>
          {b.echelle.reference ? (
            <ul>
              {(Object.keys(CLASSES_CONCENTRATION) as ClasseConcentration[]).map((c) => (
                <li key={c}>
                  <span className="m3d-pastille" style={{ background: CLASSES_CONCENTRATION[c].couleur }} aria-hidden="true" />
                  {CLASSES_CONCENTRATION[c].libelle}
                </li>
              ))}
              <li className="st-note">
                référence : {fr(b.echelle.reference)} {b.unite}
              </li>
            </ul>
          ) : (
            <>
              <div className="m3d-rampe" style={{ background: `linear-gradient(to right, ${RAMPE.join(', ')})` }} aria-hidden="true" />
              <div className="m3d-rampe__bornes">
                <span>{fr(b.echelle.min)}</span>
                <span>
                  {fr(b.echelle.max)} {b.unite}
                </span>
              </div>
              <span className="st-note">
                <span className="m3d-pastille" style={{ background: COULEUR_NQ }} aria-hidden="true" />
                non quantifié
              </span>
            </>
          )}
        </div>
      ))}
      {p.enveloppe && p.seuil && (
        <div className="m3d-legende__bloc">
          <span className="m3d-pastille" style={{ background: '#b3261e', opacity: 0.6 }} aria-hidden="true" />
          Sols ≥ {fr(p.seuil)} {p.parametre?.unite} : {fr(p.enveloppe.volume)} m³
        </div>
      )}
    </div>
  )
}
