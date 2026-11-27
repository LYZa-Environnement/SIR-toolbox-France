import { fr } from '../../lib/modele3d/format'
import type { Evolution as Ev } from '../../lib/modele3d/modele'
import { formatDate } from '../../lib/suivi/dates'
import { anneeDecimale, type MannKendall } from '../../lib/suivi/stats'

interface Props {
  evolution: Ev
  nom: string
  unite: string
  reference: number | null
  campagne: string | null
  porosite: number
  epaisseur: number
  surPorosite: (v: number) => void
  surEpaisseur: (v: number) => void
}

function lectureTendance(mk: MannKendall | null): string {
  if (!mk) return 'tendance non testée (4 campagnes au moins)'
  const p = mk.pBilateral
  const sens = mk.S > 0 ? 'en hausse' : mk.S < 0 ? 'en baisse' : 'sans évolution'
  return p < 0.05 ? `${sens} (Mann-Kendall, p = ${fr(p, 2)})` : `pas de tendance significative (p = ${fr(p, 2)})`
}

/** One measure over the campaigns: a line, one marker per campaign, the date shown stressed. */
function Courbe({ titre, unite, points, campagne }: { titre: string; unite: string; points: { campagne: string; date: string; v: number }[]; campagne: string | null }) {
  const L = 420
  const H = 150
  const g = { h: 14, b: 26, gauche: 58, d: 12 }
  if (points.length < 2) return null
  const ts = points.map((p) => anneeDecimale(p.date))
  const max = Math.max(...points.map((p) => p.v)) || 1
  const X = (t: number) => g.gauche + ((t - ts[0]) / Math.max(1e-6, ts[ts.length - 1] - ts[0])) * (L - g.gauche - g.d)
  const Y = (v: number) => H - g.b - (v / max) * (H - g.h - g.b)
  const chemin = points.map((p, i) => `${i ? 'L' : 'M'}${X(ts[i]).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ')
  const courant = points.findIndex((p) => p.campagne === campagne)
  return (
    <figure className="m3d-courbe">
      <figcaption>
        <strong>{titre}</strong> <span className="st-note">({unite})</span>
      </figcaption>
      <svg viewBox={`0 0 ${L} ${H}`} role="img" aria-label={titre}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={g.gauche} x2={L - g.d} y1={Y(max * f)} y2={Y(max * f)} className="m3d-chronique__axe" />
            <text x={g.gauche - 6} y={Y(max * f) + 3} textAnchor="end" className="m3d-chronique__texte">
              {fr(max * f)}
            </text>
          </g>
        ))}
        <text x={g.gauche} y={H - 6} className="m3d-chronique__texte">
          {Math.floor(ts[0])}
        </text>
        <text x={L - g.d} y={H - 6} textAnchor="end" className="m3d-chronique__texte">
          {Math.floor(ts[ts.length - 1])}
        </text>
        {courant >= 0 && <line x1={X(ts[courant])} x2={X(ts[courant])} y1={g.h} y2={H - g.b} className="m3d-chronique__curseur" />}
        <path d={chemin} className="m3d-chronique__ligne" />
        {points.map((p, i) => (
          <circle key={p.campagne} cx={X(ts[i])} cy={Y(p.v)} r={i === courant ? 5 : 4} className="m3d-chronique__point">
            <title>{`${formatDate(p.date)} : ${fr(p.v)} ${unite}`}</title>
          </circle>
        ))}
      </svg>
    </figure>
  )
}

/** The plume campaign after campaign: area above the comparison value, dissolved mass, trend. */
export default function Evolution(p: Props) {
  const e = p.evolution
  return (
    <div className="m3d-evolution">
      <div className="m3d-evolution__courbes">
        {p.reference !== null && (
          <Courbe titre={`Surface au-dessus de ${fr(p.reference)} ${p.unite}`} unite="m²" points={e.etats.map((x) => ({ campagne: x.campagne, date: x.date, v: x.aire ?? 0 }))} campagne={p.campagne} />
        )}
        <Courbe titre="Masse dissoute (ordre de grandeur)" unite="kg" points={e.etats.map((x) => ({ campagne: x.campagne, date: x.date, v: x.masse }))} campagne={p.campagne} />
      </div>
      <p>
        {p.reference !== null && (
          <>
            Surface du panache : <strong>{lectureTendance(e.tendanceAire)}</strong>.{' '}
          </>
        )}
        Masse dissoute : <strong>{lectureTendance(e.tendanceMasse)}</strong>.
      </p>
      <div className="m3d-evolution__hypotheses">
        <label className="champ">
          <span>Porosité efficace</span>
          <input type="number" min={0.01} max={0.5} step={0.01} value={p.porosite} onChange={(ev) => p.surPorosite(Number(ev.target.value) || 0.2)} />
        </label>
        <label className="champ">
          <span>Épaisseur saturée concernée (m)</span>
          <input type="number" min={0.5} max={50} step={0.5} value={p.epaisseur} onChange={(ev) => p.surEpaisseur(Number(ev.target.value) || 5)} />
        </label>
      </div>
      <div className="tableau-defile">
        <table className="tableau">
          <thead>
            <tr>
              <th>Campagne</th>
              <th>Ouvrages</th>
              <th>{`Concentration maximale (${p.unite})`}</th>
              {p.reference !== null && <th>Surface &gt; valeur (m²)</th>}
              <th>Masse dissoute (kg)</th>
            </tr>
          </thead>
          <tbody>
            {e.etats.map((x) => (
              <tr key={x.campagne} className={x.campagne === p.campagne ? 'm3d-ligne-choisie' : undefined}>
                <th scope="row">{formatDate(x.date)}</th>
                <td>{x.n}</td>
                <td>{x.cmax === null ? '< LQ' : fr(x.cmax)}</td>
                {p.reference !== null && <td>{fr(x.aire ?? 0)}</td>}
                <td>{fr(x.masse)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="st-note">
        Champ krigé (ou inverse distance) sur le logarithme des concentrations, entre les ouvrages seulement ; masse = Σ C × porosité × épaisseur × surface de chaque maille. Un
        ordre de grandeur pour suivre l’évolution, pas un inventaire : la répartition verticale n’est pas connue par des ouvrages crépinés.
      </p>
    </div>
  )
}
