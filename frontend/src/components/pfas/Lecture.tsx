import { formatIndicateur, type Indicateur } from '../../lib/pfas/indicateurs'
import { LIBELLES_VERDICT, type Piste } from '../../lib/pfas/sources'
import { REFERENCES, THEMES, type Theme } from '../../lib/pfas/references'
import { couleur, formuleTexte, fractionFluor, masseMolaire, SUBSTANCES, type IdSubstance } from '../../lib/pfas/substances'
import { Cite } from './Cite'
import { nombre } from './format'

/** Indicator cards: value, a 0–100 % gauge for shares, formula, reading, sources. */
export function Indicateurs({ liste }: { liste: Indicateur[] }) {
  return (
    <div className="pfas-indicateurs">
      {liste.map((i) => (
        <article key={i.id} className="card pfas-indicateur">
          <h4>{i.titre}</h4>
          <p className="pfas-indicateur__valeur">{formatIndicateur(i)}</p>
          {i.format === 'part' && i.valeur !== null && (
            <div className="pfas-jauge" aria-hidden="true">
              <span style={{ width: `${Math.min(i.valeur, 1) * 100}%` }} />
              <i style={{ left: '50%' }} title="50 %" />
            </div>
          )}
          {i.raison && <p className="pfas-note">{i.raison}</p>}
          <p className="pfas-formule">{i.formule}</p>
          <p className="pfas-indicateur__lecture">
            {i.lecture}
            <Cite ids={i.refs} />
          </p>
        </article>
      ))}
    </div>
  )
}

const ICONE = { oui: '✓', non: '✗', na: '–' }
const CLASSE_VERDICT: Record<Piste['verdict'], string> = {
  compatible: 'badge--faible',
  partiel: 'badge--moderee',
  peu: 'badge--indeterminee',
  indetermine: 'badge--indeterminee',
}

export function Pistes({ liste }: { liste: Piste[] }) {
  return (
    <div className="pfas-pistes">
      {liste.map((p) => (
        <details key={p.id} className={`card pfas-piste pfas-piste--${p.verdict}`} open={p.verdict === 'compatible'}>
          <summary>
            <span className={`badge ${CLASSE_VERDICT[p.verdict]}`}>{LIBELLES_VERDICT[p.verdict]}</span>
            <strong>{p.titre}</strong>
            <span className="pfas-muet">
              {p.criteres.filter((c) => c.etat === 'oui').length} / {p.criteres.filter((c) => c.etat !== 'na').length} critères vérifiés
            </span>
          </summary>
          <p>
            {p.description}
            <Cite ids={p.refs} />
          </p>
          <ul className="pfas-criteres">
            {p.criteres.map((c) => (
              <li key={c.libelle} className={`pfas-critere--${c.etat}`}>
                <span className="pfas-critere__icone" aria-label={c.etat === 'oui' ? 'vérifié' : c.etat === 'non' ? 'non vérifié' : 'non évaluable'}>
                  {ICONE[c.etat]}
                </span>
                <span>
                  <strong>{c.libelle}</strong>
                  {c.propose && <span className="pfas-type">critère proposé par l’outil</span>} <span className="pfas-muet">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="pfas-note">
            <strong>À rechercher :</strong> {p.terrain}
          </p>
        </details>
      ))}
    </div>
  )
}

/**
 * The 22 substances laid out like a table of elements: one column per
 * number of carbons, carboxylic acids above, sulfonic acids below, TFA and
 * 6:2 FTS apart. Substances absent from the file are greyed when a file is
 * loaded.
 */
export function CarteSubstances({ analysees }: { analysees?: IdSubstance[] }) {
  const parFamille = (f: string) => SUBSTANCES.filter((s) => s.famille === f)
  const case_ = (id: IdSubstance) => {
    const s = SUBSTANCES.find((x) => x.id === id)!
    const absente = analysees && !analysees.includes(id)
    const fond = couleur(s)
    const claire = fond === '#6da7ec' || fond === '#f0955f' || fond === '#1baf7a'
    return (
      <div
        key={id}
        className={`pfas-case${absente ? ' pfas-case--absente' : ''}`}
        style={{ background: absente ? '#f2f5f5' : fond, color: absente ? '#4f625f' : claire ? '#0d2421' : '#fff' }}
        title={`${s.nom}\nCAS ${s.cas} · ${formuleTexte(s)} · ${nombre(masseMolaire(s))} g/mol · ${nombre(fractionFluor(s) * 100)} % de fluor${absente ? '\nAbsente du fichier chargé' : ''}`}
      >
        <strong>{s.abreviation}</strong>
        <span>C{s.carbones}</span>
      </div>
    )
  }
  return (
    <div className="pfas-carte" role="table" aria-label="Les 22 substances interprétées">
      <div className="pfas-carte__ligne" role="row">
        <span className="pfas-carte__titre">Carboxyliques (PFCA)</span>
        <div className="pfas-carte__cases">{parFamille('PFCA').map((s) => case_(s.id))}</div>
      </div>
      <div className="pfas-carte__ligne" role="row">
        <span className="pfas-carte__titre">Sulfoniques (PFSA)</span>
        <div className="pfas-carte__cases">{parFamille('PFSA').map((s) => case_(s.id))}</div>
      </div>
      <div className="pfas-carte__ligne" role="row">
        <span className="pfas-carte__titre">Hors somme des 20</span>
        <div className="pfas-carte__cases pfas-carte__cases--hors">
          {case_('TFA')}
          {case_('FTS62')}
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
                      <span className="pfas-type" title="Chiffre repris d’un communiqué, d’une synthèse officielle ou d’un résumé : à confirmer dans la source avant citation dans un rapport.">
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
