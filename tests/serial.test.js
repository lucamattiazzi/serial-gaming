import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

function createPico() {
  const context = vm.createContext({ TextEncoder, TextDecoder, btoa, setTimeout, clearTimeout, console })
  const Pico = vm.runInContext(readFileSync(new URL('../src/picoserial.js', import.meta.url), 'utf8') + '\nPicoSerial', context)
  const pico = new Pico('Test')
  pico.verbose = false
  pico._sleep = async () => {}
  return pico
}

function rawDevice(pico, wrongSize = false) {
  const files = new Map()
  const controls = []
  let command = '', current = null
  pico.isConnected = true
  pico.writer = { async write(bytes) {
    const text = new TextDecoder().decode(bytes)
    controls.push(text)
    if (text.includes('\x01')) { pico._feedRaw('raw REPL; CTRL-B to exit\r\n>'); return }
    if (text.includes('\x02') || text.includes('\x03')) return
    if (text !== '\x04') { command += text; return }
    let stdout = ''
    const file = command.match(/f=open\('([^']+)'/)
    if (file) { current = file[1]; files.set(current, Buffer.alloc(0)) }
    const chunk = command.match(/a2b_base64\('([^']+)'/)
    if (chunk) files.set(current, Buffer.concat([files.get(current), Buffer.from(chunk[1], 'base64')]))
    const stat = command.match(/os.stat\('([^']+)'/)
    if (stat) stdout = String(wrongSize ? -1 : files.get(stat[1]).length)
    pico._feedRaw(`OK${stdout}\x04\x04>`)
    command = ''
  }, releaseLock() {} }
  return { files, controls }
}

test('upload raw REPL: scrive esattamente i file UTF-8, li verifica e riavvia', async () => {
  const pico = createPico()
  const { files, controls } = rawDevice(pico)
  const code = '# strategia più veloce 🦊\n'.repeat(30)
  await pico.uploadFiles([{ name: 'main.py', code: '# router' }, { name: 'bot_tictactoe.py', code }])
  assert.equal(files.get('bot_tictactoe.py').toString(), code)
  assert.equal(files.get('main.py').toString(), '# router')
  assert.deepEqual(controls.slice(-2), ['\x02', '\x04'])
})

test('un file incompleto non viene dichiarato caricato con successo', async () => {
  const pico = createPico()
  rawDevice(pico, true)
  await assert.rejects(pico.uploadFiles([{ name: 'bot_tictactoe.py', code: '# bot' }]), /caricamento incompleto/)
})

test('la fine del flusso USB libera la connessione e avvisa la UI', async () => {
  const pico = createPico()
  let disconnected = 0, closed = 0
  pico.isConnected = true
  pico.reader = { read: async () => ({ done: true }), cancel: async () => {}, releaseLock() {} }
  pico.writer = { releaseLock() {} }
  pico.port = { close: async () => { closed++ } }
  pico.ondisconnect(() => disconnected++)
  await pico.readFromPort()
  assert.equal(pico.isConnected, false)
  assert.equal(disconnected, 1)
  assert.equal(closed, 1)
})

test('le risposte Unicode restano integre anche tra due pacchetti USB', async () => {
  const pico = createPico()
  const bytes = new TextEncoder().encode('{"regola":"città","move":4}\n')
  const split = bytes.indexOf(0xc3) + 1
  const chunks = [bytes.slice(0, split), bytes.slice(split)]
  const lines = []
  pico.isConnected = true
  pico.reader = { read: async () => chunks.length ? { value: chunks.shift(), done: false } : { done: true }, cancel: async () => {}, releaseLock() {} }
  pico.onmessage(line => lines.push(line))
  await pico.readFromPort()
  assert.equal(JSON.parse(lines[0]).regola, 'città')
})
