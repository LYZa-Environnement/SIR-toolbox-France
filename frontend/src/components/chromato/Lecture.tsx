import type { Constat, Lecture } from '../../lib/chromato/interpretation'
import { numero, reference, REFERENCES, THEMES, type Theme } from '../../lib/chromato/references'

/** Numbered call to the bibliography at the bottom of the page. */
export function Cite({ ids }: { ids: string[] }) {
  const tries = [...new Set(ids)].sort((a, b) => numero(a) - numero(b))
  if (!tries.length) return null
  return (
    <sup className="pfas-cite">
      [
      {tries.map((id, i) => (
        <span key={id}>
          {i > 0 && ', '}
          <a href={`#ref-${id}`} title={reference(id).court}>
            {numero(id)}
          </a>
        </span>
      ))}
      ]
    </sup>
  )
}

const BADGE: Record<Constat['niveau'], string> = { info: 'badge--faible', attention: 'badge--moderee', fort: 'badge--elevee' }
const ICONE: Record<Constat['niveau'], string> = { info: 'ℹ', attention: '⚠', fort: '❗' }

function Constats({ liste }: { liste: Constat[] }) {
  if (!liste.length) return null
  return (
    <ul className="chromato-constats">
      {liste.map((c, i) => (
        <li key={i}>
          <span className={`badge ${BADGE[c.niveau]}`} aria-hidden>
            {ICONE[c.niveau]}
          </span>
          <span>
            {c.texte}
            <Cite ids={c.refs} />
          </span>
        </li>
      ))}
    </ul>
  )
}

const VERDICT: Record<string, string> = { compatible: 'badge--faible', possible: 'badge--moderee', 'peu compatible': 'badge--indeterminee' }

export function Resultats({ l }: { l: Lecture }) {
  return (
    <div className="chromato-resultats">
      <div className="card chromato-synthese">
        <p className="eyebrow">Synthèse</p>
        <p>{l.synthese}</p>
        <Constats liste={l.qualite} />
      </div>

      <div className="grid grid--2">
        <div className="card">
          <h3>Nature du produit</h3>
          {l.candidats.length ? (
            <table className="tableau chromato-tableau">
              <thead>
                <tr>
                  <th>Produit de référence</th>
                  <th>Lecture</th>
                  <th>Pourquoi</th>
                </tr>
              </thead>
              <tbody>
                {l.candidats.slice(0, 4).map((c) => (
                  <tr key={c.produit.id}>
                    <th title={c.produit.description}>
                      {c.produit.nom}
                      <Cite ids={c.produit.refs} />
                    </th>
                    <td>
                      <span className={`badge ${VERDICT[c.verdict]}`}>{c.verdict}</span>
                    </td>
                    <td className="chromato-raisons">{c.raisons.join(' ; ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="pfas-note">Pas de profil par carbone : chargez un chromatogramme ou saisissez les fractions du laboratoire.</p>
          )}
          {l.produit && (
            <p className="pfas-note">
              {l.produit.description}
              <Cite ids={l.produit.refs} />
            </p>
          )}
          {l.melange && <Constats liste={[l.melange]} />}
        </div>

        <div className="card">
          <h3>Origine</h3>
          {l.origine.length ? <Constats liste={l.origine} /> : <p className="pfas-note">Rien ne s’écarte d’un produit pétrolier sur ce profil.</p>}
          <h3 style={{ marginTop: '1.25rem' }}>Altération</h3>
          <p>
            <strong>{l.stade.libelle}</strong>
            {l.stade.code !== null && <span className="pfas-type">échelle de Peters et Moldowan : {l.stade.pm}</span>}
            <span className="pfas-type">confiance {l.stade.confiance}</span>
          </p>
          <p className="pfas-note">
            {l.stade.texte}
            <Cite ids={l.stade.refs} />
          </p>
          <Constats liste={l.alteration} />
        </div>
      </div>

      <div className="card">
        <h3>Âge approché du déversement</h3>
        <table className="tableau chromato-tableau">
          <thead>
            <tr>
              <th>Méthode</th>
              <th>Résultat</th>
              <th>Conditions et limites</th>
            </tr>
          </thead>
          <tbody>
            {l.ages.map((a) => (
              <tr key={a.methode}>
                <th>
                  {a.methode}
                  <Cite ids={a.refs} />
                </th>
                <td>{a.applicable ? <strong>{a.valeur}</strong> : <span className="pfas-muet">non applicable</span>}</td>
                <td className="chromato-raisons">{a.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="pfas-note">
          Un âge tiré de la chimie seule reste une estimation : à croiser avec l’historique du site (photographies aériennes, dates des cuves et des activités, BASIAS/CASIAS).
          <Cite ids={['oudijk2009', 'brgm2014']} />
        </p>
      </div>

      <div className="grid grid--2">
        <div className="card">
          <h3>Rapports et indices</h3>
          <table className="tableau chromato-tableau">
            <tbody>
              {l.ratios.map((r) => (
                <tr key={r.libelle}>
                  <th>
                    {r.libelle}
                    <Cite ids={r.refs} />
                  </th>
                  <td className="tableau__conc">{r.valeur === null ? <span className="pfas-muet">—</span> : r.format(r.valeur)}</td>
                  <td className="chromato-raisons">{r.lecture}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>Pour aller plus loin</h3>
          <Constats liste={l.suites} />
        </div>
      </div>
    </div>
  )
}

export function Bibliographie() {
  const themes = Object.keys(THEMES) as Theme[]
  return (
    <div className="pfas-biblio">
      {themes.map((t) => (
        <section key={t}>
          <h3>{THEMES[t]}</h3>
          <ol>
            {REFERENCES.map((r, i) =>
              r.theme !== t ? null : (
                <li key={r.id} id={`ref-${r.id}`} value={i + 1}>
                  <span className="pfas-biblio__citation">
                    {r.citation}{' '}
                    {r.url && (
                      <a href={r.url} target="_blank" rel="noreferrer">
                        lien
                      </a>
                    )}
                  </span>
                  <span className="pfas-biblio__apport">
                    Repris ici : {r.apport}
                    {r.verification === 'secondaire' && (
                      <span className="pfas-type" title="Repris d’un résumé ou d’une source secondaire : à vérifier dans l’original avant citation dans un rapport.">
                        source secondaire
                      </span>
                    )}
                  </span>
                </li>
              ),
            )}
          </ol>
        </section>
      ))}
    </div>
  )
}
