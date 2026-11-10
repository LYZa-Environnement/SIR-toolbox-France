import 'leaflet/dist/leaflet.css'
import './leaflet-icon-fix'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.tsx'
import './index.css'

// Tools are loaded on demand. After a new deployment, a tab opened earlier
// asks for chunk files that no longer exist: reload to fetch the new version
// instead of leaving the tool blank — at most once a minute, so a file that
// is really missing cannot cause a reload loop.
window.addEventListener('vite:preloadError', (event) => {
  try {
    const dernier = Number(sessionStorage.getItem('rechargement-version') ?? 0)
    if (Date.now() - dernier < 60_000) return
    sessionStorage.setItem('rechargement-version', String(Date.now()))
  } catch {
    return
  }
  event.preventDefault()
  window.location.reload()
})

// HashRouter (not BrowserRouter): GitHub Pages has no server-side rewrite for
// deep links, so a refresh on e.g. /accompagnement would 404 with a path-based router.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
