import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import Footer from './Footer'
import Nav from './Nav'

/** Shown while a tool's code is being downloaded (tools are loaded on demand). */
function Chargement() {
  return (
    <section className="section">
      <div className="container">
        <p className="lede" role="status">
          Chargement de l'outil…
        </p>
      </div>
    </section>
  )
}

export default function Layout() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Nav />
      <main style={{ flex: 1 }}>
        <Suspense fallback={<Chargement />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
    </div>
  )
}
