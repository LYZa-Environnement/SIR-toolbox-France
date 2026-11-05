import { useMemo, useRef, useState, type DragEvent } from 'react'
import { preparer, verifier, type Decision, type Resultat, type Statut } from '../lib/livrables/controles'
import { lireDocument, type Document } from '../lib/livrables/extraction'
import { REFERENTIELS } from '../lib/livrables/referentiels'

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

const DECISIONS: { v: Decision; l: string }[] = [
  { v: '', l: '— selon l’outil —' },
  { v: 'conforme', l: 'Conforme' },
  { v: 'non-conforme', l: 'Non conforme' },
  { v: 'sans-objet', l: 'Sans objet' },
]

export default function VerificationLivrables() {
  const [typeId, setTypeId] = useState<string | null>(null)
  const [doc, setDoc] = useState<Document | null>(null)
  const [texteColle, setTexteColle] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [chargement, setChargement] = useState(false)
  const [survol, setSurvol] = useState(false)
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [commentaires, setCommentaires] = useState<Record<string, string>>({})
  const [filtre, setFiltre] = useState<'tous' | 'problemes'>('tous')
  const [export_, setExport] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const referentiel = REFERENTIELS.find((r) => r.id === typeId) ?? null

  async function charger(f: File | undefined) {
    if (!f) return
    setChargement(true)
    setErreur(null)
    try {
      setDoc(await lireDocument(f))
      setTexteColle('')
      setDecisions({})
      setCommentaires({})
    } catch (e) {
      setDoc(null)
      setErreur(e instanceof Error ? e.message : 'Le document n’a pas pu être lu.')
    } finally {
      setChargement(false)
    }
  }

  function deposer(e: DragEvent) {
    e.preventDefault()
    setSurvol(false)
    void charger(e.dataTransfer.files[0])
  }

  const livrable: Document | null = useMemo(
    () => doc ?? (texteColle.trim() ? { nom: 'Texte collé', pages: [texteColle], pagesSansTexte: 0 } : null),
    [doc, texteColle],
  )
  const texte = useMemo(() => (livrable ? preparer(livrable) : null), [livrable])

  const resultats: Resultat[] = useMemo(() => {
    if (!referentiel || !texte) return []
    return referentiel.points.map((point) => ({ point, verdict: verifier(point, texte), decision: decisions[point.id] ?? '', commentaire: commentaires[point.id] ?? '' }))
  }, [referentiel, texte, decisions, commentaires])

  /** The status shown: the reader's decision when given. */
  const effectif = (r: Resultat): Statut =>
    r.decision === 'conforme' ? 'present' : r.decision === 'non-conforme' ? 'invalide' : r.decision === 'sans-objet' ? 'sans-objet' : r.verdict.statut
  const comptes = resultats.reduce<Record<Statut, number>>(
    (c, r) => ({ ...c, [effectif(r)]: c[effectif(r)] + 1 }),
    { present: 0, absent: 0, invalide: 0, 'a-verifier': 0, 'sans-objet': 0 },
  )
  const groupes = [...new Set(resultats.map((r) => r.point.groupe))]
  const visibles = (g: string) =>
    resultats.filter((r) => r.point.groupe === g && (filtre === 'tous' || ['absent', 'invalide', 'a-verifier'].includes(effectif(r))))

  async function exporter() {
    if (!referentiel || !livrable) return
    setExport(true)
    try {
      const { telechargerVerification } = await import('../lib/livrables/export')
      const date = new Date().toISOString().slice(0, 10)
      await telechargerVerification({ referentiel, document: livrable, resultats, statut: effectif }, `Vérification ${referentiel.titre} - ${livrable.nom.replace(/\.[^.]+$/, '')} - ${date}.xlsx`)
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
            Contrôlez une attestation ATTES ou un dossier de déclaration IOTA avant diffusion : chaque exigence des textes est recherchée
            dans le document, avec sa source officielle, et l’outil indique où trouver l’information manquante ou comment corriger. Le
            document est lu dans votre navigateur et n’est envoyé nulle part.
          </p>

          <h2 className="etape">
            <span>1</span> Type de livrable
          </h2>
          <div className="grid grid--3 choix" role="radiogroup" aria-label="Type de livrable">
            {REFERENTIELS.map((r) => (
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
                <span style={{ fontWeight: 600 }}>{r.accroche}</span>
                <span>{r.description}</span>
              </button>
            ))}
          </div>

          {referentiel && (
            <>
              <p style={{ fontSize: '0.88rem', margin: '1rem 0 0' }}>
                <strong>Textes de référence :</strong>{' '}
                {referentiel.cadre.map((s, i) => (
                  <span key={s.url}>
                    {i > 0 && ' · '}
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.libelle}
                    </a>
                  </span>
                ))}
              </p>

              <h2 className="etape">
                <span>2</span> Document à vérifier
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
                  accept=".pdf,.docx,.txt"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    void charger(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
                <p style={{ margin: 0, fontWeight: 600 }}>{chargement ? 'Lecture du document…' : 'Déposez ici le livrable'}</p>
                <p style={{ margin: '0.25rem 0 0.9rem', fontSize: '0.88rem', color: 'var(--color-muted)' }}>
                  PDF (avec texte, non scanné), Word (.docx) ou texte. Vous pouvez aussi coller le texte ci-dessous.
                </p>
                <button type="button" className="btn" onClick={() => input.current?.click()} disabled={chargement}>
                  Choisir un fichier
                </button>
              </div>
              {erreur && (
                <p role="alert" className="alerte">
                  {erreur}
                </p>
              )}
              {!doc && (
                <label className="champ" style={{ marginTop: '1rem' }}>
                  Ou collez le texte du livrable
                  <textarea value={texteColle} onChange={(e) => setTexteColle(e.target.value)} placeholder="Texte de l’attestation ou du dossier…" />
                </label>
              )}
              {doc && (
                <div className="card" style={{ marginTop: '1rem', maxWidth: '40rem' }}>
                  <strong>{doc.nom}</strong>
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.9rem', color: 'var(--color-muted)' }}>
                    {doc.pages.length} page{doc.pages.length > 1 ? 's' : ''} · {doc.pages.join(' ').split(/\s+/).filter(Boolean).length} mots lus
                  </p>
                  {doc.pagesSansTexte > 0 && (
                    <p className="alerte" style={{ margin: '0.6rem 0 0' }}>
                      {doc.pagesSansTexte} page{doc.pagesSansTexte > 1 ? 's' : ''} sans texte lisible : document scanné ? Les informations qui y
                      figurent ne peuvent pas être recherchées (passer le PDF à la reconnaissance de caractères, OCR).
                    </p>
                  )}
                  <button type="button" className="btn btn--ghost btn--petit" style={{ marginTop: '0.6rem' }} onClick={() => setDoc(null)}>
                    Retirer le document
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {referentiel && livrable && (
        <section className="section section--muted">
          <div className="container">
            <h2 className="etape">
              <span>3</span> Points de contrôle
            </h2>
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.75rem' }}>
              {(['invalide', 'absent', 'a-verifier', 'present', 'sans-objet'] as Statut[]).map((s) =>
                comptes[s] ? (
                  <span key={s} className={BADGE[s]}>
                    {comptes[s]} · {LIBELLES[s]}
                  </span>
                ) : null,
              )}
              <label style={{ fontSize: '0.88rem', marginLeft: 'auto' }}>
                <input type="checkbox" checked={filtre === 'problemes'} onChange={(e) => setFiltre(e.target.checked ? 'problemes' : 'tous')} /> Afficher
                seulement les points à traiter
              </label>
            </div>
            <ul style={{ fontSize: '0.85rem', color: 'var(--color-muted)', margin: '0 0 1.25rem', paddingLeft: '1.1rem' }}>
              {referentiel.limites.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>

            {groupes.map((g) => {
              const rs = visibles(g)
              if (!rs.length) return null
              return (
                <div key={g} style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ margin: '0 0 0.5rem' }}>{g}</h3>
                  {rs.map((r) => (
                    <PointControle
                      key={r.point.id}
                      r={r}
                      statut={effectif(r)}
                      onDecision={(d) => setDecisions({ ...decisions, [r.point.id]: d })}
                      onCommentaire={(c) => setCommentaires({ ...commentaires, [r.point.id]: c })}
                    />
                  ))}
                </div>
              )
            })}

            <button type="button" className="btn" onClick={() => void exporter()} disabled={export_}>
              {export_ ? 'Préparation…' : 'Télécharger le rapport de vérification (Excel)'}
            </button>
          </div>
        </section>
      )}
    </>
  )
}

function PointControle({ r, statut, onDecision, onCommentaire }: { r: Resultat; statut: Statut; onDecision: (d: Decision) => void; onCommentaire: (c: string) => void }) {
  const { point: p, verdict: v } = r
  const aTraiter = statut === 'absent' || statut === 'invalide' || statut === 'a-verifier'
  return (
    <div className="card" style={{ marginBottom: '0.6rem', padding: '0.9rem 1rem' }}>
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span className={BADGE[statut]} style={{ fontSize: '0.72rem' }}>
          {LIBELLES[statut]}
        </span>
        <strong style={{ flex: '1 1 20rem' }}>{p.intitule}</strong>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{p.niveau === 'obligatoire' ? 'Exigé par les textes' : 'Attendu (bonne pratique, ou selon le cas)'}</span>
      </div>
      <p style={{ margin: '0.45rem 0 0', fontSize: '0.88rem' }}>{p.exigence}</p>
      {v.detail && <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', fontWeight: statut === 'invalide' ? 600 : 400 }}>{v.detail}</p>}
      {v.extraits && v.extraits.length > 0 && (
        <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem', fontSize: '0.82rem', color: 'var(--color-muted)' }}>
          {v.extraits.map((e, i) => (
            <li key={i}>
              p. {e.page} : « {e.texte} »
            </li>
          ))}
        </ul>
      )}
      {aTraiter && (
        <p style={{ margin: '0.45rem 0 0', fontSize: '0.85rem' }}>
          <strong>Comment trouver ou corriger :</strong> {p.aide}
        </p>
      )}
      {aTraiter && p.correction && (
        <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
          <strong>Formulation du modèle :</strong> « {p.correction} »{' '}
          <button type="button" className="btn btn--ghost btn--petit" onClick={() => void navigator.clipboard?.writeText(p.correction!)}>
            Copier
          </button>
        </p>
      )}
      <p style={{ margin: '0.45rem 0 0', fontSize: '0.8rem' }}>
        Sources :{' '}
        {p.sources.map((s, i) => (
          <span key={s.url}>
            {i > 0 && ' · '}
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.libelle}
            </a>
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
