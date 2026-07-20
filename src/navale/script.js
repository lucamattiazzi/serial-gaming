// ── Configurazione ───────────────────────────────────────────
const PLACE_TIME_LIMIT_MS = 3000 // tempo massimo per piazzare la flotta
const MOVE_TIME_LIMIT_MS = 2000  // tempo massimo per un colpo
const CPU_MOVE_DELAY_MS = 350
const SERIES_GAMES = 5
const SERIES_TARGET = 3
const SERIES_PAUSE_MS = 2500

const GRID = { w: 10, h: 10 }
const FLEET = [5, 4, 3, 3, 2]

const PLAYER_TYPES = {
  HUMAN: 'human',
  PICO: 'pico',
  EMU: 'emu',
  CPU_RANDOM: 'cpu-random',
  CPU_HUNTER: 'cpu-hunter',
}

function isPicoLike(type) {
  return type === PLAYER_TYPES.PICO || type === PLAYER_TYPES.EMU
}

// ── Regole (funzioni pure) ───────────────────────────────────
function cellKey(x, y) {
  return `${x},${y}`
}

// Valida il piazzamento e lo normalizza in [{len, cells: Set, hits: Set}] o null
function validatePlacement(shipsSpec, fleet) {
  if (!Array.isArray(shipsSpec) || shipsSpec.length !== fleet.length) return null
  const lens = shipsSpec.map(s => s && s.len).sort((a, b) => b - a)
  const expected = [...fleet].sort((a, b) => b - a)
  if (!lens.every((len, i) => len === expected[i])) return null

  const occupied = new Set()
  const ships = []
  for (const spec of shipsSpec) {
    if (!spec || !Number.isInteger(spec.x) || !Number.isInteger(spec.y)) return null
    if (spec.dir !== 'h' && spec.dir !== 'v') return null
    const cells = new Set()
    for (let i = 0; i < spec.len; i++) {
      const x = spec.dir === 'h' ? spec.x + i : spec.x
      const y = spec.dir === 'v' ? spec.y + i : spec.y
      if (x < 0 || x >= GRID.w || y < 0 || y >= GRID.h) return null
      const key = cellKey(x, y)
      if (occupied.has(key)) return null
      occupied.add(key)
      cells.add(key)
    }
    ships.push({ len: spec.len, cells, hits: new Set() })
  }
  return ships
}

function randomPlacementSpec(fleet) {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const spec = []
    const occupied = new Set()
    let ok = true
    for (const len of fleet) {
      let placed = false
      for (let tries = 0; tries < 200 && !placed; tries++) {
        const dir = Math.random() < 0.5 ? 'h' : 'v'
        const x = Math.floor(Math.random() * (dir === 'h' ? GRID.w - len + 1 : GRID.w))
        const y = Math.floor(Math.random() * (dir === 'v' ? GRID.h - len + 1 : GRID.h))
        const cells = []
        for (let i = 0; i < len; i++) {
          cells.push(cellKey(dir === 'h' ? x + i : x, dir === 'v' ? y + i : y))
        }
        if (cells.every(key => !occupied.has(key))) {
          cells.forEach(key => occupied.add(key))
          spec.push({ x, y, dir, len })
          placed = true
        }
      }
      if (!placed) { ok = false; break }
    }
    if (ok) return spec
  }
  throw new Error('piazzamento casuale fallito')
}

// Applica un colpo alle navi: ritorna {result: 'miss'|'hit'|'sunk', len?}
function resolveShot(ships, x, y) {
  const key = cellKey(x, y)
  for (const ship of ships) {
    if (!ship.cells.has(key)) continue
    ship.hits.add(key)
    if (ship.hits.size === ship.len) return { result: 'sunk', len: ship.len }
    return { result: 'hit' }
  }
  return { result: 'miss' }
}

function allSunk(ships) {
  return ships.every(ship => ship.hits.size === ship.len)
}

// CPU cacciatrice: mira accanto ai colpi a segno, altrimenti cerca a scacchiera
function hunterMove(myShots) {
  const tried = new Set(myShots.map(s => cellKey(s.x, s.y)))
  const targets = []
  for (const shot of myShots) {
    if (shot.result !== 'hit') continue
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = shot.x + dx
      const y = shot.y + dy
      if (x < 0 || x >= GRID.w || y < 0 || y >= GRID.h) continue
      if (!tried.has(cellKey(x, y))) targets.push([x, y])
    }
  }
  if (targets.length > 0) return targets[Math.floor(Math.random() * targets.length)]

  const parity = []
  const rest = []
  for (let y = 0; y < GRID.h; y++) {
    for (let x = 0; x < GRID.w; x++) {
      if (tried.has(cellKey(x, y))) continue
      if ((x + y) % 2 === 0) parity.push([x, y])
      else rest.push([x, y])
    }
  }
  const pool = parity.length > 0 ? parity : rest
  return pool[Math.floor(Math.random() * pool.length)]
}

function randomShot(myShots) {
  const tried = new Set(myShots.map(s => cellKey(s.x, s.y)))
  const pool = []
  for (let y = 0; y < GRID.h; y++) {
    for (let x = 0; x < GRID.w; x++) {
      if (!tried.has(cellKey(x, y))) pool.push([x, y])
    }
  }
  return pool[Math.floor(Math.random() * pool.length)]
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
const boardsEl = document.getElementById('boards')

// ── Stato di gioco ───────────────────────────────────────────
const players = {
  P1: { type: PLAYER_TYPES.HUMAN, serial: null, pendingResolve: null },
  P2: { type: PLAYER_TYPES.PICO, serial: null, pendingResolve: null },
}

let boards = { P1: null, P2: null } // navi normalizzate per giocatore
let shots = { P1: [], P2: [] }      // colpi SPARATI da quel giocatore
let currentShooter = 'P1'
let gameActive = false
let gamePlayed = false
let waitingHuman = false
let series = null
let timerInterval = null
const seaCells = { P1: [], P2: [] }

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

  document.getElementById(`emu-code-${id}`).value = BOT_TEMPLATES.navale

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
    const emu = new EmulatedPico(`Emu ${id}`, code, PLACE_TIME_LIMIT_MS)
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
  if (parsed == null || typeof parsed !== 'object') return
  if (parsed.move == null && parsed.ships == null) return
  if (parsed.regola) showBotRule(id, parsed.regola)
  const resolve = players[id].pendingResolve
  if (resolve) {
    players[id].pendingResolve = null
    resolve(parsed)
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
}

function setStatus(message, danger = false) {
  statusDisplay.textContent = message
  statusDisplay.classList.toggle('danger', danger)
}

function highlightTurn(id) {
  for (const p of ['P1', 'P2']) {
    document.getElementById(`card-${p}`).classList.toggle('active-turn', gameActive && p === id)
  }
}

// ── Tabelloni ────────────────────────────────────────────────
function buildBoards() {
  for (const id of ['P1', 'P2']) {
    const sea = document.getElementById(`sea-${id}`)
    sea.innerHTML = ''
    seaCells[id].length = 0
    for (let y = 0; y < GRID.h; y++) {
      for (let x = 0; x < GRID.w; x++) {
        const cell = document.createElement('div')
        cell.classList.add('cell', 'untried')
        cell.addEventListener('click', () => handleSeaClick(id, x, y))
        sea.appendChild(cell)
        seaCells[id].push(cell)
      }
    }
  }
}

// le navi di `id` si mostrano solo se l'avversario non è umano
function shipsVisible(id) {
  return players[otherId(id)].type !== PLAYER_TYPES.HUMAN
}

function renderBoards() {
  for (const id of ['P1', 'P2']) {
    const incoming = shots[otherId(id)] // colpi ricevuti da id
    const hitMap = new Map(incoming.map(s => [cellKey(s.x, s.y), s.result]))
    const shipCells = new Set()
    const sunkCells = new Set()
    if (boards[id]) {
      for (const ship of boards[id].ships) {
        for (const key of ship.cells) {
          shipCells.add(key)
          if (ship.hits.size === ship.len) sunkCells.add(key)
        }
      }
    }
    for (let y = 0; y < GRID.h; y++) {
      for (let x = 0; x < GRID.w; x++) {
        const key = cellKey(x, y)
        const cell = seaCells[id][y * GRID.w + x]
        cell.classList.remove('ship', 'miss', 'hit', 'sunk', 'untried')
        const result = hitMap.get(key)
        if (result === undefined) cell.classList.add('untried')
        if (shipCells.has(key) && shipsVisible(id) && result === undefined) cell.classList.add('ship')
        if (result === 'miss') cell.classList.add('miss')
        if (result === 'hit') cell.classList.add('hit')
        if (result === 'sunk' || (sunkCells.has(key) && result !== undefined)) {
          cell.classList.remove('hit')
          cell.classList.add('sunk')
        }
      }
    }
    document.getElementById(`sea-${id}`).classList.toggle(
      'targetable',
      gameActive && waitingHuman && id === otherId(currentShooter)
    )
  }
}

function handleSeaClick(seaId, x, y) {
  if (!gameActive || !waitingHuman) return
  if (seaId !== otherId(currentShooter)) return
  const tried = new Set(shots[currentShooter].map(s => cellKey(s.x, s.y)))
  if (tried.has(cellKey(x, y))) return
  waitingHuman = false
  applyShot(x, y)
}

// ── Flusso di gioco ──────────────────────────────────────────
function onStartClick() {
  if (seriesAvailable() && seriesToggle.checked) {
    startSeries()
  } else {
    series = null
    seriesScore.hidden = true
    startGame('P1')
  }
}

async function startGame(firstShooter) {
  boards = { P1: null, P2: null }
  shots = { P1: [], P2: [] }
  currentShooter = firstShooter
  waitingHuman = false
  gameActive = true
  gamePlayed = true
  announceMatch()
  boardsEl.classList.remove('idle')
  updateControls()
  setStatus('Piazzamento delle flotte…')

  let placements
  try {
    placements = await Promise.all(['P1', 'P2'].map(getPlacement))
  } catch (fault) {
    stopTimerDisplay()
    if (!gameActive) return
    return declareLoss(fault.id, fault.reason)
  }
  stopTimerDisplay()
  if (!gameActive) return

  boards.P1 = { ships: placements[0] }
  boards.P2 = { ships: placements[1] }
  renderBoards()
  nextTurn()
}

function getPlacement(id) {
  const player = players[id]

  if (!isPicoLike(player.type)) {
    return Promise.resolve(validatePlacement(randomPlacementSpec(FLEET), FLEET))
  }

  if (player.serial === null) {
    return Promise.reject({ id, reason: 'bot disconnesso' })
  }
  startTimerDisplay(PLACE_TIME_LIMIT_MS)
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      player.pendingResolve = null
      reject({ id, reason: `piazzamento: ${botFailReason(player)}` })
    }, PLACE_TIME_LIMIT_MS)
    player.pendingResolve = (parsed) => {
      clearTimeout(timeout)
      const ships = validatePlacement(parsed.ships, FLEET)
      if (ships === null) reject({ id, reason: 'piazzamento non valido' })
      else resolve(ships)
    }
    player.serial.sendMessage(envelope({
      phase: 'place',
      grid: GRID,
      fleet: FLEET,
      shots: null,
      oppShots: null,
      winner: null,
    }))
  })
}

async function nextTurn() {
  if (!gameActive) return
  const id = currentShooter
  const player = players[id]
  highlightTurn(id)
  renderBoards()

  if (player.type === PLAYER_TYPES.HUMAN) {
    waitingHuman = true
    renderBoards()
    setStatus(`Giocatore ${playerNumber(id)}: fai fuoco sulla flotta avversaria.`)
    return
  }

  if (player.type === PLAYER_TYPES.CPU_RANDOM || player.type === PLAYER_TYPES.CPU_HUNTER) {
    setStatus(`La CPU (Giocatore ${playerNumber(id)}) prende la mira…`)
    await sleep(CPU_MOVE_DELAY_MS)
    if (!gameActive) return
    const [x, y] = player.type === PLAYER_TYPES.CPU_RANDOM
      ? randomShot(shots[id])
      : hunterMove(shots[id])
    applyShot(x, y)
    return
  }

  // RP2040 (vero o emulato)
  const engineName = player.type === PLAYER_TYPES.EMU ? 'bot emulato' : 'RP2040'
  setStatus(`Il ${engineName} del Giocatore ${playerNumber(id)} prende la mira…`)
  if (player.serial === null) {
    return declareLoss(id, `${engineName} disconnesso`)
  }
  startTimerDisplay(MOVE_TIME_LIMIT_MS)
  try {
    const parsed = await requestPicoShot(player, id)
    stopTimerDisplay()
    if (!gameActive) return
    const move = parsed.move
    if (!isValidShot(id, move)) {
      return declareLoss(id, `colpo non valido (${JSON.stringify(move)})`)
    }
    applyShot(move[0], move[1])
  } catch {
    stopTimerDisplay()
    if (!gameActive) return
    declareLoss(id, botFailReason(player))
  }
}

function requestPicoShot(player, id) {
  const gameState = {
    phase: 'hunt',
    grid: GRID,
    fleet: FLEET,
    shots: shots[id].map(s => (s.len ? { x: s.x, y: s.y, result: s.result, len: s.len } : { x: s.x, y: s.y, result: s.result })),
    oppShots: shots[otherId(id)].map(s => [s.x, s.y]),
    winner: null,
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      player.pendingResolve = null
      reject(new Error('timeout'))
    }, MOVE_TIME_LIMIT_MS)
    player.pendingResolve = (parsed) => {
      clearTimeout(timeout)
      resolve(parsed)
    }
    player.serial.sendMessage(envelope(gameState))
  })
}

function isValidShot(id, move) {
  if (!Array.isArray(move) || move.length !== 2) return false
  const [x, y] = move
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false
  if (x < 0 || x >= GRID.w || y < 0 || y >= GRID.h) return false
  return !shots[id].some(s => s.x === x && s.y === y)
}

function applyShot(x, y) {
  const id = currentShooter
  const target = boards[otherId(id)]
  const outcome = resolveShot(target.ships, x, y)
  const record = { x, y, result: outcome.result }
  if (outcome.len) record.len = outcome.len
  shots[id].push(record)
  renderBoards()

  const description = outcome.result === 'miss' ? 'acqua'
    : outcome.result === 'hit' ? 'colpito!'
      : `colpito e affondato (${outcome.len})!`
  setStatus(`Giocatore ${playerNumber(id)} spara in (${x}, ${y}): ${description}`)

  if (allSunk(target.ships)) return endGame(id)

  currentShooter = otherId(id)
  nextTurn()
}

function declareLoss(loserId, reason) {
  endGame(otherId(loserId), `Il Giocatore ${playerNumber(loserId)} perde: ${reason}.`)
}

function endGame(winnerId, lossMessage = null) {
  gameActive = false
  waitingHuman = false
  stopTimerDisplay()
  highlightTurn(null)
  renderBoards()
  notifyBots(winnerId)

  if (lossMessage) {
    setStatus(`${lossMessage} Vince il Giocatore ${playerNumber(winnerId)}!`, true)
  } else {
    setStatus(`Flotta affondata! Vince il Giocatore ${playerNumber(winnerId)}!`)
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
      phase: null,
      grid: null,
      fleet: null,
      shots: null,
      oppShots: null,
      winner: id === winnerId ? 'you' : 'opp',
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
  const first = Math.random() < 0.5 ? 'P1' : 'P2'
  startGame(first)
  setStatus(`Partita ${series.game}: spara per primo il Giocatore ${playerNumber(first)}.`)
}

function handleSeriesResult(winnerId) {
  series.score[winnerId]++
  updateSeriesScoreboard()

  const { P1, P2 } = series.score
  const finished = P1 >= SERIES_TARGET || P2 >= SERIES_TARGET || series.game >= SERIES_GAMES
  if (!finished) {
    setStatus(`${statusDisplay.textContent} Prossima partita tra poco…`)
    setTimeout(nextSeriesGame, SERIES_PAUSE_MS)
    return
  }

  const champion = P1 > P2 ? 1 : 2
  setStatus(`Il Giocatore ${champion} vince la sfida ${Math.max(P1, P2)} a ${Math.min(P1, P2)}!`)
  series = null
}

function updateSeriesScoreboard() {
  const { P1, P2 } = series.score
  seriesScore.textContent = `Sfida al meglio di ${SERIES_GAMES} — partita ${series.game} · G1 ${P1} : ${P2} G2`
}

// ── Timer a video ────────────────────────────────────────────
function startTimerDisplay(limitMs) {
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
buildBoards()
updateControls()

// ── Busta di protocollo e integrazione torneo ────────────────
// Ogni messaggio porta la busta {game, match}; a inizio partita i bot
// ricevono un annuncio con la sola busta e i campi di gioco a null.
const GAME_ID = 'navale'
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
    player.serial.sendMessage(envelope({ phase: null, grid: null, fleet: null, shots: null, oppShots: null, winner: null }))
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
  startGame(Math.random() < 0.5 ? 'P1' : 'P2')
}
