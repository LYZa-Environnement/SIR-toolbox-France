import { Link } from 'react-router-dom'

const SOURCES = [
  { label: 'Géorisques — Bureau de recherches géologiques et minières', href: 'https://www.georisques.gouv.fr/' },
  { label: "Hub'Eau", href: 'https://hubeau.eaufrance.fr/' },
  { label: 'Géoplateforme de l’Institut national de l’information géographique et forestière', href: 'https://geoservices.ign.fr/' },
  { label: 'Inventaire national du patrimoine naturel — Muséum national d’histoire naturelle', href: 'https://inpn.mnhn.fr/' },
  { label: 'VigiEau', href: 'https://vigieau.gouv.fr/' },
  { label: 'Copernicus / CAMS', href: 'https://atmosphere.copernicus.eu/' },
]

const lien = { color: 'var(--color-accent-ink)' } as const

export default function Footer() {
  return (
    <footer style={{ marginTop: '3rem', background: 'var(--color-accent-deep)', color: 'var(--color-accent-ink)' }}>
      <div className="container grid grid--3" style={{ padding: '2.5rem 1.5rem', gap: '2rem' }}>
        <div>
          <strong style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: '1.3rem' }}>
            Données environnementales, <em>à l'échelle d'un site</em>
          </strong>
          <p style={{ color: 'var(--color-deep-muted)', marginTop: '0.5rem' }}>
            Outil interne de consultation des données environnementales publiques.
          </p>
        </div>
        <div>
          <strong>Principales sources</strong>
          <p style={{ color: 'var(--color-deep-muted)', marginTop: '0.5rem', fontSize: '0.88rem' }}>
            {SOURCES.map((source, index) => (
              <span key={source.href}>
                <a href={source.href} target="_blank" rel="noopener noreferrer" style={lien}>
                  {source.label}
                </a>
                {index < SOURCES.length - 1 && ' · '}
              </span>
            ))}
          </p>
        </div>
        <div>
          <strong>Navigation</strong>
          <p style={{ marginTop: '0.5rem' }}>
            <Link to="/" style={lien}>
              Site Setting
            </Link>
            <br />
            <Link to="/conversion" style={lien}>
              Conversion labo (gaz du sol / air)
            </Link>
            <br />
            <a href={`${import.meta.env.BASE_URL}donnees-environnementales.html`} style={lien}>
              Données environnementales publiques
            </a>
            <br />
            <a href={`${import.meta.env.BASE_URL}creation-maillage.html`} style={lien}>
              Création maillage
            </a>
          </p>
        </div>
      </div>
      <div className="container" style={{ paddingBottom: '1.5rem', fontSize: '0.8rem', color: 'var(--color-deep-muted)' }}>
        Les données restituées appartiennent à leurs producteurs respectifs. Cette plateforme fournit une lecture documentaire et
        ne remplace ni une étude réglementaire, ni un avis d'expert.
      </div>
    </footer>
  )
}
