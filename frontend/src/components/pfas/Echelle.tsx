import { reperes as tousReperes, type Grandeur, type Matrice, type Repere } from '../../lib/pfas/reperes'
import type { Valeur } from '../../lib/pfas/lecture'
import { Cite } from './Cite'
import { graduation, grandeur, valeurTexte } from './format'

const LARGEUR = 760
const GAUCHE = 150
const DROITE = 24
const HAUT = 44
const LIGNE = 28
const BAS = 34
const ENCRE = '#0d2421'
const MUET = '#4f625f'
const GRILLE = '#e3e8e7'
const POINT = '#2a78d6'
const ERM = '#00756a'

const lettre = (i: number) => String.fromCharCode(65 + i)

/** How many times a threshold the value is, in words. */
function rapportSeuil(v: Valeur, seuil: number): string {
  if (v.inferieur) return v.valeur < seuil ? 'sous la valeur (LQ inférieure)' : 'LQ au-dessus de la valeur : non concluant'
  const r = v.valeur / seuil
  if (r >= 1) return `${r >= 10 ? Math.round(r).toLocaleString('fr-FR') : r.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} fois la valeur`
  return `${(r * 100).toLocaleString('fr-FR', { maximumFractionDigits: r < 0.1 ? 1 : 0 })} % de la valeur`
}

/**
 * One order-of-magnitude scale: a log axis (one graduation per factor 10),
 * each sample on its own row, management values as lines and study ranges
 * as bands, both lettered and explained under the chart.
 */
export function Echelle({
  matrice,
  grandeur: g,
  titre,
  aide,
  points,
}: {
  matrice: Matrice
  grandeur: Grandeur
  titre: string
  aide: string
  points: { nom: string; valeur: Valeur | null | undefined }[]
}) {
  const reperes = tousReperes(matrice, g)
  const mesures = points.filter((p): p is { nom: string; valeur: Valeur } => !!p.valeur && p.valeur.valeur > 0)
  if (!mesures.length) return null

  const nombres = [...mesures.map((p) => p.valeur.valeur), ...reperes.flatMap((r) => (Array.isArray(r.valeur) ? r.valeur : [r.valeur]))]
  let bas = Math.floor(Math.log10(Math.min(...nombres)))
  let haut = Math.ceil(Math.log10(Math.max(...nombres)) + 0.001)
  while (haut - bas < 4) {
    if (haut - bas < 4) haut++
    if (haut - bas < 4) bas--
  }
  const x = (v: number) => GAUCHE + ((Math.log10(v) - bas) / (haut - bas)) * (LARGEUR - GAUCHE - DROITE)
  const hauteurLignes = mesures.length * LIGNE
  const hauteur = HAUT + hauteurLignes + BAS
  const decades = Array.from({ length: haut - bas + 1 }, (_, i) => bas + i)
  const seuils = reperes.filter((r) => r.type === 'seuil')

  return (
    <figure className="pfas-figure">
      <figcaption>
        <strong>{titre}</strong> <span className="pfas-muet">— {aide}</span>
      </figcaption>
      <svg viewBox={`0 0 ${LARGEUR} ${hauteur}`} width="100%" role="img" aria-label={`Échelle logarithmique : ${titre}`}>
        {decades.map((d) => (
          <g key={d}>
            <line x1={x(10 ** d)} x2={x(10 ** d)} y1={HAUT - 6} y2={HAUT + hauteurLignes} stroke={GRILLE} />
            <text x={x(10 ** d)} y={hauteur - 12} textAnchor="middle" fontSize="11" fill={MUET}>
              {graduation(d, matrice)}
            </text>
          </g>
        ))}
        <line x1={GAUCHE} x2={LARGEUR - DROITE} y1={HAUT + hauteurLignes} y2={HAUT + hauteurLignes} stroke="#c3cfcc" />

        {reperes.map((r, i) => {
          if (r.type === 'seuil') return null
          const [a, b] = Array.isArray(r.valeur) ? r.valeur : [r.valeur, r.valeur]
          const largeur = Math.max(x(b) - x(a), 3)
          return (
            <g key={r.libelle}>
              <rect x={x(a) - (a === b ? 1.5 : 0)} y={HAUT - 6} width={largeur} height={hauteurLignes + 6} fill="#4a5a6b" opacity={0.1} rx={2}>
                <title>{`${lettre(i)} — ${r.libelle} : ${a === b ? grandeur(a, matrice) : `${grandeur(a, matrice)} à ${grandeur(b, matrice)}`}`}</title>
              </rect>
              <text x={x(a) + largeur / 2} y={HAUT - 10} textAnchor="middle" fontSize="11" fontWeight="700" fill={MUET}>
                {lettre(i)}
              </text>
            </g>
          )
        })}
        {reperes.map((r, i) => {
          if (r.type !== 'seuil') return null
          const v = r.valeur as number
          const couleur = r.erm ? ERM : ENCRE
          return (
            <g key={r.libelle}>
              <line x1={x(v)} x2={x(v)} y1={HAUT - 24} y2={HAUT + hauteurLignes} stroke={couleur} strokeWidth={2} />
              <text x={x(v)} y={HAUT - 28} textAnchor="middle" fontSize="11" fontWeight="700" fill={couleur}>
                {lettre(i)}
              </text>
            </g>
          )
        })}

        {mesures.map((p, i) => {
          const y = HAUT + i * LIGNE + LIGNE / 2
          const cx = x(p.valeur.valeur)
          const info = [
            `${p.nom} : ${valeurTexte(p.valeur, matrice)}`,
            ...seuils.map((s) => `${s.libelle} : ${rapportSeuil(p.valeur, s.valeur as number)}`),
          ].join('\n')
          return (
            <g key={p.nom}>
              <text x={GAUCHE - 10} y={y + 4} textAnchor="end" fontSize="12" fill={ENCRE}>
                {p.nom.length > 20 ? `${p.nom.slice(0, 19)}…` : p.nom}
              </text>
              <line x1={GAUCHE} x2={LARGEUR - DROITE} y1={y} y2={y} stroke={GRILLE} strokeWidth={0.5} />
              {p.valeur.inferieur ? (
                <>
                  <text x={cx - 9} y={y + 4} textAnchor="end" fontSize="12" fill={MUET}>
                    &lt;
                  </text>
                  <circle cx={cx} cy={y} r={5} fill="#fff" stroke={MUET} strokeWidth={2} />
                </>
              ) : (
                <circle cx={cx} cy={y} r={5.5} fill={POINT} stroke="#fff" strokeWidth={2} />
              )}
              <circle cx={cx} cy={y} r={12} fill="transparent">
                <title>{info}</title>
              </circle>
            </g>
          )
        })}
      </svg>
      <Reperes reperes={reperes} matrice={matrice} />
    </figure>
  )
}

function Reperes({ reperes, matrice }: { reperes: Repere[]; matrice: Matrice }) {
  if (!reperes.length) {
    return <p className="pfas-note">Aucune valeur de référence publiée n’a été retenue pour cette grandeur : les résultats se lisent entre échantillons et par rapport à l’amont.</p>
  }
  return (
    <ul className="pfas-reperes">
      {reperes.map((r, i) => (
        <li key={r.libelle}>
          <span className={`pfas-repere-lettre${r.type === 'seuil' ? ' pfas-repere-lettre--seuil' : ''}${r.erm ? ' pfas-repere-lettre--erm' : ''}`}>{lettre(i)}</span>
          <span>
            <strong>
              {r.libelle} —{' '}
              {Array.isArray(r.valeur) ? `${grandeur(r.valeur[0], matrice)} à ${grandeur(r.valeur[1], matrice)}` : grandeur(r.valeur, matrice)}
            </strong>{' '}
            <span className="pfas-type">{r.type === 'seuil' ? 'valeur de gestion' : 'ordre de grandeur mesuré'}</span>
            {r.erm && <span className="pfas-type pfas-type--erm">valeur ERM retenue</span>}
            <br />
            <span className="pfas-muet">{r.detail}</span>
            <Cite ids={r.refs} />
          </span>
        </li>
      ))}
    </ul>
  )
}
