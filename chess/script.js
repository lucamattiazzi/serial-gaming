// ── Configurazione ───────────────────────────────────────────
const MOVE_TIME_LIMIT_MS = 5000 // tempo massimo per mossa di un RP2040, pena sconfitta
const CPU_MOVE_DELAY_MS = 400   // pausa estetica prima della mossa della CPU
const SERIES_GAMES = 5          // partite della sfida tra due RP2040
const SERIES_TARGET = 3         // vittorie che chiudono la sfida in anticipo
const SERIES_PAUSE_MS = 2500    // pausa tra una partita e l'altra della sfida

const PLAYER_TYPES = {
  HUMAN: 'human',
  PICO: 'pico',
  EMU: 'emu',
  CPU_RANDOM: 'cpu-random',
  CPU_GREEDY: 'cpu-greedy',
}

// vero RP2040 o emulato: stesso protocollo, stesso limite di tempo
function isPicoLike(type) {
  return type === PLAYER_TYPES.PICO || type === PLAYER_TYPES.EMU
}

const PIECE_GLYPHS = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
const FILES = 'abcdefgh'

// ── Elementi DOM ─────────────────────────────────────────────
const statusDisplay = document.getElementById('status-display')
const gameBoard = document.getElementById('game-board')
const startButton = document.getElementById('start-button')
const timerEl = document.getElementById('timer')
const timerFill = document.getElementById('timer-fill')
const timerText = document.getElementById('timer-text')
const seriesRow = document.getElementById('series-row')
const seriesToggle = document.getElementById('series-toggle')
const seriesScore = document.getElementById('series-score')

// ── Stato di gioco ───────────────────────────────────────────
const game = new Chess()
const players = {
  P1: { type: PLAYER_TYPES.HUMAN, serial: null, pendingResolve: null },
  P2: { type: PLAYER_TYPES.PICO, serial: null, pendingResolve: null },
}
let colorOf = { w: 'P1', b: 'P2' } // assegnazione dei colori per la partita corrente

let gameActive = false
let gamePlayed = false
let waitingHuman = false
let lastMoveUci = null
let selectedSquare = null
let legalTargets = new Map() // to-square -> verbose move
let timerInterval = null
let series = null // { score: {P1, P2}, game: n } durante una sfida al meglio di 5
const squares = {} // nome casella -> elemento DOM

// ── Setup giocatori ──────────────────────────────────────────
for (const id of ['P1', 'P2']) {
  const typeSelect = document.getElementById(`type-${id}`)
  const connectRow = document.getElementById(`conn-row-${id}`)
  const connectButton = document.getElementById(`connect-${id}`)
  const emuRow = document.getElementById(`emu-row-${id}`)

  document.getElementById(`emu-code-${id}`).value = BOT_TEMPLATES.chess

  typeSelect.addEventListener('change', () => {
    const player = players[id]
    if (player.serial) {
      if (player.serial instanceof PicoSerial) player.serial.disconnect()
      player.serial = null
    }
    player.type = typeSelect.value
    connectRow.hidden = typeSelect.value !== PLAYER_TYPES.PICO
    emuRow.hidden = typeSelect.value !== PLAYER_TYPES.EMU
    updateControls()
  })

  connectButton.addEventListener('click', () => connectPico(id))
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
  serial.onmessage(line => handlePicoLine(id, line))
  serial.ondisconnect(() => {
    player.serial = null
    updateControls()
    setStatus(`Il Pico del Giocatore ${id === 'P1' ? 1 : 2} si è disconnesso.`, true)
  })
  player.serial = serial
  setStatus(`RP2040 connesso per il Giocatore ${id === 'P1' ? 1 : 2}.`)
  updateControls()
}

function handlePicoLine(id, line) {
  let parsed
  try {
    parsed = JSON.parse(line)
  } catch {
    return // output di debug del Pico, già loggato in console da PicoSerial
  }
  if (parsed == null || parsed.move == null) return
  const resolve = players[id].pendingResolve
  if (resolve) {
    players[id].pendingResolve = null
    resolve(parsed.move)
  }
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
    setStatus(`Bot emulato pronto per il Giocatore ${id === 'P1' ? 1 : 2}.`)
  } catch (error) {
    player.serial = null
    setStatus(`Emulatore: ${error.message}`, true)
  }
  button.disabled = false
  updateControls()
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
}

// ── Etichette ────────────────────────────────────────────────
function colorName(color) {
  return color === 'w' ? 'Bianco' : 'Nero'
}

function playerLabel(color) {
  const id = colorOf[color]
  return `${colorName(color)} (Giocatore ${id === 'P1' ? 1 : 2})`
}

function playerFor(color) {
  return players[colorOf[color]]
}

function updateColorBadges() {
  for (const color of ['w', 'b']) {
    const badge = document.getElementById(`badge-${colorOf[color]}`)
    badge.textContent = colorName(color)
    badge.classList.toggle('black', color === 'b')
  }
}

// ── Scacchiera ───────────────────────────────────────────────
function buildBoard() {
  gameBoard.innerHTML = ''
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const name = FILES[col] + (8 - row)
      const el = document.createElement('div')
      el.classList.add('square', (row + col) % 2 === 0 ? 'light' : 'dark')
      el.dataset.square = name
      if (col === 0) el.dataset.rankLabel = String(8 - row)
      if (row === 7) el.dataset.fileLabel = FILES[col]
      el.addEventListener('click', () => onSquareClick(name))
      gameBoard.appendChild(el)
      squares[name] = el
    }
  }
}

function renderBoard() {
  const grid = game.board() // riga 0 = ottava traversa
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const name = FILES[col] + (8 - row)
      const el = squares[name]
      const piece = grid[row][col]
      el.textContent = piece ? PIECE_GLYPHS[piece.type] : ''
      el.classList.remove('piece-w', 'piece-b', 'selected', 'target', 'capture', 'last-move', 'own-piece')
      if (piece) {
        el.classList.add(`piece-${piece.color}`)
        if (gameActive && piece.color === game.turn()) el.classList.add('own-piece')
      }
    }
  }
  if (lastMoveUci) {
    squares[lastMoveUci.slice(0, 2)].classList.add('last-move')
    squares[lastMoveUci.slice(2, 4)].classList.add('last-move')
  }
}

function setStatus(message, danger = false) {
  statusDisplay.textContent = message
  statusDisplay.classList.toggle('danger', danger)
}

function highlightTurn(color) {
  for (const id of ['P1', 'P2']) {
    document.getElementById(`card-${id}`).classList.toggle(
      'active-turn',
      gameActive && color !== null && colorOf[color] === id
    )
  }
}

// ── Interazione umana ────────────────────────────────────────
function onSquareClick(name) {
  if (!gameActive || !waitingHuman) return

  if (selectedSquare && legalTargets.has(name)) {
    const move = legalTargets.get(name)
    waitingHuman = false
    clearSelection()
    // promozione automatica a donna
    commitMove(game.move({ from: move.from, to: move.to, promotion: 'q' }))
    return
  }

  const piece = game.get(name)
  if (piece && piece.color === game.turn()) {
    selectSquare(name)
  } else {
    clearSelection()
  }
}

function selectSquare(name) {
  clearSelection()
  selectedSquare = name
  squares[name].classList.add('selected')
  for (const move of game.moves({ square: name, verbose: true })) {
    legalTargets.set(move.to, move)
    squares[move.to].classList.add('target')
    if (move.captured) squares[move.to].classList.add('capture')
  }
}

function clearSelection() {
  if (selectedSquare) squares[selectedSquare].classList.remove('selected')
  for (const to of legalTargets.keys()) {
    squares[to].classList.remove('target', 'capture')
  }
  selectedSquare = null
  legalTargets = new Map()
}

// ── Flusso di gioco ──────────────────────────────────────────
function onStartClick() {
  if (seriesAvailable() && seriesToggle.checked) {
    startSeries()
  } else {
    series = null
    seriesScore.hidden = true
    startGame({ w: 'P1', b: 'P2' })
  }
}

function startGame(colors) {
  colorOf = colors
  game.reset()
  lastMoveUci = null
  waitingHuman = false
  selectedSquare = null
  legalTargets = new Map()
  gameActive = true
  gamePlayed = true
  announceMatch()
  updateColorBadges()
  renderBoard()
  gameBoard.classList.remove('idle')
  updateControls()
  nextTurn()
}

async function nextTurn() {
  if (!gameActive) return
  const color = game.turn()
  const player = playerFor(color)
  highlightTurn(color)
  gameBoard.classList.toggle('human-turn', player.type === PLAYER_TYPES.HUMAN)

  const checkNote = game.in_check() ? ' Scacco!' : ''

  if (player.type === PLAYER_TYPES.HUMAN) {
    waitingHuman = true
    setStatus(`Tocca al ${playerLabel(color)}.${checkNote}`)
    renderBoard() // aggiorna i pezzi selezionabili
    return
  }

  if (player.type === PLAYER_TYPES.CPU_RANDOM || player.type === PLAYER_TYPES.CPU_GREEDY) {
    setStatus(`La CPU (${colorName(color)}) sta pensando…${checkNote}`)
    await sleep(CPU_MOVE_DELAY_MS)
    if (!gameActive) return
    const move = player.type === PLAYER_TYPES.CPU_RANDOM ? randomMove() : greedyMove()
    commitMove(game.move(move))
    return
  }

  // RP2040 (vero o emulato): mossa con limite di tempo
  const engineName = player.type === PLAYER_TYPES.EMU ? 'bot emulato' : 'RP2040'
  setStatus(`Il ${engineName} del ${playerLabel(color)} sta pensando…${checkNote}`)
  if (player.serial === null) {
    return declareLoss(color, `${engineName} disconnesso`)
  }
  startTimerDisplay()
  try {
    const rawMove = await requestPicoMove(player)
    stopTimerDisplay()
    if (!gameActive) return
    const move = parseUciMove(rawMove)
    const result = move ? game.move(move) : null
    if (result === null) {
      return declareLoss(color, `mossa illegale (${JSON.stringify(rawMove)})`)
    }
    commitMove(result)
  } catch {
    stopTimerDisplay()
    if (!gameActive) return
    declareLoss(color, 'tempo scaduto')
  }
}

function requestPicoMove(player) {
  const gameState = {
    fen: game.fen(),
    lastMove: lastMoveUci,
    winner: null,
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      player.pendingResolve = null
      reject(new Error('timeout'))
    }, MOVE_TIME_LIMIT_MS)
    player.pendingResolve = (move) => {
      clearTimeout(timeout)
      resolve(move)
    }
    player.serial.sendMessage(envelope(gameState))
  })
}

function parseUciMove(raw) {
  if (typeof raw !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(raw)) return null
  return { from: raw.slice(0, 2), to: raw.slice(2, 4), promotion: raw[4] }
}

// `moveResult` è la mossa già eseguita da chess.js (mai null qui)
function commitMove(moveResult) {
  lastMoveUci = moveResult.from + moveResult.to + (moveResult.promotion || '')
  renderBoard()

  if (game.game_over()) return endGame(finishedResult())

  nextTurn()
}

function finishedResult() {
  if (game.in_checkmate()) {
    const winner = game.turn() === 'w' ? 'b' : 'w'
    return { winner, reason: 'scacco matto' }
  }
  if (game.in_stalemate()) return { winner: 'TIE', reason: 'stallo' }
  if (game.in_threefold_repetition()) return { winner: 'TIE', reason: 'ripetizione' }
  if (game.insufficient_material()) return { winner: 'TIE', reason: 'materiale insufficiente' }
  return { winner: 'TIE', reason: 'regola delle 50 mosse' }
}

function declareLoss(loserColor, reason) {
  const winner = loserColor === 'w' ? 'b' : 'w'
  endGame({ winner, reason: null }, `Il ${playerLabel(loserColor)} perde: ${reason}.`)
}

function endGame(result, lossMessage = null) {
  gameActive = false
  waitingHuman = false
  stopTimerDisplay()
  clearSelection()
  gameBoard.classList.remove('human-turn')
  highlightTurn(null)
  renderBoard()

  notifyPicos(result.winner)

  if (lossMessage) {
    setStatus(`${lossMessage} Vince il ${playerLabel(result.winner)}!`, true)
  } else if (result.winner === 'TIE') {
    setStatus(`Patta: ${result.reason}.`)
  } else {
    setStatus(`Scacco matto! Vince il ${playerLabel(result.winner)}.`)
  }
  if (series) handleSeriesResult(result.winner)
  updateControls()
}

// Notifica il risultato ai Pico connessi, veri o emulati (winner: "w", "b" o "TIE")
function notifyPicos(winner) {
  for (const id of ['P1', 'P2']) {
    const player = players[id]
    if (!isPicoLike(player.type) || player.serial === null) continue
    player.pendingResolve = null
    player.serial.sendMessage(envelope({
      fen: null,
      lastMove: null,
      winner,
    }))
  }
}

// ── Sfida al meglio di 5 (solo RP2040 vs RP2040) ─────────────
function startSeries() {
  series = { score: { P1: 0, P2: 0 }, game: 0 }
  seriesScore.hidden = false
  nextSeriesGame()
}

function nextSeriesGame() {
  series.game++
  updateSeriesScoreboard()
  const colors = Math.random() < 0.5 ? { w: 'P1', b: 'P2' } : { w: 'P2', b: 'P1' }
  startGame(colors)
  setStatus(`Partita ${series.game}: il Giocatore ${colors.w === 'P1' ? 1 : 2} ha il Bianco.`)
}

function handleSeriesResult(winner) {
  if (winner === 'w' || winner === 'b') series.score[colorOf[winner]]++
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
function startTimerDisplay() {
  const deadline = performance.now() + MOVE_TIME_LIMIT_MS
  timerEl.hidden = false
  timerEl.classList.remove('low')
  timerFill.style.width = '100%'
  timerInterval = setInterval(() => {
    const remaining = Math.max(0, deadline - performance.now())
    timerFill.style.width = `${(remaining / MOVE_TIME_LIMIT_MS) * 100}%`
    timerText.textContent = `${(remaining / 1000).toFixed(1)}s`
    timerEl.classList.toggle('low', remaining < MOVE_TIME_LIMIT_MS * 0.3)
  }, 100)
}

function stopTimerDisplay() {
  clearInterval(timerInterval)
  timerInterval = null
  timerEl.hidden = true
}

// ── CPU integrata ────────────────────────────────────────────
function randomMove() {
  const moves = game.moves({ verbose: true })
  return moves[Math.floor(Math.random() * moves.length)]
}

// Sceglie la cattura di maggior valore (o il matto immediato), altrimenti a caso
function greedyMove() {
  const moves = game.moves({ verbose: true })
  let best = []
  let bestScore = -Infinity
  for (const move of moves) {
    let score = move.captured ? PIECE_VALUES[move.captured] : 0
    if (move.promotion) score += PIECE_VALUES[move.promotion] - PIECE_VALUES.p
    game.move(move)
    if (game.in_checkmate()) score += 1000
    game.undo()
    if (score > bestScore) {
      bestScore = score
      best = [move]
    } else if (score === bestScore) {
      best.push(move)
    }
  }
  return best[Math.floor(Math.random() * best.length)]
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Avvio ────────────────────────────────────────────────────
startButton.addEventListener('click', onStartClick)
buildBoard()
renderBoard()
updateControls()

// ── Busta di protocollo e integrazione torneo ────────────────
// Ogni messaggio porta la busta {game, match}; a inizio partita i bot
// ricevono un annuncio con la sola busta e i campi di gioco a null.
const GAME_ID = 'chess'
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
  matchId = newMatchId()
  for (const id of PLAYER_ORDER) {
    const player = players[id]
    if (!isPicoLike(player.type) || player.serial === null) continue
    player.serial.sendMessage(envelope({ fen: null, lastMove: null, winner: null }))
  }
}

const baseEndGame = endGame
endGame = function (...args) {
  baseEndGame(...args)
  if (externalOnEnd) {
    const onEnd = externalOnEnd
    externalOnEnd = null
    onEnd(args[0].winner === 'TIE' ? 'TIE' : colorOf[args[0].winner])
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
  startGame(Math.random() < 0.5 ? { w: 'P1', b: 'P2' } : { w: 'P2', b: 'P1' })
}
