import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves a project site from /<repo>/, not the domain root;
  // the workflow passes the repository name so a rename needs no edit here.
  base: process.env.GITHUB_PAGES ? `/${process.env.PAGES_BASE ?? 'ERM-Environnement'}/` : '/',
  plugins: [react()],
})
