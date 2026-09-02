import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Read rather than imported, so the config needs no resolveJsonModule and no import
// attribute. There is one version in the repo and this is it.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves a project site from /<repo>/, not from the domain root.
  // src/data/index.ts builds icon URLs from import.meta.env.BASE_URL, so setting
  // this is all that's needed for the artwork to resolve once deployed.
  base: '/SWSE-CharacterSheet/',

  // Substituted into the bundle at build time. The About panel prints it, so a bug report
  // can name the build it came from — which matters more than usual here, because a
  // character lives in one browser's local storage and never leaves it.
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },

  // A port of our own, so a Vite project already holding 5173 does not push this one to
  // 5174 and leave you guessing which window is which. `strictPort` makes a clash an error
  // rather than a silent move — the e2e suite defaults to this number, and a server that
  // quietly relocated would have it testing whatever else is running.
  //
  // Not 6000, which is X11's: Chrome, Firefox and Safari all refuse it as an unsafe port,
  // so the server would start and no browser would ever reach it.
  //
  // `host` is pinned to the IPv4 loopback because the default binds to whatever `localhost`
  // resolves to first, and on this Node that is `::1` alone: the server answers on
  // http://localhost:6006 and http://[::1]:6006 while http://127.0.0.1:6006 is refused
  // outright, which reads as "the port is closed" in a browser opened on the literal
  // address. Bound here, a browser asking for `localhost` still falls back to this address,
  // so both spellings work. Still loopback only — nothing is exposed to the network, which
  // `--host` is for.
  server: {
    host: '127.0.0.1',
    port: 6006,
    strictPort: true,
  },

  build: {
    rolldownOptions: {
      output: {
        // The rules data is ~1.9 MB of the bundle and changes only when the importer is
        // re-run; the app code changes constantly. Splitting them does *not* speed up
        // first load — both are static imports, so the browser fetches them together —
        // but it stops a one-line code change invalidating 630 KB in every returning
        // visitor's cache. Only ~97 KB gzipped now carries the app's own hash.
        //
        // Vite's `json: { stringify: true }` was measured here and dropped: it emits
        // JSON.parse("…") instead of an object literal, which cost 1.9 KB gzipped and
        // saved 0.1 ms of parse time on the 1.3 MB features.json — V8 has closed the gap
        // that trick used to exploit.
        advancedChunks: {
          groups: [{ name: 'data', test: /src[\\/]data[\\/]/ }],
        },
      },
    },
  },
})
