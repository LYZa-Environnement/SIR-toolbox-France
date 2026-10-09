import { Link, useLocation } from 'react-router-dom'

// Each tool gets a single way out — back to the home page, which presents
// all four tools — rather than links to the other tools.
export default function Nav() {
  const surAccueil = useLocation().pathname === '/'
  return (
    <header style={{ borderBottom: 'var(--border-w) solid var(--color-border)', background: 'var(--color-surface)' }}>
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '4.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <Link to="/" style={{ textDecoration: 'none', color: 'var(--color-ink)', display: 'flex', alignItems: 'baseline', gap: '0.6rem' }}>
          <span style={{ fontWeight: 800, fontSize: '1.45rem', letterSpacing: '0.02em' }}>ERM</span>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>SIR Toolbox France</span>
        </Link>
        {!surAccueil && (
          <Link to="/" className="btn btn--petit" title="Retour à l'accueil de SIR Toolbox France">
            ← Accueil
          </Link>
        )}
      </div>
    </header>
  )
}
