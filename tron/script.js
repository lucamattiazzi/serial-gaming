// ── Configurazione ───────────────────────────────────────────
const TICK_MS = 150             // un passo di gioco (e uno stato ai bot) ogni tick
const SILENCE_LIMIT_MS = 3000   // un bot muto per più di così perde
const FLOOD_CAP = 400           // tetto del flood fill della CPU difficile
const SERIES_GAMES = 5
const SERIES_TARGET = 3
const SERIES_PAUSE_MS = 2500

const FIELD = { w: 40, h: 30 }
const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}
const MIRROR_DIR = { up: 'up', down: 'down', left: 'right', right: 'left' }
const REVERSE_DIR = { up: 'down', down: 'up', left: 'right', right: 'left' }

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

// ── Logica di gioco (funzioni pure sullo stato `sim`) ────────
// sim = { trails: Map "x,y" -> 'P1'|'P2', heads: { P1: {x,y,dir}, P2: {x,y,dir} } }

function cellKey(x, y) {
  return `${x},${y}`
}

function freshSim() {
  const sim = {
    trails: new Map(),
    heads: {
      P1: { x: 5, y: 15, dir: 'right' },
      P2: { x: FIELD.w - 6, y: 15, dir: 'left' },
    },
  }
  sim.trails.set(cellKey(5, 15), 'P1')
  sim.trails.set(cellKey(FIELD.w - 6, 15), 'P2')
  return sim
}

function isBlocked(sim, x, y) {
  return x < 0 || x >= FIELD.w || y < 0 || y >= FIELD.h || sim.trails.has(cellKey(x, y))
}

// Avanza di un passo entrambe le moto; ritorna null | 'P1' | 'P2' | 'TIE' (vincitore)
function stepTron(sim) {
  const heads = sim.heads
  const next = {}
  for (const id of ['P1', 'P2']) {
    const delta = DIRS[heads[id].dir]
    next[id] = { x: heads[id].x + delta.x, y: heads[id].y + delta.y }
  }

  const headOn = next.P1.x === next.P2.x && next.P1.y === next.P2.y
  const swapped = next.P1.x === heads.P2.x && next.P1.y === heads.P2.y
    && next.P2.x === heads.P1.x && next.P2.y === heads.P1.y
  const dead = {
    P1: headOn || swapped || isBlocked(sim, next.P1.x, next.P1.y),
    P2: headOn || swapped || isBlocked(sim, next.P2.x, next.P2.y),
  }

  if (dead.P1 && dead.P2) return 'TIE'
  if (dead.P1) return 'P2'
  if (dead.P2) return 'P1'

  for (const id of ['P1', 'P2']) {
    heads[id].x = next[id].x
    heads[id].y = next[id].y
    sim.trails.set(cellKey(next[id].x, next[id].y), id)
  }
  return null
}

// Ogni bot si vede sempre partire da SINISTRA: per P2 il campo è specchiato
function mirrorStateFor(id, sim, tick) {
  const mirror = id === 'P2'
  const oppId = id === 'P1' ? 'P2' : 'P1'
  const mx = x => (mirror ? FIELD.w - 1 - x : x)
  const mdir = d => (mirror ? MIRROR_DIR[d] : d)

  const grid = []
  for (let y = 0; y < FIELD.h; y++) {
    let row = ''
    for (let x = 0; x < FIELD.w; x++) {
      const owner = sim.trails.get(cellKey(mirror ? FIELD.w - 1 - x : x, y))
      row += owner === undefined ? '.' : owner === id ? 'Y' : 'O'
    }
    grid.push(row)
  }

  const you = sim.heads[id]
  const opp = sim.heads[oppId]
  return {
    field: { w: FIELD.w, h: FIELD.h },
    grid,
    you: { x: mx(you.x), y: you.y, dir: mdir(you.dir) },
    opp: { x: mx(opp.x), y: opp.y, dir: mdir(opp.dir) },
    tick,
    winner: null,
  }
}

function floodArea(sim, startX, startY, cap) {
  if (isBlocked(sim, startX, startY)) return 0
  const seen = new Set([cellKey(startX, startY)])
  const queue = [[startX, startY]]
  while (queue.length > 0 && seen.size < cap) {
    const [x, y] = queue.shift()
    for (const delta of Object.values(DIRS)) {
      const nx = x + delta.x
      const ny = y + delta.y
      const key = cellKey(nx, ny)
      if (seen.has(key) || isBlocked(sim, nx, ny)) continue
      seen.add(key)
      queue.push([nx, ny])
    }
  }
  return seen.size
}

function cpuDir(id, level, sim) {
  const head = sim.heads[id]
  const candidates = Object.keys(DIRS).filter(d => d !== REVERSE_DIR[head.dir])

  if (level === PLAYER_TYPES.CPU_EASY) {
    const delta = DIRS[head.dir]
    if (!isBlocked(sim, head.x + delta.x, head.y + delta.y)) return head.dir
    const free = candidates.filter(d => {
      const dd = DIRS[d]
      return !isBlocked(sim, head.x + dd.x, head.y + dd.y)
    })
    if (free.length === 0) return head.dir
    return free[Math.floor(Math.random() * free.length)]
  }

  // difficile: massimizza lo spazio raggiungibile
  let best = head.dir
  let bestArea = -1
  for (const d of candidates) {
    const dd = DIRS[d]
    const area = floodArea(sim, head.x + dd.x, head.y + dd.y, FLOOD_CAP)
    if (area > bestArea || (area === bestArea && d === head.dir)) {
      bestArea = area
      best = d
    }
  }
  return best
}

// ── Elementi DOM ─────────────────────────────────────────────
const statusDisplay = document.getElementById('status-display')
const startButton = document.getElementById('start-button')
const seriesRow = document.getElementById('series-row')
const seriesToggle = document.getElementById('series-toggle')
const seriesScore = document.getElementById('series-score')
const canvas = document.getElementById('tron-canvas')
const ctx = canvas.getContext('2d')

// ── Stato di gioco ───────────────────────────────────────────
const players = {
  P1: { type: PLAYER_TYPES.HUMAN, serial: null, lastSeen: 0 },
  P2: { type: PLAYER_TYPES.PICO, serial: null, lastSeen: 0 },
}

let sim = freshSim()
let tick = 0
let gamePhase = 'idle' // idle | playing | over
let gamePlayed = false
let series = null
let lastTickAt = 0

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

  document.getElementById(`emu-code-${id}`).value = BOT_TEMPLATES.tron

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
  serial.verbose = false // troppi messaggi al secondo per loggarli tutti
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
    const emu = new EmulatedPico(`Emu ${id}`, code, SILENCE_LIMIT_MS)
    await emu.start()
    emu.verbose = false
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
  players[id].lastSeen = performance.now()
  if (!(parsed.move in DIRS)) {
    if (gamePhase === 'playing') declareLoss(id, `direzione non valida (${JSON.stringify(parsed.move)})`)
    return
  }
  if (gamePhase === 'playing') {
    // il bot ragiona nel suo campo specchiato: rimappa il comando di P2
    sim.heads[id].dir = id === 'P2' ? MIRROR_DIR[parsed.move] : parsed.move
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
  const gameActive = gamePhase === 'playing'
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

// ── Tastiera ─────────────────────────────────────────────────
const KEY_DIRS = {
  P1: { w: 'up', W: 'up', s: 'down', S: 'down', a: 'left', A: 'left', d: 'right', D: 'right' },
  P2: { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' },
}

window.addEventListener('keydown', event => {
  if (gamePhase !== 'playing') return
  for (const id of ['P1', 'P2']) {
    if (players[id].type !== PLAYER_TYPES.HUMAN) continue
    const dir = KEY_DIRS[id][event.key]
    if (dir) {
      event.preventDefault()
      sim.heads[id].dir = dir
    }
  }
})

// ── Ciclo di gioco ───────────────────────────────────────────
function frame(now) {
  requestAnimationFrame(frame)
  if (gamePhase === 'playing' && now - lastTickAt >= TICK_MS) {
    lastTickAt = now
    sampleBots(now)
    if (gamePhase === 'playing') {
      tick++
      const winner = stepTron(sim)
      if (winner) {
        if (winner === 'TIE') endGame('TIE')
        else endGame(winner, `Il Giocatore ${playerNumber(otherId(winner))} si è schiantato.`)
      }
    }
  }
  draw()
}

function sampleBots(now) {
  for (const id of ['P1', 'P2']) {
    const player = players[id]
    if (isPicoLike(player.type)) {
      if (player.serial === null) {
        return declareLoss(id, 'bot disconnesso')
      }
      if (now - player.lastSeen > SILENCE_LIMIT_MS) {
        return declareLoss(id, `nessuna risposta da ${SILENCE_LIMIT_MS / 1000} secondi`)
      }
      player.serial.sendMessage(envelope(mirrorStateFor(id, sim, tick)))
    } else if (player.type === PLAYER_TYPES.CPU_EASY || player.type === PLAYER_TYPES.CPU_HARD) {
      sim.heads[id].dir = cpuDir(id, player.type, sim)
    }
  }
}

function bumpBotClocks() {
  const now = performance.now()
  for (const id of ['P1', 'P2']) players[id].lastSeen = now
}

// ── Flusso di partita ────────────────────────────────────────
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
  sim = freshSim()
  tick = 0
  lastTickAt = 0
  bumpBotClocks()
  gamePhase = 'playing'
  gamePlayed = true
  announceMatch()
  setStatus('Si corre!')
  updateControls()
}

function declareLoss(loserId, reason) {
  endGame(otherId(loserId), `Il Giocatore ${playerNumber(loserId)} perde: ${reason}.`)
}

function endGame(winnerId, lossMessage = null) {
  gamePhase = 'over'
  notifyBots(winnerId)

  if (winnerId === 'TIE') {
    setStatus('Schianto simultaneo: pareggio!')
  } else if (lossMessage) {
    setStatus(`${lossMessage} Vince il Giocatore ${playerNumber(winnerId)}!`)
  } else {
    setStatus(`Vince il Giocatore ${playerNumber(winnerId)}!`)
  }
  if (series) handleSeriesResult(winnerId)
  updateControls()
}

function notifyBots(winnerId) {
  for (const id of ['P1', 'P2']) {
    const player = players[id]
    if (!isPicoLike(player.type) || player.serial === null) continue
    player.serial.sendMessage(envelope({
      field: null,
      grid: null,
      you: null,
      opp: null,
      tick,
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
  setStatus(`Partita ${series.game}: si corre!`)
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

// ── Rendering ────────────────────────────────────────────────
const TRAIL_COLORS = { P1: '#5eb1ff', P2: '#ffb454' }

function draw() {
  const cw = canvas.width / FIELD.w
  const ch = canvas.height / FIELD.h

  ctx.fillStyle = '#0a0c12'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // griglia leggera
  ctx.strokeStyle = 'rgba(232, 234, 242, 0.04)'
  ctx.lineWidth = 1
  for (let x = 1; x < FIELD.w; x++) {
    ctx.beginPath()
    ctx.moveTo(x * cw, 0)
    ctx.lineTo(x * cw, canvas.height)
    ctx.stroke()
  }
  for (let y = 1; y < FIELD.h; y++) {
    ctx.beginPath()
    ctx.moveTo(0, y * ch)
    ctx.lineTo(canvas.width, y * ch)
    ctx.stroke()
  }

  // scie
  for (const [key, owner] of sim.trails) {
    const [x, y] = key.split(',').map(Number)
    ctx.fillStyle = TRAIL_COLORS[owner]
    ctx.globalAlpha = 0.55
    ctx.fillRect(x * cw + 1, y * ch + 1, cw - 2, ch - 2)
  }
  ctx.globalAlpha = 1

  // teste luminose
  for (const id of ['P1', 'P2']) {
    const head = sim.heads[id]
    ctx.save()
    ctx.shadowColor = TRAIL_COLORS[id]
    ctx.shadowBlur = 12
    ctx.fillStyle = TRAIL_COLORS[id]
    ctx.fillRect(head.x * cw, head.y * ch, cw, ch)
    ctx.restore()
  }

  if (gamePhase === 'idle') {
    ctx.fillStyle = 'rgba(232, 234, 242, 0.5)'
    ctx.font = '600 26px -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Premi «Inizia partita»', canvas.width / 2, canvas.height / 2 + 8)
  }
}

// ── Avvio ────────────────────────────────────────────────────
startButton.addEventListener('click', onStartClick)
updateControls()
requestAnimationFrame(frame)

// ── Busta di protocollo e integrazione torneo ────────────────
// Ogni messaggio porta la busta {game, match}; a inizio partita i bot
// ricevono un annuncio con la sola busta e i campi di gioco a null.
const GAME_ID = 'tron'
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
    player.serial.sendMessage(envelope({ field: null, grid: null, you: null, opp: null, tick: 0, winner: null }))
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
    serials[i].verbose = false
    serials[i].onmessage(line => handlePicoLine(id, line))
    serials[i].ondisconnect(() => { players[id].serial = null })
  })
  startGame()
}
