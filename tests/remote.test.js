import { test } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import WebSocket from 'ws'
import { createGameServer } from '../server/index.js'

async function setup(t, options) {
  const app = createGameServer(options)
  app.server.listen(0, '127.0.0.1')
  await once(app.server, 'listening')
  t.after(() => app.close())
  const origin = `http://127.0.0.1:${app.server.address().port}`
  async function connect() {
    const socket = new WebSocket(origin.replace('http', 'ws') + '/ws', { origin })
    const queue = [], waiters = []
    socket.on('message', raw => {
      const message = JSON.parse(raw)
      const index = waiters.findIndex(waiter => waiter.matches(message))
      if (index < 0) queue.push(message)
      else waiters.splice(index, 1)[0].resolve(message)
    })
    await once(socket, 'open')
    return {
      socket,
      send: message => socket.send(JSON.stringify(message)),
      next(type, predicate = () => true) {
        const matches = message => message.type === type && predicate(message)
        const index = queue.findIndex(matches)
        if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0])
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(`Messaggio ${type} non ricevuto`)), 2000)
          waiters.push({ matches, resolve: value => { clearTimeout(timer); resolve(value) } })
        })
      },
    }
  }
  return { connect, origin }
}

async function room(t, options) {
  const setupResult = await setup(t, options)
  const a = await setupResult.connect(), b = await setupResult.connect()
  a.send({ type: 'create' })
  const { code } = await a.next('joined')
  b.send({ type: 'join', code })
  await b.next('joined')
  a.send({ type: 'ready', ready: true })
  b.send({ type: 'ready', ready: true })
  await a.next('room', message => message.ready.X && message.ready.O)
  return { ...setupResult, a, b, code }
}

test('due Pico remoti completano una partita e ricevono lo stesso risultato', async t => {
  const { a, b } = await room(t)
  a.send({ type: 'start' })
  let winner = null
  for (let i = 0; i < 9 && !winner; i++) {
    const state = await a.next('state', message => message.running)
    const player = state.turn === 'X' ? a : b
    const request = await player.next('bot-state', message => message.requestId !== null)
    assert.equal(request.state.game, 'tictactoe')
    assert.equal(request.state.board.filter(cell => cell === 'O').length, state.board.filter(cell => cell === state.turn).length)
    player.send({ type: 'move', requestId: request.requestId, move: request.state.board.indexOf('') })
    if (i >= 4) {
      // Con la prima casella libera, una vittoria arriva al settimo turno.
      if (i === 6) winner = (await a.next('state', message => !message.running)).winner
    }
  }
  assert.ok(['X', 'O', 'TIE'].includes(winner))
  assert.equal((await b.next('state', message => !message.running)).winner, winner)
})

test('una terza persona non entra e il guest non può avviare la partita', async t => {
  const { connect, a, b, code } = await room(t)
  const third = await connect()
  third.send({ type: 'join', code })
  assert.match((await third.next('error')).message, /completa/)
  b.send({ type: 'start' })
  assert.match((await b.next('error')).message, /creato/)
  a.send({ type: 'start' })
  assert.equal((await a.next('state')).running, true)
})

test('risposte vecchie non cambiano la partita; una mossa illegale perde', async t => {
  const { a, b } = await room(t)
  a.send({ type: 'start' })
  const state = await a.next('state')
  const player = state.turn === 'X' ? a : b
  const request = await player.next('bot-state', message => message.requestId !== null)
  player.send({ type: 'ready', ready: true }) // un hello tardivo non interrompe la partita
  player.send({ type: 'move', requestId: 'vecchia-partita', move: 4 })
  assert.match((await player.next('error')).message, /turno/)
  player.send({ type: 'move', requestId: request.requestId, move: 99 })
  const result = await a.next('state', message => !message.running)
  assert.equal(result.winner, state.turn === 'X' ? 'O' : 'X')
  assert.deepEqual(result.board, Array(9).fill(''))
})

test('il server applica la scadenza e chiude la stanza alla disconnessione', async t => {
  const { a, b } = await room(t, { moveTimeoutMs: 80 })
  a.send({ type: 'start' })
  const state = await a.next('state')
  const result = await a.next('state', message => !message.running)
  assert.equal(result.winner, state.turn === 'X' ? 'O' : 'X')
  assert.match(result.reason, /tempo/)
  b.socket.close()
  assert.match((await a.next('closed')).message, /disconnesso/)
})

test('il server rifiuta WebSocket provenienti da un altro sito', async t => {
  const { origin } = await setup(t)
  const socket = new WebSocket(origin.replace('http', 'ws') + '/ws', { origin: 'https://altro-sito.example' })
  const [error] = await once(socket, 'error')
  assert.match(error.message, /403/)
})
