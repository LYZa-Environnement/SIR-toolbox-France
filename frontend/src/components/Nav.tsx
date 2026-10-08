import { NavLink } from 'react-router-dom'

const pages = [
  { to: '/', label: 'Site Setting', end: true },
  { to: '/resultats-labo', label: 'Résultats labo' },
]

// The two map tools are separate pages, not routes: they get buttons rather
// than nav links, because that is how they are reached — one click from the
// top of the home page, whatever you were doing.
const outils = [
  {
    href: `${import.meta.env.BASE_URL}donnees-environnementales.html`,
    label: 'Données environnementales publiques',
    titre: 'Carte interactive des données publiques',
  },
  { href: `${import.meta.env.BASE_URL}creation-maillage.html`, label: 'Création maillage', titre: "Maillage d'investigation sur parcelles" },
]

const linkStyle = { textDecoration: 'none', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.06em' } as const

export default function Nav() {
  return (
    <header style={{ borderBottom: 'var(--border-w) solid var(--color-border)', background: 'var(--color-surface)' }}>
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '4.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <NavLink to="/" style={{ textDecoration: 'none', color: 'var(--color-ink)', display: 'flex', alignItems: 'baseline', gap: '0.6rem' }}>
          <span style={{ fontWeight: 800, fontSize: '1.45rem', letterSpacing: '0.02em' }}>ERM</span>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>SIR Toolbox France</span>
        </NavLink>
        <nav style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          {pages.map((page) => (
            <NavLink
              key={page.to}
              to={page.to}
              end={page.end}
              style={({ isActive }) => ({
                ...linkStyle,
                fontWeight: 700,
                color: 'var(--color-ink)',
                borderBottom: `2px solid ${isActive ? 'var(--color-mint)' : 'transparent'}`,
                paddingBottom: '0.15rem',
              })}
            >
              {page.label}
            </NavLink>
          ))}
          {outils.map((outil) => (
            <a key={outil.href} href={outil.href} className="btn btn--petit" title={outil.titre}>
              {outil.label} ↗
            </a>
          ))}
        </nav>
      </div>
    </header>
  )
}
