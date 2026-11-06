import { useMemo, useRef, useState, type DragEvent } from 'react'
import { fusionnerLectures } from '../lib/resultats/fusion'
import { LectureImpossible, lireClasseur, lireGrille, type Cell, type Lecture } from '../lib/resultats/parse'
import { LIBELLES_TYPE } from '../lib/resultats/qualite'
import { grilleExemple } from '../lib/pfas/exemple'
import { composition, indicateurs } from '../lib/pfas/indicateurs'
import { lirePfas, matriceProbable, type EchantillonPfas, type LecturePfas, type Valeur } from '../lib/pfas/lecture'
import { GRANDEURS, type Matrice } from '../lib/pfas/reperes'
import { pistes } from '../lib/pfas/sources'
import { PAR_ID, VINGT } from '../lib/pfas/substances'
import { Auteur, Cite } from '../components/pfas/Cite'
import { Echelle } from '../components/pfas/Echelle'
import { BarreComposition, BilanFluor, LegendeGroupes, Profil } from '../components/pfas/Graphiques'
import { Bibliographie, CarteSubstances, Indicateurs, Pistes } from '../components/pfas/Lecture'
import { grandeur, nombre, valeurTexte } from '../components/pfas/format'

async function lireFichier(f: File): Promise<Lecture> {
  const XLSX = await import('xlsx')
  const classeur = XLSX.read(await f.arrayBuffer(), { type: 'array' })
  const feuilles = classeur.SheetNames.map((nom) => ({
    nom,
    grille: XLSX.utils.sheet_to_json<Cell[]>(classeur.Sheets[nom], { header: 1, raw: true, defval: null }),
  }))
  return lireClasseur(feuilles, 'tout')
}

/** "× 17" above a value, "17 %" below it, as a badge with an arrow. */
function Comparaison({ v, seuil }: { v: Valeur | null; seuil: number }) {
  if (!v) return <span className="pfas-muet">—</span>
  if (v.inferieur) {
    return v.valeur < seuil ? (
      <span className="badge badge--faible">▼ &lt; LQ</span>
    ) : (
      <span className="badge badge--indeterminee" title="La limite de quantification dépasse la valeur : comparaison impossible">
        LQ trop haute
      </span>
    )
  }
  const r = v.valeur / seuil
  return r >= 1 ? (
    <span className="badge badge--elevee" title={`${nombre(r)} fois la valeur`}>
      ▲ × {r >= 10 ? Math.round(r).toLocaleString('fr-FR') : r.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
    </span>
  ) : (
    <span className="badge badge--faible" title={`${nombre(r * 100)} % de la valeur`}>
      ▼ {Math.max(1, Math.round(r * 100))} %
    </span>
  )
}

function controleSomme(e: EchantillonPfas): string | null {
  if (!e.somme || e.sommeCalculee || e.somme.inferieur) return null
  const calcul = VINGT.reduce((a, s) => a + (e.substances[s.id] && !e.substances[s.id]!.inferieur ? e.substances[s.id]!.valeur : 0), 0)
  if (!calcul) return null
  const ecart = Math.abs(e.somme.valeur - calcul) / e.somme.valeur
  return ecart > 0.05 ? `somme du laboratoire ${nombre(e.somme.valeur)}, somme des valeurs quantifiées ${nombre(calcul)} (écart ${Math.round(ecart * 100)} %)` : null
}

/** `exemple`: open on the fictitious example (standalone page); `impression`:
 *  offer the print button (not where printing is blocked). */
export default function InterpretationPfas({ exemple: auDemarrage = false, impression = true }: { exemple?: boolean; impression?: boolean }) {
  const [fichiers, setFichiers] = useState<{ nom: string; lecture: Lecture }[]>(() =>
    auDemarrage ? [{ nom: 'Exemple fictif', lecture: lireGrille(grilleExemple(), 'tout') }] : [],
  )
  const [matrice, setMatrice] = useState<Matrice>('eau')
  const [choisi, setChoisi] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [chargement, setChargement] = useState(false)
  const [survol, setSurvol] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const ajout = useRef<HTMLInputElement>(null)

  const fusion = useMemo(() => {
    if (!fichiers.length) return null
    try {
      return fusionnerLectures(fichiers)
    } catch (e) {
      return { erreur: e instanceof Error ? e.message : String(e) }
    }
  }, [fichiers])
  const lecture = fusion && 'lecture' in fusion ? fusion.lecture : null
  const pfas: LecturePfas | null = useMemo(() => (lecture ? lirePfas(lecture, matrice) : null), [lecture, matrice])
  const echantillons = pfas?.echantillons ?? []
  const reels = echantillons.filter((e) => e.type === 'echantillon' || e.type === 'doublon')
  const courant = reels.find((e) => e.nom === choisi) ?? reels[0] ?? null

  function installer(liste: { nom: string; lecture: Lecture }[]) {
    setFichiers(liste)
    if (liste.length) setMatrice(matriceProbable(fusionnerLectures(liste).lecture))
    setChoisi(null)
  }

  async function charger(liste: FileList | File[] | null | undefined, ajouter: boolean) {
    const fs = [...(liste ?? [])]
    if (!fs.length) return
    setChargement(true)
    setErreur(null)
    try {
      const lus: { nom: string; lecture: Lecture }[] = []
      for (const f of fs) {
        try {
          lus.push({ nom: f.name, lecture: await lireFichier(f) })
        } catch (e) {
          throw new Error(
            e instanceof LectureImpossible
              ? `${f.name} : ${e.message}`
              : `${f.name} n'a pas pu être lu. Vérifiez qu'il s'agit d'un classeur Excel (.xlsx, .xls) ou d'un CSV.`,
          )
        }
      }
      const suite = ajouter ? [...fichiers.filter((x) => x.nom !== 'Exemple fictif'), ...lus] : lus
      fusionnerLectures(suite)
      installer(suite)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setChargement(false)
    }
  }

  function exemple() {
    setErreur(null)
    installer([{ nom: 'Exemple fictif', lecture: lireGrille(grilleExemple(), 'tout') }])
  }

  function deposer(e: DragEvent) {
    e.preventDefault()
    setSurvol(false)
    void charger(e.dataTransfer.files, false)
  }

  const blancsPollues = echantillons.filter(
    (e) => (e.type === 'blanc-terrain' || e.type === 'blanc-transport') && Object.values(e.substances).some((v) => v && !v.inferieur),
  )
  const ecarts = reels.map((e) => ({ e, ecart: controleSomme(e) })).filter((x) => x.ecart)
  const estExemple = fichiers.length === 1 && fichiers[0].nom === 'Exemple fictif'

  return (
    <>
      <section className="section pfas">
        <div className="container">
          <p className="eyebrow">PFAS — sols et eaux souterraines</p>
          <h1 style={{ maxWidth: '22ch' }}>Interprétation des résultats PFAS</h1>
          <p className="lede">
            Situer les 20 PFAS de la directive, le TFA et le 6:2 FTS sur des ordres de grandeur publiés, lire la composition de chaque
            échantillon et en tirer des pistes de sources, chaque lecture renvoyant à sa référence.
          </p>

          <details className="pfas-intro" open={!pfas}>
            <summary>Ce que contient un rapport PFAS, et comment le lire</summary>
            <div className="grid grid--3" style={{ marginTop: '1rem' }}>
              <div className="card">
                <h3>La somme des 20</h3>
                <p>
                  Dix acides carboxyliques (PFCA) et dix acides sulfoniques (PFSA), de 4 à 13 carbones, dont la somme est réglementée dans l’eau
                  potable <Cite ids={['directive2020']} />. En France : <strong>0,1 µg/l</strong> au robinet, <strong>2 µg/l</strong> dans les
                  eaux brutes, valeur retenue par ERM pour les eaux souterraines <Cite ids={['arrete2007']} />. Aucune valeur réglementaire
                  pour les sols.
                </p>
              </div>
              <div className="card">
                <h3>Le TFA</h3>
                <p>
                  Le plus court des PFAS (2 carbones), hors somme des 20. Produit final de la dégradation de nombreux PFAS, il est présent
                  presque partout <Cite ids={['arp2024', 'anses2025']} />. Valeur sanitaire indicative : <strong>60 µg/l</strong>, objectif{' '}
                  <strong>10 µg/l</strong> <Cite ids={['instructionDgs2025']} />.
                </p>
              </div>
              <div className="card">
                <h3>Le 6:2 FTS</h3>
                <p>
                  Fluorotélomère sulfonate, constituant des mousses récentes et des suppresseurs de brouillard du chromage
                  <Cite ids={['backe2013', 'egle2020', 'bmuv2019']} />. C’est un <em>précurseur</em> : il se dégrade en PFHxA et PFPeA en
                  milieu oxygéné <Cite ids={['zhang2016']} />.
                </p>
              </div>
            </div>
            <h3 style={{ marginTop: '1.5rem' }}>Les 22 substances interprétées</h3>
            <p className="pfas-note">
              Une colonne par nombre de carbones. Teinte claire : chaînes courtes ; foncée : chaînes longues, c’est-à-dire au moins 7
              carbones perfluorés pour les PFCA (PFOA et au-delà) et au moins 6 pour les PFSA (PFHxS et au-delà) <Cite ids={['buck2011']} />.
              Survolez une case pour le n° CAS, la formule et la part de fluor.
              {pfas && ' Les cases grisées sont absentes du fichier chargé.'}
            </p>
            <CarteSubstances analysees={pfas?.analysees} />
            <div className="grid grid--2" style={{ marginTop: '1.25rem' }}>
              <div className="card">
                <h3>Paramètres globaux : AOF, EOF, TOP</h3>
                <p>
                  L’<strong>AOF</strong> (eaux) et l’<strong>EOF</strong> (sols) mesurent tout le fluor organique, dosé ou non
                  <Cite ids={['wagner2013', 'epa1621']} /> ; leur LQ (de l’ordre du µg/l) est bien plus haute que celle des analyses ciblées.
                  Le <strong>TOP</strong> oxyde les précurseurs en PFCA : la hausse après oxydation est un minimum des précurseurs présents
                  <Cite ids={['houtzSedlak2012', 'ateia2023']} />. Si le fichier contient un AOF ou un EOF, l’outil fait le bilan du fluor ;
                  le TOP n’est pas interprété.
                </p>
              </div>
              <div className="card">
                <h3>Ce que l’outil ne fait pas</h3>
                <p>
                  Il ne désigne pas de source : la composition oriente, la preuve vient du croisement avec l’historique et le schéma conceptuel
                  du site <Cite ids={['rodowa2021']} />. Les profils évoluent le long d’un panache, les chaînes courtes migrant plus loin et les
                  précurseurs se transformant <Cite ids={['guelfoHiggins2013', 'houtz2013']} />. Vingt-deux substances ne couvrent qu’une
                  partie des PFAS présents <Cite ids={['ackermanGrunfeld2024']} />.
                </p>
              </div>
            </div>
          </details>

          <h2 className="etape">
            <span>1</span> Fichier du laboratoire
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
                void charger(e.target.files, false)
                e.target.value = ''
              }}
            />
            <input
              ref={ajout}
              type="file"
              multiple
              accept=".xlsx,.xlsm,.xls,.csv"
              style={{ display: 'none' }}
              onChange={(e) => {
                void charger(e.target.files, true)
                e.target.value = ''
              }}
            />
            <p style={{ margin: 0, fontWeight: 600 }}>{chargement ? 'Lecture du fichier…' : 'Déposez ici le ou les fichiers du laboratoire'}</p>
            <p style={{ margin: '0.25rem 0 0.9rem', fontSize: '0.88rem', color: 'var(--color-muted)' }}>
              Excel ou CSV, eaux ou sols. Le TFA rendu dans un rapport à part se joint au premier (échantillons rapprochés par leur nom).
              Les fichiers sont lus dans votre navigateur et ne sont envoyés nulle part.
            </p>
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn" onClick={() => input.current?.click()} disabled={chargement}>
                Choisir un fichier
              </button>
              {fichiers.length > 0 && !estExemple && (
                <button type="button" className="btn btn--ghost" onClick={() => ajout.current?.click()} disabled={chargement}>
                  Ajouter un fichier
                </button>
              )}
              <button type="button" className="btn btn--ghost" onClick={exemple} disabled={chargement}>
                Voir un exemple fictif
              </button>
            </div>
          </div>

          {erreur && (
            <p role="alert" className="alerte">
              {erreur}
            </p>
          )}
          {fusion && 'erreur' in fusion && (
            <p role="alert" className="alerte">
              {fusion.erreur}
            </p>
          )}

          {pfas && lecture && (
            <div className="card pfas-fichier">
              <strong>{fichiers.map((f) => f.nom).join(' + ')}</strong>
              {estExemple && (
                <p className="pfas-alerte-exemple">
                  Exemple fictif : trois profils construits pour illustrer la lecture (mousse ancienne, mousse à fluorotélomères, apports
                  diffus avec TFA) et un blanc. Ils ne correspondent à aucun site.
                </p>
              )}
              <p className="pfas-muet" style={{ margin: '0.3rem 0 0.6rem' }}>
                {lecture.points.length} échantillon{lecture.points.length > 1 ? 's' : ''} · {pfas.analysees.length} des 22 substances
                présentes{pfas.libelleSomme ? ` · somme du laboratoire : « ${pfas.libelleSomme} »` : ''}
                {pfas.autres.length > 0 && ` · ${pfas.autres.length} autre${pfas.autres.length > 1 ? 's' : ''} PFAS non interprété${pfas.autres.length > 1 ? 's' : ''}`}
              </p>
              <div className="pfas-segment" role="radiogroup" aria-label="Matrice">
                {(['eau', 'sol'] as Matrice[]).map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={matrice === m} className={matrice === m ? 'actif' : ''} onClick={() => setMatrice(m)}>
                    {m === 'eau' ? 'Eaux souterraines (ng/l)' : 'Sols (µg/kg MS)'}
                  </button>
                ))}
              </div>
              {fusion && 'notes' in fusion && fusion.notes.length > 0 && (
                <ul className="pfas-avertissements">
                  {fusion.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
              {pfas.avertissements.length > 0 && (
                <ul className="pfas-avertissements">
                  {pfas.avertissements.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              )}
              <details>
                <summary>Lignes reconnues ({pfas.correspondances.length})</summary>
                <table className="tableau" style={{ marginTop: '0.5rem' }}>
                  <thead>
                    <tr>
                      <th>Ligne du fichier</th>
                      <th>Lue comme</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pfas.correspondances.map((c) => (
                      <tr key={c.ligne}>
                        <td>{c.ligne}</td>
                        <td>{c.lu}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {pfas.autres.length > 0 && (
                  <p className="pfas-note">
                    Autres PFAS du fichier, affichés mais non interprétés : {pfas.autres.join(', ')}. Ils comptent pour les sources (GenX et
                    ADONA pour la chimie du fluor, 8:2 FTS et précurseurs pour les mousses) : à lire avec le laboratoire.
                  </p>
                )}
              </details>
            </div>
          )}
        </div>
      </section>

      {pfas && reels.length > 0 && (
        <>
          <section className="section section--muted pfas">
            <div className="container">
              <h2 className="etape">
                <span>2</span> Vue d’ensemble
              </h2>
              <div className="tableau-defile">
                <table className="tableau pfas-synthese">
                  <thead>
                    <tr>
                      <th>Échantillon</th>
                      <th>Somme des 20</th>
                      {matrice === 'eau' ? (
                        <>
                          <th>
                            Eau du robinet
                            <br />
                            <span className="pfas-muet">0,1 µg/l</span>
                            <Cite ids={['arrete2007']} />
                          </th>
                          <th>
                            Eaux brutes (ERM)
                            <br />
                            <span className="pfas-muet">2 µg/l</span>
                            <Cite ids={['arrete2007']} />
                          </th>
                        </>
                      ) : (
                        <>
                          <th>
                            PFOS / bruit de fond NL
                            <br />
                            <span className="pfas-muet">1,4 µg/kg MS</span>
                            <Cite ids={['rivm2020']} />
                          </th>
                          <th>
                            PFOA / bruit de fond NL
                            <br />
                            <span className="pfas-muet">1,9 µg/kg MS</span>
                            <Cite ids={['rivm2020']} />
                          </th>
                        </>
                      )}
                      <th>TFA</th>
                      <th>6:2 FTS</th>
                      <th style={{ minWidth: '9rem' }}>Composition</th>
                      <th>Dominant</th>
                      <th>Pistes compatibles</th>
                    </tr>
                  </thead>
                  <tbody>
                    {echantillons.map((e) => {
                      const c = composition(e)
                      const blanc = e.type === 'blanc-terrain' || e.type === 'blanc-transport'
                      const liste = blanc ? [] : pistes(e, matrice)
                      const compatibles = liste.filter((p) => p.verdict === 'compatible')
                      const partielles = liste.filter((p) => p.verdict === 'partiel')
                      return (
                        <tr key={e.nom} className={courant?.nom === e.nom ? 'pfas-ligne--active' : ''}>
                          <td>
                            {blanc ? (
                              e.nom
                            ) : (
                              <button type="button" className="pfas-lien" onClick={() => setChoisi(e.nom)}>
                                {e.nom}
                              </button>
                            )}
                            {e.type !== 'echantillon' && <span className="pfas-type">{LIBELLES_TYPE[e.type]}</span>}
                          </td>
                          <td className="pfas-valeur">
                            {valeurTexte(e.somme, matrice)}
                            {e.sommeCalculee && <span className="pfas-type" title="Le fichier ne donne pas de somme : calculée par l’outil">calculée</span>}
                          </td>
                          {matrice === 'eau' ? (
                            <>
                              <td>
                                <Comparaison v={e.somme} seuil={100} />
                              </td>
                              <td>
                                <Comparaison v={e.somme} seuil={2000} />
                              </td>
                            </>
                          ) : (
                            <>
                              <td>
                                <Comparaison v={e.substances.PFOS ?? null} seuil={1.4} />
                              </td>
                              <td>
                                <Comparaison v={e.substances.PFOA ?? null} seuil={1.9} />
                              </td>
                            </>
                          )}
                          <td className="pfas-valeur">{valeurTexte(e.substances.TFA, matrice)}</td>
                          <td className="pfas-valeur">{valeurTexte(e.substances.FTS62, matrice)}</td>
                          <td>
                            <BarreComposition c={c} />
                          </td>
                          <td className="pfas-valeur">{c.parts[0] ? `${PAR_ID[c.parts[0].id].abreviation} (${Math.round(c.parts[0].part * 100)} %)` : '—'}</td>
                          <td>
                            {blanc ? (
                              <span className="pfas-muet">contrôle qualité</span>
                            ) : compatibles.length ? (
                              compatibles.map((p) => p.court).join(', ')
                            ) : partielles.length ? (
                              <span className="pfas-muet">en partie : {partielles.map((p) => p.court).join(', ')}</span>
                            ) : (
                              <span className="pfas-muet">aucune piste nette</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <LegendeGroupes />
              {matrice === 'sol' && (
                <p className="pfas-note">
                  Pas de valeur réglementaire française pour les PFAS dans les sols : les valeurs de bruit de fond néerlandaises (sols
                  agricoles et naturels non influencés) servent ici d’ordre de grandeur, pas de seuil <Cite ids={['rivm2020']} />.
                </p>
              )}
              {(blancsPollues.length > 0 || ecarts.length > 0) && (
                <div className="pfas-controles">
                  <h3>Contrôles</h3>
                  <ul>
                    {blancsPollues.map((b) => (
                      <li key={b.nom}>
                        <strong>{b.nom}</strong> : PFAS quantifiés dans un blanc (
                        {Object.entries(b.substances)
                          .filter(([, v]) => v && !v.inferieur)
                          .map(([id, v]) => `${PAR_ID[id as keyof typeof PAR_ID].abreviation} ${valeurTexte(v, matrice)}`)
                          .join(', ')}
                        ). Les PFAS sont sujets à la contamination croisée (matériel, vêtements) : interpréter les échantillons du même lot
                        avec prudence <Cite ids={['itrc2026']} />.
                      </li>
                    ))}
                    {ecarts.map(({ e, ecart }) => (
                      <li key={e.nom}>
                        <strong>{e.nom}</strong> : {ecart}. Vérifiez la convention du laboratoire (LQ comptées, liste des composés sommés).
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>

          <section className="section pfas">
            <div className="container">
              <h2 className="etape">
                <span>3</span> Ordres de grandeur
              </h2>
              <p className="pfas-note" style={{ maxWidth: '48rem' }}>
                Échelle logarithmique : chaque graduation multiplie par 10. Les traits pleins sont des valeurs de gestion, les bandes grisées
                des concentrations mesurées dans des études ; les lettres renvoient à la légende sous chaque graphique. Un cercle vide est un
                résultat inférieur à la LQ, placé à la LQ.
              </p>
              {GRANDEURS[matrice].map((g) => (
                <Echelle
                  key={g.grandeur}
                  matrice={matrice}
                  grandeur={g.grandeur}
                  titre={g.titre}
                  aide={g.aide}
                  points={reels.map((e) => ({ nom: e.nom, valeur: g.grandeur === 'somme20' ? e.somme : e.substances[g.grandeur] }))}
                />
              ))}
            </div>
          </section>

          {courant && (
            <section className="section section--muted pfas">
              <div className="container">
                <h2 className="etape">
                  <span>4</span> Lecture détaillée
                </h2>
                <div className="pfas-onglets" role="tablist" aria-label="Échantillon">
                  {reels.map((e) => (
                    <button key={e.nom} type="button" role="tab" aria-selected={courant.nom === e.nom} className={courant.nom === e.nom ? 'actif' : ''} onClick={() => setChoisi(e.nom)}>
                      {e.nom}
                    </button>
                  ))}
                </div>
                <Detail e={courant} matrice={matrice} />
              </div>
            </section>
          )}
        </>
      )}

      <section className="section pfas">
        <div className="container">
          <h2>Références</h2>
          <p className="pfas-note" style={{ maxWidth: '48rem' }}>
            Chaque référence a été vérifiée en ligne (auteurs, revue, DOI ou adresse officielle) en novembre 2026. La mention « source
            secondaire » signale un chiffre repris d’un communiqué, d’une synthèse officielle ou d’un résumé : à confirmer dans le document
            original avant de le citer dans un rapport. Les valeurs de bruit de fond des sols sont néerlandaises, faute de référentiel
            français ; <Auteur id="brusseau2020" /> donne le cadre mondial.
          </p>
          <Bibliographie />
          {pfas && impression && (
            <p style={{ marginTop: '2rem' }}>
              <button type="button" className="btn btn--ghost" onClick={() => window.print()}>
                Imprimer ou enregistrer en PDF
              </button>
            </p>
          )}
        </div>
      </section>
    </>
  )
}

function Detail({ e, matrice }: { e: EchantillonPfas; matrice: Matrice }) {
  const c = useMemo(() => composition(e), [e])
  const liste = useMemo(() => indicateurs(e, matrice), [e, matrice])
  const p = useMemo(() => pistes(e, matrice), [e, matrice])
  const dominant = c.parts[0]

  return (
    <>
      <div className="pfas-chiffres">
        <div>
          <span>Somme des 20</span>
          <strong>{valeurTexte(e.somme, matrice)}</strong>
        </div>
        <div>
          <span>Substances quantifiées</span>
          <strong>
            {c.quantifiees} / {VINGT.length + 1}
          </strong>
          <em>20 PFAS et 6:2 FTS</em>
        </div>
        <div>
          <span>Composé dominant</span>
          <strong>{dominant ? PAR_ID[dominant.id].abreviation : '—'}</strong>
          {dominant && <em>{Math.round(dominant.part * 100)} % des quantifiés</em>}
        </div>
        <div>
          <span>TFA</span>
          <strong>{valeurTexte(e.substances.TFA, matrice)}</strong>
        </div>
      </div>

      <div className="card pfas-bloc">
        <Profil e={e} matrice={matrice} />
        <h4 style={{ marginTop: '1rem' }}>Répartition par groupe</h4>
        <BarreComposition c={c} hauteur={26} etiquettes />
        <LegendeGroupes />
        <details style={{ marginTop: '0.75rem' }}>
          <summary>Tableau des valeurs</summary>
          <table className="tableau" style={{ marginTop: '0.5rem' }}>
            <thead>
              <tr>
                <th>Substance</th>
                <th>Résultat</th>
                <th>Part des quantifiés</th>
              </tr>
            </thead>
            <tbody>
              {[...VINGT, PAR_ID.FTS62, PAR_ID.TFA].map((s) => {
                const v = e.substances[s.id]
                const part = c.parts.find((x) => x.id === s.id)
                return (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.abreviation}</strong> <span className="pfas-muet">{s.nom}</span>
                    </td>
                    <td className="pfas-valeur">{v ? `${v.inferieur ? '< ' : ''}${grandeur(v.valeur, matrice)}` : 'non analysé'}</td>
                    <td>{part ? `${nombre(part.part * 100)} %` : s.id === 'TFA' ? 'hors profil' : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </details>
      </div>

      <h3 style={{ marginTop: '2rem' }}>Indicateurs de composition</h3>
      <p className="pfas-note" style={{ maxWidth: '48rem' }}>
        Calculés sur les seules valeurs quantifiées, en masse. Ils décrivent le profil ; la lecture indique dans quel sens oriente chaque
        valeur, d’après les références citées. « Majoritaire » signifie plus de la moitié : ce n’est pas un seuil de la littérature.
      </p>
      <Indicateurs liste={liste} />

      <BilanFluor e={e} matrice={matrice} />

      <h3 style={{ marginTop: '2rem' }}>Pistes de sources</h3>
      <div className="pfas-avertissement-sources">
        Ces pistes décrivent la compatibilité du profil avec des types de sources documentés ; elles ne désignent pas une source. Le
        traçage repose sur plusieurs lignes de preuve croisées avec l’historique et le schéma conceptuel du site
        <Cite ids={['rodowa2021', 'kibbey2020']} />, à commencer par les sites à contamination présumée du voisinage (ICPE, CASIAS,
        aéroports, casernes, décharges, stations d’épuration) <Cite ids={['salvatore2022', 'cordner2024']} />. En aval d’une source, les
        chaînes courtes s’enrichissent et les précurseurs se transforment : comparez à l’amont et à la zone source
        <Cite ids={['guelfoHiggins2013', 'houtz2013', 'zhang2016']} />.
      </div>
      <Pistes liste={p} />
    </>
  )
}
