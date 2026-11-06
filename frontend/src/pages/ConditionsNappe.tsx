import { Fragment, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { lireNombre } from '../lib/resultats/calc'
import { fusionnerLectures } from '../lib/resultats/fusion'
import { lireClasseur, type Cell, type Lecture } from '../lib/resultats/parse'
import { AQUIFERE_DEFAUT, ETHENES, tauxDegradation, type Aquifere, type Ethene } from '../lib/nappe/biochlor'
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
  type Evaluation,
  type Niveau,
  type Statut,
} from '../lib/nappe/evaluation'
import { cleOuvrage, lireFiches, type FicheTerrain } from '../lib/nappe/fiches'
import { formatValeur, LIBELLES_GROUPE, PARAMS, type Groupe } from '../lib/nappe/parametres'
import { SOURCES } from '../lib/nappe/sources'

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
  // Transport (BIOCHLOR)
  const [aq, setAq] = useState<Record<keyof Aquifere, string>>(
    Object.fromEntries(Object.entries(AQUIFERE_DEFAUT).map(([k, v]) => [k, String(v).replace('.', ',')])) as Record<keyof Aquifere, string>,
  )
  const [koc, setKoc] = useState<Record<Ethene, string>>(Object.fromEntries(ETHENES.map((e) => [e.id, String(e.koc).replace('.', ',')])) as Record<Ethene, string>)
  const [amont, setAmont] = useState('')
  const [aval, setAval] = useState('')
  const [distance, setDistance] = useState('')
  const [normaliser, setNormaliser] = useState(true)

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

  const plusContamine = evaluations.reduce<Evaluation | null>((m, e) => (e.cohvMolaire > (m?.cohvMolaire ?? 0) ? e : m), null)
  const comptes = new Map<Classe, number>()
  for (const e of evaluations) comptes.set(e.score.classe, (comptes.get(e.score.classe) ?? 0) + 1)
  const requisSite = PARAMS.filter((p) => p.requis && !evaluations.some((e) => jeu.valeurs[e.ouvrage.cle]?.[p.id]))
  const sansLabo = !labo.lecture

  // Transport
  const aquifere = useMemo(() => {
    const a = Object.fromEntries(Object.entries(aq).map(([k, v]) => [k, lireNombre(v)])) as Record<keyof Aquifere, number | null>
    return Object.values(a).every((v) => v !== null && v > 0) ? (a as Aquifere) : null
  }, [aq])
  const kocs = useMemo(() => Object.fromEntries(ETHENES.map((e) => [e.id, lireNombre(koc[e.id]) ?? e.koc])) as Record<Ethene, number>, [koc])
  const dist = lireNombre(distance)
  const transport =
    aquifere && amont && aval && amont !== aval && dist && dist > 0
      ? { ...tauxDegradation(aquifere, dist, jeu.valeurs[amont] ?? {}, jeu.valeurs[aval] ?? {}, normaliser, kocs), aquifere, koc: kocs, distance: dist, normaliser }
      : null
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
            ['Ouvrage le plus contaminé (COHV, µmol/l)', plusContamine ? `${plusContamine.ouvrage.nom} — score ${plusContamine.score.total} (${LIBELLES_CLASSE[plusContamine.score.classe].toLowerCase()})` : '-'],
            ['Analyses requises absentes partout', requisSite.map((p) => p.libelle).join(', ') || 'aucune'],
          ],
          jeu,
          evaluations,
          options,
          transport: transport ? { ...transport, amont: nomOuvrage(amont), aval: nomOuvrage(aval) } : undefined,
        },
        `Conditions nappe${projet ? ` - ${projet}` : ''} - ${date}.xlsx`,
      )
    } finally {
      setExport(false)
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
              <span>4</span> Conditions par ouvrage
            </h2>
            <div className="grid grid--3" style={{ gap: '1rem', marginBottom: '1rem' }}>
              <div className="card">
                <span className="eyebrow">Zone la plus contaminée</span>
                {plusContamine ? (
                  <p style={{ margin: '0.3rem 0 0' }}>
                    <strong>{plusContamine.ouvrage.nom}</strong> ({fr(plusContamine.cohvMolaire)} µmol/l de COHV) : score{' '}
                    <span className={BADGE_CLASSE[plusContamine.score.classe]}>
                      {plusContamine.score.total} — {LIBELLES_CLASSE[plusContamine.score.classe]}
                    </span>
                  </p>
                ) : (
                  <p style={{ margin: '0.3rem 0 0', fontSize: '0.9rem', color: 'var(--color-muted)' }}>Pas de COHV quantifié (résultats du laboratoire nécessaires).</p>
                )}
              </div>
              <div className="card">
                <span className="eyebrow">Score USEPA par ouvrage</span>
                <p style={{ margin: '0.3rem 0 0', fontSize: '0.9rem' }}>
                  {BAREME_CLASSES.map((b) => `${comptes.get(b.classe) ?? 0} ${LIBELLES_CLASSE[b.classe].toLowerCase()}`).join(' · ')}
                </p>
              </div>
              <div className="card">
                <span className="eyebrow">Analyses requises absentes</span>
                <p style={{ margin: '0.3rem 0 0', fontSize: '0.9rem' }}>{requisSite.length ? requisSite.map((p) => p.libelle).join(', ') : 'Aucune'}</p>
              </div>
            </div>
            {sansLabo && (
              <p className="alerte" style={{ maxWidth: 'none' }}>
                Sans résultats du laboratoire, seuls l'oxygène, le redox, le pH et la température sont notés : le score est un minorant et le
                processus redox reste provisoire (oxique ou anoxique). Les accepteurs d'électrons (NO₃, Fe²⁺, Mn, SO₄, sulfures), le méthane, les
                chlorures et les COHV sont nécessaires pour conclure.
              </p>
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
                    <th>Processus redox</th>
                    <th>Score USEPA</th>
                    <th>Devenir du CV</th>
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
                          <td style={{ minWidth: '10rem' }}>
                            {e.redox.categorie}
                            {e.redox.processus !== '—' && <div style={{ fontSize: '0.78rem', color: 'var(--color-muted)' }}>{e.redox.processus}</div>}
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <span className={BADGE_CLASSE[e.score.classe]} title={LIBELLES_CLASSE[e.score.classe]}>
                              {e.score.total}
                            </span>
                            {e.score.potentiel > 0 && (
                              <span style={{ fontSize: '0.78rem', color: 'var(--color-muted)' }} title="Points que les critères non évalués pourraient ajouter">
                                {' '}
                                +{e.score.potentiel} n.é.
                              </span>
                            )}
                          </td>
                          <td style={{ fontSize: '0.8rem', minWidth: '12rem' }}>{e.devenirCV[0] ?? '-'}</td>
                          <td style={{ fontSize: '0.8rem' }}>{alertes ? `${alertes} point${alertes > 1 ? 's' : ''}` : '-'}</td>
                        </tr>
                        {actif && (
                          <tr>
                            <td colSpan={10} style={{ background: 'var(--color-surface)' }}>
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
              Cliquez sur un ouvrage pour le détail des points. Interprétation (USEPA 1998, tableau 2.4) :{' '}
              {BAREME_CLASSES.map((b) => `${b.bornes} ${LIBELLES_CLASSE[b.classe].toLowerCase()}`).join(' ; ')}. Le protocole applique le score à la zone la plus
              contaminée ; « n.é. » : points que les critères non évalués pourraient ajouter.
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

      {evaluations.length > 1 && (
        <section className="section">
          <div className="container">
            <h2 className="etape">
              <span>5</span> Transport et constantes de biodégradation (données d'entrée BIOCHLOR)
            </h2>
            <p className="lede" style={{ marginBottom: '1rem' }}>
              Vitesse réelle, retard et constante de biodégradation du premier ordre entre deux ouvrages d'une même ligne d'écoulement, dans le
              panache (USEPA 1998, annexe C). Ces valeurs renseignent les champs « Advection », « Adsorption » et « Biotransformation » de BIOCHLOR.
            </p>
            <div className="grid grid--4" style={{ alignItems: 'end' }}>
              {(
                [
                  ['K', 'Conductivité hydraulique K (m/s)'],
                  ['i', 'Gradient hydraulique i (m/m)'],
                  ['ne', 'Porosité efficace ne'],
                  ['n', 'Porosité totale n'],
                  ['rhob', 'Masse volumique apparente ρb (kg/l)'],
                  ['foc', 'Carbone organique foc (g/g)'],
                ] as [keyof Aquifere, string][]
              ).map(([k, l]) => (
                <label key={k} className="champ">
                  {l}
                  <input inputMode="decimal" value={aq[k]} onChange={(e) => setAq((a) => ({ ...a, [k]: e.target.value }))} />
                </label>
              ))}
              <label className="champ">
                Ouvrage amont (A)
                <select value={amont} onChange={(e) => setAmont(e.target.value)}>
                  <option value="">—</option>
                  {jeu.ouvrages.map((o) => (
                    <option key={o.cle} value={o.cle}>
                      {o.nom}
                    </option>
                  ))}
                </select>
              </label>
              <label className="champ">
                Ouvrage aval (B)
                <select value={aval} onChange={(e) => setAval(e.target.value)}>
                  <option value="">—</option>
                  {jeu.ouvrages.map((o) => (
                    <option key={o.cle} value={o.cle}>
                      {o.nom}
                    </option>
                  ))}
                </select>
              </label>
              <label className="champ">
                Distance A → B le long de l'écoulement (m)
                <input inputMode="decimal" value={distance} onChange={(e) => setDistance(e.target.value)} />
              </label>
              <label className="champ">
                <span>
                  <input type="checkbox" checked={normaliser} onChange={(e) => setNormaliser(e.target.checked)} /> Normaliser par les chlorures + chlore
                  organique (dilution, dispersion)
                </span>
              </label>
            </div>
            <details className="qualif" style={{ marginTop: '0.75rem' }}>
              <summary>Coefficients de partage Koc (l/kg)</summary>
              <div className="grid grid--4" style={{ marginTop: '0.5rem' }}>
                {ETHENES.map((e) => (
                  <label key={e.id} className="champ">
                    {e.libelle}
                    <input inputMode="decimal" value={koc[e.id]} onChange={(ev) => setKoc((k) => ({ ...k, [e.id]: ev.target.value }))} />
                  </label>
                ))}
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--color-muted)' }}>Valeurs par défaut : USEPA (1998), tableau B.2.1 (première valeur citée).</p>
            </details>
            {aquifere && (
              <p style={{ marginTop: '0.75rem' }}>
                Vitesse réelle de l'eau : <strong>{fr(transport?.vx ?? ((aquifere.K * aquifere.i) / aquifere.ne) * 31557600, 1)} m/an</strong>
                {transport?.facteur !== null && transport?.facteur !== undefined && <> · facteur de normalisation TA/TB = {fr(transport.facteur)}</>}
              </p>
            )}
            {transport && (
              <div className="tableau-defile">
                <table className="tableau">
                  <thead>
                    <tr>
                      <th>Composé</th>
                      <th>Retard R</th>
                      <th>Transit (an)</th>
                      <th>CA µg/l</th>
                      <th>CB µg/l</th>
                      <th>CB corrigée</th>
                      <th>λ (1/an)</th>
                      <th>Littérature</th>
                      <th>Remarque</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transport.taux.map((x) => {
                      const e = ETHENES.find((y) => y.id === x.compose)!
                      return (
                        <tr key={x.compose}>
                          <td>
                            <strong>{e.libelle}</strong>
                          </td>
                          <td>{fr(x.retard)}</td>
                          <td>{fr(x.temps)}</td>
                          <td>{fr(x.cA)}</td>
                          <td>{fr(x.cB)}</td>
                          <td>{fr(x.cBcorr)}</td>
                          <td>
                            <strong>{fr(x.lambda)}</strong>
                          </td>
                          <td>{e.litterature}</td>
                          <td style={{ fontSize: '0.8rem' }}>{x.note ?? '-'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {evaluations.length > 0 && (
        <section className="section section--muted">
          <div className="container">
            <h2 className="etape">
              <span>6</span> Rapport
            </h2>
            <button type="button" className="btn" onClick={() => void exporter()} disabled={export_}>
              {export_ ? 'Préparation…' : 'Télécharger le rapport Excel'}
            </button>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)' }}>
              Onglets : synthèse par ouvrage, score USEPA critère par critère, paramètres de terrain et stabilisation, données utilisées
              {transport ? ', transport BIOCHLOR' : ''}, méthode et sources.
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

function Detail({ e }: { e: Evaluation }) {
  return (
    <div style={{ padding: '0.5rem 0.25rem' }}>
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
              <span className={BADGE_CLASSE[e.score.classe]}>{e.score.total}</span>
            </td>
            <td>
              {LIBELLES_CLASSE[e.score.classe]}
              {e.score.potentiel > 0 && e.score.classeMax !== e.score.classe && (
                <span style={{ color: 'var(--color-muted)' }}> — au mieux {LIBELLES_CLASSE[e.score.classeMax].toLowerCase()} avec les critères non évalués</span>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
