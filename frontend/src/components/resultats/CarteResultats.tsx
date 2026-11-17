import { useMemo, useState } from 'react'
import { comparer, type EtatTri } from '../../lib/tri'
import { convertir, volumeLitres, type Prelevement, type UniteSortie } from '../../lib/resultats/calc'
import { acronyme } from '../../lib/resultats/acronymes'
import type { Lecture, Parametre } from '../../lib/resultats/parse'

type Guide = { valeur: number; source: string } | null

interface Cellule {
  valeur: number
  inferieur: boolean
  /** Result / reference value; null without a reference. */
  ratio: number | null
}

interface Ligne {
  p: Parametre
  unite: string
  guide: Guide
  cellules: Record<string, Cellule | null>
  quantifies: number
  depassements: number
  ratioMax: number | null
  /** Highest quantified value, for the shading without a reference. */
  max: number
}

type Filtre = 'depassements' | 'quantifies' | 'tous'

const CLASSES = [
  { max: 0.1, fond: '#e2f8f2', texte: '#1f6b45', libelle: '< 10 % de la valeur de comparaison' },
  { max: 0.5, fond: '#b9e6d8', texte: '#1f6b45', libelle: '10 à 50 %' },
  { max: 1, fond: '#7fcdb5', texte: '#0d2421', libelle: '50 à 100 %' },
  { max: 10, fond: '#f4c27a', texte: '#5a3a00', libelle: '1 à 10 fois la valeur de comparaison' },
  { max: Infinity, fond: '#e07a5f', texte: '#ffffff', libelle: 'plus de 10 fois' },
]

const fr = (x: number) => x.toLocaleString('fr-FR', { maximumSignificantDigits: 3 })

/** A ratio short enough for a cell: ×2,4 · ×36 · ×580 · ×37k · ×1,2M. */
function court(r: number): string {
  if (r >= 1e6) return `×${(r / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}M`
  if (r >= 1e3) return `×${Math.round(r / 1e3)}k`
  return r >= 10 ? `×${Math.round(r)}` : `×${r.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}`
}

/** Blue shade for a quantified result without reference, by its rank in the compound (log scale). */
function bleu(v: number, max: number): string {
  const t = max > 0 && v > 0 ? Math.max(0.15, Math.min(1, 1 + Math.log10(v / max) / 3)) : 0.15
  const a = [229, 237, 248]
  const b = [47, 95, 158]
  const c = a.map((x, i) => Math.round(x + (b[i] - x) * t))
  return `rgb(${c.join(',')})`
}

/**
 * Every result at a glance: one row per compound, one column per sample,
 * each cell coloured by the result against the reference value (or, without
 * one, by its level within the compound). A click on a cell tells its value,
 * its reference and what it means; a click on a sample or a compound
 * highlights it.
 */
export function CarteResultats({
  lecture,
  echantillons,
  guides,
  conversion,
  avecReference,
}: {
  lecture: Lecture
  echantillons: string[]
  guides: Record<string, Guide>
  conversion: { prelevements: Record<string, Prelevement>; unite: UniteSortie } | null
  avecReference: boolean
}) {
  const lignes = useMemo((): Ligne[] => {
    const sansPrelevement: Prelevement = { duree: null, debitDebut: null, debitFin: null }
    return lecture.parametres.CM.filter((p) => !p.somme).map((p) => {
      const guide = avecReference ? (guides[p.cle] ?? null) : null
      const cellules: Record<string, Cellule | null> = {}
      let quantifies = 0
      let depassements = 0
      let ratioMax: number | null = null
      let max = 0
      for (const e of echantillons) {
        const m = lecture.valeurs.CM[e]?.[p.cle]
        const v = conversion
          ? convertir(m, p, volumeLitres(conversion.prelevements[e] ?? sansPrelevement), conversion.unite)
          : m && m.valeur !== null
            ? { valeur: m.valeur, inferieur: m.inferieur }
            : null
        if (!v) {
          cellules[e] = null
          continue
        }
        const ratio = guide && guide.valeur > 0 ? v.valeur / guide.valeur : null
        cellules[e] = { valeur: v.valeur, inferieur: v.inferieur, ratio }
        if (!v.inferieur) {
          quantifies++
          max = Math.max(max, v.valeur)
          if (ratio !== null) {
            ratioMax = Math.max(ratioMax ?? 0, ratio)
            if (ratio > 1) depassements++
          }
        }
      }
      return { p, unite: conversion ? conversion.unite : p.unite, guide, cellules, quantifies, depassements, ratioMax, max }
    })
  }, [lecture, echantillons, guides, conversion, avecReference])

  const totalDepassements = lignes.reduce((n, l) => n + l.depassements, 0)
  const [filtre, setFiltre] = useState<Filtre>(totalDepassements ? 'depassements' : 'quantifies')
  const [choix, setChoix] = useState<{ cle: string; e: string } | null>(null)
  const [colonne, setColonne] = useState<string | null>(null)
  /** Rows by highest ratio (default with comparison values), by name, or by one sample's result. */
  const [tri, setTri] = useState<EtatTri | null>(avecReference ? { cle: 'ratio', sens: 'desc' } : null)
  const basculerTri = (cle: string, premier: 'asc' | 'desc' = 'desc') =>
    setTri((t) => (t?.cle === cle ? { cle, sens: t.sens === 'asc' ? 'desc' : 'asc' } : { cle, sens: premier }))
  const trierEchantillon = (e: string) => {
    setColonne(e)
    basculerTri(`e:${e}`)
  }

  const visibles = lignes
    .filter((l) => (filtre === 'depassements' ? l.depassements > 0 : filtre === 'quantifies' ? l.quantifies > 0 : true))
    .map((l, i) => ({ l, i }))
    .sort((a, b) => {
      if (!tri) return a.i - b.i
      const v = (x: Ligne) => {
        if (tri.cle === 'nom') return x.p.nom
        if (tri.cle === 'ratio') return x.ratioMax ?? (avecReference ? null : x.max)
        const c = x.cellules[tri.cle.slice(2)]
        return c ? (c.inferieur ? -1 / (1 + c.valeur) : c.ratio ?? c.valeur) : null
      }
      return comparer(v(a.l), v(b.l), tri.sens) || a.i - b.i
    })
    .map((x) => x.l)
  const parEchantillon = echantillons
    .map((e) => ({ e, n: lignes.reduce((k, l) => k + (l.cellules[e]?.ratio !== null && !l.cellules[e]?.inferieur && (l.cellules[e]?.ratio ?? 0) > 1 ? 1 : 0), 0) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
  const composesDepasses = lignes.filter((l) => l.depassements > 0)
  const ligneChoisie = choix ? lignes.find((l) => l.p.cle === choix.cle) : null
  const celluleChoisie = ligneChoisie && choix ? ligneChoisie.cellules[choix.e] : null

  const couleur = (l: Ligne, c: Cellule | null): { fond: string; texte: string; classe: string } => {
    if (!c) return { fond: 'transparent', texte: 'inherit', classe: 'carte__case--vide' }
    if (c.inferieur) return { fond: '#f1f3f3', texte: '#8a9694', classe: c.ratio !== null && c.ratio > 1 ? 'carte__case--lq carte__case--lqsup' : 'carte__case--lq' }
    if (c.ratio !== null) {
      const k = CLASSES.find((x) => c.ratio! <= x.max)!
      return { fond: k.fond, texte: k.texte, classe: '' }
    }
    return { fond: bleu(c.valeur, l.max), texte: c.valeur / l.max > 0.35 ? '#fff' : '#0d2421', classe: '' }
  }

  // Mini bar of the highest ratio, on a log scale from 1/100 to 100 times the reference.
  const barre = (r: number | null) => (r === null ? null : Math.max(0.02, Math.min(1, (Math.log10(r) + 2) / 4)))

  return (
    <div className="carte">
      <div className="carte__synthese">
        {avecReference ? (
          totalDepassements ? (
            <p>
              <strong>
                {totalDepassements} résultat{totalDepassements > 1 ? 's' : ''} au-dessus de la valeur de comparaison
              </strong>{' '}
              pour {composesDepasses.length} composé{composesDepasses.length > 1 ? 's' : ''} ({composesDepasses.slice(0, 5).map((l) => acronyme(l.p.nom)).join(', ')}
              {composesDepasses.length > 5 ? '…' : ''}).
            </p>
          ) : (
            <p>
              <strong>Aucun résultat au-dessus des valeurs de comparaison.</strong>
            </p>
          )
        ) : (
          <p>
            <strong>{lignes.filter((l) => l.quantifies).length} composés quantifiés</strong> sur {lignes.length} — sans valeur de comparaison, la couleur
            situe chaque résultat dans la gamme du composé.
          </p>
        )}
        {parEchantillon.length > 0 && (
          <div className="carte__chips">
            <span>Échantillons les plus concernés :</span>
            {parEchantillon.slice(0, 6).map(({ e, n }) => (
              <button key={e} type="button" className={`chip${colonne === e ? ' chip--actif' : ''}`} onClick={() => setColonne(colonne === e ? null : e)}>
                {e} <strong>{n}</strong>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="carte__outils">
        <div className="pfas-segment" role="group" aria-label="Composés affichés">
          {(
            [
              ['depassements', 'Dépassements', !avecReference],
              ['quantifies', 'Quantifiés', false],
              ['tous', 'Tous', false],
            ] as [Filtre, string, boolean][]
          ).map(([f, l, off]) =>
            off ? null : (
              <button key={f} type="button" className={filtre === f ? 'actif' : ''} onClick={() => setFiltre(f)}>
                {l}
              </button>
            ),
          )}
        </div>
        <span className="carte__compte">
          {visibles.length} composé{visibles.length > 1 ? 's' : ''} · {echantillons.length} échantillon{echantillons.length > 1 ? 's' : ''}
        </span>
      </div>

      {visibles.length ? (
        <div className="carte__defile">
          <table className="carte__table">
            <thead>
              <tr>
                <th className="carte__coin">
                  <button type="button" className={`tri${tri?.cle === 'nom' ? ' tri--actif' : ''}`} onClick={() => basculerTri('nom', 'asc')}>
                    Composé <span className="tri__fleche">{tri?.cle === 'nom' ? (tri.sens === 'asc' ? '▲' : '▼') : '↕'}</span>
                  </button>
                  <button type="button" className={`tri${tri?.cle === 'ratio' ? ' tri--actif' : ''}`} onClick={() => basculerTri('ratio')}>
                    {avecReference ? 'Maximum / valeur de comparaison' : 'Maximum'}{' '}
                    <span className="tri__fleche">{tri?.cle === 'ratio' ? (tri.sens === 'asc' ? '▲' : '▼') : '↕'}</span>
                  </button>
                </th>
                {echantillons.map((e) => (
                  <th key={e} className={`carte__ech${colonne === e ? ' carte__ech--actif' : ''}`} scope="col">
                    <button type="button" onClick={() => trierEchantillon(e)} title={`${e} — cliquer pour classer les composés selon cet échantillon`}>
                      <span>
                        {e}
                        {tri?.cle === `e:${e}` ? (tri.sens === 'asc' ? ' ▲' : ' ▼') : ''}
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibles.map((l) => {
                const b = barre(l.ratioMax)
                return (
                  <tr key={l.p.cle} className={choix?.cle === l.p.cle ? 'carte__ligne--active' : undefined}>
                    <th scope="row" className="carte__compose" title={`${l.p.nom}${l.guide ? ` — valeur de comparaison ${fr(l.guide.valeur)} ${l.unite} (${l.guide.source})` : ''}`}>
                      <span className="carte__nom">{l.p.nom}</span>
                      {b !== null && (
                        <span className="carte__barre" aria-label={`Maximum : ${fr(l.ratioMax!)} fois la valeur de comparaison`}>
                          <i style={{ width: `${b * 100}%`, background: (l.ratioMax ?? 0) > 1 ? '#e07a5f' : '#7fcdb5' }} />
                          <b aria-hidden="true" />
                          <em>{court(l.ratioMax!)}</em>
                        </span>
                      )}
                    </th>
                    {echantillons.map((e) => {
                      const c = l.cellules[e]
                      const k = couleur(l, c)
                      const actif = choix?.cle === l.p.cle && choix.e === e
                      return (
                        <td key={e} className={`carte__case ${k.classe}${colonne === e ? ' carte__case--colonne' : ''}${actif ? ' carte__case--active' : ''}`}>
                          {c ? (
                            <button
                              type="button"
                              style={{ background: k.fond, color: k.texte }}
                              onClick={() => setChoix(actif ? null : { cle: l.p.cle, e })}
                              title={`${e} — ${l.p.nom} : ${c.inferieur ? '<' : ''}${fr(c.valeur)} ${l.unite}${c.ratio !== null && !c.inferieur ? ` (${fr(c.ratio)} × val. de comparaison)` : ''}`}
                              aria-label={`${e}, ${l.p.nom}`}
                            >
                              {c.inferieur ? '' : c.ratio !== null && c.ratio > 1 ? court(c.ratio) : ''}
                            </button>
                          ) : null}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="visuels__muet">Aucun composé à afficher avec ce filtre.</p>
      )}

      {ligneChoisie && celluleChoisie && choix && (
        <div className="visuels__detail" aria-live="polite">
          <div className="visuels__detail-tete">
            <strong>
              {choix.e} — {ligneChoisie.p.nom}
            </strong>
            <span className="puce puce--neutre">
              {celluleChoisie.inferieur ? '< ' : ''}
              {fr(celluleChoisie.valeur)} {ligneChoisie.unite}
            </span>
            {ligneChoisie.guide && (
              <span className="puce puce--neutre">
                Valeur de comparaison {fr(ligneChoisie.guide.valeur)} {ligneChoisie.unite} ({ligneChoisie.guide.source})
              </span>
            )}
            <button type="button" className="btn btn--ghost btn--petit" onClick={() => setChoix(null)}>
              Fermer
            </button>
          </div>
          <p>
            {celluleChoisie.inferieur
              ? celluleChoisie.ratio !== null && celluleChoisie.ratio > 1
                ? 'Non quantifié, mais la limite de quantification dépasse la valeur de comparaison : la comparaison n’est pas concluante.'
                : 'Non quantifié : inférieur à la limite de quantification du laboratoire.'
              : celluleChoisie.ratio === null
                ? `Pas de valeur de comparaison pour ce composé. Le résultat représente ${fr((celluleChoisie.valeur / (ligneChoisie.max || 1)) * 100)} % du maximum mesuré pour ce composé.`
                : celluleChoisie.ratio > 1
                  ? `Dépasse la valeur de comparaison : ${fr(celluleChoisie.ratio)} fois celle-ci.`
                  : `Sous la valeur de comparaison : ${fr(celluleChoisie.ratio * 100)} % de celle-ci.`}
          </p>
          <p className="visuels__muet">
            {ligneChoisie.quantifies} échantillon{ligneChoisie.quantifies > 1 ? 's' : ''} quantifié{ligneChoisie.quantifies > 1 ? 's' : ''} sur {echantillons.length}
            {ligneChoisie.guide ? `, ${ligneChoisie.depassements} au-dessus de la valeur de comparaison` : ''}.
          </p>
        </div>
      )}

      <p className="visuels__legende">
        {avecReference &&
          CLASSES.map((k) => (
            <span key={k.libelle} style={{ background: k.fond, color: k.texte }}>
              {k.libelle}
            </span>
          ))}
        {(!avecReference || lignes.some((l) => !l.guide && l.quantifies)) && (
          <span style={{ background: 'linear-gradient(90deg, #e5edf8, #2f5f9e)', color: '#fff' }}>
            {avecReference ? 'sans valeur de comparaison : ' : ''}du plus faible au plus fort du composé
          </span>
        )}
        <span style={{ background: '#f1f3f3', color: '#8a9694' }}>&lt; LQ</span>
        {avecReference && <span className="carte__legende-lqsup">LQ &gt; valeur de comparaison</span>}
      </p>
    </div>
  )
}
