import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Accueil from './pages/Accueil'
import ResultatsLabo from './pages/ResultatsLabo'
import ConformiteRejets from './pages/ConformiteRejets'
import VerificationLivrables from './pages/VerificationLivrables'
import SiteSetting from './pages/SiteSetting'
import InterpretationPfas from './pages/InterpretationPfas'
import ConditionsNappe from './pages/ConditionsNappe'

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
