import { useCallback, useEffect, useState, type KeyboardEvent } from 'react'

export interface Etape {
  id: string
  /** "12/03/2019", "À la foration". */
  libelle: string
  /** "hautes eaux", "niveaux relevés en forant"… */
  detail: string
  /** Decimal year, for the time axis (null: no date). */
  t: number | null
  type: 'foration' | 'campagne' | 'releve'
  regime: 'HE' | 'BE' | null
}

interface Props {
  etapes: Etape[]
  index: number
  surIndex: (i: number) => void
  /** Date compared with the one shown (index), or null. */
  comparaison: number | null
  surComparaison: (i: number | null) => void
  /** A mark under some dates (by step id), with its legend: the plume delineated or not at each campaign. */
  marques?: { parEtape: Record<string, { couleur: string; titre: string }>; legende: { couleur: string; libelle: string }[] } | null
}

const COULEURS = { HE: '#2f6f9f', BE: '#b8701f', aucun: '#6b7a78' }

/**
 * The dates of the model on a time axis: campaigns with analyses (filled),
 * levels alone (hollow), the drilling (square); high water in blue, low
 * water in ochre. Previous / next, a reading that steps through them, and a
 * second date to compare with.
 */
export default function Frise({ etapes, index, surIndex, comparaison, surComparaison, marques = null }: Props) {
  const [lecture, setLecture] = useState(false)
  // Drawn at its real width: marks and years keep their size on a phone.
  const [largeur, setLargeur] = useState(1000)
  const mesurer = useCallback((el: SVGSVGElement | null) => {
    if (!el) return
    const o = new ResizeObserver(() => setLargeur(Math.max(240, Math.round(el.getBoundingClientRect().width))))
    o.observe(el)
    return () => o.disconnect()
  }, [])
  const n = etapes.length
  const i = Math.min(Math.max(0, index), n - 1)

  useEffect(() => {
    if (!lecture) return
    const t = setTimeout(() => {
      if (i >= n - 1) setLecture(false)
      else surIndex(i + 1)
    }, 1300)
    return () => clearTimeout(t)
  }, [lecture, i, n, surIndex])

  if (!n) return null
  const e = etapes[i]
  const ts = etapes.map((x) => x.t).filter((t): t is number => t !== null)
  const t0 = ts.length ? Math.min(...ts) : 0
  const t1 = ts.length ? Math.max(...ts) : 1
  const marge = Math.max(0.15, (t1 - t0) * 0.03)
  const X = (t: number | null) => 20 + (((t ?? t0) - (t0 - marge)) / (t1 - t0 + 2 * marge)) * (largeur - 40)
  const annees: number[] = []
  for (let a = Math.ceil(t0 - marge); a <= t1 + marge; a++) annees.push(a)
  const pasAnnees = Math.max(1, Math.ceil(annees.length / Math.max(2, Math.floor(largeur / 70))))
  const clavier = (ev: KeyboardEvent) => {
    const k = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: n - 1 }[ev.key]
    if (k === undefined) return
    ev.preventDefault()
    setLecture(false)
    surIndex(Math.min(n - 1, Math.max(0, k)))
  }
  return (
    <div className="m3d-frise" role="group" aria-label="Dates du modèle">
      <div className="m3d-frise__boutons">
        <button type="button" className="btn btn--ghost btn--petit" onClick={() => surIndex(0)} disabled={i === 0} aria-label="Première date">
          ⏮
        </button>
        <button type="button" className="btn btn--ghost btn--petit" onClick={() => surIndex(i - 1)} disabled={i === 0} aria-label="Date précédente">
          ◀
        </button>
        <button
          type="button"
          className="btn btn--petit"
          onClick={() => {
            if (!lecture && i >= n - 1) surIndex(0)
            setLecture(!lecture)
          }}
          disabled={n < 2}
          aria-pressed={lecture}
        >
          {lecture ? '❚❚ Pause' : '▶ Lecture'}
        </button>
        <button type="button" className="btn btn--ghost btn--petit" onClick={() => surIndex(i + 1)} disabled={i >= n - 1} aria-label="Date suivante">
          ▶
        </button>
        <button type="button" className="btn btn--ghost btn--petit" onClick={() => surIndex(n - 1)} disabled={i >= n - 1} aria-label="Dernière date">
          ⏭
        </button>
        {n > 1 && (
          <label className="st-coche m3d-frise__comparer">
            <input type="checkbox" checked={comparaison !== null} onChange={(ev) => surComparaison(ev.target.checked ? (i > 0 ? i - 1 : Math.min(1, n - 1)) : null)} />
            Comparer avec
            {comparaison !== null && (
              <select value={comparaison} onChange={(ev) => surComparaison(Number(ev.target.value))} aria-label="Date de comparaison">
                {etapes.map((x, k) => (
                  <option key={x.id} value={k}>
                    {x.libelle}
                    {x.regime ? ` (${x.regime})` : ''}
                  </option>
                ))}
              </select>
            )}
          </label>
        )}
      </div>
      <svg ref={mesurer} className="m3d-frise__axe" viewBox={`0 0 ${largeur} 66`} role="slider" aria-label="Date affichée" aria-valuemin={1} aria-valuemax={n} aria-valuenow={i + 1} aria-valuetext={`${e.libelle} ${e.detail}`} tabIndex={0} onKeyDown={clavier}>
        <line x1={10} x2={largeur - 10} y1={30} y2={30} className="m3d-frise__ligne" />
        {annees.map((a, k) =>
          k % pasAnnees === 0 && X(a) >= 10 && X(a) <= largeur - 10 ? (
            <g key={a}>
              <line x1={X(a)} x2={X(a)} y1={25} y2={35} className="m3d-frise__ligne" />
              <text x={X(a)} y={58} textAnchor="middle" className="m3d-frise__annee">
                {a}
              </text>
            </g>
          ) : null,
        )}
        {etapes.map((x, k) => {
          const cx = X(x.t)
          const couleur = COULEURS[x.regime ?? 'aucun']
          const courant = k === i
          const marque = marques?.parEtape[x.id]
          return (
            <g key={x.id} className="m3d-frise__point" onClick={() => (setLecture(false), surIndex(k))}>
              <title>{`${x.libelle}${x.detail ? ` · ${x.detail}` : ''}${marque ? ` · ${marque.titre}` : ''}`}</title>
              {marque && <rect x={cx - 3.5} y={41} width={7} height={7} rx={1.5} fill={marque.couleur} className="m3d-frise__marque" />}
              <circle cx={cx} cy={30} r={13} fill="transparent" />
              {courant && <circle cx={cx} cy={30} r={11} className="m3d-frise__courant" />}
              {comparaison === k && (
                <>
                  <circle cx={cx} cy={30} r={11} className="m3d-frise__compare" />
                  <text x={cx} y={12} textAnchor="middle" className="m3d-frise__a">
                    A
                  </text>
                </>
              )}
              {x.type === 'foration' ? (
                <rect x={cx - 5.5} y={24.5} width={11} height={11} fill="#5f6b6b" />
              ) : x.type === 'releve' ? (
                <circle cx={cx} cy={30} r={5.5} fill="#ffffff" stroke={couleur} strokeWidth={2.5} />
              ) : (
                <circle cx={cx} cy={30} r={6} fill={couleur} stroke="#ffffff" strokeWidth={1.5} />
              )}
            </g>
          )
        })}
      </svg>
      <div className="m3d-frise__pied">
        <p className="m3d-frise__date" aria-live="polite">
          <strong>{e.libelle}</strong> {e.detail && <span>· {e.detail}</span>}{' '}
          <span className="st-note">
            ({i + 1} / {n})
          </span>
          {comparaison !== null && comparaison !== i && <span className="st-note"> · comparée au {etapes[comparaison]?.libelle} (A)</span>}
        </p>
        <p className="m3d-frise__legende st-note">
          <span className="m3d-pastille m3d-pastille--rond" style={{ background: COULEURS.HE }} aria-hidden="true" /> hautes eaux{' '}
          <span className="m3d-pastille m3d-pastille--rond" style={{ background: COULEURS.BE }} aria-hidden="true" /> basses eaux{' '}
          <span className="m3d-pastille m3d-pastille--rond m3d-pastille--creux" aria-hidden="true" /> niveaux seuls{' '}
          <span className="m3d-pastille" style={{ background: '#5f6b6b' }} aria-hidden="true" /> foration
          {marques?.legende.map((l) => (
            <span key={l.libelle}>
              {' '}
              <span className="m3d-pastille" style={{ background: l.couleur }} aria-hidden="true" /> {l.libelle}
            </span>
          ))}
        </p>
      </div>
    </div>
  )
}
