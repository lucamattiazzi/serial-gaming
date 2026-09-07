# Architettura del sito

Il sito usa Vite e React per la home; i giochi e il Laboratorio conservano
HTML, CSS e JavaScript classico. I motori di gioco non sono stati riscritti.

- `src/index.html` — home React; `src/app.html` resta un alias compatibile.
- `src/home/` — componenti, catalogo e stile della home.
- `src/config.js` — unica configurazione per home, giochi e laboratorio.
  `src/home/siteConfig.js` espone la stessa configurazione a React.
- `src/editor/` — carte, blocchi Blockly, editor Python CodeMirror, prove e upload USB.
- `src/<gioco>/` — pagina, motore e documentazione di ciascun gioco.
- `src/remote/` — stanze online del Tris, ogni partecipante con il proprio Pico.
- `server/index.js` — server HTTP/WebSocket e arbitro del Tris, stanze in memoria.
- `src/lezioni/` — guida docente, con una prima attività breve per la quinta primaria.
- `examples/` — bot MicroPython di esempio; non fanno parte della build.
- `tests/classroom.spec.js` — verifiche browser mirate al percorso didattico.

## Build e distribuzione

`npm run build` produce il frontend statico in `dist/`. `npm start` lo serve
e aggiunge il server WebSocket per le sfide a distanza. La home sorgente richiede
Vite: non può più essere servita direttamente con `python -m http.server`
all'interno di `src/`. Dopo la build, `dist/` si può servire con qualunque
server statico.

Il plugin `copyClassicAssets` copia gli script classici nei percorsi relativi
usati dalle pagine. Gli avvisi di Vite sugli script senza `type="module"`
sono previsti: questi script condividono variabili globali e non devono essere
convertiti in moduli aggiungendo soltanto l'attributo HTML.

Vite è aggiornato alla serie 6.4 per correggere le vulnerabilità rilevate
nella serie 5 mantenendo la compatibilità con il plugin React esistente.
Il lockfile del progetto rimane `package-lock.json`; non sono mantenuti due
lockfile concorrenti.

Blockly è fissato alla versione 13.2.1 sul CDN. Blockly e Pyodide richiedono
internet: la build non è un pacchetto completamente offline.
