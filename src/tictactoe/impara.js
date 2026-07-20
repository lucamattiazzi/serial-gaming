// ── La CPU che impara (stile MENACE, apprendimento per rinforzo) ──
// Si attiva aggiungendo #impara alla URL della pagina: compare il pannello
// e nei menu dei giocatori spunta «CPU che impara 🧠».
//
// L'idea (Donald Michie, 1961 — con delle scatole di fiammiferi!): per ogni
// situazione della scacchiera il bot tiene un peso per ogni mossa possibile
// e sceglie a sorte in proporzione ai pesi. A fine partita, le mosse fatte
// vengono premiate se ha vinto e punite se ha perso. Nessuna strategia
// scritta a mano: le regole "emergono" dall'esperienza.
//
// La memoria vive in localStorage: sopravvive al ricaricamento della pagina.

const MENACE_STORE_KEY = 'serial-gaming:menace-tris'
const MENACE_START_WEIGHT = 4
const MENACE_REWARD_WIN = 3
const MENACE_REWARD_TIE = 1
const MENACE_REWARD_LOSS = -1
const MENACE_TRAIN_GAMES = 50

let menace = loadMenace()
const menaceHistory = { X: [], O: [] } // mosse della partita in corso, per simbolo

function loadMenace() {
  try {
    const raw = localStorage.getItem(MENACE_STORE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* storage non disponibile */ }
  return { boxes: {}, games: 0, wins: 0, ties: 0, losses: 0, recent: [] }
}

function saveMenace() {
  try { localStorage.setItem(MENACE_STORE_KEY, JSON.stringify(menace)) } catch { /* ignora */ }
}

// La situazione vista dal bot: lui è sempre "O" (come i bot sul Pico),
// così quello che impara da X vale anche quando gioca da O.
function menaceKey(b, symbol) {
  return b.map(c => (c === '' ? '.' : c === symbol ? 'O' : 'X')).join('')
}

function menaceBox(key, b) {
  if (!menace.boxes[key]) {
    const weights = {}
    // come nel MENACE originale i pesi iniziali calano con la profondità:
    // a fine partita basta una sconfitta per scartare una mossa cattiva
    const empties = emptyIndexes(b)
    const start = empties.length >= 8 ? MENACE_START_WEIGHT
      : empties.length >= 6 ? 3 : empties.length >= 4 ? 2 : 1
    for (const i of empties) weights[i] = start
    menace.boxes[key] = weights
  }
  return menace.boxes[key]
}

// Estrazione a sorte pesata: le mosse premiate escono più spesso
function menaceMove(b, symbol) {
  const key = menaceKey(b, symbol)
  const box = menaceBox(key, b)
  const entries = Object.entries(box).filter(([i]) => b[i] === '')
  const total = entries.reduce((sum, [, w]) => sum + w, 0)
  let pick = entries[Math.floor(Math.random() * entries.length)]
  if (total > 0) {
    let r = Math.random() * total
    for (const entry of entries) {
      r -= entry[1]
      if (r <= 0) { pick = entry; break }
    }
  }
  const move = Number(pick[0])
  menaceHistory[symbol].push({ key, move })
  return move
}

function menaceLearn(symbol, winner) {
  const history = menaceHistory[symbol]
  if (history.length === 0) return
  const reward = winner === 'TIE' ? MENACE_REWARD_TIE
    : winner === symbol ? MENACE_REWARD_WIN : MENACE_REWARD_LOSS
  for (const { key, move } of history) {
    const box = menace.boxes[key]
    if (!box) continue
    box[move] = Math.max(0, (box[move] || 0) + reward)
    // situazione rimasta senza pesi: si riparte da 1, la curiosità non muore
    if (Object.values(box).every(w => w === 0)) {
      for (const i of Object.keys(box)) box[i] = 1
    }
  }
  history.length = 0
  const esito = winner === 'TIE' ? 'ties' : winner === symbol ? 'wins' : 'losses'
  menace.games++
  menace[esito]++
  menace.recent.push(esito)
  if (menace.recent.length > 100) menace.recent.shift()
  saveMenace()
}

// A fine partita il bot "apre le scatole" e aggiorna i pesi
const menacePrevEndGame = endGame
endGame = function (...args) {
  menacePrevEndGame(...args)
  const winner = args[0].winner
  for (const symbol of ['X', 'O']) {
    if (players[symbol].type === PLAYER_TYPES.CPU_LEARN) menaceLearn(symbol, winner)
    else menaceHistory[symbol].length = 0
  }
  renderMenacePanel()
}

// ── CPU perfetta con memoria (per le partite lampo) ──────────
// Stesso minimax di bestMove, ma con cache: 50 partite in un lampo.
const menaceScoreCache = new Map()

function menacePerfectMove(b, me) {
  let bestScore = -Infinity
  let best = []
  for (const i of emptyIndexes(b)) {
    b[i] = me
    const score = menaceScore(b, me, other(me), 1)
    b[i] = ''
    if (score > bestScore) {
      bestScore = score
      best = [i]
    } else if (score === bestScore) {
      best.push(i)
    }
  }
  return best[Math.floor(Math.random() * best.length)]
}

function menaceScore(b, me, turn, depth) {
  const key = b.join('|') + me + turn + depth
  if (menaceScoreCache.has(key)) return menaceScoreCache.get(key)
  const result = checkWinner(b)
  let score
  if (result) {
    score = result.winner === 'TIE' ? 0 : result.winner === me ? 10 - depth : depth - 10
  } else {
    const scores = emptyIndexes(b).map(i => {
      b[i] = turn
      const s = menaceScore(b, me, other(turn), depth + 1)
      b[i] = ''
      return s
    })
    score = turn === me ? Math.max(...scores) : Math.min(...scores)
  }
  menaceScoreCache.set(key, score)
  return score
}

// ── Partite lampo: il bot impara giocando in accelerata ──────
let menaceTraining = false

async function menaceTrain(games, opponentKind) {
  if (menaceTraining || gameActive) return
  menaceTraining = true
  updateMenaceButtons()
  const learner = 'O'
  for (let g = 0; g < games; g++) {
    const b = Array(9).fill('')
    let turn = learner // in allenamento muove per primo, come il MENACE del 1961
    let result = checkWinner(b)
    while (!result) {
      const move = turn === learner
        ? menaceMove(b, learner)
        : (opponentKind === 'perfect' ? menacePerfectMove(b, turn) : randomMove(b))
      b[move] = turn
      turn = other(turn)
      result = checkWinner(b)
    }
    menaceLearn(learner, result.winner)
    if (g % 10 === 9) {
      renderMenacePanel()
      await sleep(0) // respiro alla pagina: si vede il contatore salire
    }
  }
  menaceTraining = false
  updateMenaceButtons()
  renderMenacePanel()
}

// ── Pannello ─────────────────────────────────────────────────
function imparaActive() {
  return location.hash === '#impara'
}

function renderMenacePanel() {
  const panel = document.getElementById('impara-panel')
  if (!panel || panel.hidden) return
  document.getElementById('impara-games').textContent = `Partite giocate: ${menace.games}`
  document.getElementById('impara-record').textContent =
    `vinte ${menace.wins} · pari ${menace.ties} · perse ${menace.losses}`
  document.getElementById('impara-boxes').textContent =
    `situazioni imparate: ${Object.keys(menace.boxes).length}`
  const recent = menace.recent.slice(-30)
  const rate = recent.length
    ? Math.round(100 * recent.filter(r => r !== 'losses').length / recent.length)
    : 0
  document.getElementById('impara-recent').textContent = recent.length
    ? `nelle ultime ${recent.length} non perde il ${rate}% delle volte`
    : 'ancora nessuna partita: fallo allenare!'
  document.getElementById('impara-bar-fill').style.width = `${rate}%`
}

function updateMenaceButtons() {
  for (const id of ['impara-train-random', 'impara-train-perfect', 'impara-reset']) {
    document.getElementById(id).disabled = menaceTraining
  }
}

function setupImpara() {
  if (!imparaActive()) return
  document.getElementById('impara-panel').hidden = false
  for (const symbol of ['X', 'O']) {
    const select = document.getElementById(`type-${symbol}`)
    if (select && !select.querySelector('option[value="cpu-learn"]')) {
      const option = document.createElement('option')
      option.value = PLAYER_TYPES.CPU_LEARN
      option.textContent = 'CPU che impara 🧠'
      select.appendChild(option)
    }
  }
  renderMenacePanel()
}

document.getElementById('impara-train-random').addEventListener('click', () => {
  menaceTrain(MENACE_TRAIN_GAMES, 'random')
})
document.getElementById('impara-train-perfect').addEventListener('click', () => {
  menaceTrain(MENACE_TRAIN_GAMES, 'perfect')
})
document.getElementById('impara-reset').addEventListener('click', () => {
  if (!window.confirm('Il bot dimenticherà tutto quello che ha imparato. Sicuro?')) return
  menace = { boxes: {}, games: 0, wins: 0, ties: 0, losses: 0, recent: [] }
  saveMenace()
  renderMenacePanel()
})

window.addEventListener('hashchange', setupImpara)
setupImpara()
