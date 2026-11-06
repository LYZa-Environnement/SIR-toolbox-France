import type { ReactNode } from 'react'
import { ETHENES, LITHOLOGIES, type Ethene, type ModeVitesse } from '../../lib/nappe/biochlor'
import type { Ouvrage } from '../../lib/nappe/donnees'
import { avecLithologie, type SaisieHydro, type Transport, type UniteVitesse } from '../../lib/nappe/transport'

const fr = (x: number | null | undefined, c = 3) =>
  x === null || x === undefined || !Number.isFinite(x) ? '-' : Number(x.toPrecision(c)).toLocaleString('fr-FR', { maximumFractionDigits: 8 })
const sci = (x: number) => x.toExponential(0).replace('e', '×10^').replace('+', '')

const MODES: { id: ModeVitesse; titre: string; detail: string }[] = [
  { id: 'darcy', titre: 'Vitesse de Darcy connue', detail: 'Donnée par une étude hydrogéologique (souvent en m/s ou m/j)' },
  { id: 'ki', titre: 'Perméabilité et gradient', detail: 'K d’un essai, gradient de la carte piézométrique' },
  { id: 'reelle', titre: 'Vitesse réelle connue', detail: 'Essai de traçage ou modèle hydrodynamique' },
]

function Aide({ children }: { children: ReactNode }) {
  return <span style={{ display: 'block', fontSize: '0.78rem', fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--color-muted)', marginTop: '0.2rem' }}>{children}</span>
}

function Unite({ value, onChange }: { value: UniteVitesse; onChange: (u: UniteVitesse) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as UniteVitesse)} aria-label="Unité" style={{ width: '5.5rem' }}>
      <option value="m/s">m/s</option>
      <option value="m/j">m/j</option>
      <option value="m/an">m/an</option>
    </select>
  )
}

export default function TransportBiochlor({
  h,
  setH,
  calc,
  ouvrages,
  sourceDefaut,
}: {
  h: SaisieHydro
  setH: (f: (h: SaisieHydro) => SaisieHydro) => void
  calc: Transport
  ouvrages: Ouvrage[]
  sourceDefaut: string
}) {
  const maj = (p: Partial<SaisieHydro>) => setH((x) => ({ ...x, ...p }))
  const lith = LITHOLOGIES.find((l) => l.id === h.lithologie)
  const g = calc.gradientFiches
  const selectOuvrage = (value: string, onChange: (v: string) => void, vide = '—') => (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{vide}</option>
      {ouvrages.map((o) => (
        <option key={o.cle} value={o.cle}>
          {o.nom}
        </option>
      ))}
    </select>
  )

  return (
    <>
      <p className="lede" style={{ marginBottom: '1rem' }}>
        BIOCHLOR a besoin de la vitesse réelle de l'eau, du retard de chaque composé et de constantes de biodégradation. Renseignez ce que vous
        connaissez ; chaque champ indique où trouver la valeur.
      </p>

      <h3 style={{ fontSize: '1rem' }}>a. Vitesse de l'eau</h3>
      <div className="grid grid--3 choix" role="radiogroup" aria-label="Donnée disponible pour la vitesse">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={h.mode === m.id}
            className={`card choix__option${h.mode === m.id ? ' choix__option--actif' : ''}`}
            onClick={() => maj({ mode: m.id })}
          >
            <strong>{m.titre}</strong>
            <span>{m.detail}</span>
          </button>
        ))}
      </div>
      <div className="grid grid--3" style={{ alignItems: 'start', marginTop: '1rem' }}>
        {h.mode === 'darcy' && (
          <label className="champ">
            Vitesse de Darcy q
            <span style={{ display: 'flex', gap: '0.4rem' }}>
              <input inputMode="decimal" value={h.q} onChange={(e) => maj({ q: e.target.value })} placeholder="ex. 0,05" />
              <Unite value={h.uniteQ} onChange={(u) => maj({ uniteQ: u })} />
            </span>
            <Aide>
              Débit qui traverse 1 m² de nappe : q = K × i. Souvent indiquée dans l'étude hydrogéologique du site ou calculée par son bureau
              d'études ; sinon choisissez « Perméabilité et gradient ».
            </Aide>
          </label>
        )}
        {h.mode === 'ki' && (
          <>
            <label className="champ">
              Conductivité hydraulique K (m/s)
              <input inputMode="decimal" value={h.K} onChange={(e) => maj({ K: e.target.value })} placeholder="ex. 1e-4 ou 0,0001" />
              <Aide>
                Essai de perméabilité dans un piézomètre (slug test, essai Lefranc) ou pompage d'essai : voir le rapport de foration ou l'étude
                hydrogéologique ; à défaut, ordre de grandeur selon la lithologie ci-dessous.
                {lith?.K && (
                  <>
                    {' '}
                    {lith.libelle} : {sci(lith.K[0])} à {sci(lith.K[1])} m/s.
                  </>
                )}
              </Aide>
            </label>
            <label className="champ">
              Gradient hydraulique i (m/m)
              <input inputMode="decimal" value={h.i} onChange={(e) => maj({ i: e.target.value })} placeholder="ex. 0,005" />
              <Aide>
                Pente de la nappe : différence de cote du niveau d'eau (m NGF) entre deux ouvrages alignés sur l'écoulement, divisée par leur distance
                — lue sur la carte piézométrique de la campagne.
                {g && (
                  <>
                    {' '}
                    D'après les fiches ({fr(g.hA, 4)} → {fr(g.hB, 4)} m NGF) : <strong>{fr(g.valeur)}</strong>{' '}
                    <button type="button" className="btn btn--ghost btn--petit" onClick={() => maj({ i: fr(Math.abs(g.valeur)).replace(/\s/g, '') })}>
                      Utiliser
                    </button>
                    {g.dates[0] !== g.dates[1] && ` — niveaux relevés à des dates différentes (${g.dates.join(', ')})`}
                    {g.valeur < 0 && ' — le niveau monte de A vers B : B n’est pas en aval de A'}
                  </>
                )}
              </Aide>
            </label>
          </>
        )}
        {h.mode === 'reelle' && (
          <label className="champ">
            Vitesse réelle vx
            <span style={{ display: 'flex', gap: '0.4rem' }}>
              <input inputMode="decimal" value={h.vx} onChange={(e) => maj({ vx: e.target.value })} />
              <Unite value={h.uniteVx} onChange={(u) => maj({ uniteVx: u })} />
            </span>
            <Aide>Vitesse de déplacement de l'eau dans les pores : essai de traçage ou modèle hydrodynamique calé.</Aide>
          </label>
        )}
        <label className="champ">
          Lithologie de l'aquifère (valeurs types)
          <select value={h.lithologie} onChange={(e) => setH((x) => avecLithologie(x, e.target.value))}>
            <option value="">— non précisée —</option>
            {LITHOLOGIES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.libelle}
              </option>
            ))}
          </select>
          <Aide>
            Remplit porosités et masse volumique avec les valeurs centrales des tableaux C.3.1 et C.3.2 de l'USEPA (1998). Lithologie : logs de forage
            de la zone crépinée.
          </Aide>
        </label>
        <label className="champ">
          Porosité efficace ne
          <input inputMode="decimal" value={h.ne} onChange={(e) => maj({ ne: e.target.value })} />
          <Aide>
            Part des vides où l'eau circule (porosité cinématique), plus faible que la porosité totale.
            {lith?.ne && ` ${lith.libelle} : ${fr(lith.ne[0])} à ${fr(lith.ne[1])}.`} Mesurée seulement par traçage : la valeur type suffit, à faire
            varier pour tester la sensibilité.
          </Aide>
        </label>
      </div>
      <p style={{ marginTop: '0.5rem' }}>
        {calc.vx !== null ? (
          <>
            Vitesse réelle de l'eau : <strong>{fr(calc.vx)} m/an</strong> ({fr(calc.vx / 365.25)} m/j)
            {calc.q !== null && <> · vitesse de Darcy {fr(calc.q)} m/an</>}
          </>
        ) : (
          <span style={{ color: 'var(--color-muted)' }}>À renseigner : {calc.manque.join(', ')}.</span>
        )}
      </p>

      <h3 style={{ fontSize: '1rem', marginTop: '1.5rem' }}>b. Retard et dispersion</h3>
      <div className="grid grid--4" style={{ alignItems: 'start' }}>
        <label className="champ">
          Porosité totale n
          <input inputMode="decimal" value={h.n} onChange={(e) => maj({ n: e.target.value })} />
          <Aide>{lith?.n ? `${lith.libelle} : ${fr(lith.n[0])} à ${fr(lith.n[1])}.` : 'Valeur type selon la lithologie (0,3 à 0,4 pour un sable).'}</Aide>
        </label>
        <label className="champ">
          Masse volumique apparente ρb (kg/l)
          <input inputMode="decimal" value={h.rhob} onChange={(e) => maj({ rhob: e.target.value })} />
          <Aide>{lith?.rhob ? `${lith.libelle} : ${fr(lith.rhob[0])} à ${fr(lith.rhob[1])} kg/l.` : 'Sol sec : 1,6 à 1,8 kg/l pour les sables.'}</Aide>
        </label>
        <label className="champ">
          COT du sol (zone saturée, hors pollution)
          <span style={{ display: 'flex', gap: '0.4rem' }}>
            <input inputMode="decimal" value={h.cot} onChange={(e) => maj({ cot: e.target.value })} placeholder="facultatif" />
            <select value={h.uniteCot} onChange={(e) => maj({ uniteCot: e.target.value as 'mg/kg' | '%' })} aria-label="Unité du COT" style={{ width: '6rem' }}>
              <option value="mg/kg">mg/kg MS</option>
              <option value="%">% MS</option>
            </select>
          </span>
          <Aide>Analyse « COT » d'un échantillon de sol de l'aquifère : foc = COT (mg/kg) / 1 000 000. Remplace le champ foc.</Aide>
        </label>
        <label className="champ">
          Carbone organique foc (g/g)
          <input inputMode="decimal" value={h.foc} onChange={(e) => maj({ foc: e.target.value })} disabled={!!h.cot.trim()} />
          <Aide>
            {calc.milieu && h.cot.trim() ? `Calculé : ${fr(calc.milieu.foc)}. ` : ''}Sans analyse, 0,001 (sables) ; une valeur faible est prudente (moins de
            retard).
          </Aide>
        </label>
        <label className="champ">
          Longueur du panache (m)
          <input inputMode="decimal" value={h.longueur} onChange={(e) => maj({ longueur: e.target.value })} placeholder="facultatif" />
          <Aide>
            De la source à l'ouvrage le plus en aval où les COHV sont quantifiés, mesurée sur plan. Donne la dispersivité αx = 0,83 (log₁₀ L)^2,414
            (Xu et Eckstein, 1995){calc.dispersivite !== null && <> : <strong>{fr(calc.dispersivite)} m</strong></>}.
          </Aide>
        </label>
      </div>
      <details className="qualif" style={{ marginTop: '0.5rem' }}>
        <summary>Coefficients de partage Koc (l/kg)</summary>
        <div className="grid grid--4" style={{ marginTop: '0.5rem' }}>
          {ETHENES.map((e) => (
            <label key={e.id} className="champ">
              {e.libelle}
              <input inputMode="decimal" value={h.koc[e.id]} onChange={(ev) => setH((x) => ({ ...x, koc: { ...x.koc, [e.id as Ethene]: ev.target.value } }))} />
            </label>
          ))}
        </div>
        <p style={{ fontSize: '0.82rem', color: 'var(--color-muted)' }}>Valeurs par défaut : USEPA (1998), tableau B.2.1 (première valeur citée).</p>
      </details>

      <h3 style={{ fontSize: '1rem', marginTop: '1.5rem' }}>c. Constantes de biodégradation entre deux ouvrages</h3>
      <div className="grid grid--4" style={{ alignItems: 'start' }}>
        <label className="champ">
          Ouvrage amont (A)
          {selectOuvrage(h.amont, (v) => maj({ amont: v }))}
          <Aide>Dans le panache, près de la source.</Aide>
        </label>
        <label className="champ">
          Ouvrage aval (B)
          {selectOuvrage(h.aval, (v) => maj({ aval: v }))}
          <Aide>Plus loin sur la même ligne d'écoulement (carte piézométrique).</Aide>
        </label>
        <label className="champ">
          Distance A → B (m)
          <input inputMode="decimal" value={h.distance} onChange={(e) => maj({ distance: e.target.value })} />
          <Aide>Mesurée sur plan, le long de l'écoulement.</Aide>
        </label>
        <label className="champ">
          <span>
            <input type="checkbox" checked={h.normaliser} onChange={(e) => maj({ normaliser: e.target.checked })} /> Normaliser par les chlorures
          </span>
          <Aide>Corrige la dilution et la dispersion (chlorures nécessaires aux deux ouvrages). Sans chlorures, décochez : le taux est alors majoré.</Aide>
        </label>
      </div>
      {calc.taux && (
        <div className="tableau-defile" style={{ marginTop: '0.75rem' }}>
          <table className="tableau">
            <thead>
              <tr>
                <th>Composé</th>
                <th>Retard R</th>
                <th>Transit (an)</th>
                <th>CA µg/l</th>
                <th>CB µg/l</th>
                <th>CB corrigée</th>
                <th>λ (1/an)</th>
                <th>Littérature</th>
                <th>Remarque</th>
              </tr>
            </thead>
            <tbody>
              {calc.taux.map((x) => {
                const e = ETHENES.find((y) => y.id === x.compose)!
                return (
                  <tr key={x.compose}>
                    <td>
                      <strong>{e.libelle}</strong>
                    </td>
                    <td>{fr(x.retard)}</td>
                    <td>{fr(x.temps)}</td>
                    <td>{fr(x.cA)}</td>
                    <td>{fr(x.cB)}</td>
                    <td>{fr(x.cBcorr)}</td>
                    <td>
                      <strong>{fr(x.lambda)}</strong>
                    </td>
                    <td>{e.litterature}</td>
                    <td style={{ fontSize: '0.8rem' }}>{x.note ?? '-'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {!calc.taux && (h.amont || h.aval) && (
        <p style={{ color: 'var(--color-muted)', fontSize: '0.88rem' }}>
          {calc.vx === null ? 'La vitesse de l’eau est nécessaire au calcul. ' : ''}Choisissez deux ouvrages différents et leur distance.
        </p>
      )}

      <h3 style={{ fontSize: '1rem', marginTop: '1.5rem' }}>d. Valeurs à saisir dans BIOCHLOR</h3>
      <label className="champ" style={{ maxWidth: '22rem' }}>
        Ouvrage source (concentrations de la section 6)
        {selectOuvrage(h.source || sourceDefaut, (v) => maj({ source: v }))}
      </label>
      {calc.saisies.length ? (
        <div className="tableau-defile" style={{ marginTop: '0.75rem' }}>
          <table className="tableau">
            <thead>
              <tr>
                <th>Section de BIOCHLOR</th>
                <th>Champ</th>
                <th>Valeur</th>
                <th>Dans BIOCHLOR (unités US)</th>
              </tr>
            </thead>
            <tbody>
              {calc.saisies.map((s) => (
                <tr key={`${s.section}${s.champ}`}>
                  <td>{s.section}</td>
                  <td>{s.champ}</td>
                  <td>{s.si}</td>
                  <td>
                    <strong>{s.biochlor}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p style={{ color: 'var(--color-muted)', fontSize: '0.88rem' }}>Renseignez la vitesse de l'eau et la porosité pour obtenir les valeurs.</p>
      )}
      <p style={{ fontSize: '0.82rem', color: 'var(--color-muted)' }}>
        BIOCHLOR (USEPA / AFCEE, tableur gratuit) travaille en pieds, ft/an et cm/s. Les sections « 5. General » (dimensions de la zone modélisée,
        durée de simulation) et « 7. Field data » (concentrations le long de l'axe du panache) se renseignent d'après le plan du site.
      </p>
    </>
  )
}
