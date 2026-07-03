// ── Configurazione ───────────────────────────────────────────
const DRAFT_TIME_LIMIT_MS = 3000 // tempo per scegliere la squadra
const MOVE_TIME_LIMIT_MS = 2000  // tempo per la mossa di ogni turno
const CPU_MOVE_DELAY_MS = 350
const EVENT_PAUSE_MS = 700       // pausa tra gli eventi del turno, per seguire la battaglia
const MAX_TURNS = 60             // oltre: decide chi ha più HP percentuali
const TEAM_SIZE = 3
const SERIES_GAMES = 5
const SERIES_TARGET = 3
const SERIES_PAUSE_MS = 2500

const PLAYER_TYPES = {
  HUMAN: 'human',
  PICO: 'pico',
  EMU: 'emu',
  CPU_RANDOM: 'cpu-random',
  CPU_SMART: 'cpu-smart',
}

function isPicoLike(type) {
  return type === PLAYER_TYPES.PICO || type === PLAYER_TYPES.EMU
}

// ── Il bestiario ─────────────────────────────────────────────
// Le emoji sono segnaposto: quando ci saranno le sprite basta cambiare
// spriteFor() qui sotto.
const ROSTER = [
  { name: 'Bracino', type: 'fuoco', emoji: '🦊', maxHp: 80, speed: 95, moves: [{ name: 'Vampata', type: 'fuoco', power: 40 }, { name: 'Graffio', type: 'normale', power: 25 }, { name: 'Scintilla', type: 'elettro', power: 30 }] },
  { name: 'Magmone', type: 'fuoco', emoji: '🐗', maxHp: 125, speed: 40, moves: [{ name: 'Eruzione', type: 'fuoco', power: 40 }, { name: 'Testata', type: 'normale', power: 25 }] },
  { name: 'Ondina', type: 'acqua', emoji: '🐬', maxHp: 105, speed: 75, moves: [{ name: 'Idrogetto', type: 'acqua', power: 40 }, { name: 'Spruzzo', type: 'normale', power: 25 }] },
  { name: 'Abissone', type: 'acqua', emoji: '🐋', maxHp: 125, speed: 35, moves: [{ name: 'Maremoto', type: 'acqua', power: 40 }, { name: 'Colpo di coda', type: 'normale', power: 25 }, { name: 'Alghette', type: 'erba', power: 30 }] },
  { name: 'Fogliolino', type: 'erba', emoji: '🦎', maxHp: 85, speed: 80, moves: [{ name: 'Frustata', type: 'erba', power: 40 }, { name: 'Foglielama', type: 'normale', power: 25 }] },
  { name: 'Quercione', type: 'erba', emoji: '🐢', maxHp: 125, speed: 30, moves: [{ name: 'Radicata', type: 'erba', power: 40 }, { name: 'Tronchetto', type: 'normale', power: 25 }, { name: 'Goccioloni', type: 'acqua', power: 30 }] },
  { name: 'Volterio', type: 'elettro', emoji: '🐦', maxHp: 82, speed: 85, moves: [{ name: 'Fulmine', type: 'elettro', power: 40 }, { name: 'Beccata', type: 'normale', power: 25 }] },
  { name: 'Tuonotauro', type: 'elettro', emoji: '🐂', maxHp: 90, speed: 55, moves: [{ name: 'Saetta', type: 'elettro', power: 40 }, { name: 'Cornata', type: 'normale', power: 25 }, { name: 'Fiammella', type: 'fuoco', power: 30 }] },
]

// Ciclo dei tipi: ognuno è forte (x2) sul successivo e debole (x0.5)
// sul precedente; i tipi "opposti" si fanno danno normale; stesso tipo x0.5.
// "normale" fa e riceve sempre danno pieno.
const TYPE_CYCLE = ['fuoco', 'erba', 'elettro', 'acqua']

function typeMultiplier(moveType, defenderType) {
  if (moveType === 'normale' || defenderType === 'normale') return 1
  const a = TYPE_CYCLE.indexOf(moveType)
  const d = TYPE_CYCLE.indexOf(defenderType)
  const distance = (d - a + 4) % 4
  if (distance === 1) return 2    // il tipo successivo nel ciclo: superefficace
  if (distance === 3) return 0.5  // il tipo precedente: resiste
  if (distance === 0) return 0.5  // stesso tipo: resiste
  return 1                        // tipo opposto
}

function spriteFor(monster) {
  return monster.emoji
}

// ── Motore di battaglia (funzioni pure sullo stato `battle`) ─
// battle = { teams: {P1: [mostri con hp], P2: [...]}, active: {P1: i, P2: i}, turn }

function makeBattle(picksP1, picksP2) {
  const build = picks => picks.map(i => ({
    ...ROSTER[i],
    moves: ROSTER[i].moves.map(m => ({ ...m })),
    hp: ROSTER[i].maxHp,
  }))
  return {
    teams: { P1: build(picksP1), P2: build(picksP2) },
    active: { P1: 0, P2: 0 },
    turn: 0,
  }
}

function validTeam(picks) {
  return Array.isArray(picks) && picks.length === TEAM_SIZE
    && picks.every(i => Number.isInteger(i) && i >= 0 && i < ROSTER.length)
    && new Set(picks).size === TEAM_SIZE
}

function activeMonster(battle, id) {
  return battle.teams[id][battle.active[id]]
}

function teamWiped(battle, id) {
  return battle.teams[id].every(m => m.hp <= 0)
}

// azione: ["attacca", indiceMossa] oppure ["cambia", indiceMostro]
function validAction(battle, id, action, replaceOnly = false) {
  if (!Array.isArray(action) || action.length !== 2) return false
  const [kind, index] = action
  if (!Number.isInteger(index)) return false
  if (kind === 'cambia') {
    const target = battle.teams[id][index]
    return target !== undefined && target.hp > 0 && index !== battle.active[id]
  }
  if (kind === 'attacca') {
    if (replaceOnly) return false
    const mon = activeMonster(battle, id)
    return mon.hp > 0 && mon.moves[index] !== undefined
  }
  return false
}

// Risolve un turno con entrambe le azioni; ritorna la lista di eventi
function resolveTurn(battle, actions) {
  const events = []
  battle.turn++

  // 1) i cambi hanno la priorità
  for (const id of ['P1', 'P2']) {
    if (actions[id][0] === 'cambia') {
      battle.active[id] = actions[id][1]
      events.push({ kind: 'switch', id, monster: activeMonster(battle, id).name })
    }
  }

  // 2) gli attacchi, in ordine di velocità (pari velocità: simultanei)
  const attackers = ['P1', 'P2'].filter(id => actions[id][0] === 'attacca')
  if (attackers.length === 2) {
    const s1 = activeMonster(battle, 'P1').speed
    const s2 = activeMonster(battle, 'P2').speed
    if (s1 === s2) {
      const hits = attackers.map(id => computeHit(battle, id, actions[id][1]))
      for (const hit of hits) applyHit(battle, hit, events)
      return events
    }
    attackers.sort((a, b) => activeMonster(battle, b).speed - activeMonster(battle, a).speed)
  }
  for (const id of attackers) {
    if (activeMonster(battle, id).hp <= 0) continue // messo KO prima di agire
    applyHit(battle, computeHit(battle, id, actions[id][1]), events)
  }
  return events
}

function computeHit(battle, id, moveIndex) {
  const oppId = id === 'P1' ? 'P2' : 'P1'
  const attacker = activeMonster(battle, id)
  const defender = activeMonster(battle, oppId)
  const move = attacker.moves[moveIndex]
  const multiplier = typeMultiplier(move.type, defender.type)
  return {
    id,
    oppId,
    attacker: attacker.name,
    move: move.name,
    damage: Math.round(move.power * multiplier),
    multiplier,
  }
}

function applyHit(battle, hit, events) {
  const defender = activeMonster(battle, hit.oppId)
  defender.hp = Math.max(0, defender.hp - hit.damage)
  events.push({ kind: 'hit', ...hit, defender: defender.name, ko: defender.hp <= 0 })
}

// null finché si gioca, altrimenti 'P1' | 'P2' | 'TIE'
function battleWinner(battle) {
  const w1 = teamWiped(battle, 'P1')
  const w2 = teamWiped(battle, 'P2')
  if (w1 && w2) return 'TIE'
  if (w1) return 'P2'
  if (w2) return 'P1'
  return null
}

function remainingRatio(battle, id) {
  return battle.teams[id].reduce((sum, m) => sum + m.hp / m.maxHp, 0)
}

// ── CPU ──────────────────────────────────────────────────────
function bestMoveIndex(attacker, defender) {
  let best = 0
  let bestDamage = -1
  attacker.moves.forEach((move, i) => {
    const damage = move.power * typeMultiplier(move.type, defender.type)
    if (damage > bestDamage) {
      bestDamage = damage
      best = i
    }
  })
  return best
}

function cpuAction(battle, id, level, replaceOnly) {
  const oppId = id === 'P1' ? 'P2' : 'P1'
  const me = activeMonster(battle, id)
  const foe = activeMonster(battle, oppId)
  const bench = battle.teams[id]
    .map((m, i) => ({ m, i }))
    .filter(({ m, i }) => m.hp > 0 && i !== battle.active[id])

  const matchup = candidate =>
    candidate.moves.reduce((best, mv) => Math.max(best, mv.power * typeMultiplier(mv.type, foe.type)), 0)
    - foe.moves.reduce((best, mv) => Math.max(best, mv.power * typeMultiplier(mv.type, candidate.type)), 0)

  if (replaceOnly) {
    if (bench.length === 0) return ['cambia', battle.active[id]] // non succede: arbitro chiude prima
    if (level === PLAYER_TYPES.CPU_RANDOM) {
      return ['cambia', bench[Math.floor(Math.random() * bench.length)].i]
    }
    bench.sort((a, b) => matchup(b.m) - matchup(a.m))
    return ['cambia', bench[0].i]
  }

  if (level === PLAYER_TYPES.CPU_RANDOM) {
    // quasi sempre attacca con una mossa a caso, ogni tanto cambia
    if (bench.length > 0 && Math.random() < 0.15) {
      return ['cambia', bench[Math.floor(Math.random() * bench.length)].i]
    }
    return ['attacca', Math.floor(Math.random() * me.moves.length)]
  }

  // CPU allenatore: cambia se il matchup è pessimo e in panchina c'è di meglio
  const myScore = matchup(me)
  if (bench.length > 0) {
    const best = [...bench].sort((a, b) => matchup(b.m) - matchup(a.m))[0]
    if (myScore < -20 && matchup(best.m) > myScore + 30) {
      return ['cambia', best.i]
    }
  }
  return ['attacca', bestMoveIndex(me, foe)]
}

function cpuDraft(level) {
  const indices = ROSTER.map((_, i) => i)
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[indices[i], indices[j]] = [indices[j], indices[i]]
  }
  if (level === PLAYER_TYPES.CPU_RANDOM) return indices.slice(0, TEAM_SIZE)
  // allenatore: 3 tipi diversi per coprire il ciclo
  const picks = []
  const seen = new Set()
  for (const i of indices) {
    if (seen.has(ROSTER[i].type)) continue
    seen.add(ROSTER[i].type)
    picks.push(i)
    if (picks.length === TEAM_SIZE) break
  }
  return picks
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
const arenaEl = document.getElementById('arena')
const draftPanel = document.getElementById('draft-panel')
const draftRoster = document.getElementById('draft-roster')
const draftConfirm = document.getElementById('draft-confirm')
const commandPanel = document.getElementById('command-panel')
const commandLabel = document.getElementById('command-label')
const moveButtons = document.getElementById('move-buttons')
const switchButtons = document.getElementById('switch-buttons')
const battleLog = document.getElementById('battle-log')

// ── Stato ────────────────────────────────────────────────────
const players = {
  P1: { type: PLAYER_TYPES.HUMAN, serial: null, pendingResolve: null, humanResolve: null },
  P2: { type: PLAYER_TYPES.PICO, serial: null, pendingResolve: null, humanResolve: null },
}

let battle = null
let history = [] // [{P1: azione|null, P2: azione|null}]
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

  document.getElementById(`emu-code-${id}`).value = BOT_TEMPLATES.arena

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
    setStatus(`Il Pico dell'Allenatore ${playerNumber(id)} si è disconnesso.`, true)
  })
  player.serial = serial
  setStatus(`RP2040 connesso per l'Allenatore ${playerNumber(id)}.`)
  updateControls()
}

async function connectEmu(id) {
  const player = players[id]
  const button = document.getElementById(`emu-start-${id}`)
  const code = document.getElementById(`emu-code-${id}`).value
  button.disabled = true
  setStatus("Preparo l'emulatore (il primo avvio scarica Pyodide, può volerci qualche secondo)…")
  try {
    const emu = new EmulatedPico(`Emu ${id}`, code, DRAFT_TIME_LIMIT_MS)
    await emu.start()
    emu.onmessage(line => handlePicoLine(id, line))
    emu.ondisconnect(() => {
      player.serial = null
      updateControls()
    })
    player.serial = emu
    setStatus(`Bot emulato pronto per l'Allenatore ${playerNumber(id)}.`)
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
  if (parsed.move == null && parsed.team == null) return
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
  startButton.textContent = gamePlayed ? 'Nuova sfida' : 'Inizia la sfida'
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

function logBattle(message) {
  battleLog.hidden = false
  battleLog.textContent += message + '\n'
  battleLog.scrollTop = battleLog.scrollHeight
}

// ── Rendering ────────────────────────────────────────────────
function renderBattle(hurtId = null) {
  if (!battle) return
  for (const id of ['P1', 'P2']) {
    const mon = activeMonster(battle, id)
    const sprite = document.getElementById(`sprite-${id}`)
    sprite.textContent = spriteFor(mon)
    sprite.classList.toggle('ko', mon.hp <= 0)
    sprite.classList.remove('hurt')
    if (hurtId === id) {
      void sprite.offsetWidth
      sprite.classList.add('hurt')
    }
    document.getElementById(`name-${id}`).innerHTML =
      `${mon.name} <span class="type-badge type-${mon.type}">${mon.type}</span>`
    const ratio = mon.hp / mon.maxHp
    const fill = document.getElementById(`hp-${id}`)
    fill.style.width = `${ratio * 100}%`
    fill.classList.toggle('mid', ratio <= 0.55 && ratio > 0.25)
    fill.classList.toggle('low', ratio <= 0.25)
    document.getElementById(`hptext-${id}`).textContent = `${mon.hp}/${mon.maxHp} HP · velocità ${mon.speed}`

    const bench = document.getElementById(`bench-${id}`)
    bench.innerHTML = ''
    battle.teams[id].forEach((m, i) => {
      const slot = document.createElement('span')
      slot.classList.add('bench-slot')
      if (m.hp <= 0) slot.classList.add('ko')
      if (i === battle.active[id]) slot.classList.add('in-field')
      slot.textContent = spriteFor(m)
      slot.title = `${m.name} — ${m.hp}/${m.maxHp} HP`
      bench.appendChild(slot)
    })
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

async function startGame() {
  battle = null
  history = []
  gameActive = true
  gamePlayed = true
  announceMatch()
  battleLog.textContent = ''
  battleLog.hidden = true
  arenaEl.classList.remove('idle')
  updateControls()
  setStatus('Draft: gli allenatori scelgono la squadra…')

  let picks
  try {
    picks = await Promise.all(['P1', 'P2'].map(getDraft))
  } catch (fault) {
    stopTimerDisplay()
    if (!gameActive) return
    return declareLoss(fault.id, fault.reason)
  }
  stopTimerDisplay()
  if (!gameActive) return

  battle = makeBattle(picks[0], picks[1])
  for (const id of ['P1', 'P2']) {
    logBattle(`Allenatore ${playerNumber(id)}: ${battle.teams[id].map(m => m.name).join(', ')}`)
  }
  renderBattle()
  battleLoop()
}

function getDraft(id) {
  const player = players[id]

  if (player.type === PLAYER_TYPES.HUMAN) {
    return humanDraft(id)
  }
  if (player.type === PLAYER_TYPES.CPU_RANDOM || player.type === PLAYER_TYPES.CPU_SMART) {
    return sleep(CPU_MOVE_DELAY_MS).then(() => cpuDraft(player.type))
  }
  if (player.serial === null) {
    return Promise.reject({ id, reason: 'bot disconnesso' })
  }
  startTimerDisplay(DRAFT_TIME_LIMIT_MS)
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      player.pendingResolve = null
      reject({ id, reason: 'tempo scaduto nel draft' })
    }, DRAFT_TIME_LIMIT_MS)
    player.pendingResolve = (parsed) => {
      clearTimeout(timeout)
      if (validTeam(parsed.team)) resolve(parsed.team)
      else reject({ id, reason: `squadra non valida (${JSON.stringify(parsed.team)})` })
    }
    player.serial.sendMessage(envelope({
      phase: 'draft',
      roster: ROSTER.map(m => ({ name: m.name, type: m.type, maxHp: m.maxHp, speed: m.speed, moves: m.moves })),
      picks: TEAM_SIZE,
      turn: 0,
      you: null,
      opp: null,
      history: null,
      winner: null,
    }))
  })
}

function humanDraft(id) {
  return new Promise(resolve => {
    const picked = new Set()
    draftPanel.hidden = false
    document.getElementById('draft-title').textContent =
      `Allenatore ${playerNumber(id)}: scegli ${TEAM_SIZE} mostri`
    draftRoster.innerHTML = ''
    ROSTER.forEach((mon, i) => {
      const card = document.createElement('div')
      card.classList.add('roster-card')
      card.innerHTML = `<div class="r-sprite">${spriteFor(mon)}</div>
        <div class="r-name">${mon.name}</div>
        <span class="type-badge type-${mon.type}">${mon.type}</span>
        <div class="r-stats">${mon.maxHp} HP · vel ${mon.speed}<br>${mon.moves.map(mv => mv.name).join(' · ')}</div>`
      card.addEventListener('click', () => {
        if (picked.has(i)) picked.delete(i)
        else if (picked.size < TEAM_SIZE) picked.add(i)
        card.classList.toggle('picked', picked.has(i))
        draftConfirm.disabled = picked.size !== TEAM_SIZE
      })
      draftRoster.appendChild(card)
    })
    draftConfirm.disabled = true
    draftConfirm.onclick = () => {
      draftPanel.hidden = true
      resolve([...picked])
    }
  })
}

async function battleLoop() {
  while (gameActive) {
    const winner = battleWinner(battle)
    if (winner) return endGame(winner)

    // sostituzioni forzate dopo i KO
    const mustReplace = ['P1', 'P2'].filter(id => activeMonster(battle, id).hp <= 0)
    if (mustReplace.length > 0) {
      let actions
      try {
        actions = await collectActions(mustReplace, true)
      } catch (fault) {
        stopTimerDisplay()
        if (!gameActive) return
        return declareLoss(fault.id, fault.reason)
      }
      stopTimerDisplay()
      if (!gameActive) return
      for (const [i, id] of mustReplace.entries()) {
        battle.active[id] = actions[i][1]
        logBattle(`▶ L'Allenatore ${playerNumber(id)} manda in campo ${activeMonster(battle, id).name}!`)
      }
      renderBattle()
      await sleep(EVENT_PAUSE_MS)
      continue
    }

    if (battle.turn >= MAX_TURNS) {
      const r1 = remainingRatio(battle, 'P1')
      const r2 = remainingRatio(battle, 'P2')
      return endGame(r1 === r2 ? 'TIE' : r1 > r2 ? 'P1' : 'P2',
        'Tempo scaduto: decide chi ha la squadra più in forma.')
    }

    setStatus(`Turno ${battle.turn + 1}: gli allenatori decidono…`)
    let actions
    try {
      actions = await collectActions(['P1', 'P2'], false)
    } catch (fault) {
      stopTimerDisplay()
      if (!gameActive) return
      return declareLoss(fault.id, fault.reason)
    }
    stopTimerDisplay()
    if (!gameActive) return

    history.push({ P1: actions[0], P2: actions[1] })
    const events = resolveTurn(battle, { P1: actions[0], P2: actions[1] })
    for (const event of events) {
      if (event.kind === 'switch') {
        logBattle(`▶ L'Allenatore ${playerNumber(event.id)} richiama e manda in campo ${event.monster}!`)
        renderBattle()
      } else {
        const eff = event.multiplier > 1 ? ' È superefficace!' : event.multiplier < 1 ? ' Non è molto efficace…' : ''
        logBattle(`💥 ${event.attacker} usa ${event.move}: ${event.damage} danni a ${event.defender}.${eff}${event.ko ? ` ${event.defender} è KO!` : ''}`)
        renderBattle(event.oppId)
      }
      await sleep(EVENT_PAUSE_MS)
      if (!gameActive) return
    }
  }
}

// raccoglie le azioni (simultanee) dai giocatori indicati
function collectActions(ids, replaceOnly) {
  const somePico = ids.some(id => isPicoLike(players[id].type))
  if (somePico) startTimerDisplay(MOVE_TIME_LIMIT_MS)
  return Promise.all(ids.map(id => getAction(id, replaceOnly)))
}

function getAction(id, replaceOnly) {
  const player = players[id]

  if (player.type === PLAYER_TYPES.HUMAN) {
    return humanAction(id, replaceOnly)
  }
  if (player.type === PLAYER_TYPES.CPU_RANDOM || player.type === PLAYER_TYPES.CPU_SMART) {
    return sleep(CPU_MOVE_DELAY_MS).then(() => cpuAction(battle, id, player.type, replaceOnly))
  }
  if (player.serial === null) {
    return Promise.reject({ id, reason: 'bot disconnesso' })
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      player.pendingResolve = null
      reject({ id, reason: 'tempo scaduto' })
    }, MOVE_TIME_LIMIT_MS)
    player.pendingResolve = (parsed) => {
      clearTimeout(timeout)
      if (validAction(battle, id, parsed.move, replaceOnly)) resolve(parsed.move)
      else reject({ id, reason: `azione non valida (${JSON.stringify(parsed.move)})` })
    }
    player.serial.sendMessage(envelope(stateFor(id, replaceOnly ? 'replace' : 'battle')))
  })
}

function humanAction(id, replaceOnly) {
  return new Promise(resolve => {
    commandPanel.hidden = false
    commandLabel.textContent = replaceOnly
      ? `Allenatore ${playerNumber(id)}: il tuo mostro è KO, manda in campo il prossimo!`
      : `Allenatore ${playerNumber(id)}: attacca o cambia.`
    moveButtons.innerHTML = ''
    switchButtons.innerHTML = ''

    const done = action => {
      commandPanel.hidden = true
      resolve(action)
    }

    if (!replaceOnly) {
      const mon = activeMonster(battle, id)
      const foe = activeMonster(battle, otherId(id))
      mon.moves.forEach((move, i) => {
        const button = document.createElement('button')
        button.classList.add('btn', 'small')
        const mult = typeMultiplier(move.type, foe.type)
        const hint = mult > 1 ? ' ↑' : mult < 1 ? ' ↓' : ''
        button.innerHTML = `${move.name} <span class="type-badge type-${move.type}">${move.type}</span> ${move.power}${hint}`
        button.addEventListener('click', () => done(['attacca', i]))
        moveButtons.appendChild(button)
      })
    }
    battle.teams[id].forEach((m, i) => {
      if (m.hp <= 0 || i === battle.active[id]) return
      const button = document.createElement('button')
      button.classList.add('btn', 'small')
      button.textContent = `Cambia: ${spriteFor(m)} ${m.name} (${m.hp} HP)`
      button.addEventListener('click', () => done(['cambia', i]))
      switchButtons.appendChild(button)
    })
  })
}

function sideView(id) {
  return {
    active: battle.active[id],
    team: battle.teams[id].map(m => ({
      name: m.name,
      type: m.type,
      hp: m.hp,
      maxHp: m.maxHp,
      speed: m.speed,
      moves: m.moves,
    })),
  }
}

function stateFor(id, phase) {
  return {
    phase,
    roster: null,
    picks: null,
    turn: battle.turn,
    you: sideView(id),
    opp: sideView(otherId(id)),
    history: history.map(h => ({ you: h[id], opp: h[otherId(id)] })),
    winner: null,
  }
}

function declareLoss(loserId, reason) {
  endGame(otherId(loserId), `L'Allenatore ${playerNumber(loserId)} perde: ${reason}.`)
}

function endGame(winnerId, extraMessage = null) {
  gameActive = false
  commandPanel.hidden = true
  draftPanel.hidden = true
  stopTimerDisplay()
  highlightTurn(null)
  if (battle) renderBattle()
  notifyBots(winnerId)

  const prefix = extraMessage ? `${extraMessage} ` : ''
  if (winnerId === 'TIE') {
    setStatus(`${prefix}Pareggio: due squadre leggendarie.`)
  } else {
    setStatus(`${prefix}🏆 Vince l'Allenatore ${playerNumber(winnerId)}!`, extraMessage !== null && extraMessage.includes('perde'))
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
      roster: null,
      picks: null,
      turn: battle ? battle.turn : 0,
      you: null,
      opp: null,
      history: null,
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
  setStatus(`Sfida ${series.game}: draft in corso…`)
}

function handleSeriesResult(winnerId) {
  if (winnerId === 'P1' || winnerId === 'P2') series.score[winnerId]++
  updateSeriesScoreboard()

  const { P1, P2 } = series.score
  const finished = P1 >= SERIES_TARGET || P2 >= SERIES_TARGET || series.game >= SERIES_GAMES
  if (!finished) {
    setStatus(`${statusDisplay.textContent} Prossima sfida tra poco…`)
    setTimeout(nextSeriesGame, SERIES_PAUSE_MS)
    return
  }

  if (P1 === P2) {
    setStatus(`Serie finita in parità: ${P1} a ${P2}!`)
  } else {
    const champion = P1 > P2 ? 1 : 2
    setStatus(`L'Allenatore ${champion} vince la serie ${Math.max(P1, P2)} a ${Math.min(P1, P2)}!`)
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
  timerEl.hidden = false
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
  timerEl.hidden = true
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Avvio ────────────────────────────────────────────────────
startButton.addEventListener('click', onStartClick)
updateControls()

// ── Busta di protocollo e integrazione torneo ────────────────
const GAME_ID = 'arena'
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
    player.serial.sendMessage(envelope({
      phase: null, roster: null, picks: null, turn: 0,
      you: null, opp: null, history: null, winner: null,
    }))
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
