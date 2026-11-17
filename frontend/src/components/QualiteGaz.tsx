import { useMemo } from 'react'
import { useTri } from '../lib/tri'
import { EnTete } from './Tri'
import type { FicheGaz, SourceDebit, SourceDuree } from '../lib/resultats/fichesGaz'
import { evaluerQualite, LIBELLES_VERDICT, REFERENCES_QUALITE, syntheseQualite, type Niveau, type Verdict } from '../lib/resultats/qualiteGaz'

const BADGE: Record<Verdict, string> = {
  representatif: 'badge--faible',
  'a-verifier': 'badge--moderee',
  'air-ambiant': 'badge--elevee',
  'non-evalue': 'badge--indeterminee',
}

const COULEUR: Record<Niveau, string> = {
  alerte: 'var(--level-elevee)',
  vigilance: 'var(--level-moderee)',
  info: 'var(--color-muted)',
}

const fr = (x: number | null, chiffres = 1) => (x === null ? '—' : x.toLocaleString('fr-FR', { maximumFractionDigits: chiffres }))
const signe = (x: number | null, chiffres = 1, suffixe = '') => (x === null ? '—' : `${x > 0 ? '+' : ''}${fr(x, chiffres)}${suffixe}`)

/**
 * Quality of the soil gas drawn at each point, from the multigas and PID
 * readings of the sampling sheets (guide BRGM / INERIS 2016).
 */
export function QualiteGaz({ fiches, sourceDuree, sourceDebit }: { fiches: FicheGaz[]; sourceDuree: SourceDuree; sourceDebit: SourceDebit }) {
  const points = useMemo(() => fiches.map((f) => evaluerQualite(f, sourceDuree, sourceDebit)), [fiches, sourceDuree, sourceDebit])
  const synthese = useMemo(() => syntheseQualite(points), [points])
  const ORDRE: Verdict[] = ['air-ambiant', 'a-verifier', 'non-evalue', 'representatif']
  const { tries, tri, trier } = useTri(points, {
    point: (p) => p.ouvrage,
    lecture: (p) => ORDRE.indexOf(p.verdict),
    o2: (p) => p.o2,
    co2: (p) => p.co2,
    evolution: (p) => p.deltaO2,
    pid: (p) => p.pidMax,
    gaz: (p) => Math.max(p.h2sMax ?? -1, p.coMax ?? -1, p.lieMax ?? -1),
    constats: (p) => p.constats.filter((c) => c.niveau !== 'info').length,
  })
  const th = { tri, onTrier: trier }
  if (!fiches.some((f) => f.mesures.length)) {
    return (
      <p style={{ margin: '1.25rem 0 0', fontSize: '0.85rem', color: 'var(--color-muted)' }}>
        Qualité des gaz du sol captés : aucune mesure multigaz ni PID dans le tableau de purge et d’échantillonnage des fiches.
      </p>
    )
  }
  const compte = (v: Verdict) => points.filter((p) => p.verdict === v).length

  return (
    <div style={{ marginTop: '1.75rem' }}>
      <strong>Qualité des gaz du sol captés</strong>
      <p style={{ margin: '0.35rem 0 0.75rem', fontSize: '0.88rem', color: 'var(--color-muted)', maxWidth: '52rem' }}>
        Lecture des mesures O2, CO2, H2S, CO, LIE et PID relevées pendant la purge et l’échantillonnage : le gaz prélevé est-il du gaz
        du sol, ou de l’air entré par l’ouvrage ? Démarche du guide BRGM / INERIS 2016 (test d’étanchéité O2 / CO2, purge jusqu’à
        stabilisation, débits) ; les seuils chiffrés que le guide ne donne pas sont ceux de l’outil, rappelés sous le tableau.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        {(['representatif', 'a-verifier', 'air-ambiant', 'non-evalue'] as Verdict[])
          .filter((v) => compte(v))
          .map((v) => (
            <span key={v} className={`badge ${BADGE[v]}`}>
              {LIBELLES_VERDICT[v]} : {compte(v)}
            </span>
          ))}
      </div>

      <div className="recap-terrain__synthese" style={{ maxWidth: '52rem', marginBottom: '1rem' }}>
        {synthese.map((t) => (
          <p key={t}>{t}</p>
        ))}
      </div>

      <div className="tableau-defile">
        <table className="tableau">
          <thead>
            <tr>
              <EnTete cle="point" {...th}>Point</EnTete>
              <EnTete cle="lecture" {...th}>Lecture</EnTete>
              <EnTete cle="o2" {...th} title="Dernière mesure plausible pendant l’échantillonnage, sinon fin de purge">O2 (%)</EnTete>
              <EnTete cle="co2" {...th} title="Dernière mesure plausible pendant l’échantillonnage, sinon fin de purge">CO2 (ppm)</EnTete>
              <EnTete cle="evolution" {...th} title="Entre la fin de la purge (ou le début du prélèvement) et la fin du prélèvement">Évolution O2 / CO2</EnTete>
              <EnTete cle="pid" {...th}>PID max (ppm)</EnTete>
              <EnTete cle="gaz" {...th}>H2S / CO (ppm) · LIE (%)</EnTete>
              <EnTete cle="constats" {...th}>Constats</EnTete>
            </tr>
          </thead>
          <tbody>
            {tries.map((p) => (
              <tr key={p.ouvrage}>
                <th scope="row">{p.ouvrage}</th>
                <td>
                  <span className={`badge ${BADGE[p.verdict]}`} style={{ whiteSpace: 'nowrap' }}>
                    {LIBELLES_VERDICT[p.verdict]}
                  </span>
                </td>
                <td className="tableau__calcule">{fr(p.o2)}</td>
                <td className="tableau__calcule">{p.co2 === null ? '—' : `${p.co2Superieur ? '> ' : ''}${fr(p.co2, 0)}`}</td>
                <td className="tableau__calcule" style={{ whiteSpace: 'nowrap' }}>
                  {signe(p.deltaO2, 1, ' pt')} / {p.deltaCo2 === null ? '—' : signe(p.deltaCo2 * 100, 0, ' %')}
                </td>
                <td className="tableau__calcule">{fr(p.pidMax)}</td>
                <td className="tableau__calcule" style={{ whiteSpace: 'nowrap' }}>
                  {fr(p.h2sMax)} / {fr(p.coMax)} · {fr(p.lieMax)}
                </td>
                <td style={{ fontSize: '0.8rem', minWidth: '22rem' }}>
                  {p.constats.map((c) => (
                    <div key={c.texte} style={{ color: COULEUR[c.niveau] }}>
                      {c.texte}
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul style={{ margin: '0.75rem 0 0', paddingLeft: '1.1rem', fontSize: '0.8rem', color: 'var(--color-muted)', maxWidth: '52rem' }}>
        {REFERENCES_QUALITE.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </div>
  )
}
