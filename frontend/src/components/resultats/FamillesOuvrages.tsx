import { useMemo, useState, type ReactElement } from 'react'
import { acronyme } from '../../lib/resultats/acronymes'
import { convertir, volumeLitres, type Prelevement, type UniteSortie } from '../../lib/resultats/calc'
import { construireFamilles, type Mesure, type Noeud, type ResultatFamilles, type Trait, type Variable } from '../../lib/resultats/familles'
import type { Lecture } from '../../lib/resultats/parse'

const COULEURS = ['#00756a', '#2f5f9e', '#c96a1c', '#6b4c9a', '#9c3d2e', '#4a5a6b']
const ENCRE = '#0d2421'
const MUET = '#4f625f'
const GRILLE = '#e3e8e7'
const fr = (x: number, d = 1) => x.toLocaleString('fr-FR', { maximumFractionDigits: d })

const court = (v: Variable) => (v.groupe === 'compose' ? acronyme(v.libelle) : v.libelle)

/** z-score → diverging colour: blue below the mean, red above. */
function teinte(z: number): string {
  const t = Math.max(-1, Math.min(1, z / 2.5))
  const blanc = [247, 249, 249]
  const fin = t < 0 ? [47, 95, 158] : [195, 74, 53]
  const c = blanc.map((x, i) => Math.round(x + (fin[i] - x) * Math.abs(t)))
  return `rgb(${c.join(',')})`
}

function phrase(t: Trait[], haut: boolean): string {
  return t.map((x) => `${court(x.variable)} ${haut ? '↑' : '↓'}${Math.abs(x.z) >= 1.5 ? (haut ? '↑' : '↓') : ''}`).join(' · ')
}

/**
 * Families of wells or sampling points, from every compound analysed and
 * the field parameters: a map of the samples (two first principal axes)
 * with the variables that shape it, a card per family, and the dendrogram
 * with each sample's profile. A click on a sample tells what sets it apart.
 */
export function FamillesOuvrages({
  lecture,
  echantillons,
  conversion,
  terrain,
}: {
  lecture: Lecture
  echantillons: string[]
  conversion: { prelevements: Record<string, Prelevement>; unite: UniteSortie } | null
  /** Field parameters per sample (pH, redox, O2… or O2, CO2, PID). */
  terrain: { variables: Variable[]; mesures: Record<string, Record<string, Mesure>> } | null
}) {
  const [kChoisi, setK] = useState<number | null>(null)
  const [choisi, setChoisi] = useState<string | null>(null)
  const [avecTerrain, setAvecTerrain] = useState(true)

  const entree = useMemo(() => {
    const vide: Prelevement = { duree: null, debitDebut: null, debitFin: null }
    const composes = lecture.parametres.CM.filter((p) => !p.somme && /g\s*\//i.test(p.unite))
    const variables: Variable[] = composes.map((p) => ({ cle: p.cle, libelle: p.nom, groupe: 'compose', unite: conversion ? conversion.unite : p.unite, log: true }))
    const mesures: Record<string, Record<string, Mesure>> = {}
    for (const e of echantillons) {
      mesures[e] = {}
      for (const p of composes) {
        const m = lecture.valeurs.CM[e]?.[p.cle]
        const v = conversion ? convertir(m, p, volumeLitres(conversion.prelevements[e] ?? vide), conversion.unite) : m && m.valeur !== null ? { valeur: m.valeur, inferieur: m.inferieur } : null
        if (v && v.valeur > 0) mesures[e][p.cle] = v
      }
      if (avecTerrain && terrain) Object.assign(mesures[e], terrain.mesures[e] ?? {})
    }
    return { echantillons, variables: [...(avecTerrain && terrain ? terrain.variables : []), ...variables], mesures }
  }, [lecture, echantillons, conversion, terrain, avecTerrain])

  const r = useMemo(() => construireFamilles(entree, kChoisi ?? undefined), [entree, kChoisi])
  if (!r) {
    return <p className="visuels__muet">Il faut au moins trois échantillons et deux paramètres variables pour former des familles.</p>
  }
  const nTerrain = r.variables.filter((v) => v.groupe === 'terrain').length
  const iChoisi = choisi ? r.echantillons.indexOf(choisi) : -1

  return (
    <div className="familles">
      <div className="familles__outils">
        <div className="pfas-segment" role="group" aria-label="Nombre de familles">
          <button type="button" className={kChoisi === null ? 'actif' : ''} onClick={() => setK(null)} title="Nombre de familles choisi par la silhouette moyenne">
            Auto{kChoisi === null ? ` (${r.k})` : ''}
          </button>
          {r.silhouettes.map((s) => (
            <button key={s.k} type="button" className={kChoisi === s.k ? 'actif' : ''} onClick={() => setK(s.k)} title={`Silhouette moyenne ${fr(s.s, 2)}`}>
              {s.k}
            </button>
          ))}
        </div>
        <span className="carte__compte">
          {r.k} familles · silhouette {fr(r.silhouette, 2)} · {r.variables.length - nTerrain} composés{nTerrain ? ` + ${nTerrain} paramètres de terrain` : ''}
        </span>
        {terrain && (
          <label className="familles__case">
            <input type="checkbox" checked={avecTerrain} onChange={(e) => setAvecTerrain(e.target.checked)} /> Avec les paramètres de terrain
          </label>
        )}
      </div>

      <div className="familles__grille">
        <CarteFamilles r={r} choisi={iChoisi} onChoisir={(i) => setChoisi(i === iChoisi ? null : r.echantillons[i])} />
        <div className="familles__cartes">
          {r.familles.map((f) => (
            <div key={f.id} className="famille" style={{ ['--famille' as string]: COULEURS[f.id % COULEURS.length] }}>
              <div className="famille__tete">
                <strong>{f.nom}</strong>
                <span>
                  {f.membres.length} point{f.membres.length > 1 ? 's' : ''}
                </span>
              </div>
              {f.hauts.length > 0 && (
                <p>
                  <em>Plus fort :</em> {phrase(f.hauts, true)}
                </p>
              )}
              {f.bas.length > 0 && (
                <p>
                  <em>Plus faible :</em> {phrase(f.bas, false)}
                </p>
              )}
              {!f.hauts.length && !f.bas.length && <p>Proche de la moyenne de la campagne.</p>}
              <div className="famille__membres">
                {f.membres.map((m) => (
                  <button key={m} type="button" className={`chip${choisi === m ? ' chip--actif' : ''}`} onClick={() => setChoisi(choisi === m ? null : m)}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {iChoisi >= 0 && <DetailEchantillon r={r} i={iChoisi} onFermer={() => setChoisi(null)} />}

      <details className="sous-volet">
        <summary>Dendrogramme et profil de chaque point</summary>
        <Profils r={r} choisi={iChoisi} onChoisir={(i) => setChoisi(r.echantillons[i])} />
      </details>
      <p className="visuels__muet">
        Méthode : composés en logarithme (résultat &lt; LQ à la moitié de la LQ), paramètres de terrain tels que mesurés ; chaque variable centrée-réduite,
        composés et paramètres de terrain à poids égal ; classification ascendante hiérarchique (critère de Ward), nombre de familles choisi par la
        silhouette moyenne ; carte des deux premiers axes d’une analyse en composantes principales. Des familles proches ne signifient pas une même source :
        elles invitent à la vérifier sur le terrain et dans l’historique du site.
      </p>
    </div>
  )
}

/** Samples on the two first principal axes, a hull per family, the variables as arrows. */
function CarteFamilles({ r, choisi, onChoisir }: { r: ResultatFamilles; choisi: number; onChoisir: (i: number) => void }) {
  const L = 560
  const H = 400
  const m = 34
  const xs = r.coords.map((c) => c[0])
  const ys = r.coords.map((c) => c[1])
  const etendue = (v: number[]) => {
    const a = Math.min(...v)
    const b = Math.max(...v)
    const marge = (b - a || 1) * 0.12
    return [a - marge, b + marge] as const
  }
  const [x0, x1] = etendue(xs)
  const [y0, y1] = etendue(ys)
  const X = (v: number) => m + ((v - x0) / (x1 - x0)) * (L - 2 * m)
  const Y = (v: number) => H - m - ((v - y0) / (y1 - y0)) * (H - 2 * m)
  const cx = X(0)
  const cy = Y(0)
  const rayon = Math.min(L, H) / 2 - m - 10
  const fleches = [...r.charges].sort((a, b) => b.x ** 2 + b.y ** 2 - (a.x ** 2 + a.y ** 2)).slice(0, 7)
  // Arrow labels moved down a line when they would overlap one already placed.
  const placees: { x: number; y: number; l: number }[] = []
  const libelles = new Map<string, { x: number; y: number }>()
  for (const { variable, x, y } of fleches) {
    const l = court(variable).length * 6.4 + 4
    const ex = cx + x * rayon + (x >= 0 ? 4 : -4)
    const bx = x >= 0 ? ex : ex - l
    let ey = cy - y * rayon + (y >= 0 ? -4 : 11)
    for (let k = 0; k < 8 && placees.some((q) => Math.abs(q.y - ey) < 11 && bx < q.x + q.l && bx + l > q.x); k++) ey += y >= 0 ? -11 : 11
    placees.push({ x: bx, y: ey, l })
    libelles.set(variable.cle, { x: ex, y: ey })
  }

  const enveloppe = (pts: [number, number][]): [number, number][] => {
    if (pts.length < 3) return pts
    const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1])
    const croix = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    const bas: [number, number][] = []
    for (const q of p) {
      while (bas.length >= 2 && croix(bas[bas.length - 2], bas[bas.length - 1], q) <= 0) bas.pop()
      bas.push(q)
    }
    const haut: [number, number][] = []
    for (const q of [...p].reverse()) {
      while (haut.length >= 2 && croix(haut[haut.length - 2], haut[haut.length - 1], q) <= 0) haut.pop()
      haut.push(q)
    }
    return [...bas.slice(0, -1), ...haut.slice(0, -1)]
  }

  return (
    <figure className="visuels__figure">
      <figcaption>
        Carte des points de prélèvement
        <span>
          Deux premiers axes : {fr(r.inerties[0], 0)} % et {fr(r.inerties[1], 0)} % de l’information. Les flèches montrent les paramètres qui
          séparent les points : un point est riche dans la direction d’une flèche.
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${L} ${H}`} role="img" aria-label="Carte des familles de points de prélèvement">
        <line x1={m} x2={L - m} y1={cy} y2={cy} stroke={GRILLE} />
        <line x1={cx} x2={cx} y1={m} y2={H - m} stroke={GRILLE} />
        {r.familles.map((f) => {
          const pts = r.echantillons
            .map((_, i) => (r.groupes[i] === f.id ? ([X(r.coords[i][0]), Y(r.coords[i][1])] as [number, number]) : null))
            .filter((p): p is [number, number] => !!p)
          const h = enveloppe(pts)
          const c = COULEURS[f.id % COULEURS.length]
          return h.length >= 3 ? (
            <polygon key={f.id} points={h.map((p) => p.join(',')).join(' ')} fill={c} fillOpacity={0.08} stroke={c} strokeOpacity={0.45} strokeWidth={1.5} strokeLinejoin="round" />
          ) : null
        })}
        {fleches.map(({ variable, x, y }) => {
          const ex = cx + x * rayon
          const ey = cy - y * rayon
          return (
            <g key={variable.cle} opacity={0.75}>
              <line x1={cx} y1={cy} x2={ex} y2={ey} stroke={variable.groupe === 'terrain' ? '#c96a1c' : MUET} strokeWidth={1.2} markerEnd="url(#fleche)" />
              <text x={libelles.get(variable.cle)!.x} y={libelles.get(variable.cle)!.y} fontSize="10.5" fill={variable.groupe === 'terrain' ? '#9c4f12' : MUET} textAnchor={x >= 0 ? 'start' : 'end'} className="halo">
                {court(variable)}
              </text>
            </g>
          )
        })}
        <defs>
          <marker id="fleche" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={MUET} />
          </marker>
        </defs>
        {r.echantillons.map((e, i) => {
          const actif = i === choisi
          const c = COULEURS[r.groupes[i] % COULEURS.length]
          return (
            <g key={e} className="visuels__point" role="button" tabIndex={0} onClick={() => onChoisir(i)} onKeyDown={(k) => k.key === 'Enter' && onChoisir(i)}>
              <circle cx={X(r.coords[i][0])} cy={Y(r.coords[i][1])} r={actif ? 8 : 5.5} fill={c} stroke={actif ? ENCRE : '#fff'} strokeWidth={actif ? 2.5 : 1.2} />
              {(actif || r.echantillons.length <= 15) && (
                <text x={X(r.coords[i][0]) + 8} y={Y(r.coords[i][1]) + 4} fontSize="11" fontWeight={actif ? 700 : 500} fill={ENCRE} className="halo">
                  {e}
                </text>
              )}
              <title>{`${e} — ${r.familles.find((f) => f.id === r.groupes[i])?.nom}`}</title>
            </g>
          )
        })}
      </svg>
      <p className="visuels__legende">
        <span style={{ color: MUET }}>→ composés</span>
        <span style={{ color: '#9c4f12' }}>→ paramètres de terrain</span>
      </p>
    </figure>
  )
}

function DetailEchantillon({ r, i, onFermer }: { r: ResultatFamilles; i: number; onFermer: () => void }) {
  const f = r.familles.find((x) => x.id === r.groupes[i])!
  const traits = r.variables.map((v, j) => ({ variable: v, z: r.z[i][j] }))
  const hauts = traits.filter((t) => t.z >= 1).sort((a, b) => b.z - a.z).slice(0, 4)
  const bas = traits.filter((t) => t.z <= -1).sort((a, b) => a.z - b.z).slice(0, 3)
  const d = (j: number) => Math.hypot(r.coords[i][0] - r.coords[j][0], r.coords[i][1] - r.coords[j][1])
  const voisins = r.echantillons
    .map((e, j) => ({ e, j }))
    .filter((x) => x.j !== i)
    .sort((a, b) => d(a.j) - d(b.j))
    .slice(0, 3)
  return (
    <div className="visuels__detail" aria-live="polite">
      <div className="visuels__detail-tete">
        <strong>{r.echantillons[i]}</strong>
        <span className="puce" style={{ ['--puce' as string]: COULEURS[f.id % COULEURS.length] }}>
          <i aria-hidden="true" />
          {f.nom}
        </span>
        <span className="puce puce--neutre">Points les plus proches : {voisins.map((v) => v.e).join(', ')}</span>
        <button type="button" className="btn btn--ghost btn--petit" onClick={onFermer}>
          Fermer
        </button>
      </div>
      <p>
        {hauts.length ? (
          <>
            Nettement au-dessus de la moyenne de la campagne : <strong>{phrase(hauts, true)}</strong>.{' '}
          </>
        ) : null}
        {bas.length ? (
          <>
            Nettement en dessous : <strong>{phrase(bas, false)}</strong>.
          </>
        ) : null}
        {!hauts.length && !bas.length && 'Profil proche de la moyenne de la campagne.'}
      </p>
    </div>
  )
}

/** Dendrogram (left) and each sample's profile as z-scores (right). */
function Profils({ r, choisi, onChoisir }: { r: ResultatFamilles; choisi: number; onChoisir: (i: number) => void }) {
  const h = 16
  const larg = 13
  const dendro = 120
  const nomL = 70
  const ordreVar = r.variables
    .map((v, j) => ({ v, j, s: r.familles.reduce((m, f) => Math.max(m, ...[...f.hauts, ...f.bas].filter((t) => t.variable.cle === v.cle).map((t) => Math.abs(t.z)), 0), 0) }))
    .sort((a, b) => (a.v.groupe === b.v.groupe ? b.s - a.s : a.v.groupe === 'terrain' ? -1 : 1))
  const L = dendro + nomL + ordreVar.length * larg + 10
  const H = 70 + r.ordre.length * h
  const haut = 70
  const position = new Map(r.ordre.map((iEch, k) => [iEch, k]))
  const hMax = r.arbre.hauteur || 1
  const x = (hauteur: number) => dendro - 6 - (hauteur / hMax) * (dendro - 12)
  const lignes: ReactElement[] = []
  const tracer = (n: Noeud): { x: number; y: number } => {
    if (n.feuille !== undefined) return { x: dendro - 6, y: haut + position.get(n.feuille)! * h + h / 2 }
    const a = tracer(n.gauche!)
    const b = tracer(n.droite!)
    const xn = x(n.hauteur)
    lignes.push(<path key={lignes.length} d={`M${a.x},${a.y} H${xn} V${b.y} H${b.x}`} fill="none" stroke={MUET} strokeWidth={1} />)
    return { x: xn, y: (a.y + b.y) / 2 }
  }
  tracer(r.arbre)
  return (
    <div className="familles__profils">
      <svg viewBox={`0 0 ${L} ${H}`} style={{ minWidth: `${Math.min(L, 900)}px` }} role="img" aria-label="Dendrogramme et profils des points">
        {lignes}
        {ordreVar.map(({ v }, k) => (
          <text key={v.cle} x={dendro + nomL + k * larg + larg / 2} y={haut - 6} fontSize="9.5" fill={v.groupe === 'terrain' ? '#9c4f12' : MUET} transform={`rotate(-60 ${dendro + nomL + k * larg + larg / 2} ${haut - 6})`}>
            {court(v)}
          </text>
        ))}
        {r.ordre.map((i, k) => (
          <g key={i} className="visuels__point" onClick={() => onChoisir(i)}>
            <rect x={dendro} y={haut + k * h + 1} width={4} height={h - 2} fill={COULEURS[r.groupes[i] % COULEURS.length]} />
            <text x={dendro + 8} y={haut + k * h + h / 2 + 4} fontSize="10.5" fontWeight={i === choisi ? 700 : 500} fill={ENCRE}>
              {r.echantillons[i]}
            </text>
            {ordreVar.map(({ v, j }, c) => (
              <rect key={v.cle} x={dendro + nomL + c * larg} y={haut + k * h + 1} width={larg - 1.5} height={h - 2} rx={2} fill={teinte(r.z[i][j])}>
                <title>{`${r.echantillons[i]} — ${v.libelle} : ${fr(r.z[i][j], 1)} écart-type par rapport à la moyenne`}</title>
              </rect>
            ))}
            {i === choisi && <rect x={dendro + nomL - 2} y={haut + k * h} width={ordreVar.length * larg + 2} height={h} fill="none" stroke={ENCRE} strokeWidth={1.5} rx={2} />}
          </g>
        ))}
      </svg>
      <p className="visuels__legende">
        <span style={{ background: teinte(-2.5), color: '#fff' }}>bien en dessous de la moyenne</span>
        <span style={{ background: teinte(0) }}>moyenne</span>
        <span style={{ background: teinte(2.5), color: '#fff' }}>bien au-dessus</span>
      </p>
    </div>
  )
}
