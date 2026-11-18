import { useMemo, useState } from 'react'
import { CLASSES, fr, frAnnee, frPente, ORDRE_CLASSES, pTexte, type Analyse, type AnalyseSerie, type Classe } from '../../lib/suivi/analyse'
import { sparkline } from '../../lib/suivi/graphique'
import { infoSerie } from '../../lib/suivi/ui'
import type { Compose } from '../../lib/suivi/modele'
import { LIBELLES_POSITION } from '../../lib/resultats/expert/amontAval'
import { useTri } from '../../lib/tri'
import { EnTete } from '../Tri'

export function BadgeClasse({ classe, court = false }: { classe: Classe; court?: boolean }) {
  const k = CLASSES[classe]
  return (
    <span className="st-classe" style={{ background: k.fond, color: k.texte, borderColor: k.couleur }} title={k.libelle}>
      <span aria-hidden="true">{k.symbole}</span> {court ? k.court : k.libelle}
    </span>
  )
}

const ratioCourt = (r: number | null) => (r === null || r === 0 ? '' : r >= 100 ? `×${Math.round(r)}` : `×${fr(r, 2)}`)

/** Wells in columns, compounds in rows: the trend of each series at a glance. */
export function MatriceTendances({ analyse, composes, onChoisir }: { analyse: Analyse; composes: Compose[]; onChoisir: (s: AnalyseSerie) => void }) {
  const familles: { famille: string; composes: Compose[] }[] = []
  for (const c of composes) {
    const f = familles.find((x) => x.famille === c.famille)
    if (f) f.composes.push(c)
    else familles.push({ famille: c.famille, composes: [c] })
  }
  const largeur = analyse.ouvrages.length + 1
  return (
    <div className="tableau-defile">
      <table className="st-matrice">
        <thead>
          <tr>
            <th scope="col">Composé</th>
            {analyse.ouvrages.map((o) => (
              <th key={o.cle} scope="col" title={LIBELLES_POSITION[o.position]}>
                {o.nom}
                <span className="st-matrice__pos">{o.position === 'autre' ? '' : LIBELLES_POSITION[o.position]}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {familles.map((f) => (
            <FamilleLignes key={f.famille || '—'} famille={f.famille} composes={f.composes} analyse={analyse} largeur={largeur} onChoisir={onChoisir} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FamilleLignes({ famille, composes, analyse, largeur, onChoisir }: { famille: string; composes: Compose[]; analyse: Analyse; largeur: number; onChoisir: (s: AnalyseSerie) => void }) {
  return (
    <>
      {famille && (
        <tr className="st-matrice__famille">
          <td colSpan={largeur}>{famille}</td>
        </tr>
      )}
      {composes.map((c) => {
        const ref = analyse.references.get(c.cle)
        return (
          <tr key={c.cle}>
            <th scope="row">
              {c.nom}
              <span className="st-matrice__ref">{ref ? `réf. ${fr(ref.valeur)} ${c.unite}` : c.unite}</span>
            </th>
            {analyse.ouvrages.map((o) => {
              const s = analyse.parCle.get(`${o.cle}|${c.cle}`)
              if (!s || !s.n) return <td key={o.cle} className="st-matrice__vide" title="non analysé sur la période" />
              const k = CLASSES[s.classe]
              const depasse = s.ratioDernier !== null && s.ratioDernier > 1
              return (
                <td key={o.cle} className={`st-matrice__case${depasse ? ' st-matrice__case--depasse' : ''}`} style={{ background: k.fond, color: k.texte }}>
                  <button type="button" onClick={() => onChoisir(s)} title={infoSerie(s)}>
                    <span className="st-matrice__symbole" style={{ color: k.couleur }}>
                      {k.symbole}
                    </span>
                    <span className="st-matrice__ratio">{depasse || (s.ratioDernier ?? 0) >= analyse.reglages.vigilance ? ratioCourt(s.ratioDernier) : ''}</span>
                  </button>
                </td>
              )
            })}
          </tr>
        )
      })}
    </>
  )
}

export function LegendeClasses({ comptes }: { comptes?: Record<Classe, number> }) {
  return (
    <div className="st-legende">
      {ORDRE_CLASSES.map((c) => (
        <span key={c} className="st-legende__item">
          <BadgeClasse classe={c} court />
          {comptes && <span className="st-legende__n">{comptes[c]}</span>}
        </span>
      ))}
      <span className="st-legende__item">
        <span className="st-matrice__exemple-depasse" /> dernier résultat au-dessus de la valeur de référence (×n : rapport à la valeur)
      </span>
    </div>
  )
}

/** One card per well: its quantified compounds, their line and trend. */
export function FichesOuvrages({ analyse, composes, onChoisir }: { analyse: Analyse; composes: Compose[]; onChoisir: (s: AnalyseSerie) => void }) {
  const tMin = analyse.campagnes[0]?.t
  const tMax = analyse.campagnes[analyse.campagnes.length - 1]?.t
  return (
    <div className="st-fiches">
      {analyse.ouvrages.map((o) => {
        const ss = composes.map((c) => analyse.parCle.get(`${o.cle}|${c.cle}`)).filter((s): s is AnalyseSerie => !!s && s.nQ > 0)
        const prelevees = new Set(analyse.series.filter((s) => s.ouvrage === o).flatMap((s) => s.retenus.map((p) => p.resultat.campagne))).size
        const hausses = ss.filter((s) => s.classe === 'hausse' || s.classe === 'hausse-probable').length
        const depasse = ss.filter((s) => (s.ratioDernier ?? 0) > 1).length
        return (
          <article key={o.cle} className="st-fiche card">
            <header className="st-fiche__tete">
              <strong>{o.nom}</strong>
              <span className="st-fiche__pos">{LIBELLES_POSITION[o.position]}</span>
              <span className="st-fiche__meta">
                {prelevees}/{analyse.campagnes.length} campagnes · {ss.length} composé{ss.length > 1 ? 's' : ''} quantifié{ss.length > 1 ? 's' : ''}
                {hausses > 0 && <span className="st-pastille st-pastille--alerte">{hausses} en hausse</span>}
                {depasse > 0 && <span className="st-pastille st-pastille--vigilance">{depasse} &gt; réf.</span>}
              </span>
            </header>
            {ss.length === 0 ? (
              <p className="st-fiche__vide">Aucun composé quantifié sur la période.</p>
            ) : (
              <table className="st-fiche__table">
                <tbody>
                  {ss.map((s) => (
                    <tr key={s.cle} onClick={() => onChoisir(s)} title={infoSerie(s)}>
                      <td className="st-fiche__nom">{s.compose.nom}</td>
                      <td
                        className="st-fiche__spark"
                        dangerouslySetInnerHTML={{
                          __html: sparkline(
                            s.points.filter((p) => p.dansFenetre).map((p) => ({ t: p.t, valeur: p.valeur, inferieur: p.inferieur, exclu: p.exclu })),
                            { couleur: CLASSES[s.classe].couleur, reference: s.reference?.valeur ?? null, tMin, tMax, largeur: 110, hauteur: 26 },
                          ),
                        }}
                      />
                      <td>
                        <BadgeClasse classe={s.classe} court />
                      </td>
                      <td className="st-fiche__val">
                        {s.derniere ? `${s.derniere.inferieur ? '<' : ''}${fr(s.derniere.valeur)}` : '–'}
                        <span className={`st-fiche__ratio${(s.ratioDernier ?? 0) > 1 ? ' st-fiche__ratio--depasse' : ''}`}>{ratioCourt(s.ratioDernier)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </article>
        )
      })}
    </div>
  )
}

/** Every series with its statistics, sortable, filtered by class. */
export function TableauTendances({ analyse, onChoisir }: { analyse: Analyse; onChoisir: (s: AnalyseSerie) => void }) {
  const [classes, setClasses] = useState<Set<Classe>>(new Set(ORDRE_CLASSES.filter((c) => c !== 'non-quantifie' && c !== 'insuffisant')))
  const [terrain, setTerrain] = useState(false)
  const lignes = useMemo(
    () => analyse.series.filter((s) => s.n > 0 && classes.has(s.classe) && (terrain || !s.compose.terrain)),
    [analyse, classes, terrain],
  )
  const { tries, tri, trier } = useTri(
    lignes,
    {
      ouvrage: (s) => s.ouvrage.nom,
      compose: (s) => s.compose.nom,
      n: (s) => s.n,
      q: (s) => s.frequence,
      max: (s) => s.max,
      dernier: (s) => s.derniere?.valeur,
      ratio: (s) => s.ratioDernier,
      classe: (s) => ORDRE_CLASSES.indexOf(s.classe),
      p: (s) => s.mk?.pBilateral,
      sen: (s) => s.senRelatif,
      demi: (s) => s.decroissance?.demiVie,
    },
    { cle: 'classe', sens: 'asc' },
  )
  const basculer = (c: Classe) => {
    const suite = new Set(classes)
    if (suite.has(c)) suite.delete(c)
    else suite.add(c)
    setClasses(suite)
  }
  return (
    <>
      <div className="st-filtres">
        {ORDRE_CLASSES.map((c) => (
          <button key={c} type="button" className={`st-filtre${classes.has(c) ? ' st-filtre--actif' : ''}`} onClick={() => basculer(c)} aria-pressed={classes.has(c)}>
            <BadgeClasse classe={c} court /> {analyse.comptes[c]}
          </button>
        ))}
        <label className="st-coche">
          <input type="checkbox" checked={terrain} onChange={(e) => setTerrain(e.target.checked)} /> paramètres de terrain
        </label>
      </div>
      <div className="tableau-defile" style={{ maxHeight: '34rem' }}>
        <table className="tableau st-tableau">
          <thead>
            <tr>
              <EnTete cle="ouvrage" tri={tri} onTrier={trier}>
                Ouvrage
              </EnTete>
              <EnTete cle="compose" tri={tri} onTrier={trier}>
                Composé
              </EnTete>
              <EnTete cle="n" tri={tri} onTrier={trier}>
                n
              </EnTete>
              <EnTete cle="q" tri={tri} onTrier={trier}>
                Quantif.
              </EnTete>
              <EnTete cle="max" tri={tri} onTrier={trier}>
                Max
              </EnTete>
              <EnTete cle="dernier" tri={tri} onTrier={trier}>
                Dernier
              </EnTete>
              <EnTete cle="ratio" tri={tri} onTrier={trier}>
                / réf.
              </EnTete>
              <EnTete cle="classe" tri={tri} onTrier={trier}>
                Tendance
              </EnTete>
              <EnTete cle="p" tri={tri} onTrier={trier}>
                p (MK)
              </EnTete>
              <EnTete cle="sen" tri={tri} onTrier={trier}>
                Pente de Sen
              </EnTete>
              <EnTete cle="demi" tri={tri} onTrier={trier}>
                Demi-vie
              </EnTete>
              <th>Horizon réf.</th>
              <th>Remarques</th>
            </tr>
          </thead>
          <tbody>
            {tries.map((s) => (
              <tr key={s.cle} className="st-tableau__ligne" onClick={() => onChoisir(s)}>
                <th scope="row">{s.ouvrage.nom}</th>
                <td>{s.compose.nom}</td>
                <td>{s.n}</td>
                <td>{Math.round(s.frequence * 100)} %</td>
                <td>{s.max !== null ? fr(s.max) : '–'}</td>
                <td>{s.derniere ? `${s.derniere.inferieur ? '<' : ''}${fr(s.derniere.valeur)}` : '–'}</td>
                <td className={(s.ratioDernier ?? 0) > 1 ? 'st-depasse' : ''}>{s.ratioDernier ? fr(s.ratioDernier, 2) : '–'}</td>
                <td>
                  <BadgeClasse classe={s.classe} court />
                </td>
                <td>{s.mk ? pTexte(s.mk.pBilateral).replace('p = ', '').replace('p ', '') : '–'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{s.statut === 'teste' ? frPente(s) : '–'}</td>
                <td>{s.decroissance ? `${fr(s.decroissance.demiVie, 2)} an${s.decroissance.demiVie >= 2 ? 's' : ''}` : '–'}</td>
                <td>{s.horizon ? `${s.horizon.sens === 'sous' ? '↓' : '↑'} ${frAnnee(s.horizon.annee)}` : '–'}</td>
                <td className="st-tableau__remarques">{[s.rupture ? `rupture ${s.rupture.entre[1].slice(0, 7)}` : '', ...s.avertissements].filter(Boolean).join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="st-note">
        {tries.length} série{tries.length > 1 ? 's' : ''} · unités : celles de chaque composé · « / réf. » : dernier résultat rapporté à la valeur de référence · « Horizon réf. » : année où la
        tendance ajustée (décroissance exponentielle) atteindrait la valeur de référence — projection indicative.
      </p>
    </>
  )
}
