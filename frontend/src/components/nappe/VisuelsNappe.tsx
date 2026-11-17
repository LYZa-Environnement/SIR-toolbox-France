import { useMemo, useState } from 'react'
import type { Jeu } from '../../lib/nappe/donnees'
import { LIBELLES_FAVORABILITE, type Evaluation } from '../../lib/nappe/evaluation'
import { PARAMS_TERRAIN } from '../../lib/nappe/fiches'
import { LIBELLES_ETAT, ORDRE_ETATS, type Etat, type Synthese } from '../../lib/nappe/synthese'

/** The colours of the état badges, for the chart marks. */
const COULEUR_ETAT: Record<Etat, string> = {
  reducteur: '#2f5f9e',
  'faiblement-reducteur': '#4f8fb4',
  transition: '#7d8a8b',
  'moderement-oxydant': '#c9971f',
  oxydant: '#c96a1c',
  discordant: '#a3671a',
  indetermine: '#9aa3a2',
}

const ENCRE = '#0d2421'
const MUET = '#4f625f'

const fr = (x: number, d = 1) => x.toLocaleString('fr-FR', { maximumFractionDigits: d })
const parNom = (a: string, b: string) => a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' })

const STAB = {
  stable: { libelle: 'Stable', fond: '#ddf0e4', texte: '#1f6b45' },
  instable: { libelle: 'Non stabilisé', fond: '#fce8c8', texte: '#8a5300' },
  insuffisant: { libelle: '< 3 lectures', fond: '#eceae0', texte: '#5c6b5e' },
} as const

interface Point {
  cle: string
  nom: string
  od: number | null
  orp: number | null
  etat: Etat
  description: string
  cohv: number
  e: Evaluation
}

/**
 * The aquifer at a glance, from the sampling sheets and the lab: each well
 * on the oxygen–redox plane (zones of the USEPA 1998 thresholds), the
 * stabilisation of its purge, and — on click — what it tells.
 */
export function VisuelsNappe({ jeu, evaluations, synthese }: { jeu: Jeu; evaluations: Evaluation[]; synthese: Synthese }) {
  const [choisi, setChoisi] = useState<string | null>(null)
  const points = useMemo((): Point[] => {
    const desc = new Map(synthese.classement.map((c) => [c.cle, c]))
    return evaluations
      .map((e) => {
        const v = jeu.valeurs[e.ouvrage.cle] ?? {}
        const c = desc.get(e.ouvrage.cle)
        return {
          cle: e.ouvrage.cle,
          nom: e.ouvrage.nom,
          od: v.od?.valeur ?? null,
          orp: v.orp?.valeur ?? null,
          etat: c?.etat ?? 'indetermine',
          description: c?.description ?? '',
          cohv: e.cohvMolaire,
          e,
        }
      })
      .sort((a, b) => parNom(a.nom, b.nom))
  }, [jeu, evaluations, synthese])
  if (!points.length) return null

  const comptes = ORDRE_ETATS.map((etat) => ({ etat, n: points.filter((p) => p.etat === etat).length })).filter((x) => x.n)
  const sel = points.find((p) => p.cle === choisi) ?? null

  return (
    <div className="visuels">
      <div className="visuels__puces" aria-label="États physico-chimiques">
        {comptes.map(({ etat, n }) => (
          <span key={etat} className="puce" style={{ ['--puce' as string]: COULEUR_ETAT[etat] }}>
            <i aria-hidden="true" />
            {LIBELLES_ETAT[etat]} <strong>{n}</strong>
          </span>
        ))}
      </div>
      <DiagrammeRedox points={points} choisi={choisi} onChoisir={setChoisi} />
      <MatricePurges points={points} choisi={choisi} onChoisir={setChoisi} />
      <div className="visuels__detail" aria-live="polite">
        {sel ? (
          <>
            <div className="visuels__detail-tete">
              <strong>{sel.nom}</strong>
              <span className="puce" style={{ ['--puce' as string]: COULEUR_ETAT[sel.etat] }}>
                <i aria-hidden="true" />
                {LIBELLES_ETAT[sel.etat]}
              </span>
              <span className="puce puce--neutre">Déchloration : {LIBELLES_FAVORABILITE[sel.e.lecture.conditions].toLowerCase()}</span>
              {sel.e.redox.processus && <span className="puce puce--neutre">Processus redox : {sel.e.redox.processus}</span>}
              {sel.cohv > 0 && <span className="puce puce--neutre">COHV {fr(sel.cohv, 2)} µmol/l</span>}
              <button type="button" className="btn btn--ghost btn--petit" onClick={() => setChoisi(null)}>
                Fermer
              </button>
            </div>
            <p>{sel.description}</p>
            {sel.e.lecture.conclusion && <p className="visuels__muet">{sel.e.lecture.conclusion}</p>}
            {sel.e.alertes.filter((a) => a.niveau !== 'info').length > 0 && (
              <ul>
                {sel.e.alertes
                  .filter((a) => a.niveau !== 'info')
                  .map((a) => (
                    <li key={a.texte} style={{ color: a.niveau === 'alerte' ? 'var(--level-elevee)' : 'var(--level-moderee)' }}>
                      {a.texte}
                    </li>
                  ))}
              </ul>
            )}
          </>
        ) : (
          <p className="visuels__muet">Cliquez un ouvrage sur le diagramme ou dans la matrice des purges pour lire ses conditions.</p>
        )}
      </div>
    </div>
  )
}

/** O2 dissolved (x, square-root scale) against measured redox (y), zones of the USEPA 1998 thresholds. */
function DiagrammeRedox({ points, choisi, onChoisir }: { points: Point[]; choisi: string | null; onChoisir: (c: string) => void }) {
  const [survol, setSurvol] = useState<string | null>(null)
  const L = 820
  const H = 440
  const g = 70
  const d = 185
  const h = 30
  const b = 52
  const mesures = points.filter((p) => p.od !== null && p.orp !== null)
  const xMax = Math.max(10, ...mesures.map((p) => p.od! * 1.15))
  const yMin = Math.min(-300, Math.floor((Math.min(...mesures.map((p) => p.orp!)) - 40) / 50) * 50)
  const yMax = Math.max(300, Math.ceil((Math.max(...mesures.map((p) => p.orp!)) + 40) / 50) * 50)
  // Square-root scale: the low oxygen values, where reducing conditions are decided, get room.
  const x = (v: number) => g + (Math.sqrt(Math.max(0, v)) / Math.sqrt(xMax)) * (L - g - d)
  const y = (v: number) => h + ((yMax - v) / (yMax - yMin)) * (H - h - b)
  const cohvMax = Math.max(...points.map((p) => p.cohv), 0)
  const rayon = (p: Point) => (cohvMax > 0 ? 7 + 13 * Math.sqrt(p.cohv / cohvMax) : 9)

  const ZONES = [
    { x0: 0, x1: 0.5, y0: yMin, y1: -100, fond: '#cfdcef', nom: 'Réducteur', detail: 'O₂ < 0,5 mg/l, redox < −100 mV' },
    { x0: 0, x1: 0.5, y0: -100, y1: 50, fond: '#e1eaf4', nom: 'Anoxique, faiblement réducteur', detail: 'O₂ < 0,5 mg/l, redox de −100 à +50 mV' },
    { x0: 2, x1: xMax, y0: 50, y1: yMax, fond: '#f7e4cf', nom: 'Oxydant', detail: 'O₂ ≥ 2 mg/l, redox ≥ +50 mV' },
  ]

  // Labels placed right of their point, else left, above or below, avoiding each other.
  const places: { x: number; y: number; l: number }[] = []
  const etiquettes = new Map<string, { x: number; y: number; ancre: 'start' | 'end' | 'middle' }>()
  for (const p of [...mesures].sort((a, c) => rayon(c) - rayon(a))) {
    const px = x(p.od!)
    const py = y(p.orp!)
    const r = rayon(p)
    const l = p.nom.length * 7 + 6
    const essais: { x: number; y: number; ancre: 'start' | 'end' | 'middle'; bx: number }[] = [
      { x: px + r + 4, y: py + 4, ancre: 'start', bx: px + r + 4 },
      { x: px - r - 4, y: py + 4, ancre: 'end', bx: px - r - 4 - l },
      { x: px, y: py - r - 6, ancre: 'middle', bx: px - l / 2 },
      { x: px, y: py + r + 14, ancre: 'middle', bx: px - l / 2 },
    ]
    const libre = essais.find((e) => !places.some((q) => Math.abs(q.y - e.y) < 13 && e.bx < q.x + q.l && e.bx + l > q.x)) ?? essais[0]
    places.push({ x: libre.bx, y: libre.y, l })
    etiquettes.set(p.cle, libre)
  }

  const ticksX = [0, 0.5, 1, 2, 5, 10, 20].filter((v) => v <= xMax)
  const ticksY: number[] = []
  for (let v = Math.ceil(yMin / 100) * 100; v <= yMax; v += 100) ticksY.push(v)
  const etats = ORDRE_ETATS.filter((e) => points.some((p) => p.etat === e))

  return (
    <figure className="visuels__figure visuels__figure--large">
      <figcaption>
        Oxygène dissous et potentiel redox
        <span>Chaque ouvrage selon ses deux mesures de fin de purge ; la couleur dit son état, la taille ses COHV. Cliquez un point pour sa lecture.</span>
      </figcaption>
      <svg viewBox={`0 0 ${L} ${H}`} role="img" aria-label="Diagramme oxygène dissous – potentiel redox des ouvrages">
        <rect x={x(0)} y={y(yMax)} width={x(xMax) - x(0)} height={y(yMin) - y(yMax)} fill="#f3f5f4" />
        {ZONES.map((z) => (
          <rect key={z.nom} x={x(z.x0)} y={y(Math.min(z.y1, yMax))} width={x(Math.min(z.x1, xMax)) - x(z.x0)} height={y(Math.max(z.y0, yMin)) - y(Math.min(z.y1, yMax))} fill={z.fond}>
            <title>{`${z.nom} : ${z.detail}`}</title>
          </rect>
        ))}
        {ticksY.map((v) => (
          <g key={v}>
            <line x1={x(0)} x2={x(xMax)} y1={y(v)} y2={y(v)} stroke="#fff" strokeWidth={1} />
            <text x={g - 8} y={y(v) + 4} fontSize="12" fill={MUET} textAnchor="end">
              {v > 0 ? `+${v}` : v}
            </text>
          </g>
        ))}
        {ticksX.map((v) => (
          <g key={v}>
            <line x1={x(v)} x2={x(v)} y1={y(yMax)} y2={y(yMin)} stroke="#fff" strokeWidth={1} />
            <text x={x(v)} y={H - b + 18} fontSize="12" fill={MUET} textAnchor="middle">
              {fr(v)}
            </text>
          </g>
        ))}
        {[0.5, 2].map((v) => (
          <g key={v}>
            <line x1={x(v)} x2={x(v)} y1={y(yMax)} y2={y(yMin)} stroke={ENCRE} strokeOpacity={0.45} strokeDasharray="5 4" />
            <text x={x(v)} y={h - 8} fontSize="11.5" fill={ENCRE} textAnchor="middle" fontWeight={600}>
              {fr(v)} mg/l
            </text>
          </g>
        ))}
        {[-100, 50].map((v) => (
          <g key={v}>
            <line x1={x(0)} x2={x(xMax)} y1={y(v)} y2={y(v)} stroke={ENCRE} strokeOpacity={0.45} strokeDasharray="5 4" />
            <text x={x(xMax) + 6} y={y(v) + 4} fontSize="11.5" fill={ENCRE} fontWeight={600}>
              {v > 0 ? `+${v}` : `−${-v}`} mV
            </text>
          </g>
        ))}
        <text x={x(0) + 6} y={y(Math.max(yMin, -300)) - 8} fontSize="12.5" fontWeight={700} fill="#1d3f72" className="halo">
          Réducteur
        </text>
        <text x={x(0) + 6} y={y(50) + 16} fontSize="11.5" fontWeight={600} fill="#285e7d" className="halo">
          Anoxique
        </text>
        <text x={x(xMax) - 8} y={y(yMax) + 18} fontSize="12.5" fontWeight={700} fill="#8a4a0c" textAnchor="end" className="halo">
          Oxydant
        </text>
        <text x={(x(0.5) + x(2)) / 2} y={y(yMax) + 18} fontSize="11.5" fontWeight={600} fill={MUET} textAnchor="middle" className="halo">
          Transition
        </text>
        <text x={(g + L - d) / 2} y={H - 10} fontSize="12.5" fill={ENCRE} textAnchor="middle">
          O₂ dissous (mg/l, échelle racine carrée)
        </text>
        <text x={16} y={(h + H - b) / 2} fontSize="12.5" fill={ENCRE} textAnchor="middle" transform={`rotate(-90 16 ${(h + H - b) / 2})`}>
          Redox mesuré (mV, Ag/AgCl)
        </text>
        {mesures.map((p) => {
          const actif = p.cle === choisi || p.cle === survol
          const et = etiquettes.get(p.cle)!
          return (
            <g
              key={p.cle}
              className="visuels__point"
              onClick={() => onChoisir(p.cle)}
              onMouseEnter={() => setSurvol(p.cle)}
              onMouseLeave={() => setSurvol(null)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onChoisir(p.cle)}
            >
              <circle
                cx={x(p.od!)}
                cy={y(p.orp!)}
                r={rayon(p)}
                fill={COULEUR_ETAT[p.etat]}
                fillOpacity={choisi && !actif ? 0.35 : 0.88}
                stroke={actif ? ENCRE : '#fff'}
                strokeWidth={actif ? 2.5 : 1.5}
              />
              <text x={et.x} y={et.y} fontSize="12" fill={ENCRE} fontWeight={actif ? 700 : 600} textAnchor={et.ancre} className="halo">
                {p.nom}
              </text>
              <title>{`${p.nom} — ${LIBELLES_ETAT[p.etat]}\nO₂ ${fr(p.od!)} mg/l, redox ${fr(p.orp!, 0)} mV${p.cohv > 0 ? `\nCOHV ${fr(p.cohv, 2)} µmol/l` : ''}`}</title>
            </g>
          )
        })}
        <g transform={`translate(${L - d + 64}, ${h + 70})`}>
          <text fontSize="11.5" fontWeight={700} fill={ENCRE}>
            État
          </text>
          {etats.map((e, k) => (
            <g key={e} transform={`translate(0, ${16 + k * 18})`}>
              <circle cx={6} cy={-4} r={6} fill={COULEUR_ETAT[e]} />
              <text x={16} y={0} fontSize="11" fill={ENCRE}>
                {LIBELLES_ETAT[e].replace(/ \(.*\)/, '')}
              </text>
            </g>
          ))}
          {cohvMax > 0 && (
            <g transform={`translate(0, ${30 + etats.length * 18})`}>
              <text fontSize="11.5" fontWeight={700} fill={ENCRE}>
                COHV (µmol/l)
              </text>
              {[cohvMax, cohvMax / 4].map((v, k) => (
                <g key={k} transform={`translate(${10}, ${26 + k * 34})`}>
                  <circle cx={0} cy={0} r={7 + 13 * Math.sqrt(v / cohvMax)} fill="none" stroke={MUET} />
                  <text x={24} y={4} fontSize="11" fill={MUET}>
                    {fr(v, 2)}
                  </text>
                </g>
              ))}
            </g>
          )}
        </g>
      </svg>
      {mesures.length < points.length && (
        <p className="visuels__muet">Sans O₂ ou redox mesuré : {points.filter((p) => p.od === null || p.orp === null).map((p) => p.nom).join(', ')}.</p>
      )}
    </figure>
  )
}

/** Stabilisation of each field parameter over the last three readings, well by well. */
function MatricePurges({ points, choisi, onChoisir }: { points: Point[]; choisi: string | null; onChoisir: (c: string) => void }) {
  const avecFiche = points.filter((p) => p.e.ouvrage.fiche && !p.e.ouvrage.fiche.vide)
  if (!avecFiche.length) return null
  const stables = avecFiche.filter((p) => {
    const st = Object.values(p.e.ouvrage.fiche!.stabilite)
    return st.length && st.every((x) => x === 'stable')
  }).length
  return (
    <figure className="visuels__figure">
      <figcaption>
        Qualité des purges
        <span>
          {stables} purge{stables > 1 ? 's' : ''} stabilisée{stables > 1 ? 's' : ''} sur {avecFiche.length} — trois dernières lectures, critères de la fiche
        </span>
      </figcaption>
      <div className="matrice" style={{ gridTemplateColumns: `minmax(4.5rem, auto) repeat(${PARAMS_TERRAIN.length}, minmax(2.4rem, 1fr))` }}>
        <span />
        {PARAMS_TERRAIN.map((p) => (
          <span key={p.id} className="matrice__entete" title={p.libelle}>
            {p.id === 'ph' ? 'pH' : p.id === 'orp' ? 'Redox' : p.id === 'od' ? 'O₂' : p.id === 'ce' ? 'Cond.' : 'T °C'}
          </span>
        ))}
        {avecFiche.map((p) => (
          <div key={p.cle} className={`matrice__ligne${p.cle === choisi ? ' matrice__ligne--active' : ''}`} onClick={() => onChoisir(p.cle)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onChoisir(p.cle)}>
            <span className="matrice__nom">{p.nom}</span>
            {PARAMS_TERRAIN.map((t) => {
              const st = p.e.ouvrage.fiche!.stabilite[t.id]
              const c = st ? STAB[st] : null
              return (
                <span key={t.id} className="matrice__case" style={{ background: c?.fond ?? '#f4f6f6', color: c?.texte ?? MUET }} title={`${p.nom} — ${t.libelle} : ${c?.libelle ?? 'non mesuré'}`}>
                  {st === 'stable' ? '✓' : st === 'instable' ? '!' : st ? '·' : '–'}
                </span>
              )
            })}
          </div>
        ))}
      </div>
      <p className="visuels__legende">
        <span style={{ background: STAB.stable.fond, color: STAB.stable.texte }}>✓ stable</span>
        <span style={{ background: STAB.instable.fond, color: STAB.instable.texte }}>! non stabilisé</span>
        <span style={{ background: STAB.insuffisant.fond, color: STAB.insuffisant.texte }}>· moins de 3 lectures</span>
      </p>
    </figure>
  )
}
