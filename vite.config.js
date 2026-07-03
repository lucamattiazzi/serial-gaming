import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// App multi-pagina: la home è React (app.html), le pagine di gioco restano
// quelle esistenti (script classici, già collaudati) e Vite le impacchetta
// come entry statiche. `vite build` produce un sito interamente statico in
// dist/, senza alcun Python.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        home: resolve(__dirname, 'app.html'),
        tictactoe: resolve(__dirname, 'tictactoe/index.html'),
        forza4: resolve(__dirname, 'forza4/index.html'),
        morra: resolve(__dirname, 'morra/index.html'),
        pong: resolve(__dirname, 'pong/index.html'),
        tron: resolve(__dirname, 'tron/index.html'),
        navale: resolve(__dirname, 'navale/index.html'),
        racetrack: resolve(__dirname, 'racetrack/index.html'),
        arena: resolve(__dirname, 'arena/index.html'),
        chess: resolve(__dirname, 'chess/index.html'),
        torneo: resolve(__dirname, 'torneo/index.html'),
        editor: resolve(__dirname, 'editor/index.html'),
      },
    },
  },
})
