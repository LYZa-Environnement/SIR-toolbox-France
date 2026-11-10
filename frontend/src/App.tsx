import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Accueil from './pages/Accueil'

// Each tool is loaded only when opened: the home page no longer downloads
// every tool, their reference data and their libraries up front.
const SiteSetting = lazy(() => import('./pages/SiteSetting'))
const ResultatsLabo = lazy(() => import('./pages/ResultatsLabo'))
const ConformiteRejets = lazy(() => import('./pages/ConformiteRejets'))
const VerificationLivrables = lazy(() => import('./pages/VerificationLivrables'))
const InterpretationPfas = lazy(() => import('./pages/InterpretationPfas'))
const ConditionsNappe = lazy(() => import('./pages/ConditionsNappe'))

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Accueil />} />
        <Route path="/site-setting" element={<SiteSetting />} />
        <Route path="/resultats-labo" element={<ResultatsLabo />} />
        <Route path="/conformite-rejets" element={<ConformiteRejets />} />
        <Route path="/verification-livrables" element={<VerificationLivrables />} />
        <Route path="/interpretation-pfas" element={<InterpretationPfas />} />
        <Route path="/conditions-nappe" element={<ConditionsNappe />} />
        <Route path="/declaration-iota" element={<Navigate to="/verification-livrables" replace />} />
        <Route path="/conversion" element={<Navigate to="/resultats-labo" replace />} />

        {/* Former pages no longer exist; old links land on the home page
            rather than a blank screen. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
