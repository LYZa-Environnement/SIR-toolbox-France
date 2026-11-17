import { useState } from 'react'
import { LIBELLES_VERDICT, SEUILS, type QualitePoint, type Verdict } from '../../lib/resultats/qualiteGaz'

const COULEUR_VERDICT: Record<Verdict, string> = {
  representatif: '#1f6b45',
  'a-verifier': '#c9971f',
  'air-ambiant': '#c34a35',
  'non-evalue': '#9aa3a2',
}

const ENCRE = '#0d2421'
const MUET = '#4f625f'
const GRILLE = '#e3e8e7'
const fr = (x: number, d = 1) => x.toLocaleString('fr-FR', { maximumFractionDigits: d })

/**
 * Soil gas drawn at each point, O2 against CO2: outdoor air sits top left
 * (O2 ≈ 21 %, CO2 ≈ 400 ppm), soil gas moves down and right. CO2 beyond the
 * meter's range stands in the right band, readings without a usable CO2 in
 * the left one. A click on a point gives its reading.
 */
export function NuageGaz({ points }: { points: QualitePoint[] }) {
  const [choisi, setChoisi] = useState<string | null>(null)
  const L = 640
  const H = 330
  const g = 112
  const d = 74
  const h = 16
  const b = 44
  const o2s = points.map((p) => p.o2).filter((x): x is number => x !== null)
  const yMin = Math.max(0, Math.floor(Math.min(15, ...o2s) - 1))
  const yMax = 21.5
  const co2s = points.filter((p) => p.co2 !== null && !p.co2Superieur).map((p) => p.co2!)
  const xMin = 300
  const xMax = Math.max(10000, ...co2s.map((c) => c * 1.3))
  const x = (v: number) => g + ((Math.log10(v) - Math.log10(xMin)) / (Math.log10(xMax) - Math.log10(xMin))) * (L - g - d)
  const y = (v: number) => h + ((yMax - v) / (yMax - yMin)) * (H - h - b)
  const xHors = L - d / 2
  const xSans = g / 2 + 6
  const position = (p: QualitePoint) => (p.co2 === null ? xSans : p.co2Superieur ? xHors : x(p.co2))
  const avecO2 = points.filter((p) => p.o2 !== null)
  // Points sharing a band are spread a little so that all can be clicked.
  const decalage = new Map<string, number>()
  for (const bande of [avecO2.filter((p) => p.co2 === null), avecO2.filter((p) => p.co2Superieur)]) {
    bande.sort((a, c) => a.o2! - c.o2!).forEach((p, i) => decalage.set(p.ouvrage, ((i % 6) - 2.5) * 8))
  }
  const sel = points.find((p) => p.ouvrage === choisi) ?? null
  const ticksX = [300, 1000, 3000, 10000, 30000, 100000].filter((v) => v <= xMax)

  return (
    <div className="visuels">
      <figure className="visuels__figure">
        <figcaption>
          Oxygène et dioxyde de carbone du gaz prélevé
          <span>Dernière mesure plausible du prélèvement, sinon fin de purge. En haut à gauche, l’air extérieur ; vers le bas et la droite, le gaz du sol.</span>
        </figcaption>
        <svg viewBox={`0 0 ${L} ${H}`} role="img" aria-label="Oxygène en fonction du dioxyde de carbone, par point de prélèvement">
          <rect x={x(xMin)} y={y(yMax)} width={x(SEUILS.co2Ambiant) - x(xMin)} height={y(SEUILS.o2Ambiant) - y(yMax)} fill="#f7e3dd" />
          <text x={x(xMin) + 4} y={y(yMax) + 12} fontSize="10.5" fill="#9c3d2e">
            Air extérieur
          </text>
          <rect x={L - d + 6} y={h} width={d - 10} height={H - h - b} fill="#eef3f1" rx={4} />
          <text x={xHors} y={H - b - 18} fontSize="10" fill={MUET} textAnchor="middle">
            CO₂ hors
          </text>
          <text x={xHors} y={H - b - 6} fontSize="10" fill={MUET} textAnchor="middle">
            gamme
          </text>
          <rect x={4} y={h} width={g - 30} height={H - h - b} fill="#f4f6f6" rx={4} />
          <text x={xSans} y={H - b - 18} fontSize="10" fill={MUET} textAnchor="middle">
            CO₂ non
          </text>
          <text x={xSans} y={H - b - 6} fontSize="10" fill={MUET} textAnchor="middle">
            exploitable
          </text>
          {ticksX.map((v) => (
            <g key={v}>
              <line x1={x(v)} x2={x(v)} y1={y(yMax)} y2={y(yMin)} stroke={GRILLE} />
              <text x={x(v)} y={H - b + 15} fontSize="10.5" fill={MUET} textAnchor="middle">
                {v >= 1000 ? `${fr(v / 1000, 0)} 000` : v}
              </text>
            </g>
          ))}
          {[yMin, ...[12, 15, 18, 20.5].filter((v) => v > yMin && v < yMax)].map((v) => (
            <g key={v}>
              <line x1={g} x2={L - d} y1={y(v)} y2={y(v)} stroke={GRILLE} strokeDasharray={v === 20.5 ? '4 3' : undefined} />
              <text x={g - 6} y={y(v) + 3.5} fontSize="10.5" fill={MUET} textAnchor="end">
                {fr(v)}
              </text>
            </g>
          ))}
          <text x={(g + L - d) / 2} y={H - 6} fontSize="11" fill={ENCRE} textAnchor="middle">
            CO₂ (ppm, échelle logarithmique)
          </text>
          <text x={g - 34} y={(h + H - b) / 2} fontSize="11" fill={ENCRE} textAnchor="middle" transform={`rotate(-90 ${g - 34} ${(h + H - b) / 2})`}>
            O₂ (%)
          </text>
          {avecO2.map((p) => {
            const actif = p.ouvrage === choisi
            const cx = position(p) + (decalage.get(p.ouvrage) ?? 0)
            const cy = y(p.o2!)
            return (
              <g key={p.ouvrage} className="visuels__point" role="button" tabIndex={0} onClick={() => setChoisi(actif ? null : p.ouvrage)} onKeyDown={(e) => e.key === 'Enter' && setChoisi(p.ouvrage)}>
                <circle cx={cx} cy={cy} r={actif ? 8 : 6} fill={COULEUR_VERDICT[p.verdict]} fillOpacity={0.85} stroke={actif ? ENCRE : '#fff'} strokeWidth={actif ? 2.5 : 1.2} />
                {actif && (
                  <text x={cx + 10} y={cy + 4} fontSize="11" fontWeight={700} fill={ENCRE}>
                    {p.ouvrage}
                  </text>
                )}
                <title>{`${p.ouvrage} — ${LIBELLES_VERDICT[p.verdict]}\nO₂ ${fr(p.o2!)} %${p.co2 !== null ? `, CO₂ ${p.co2Superieur ? '> ' : ''}${fr(p.co2, 0)} ppm` : ', CO₂ non exploitable'}`}</title>
              </g>
            )
          })}
        </svg>
        <p className="visuels__legende">
          {(Object.keys(LIBELLES_VERDICT) as Verdict[])
            .filter((v) => points.some((p) => p.verdict === v))
            .map((v) => (
              <span key={v} style={{ background: COULEUR_VERDICT[v], color: '#fff' }}>
                {LIBELLES_VERDICT[v]} : {points.filter((p) => p.verdict === v).length}
              </span>
            ))}
        </p>
      </figure>
      <div className="visuels__detail" aria-live="polite">
        {sel ? (
          <>
            <div className="visuels__detail-tete">
              <strong>{sel.ouvrage}</strong>
              <span className="puce" style={{ ['--puce' as string]: COULEUR_VERDICT[sel.verdict] }}>
                <i aria-hidden="true" />
                {LIBELLES_VERDICT[sel.verdict]}
              </span>
              <button type="button" className="btn btn--ghost btn--petit" onClick={() => setChoisi(null)}>
                Fermer
              </button>
            </div>
            <ul>
              {sel.constats.map((c) => (
                <li key={c.texte} style={{ color: c.niveau === 'alerte' ? 'var(--level-elevee)' : c.niveau === 'vigilance' ? 'var(--level-moderee)' : undefined }}>
                  {c.texte}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="visuels__muet">Cliquez un point pour lire ce que les mesures disent du gaz prélevé.</p>
        )}
      </div>
    </div>
  )
}
