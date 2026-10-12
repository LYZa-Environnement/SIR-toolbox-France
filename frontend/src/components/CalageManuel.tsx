import { useEffect, useState, type MouseEvent } from 'react'
import type { PageAnalysee } from '../lib/dict/analyse'
import { appliquer, inverse, libelleCrs, TOUS_CRS, type Affine, type Crs } from '../lib/dict/calage'
import type { PointDeCalage } from '../lib/dict/geo'
import type { PdfOuvert } from '../lib/dict/pdfjs'

interface Saisie {
  x: number
  y: number
  e: string
  n: string
}

const lire = (s: string) => {
  const v = Number(s.replace(/[\s  ]/g, '').replace(',', '.'))
  return s.trim() && Number.isFinite(v) ? v : null
}

const ZOOMS = [1, 2, 4]

export default function CalageManuel({
  titre,
  ouvert,
  page,
  crsInitial,
  pointsInitiaux,
  onValider,
  onFermer,
}: {
  titre: string
  ouvert: PdfOuvert
  page: PageAnalysee
  crsInitial: Crs
  pointsInitiaux: PointDeCalage[]
  onValider: (points: PointDeCalage[], crs: Crs) => void
  onFermer: () => void
}) {
  const [image, setImage] = useState<{ url: string; versPixel: Affine; largeur: number; hauteur: number } | null>(null)
  const [points, setPoints] = useState<Saisie[]>(pointsInitiaux.map((p) => ({ x: p.x, y: p.y, e: String(p.e), n: String(p.n) })))
  const [actif, setActif] = useState<number | null>(null)
  /** Last point added, whose coordinates are typed next. */
  const [nouveau, setNouveau] = useState<number | null>(null)
  const [crs, setCrs] = useState<Crs>(crsInitial)
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    let vivant = true
    void import('../lib/dict/pdfjs').then(({ imagePage }) => imagePage(ouvert.doc, page.index, 2400)).then((i) => vivant && setImage(i))
    return () => {
      vivant = false
    }
  }, [ouvert, page.index])

  useEffect(() => {
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && onFermer()
    window.addEventListener('keydown', echap)
    return () => window.removeEventListener('keydown', echap)
  }, [onFermer])

  function pointer(e: MouseEvent<HTMLDivElement>) {
    if (!image) return
    const r = e.currentTarget.getBoundingClientRect()
    const [x, y] = appliquer(inverse(image.versPixel), ((e.clientX - r.left) / r.width) * image.largeur, ((e.clientY - r.top) / r.height) * image.hauteur)
    // A click adds a point; a point picked by its number is moved instead.
    if (actif !== null && points[actif]) {
      setPoints((p) => p.map((q, i) => (i === actif ? { ...q, x, y } : q)))
      setActif(null)
    } else if (points.length < 4) {
      setPoints((p) => [...p, { x, y, e: '', n: '' }])
      setNouveau(points.length)
    }
  }

  const complets = points.filter((p) => lire(p.e) !== null && lire(p.n) !== null)
  const suffisant = complets.length >= 2 || (complets.length === 1 && !!page.echelle)
  const position = (p: Saisie) => {
    if (!image) return { left: 0, top: 0 }
    const [px, py] = appliquer(image.versPixel, p.x, p.y)
    return { left: `${(px / image.largeur) * 100}%`, top: `${(py / image.hauteur) * 100}%` }
  }

  return (
    <div className="calage" role="dialog" aria-modal="true" aria-label={`Caler ${titre}`}>
      <div className="calage__panneau">
        <div className="calage__image">
          <div className="calage__zoom">
            {ZOOMS.map((z) => (
              <button key={z} type="button" className={`btn btn--petit${zoom === z ? '' : ' btn--ghost'}`} onClick={() => setZoom(z)}>
                {z === 1 ? 'Page entière' : `×${z}`}
              </button>
            ))}
          </div>
          <div className="calage__defile">
            {image ? (
              <div className="calage__feuille" style={{ width: `${zoom * 100}%` }} onClick={pointer}>
                <img src={image.url} alt={`Plan ${titre}`} draggable={false} />
                {points.map((p, i) => (
                  <span key={i} className={`calage__point${actif === i ? ' calage__point--actif' : ''}`} style={position(p)}>
                    {i + 1}
                  </span>
                ))}
              </div>
            ) : (
              <p style={{ padding: '2rem' }}>Rendu du plan…</p>
            )}
          </div>
        </div>
        <aside className="calage__saisie">
          <h2 style={{ fontSize: '1.3rem' }}>Caler le plan</h2>
          <p className="dict-muet" style={{ marginTop: 0 }}>{titre}</p>
          <p style={{ fontSize: '0.88rem' }}>
            Cliquez sur un croisillon ou une intersection de la grille, puis saisissez ses coordonnées lues sur le plan. Pour
            déplacer un point, cliquez sur son numéro puis sur le plan.{' '}
            {page.echelle
              ? `L'échelle est écrite sur le plan (1:${page.echelle}) : un point suffit, deux sont plus sûrs.`
              : "Deux points éloignés au moins (trois pour contrôler l'écart)."}
          </p>
          <label className="champ">
            Système de coordonnées du plan
            <select value={crs} onChange={(e) => setCrs(e.target.value as Crs)}>
              {TOUS_CRS.map((c) => (
                <option key={c} value={c}>
                  {libelleCrs(c)} ({c})
                </option>
              ))}
            </select>
          </label>
          {points.map((p, i) => (
            <div key={i} className={`calage__ligne${actif === i ? ' calage__ligne--actif' : ''}`}>
              <button
                type="button"
                className="calage__numero"
                aria-pressed={actif === i}
                onClick={() => setActif(actif === i ? null : i)}
                title="Déplacer ce point : cliquer ensuite sur le plan"
              >
                {i + 1}
              </button>
              <label className="champ">
                X (est)
                <input inputMode="decimal" autoFocus={nouveau === i} value={p.e} onChange={(e) => setPoints((t) => t.map((q, j) => (j === i ? { ...q, e: e.target.value } : q)))} />
              </label>
              <label className="champ">
                Y (nord)
                <input inputMode="decimal" value={p.n} onChange={(e) => setPoints((t) => t.map((q, j) => (j === i ? { ...q, n: e.target.value } : q)))} />
              </label>
              <button
                type="button"
                className="btn btn--petit btn--ghost"
                aria-label={`Retirer le point ${i + 1}`}
                onClick={() => {
                  setPoints((t) => t.filter((_, j) => j !== i))
                  setActif(null)
                }}
              >
                ✕
              </button>
            </div>
          ))}
          {points.length === 0 && <p className="dict-muet">Aucun point : cliquez sur le plan.</p>}
          <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn"
              disabled={!suffisant}
              onClick={() =>
                onValider(
                  complets.map((p) => ({ x: p.x, y: p.y, e: lire(p.e)!, n: lire(p.n)! })),
                  crs,
                )
              }
            >
              Valider le calage
            </button>
            <button type="button" className="btn btn--ghost" onClick={onFermer}>
              Annuler
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}
