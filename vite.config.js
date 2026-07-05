import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve, join, relative, dirname } from 'path'
import { readdirSync, copyFileSync, mkdirSync } from 'fs'

// App multi-pagina con tutto il sorgente in src/ (che è anche la root di
// Vite): la home è React (app.html), le pagine di gioco restano quelle
// esistenti (script classici, già collaudati) e Vite le impacchetta come
// entry statiche. `vite build` produce un sito interamente statico in
// dist/, senza alcun Python.
const page = (path) => resolve(__dirname, 'src', path)

const GAMES = ['tictactoe', 'forza4', 'morra', 'pong', 'tron', 'navale', 'racetrack', 'arena', 'chess']

const input = {
  index: page('index.html'),
  home: page('app.html'),
  torneo: page('torneo/index.html'),
  editor: page('editor/index.html'),
}
for (const game of GAMES) {
  input[game] = page(`${game}/index.html`)
  input[`${game}-docs`] = page(`${game}/docs.html`)
}

// Le pagine di gioco usano script classici (non-modulo) che condividono
// variabili globali: Vite non li impacchetta (e avvisa), quindi li copiamo
// in dist/ così come sono, insieme ai CSS, preservando i percorsi relativi
// già presenti negli HTML. src/home/ è escluso: quello è ESM e viene
// impacchettato normalmente.
function copyClassicAssets() {
  const srcDir = resolve(__dirname, 'src')
  const outDir = resolve(__dirname, 'dist')
  const wanted = (name) => name.endsWith('.js') || name.endsWith('.css')

  function walk(dir, files = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (full !== join(srcDir, 'home')) walk(full, files)
      } else if (wanted(entry.name)) {
        files.push(full)
      }
    }
    return files
  }

  return {
    name: 'copy-classic-assets',
    closeBundle() {
      for (const file of walk(srcDir)) {
        const dest = join(outDir, relative(srcDir, file))
        mkdirSync(dirname(dest), { recursive: true })
        copyFileSync(file, dest)
      }
    },
  }
}

export default defineConfig({
  root: 'src',
  plugins: [react(), copyClassicAssets()],
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: { input },
  },
})
