import { useEffect, useState } from 'react'
import { GAMES } from './games.js'
import { SITE_CONFIG } from './siteConfig.js'
import './style.css'

const readView = () => location.hash === '#spiegazione' ? 'spiegazione' : 'giochi'

function BotDrawing() {
  return <svg viewBox="0 0 100 100" fill="none" aria-hidden="true">
    <path d="M50 24V13m-25 40H15v20h10m50-20h10v20H75" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    <circle cx="50" cy="11" r="6" fill="#e9b949" stroke="currentColor" strokeWidth="3" />
    <rect x="24" y="28" width="52" height="55" rx="17" fill="var(--accent-soft)" stroke="currentColor" strokeWidth="4" />
    <rect x="33" y="42" width="34" height="22" rx="8" fill="currentColor" />
    <path d="M42 50v6m16-6v6" stroke="var(--bg)" strokeWidth="4" strokeLinecap="round" />
    <path d="M44 73h12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
}

function GamesView() {
  const games = GAMES.filter(g => !SITE_CONFIG.hiddenGames.includes(g.id) && g.id !== 'torneo')
  return <>
    <section className="welcome" aria-labelledby="welcome-title">
      <h1 id="welcome-title">Scegli un gioco.</h1>
      <p>Gioca tu, poi insegna a un bot come fare.</p>
      <a className="btn primary" href="editor/?game=tictactoe#carte">Crea il tuo primo bot</a>
    </section>
    <section className="game-library" aria-label="Giochi">
      <div className="game-grid">
        {games.map(g => <article className="activity-card" key={g.id}>
          <span className="game-symbol" aria-hidden="true">{g.icon}</span>
          <h2>{g.title}</h2>
          <p>{g.blurb}</p>
          <div className="activity-links">
            <a href={g.href} aria-label={`Gioca a ${g.title}`}>Gioca</a>
            <a href={`editor/?game=${g.id}#carte`} aria-label={`Crea un bot per ${g.title}`}>Crea un bot</a>
          </div>
        </article>)}
      </div>
    </section>
  </>
}

function SpiegazioneView() {
  return <section className="explanation">
    <span className="eyebrow">PRIMA DI COMINCIARE</span>
    <h1>Un bot è un compagno a cui insegni a giocare.</h1>
    <p className="explanation-lead">Non legge nella tua mente: segue le istruzioni che gli dai. Il bello è scoprire come migliorarle!</p>
    <ol className="explanation-steps">
      <li><strong>1. Conosci il gioco</strong><p>Comincia dal <a href="tictactoe/">Tris</a>: metti tre simboli in fila, in colonna o in diagonale. Puoi giocare contro il computer o con un compagno.</p></li>
      <li><strong>2. Scegli le tue carte</strong><p>Apri il <a href="editor/?game=tictactoe#carte">Laboratorio</a>. Ogni carta è un’istruzione, per esempio «Se puoi vincere, fai quella mossa». Il bot legge dall’alto: la prima carta che può usare decide la mossa.</p></li>
      <li><strong>3. Fai un esperimento</strong><p>Premi «Prova il bot», osserva la partita e cambia una carta. Prima di riprovare, chiediti: cosa penso che succederà? Non serve collegare una scheda; la prova richiede internet.</p></li>
    </ol>
    <div className="discovery-note"><strong>E se il bot perde?</strong><p>È un indizio! Cerca una mossa che vorresti cambiare, modifica le istruzioni e riprova. Anche spiegare il tuo ragionamento è una vittoria.</p></div>
    <h2>Il tuo bot vive sul Pico</h2><p>Collega il tuo RP2040 via USB, premi «Connetti» e poi «Carica sul Pico» nel Laboratorio. Potete sfidarvi con due Pico sullo stesso computer oppure aprire una <a href="remote/">stanza online per il Tris</a>, ciascuno con la propria scheda o con un bot Python nel browser.</p><h2>Quando vuoi fare un passo in più</h2>
    <p>Trasforma le carte in <strong>blocchi</strong> da incastrare, poi scopri il <strong>codice Python</strong> che hai costruito. Puoi restare sulle carte finché vuoi.</p>
    <details><summary>Per docenti e curiosi: usare una scheda Pico</summary><p>Con un Raspberry Pi Pico e MicroPython installato, il laboratorio carica il bot via USB. Il browser deve supportare WebSerial, per esempio Chrome o Edge su computer. Apri «Collega un Pico», connetti la scheda e carica il bot; poi apri il gioco e seleziona il Pico come giocatore.</p><p>Il router salva un bot per gioco e lascia intatti gli altri. I dettagli del protocollo e i limiti sono nelle pagine «API per il bot» di ciascun gioco. <a href="tictactoe/docs.html">Documentazione del Tris →</a></p></details>
    <a className="btn primary" href="editor/?game=tictactoe#carte">Comincia con le carte →</a>
  </section>
}

export default function App() {
  const [view, setView] = useState(readView)
  useEffect(() => {
    const update = () => setView(readView())
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  return <div className="landing">
    <a className="skip-link" href="#contenuto">Salta al contenuto</a>
    <header className="site-header"><a className="site-brand" href="#giochi" aria-label="Serial Gaming, home"><span className="brand-bot"><BotDrawing /></span>serial<span>gaming</span><span className="brand-dot">.</span></a>
      <nav aria-label="Navigazione principale"><a href="#giochi" aria-current={view === 'giochi' ? 'page' : undefined}>Giochi</a><a href="editor/">Laboratorio</a><a href="remote/">Sfida online</a><a href="#spiegazione" aria-current={view === 'spiegazione' ? 'page' : undefined}>Come funziona</a></nav>
    </header>
    <main id="contenuto" tabIndex="-1">{view === 'giochi' ? <GamesView /> : <SpiegazioneView />}</main>
    <footer className="site-footer"><a href="lezioni/">Guida per docenti</a>{!SITE_CONFIG.hiddenGames.includes('torneo') && <a href="torneo/">Torneo con i Pico</a>}<span className="site-credit">Un progetto di <a href="https://grokked.it">grokked.it</a></span></footer>
  </div>
}
