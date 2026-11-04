import { useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import { lireNombre } from '../lib/resultats/calc'
import { LectureImpossible, type Cell, type Lecture } from '../lib/resultats/parse'
import {
  bilan,
  bilanParEchantillon,
  evaluerConformite,
  LIBELLES_STATUT,
  type Borne,
  type Controle,
  type Destination,
  type Donnees,
  type Statut,
} from '../lib/rejets/conformite'
import { collage, grilleDepuisLecture, ligneVide, lireGrilleSaisie, lireOnglets, nonVisees as lignesNonVisees, type Colonne, type Ligne } from '../lib/rejets/grille'
import { LIBELLES_CLASSE, PAR_ID, SUBSTANCES, type ClasseCov } from '../lib/rejets/substances'
import { conversionAir, type Milieu } from '../lib/rejets/unites'

const MILIEUX: { id: Milieu; titre: string; detail: string }[] = [
  {
    id: 'air',
    titre: 'Rejet atmosphérique',
    detail: "Sortie d'une unité de traitement d'air (extraction des gaz du sol, stripping, charbon actif, oxydation) : article 27",
  },
  {
    id: 'eau',
    titre: 'Rejet aqueux',
    detail: "Sortie d'une unité de traitement d'eaux (pompage-traitement, rabattement) vers le milieu naturel ou un réseau : articles 31, 32 et 34",
  },
]

const DESTINATIONS: { id: Destination; libelle: string }[] = [
  { id: 'milieu', libelle: 'Milieu naturel (cours d’eau, fossé…) — art. 32' },
  { id: 'step-urbaine', libelle: 'Réseau vers une station d’épuration urbaine — art. 34' },
  { id: 'step-industrielle', libelle: 'Station d’épuration industrielle ou mixte — art. 34' },
]

const CLASSE_STATUT: Record<Statut, string> = {
  conforme: 'badge badge--faible',
  depassement: 'badge badge--elevee',
  indetermine: 'badge badge--moderee',
  'non-soumis': 'badge badge--indeterminee',
  ap: 'badge badge--indeterminee',
  'sans-donnee': 'badge badge--indeterminee',
}

const ORDRE: Statut[] = ['depassement', 'indetermine', 'ap', 'conforme', 'non-soumis', 'sans-donnee']

const fr = (x: number) => Number(x.toPrecision(3)).toLocaleString('fr-FR', { maximumFractionDigits: 6 })
function borne(b: Borne | null): string {
  if (!b) return '-'
  if (b.bas === b.haut || fr(b.bas) === fr(b.haut)) return fr(b.bas)
  return b.bas === 0 ? `<${fr(b.haut)}` : `${fr(b.bas)} à ${fr(b.haut)}`
}

async function lireFichier(f: File, milieu: Milieu): Promise<{ lecture: Lecture; onglets: string[] }> {
  const XLSX = await import('xlsx')
  const classeur = XLSX.read(await f.arrayBuffer(), { type: 'array' })
  const feuilles = classeur.SheetNames.map((nom) => ({
    nom,
    grille: XLSX.utils.sheet_to_json<Cell[]>(classeur.Sheets[nom], { header: 1, raw: true, defval: null }),
  }))
  if (milieu === 'eau') return lireOnglets(feuilles, 'tout', 'eau')
  // Air: concentrations given by the lab, else masses per tube.
  const essais = (['concentration', 'support', 'tout'] as const).map((mode) => {
    try {
      return lireOnglets(feuilles, mode, 'air')
    } catch (e) {
      if (!(e instanceof LectureImpossible)) throw e
      return null
    }
  })
  const lu = essais.filter((x): x is { lecture: Lecture; onglets: string[] } => !!x)
  if (!lu.length) return lireOnglets(feuilles, 'tout', 'air')
  const taille = (x: { lecture: Lecture }) => x.lecture.points.length * x.lecture.parametres.CM.length
  return lu.reduce((a, b) => (taille(b) > taille(a) ? b : a))
}

const SUBSTANCES_TRIEES = (m: Milieu) => SUBSTANCES.filter((s) => s.milieu.includes(m)).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))

export default function ConformiteRejets() {
  const [milieu, setMilieu] = useState<Milieu | null>(null)
  // Air
  const [debitAir, setDebitAir] = useState('')
  const [reel, setReel] = useState({ debit: '', temperature: '', pression: '101,3', humidite: '' })
  const [oxydation, setOxydation] = useState(false)
  const [rendement, setRendement] = useState('')
  const [o2Mesure, setO2Mesure] = useState('')
  const [o2Reference, setO2Reference] = useState('')
  // Water
  const [destination, setDestination] = useState<Destination>('milieu')
  const [debitEau, setDebitEau] = useState('')
  const [d21110, setD21110] = useState(false)
  const [zoneSensible, setZoneSensible] = useState(false)
  const [lagunage, setLagunage] = useState(false)
  const [neutralisation, setNeutralisation] = useState(false)
  const [temperature50, setTemperature50] = useState(false)
  // Both
  const [installation, setInstallation] = useState('')
  const [permanente, setPermanente] = useState(false)
  const [fluxAutorises, setFluxAutorises] = useState<Record<string, string>>({})
  const [colonnes, setColonnes] = useState<Colonne[]>([])
  const [lignes, setLignes] = useState<Ligne[]>([])
  const [fichier, setFichier] = useState('')
  const [notesLecture, setNotesLecture] = useState<string[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [chargement, setChargement] = useState(false)
  const [survol, setSurvol] = useState(false)
  const [reconnuesSeules, setReconnuesSeules] = useState(false)
  const [export_, setExport] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  function choisir(m: Milieu) {
    if (m === milieu) return
    setMilieu(m)
    setColonnes([])
    setLignes([])
    setFichier('')
    setNotesLecture([])
    setFluxAutorises({})
    setErreur(null)
  }

  async function charger(f: File | undefined) {
    if (!f || !milieu) return
    setChargement(true)
    setErreur(null)
    try {
      const { lecture: l, onglets } = await lireFichier(f, milieu)
      const g = grilleDepuisLecture(l, milieu)
      if (!g.lignes.length) throw new LectureImpossible('Aucun résultat lisible dans ce fichier.')
      setColonnes(g.colonnes)
      setLignes(g.lignes)
      const n = g.colonnes.length
      setNotesLecture([
        `${onglets.length > 1 ? `${onglets.length} onglets lus (${onglets.map((o) => `« ${o} »`).join(', ')})` : `Onglet « ${onglets[0] ?? '?'} »`} : ${n} échantillon${n > 1 ? 's' : ''} (${g.colonnes.map((c) => c.nom).join(', ')}), ${g.lignes.length} paramètres. Chaque échantillon est évalué.`,
        ...g.notes,
      ])
      setFichier(f.name)
      setFluxAutorises({})
    } catch (e) {
      setErreur(e instanceof LectureImpossible ? e.message : `Lecture impossible : ${(e as Error).message}`)
    } finally {
      setChargement(false)
    }
  }

  function deposer(e: DragEvent) {
    e.preventDefault()
    setSurvol(false)
    void charger(e.dataTransfer.files[0])
  }

  function saisieManuelle() {
    if (!milieu) return
    setColonnes([{ nom: 'Mesure 1', date: '', volume: '' }])
    setLignes([ligneVide(milieu, 1)])
    setFichier('')
    setNotesLecture([])
  }

  const majLigne = (id: string, p: Partial<Ligne>) => setLignes((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l)))
  const majValeur = (id: string, j: number, v: string) => setLignes((ls) => ls.map((l) => (l.id === id ? { ...l, valeurs: l.valeurs.map((x, k) => (k === j ? v : x)) } : l)))
  const majColonne = (j: number, p: Partial<Colonne>) => setColonnes((cs) => cs.map((c, k) => (k === j ? { ...c, ...p } : c)))

  function ajouterColonne() {
    setColonnes((cs) => [...cs, { nom: `Mesure ${cs.length + 1}`, date: '', volume: '' }])
    setLignes((ls) => ls.map((l) => ({ ...l, valeurs: [...l.valeurs, ''] })))
  }
  function retirerColonne(j: number) {
    setColonnes((cs) => cs.filter((_, k) => k !== j))
    setLignes((ls) => ls.map((l) => ({ ...l, valeurs: l.valeurs.filter((_, k) => k !== j) })))
  }

  /** A column pasted from Excel fills the cells below. */
  function coller(e: ClipboardEvent, ligne: number, j: number) {
    const vs = collage(e.clipboardData.getData('text'))
    if (vs.length < 2) return
    e.preventDefault()
    setLignes((ls) => ls.map((l, i) => (i >= ligne && i - ligne < vs.length ? { ...l, valeurs: l.valeurs.map((x, k) => (k === j ? vs[i - ligne] : x)) } : l)))
  }

  // Air flow from the actual conditions to normal, dry gas.
  const debitNormal = useMemo(() => {
    const q = lireNombre(reel.debit)
    const t = lireNombre(reel.temperature)
    const p = lireNombre(reel.pression)
    const h = lireNombre(reel.humidite) ?? 0
    if (q === null || t === null || p === null) return null
    return q * (273.15 / (273.15 + t)) * (p / 101.325) * (1 - h / 100)
  }, [reel])

  const supports = milieu === 'air' && lignes.some((l) => conversionAir(l.unite, l.substance ? (PAR_ID.get(l.substance) ?? null) : null).support)

  const lecture = useMemo(() => (milieu ? lireGrilleSaisie(milieu, lignes, colonnes) : null), [milieu, lignes, colonnes])

  const donnees: Donnees | null = useMemo(() => {
    if (!milieu || !lecture) return null
    const autorises: Record<string, number> = {}
    for (const [k, v] of Object.entries(fluxAutorises)) {
      const n = lireNombre(v)
      if (n !== null) autorises[k] = n
    }
    return {
      milieu,
      air: { debit: lireNombre(debitAir), oxydation, rendement: lireNombre(rendement), o2Mesure: lireNombre(o2Mesure), o2Reference: lireNombre(o2Reference) },
      eau: { destination, debit: lireNombre(debitEau), d21110, zoneSensible, lagunage, neutralisationAlcaline: neutralisation, temperature50 },
      lignes: lecture.lignes,
      mesures: colonnes.map((c, j) => c.nom || `Mesure ${j + 1}`),
      permanente,
      fluxAutorises: autorises,
    }
  }, [milieu, lecture, fluxAutorises, debitAir, oxydation, rendement, o2Mesure, o2Reference, destination, debitEau, d21110, zoneSensible, lagunage, neutralisation, temperature50, colonnes, permanente])

  const controles = useMemo(
    () => (donnees ? evaluerConformite(donnees).sort((a, b) => ORDRE.indexOf(a.synthese.statut) - ORDRE.indexOf(b.synthese.statut)) : []),
    [donnees],
  )
  const comptes = bilan(controles)
  const parEchantillon = bilanParEchantillon(controles, colonnes.length)
  const nonVisees = lignesNonVisees(lignes, controles)

  const contexte: [string, string][] = !milieu
    ? []
    : [
        ['Installation', installation || '-'],
        ['Rejet', milieu === 'air' ? 'Rejet canalisé à l’atmosphère (article 27)' : DESTINATIONS.find((d) => d.id === destination)!.libelle],
        milieu === 'air'
          ? ['Débit', debitAir ? `${debitAir} Nm³/h (gaz secs)` : 'non renseigné']
          : ['Débit', debitEau ? `${debitEau} m³/j` : 'non renseigné'],
        ...(milieu === 'air'
          ? ([
              ['Traitement par oxydation', oxydation ? `oui${rendement ? ` (rendement ${rendement} %)` : ''}` : 'non'],
              ['Oxygène', o2Mesure && o2Reference ? `mesuré ${o2Mesure} %, référence ${o2Reference} %` : 'pas de correction'],
            ] as [string, string][])
          : ([
              ['Milieu récepteur', [d21110 && 'eaux de l’article D. 211-10', zoneSensible && 'zone sensible', lagunage && 'lagunage'].filter(Boolean).join(', ') || '-'],
              ['pH', neutralisation ? 'neutralisation alcaline (pH ≤ 9,5)' : 'pH ≤ 8,5'],
            ] as [string, string][])),
        ['Surveillance', permanente ? 'autosurveillance permanente (tolérance de 10 %)' : 'mesures ponctuelles'],
        ['Fichier', fichier || 'saisie manuelle'],
      ]

  async function exporter() {
    if (!donnees || !lecture) return
    setExport(true)
    try {
      const { telechargerRapport } = await import('../lib/rejets/export')
      const date = new Date().toISOString().slice(0, 10)
      await telechargerRapport(
        {
          titre: `Conformité des rejets ${milieu === 'air' ? 'atmosphériques' : 'aqueux'}${installation ? ` — ${installation}` : ''}`,
          donnees,
          controles,
          colonnes,
          lignes,
          contexte,
          nonVisees,
          problemes: lecture.problemes.map((p) => `${p.ligne} : ${p.texte}`),
        },
        `Conformité rejets ${milieu === 'air' ? 'air' : 'eau'} AM 1998${installation ? ` - ${installation}` : ''} - ${date}.xlsx`,
      )
    } finally {
      setExport(false)
    }
  }

  const uniteFlux = milieu === 'air' ? 'g/h' : 'g/j'
  const lignesAffichees = reconnuesSeules ? lignes.filter((l) => l.substance || l.classe) : lignes
  const reconnues = lignes.filter((l) => l.substance).length

  return (
    <>
      <section className="section">
        <div className="container">
          <p className="eyebrow">Rejets d'une installation de traitement</p>
          <h1 style={{ maxWidth: '26ch' }}>Conformité des rejets à l'arrêté du 2 février 1998</h1>
          <p className="lede">
            Comparez les analyses en sortie d'une unité de traitement d'air ou d'eau aux valeurs limites générales de l'arrêté du 2 février
            1998 modifié : seuils de flux, sommes de composés, conditions normales et oxygène de référence, résultats inférieurs à la LQ et
            tolérance de l'autosurveillance. Les données restent dans votre navigateur.
          </p>

          <h2 className="etape">
            <span>1</span> Type de rejet
          </h2>
          <div className="grid grid--2 choix" role="radiogroup" aria-label="Type de rejet">
            {MILIEUX.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={milieu === m.id}
                className={`card choix__option${milieu === m.id ? ' choix__option--actif' : ''}`}
                onClick={() => choisir(m.id)}
              >
                <strong>{m.titre}</strong>
                <span>{m.detail}</span>
              </button>
            ))}
          </div>

          {milieu && (
            <>
              <h2 className="etape">
                <span>2</span> Caractéristiques du rejet
              </h2>
              <div className="grid grid--3" style={{ alignItems: 'end' }}>
                <label className="champ">
                  Installation (optionnel)
                  <input value={installation} onChange={(e) => setInstallation(e.target.value)} placeholder="ex. UTE site X, rejet R1" />
                </label>
                {milieu === 'air' ? (
                  <>
                    <label className="champ">
                      Débit du rejet (Nm³/h, gaz secs)
                      <input inputMode="decimal" value={debitAir} onChange={(e) => setDebitAir(e.target.value)} placeholder="ex. 1 500" />
                    </label>
                    <label className="champ">
                      <span>
                        <input type="checkbox" checked={permanente} onChange={(e) => setPermanente(e.target.checked)} /> Autosurveillance permanente
                        (≥ 1 mesure par jour)
                      </span>
                    </label>
                  </>
                ) : (
                  <>
                    <label className="champ">
                      Destination
                      <select value={destination} onChange={(e) => setDestination(e.target.value as Destination)}>
                        {DESTINATIONS.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.libelle}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="champ">
                      Débit journalier rejeté (m³/j)
                      <input inputMode="decimal" value={debitEau} onChange={(e) => setDebitEau(e.target.value)} placeholder="ex. 120" />
                    </label>
                  </>
                )}
              </div>

              {milieu === 'air' && (
                <>
                  <details className="qualif" style={{ marginTop: '1rem' }}>
                    <summary>Calculer le débit aux conditions normales (273 K, 101,3 kPa, gaz secs) depuis le débit mesuré</summary>
                    <div className="grid grid--4" style={{ alignItems: 'end', marginTop: '0.75rem' }}>
                      <label className="champ">
                        Débit mesuré (m³/h)
                        <input inputMode="decimal" value={reel.debit} onChange={(e) => setReel({ ...reel, debit: e.target.value })} />
                      </label>
                      <label className="champ">
                        Température (°C)
                        <input inputMode="decimal" value={reel.temperature} onChange={(e) => setReel({ ...reel, temperature: e.target.value })} />
                      </label>
                      <label className="champ">
                        Pression (kPa)
                        <input inputMode="decimal" value={reel.pression} onChange={(e) => setReel({ ...reel, pression: e.target.value })} />
                      </label>
                      <label className="champ">
                        Humidité (% vol.)
                        <input inputMode="decimal" value={reel.humidite} onChange={(e) => setReel({ ...reel, humidite: e.target.value })} placeholder="0" />
                      </label>
                    </div>
                    {debitNormal !== null && (
                      <p style={{ margin: '0.6rem 0 0', fontSize: '0.9rem' }}>
                        Débit normalisé : <strong>{fr(debitNormal)} Nm³/h</strong>{' '}
                        <button type="button" className="btn btn--petit" onClick={() => setDebitAir(fr(debitNormal).replace(/\s/g, ''))}>
                          Retenir ce débit
                        </button>
                      </p>
                    )}
                  </details>
                  <div className="grid grid--4" style={{ alignItems: 'end', marginTop: '1rem' }}>
                    <label className="champ">
                      <span>
                        <input type="checkbox" checked={oxydation} onChange={(e) => setOxydation(e.target.checked)} /> Traitement par oxydation
                        (thermique, catalytique)
                      </span>
                    </label>
                    {oxydation && (
                      <label className="champ">
                        Rendement d'épuration des COV (%)
                        <input inputMode="decimal" value={rendement} onChange={(e) => setRendement(e.target.value)} placeholder="ex. 99" />
                      </label>
                    )}
                    {!oxydation && (
                      <>
                        <label className="champ">
                          O2 mesuré (%, optionnel)
                          <input inputMode="decimal" value={o2Mesure} onChange={(e) => setO2Mesure(e.target.value)} />
                        </label>
                        <label className="champ">
                          O2 de référence de l'arrêté préfectoral (%)
                          <input inputMode="decimal" value={o2Reference} onChange={(e) => setO2Reference(e.target.value)} />
                        </label>
                      </>
                    )}
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)', margin: '0.6rem 0 0' }}>
                    Les seuils de l'article 27 portent sur le flux horaire maximal autorisé de l'installation, rejets canalisés et diffus
                    (article 28). Sans flux autorisé saisi dans le tableau des contrôles, le flux est calculé : concentration × débit.
                  </p>
                </>
              )}

              {milieu === 'eau' && (
                <div className="grid grid--3" style={{ marginTop: '1rem', gap: '0.5rem 1.25rem', fontSize: '0.9rem' }}>
                  {destination === 'milieu' && (
                    <>
                      <label>
                        <input type="checkbox" checked={d21110} onChange={(e) => setD21110(e.target.checked)} /> Eaux réceptrices de l'article D. 211-10
                        (salmonicoles, cyprinicoles, conchylicoles…)
                      </label>
                      <label>
                        <input type="checkbox" checked={zoneSensible} onChange={(e) => setZoneSensible(e.target.checked)} /> Zone sensible à
                        l'eutrophisation (art. R. 211-94)
                      </label>
                      <label>
                        <input type="checkbox" checked={lagunage} onChange={(e) => setLagunage(e.target.checked)} /> Épuration par lagunage
                      </label>
                    </>
                  )}
                  {destination !== 'milieu' && (
                    <label>
                      <input type="checkbox" checked={temperature50} onChange={(e) => setTemperature50(e.target.checked)} /> Rejet jusqu'à 50 °C prévu
                      par l'autorisation de raccordement
                    </label>
                  )}
                  <label>
                    <input type="checkbox" checked={neutralisation} onChange={(e) => setNeutralisation(e.target.checked)} /> Neutralisation alcaline
                    (pH jusqu'à 9,5)
                  </label>
                  <label>
                    <input type="checkbox" checked={permanente} onChange={(e) => setPermanente(e.target.checked)} /> Autosurveillance permanente (≥ 1
                    mesure par jour)
                  </label>
                </div>
              )}

              <h2 className="etape">
                <span>3</span> Résultats d'analyses en sortie de traitement
              </h2>
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
                  accept=".xlsx,.xlsm,.xls,.csv"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    void charger(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
                <p style={{ margin: 0, fontWeight: 600 }}>{chargement ? 'Lecture du fichier…' : 'Déposez ici le fichier du laboratoire'}</p>
                <p style={{ margin: '0.25rem 0 0.9rem', fontSize: '0.88rem', color: 'var(--color-muted)' }}>
                  Une colonne par mesure (ou par point de prélèvement). Excel ou CSV, disposition reconnue automatiquement
                  {milieu === 'air' ? ' ; concentrations en mg/m³ ou µg/m³, ou masses par tube avec le volume prélevé' : ' ; µg/l, mg/l, mg O2/l…'}.
                </p>
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button type="button" className="btn" onClick={() => input.current?.click()} disabled={chargement}>
                    Choisir un fichier
                  </button>
                  <button type="button" className="btn btn--ghost" onClick={saisieManuelle}>
                    Saisir les résultats à la main
                  </button>
                </div>
              </div>
              {erreur && (
                <p role="alert" className="alerte">
                  {erreur}
                </p>
              )}
              {notesLecture.length > 0 && (
                <div className="card" style={{ marginTop: '1rem', maxWidth: '48rem' }}>
                  <strong>{fichier}</strong>
                  {notesLecture.map((n) => (
                    <p key={n} style={{ margin: '0.3rem 0 0', fontSize: '0.88rem', color: 'var(--color-muted)' }}>
                      {n}
                    </p>
                  ))}
                  <p style={{ margin: '0.3rem 0 0', fontSize: '0.88rem' }}>
                    {reconnues} paramètre{reconnues > 1 ? 's' : ''} reconnu{reconnues > 1 ? 's' : ''} parmi les substances de l'arrêté. Vérifiez la
                    colonne « Substance de l'arrêté » et corrigez-la si besoin.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {milieu && colonnes.length > 0 && (
        <section className="section section--muted">
          <div className="container">
            <h2 className="etape">
              <span>4</span> Tableau des résultats
            </h2>
            <p className="lede" style={{ marginBottom: '1rem' }}>
              Chaque cellule se corrige ; « &lt;0,5 » pour un résultat inférieur à la LQ. Une colonne copiée depuis Excel se colle dans sa
              première case.{' '}
              {milieu === 'air' &&
                "Un COV que l'arrêté ne nomme pas (fraction d'hydrocarbures…) entre dans les sommes une fois sa classe choisie ; sa part de carbone sert à la somme en carbone total."}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem', alignItems: 'center' }}>
              <button type="button" className="btn btn--petit" onClick={() => setLignes((ls) => [...ls, ligneVide(milieu, colonnes.length)])}>
                Ajouter un paramètre
              </button>
              <button type="button" className="btn btn--petit" onClick={ajouterColonne}>
                Ajouter une mesure
              </button>
              <label style={{ fontSize: '0.88rem' }}>
                <input type="checkbox" checked={reconnuesSeules} onChange={(e) => setReconnuesSeules(e.target.checked)} /> Masquer les paramètres
                non visés
              </label>
            </div>
            <div className="tableau-defile" style={{ maxHeight: '36rem' }}>
              <table className="tableau">
                <thead>
                  <tr>
                    <th>Paramètre</th>
                    <th>Unité</th>
                    <th>Substance de l'arrêté</th>
                    {milieu === 'air' && <th title="Pour un COV que l'arrêté ne nomme pas">Classe COV / part de C</th>}
                    {colonnes.map((c, j) => (
                      <th key={j} style={{ minWidth: '8.5rem' }}>
                        <input value={c.nom} aria-label={`Nom de la mesure ${j + 1}`} onChange={(e) => majColonne(j, { nom: e.target.value })} />
                        <input type="date" value={c.date} aria-label={`Date de la mesure ${j + 1}`} onChange={(e) => majColonne(j, { date: e.target.value })} style={{ marginTop: '0.25rem' }} />
                        {supports && (
                          <input
                            inputMode="decimal"
                            value={c.volume}
                            placeholder="Volume (l)"
                            aria-label={`Volume prélevé de la mesure ${j + 1}, en litres`}
                            onChange={(e) => majColonne(j, { volume: e.target.value })}
                            style={{ marginTop: '0.25rem' }}
                          />
                        )}
                        {colonnes.length > 1 && (
                          <button type="button" className="btn btn--ghost btn--petit" style={{ marginTop: '0.25rem' }} onClick={() => retirerColonne(j)}>
                            Retirer
                          </button>
                        )}
                      </th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lignesAffichees.map((l) => {
                    const i = lignes.indexOf(l)
                    const s = l.substance ? PAR_ID.get(l.substance) : null
                    return (
                      <tr key={l.id} className={s || l.classe ? undefined : 'tableau__exclu'}>
                        <td>
                          <input value={l.libelle} aria-label="Paramètre" onChange={(e) => majLigne(l.id, { libelle: e.target.value })} style={{ minWidth: '12rem' }} />
                        </td>
                        <td>
                          <input value={l.unite} aria-label={`Unité de ${l.libelle}`} onChange={(e) => majLigne(l.id, { unite: e.target.value })} style={{ width: '6.5rem' }} />
                        </td>
                        <td>
                          <select
                            value={l.substance ?? ''}
                            aria-label={`Substance de l'arrêté pour ${l.libelle}`}
                            onChange={(e) => majLigne(l.id, { substance: e.target.value || null, libelle: l.libelle || PAR_ID.get(e.target.value)?.nom || '' })}
                            style={{ maxWidth: '16rem' }}
                          >
                            <option value="">— non visée —</option>
                            {SUBSTANCES_TRIEES(milieu).map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.nom}
                              </option>
                            ))}
                          </select>
                          {s?.cov && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '0.2rem' }}>
                              {LIBELLES_CLASSE[s.cov.classe]}
                              {s.cov.annexeIII ? ' · annexe III' : ''}
                              {s.annexeIV ? ` · annexe IV ${s.annexeIV}` : ''}
                            </div>
                          )}
                        </td>
                        {milieu === 'air' && (
                          <td>
                            {!s && (
                              <div style={{ display: 'flex', gap: '0.25rem' }}>
                                <select value={l.classe} aria-label={`Classe COV de ${l.libelle}`} onChange={(e) => majLigne(l.id, { classe: e.target.value as ClasseCov | '' })}>
                                  <option value="">— pas un COV —</option>
                                  <option value="autre">COV</option>
                                  <option value="halogene">COV halogéné H341/H351</option>
                                  <option value="cmr">COV CMR</option>
                                </select>
                                {l.classe && (
                                  <input
                                    inputMode="decimal"
                                    value={l.fraction}
                                    placeholder="0,85"
                                    title="Part massique de carbone (alcanes ≈ 0,85, aromatiques ≈ 0,90)"
                                    aria-label={`Part de carbone de ${l.libelle}`}
                                    onChange={(e) => majLigne(l.id, { fraction: e.target.value })}
                                    style={{ width: '4.5rem' }}
                                  />
                                )}
                              </div>
                            )}
                          </td>
                        )}
                        {l.valeurs.map((v, j) => (
                          <td key={j}>
                            <input
                              value={v}
                              inputMode="decimal"
                              aria-label={`${l.libelle}, ${colonnes[j]?.nom}`}
                              onChange={(e) => majValeur(l.id, j, e.target.value)}
                              onPaste={(e) => coller(e, i, j)}
                            />
                          </td>
                        ))}
                        <td>
                          <button type="button" className="btn btn--ghost btn--petit" aria-label={`Retirer ${l.libelle}`} onClick={() => setLignes((ls) => ls.filter((x) => x.id !== l.id))}>
                            ✕
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {lecture && lecture.problemes.length > 0 && (
              <div className="alerte" role="status" style={{ marginTop: '1rem' }}>
                {lecture.problemes.map((p) => (
                  <div key={p.ligne + p.texte}>
                    {p.ligne} : {p.texte}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {milieu && donnees && colonnes.length > 0 && (
        <section className="section">
          <div className="container">
            <h2 className="etape">
              <span>5</span> Conformité
            </h2>
            {controles.length > 0 && (
              <>
                <h3 style={{ margin: '0 0 0.5rem' }}>Par échantillon</h3>
                <div className="tableau-defile" style={{ marginBottom: '1.75rem' }}>
                  <table className="tableau">
                    <thead>
                      <tr>
                        <th>Échantillon</th>
                        <th>Conformité</th>
                        <th>Contrôles</th>
                        <th>Valeurs limites dépassées</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parEchantillon.map((b, j) => (
                        <tr key={j}>
                          <th scope="row">
                            {colonnes[j]?.nom || `Mesure ${j + 1}`}
                            {colonnes[j]?.date && <div style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--color-muted)' }}>{colonnes[j].date}</div>}
                          </th>
                          <td>
                            <span className={CLASSE_STATUT[b.statut]} style={{ fontSize: '0.72rem' }}>
                              {LIBELLES_STATUT[b.statut]}
                            </span>
                          </td>
                          <td style={{ fontSize: '0.82rem', whiteSpace: 'normal', minWidth: '14rem' }}>
                            {(['depassement', 'indetermine', 'conforme', 'ap', 'non-soumis'] as Statut[])
                              .filter((s) => b.comptes[s])
                              .map((s) => `${b.comptes[s]} ${LIBELLES_STATUT[s].toLowerCase()}`)
                              .join(' · ')}
                          </td>
                          <td style={{ fontSize: '0.82rem', whiteSpace: 'normal', minWidth: '20rem' }}>
                            {b.depassements.length
                              ? b.depassements.map((d) => `${d.libelle}${d.ratio ? ` (× ${fr(d.ratio)})` : ''}`).join(' ; ')
                              : '-'}
                            {b.indetermines.length > 0 && (
                              <div style={{ color: 'var(--color-muted)' }}>LQ trop élevée pour conclure : {b.indetermines.join(', ')}</div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <h3 style={{ margin: '0 0 0.5rem' }}>Par paramètre</h3>
              </>
            )}
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              {(['depassement', 'indetermine', 'conforme', 'ap', 'non-soumis'] as Statut[]).map((s) =>
                comptes[s] ? (
                  <span key={s} className={CLASSE_STATUT[s]}>
                    {comptes[s]} · {LIBELLES_STATUT[s]}
                  </span>
                ) : null,
              )}
            </div>
            {!controles.length ? (
              <p className="alerte">Aucun paramètre saisi ne relève des valeurs limites générales de l'arrêté.</p>
            ) : (
              <div className="tableau-defile">
                <table className="tableau">
                  <thead>
                    <tr>
                      <th>Paramètre</th>
                      <th>Référence</th>
                      <th>Seuil de flux</th>
                      <th>Valeur limite</th>
                      <th title="Flux maximal autorisé par l'arrêté préfectoral : remplace le flux calculé pour le seuil">Flux autorisé ({uniteFlux})</th>
                      {colonnes.map((c, j) => (
                        <th key={j}>{c.nom || `Mesure ${j + 1}`}</th>
                      ))}
                      <th>Synthèse (tous les échantillons)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {controles.map((c) => (
                      <LigneControle
                        key={c.id}
                        c={c}
                        flux={fluxAutorises[c.id] ?? ''}
                        onFlux={(v) => setFluxAutorises({ ...fluxAutorises, [c.id]: v })}
                        uniteFlux={uniteFlux}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {nonVisees.length > 0 && (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)', marginTop: '0.75rem' }}>
                Sans valeur limite générale dans l'arrêté (à comparer, le cas échéant, à l'arrêté préfectoral) : {nonVisees.join(', ')}.
              </p>
            )}
            <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)', marginTop: '0.5rem' }}>
              Résultats &lt;LQ : borne basse (LQ comptées 0) et haute (LQ comptées pleinement) ; « indéterminé » quand la LQ ne permet pas de
              conclure. Les valeurs de l'arrêté préfectoral, de l'arrêté de prescriptions ou de l'autorisation de déversement prévalent
              lorsqu'elles sont plus strictes.
            </p>
            <button type="button" className="btn" style={{ marginTop: '1rem' }} onClick={() => void exporter()} disabled={export_ || !controles.length}>
              {export_ ? 'Préparation…' : 'Télécharger le rapport Excel'}
            </button>
          </div>
        </section>
      )}
    </>
  )
}

function LigneControle({ c, flux, onFlux, uniteFlux }: { c: Controle; flux: string; onFlux: (v: string) => void; uniteFlux: string }) {
  const notes = [...new Set(c.mesures.flatMap((m) => m.notes))]
  const avecSeuil = c.seuilTexte !== 'Toujours applicable' && c.seuilTexte !== '-' && c.uniteFlux
  return (
    <>
      <tr>
        <th scope="row" style={{ fontWeight: c.synthese.statut === 'depassement' ? 700 : 500, whiteSpace: 'normal', minWidth: '15rem', maxWidth: '22rem' }}>
          {c.libelle}
          {c.composantes.length > 1 && <div style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--color-muted)' }}>{c.composantes.join(' + ')}</div>}
        </th>
        <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{c.reference}</td>
        <td style={{ fontSize: '0.82rem', whiteSpace: 'normal', minWidth: '7rem', maxWidth: '10rem' }}>{c.seuilTexte}</td>
        <td style={{ fontSize: '0.82rem', whiteSpace: 'normal', minWidth: '9rem', maxWidth: '14rem' }}>{c.vleTexte}</td>
        <td>{avecSeuil && <input inputMode="decimal" value={flux} aria-label={`Flux autorisé pour ${c.libelle}`} onChange={(e) => onFlux(e.target.value)} style={{ width: '5.5rem' }} />}</td>
        {c.mesures.map((m, j) => (
          <td key={j} style={{ fontSize: '0.82rem' }}>
            {m.statut === 'sans-donnee' ? (
              '-'
            ) : (
              <>
                <div>
                  <strong>{borne(m.concentration)}</strong> {c.unite}
                </div>
                {m.flux && (
                  <div style={{ color: 'var(--color-muted)' }}>
                    {borne(m.flux)} {uniteFlux}
                  </div>
                )}
                <span className={CLASSE_STATUT[m.statut]} style={{ fontSize: '0.7rem', padding: '0.1em 0.5em' }} title={LIBELLES_STATUT[m.statut]}>
                  {m.statut === 'non-soumis' ? 'Non soumis' : m.statut === 'ap' ? 'AP' : LIBELLES_STATUT[m.statut]}
                </span>
              </>
            )}
          </td>
        ))}
        <td style={{ fontSize: '0.82rem', minWidth: '11rem', maxWidth: '16rem', whiteSpace: 'normal' }}>
          <span className={CLASSE_STATUT[c.synthese.statut]} style={{ fontSize: '0.72rem' }}>
            {LIBELLES_STATUT[c.synthese.statut]}
          </span>
          {c.synthese.texte !== LIBELLES_STATUT[c.synthese.statut] && <div style={{ marginTop: '0.25rem' }}>{c.synthese.texte}</div>}
        </td>
      </tr>
      {notes.length > 0 && (
        <tr>
          <td colSpan={5 + c.mesures.length + 1} style={{ fontSize: '0.78rem', color: 'var(--color-muted)', paddingTop: 0, whiteSpace: 'normal' }}>
            {notes.join(' ')}
          </td>
        </tr>
      )}
    </>
  )
}

