import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves a project site from /<repo>/, not from the domain root.
  // src/data/index.ts builds icon URLs from import.meta.env.BASE_URL, so setting
  // this is all that's needed for the artwork to resolve once deployed.
  base: '/SWSE-CharacterSheet/',
})
