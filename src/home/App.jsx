import { useEffect, useState } from 'react'
import { GAMES } from './games.js'
import { SITE_CONFIG } from './siteConfig.js'
import GameArtwork, { BotDrawing } from './GameArtwork.jsx'
import './style.css'

const readView = () => location.hash === '#spiegazione' ? 'spiegazione' : 'giochi'

function GamesView() {
  const games = GAMES.filter(g => !SITE_CONFIG.hiddenGames.includes(g.id) && g.id !== 'torneo')
  return <>
    <section className="welcome" aria-labelledby="welcome-title">
      <div className="welcome-copy">
        <span className="eyebrow">IL LABORATORIO DELLE TUE IDEE</span>
        <h1 id="welcome-title">Si gioca.<br />E il bot lo inventi <em>tu!</em></h1>
        <p>Scegli un gioco, unisci le istruzioni e guarda il tuo bot in azione. Ogni tentativo è una nuova idea.</p>
        <a className="btn primary" href="editor/?game=tictactoe#carte"><span aria-hidden="true">＋</span> Crea il tuo primo bot</a>
        <span className="welcome-note">Si comincia dal Tris. Basta la tua curiosità.</span>
      </div>
      <div className="welcome-art" aria-hidden="true">
        <span className="bot-speech">Mi insegni a giocare?</span>
        <div className="hero-bot"><BotDrawing /></div>
        <div className="idea-blocks"><span>⚑ Quando tocca a me</span><span>Se posso vincere…</span><span>faccio la mia mossa!</span></div>
        <span className="art-spark spark-one">✦</span><span className="art-spark spark-two">✧</span>
      </div>
    </section>
    <ol className="discovery-path" aria-label="Il tuo percorso">
      <li><span className="step-number">1</span><span><strong>Gioca</strong><small>Scopri le regole</small></span></li>
      <li><span className="step-number">2</span><span><strong>Costruisci</strong><small>Insegna al tuo bot</small></span></li>
      <li><span className="step-number">3</span><span><strong>Prova e riprova</strong><small>Le idee crescono così!</small></span></li>
    </ol>
    <section className="game-library" aria-label="Giochi">
      <div className="library-heading"><div><h2>Scegli un gioco.</h2><p>Puoi giocare tu o inventare un bot che gioca per te.</p></div><span className="library-count">{games.length} giochi da esplorare</span></div>
      <div className="game-grid">
        {games.map(g => <article className={`activity-card game-${g.id}`} key={g.id}>
          <div className="game-art"><GameArtwork game={g} /><span className="game-level">{g.id === 'tictactoe' ? '★ Parti da qui' : g.level === 'inizio' ? 'Per cominciare' : 'Una sfida in più'}</span></div>
          <div className="activity-content"><h3>{g.title}</h3>
            <p>{g.blurb}</p>
            <div className="activity-links">
              <a href={g.href} aria-label={`Gioca a ${g.title}`}><span aria-hidden="true">▶</span> Gioca</a>
              <a href={`editor/?game=${g.id}#carte`} aria-label={`Crea un bot per ${g.title}`}>Crea un bot <span aria-hidden="true">→</span></a>
            </div>
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
