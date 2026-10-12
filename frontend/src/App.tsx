import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Accueil from './pages/Accueil'
import ResultatsLabo from './pages/ResultatsLabo'
import SiteSetting from './pages/SiteSetting'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Accueil />} />
        <Route path="/site-setting" element={<SiteSetting />} />
        <Route path="/resultats-labo" element={<ResultatsLabo />} />
        <Route path="/conversion" element={<Navigate to="/resultats-labo" replace />} />

        {/* Former pages no longer exist; old links land on the home page
            rather than a blank screen. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
