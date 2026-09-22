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

La home propone giochi illustrati per cominciare e sfide successive. Il
laboratorio affianca istruzioni ordinate e partita di prova. Carte aggiuntive,
conversione in blocchi e codice si aprono su richiesta. Il pulsante verde avvia
il bot e le carte si illuminano quando decidono
una mossa; il risultato resta accanto al tabellone. Su schermi piccoli i pannelli
si impilano e «Vai alla prova» porta direttamente al pulsante di avvio.
Quando si sceglie il computer, una breve spiegazione descrive la sua AI e la
strategia del livello scelto: mosse casuali, ricerca delle mosse successive o
regole specifiche del gioco. Nel laboratorio è sotto «Come gioca il computer?».
Nel laboratorio,
`?game=tictactoe#carte` apre direttamente il gioco e il livello desiderati.
Carte, codice Python e blocchi vengono salvati per gioco nel browser locale.
Su computer condivisi la coppia successiva ritrova lo stesso lavoro; il
salvataggio non sincronizza computer diversi. Cambiare le carte rigenera il
loro codice e sostituisce le modifiche manuali, come indicato nell'editor.

## Sfide a distanza: Pico e browser

La pagina `/remote/` permette una partita di **Tris** tra due partecipanti.
Ciascuno sceglie un Pico collegato via USB oppure Python nel browser:
funzionano browser contro browser, Pico contro Pico e sfide miste.
Il server Node.js distribuisce anche il sito compilato e fa da arbitro;
il codice dei bot resta sul computer o sulla scheda del partecipante.

```sh
npm run build
npm start
```

Il server ascolta su `127.0.0.1:3001`. Per lo sviluppo, avvia anche
`npm run dev`: Vite inoltra i WebSocket al server sulla porta 3001.
Per usarlo da altri computer, esponilo in HTTPS tramite il proxy della tailnet:
WebSerial richiede un contesto sicuro. `PUBLIC_ORIGIN` può indicare l'origine
HTTPS pubblicata se il proxy cambia l'header Host; `PORT` cambia la porta locale.

1. Aprite «Sfida online», ciascuno nella propria pagina, anche su due schede del browser.
2. Scegliete dove gira il bot: collegate il Pico con il bot del Tris già caricato
   dal Laboratorio, oppure scegliete «Python nel browser» e premete «Avvia bot Python».
3. Un partecipante crea una stanza e comunica il codice all'altro, che lo inserisce.
4. Quando entrambi i bot sono pronti, chi ha creato la stanza avvia la partita.

La modalità browser usa lo stesso `rispondi(stato)` dei bot del Laboratorio.
Potete scrivere Python nell'editor con syntax highlighting, usare l'esempio
iniziale o importare Python e carte salvati per il Tris nello stesso browser.
La bozza online ha un salvataggio separato e non modifica quella del Laboratorio.
Per cambiare codice fermate il bot e poi riavviatelo. Tenete aperte le pagine
durante la sfida: chiudere una pagina interrompe la stanza.

Python gira in un Web Worker con Pyodide 0.26.4, scaricato da CDN al primo avvio.
Un'esecuzione oltre **4 secondi** viene interrotta senza bloccare la pagina;
durante una partita il server assegna la sconfitta allo scadere del turno.
Il namespace Python resta vivo tra le mosse e le rivincite, fino a «Ferma bot»:
usate il messaggio di inizio partita per azzerare eventuali variabili di strategia.
I moduli specifici del Pico, per esempio `machine`, richiedono la scheda fisica.

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
Il tema chiaro o scuro segue le preferenze del sistema su sito, giochi,
laboratorio, blocchi e editor Python. Il collegamento Pico si apre da
«Carica sul Pico» oppure da «Hai una scheda? Collega un Pico».

## Arena dei Mostri: più strategie

L'Arena offre 12 mostri di quattro tipi, squadre da tre e tre attacchi per mostro:
forte (45, precisione 70%), preciso (27, precisione 100%) e jolly di tipo normale
(24, precisione 100%, senza vantaggi o resistenze di tipo). La difesa resta valida
anche contro il jolly. Ogni squadra ha due cure da massimo 35 HP: consumano il
turno e si risolvono prima degli attacchi, senza rianimare i KO.

Fiammicio, Corallino, Spinetta e Scintillo ampliano il bestiario mantenendo
gli indici degli otto mostri originali. I bot esistenti possono continuare a
usare attacco 0/1, difesa e cambio; i nuovi possono inviare `["attacca", 2]`
e `["cura"]`, leggendo `you.healsLeft`. Il Laboratorio offre carte e blocchi
per le nuove azioni. Le strategie salvate non vengono sostituite.

La selezione dei mostri funziona anche da tastiera. In due umani sullo stesso
computer, squadra e mosse si scelgono a turno senza sovrapporre i pannelli;
le azioni si risolvono insieme. L'Arena si gioca localmente, anche con due Pico:
le stanze online supportano ancora solo il Tris.

Tre prove brevi per la classe: confrontare preciso e jolly contro una resistenza;
spostare «Cura se hai poca vita» prima e dopo la carta d'attacco; scegliere
una squadra veloce e una resistente e spiegare le differenze osservate.
Le regole e il protocollo completo sono in `src/arena/docs.html`.

## Verifiche mirate

```sh
npx playwright install chromium
npm run test:classroom
npm run test:server
npx playwright test tests/editor-pico.spec.js tests/remote.spec.js tests/browser-bot.spec.js
npx playwright test tests/arena.spec.js
npx playwright test tests/studio.spec.js tests/simple-design.spec.js
```

La suite verifica navigazione, controlli nascosti, avvio senza hardware,
tastiera e assenza di timeout umano nel Tris, salvataggio per gioco di carte,
blocchi e Python, layout mobile e una partita reale del bot nel laboratorio.
I test di Blockly e della partita richiedono internet. L’upload viene verificato anche con un simulatore del protocollo raw REPL,
compresi file UTF-8, dimensione, reset e disconnessione. La sfida remota viene
verificata con Python reale nei browser, sfide miste e Pico simulati, inclusi
timeout, rivincita e arresto dei cicli infiniti. Questi test richiedono internet
per scaricare Pyodide. Il collegamento USB e l’upload su
hardware reale richiedono comunque una verifica separata con una scheda fisica.

## Miglioramenti consigliati, in ordine

1. **Isolare anche il simulatore del Laboratorio in un Web Worker.** Le sfide
   online usano già un worker terminabile; nel Laboratorio Pyodide esegue ancora
   il codice sul thread principale e un ciclo infinito può bloccare la pagina. Prima di proporre
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
