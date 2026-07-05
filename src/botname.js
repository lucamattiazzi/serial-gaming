// ── Nome del bot ─────────────────────────────────────────────
// Mostra sulla card di ogni giocatore RP2040 il nome con cui la scheda si
// presenta: alla connessione PicoSerial manda {"hello": true} e il router
// risponde con nome (scelto nel Laboratorio e salvato sulla scheda in
// bot_config.json), id univoco della scheda e lista dei bot installati.
// Se sulla scheda manca il bot del gioco corrente, la riga di connessione
// mostra un avviso. Le schede senza router (o programmi fatti a mano) non
// rispondono all'hello: la card resta semplicemente senza nome.
;(function () {
  const labels = {}   // slot id -> span del nome sulla card
  const warnings = {} // slot id -> span di avviso nella riga di connessione

  function init() {
    for (const select of document.querySelectorAll('select[id^="type-"]')) {
      const id = select.id.slice('type-'.length)
      const connRow = document.getElementById(`conn-row-${id}`)
      const card = document.getElementById(`card-${id}`)
      if (!connRow || !card) continue

      // etichetta sulla card, accanto al titolo (visibile durante il gioco)
      const label = document.createElement('span')
      label.className = 'bot-name'
      const heading = card.querySelector('h2')
      if (heading) heading.appendChild(label)
      labels[id] = label

      // avviso "manca il bot", nella riga di connessione
      const warning = document.createElement('span')
      warning.className = 'bot-missing'
      warning.hidden = true
      connRow.appendChild(warning)
      warnings[id] = warning

      // cambiare tipo di giocatore azzera nome e avviso
      select.addEventListener('change', () => setIdentity(id, null))
    }
  }

  // Lo slot si ricava dall'etichetta della seriale: tutte le pagine creano
  // PicoSerial con label "Pico <slot>", dove <slot> è l'id degli elementi DOM.
  function slotOf(pico) {
    const match = /^Pico (.+)$/.exec(pico.label || '')
    return match && labels[match[1]] ? match[1] : null
  }

  function setIdentity(id, identity) {
    const label = labels[id]
    const warning = warnings[id]
    if (!identity) {
      label.textContent = ''
      warning.hidden = true
      return
    }
    // senza nome, le ultime cifre dell'id univoco distinguono comunque le schede
    label.textContent = identity.name ||
      (identity.id ? `Pico #${identity.id.slice(-4)}` : '')
    const game = typeof GAME_ID !== 'undefined' ? GAME_ID : null
    const missing = game && Array.isArray(identity.bots) && !identity.bots.includes(game)
    warning.textContent = missing
      ? '⚠ su questa scheda manca il bot di questo gioco: caricalo dal Laboratorio'
      : ''
    warning.hidden = !missing
  }

  window.addEventListener('pico-identity', event => {
    const id = slotOf(event.detail.pico)
    if (id) setIdentity(id, event.detail.identity)
  })

  window.addEventListener('pico-disconnect', event => {
    const id = slotOf(event.detail.pico)
    if (id) setIdentity(id, null)
  })

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
  else init()
})()
