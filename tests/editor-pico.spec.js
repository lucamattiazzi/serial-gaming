import { test, expect } from '@playwright/test'

test('il codice Python è evidenziato, modificabile e salvato', async ({ page }) => {
  await page.goto('/editor/#python')
  const editor = page.locator('[data-editor-for="code"] .cm-content')
  await expect(editor).toBeVisible()
  await editor.fill('def rispondi(state):\n    return {"move": 4}')
  await expect(editor.locator('span').first()).toBeVisible()
  await page.reload()
  await expect(editor).toHaveText('def rispondi(state):    return {"move": 4}')
  await page.locator('#template-select').selectOption('forza4')
  await page.locator('#template-select').selectOption('tictactoe')
  await expect(page.locator('#code')).toHaveValue('def rispondi(state):\n    return {"move": 4}')
})

test('il collegamento Pico si apre dal comando e riceve il bot corrente', async ({ page }) => {
  await page.goto('/editor/?game=forza4#python')
  await page.evaluate(() => {
    PicoSerial.prototype.connect = async function () { this.isConnected = true }
    PicoSerial.prototype.uploadFiles = async function (files) { window.uploadedFiles = files }
    PicoSerial.prototype.disconnect = async function () { this.isConnected = false }
  })
  await expect(page.locator('#connect-button')).toBeHidden()
  await page.locator('[data-editor-for="code"] .cm-content').fill('def rispondi(state):\n    return {"move": 2}')
  await page.locator('#bot-name').fill('Fulmine')
  await page.getByRole('link', { name: 'Carica sul Pico', exact: true }).click()
  await expect(page.locator('#level-python')).toBeVisible()
  await page.locator('#connect-button').click()
  await page.locator('#upload-button').click()
  const files = await page.evaluate(() => window.uploadedFiles)
  expect(files.map(file => file.name)).toEqual(['main.py', 'bot_forza4.py', 'bot_config.json'])
  expect(files[1].code).toContain('"move": 2')
  expect(JSON.parse(files[2].code)).toEqual({ name: 'Fulmine' })
  await expect(page.locator('#log')).toContainText('Porta seriale liberata')
  await expect(page.locator('#upload-button')).toBeDisabled()
})

test('il tema scuro è comune a home, giochi e laboratorio', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  for (const path of ['/', '/editor/', '/tictactoe/']) {
    await page.goto(path)
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('dark')
  }
})
