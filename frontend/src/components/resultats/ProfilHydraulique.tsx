import { useMemo, useState } from 'react'
import { acronyme } from '../../lib/resultats/acronymes'
import { LIBELLES_POSITION, type Position } from '../../lib/resultats/expert/amontAval'
import { ecartCharges, proposerPositions, type OuvrageHydro } from '../../lib/resultats/hydraulique'
import type { Lecture, Parametre } from '../../lib/resultats/parse'

type Guide = { valeur: number; source: string } | null

const ENCRE = '#0d2421'
const MUET = '#4f625f'
const EAU = '#2f5f9e'
const SOL = '#8a5a12'
const POS: Record<Position, string> = { amont: '#2f5f9e', droit: '#6b4c9a', aval: '#c96a1c', autre: '#9aa3a2' }
const fr = (x: number, d = 2) => x.toLocaleString('fr-FR', { maximumFractionDigits: d })
const frSig = (x: number) => x.toLocaleString('fr-FR', { maximumSignificantDigits: 3 })

/** Colour of a result against its comparison value (same classes as the results map). */
function couleur(v: number | null, inferieur: boolean, g: Guide): string {
  if (v === null) return '#e6eaea'
  if (inferieur) return '#d6dcdb'
  if (!g) return '#5b7fae'
  const r = v / g.valeur
  return r <= 0.5 ? '#7fcdb5' : r <= 1 ? '#3fae8c' : r <= 10 ? '#f0a742' : '#d9583b'
}

/**
 * The wells along the flow: a cross-section from the highest head
 * (upgradient, left) to the lowest (downgradient, right), with the
 * measuring points, the water levels and the piezometric line; above each
 * well, the chosen compound. Below, the main compounds from upgradient to
 * downgradient. A click on a well gives its figures and sets its position.
 */
export function ProfilHydraulique({
  ouvrages,
  lecture,
  guides,
  positions,
  onPositions,
}: {
  ouvrages: OuvrageHydro[]
  lecture: Lecture
  guides: Record<string, Guide>
  positions: Record<string, Position>
  onPositions: (p: Record<string, Position>) => void
}) {
  const tries = useMemo(() => [...ouvrages].sort((a, b) => b.charge - a.charge), [ouvrages])
  const echantillon = (o: OuvrageHydro) => o.echantillons[0]

  // Compounds worth showing: quantified somewhere, the most exceeded first.
  const composes = useMemo(() => {
    const liste = lecture.parametres.CM.filter((p) => !p.somme && /g\s*\//i.test(p.unite))
      .map((p) => {
        const g = guides[p.cle] ?? null
        let max = 0
        let quantifies = 0
        for (const o of tries) {
          const m = lecture.valeurs.CM[echantillon(o)]?.[p.cle]
          if (m && !m.inferieur && m.valeur !== null) {
            quantifies++
            max = Math.max(max, g ? m.valeur / g.valeur : m.valeur)
          }
        }
        return { p, g, max, quantifies }
      })
      .filter((x) => x.quantifies > 0)
    return liste.sort((a, b) => (a.g && b.g ? b.max - a.max : a.g ? -1 : b.g ? 1 : b.quantifies - a.quantifies))
  }, [lecture, guides, tries])
  const [cle, setCle] = useState<string | null>(null)
  const [choisi, setChoisi] = useState<string | null>(null)
  const compose = composes.find((c) => c.p.cle === cle) ?? composes[0] ?? null

  if (tries.length < 2) {
    return (
      <p className="visuels__muet">
        Profil hydraulique : il faut au moins deux ouvrages dont la fiche donne l’altitude NGF du repère de mesure et le niveau statique (ou la cote
        du niveau d’eau).
      </p>
    )
  }

  const ecart = ecartCharges(tries)!
  const proposees = proposerPositions(tries)
  const sel = tries.find((o) => o.nom === choisi) ?? null

  return (
    <div className="visuels">
      <div className="familles__outils">
        <label className="champ" style={{ minWidth: '16rem' }}>
          Composé au-dessus des ouvrages
          <select value={compose?.p.cle ?? ''} onChange={(e) => setCle(e.target.value)}>
            {composes.map((c) => (
              <option key={c.p.cle} value={c.p.cle}>
                {c.p.nom}
                {c.g && c.max > 1 ? ` — jusqu’à ${frSig(c.max)} × la valeur de comparaison` : ''}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn--petit" onClick={() => onPositions({ ...positions, ...proposees })}>
          Proposer les positions d’après les cotes
        </button>
        <span className="carte__compte">
          Écart de charge : {fr(ecart.ecart)} m entre {ecart.haut.nom} ({fr(ecart.haut.charge)} m NGF) et {ecart.bas.nom} ({fr(ecart.bas.charge)} m NGF)
        </span>
      </div>

      <Transect ouvrages={tries} lecture={lecture} compose={compose?.p ?? null} guide={compose?.g ?? null} positions={positions} choisi={choisi} onChoisir={setChoisi} />

      {sel && (
        <div className="visuels__detail" aria-live="polite">
          <div className="visuels__detail-tete">
            <strong>{sel.nom}</strong>
            <span className="puce puce--neutre">Charge {fr(sel.charge)} m NGF</span>
            {sel.repere !== null && <span className="puce puce--neutre">Repère {fr(sel.repere)} m NGF</span>}
            {sel.niveau !== null && <span className="puce puce--neutre">Niveau statique {fr(sel.niveau)} m / repère</span>}
            <label className="puce puce--neutre">
              Position :{' '}
              <select
                value={positions[echantillon(sel)] ?? ''}
                onChange={(e) => {
                  const suite = { ...positions }
                  for (const s of sel.echantillons) {
                    if (e.target.value) suite[s] = e.target.value as Position
                    else delete suite[s]
                  }
                  onPositions(suite)
                }}
              >
                <option value="">— non renseignée —</option>
                {(Object.keys(LIBELLES_POSITION) as Position[]).map((p) => (
                  <option key={p} value={p}>
                    {LIBELLES_POSITION[p]}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn btn--ghost btn--petit" onClick={() => setChoisi(null)}>
              Fermer
            </button>
          </div>
          <p>
            Rang {tries.indexOf(sel) + 1} sur {tries.length} de la plus haute à la plus basse charge
            {proposees[echantillon(sel)] ? ` — position proposée d’après les cotes : ${LIBELLES_POSITION[proposees[echantillon(sel)]].toLowerCase()}` : ''}.
          </p>
        </div>
      )}

      <Evolution ouvrages={tries} lecture={lecture} composes={composes.slice(0, 4).map((c) => ({ p: c.p, g: c.g }))} />

      <p className="visuels__muet">
        Charge hydraulique = altitude NGF du repère de mesure − niveau statique initial (ou cote du niveau d’eau notée sur la fiche). L’eau s’écoule
        de la charge la plus haute vers la plus basse ; sans les coordonnées des ouvrages, ce profil classe les ouvrages par charge mais ne donne ni la
        direction ni le gradient d’écoulement : à confronter à la carte piézométrique.
      </p>
    </div>
  )
}

function Transect({
  ouvrages,
  lecture,
  compose,
  guide,
  positions,
  choisi,
  onChoisir,
}: {
  ouvrages: OuvrageHydro[]
  lecture: Lecture
  compose: Parametre | null
  guide: Guide
  positions: Record<string, Position>
  choisi: string | null
  onChoisir: (n: string) => void
}) {
  const n = ouvrages.length
  const L = Math.max(640, 120 + n * 74)
  const H = 470
  const g = 64
  const d = 40
  const bandeHaut = 40
  const bandeConc = 120
  const zHaut = bandeHaut + bandeConc + 26
  const zBas = H - 64
  const reperes = ouvrages.map((o) => o.repere ?? o.charge + 1)
  const yMax = Math.max(...reperes) + 0.5
  const yMin = Math.min(...ouvrages.map((o) => o.charge)) - 2
  const y = (v: number) => zHaut + ((yMax - v) / (yMax - yMin)) * (zBas - zHaut)
  const pas = (L - g - d) / n
  const x = (i: number) => g + pas * (i + 0.5)

  const valeurs = ouvrages.map((o) => {
    const m = compose ? lecture.valeurs.CM[o.echantillons[0]]?.[compose.cle] : undefined
    return m && m.valeur !== null ? { v: m.valeur, inferieur: m.inferieur } : null
  })
  const quantifiees = valeurs.filter((v): v is { v: number; inferieur: boolean } => !!v && !v.inferieur).map((v) => v.v)
  const vMax = Math.max(...quantifiees, guide?.valeur ?? 0, 1e-9)
  const vMin = Math.min(...quantifiees, guide?.valeur ?? Infinity, ...valeurs.filter((v) => v?.inferieur).map((v) => v!.v)) / 2
  const hBarre = (v: number) => (Math.log10(v / vMin) / Math.log10(vMax / vMin || 10)) * (bandeConc - 14)
  const piezo = ouvrages.map((o, i) => `${i ? 'L' : 'M'}${x(i)},${y(o.charge)}`).join(' ')
  const ticks: number[] = []
  const pasY = yMax - yMin > 12 ? 2 : yMax - yMin > 5 ? 1 : 0.5
  for (let v = Math.ceil(yMin / pasY) * pasY; v <= yMax; v += pasY) ticks.push(Math.round(v * 10) / 10)

  return (
    <figure className="visuels__figure visuels__figure--large">
      <figcaption>
        Profil hydraulique, de l’amont à l’aval
        <span>
          Ouvrages rangés de la plus haute charge (à gauche) à la plus basse ; ▽ niveau d’eau, ligne bleue : surface piézométrique entre ouvrages
          {compose ? ` ; barres : ${compose.nom}${guide ? `, tirets rouges : valeur de comparaison (${frSig(guide.valeur)} ${compose.unite})` : ''}` : ''}.
        </span>
      </figcaption>
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${L} ${H}`} style={{ minWidth: `${Math.min(L, 980)}px` }} role="img" aria-label="Profil hydraulique des ouvrages">
          <defs>
            <linearGradient id="nappe" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#9db9e0" stopOpacity="0.55" />
              <stop offset="1" stopColor="#dbe5f3" stopOpacity="0.25" />
            </linearGradient>
          </defs>
          {/* Concentration band */}
          <text x={g - 8} y={bandeHaut + 6} fontSize="11" fill={MUET} textAnchor="end">
            {compose ? acronyme(compose.nom) : ''}
          </text>
          <line x1={g} x2={L - d} y1={bandeHaut + bandeConc} y2={bandeHaut + bandeConc} stroke="#cfd7d6" />
          {guide && guide.valeur > vMin && (
            <g>
              <line x1={g} x2={L - d} y1={bandeHaut + bandeConc - hBarre(guide.valeur)} y2={bandeHaut + bandeConc - hBarre(guide.valeur)} stroke="#c34a35" strokeDasharray="5 4" />
              <text x={g - 8} y={bandeHaut + bandeConc - hBarre(guide.valeur) + 4} fontSize="10" fill="#c34a35" textAnchor="end">
                {frSig(guide.valeur)}
              </text>
            </g>
          )}
          {/* Section */}
          <path d={`${piezo} L${x(n - 1)},${y(yMin)} L${x(0)},${y(yMin)} Z`} fill="url(#nappe)" />
          <path d={piezo} fill="none" stroke={EAU} strokeWidth={2.5} strokeLinejoin="round" />
          <path d={ouvrages.map((_, i) => `${i ? 'L' : 'M'}${x(i)},${y(reperes[i])}`).join(' ')} fill="none" stroke={SOL} strokeWidth={1.5} strokeDasharray="2 3" opacity={0.7} />
          {ticks.map((v) => (
            <g key={v}>
              <line x1={g} x2={L - d} y1={y(v)} y2={y(v)} stroke="#eef1f1" />
              <text x={g - 8} y={y(v) + 4} fontSize="11" fill={MUET} textAnchor="end">
                {fr(v, 1)}
              </text>
            </g>
          ))}
          <text x={14} y={(zHaut + zBas) / 2} fontSize="11.5" fill={ENCRE} textAnchor="middle" transform={`rotate(-90 14 ${(zHaut + zBas) / 2})`}>
            m NGF
          </text>
          <text x={g} y={H - 12} fontSize="11.5" fill={EAU} fontWeight={700}>
            ← amont
          </text>
          <text x={L - d} y={H - 12} fontSize="11.5" fill="#c96a1c" fontWeight={700} textAnchor="end">
            aval →
          </text>
          {ouvrages.map((o, i) => {
            const actif = o.nom === choisi
            const v = valeurs[i]
            const pos = positions[o.echantillons[0]]
            const hb = v ? Math.max(3, hBarre(v.v)) : 0
            return (
              <g key={o.nom} className="visuels__point" role="button" tabIndex={0} onClick={() => onChoisir(o.nom)} onKeyDown={(e) => e.key === 'Enter' && onChoisir(o.nom)}>
                <rect x={x(i) - pas / 2 + 2} y={bandeHaut - 10} width={pas - 4} height={zBas - bandeHaut + 30} fill={actif ? '#e2f8f2' : 'transparent'} rx={6} />
                {v && (
                  <>
                    <rect x={x(i) - 11} y={bandeHaut + bandeConc - hb} width={22} height={hb} rx={3} fill={couleur(v.v, v.inferieur, guide)} />
                    <text x={x(i)} y={bandeHaut + bandeConc - hb - 4} fontSize="10" fill={ENCRE} textAnchor="middle">
                      {v.inferieur ? '<' : ''}
                      {frSig(v.v)}
                    </text>
                  </>
                )}
                {/* Tube from the measuring point down past the water */}
                <rect x={x(i) - 4} y={y(reperes[i])} width={8} height={y(yMin) - y(reperes[i]) - 4} fill="#fff" stroke={ENCRE} strokeWidth={1.2} />
                <rect x={x(i) - 4} y={y(o.charge)} width={8} height={y(yMin) - y(o.charge) - 4} fill="#9db9e0" />
                <line x1={x(i) - 9} x2={x(i) + 9} y1={y(reperes[i])} y2={y(reperes[i])} stroke={SOL} strokeWidth={2.5} />
                <path d={`M${x(i) - 7},${y(o.charge) - 9} L${x(i) + 7},${y(o.charge) - 9} L${x(i)},${y(o.charge) - 1} Z`} fill={EAU} />
                <text x={x(i) + 10} y={y(o.charge) - 3} fontSize="10.5" fill={EAU} fontWeight={600} className="halo">
                  {fr(o.charge)}
                </text>
                <text x={x(i)} y={zBas + 22} fontSize="12" fill={ENCRE} fontWeight={actif ? 700 : 600} textAnchor="middle">
                  {o.nom}
                </text>
                {pos && (
                  <text x={x(i)} y={zBas + 37} fontSize="10" fill={POS[pos]} fontWeight={700} textAnchor="middle">
                    {LIBELLES_POSITION[pos].toLowerCase()}
                  </text>
                )}
                <title>{`${o.nom} — charge ${fr(o.charge)} m NGF${o.repere !== null ? `, repère ${fr(o.repere)} m NGF` : ''}${o.niveau !== null ? `, niveau statique ${fr(o.niveau)} m` : ''}${v && compose ? `\n${compose.nom} : ${v.inferieur ? '<' : ''}${frSig(v.v)} ${compose.unite}` : ''}`}</title>
              </g>
            )
          })}
        </svg>
      </div>
      <p className="visuels__legende">
        <span style={{ background: '#7fcdb5' }}>sous la moitié de la valeur de comparaison</span>
        <span style={{ background: '#3fae8c', color: '#fff' }}>sous la valeur de comparaison</span>
        <span style={{ background: '#f0a742' }}>1 à 10 fois</span>
        <span style={{ background: '#d9583b', color: '#fff' }}>plus de 10 fois</span>
        <span style={{ background: '#d6dcdb' }}>&lt; LQ</span>
        <span style={{ color: SOL }}>— repère de mesure</span>
      </p>
    </figure>
  )
}

/** The main compounds from upgradient to downgradient, one small chart each (log scale). */
function Evolution({ ouvrages, lecture, composes }: { ouvrages: OuvrageHydro[]; lecture: Lecture; composes: { p: Parametre; g: Guide }[] }) {
  if (!composes.length) return null
  const L = 300
  const H = 150
  const g = 44
  const d = 10
  const h = 22
  const b = 30
  return (
    <div className="evolution">
      {composes.map(({ p, g: guide }) => {
        const pts = ouvrages.map((o, i) => {
          const m = lecture.valeurs.CM[o.echantillons[0]]?.[p.cle]
          return { i, nom: o.nom, v: m && m.valeur !== null ? m.valeur : null, inf: !!m?.inferieur }
        })
        const vals = pts.filter((q) => q.v !== null).map((q) => q.v!)
        if (!vals.length) return null
        const lo = Math.log10(Math.min(...vals, guide?.valeur ?? Infinity) / 1.5)
        const hi = Math.log10(Math.max(...vals, guide?.valeur ?? 0) * 1.5)
        const x = (i: number) => g + (ouvrages.length > 1 ? (i / (ouvrages.length - 1)) * (L - g - d) : (L - g - d) / 2)
        const y = (v: number) => h + ((hi - Math.log10(v)) / (hi - lo || 1)) * (H - h - b)
        const ligne = pts.filter((q) => q.v !== null).map((q, k) => `${k ? 'L' : 'M'}${x(q.i)},${y(q.v!)}`).join(' ')
        return (
          <figure key={p.cle} className="visuels__figure">
            <svg viewBox={`0 0 ${L} ${H}`} role="img" aria-label={`${p.nom} de l’amont à l’aval`}>
              <text x={g} y={14} fontSize="12" fontWeight={700} fill={ENCRE}>
                {acronyme(p.nom)} <tspan fontWeight={400} fill={MUET}>({p.unite})</tspan>
              </text>
              {guide && (
                <line x1={g} x2={L - d} y1={y(guide.valeur)} y2={y(guide.valeur)} stroke="#c34a35" strokeDasharray="4 3">
                  <title>{`Valeur de comparaison ${frSig(guide.valeur)} ${p.unite}`}</title>
                </line>
              )}
              <line x1={g} x2={g} y1={h} y2={H - b} stroke="#cfd7d6" />
              {[hi, lo].map((t) => (
                <text key={t} x={g - 4} y={y(10 ** t) + 4} fontSize="9.5" fill={MUET} textAnchor="end">
                  {frSig(10 ** t)}
                </text>
              ))}
              <path d={ligne} fill="none" stroke={EAU} strokeWidth={2} />
              {pts.map((q) =>
                q.v === null ? null : (
                  <circle key={q.i} cx={x(q.i)} cy={y(q.v)} r={3.5} fill={q.inf ? '#fff' : EAU} stroke={EAU} strokeWidth={1.5}>
                    <title>{`${q.nom} : ${q.inf ? '<' : ''}${frSig(q.v)} ${p.unite}`}</title>
                  </circle>
                ),
              )}
              <text x={g} y={H - 10} fontSize="10" fill={MUET}>
                amont
              </text>
              <text x={L - d} y={H - 10} fontSize="10" fill={MUET} textAnchor="end">
                aval
              </text>
            </svg>
          </figure>
        )
      })}
    </div>
  )
}
