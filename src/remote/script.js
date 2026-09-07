const el = id => document.getElementById(id)
const pico = new PicoSerial('Il tuo bot')
pico.verbose = false
let socket = null
let role = null
let room = null
let running = false
let requestId = null
let connecting = false
let deadline = null
let ready = { X: false, O: false }

function error(message) {
  el('remote-error').textContent = message
  el('remote-error').hidden = !message
}
function send(message) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
}
function isBotReady() {
  return pico.isConnected && (!pico.identity || pico.identity.bots?.includes('tictactoe'))
}
function updateControls() {
  const online = socket?.readyState === WebSocket.OPEN
  el('connect-pico').disabled = connecting || pico.isConnected || !('serial' in navigator)
  el('disconnect-pico').disabled = !pico.isConnected
  el('create-room').disabled = !online || !!room
  el('join-room').disabled = !online || !!room
  el('room-setup').hidden = !!room
  el('room-panel').hidden = !room
  el('start-match').hidden = role === 'O'
  el('start-match').disabled = !online || running || !ready.X || !ready.O
}
function publishReady() {
  if (room) send({ type: 'ready', ready: isBotReady() })
  el('pico-status').textContent = !pico.isConnected ? 'Nessuna scheda connessa.'
    : isBotReady() ? `Pico connesso${pico.identity?.name ? `: ${pico.identity.name}` : ''}. Bot pronto.`
    : 'Su questa scheda manca il bot del Tris. Caricalo dal Laboratorio.'
  updateControls()
}
pico.onidentity(publishReady)
pico.ondisconnect(() => {
  requestId = null
  publishReady()
})
pico.onmessage(line => {
  if (!requestId) return
  let reply
  try { reply = JSON.parse(line) } catch { return }
  if (!reply || typeof reply !== 'object' || !Object.hasOwn(reply, 'move')) return
  send({ type: 'move', requestId, move: reply.move })
  requestId = null
})
el('connect-pico').addEventListener('click', async () => {
  connecting = true
  error('')
  updateControls()
  try { await pico.connect() } catch (failure) { error(failure.message) }
  connecting = false
  publishReady()
})
el('disconnect-pico').addEventListener('click', () => pico.disconnect())
el('create-room').addEventListener('click', () => { error(''); send({ type: 'create' }) })
el('join-form').addEventListener('submit', event => {
  event.preventDefault()
  error('')
  send({ type: 'join', code: el('room-code').value.trim() })
})
el('start-match').addEventListener('click', () => { error(''); send({ type: 'start' }) })
el('leave-room').addEventListener('click', () => send({ type: 'leave' }))

for (let index = 0; index < 9; index++) {
  const cell = document.createElement('div')
  cell.className = 'remote-cell'
  cell.setAttribute('role', 'img')
  el('remote-board').appendChild(cell)
}
function renderState(message) {
  running = message.running
  deadline = message.deadline
  el('match-panel').hidden = false
  Array.from(el('remote-board').children).forEach((cell, index) => {
    const mark = message.board[index]
    cell.textContent = mark
    cell.dataset.mark = mark
    cell.setAttribute('aria-label', `Riga ${Math.floor(index / 3) + 1}, colonna ${index % 3 + 1}: ${mark || 'libera'}`)
  })
  el('match-status').textContent = running
    ? `Sta pensando il bot ${message.turn}${message.turn === role ? ' (il tuo)' : ' (avversario)'}…`
    : message.winner === 'TIE' ? 'Pareggio! Che cosa proveresti a cambiare?'
      : `Vince il bot ${message.winner}${message.winner === role ? ': il tuo!' : '.'}`
  if (!running) {
    requestId = null
    el('turn-time').textContent = message.reason || 'Partita conclusa. Potete sfidarvi di nuovo.'
  }
  updateControls()
}

socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`)
socket.addEventListener('open', () => {
  el('connection-status').textContent = 'Collegato al server delle sfide.'
  updateControls()
})
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  switch (message.type) {
    case 'joined':
      room = message.code
      role = message.role
      el('share-code').textContent = room
      el('match-panel').hidden = true
      publishReady()
      break
    case 'room':
      ready = message.ready
      running = message.running
      el('room-status').textContent = `Tu sei ${role}. ${!message.present.O ? 'In attesa dell’avversario.'
        : ready.X && ready.O ? 'Entrambi i bot sono pronti.' : 'Collegate entrambi i Pico.'}${role === 'O' ? ' Avvia la sfida chi ha creato la stanza.' : ''}`
      updateControls()
      break
    case 'bot-state':
      requestId = message.requestId
      if (pico.isConnected) pico.sendMessage(JSON.stringify(message.state))
      break
    case 'state': renderState(message); break
    case 'closed':
      room = null
      role = null
      running = false
      requestId = null
      deadline = null
      ready = { X: false, O: false }
      el('match-panel').hidden = true
      error(message.message)
      updateControls()
      break
    case 'error': error(message.message); break
  }
})
socket.addEventListener('close', () => {
  room = null
  running = false
  requestId = null
  deadline = null
  el('match-panel').hidden = true
  el('connection-status').textContent = 'Server scollegato. Ricarica la pagina per riconnetterti.'
  updateControls()
})
socket.addEventListener('error', () => error('Non riesco a raggiungere il server delle sfide.'))
setInterval(() => {
  if (running && deadline) el('turn-time').textContent = `Tempo rimasto: ${Math.max(0, (deadline - Date.now()) / 1000).toFixed(1)} s`
}, 100)
window.addEventListener('pagehide', () => { socket.close(); pico.disconnect() })
if (!('serial' in navigator)) el('pico-status').textContent = 'Per collegare il Pico usa Chrome o Edge su computer, in HTTPS.'
updateControls()
