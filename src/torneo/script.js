// ── Configurazione ───────────────────────────────────────────
const PLANNED_GAMES = 3      // giochi sorteggiati per il torneo
const WINS_NEEDED = 2        // vittorie che assegnano il torneo
const MAX_EXTRA_GAMES = 3    // spareggi massimi in caso di parità
const BETWEEN_GAMES_MS = 3000
const EMU_TIME_LIMIT_MS = 5000

const CATALOG = {
  tictactoe: { name: 'Tris', path: '../tictactoe/' },
  forza4: { name: 'Forza 4', path: '../forza4/' },
  morra: { name: 'Morra cinese', path: '../morra/' },
  pong: { name: 'Pong', path: '../pong/' },
  tron: { name: 'Tron', path: '../tron/' },
  navale: { name: 'Battaglia navale', path: '../navale/' },
  racetrack: { name: 'Racetrack', path: '../racetrack/' },
  arena: { name: 'Arena dei Mostri', path: '../arena/' },
  chess: { name: 'Scacchi', path: '../chess/' },
}

// ── Logica di torneo (funzioni pure) ─────────────────────────
function pickRandomGames(pool, count) {
  const deck = [...pool]
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck.slice(0, count)
}

// decide cosa fare dopo una partita: torneo finito o si continua (extra = spareggio)
function decideNext(winsA, winsB, played, planned, maxExtra) {
  if (winsA >= WINS_NEEDED) return { done: true, winner: 'A' }
  if (winsB >= WINS_NEEDED) return { done: true, winner: 'B' }
  if (played < planned) return { done: false, extra: false }
  if (winsA !== winsB) return { done: true, winner: winsA > winsB ? 'A' : 'B' }
  if (played >= planned + maxExtra) return { done: true, winner: 'TIE' }
  return { done: false, extra: true }
}

// ── Elementi DOM ─────────────────────────────────────────────
const statusDisplay = document.getElementById('status-display')
const startButton = document.getElementById('start-button')
const poolFieldset = document.getElementById('pool')
const scoreboard = document.getElementById('scoreboard')
const bigScore = document.getElementById('big-score')
const gameList = document.getElementById('game-list')
const arenaFrame = document.getElementById('arena-frame')

// ── Stato ────────────────────────────────────────────────────
const players = {
  P1: { type: 'pico', serial: null },
  P2: { type: 'pico', serial: null },
}
let running = false

function slotLabel(id) {
  return id === 'P1' ? 'A' : 'B'
}

// ── Setup sfidanti ───────────────────────────────────────────
for (const id of ['P1', 'P2']) {
  const typeSelect = document.getElementById(`type-${id}`)
  const connectRow = document.getElementById(`conn-row-${id}`)
  const emuRow = document.getElementById(`emu-row-${id}`)

  document.getElementById(`emu-code-${id}`).value = BOT_TEMPLATES.torneo

  typeSelect.addEventListener('change', () => {
    const player = players[id]
    if (player.serial) {
      if (player.serial instanceof PicoSerial) player.serial.disconnect()
      player.serial = null
    }
    player.type = typeSelect.value
    connectRow.hidden = typeSelect.value !== 'pico'
    emuRow.hidden = typeSelect.value !== 'emu'
    updateControls()
  })

  document.getElementById(`connect-${id}`).addEventListener('click', () => connectPico(id))
  document.getElementById(`emu-start-${id}`).addEventListener('click', () => connectEmu(id))
}

async function connectPico(id) {
  const player = players[id]
  const serial = new PicoSerial(`Pico ${id}`)
  try {
    await serial.connect()
  } catch (error) {
    setStatus(`Connessione fallita: ${error.message}`, true)
    return
  }
  attachParentHandlers(id, serial)
  player.serial = serial
  setStatus(`RP2040 connesso per lo sfidante ${slotLabel(id)}.`)
  updateControls()
}

async function connectEmu(id) {
  const player = players[id]
  const button = document.getElementById(`emu-start-${id}`)
  const code = document.getElementById(`emu-code-${id}`).value
  button.disabled = true
  setStatus("Preparo l'emulatore (il primo avvio scarica Pyodide, può volerci qualche secondo)…")
  try {
    const emu = new EmulatedPico(`Emu ${slotLabel(id)}`, code, EMU_TIME_LIMIT_MS)
    await emu.start()
    attachParentHandlers(id, emu)
    player.serial = emu
    setStatus(`Bot emulato pronto per lo sfidante ${slotLabel(id)}.`)
  } catch (error) {
    player.serial = null
    setStatus(`Emulatore: ${error.message}`, true)
  }
  button.disabled = false
  updateControls()
}

// tra una partita e l'altra le seriali tornano in mano al torneo
function attachParentHandlers(id, serial) {
  serial.onmessage(() => { })
  serial.ondisconnect(() => {
    players[id].serial = null
    updateControls()
    setStatus(`Lo sfidante ${slotLabel(id)} si è disconnesso.`, true)
  })
}

function selectedPool() {
  return [...poolFieldset.querySelectorAll('input:checked')].map(el => el.value)
}

function updateControls() {
  for (const id of ['P1', 'P2']) {
    const connected = players[id].serial !== null
    const connStatus = document.getElementById(`conn-${id}`)
    connStatus.textContent = connected ? 'connesso' : 'non connesso'
    connStatus.classList.toggle('connected', connected)
    document.getElementById(`connect-${id}`).disabled = connected || running
    document.getElementById(`type-${id}`).disabled = running

    const emuStatus = document.getElementById(`emu-status-${id}`)
    emuStatus.textContent = connected ? 'pronto' : 'non avviato'
    emuStatus.classList.toggle('connected', connected)
    document.getElementById(`emu-start-${id}`).disabled = running
    document.getElementById(`emu-start-${id}`).textContent = connected ? 'Riavvia bot' : 'Avvia bot'
  }
  for (const input of poolFieldset.querySelectorAll('input')) input.disabled = running
  startButton.disabled = running
    || players.P1.serial === null
    || players.P2.serial === null
    || selectedPool().length < PLANNED_GAMES
}

function setStatus(message, danger = false) {
  statusDisplay.textContent = message
  statusDisplay.classList.toggle('danger', danger)
}

// ── Svolgimento del torneo ───────────────────────────────────
startButton.addEventListener('click', runTournament)

async function runTournament() {
  const pool = selectedPool()
  if (pool.length < PLANNED_GAMES) return
  running = true
  updateControls()

  const schedule = pickRandomGames(pool, PLANNED_GAMES)
  const results = [] // { game, winner: 'A'|'B'|'TIE' }
  let winsA = 0
  let winsB = 0
  scoreboard.hidden = false
  gameList.innerHTML = ''
  renderScore(winsA, winsB)

  let verdict
  let gameIndex = 0
  while (true) {
    let gameId
    if (gameIndex < schedule.length) {
      gameId = schedule[gameIndex]
    } else {
      gameId = pickRandomGames(pool, 1)[0] // spareggio
    }
    gameIndex++

    const item = document.createElement('li')
    item.classList.add('current')
    const extraLabel = gameIndex > PLANNED_GAMES ? ' (spareggio)' : ''
    item.innerHTML = `<strong>${CATALOG[gameId].name}</strong>${extraLabel} — in corso…`
    gameList.appendChild(item)
    setStatus(`Partita ${gameIndex}: ${CATALOG[gameId].name}. Che vinca il bot migliore!`)

    const winnerSlot = await runMatch(gameId)
    const winner = winnerSlot === 'TIE' ? 'TIE' : winnerSlot === 'P1' ? 'A' : 'B'
    results.push({ game: gameId, winner })
    if (winner === 'A') winsA++
    if (winner === 'B') winsB++

    item.classList.remove('current')
    item.innerHTML = `<strong>${CATALOG[gameId].name}</strong>${extraLabel} — ${winner === 'TIE' ? 'pareggio' : `vince ${winner}`}`
    renderScore(winsA, winsB)

    verdict = decideNext(winsA, winsB, gameIndex, PLANNED_GAMES, MAX_EXTRA_GAMES)
    if (verdict.done) break
    setStatus(verdict.extra
      ? `Parità ${winsA}–${winsB}: si va allo spareggio!`
      : `Risultato: ${winsA}–${winsB}. Prossima partita tra poco…`)
    await sleep(BETWEEN_GAMES_MS)
  }

  await sleep(1000)
  arenaFrame.innerHTML = ''
  if (verdict.winner === 'TIE') {
    setStatus(`Torneo finito in parità ${winsA}–${winsB}: due bot degni l'uno dell'altro.`)
  } else {
    setStatus(`🏆 Lo sfidante ${verdict.winner} vince il torneo ${Math.max(winsA, winsB)}–${Math.min(winsA, winsB)}!`)
  }
  running = false
  updateControls()
}

function renderScore(winsA, winsB) {
  bigScore.textContent = `A ${winsA} : ${winsB} B`
}

function runMatch(gameId) {
  return new Promise(resolve => {
    arenaFrame.innerHTML = ''
    const iframe = document.createElement('iframe')
    iframe.src = CATALOG[gameId].path
    iframe.addEventListener('load', () => {
      const target = iframe.contentWindow
      if (typeof target.startExternalMatch !== 'function') {
        setStatus(`${CATALOG[gameId].name}: pagina non pilotabile.`, true)
        resolve('TIE')
        return
      }
      target.startExternalMatch(
        [players.P1.serial, players.P2.serial],
        winnerSlot => {
          // riprende il controllo delle seriali
          for (const id of ['P1', 'P2']) {
            if (players[id].serial) attachParentHandlers(id, players[id].serial)
          }
          resolve(winnerSlot)
        }
      )
    })
    arenaFrame.appendChild(iframe)
  })
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Avvio ────────────────────────────────────────────────────
updateControls()
