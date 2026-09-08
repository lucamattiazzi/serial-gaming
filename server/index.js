import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { resolve, sep, extname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { randomBytes, randomUUID } from 'node:crypto'
import { WebSocketServer, WebSocket } from 'ws'

const DIST = fileURLToPath(new URL('../dist/', import.meta.url))
const LINES = [[0,1,2], [3,4,5], [6,7,8], [0,3,6], [1,4,7], [2,5,8], [0,4,8], [2,4,6]]
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' }
const other = role => role === 'X' ? 'O' : 'X'
const send = (client, message) => {
  if (client?.socket.readyState === WebSocket.OPEN) client.socket.send(JSON.stringify(message))
}

/** Server per stanze Tris a due bot. I timer e la validità delle mosse sono dell'arbitro. */
export function createGameServer({ staticDir = DIST, moveTimeoutMs = 5000, publicOrigin = '' } = {}) {
  const root = resolve(staticDir)
  const rooms = new Map()
  const clients = new Set()
  const server = createServer(async (req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return }
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
      if (pathname === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}'); return }
      let file = resolve(root, '.' + pathname)
      if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end(); return }
      if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html')
      const data = await readFile(file)
      res.writeHead(200, {
        'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
        'Content-Length': data.length,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'same-origin',
      })
      res.end(req.method === 'HEAD' ? undefined : data)
    } catch { res.writeHead(404).end('Pagina non trovata') }
  })
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 })
  server.on('upgrade', (req, socket, head) => {
    const origin = req.headers.origin
    let allowed = false
    try {
      const url = new URL(origin)
      allowed = ['http:', 'https:'].includes(url.protocol) &&
        (url.host === req.headers.host || (publicOrigin && url.origin === publicOrigin))
    } catch { /* Origin mancante o non valido */ }
    if (req.url !== '/ws' || !allowed || clients.size >= 100) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      return
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws))
  })

  const broadcast = (room, message) => Object.values(room.players).forEach(client => send(client, message))
  const roomInfo = room => broadcast(room, {
    type: 'room', code: room.code, running: room.running,
    present: { X: true, O: !!room.players.O },
    ready: { X: room.players.X.ready, O: !!room.players.O?.ready },
  })
  function gameState(room, reason = '') {
    broadcast(room, { type: 'state', board: room.board, turn: room.turn, winner: room.winner,
      running: room.running, deadline: room.deadline, reason })
  }
  function botState(room, role, board, winner, requestId = null) {
    send(room.players[role], { type: 'bot-state', requestId, state: {
      game: 'tictactoe', match: room.match,
      board: board?.map(cell => !cell ? '' : cell === role ? 'O' : 'X') ?? null,
      lastMove: room.lastMove,
      winner: winner === 'TIE' || winner === null ? winner : winner === role ? 'O' : 'X',
    } })
  }
  function finish(room, winner, reason = '') {
    clearTimeout(room.timer)
    room.running = false
    room.winner = winner
    room.deadline = null
    room.requestId = null
    gameState(room, reason)
    for (const role of ['X', 'O']) botState(room, role, null, winner)
    roomInfo(room)
  }
  function nextTurn(room) {
    room.requestId = randomUUID()
    room.deadline = Date.now() + moveTimeoutMs
    room.timer = setTimeout(() => finish(room, other(room.turn), 'Il bot non ha risposto in tempo.'), moveTimeoutMs)
    gameState(room)
    botState(room, room.turn, room.board, null, room.requestId)
  }
  function closeRoom(room, message) {
    clearTimeout(room.timer)
    clearTimeout(room.expiry)
    rooms.delete(room.code)
    for (const client of Object.values(room.players)) {
      if (!client) continue
      client.room = null
      client.ready = false
      send(client, { type: 'closed', message })
    }
  }

  wss.on('connection', socket => {
    const client = { socket, room: null, role: null, ready: false, count: 0, since: Date.now(), alive: true }
    clients.add(client)
    socket.on('error', () => socket.terminate())
    socket.on('pong', () => { client.alive = true })
    socket.on('close', () => {
      clients.delete(client)
      if (client.room) closeRoom(client.room, 'Un partecipante si è disconnesso. Create una nuova stanza.')
    })
    socket.on('message', raw => {
      const fail = message => send(client, { type: 'error', message })
      if (Date.now() - client.since > 1000) { client.since = Date.now(); client.count = 0 }
      if (++client.count > 30) { socket.close(1008, 'Troppi messaggi'); return }
      let message
      try { message = JSON.parse(raw) } catch { fail('Messaggio non valido.'); return }
      if (!message || typeof message !== 'object' || Array.isArray(message)) { fail('Messaggio non valido.'); return }
      const room = client.room
      switch (message.type) {
        case 'create': {
          if (room) { fail('Sei già in una stanza.'); return }
          if (rooms.size >= 50) { fail('Il server è occupato. Riprova tra poco.'); return }
          let code
          do { code = randomBytes(5).toString('hex').toUpperCase() } while (rooms.has(code))
          const created = { code, players: { X: client, O: null }, running: false, timer: null, expiry: null }
          client.room = created
          client.role = 'X'
          rooms.set(code, created)
          created.expiry = setTimeout(() => closeRoom(created, 'La stanza è scaduta dopo 30 minuti.'), 30 * 60 * 1000)
          send(client, { type: 'joined', code, role: 'X' })
          roomInfo(created)
          return
        }
        case 'join': {
          if (room) { fail('Sei già in una stanza.'); return }
          const code = typeof message.code === 'string' ? message.code.trim().toUpperCase() : ''
          const joined = rooms.get(code)
          if (!joined) { fail('Stanza non trovata. Controlla il codice.'); return }
          if (joined.players.O) { fail('Questa stanza è già completa.'); return }
          client.room = joined
          client.role = 'O'
          joined.players.O = client
          send(client, { type: 'joined', code, role: 'O' })
          roomInfo(joined)
          return
        }
        case 'ready':
          if (!room || typeof message.ready !== 'boolean') { fail('Entra prima in una stanza.'); return }
          if (room.running) {
            if (!message.ready) closeRoom(room, 'Un bot è stato scollegato: partita interrotta.')
            return
          }
          client.ready = message.ready
          roomInfo(room)
          return
        case 'start':
          if (!room || client.role !== 'X') { fail('Può iniziare solo chi ha creato la stanza.'); return }
          if (room.running || !room.players.X.ready || !room.players.O?.ready) { fail('Preparate entrambi i bot prima di iniziare.'); return }
          Object.assign(room, { running: true, match: randomUUID(), board: Array(9).fill(''), turn: Math.random() < .5 ? 'X' : 'O', winner: null, lastMove: null })
          for (const role of ['X', 'O']) botState(room, role, null, null)
          roomInfo(room)
          nextTurn(room)
          return
        case 'move': {
          if (!room?.running || room.turn !== client.role || message.requestId !== room.requestId) { fail('Risposta fuori turno o relativa a un turno precedente.'); return }
          if (Date.now() >= room.deadline) { finish(room, other(client.role), 'Il bot non ha risposto in tempo.'); return }
          if (!Number.isInteger(message.move) || message.move < 0 || message.move > 8 || room.board[message.move]) {
            finish(room, other(client.role), 'Il bot ha scelto una mossa non valida.')
            return
          }
          clearTimeout(room.timer)
          room.board[message.move] = client.role
          room.lastMove = message.move
          if (LINES.some(line => line.every(index => room.board[index] === client.role))) { finish(room, client.role); return }
          if (room.board.every(Boolean)) { finish(room, 'TIE'); return }
          room.turn = other(client.role)
          nextTurn(room)
          return
        }
        case 'leave':
          if (room) closeRoom(room, 'Un partecipante ha lasciato la stanza.')
          return
        default: fail('Comando non riconosciuto.')
      }
    })
  })
  const heartbeat = setInterval(() => {
    for (const client of clients) {
      if (!client.alive) { client.socket.terminate(); continue }
      client.alive = false
      client.socket.ping()
    }
  }, 15000)
  heartbeat.unref()
  return {
    server,
    async close() {
      clearInterval(heartbeat)
      for (const room of rooms.values()) closeRoom(room, 'Il server si sta fermando.')
      for (const client of clients) client.socket.terminate()
      wss.close()
      await new Promise(resolve => server.close(resolve))
    },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const app = createGameServer({ publicOrigin: process.env.PUBLIC_ORIGIN || '' })
  const port = Number(process.env.PORT || 3001)
  app.server.listen(port, '127.0.0.1', () => console.log(`Serial Gaming: http://127.0.0.1:${port}`))
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => app.close().then(() => process.exit(0)))
}
