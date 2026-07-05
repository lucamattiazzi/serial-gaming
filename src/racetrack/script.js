// ── Configurazione ───────────────────────────────────────────
const MOVE_TIME_LIMIT_MS = 2000 // tempo massimo per turno di un RP2040
const TURN_PAUSE_MS = 400       // pausa tra i turni, per seguire la corsa
const MAX_TURNS = 200           // oltre: pareggio
const SERIES_GAMES = 5
const SERIES_TARGET = 3
const SERIES_PAUSE_MS = 2500

const PLAYER_TYPES = {
  HUMAN: 'human',
  PICO: 'pico',
  EMU: 'emu',
  CPU_EASY: 'cpu-easy',
  CPU_HARD: 'cpu-hard',
}

function isPicoLike(type) {
  return type === PLAYER_TYPES.PICO || type === PLAYER_TYPES.EMU
}

// ── Tracciati ────────────────────────────────────────────────
// '#' muro, '.' pista, 'S' partenze (in ordine di lettura: G1, G2), 'F' traguardo
function buildRingTrack() {
  const w = 32
  const h = 20
  const rows = []
  for (let y = 0; y < h; y++) {
    let row = ''
    for (let x = 0; x < w; x++) {
      const border = x === 0 || x === w - 1 || y === 0 || y === h - 1
      const innerBlock = x >= 9 && x <= 22 && y >= 7 && y <= 12
      const barrier = y === 10 && x >= 1 && x <= 8
      row += border || innerBlock || barrier ? '#' : '.'
    }
    rows.push(row)
  }
  const put = (x, y, ch) => {
    rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1)
  }
  put(2, 9, 'S')
  put(5, 9, 'S')
  for (let y = 11; y <= 18; y++) put(4, y, 'F')
  return rows
}

function buildSnakeTrack() {
  const w = 32
  const h = 20
  const rows = []
  for (let y = 0; y < h; y++) {
    let row = ''
    for (let x = 0; x < w; x++) {
      const border = x === 0 || x === w - 1 || y === 0 || y === h - 1
      const wall1 = y === 5 && x >= 1 && x <= 24
      const wall2 = y === 10 && x >= 7 && x <= 30
      const wall3 = y === 15 && x >= 1 && x <= 24
      row += border || wall1 || wall2 || wall3 ? '#' : '.'
    }
    rows.push(row)
  }
  const put = (x, y, ch) => {
    rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1)
  }
  put(2, 1, 'S')
  put(2, 3, 'S')
  for (let y = 16; y <= 18; y++) put(2, y, 'F')
  return rows
}

const TRACKS = [buildRingTrack(), buildSnakeTrack()]

// ── Logica di gara (funzioni pure) ───────────────────────────
function parseTrack(rows) {
  const h = rows.length
  const w = rows[0].length
  const starts = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rows[y][x] === 'S') starts.push({ x, y })
    }
  }
  return { rows, w, h, starts, dist: distanceField(rows, w, h) }
}

function cellAt(track, x, y) {
  if (x < 0 || x >= track.w || y < 0 || y >= track.h) return '#'
  return track.rows[y][x]
}

// celle attraversate dal segmento, in ordine, campionando fitto
function pathCells(x0, y0, x1, y1) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 4 + 1
  const cells = []
  let last = null
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = Math.round(x0 + (x1 - x0) * t)
    const y = Math.round(y0 + (y1 - y0) * t)
    const key = `${x},${y}`
    if (key !== last) {
      cells.push([x, y])
      last = key
    }
  }
  return cells
}

// esito del movimento: la prima cosa che incontri lungo il segmento decide
function moveOutcome(track, from, to) {
  const cells = pathCells(from.x, from.y, to.x, to.y)
  for (let i = 1; i < cells.length; i++) {
    const [x, y] = cells[i]
    const cell = cellAt(track, x, y)
    if (cell === '#') return { crashed: true, finished: false }
    if (cell === 'F') return { crashed: false, finished: true }
  }
  return { crashed: false, finished: false }
}

function distanceField(rows, w, h) {
  const dist = new Map()
  const queue = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rows[y][x] === 'F') {
        dist.set(`${x},${y}`, 0)
        queue.push([x, y])
      }
    }
  }
  while (queue.length > 0) {
    const [x, y] = queue.shift()
    const d = dist.get(`${x},${y}`)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
        if (rows[ny][nx] === '#') continue
        const key = `${nx},${ny}`
        if (dist.has(key)) continue
        dist.set(key, d + 1)
        queue.push([nx, ny])
      }
    }
  }
  return dist
}

// da (x, y) con velocità (vx, vy), frenando di 1 a turno si riesce a fermarsi?
function canBrake(track, x, y, vx, vy) {
  let px = x
  let py = y
  let cvx = vx
  let cvy = vy
  while (cvx !== 0 || cvy !== 0) {
    cvx -= Math.sign(cvx)
    cvy -= Math.sign(cvy)
    if (cvx === 0 && cvy === 0) return true
    const nx = px + cvx
    const ny = py + cvy
    const outcome = moveOutcome(track, { x: px, y: py }, { x: nx, y: ny })
    if (outcome.crashed) return false
    if (outcome.finished) return true
    px = nx
    py = ny
  }
  return true
}

function cpuAccel(track, car, level) {
  const cap = level === PLAYER_TYPES.CPU_EASY ? 1 : 2
  let best = null
  let bestScore = Infinity
  for (let ax = -1; ax <= 1; ax++) {
    for (let ay = -1; ay <= 1; ay++) {
      const vx = car.vx + ax
      const vy = car.vy + ay
      if (Math.abs(vx) > cap || Math.abs(vy) > cap) continue
      const nx = car.x + vx
      const ny = car.y + vy
      const outcome = moveOutcome(track, car, { x: nx, y: ny })
      if (outcome.crashed) continue
      if (outcome.finished) return [ax, ay]
      if (!canBrake(track, nx, ny, vx, vy)) continue
      const d = track.dist.get(`${nx},${ny}`)
      if (d === undefined) continue
      const score = d * 10 - (Math.abs(vx) + Math.abs(vy))
      if (score < bestScore) {
        bestScore = score
        best = [ax, ay]
      }
    }
  }
  // nessuna mossa sicura: frena sperando bene
  return best ?? [-Math.sign(car.vx), -Math.sign(car.vy)]
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
const canvas = document.getElementById('race-canvas')
const ctx = canvas.getContext('2d')

// ── Stato di gioco ───────────────────────────────────────────
const players = {
  P1: { type: PLAYER_TYPES.HUMAN, serial: null, pendingResolve: null, humanResolve: null },
  P2: { type: PLAYER_TYPES.PICO, serial: null, pendingResolve: null, humanResolve: null },
}

let track = parseTrack(TRACKS[0])
let cars = null // { P1: {x,y,vx,vy,trail}, P2: {...} }
let turn = 0
let gameActive = false
let gamePlayed = false
let series = null
let timerInterval = null

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

  document.getElementById(`emu-code-${id}`).value = BOT_TEMPLATES.racetrack

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
}

function setStatus(message, danger = false) {
  statusDisplay.textContent = message
  statusDisplay.classList.toggle('danger', danger)
}

// ── Clic dell'umano sulle 9 caselle candidate ────────────────
canvas.addEventListener('click', event => {
  if (!gameActive) return
  const rect = canvas.getBoundingClientRect()
  const cx = Math.floor((event.clientX - rect.left) / rect.width * track.w)
  const cy = Math.floor((event.clientY - rect.top) / rect.height * track.h)
  for (const id of ['P1', 'P2']) {
    const player = players[id]
    if (!player.humanResolve) continue
    const car = cars[id]
    for (let ax = -1; ax <= 1; ax++) {
      for (let ay = -1; ay <= 1; ay++) {
        if (car.x + car.vx + ax === cx && car.y + car.vy + ay === cy) {
          const resolve = player.humanResolve
          player.humanResolve = null
          canvas.classList.toggle('aiming', players.P1.humanResolve !== null || players.P2.humanResolve !== null)
          resolve([ax, ay])
          return
        }
      }
    }
    return // il clic era del giocatore in attesa ma fuori dalle sue caselle
  }
})

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
  track = parseTrack(TRACKS[Math.floor(Math.random() * TRACKS.length)])
  cars = {
    P1: { x: track.starts[0].x, y: track.starts[0].y, vx: 0, vy: 0, trail: [] },
    P2: { x: track.starts[1].x, y: track.starts[1].y, vx: 0, vy: 0, trail: [] },
  }
  cars.P1.trail.push([cars.P1.x, cars.P1.y])
  cars.P2.trail.push([cars.P2.x, cars.P2.y])
  turn = 0
  gameActive = true
  gamePlayed = true
  announceMatch()
  updateControls()
  draw()
  playTurn()
}

async function playTurn() {
  if (!gameActive) return
  turn++
  if (turn > MAX_TURNS) {
    return endGame('TIE', 'Tempo massimo raggiunto: pareggio!')
  }
  setStatus(`Turno ${turn}: si scelgono le accelerazioni…`)
  draw()

  const somePico = isPicoLike(players.P1.type) || isPicoLike(players.P2.type)
  if (somePico) startTimerDisplay(MOVE_TIME_LIMIT_MS)

  let accels
  try {
    accels = await Promise.all([getAccel('P1'), getAccel('P2')])
  } catch (fault) {
    stopTimerDisplay()
    if (!gameActive) return
    return declareLoss(fault.id, fault.reason)
  }
  stopTimerDisplay()
  if (!gameActive) return

  applyTurn(accels[0], accels[1])
}

function getAccel(id) {
  const player = players[id]

  if (player.type === PLAYER_TYPES.HUMAN) {
    return new Promise(resolve => {
      player.humanResolve = resolve
      canvas.classList.add('aiming')
      draw()
    })
  }

  if (player.type === PLAYER_TYPES.CPU_EASY || player.type === PLAYER_TYPES.CPU_HARD) {
    return sleep(TURN_PAUSE_MS).then(() => cpuAccel(track, cars[id], player.type))
  }

  // RP2040 (vero o emulato)
  if (player.serial === null) {
    return Promise.reject({ id, reason: 'bot disconnesso' })
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      player.pendingResolve = null
      reject({ id, reason: 'tempo scaduto' })
    }, MOVE_TIME_LIMIT_MS)
    player.pendingResolve = (move) => {
      clearTimeout(timeout)
      if (isValidAccel(move)) resolve(move)
      else reject({ id, reason: `accelerazione non valida (${JSON.stringify(move)})` })
    }
    player.serial.sendMessage(envelope(stateFor(id)))
  })
}

function isValidAccel(move) {
  return Array.isArray(move) && move.length === 2
    && [-1, 0, 1].includes(move[0]) && [-1, 0, 1].includes(move[1])
}

function stateFor(id) {
  const you = cars[id]
  const opp = cars[otherId(id)]
  return {
    track: track.rows,
    you: { x: you.x, y: you.y, vx: you.vx, vy: you.vy },
    opp: { x: opp.x, y: opp.y, vx: opp.vx, vy: opp.vy },
    turn,
    winner: null,
  }
}

function applyTurn(accelP1, accelP2) {
  const results = {}
  for (const [id, accel] of [['P1', accelP1], ['P2', accelP2]]) {
    const car = cars[id]
    const vx = car.vx + accel[0]
    const vy = car.vy + accel[1]
    const nx = car.x + vx
    const ny = car.y + vy
    const outcome = moveOutcome(track, car, { x: nx, y: ny })
    results[id] = outcome
    car.vx = vx
    car.vy = vy
    car.x = nx
    car.y = ny
    car.trail.push([nx, ny])
  }
  draw()

  const f1 = results.P1.finished
  const f2 = results.P2.finished
  const c1 = results.P1.crashed
  const c2 = results.P2.crashed

  if (f1 && f2) return endGame('TIE', 'Arrivo in perfetta parità!')
  if (f1) return endGame('P1', `Il Giocatore 1 taglia il traguardo al turno ${turn}!`)
  if (f2) return endGame('P2', `Il Giocatore 2 taglia il traguardo al turno ${turn}!`)
  if (c1 && c2) return endGame('TIE', 'Doppio schianto: pareggio!')
  if (c1) return declareLoss('P1', 'uscita di pista')
  if (c2) return declareLoss('P2', 'uscita di pista')

  playTurn()
}

function declareLoss(loserId, reason) {
  endGame(otherId(loserId), `Il Giocatore ${playerNumber(loserId)} perde: ${reason}.`)
}

function endGame(winnerId, message) {
  gameActive = false
  for (const id of ['P1', 'P2']) players[id].humanResolve = null
  canvas.classList.remove('aiming')
  stopTimerDisplay()
  notifyBots(winnerId)
  draw()

  if (winnerId === 'TIE') {
    setStatus(message)
  } else {
    setStatus(`${message} Vince il Giocatore ${playerNumber(winnerId)}!`)
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
      track: null,
      you: null,
      opp: null,
      turn,
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
  setStatus(`Partita ${series.game}: motori accesi.`)
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

// ── Rendering ────────────────────────────────────────────────
const CAR_COLORS = { P1: '#5eb1ff', P2: '#ffb454' }

function draw() {
  const cw = canvas.width / track.w
  const ch = canvas.height / track.h

  ctx.fillStyle = '#0a0c12'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  for (let y = 0; y < track.h; y++) {
    for (let x = 0; x < track.w; x++) {
      const cell = track.rows[y][x]
      if (cell === '#') continue
      ctx.fillStyle = cell === 'F' ? 'rgba(79, 209, 197, 0.45)'
        : cell === 'S' ? 'rgba(94, 177, 255, 0.25)'
          : '#1c2233'
      ctx.fillRect(x * cw + 0.5, y * ch + 0.5, cw - 1, ch - 1)
    }
  }

  if (cars) {
    for (const id of ['P1', 'P2']) {
      const car = cars[id]
      // scia
      ctx.strokeStyle = CAR_COLORS[id]
      ctx.globalAlpha = 0.5
      ctx.lineWidth = 2
      ctx.beginPath()
      car.trail.forEach(([x, y], i) => {
        const px = (x + 0.5) * cw
        const py = (y + 0.5) * ch
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      })
      ctx.stroke()
      ctx.globalAlpha = 1
      // auto
      ctx.save()
      ctx.shadowColor = CAR_COLORS[id]
      ctx.shadowBlur = 10
      ctx.fillStyle = CAR_COLORS[id]
      ctx.fillRect(car.x * cw + cw * 0.15, car.y * ch + ch * 0.15, cw * 0.7, ch * 0.7)
      ctx.restore()
    }

    // caselle candidate per gli umani in attesa
    for (const id of ['P1', 'P2']) {
      if (!players[id].humanResolve) continue
      const car = cars[id]
      for (let ax = -1; ax <= 1; ax++) {
        for (let ay = -1; ay <= 1; ay++) {
          const x = car.x + car.vx + ax
          const y = car.y + car.vy + ay
          const outcome = moveOutcome(track, car, { x, y })
          ctx.strokeStyle = outcome.crashed ? 'rgba(255, 107, 107, 0.9)' : CAR_COLORS[id]
          ctx.lineWidth = 2
          ctx.strokeRect(x * cw + 1.5, y * ch + 1.5, cw - 3, ch - 3)
        }
      }
    }
  }

  if (!gameActive && !gamePlayed) {
    ctx.fillStyle = 'rgba(232, 234, 242, 0.5)'
    ctx.font = '600 26px -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Premi «Inizia partita»', canvas.width / 2, canvas.height / 2 + 8)
  }
}

// ── Avvio ────────────────────────────────────────────────────
startButton.addEventListener('click', onStartClick)
updateControls()
draw()

// ── Busta di protocollo e integrazione torneo ────────────────
// Ogni messaggio porta la busta {game, match}; a inizio partita i bot
// ricevono un annuncio con la sola busta e i campi di gioco a null.
const GAME_ID = 'racetrack'
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
    player.serial.sendMessage(envelope({ track: null, you: null, opp: null, turn: 0, winner: null }))
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
