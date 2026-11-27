import { useMemo, useState } from 'react'
import { useSynchroDossier } from '../lib/dossier/useSynchroDossier'
import { GROUPE_MARQUE, nonConforme, portee, preparer, verifier, type Decision, type Portee, type Resultat, type Statut } from '../lib/livrables/controles'
import { lireDocument, type Document } from '../lib/livrables/extraction'
import { lireFaits } from '../lib/livrables/faits'
import { proposer } from '../lib/livrables/propositions'
import { categories, PAR_ID } from '../lib/livrables/referentiels'
import { lireSections } from '../lib/livrables/structure'
import type { Point, Source } from '../lib/livrables/controles'
import ZoneDepot from '../components/ZoneDepot'
import { jourIso } from '../lib/format'

/** A source as a link, or as plain text when it has no public page (the standard). */
function LienSource({ s }: { s: Source }) {
  return s.url ? (
    <a href={s.url} target="_blank" rel="noreferrer">
      {s.libelle}
    </a>
  ) : (
    <span>{s.libelle}</span>
  )
}

const LIBELLES: Record<Statut, string> = {
  present: 'Trouvé',
  absent: 'Absent',
  invalide: 'À corriger',
  'a-verifier': 'À vérifier',
  'sans-objet': 'Sans objet',
}

const BADGE: Record<Statut, string> = {
  present: 'badge badge--faible',
  absent: 'badge badge--elevee',
  invalide: 'badge badge--elevee',
  'a-verifier': 'badge badge--moderee',
  'sans-objet': 'badge badge--indeterminee',
}

/** A gap to a requirement in red, to a good practice in amber, to the use
 *  of the LNE mark in grey: the same colours on the card, its tag and badge. */
const PORTEES: Record<Portee, { libelle: string; nc: string; ncs: string; badge: string; aide: string }> = {
  exigence: {
    libelle: 'Exigence',
    nc: 'exigence non satisfaite',
    ncs: 'exigences non satisfaites',
    badge: 'badge badge--elevee',
    aide: 'Exigé par un texte réglementaire ou par la norme : la non-conformité est à corriger avant diffusion.',
  },
  'bonne-pratique': {
    libelle: 'Bonne pratique',
    nc: 'bonne pratique non suivie',
    ncs: 'bonnes pratiques non suivies',
    badge: 'badge badge--moderee',
    aide: 'Attendu par la norme selon le cas, ou bonne pratique : à compléter, ou à justifier si le point ne s’applique pas.',
  },
  marque: {
    libelle: 'Marque LNE SSP',
    nc: 'point sur l’usage de la marque LNE SSP',
    ncs: 'points sur l’usage de la marque LNE SSP',
    badge: 'badge badge--indeterminee',
    aide: 'Usage de la marque de certification LNE SSP : moins critique, regroupé à part.',
  },
}

/** The badge of a status: a gap takes the colour of what it fails. */
const badge = (s: Statut, po: Portee) => (nonConforme(s) ? PORTEES[po].badge : BADGE[s])

const DECISIONS: { v: Decision; l: string }[] = [
  { v: '', l: '— selon l’outil —' },
  { v: 'conforme', l: 'Conforme' },
  { v: 'non-conforme', l: 'Non conforme' },
  { v: 'sans-objet', l: 'Sans objet' },
]

export default function VerificationLivrables() {
  const [typeId, setTypeId] = useState<string | null>(null)
  /** The deliverable's documents: one, or several read as one dossier. */
  const [docs, setDocs] = useState<Document[]>([])
  const [texteColle, setTexteColle] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [chargement, setChargement] = useState(false)
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [commentaires, setCommentaires] = useState<Record<string, string>>({})
  const [filtre, setFiltre] = useState<'tous' | 'problemes'>('tous')
  /** Only the gaps of one weight (a click on its count), or all points. */
  const [niveau, setNiveau] = useState<Portee | null>(null)
  /** Points by section of the checklist, or gaps by weight. */
  const [vue, setVue] = useState<'rubrique' | 'niveau'>('rubrique')
  const [export_, setExport] = useState(false)
  /** Deliverable families unfolded by the viewer: all folded at first. */
  const [ouvertes, setOuvertes] = useState<Set<string>>(new Set())

  const referentiel = (typeId && PAR_ID.get(typeId)) || null
  /** General requirements of the standard added to the checklist. */
  const [avecComplements, setAvecComplements] = useState(true)

  // Kept in the open dossier: the deliverable's text, the checklist and the reviewer's decisions.
  const sauve = useMemo(
    () => ({ typeId, docs, texteColle, decisions, commentaires, avecComplements }),
    [typeId, docs, texteColle, decisions, commentaires, avecComplements],
  )
  useSynchroDossier({
    outil: 'verification-livrables',
    version: 1,
    etat: sauve,
    estVide: typeId === null && docs.length === 0 && !texteColle.trim(),
    appliquer: (d) => {
      setTypeId(d.typeId)
      setDocs(d.docs)
      setTexteColle(d.texteColle)
      setDecisions(d.decisions)
      setCommentaires(d.commentaires)
      setAvecComplements(d.avecComplements)
      setErreur(null)
    },
  })
  const complements = useMemo(() => (referentiel?.complements ?? []).map((id) => PAR_ID.get(id)).filter((r) => !!r), [referentiel])
  const points: Point[] = useMemo(() => {
    if (!referentiel) return []
    const ajoutes = avecComplements
      ? complements.flatMap((c) => c!.points.map((p) => ({ ...p, id: `${c!.id}:${p.id}`, groupe: `${c!.court ?? c!.titre} — ${p.groupe}` })))
      : []
    return [...referentiel.points, ...ajoutes]
  }, [referentiel, complements, avecComplements])
  const limites = useMemo(
    () => [...new Set([...(referentiel?.limites ?? []), ...(avecComplements ? complements.flatMap((c) => c!.limites) : [])])],
    [referentiel, complements, avecComplements],
  )

  /** Files are added to the deliverable's documents, not in place of them. */
  async function charger(fichiers: FileList | File[] | undefined | null) {
    const liste = [...(fichiers ?? [])]
    if (!liste.length) return
    setChargement(true)
    setErreur(null)
    const lus: Document[] = []
    const erreurs: string[] = []
    for (const f of liste) {
      try {
        lus.push(await lireDocument(f))
      } catch (e) {
        erreurs.push(`${f.name} : ${e instanceof Error ? e.message : 'lecture impossible.'}`)
      }
    }
    setDocs((d) => [...d.filter((x) => !lus.some((l) => l.nom === x.nom)), ...lus])
    if (lus.length) setTexteColle('')
    if (erreurs.length) setErreur(erreurs.join(' '))
    setChargement(false)
  }

  const livrables: Document[] = useMemo(
    () => (docs.length ? docs : texteColle.trim() ? [{ nom: 'Texte collé', pages: [texteColle], pagesSansTexte: 0 }] : []),
    [docs, texteColle],
  )
  const texte = useMemo(() => (livrables.length ? preparer(livrables) : null), [livrables])
  /** Which expected document each file looks like, from its name and first pages. */
  const pieces = useMemo(() => {
    if (!referentiel?.pieces || !livrables.length) return []
    const plier = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    return referentiel.pieces.map((p) => ({
      ...p,
      documents: livrables.filter((d) => p.motif.test(plier(`${d.nom} ${d.pages.slice(0, 2).join(' ')}`))).map((d) => d.nom),
    }))
  }, [referentiel, livrables])
  const livrable = livrables.length ? livrables[0] : null

  /** What to add for each point, with the document's own facts and headings. */
  const propositions = useMemo(() => {
    if (!referentiel || !texte) return new Map()
    const ctx = { faits: lireFaits(texte), sections: lireSections(texte), referentiel }
    return new Map(points.map((p) => [p.id, proposer(p, ctx)]))
  }, [referentiel, points, texte])
  const verdicts = useMemo(() => (texte ? new Map(points.map((p) => [p.id, verifier(p, texte)])) : new Map()), [points, texte])

  const resultats: Resultat[] = useMemo(() => {
    if (!referentiel || !texte) return []
    return points.map((point) => ({
      point,
      verdict: verdicts.get(point.id)!,
      decision: decisions[point.id] ?? '',
      commentaire: commentaires[point.id] ?? '',
      proposition: propositions.get(point.id),
    }))
  }, [referentiel, points, texte, verdicts, decisions, commentaires, propositions])

  /** The status shown: the reader's decision when given. */
  const effectif = (r: Resultat): Statut =>
    r.decision === 'conforme' ? 'present' : r.decision === 'non-conforme' ? 'invalide' : r.decision === 'sans-objet' ? 'sans-objet' : r.verdict.statut
  const comptes = resultats.reduce<Record<Statut, number>>(
    (c, r) => ({ ...c, [effectif(r)]: c[effectif(r)] + 1 }),
    { present: 0, absent: 0, invalide: 0, 'a-verifier': 0, 'sans-objet': 0 },
  )
  /** The points on the LNE mark are gathered in one group, shown last. */
  const groupeDe = (r: Resultat) => (portee(r.point) === 'marque' ? GROUPE_MARQUE : r.point.groupe)
  const groupes = [...new Set(resultats.map(groupeDe))].sort((a, b) => Number(a === GROUPE_MARQUE) - Number(b === GROUPE_MARQUE))
  const retenu = (r: Resultat) =>
    (filtre === 'tous' || ['absent', 'invalide', 'a-verifier'].includes(effectif(r))) && (!niveau || (portee(r.point) === niveau && nonConforme(effectif(r))))
  const visibles = (g: string) => resultats.filter((r) => groupeDe(r) === g && retenu(r))
  const ecartsDe = (rs: Resultat[], po: Portee) => rs.filter((r) => portee(r.point) === po && nonConforme(effectif(r))).length
  const ecarts = (po: Portee) => ecartsDe(resultats, po)
  const seulementMarque = resultats.length > 0 && resultats.every((r) => portee(r.point) === 'marque')
  const carte = (r: Resultat, rubrique?: string) => (
    <PointControle
      key={r.point.id}
      r={r}
      rubrique={rubrique}
      statut={effectif(r)}
      onDecision={(d) => setDecisions({ ...decisions, [r.point.id]: d })}
      onCommentaire={(c) => setCommentaires({ ...commentaires, [r.point.id]: c })}
    />
  )
  /** The block of the LNE mark, folded: the least critical. */
  const blocMarque = (rs: Resultat[], rubriques: boolean) => {
    const n = rs.filter((r) => nonConforme(effectif(r))).length
    return (
      <details key={GROUPE_MARQUE} className="groupe-marque" open={seulementMarque || niveau === 'marque'}>
        <summary>
          <span className="groupe-marque__titre">{GROUPE_MARQUE}</span>
          <span className="groupe-marque__compte">
            {rs.length} point{rs.length > 1 ? 's' : ''}
            {n > 0 ? ` · ${n} à traiter` : ''} · moins critique
          </span>
        </summary>
        <p className="groupe-marque__aide">
          Apposition de la marque, domaine certifié, périmètre et prestations hors certification : points du référentiel LNE SSP regroupés
          ici, à traiter après les exigences et les bonnes pratiques du livrable.
        </p>
        {rs.map((r) => carte(r, rubriques ? r.point.groupe : undefined))}
      </details>
    )
  }

  async function exporter() {
    if (!referentiel || !livrable) return
    setExport(true)
    try {
      const { telechargerVerification } = await import('../lib/livrables/export')
      const date = jourIso()
      const nom = livrables.length > 1 ? `${livrables.length} documents` : livrable.nom.replace(/\.[^.]+$/, '')
      await telechargerVerification({ referentiel: { ...referentiel, limites }, documents: livrables, resultats, statut: effectif }, `Vérification ${referentiel.titre} - ${nom} - ${date}.xlsx`)
    } finally {
      setExport(false)
    }
  }

  return (
    <>
      <section className="section">
        <div className="container">
          <p className="eyebrow">Sites et sols pollués</p>
          <h1 style={{ maxWidth: '24ch' }}>Vérification de livrables réglementés</h1>
          <p className="lede">
            Contrôlez un livrable avant diffusion — attestation ATTES, déclaration IOTA, rapport d’étude ou de travaux, offre — au regard
            des textes, de la norme NF X31-620 et du référentiel de certification LNE SSP : chaque exigence est recherchée dans le
            document, avec sa source, et l’outil indique où trouver l’information manquante ou comment corriger. Le document est lu dans
            votre navigateur et n’est envoyé nulle part.
          </p>

          <h2 className="etape">
            <span>1</span> Type de livrable
          </h2>
          {categories().map(([cat, rs], i) => {
            const ouverte = ouvertes.has(cat)
            const choisi = rs.find((r) => r.id === typeId)
            const id = `livrables-${i}`
            return (
            <section key={cat} className={`categorie categorie--compacte livrable--${i % 6}`} aria-labelledby={`${id}-titre`}>
              <header className="categorie__entete">
                <button
                  type="button"
                  className="categorie__bascule"
                  aria-expanded={ouverte}
                  aria-controls={id}
                  onClick={() =>
                    setOuvertes((o) => {
                      const suite = new Set(o)
                      if (suite.has(cat)) suite.delete(cat)
                      else suite.add(cat)
                      return suite
                    })
                  }
                >
                  <span className="categorie__etape">
                    {rs.length} type{rs.length > 1 ? 's' : ''} de livrable
                  </span>
                  <h3 id={`${id}-titre`} className="categorie__titre">
                    {cat}
                  </h3>
                  <span className="categorie__chevron" aria-hidden="true">
                    {ouverte ? '▾' : '▸'}
                  </span>
                </button>
                {!ouverte && (
                  <p className="categorie__texte">
                    {choisi ? (
                      <span className="categorie__replie">Sélectionné : {choisi.titre}</span>
                    ) : (
                      rs.map((r) => r.titre.split(' — ')[0]).join(' · ')
                    )}
                  </p>
                )}
              </header>
              <div id={id} className="grid grid--3 choix" role="radiogroup" aria-label={cat} hidden={!ouverte}>
                {rs.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    role="radio"
                    aria-checked={typeId === r.id}
                    className={`card choix__option${typeId === r.id ? ' choix__option--actif' : ''}`}
                    onClick={() => {
                      setTypeId(r.id)
                      setDecisions({})
                      setCommentaires({})
                    }}
                  >
                    <strong>{r.titre}</strong>
                    {r.accroche !== r.titre && <span style={{ fontWeight: 600 }}>{r.accroche}</span>}
                    <span>{r.description}</span>
                  </button>
                ))}
              </div>
            </section>
            )
          })}

          {referentiel && (
            <>
              <p style={{ fontSize: '0.88rem', margin: '1rem 0 0' }}>
                <strong>Textes de référence :</strong>{' '}
                {referentiel.cadre.map((s, i) => (
                  <span key={s.libelle}>
                    {i > 0 && ' · '}
                    <LienSource s={s} />
                  </span>
                ))}
              </p>
              {complements.length > 0 && (
                <label style={{ display: 'block', fontSize: '0.88rem', marginTop: '0.5rem' }}>
                  <input type="checkbox" checked={avecComplements} onChange={(e) => setAvecComplements(e.target.checked)} /> Ajouter{' '}
                  {complements.map((c) => c!.titre).join(' et ')}
                </label>
              )}

              <h2 className="etape">
                <span>2</span> Document{referentiel.pieces ? 's' : ''} à vérifier
              </h2>
              <ZoneDepot
                titre={docs.length ? 'Ajoutez un autre document du livrable' : 'Déposez ici le livrable'}
                aide={
                  <>
                    PDF (avec texte, non scanné), Word (.docx) ou texte ; un livrable en plusieurs documents se dépose en plusieurs fichiers,
                    vérifiés ensemble{referentiel.pieces ? ` (ici : ${referentiel.pieces.map((p) => p.libelle.toLowerCase()).join(', ')})` : ''}.
                  </>
                }
                chargement={chargement}
                libelleChargement="Lecture…"
                accept=".pdf,.docx,.txt"
                multiple
                onFichiers={(fs) => void charger(fs)}
                actions={(choisir) => (
                  <button type="button" className="btn" onClick={choisir} disabled={chargement}>
                    {docs.length ? 'Ajouter un document' : 'Choisir un ou plusieurs fichiers'}
                  </button>
                )}
              />
              {erreur && (
                <p role="alert" className="alerte">
                  {erreur}
                </p>
              )}
              {!docs.length && (
                <label className="champ" style={{ marginTop: '1rem' }}>
                  Ou collez le texte du livrable
                  <textarea value={texteColle} onChange={(e) => setTexteColle(e.target.value)} placeholder="Texte de l’attestation ou du dossier…" />
                </label>
              )}
              {docs.length > 0 && (
                <div className="card" style={{ marginTop: '1rem', maxWidth: '44rem' }}>
                  <strong>{docs.length > 1 ? `${docs.length} documents vérifiés ensemble` : docs[0].nom}</strong>
                  <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem', fontSize: '0.9rem' }}>
                    {docs.map((d) => (
                      <li key={d.nom} style={{ marginBottom: '0.3rem' }}>
                        {docs.length > 1 && <>{d.nom} </>}
                        <span style={{ color: 'var(--color-muted)' }}>
                          {d.pages.length} page{d.pages.length > 1 ? 's' : ''} · {d.pages.join(' ').split(/\s+/).filter(Boolean).length} mots lus
                        </span>{' '}
                        <button type="button" className="btn btn--ghost btn--petit" onClick={() => setDocs((x) => x.filter((y) => y.nom !== d.nom))}>
                          Retirer
                        </button>
                        {d.pagesSansTexte > 0 && (
                          <div className="alerte" style={{ margin: '0.4rem 0 0' }}>
                            {d.pagesSansTexte} page{d.pagesSansTexte > 1 ? 's' : ''} sans texte lisible : document scanné ? Les informations qui y
                            figurent ne peuvent pas être recherchées (passer le PDF à la reconnaissance de caractères, OCR).
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                  {pieces.length > 0 && (
                    <p style={{ margin: '0.5rem 0 0', fontSize: '0.88rem' }}>
                      <strong>Pièces du dossier :</strong>{' '}
                      {pieces.map((p, i) => (
                        <span key={p.libelle}>
                          {i > 0 && ' · '}
                          {p.libelle} :{' '}
                          {p.documents.length ? (
                            <span style={{ color: 'var(--level-faible)' }}>{p.documents.join(', ')}</span>
                          ) : (
                            <span style={{ color: 'var(--level-elevee)' }}>non reconnue</span>
                          )}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {referentiel && livrables.length > 0 && (
        <section className="section section--muted">
          <div className="container">
            <h2 className="etape">
              <span>3</span> Points de contrôle
            </h2>
            <div className="nc-synthese">
              {(['exigence', 'bonne-pratique', 'marque'] as Portee[]).map((po) => (
                <button
                  key={po}
                  type="button"
                  aria-pressed={niveau === po}
                  className={`nc-synthese__case nc-synthese__case--${po}${niveau === po ? ' nc-synthese__case--actif' : ''}`}
                  title={`${PORTEES[po].aide} Cliquer pour n’afficher que ces non-conformités.`}
                  onClick={() => setNiveau(niveau === po ? null : po)}
                >
                  <strong>{ecarts(po)}</strong>
                  <span>{ecarts(po) > 1 ? PORTEES[po].ncs : PORTEES[po].nc}</span>
                </button>
              ))}
            </div>
            <div className="nc-matrice__cadre">
              <table className="nc-matrice">
                <thead>
                  <tr>
                    <th scope="col">Statut</th>
                    {(['exigence', 'bonne-pratique', 'marque'] as Portee[]).map((po) => (
                      <th key={po} scope="col">
                        <span className={`niveau niveau--${po}`}>{PORTEES[po].libelle}</span>
                      </th>
                    ))}
                    <th scope="col">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(['invalide', 'absent', 'a-verifier', 'present', 'sans-objet'] as Statut[]).map((s) => (
                    <tr key={s}>
                      <th scope="row">
                        <span className={BADGE[s]}>{LIBELLES[s]}</span>
                      </th>
                      {(['exigence', 'bonne-pratique', 'marque'] as Portee[]).map((po) => {
                        const n = resultats.filter((r) => portee(r.point) === po && effectif(r) === s).length
                        return (
                          <td key={po} className={n && nonConforme(s) ? `nc-matrice__nc nc-matrice__nc--${po}` : undefined}>
                            {n || '–'}
                          </td>
                        )
                      })}
                      <td>{comptes[s] || '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: '0.6rem 1.2rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div className="bascule-vue" role="radiogroup" aria-label="Présentation des points">
                {(
                  [
                    ['rubrique', 'Par rubrique'],
                    ['niveau', 'Non-conformités par niveau'],
                  ] as const
                ).map(([v, l]) => (
                  <button key={v} type="button" role="radio" aria-checked={vue === v} className={vue === v ? 'actif' : undefined} onClick={() => setVue(v)}>
                    {l}
                  </button>
                ))}
              </div>
              {niveau && (
                <button type="button" className="btn btn--ghost btn--petit" onClick={() => setNiveau(null)}>
                  Afficher tous les niveaux
                </button>
              )}
              {vue === 'rubrique' && (
                <label style={{ fontSize: '0.88rem', marginLeft: 'auto' }}>
                  <input type="checkbox" checked={filtre === 'problemes'} onChange={(e) => setFiltre(e.target.checked ? 'problemes' : 'tous')} /> Afficher
                  seulement les points à traiter
                </label>
              )}
            </div>
            <ul className="nc-legende" aria-label="Légende">
              {(['exigence', 'bonne-pratique', 'marque'] as Portee[]).map((po) => (
                <li key={po}>
                  <span className={`niveau niveau--${po}`}>{PORTEES[po].libelle}</span> {PORTEES[po].aide}
                </li>
              ))}
            </ul>
            <ul style={{ fontSize: '0.85rem', color: 'var(--color-muted)', margin: '0 0 1.25rem', paddingLeft: '1.1rem' }}>
              {limites.map((l) => (
                <li key={l}>{l}</li>
              ))}
              <li>
                Pour chaque point absent ou à corriger, une proposition d’ajout indique le paragraphe du document où l’insérer et une phrase
                d’exemple reprenant les éléments lus dans le document (site, commune, client, milieux, substances, ouvrages…) ; les passages{' '}
                <mark className="a-completer">[entre crochets]</mark> sont à compléter.
              </li>
            </ul>

            {vue === 'rubrique' &&
              groupes.map((g) => {
                const rs = visibles(g)
                if (!rs.length) return null
                if (g === GROUPE_MARQUE) return blocMarque(rs, false)
                const tous = resultats.filter((r) => groupeDe(r) === g)
                return (
                  <div key={g} style={{ marginBottom: '1.5rem' }}>
                    <h3 className="groupe-titre">
                      {g}
                      {(['exigence', 'bonne-pratique'] as Portee[]).map((po) => {
                        const n = ecartsDe(tous, po)
                        return n ? (
                          <span key={po} className={`niveau niveau--${po}`} title={PORTEES[po].aide}>
                            {n} {n > 1 ? PORTEES[po].ncs : PORTEES[po].nc}
                          </span>
                        ) : null
                      })}
                    </h3>
                    {rs.map((r) => carte(r))}
                  </div>
                )
              })}

            {vue === 'niveau' &&
              (['exigence', 'bonne-pratique', 'marque'] as Portee[])
                .filter((po) => !niveau || niveau === po)
                .map((po) => {
                  const rs = resultats.filter((r) => portee(r.point) === po && nonConforme(effectif(r)))
                  if (po === 'marque') return rs.length ? blocMarque(rs, true) : null
                  return (
                    <div key={po} className={`bloc-niveau bloc-niveau--${po}`}>
                      <h3 className="bloc-niveau__titre">
                        <span className={`niveau niveau--${po}`}>{PORTEES[po].libelle}</span> {rs.length}{' '}
                        {rs.length > 1 ? PORTEES[po].ncs : PORTEES[po].nc}
                      </h3>
                      {rs.length ? rs.map((r) => carte(r, r.point.groupe)) : <p className="bloc-niveau__vide">Aucune.</p>}
                    </div>
                  )
                })}
            {vue === 'niveau' && (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)' }}>
                Les points à vérifier à la lecture, trouvés ou sans objet figurent dans la présentation par rubrique.
              </p>
            )}

            <button type="button" className="btn" onClick={() => void exporter()} disabled={export_}>
              {export_ ? 'Préparation…' : 'Télécharger le rapport de vérification (Excel)'}
            </button>
          </div>
        </section>
      )}
    </>
  )
}

function PointControle({
  r,
  rubrique,
  statut,
  onDecision,
  onCommentaire,
}: {
  r: Resultat
  /** Section of the checklist, named when the points are listed by weight. */
  rubrique?: string
  statut: Statut
  onDecision: (d: Decision) => void
  onCommentaire: (c: string) => void
}) {
  const { point: p, verdict: v } = r
  const aTraiter = statut === 'absent' || statut === 'invalide' || statut === 'a-verifier'
  const po = portee(p)
  const nc = nonConforme(statut)
  return (
    <div className={`card point-controle${nc ? ` point-controle--nc point-controle--${po}` : ''}`}>
      {rubrique && <p className="point-controle__rubrique">{rubrique}</p>}
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span className={badge(statut, po)} style={{ fontSize: '0.72rem' }}>
          {LIBELLES[statut]}
        </span>
        <strong style={{ flex: '1 1 20rem' }}>{p.intitule}</strong>
        <span className={`niveau niveau--${po}`} title={PORTEES[po].aide}>
          {PORTEES[po].libelle}
        </span>
      </div>
      <p style={{ margin: '0.45rem 0 0', fontSize: '0.88rem' }}>{p.exigence}</p>
      {v.detail && <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', fontWeight: statut === 'invalide' ? 600 : 400 }}>{v.detail}</p>}
      {v.extraits && v.extraits.length > 0 && (
        <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem', fontSize: '0.82rem', color: 'var(--color-muted)' }}>
          {v.extraits.map((e, i) => (
            <li key={i}>
              {e.document ? `${e.document}, ` : ''}p. {e.page} : « {e.texte} »
            </li>
          ))}
        </ul>
      )}
      {aTraiter && (
        <p style={{ margin: '0.45rem 0 0', fontSize: '0.85rem' }}>
          <strong>Comment trouver ou corriger :</strong> {p.aide}
        </p>
      )}
      {nc && r.proposition && (
        <div className="proposition">
          <strong className="proposition__titre">Proposition d’ajout</strong>
          <p>
            <span className="proposition__etiquette">Où :</span> {r.proposition.paragraphe}
          </p>
          <p>
            <span className="proposition__etiquette">{r.proposition.modele ? 'Formulation du modèle :' : 'Exemple de phrase :'}</span> «&nbsp;
            <Phrase texte={r.proposition.phrase} />
            &nbsp;»{' '}
            <button type="button" className="btn btn--ghost btn--petit" onClick={() => void navigator.clipboard?.writeText(r.proposition!.phrase)}>
              Copier
            </button>
          </p>
        </div>
      )}
      {statut === 'a-verifier' && p.correction && (
        <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
          <strong>Formulation du modèle :</strong> « {p.correction} »
        </p>
      )}
      <p style={{ margin: '0.45rem 0 0', fontSize: '0.8rem' }}>
        Sources :{' '}
        {p.sources.map((s, i) => (
          <span key={s.libelle}>
            {i > 0 && ' · '}
            <LienSource s={s} />
          </span>
        ))}
      </p>
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.55rem', alignItems: 'center' }}>
        <select value={r.decision} aria-label={`Décision pour ${p.intitule}`} onChange={(e) => onDecision(e.target.value as Decision)} style={{ fontSize: '0.85rem' }}>
          {DECISIONS.map((d) => (
            <option key={d.v} value={d.v}>
              {d.l}
            </option>
          ))}
        </select>
        <input
          value={r.commentaire}
          placeholder="Commentaire du vérificateur"
          aria-label={`Commentaire pour ${p.intitule}`}
          onChange={(e) => onCommentaire(e.target.value)}
          style={{ flex: '1 1 18rem', fontSize: '0.85rem', padding: '0.3rem 0.5rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)' }}
        />
      </div>
    </div>
  )
}

/** The example sentence, its [parts to fill in] highlighted. */
function Phrase({ texte }: { texte: string }) {
  return (
    <>
      {texte.split(/(\[[^\]]*\])/).map((x, i) =>
        x.startsWith('[') ? (
          <mark key={i} className="a-completer">
            {x}
          </mark>
        ) : (
          <span key={i}>{x}</span>
        ),
      )}
    </>
  )
}
