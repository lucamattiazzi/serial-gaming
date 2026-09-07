import { test, expect } from '@playwright/test'

test('due browser con Pico simulati si incontrano e vedono la stessa partita', async ({ browser }) => {
  const contexts = [await browser.newContext(), await browser.newContext()]
  const pages = await Promise.all(contexts.map(context => context.newPage()))
  try {
    for (const page of pages) {
      await page.goto('/remote/')
      await page.evaluate(() => {
        PicoSerial.prototype.connect = async function () { this.isConnected = true }
        PicoSerial.prototype.sendMessage = async function (line) {
          const state = JSON.parse(line)
          if (state.board) setTimeout(() => this.messageHandler(JSON.stringify({ move: state.board.indexOf('') })), 30)
        }
      })
      await page.getByRole('button', { name: 'Connetti RP2040' }).click()
    }
    const [host, guest] = pages
    await host.getByRole('button', { name: 'Crea una stanza' }).click()
    await expect(host.locator('#share-code')).toHaveText(/^[A-F0-9]{10}$/)
    const code = await host.locator('#share-code').textContent()
    await guest.locator('#room-code').fill(code)
    await guest.getByRole('button', { name: 'Entra', exact: true }).click()
    await expect(host.locator('#room-status')).toContainText('Entrambi i bot sono pronti')
    await host.getByRole('button', { name: 'Inizia la sfida' }).click()
    await expect(host.locator('#match-status')).toContainText('Vince il bot')
    await expect(guest.locator('#match-status')).toContainText('Vince il bot')
    expect(await host.locator('.remote-cell').allTextContents()).toEqual(await guest.locator('.remote-cell').allTextContents())
    await guest.getByRole('button', { name: 'Esci dalla stanza' }).click()
    await expect(host.locator('#remote-error')).toContainText('ha lasciato')
    await expect(host.getByRole('button', { name: 'Crea una stanza' })).toBeVisible()
  } finally { await Promise.all(contexts.map(context => context.close())) }
})

test('la sfida online non deborda su mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/remote/')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
