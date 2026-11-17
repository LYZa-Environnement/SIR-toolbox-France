import type { EchantillonPfas } from '../../lib/pfas/lecture'
import type { Composition } from '../../lib/pfas/indicateurs'
import type { Matrice } from '../../lib/pfas/reperes'
import { couleur, COULEUR_TFA, fractionFluor, GROUPES, PAR_ID, SUBSTANCES, VINGT, type Substance } from '../../lib/pfas/substances'
import { Cite } from './Cite'
import { grandeur, nombre, valeurTexte } from './format'

const ENCRE = '#0d2421'
const MUET = '#4f625f'
const GRILLE = '#e3e8e7'

/** Bar with a rounded data end and a square base on the baseline. */
function barre(x: number, base: number, largeur: number, hauteur: number, versLeHaut: boolean): string {
  const r = Math.min(4, largeur / 2, Math.abs(hauteur))
  const h = Math.abs(hauteur)
  if (versLeHaut) {
    const y = base - h
    return `M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + largeur - r} Q${x + largeur},${y} ${x + largeur},${y + r} V${base} Z`
  }
  const y = base + h
  return `M${x},${base} V${y - r} Q${x},${y} ${x + r},${y} H${x + largeur - r} Q${x + largeur},${y} ${x + largeur},${y - r} V${base} Z`
}

/**
 * Profile by chain length: carboxylic acids above the axis, sulfonic acids
 * below, one column per number of carbons; 6:2 FTS on the right. Light
 * shades are short chains, dark shades long chains (Buck et al., 2011).
 */
export function Profil({ e, matrice, titre = 'Profil par longueur de chaîne' }: { e: EchantillonPfas; matrice: Matrice; titre?: string }) {
  const L = 760
  const H = 348
  const gauche = 56
  const base = 160
  const demi = 118
  const colonnes = 10
  const zone = L - gauche - 110
  const pas = zone / colonnes
  const larg = pas * 0.56
  const fts = PAR_ID.FTS62
  const q = (s: Substance) => (e.substances[s.id] && !e.substances[s.id]!.inferieur ? e.substances[s.id]!.valeur : 0)
  const max = Math.max(...SUBSTANCES.filter((s) => s.id !== 'TFA').map(q), 1e-9)
  const h = (v: number) => (v / max) * demi
  const parts = SUBSTANCES.filter((s) => s.id !== 'TFA').map((s) => ({ s, v: q(s) }))
  const premiers = new Set(
    parts
      .filter((p) => p.v > 0)
      .sort((a, b) => b.v - a.v)
      .slice(0, 3)
      .map((p) => p.s.id),
  )
  const xCol = (carbones: number) => gauche + (carbones - 4) * pas + (pas - larg) / 2
  const xFts = gauche + zone + 40
  const tfa = e.substances.TFA

  const colonne = (s: Substance, x: number, haut: boolean) => {
    const v = e.substances[s.id]
    const hauteur = h(q(s))
    const info = `${s.abreviation} — ${s.nom}\n${valeurTexte(v, matrice)}${v && !v.inferieur ? `\n${nombre((q(s) / max) * 100)} % du composé le plus abondant` : ''}`
    return (
      <g key={s.id}>
        {q(s) > 0 ? (
          <path d={barre(x, base, larg, hauteur, haut)} fill={couleur(s)} />
        ) : (
          <rect x={x} y={haut ? base - 2 : base} width={larg} height={2} fill={v ? '#b5c3c0' : 'transparent'} />
        )}
        {premiers.has(s.id) && (
          <text x={x + larg / 2} y={haut ? base - hauteur - 6 : base + hauteur + 14} textAnchor="middle" fontSize="11" fill={ENCRE} fontWeight={600}>
            {s.abreviation}
          </text>
        )}
        <rect x={x - (pas - larg) / 2} y={haut ? base - demi - 10 : base} width={pas} height={demi + 10} fill="transparent">
          <title>{info}</title>
        </rect>
      </g>
    )
  }

  return (
    <figure className="pfas-figure">
      <figcaption>
        <strong>{titre}</strong>{' '}
        <span className="pfas-muet">
          — concentrations quantifiées, échelle linéaire ; teinte claire : chaînes courtes, foncée : chaînes longues
          <Cite ids={['buck2011']} />. Survolez une colonne pour la valeur.
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${L} ${H}`} width="100%" role="img" aria-label="Profil des PFAS par longueur de chaîne">
        <text x={gauche - 8} y={base - demi + 4} textAnchor="end" fontSize="11" fill={MUET}>
          PFCA
        </text>
        <text x={gauche - 8} y={base + demi} textAnchor="end" fontSize="11" fill={MUET}>
          PFSA
        </text>
        {/* Short / long chain boundaries: C7|C8 for the acids, C5|C6 for the sulfonates. */}
        <line x1={gauche + 4 * pas} x2={gauche + 4 * pas} y1={base - demi - 6} y2={base} stroke="#9aaba8" strokeDasharray="3 3" />
        <text x={gauche + 4 * pas + 4} y={base - demi - 8} fontSize="10" fill={MUET}>
          chaînes longues →
        </text>
        <line x1={gauche + 2 * pas} x2={gauche + 2 * pas} y1={base} y2={base + demi + 6} stroke="#9aaba8" strokeDasharray="3 3" />
        <text x={gauche + 2 * pas + 4} y={base + demi + 16} fontSize="10" fill={MUET}>
          chaînes longues →
        </text>
        {VINGT.map((s) => colonne(s, xCol(s.carbones), s.famille === 'PFCA'))}
        {Array.from({ length: colonnes }, (_, i) => (
          <text key={i} x={gauche + i * pas + pas / 2} y={H - 6} textAnchor="middle" fontSize="11" fill={MUET}>
            C{i + 4}
          </text>
        ))}
        <line x1={gauche} x2={gauche + zone} y1={base} y2={base} stroke="#c3cfcc" strokeWidth={1} />
        <text x={gauche - 8} y={H - 6} textAnchor="end" fontSize="11" fill={MUET}>
          carbones
        </text>
        <line x1={xFts - 14} x2={xFts - 14} y1={base - demi - 6} y2={base + demi} stroke={GRILLE} />
        {colonne(fts, xFts, true)}
        <text x={xFts + larg / 2} y={base + 18} textAnchor="middle" fontSize="10" fill={MUET}>
          6:2 FTS
        </text>
        <text x={xFts + larg / 2} y={base + 30} textAnchor="middle" fontSize="10" fill={MUET}>
          précurseur
        </text>
      </svg>
      <p className="pfas-note">
        <span className="pfas-pastille" style={{ background: COULEUR_TFA }} /> TFA (C2, hors graphique pour garder l’échelle lisible) :{' '}
        <strong>{valeurTexte(tfa, matrice)}</strong>
        {tfa && !tfa.inferieur && max > 0 && <> — {nombre(tfa.valeur / max)} fois le composé le plus abondant ci-dessus</>}.
      </p>
    </figure>
  )
}

/** One whole split into the five groups; 2px gaps between segments. */
export function BarreComposition({ c, hauteur = 14, etiquettes = false }: { c: Composition; hauteur?: number; etiquettes?: boolean }) {
  if (!c.total) return <span className="pfas-muet">aucun composé quantifié</span>
  const segments = GROUPES.map((g) => ({ ...g, part: c.groupes[g.groupe] })).filter((g) => g.part > 0)
  return (
    <div className="pfas-barre" style={{ height: hauteur }} role="img" aria-label={segments.map((s) => `${s.groupe} ${Math.round(s.part * 100)} %`).join(', ')}>
      {segments.map((s) => (
        <span key={s.groupe} style={{ flexGrow: s.part, background: s.couleur }} title={`${s.groupe} : ${nombre(s.part * 100)} %`}>
          {etiquettes && s.part >= 0.08 && <em style={{ color: s.couleur === '#6da7ec' || s.couleur === '#f0955f' ? ENCRE : '#fff' }}>{Math.round(s.part * 100)} %</em>}
        </span>
      ))}
    </div>
  )
}

export function LegendeGroupes() {
  return (
    <ul className="pfas-legende">
      {GROUPES.map((g) => (
        <li key={g.groupe}>
          <span className="pfas-pastille" style={{ background: g.couleur }} />
          <strong>{g.groupe}</strong> <span className="pfas-muet">{g.detail}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Fluorine balance against AOF (water) or EOF (soil): the fluorine carried by
 * each family of quantified substances, and what remains unidentified.
 */
export function BilanFluor({ e, matrice }: { e: EchantillonPfas; matrice: Matrice }) {
  const global = matrice === 'eau' ? e.aof : e.eof
  const nomGlobal = matrice === 'eau' ? 'AOF' : 'EOF'
  if (!global) return null
  const familles = [
    { nom: 'PFCA', couleur: '#1c5cab', ids: VINGT.filter((s) => s.famille === 'PFCA') },
    { nom: 'PFSA', couleur: '#b4471a', ids: VINGT.filter((s) => s.famille === 'PFSA') },
    { nom: '6:2 FTS', couleur: '#6250d6', ids: [PAR_ID.FTS62] },
    { nom: 'TFA', couleur: COULEUR_TFA, ids: [PAR_ID.TFA] },
  ].map((f) => ({
    ...f,
    fluor: f.ids.reduce((a, s) => a + (e.substances[s.id] && !e.substances[s.id]!.inferieur ? e.substances[s.id]!.valeur * fractionFluor(s) : 0), 0),
  }))
  const identifie = familles.reduce((a, f) => a + f.fluor, 0)
  // "3,2 µg/l" → "3,2 µg F/l": global parameters are expressed as fluorine.
  const texte = (x: number) => grandeur(x, matrice).replace('/', ' F/')

  return (
    <div className="card pfas-bloc">
      <h3>
        Bilan du fluor <span className="pfas-muet">({nomGlobal} mesuré : {valeurTexte(global, matrice)} en fluor)</span>
      </h3>
      <p className="pfas-note">
        Chaque concentration est multipliée par la part massique du fluor dans la molécule, calculée d’après sa formule (de 50 % pour le
        TFA à environ 70 % pour les acides longs). La somme est comparée au fluor organique global mesuré par le laboratoire
        <Cite ids={['wagner2013', 'epa1621']} />.
      </p>
      {global.inferieur ? (
        <p>
          {nomGlobal} inférieur à sa limite de quantification. Fluor porté par les substances quantifiées : <strong>{texte(identifie)}</strong>.{' '}
          {identifie < global.valeur
            ? 'C’est cohérent : la LQ des paramètres globaux est bien plus haute que celle des analyses ciblées, un résultat « < LQ » ne signifie pas l’absence de PFAS.'
            : 'Les substances ciblées portent plus de fluor que la LQ du paramètre global : vérifiez les unités (le paramètre global s’exprime en fluor).'}
        </p>
      ) : (
        <>
          <div className="pfas-barre pfas-barre--fluor" role="img" aria-label="Part du fluor organique expliquée par les substances dosées">
            {familles
              .filter((f) => f.fluor > 0)
              .map((f) => (
                <span key={f.nom} style={{ flexGrow: Math.min(f.fluor, global.valeur), background: f.couleur }} title={`${f.nom} : ${texte(f.fluor)}`} />
              ))}
            {identifie < global.valeur && (
              <span style={{ flexGrow: global.valeur - identifie, background: '#e3e8e7' }} title={`Non identifié : ${texte(global.valeur - identifie)}`} />
            )}
          </div>
          <ul className="pfas-legende">
            {familles
              .filter((f) => f.fluor > 0)
              .map((f) => (
                <li key={f.nom}>
                  <span className="pfas-pastille" style={{ background: f.couleur }} /> {f.nom} : {texte(f.fluor)}
                </li>
              ))}
            <li>
              <span className="pfas-pastille" style={{ background: '#e3e8e7' }} /> non identifié :{' '}
              {identifie < global.valeur ? `${texte(global.valeur - identifie)} (${Math.round((1 - identifie / global.valeur) * 100)} %)` : '0'}
            </li>
          </ul>
          {identifie > global.valeur && (
            <p className="pfas-note">
              Le fluor des substances dosées dépasse le paramètre global : écart possible entre méthodes (rendement d’adsorption ou
              d’extraction, incertitudes), à signaler au laboratoire.
            </p>
          )}
        </>
      )}
    </div>
  )
}
