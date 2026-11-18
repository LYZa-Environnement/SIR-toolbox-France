import { useMemo, useRef, useState, type DragEvent } from 'react'
import { analyser, CLASSES, fr, LIBELLES_CENSURE, REGLAGES_DEFAUT, type Analyse, type AnalyseSerie, type Censure, type Fait, type Reglages } from '../lib/suivi/analyse'
import { formatDate, moisAnnee, regimePropose } from '../lib/suivi/dates'
import { exemple } from '../lib/suivi/exemple'
import { telechargerModele } from '../lib/suivi/historique'
import { lireFichier, type FichierLu } from '../lib/suivi/import'
import { construireBase, CORRECTIONS_VIDES, LIBELLES_ORIGINE_DATE, nouvelId, placerLots, type Base, type CampagneSaisie, type Corrections, type InfoOuvrage, type Lot, type Regime } from '../lib/suivi/modele'
import { cleOuvrage } from '../lib/resultats/campagnes'
import { LIBELLES_POSITION, type Position } from '../lib/resultats/expert/amontAval'
import { LectureImpossible } from '../lib/resultats/parse'
import { Tuile, Volet, type TeinteVolet } from '../components/resultats/Volet'
import { Explorateur } from '../components/suivi/Explorateur'
import { OPTIONS_VUE, type OptionsVue, type Selection } from '../lib/suivi/ui'
import { AmontAval, Degradation, Faits, Indicateurs, Methode, Piezometrie, Pistes, Plan, Qualite } from '../components/suivi/Panneaux'
import { FichesOuvrages, LegendeClasses, MatriceTendances, TableauTendances } from '../components/suivi/Tendances'

const LIBELLES_TYPE: Record<FichierLu['type'], string> = { labo: 'Rapport de laboratoire', historique: 'Tableau historique', fiches: 'Fiches de prélèvement' }

/** ISO date minus whole years, plus some days. */
function decaler(iso: string, annees: number, jours = 0): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCFullYear(d.getUTCFullYear() - annees)
  d.setUTCDate(d.getUTCDate() + jours)
  return d.toISOString().slice(0, 10)
}

type Periode = 'tout' | 'bq' | 'perso'

export default function SuiviTemporel() {
  const [fichiers, setFichiers] = useState<FichierLu[]>([])
  const [campagnes, setCampagnes] = useState<CampagneSaisie[]>([])
  const [corrections, setCorrections] = useState<Corrections>(CORRECTIONS_VIDES)
  const [reglages, setReglages] = useState<Reglages>(REGLAGES_DEFAUT)
  const [periode, setPeriode] = useState<Periode>('tout')
  const [erreurs, setErreurs] = useState<string[]>([])
  const [chargement, setChargement] = useState(false)
  const [survol, setSurvol] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const [ouverts, setOuverts] = useState<Set<string>>(new Set(['faits', 'matrice']))
  const [reglagesOuverts, setReglagesOuverts] = useState<Set<string>>(new Set())
  const [selection, setSelection] = useState<Selection>({ mode: 'compose', compose: '', ouvrage: '', ouvrages: [], composes: [] })
  const [options, setOptions] = useState<OptionsVue>(OPTIONS_VUE)
  const [filtreFamille, setFiltreFamille] = useState('')
  const [voirSommes, setVoirSommes] = useState(true)
  const [voirNonQuantifies, setVoirNonQuantifies] = useState(false)
  const [titre, setTitre] = useState('')
  const [export_, setExport] = useState<string | null>(null)
  const [erreurExport, setErreurExport] = useState<string | null>(null)

  const lots = useMemo(() => fichiers.flatMap((f) => f.lots), [fichiers])
  const fichesChargees = fichiers.some((f) => f.type === 'fiches')
  const releves = useMemo(() => fichiers.flatMap((f) => f.releves), [fichiers])
  const ouvragesDecrits = useMemo(() => fichiers.flatMap((f) => f.ouvrages), [fichiers])
  const base = useMemo(
    () => (lots.length ? construireBase({ lots, campagnes, releves, ouvragesDecrits, corrections }) : null),
    [lots, campagnes, releves, ouvragesDecrits, corrections],
  )

  /** Regimes as the base reads them (from the water levels when they were not given). */
  const regimes = useMemo(() => new Map((base?.campagnes ?? []).map((c) => [c.id, c])), [base])

  // Analysis window.
  const derniere = base?.campagnes[base.campagnes.length - 1]?.date ?? ''
  const reglagesEffectifs = useMemo<Reglages>(() => {
    if (periode === 'bq' && derniere) return { ...reglages, debut: decaler(derniere, 4, 30), fin: null }
    if (periode === 'tout') return { ...reglages, debut: null, fin: null }
    return reglages
  }, [reglages, periode, derniere])
  const analyse = useMemo(() => (base && base.campagnes.length ? analyser(base, corrections, reglagesEffectifs) : null), [base, corrections, reglagesEffectifs])

  // ---- Files ----------------------------------------------------------------------------------

  async function charger(liste: File[]) {
    if (!liste.length) return
    setChargement(true)
    const lus: FichierLu[] = []
    const errs: string[] = []
    for (const f of liste) {
      try {
        lus.push(await lireFichier(f))
      } catch (e) {
        errs.push(e instanceof LectureImpossible ? e.message : `« ${f.name} » : ${(e as Error).message}`)
      }
    }
    ajouterFichiers(lus)
    setErreurs(errs)
    setChargement(false)
  }

  function ajouterFichiers(lus: FichierLu[]) {
    if (!lus.length) return
    setFichiers((fs) => [...fs, ...lus])
    setCampagnes((cs) => placerLots(cs, lus.flatMap((f) => f.lots)))
  }

  function retirerFichier(id: string) {
    const f = fichiers.find((x) => x.id === id)
    if (!f) return
    const ids = new Set(f.lots.map((l) => l.id))
    setFichiers((fs) => fs.filter((x) => x.id !== id))
    setCampagnes((cs) => cs.map((c) => ({ ...c, lots: c.lots.filter((l) => !ids.has(l)) })).filter((c) => c.lots.length))
  }

  function toutEffacer() {
    setFichiers([])
    setCampagnes([])
    setCorrections(CORRECTIONS_VIDES)
    setErreurs([])
    setPeriode('tout')
  }

  function deposer(e: DragEvent) {
    e.preventDefault()
    setSurvol(false)
    void charger([...e.dataTransfer.files])
  }

  // ---- Campaigns ------------------------------------------------------------------------------

  const parLot = useMemo(() => new Map(lots.map((l) => [l.id, l])), [lots])
  const fichierDuLot = useMemo(() => {
    const m = new Map<string, FichierLu>()
    for (const f of fichiers) for (const l of f.lots) m.set(l.id, f)
    return m
  }, [fichiers])

  function modifierCampagne(id: string, p: Partial<CampagneSaisie>) {
    setCampagnes((cs) =>
      cs
        .map((c) => (c.id === id ? { ...c, ...p } : c))
        .sort((a, b) => (a.date && b.date ? a.date.localeCompare(b.date) : a.date ? -1 : b.date ? 1 : 0)),
    )
  }

  function deplacerLot(lot: string, vers: string) {
    setCampagnes((cs) => {
      const l = parLot.get(lot)
      let suite = cs.map((c) => ({ ...c, lots: c.lots.filter((x) => x !== lot) }))
      if (vers === 'nouvelle') {
        const date = l?.date ?? ''
        suite.push({ id: nouvelId('c'), date, regime: date ? regimePropose(date) : null, regimeAuto: true, lots: [lot], libelle: l?.libelle ?? '' })
      } else suite = suite.map((c) => (c.id === vers ? { ...c, lots: [...c.lots, lot] } : c))
      return suite.filter((c) => c.lots.length).sort((a, b) => (a.date && b.date ? a.date.localeCompare(b.date) : a.date ? -1 : b.date ? 1 : 0))
    })
  }

  function retirerCampagne(id: string) {
    const c = campagnes.find((x) => x.id === id)
    if (!c) return
    const ids = new Set(c.lots)
    setCampagnes((cs) => cs.filter((x) => x.id !== id))
    setFichiers((fs) => fs.map((f) => ({ ...f, lots: f.lots.filter((l) => !ids.has(l.id)) })).filter((f) => f.lots.length || f.releves.length || f.ouvrages.length))
  }

  // ---- Wells and compounds ----------------------------------------------------------------------

  function infoOuvrage(cle: string, p: Partial<InfoOuvrage>) {
    setCorrections((c) => ({ ...c, ouvrages: { ...c.ouvrages, [cle]: { ...c.ouvrages[cle], ...p } } }))
  }

  function rattacher(source: string, cible: string) {
    if (!base) return
    const o = base.ouvrages.find((x) => x.cle === source)
    if (!o) return
    setCorrections((c) => {
      const r = { ...c.rattachements }
      for (const n of o.noms) r[cleOuvrage(n)] = cible
      for (const [k, v] of Object.entries(r)) if (v === source) r[k] = cible
      for (const k of Object.keys(r)) if (r[k] === k) delete r[k]
      return { ...c, rattachements: r }
    })
  }

  function definirReference(cle: string, texte: string) {
    setCorrections((c) => {
      const references = { ...c.references }
      const t = texte.trim()
      if (!t) delete references[cle]
      else if (t === '-' || t === '–') references[cle] = null
      else {
        const v = Number(t.replace(/\s/g, '').replace(',', '.'))
        if (!Number.isFinite(v) || v <= 0) return c
        references[cle] = v
      }
      return { ...c, references }
    })
  }

  function basculerExclusion(id: string) {
    setCorrections((c) => {
      const exclus = { ...c.exclus }
      if (exclus[id]) delete exclus[id]
      else exclus[id] = true
      return { ...c, exclus }
    })
  }

  // ---- Volets ------------------------------------------------------------------------------------

  const basculer = (id: string) =>
    setOuverts((o) => {
      const suite = new Set(o)
      if (suite.has(id)) suite.delete(id)
      else suite.add(id)
      return suite
    })
  function ouvrir(id: string) {
    setOuverts((o) => new Set(o).add(id))
    requestAnimationFrame(() => document.getElementById(`volet-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  const basculerReglage = (id: string) =>
    setReglagesOuverts((o) => {
      const suite = new Set(o)
      if (suite.has(id)) suite.delete(id)
      else suite.add(id)
      return suite
    })

  function choisirSerie(s: AnalyseSerie) {
    setSelection({ mode: 'serie', compose: s.compose.cle, ouvrage: s.ouvrage.cle, ouvrages: [], composes: [] })
    ouvrir('explorateur')
  }
  function choisirFait(f: Fait) {
    if (!f.ouvrage || !f.compose) return
    setSelection({ mode: 'serie', compose: f.compose, ouvrage: f.ouvrage, ouvrages: [], composes: [] })
    ouvrir('explorateur')
  }

  // ---- Exports ------------------------------------------------------------------------------------

  const libelleSite = titre.trim() || 'Suivi des eaux souterraines'
  async function exporter(type: 'classeur' | 'graphiques' | 'donnees') {
    if (!analyse) return
    setExport(type)
    setErreurExport(null)
    try {
      const m = await import('../lib/suivi/export')
      if (type === 'classeur') await m.telechargerClasseurSuivi(analyse, libelleSite)
      else if (type === 'graphiques') await m.telechargerGraphiques(analyse, libelleSite)
      else await m.telechargerDonnees(analyse, libelleSite)
    } catch (e) {
      setErreurExport(`L'export a échoué : ${(e as Error).message}`)
    } finally {
      setExport(null)
    }
  }

  // ---- Derived for display -------------------------------------------------------------------------

  const composesMatrice = useMemo(() => {
    if (!analyse) return []
    return analyse.base.composes.filter(
      (c) =>
        (!filtreFamille || c.famille === filtreFamille) &&
        (voirSommes || !c.calcule) &&
        !c.terrain &&
        (voirNonQuantifies ? analyse.series.some((s) => s.compose === c && s.n > 0) : analyse.composesQuantifies.includes(c)),
    )
  }, [analyse, filtreFamille, voirSommes, voirNonQuantifies])
  const familles = useMemo(() => (analyse ? [...new Set(analyse.base.composes.filter((c) => !c.terrain).map((c) => c.famille))] : []), [analyse])

  const seriesLabo = analyse ? analyse.series.filter((s) => s.n > 0 && !s.compose.terrain && !s.compose.calcule) : []
  const hausses = seriesLabo.filter((s) => s.classe === 'hausse' || s.classe === 'hausse-probable')
  const baisses = seriesLabo.filter((s) => s.classe === 'baisse' || s.classe === 'baisse-probable')
  const depassements = seriesLabo.filter((s) => (s.ratioDernier ?? 0) > 1)
  const alertes = analyse?.faits.filter((f) => f.niveau === 'alerte').length ?? 0
  const sansDate = campagnes.filter((c) => !c.date)

  return (
    <>
      <section className="section">
        <div className="container">
          <p className="eyebrow">Bilan quadriennal · surveillance des eaux souterraines</p>
          <h1 style={{ maxWidth: '26ch' }}>Suivi temporel des résultats d'analyses</h1>
          <p className="lede">
            Chargez les rapports du laboratoire de toutes les campagnes (et, si vous l'avez, l'historique déjà consolidé et les fiches de prélèvement) : chaque ouvrage et chaque
            composé est suivi dans le temps — tendances (Mann-Kendall, pente de Sen), ruptures, dépassements, déchloration, lien avec la piézométrie — avec les faits marquants en
            direct et un classeur Excel complet, graphiques prêts pour le rapport.
          </p>

          <h2 className="etape">
            <span>1</span> Données
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
              multiple
              accept=".xlsx,.xlsm,.xls,.csv"
              style={{ display: 'none' }}
              onChange={(e) => {
                void charger([...(e.target.files ?? [])])
                e.target.value = ''
              }}
            />
            <p style={{ margin: 0, fontWeight: 600 }}>{chargement ? 'Lecture…' : 'Déposez ici tous les fichiers du suivi, en une ou plusieurs fois'}</p>
            <p style={{ margin: '0.25rem 0 0.9rem', fontSize: '0.88rem', color: 'var(--color-muted)' }}>
              Rapports du laboratoire (Excel, tout format de laboratoire : la date de prélèvement est lue dans le rapport, sinon dans le nom du fichier), fiches de prélèvement
              d'eau souterraine (niveaux d'eau et paramètres de terrain), tableau historique au format du modèle, ou l'onglet « Données consolidées » d'un précédent export. Les
              fichiers sont lus dans votre navigateur et ne sont envoyés nulle part.
            </p>
            <div className="st-boutons">
              <button type="button" className="btn" onClick={() => input.current?.click()} disabled={chargement}>
                Choisir des fichiers
              </button>
              {!fichiers.some((f) => f.nom.startsWith('Exemple')) && (
                <button type="button" className="btn btn--ghost" onClick={() => ajouterFichiers([exemple()])} disabled={chargement}>
                  Essayer avec un exemple
                </button>
              )}
              <button type="button" className="btn btn--ghost" onClick={() => void telechargerModele()}>
                Modèle de tableau historique
              </button>
            </div>
          </div>
          {erreurs.map((e) => (
            <p key={e} role="alert" className="alerte">
              {e}
            </p>
          ))}

          {fichiers.length > 0 && (
            <div className="card" style={{ marginTop: '1.25rem' }}>
              <div className="st-entete-carte">
                <strong>
                  {fichiers.length} fichier{fichiers.length > 1 ? 's' : ''} chargé{fichiers.length > 1 ? 's' : ''}
                </strong>
                <button type="button" className="btn btn--ghost btn--petit" onClick={toutEffacer}>
                  Tout retirer
                </button>
              </div>
              <ul className="st-fichiers">
                {fichiers.map((f) => (
                  <li key={f.id}>
                    <span className={`st-type st-type--${f.type}`}>{LIBELLES_TYPE[f.type]}</span>
                    <span className="st-fichiers__nom">{f.nom}</span>
                    <span className="st-note">
                      {f.resume}
                      {f.type === 'labo' && f.lots[0] && ` · date ${f.lots[0].date ? `${formatDate(f.lots[0].date)} (${LIBELLES_ORIGINE_DATE[f.lots[0].origineDate]})` : 'à saisir'}`}
                    </span>
                    {f.avertissements.map((a) => (
                      <span key={a} className="st-pastille st-pastille--vigilance">
                        {a}
                      </span>
                    ))}
                    <button type="button" className="btn btn--ghost btn--petit" onClick={() => retirerFichier(f.id)}>
                      Retirer
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {fichiers.length > 0 && !fichesChargees && !base?.niveaux.length && (
            <p className="st-note" style={{ maxWidth: '60rem' }}>
              Ajoutez les fiches de prélèvement d'eau souterraine (un onglet par ouvrage) : le niveau statique initial de chaque campagne, ramené en cote NGF avec la cote du repère,
              sert à proposer le régime hautes / basses eaux d'après les niveaux mesurés, à calculer le sens d'écoulement et le gradient, à vérifier la position amont / aval des
              ouvrages et à rechercher un lien entre concentrations et battement de la nappe ; les paramètres de fin de purge (pH, redox, oxygène, conductivité) sont suivis comme les
              autres composés.
            </p>
          )}

          {campagnes.length > 0 && (
            <>
              <h2 className="etape">
                <span>2</span> Campagnes et période analysée
              </h2>
              <p className="st-note" style={{ maxWidth: '60rem' }}>
                Les fichiers prélevés à moins de 20 jours d'intervalle sont réunis en une campagne. Vérifiez les dates et le régime hydrologique (proposé d'après le mois — hautes eaux de
                décembre à mai, basses eaux de juin à novembre — à confirmer sur la piézométrie) ; un fichier peut être déplacé vers une autre campagne.
              </p>
              {sansDate.length > 0 && (
                <p className="alerte">
                  {sansDate.length} campagne{sansDate.length > 1 ? 's' : ''} sans date : saisissez-la pour l'inclure dans l'analyse.
                </p>
              )}
              <div className="tableau-defile">
                <table className="tableau st-tableau">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Régime</th>
                      <th>Libellé</th>
                      <th>Fichiers</th>
                      <th>Échantillons</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {campagnes.map((c) => (
                      <tr key={c.id} className={c.date ? '' : 'st-ligne-alerte'}>
                        <td>
                          <input type="date" value={c.date} aria-label="Date de la campagne" style={{ width: '10rem' }} onChange={(e) => modifierCampagne(c.id, { date: e.target.value, ...(c.regimeAuto && e.target.value ? { regime: regimePropose(e.target.value) } : {}) })} />
                        </td>
                        <td>
                          <select value={(c.regimeAuto ? regimes.get(c.id)?.regime : c.regime) ?? c.regime ?? ''} aria-label="Régime hydrologique" onChange={(e) => modifierCampagne(c.id, { regime: (e.target.value || null) as Regime, regimeAuto: false })}>
                            <option value="">—</option>
                            <option value="HE">Hautes eaux</option>
                            <option value="BE">Basses eaux</option>
                          </select>
                          {c.regimeAuto && regimes.get(c.id)?.regime && (
                            <span className="st-note"> {regimes.get(c.id)!.regimeSource === 'piezo' ? "d'après les niveaux" : "d'après le mois"}</span>
                          )}
                        </td>
                        <td>
                          <input type="text" value={c.libelle} placeholder={c.date ? moisAnnee(c.date) : ''} aria-label="Libellé" onChange={(e) => modifierCampagne(c.id, { libelle: e.target.value })} style={{ width: '9rem' }} />
                        </td>
                        <td style={{ fontSize: '0.82rem' }}>
                          {c.lots.map((id) => {
                            const l = parLot.get(id) as Lot | undefined
                            if (!l) return null
                            return (
                              <div key={id} className="st-lot">
                                <span>{fichierDuLot.get(id)?.type === 'historique' ? `${l.fichier} — ${l.libelle}` : l.fichier}</span>
                                {campagnes.length > 1 || c.lots.length > 1 ? (
                                  <select value="" aria-label="Déplacer vers une autre campagne" onChange={(e) => e.target.value && deplacerLot(id, e.target.value)}>
                                    <option value="">déplacer…</option>
                                    {campagnes
                                      .filter((x) => x.id !== c.id)
                                      .map((x) => (
                                        <option key={x.id} value={x.id}>
                                          vers {x.date ? formatDate(x.date) : 'campagne sans date'}
                                        </option>
                                      ))}
                                    {c.lots.length > 1 && <option value="nouvelle">vers une nouvelle campagne</option>}
                                  </select>
                                ) : null}
                              </div>
                            )
                          })}
                        </td>
                        <td>{c.lots.reduce((n, id) => n + (parLot.get(id)?.lecture.points.length ?? 0), 0)}</td>
                        <td>
                          <button type="button" className="btn btn--ghost btn--petit" onClick={() => retirerCampagne(c.id)}>
                            Retirer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {base && base.campagnes.length > 0 && (
                <div className="st-periode">
                  <span className="st-periode__titre">Période analysée</span>
                  <div className="st-onglets" role="radiogroup" aria-label="Période analysée">
                    <button type="button" role="radio" aria-checked={periode === 'tout'} className={`st-onglet${periode === 'tout' ? ' st-onglet--actif' : ''}`} onClick={() => setPeriode('tout')}>
                      Toute la chronique ({formatDate(base.campagnes[0].date)} → {formatDate(derniere)})
                    </button>
                    <button type="button" role="radio" aria-checked={periode === 'bq'} className={`st-onglet${periode === 'bq' ? ' st-onglet--actif' : ''}`} onClick={() => setPeriode('bq')}>
                      Quatre dernières années (bilan quadriennal)
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={periode === 'perso'}
                      className={`st-onglet${periode === 'perso' ? ' st-onglet--actif' : ''}`}
                      onClick={() => {
                        setPeriode('perso')
                        setReglages((r) => ({ ...r, debut: r.debut ?? base.campagnes[0].date, fin: r.fin ?? derniere }))
                      }}
                    >
                      Personnalisée
                    </button>
                  </div>
                  {periode === 'perso' && (
                    <div className="st-commandes">
                      <label className="champ">
                        Du
                        <input type="date" value={reglages.debut ?? ''} onChange={(e) => setReglages({ ...reglages, debut: e.target.value || null })} />
                      </label>
                      <label className="champ">
                        Au
                        <input type="date" value={reglages.fin ?? ''} onChange={(e) => setReglages({ ...reglages, fin: e.target.value || null })} />
                      </label>
                    </div>
                  )}
                  {analyse && (
                    <p className="st-note">
                      {analyse.campagnes.length} campagne{analyse.campagnes.length > 1 ? 's' : ''} analysée{analyse.campagnes.length > 1 ? 's' : ''}, du {formatDate(analyse.debut)} au{' '}
                      {formatDate(analyse.fin)}. Les graphiques montrent toute la chronique, la période hors analyse en grisé.
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {base && analyse && (
            <>
              <h2 className="etape">
                <span>3</span> Ouvrages, composés et réglages
              </h2>
              <Volet
                id="ouvrages"
                titre="Ouvrages"
                teinte="ardoise"
                ouvert={reglagesOuverts.has('ouvrages')}
                onBasculer={() => basculerReglage('ouvrages')}
                resume={`${base.ouvrages.length} ouvrages · ${base.ouvrages.filter((o) => o.position === 'amont').length} amont, ${base.ouvrages.filter((o) => o.position === 'aval').length} aval${Object.keys(corrections.rattachements).length ? ` · ${Object.keys(corrections.rattachements).length} rattachement(s)` : ''}`}
              >
                <TableOuvrages base={base} analyse={analyse} onInfo={infoOuvrage} onRattacher={rattacher} onReinitialiser={() => setCorrections((c) => ({ ...c, rattachements: {} }))} />
              </Volet>
              <Volet
                id="composes"
                titre="Composés et valeurs de référence"
                teinte="ardoise"
                ouvert={reglagesOuverts.has('composes')}
                onBasculer={() => basculerReglage('composes')}
                resume={`${base.composes.filter((c) => !c.terrain).length} composés · ${analyse.composesQuantifies.filter((c) => !c.terrain).length} quantifiés au moins une fois · ${Object.keys(corrections.references).length} valeur(s) saisie(s)`}
              >
                <TableComposes analyse={analyse} corrections={corrections} onReference={definirReference} />
              </Volet>
              <Volet
                id="reglages"
                titre="Réglages statistiques"
                teinte="ardoise"
                ouvert={reglagesOuverts.has('reglages')}
                onBasculer={() => basculerReglage('reglages')}
                resume={`${LIBELLES_CENSURE[reglages.censure].court} · seuil ${fr(reglages.alpha * 100)} % · test dès ${reglages.nMin} résultats`}
              >
                <div className="grid grid--2" style={{ alignItems: 'start' }}>
                  <label className="champ">
                    Résultats inférieurs à la LQ dans les tests
                    <select value={reglages.censure} onChange={(e) => setReglages({ ...reglages, censure: e.target.value as Censure })}>
                      {(Object.keys(LIBELLES_CENSURE) as Censure[]).map((k) => (
                        <option key={k} value={k}>
                          {LIBELLES_CENSURE[k].court}
                        </option>
                      ))}
                    </select>
                    <span className="st-note">{LIBELLES_CENSURE[reglages.censure].long}</span>
                  </label>
                  <label className="champ">
                    Seuil de signification (bilatéral)
                    <select value={reglages.alpha} onChange={(e) => setReglages({ ...reglages, alpha: Number(e.target.value) })}>
                      <option value={0.01}>1 %</option>
                      <option value={0.05}>5 % (usuel)</option>
                      <option value={0.1}>10 %</option>
                    </select>
                    <span className="st-note">Hausse ou baisse « significative » à p ≤ α, « probable » à p ≤ 2α.</span>
                  </label>
                  <label className="champ">
                    Nombre minimal de résultats pour tester une tendance
                    <select value={reglages.nMin} onChange={(e) => setReglages({ ...reglages, nMin: Number(e.target.value) })}>
                      {[4, 5, 6, 8, 10].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                    <span className="st-note">4 au minimum (MAROS) ; l'outil HYPE du BRGM en demande 10 — en dessous, la série est signalée comme courte.</span>
                  </label>
                  <label className="champ">
                    Seuil de vigilance (part de la valeur de référence)
                    <select value={reglages.vigilance} onChange={(e) => setReglages({ ...reglages, vigilance: Number(e.target.value) })}>
                      <option value={0.5}>50 %</option>
                      <option value={0.75}>75 % (arrêté du 17 décembre 2008)</option>
                      <option value={1}>100 %</option>
                    </select>
                  </label>
                </div>
              </Volet>
            </>
          )}
        </div>
      </section>

      {analyse && (
        <section className="section section--muted">
          <div className="container">
            <h2 className="etape">
              <span>4</span> Résultats et interprétation
            </h2>
            <p className="lede" style={{ marginBottom: '0.5rem' }}>
              Tout se recalcule en direct : changez la période, une valeur de référence, écartez un résultat d'un clic sur un graphique. Cliquez une tuile, une case de la matrice ou
              un fait marquant pour ouvrir la série.
            </p>
            <div className="tuiles">
              <Tuile teinte="ardoise" valeur={analyse.campagnes.length} libelle="campagnes analysées" detail={`${moisAnnee(analyse.debut)} → ${moisAnnee(analyse.fin)}`} onClick={() => ouvrir('indicateurs')} />
              <Tuile teinte="bleu" valeur={`${analyse.composesQuantifies.filter((c) => !c.terrain && !c.calcule).length}`} libelle="composés quantifiés" detail={`sur ${analyse.ouvrages.length} ouvrages`} onClick={() => ouvrir('matrice')} />
              <Tuile teinte="brique" etat={hausses.length ? 'alerte' : 'ok'} valeur={hausses.length} libelle="séries en hausse" detail={hausses.length ? [...new Set(hausses.map((s) => s.compose.nom))].slice(0, 3).join(', ') : 'aucune hausse détectée'} onClick={() => ouvrir('tableau')} />
              <Tuile teinte="vert" valeur={baisses.length} libelle="séries en baisse" detail={baisses.length ? [...new Set(baisses.map((s) => s.compose.nom))].slice(0, 3).join(', ') : '—'} onClick={() => ouvrir('tableau')} />
              <Tuile teinte="ocre" etat={depassements.length ? 'vigilance' : 'ok'} valeur={depassements.length} libelle="au-dessus de la référence" detail="au dernier prélèvement de chaque série" onClick={() => ouvrir('indicateurs')} />
              <Tuile teinte="violet" valeur={analyse.pistes.length} libelle="pistes pour la surveillance" detail={`${analyse.pistes.filter((p) => p.type === 'alleger' || p.type === 'retirer').length} d'allègement`} onClick={() => ouvrir('pistes')} />
            </div>

            <Volet id="faits" titre="Faits marquants" teinte="brique" ouvert={ouverts.has('faits')} onBasculer={() => basculer('faits')} resume={`${analyse.faits.length} constats, du plus important au moins important`} badges={alertes ? <span className="badge badge--elevee">{alertes} alerte{alertes > 1 ? 's' : ''}</span> : undefined}>
              <Faits faits={analyse.faits} onChoisir={choisirFait} />
            </Volet>

            <Volet id="matrice" titre="Matrice des tendances" teinte="bleu" ouvert={ouverts.has('matrice')} onBasculer={() => basculer('matrice')} resume="Ouvrages × composés : tendance de chaque série et dernier résultat rapporté à la valeur de référence">
              <div className="st-commandes">
                <label className="champ">
                  Famille
                  <select value={filtreFamille} onChange={(e) => setFiltreFamille(e.target.value)}>
                    <option value="">toutes</option>
                    {familles.map((f) => (
                      <option key={f || '—'} value={f}>
                        {f || 'sans famille'}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="st-bascules">
                  <label className="st-coche">
                    <input type="checkbox" checked={voirSommes} onChange={(e) => setVoirSommes(e.target.checked)} /> sommes calculées
                  </label>
                  <label className="st-coche">
                    <input type="checkbox" checked={voirNonQuantifies} onChange={(e) => setVoirNonQuantifies(e.target.checked)} /> composés jamais quantifiés
                  </label>
                </div>
              </div>
              <LegendeClasses comptes={analyse.comptes} />
              <MatriceTendances analyse={analyse} composes={composesMatrice} onChoisir={choisirSerie} />
            </Volet>

            <Volet id="explorateur" titre="Chroniques" teinte="vert" ouvert={ouverts.has('explorateur')} onBasculer={() => basculer('explorateur')} resume="Un composé sur tous les ouvrages, les composés d'un ouvrage, ou une série en détail avec toutes ses statistiques">
              <Explorateur analyse={analyse} selection={selection} onSelection={setSelection} options={options} onOptions={setOptions} onExclure={basculerExclusion} />
            </Volet>

            <Volet id="fiches" titre="Fiches par ouvrage" teinte="ardoise" ouvert={ouverts.has('fiches')} onBasculer={() => basculer('fiches')} resume="Les composés quantifiés de chaque ouvrage, leur courbe et leur tendance">
              <FichesOuvrages analyse={analyse} composes={analyse.base.composes.filter((c) => !c.terrain && (voirSommes || !c.calcule))} onChoisir={choisirSerie} />
            </Volet>

            <Volet id="tableau" titre="Tableau des tendances" teinte="bleu" ouvert={ouverts.has('tableau')} onBasculer={() => basculer('tableau')} resume="Toutes les séries et leurs statistiques, triables">
              <TableauTendances analyse={analyse} onChoisir={choisirSerie} />
            </Volet>

            <Volet id="indicateurs" titre="Évolution d'ensemble" teinte="ocre" ouvert={ouverts.has('indicateurs')} onBasculer={() => basculer('indicateurs')} resume="Dépassements de la valeur de référence campagne par campagne">
              <Indicateurs analyse={analyse} />
            </Volet>

            {analyse.degradation.length > 0 && (
              <Volet id="degradation" titre="Dégradation des solvants chlorés" teinte="violet" ouvert={ouverts.has('degradation')} onBasculer={() => basculer('degradation')} resume={`Parts molaires des chloroéthènes au fil des campagnes · ${analyse.degradation.length} ouvrage(s)`}>
                <Degradation analyse={analyse} />
              </Volet>
            )}

            <Volet id="piezo" titre="Piézométrie" teinte="bleu" ouvert={ouverts.has('piezo')} onBasculer={() => basculer('piezo')} resume={analyse.piezo.length ? `Niveaux de ${analyse.piezo.length} ouvrage(s) et lien avec les concentrations` : 'aucun niveau chargé'}>
              <Piezometrie analyse={analyse} />
            </Volet>

            <Volet id="amontaval" titre="Amont / aval" teinte="ocre" ouvert={ouverts.has('amontaval')} onBasculer={() => basculer('amontaval')} resume="Le maximum à l'amont, au droit du site et à l'aval, campagne par campagne">
              <AmontAval analyse={analyse} />
            </Volet>

            <Volet id="plan" titre="Plan des ouvrages" teinte="vert" ouvert={ouverts.has('plan')} onBasculer={() => basculer('plan')} resume={analyse.ouvrages.filter((o) => o.x !== null).length >= 2 ? 'Tendance et dernier résultat à la position de chaque ouvrage' : 'coordonnées à saisir (étape 3)'}>
              <Plan analyse={analyse} />
            </Volet>

            <Volet id="pistes" titre="Pistes pour le programme de surveillance" teinte="violet" ouvert={ouverts.has('pistes')} onBasculer={() => basculer('pistes')} resume="Renforcer, maintenir, compléter, alléger — avec le critère appliqué">
              <Pistes analyse={analyse} />
            </Volet>

            <Volet id="qualite" titre="Qualité et comparabilité des données" teinte="ardoise" ouvert={ouverts.has('qualite')} onBasculer={() => basculer('qualite')} resume={`${analyse.qualite.filter((q) => q.niveau !== 'info').length} point(s) d'attention`}>
              <Qualite analyse={analyse} />
            </Volet>

            <Volet id="methode" titre="Méthode et références" teinte="ardoise" ouvert={ouverts.has('methode')} onBasculer={() => basculer('methode')} resume="Tests statistiques, conventions et textes de référence">
              <Methode analyse={analyse} />
            </Volet>

            <h2 className="etape">
              <span>5</span> Exports
            </h2>
            <label className="champ" style={{ maxWidth: '30rem' }}>
              Nom du site (titre des exports)
              <input type="text" value={titre} placeholder="Suivi des eaux souterraines" onChange={(e) => setTitre(e.target.value)} />
            </label>
            {erreurExport && <p className="alerte">{erreurExport}</p>}
            <div className="exports-liste">
              <CarteExport
                teinte="bleu"
                titre="Classeur du bilan"
                nom={`${libelleSite} - suivi temporel.xlsx`}
                description="Synthèse et faits marquants, tendances de toutes les séries (Mann-Kendall, Sen, Pettitt, demi-vie), matrice colorée, chroniques par ouvrage et par composé, graphiques intégrés, piézométrie, amont / aval, pistes de surveillance, qualité des données, méthode, données consolidées."
                enCours={export_ === 'classeur'}
                desactive={!!export_}
                onTelecharger={() => void exporter('classeur')}
              />
              <CarteExport
                teinte="vert"
                titre="Graphiques pour le rapport"
                nom={`${libelleSite} - graphiques.zip`}
                description="Chaque composé quantifié sur tous les ouvrages, les familles de chaque ouvrage, les séries en hausse ou en dépassement, la piézométrie et la déchloration : PNG haute définition et SVG."
                enCours={export_ === 'graphiques'}
                desactive={!!export_}
                onTelecharger={() => void exporter('graphiques')}
              />
              <CarteExport
                teinte="ardoise"
                titre="Données consolidées"
                nom={`${libelleSite} - donnees consolidees.xlsx`}
                description="Tous les résultats harmonisés (une ligne par résultat), les ouvrages et les niveaux, au format du modèle historique : à recharger tel quel pour le bilan suivant."
                enCours={export_ === 'donnees'}
                desactive={!!export_}
                onTelecharger={() => void exporter('donnees')}
              />
            </div>
          </div>
        </section>
      )}
    </>
  )
}

function CarteExport({ teinte, titre, nom, description, enCours, desactive, onTelecharger }: { teinte: TeinteVolet; titre: string; nom: string; description: string; enCours: boolean; desactive: boolean; onTelecharger: () => void }) {
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

// ---- Wells table ------------------------------------------------------------------------------------


function TableOuvrages({
  base,
  analyse,
  onInfo,
  onRattacher,
  onReinitialiser,
}: {
  base: Base
  analyse: Analyse
  onInfo: (cle: string, p: Partial<InfoOuvrage>) => void
  onRattacher: (source: string, cible: string) => void
  onReinitialiser: () => void
}) {
  const nombre = (t: string) => {
    const v = Number(t.replace(/\s/g, '').replace(',', '.'))
    return t.trim() && Number.isFinite(v) ? v : null
  }
  return (
    <>
      <p className="st-note">
        Les échantillons sont rattachés aux ouvrages par leur nom (« PZ 01 », « pz-1 » et « Pz1 » sont un même ouvrage). Un ouvrage renommé d'une campagne à l'autre se rattache à
        l'autre nom ; un ouvrage écarté sort de l'analyse. La position (amont, au droit, aval) sert à la comparaison amont / aval et à l'ordre des tableaux : elle est proposée d'après
        le nom ou la cote de la nappe, à vérifier sur la carte piézométrique.
      </p>
      <div className="tableau-defile">
        <table className="tableau st-tableau">
          <thead>
            <tr>
              <th>Ouvrage</th>
              <th>Noms rencontrés</th>
              <th>Campagnes</th>
              <th>Position</th>
              <th>X</th>
              <th>Y</th>
              <th>Cote du repère (m NGF)</th>
              <th>Rattacher à</th>
              <th>Écarter</th>
            </tr>
          </thead>
          <tbody>
            {base.ouvrages.map((o) => {
              const presentes = new Set(base.resultats.filter((r) => r.ouvrage === o.cle).map((r) => r.campagne))
              return (
                <tr key={o.cle} className={o.exclu ? 'tableau__exclu' : ''}>
                  <th scope="row">
                    <input type="text" value={o.nom} aria-label="Nom de l'ouvrage" onChange={(e) => onInfo(o.cle, { nom: e.target.value })} style={{ width: '7rem' }} />
                  </th>
                  <td style={{ fontSize: '0.8rem' }}>{o.noms.join(', ')}</td>
                  <td>
                    <span className="st-points-campagnes" title={base.campagnes.map((c) => `${formatDate(c.date)} : ${presentes.has(c.id) ? 'prélevé' : 'absent'}`).join('\n')}>
                      {base.campagnes.map((c) => (
                        <span key={c.id} className={presentes.has(c.id) ? 'st-point st-point--plein' : 'st-point'} />
                      ))}
                    </span>
                  </td>
                  <td>
                    <select value={o.position} aria-label="Position hydraulique" onChange={(e) => onInfo(o.cle, { position: e.target.value as Position })}>
                      {(['amont', 'droit', 'aval', 'autre'] as Position[]).map((p) => (
                        <option key={p} value={p}>
                          {LIBELLES_POSITION[p]}
                        </option>
                      ))}
                    </select>
                    {o.positionAuto && o.position !== 'autre' && <span className="st-note"> proposé</span>}
                  </td>
                  <td>
                    <input type="text" inputMode="decimal" defaultValue={o.x ?? ''} aria-label="X" onBlur={(e) => onInfo(o.cle, { x: nombre(e.target.value) })} style={{ width: '6.5rem' }} />
                  </td>
                  <td>
                    <input type="text" inputMode="decimal" defaultValue={o.y ?? ''} aria-label="Y" onBlur={(e) => onInfo(o.cle, { y: nombre(e.target.value) })} style={{ width: '6.5rem' }} />
                  </td>
                  <td>
                    <input type="text" inputMode="decimal" defaultValue={o.repere ?? ''} aria-label="Cote du repère" onBlur={(e) => onInfo(o.cle, { repere: nombre(e.target.value) })} style={{ width: '6rem' }} />
                  </td>
                  <td>
                    <select value="" aria-label="Rattacher à un autre ouvrage" onChange={(e) => e.target.value && onRattacher(o.cle, e.target.value)}>
                      <option value="">—</option>
                      {base.ouvrages
                        .filter((x) => x.cle !== o.cle)
                        .map((x) => (
                          <option key={x.cle} value={x.cle}>
                            {x.nom}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td>
                    <input type="checkbox" checked={o.exclu} aria-label="Écarter l'ouvrage" onChange={(e) => onInfo(o.cle, { exclu: e.target.checked })} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {analyse.ouvrages.length !== base.ouvrages.length && <p className="st-note">{base.ouvrages.length - analyse.ouvrages.length} ouvrage(s) écarté(s) de l'analyse.</p>}
      <button type="button" className="btn btn--ghost btn--petit" onClick={onReinitialiser}>
        Annuler les rattachements
      </button>
    </>
  )
}

// ---- Compounds table -----------------------------------------------------------------------------------

function TableComposes({ analyse, corrections, onReference }: { analyse: Analyse; corrections: Corrections; onReference: (cle: string, texte: string) => void }) {
  const composes = analyse.base.composes.filter((c) => !c.terrain)
  return (
    <>
      <p className="st-note">
        Composés rapprochés d'un laboratoire à l'autre par n° CAS, sinon par nom, et ramenés à l'unité de leur plus ancien résultat. La valeur de référence vient du tableau ERM des
        eaux souterraines ; saisissez-en une autre pour la remplacer (« - » pour n'en retenir aucune, vide pour revenir à la valeur ERM).
      </p>
      <div className="tableau-defile" style={{ maxHeight: '32rem' }}>
        <table className="tableau st-tableau">
          <thead>
            <tr>
              <th>Composé</th>
              <th>Famille</th>
              <th>Unité</th>
              <th>Ouvrages où quantifié</th>
              <th>LQ rencontrées</th>
              <th>Valeur de référence</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {composes.map((c) => {
              const ss = analyse.series.filter((s) => s.compose === c && s.n > 0)
              const q = ss.filter((s) => s.nQ > 0)
              const lqs = ss.flatMap((s) => (s.lqMin !== null ? [s.lqMin, s.lqMax!] : []))
              const ref = analyse.references.get(c.cle)
              const saisie = c.cle in corrections.references
              return (
                <tr key={c.cle}>
                  <th scope="row">
                    {c.nom}
                    {c.cas && <span className="st-note"> {c.cas}</span>}
                  </th>
                  <td style={{ fontSize: '0.82rem' }}>{c.famille || '–'}</td>
                  <td>{c.unite}</td>
                  <td style={{ fontSize: '0.82rem' }}>{q.length ? q.map((s) => s.ouvrage.nom).join(', ') : <span className="st-note">jamais</span>}</td>
                  <td className={lqs.length && Math.max(...lqs) / Math.min(...lqs) >= 2 ? 'st-depasse' : ''}>{lqs.length ? (Math.min(...lqs) === Math.max(...lqs) ? fr(lqs[0]) : `${fr(Math.min(...lqs))} – ${fr(Math.max(...lqs))}`) : '–'}</td>
                  <td>
                    <input
                      key={`${c.cle}-${ref?.valeur ?? 'x'}-${saisie}`}
                      type="text"
                      className="tableau__guide"
                      defaultValue={ref ? String(ref.valeur).replace('.', ',') : saisie ? '-' : ''}
                      aria-label={`Valeur de référence ${c.nom}`}
                      onBlur={(e) => onReference(c.cle, e.target.value)}
                      style={{ width: '5.5rem' }}
                    />
                  </td>
                  <td style={{ fontSize: '0.82rem' }}>{saisie ? 'saisie' : (ref?.source ?? '–')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="st-note">
        Classes de tendance : {Object.values(CLASSES)
          .slice(0, 6)
          .map((k) => `${k.symbole} ${k.libelle.toLowerCase()}`)
          .join(' · ')}
        .
      </p>
    </>
  )
}
