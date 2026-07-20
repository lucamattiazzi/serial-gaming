// ── Configurazione ───────────────────────────────────────────
const MOVE_TIME_LIMIT_MS = 1000 // tempo massimo per round di un RP2040, pena sconfitta
const CPU_MOVE_DELAY_MS = 250   // pausa estetica della CPU
const ROUND_PAUSE_MS = 900      // pausa tra un round e l'altro
const ROUNDS = 20               // round per partita: vince chi ne prende di più
const SERIES_GAMES = 5
const SERIES_TARGET = 3
const SERIES_PAUSE_MS = 2500

const HANDS = ['rock', 'paper', 'scissors']
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' } // chiave batte valore
const HAND_EMOJI = { rock: '✊', paper: '✋', scissors: '✌️' }

const PLAYER_TYPES = {
  HUMAN: 'human',
  PICO: 'pico',
  EMU: 'emu',
  CPU_RANDOM: 'cpu-random',
  CPU_COUNTER: 'cpu-counter',
}

function isPicoLike(type) {
  return type === PLAYER_TYPES.PICO || type === PLAYER_TYPES.EMU
}

// ── Regole (funzioni pure) ───────────────────────────────────
// ritorna 'P1' | 'P2' | null (pareggio)
function roundWinner(moveP1, moveP2) {
  if (moveP1 === moveP2) return null
  return BEATS[moveP1] === moveP2 ? 'P1' : 'P2'
}

function randomHand() {
  return HANDS[Math.floor(Math.random() * HANDS.length)]
}

// gioca il contro della mossa più frequente dell'avversario
function counterMove(oppMoves) {
  if (oppMoves.length < 3) return randomHand()
  const counts = { rock: 0, paper: 0, scissors: 0 }
  for (const move of oppMoves) counts[move]++
  const mostFrequent = HANDS.reduce((a, b) => (counts[b] > counts[a] ? b : a))
  return Object.keys(BEATS).find(hand => BEATS[hand] === mostFrequent)
}

// ── Elementi DOM ─────────────────────────────────────────────
const statusDisplay = document.getElementById('status-display')
const startButton = document.getElementById('start-button')
const timerEl = document.getElementById('timer')
const timerFill = document.getElementById('timer-fill')
const timerText = document.getElementById('timer-text')
const seriesRow = document.getElementById('series-row')
const seriesToggle = document.getElementById('series-toggle')
const seriesScore = document.getElementById('series-score')
const arena = document.getElementById('arena')
const roundLabel = document.getElementById('round-label')
const bigScore = document.getElementById('big-score')
const historyStrip = document.getElementById('history-strip')

// ── Stato di gioco ───────────────────────────────────────────
const players = {
  P1: { type: PLAYER_TYPES.HUMAN, serial: null, pendingResolve: null, humanResolve: null },
  P2: { type: PLAYER_TYPES.PICO, serial: null, pendingResolve: null, humanResolve: null },
}

let gameActive = false
let gamePlayed = false
let roundNumber = 0
let score = { P1: 0, P2: 0 }
let history = [] // [{P1: mossa, P2: mossa}]
let series = null

function playerNumber(id) {
  return id === 'P1' ? 1 : 2
}

function otherId(id) {
  return id === 'P1' ? 'P2' : 'P1'
}

// ── Setup giocatori ──────────────────────────────────────────
for (const id of ['P1', 'P2']) {
  const typeSelect = document.getElementById(`type-${id}`)
  const connectRow = document.getElementById(`conn-row-${id}`)
  const connectButton = document.getElementById(`connect-${id}`)
  const emuRow = document.getElementById(`emu-row-${id}`)
  const handRow = document.getElementById(`hand-row-${id}`)

  document.getElementById(`emu-code-${id}`).value = BOT_TEMPLATES.morra

  typeSelect.addEventListener('change', () => {
    const player = players[id]
    if (player.serial) {
      if (player.serial instanceof PicoSerial) player.serial.disconnect()
      player.serial = null
    }
    player.type = typeSelect.value
    connectRow.hidden = typeSelect.value !== PLAYER_TYPES.PICO
    emuRow.hidden = typeSelect.value !== PLAYER_TYPES.EMU
    handRow.hidden = typeSelect.value !== PLAYER_TYPES.HUMAN
    updateControls()
  })

  connectButton.addEventListener('click', () => connectPico(id))
  document.getElementById(`emu-start-${id}`).addEventListener('click', () => connectEmu(id))
}

for (const button of document.querySelectorAll('.hand')) {
  button.addEventListener('click', () => {
    const id = button.dataset.player
    const resolve = players[id].humanResolve
    if (!resolve) return
    players[id].humanResolve = null
    updateHandButtons()
    resolve(button.dataset.move)
  })
}

function updateHandButtons() {
  for (const button of document.querySelectorAll('.hand')) {
    button.disabled = players[button.dataset.player].humanResolve === null
  }
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
  serial.onmessage(line => handlePicoLine(id, line))
  serial.ondisconnect(() => {
    player.serial = null
    updateControls()
    setStatus(`Il Pico del Giocatore ${playerNumber(id)} si è disconnesso.`, true)
  })
  player.serial = serial
  setStatus(`RP2040 connesso per il Giocatore ${playerNumber(id)}.`)
  updateControls()
}

async function connectEmu(id) {
  const player = players[id]
  const button = document.getElementById(`emu-start-${id}`)
  const code = document.getElementById(`emu-code-${id}`).value
  button.disabled = true
  setStatus("Preparo l'emulatore (il primo avvio scarica Pyodide, può volerci qualche secondo)…")
  try {
    const emu = new EmulatedPico(`Emu ${id}`, code, MOVE_TIME_LIMIT_MS)
    await emu.start()
    emu.onmessage(line => handlePicoLine(id, line))
    emu.ondisconnect(() => {
      player.serial = null
      updateControls()
    })
    player.serial = emu
    setStatus(`Bot emulato pronto per il Giocatore ${playerNumber(id)}.`)
  } catch (error) {
    player.serial = null
    setStatus(`Emulatore: ${error.message}`, true)
  }
  button.disabled = false
  updateControls()
}

function handlePicoLine(id, line) {
  let parsed
  try {
    parsed = JSON.parse(line)
  } catch {
    return
  }
  if (parsed == null || parsed.move == null) return
  if (parsed.regola) showBotRule(id, parsed.regola)
  const resolve = players[id].pendingResolve
  if (resolve) {
    players[id].pendingResolve = null
    resolve(parsed.move)
  }
}

function isReady(id) {
  const player = players[id]
  return !isPicoLike(player.type) || player.serial !== null
}

function seriesAvailable() {
  return isPicoLike(players.P1.type) && isPicoLike(players.P2.type)
}

function updateControls() {
  for (const id of ['P1', 'P2']) {
    const player = players[id]
    const connected = player.serial !== null
    const connStatus = document.getElementById(`conn-${id}`)
    const connectButton = document.getElementById(`connect-${id}`)
    connStatus.textContent = connected ? 'connesso' : 'non connesso'
    connStatus.classList.toggle('connected', connected)
    connectButton.disabled = connected || gameActive
    document.getElementById(`type-${id}`).disabled = gameActive

    const emuStatus = document.getElementById(`emu-status-${id}`)
    const emuButton = document.getElementById(`emu-start-${id}`)
    emuStatus.textContent = connected ? 'pronto' : 'non avviato'
    emuStatus.classList.toggle('connected', connected)
    emuButton.disabled = gameActive || series !== null
    emuButton.textContent = connected ? 'Riavvia bot' : 'Avvia bot'
  }
  startButton.disabled = gameActive || series !== null || !isReady('P1') || !isReady('P2')
  startButton.textContent = gamePlayed ? 'Nuova partita' : 'Inizia partita'
  seriesRow.hidden = !seriesAvailable()
  updateHandButtons()
}

function setStatus(message, danger = false) {
  statusDisplay.textContent = message
  statusDisplay.classList.toggle('danger', danger)
}

// ── Arena ────────────────────────────────────────────────────
function updateArena(moveP1, moveP2, winnerId) {
  roundLabel.textContent = gameActive ? `Round ${roundNumber} di ${ROUNDS}` : '—'
  bigScore.textContent = `${score.P1} : ${score.P2}`
  for (const [id, move] of [['P1', moveP1], ['P2', moveP2]]) {
    const el = document.getElementById(`hand-${id}`)
    el.classList.remove('reveal')
    if (move === null) {
      el.textContent = '❔'
    } else {
      el.textContent = HAND_EMOJI[move]
      void el.offsetWidth // riattiva l'animazione
      el.classList.add('reveal')
    }
  }
  if (winnerId !== undefined && moveP1 !== null) {
    const chip = document.createElement('span')
    chip.classList.add('round-chip')
    if (winnerId) chip.classList.add(`win-${winnerId}`)
    chip.textContent = `${HAND_EMOJI[moveP1]}${HAND_EMOJI[moveP2]}`
    historyStrip.appendChild(chip)
  }
}

// ── Flusso di gioco ──────────────────────────────────────────
function onStartClick() {
  if (seriesAvailable() && seriesToggle.checked) {
    startSeries()
  } else {
    series = null
    seriesScore.hidden = true
    startGame()
  }
}

function startGame() {
  score = { P1: 0, P2: 0 }
  history = []
  roundNumber = 0
  gameActive = true
  gamePlayed = true
  announceMatch()
  historyStrip.innerHTML = ''
  arena.classList.remove('idle')
  updateControls()
  playRound()
}

async function playRound() {
  if (!gameActive) return
  roundNumber++
  updateArena(null, null)
  setStatus(`Round ${roundNumber}: scegliete!`)

  const somePico = isPicoLike(players.P1.type) || isPicoLike(players.P2.type)
  if (somePico) startTimerDisplay()

  let moves
  try {
    moves = await Promise.all([getMove('P1'), getMove('P2')])
  } catch (fault) {
    stopTimerDisplay()
    if (!gameActive) return
    return declareLoss(fault.id, fault.reason)
  }
  stopTimerDisplay()
  if (!gameActive) return

  const [moveP1, moveP2] = moves
  history.push({ P1: moveP1, P2: moveP2 })
  const winnerId = roundWinner(moveP1, moveP2)
  if (winnerId) score[winnerId]++
  updateArena(moveP1, moveP2, winnerId)

  if (winnerId) {
    setStatus(`Round ${roundNumber}: punto al Giocatore ${playerNumber(winnerId)}. ${score.P1}–${score.P2}`)
  } else {
    setStatus(`Round ${roundNumber}: pari. ${score.P1}–${score.P2}`)
  }

  if (roundNumber >= ROUNDS) {
    return endGame(score.P1 === score.P2 ? 'TIE' : score.P1 > score.P2 ? 'P1' : 'P2')
  }
  await sleep(ROUND_PAUSE_MS)
  playRound()
}

function getMove(id) {
  const player = players[id]

  if (player.type === PLAYER_TYPES.HUMAN) {
    return new Promise(resolve => {
      player.humanResolve = resolve
      updateHandButtons()
    })
  }

  if (player.type === PLAYER_TYPES.CPU_RANDOM || player.type === PLAYER_TYPES.CPU_COUNTER) {
    const oppMoves = history.map(round => round[otherId(id)])
    const move = player.type === PLAYER_TYPES.CPU_RANDOM ? randomHand() : counterMove(oppMoves)
    return sleep(CPU_MOVE_DELAY_MS).then(() => move)
  }

  // RP2040 (vero o emulato)
  if (player.serial === null) {
    return Promise.reject({ id, reason: 'bot disconnesso' })
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      player.pendingResolve = null
      reject({ id, reason: botFailReason(player) })
    }, MOVE_TIME_LIMIT_MS)
    player.pendingResolve = (move) => {
      clearTimeout(timeout)
      if (HANDS.includes(move)) resolve(move)
      else reject({ id, reason: `mossa non valida (${JSON.stringify(move)})` })
    }
    player.serial.sendMessage(envelope(stateFor(id)))
  })
}

function stateFor(id) {
  return {
    round: roundNumber,
    rounds: ROUNDS,
    history: history.map(round => ({ you: round[id], opp: round[otherId(id)] })),
    score: { you: score[id], opp: score[otherId(id)] },
    winner: null,
  }
}

function declareLoss(loserId, reason) {
  endGame(otherId(loserId), `Il Giocatore ${playerNumber(loserId)} perde: ${reason}.`)
}

function endGame(winnerId, lossMessage = null) {
  gameActive = false
  for (const id of ['P1', 'P2']) players[id].humanResolve = null
  stopTimerDisplay()
  notifyBots(winnerId)

  if (lossMessage) {
    setStatus(`${lossMessage} Vince il Giocatore ${playerNumber(winnerId)}!`, true)
  } else if (winnerId === 'TIE') {
    setStatus(`Pareggio: ${score.P1}–${score.P2}!`)
  } else {
    setStatus(`Vince il Giocatore ${playerNumber(winnerId)} ${score.P1}–${score.P2}!`)
  }
  if (series) handleSeriesResult(winnerId)
  updateControls()
}

function notifyBots(winnerId) {
  for (const id of ['P1', 'P2']) {
    const player = players[id]
    if (!isPicoLike(player.type) || player.serial === null) continue
    player.pendingResolve = null
    player.serial.sendMessage(envelope({
      round: null,
      rounds: ROUNDS,
      history: history.map(round => ({ you: round[id], opp: round[otherId(id)] })),
      score: { you: score[id], opp: score[otherId(id)] },
      winner: winnerId === 'TIE' ? 'TIE' : id === winnerId ? 'you' : 'opp',
    }))
  }
}

// ── Sfida al meglio di 5 ─────────────────────────────────────
function startSeries() {
  series = { score: { P1: 0, P2: 0 }, game: 0 }
  seriesScore.hidden = false
  nextSeriesGame()
}

function nextSeriesGame() {
  series.game++
  updateSeriesScoreboard()
  startGame()
  setStatus(`Partita ${series.game}: ${ROUNDS} round, si comincia.`)
}

function handleSeriesResult(winnerId) {
  if (winnerId === 'P1' || winnerId === 'P2') series.score[winnerId]++
  updateSeriesScoreboard()

  const { P1, P2 } = series.score
  const finished = P1 >= SERIES_TARGET || P2 >= SERIES_TARGET || series.game >= SERIES_GAMES
  if (!finished) {
    setStatus(`${statusDisplay.textContent} Prossima partita tra poco…`)
    setTimeout(nextSeriesGame, SERIES_PAUSE_MS)
    return
  }

  if (P1 === P2) {
    setStatus(`Sfida finita in parità: ${P1} a ${P2}!`)
  } else {
    const champion = P1 > P2 ? 1 : 2
    setStatus(`Il Giocatore ${champion} vince la sfida ${Math.max(P1, P2)} a ${Math.min(P1, P2)}!`)
  }
  series = null
}

function updateSeriesScoreboard() {
  const { P1, P2 } = series.score
  seriesScore.textContent = `Sfida al meglio di ${SERIES_GAMES} — partita ${series.game} · G1 ${P1} : ${P2} G2`
}

// ── Timer a video ────────────────────────────────────────────
let timerInterval = null

function startTimerDisplay(limitMs = MOVE_TIME_LIMIT_MS) {
  stopTimerDisplay()
  const deadline = performance.now() + limitMs
  timerEl.classList.remove('idle')
  timerEl.classList.remove('low')
  timerFill.style.width = '100%'
  timerInterval = setInterval(() => {
    const remaining = Math.max(0, deadline - performance.now())
    timerFill.style.width = `${(remaining / limitMs) * 100}%`
    timerText.textContent = `${(remaining / 1000).toFixed(1)}s`
    timerEl.classList.toggle('low', remaining < limitMs * 0.3)
  }, 100)
}

function stopTimerDisplay() {
  clearInterval(timerInterval)
  timerInterval = null
  // il timer resta visibile ma spento: la pagina non balla
  timerEl.classList.add('idle')
  timerEl.classList.remove('low')
  timerFill.style.width = '0%'
  timerText.textContent = ''
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Avvio ────────────────────────────────────────────────────
startButton.addEventListener('click', onStartClick)
document.getElementById('hand-row-P2').hidden = true
arena.classList.add('idle')
updateControls()

// ── Busta di protocollo e integrazione torneo ────────────────
// Ogni messaggio porta la busta {game, match}; a inizio partita i bot
// ricevono un annuncio con la sola busta e i campi di gioco a null.
const GAME_ID = 'morra'
const PLAYER_ORDER = ['P1', 'P2']
let matchId = null
let externalOnEnd = null

function envelope(payload) {
  return JSON.stringify({ game: GAME_ID, match: matchId, ...payload })
}

function newMatchId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `m-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function announceMatch() {
  clearBotRules()
  matchId = newMatchId()
  for (const id of PLAYER_ORDER) {
    const player = players[id]
    if (!isPicoLike(player.type) || player.serial === null) continue
    player.serial.sendMessage(envelope({ round: null, rounds: ROUNDS, history: null, score: null, winner: null }))
  }
}

const baseEndGame = endGame
endGame = function (...args) {
  baseEndGame(...args)
  if (externalOnEnd) {
    const onEnd = externalOnEnd
    externalOnEnd = null
    onEnd(args[0])
  }
}

// La pagina può essere pilotata da un contenitore (modalità torneo):
// riceve le seriali già connesse e gioca una singola partita.
globalThis.startExternalMatch = function (serials, onEnd) {
  externalOnEnd = onEnd
  document.body.classList.add('external-match')
  PLAYER_ORDER.forEach((id, i) => {
    // uno slot può essere una CPU integrata: si passa il suo tipo come stringa
    if (typeof serials[i] === 'string') {
      players[id].type = serials[i]
      players[id].serial = null
      return
    }
    players[id].type = PLAYER_TYPES.PICO
    players[id].serial = serials[i]
    serials[i].onmessage(line => handlePicoLine(id, line))
    serials[i].ondisconnect(() => { players[id].serial = null })
  })
  startGame()
}
