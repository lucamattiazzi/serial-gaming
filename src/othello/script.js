// ── Configurazione ───────────────────────────────────────────
const MOVE_TIME_LIMIT_MS = 2000 // tempo massimo per mossa di un RP2040, pena sconfitta
const HUMAN_TIME_LIMIT_MS = 20000 // tempo massimo per mossa di un umano
const CPU_MOVE_DELAY_MS = 400   // pausa estetica prima della mossa della CPU
const SERIES_GAMES = 5          // partite della sfida tra due RP2040
const SERIES_TARGET = 3         // vittorie che chiudono la sfida in anticipo
const SERIES_PAUSE_MS = 2000    // pausa tra una partita e l'altra della sfida

const PLAYER_TYPES = {
  HUMAN: 'human',
  PICO: 'pico',
  EMU: 'emu',
  CPU_RANDOM: 'cpu-random',
  CPU_SMART: 'cpu-smart',
}

// vero RP2040 o emulato: stesso protocollo, stesso limite di tempo
function isPicoLike(type) {
  return type === PLAYER_TYPES.PICO || type === PLAYER_TYPES.EMU
}

const SIZE = 8
const DIRECTIONS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
]

// ── Elementi DOM ─────────────────────────────────────────────
const statusDisplay = document.getElementById('status-display')
const gameBoard = document.getElementById('game-board')
const startButton = document.getElementById('start-button')
const seriesRow = document.getElementById('series-row')
const seriesToggle = document.getElementById('series-toggle')
const seriesScore = document.getElementById('series-score')
const discScore = document.getElementById('disc-score')
const timerEl = document.getElementById('timer')
const timerFill = document.getElementById('timer-fill')
const timerText = document.getElementById('timer-text')

// ── Stato di gioco ───────────────────────────────────────────
// B = Nero (muove sempre per primo, come da regole), W = Bianco
const players = {
  B: { type: PLAYER_TYPES.HUMAN, serial: null, pendingResolve: null },
  W: { type: PLAYER_TYPES.PICO, serial: null, pendingResolve: null },
}

const board = Array(SIZE * SIZE).fill('')
let gameActive = false
let gamePlayed = false
let currentSymbol = 'B'
let lastMoveIndex = null
let waitingHuman = false
let timerInterval = null
let humanTimeout = null
let series = null // { score: {B, W}, game: n } durante una sfida al meglio di 5
const cells = []

function playerName(symbol) {
  return symbol === 'B' ? 'il Nero' : 'il Bianco'
}

// ── Setup giocatori ──────────────────────────────────────────
for (const symbol of ['B', 'W']) {
  const typeSelect = document.getElementById(`type-${symbol}`)
  const connectRow = document.getElementById(`conn-row-${symbol}`)
  const connectButton = document.getElementById(`connect-${symbol}`)
  const emuRow = document.getElementById(`emu-row-${symbol}`)

  document.getElementById(`emu-code-${symbol}`).value = BOT_TEMPLATES.othello

  typeSelect.addEventListener('change', () => {
    const player = players[symbol]
    if (player.serial) {
      if (player.serial instanceof PicoSerial) player.serial.disconnect()
      player.serial = null
    }
    player.type = typeSelect.value
    connectRow.hidden = typeSelect.value !== PLAYER_TYPES.PICO
    emuRow.hidden = typeSelect.value !== PLAYER_TYPES.EMU
    updateControls()
  })

  connectButton.addEventListener('click', () => connectPico(symbol))
  document.getElementById(`emu-start-${symbol}`).addEventListener('click', () => connectEmu(symbol))
}

async function connectPico(symbol) {
  const player = players[symbol]
  const serial = new PicoSerial(`Pico ${symbol}`)
  try {
    await serial.connect()
  } catch (error) {
    setStatus(`Connessione fallita: ${error.message}`, true)
    return
  }
  serial.onmessage(line => handlePicoLine(symbol, line))
  serial.ondisconnect(() => {
    player.serial = null
    updateControls()
    setStatus(`Il Pico del ${symbol === 'B' ? 'Nero' : 'Bianco'} si è disconnesso.`, true)
  })
  player.serial = serial
  setStatus(`RP2040 connesso per ${playerName(symbol)}.`)
  updateControls()
}

function handlePicoLine(symbol, line) {
  let parsed
  try {
    parsed = JSON.parse(line)
  } catch {
    return // output di debug del Pico, già loggato in console da PicoSerial
  }
  if (parsed == null || parsed.move == null) return
  const resolve = players[symbol].pendingResolve
  if (resolve) {
    players[symbol].pendingResolve = null
    resolve(parsed.move)
  }
}

async function connectEmu(symbol) {
  const player = players[symbol]
  const button = document.getElementById(`emu-start-${symbol}`)
  const code = document.getElementById(`emu-code-${symbol}`).value
  button.disabled = true
  setStatus("Preparo l'emulatore (il primo avvio scarica Pyodide, può volerci qualche secondo)…")
  try {
    const emu = new EmulatedPico(`Emu ${symbol}`, code, MOVE_TIME_LIMIT_MS)
    await emu.start()
    emu.onmessage(line => handlePicoLine(symbol, line))
    emu.ondisconnect(() => {
      player.serial = null
      updateControls()
    })
    player.serial = emu
    setStatus(`Bot emulato pronto per ${playerName(symbol)}.`)
  } catch (error) {
    player.serial = null
    setStatus(`Emulatore: ${error.message}`, true)
  }
  button.disabled = false
  updateControls()
}

function isReady(symbol) {
  const player = players[symbol]
  return !isPicoLike(player.type) || player.serial !== null
}

function updateControls() {
  for (const symbol of ['B', 'W']) {
    const player = players[symbol]
    const connected = player.serial !== null
    const connStatus = document.getElementById(`conn-${symbol}`)
    const connectButton = document.getElementById(`connect-${symbol}`)
    connStatus.textContent = connected ? 'connesso' : 'non connesso'
    connStatus.classList.toggle('connected', connected)
    connectButton.disabled = connected || gameActive
    document.getElementById(`type-${symbol}`).disabled = gameActive

    const emuStatus = document.getElementById(`emu-status-${symbol}`)
    const emuButton = document.getElementById(`emu-start-${symbol}`)
    emuStatus.textContent = connected ? 'pronto' : 'non avviato'
    emuStatus.classList.toggle('connected', connected)
    emuButton.disabled = gameActive || series !== null
    emuButton.textContent = connected ? 'Riavvia bot' : 'Avvia bot'
  }
  startButton.disabled = gameActive || series !== null || !isReady('B') || !isReady('W')
  startButton.textContent = gamePlayed ? 'Nuova partita' : 'Inizia partita'
  seriesRow.hidden = !seriesAvailable()
}

function seriesAvailable() {
  return isPicoLike(players.B.type) && isPicoLike(players.W.type)
}

// ── Scacchiera ───────────────────────────────────────────────
function buildBoard() {
  gameBoard.innerHTML = ''
  cells.length = 0
  for (let i = 0; i < SIZE * SIZE; i++) {
    const cell = document.createElement('div')
    cell.classList.add('cell')
    cell.dataset.index = i
    cell.addEventListener('click', () => handleCellClick(i))
    gameBoard.appendChild(cell)
    cells.push(cell)
  }
}

function renderBoard(placedIndex = null, flipped = []) {
  const flippedSet = new Set(flipped)
  for (let i = 0; i < SIZE * SIZE; i++) {
    const cell = cells[i]
    cell.classList.remove('hint', 'last')
    cell.innerHTML = ''
    if (board[i] !== '') {
      const disc = document.createElement('span')
      disc.classList.add('disc', board[i] === 'B' ? 'disc-b' : 'disc-w')
      if (i === placedIndex) disc.classList.add('pop')
      if (flippedSet.has(i)) disc.classList.add('flip')
      cell.appendChild(disc)
    }
    if (i === lastMoveIndex) cell.classList.add('last')
  }
  updateDiscScore()
}

function showHints() {
  for (const i of legalMoves(board, currentSymbol)) cells[i].classList.add('hint')
}

function updateDiscScore() {
  const { B, W } = countDiscs(board)
  discScore.textContent = `⚫ ${B} — ${W} ⚪`
}

function setStatus(message, danger = false) {
  statusDisplay.textContent = message
  statusDisplay.classList.toggle('danger', danger)
}

function highlightTurn(symbol) {
  for (const s of ['B', 'W']) {
    document.getElementById(`card-${s}`).classList.toggle('active-turn', gameActive && s === symbol)
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
  board.fill('')
  // posizione iniziale standard: due dischi per colore al centro
  board[27] = 'W'
  board[28] = 'B'
  board[35] = 'B'
  board[36] = 'W'
  currentSymbol = 'B' // il Nero muove sempre per primo
  lastMoveIndex = null
  waitingHuman = false
  gameActive = true
  gamePlayed = true
  clearHumanTimer()
  announceMatch()
  renderBoard()
  gameBoard.classList.remove('idle')
  updateControls()
  nextTurn()
}

async function nextTurn() {
  if (!gameActive) return
  const player = players[currentSymbol]
  highlightTurn(currentSymbol)
  gameBoard.classList.toggle('human-turn', player.type === PLAYER_TYPES.HUMAN)

  if (player.type === PLAYER_TYPES.HUMAN) {
    waitingHuman = true
    showHints()
    setStatus(`Tocca a te (${playerName(currentSymbol)}): scegli una casella evidenziata.`)
    startHumanTimer()
    return
  }

  if (player.type === PLAYER_TYPES.CPU_RANDOM || player.type === PLAYER_TYPES.CPU_SMART) {
    setStatus(`La CPU (${playerName(currentSymbol)}) sta pensando…`)
    await sleep(CPU_MOVE_DELAY_MS)
    if (!gameActive) return
    const move = player.type === PLAYER_TYPES.CPU_RANDOM
      ? randomMove(board, currentSymbol)
      : smartMove(board, currentSymbol)
    applyMove(move)
    return
  }

  // RP2040 (vero o emulato): mossa con limite di tempo
  const engineName = player.type === PLAYER_TYPES.EMU ? 'bot emulato' : 'RP2040'
  setStatus(`Il ${engineName} (${playerName(currentSymbol)}) sta pensando…`)
  if (player.serial === null) {
    return declareLoss(currentSymbol, `${engineName} disconnesso`)
  }
  startTimerDisplay()
  try {
    const move = await requestPicoMove(player)
    stopTimerDisplay()
    if (!gameActive) return
    if (!isValidMove(move)) {
      return declareLoss(currentSymbol, `mossa non valida (${JSON.stringify(move)})`)
    }
    applyMove(move)
  } catch {
    stopTimerDisplay()
    if (!gameActive) return
    declareLoss(currentSymbol, 'tempo scaduto')
  }
}

function requestPicoMove(player) {
  const gameState = {
    board: remapBoardFor(currentSymbol),
    moves: legalMoves(board, currentSymbol),
    lastMove: lastMoveIndex,
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

function handleCellClick(index) {
  if (!gameActive || !waitingHuman) return
  if (flipsFor(board, index, currentSymbol).length === 0) return
  waitingHuman = false
  clearHumanTimer()
  stopTimerDisplay()
  applyMove(index)
}

function isValidMove(move) {
  return Number.isInteger(move) && flipsFor(board, move, currentSymbol).length > 0
}

function applyMove(index) {
  const flips = flipsFor(board, index, currentSymbol)
  board[index] = currentSymbol
  for (const i of flips) board[i] = currentSymbol
  lastMoveIndex = index
  renderBoard(index, flips)

  const opponent = other(currentSymbol)
  if (legalMoves(board, opponent).length > 0) {
    currentSymbol = opponent
    nextTurn()
    return
  }
  if (legalMoves(board, currentSymbol).length > 0) {
    // l'avversario non ha mosse: salta il turno, si continua
    setStatus(`${playerName(opponent)} non ha mosse: salta il turno.`)
    nextTurn()
    return
  }
  endGame(computeResult())
}

function declareLoss(loserSymbol, reason) {
  const winner = other(loserSymbol)
  endGame({ winner, counts: countDiscs(board) }, `${playerName(loserSymbol)} perde: ${reason}.`)
}

function endGame(result, reasonMessage = null) {
  gameActive = false
  waitingHuman = false
  clearHumanTimer()
  stopTimerDisplay()
  gameBoard.classList.remove('human-turn')
  highlightTurn(null)
  renderBoard()

  notifyPicos(result.winner)

  const score = `${result.counts.B} a ${result.counts.W}`
  if (reasonMessage) {
    setStatus(`${reasonMessage} Vince ${playerName(result.winner)}!`, true)
  } else if (result.winner === 'TIE') {
    setStatus(`Pareggio, ${score}!`)
  } else {
    setStatus(`Vince ${playerName(result.winner)} ${result.winner === 'B' ? score : `${result.counts.W} a ${result.counts.B}`}!`)
  }
  if (series) handleSeriesResult(result.winner)
  updateControls()
}

// ── Sfida al meglio di 5 (solo RP2040 vs RP2040) ─────────────
function startSeries() {
  series = { score: { B: 0, W: 0 }, game: 0 }
  seriesScore.hidden = false
  nextSeriesGame()
}

function nextSeriesGame() {
  series.game++
  updateSeriesScoreboard()
  startGame()
  setStatus(`Partita ${series.game}: comincia il Nero.`)
}

function handleSeriesResult(winner) {
  if (winner === 'B' || winner === 'W') series.score[winner]++
  updateSeriesScoreboard()

  const { B, W } = series.score
  const finished = B >= SERIES_TARGET || W >= SERIES_TARGET || series.game >= SERIES_GAMES
  if (!finished) {
    setStatus(`${statusDisplay.textContent} Prossima partita tra poco…`)
    setTimeout(nextSeriesGame, SERIES_PAUSE_MS)
    return
  }

  if (B === W) {
    setStatus(`Sfida finita in parità: ${B} a ${W}!`)
  } else {
    const champion = B > W ? 'B' : 'W'
    setStatus(`${playerName(champion)} vince la sfida ${Math.max(B, W)} a ${Math.min(B, W)}!`)
  }
  series = null
}

function updateSeriesScoreboard() {
  const { B, W } = series.score
  seriesScore.textContent = `Sfida al meglio di ${SERIES_GAMES} — partita ${series.game} · ⚫ ${B} : ${W} ⚪`
}

// Notifica il risultato ai Pico connessi, veri o emulati (serve ai bot che imparano)
function notifyPicos(winner) {
  for (const symbol of ['B', 'W']) {
    const player = players[symbol]
    if (!isPicoLike(player.type) || player.serial === null) continue
    player.pendingResolve = null
    player.serial.sendMessage(envelope({
      board: null,
      moves: null,
      lastMove: null,
      winner: remapWinnerFor(symbol, winner),
    }))
  }
}

// ── Rimappatura simboli ──────────────────────────────────────
// Ogni Pico si vede sempre come "O" e l'avversario come "X",
// così lo stesso codice MicroPython funziona in entrambi i ruoli.
function remapBoardFor(symbol) {
  return board.map(c => (c === '' ? '' : c === symbol ? 'O' : 'X'))
}

function remapWinnerFor(symbol, winner) {
  if (winner === 'TIE') return winner
  return winner === symbol ? 'O' : 'X'
}

// ── Timer a video ────────────────────────────────────────────
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

// Anche gli umani hanno un tempo massimo: timer a video e sconfitta a
// tavolino se scade. I bot restano su MOVE_TIME_LIMIT_MS.
function startHumanTimer() {
  startTimerDisplay(HUMAN_TIME_LIMIT_MS)
  humanTimeout = setTimeout(() => {
    if (!gameActive || !waitingHuman) return
    waitingHuman = false
    declareLoss(currentSymbol, 'tempo scaduto')
  }, HUMAN_TIME_LIMIT_MS)
}

function clearHumanTimer() {
  clearTimeout(humanTimeout)
  humanTimeout = null
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

// ── Regole di Othello ────────────────────────────────────────
function flipsFor(b, index, symbol) {
  if (!Number.isInteger(index) || index < 0 || index >= SIZE * SIZE || b[index] !== '') return []
  const opponent = other(symbol)
  const row = Math.floor(index / SIZE)
  const col = index % SIZE
  const flips = []
  for (const [dr, dc] of DIRECTIONS) {
    let r = row + dr
    let c = col + dc
    const line = []
    while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && b[r * SIZE + c] === opponent) {
      line.push(r * SIZE + c)
      r += dr
      c += dc
    }
    if (line.length > 0 && r >= 0 && r < SIZE && c >= 0 && c < SIZE && b[r * SIZE + c] === symbol) {
      flips.push(...line)
    }
  }
  return flips
}

function legalMoves(b, symbol) {
  const moves = []
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (flipsFor(b, i, symbol).length > 0) moves.push(i)
  }
  return moves
}

function countDiscs(b) {
  const counts = { B: 0, W: 0 }
  for (const cell of b) {
    if (cell === 'B') counts.B++
    if (cell === 'W') counts.W++
  }
  return counts
}

function computeResult() {
  const counts = countDiscs(board)
  const winner = counts.B > counts.W ? 'B' : counts.W > counts.B ? 'W' : 'TIE'
  return { winner, counts }
}

// ── CPU integrata ────────────────────────────────────────────
function randomMove(b, symbol) {
  const moves = legalMoves(b, symbol)
  return moves[Math.floor(Math.random() * moves.length)]
}

// pesi posizionali classici: angoli d'oro, caselle accanto agli angoli velenose
const CELL_WEIGHTS = (() => {
  const quarter = [
    [100, -25, 12, 6],
    [-25, -45, 1, 1],
    [12, 1, 3, 2],
    [6, 1, 2, 1],
  ]
  const w = []
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const qr = r < 4 ? r : 7 - r
      const qc = c < 4 ? c : 7 - c
      w.push(quarter[qr][qc])
    }
  }
  return w
})()

function smartMove(b, symbol) {
  const moves = legalMoves(b, symbol)
  let bestScore = -Infinity
  let best = []
  for (const move of moves) {
    // posizione prima di tutto, numero di catture come spareggio leggero
    const score = CELL_WEIGHTS[move] * 10 + flipsFor(b, move, symbol).length
    if (score > bestScore) {
      bestScore = score
      best = [move]
    } else if (score === bestScore) {
      best.push(move)
    }
  }
  return best[Math.floor(Math.random() * best.length)]
}

function other(symbol) {
  return symbol === 'B' ? 'W' : 'B'
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Avvio ────────────────────────────────────────────────────
startButton.addEventListener('click', onStartClick)
buildBoard()
updateControls()

// ── Busta di protocollo e integrazione torneo ────────────────
// Ogni messaggio porta la busta {game, match}; a inizio partita i bot
// ricevono un annuncio con la sola busta e i campi di gioco a null.
const GAME_ID = 'othello'
let matchId = null
let externalOnEnd = null
let externalSlots = null // { B: 'P1'|'P2', W: … } durante una partita pilotata

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
  for (const id of ['B', 'W']) {
    const player = players[id]
    if (!isPicoLike(player.type) || player.serial === null) continue
    player.serial.sendMessage(envelope({ board: null, moves: null, lastMove: null, winner: null }))
  }
}

const baseEndGame = endGame
endGame = function (...args) {
  baseEndGame(...args)
  if (externalOnEnd) {
    const onEnd = externalOnEnd
    externalOnEnd = null
    const winner = args[0].winner
    const slots = externalSlots || { B: 'P1', W: 'P2' }
    externalSlots = null
    onEnd(winner === 'TIE' ? 'TIE' : slots[winner])
  }
}

// La pagina può essere pilotata da un contenitore (modalità torneo):
// riceve le seriali già connesse e gioca una singola partita.
// Il colore (chi ha il Nero, che muove per primo) è sorteggiato.
globalThis.startExternalMatch = function (serials, onEnd) {
  externalOnEnd = onEnd
  document.body.classList.add('external-match')
  const order = Math.random() < 0.5 ? ['B', 'W'] : ['W', 'B']
  externalSlots = { [order[0]]: 'P1', [order[1]]: 'P2' }
  order.forEach((id, i) => {
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
