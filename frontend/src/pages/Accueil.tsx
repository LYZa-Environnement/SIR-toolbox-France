import { useCallback, useEffect, useState } from 'react'
import AddressSearch from '../components/AddressSearch'
import FriseAerienne from '../components/FriseAerienne'
import RoseDesVents from '../components/RoseDesVents'
import SelecteurParcelles from '../components/SelecteurParcelles'
import ThemeSection from '../components/ThemeSection'
import { formatSurface, libelleParcelle } from '../lib/cadastre'
import { RUBRIQUES } from '../themes'
import type { Site } from '../types/site'

const STORAGE_KEY = 'erm.site'

function loadSite(): Site | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Site) : null
  } catch {
    return null
  }
}

export default function Accueil() {
  const [site, setSite] = useState<Site | null>(loadSite)
  // The site goes through two steps: an address, then the parcels that give it
  // a surface. Keeping them apart means the reader can come back and redraw
  // the footprint without losing the address, and that a restored session
  // lands on the readings rather than back in the selector.
  const [etape, setEtape] = useState<'adresse' | 'parcelles' | 'lecture'>(() => (loadSite() ? 'lecture' : 'adresse'))

  useEffect(() => {
    try {
      if (site) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(site))
      else sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // A blocked sessionStorage only costs the convenience of keeping the
      // address across a reload — never the page itself.
    }
  }, [site])

  const handleSelect = useCallback((selected: Site) => {
    setSite({ ...selected, adresseLat: selected.lat, adresseLon: selected.lon })
    setEtape('parcelles')
  }, [])

  const handleValider = useCallback((valide: Site) => {
    setSite(valide)
    setEtape('lecture')
  }, [])

  const handleAnnuler = useCallback(() => {
    setSite(null)
    setEtape('adresse')
  }, [])

  return (
    <>
      <section className="section">
        <div className="container">
          <p className="eyebrow">Plateforme de consultation de données</p>
          <h1 style={{ maxWidth: '20ch' }}>Ce que les données publiques disent d'une adresse</h1>
          <p className="lede">
            Saisissez une adresse : la plateforme interroge les bases publiques françaises et européennes — Géorisques, Hub'Eau, IGN, INPN,
            GIS Sol, Copernicus — et restitue six lectures cartographiées de son environnement, avec les sources, les distances et les
            limites de chaque donnée.
          </p>

          <div style={{ maxWidth: '36rem', margin: '2rem 0 1rem' }}>
            <AddressSearch onSelect={handleSelect} />
          </div>

          {site ? (
            <div className="card" style={{ maxWidth: '36rem' }}>
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-muted)' }}>Site étudié</p>
              <strong style={{ fontSize: '1.05rem' }}>{site.label}</strong>
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: 'var(--color-muted)' }}>
                {site.parcelles && site.parcelles.length > 0 ? (
                  <>
                    {site.parcelles.length > 1 ? `${site.parcelles.length} parcelles` : 'Parcelle'}{' '}
                    {site.parcelles.map(libelleParcelle).join(', ')} — {formatSurface(site.surfaceM2 ?? 0)} — commune {site.city} (
                    {site.citycode})
                  </>
                ) : (
                  <>
                    Point d'adresse : {site.lat.toFixed(5)}, {site.lon.toFixed(5)} — commune {site.city} ({site.citycode})
                  </>
                )}
              </p>
              {etape === 'lecture' && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  style={{ marginTop: '0.9rem' }}
                  onClick={() => setEtape('parcelles')}
                >
                  Modifier l'emprise
                </button>
              )}
            </div>
          ) : (
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.92rem', color: 'var(--color-muted)', maxWidth: '36rem' }}>
              L'ensemble des données présentées est consulté en direct depuis des sources officielles publiques.
            </p>
          )}

          {site && etape === 'lecture' && (
            <nav style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginTop: '1.5rem' }}>
              {RUBRIQUES.map((rubrique) => (
                <a
                  key={rubrique.id}
                  href={`#${rubrique.id}`}
                  className="badge"
                  style={{ textDecoration: 'none', color: 'var(--color-accent)', background: 'var(--color-accent-soft)' }}
                >
                  {rubrique.titre}
                </a>
              ))}
            </nav>
          )}
        </div>
      </section>

      {site && etape === 'parcelles' && <SelecteurParcelles site={site} onValider={handleValider} onAnnuler={handleAnnuler} />}

      {site &&
        etape === 'lecture' &&
        RUBRIQUES.map((rubrique) => (
          <ThemeSection
            key={rubrique.id}
            id={rubrique.id}
            titre={rubrique.titre}
            sousTitre={rubrique.sousTitre}
            site={site}
            build={rubrique.build}
          >
            {() => (
              <>
                {rubrique.id === 'air' && <RoseDesVents site={site} />}
                {rubrique.id === 'sol' && <FriseAerienne site={site} />}
              </>
            )}
          </ThemeSection>
        ))}
    </>
  )
}
