import { useState } from 'react'
import { svgEnPng, type Cible } from '../../lib/suivi/graphique'
import { telechargerBlob } from '../../lib/fichiers'
import { nomFichier } from '../../lib/suivi/ui'

/**
 * A chart drawn from its SVG text, with its points made clickable and a
 * tooltip; the same drawing can be saved as PNG (report quality) or SVG.
 */
export function Figure({
  svg,
  largeur,
  hauteur,
  cibles = [],
  nom,
  onPoint,
  aide,
}: {
  svg: string
  largeur: number
  hauteur: number
  cibles?: Cible[]
  nom: string
  /** Click on a point: its id (a result id). */
  onPoint?: (id: string) => void
  aide?: string
}) {
  const [survol, setSurvol] = useState<Cible | null>(null)
  async function png() {
    const url = await svgEnPng(svg, largeur, hauteur, 3)
    const blob = await (await fetch(url)).blob()
    telechargerBlob(blob, `${nomFichier(nom)}.png`)
  }
  return (
    <figure className="st-figure">
      <div className="st-figure__cadre" style={{ aspectRatio: `${largeur} / ${hauteur}` }}>
        <div className="st-figure__svg" dangerouslySetInnerHTML={{ __html: svg }} />
        {cibles.length > 0 && (
          <svg className="st-figure__cibles" viewBox={`0 0 ${largeur} ${hauteur}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
            {cibles.map((c, i) => (
              <circle
                key={i}
                cx={c.x}
                cy={c.y}
                r={8}
                fill="transparent"
                style={{ cursor: onPoint && c.id ? 'pointer' : 'default' }}
                onMouseEnter={() => setSurvol(c)}
                onMouseLeave={() => setSurvol((s) => (s === c ? null : s))}
                onClick={() => c.id && onPoint?.(c.id)}
              />
            ))}
          </svg>
        )}
        {survol && (
          <div
            className="st-figure__bulle"
            style={{
              left: `${(survol.x / largeur) * 100}%`,
              top: `${(survol.y / hauteur) * 100}%`,
              transform: `translate(${survol.x > largeur * 0.65 ? '-100%' : '0'}, -120%)`,
            }}
          >
            {survol.texte}
            {onPoint && survol.id && <span className="st-figure__action">clic : écarter / reprendre ce résultat</span>}
          </div>
        )}
      </div>
      <figcaption className="st-figure__barre">
        {aide && <span className="st-figure__aide">{aide}</span>}
        <span className="st-figure__boutons">
          <button type="button" className="btn btn--ghost btn--petit" onClick={() => void png()}>
            PNG
          </button>
          <button type="button" className="btn btn--ghost btn--petit" onClick={() => telechargerBlob(new Blob([svg], { type: 'image/svg+xml' }), `${nomFichier(nom)}.svg`)}>
            SVG
          </button>
        </span>
      </figcaption>
    </figure>
  )
}
