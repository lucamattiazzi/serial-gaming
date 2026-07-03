# Migrazione a npm + Vite + React

Il sito nasce come pagine statiche vanilla (HTML/CSS/JS) servite in locale con
`python3 -m http.server`. Questa è la prima tappa della migrazione a una
toolchain **npm + Vite + React** che produce un sito **interamente statico**
(cartella `dist/`) senza alcun Python.

## Stato attuale (tappa 1)

Aggiunto in modo **non distruttivo**: il sito vanilla continua a funzionare
esattamente come prima. In parallelo c'è ora un progetto Vite:

- `package.json`, `vite.config.js` — toolchain e build multi-pagina.
- `app.html` + `src/` — la **home in React** (griglia dei giochi + spiegazione),
  che rispetta i flag di `src/siteConfig.js` (giochi nascosti).
- Le **pagine di gioco restano quelle esistenti** (motori già collaudati:
  canvas, WebSerial, Pyodide, Blockly). Vite le impacchetta come entry statiche
  senza riscriverle.

`vite build` genera `dist/` con la home React + tutte le pagine di gioco.

## Comandi (richiede Node ≥ 18)

```bash
npm install
npm run dev      # server di sviluppo (sostituisce python -m http.server)
npm run build    # sito statico in dist/
npm run preview  # anteprima della build
```

> ⚠️ Questi file **non sono stati compilati né provati** nell'ambiente in cui
> sono stati scritti (Node non installato). Al primo `npm install && npm run dev`
> vanno verificati: (a) che le pagine di gioco classiche (script non-modulo con
> variabili globali condivise tra file) vengano servite/impacchettate
> correttamente da Vite; (b) il caricamento degli asset relativi
> (`../style.css`, `../picoserial.js`, ecc.) nella build.

## Prossime tappe

1. Sostituire `index.html` (home vanilla) con `app.html` (home React), oppure
   rinominare `app.html` → `index.html` una volta verificata la build.
2. Unificare la configurazione: far leggere a `config.js` (pagine classiche) e a
   `src/siteConfig.js` (React) un'unica fonte, oppure convertire le pagine di
   gioco perché importino il modulo ESM.
3. Portare i giochi in React uno alla volta (a scelta): estrarre il motore puro
   di ogni gioco (già isolato e testato con gli harness JXA) e avvolgerlo in un
   componente React che gestisce solo la UI. I test di logica restano validi.
