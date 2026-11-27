import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * The standalone pages (public/*.html) load the dossiers from `dossier.js`.
 * In the build it is an entry of its own, written at the site root under a
 * fixed name; in development the request is answered by the TypeScript
 * source, which Vite compiles on the fly.
 */
function dossierAutonome(): Plugin {
  return {
    name: 'dossier-autonome',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url?.split('?')[0].endsWith('/dossier.js')) req.url = `${server.config.base}src/dossier-autonome.ts`
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves a project site from /<repo>/, not the domain root;
  // the workflow passes the repository name so a rename needs no edit here.
  base: process.env.GITHUB_PAGES ? `/${process.env.PAGES_BASE ?? 'SIR-toolbox-France'}/` : '/',
  plugins: [react(), dossierAutonome()],
  build: {
    rolldownOptions: {
      input: { main: 'index.html', dossier: 'src/dossier-autonome.ts' },
      output: {
        entryFileNames: (entree) => (entree.name === 'dossier' ? 'dossier.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
})
