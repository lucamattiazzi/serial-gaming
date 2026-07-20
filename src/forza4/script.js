// ── Configurazione ───────────────────────────────────────────
const MOVE_TIME_LIMIT_MS = 2000 // tempo massimo per mossa di un RP2040, pena sconfitta
const HUMAN_TIME_LIMIT_MS = 10000 // tempo massimo per mossa di un umano
const CPU_MOVE_DELAY_MS = 400   // pausa estetica prima della mossa della CPU
const CPU_MINIMAX_DEPTH = 6     // profondità dell'alpha-beta della CPU difficile
const SERIES_GAMES = 5          // partite della sfida tra due RP2040
const SERIES_TARGET = 3         // vittorie che chiudono la sfida in anticipo
const SERIES_PAUSE_MS = 2000    // pausa tra una partita e l'altra della sfida

const COLS = 7
const ROWS = 6

const PLAYER_TYPES = {
  HUMAN: 'human',
  PICO: 'pico',
  EMU: 'emu',
  CPU_RANDOM: 'cpu-random',
  CPU_MINIMAX: 'cpu-minimax',
}

// vero RP2040 o emulato: stesso protocollo, stesso limite di tempo
function isPicoLike(type) {
  return type === PLAYER_TYPES.PICO || type === PLAYER_TYPES.EMU
}

// ── Regole di Forza 4 (funzioni pure) ────────────────────────
// board: 42 stringhe ("", "X", "O"), riga 0 in alto, indice = riga * 7 + colonna

function validCols(board) {
  const cols = []
  for (let col = 0; col < COLS; col++) {
    if (board[col] === '') cols.push(col)
  }
  return cols
}

function dropRow(board, col) {
  for (let row = ROWS - 1; row >= 0; row--) {
    if (board[row * COLS + col] === '') return row
  }
  return -1
}

function* windows() {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const idx = row * COLS + col
      if (col <= COLS - 4) yield [idx, idx + 1, idx + 2, idx + 3]
      if (row <= ROWS - 4) yield [idx, idx + COLS, idx + 2 * COLS, idx + 3 * COLS]
      if (col <= COLS - 4 && row <= ROWS - 4) yield [idx, idx + COLS + 1, idx + 2 * (COLS + 1), idx + 3 * (COLS + 1)]
      if (col >= 3 && row <= ROWS - 4) yield [idx, idx + COLS - 1, idx + 2 * (COLS - 1), idx + 3 * (COLS - 1)]
    }
  }
}

function checkWinner(board) {
  for (const line of windows()) {
    const first = board[line[0]]
    if (first && line.every(i => board[i] === first)) {
      return { winner: first, line }
    }
  }
  if (!board.includes('')) return { winner: 'TIE', line: null }
  return null
}

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
const players = {
  X: { type: PLAYER_TYPES.HUMAN, serial: null, pendingResolve: null },
  O: { type: PLAYER_TYPES.PICO, serial: null, pendingResolve: null },
}

const board = Array(COLS * ROWS).fill('')
let gameActive = false
let gamePlayed = false
let currentSymbol = 'X'
let lastMoveCol = null
let waitingHuman = false
let timerInterval = null
let humanTimeout = null
let series = null
const slots = []

// ── Setup giocatori ──────────────────────────────────────────
for (const symbol of ['X', 'O']) {
  const typeSelect = document.getElementById(`type-${symbol}`)
  const connectRow = document.getElementById(`conn-row-${symbol}`)
  const connectButton = document.getElementById(`connect-${symbol}`)
  const emuRow = document.getElementById(`emu-row-${symbol}`)

  document.getElementById(`emu-code-${symbol}`).value = BOT_TEMPLATES.forza4

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
    setStatus(`Il Pico di ${symbol} si è disconnesso.`, true)
  })
  player.serial = serial
  setStatus(`RP2040 connesso per ${symbol}.`)
  updateControls()
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
    setStatus(`Bot emulato pronto per ${symbol}.`)
  } catch (error) {
    player.serial = null
    setStatus(`Emulatore: ${error.message}`, true)
  }
  button.disabled = false
  updateControls()
}

function handlePicoLine(symbol, line) {
  let parsed
  try {
    parsed = JSON.parse(line)
  } catch {
    return // output di debug del bot
  }
  if (parsed == null || parsed.move == null) return
  if (parsed.regola) showBotRule(symbol, parsed.regola)
  const resolve = players[symbol].pendingResolve
  if (resolve) {
    players[symbol].pendingResolve = null
    resolve(parsed.move)
  }
}

function isReady(symbol) {
  const player = players[symbol]
  return !isPicoLike(player.type) || player.serial !== null
}

function seriesAvailable() {
  return isPicoLike(players.X.type) && isPicoLike(players.O.type)
}

function updateControls() {
  for (const symbol of ['X', 'O']) {
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
  startButton.disabled = gameActive || series !== null || !isReady('X') || !isReady('O')
  startButton.textContent = gamePlayed ? 'Nuova partita' : 'Inizia partita'
  seriesRow.hidden = !seriesAvailable()
}

// ── Griglia ──────────────────────────────────────────────────
function buildBoard() {
  gameBoard.innerHTML = ''
  slots.length = 0
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const slot = document.createElement('div')
      slot.classList.add('slot')
      slot.dataset.col = col
      slot.addEventListener('click', () => handleColumnClick(col))
      slot.addEventListener('mouseenter', () => highlightColumn(col, true))
      slot.addEventListener('mouseleave', () => highlightColumn(col, false))
      gameBoard.appendChild(slot)
      slots.push(slot)
    }
  }
}

function highlightColumn(col, on) {
  if (!gameActive || !waitingHuman) on = false
  for (let row = 0; row < ROWS; row++) {
    slots[row * COLS + col].classList.toggle('hover-col', on && board[row * COLS + col] === '')
  }
}

function renderSlot(index, animate = false) {
  const slot = slots[index]
  slot.classList.remove('disc-x', 'disc-o', 'pop', 'win', 'playable', 'hover-col')
  if (board[index] === 'X') slot.classList.add('disc-x')
  if (board[index] === 'O') slot.classList.add('disc-o')
  if (board[index] === '') slot.classList.add('playable')
  if (animate && board[index] !== '') slot.classList.add('pop')
}

function setStatus(message, danger = false) {
  statusDisplay.textContent = message
  statusDisplay.classList.toggle('danger', danger)
}

function highlightTurn(symbol) {
  for (const s of ['X', 'O']) {
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
    startGame('X')
  }
}

function startGame(startSymbol) {
  board.fill('')
  currentSymbol = startSymbol
  lastMoveCol = null
  waitingHuman = false
  gameActive = true
  gamePlayed = true
  clearHumanTimer()
  announceMatch()
  for (let i = 0; i < board.length; i++) renderSlot(i)
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
    setStatus(`Tocca a te, ${currentSymbol}: scegli una colonna.`)
    startHumanTimer()
    return
  }

  if (player.type === PLAYER_TYPES.CPU_RANDOM || player.type === PLAYER_TYPES.CPU_MINIMAX) {
    setStatus(`La CPU (${currentSymbol}) sta pensando…`)
    await sleep(CPU_MOVE_DELAY_MS)
    if (!gameActive) return
    const col = player.type === PLAYER_TYPES.CPU_RANDOM
      ? randomMove(board)
      : bestMove(board, currentSymbol)
    applyMove(col)
    return
  }

  // RP2040 (vero o emulato): mossa con limite di tempo
  const engineName = player.type === PLAYER_TYPES.EMU ? 'bot emulato' : 'RP2040'
  setStatus(`Il ${engineName} di ${currentSymbol} sta pensando…`)
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
    declareLoss(currentSymbol, botFailReason(player))
  }
}

function requestPicoMove(player) {
  const gameState = {
    board: remapBoardFor(currentSymbol),
    lastMove: lastMoveCol,
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

function handleColumnClick(col) {
  if (!gameActive || !waitingHuman || dropRow(board, col) === -1) return
  waitingHuman = false
  clearHumanTimer()
  stopTimerDisplay()
  highlightColumn(col, false)
  applyMove(col)
}

function isValidMove(move) {
  return Number.isInteger(move) && move >= 0 && move < COLS && dropRow(board, move) !== -1
}

function applyMove(col) {
  const row = dropRow(board, col)
  const index = row * COLS + col
  board[index] = currentSymbol
  lastMoveCol = col
  renderSlot(index, true)

  const result = checkWinner(board)
  if (result) return endGame(result)

  currentSymbol = currentSymbol === 'X' ? 'O' : 'X'
  nextTurn()
}

function declareLoss(loserSymbol, reason) {
  const winner = loserSymbol === 'X' ? 'O' : 'X'
  endGame({ winner, line: null }, `${loserSymbol} perde: ${reason}.`)
}

function endGame(result, reasonMessage = null) {
  gameActive = false
  waitingHuman = false
  clearHumanTimer()
  stopTimerDisplay()
  gameBoard.classList.remove('human-turn')
  highlightTurn(null)

  if (result.line) {
    for (const i of result.line) slots[i].classList.add('win')
  }

  notifyPicos(result.winner)

  if (reasonMessage) {
    setStatus(`${reasonMessage} Vince ${result.winner}!`, true)
  } else if (result.winner === 'TIE') {
    setStatus('Pareggio!')
  } else {
    setStatus(`Vince ${result.winner}!`)
  }
  if (series) handleSeriesResult(result.winner)
  updateControls()
}

// Notifica il risultato ai Pico connessi, veri o emulati
function notifyPicos(winner) {
  for (const symbol of ['X', 'O']) {
    const player = players[symbol]
    if (!isPicoLike(player.type) || player.serial === null) continue
    player.pendingResolve = null
    player.serial.sendMessage(envelope({
      board: null,
      lastMove: null,
      winner: remapWinnerFor(symbol, winner),
    }))
  }
}

// ── Rimappatura simboli: ogni Pico si vede sempre come "O" ───
function remapBoardFor(symbol) {
  if (symbol === 'O') return [...board]
  return board.map(c => (c === 'X' ? 'O' : c === 'O' ? 'X' : ''))
}

function remapWinnerFor(symbol, winner) {
  if (winner === 'TIE' || symbol === 'O') return winner
  return winner === 'X' ? 'O' : 'X'
}

// ── Sfida al meglio di 5 (solo RP2040 vs RP2040) ─────────────
function startSeries() {
  series = { score: { X: 0, O: 0 }, game: 0 }
  seriesScore.hidden = false
  nextSeriesGame()
}

function nextSeriesGame() {
  series.game++
  updateSeriesScoreboard()
  const startSymbol = Math.random() < 0.5 ? 'X' : 'O'
  startGame(startSymbol)
  setStatus(`Partita ${series.game}: inizia ${startSymbol}.`)
}

function handleSeriesResult(winner) {
  if (winner === 'X' || winner === 'O') series.score[winner]++
  updateSeriesScoreboard()

  const { X, O } = series.score
  const finished = X >= SERIES_TARGET || O >= SERIES_TARGET || series.game >= SERIES_GAMES
  if (!finished) {
    setStatus(`${statusDisplay.textContent} Prossima partita tra poco…`)
    setTimeout(nextSeriesGame, SERIES_PAUSE_MS)
    return
  }

  if (X === O) {
    setStatus(`Sfida finita in parità: ${X} a ${O}!`)
  } else {
    const champion = X > O ? 'X' : 'O'
    setStatus(`${champion} vince la sfida ${Math.max(X, O)} a ${Math.min(X, O)}!`)
  }
  series = null
}

function updateSeriesScoreboard() {
  const { X, O } = series.score
  seriesScore.textContent = `Sfida al meglio di ${SERIES_GAMES} — partita ${series.game} · X ${X} : ${O} O`
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

// ── CPU integrata ────────────────────────────────────────────
function randomMove(b) {
  const cols = validCols(b)
  return cols[Math.floor(Math.random() * cols.length)]
}

function evaluate(b, me) {
  const opp = other(me)
  let score = 0
  // leggera preferenza per il centro
  for (let row = 0; row < ROWS; row++) {
    if (b[row * COLS + 3] === me) score += 3
  }
  for (const line of windows()) {
    let mine = 0
    let theirs = 0
    for (const i of line) {
      if (b[i] === me) mine++
      else if (b[i] === opp) theirs++
    }
    if (mine > 0 && theirs > 0) continue
    if (mine === 3) score += 40
    else if (mine === 2) score += 8
    if (theirs === 3) score -= 60
    else if (theirs === 2) score -= 8
  }
  return score
}

function alphabeta(b, depth, alpha, beta, maximizing, me) {
  const result = checkWinner(b)
  if (result) {
    if (result.winner === 'TIE') return 0
    return result.winner === me ? 100000 + depth : -100000 - depth
  }
  if (depth === 0) return evaluate(b, me)

  const turn = maximizing ? me : other(me)
  // esplora prima le colonne centrali: taglia molto di più
  const cols = validCols(b).sort((a, c) => Math.abs(3 - a) - Math.abs(3 - c))
  if (maximizing) {
    let best = -Infinity
    for (const col of cols) {
      const idx = dropRow(b, col) * COLS + col
      b[idx] = turn
      best = Math.max(best, alphabeta(b, depth - 1, alpha, beta, false, me))
      b[idx] = ''
      alpha = Math.max(alpha, best)
      if (alpha >= beta) break
    }
    return best
  }
  let best = Infinity
  for (const col of cols) {
    const idx = dropRow(b, col) * COLS + col
    b[idx] = turn
    best = Math.min(best, alphabeta(b, depth - 1, alpha, beta, true, me))
    b[idx] = ''
    beta = Math.min(beta, best)
    if (alpha >= beta) break
  }
  return best
}

function bestMove(b, me) {
  let bestScore = -Infinity
  let best = []
  for (const col of validCols(b)) {
    const idx = dropRow(b, col) * COLS + col
    b[idx] = me
    const score = alphabeta(b, CPU_MINIMAX_DEPTH - 1, -Infinity, Infinity, false, me)
    b[idx] = ''
    if (score > bestScore) {
      bestScore = score
      best = [col]
    } else if (score === bestScore) {
      best.push(col)
    }
  }
  return best[Math.floor(Math.random() * best.length)]
}

function other(symbol) {
  return symbol === 'X' ? 'O' : 'X'
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
const GAME_ID = 'forza4'
const PLAYER_ORDER = ['X', 'O']
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
    player.serial.sendMessage(envelope({ board: null, lastMove: null, winner: null }))
  }
}

const baseEndGame = endGame
endGame = function (...args) {
  baseEndGame(...args)
  if (externalOnEnd) {
    const onEnd = externalOnEnd
    externalOnEnd = null
    onEnd(args[0].winner === 'TIE' ? 'TIE' : args[0].winner === 'X' ? 'P1' : 'P2')
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
  startGame(Math.random() < 0.5 ? 'X' : 'O')
}
