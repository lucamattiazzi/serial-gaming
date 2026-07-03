// ── Configurazione ───────────────────────────────────────────
const TICK_MS = 100             // ogni quanto i bot ricevono lo stato e possono rispondere
const SILENCE_LIMIT_MS = 3000   // un bot muto per più di così perde la partita
const GAME_POINTS = 5           // punti per vincere una partita
const POINT_PAUSE_MS = 1000     // pausa dopo un punto, prima del servizio
const CPU_TICK_DEADZONE = 2.5   // isteresi della CPU facile, per non farla tremare
const SERIES_GAMES = 5          // partite della sfida tra due RP2040
const SERIES_TARGET = 3         // vittorie che chiudono la sfida in anticipo
const SERIES_PAUSE_MS = 2500    // pausa tra una partita e l'altra della sfida

// Geometria e fisica (unità logiche di campo, non pixel)
const FIELD = { w: 100, h: 60 }
const PADDLE_H = 12
const PADDLE_PLANE_X = 4        // distanza della faccia della racchetta dal bordo
const BALL_R = 1
const PADDLE_SPEED = 50         // unità al secondo
const BALL_SPEED_START = 40
const BALL_ACCEL = 1.05         // accelerazione a ogni rimbalzo su racchetta
const BALL_SPEED_MAX = 95
const MAX_BOUNCE_ANGLE = Math.PI / 3

const PLAYER_TYPES = {
  HUMAN: 'human',
  PICO: 'pico',
  EMU: 'emu',
  CPU_EASY: 'cpu-easy',
  CPU_HARD: 'cpu-hard',
}

// vero RP2040 o emulato: stesso protocollo, stesse regole
function isPicoLike(type) {
  return type === PLAYER_TYPES.PICO || type === PLAYER_TYPES.EMU
}

// ── Fisica (funzioni pure sullo stato `sim`) ─────────────────
// sim = { ball: {x, y, vx, vy}, paddles: { P1: {y, dir}, P2: {y, dir} } }

function leftPlane() {
  return PADDLE_PLANE_X + BALL_R
}

function rightPlane() {
  return FIELD.w - PADDLE_PLANE_X - BALL_R
}

function bounceOffPaddle(ball, paddleY, dirX) {
  const speed = Math.min(Math.hypot(ball.vx, ball.vy) * BALL_ACCEL, BALL_SPEED_MAX)
  const rel = (ball.y - paddleY) / (PADDLE_H / 2 + BALL_R) // -1..1
  const angle = rel * MAX_BOUNCE_ANGLE
  ball.vx = Math.cos(angle) * speed * dirX
  ball.vy = Math.sin(angle) * speed
}

// Avanza la simulazione di dt secondi; ritorna chi ha segnato ('P1'|'P2') o null
function stepPhysics(sim, dt) {
  for (const id of ['P1', 'P2']) {
    const paddle = sim.paddles[id]
    const half = PADDLE_H / 2
    paddle.y += paddle.dir * PADDLE_SPEED * dt
    paddle.y = Math.min(Math.max(paddle.y, half), FIELD.h - half)
  }

  const ball = sim.ball
  const prevX = ball.x
  ball.x += ball.vx * dt
  ball.y += ball.vy * dt

  // pareti alta e bassa
  if (ball.y < BALL_R) {
    ball.y = BALL_R
    ball.vy = Math.abs(ball.vy)
  }
  if (ball.y > FIELD.h - BALL_R) {
    ball.y = FIELD.h - BALL_R
    ball.vy = -Math.abs(ball.vy)
  }

  // racchette (controllo sull'attraversamento del piano, contro il tunneling)
  if (ball.vx < 0 && prevX >= leftPlane() && ball.x <= leftPlane()) {
    if (Math.abs(ball.y - sim.paddles.P1.y) <= PADDLE_H / 2 + BALL_R) {
      ball.x = leftPlane()
      bounceOffPaddle(ball, sim.paddles.P1.y, 1)
    }
  } else if (ball.vx > 0 && prevX <= rightPlane() && ball.x >= rightPlane()) {
    if (Math.abs(ball.y - sim.paddles.P2.y) <= PADDLE_H / 2 + BALL_R) {
      ball.x = rightPlane()
      bounceOffPaddle(ball, sim.paddles.P2.y, -1)
    }
  }

  if (ball.x < -3) return 'P2'
  if (ball.x > FIELD.w + 3) return 'P1'
  return null
}

function serveBall(sim, towardsId) {
  const dirX = towardsId === 'P1' ? -1 : 1
  const angle = (Math.random() * 2 - 1) * (Math.PI / 6)
  sim.ball.x = FIELD.w / 2
  sim.ball.y = FIELD.h / 2
  sim.ball.vx = Math.cos(angle) * BALL_SPEED_START * dirX
  sim.ball.vy = Math.sin(angle) * BALL_SPEED_START
}

// Dove incrocerà la palla il piano x=planeX, tenendo conto dei rimbalzi sulle pareti
function predictBallY(ball, planeX) {
  if (ball.vx === 0) return FIELD.h / 2
  const t = (planeX - ball.x) / ball.vx
  if (t <= 0) return FIELD.h / 2
  const raw = ball.y + ball.vy * t
  const span = FIELD.h - 2 * BALL_R
  let rel = (raw - BALL_R) % (2 * span)
  if (rel < 0) rel += 2 * span
  if (rel > span) rel = 2 * span - rel
  return rel + BALL_R
}

function cpuDir(id, level, sim) {
  const paddle = sim.paddles[id]
  const movingToward = id === 'P1' ? sim.ball.vx < 0 : sim.ball.vx > 0
  let targetY
  let deadzone
  if (level === PLAYER_TYPES.CPU_EASY) {
    targetY = sim.ball.y
    deadzone = CPU_TICK_DEADZONE
  } else {
    const plane = id === 'P1' ? leftPlane() : rightPlane()
    targetY = movingToward ? predictBallY(sim.ball, plane) : FIELD.h / 2
    deadzone = 1
  }
  if (targetY < paddle.y - deadzone) return -1
  if (targetY > paddle.y + deadzone) return 1
  return 0
}

// Ogni bot si vede sempre come racchetta SINISTRA: per P2 il campo è specchiato
function mirrorStateFor(id, sim, score) {
  const mirror = id === 'P2'
  const oppId = id === 'P1' ? 'P2' : 'P1'
  const round2 = v => Math.round(v * 100) / 100
  return {
    field: { w: FIELD.w, h: FIELD.h },
    ball: {
      x: round2(mirror ? FIELD.w - sim.ball.x : sim.ball.x),
      y: round2(sim.ball.y),
      vx: round2(mirror ? -sim.ball.vx : sim.ball.vx),
      vy: round2(sim.ball.vy),
    },
    you: { y: round2(sim.paddles[id].y), h: PADDLE_H },
    opp: { y: round2(sim.paddles[oppId].y), h: PADDLE_H },
    score: { you: score[id], opp: score[oppId] },
    winner: null,
  }
}

// ── Elementi DOM ─────────────────────────────────────────────
const statusDisplay = document.getElementById('status-display')
const startButton = document.getElementById('start-button')
const seriesRow = document.getElementById('series-row')
const seriesToggle = document.getElementById('series-toggle')
const seriesScore = document.getElementById('series-score')
const canvas = document.getElementById('pong-canvas')
const ctx = canvas.getContext('2d')

// ── Stato di gioco ───────────────────────────────────────────
const players = {
  P1: { type: PLAYER_TYPES.HUMAN, serial: null, lastSeen: 0 },
  P2: { type: PLAYER_TYPES.PICO, serial: null, lastSeen: 0 },
}

const sim = {
  ball: { x: FIELD.w / 2, y: FIELD.h / 2, vx: 0, vy: 0 },
  paddles: {
    P1: { y: FIELD.h / 2, dir: 0 },
    P2: { y: FIELD.h / 2, dir: 0 },
  },
}
let score = { P1: 0, P2: 0 }
let gamePhase = 'idle' // idle | playing | pause | over
let gamePlayed = false
let series = null // { score: {P1, P2}, game: n } durante una sfida al meglio di 5
let lastFrameAt = null
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

  document.getElementById(`emu-code-${id}`).value = BOT_TEMPLATES.pong

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
  serial.verbose = false // a 10 messaggi al secondo il log del traffico intaserebbe la console
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
    return // output di debug del bot
  }
  if (parsed == null || parsed.move == null) return
  players[id].lastSeen = performance.now()
  if (![-1, 0, 1].includes(parsed.move)) {
    if (gamePhase === 'playing' || gamePhase === 'pause') {
      declareLoss(id, `mossa non valida (${JSON.stringify(parsed.move)})`)
    }
    return
  }
  if (gamePhase === 'playing') sim.paddles[id].dir = parsed.move
}

function isReady(id) {
  const player = players[id]
  return !isPicoLike(player.type) || player.serial !== null
}

function seriesAvailable() {
  return isPicoLike(players.P1.type) && isPicoLike(players.P2.type)
}

function updateControls() {
  const gameActive = gamePhase === 'playing' || gamePhase === 'pause'
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

// ── Tastiera (giocatori umani) ───────────────────────────────
const KEY_BINDINGS = {
  P1: { up: ['w', 'W'], down: ['s', 'S'] },
  P2: { up: ['ArrowUp'], down: ['ArrowDown'] },
}
const pressedKeys = {
  P1: { up: false, down: false },
  P2: { up: false, down: false },
}

function handleKey(event, isDown) {
  for (const id of ['P1', 'P2']) {
    if (players[id].type !== PLAYER_TYPES.HUMAN) continue
    for (const dir of ['up', 'down']) {
      if (!KEY_BINDINGS[id][dir].includes(event.key)) continue
      event.preventDefault()
      pressedKeys[id][dir] = isDown
      sim.paddles[id].dir = (pressedKeys[id].down ? 1 : 0) - (pressedKeys[id].up ? 1 : 0)
    }
  }
}

window.addEventListener('keydown', event => handleKey(event, true))
window.addEventListener('keyup', event => handleKey(event, false))

// ── Ciclo di gioco ───────────────────────────────────────────
function frame(now) {
  requestAnimationFrame(frame)
  const dt = lastFrameAt === null ? 0 : Math.min((now - lastFrameAt) / 1000, 0.05)
  lastFrameAt = now

  if (gamePhase === 'playing') {
    if (now - lastTickAt >= TICK_MS) {
      lastTickAt = now
      sampleBots(now)
    }
    if (gamePhase === 'playing') { // sampleBots può aver chiuso la partita
      const scorer = stepPhysics(sim, dt)
      if (scorer) handlePoint(scorer)
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
      player.serial.sendMessage(envelope(mirrorStateFor(id, sim, score)))
    } else if (player.type === PLAYER_TYPES.CPU_EASY || player.type === PLAYER_TYPES.CPU_HARD) {
      sim.paddles[id].dir = cpuDir(id, player.type, sim)
    }
  }
}

function bumpBotClocks() {
  const now = performance.now()
  for (const id of ['P1', 'P2']) players[id].lastSeen = now
}

function handlePoint(scorer) {
  score[scorer]++
  sim.paddles.P1.dir = 0
  sim.paddles.P2.dir = 0
  if (score[scorer] >= GAME_POINTS) return endGame(scorer)

  setStatus(`Punto del Giocatore ${playerNumber(scorer)}! ${score.P1}–${score.P2}`)
  gamePhase = 'pause'
  const conceder = otherId(scorer)
  setTimeout(() => {
    if (gamePhase !== 'pause') return
    serveBall(sim, conceder)
    bumpBotClocks()
    gamePhase = 'playing'
    setStatus(`Si gioca! ${score.P1}–${score.P2}`)
  }, POINT_PAUSE_MS)
}

// ── Flusso di partita ────────────────────────────────────────
function onStartClick() {
  if (seriesAvailable() && seriesToggle.checked) {
    startSeries()
  } else {
    series = null
    seriesScore.hidden = true
    startGame(Math.random() < 0.5 ? 'P1' : 'P2')
  }
}

function startGame(servingTowards) {
  score = { P1: 0, P2: 0 }
  sim.paddles.P1 = { y: FIELD.h / 2, dir: 0 }
  sim.paddles.P2 = { y: FIELD.h / 2, dir: 0 }
  serveBall(sim, servingTowards)
  bumpBotClocks()
  lastTickAt = 0
  gamePhase = 'playing'
  gamePlayed = true
  announceMatch()
  setStatus('Si gioca! Primo a 5 punti.')
  updateControls()
}

function declareLoss(loserId, reason) {
  endGame(otherId(loserId), `Il Giocatore ${playerNumber(loserId)} perde: ${reason}.`)
}

function endGame(winnerId, lossMessage = null) {
  gamePhase = 'over'
  sim.ball.vx = 0
  sim.ball.vy = 0
  notifyBots(winnerId)

  if (lossMessage) {
    setStatus(`${lossMessage} Vince il Giocatore ${playerNumber(winnerId)}!`, true)
  } else {
    setStatus(`Vince il Giocatore ${playerNumber(winnerId)} ${score.P1}–${score.P2}!`)
  }
  if (series) handleSeriesResult(winnerId)
  updateControls()
}

// Notifica il risultato ai bot connessi, veri o emulati
function notifyBots(winnerId) {
  for (const id of ['P1', 'P2']) {
    const player = players[id]
    if (!isPicoLike(player.type) || player.serial === null) continue
    player.serial.sendMessage(envelope({
      field: null,
      ball: null,
      you: null,
      opp: null,
      score: { you: score[id], opp: score[otherId(id)] },
      winner: id === winnerId ? 'you' : 'opp',
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
  startGame(Math.random() < 0.5 ? 'P1' : 'P2')
  setStatus(`Partita ${series.game}: si gioca, primo a ${GAME_POINTS} punti.`)
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

// ── Rendering ────────────────────────────────────────────────
function draw() {
  const sx = canvas.width / FIELD.w
  const sy = canvas.height / FIELD.h

  ctx.fillStyle = '#0a0c12'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // linea centrale tratteggiata
  ctx.strokeStyle = 'rgba(232, 234, 242, 0.15)'
  ctx.lineWidth = 2
  ctx.setLineDash([10, 14])
  ctx.beginPath()
  ctx.moveTo(canvas.width / 2, 0)
  ctx.lineTo(canvas.width / 2, canvas.height)
  ctx.stroke()
  ctx.setLineDash([])

  // punteggio
  ctx.fillStyle = 'rgba(232, 234, 242, 0.35)'
  ctx.font = '700 52px "SF Mono", Menlo, Consolas, monospace'
  ctx.textAlign = 'center'
  ctx.fillText(String(score.P1), canvas.width * 0.4, 64)
  ctx.fillText(String(score.P2), canvas.width * 0.6, 64)

  // racchette
  const half = (PADDLE_H / 2) * sy
  ctx.fillStyle = '#5eb1ff'
  ctx.fillRect((PADDLE_PLANE_X - 1.5) * sx, sim.paddles.P1.y * sy - half, 1.5 * sx, PADDLE_H * sy)
  ctx.fillStyle = '#ffb454'
  ctx.fillRect((FIELD.w - PADDLE_PLANE_X) * sx, sim.paddles.P2.y * sy - half, 1.5 * sx, PADDLE_H * sy)

  // palla
  if (gamePhase === 'playing' || gamePhase === 'pause') {
    ctx.save()
    ctx.shadowColor = '#4fd1c5'
    ctx.shadowBlur = 14
    ctx.fillStyle = '#e8eaf2'
    ctx.beginPath()
    ctx.arc(sim.ball.x * sx, sim.ball.y * sy, BALL_R * 1.4 * sx, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  if (gamePhase === 'idle') {
    ctx.fillStyle = 'rgba(232, 234, 242, 0.5)'
    ctx.font = '600 26px -apple-system, sans-serif'
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
const GAME_ID = 'pong'
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
    player.serial.sendMessage(envelope({ field: null, ball: null, you: null, opp: null, score: null, winner: null }))
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
  startGame(Math.random() < 0.5 ? 'P1' : 'P2')
}
