import { useState } from 'react'
import { GAMES } from './games.js'
import { SITE_CONFIG } from './siteConfig.js'

const isHidden = id => SITE_CONFIG.hiddenGames.includes(id)

function GamesView() {
  const games = GAMES.filter(g => !isHidden(g.id))
  return (
    <section className="view">
      <header className="hero">
        <h1>Serial <span className="accent">Gaming</span></h1>
        <p>Scrivi un bot in MicroPython, caricalo sul tuo RP2040 e sfida un amico (o la CPU)
          direttamente dal browser, via WebSerial.</p>
      </header>

      <div className="games">
        {games.map(g => (
          <div className="game-card" key={g.id}>
            <span className="icon">{g.icon}</span>
            <h3>{g.title}</h3>
            <p>{g.blurb}</p>
            <a className="btn primary" href={g.href}>{g.cta}</a>
          </div>
        ))}
      </div>

      <p className="note">Prima volta qui? Leggi la spiegazione, poi costruisci il tuo bot nel{' '}
        <a href="editor/">Laboratorio</a> — a carte, a blocchi o in Python — provalo contro la
        CPU e caricalo sul Pico. Ogni gioco ha la sua pagina «API per il bot» con protocollo,
        esempio funzionante e consigli.</p>
    </section>
  )
}

function SpiegazioneView() {
  return (
    <section className="view">
      <h2 className="view-title">Come funziona tutto</h2>
      <p className="intro">Ogni giocatore scrive la propria AI in MicroPython, la carica su un
        Raspberry Pi Pico (RP2040) e lo collega via USB: il browser fa da arbitro e parla col
        bot sulla porta seriale.</p>

      <h2>In tre passi</h2>
      <ol className="steps">
        <li><strong>Scrivi il tuo bot</strong><span>In MicroPython: un modulo con una funzione{' '}
          <code>rispondi(state)</code> che riceve lo stato del gioco e ritorna la mossa. Al
          traffico seriale (JSON su stdin e stdout) pensa il router.</span></li>
        <li><strong>Caricalo sul Pico</strong><span>Dal <a href="editor/">Laboratorio</a>,
          direttamente dal browser: l'upload installa il router (<code>main.py</code>) e salva
          il bot come <code>bot_&lt;gioco&gt;.py</code> — un bot per gioco, tutti sullo stesso
          Pico. In alternativa copia i file a mano con Thonny o <code>mpremote</code>.</span></li>
        <li><strong>Collega e sfida</strong><span>Apri il gioco con Chrome o Edge, collega il
          Pico via USB, premi &ldquo;Connetti&rdquo; e inizia la partita.</span></li>
      </ol>

      <h2>Le regole</h2>
      <ul className="rules">
        <li>La piattaforma è un <strong>RP2040</strong>: il tuo bot deve girare lì sopra, con i
          suoi limiti di memoria e di velocità.</li>
        <li>Ogni mossa ha un limite di tempo (lo trovi nella documentazione di ciascun gioco):
          <strong> 1 secondo</strong> per il tris, un po' di più per gli altri.
          Se il bot non risponde in tempo, perde la partita.</li>
        <li>Una <strong>mossa non valida</strong> (casella occupata, mossa illegale, JSON
          malformato) vale come sconfitta immediata.</li>
        <li>Puoi giocare <strong>1 vs 1</strong> (due Pico collegati allo stesso computer)
          oppure <strong>1 vs CPU</strong> per allenare il tuo bot contro l'avversario
          integrato.</li>
      </ul>

      <h2>Il protocollo — tris <small>(<a href="tictactoe/docs.html">documentazione completa</a>)</small></h2>
      <p>A ogni tuo turno ricevi una riga JSON. <strong>Il tuo simbolo è sempre
        <code>"O"</code></strong>, anche se a video giochi come X: ci pensa il browser a
        rimappare i simboli.</p>
      <pre><code>{'{"board": ["X", "", "", "", "O", "", "", "", ""], "lastMove": 0, "winner": null}'}</code></pre>
      <p>Rispondi con l'indice della casella scelta (0–8):</p>
      <pre><code>{'{"move": 6}'}</code></pre>

      <h2>Il protocollo — othello <small>(<a href="othello/docs.html">documentazione completa</a>)</small></h2>
      <p>Stessa logica del tris su scacchiera 8×8 (64 celle, indice = riga × 8 + colonna), con
        un regalo: nel messaggio trovi anche <code>moves</code>, le tue mosse legali già
        calcolate dall'arbitro. Scegline una entro 2 secondi.</p>
      <pre><code>{'{"board": ["", "", …64 celle…], "moves": [19, 26, 37, 44], "lastMove": 20, "winner": null}'}</code></pre>
      <pre><code>{'{"move": 19}'}</code></pre>
    </section>
  )
}

export default function App() {
  const [view, setView] = useState('giochi')
  return (
    <div className="home">
      <header className="topbar">
        <span className="brand">Serial <span className="accent">Gaming</span></span>
        <nav>
          <a href="#giochi" className={view === 'giochi' ? 'active' : ''}
            onClick={e => { e.preventDefault(); setView('giochi') }}>Giochi</a>
          <a href="editor/">Laboratorio</a>
          <a href="#spiegazione" className={view === 'spiegazione' ? 'active' : ''}
            onClick={e => { e.preventDefault(); setView('spiegazione') }}>Spiegazione</a>
        </nav>
      </header>

      {view === 'giochi' ? <GamesView /> : <SpiegazioneView />}
    </div>
  )
}
