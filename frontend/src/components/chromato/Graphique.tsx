import { useState, type MouseEvent } from 'react'
import type { Distribution, Pic, Profil } from '../../lib/chromato/profil'
import type { Produit } from '../../lib/chromato/produits'
import { nombreFr } from '../../lib/format'
import { LIBELLES_CIBLE, SERIES, type CiblePic } from './constantes'


const L = 900
const H = 300
const M = { g: 44, d: 12, h: 34, b: 34 }

interface Echelle {
  x: (c: number) => number
  y: (v: number) => number
  inverseX: (px: number) => number
}

function echelle(c0: number, c1: number, ymax: number, l = L, h = H): Echelle {
  const x = (c: number) => M.g + ((c - c0) / (c1 - c0)) * (l - M.g - M.d)
  const y = (v: number) => h - M.b - (v / (ymax || 1)) * (h - M.b - M.h)
  return { x, y, inverseX: (px) => c0 + ((px - M.g) / (l - M.g - M.d)) * (c1 - c0) }
}

function chemin(c: number[], v: number[], e: Echelle, de: number, a: number): string {
  let d = ''
  for (let i = 0; i < c.length; i++) {
    if (c[i] < de || c[i] > a) continue
    d += `${d ? 'L' : 'M'}${e.x(c[i]).toFixed(1)},${e.y(v[i]).toFixed(1)}`
  }
  return d
}

function aire(c: number[], v: number[], e: Echelle, de: number, a: number): string {
  const idx = c.map((_, i) => i).filter((i) => c[i] >= de && c[i] <= a)
  if (!idx.length) return ''
  const haut = idx.map((i) => `${e.x(c[i]).toFixed(1)},${e.y(v[i]).toFixed(1)}`).join('L')
  return `M${e.x(c[idx[0]]).toFixed(1)},${e.y(0)}L${haut}L${e.x(c[idx[idx.length - 1]]).toFixed(1)},${e.y(0)}Z`
}

/** Position in SVG units of a mouse event (the SVG scales with its container). */
function versSvg(ev: MouseEvent<SVGSVGElement>, largeur: number): number {
  const r = ev.currentTarget.getBoundingClientRect()
  return ((ev.clientX - r.left) / r.width) * largeur
}

/** The digitised chromatogram on its carbon axis: signal, hump, n-alkanes, isoprenoids. */
export function GraphiqueProfil({ p, produit, pr, ph }: { p: Profil; produit: Produit | null; pr: Pic | null; ph: Pic | null }) {
  const [survol, setSurvol] = useState<number | null>(null)
  const c0 = 9.5
  const c1 = 40.5
  const ymax = Math.max(...p.signal.filter((_, i) => p.c[i] >= c0 && p.c[i] <= c1)) * 1.08
  const e = echelle(c0, c1, ymax)
  const iSurvol = survol === null ? -1 : p.c.findIndex((c) => c >= survol)
  const tick = (n: number) => (
    <g key={n}>
      <line x1={e.x(n)} x2={e.x(n)} y1={H - M.b} y2={H - M.b + (n % 5 === 0 ? 6 : 3)} stroke="var(--color-muted)" />
      {n % 5 === 0 && (
        <text x={e.x(n)} y={H - M.b + 18} textAnchor="middle" fontSize="11" fill="var(--color-muted)">
          C{n}
        </text>
      )}
    </g>
  )
  return (
    <figure className="chromato-figure">
      <svg
        viewBox={`0 0 ${L} ${H}`}
        role="img"
        aria-label="Chromatogramme numérisé sur l’axe des carbones"
        onMouseMove={(ev) => setSurvol(e.inverseX(versSvg(ev, L)))}
        onMouseLeave={() => setSurvol(null)}
      >
        {produit && (
          <g>
            <rect x={e.x(produit.plage[0])} y={M.h - 16} width={e.x(produit.plage[1]) - e.x(produit.plage[0])} height={6} rx={3} fill="var(--color-accent-soft)" stroke="var(--color-accent)" />
            <text x={e.x(produit.plage[0]) + 4} y={M.h - 22} fontSize="10" fill="var(--color-muted)">
              plage type : {produit.nom.split(',')[0].toLowerCase()}
            </text>
          </g>
        )}
        <line x1={M.g} x2={L - M.d} y1={H - M.b} y2={H - M.b} stroke="var(--color-border)" />
        {[10, 40].map((n) => (
          <line key={n} x1={e.x(n)} x2={e.x(n)} y1={M.h} y2={H - M.b} stroke="var(--color-border)" strokeDasharray="3 3" />
        ))}
        <path d={aire(p.c, p.ucm, e, c0, c1)} fill="#c9d6d3" />
        <path d={chemin(p.c, p.signal, e, c0, c1)} fill="none" stroke="var(--color-ink)" strokeWidth={1.2} />
        {Array.from({ length: 31 }, (_, i) => tick(10 + i))}
        {p.alcanes.map((a, n) =>
          a && n >= 10 && a.hauteur >= 0.02 * ymax ? (
            <g key={n}>
              <circle cx={e.x(a.c)} cy={e.y(a.brut) - 5} r={2.5} fill={SERIES[0]} />
              {(n % 2 === 0 || n === 17) && n <= 36 && (
                <text x={e.x(a.c)} y={e.y(a.brut) - 10} textAnchor="middle" fontSize="9" fill="var(--color-muted)">
                  {n}
                </text>
              )}
            </g>
          ) : null,
        )}
        {[
          [pr, 'Pr'],
          [ph, 'Ph'],
        ].map(([q, nom]) =>
          q ? (
            <g key={nom as string}>
              <circle cx={e.x((q as Pic).c)} cy={e.y((q as Pic).brut) - 5} r={3} fill={SERIES[1]} />
              <text x={e.x((q as Pic).c) + 5} y={e.y((q as Pic).brut) - 8} fontSize="10" fontWeight="700" fill="var(--color-ink)">
                {nom as string}
              </text>
            </g>
          ) : null,
        )}
        <text x={M.g - 6} y={M.h + 4} textAnchor="end" fontSize="10" fill="var(--color-muted)">
          signal
        </text>
        {p.etalons &&
          [10, 40].map((n) => (
            <text key={`etalon-${n}`} x={e.x(n) + (n === 10 ? 4 : -4)} y={M.h + 10} textAnchor={n === 10 ? 'start' : 'end'} fontSize="10" fill="var(--color-muted)">
              n-C{n} étalon retiré
            </text>
          ))}
        {iSurvol >= 0 && (
          <g pointerEvents="none">
            <line x1={e.x(p.c[iSurvol])} x2={e.x(p.c[iSurvol])} y1={M.h} y2={H - M.b} stroke="var(--color-muted)" strokeDasharray="2 2" />
            <rect x={Math.min(e.x(p.c[iSurvol]) + 6, L - 150)} y={M.h} width={140} height={34} rx={4} fill="var(--color-surface)" stroke="var(--color-border)" />
            <text x={Math.min(e.x(p.c[iSurvol]) + 12, L - 144)} y={M.h + 14} fontSize="11" fill="var(--color-ink)">
              C{nombreFr(p.c[iSurvol], 2)}
            </text>
            <text x={Math.min(e.x(p.c[iSurvol]) + 12, L - 144)} y={M.h + 28} fontSize="11" fill="var(--color-muted)">
              bosse {Math.round((p.ucm[iSurvol] / (p.signal[iSurvol] || 1)) * 100)} % du signal
            </text>
          </g>
        )}
      </svg>
      <figcaption className="chromato-legende">
        <span>
          <i style={{ background: 'var(--color-ink)', height: 2 }} /> signal au-dessus de la ligne de base
        </span>
        <span>
          <i style={{ background: '#c9d6d3' }} /> bosse non résolue (UCM)
        </span>
        <span>
          <i style={{ background: SERIES[0], borderRadius: '50%' }} /> n-alcanes (numéro du carbone)
        </span>
        <span>
          <i style={{ background: SERIES[1], borderRadius: '50%' }} /> pristane, phytane
        </span>
      </figcaption>
    </figure>
  )
}


/** C16–C19 enlarged, to check the isoprenoid doublets and pick their tops by hand. */
export function ZoomDoublets({
  p,
  pics,
  cible,
  onChoisir,
}: {
  p: Profil
  pics: Partial<Record<CiblePic, Pic | null>>
  cible: CiblePic | null
  onChoisir: (c: number) => void
}) {
  const l = 900
  const h = 220
  const c0 = 16.6
  const c1 = 18.5
  const ymax = Math.max(1e-9, ...p.signal.filter((_, i) => p.c[i] >= c0 && p.c[i] <= c1)) * 1.15
  const e = echelle(c0, c1, ymax, l, h)
  const repere = (c: number, nom: string) => (
    <g key={nom}>
      <line x1={e.x(c)} x2={e.x(c)} y1={M.h} y2={h - M.b} stroke="var(--color-border)" strokeDasharray="2 3" />
      <text x={e.x(c)} y={h - M.b + 16} textAnchor="middle" fontSize="11" fill="var(--color-muted)">
        {nom}
      </text>
    </g>
  )
  return (
    <svg
      viewBox={`0 0 ${l} ${h}`}
      className={`chromato-zoom${cible ? ' chromato-zoom--actif' : ''}`}
      role="img"
      aria-label="Agrandissement des doublets n-C17 / pristane et n-C18 / phytane"
      onClick={(ev) => cible && onChoisir(e.inverseX(versSvg(ev, l)))}
    >
      <line x1={M.g} x2={l - M.d} y1={h - M.b} y2={h - M.b} stroke="var(--color-border)" />
      {repere(17, 'C17')}
      {repere(17.07, 'Pr attendu')}
      {repere(18, 'C18')}
      {repere(18.11, 'Ph attendu')}
      <path d={aire(p.c, p.ucm, e, c0, c1)} fill="#c9d6d3" />
      <path d={chemin(p.c, p.signal, e, c0, c1)} fill="none" stroke="var(--color-ink)" strokeWidth={1.5} />
      {(Object.keys(LIBELLES_CIBLE) as CiblePic[]).map((k) => {
        const q = pics[k]
        if (!q) return null
        const couleur = k === 'pr' || k === 'ph' ? SERIES[1] : SERIES[0]
        return (
          <g key={k}>
            <line x1={e.x(q.c)} x2={e.x(q.c)} y1={e.y(q.brut)} y2={e.y(q.brut - q.hauteur)} stroke={couleur} strokeWidth={2} />
            <circle cx={e.x(q.c)} cy={e.y(q.brut)} r={4} fill={couleur} />
            <text x={e.x(q.c)} y={e.y(q.brut) - 8} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--color-ink)">
              {LIBELLES_CIBLE[k]}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/** Profiles of several samples by carbon number, each normalised to its own area. */
export function GraphiqueComparaison({ series }: { series: { nom: string; d: Distribution }[] }) {
  const [survol, setSurvol] = useState<number | null>(null)
  const parts = series.map((s) => s.d.bins.map((b) => (s.d.aire ? b.total / s.d.aire : 0)))
  const ymax = Math.max(1e-9, ...parts.flat()) * 1.1
  const e = echelle(9.5, 40.5, ymax)
  const n = survol === null ? null : Math.floor(survol)
  return (
    <figure className="chromato-figure">
      <svg
        viewBox={`0 0 ${L} ${H}`}
        role="img"
        aria-label="Profils des échantillons par nombre de carbones"
        onMouseMove={(ev) => setSurvol(e.inverseX(versSvg(ev, L)))}
        onMouseLeave={() => setSurvol(null)}
      >
        <line x1={M.g} x2={L - M.d} y1={H - M.b} y2={H - M.b} stroke="var(--color-border)" />
        {[10, 15, 20, 25, 30, 35, 40].map((k) => (
          <text key={k} x={e.x(k)} y={H - M.b + 18} textAnchor="middle" fontSize="11" fill="var(--color-muted)">
            C{k}
          </text>
        ))}
        <text x={4} y={M.h - 8} fontSize="10" fill="var(--color-muted)">
          % de l’aire par carbone
        </text>
        {parts.map((v, i) => (
          <path
            key={series[i].nom + i}
            d={v.map((y, k) => `${k ? 'L' : 'M'}${e.x(10.5 + k).toFixed(1)},${e.y(y).toFixed(1)}`).join('')}
            fill="none"
            stroke={SERIES[i % SERIES.length]}
            strokeWidth={2}
          />
        ))}
        {n !== null && n >= 10 && n < 40 && (
          <g pointerEvents="none">
            <line x1={e.x(n + 0.5)} x2={e.x(n + 0.5)} y1={M.h} y2={H - M.b} stroke="var(--color-muted)" strokeDasharray="2 2" />
            <rect x={Math.min(e.x(n + 0.5) + 6, L - 210)} y={M.h} width={200} height={18 + 15 * series.length} rx={4} fill="var(--color-surface)" stroke="var(--color-border)" />
            <text x={Math.min(e.x(n + 0.5) + 12, L - 204)} y={M.h + 14} fontSize="11" fontWeight="700" fill="var(--color-ink)">
              C{n} – C{n + 1}
            </text>
            {series.map((s, i) => (
              <g key={i}>
                <rect x={Math.min(e.x(n + 0.5) + 12, L - 204)} y={M.h + 21 + 15 * i} width={8} height={8} rx={2} fill={SERIES[i % SERIES.length]} />
                <text x={Math.min(e.x(n + 0.5) + 24, L - 192)} y={M.h + 29 + 15 * i} fontSize="11" fill="var(--color-ink)">
                  {s.nom.slice(0, 18)} : {nombreFr(parts[i][n - 10] * 100, 1)} %
                </text>
              </g>
            ))}
          </g>
        )}
      </svg>
      <figcaption className="chromato-legende">
        {series.map((s, i) => (
          <span key={i}>
            <i style={{ background: SERIES[i % SERIES.length] }} /> {s.nom}
          </span>
        ))}
      </figcaption>
    </figure>
  )
}
