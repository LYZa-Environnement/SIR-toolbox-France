import { useEffect, useState } from 'react'

export interface Etape {
  id: string
  /** "12/03/2019", "À la foration". */
  libelle: string
  /** "hautes eaux", "niveaux relevés en forant"… */
  detail: string
}

interface Props {
  etapes: Etape[]
  index: number
  surIndex: (i: number) => void
}

/**
 * The dates of the model: one step per campaign (and the drilling, when the
 * logs give water levels), a slider, previous / next, and a reading that
 * steps through them on its own.
 */
export default function Frise({ etapes, index, surIndex }: Props) {
  const [lecture, setLecture] = useState(false)
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
      </div>
      <input
        type="range"
        className="m3d-frise__curseur"
        min={0}
        max={Math.max(0, n - 1)}
        step={1}
        value={i}
        onChange={(ev) => {
          setLecture(false)
          surIndex(Number(ev.target.value))
        }}
        aria-valuetext={`${e.libelle} ${e.detail}`}
        aria-label="Date affichée"
        disabled={n < 2}
      />
      <p className="m3d-frise__date" aria-live="polite">
        <strong>{e.libelle}</strong> {e.detail && <span>· {e.detail}</span>}{' '}
        <span className="st-note">
          ({i + 1} / {n})
        </span>
      </p>
    </div>
  )
}
