import { useMemo } from 'react'
import { composition, formatIndicateur, indicateurs } from '../../lib/pfas/indicateurs'
import { ensemble, type EchantillonPfas } from '../../lib/pfas/lecture'
import type { Matrice } from '../../lib/pfas/reperes'
import { LIBELLES_VERDICT, pistes, type Piste } from '../../lib/pfas/sources'
import { PAR_ID } from '../../lib/pfas/substances'
import { Cite } from './Cite'
import { valeurTexte } from './format'
import { BarreComposition, LegendeGroupes, Profil } from './Graphiques'

const ORDRE_PISTES = ['mousses-ecf', 'mousses-ft', 'chromage', 'fluoropolymeres', 'decharge', 'boues', 'diffus', 'tfa']

const PASTILLE: Record<Piste['verdict'], { classe: string; signe: string; court: string }> = {
  compatible: { classe: 'badge--faible', signe: '✓', court: 'compatible' },
  partiel: { classe: 'badge--moderee', signe: '≈', court: 'en partie' },
  peu: { classe: 'badge--indeterminee', signe: '–', court: 'peu' },
  indetermine: { classe: 'badge--indeterminee', signe: '?', court: 'n. é.' },
}

/**
 * All samples side by side: compositions, the profile of all of them
 * together, every indicator per sample, and the source leads per sample.
 */
export function Comparaison({
  echantillons,
  matrice,
  choisir,
}: {
  echantillons: EchantillonPfas[]
  matrice: Matrice
  choisir: (nom: string) => void
}) {
  const tout = useMemo(() => ensemble(echantillons), [echantillons])
  const lignes = useMemo(
    () =>
      echantillons.map((e) => ({
        e,
        c: composition(e),
        indicateurs: indicateurs(e, matrice),
        pistes: Object.fromEntries(pistes(e, matrice).map((p) => [p.id, p])) as Record<string, Piste>,
      })),
    [echantillons, matrice],
  )
  const cTout = useMemo(() => composition(tout), [tout])
  const titresIndicateurs = useMemo(() => {
    const vus = new Map<string, string>()
    for (const l of lignes) for (const i of l.indicateurs) if (!vus.has(i.id)) vus.set(i.id, i.titre)
    return [...vus]
  }, [lignes])
  const idsPistes = ORDRE_PISTES.filter((id) => lignes.some((l) => l.pistes[id]))

  const enTete = lignes.map(({ e }) => (
    <th key={e.nom}>
      <button type="button" className="pfas-lien" onClick={() => choisir(e.nom)} title="Voir la lecture détaillée de cet échantillon">
        {e.nom}
      </button>
    </th>
  ))

  return (
    <>
      <h3>Profils comparés</h3>
      <p className="pfas-note" style={{ maxWidth: '48rem' }}>
        Répartition des substances quantifiées (20 PFAS et 6:2 FTS) dans chaque échantillon, puis dans l’ensemble des échantillons, où les
        plus concentrés pèsent le plus. Un profil qui change d’un ouvrage à l’autre signale plusieurs sources, ou l’évolution d’un même
        panache : chaînes courtes enrichies et précurseurs transformés vers l’aval <Cite ids={['guelfoHiggins2013', 'houtz2013']} />.
      </p>
      <div className="pfas-profils">
        <div className="pfas-profils__entete pfas-muet">
          <span />
          <span>Composition</span>
          <span>Somme des 20</span>
          <span>Composé dominant</span>
        </div>
        {lignes.map(({ e, c }) => (
          <div key={e.nom} className="pfas-profils__ligne">
            <button type="button" className="pfas-lien" onClick={() => choisir(e.nom)}>
              {e.nom}
            </button>
            <BarreComposition c={c} hauteur={22} etiquettes />
            <span className="pfas-valeur-texte">{valeurTexte(e.somme, matrice)}</span>
            <span className="pfas-muet">{c.parts[0] ? `${PAR_ID[c.parts[0].id].abreviation} ${Math.round(c.parts[0].part * 100)} %` : '—'}</span>
          </div>
        ))}
        <div className="pfas-profils__ligne pfas-profils__ligne--ensemble">
          <strong>Ensemble</strong>
          <BarreComposition c={cTout} hauteur={22} etiquettes />
          <span className="pfas-valeur-texte">{valeurTexte(tout.somme, matrice)}</span>
          <span className="pfas-muet">{cTout.parts[0] ? `${PAR_ID[cTout.parts[0].id].abreviation} ${Math.round(cTout.parts[0].part * 100)} %` : '—'}</span>
        </div>
      </div>
      <LegendeGroupes />

      <div className="card pfas-bloc">
        <Profil e={tout} matrice={matrice} titre="Profil de l’ensemble des échantillons" />
      </div>

      <h3 style={{ marginTop: '2rem' }}>Indicateurs par échantillon</h3>
      <p className="pfas-note" style={{ maxWidth: '48rem' }}>
        Les mêmes indicateurs que dans la lecture détaillée, côte à côte. Survolez une valeur pour sa lecture ; cliquez sur un échantillon
        pour le détail.
      </p>
      <div className="tableau-defile">
        <table className="tableau pfas-comparaison">
          <thead>
            <tr>
              <th>Indicateur</th>
              {enTete}
            </tr>
          </thead>
          <tbody>
            {titresIndicateurs.map(([id, titre]) => (
              <tr key={id}>
                <th>{titre}</th>
                {lignes.map(({ e, indicateurs: liste }) => {
                  const i = liste.find((x) => x.id === id)
                  if (!i) return <td key={e.nom} className="pfas-muet">—</td>
                  return (
                    <td key={e.nom} title={i.constat ?? i.raison ?? ''}>
                      <span className="pfas-valeur-texte">{formatIndicateur(i)}</span>
                      {i.format === 'part' && i.valeur !== null && (
                        <span className="pfas-mini-jauge" aria-hidden="true">
                          <span style={{ width: `${Math.min(i.valeur, 1) * 100}%` }} />
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ marginTop: '2rem' }}>Pistes de sources par échantillon</h3>
      <p className="pfas-note" style={{ maxWidth: '48rem' }}>
        Compatibilité de chaque profil avec les types de sources documentés, critère par critère comme dans la lecture détaillée. Une piste
        compatible sur plusieurs ouvrages, et d’autant plus fortement près d’une zone suspecte, pèse davantage qu’un cas isolé
        <Cite ids={['rodowa2021']} />.
      </p>
      <div className="tableau-defile">
        <table className="tableau pfas-comparaison">
          <thead>
            <tr>
              <th>Piste</th>
              {enTete}
              <th>Synthèse</th>
            </tr>
          </thead>
          <tbody>
            {idsPistes.map((id) => {
              const exemple = lignes.find((l) => l.pistes[id])!.pistes[id]
              const compatibles = lignes.filter((l) => l.pistes[id]?.verdict === 'compatible').length
              const partielles = lignes.filter((l) => l.pistes[id]?.verdict === 'partiel').length
              return (
                <tr key={id}>
                  <th>{exemple.court}</th>
                  {lignes.map(({ e, pistes: p }) => {
                    const piste = p[id]
                    if (!piste) return <td key={e.nom} className="pfas-muet">—</td>
                    const v = PASTILLE[piste.verdict]
                    const oui = piste.criteres.filter((c) => c.etat === 'oui').length
                    const evalues = piste.criteres.filter((c) => c.etat !== 'na').length
                    return (
                      <td key={e.nom} title={`${LIBELLES_VERDICT[piste.verdict]} : ${oui} / ${evalues} critères vérifiés`}>
                        <span className={`badge ${v.classe}`}>
                          {v.signe} {v.court}
                        </span>
                      </td>
                    )
                  })}
                  <td>
                    {compatibles ? (
                      <strong>
                        compatible pour {compatibles} / {lignes.length}
                      </strong>
                    ) : partielles ? (
                      <span>
                        en partie pour {partielles} / {lignes.length}
                      </span>
                    ) : (
                      <span className="pfas-muet">aucun échantillon</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
