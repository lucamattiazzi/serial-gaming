# Migrazione a npm + Vite + React

Il sito nasce come pagine statiche vanilla (HTML/CSS/JS) servite in locale con
`python3 -m http.server`. Questa è la prima tappa della migrazione a una
toolchain **npm + Vite + React** che produce un sito **interamente statico**
(cartella `dist/`) senza alcun Python.

## Stato attuale (tappa 1)

Aggiunto in modo **non distruttivo**: il sito vanilla continua a funzionare
come prima. In parallelo c'è il progetto Vite, e **tutto il sorgente vive in
`src/`** (che è anche la `root` di Vite):

- `package.json`, `vite.config.js` — toolchain e build multi-pagina.
- `src/` — tutto il sito: pagine di gioco (`src/<gioco>/`), Laboratorio
  (`src/editor/`), file condivisi (`src/picoserial.js`, `src/style.css`, …),
  home vanilla (`src/index.html`) e home React (`src/app.html` + `src/home/`),
  che rispetta i flag di `src/home/siteConfig.js`.
- `examples/` — i bot MicroPython di esempio (non fanno parte del sito).
- Le **pagine di gioco restano quelle esistenti** (motori già collaudati:
  canvas, WebSerial, Pyodide, Blockly). Vite le impacchetta come entry statiche
  senza riscriverle.

`vite build` genera `dist/` con le due home, tutte le pagine di gioco e le
relative pagine di documentazione. Senza toolchain il sito si serve ancora
statico: `python3 -m http.server` **da dentro `src/`**.

## Comandi (richiede Node ≥ 18)

```bash
npm install
npm run dev      # server di sviluppo (sostituisce python -m http.server)
npm run build    # sito statico in dist/
npm run preview  # anteprima della build
```

## Prossime tappe

1. Sostituire `src/index.html` (home vanilla) con `src/app.html` (home React),
   oppure rinominare `app.html` → `index.html` una volta verificata la build.
2. Unificare la configurazione: far leggere a `src/config.js` (pagine classiche)
   e a `src/home/siteConfig.js` (React) un'unica fonte, oppure convertire le
   pagine di gioco perché importino il modulo ESM.
3. Portare i giochi in React uno alla volta (a scelta): estrarre il motore puro
   di ogni gioco (già isolato e testato con gli harness JXA) e avvolgerlo in un
   componente React che gestisce solo la UI. I test di logica restano validi.
