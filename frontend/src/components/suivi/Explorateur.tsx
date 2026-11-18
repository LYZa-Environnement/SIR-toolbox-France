import type { ReactNode } from 'react'
import { CLASSES, fr, frAnnee, frPente, pTexte, type Analyse, type AnalyseSerie } from '../../lib/suivi/analyse'
import { formatDate } from '../../lib/suivi/dates'
import { figureCompose, figureOuvrage, figureSerie } from '../../lib/suivi/figures'
import { LIBELLES_POSITION } from '../../lib/resultats/expert/amontAval'
import { Figure } from './Figure'
import type { OptionsVue, Selection } from '../../lib/suivi/ui'
import { BadgeClasse } from './Tendances'

function Bascule({ actif, onChange, children, disabled }: { actif: boolean; onChange: (v: boolean) => void; children: string; disabled?: boolean }) {
  return (
    <label className={`st-bascule${actif ? ' st-bascule--actif' : ''}${disabled ? ' st-bascule--inactif' : ''}`}>
      <input type="checkbox" checked={actif} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  )
}

/** The chart explorer: a compound on the wells, the compounds of a well, or one series in detail. */
export function Explorateur({
  analyse,
  selection,
  onSelection,
  options,
  onOptions,
  onExclure,
}: {
  analyse: Analyse
  selection: Selection
  onSelection: (s: Selection) => void
  options: OptionsVue
  onOptions: (o: OptionsVue) => void
  onExclure: (id: string) => void
}) {
  const a = analyse
  const composes = a.base.composes.filter((c) => a.series.some((s) => s.compose === c && s.n > 0))
  const compose = composes.find((c) => c.cle === selection.compose) ?? a.composesQuantifies[0] ?? composes[0]
  const ouvrage = a.ouvrages.find((o) => o.cle === selection.ouvrage) ?? a.ouvrages[0]
  if (!compose || !ouvrage) return <p className="st-note">Aucune série à afficher.</p>
  const log = options.log === 'auto' ? 'auto' : options.log === 'log'
  const o = { log, sen: options.sen, lissage: options.lissage, niveaux: options.niveaux, fenetreSeule: options.fenetreSeule } as const
  const avecNiveaux = a.piezo.length > 0

  let rendu = null
  let series: AnalyseSerie[] = []
  let nom = ''
  if (selection.mode === 'compose') {
    const ovs = selection.ouvrages.length ? a.ouvrages.filter((x) => selection.ouvrages.includes(x.cle)) : a.ouvrages
    rendu = figureCompose(a, compose, ovs, o)
    series = ovs.map((x) => a.parCle.get(`${x.cle}|${compose.cle}`)).filter((s): s is AnalyseSerie => !!s && s.n > 0)
    nom = `${compose.nom} - ouvrages`
  } else if (selection.mode === 'ouvrage') {
    const parDefaut = a.composesQuantifies.filter((c) => c.famille === compose.famille && a.parCle.get(`${ouvrage.cle}|${c.cle}`)?.nQ)
    const cs = selection.composes.length ? composes.filter((c) => selection.composes.includes(c.cle)) : parDefaut.length ? parDefaut : [compose]
    rendu = figureOuvrage(a, ouvrage, cs, { ...o, titre: `${ouvrage.nom} — ${[...new Set(cs.map((c) => c.famille || c.nom))].join(', ')}` })
    series = cs.map((c) => a.parCle.get(`${ouvrage.cle}|${c.cle}`)).filter((s): s is AnalyseSerie => !!s && s.n > 0)
    nom = `${ouvrage.nom} - ${cs.map((c) => c.nom).join(', ')}`
  } else {
    const s = a.parCle.get(`${ouvrage.cle}|${compose.cle}`)
    if (s) {
      rendu = figureSerie(a, s, o)
      series = [s]
    }
    nom = `${compose.nom} - ${ouvrage.nom}`
  }
  const choisir = (p: Partial<Selection>) => onSelection({ ...selection, ...p })
  const basculerOuvrage = (cle: string) => {
    const base = selection.ouvrages.length ? selection.ouvrages : a.ouvrages.map((x) => x.cle)
    const suite = base.includes(cle) ? base.filter((x) => x !== cle) : [...base, cle]
    choisir({ ouvrages: suite.length === a.ouvrages.length ? [] : suite })
  }
  const composesOuvrage = composes.filter((c) => a.parCle.get(`${ouvrage.cle}|${c.cle}`)?.n)
  const affiches = selection.mode === 'ouvrage' ? series.map((s) => s.compose.cle) : []
  const basculerCompose = (cle: string) => {
    const base = affiches
    choisir({ composes: base.includes(cle) ? base.filter((x) => x !== cle) : [...base, cle] })
  }

  return (
    <div className="st-explorateur">
      <div className="st-onglets" role="tablist" aria-label="Vue">
        {(
          [
            ['compose', 'Un composé, tous les ouvrages'],
            ['ouvrage', 'Un ouvrage, plusieurs composés'],
            ['serie', 'Une série en détail'],
          ] as const
        ).map(([m, lib]) => (
          <button key={m} type="button" role="tab" aria-selected={selection.mode === m} className={`st-onglet${selection.mode === m ? ' st-onglet--actif' : ''}`} onClick={() => choisir({ mode: m })}>
            {lib}
          </button>
        ))}
      </div>

      <div className="st-commandes">
          <label className="champ">
            Composé
            <select value={compose.cle} onChange={(e) => choisir({ compose: e.target.value, composes: [] })}>
              {[...new Set(composes.map((c) => c.famille))].map((f) => (
                <optgroup key={f || '—'} label={f || 'Sans famille'}>
                  {composes
                    .filter((c) => c.famille === f)
                    .map((c) => (
                      <option key={c.cle} value={c.cle}>
                        {c.nom}
                        {a.composesQuantifies.includes(c) ? '' : ' (jamais quantifié)'}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
        {selection.mode !== 'compose' && (
          <label className="champ">
            Ouvrage
            <select value={ouvrage.cle} onChange={(e) => choisir({ ouvrage: e.target.value, composes: [] })}>
              {a.ouvrages.map((x) => (
                <option key={x.cle} value={x.cle}>
                  {x.nom} ({LIBELLES_POSITION[x.position]})
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="champ">
          Échelle
          <select value={options.log} onChange={(e) => onOptions({ ...options, log: e.target.value as OptionsVue['log'] })}>
            <option value="auto">automatique</option>
            <option value="lin">linéaire</option>
            <option value="log">logarithmique</option>
          </select>
        </label>
        <div className="st-bascules">
          <Bascule actif={options.sen} onChange={(v) => onOptions({ ...options, sen: v })}>
            Pente de Sen
          </Bascule>
          <Bascule actif={options.lissage} onChange={(v) => onOptions({ ...options, lissage: v })}>
            Lissage LOWESS
          </Bascule>
          <Bascule actif={options.niveaux} disabled={!avecNiveaux} onChange={(v) => onOptions({ ...options, niveaux: v })}>
            Niveau de la nappe
          </Bascule>
          <Bascule actif={options.fenetreSeule} onChange={(v) => onOptions({ ...options, fenetreSeule: v })}>
            Période analysée seule
          </Bascule>
        </div>
      </div>

      {selection.mode === 'compose' && (
        <div className="st-puces">
          {a.ouvrages.map((x) => {
            const actif = !selection.ouvrages.length || selection.ouvrages.includes(x.cle)
            const s = a.parCle.get(`${x.cle}|${compose.cle}`)
            return (
              <button key={x.cle} type="button" className={`st-puce${actif ? ' st-puce--actif' : ''}`} onClick={() => basculerOuvrage(x.cle)} disabled={!s?.n} aria-pressed={actif}>
                {x.nom} {s?.n ? CLASSES[s.classe].symbole : '—'}
              </button>
            )
          })}
        </div>
      )}
      {selection.mode === 'ouvrage' && (
        <div className="st-puces">
          {composesOuvrage.map((c) => {
            const s = a.parCle.get(`${ouvrage.cle}|${c.cle}`)!
            const actif = affiches.includes(c.cle)
            return (
              <button key={c.cle} type="button" className={`st-puce${actif ? ' st-puce--actif' : ''}${s.nQ ? '' : ' st-puce--nq'}`} onClick={() => basculerCompose(c.cle)} aria-pressed={actif}>
                {c.nom} {CLASSES[s.classe].symbole}
              </button>
            )
          })}
        </div>
      )}

      {rendu ? (
        <Figure
          svg={rendu.svg}
          largeur={rendu.largeur}
          hauteur={rendu.hauteur}
          cibles={rendu.cibles}
          nom={nom}
          onPoint={onExclure}
          aide="Survolez un point pour sa valeur ; un clic l'écarte de l'analyse (ou le reprend). Cercle rouge pointillé : résultat atypique."
        />
      ) : (
        <p className="st-note">Pas de résultat pour cette sélection.</p>
      )}

      {selection.mode === 'serie' && series[0] ? <DetailSerie s={series[0]} alpha={a.reglages.alpha} /> : <ResumeSeries series={series} onChoisir={(s) => choisir({ mode: 'serie', ouvrage: s.ouvrage.cle, compose: s.compose.cle })} />}
    </div>
  )
}

function ResumeSeries({ series, onChoisir }: { series: AnalyseSerie[]; onChoisir: (s: AnalyseSerie) => void }) {
  if (!series.length) return null
  return (
    <div className="tableau-defile">
      <table className="tableau st-tableau">
        <thead>
          <tr>
            <th>Série</th>
            <th>n</th>
            <th>Quantifiés</th>
            <th>Max</th>
            <th>Dernier</th>
            <th>Tendance</th>
            <th>p</th>
            <th>Pente de Sen</th>
            <th>Demi-vie</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {series.map((s) => (
            <tr key={s.cle}>
              <th scope="row">
                {s.ouvrage.nom} · {s.compose.nom}
              </th>
              <td>{s.n}</td>
              <td>{s.nQ}</td>
              <td>{s.max !== null ? `${fr(s.max)} ${s.compose.unite}` : '–'}</td>
              <td className={(s.ratioDernier ?? 0) > 1 ? 'st-depasse' : ''}>{s.derniere ? `${s.derniere.inferieur ? '<' : ''}${fr(s.derniere.valeur)}` : '–'}</td>
              <td>
                <BadgeClasse classe={s.classe} court />
              </td>
              <td>{s.mk ? pTexte(s.mk.pBilateral).replace(/^p = /, '').replace(/^p /, '') : '–'}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{s.statut === 'teste' ? frPente(s) : '–'}</td>
              <td>{s.decroissance ? `${fr(s.decroissance.demiVie, 2)} ans` : '–'}</td>
              <td>
                <button type="button" className="btn btn--ghost btn--petit" onClick={() => onChoisir(s)}>
                  Détail
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Ligne({ libelle, children, aide }: { libelle: string; children: ReactNode; aide?: string }) {
  return (
    <div className="st-detail__ligne" title={aide}>
      <dt>{libelle}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/** Every figure of a series, as in the statistics sheet of the export. */
export function DetailSerie({ s, alpha }: { s: AnalyseSerie; alpha: number }) {
  const u = s.compose.unite
  const mk = s.mk
  return (
    <div className="st-detail">
      <div className="st-detail__tete">
        <BadgeClasse classe={s.classe} />
        {s.avertissements.map((x) => (
          <span key={x} className="st-pastille st-pastille--vigilance">
            {x}
          </span>
        ))}
      </div>
      <div className="st-detail__colonnes">
        <dl>
          <h4>Résultats</h4>
          <Ligne libelle="Période">
            {s.premiere ? `${formatDate(s.premiere.date)} → ${formatDate(s.derniere!.date)}` : '–'}
          </Ligne>
          <Ligne libelle="Résultats / quantifiés">
            {s.n} / {s.nQ} ({Math.round(s.frequence * 100)} %)
          </Ligne>
          <Ligne libelle="Minimum – maximum quantifiés">{s.min !== null ? `${fr(s.min)} – ${fr(s.max)} ${u}` : '–'}</Ligne>
          <Ligne libelle="Moyenne / médiane" aide="Résultats < LQ comptés à LQ/2 (directive 2009/90/CE)">
            {fr(s.moyenne)} / {fr(s.mediane)} {u}
          </Ligne>
          <Ligne libelle="Coefficient de variation">{fr(s.cov, 2)}</Ligne>
          <Ligne libelle="LQ rencontrées">{s.lqMin !== null ? `${fr(s.lqMin)} – ${fr(s.lqMax)} ${u}` : '–'}</Ligne>
          <Ligne libelle="Valeur de référence">{s.reference ? `${fr(s.reference.valeur)} ${u} ${s.reference.saisie ? '(saisie)' : s.reference.source}` : 'aucune'}</Ligne>
          <Ligne libelle="Dépassements">
            {s.reference ? `${s.depassements} sur ${s.n}${s.depassementsConsecutifs ? ` (${s.depassementsConsecutifs} dernières campagnes)` : ''}` : '–'}
          </Ligne>
          <Ligne libelle="Dernier / référence">{s.ratioDernier !== null ? fr(s.ratioDernier, 2) : '–'}</Ligne>
        </dl>
        <dl>
          <h4>Tendance (Mann-Kendall, Theil-Sen)</h4>
          <Ligne libelle="S / Var(S)">{mk ? `${mk.S} / ${fr(mk.varS, 4)}` : '–'}</Ligne>
          <Ligne libelle="Z / tau de Kendall">{mk ? `${fr(mk.Z, 3)} / ${fr(mk.tau, 2)}` : '–'}</Ligne>
          <Ligne libelle="p bilatéral" aide={mk?.exact ? 'Loi exacte de S (série courte sans ex aequo)' : 'Approximation normale avec correction de continuité'}>
            {mk ? `${pTexte(mk.pBilateral)}${mk.exact ? ' (exact)' : ''}` : '–'}
          </Ligne>
          <Ligne libelle="Confiance dans le sens">{mk ? `${fr(mk.confiance * 100, 3)} %` : '–'}</Ligne>
          <Ligne libelle="Pente de Sen">{s.statut === 'teste' ? frPente(s) : '–'}</Ligne>
          <Ligne libelle={`Intervalle de confiance ${Math.round((1 - alpha) * 100)} %`}>
            {s.sen && s.sen.basse !== null ? `${fr(s.sen.basse)} à ${fr(s.sen.haute)} ${u}/an` : '–'}
          </Ligne>
          <Ligne libelle="Kendall saisonnier (HE / BE)">{s.saisonnier ? `${pTexte(s.saisonnier.pBilateral)}, S = ${s.saisonnier.S}` : '–'}</Ligne>
          <Ligne libelle="Rupture (Pettitt)">
            {s.rupture ? `entre le ${formatDate(s.rupture.entre[0])} et le ${formatDate(s.rupture.entre[1])}, ${pTexte(s.rupture.p)} (médiane ${fr(s.rupture.avant)} → ${fr(s.rupture.apres)} ${u})` : 'aucune significative'}
          </Ligne>
          <Ligne libelle="Demi-vie apparente" aide="Décroissance du premier ordre ajustée par Theil-Sen sur ln C">
            {s.decroissance
              ? `${fr(s.decroissance.demiVie, 2)} ans (k = ${fr(s.decroissance.k, 2)} /an${s.decroissance.kBas && s.decroissance.kHaut ? `, ${fr(Math.LN2 / s.decroissance.kHaut, 2)} à ${fr(Math.LN2 / s.decroissance.kBas, 2)} ans` : ''})`
              : '–'}
          </Ligne>
          <Ligne libelle="Horizon de la valeur de référence" aide="Année où la tendance ajustée sur ln C atteindrait la valeur de référence : projection indicative">
            {s.horizon
              ? `${s.horizon.sens === 'sous' ? 'passage sous' : 'atteinte'} vers ${frAnnee(s.horizon.annee)}${s.horizon.plusTot && s.horizon.plusTard ? ` (${frAnnee(s.horizon.plusTot)} à ${frAnnee(s.horizon.plusTard)})` : ''}`
              : '–'}
          </Ligne>
        </dl>
      </div>
      <details className="st-detail__resultats">
        <summary>Résultats de la série ({s.points.length})</summary>
        <table className="tableau st-tableau">
          <thead>
            <tr>
              <th>Date</th>
              <th>Régime</th>
              <th>Résultat ({u})</th>
              <th>Fichier</th>
              <th>État</th>
            </tr>
          </thead>
          <tbody>
            {s.points.map((p) => (
              <tr key={p.resultat.id} className={p.exclu || !p.dansFenetre ? 'tableau__exclu' : ''}>
                <th scope="row">{formatDate(p.date)}</th>
                <td>{p.regime ?? '–'}</td>
                <td className={s.reference && !p.inferieur && p.valeur > s.reference.valeur ? 'st-depasse' : ''}>{p.resultat.brut}</td>
                <td style={{ fontSize: '0.78rem' }}>{p.resultat.fichier}</td>
                <td>{p.exclu ? 'écarté' : !p.dansFenetre ? 'hors période' : p.atypique ? 'atypique' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
