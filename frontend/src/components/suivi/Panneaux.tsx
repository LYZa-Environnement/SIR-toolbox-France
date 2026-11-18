import { useState } from 'react'
import { CLASSES, direction, fr, LIBELLES_CENSURE, LIBELLES_PISTE, pTexte, type Analyse, type Fait, type NiveauFait, type TypePiste } from '../../lib/suivi/analyse'
import { formatDate } from '../../lib/suivi/dates'
import { figureDegradation, figureEcoulement, figureNiveaux, figurePlan, type ModeNiveaux } from '../../lib/suivi/figures'
import { barresSvg } from '../../lib/suivi/graphique'
import { LIBELLES_POSITION } from '../../lib/resultats/expert/amontAval'
import { Figure } from './Figure'

const LIBELLES_NIVEAU: Record<NiveauFait, string> = { alerte: 'Alerte', vigilance: 'Vigilance', favorable: 'Favorable', info: 'À noter' }

/** The key facts, most important first; a click opens the series. */
export function Faits({ faits, onChoisir, limite = 12 }: { faits: Fait[]; onChoisir: (f: Fait) => void; limite?: number }) {
  const [tous, setTous] = useState(false)
  const [filtre, setFiltre] = useState<NiveauFait | null>(null)
  const liste = faits.filter((f) => !filtre || f.niveau === filtre)
  const vus = tous ? liste : liste.slice(0, limite)
  const compte = (n: NiveauFait) => faits.filter((f) => f.niveau === n).length
  return (
    <div className="st-faits">
      <div className="st-filtres">
        {(['alerte', 'vigilance', 'favorable', 'info'] as NiveauFait[]).map((n) => (
          <button key={n} type="button" className={`st-filtre st-filtre--${n}${filtre === n ? ' st-filtre--actif' : ''}`} onClick={() => setFiltre(filtre === n ? null : n)} aria-pressed={filtre === n}>
            {LIBELLES_NIVEAU[n]} <strong>{compte(n)}</strong>
          </button>
        ))}
      </div>
      <ul className="st-faits__liste">
        {vus.map((f, i) => (
          <li key={i} className={`st-fait st-fait--${f.niveau}`}>
            <span className="st-fait__niveau">{LIBELLES_NIVEAU[f.niveau]}</span>
            <div className="st-fait__texte">
              {f.ouvrage && f.compose ? (
                <button type="button" className="st-fait__titre st-lien" onClick={() => onChoisir(f)}>
                  {f.titre}
                </button>
              ) : (
                <strong className="st-fait__titre">{f.titre}</strong>
              )}
              <span className="st-fait__detail">{f.detail}</span>
            </div>
          </li>
        ))}
      </ul>
      {liste.length > limite && (
        <button type="button" className="btn btn--ghost btn--petit" onClick={() => setTous(!tous)}>
          {tous ? 'Réduire' : `Voir les ${liste.length} faits`}
        </button>
      )}
    </div>
  )
}

export function Pistes({ analyse }: { analyse: Analyse }) {
  const types: TypePiste[] = ['renforcer', 'maintenir', 'completer', 'alleger', 'retirer']
  return (
    <div className="st-pistes">
      <p className="st-note">
        Ces pistes appliquent des critères simples et explicites aux résultats de la période. Elles ne remplacent ni le jugement de l'ingénieur ni la démarche du guide BRGM/INERIS
        « Évolution et arrêt de la surveillance des eaux souterraines » (2022) : état de la source, usages et enjeux en aval, représentativité des ouvrages, sens d'écoulement,
        conditions fixées par l'arrêté préfectoral.
      </p>
      {types.map((t) => {
        const ps = analyse.pistes.filter((p) => p.type === t)
        if (!ps.length) return null
        return (
          <section key={t} className="st-pistes__groupe">
            <h4 style={{ color: LIBELLES_PISTE[t].couleur }}>{LIBELLES_PISTE[t].libelle}</h4>
            <ul>
              {ps.map((p, i) => (
                <li key={i}>
                  <strong>{p.cible}</strong> — {p.texte}
                  <span className="st-pistes__critere">Critère : {p.critere}</span>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
      {!analyse.pistes.length && <p className="st-note">Aucune piste particulière ne ressort des critères appliqués.</p>}
    </div>
  )
}

export function Qualite({ analyse }: { analyse: Analyse }) {
  return (
    <ul className="st-qualite">
      {analyse.qualite.map((n, i) => (
        <li key={i} className={`st-qualite__item st-qualite__item--${n.niveau}`}>
          {n.texte}
        </li>
      ))}
      {!analyse.qualite.length && <li className="st-qualite__item">Rien à signaler.</li>}
    </ul>
  )
}

export function Indicateurs({ analyse }: { analyse: Analyse }) {
  const svg = barresSvg({
    titre: 'Résultats au-dessus de la valeur de référence, par campagne',
    unite: 'nombre',
    categories: analyse.indicateurs.map((x) => `${formatDate(x.campagne.date).slice(3)}${x.campagne.regime ? ` ${x.campagne.regime}` : ''}`),
    series: [
      { nom: 'résultats > valeur de référence', couleur: '#c0392b', valeurs: analyse.indicateurs.map((x) => x.depassements) },
      { nom: 'ouvrages concernés', couleur: '#e08e0b', valeurs: analyse.indicateurs.map((x) => x.ouvragesDepassement.length) },
    ],
  })
  return (
    <>
      <Figure svg={svg} largeur={820} hauteur={300} nom="Depassements par campagne" />
      <div className="tableau-defile">
        <table className="tableau st-tableau">
          <thead>
            <tr>
              <th>Campagne</th>
              <th>Régime</th>
              <th>Ouvrages prélevés</th>
              <th>Résultats quantifiés</th>
              <th>Au-dessus de la référence</th>
              <th>Ouvrages concernés</th>
            </tr>
          </thead>
          <tbody>
            {analyse.indicateurs.map((x) => (
              <tr key={x.campagne.id}>
                <th scope="row">{formatDate(x.campagne.date)}</th>
                <td>{x.campagne.regime ?? '–'}</td>
                <td>{x.prelevements}</td>
                <td>{x.quantifies}</td>
                <td className={x.depassements ? 'st-depasse' : ''}>{x.depassements}</td>
                <td>{x.ouvragesDepassement.map((k) => analyse.ouvrages.find((o) => o.cle === k)?.nom ?? k).join(', ') || '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

export function Degradation({ analyse }: { analyse: Analyse }) {
  const [i, setI] = useState(0)
  const d = analyse.degradation[Math.min(i, analyse.degradation.length - 1)]
  if (!d) return <p className="st-note">Pas assez de chloroéthènes quantifiés (au moins deux espèces sur trois campagnes) pour suivre la déchloration.</p>
  const svg = figureDegradation(analyse, Math.min(i, analyse.degradation.length - 1))!
  return (
    <>
      <div className="st-commandes">
        <label className="champ">
          Ouvrage
          <select value={i} onChange={(e) => setI(Number(e.target.value))}>
            {analyse.degradation.map((x, k) => (
              <option key={x.ouvrage.cle} value={k}>
                {x.ouvrage.nom}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ul className="st-lecture">
        {d.lecture.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <Figure svg={svg} largeur={820} hauteur={340} nom={`Dechloration ${d.ouvrage.nom}`} />
      <details className="st-explication">
        <summary>Que dit le nombre moyen d'atomes de chlore ?</summary>
        <p>
          La déchloration réductrice retire un atome de chlore à chaque étape : PCE (4 Cl) → TCE (3) → DCE (2) → chlorure de vinyle (1) → éthène (0). Le nombre moyen d'atomes de chlore
          par molécule, pondéré par les concentrations molaires (µmol/l), résume en un chiffre où en est le mélange : 4 pour un PCE pur, 2 pour un mélange dominé par le DCE, sous 1
          quand l'éthène apparaît. Sa baisse dans le temps signe une déchloration en cours (USEPA, 1998, EPA/600/R-98/128).
        </p>
        <p>
          Il se lit avec le total des chloroéthènes en moles : chlore en baisse et total stable, c'est une transformation ; total en baisse et composition inchangée, c'est plutôt une
          dilution, une dispersion ou l'épuisement de la source ; un chlore moyen qui stagne autour de 2 avec beaucoup de DCE signale un blocage possible au stade DCE ; une part
          croissante de chlorure de vinyle sans éthène, une dernière étape qui ne se fait pas. Ce n'est qu'un indicateur : il suppose des espèces de mobilité comparable et une
          même source, et se confirme par les conditions redox (O2, nitrates, fer II, sulfates, méthane) et, au besoin, l'analyse de l'éthène, de l'éthane et des micro-organismes
          déchlorants.
        </p>
      </details>
    </>
  )
}

export function Piezometrie({ analyse }: { analyse: Analyse }) {
  const enCharge = analyse.piezo.length > 0 && analyse.piezo.every((p) => p.enCharge)
  const profondeursSeules = analyse.piezo.filter((p) => !p.enCharge)
  const [mode, setMode] = useState<ModeNiveaux | null>(null)
  const modeEffectif: ModeNiveaux = mode ?? (enCharge || profondeursSeules.length === analyse.piezo.length ? 'niveau' : 'ecart')
  const r = figureNiveaux(analyse, { mode: modeEffectif })
  if (!r) return <p className="st-note">Aucun niveau d'eau : chargez les fiches de prélèvement ou un tableau historique avec un onglet « Niveaux ».</p>
  const profondeur = (v: number, p: { enCharge: boolean }) => (p.enCharge ? v : -v)
  return (
    <>
      {profondeursSeules.length > 0 && (
        <p className="st-note" style={{ maxWidth: '62rem' }}>
          {profondeursSeules.length === analyse.piezo.length ? "Aucun ouvrage n'a de cote NGF du repère" : `${profondeursSeules.map((p) => p.ouvrage.nom).join(', ')} : pas de cote NGF du repère`}{' '}
          — seule la profondeur de l'eau sous le repère est connue. Chaque ouvrage se lit donc seul (battement, tendance, lien avec les concentrations, régime hautes / basses eaux), mais les
          ouvrages ne se comparent pas entre eux : pas de sens d'écoulement ni de position amont / aval déduits des niveaux. La vue « écart au niveau médian » met néanmoins leurs
          battements côte à côte. Pour aller plus loin, la cote du repère (nivellement) se saisit à l'étape 3.
        </p>
      )}
      <div className="st-onglets" role="radiogroup" aria-label="Représentation des niveaux" style={{ marginBottom: '0.6rem' }}>
        <button type="button" role="radio" aria-checked={modeEffectif === 'niveau'} className={`st-onglet${modeEffectif === 'niveau' ? ' st-onglet--actif' : ''}`} onClick={() => setMode('niveau')}>
          {enCharge ? 'Cote de la nappe (m NGF)' : profondeursSeules.length === analyse.piezo.length ? "Profondeur de l'eau sous le repère" : 'Niveaux mesurés'}
        </button>
        <button type="button" role="radio" aria-checked={modeEffectif === 'ecart'} className={`st-onglet${modeEffectif === 'ecart' ? ' st-onglet--actif' : ''}`} onClick={() => setMode('ecart')}>
          Écart au niveau médian de chaque ouvrage
        </button>
      </div>
      <Figure svg={r.svg} largeur={r.largeur} hauteur={r.hauteur} cibles={r.cibles} nom={modeEffectif === 'ecart' ? 'Battement de la nappe' : 'Niveaux de la nappe'} />
      <div className="tableau-defile">
        <table className="tableau st-tableau">
          <thead>
            <tr>
              <th>Ouvrage</th>
              <th>Relevés</th>
              <th>Niveau mesuré</th>
              <th>Min – max</th>
              <th>Battement</th>
              <th>Évolution de la nappe</th>
              <th>Liens concentration – niveau (tau de Kendall)</th>
            </tr>
          </thead>
          <tbody>
            {analyse.piezo.map((p) => {
              const vs = p.serie.map((x) => profondeur(x.v, p))
              const sens = p.mk && p.mk.pBilateral <= analyse.reglages.alpha ? (p.mk.S > 0 ? 'nappe en hausse' : 'nappe en baisse') : 'pas de tendance'
              return (
                <tr key={p.ouvrage.cle}>
                  <th scope="row">{p.ouvrage.nom}</th>
                  <td>{p.serie.length}</td>
                  <td style={{ fontSize: '0.8rem' }}>{p.enCharge ? 'cote NGF' : 'profondeur / repère'}</td>
                  <td>
                    {fr(Math.min(...vs), 4)} – {fr(Math.max(...vs), 4)} {p.enCharge ? 'm NGF' : 'm'}
                  </td>
                  <td>{fr(p.amplitude, 2)} m</td>
                  <td>
                    {p.mk ? `${sens} (${pTexte(p.mk.pBilateral)}${p.sen ? `, ${p.sen.pente > 0 ? '+' : ''}${fr(p.sen.pente, 2)} m/an` : ''})` : '–'}
                  </td>
                  <td style={{ fontSize: '0.82rem' }}>
                    {p.correlations
                      .filter((c) => c.c.p <= 0.1)
                      .map((c) => `${c.compose.nom} ${c.c.tau > 0 ? '+' : ''}${fr(c.c.tau, 2)} (${pTexte(c.c.p)})`)
                      .join(' ; ') || 'aucun lien net'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Ecoulement analyse={analyse} />
      <p className="st-note">
        Évolution et liens se calculent sur le niveau de la nappe (une profondeur qui diminue est une nappe qui monte), ouvrage par ouvrage : ils restent valables avec les seules
        profondeurs. Un tau positif : concentrations plus fortes quand la nappe est haute (remobilisation dans la zone de battement, lessivage de la zone non saturée) ; négatif : plus
        fortes en basses eaux (moindre dilution). Liens affichés pour p ≤ 0,10, sur au moins 6 campagnes appariées.
      </p>
    </>
  )
}

function Ecoulement({ analyse }: { analyse: Analyse }) {
  const e = analyse.ecoulement
  if (!e)
    return (
      <p className="st-note">
        Sens d'écoulement non calculé : il faut comparer les niveaux entre ouvrages, donc des cotes NGF (cote du repère nivelée, saisie à l'étape 3, ou niveaux en m NGF) et les
        coordonnées X / Y (en mètres) d'au moins trois ouvrages non alignés. Avec les seules profondeurs sous repère, la position amont / aval des ouvrages vient de la carte
        piézométrique de l'étude et se renseigne à l'étape 3.
      </p>
    )
  const r = figureEcoulement(analyse)
  return (
    <>
      <h4 className="st-sous-titre">Sens d'écoulement et gradient, campagne par campagne</h4>
      <p className="st-note">
        Plan ajusté par moindres carrés sur les cotes de la nappe (h = a·x + b·y + c) des ouvrages dont les coordonnées sont connues ; l'eau s'écoule selon la plus forte pente.
        Direction moyenne vers le {direction(e.azimutMoyen)}, écart circulaire {Math.round(e.dispersion)}°, gradient médian {fr(e.gradientMedian * 1000, 2)} ‰. Le long de cet axe, de
        l'amont vers l'aval : {e.ordre.map((x) => x.ouvrage.nom).join(' → ')}.
      </p>
      {e.incoherences.map((x) => (
        <p key={x.ouvrage.cle} className="alerte">
          {x.ouvrage.nom} est déclaré {x.declaree === 'amont' ? 'en amont' : 'en aval'} mais se trouve {x.attendue === 'amont' ? 'en amont' : 'en aval'} le long de l'écoulement : sa
          position est à vérifier (étape 3).
        </p>
      ))}
      <div className="st-cote-a-cote">
        {r && <Figure svg={r.svg} largeur={620} hauteur={460} nom="Ecoulement de la nappe" />}
        <div className="tableau-defile">
          <table className="tableau st-tableau">
            <thead>
              <tr>
                <th>Campagne</th>
                <th>Régime</th>
                <th>Ouvrages</th>
                <th>Direction</th>
                <th>Gradient (‰)</th>
                <th>R²</th>
              </tr>
            </thead>
            <tbody>
              {e.campagnes.map((c) => (
                <tr key={c.campagne.id}>
                  <th scope="row">{formatDate(c.campagne.date)}</th>
                  <td>{c.campagne.regime ?? '–'}</td>
                  <td>{c.n}</td>
                  <td>{direction(c.azimut)}</td>
                  <td>{fr(c.gradient * 1000, 2)}</td>
                  <td>{fr(c.r2, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

export function AmontAval({ analyse }: { analyse: Analyse }) {
  const liste = analyse.amontAval.filter((x) => !x.compose.calcule)
  const [cle, setCle] = useState(liste[0]?.compose.cle ?? '')
  const x = liste.find((y) => y.compose.cle === cle) ?? liste[0]
  if (!x) return <p className="st-note">Indiquez la position des ouvrages (amont, au droit, aval) à l'étape 3 pour comparer l'amont et l'aval.</p>
  const cellule = (p: { valeur: number; inferieur: boolean; ouvrage: string } | null) =>
    p ? (
      <>
        {p.inferieur ? '<' : ''}
        {fr(p.valeur)} <span className="st-note">({p.ouvrage})</span>
      </>
    ) : (
      '–'
    )
  const ref = analyse.references.get(x.compose.cle)
  return (
    <>
      <div className="st-commandes">
        <label className="champ">
          Composé
          <select value={x.compose.cle} onChange={(e) => setCle(e.target.value)}>
            {liste.map((y) => (
              <option key={y.compose.cle} value={y.compose.cle}>
                {y.compose.nom}
              </option>
            ))}
          </select>
        </label>
        <p className="st-note" style={{ alignSelf: 'center' }}>
          Quantifié à l'amont à {Math.round(x.frequenceAmont * 100)} % des campagnes{ref ? ` · valeur de référence ${fr(ref.valeur)} ${x.compose.unite}` : ''}.
        </p>
      </div>
      <div className="tableau-defile">
        <table className="tableau st-tableau">
          <thead>
            <tr>
              <th>Campagne</th>
              <th>Maximum amont ({x.compose.unite})</th>
              <th>Maximum au droit du site</th>
              <th>Maximum aval</th>
              <th>Lecture</th>
            </tr>
          </thead>
          <tbody>
            {x.campagnes.map((l) => {
              const a = l.amont
              const v = l.aval ?? l.droit
              let lecture = '–'
              if (v && !v.inferieur && (!a || a.inferieur)) lecture = 'présent sur le site, absent à l’amont'
              else if (v && a && !v.inferieur && !a.inferieur) lecture = v.valeur >= 2 * a.valeur ? 'plus élevé à l’aval / sur site' : a.valeur >= 2 * v.valeur ? 'plus élevé à l’amont' : 'comparable'
              else if (a && !a.inferieur && (!v || v.inferieur)) lecture = 'présent à l’amont seulement'
              else if (a || v) lecture = 'non quantifié'
              return (
                <tr key={l.campagne.id}>
                  <th scope="row">
                    {formatDate(l.campagne.date)} {l.campagne.regime ?? ''}
                  </th>
                  <td>{cellule(l.amont)}</td>
                  <td className={ref && l.droit && !l.droit.inferieur && l.droit.valeur > ref.valeur ? 'st-depasse' : ''}>{cellule(l.droit)}</td>
                  <td className={ref && l.aval && !l.aval.inferieur && l.aval.valeur > ref.valeur ? 'st-depasse' : ''}>{cellule(l.aval)}</td>
                  <td>{lecture}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="st-note">Un écart d'un facteur 2 au moins est retenu, au-delà de l'incertitude analytique usuelle.</p>
    </>
  )
}

export function Plan({ analyse }: { analyse: Analyse }) {
  const liste = analyse.composesQuantifies.filter((c) => !c.terrain)
  const [cle, setCle] = useState(liste[0]?.cle ?? '')
  const c = liste.find((x) => x.cle === cle) ?? liste[0]
  if (!c) return null
  const r = figurePlan(analyse, c)
  if (!r) return <p className="st-note">Saisissez les coordonnées X / Y d'au moins deux ouvrages (étape 3, ou onglet « Ouvrages » du tableau historique) pour dessiner le plan.</p>
  return (
    <>
      <div className="st-commandes">
        <label className="champ">
          Composé
          <select value={c.cle} onChange={(e) => setCle(e.target.value)}>
            {liste.map((x) => (
              <option key={x.cle} value={x.cle}>
                {x.nom}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Figure svg={r.svg} largeur={620} hauteur={460} nom={`Plan ${c.nom}`} />
      <p className="st-note">
        Couleur et symbole : tendance de la série ({CLASSES.hausse.symbole} hausse, {CLASSES.baisse.symbole} baisse, {CLASSES.stable.symbole} stable) ; taille : dernier résultat rapporté à la valeur de
        référence ; trait épais : au-dessus de la valeur de référence. Positions : {analyse.ouvrages.map((o) => `${o.nom} ${LIBELLES_POSITION[o.position]}`).join(', ')}.
      </p>
    </>
  )
}

export function Methode({ analyse }: { analyse: Analyse }) {
  const r = analyse.reglages
  return (
    <div className="st-methode">
      <h4>Ce que calcule l'outil</h4>
      <ul>
        <li>
          <strong>Test de Mann-Kendall</strong> (Mann, 1945 ; Kendall, 1975) sur chaque série ouvrage × composé de la période analysée : statistique S, variance corrigée des ex aequo,
          p bilatéral — loi exacte de S pour les séries de 10 résultats au plus sans ex aequo, approximation normale avec correction de continuité sinon. C'est le test retenu par
          l'outil HYPE du BRGM (BRGM/RP-63066-FR) et par le guide européen sur l'évaluation des tendances dans les eaux souterraines (CIS n° 18).
        </li>
        <li>
          <strong>Pente de Theil-Sen</strong> (Theil, 1950 ; Sen, 1968) en unité par an sur les dates réelles de prélèvement, avec son intervalle de confiance à{' '}
          {Math.round((1 - r.alpha) * 100)} % (Gilbert, 1987).
        </li>
        <li>
          <strong>Classes de tendance</strong> inspirées de MAROS (AFCEE, 2004) : hausse / baisse significative si p ≤ {fr(r.alpha)}, probable si p ≤ {fr(2 * r.alpha)}, sinon « stable »
          (coefficient de variation &lt; {fr(r.covStable)}) ou « sans tendance nette ». Test à partir de {r.nMin} résultats ; en dessous de {r.nRobuste} résultats, la série est signalée
          comme courte (HYPE en demande au moins 10).
        </li>
        <li>
          <strong>Résultats &lt; LQ</strong> : {LIBELLES_CENSURE[r.censure].long} Moyennes et médianes : résultats &lt; LQ comptés à LQ/2 (directive 2009/90/CE, art. 5). Sommes
          par famille : composés quantifiés seuls (non quantifié = 0).
        </li>
        <li>
          <strong>Test de Kendall saisonnier</strong> (Hirsch et al., 1982) quand hautes et basses eaux comptent au moins 3 résultats chacune ; <strong>test de Pettitt</strong> (1979)
          pour un changement de niveau (séries de 8 résultats et plus) ; <strong>lissage LOWESS</strong> (Cleveland, 1979).
        </li>
        <li>
          <strong>Décroissance du premier ordre</strong> : pente de Theil-Sen sur ln C, demi-vie apparente ln 2 / k, et année à laquelle la tendance ajustée atteindrait la valeur de
          référence — une projection indicative, qui suppose que le rythme observé se maintient.
        </li>
        <li>
          <strong>Résultats atypiques</strong> : écart au droit de Theil-Sen ajusté sur log C de plus de 4 écarts-types robustes et d'un facteur 3 ; signalés, jamais écartés
          automatiquement.
        </li>
        <li>
          <strong>Repère des 75 %</strong> : l'arrêté du 17 décembre 2008 (art. 9, directive 2006/118/CE) fixe à 75 % de la norme de qualité ou de la valeur seuil le point de départ
          des mesures d'inversion d'une tendance à la hausse ; il est repris ici comme seuil de vigilance ({Math.round(r.vigilance * 100)} %).
        </li>
      </ul>
      <h4>Cadre</h4>
      <ul>
        <li>
          Méthodologie nationale de gestion des sites et sols pollués (MTES, avril 2017) : bilan des résultats de la surveillance, par exemple tous les quatre ans, plus complet que
          le rapport de suivi, qui valide la surveillance en place ou propose son évolution.
        </li>
        <li>NF X31-620-2, prestation BQ — bilan quadriennal : interprétation (A270) de l'ensemble des données des quatre dernières années de suivi.</li>
        <li>
          Guides BRGM/INERIS « Surveillance de la qualité des eaux souterraines appropriée aux installations classées et sites pollués » (déc. 2022) et « Évolution et arrêt de la
          surveillance des eaux souterraines » (déc. 2022).
        </li>
        <li>
          Valeurs de comparaison : tableau ERM des valeurs indicatives pour les eaux souterraines (arrêté du 11 janvier 2007 modifié, arrêté du 17 décembre 2008 modifié, valeurs
          locales), modifiables composé par composé.
        </li>
      </ul>
    </div>
  )
}
