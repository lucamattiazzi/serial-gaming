import { test, expect } from '@playwright/test'

const bot = `def rispondi(stato):
    board = stato.get("board")
    if board:
        return {"move": board.index("")}
`
const sockets = new WeakMap()

async function prepareBrowser(page, code = bot) {
  page.on('websocket', socket => {
    if (new URL(socket.url()).pathname === '/ws') sockets.set(page, socket)
  })
  await page.goto('/remote/')
  await expect(page.getByLabel('Dove gira il tuo bot?')).toBeVisible({ timeout: 3000 })
  await page.getByLabel('Dove gira il tuo bot?').selectOption('browser')
  await page.locator('[data-editor-for="browser-code"] .cm-content').fill(code)
  await page.getByRole('button', { name: 'Avvia bot Python' }).click()
  await expect(page.locator('#browser-status')).toContainText('Bot pronto', { timeout: 60000 })
}

async function playToEnd(host) {
  const finished = sockets.get(host).waitForEvent('framereceived', {
    predicate: ({ payload }) => {
      const message = JSON.parse(payload)
      return message.type === 'state' && !message.running
    },
    timeout: 10000,
  })
  await host.getByRole('button', { name: 'Inizia la sfida' }).click()
  const { payload } = await finished
  await expect.poll(() => host.locator('.remote-cell').allTextContents()).toEqual(JSON.parse(payload).board)
}

async function join(host, guest) {
  await host.getByRole('button', { name: 'Crea una stanza' }).click()
  await expect(host.locator('#share-code')).toHaveText(/^[A-F0-9]{10}$/)
  await guest.locator('#room-code').fill(await host.locator('#share-code').textContent())
  await guest.getByRole('button', { name: 'Entra', exact: true }).click()
  await expect(host.locator('#room-status')).toContainText('Entrambi i bot sono pronti')
}

for (const opponent of ['browser', 'Pico']) {
  test(`Python reale nel browser contro ${opponent}, con rivincita`, async ({ browser }) => {
    test.setTimeout(120000)
    const contexts = [await browser.newContext(), await browser.newContext()]
    const [host, guest] = await Promise.all(contexts.map(context => context.newPage()))
    try {
      await prepareBrowser(host)
      if (opponent === 'browser') await prepareBrowser(guest)
      else {
        await guest.goto('/remote/')
        await guest.evaluate(() => {
          PicoSerial.prototype.connect = async function () { this.isConnected = true }
          PicoSerial.prototype.sendMessage = async function (line) {
            const state = JSON.parse(line)
            if (state.board) setTimeout(() => this.messageHandler(JSON.stringify({ move: state.board.indexOf('') })), 30)
          }
        })
        await guest.getByRole('button', { name: 'Connetti RP2040' }).click()
      }
      await join(host, guest)
      for (let game = 0; game < 2; game++) {
        await playToEnd(host)
        await expect(host.locator('#match-status')).toContainText('Vince il bot')
        await expect(guest.locator('#match-status')).toContainText('Vince il bot')
        const board = await host.locator('.remote-cell').allTextContents()
        expect(board.filter(Boolean)).toHaveLength(7)
        expect(await guest.locator('.remote-cell').allTextContents()).toEqual(board)
      }
    } finally { await Promise.all(contexts.map(context => context.close())) }
  })
}

test('un ciclo infinito viene interrotto e il bot si può correggere e riavviare', async ({ page }) => {
  test.setTimeout(120000)
  await page.goto('/remote/')
  await expect(page.getByLabel('Dove gira il tuo bot?')).toBeVisible({ timeout: 3000 })
  await page.getByLabel('Dove gira il tuo bot?').selectOption('browser')
  await page.locator('[data-editor-for="browser-code"] .cm-content').fill('while True:\n    pass')
  await page.getByRole('button', { name: 'Avvia bot Python' }).click()
  await expect(page.locator('#browser-status')).toContainText('interrotto', { timeout: 65000 })
  await page.locator('[data-editor-for="browser-code"] .cm-content').fill(bot)
  await page.getByRole('button', { name: 'Avvia bot Python' }).click()
  await expect(page.locator('#browser-status')).toContainText('Bot pronto', { timeout: 60000 })
  await page.getByRole('button', { name: 'Ferma bot' }).click()
  await page.setViewportSize({ width: 375, height: 812 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('un bot bloccato durante il turno perde per timeout senza chiudere la stanza', async ({ browser }) => {
  test.setTimeout(120000)
  const contexts = [await browser.newContext(), await browser.newContext()]
  const [host, guest] = await Promise.all(contexts.map(context => context.newPage()))
  try {
    await prepareBrowser(host, 'def rispondi(stato):\n    if stato.get("board"):\n        while True:\n            pass')
    await prepareBrowser(guest)
    await join(host, guest)
    await host.getByRole('button', { name: 'Inizia la sfida' }).click()
    await expect(host.locator('#browser-status')).toContainText('Bot interrotto', { timeout: 10000 })
    await expect(host.locator('#match-status')).toContainText('Vince il bot O', { timeout: 10000 })
    await expect(guest.locator('#match-status')).toContainText('Vince il bot O')
    await expect(host.locator('#room-panel')).toBeVisible()
    await expect(host.locator('#start-match')).toBeDisabled()
    await host.locator('[data-editor-for="browser-code"] .cm-content').fill(bot)
    await host.getByRole('button', { name: 'Avvia bot Python' }).click()
    await expect(host.locator('#start-match')).toBeEnabled({ timeout: 60000 })
    await playToEnd(host)
    await expect(host.locator('#match-status')).toContainText('Vince il bot')
    expect((await host.locator('.remote-cell').allTextContents()).filter(Boolean)).toHaveLength(7)
  } finally { await Promise.all(contexts.map(context => context.close())) }
})

test('importa le carte del Laboratorio e conserva le modifiche al bot online', async ({ page }) => {
  await page.goto('/remote/')
  await page.evaluate(code => localStorage.setItem('serial-gaming:lab:tictactoe:cards-code', code), bot)
  await page.getByLabel('Dove gira il tuo bot?').selectOption('browser')
  await page.getByRole('button', { name: 'Usa le mie carte' }).click()
  await expect(page.locator('#browser-code')).toHaveValue(bot)
  const changed = bot + '\n# Strategia della squadra blu'
  await page.locator('[data-editor-for="browser-code"] .cm-content').fill(changed)
  await page.reload()
  await page.getByLabel('Dove gira il tuo bot?').selectOption('browser')
  await expect(page.locator('#browser-code')).toHaveValue(changed)
  await expect(page.locator('[data-editor-for="browser-code"] .cm-content')).toContainText('squadra blu')
})
