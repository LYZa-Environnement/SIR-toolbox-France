import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import type { PdfOuvert } from '../lib/dict/pdfjs'
import { analyserDocument, type Nature, type PageAnalysee } from '../lib/dict/analyse'
import { CATEGORIES, couleurGroupe, libelleCategorie } from '../lib/dict/categories'
import { cleExploitant, clePage, composer, construireLots, type Lot } from '../lib/dict/lots'

interface Fichier {
  nom: string
  octets: Uint8Array
  pages: PageAnalysee[]
}

const NATURES: Record<Nature, string> = { recepisse: 'Récépissé', plan: 'Plan', document: 'Courrier, annexe' }

const fr = (n: number) => n.toLocaleString('fr-FR')
const mo = (octets: number) => `${(octets / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`
const pluriel = (n: number, mot: string) => `${fr(n)} ${mot}${n > 1 ? 's' : ''}`
/** "Concern__X_123.pdf" reads better without the upload's long prefix. */
const nomCourt = (nom: string) => (nom.length > 70 ? `${nom.slice(0, 40)}…${nom.slice(-26)}` : nom)

function Categories({ codes }: { codes: string[] }) {
  if (!codes.length) return <span className="dict-muet">Catégorie non précisée</span>
  return (
    <>
      {codes.map((c) => (
        <span key={c} className={`dict-categorie${CATEGORIES[c]?.sensible ? ' dict-categorie--sensible' : ''}`} title={libelleCategorie(c)}>
          {libelleCategorie(c)}
          {CATEGORIES[c]?.sensible && ' · sensible'}
        </span>
      ))}
    </>
  )
}

export default function PlansDict() {
  const [fichiers, setFichiers] = useState<Fichier[]>([])
  const docs = useRef(new Map<string, PdfOuvert>())
  const fileVignettes = useRef(Promise.resolve())
  const [lecture, setLecture] = useState<{ nom: string; fait: number; total: number } | null>(null)
  const [erreurs, setErreurs] = useState<string[]>([])
  const [survol, setSurvol] = useState(false)
  const [noms, setNoms] = useState<Record<string, string>>({})
  const [choix, setChoix] = useState<Record<string, boolean>>({})
  const [vignettes, setVignettes] = useState<Record<string, string>>({})
  const [sommaire, setSommaire] = useState(true)
  const [nomSortie, setNomSortie] = useState('')
  const [fusion, setFusion] = useState<{ fait: number; total: number } | null>(null)
  const [erreurFusion, setErreurFusion] = useState<string | null>(null)
  const [resultat, setResultat] = useState<{ url: string; nom: string; taille: number; rasterises: string[] } | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (resultat) return () => URL.revokeObjectURL(resultat.url)
  }, [resultat])
  useEffect(() => {
    const ouverts = docs.current
    return () => ouverts.forEach((d) => d.fermer())
  }, [])

  const { lots, doublons } = useMemo(() => construireLots(fichiers), [fichiers])

  const cle = (fichier: number, page: number) => `${fichiers[fichier].nom}#${page}`
  const parDefaut = (fichier: number, page: number) =>
    fichiers[fichier].pages[page].nature === 'plan' && !doublons.has(clePage(fichier, page))
  const retenue = (fichier: number, page: number) => choix[cle(fichier, page)] ?? parDefaut(fichier, page)

  const groupes = useMemo(
    () =>
      composer(fichiers, lots, noms, (f, p) => choix[`${fichiers[f].nom}#${p}`] ?? (fichiers[f].pages[p].nature === 'plan' && !doublons.has(clePage(f, p)))),
    [fichiers, lots, noms, choix, doublons],
  )
  const totalPlans = groupes.reduce((s, g) => s + g.pages.length, 0)
  const couleurDe = (exploitant: string) => {
    const i = groupes.findIndex((g) => cleExploitant(g.exploitant) === cleExploitant(exploitant))
    return couleurGroupe(Math.max(0, i))
  }
  const nomDe = (lot: Lot) => noms[lot.id] ?? lot.exploitant

  // What the receipts say about the declaration itself.
  const recepisses = lots.map((l) => l.recepisse).filter((r) => r !== null)
  const consultations = [...new Set(recepisses.map((r) => r.consultation).filter((c) => c !== null))]
  const commune = recepisses.find((r) => r.commune)?.commune ?? null
  const adresse = recepisses.find((r) => r.adresse)?.adresse ?? null
  const lieu = adresse && commune && adresse.toLowerCase() !== commune.toLowerCase() ? `${adresse}, ${commune}` : (adresse ?? commune)
  const reference = consultations.length ? `DICT n° ${consultations.join(', ')}` : ''
  const nomParDefaut = `Plans DICT${consultations.length === 1 ? ` ${consultations[0]}` : ''}${commune ? ` - ${commune}` : ''}.pdf`
  const propositions = [...new Set(lots.map(nomDe).concat(lots.map((l) => l.exploitant)))].sort((a, b) => a.localeCompare(b, 'fr'))

  function produireVignettes(nom: string, ouvert: PdfOuvert, nbPages: number) {
    fileVignettes.current = fileVignettes.current.then(async () => {
      const { vignette } = await import('../lib/dict/pdfjs')
      for (let p = 0; p < nbPages; p++) {
        if (docs.current.get(nom) !== ouvert) return
        try {
          const url = await vignette(ouvert.doc, p)
          setVignettes((v) => ({ ...v, [`${nom}#${p}`]: url }))
        } catch {
          /* the tile keeps its placeholder */
        }
      }
    })
  }

  async function charger(liste: FileList | null) {
    if (!liste?.length) return
    const tous = [...liste]
    const pdfs = tous.filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf')
    const problemes = tous.filter((f) => !pdfs.includes(f)).map((f) => `« ${f.name} » n'est pas un PDF : il est ignoré.`)
    setResultat(null)
    const { ouvrir } = await import('../lib/dict/pdfjs')
    for (const f of pdfs) {
      if (docs.current.has(f.name)) {
        problemes.push(`« ${f.name} » est déjà chargé.`)
        continue
      }
      const octets = new Uint8Array(await f.arrayBuffer())
      try {
        const ouvert = await ouvrir(octets)
        const total = ouvert.doc.numPages
        setLecture({ nom: f.name, fait: 0, total })
        const pages = await analyserDocument(ouvert.doc, (fait) => setLecture({ nom: f.name, fait, total }))
        docs.current.set(f.name, ouvert)
        setFichiers((avant) => [...avant, { nom: f.name, octets, pages }])
        produireVignettes(f.name, ouvert, pages.length)
      } catch (e) {
        problemes.push(
          (e as Error)?.name === 'PasswordException'
            ? `« ${f.name} » est protégé par un mot de passe : ouvrez-le et enregistrez-en une copie sans protection.`
            : `« ${f.name} » n'a pas pu être lu comme un PDF.`,
        )
      }
    }
    setLecture(null)
    setErreurs(problemes)
  }

  function deposer(e: DragEvent) {
    e.preventDefault()
    setSurvol(false)
    void charger(e.dataTransfer.files)
  }

  function retirer(nom: string) {
    docs.current.get(nom)?.fermer()
    docs.current.delete(nom)
    setFichiers((avant) => avant.filter((f) => f.nom !== nom))
    setResultat(null)
  }

  function toutRetirer() {
    docs.current.forEach((d) => d.fermer())
    docs.current.clear()
    setFichiers([])
    setNoms({})
    setChoix({})
    setVignettes({})
    setErreurs([])
    setResultat(null)
  }

  function choisirPages(lot: Lot, mode: 'tout' | 'rien' | 'proposition') {
    setChoix((c) => {
      const n = { ...c }
      for (const p of lot.pages) {
        if (mode === 'proposition') delete n[cle(lot.fichier, p)]
        else n[cle(lot.fichier, p)] = mode === 'tout'
      }
      return n
    })
    setResultat(null)
  }

  async function fusionner() {
    setErreurFusion(null)
    setResultat(null)
    setFusion({ fait: 0, total: totalPlans })
    try {
      const [{ fusionner: assembler }, { rasteriser }] = await Promise.all([import('../lib/dict/fusion'), import('../lib/dict/pdfjs')])
      const details = [
        reference,
        lieu ? `Travaux : ${lieu}` : '',
        `${pluriel(groupes.filter((g) => g.pages.length).length, 'exploitant')} · ${pluriel(totalPlans, 'plan')} · établi le ${new Date().toLocaleDateString('fr-FR')}`,
      ].filter(Boolean)
      const { octets, rasterises } = await assembler(
        fichiers.map((f) => f.octets),
        groupes,
        {
          sommaire,
          titre: 'Plans des exploitants de réseaux',
          details,
          reference,
          rasteriser: (f, p) => rasteriser(docs.current.get(fichiers[f].nom)!.doc, p),
          progression: (fait, total) => setFusion({ fait, total }),
        },
      )
      let nom = (nomSortie.trim() || nomParDefaut).replace(/[\\/:*?"<>|]+/g, '-')
      if (!/\.pdf$/i.test(nom)) nom += '.pdf'
      const url = URL.createObjectURL(new Blob([octets as BlobPart], { type: 'application/pdf' }))
      setResultat({ url, nom, taille: octets.length, rasterises: rasterises.map((f) => fichiers[f].nom) })
      const a = document.createElement('a')
      a.href = url
      a.download = nom
      a.click()
    } catch (e) {
      console.error(e)
      setErreurFusion("La fusion a échoué. Retirez le dernier fichier ajouté pour voir s'il en est la cause, et transmettez-le pour analyse.")
    } finally {
      setFusion(null)
    }
  }

  const lotsParFichier = (fi: number) => lots.filter((l) => l.fichier === fi)

  return (
    <>
      <section className="section">
        <div className="container">
          <p className="eyebrow">Réponses aux DT / DICT</p>
          <h1 style={{ maxWidth: '24ch' }}>Fusion des plans des exploitants</h1>
          <p className="lede">
            Déposez les PDF reçus des exploitants de réseaux : l'exploitant est lu dans chaque récépissé, les plans sont repérés et
            rassemblés dans un seul PDF, chaque plan portant en bandeau le nom de son exploitant et la catégorie du réseau.
          </p>

          <h2 className="etape">
            <span>1</span> Réponses des exploitants
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
              accept=".pdf,application/pdf"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                void charger(e.target.files)
                e.target.value = ''
              }}
            />
            <p style={{ margin: 0, fontWeight: 600 }}>
              {lecture ? `Lecture de « ${nomCourt(lecture.nom)} » — page ${lecture.fait} / ${lecture.total}` : 'Déposez ici les PDF des exploitants'}
            </p>
            <p style={{ margin: '0.25rem 0 0.9rem', fontSize: '0.88rem', color: 'var(--color-muted)' }}>
              Récépissés et plans joints, en une ou plusieurs fois (Sogelink, DICT.fr, réponses directes…). Les fichiers sont lus dans
              votre navigateur et ne sont envoyés nulle part.
            </p>
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn" onClick={() => input.current?.click()} disabled={!!lecture}>
                {fichiers.length ? 'Ajouter des fichiers' : 'Choisir les fichiers'}
              </button>
              {fichiers.length > 0 && (
                <button type="button" className="btn btn--ghost" onClick={toutRetirer} disabled={!!lecture}>
                  Tout retirer
                </button>
              )}
            </div>
          </div>
          {erreurs.length > 0 && (
            <div role="alert" className="alerte">
              {erreurs.map((e) => (
                <p key={e} style={{ margin: 0 }}>
                  {e}
                </p>
              ))}
            </div>
          )}
        </div>
      </section>

      {fichiers.length > 0 && (
        <section className="section section--muted">
          <div className="container">
            <h2 className="etape">
              <span>2</span> Exploitants et pages retenues
            </h2>
            <p className="lede" style={{ marginBottom: '1.25rem' }}>
              Les plans sont cochés d'office ; récépissés, courriers et plans reçus en double ne le sont pas. Cliquez sur une page pour
              la retenir ou l'écarter, et corrigez le nom de l'exploitant si besoin : deux réponses portant le même nom sont regroupées.
            </p>
            <datalist id="dict-exploitants">
              {propositions.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>

            {fichiers.map((f, fi) =>
              lotsParFichier(fi).map((lot, k, tousLots) => {
                const nb = lot.pages.filter((p) => retenue(fi, p)).length
                const r = lot.recepisse
                const premiere = lot.pages[0] + 1
                const derniere = lot.pages[lot.pages.length - 1] + 1
                return (
                  <article key={lot.id} className="card dict-lot" style={{ borderLeftColor: couleurDe(nomDe(lot)) }}>
                    <div className="dict-lot__tete">
                      <div style={{ minWidth: 0 }}>
                        <p className="dict-lot__fichier" title={f.nom}>
                          {nomCourt(f.nom)}
                          {tousLots.length > 1 && ` — réponse ${k + 1} (p. ${premiere}–${derniere})`}
                        </p>
                        <label className="champ dict-lot__nom">
                          Exploitant
                          <input
                            list="dict-exploitants"
                            value={nomDe(lot)}
                            onChange={(e) => {
                              setNoms((n) => ({ ...n, [lot.id]: e.target.value }))
                              setResultat(null)
                            }}
                          />
                        </label>
                        <p className={`dict-lot__origine${lot.origine.type === 'fichier' ? ' dict-lot__origine--doute' : ''}`}>
                          {lot.origine.type === 'recepisse' && <>Lu dans le récépissé{r?.contact ? ` · contact : ${r.contact}` : ''}</>}
                          {lot.origine.type === 'rattache' &&
                            (() => {
                              const origine = lot.origine
                              const source = lots.find((l) => l.id === origine.lot)
                              return (
                                <>
                                  Pas de récépissé dans ce fichier : rattaché à celui de « {source ? nomCourt(fichiers[source.fichier].nom) : '?'} »
                                  ({origine.motif === 'plans identiques' ? 'mêmes plans' : 'même envoi'}).
                                </>
                              )
                            })()}
                          {lot.origine.type === 'fichier' && <>Pas de récépissé : nom déduit du nom du fichier, à vérifier.</>}
                        </p>
                      </div>
                      <div className="dict-lot__resume">
                        <div className="dict-lot__categories">
                          <Categories codes={lot.categories} />
                        </div>
                        {r?.concerne === false && <span className="dict-muet">Réseaux non concernés</span>}
                        <strong>
                          {fr(nb)} page{nb > 1 ? 's' : ''} retenue{nb > 1 ? 's' : ''} sur {fr(lot.pages.length)}
                        </strong>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <button type="button" className="btn btn--petit btn--ghost" onClick={() => choisirPages(lot, 'proposition')}>
                            Plans seuls
                          </button>
                          <button type="button" className="btn btn--petit btn--ghost" onClick={() => choisirPages(lot, 'tout')}>
                            Tout
                          </button>
                          <button type="button" className="btn btn--petit btn--ghost" onClick={() => choisirPages(lot, 'rien')}>
                            Rien
                          </button>
                          {k === 0 && (
                            <button type="button" className="btn btn--petit btn--ghost" onClick={() => retirer(f.nom)}>
                              Retirer le fichier
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="dict-pages">
                      {lot.pages.map((p) => {
                        const page = f.pages[p]
                        const oui = retenue(fi, p)
                        const doublon = doublons.get(clePage(fi, p))
                        const url = vignettes[cle(fi, p)]
                        return (
                          <label key={p} className={`dict-page${oui ? ' dict-page--retenue' : ''}`}>
                            <input
                              type="checkbox"
                              checked={oui}
                              onChange={(e) => {
                                setChoix((c) => ({ ...c, [cle(fi, p)]: e.target.checked }))
                                setResultat(null)
                              }}
                            />
                            {url ? <img src={url} alt={`Page ${p + 1}`} /> : <span className="dict-page__attente">Aperçu…</span>}
                            <span className="dict-page__legende">
                              <strong>p. {p + 1}</strong> · {NATURES[page.nature]}
                              {page.folio && ` · folio ${page.folio}`}
                            </span>
                            {doublon && (
                              <span className="dict-page__doublon">
                                Déjà dans « {nomCourt(fichiers[doublon.fichier].nom)} », p. {doublon.page + 1}
                              </span>
                            )}
                          </label>
                        )
                      })}
                    </div>
                  </article>
                )
              }),
            )}
          </div>
        </section>
      )}

      {fichiers.length > 0 && (
        <section className="section">
          <div className="container">
            <h2 className="etape">
              <span>3</span> PDF fusionné
            </h2>
            <div className="tableau-defile" style={{ maxWidth: '52rem' }}>
              <table className="tableau">
                <thead>
                  <tr>
                    <th>Exploitant</th>
                    <th>Catégories</th>
                    <th style={{ textAlign: 'right' }}>Plans</th>
                  </tr>
                </thead>
                <tbody>
                  {groupes.map((g, i) => (
                    <tr key={g.exploitant}>
                      <th>
                        <span className="dict-pastille" style={{ background: couleurGroupe(i) }} />
                        {g.exploitant}
                      </th>
                      <td>{g.categories.length ? g.categories.join(', ') : '—'}</td>
                      <td style={{ textAlign: 'right' }}>{g.pages.length || (g.concerne === false ? 'non concerné' : '0')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid--4" style={{ margin: '1.5rem 0 1rem', alignItems: 'end' }}>
              <label className="champ" style={{ gridColumn: 'span 2' }}>
                Nom du fichier
                <input value={nomSortie} placeholder={nomParDefaut} onChange={(e) => setNomSortie(e.target.value)} />
              </label>
              <label className="dict-option">
                <input type="checkbox" checked={sommaire} onChange={(e) => setSommaire(e.target.checked)} />
                Page de sommaire en tête
              </label>
            </div>
            <p style={{ fontSize: '0.88rem', color: 'var(--color-muted)', maxWidth: '52rem' }}>
              Un bandeau est ajouté au-dessus de chaque plan, sans rien en masquer : exploitant, catégorie du réseau, numéro de plan et
              {reference ? ` ${reference},` : ''} page dans le document. Le PDF comporte aussi des signets par exploitant
              {sommaire ? ', et le sommaire renvoie à la première page de chacun' : ''}.
            </p>
            <button type="button" className="btn" onClick={() => void fusionner()} disabled={!!fusion || !!lecture || totalPlans === 0}>
              {fusion ? `Fusion… plan ${fusion.fait} / ${fusion.total}` : `Fusionner ${pluriel(totalPlans, 'plan')}`}
            </button>
            {totalPlans === 0 && <p className="dict-muet" style={{ marginTop: '0.5rem' }}>Aucune page retenue.</p>}
            {erreurFusion && (
              <p role="alert" className="alerte">
                {erreurFusion}
              </p>
            )}
            {resultat && (
              <div className="card" style={{ marginTop: '1.25rem', maxWidth: '40rem' }}>
                <strong>{resultat.nom}</strong>
                <p style={{ margin: '0.35rem 0 0.75rem', fontSize: '0.9rem', color: 'var(--color-muted)' }}>
                  {mo(resultat.taille)} · le téléchargement a démarré.
                </p>
                {resultat.rasterises.length > 0 && (
                  <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
                    Fichier{resultat.rasterises.length > 1 ? 's' : ''} protégé{resultat.rasterises.length > 1 ? 's' : ''} contre la copie,
                    repris en image à 200 dpi : {resultat.rasterises.map((n) => `« ${nomCourt(n)} »`).join(', ')}.
                  </p>
                )}
                <a className="btn btn--petit" href={resultat.url} download={resultat.nom}>
                  Télécharger à nouveau
                </a>
              </div>
            )}
          </div>
        </section>
      )}
    </>
  )
}
