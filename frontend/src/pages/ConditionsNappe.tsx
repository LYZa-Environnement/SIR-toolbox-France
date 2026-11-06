import { Fragment, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { lireNombre } from '../lib/resultats/calc'
import { fusionnerLectures } from '../lib/resultats/fusion'
import { lireClasseur, type Cell, type Lecture } from '../lib/resultats/parse'
import TransportBiochlor from '../components/nappe/TransportBiochlor'
import { associationAuto, construireJeu, decalageFiches } from '../lib/nappe/donnees'
import {
  BAREME_CLASSES,
  COMPOSES_FILIATION,
  evaluer,
  LIBELLES_CLASSE,
  lireSite,
  STATUTS_DEFAUT,
  type Classe,
  type Compose,
  LIBELLES_FAVORABILITE,
  type Evaluation,
  type Favorabilite,
  type Niveau,
  type Statut,
} from '../lib/nappe/evaluation'
import { cleOuvrage, lireFiches, type FicheTerrain } from '../lib/nappe/fiches'
import { formatValeur, LIBELLES_GROUPE, PARAMS, type Groupe } from '../lib/nappe/parametres'
import { SOURCES } from '../lib/nappe/sources'
import { synthetiser, type Synthese } from '../lib/nappe/synthese'
import { calculerTransport, HYDRO_DEFAUT, type SaisieHydro } from '../lib/nappe/transport'
import { formatExtreme, formatMoyenne, recapTerrain, syntheseTerrain } from '../lib/nappe/recap'

type Feuille = { nom: string; grille: Cell[][] }

async function lireOnglets(f: File): Promise<Feuille[]> {
  const XLSX = await import('xlsx')
  const classeur = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true })
  return classeur.SheetNames.map((nom) => ({
    nom,
    grille: XLSX.utils.sheet_to_json<Cell[]>(classeur.Sheets[nom], { header: 1, raw: true, defval: null }),
  }))
}

const BADGE_CLASSE: Record<Classe, string> = {
  forte: 'badge badge--faible',
  suffisante: 'badge badge--faible',
  limitee: 'badge badge--moderee',
  insuffisante: 'badge badge--indeterminee',
}
const BADGE_CONDITIONS: Record<Favorabilite, string> = {
  favorable: 'badge badge--faible',
  possible: 'badge badge--faible',
  limite: 'badge badge--moderee',
  defavorable: 'badge badge--elevee',
  indetermine: 'badge badge--indeterminee',
}
const ORDRE_CONDITIONS: Favorabilite[] = ['favorable', 'possible', 'limite', 'defavorable', 'indetermine']
const COULEUR_NIVEAU: Record<Niveau, string> = { alerte: 'var(--level-elevee)', vigilance: 'var(--level-moderee)', info: 'var(--color-muted)' }

const fr = (x: number | null | undefined, d = 2) =>
  x === null || x === undefined || !Number.isFinite(x) ? '-' : Number(x.toPrecision(3)).toLocaleString('fr-FR', { maximumFractionDigits: d })

function Depot({ titre, aide, multiple, chargement, onFichiers }: { titre: string; aide: ReactNode; multiple?: boolean; chargement: boolean; onFichiers: (f: File[]) => void }) {
  const [survol, setSurvol] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const deposer = (e: DragEvent) => {
    e.preventDefault()
    setSurvol(false)
    onFichiers([...e.dataTransfer.files])
  }
  return (
    <div
      className={`depot${survol ? ' depot--survol' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setSurvol(true)
      }}
      onDragLeave={() => setSurvol(false)}
      onDrop={deposer}
    >
      <input
        ref={input}
        type="file"
        multiple={multiple}
        accept=".xlsx,.xlsm,.xls,.csv"
        style={{ display: 'none' }}
        onChange={(e) => {
          onFichiers([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
      <p style={{ margin: 0, fontWeight: 600 }}>{chargement ? 'Lecture…' : titre}</p>
      <p style={{ margin: '0.25rem 0 0.9rem', fontSize: '0.88rem', color: 'var(--color-muted)' }}>{aide}</p>
      <button type="button" className="btn" onClick={() => input.current?.click()} disabled={chargement}>
        Choisir {multiple ? 'des fichiers' : 'un fichier'}
      </button>
    </div>
  )
}

export default function ConditionsNappe() {
  const [fiches, setFiches] = useState<FicheTerrain[]>([])
  const [fichiersFiches, setFichiersFiches] = useState<string[]>([])
  const [ignores, setIgnores] = useState<string[]>([])
  const [labos, setLabos] = useState<{ lecture: Lecture; nom: string }[]>([])
  const [association, setAssociation] = useState<Record<string, string>>({})
  const [saisies, setSaisies] = useState<Record<string, string>>({})
  const [ajouts, setAjouts] = useState<string[]>([])
  const [nouvelOuvrage, setNouvelOuvrage] = useState('')
  const [decalage, setDecalage] = useState('')
  const [fond, setFond] = useState<string[]>([])
  const [statuts, setStatuts] = useState<Record<Compose, Statut>>(STATUTS_DEFAUT)
  const [ouvert, setOuvert] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [chargement, setChargement] = useState<'fiches' | 'labo' | null>(null)
  const [projet, setProjet] = useState('')
  const [export_, setExport] = useState(false)
  const [hydro, setHydro] = useState<SaisieHydro>(HYDRO_DEFAUT)
  const [exportRecap, setExportRecap] = useState(false)
  const [copie, setCopie] = useState(false)
  const [avecBiochlor, setAvecBiochlor] = useState(false)

  async function chargerFiches(fs: File[]) {
    if (!fs.length) return
    setChargement('fiches')
    setErreur(null)
    try {
      const lus = await Promise.all(fs.map(async (f) => ({ f, ...lireFiches(await lireOnglets(f)) })))
      const toutes = lus.flatMap((l) => l.fiches)
      if (!toutes.length) throw new Error("Aucune fiche de prélèvement reconnue : le tableau de purge (colonnes « pH », « Redox »…) n'a pas été trouvé.")
      setFiches((avant) => [...avant.filter((a) => !toutes.some((t) => cleOuvrage(t.ouvrage) === cleOuvrage(a.ouvrage))), ...toutes])
      setFichiersFiches((avant) => [...new Set([...avant, ...fs.map((f) => f.name)])])
      setIgnores((avant) => [...avant, ...lus.flatMap((l) => l.ignores.map((o) => `${l.f.name} — ${o}`))])
      const d = decalageFiches(toutes)
      if (d !== null && !decalage) setDecalage(String(d).replace('.', ','))
    } catch (e) {
      setErreur((e as Error).message)
    } finally {
      setChargement(null)
    }
  }

  async function chargerLabo(fs: File[]) {
    if (!fs.length) return
    setChargement('labo')
    setErreur(null)
    try {
      const lus = await Promise.all(fs.map(async (f) => ({ lecture: lireClasseur(await lireOnglets(f), 'tout'), nom: f.name })))
      setLabos((avant) => [...avant, ...lus])
    } catch (e) {
      setErreur(`Fichier du laboratoire non lu : ${(e as Error).message}`)
    } finally {
      setChargement(null)
    }
  }

  const labo = useMemo(() => {
    if (!labos.length) return { lecture: null as { lecture: Lecture; nom: string } | null, notes: [] as string[], erreur: null as string | null }
    try {
      const f = fusionnerLectures(labos)
      return { lecture: { lecture: f.lecture, nom: labos.map((l) => l.nom).join(' + ') }, notes: f.notes, erreur: null }
    } catch (e) {
      return { lecture: null, notes: [], erreur: (e as Error).message }
    }
  }, [labos])

  const jeu = useMemo(() => construireJeu({ fiches, labo: labo.lecture, association, saisies, ajouts }), [fiches, labo, association, saisies, ajouts])
  const dec = lireNombre(decalage) ?? 0
  const options = useMemo(() => ({ decalage: dec, fond, statuts }), [dec, fond, statuts])
  const site = useMemo(() => lireSite(jeu.valeurs, fond), [jeu, fond])
  const evaluations = useMemo(() => jeu.ouvrages.map((o) => evaluer(o, jeu.valeurs[o.cle] ?? {}, site, options)), [jeu, site, options])

  const recap = useMemo(() => recapTerrain(jeu, evaluations, dec), [jeu, evaluations, dec])
  const syntheseRecap = useMemo(() => syntheseTerrain(recap, evaluations), [recap, evaluations])

  const plusContamine = evaluations.reduce<Evaluation | null>((m, e) => (e.cohvMolaire > (m?.cohvMolaire ?? 0) ? e : m), null)
  const comptes = new Map<Classe, number>()
  for (const e of evaluations) if (e.score.complet) comptes.set(e.score.classe, (comptes.get(e.score.classe) ?? 0) + 1)
  const complets = evaluations.filter((e) => e.score.complet).length
  const conditions = new Map<Favorabilite, number>()
  for (const e of evaluations) conditions.set(e.lecture.conditions, (conditions.get(e.lecture.conditions) ?? 0) + 1)
  const requisSite = PARAMS.filter((p) => p.requis && !evaluations.some((e) => jeu.valeurs[e.ouvrage.cle]?.[p.id]))
  // Limits and useful analyses shared by most wells, said once.
  const frequents = (liste: (e: Evaluation) => string[]) => {
    const n = new Map<string, number>()
    for (const e of evaluations) for (const x of liste(e)) n.set(x, (n.get(x) ?? 0) + 1)
    return [...n.entries()].filter(([, k]) => k >= evaluations.length / 2).map(([x]) => x)
  }
  const limitesSite = frequents((e) => e.lecture.limites)
  const analysesSite = frequents((e) => e.lecture.analysesUtiles)

  const synthese = useMemo(() => synthetiser(jeu, evaluations), [jeu, evaluations])
  const transport = useMemo(() => calculerTransport(hydro, jeu, plusContamine?.ouvrage.cle ?? ''), [hydro, jeu, plusContamine])
  const nomOuvrage = (cle: string) => jeu.ouvrages.find((o) => o.cle === cle)?.nom ?? cle

  const fichesMesurees = fiches.filter((f) => !f.vide)
  const fichesVides = fiches.filter((f) => f.vide)
  const decalagesFiches = [...new Set(fichesMesurees.map((f) => f.decalage).filter((x): x is number => x !== null))]

  async function exporter() {
    setExport(true)
    try {
      const { telechargerRapport } = await import('../lib/nappe/export')
      const date = new Date().toISOString().slice(0, 10)
      await telechargerRapport(
        {
          titre: `Conditions de la nappe${projet ? ` — ${projet}` : ''}`,
          contexte: [
            ['Fiches de prélèvement', fichiersFiches.join(', ') || '-'],
            ['Résultats du laboratoire', labos.map((l) => l.nom).join(', ') || 'aucun (paramètres de terrain seuls)'],
            ['Écart redox mesuré → Eh', `${fr(dec, 1)} mV (électrode de référence Ag/AgCl)`],
            ['Ouvrages de fond', fond.map(nomOuvrage).join(', ') || 'aucun désigné'],
            [
              'Ouvrage le plus contaminé (COHV, µmol/l)',
              plusContamine
                ? `${plusContamine.ouvrage.nom} — conditions ${LIBELLES_FAVORABILITE[plusContamine.lecture.conditions].toLowerCase()}, score USEPA ${plusContamine.score.complet ? `${plusContamine.score.total} (${LIBELLES_CLASSE[plusContamine.score.classe].toLowerCase()})` : `partiel ${plusContamine.score.total} / ${plusContamine.score.accessible}`}`
                : '-',
            ],
            ['Criblage USEPA complet (nitrates, fer, sulfates, méthane)', `${complets} ouvrage${complets > 1 ? 's' : ''} sur ${evaluations.length}`],
            ['Analyses requises absentes partout', requisSite.map((p) => p.libelle).join(', ') || 'aucune'],
            ['Limites de l’interprétation', limitesSite.join(' ') || '-'],
            ['Analyses utiles', analysesSite.join(' ; ') || '-'],
          ],
          limites: limitesSite,
          jeu,
          evaluations,
          options,
          synthese,
          transport: avecBiochlor && transport.vx !== null ? transport : undefined,
          recap: recap.ouvrages ? { recap, synthese: syntheseRecap } : undefined,
        },
        `Conditions nappe${projet ? ` - ${projet}` : ''} - ${date}.xlsx`,
      )
    } finally {
      setExport(false)
    }
  }

  async function exporterRecap() {
    setExportRecap(true)
    try {
      const { telechargerRecap } = await import('../lib/nappe/export')
      const date = new Date().toISOString().slice(0, 10)
      await telechargerRecap(
        `Récapitulatif des paramètres de terrain${projet ? ` — ${projet}` : ''}`,
        { recap, synthese: syntheseRecap },
        `Recap parametres terrain${projet ? ` - ${projet}` : ''} - ${date}.xlsx`,
      )
    } finally {
      setExportRecap(false)
    }
  }

  async function copierSynthese() {
    try {
      await navigator.clipboard.writeText(syntheseRecap.join(' '))
      setCopie(true)
      setTimeout(() => setCopie(false), 2000)
    } catch {
      setCopie(false)
    }
  }

  const saisir = (cle: string, id: string, v: string) => setSaisies((s) => ({ ...s, [`${cle}|${id}`]: v }))
  const echantillons = labo.lecture?.lecture.points ?? []
  const optionsOuvrages = [...new Map([...fiches.map((f) => [cleOuvrage(f.ouvrage), f.ouvrage] as const), ...jeu.ouvrages.map((o) => [o.cle, o.nom] as const)]).entries()]

  return (
    <>
      <section className="section">
        <div className="container">
          <p className="eyebrow">Eaux souterraines — atténuation naturelle</p>
          <h1 style={{ maxWidth: '26ch' }}>Conditions de la nappe</h1>
          <p className="lede">
            Lisez les fiches de prélèvement (pH, redox, oxygène dissous, conductivité, température en fin de purge) et, si vous les avez, les
            résultats du laboratoire : processus redox dominant, criblage de la déchloration réductrice selon le protocole USEPA 1998 (repris par
            BIOCHLOR), devenir du chlorure de vinyle, contrôle des mesures et données d'entrée de BIOCHLOR. Les données restent dans votre
            navigateur.
          </p>

          <h2 className="etape">
            <span>1</span> Fiches de prélèvement
          </h2>
          <Depot
            titre="Déposez ici le classeur des fiches de prélèvement"
            aide="Une fiche par onglet (modèle ERM ou équivalent) : tableau de purge avec pH, redox mesuré et corrigé, oxygène dissous, conductivité, température. Plusieurs classeurs possibles."
            multiple
            chargement={chargement === 'fiches'}
            onFichiers={chargerFiches}
          />
          {fiches.length > 0 && (
            <div className="card" style={{ marginTop: '1rem', maxWidth: '48rem' }}>
              <strong>{fichiersFiches.join(', ')}</strong>
              <p style={{ margin: '0.3rem 0 0', fontSize: '0.9rem' }}>
                {fiches.length} fiche{fiches.length > 1 ? 's' : ''} lue{fiches.length > 1 ? 's' : ''}, dont {fichesMesurees.length} avec des mesures.
                {fichesVides.length > 0 && ` Sans mesure (ignorées) : ${fichesVides.map((f) => f.onglet).join(', ')}.`}
                {ignores.length > 0 && ` Onglets non reconnus : ${ignores.join(', ')}.`}
              </p>
              <p style={{ margin: '0.3rem 0 0', fontSize: '0.88rem', color: 'var(--color-muted)' }}>
                Valeur retenue : dernière lecture complète de la purge. Écart « redox corrigé − mesuré » lu sur les fiches :{' '}
                {decalagesFiches.length ? decalagesFiches.map((d) => `${fr(d, 1)} mV`).join(', ') : 'non renseigné'}.
              </p>
              <button
                type="button"
                className="btn btn--ghost btn--petit"
                style={{ marginTop: '0.5rem' }}
                onClick={() => {
                  setFiches([])
                  setFichiersFiches([])
                  setIgnores([])
                }}
              >
                Retirer les fiches
              </button>
            </div>
          )}

          <h2 className="etape">
            <span>2</span> Résultats du laboratoire (facultatif)
          </h2>
          <Depot
            titre="Déposez ici le ou les fichiers du laboratoire"
            aide="ALS / Wessling, Eurofins, SGS : disposition reconnue automatiquement. Utiles : nitrates, fer (II ou dissous), manganèse, sulfates, sulfures, méthane, éthène/éthane, COT, chlorures, alcalinité, COHV, BTEX."
            multiple
            chargement={chargement === 'labo'}
            onFichiers={chargerLabo}
          />
          {erreur && (
            <p role="alert" className="alerte">
              {erreur}
            </p>
          )}
          {labo.erreur && (
            <p role="alert" className="alerte">
              {labo.erreur}
            </p>
          )}
          {labo.lecture && (
            <div className="card" style={{ marginTop: '1rem', maxWidth: '60rem' }}>
              <strong>{labo.lecture.nom}</strong>
              {labo.notes.map((n) => (
                <p key={n} style={{ margin: '0.3rem 0 0', fontSize: '0.88rem', color: 'var(--color-muted)' }}>
                  {n}
                </p>
              ))}
              <p style={{ margin: '0.4rem 0 0', fontSize: '0.88rem' }}>
                Paramètres reconnus :{' '}
                {Object.entries(jeu.reconnus)
                  .map(([id, l]) => `${PARAMS.find((p) => p.id === id)?.libelle} ← ${l!.join(', ')}`)
                  .join(' ; ') || 'aucun'}
              </p>
              {jeu.unitesIgnorees.length > 0 && (
                <p style={{ margin: '0.3rem 0 0', fontSize: '0.88rem', color: 'var(--level-elevee)' }}>Unités non comprises, lignes écartées : {jeu.unitesIgnorees.join(', ')}</p>
              )}
              <details className="qualif" style={{ marginTop: '0.75rem' }} open={echantillons.some((p) => !fiches.some((f) => cleOuvrage(f.ouvrage) === associationAuto(p.nom, fiches)))}>
                <summary>Correspondance des échantillons avec les ouvrages ({echantillons.length})</summary>
                <div className="tableau-defile" style={{ maxHeight: '20rem', marginTop: '0.5rem' }}>
                  <table className="tableau">
                    <thead>
                      <tr>
                        <th>Échantillon du laboratoire</th>
                        <th>Ouvrage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {echantillons.map((p) => {
                        const auto = associationAuto(p.nom, fiches)
                        const v = association[p.nom] ?? auto
                        const connu = fiches.some((f) => cleOuvrage(f.ouvrage) === v)
                        return (
                          <tr key={p.nom}>
                            <td>{p.nom}</td>
                            <td>
                              <select value={v} onChange={(e) => setAssociation((a) => ({ ...a, [p.nom]: e.target.value }))}>
                                {!connu && v && <option value={v}>{p.nom} (sans fiche)</option>}
                                {optionsOuvrages
                                  .filter(([cle]) => cle !== v || connu)
                                  .map(([cle, nom]) => (
                                    <option key={cle} value={cle}>
                                      {nom}
                                    </option>
                                  ))}
                                <option value="">— ne pas utiliser —</option>
                              </select>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </details>
              <button
                type="button"
                className="btn btn--ghost btn--petit"
                style={{ marginTop: '0.5rem' }}
                onClick={() => {
                  setLabos([])
                  setAssociation({})
                }}
              >
                Retirer les résultats du laboratoire
              </button>
            </div>
          )}

          <h2 className="etape">
            <span>3</span> Réglages
          </h2>
          <div className="grid grid--3" style={{ alignItems: 'end' }}>
            <label className="champ">
              Projet / site (optionnel)
              <input value={projet} onChange={(e) => setProjet(e.target.value)} placeholder="ex. 0659943 — site X" />
            </label>
            <label className="champ">
              Écart redox mesuré → Eh (mV)
              <input inputMode="decimal" value={decalage} onChange={(e) => setDecalage(e.target.value)} placeholder="ex. 212 (Ag/AgCl, KCl 3 M)" />
            </label>
            <label className="champ">
              Ajouter un ouvrage (saisie manuelle)
              <span style={{ display: 'flex', gap: '0.4rem' }}>
                <input value={nouvelOuvrage} onChange={(e) => setNouvelOuvrage(e.target.value)} placeholder="ex. Pz12" />
                <button
                  type="button"
                  className="btn btn--petit"
                  disabled={!nouvelOuvrage.trim()}
                  onClick={() => {
                    setAjouts((a) => [...a, nouvelOuvrage.trim()])
                    setNouvelOuvrage('')
                  }}
                >
                  Ajouter
                </button>
              </span>
            </label>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)', margin: '0.5rem 0 0' }}>
            Le protocole USEPA note le redox mesuré contre l'électrode Ag/AgCl ; l'écart ne sert qu'à afficher Eh (électrode normale à hydrogène).
          </p>

          {jeu.ouvrages.length > 0 && (
            <div className="grid grid--2" style={{ marginTop: '1rem', gap: '1rem' }}>
              <details className="qualif card">
                <summary>Ouvrages de fond — amont, hors panache ({fond.length})</summary>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)', margin: '0.5rem 0' }}>
                  Référence des critères « &gt; 2 × le fond » (chlorures, alcalinité, CO₂) : médiane des ouvrages cochés.
                </p>
                <div style={{ columns: '3 9rem', fontSize: '0.88rem' }}>
                  {jeu.ouvrages.map((o) => (
                    <label key={o.cle} style={{ display: 'block' }}>
                      <input
                        type="checkbox"
                        checked={fond.includes(o.cle)}
                        onChange={(e) => setFond((f) => (e.target.checked ? [...f, o.cle] : f.filter((x) => x !== o.cle)))}
                      />{' '}
                      {o.nom}
                    </label>
                  ))}
                </div>
              </details>
              <details className="qualif card">
                <summary>Composés rejetés ou produits de dégradation</summary>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)', margin: '0.5rem 0' }}>
                  Un composé fille ne rapporte de points que s'il n'était pas présent dans le produit rejeté (note a/ du tableau 2.3).
                </p>
                {COMPOSES_FILIATION.map((c) => (
                  <label key={c.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', fontSize: '0.88rem', marginTop: '0.3rem' }}>
                    <select value={statuts[c.id]} onChange={(e) => setStatuts((s) => ({ ...s, [c.id]: e.target.value as Statut }))}>
                      <option value="auto">Automatique</option>
                      <option value="filiation">Produit de dégradation</option>
                      <option value="rejete">Rejeté (produit source)</option>
                    </select>
                    <span>
                      <strong>{c.libelle}</strong> — {c.regle}
                    </span>
                  </label>
                ))}
              </details>
            </div>
          )}
        </div>
      </section>

      {evaluations.length > 0 && (
        <section className="section section--muted">
          <div className="container">
            <h2 className="etape">
              <span>4</span> Synthèse générale
            </h2>
            <SyntheseGenerale s={synthese} />
            {recap.ouvrages > 0 && (
              <div className="card recap-terrain" style={{ marginTop: '1.5rem' }}>
                <span className="eyebrow">Récapitulatif des paramètres de terrain</span>
                <p style={{ margin: '0.3rem 0 0.75rem', fontSize: '0.88rem', color: 'var(--color-muted)' }}>
                  Fin de purge, {recap.ouvrages} ouvrage{recap.ouvrages > 1 ? 's' : ''} ; entre parenthèses, l'ouvrage où la valeur est relevée.
                </p>
                <div className="tableau-defile">
                  <table className="tableau">
                    <thead>
                      <tr>
                        <th>Paramètre</th>
                        <th>Unité</th>
                        <th>Ouvrages</th>
                        <th>Minimum (ouvrage)</th>
                        <th>Maximum (ouvrage)</th>
                        <th>Moyenne</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recap.lignes.map((l) => (
                        <tr key={l.id}>
                          <td>
                            <strong>{l.libelle}</strong>
                          </td>
                          <td>{l.unite}</td>
                          <td style={{ textAlign: 'center' }}>{l.n}</td>
                          <td>{formatExtreme(l.min, l.id)}</td>
                          <td>{formatExtreme(l.max, l.id)}</td>
                          <td>{formatMoyenne(l)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {syntheseRecap.length > 0 && (
                  <>
                    <h3 style={{ fontSize: '1rem', margin: '1.25rem 0 0.4rem' }}>Synthèse des conditions physico-chimiques</h3>
                    <div className="recap-terrain__synthese">
                      {syntheseRecap.map((p) => (
                        <p key={p}>{p}</p>
                      ))}
                    </div>
                  </>
                )}
                {recap.exclus.length > 0 && (
                  <p style={{ fontSize: '0.82rem', color: 'var(--color-muted)', margin: '0.5rem 0 0' }}>
                    Mesures du laboratoire non comptées comme mesures de terrain : {recap.exclus.join(', ')}.
                  </p>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
                  <button type="button" className="btn btn--petit" onClick={() => void exporterRecap()} disabled={exportRecap}>
                    {exportRecap ? 'Préparation…' : 'Télécharger le tableau récapitulatif (Excel)'}
                  </button>
                  {syntheseRecap.length > 0 && (
                    <button type="button" className="btn btn--ghost btn--petit" onClick={() => void copierSynthese()}>
                      {copie ? 'Synthèse copiée' : 'Copier la synthèse'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {evaluations.length > 0 && (
        <section className="section">
          <div className="container">
            <h2 className="etape">
              <span>5</span> Conditions par ouvrage
            </h2>
            <div className="grid grid--3" style={{ gap: '1rem', marginBottom: '1rem' }}>
              <div className="card">
                <span className="eyebrow">Zone la plus contaminée</span>
                {plusContamine ? (
                  <>
                    <p style={{ margin: '0.3rem 0 0' }}>
                      <strong>{plusContamine.ouvrage.nom}</strong> ({fr(plusContamine.cohvMolaire)} µmol/l de COHV) : conditions{' '}
                      <span className={BADGE_CONDITIONS[plusContamine.lecture.conditions]}>{LIBELLES_FAVORABILITE[plusContamine.lecture.conditions].toLowerCase()}</span>
                    </p>
                    <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem' }}>{plusContamine.lecture.conclusion}</p>
                  </>
                ) : (
                  <p style={{ margin: '0.3rem 0 0', fontSize: '0.9rem', color: 'var(--color-muted)' }}>Pas de COHV quantifié (résultats du laboratoire nécessaires).</p>
                )}
              </div>
              <div className="card">
                <span className="eyebrow">Conditions pour la déchloration réductrice</span>
                <p style={{ margin: '0.3rem 0 0', fontSize: '0.9rem' }}>
                  {ORDRE_CONDITIONS.filter((c) => conditions.get(c))
                    .map((c) => `${conditions.get(c)} ${LIBELLES_FAVORABILITE[c].toLowerCase()}`)
                    .join(' · ')}
                </p>
                <p style={{ margin: '0.3rem 0 0', fontSize: '0.82rem', color: 'var(--color-muted)' }}>
                  Criblage USEPA complet : {complets} ouvrage{complets > 1 ? 's' : ''} sur {evaluations.length}
                  {complets > 0 && ` (${BAREME_CLASSES.filter((b) => comptes.get(b.classe)).map((b) => `${comptes.get(b.classe)} ${LIBELLES_CLASSE[b.classe].toLowerCase()}`).join(', ')})`}
                </p>
              </div>
              <div className="card">
                <span className="eyebrow">Analyses requises absentes</span>
                <p style={{ margin: '0.3rem 0 0', fontSize: '0.9rem' }}>{requisSite.length ? requisSite.map((p) => p.libelle).join(', ') : 'Aucune'}</p>
              </div>
            </div>
            {limitesSite.length > 0 && (
              <div className="card" style={{ marginBottom: '1rem', borderLeft: '3px solid var(--level-moderee)' }}>
                <strong>Ce que les données permettent de dire — et pas</strong>
                <p style={{ margin: '0.4rem 0 0', fontSize: '0.88rem' }}>
                  La lecture repose sur un faisceau d'indices : conditions d'oxygène et de redox (seuils USEPA 1998), produits de dégradation des
                  solvants chlorés, sources de carbone. Elle situe chaque ouvrage, sans démontrer la déchloration.
                </p>
                <ul style={{ margin: '0.4rem 0 0', fontSize: '0.88rem' }}>
                  {limitesSite.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
                {analysesSite.length > 0 && (
                  <p style={{ margin: '0.4rem 0 0', fontSize: '0.88rem' }}>
                    <strong>Pour lever ces limites :</strong> {analysesSite.join(' ; ')}.
                  </p>
                )}
              </div>
            )}
            <div className="tableau-defile" style={{ maxHeight: '40rem' }}>
              <table className="tableau">
                <thead>
                  <tr>
                    <th>Ouvrage</th>
                    <th>pH</th>
                    <th title="Redox mesuré contre Ag/AgCl, et Eh">Redox (Eh) mV</th>
                    <th>O₂ mg/l (sat.)</th>
                    <th>CE µS/cm</th>
                    <th>T °C</th>
                    <th>Conditions (déchloration)</th>
                    <th>Indices de dégradation</th>
                    <th>Processus redox</th>
                    <th title="Complet : nitrates, fer, sulfates et méthane disponibles">Score USEPA</th>
                    <th>Vigilance</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluations.map((e) => {
                    const t = jeu.valeurs[e.ouvrage.cle] ?? {}
                    const actif = ouvert === e.ouvrage.cle
                    const alertes = e.alertes.filter((a) => a.niveau !== 'info').length
                    return (
                      <Fragment key={e.ouvrage.cle}>
                        <tr onClick={() => setOuvert(actif ? null : e.ouvrage.cle)} style={{ cursor: 'pointer' }} className={actif ? 'tableau__selection' : undefined}>
                          <td>
                            <strong>{e.ouvrage.nom}</strong>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{e.ouvrage.date}</div>
                          </td>
                          <td>{fr(t.ph?.valeur)}</td>
                          <td>
                            {fr(t.orp?.valeur, 1)}
                            {e.eh !== null && <span style={{ color: 'var(--color-muted)' }}> ({fr(e.eh, 0)})</span>}
                          </td>
                          <td>
                            {t.od ? formatValeur(t.od) : '-'}
                            {e.saturationO2 !== null && <span style={{ color: e.saturationO2 > 110 ? 'var(--level-elevee)' : 'var(--color-muted)' }}> ({fr(e.saturationO2, 0)} %)</span>}
                          </td>
                          <td>{fr(t.ce?.valeur, 0)}</td>
                          <td>{fr(t.t?.valeur, 1)}</td>
                          <td>
                            <span className={BADGE_CONDITIONS[e.lecture.conditions]} title={e.lecture.motifConditions}>
                              {LIBELLES_FAVORABILITE[e.lecture.conditions]}
                            </span>
                          </td>
                          <td style={{ fontSize: '0.8rem', minWidth: '12rem' }}>{e.lecture.indices[0] ?? (e.cohvMolaire ? 'Aucun produit de dégradation' : '-')}</td>
                          <td style={{ minWidth: '9rem' }}>
                            {e.redox.categorie}
                            {e.redox.processus !== '—' && <div style={{ fontSize: '0.78rem', color: 'var(--color-muted)' }}>{e.redox.processus}</div>}
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {e.score.complet ? (
                              <span className={BADGE_CLASSE[e.score.classe]} title={LIBELLES_CLASSE[e.score.classe]}>
                                {e.score.total}
                              </span>
                            ) : (
                              <span
                                className="badge badge--indeterminee"
                                title={`Score partiel : ${e.score.geochimieManquante.join(', ')} manquants ; non comparable aux classes du tableau 2.4`}
                              >
                                {e.score.total} / {e.score.accessible}
                              </span>
                            )}
                            {!e.score.complet && <div style={{ fontSize: '0.72rem', color: 'var(--color-muted)' }}>partiel</div>}
                          </td>
                          <td style={{ fontSize: '0.8rem' }}>{alertes ? `${alertes} point${alertes > 1 ? 's' : ''}` : '-'}</td>
                        </tr>
                        {actif && (
                          <tr>
                            <td colSpan={11} style={{ background: 'var(--color-surface)' }}>
                              <Detail e={e} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)' }}>
              Cliquez sur un ouvrage pour le détail. Conditions : O₂ &lt; 0,5 mg/l et redox &lt; −100 mV (Ag/AgCl) favorables, &lt; 50 mV possibles ;
              O₂ de 0,5 à 5 mg/l peu favorables ; O₂ &gt; 5 mg/l défavorables (seuils USEPA 1998). Score USEPA « x / y » : partiel, x points sur les y
              accessibles avec les données disponibles, à ne pas lire avec le tableau 2.4 ({BAREME_CLASSES.map((b) => `${b.bornes} ${LIBELLES_CLASSE[b.classe].toLowerCase()}`).join(' ; ')}),
              réservé au jeu complet.
            </p>

            <details className="qualif" style={{ marginTop: '1.5rem' }}>
              <summary>Tableau des données — corriger ou compléter ({jeu.ouvrages.length} ouvrages)</summary>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)' }}>
                Chaque case se corrige ; « &lt;0,5 » pour un résultat inférieur à la LQ, case vide pour retirer la valeur. En bleu : valeur saisie. Le
                survol d'une case indique sa provenance.
              </p>
              <div className="tableau-defile" style={{ maxHeight: '36rem' }}>
                <table className="tableau">
                  <thead>
                    <tr>
                      <th>Paramètre</th>
                      <th>Unité</th>
                      {jeu.ouvrages.map((o) => (
                        <th key={o.cle} style={{ minWidth: '6rem' }}>
                          {o.nom}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PARAMS.map((p, k) => (
                      <Fragment key={p.id}>
                        {(k === 0 || PARAMS[k - 1].groupe !== p.groupe) && (
                          <tr className="tableau__famille">
                            <td colSpan={2 + jeu.ouvrages.length}>{LIBELLES_GROUPE[p.groupe as Groupe]}</td>
                          </tr>
                        )}
                        <tr>
                          <td>{p.libelle}</td>
                          <td>{p.unite}</td>
                          {jeu.ouvrages.map((o) => {
                            const k2 = `${o.cle}|${p.id}`
                            const v = jeu.valeurs[o.cle]?.[p.id]
                            return (
                              <td key={o.cle}>
                                <input
                                  value={saisies[k2] ?? formatValeur(v)}
                                  inputMode="decimal"
                                  title={v ? `${v.source}${v.note ? ` — ${v.note}` : ''}` : 'Pas de valeur'}
                                  aria-label={`${p.libelle}, ${o.nom}`}
                                  onChange={(ev) => saisir(o.cle, p.id, ev.target.value)}
                                  style={{ width: '5.5rem', color: saisies[k2] !== undefined ? 'var(--color-accent)' : undefined, fontStyle: v?.inferieur ? 'italic' : undefined }}
                                />
                              </td>
                            )
                          })}
                        </tr>
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        </section>
      )}

      {evaluations.length > 0 && (
        <section className="section section--muted">
          <div className="container">
            <h2 className="etape">
              <span>6</span> Données d'entrée BIOCHLOR (option)
            </h2>
            <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'baseline', maxWidth: '48rem' }}>
              <input type="checkbox" checked={avecBiochlor} onChange={(e) => setAvecBiochlor(e.target.checked)} />
              <span>
                <strong>Préparer une modélisation BIOCHLOR</strong>
                <span style={{ display: 'block', fontSize: '0.88rem', color: 'var(--color-muted)' }}>
                  Usage expert : vitesse de l'eau, porosité, retard et constantes de biodégradation à renseigner, pour un modèle de transport du
                  panache (USEPA / AFCEE). Inutile pour décrire les conditions de la nappe.
                </span>
              </span>
            </label>
            {avecBiochlor && (
              <div style={{ marginTop: '1.25rem' }}>
                <TransportBiochlor h={hydro} setH={setHydro} calc={transport} ouvrages={jeu.ouvrages} sourceDefaut={plusContamine?.ouvrage.cle ?? ''} />
              </div>
            )}
          </div>
        </section>
      )}

      {evaluations.length > 0 && (
        <section className="section">
          <div className="container">
            <h2 className="etape">
              <span>7</span> Rapport
            </h2>
            <button type="button" className="btn" onClick={() => void exporter()} disabled={export_}>
              {export_ ? 'Préparation…' : 'Télécharger le rapport Excel'}
            </button>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)' }}>
              Onglets : synthèse générale et classement, récapitulatif des paramètres de terrain (min, max, moyenne et synthèse), synthèse par ouvrage, score USEPA critère par critère, paramètres de terrain et
              stabilisation, données utilisées{avecBiochlor && transport.vx !== null ? ', transport et saisies BIOCHLOR' : ''}, méthode et sources.
            </p>
          </div>
        </section>
      )}

      <section className="section">
        <div className="container">
          <h2 style={{ fontSize: '1.2rem' }}>Démarche</h2>
          <div className="grid grid--3" style={{ gap: '1rem' }}>
            <div className="card">
              <span className="eyebrow">Ligne de preuve 1</span>
              <p style={{ margin: '0.3rem 0 0', fontSize: '0.9rem' }}>
                Baisse des concentrations et des masses dans le temps et le long de l'écoulement : à lire sur plusieurs campagnes (outil Résultats
                labo, onglets d'évolution).
              </p>
            </div>
            <div className="card">
              <span className="eyebrow">Ligne de preuve 2 — cet outil</span>
              <p style={{ margin: '0.3rem 0 0', fontSize: '0.9rem' }}>
                Processus identifiés et quantifiés : indicateurs géochimiques (criblage USEPA, processus redox), produits de dégradation, constantes
                de biodégradation pour BIOCHLOR.
              </p>
            </div>
            <div className="card">
              <span className="eyebrow">Ligne de preuve 3</span>
              <p style={{ margin: '0.3rem 0 0', fontSize: '0.9rem' }}>
                Preuves microbiologiques : microcosmes, biologie moléculaire (Dehalococcoides, gènes vcrA / bvcA), isotopie (CSIA).
              </p>
            </div>
          </div>
          <h3 style={{ fontSize: '1rem', marginTop: '1.5rem' }}>Sources</h3>
          <ul style={{ fontSize: '0.85rem' }}>
            {SOURCES.map((s) => (
              <li key={s.texte}>{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.texte}</a> : s.texte}</li>
            ))}
          </ul>
        </div>
      </section>
    </>
  )
}

function SyntheseGenerale({ s }: { s: Synthese }) {
  return (
    <>
      <div className="card" style={{ maxWidth: '64rem' }}>
        {s.site.map((p) => (
          <p key={p} style={{ margin: '0 0 0.5rem', fontSize: '0.95rem' }}>
            {p}
          </p>
        ))}
      </div>
      {(s.profils.length > 0 || s.singularites.length > 0) && (
        <div className="grid grid--2" style={{ gap: '1rem', marginTop: '1rem' }}>
          {s.profils.length > 0 && (
            <div className="card">
              <span className="eyebrow">Profils verticaux (ouvrages multi-niveaux)</span>
              <ul style={{ margin: '0.4rem 0 0', fontSize: '0.88rem' }}>
                {s.profils.map((p) => (
                  <li key={p.base}>{p.texte}</li>
                ))}
              </ul>
            </div>
          )}
          {s.singularites.length > 0 && (
            <div className="card">
              <span className="eyebrow">Ouvrages singuliers</span>
              <ul style={{ margin: '0.4rem 0 0', fontSize: '0.88rem' }}>
                {s.singularites.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <h3 style={{ fontSize: '1rem', marginTop: '1.5rem' }}>Classement des ouvrages, du plus réducteur au plus oxygéné</h3>
      <div className="tableau-defile" style={{ maxHeight: '36rem' }}>
        <table className="tableau">
          <thead>
            <tr>
              <th>Rang</th>
              <th>Ouvrage</th>
              <th>Conditions (déchloration)</th>
              <th>Conditions physico-chimiques</th>
              <th>Réserve sur la mesure</th>
            </tr>
          </thead>
          <tbody>
            {s.classement.map((c) => (
              <tr key={c.cle}>
                <td>{c.rang}</td>
                <td>
                  <strong>{c.nom}</strong>
                </td>
                <td>
                  <span className={BADGE_CONDITIONS[c.conditions]}>{LIBELLES_FAVORABILITE[c.conditions]}</span>
                </td>
                <td style={{ fontSize: '0.85rem', minWidth: '22rem', maxWidth: '46rem', whiteSpace: 'normal' }}>{c.description}</td>
                <td style={{ fontSize: '0.8rem', maxWidth: '16rem', whiteSpace: 'normal', color: c.reserve ? 'var(--level-moderee)' : undefined }}>{c.reserve ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: '0.82rem', color: 'var(--color-muted)' }}>
        Classement : conditions pour la déchloration réductrice, puis redox croissant, puis oxygène croissant. Qualificatifs : pH (neutre de 6,5 à
        7,5) ; oxygène (anoxique &lt; 0,5 mg/l, faiblement oxygénée 0,5 à 2, oxygénée 2 à 5, bien oxygénée &gt; 5) ; redox contre Ag/AgCl
        (réducteur &lt; −100 mV, faiblement réducteur jusqu'à 50 mV, modérément oxydant jusqu'à 200 mV, oxydant au-delà) ; minéralisation d'après la
        conductivité (classes de Rodier : moyenne de 333 à 666, importante de 666 à 1 000, élevée au-delà de 1 000 µS/cm).
      </p>
    </>
  )
}

function Liste({ titre, items }: { titre: string; items: string[] }) {
  if (!items.length) return null
  return (
    <>
      <strong style={{ fontSize: '0.9rem' }}>{titre}</strong>
      <ul style={{ margin: '0.2rem 0 0.5rem', fontSize: '0.85rem' }}>
        {items.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
    </>
  )
}

function Detail({ e }: { e: Evaluation }) {
  const l = e.lecture
  // Sticky and bounded: the row spans a table wider than the screen.
  return (
    <div style={{ padding: '0.5rem 0.25rem', position: 'sticky', left: 0, maxWidth: 'min(70rem, calc(100vw - 3rem))', whiteSpace: 'normal' }}>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <p style={{ margin: 0 }}>
          <span className={BADGE_CONDITIONS[l.conditions]}>Conditions {LIBELLES_FAVORABILITE[l.conditions].toLowerCase()}</span>{' '}
          <span style={{ fontSize: '0.88rem' }}>{l.motifConditions}</span>
        </p>
        <p style={{ margin: '0.5rem 0', fontWeight: 600 }}>{l.conclusion}</p>
        <div className="grid grid--2" style={{ gap: '1rem' }}>
          <div>
            <Liste titre="Indices de dégradation" items={l.indices} />
            <Liste titre="Sources de carbone" items={l.carbone} />
          </div>
          <div>
            <Liste titre="Limites" items={l.limites} />
            <Liste titre="Analyses utiles" items={l.analysesUtiles} />
          </div>
        </div>
      </div>
      <div className="grid grid--2" style={{ gap: '1rem' }}>
        <div>
          <strong>Processus redox (USGS) :</strong> {e.redox.categorie} — {e.redox.processus}
          <p style={{ margin: '0.2rem 0', fontSize: '0.85rem' }}>{e.redox.detail}</p>
          {e.redox.manquants.length > 0 && <p style={{ margin: '0.2rem 0', fontSize: '0.82rem', color: 'var(--color-muted)' }}>Données manquantes : {e.redox.manquants.join(', ')}</p>}
          {e.devenirCV.length > 0 && (
            <>
              <strong>Devenir du chlorure de vinyle</strong>
              <ul style={{ margin: '0.2rem 0', fontSize: '0.85rem' }}>
                {e.devenirCV.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div>
          <strong>Points de vigilance</strong>
          {e.alertes.length ? (
            <ul style={{ margin: '0.2rem 0', fontSize: '0.85rem' }}>
              {e.alertes.map((a) => (
                <li key={a.texte} style={{ color: COULEUR_NIVEAU[a.niveau] }}>
                  {a.texte}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: '0.2rem 0', fontSize: '0.85rem' }}>Aucun.</p>
          )}
          {e.score.requisManquants.length > 0 && (
            <p style={{ margin: '0.2rem 0', fontSize: '0.85rem' }}>
              <strong>Analyses requises manquantes :</strong> {e.score.requisManquants.join(', ')}
            </p>
          )}
        </div>
      </div>
      <table className="tableau" style={{ marginTop: '0.75rem' }}>
        <thead>
          <tr>
            <th>Critère USEPA 1998</th>
            <th>Seuil</th>
            <th>Valeur</th>
            <th>Points</th>
            <th>Interprétation</th>
          </tr>
        </thead>
        <tbody>
          {e.score.criteres.map((c) => (
            <tr key={c.id} className={c.points === null ? 'tableau__exclu' : undefined}>
              <td>
                {c.analyse}
                {c.requis && <span title="Analyse requise par le protocole"> *</span>}
              </td>
              <td style={{ fontSize: '0.8rem' }}>{c.critere}</td>
              <td>{c.valeur}</td>
              <td style={{ fontWeight: 700, color: c.points === null ? undefined : c.points > 0 ? 'var(--level-faible)' : c.points < 0 ? 'var(--level-elevee)' : undefined }}>
                {c.points === null ? 'n.é.' : c.points}
              </td>
              <td style={{ fontSize: '0.82rem' }}>
                {c.interpretation}
                {c.note && <div style={{ color: 'var(--color-muted)' }}>{c.note}</div>}
              </td>
            </tr>
          ))}
          <tr>
            <td colSpan={3}>
              <strong>Total</strong>
            </td>
            <td>
              <span className={e.score.complet ? BADGE_CLASSE[e.score.classe] : 'badge badge--indeterminee'}>
                {e.score.total}
                {!e.score.complet && ` / ${e.score.accessible}`}
              </span>
            </td>
            <td>
              {e.score.complet ? LIBELLES_CLASSE[e.score.classe] : `Score partiel (${e.score.geochimieManquante.join(', ')} manquants) : non comparable aux classes USEPA`}
              {e.score.complet && e.score.potentiel > 0 && e.score.classeMax !== e.score.classe && (
                <span style={{ color: 'var(--color-muted)' }}> — au mieux {LIBELLES_CLASSE[e.score.classeMax].toLowerCase()} avec les critères non évalués</span>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
