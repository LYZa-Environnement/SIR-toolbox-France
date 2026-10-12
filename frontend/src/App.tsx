import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Accueil from './pages/Accueil'
import ResultatsLabo from './pages/ResultatsLabo'
import SiteSetting from './pages/SiteSetting'

// Loaded on demand: the plan tool carries its own projection library.
const PlansDict = lazy(() => import('./pages/PlansDict'))

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Accueil />} />
        <Route path="/site-setting" element={<SiteSetting />} />
        <Route path="/resultats-labo" element={<ResultatsLabo />} />
        <Route
          path="/plans-dict"
          element={
            <Suspense fallback={<p className="container section">Chargement de l'outil…</p>}>
              <PlansDict />
            </Suspense>
          }
        />
        <Route path="/conversion" element={<Navigate to="/resultats-labo" replace />} />

        {/* Former pages no longer exist; old links land on the home page
            rather than a blank screen. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
