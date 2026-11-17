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
const GRILLE = '#e3e8e7'

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
      <div className="visuels__grille">
        <DiagrammeRedox points={points} choisi={choisi} onChoisir={setChoisi} />
        <MatricePurges points={points} choisi={choisi} onChoisir={setChoisi} />
      </div>
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

/** O2 dissolved (x) against measured redox (y), zones of the USEPA 1998 thresholds. */
function DiagrammeRedox({ points, choisi, onChoisir }: { points: Point[]; choisi: string | null; onChoisir: (c: string) => void }) {
  const L = 460
  const H = 320
  const g = 52
  const d = 16
  const h = 18
  const b = 44
  const mesures = points.filter((p) => p.od !== null && p.orp !== null)
  const xMax = Math.max(8, ...mesures.map((p) => p.od! * 1.1))
  const yMin = Math.min(-250, ...mesures.map((p) => p.orp! - 30))
  const yMax = Math.max(250, ...mesures.map((p) => p.orp! + 30))
  const x = (v: number) => g + (v / xMax) * (L - g - d)
  const y = (v: number) => h + ((yMax - v) / (yMax - yMin)) * (H - h - b)
  const cohvMax = Math.max(...points.map((p) => p.cohv), 0)
  const rayon = (p: Point) => (cohvMax > 0 ? 6 + 10 * Math.sqrt(p.cohv / cohvMax) : 8)
  const zone = (x0: number, x1: number, y0: number, y1: number, fond: string, texte: string, tx: number, ty: number) => (
    <g>
      <rect x={x(x0)} y={y(y1)} width={x(x1) - x(x0)} height={y(y0) - y(y1)} fill={fond} />
      <text x={tx} y={ty} fontSize="10.5" fill={MUET}>
        {texte}
      </text>
    </g>
  )
  const ticksX = [0, 0.5, 2, 5, ...(xMax > 10 ? [10] : [])].filter((v) => v <= xMax)
  const ticksY = [yMin, -100, 0, 50, 200, yMax].filter((v, i, a) => v >= yMin && v <= yMax && a.indexOf(v) === i).map((v) => Math.round(v))

  return (
    <figure className="visuels__figure">
      <figcaption>
        Oxygène dissous et potentiel redox
        <span>Taille des points : COHV quantifiés (µmol/l)</span>
      </figcaption>
      <svg viewBox={`0 0 ${L} ${H}`} role="img" aria-label="Diagramme oxygène dissous – potentiel redox des ouvrages">
        {zone(0, 0.5, yMin, -100, '#dbe5f3', 'Réducteur', x(0) + 4, y(yMin) - 6)}
        {zone(0, 0.5, -100, 50, '#e8f0f6', '', 0, 0)}
        {zone(2, xMax, 50, yMax, '#f7e8d6', 'Oxydant', x(xMax) - 52, y(yMax) + 14)}
        {[0.5, 2].map((v) => (
          <line key={v} x1={x(v)} x2={x(v)} y1={y(yMax)} y2={y(yMin)} stroke={GRILLE} strokeDasharray="3 3" />
        ))}
        {[-100, 50].map((v) => (
          <line key={v} x1={x(0)} x2={x(xMax)} y1={y(v)} y2={y(v)} stroke={GRILLE} strokeDasharray="3 3" />
        ))}
        <line x1={g} x2={L - d} y1={y(yMin)} y2={y(yMin)} stroke={MUET} />
        <line x1={g} x2={g} y1={y(yMin)} y2={y(yMax)} stroke={MUET} />
        {ticksX.map((v) => (
          <text key={v} x={x(v)} y={H - b + 16} fontSize="10.5" fill={MUET} textAnchor="middle">
            {fr(v)}
          </text>
        ))}
        {ticksY.map((v) => (
          <text key={v} x={g - 6} y={y(v) + 3.5} fontSize="10.5" fill={MUET} textAnchor="end">
            {v > 0 ? `+${v}` : v}
          </text>
        ))}
        <text x={(g + L - d) / 2} y={H - 6} fontSize="11" fill={ENCRE} textAnchor="middle">
          O₂ dissous (mg/l)
        </text>
        <text x={12} y={(h + H - b) / 2} fontSize="11" fill={ENCRE} textAnchor="middle" transform={`rotate(-90 12 ${(h + H - b) / 2})`}>
          Redox mesuré (mV, Ag/AgCl)
        </text>
        {mesures.map((p) => {
          const actif = p.cle === choisi
          return (
            <g key={p.cle} className="visuels__point" onClick={() => onChoisir(p.cle)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onChoisir(p.cle)}>
              <circle cx={x(p.od!)} cy={y(p.orp!)} r={rayon(p)} fill={COULEUR_ETAT[p.etat]} fillOpacity={actif ? 1 : 0.78} stroke={actif ? ENCRE : '#fff'} strokeWidth={actif ? 2.5 : 1.5} />
              <text x={x(p.od!) + rayon(p) + 3} y={y(p.orp!) + 3.5} fontSize="10.5" fill={ENCRE} fontWeight={actif ? 700 : 500}>
                {p.nom}
              </text>
              <title>{`${p.nom} — ${LIBELLES_ETAT[p.etat]}\nO₂ ${fr(p.od!)} mg/l, redox ${fr(p.orp!, 0)} mV${p.cohv > 0 ? `\nCOHV ${fr(p.cohv, 2)} µmol/l` : ''}`}</title>
            </g>
          )
        })}
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
