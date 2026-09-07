# Serial Gaming

Un laboratorio in italiano per insegnare a un bot a giocare, passando da
carte strategiche a blocchi e Python. Le prime prove funzionano nel browser;
un Raspberry Pi Pico con MicroPython permette poi di sfidare altri bot via USB.

## Avvio

Il repository usa npm e `package-lock.json`. Usa una versione LTS supportata
di Node.js (per esempio Node 22).

```sh
npm ci
npm run dev
```

Apri l'indirizzo stampato da Vite. Per generare e vedere il sito statico:

```sh
npm run build
npm run preview
```

## Prima attività in classe

Per una quinta primaria o una prima media, partire dal Tris e dalle carte:
un computer ogni coppia, 45–60 minuti, nessun Pico necessario. Fare una
previsione, cambiare una sola regola, osservare il risultato e raccontarlo.
La guida in `/lezioni/` include una scaletta breve e un percorso più lungo.

La home propone giochi per cominciare e sfide successive. Nel laboratorio,
`?game=tictactoe#carte` apre direttamente il gioco e il livello desiderati.
Carte, codice Python e blocchi vengono salvati per gioco nel browser locale.
Su computer condivisi la coppia successiva ritrova lo stesso lavoro; il
salvataggio non sincronizza computer diversi. Cambiare le carte rigenera il
loro codice e sostituisce le modifiche manuali, come indicato nell'editor.

## Sfide a distanza con due RP2040

La pagina `/remote/` permette una partita di **Tris** tra due computer, ognuno
con il proprio Pico collegato via USB. Il server Node.js distribuisce anche
il sito compilato; i bot restano sulle schede, non vengono eseguiti sul server.

```sh
npm run build
npm start
```

Il server ascolta su `127.0.0.1:3001`. Per lo sviluppo, avvia anche
`npm run dev`: Vite inoltra i WebSocket al server sulla porta 3001.
Per usarlo da altri computer, esponilo in HTTPS tramite il proxy della tailnet:
WebSerial richiede un contesto sicuro. `PUBLIC_ORIGIN` può indicare l'origine
HTTPS pubblicata se il proxy cambia l'header Host; `PORT` cambia la porta locale.

1. Ciascuno carica un bot del Tris dal Laboratorio sul proprio Pico.
2. Aprite «Sfida online» e collegate le schede. Il router riconosce il bot installato.
3. Un partecipante crea una stanza e comunica il codice all'altro, che lo inserisce.
4. Quando entrambi i bot sono pronti, chi ha creato la stanza avvia la partita.

Il server sceglie chi comincia, valida le mosse e invia lo stesso tabellone ai
due browser. Ogni bot vede se stesso come `O`, come nel protocollo locale.
Il limite online è **5 secondi per turno, rete inclusa**; i limiti delle
partite locali restano invariati. Le risposte di turni precedenti vengono rifiutate.
Le stanze sono in memoria, durano 30 minuti e si chiudono alla disconnessione
di un partecipante; una perdita di rete silenziosa viene rilevata dal heartbeat.
Non ci sono account o classifiche persistenti. L'accesso previsto è nella tailnet;
il server controlla il gioco ma non attesta che il software del client giri su un Pico.
Per gli altri giochi resta disponibile la sfida con due schede sullo stesso PC.

Il laboratorio usa CodeMirror con evidenziazione Python, numeri di riga e
modifica del codice. Il codice visualizzato è quello salvato e caricato sul Pico.
Il tema scuro è condiviso da sito, giochi e laboratorio.

## Verifiche mirate

```sh
npx playwright install chromium
npm run test:classroom
npm run test:server
npx playwright test tests/editor-pico.spec.js tests/remote.spec.js
```

La suite verifica navigazione, controlli nascosti, avvio senza hardware,
tastiera e assenza di timeout umano nel Tris, salvataggio per gioco di carte,
blocchi e Python, layout mobile e una partita reale del bot nel laboratorio.
I test di Blockly e della partita richiedono internet. L’upload viene verificato anche con un simulatore del protocollo raw REPL,
compresi file UTF-8, dimensione, reset e disconnessione. La sfida remota viene
verificata con due browser e Pico simulati. Il collegamento USB e l’upload su
hardware reale richiedono comunque una verifica separata con una scheda fisica.

## Miglioramenti consigliati, in ordine

1. **Isolare Python in un Web Worker.** Ora Pyodide esegue il codice sul thread
   principale: un ciclo infinito può bloccare la pagina. Prima di proporre
   Python libero in classe, aggiungere un worker terminabile e un comando
   di arresto. Per il primo incontro usare le carte senza modificare il codice.
2. **Esportare e importare il progetto della coppia.** Un file che contenga
   carte, blocchi e codice evita di legare il lavoro al computer della scuola.
   Il salvataggio locale già presente copre ricaricamenti e cambi di gioco.
3. **Tre missioni brevi per gioco.** Per esempio: prendere il centro, impedire
   una vittoria, spiegare perché una carta non viene mai usata. Verificare
   prima queste attività con una coppia di bambini e adattare parole e tempi.
4. **Completare l'accessibilità degli altri tabelloni.** Il Tris usa pulsanti
   etichettati; gli altri motori contengono ancora celle o canvas da adattare
   alla tastiera. Considerare anche turni senza fretta negli altri giochi.
5. **Preparare le dipendenze per la rete scolastica.** Blockly e Pyodide
   arrivano da CDN. Servirli localmente renderebbe il laboratorio meno
   dipendente da filtri di rete e disponibilità di internet.

## Note tecniche

La struttura è descritta in [MIGRATION.md](MIGRATION.md). La configurazione dei
giochi visibili e dell'emulatore si modifica soltanto in `src/config.js`.

Il fix dei pannelli nascosti fa prevalere l'attributo HTML `hidden` sugli stili
flex/grid, che altrimenti possono renderli nuovamente visibili:
[documentazione MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/hidden).
Per l'aggiornamento Vite: [guida ufficiale alla migrazione](https://v6.vite.dev/guide/migration)
e [avviso di sicurezza](https://github.com/vitejs/vite/security/advisories/GHSA-fx2h-pf6j-xcff).
