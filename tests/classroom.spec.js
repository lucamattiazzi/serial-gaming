import { test, expect } from '@playwright/test'

test('la home offre un primo passo e conserva la navigazione', async ({ page }) => {
  await page.goto('/#spiegazione')
  await expect(page.getByRole('heading', { name: 'Un bot è un compagno a cui insegni a giocare.' })).toBeVisible()
  await page.getByRole('link', { name: 'Giochi', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Crea il tuo primo bot' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Un bot è un compagno a cui insegni a giocare.' })).toBeVisible()
})

test('i controlli nascosti restano nascosti anche con layout flex', async ({ page }) => {
  await page.goto('/tictactoe/')
  await expect(page.locator('#emu-row-X')).toBeHidden()
  await expect(page.locator('#series-row')).toBeHidden()
  await expect(page.locator('#impara-panel')).toBeHidden()
})

test('il Tris parte senza hardware e si gioca da tastiera senza fretta', async ({ page }) => {
  await page.clock.install()
  await page.goto('/tictactoe/')
  await page.getByRole('button', { name: 'Inizia partita', exact: true }).click()
  const cell = page.getByRole('button', { name: 'Riga 1, colonna 1: libera', exact: true })
  await cell.focus()
  await page.clock.fastForward(11000)
  await expect(page.locator('#status-display')).toContainText('Tocca a te')
  await cell.press('Enter')
  await expect(page.getByRole('button', { name: 'Riga 1, colonna 1: X', exact: true })).toHaveText('X')
})

for (const game of ['forza4', 'morra', 'navale', 'arena', 'othello']) {
  test(`${game}: si può cominciare senza una scheda`, async ({ page }) => {
    await page.goto(`/${game}/`)
    await expect(page.locator('#start-button')).toBeEnabled()
    await expect(page.locator('#setup select').last()).toHaveValue('cpu-random')
  })
}

test('le strategie dei blocchi restano dopo il ricaricamento', async ({ page }) => {
  await page.goto('/editor/?game=tictactoe#carte')
  await page.getByRole('button', { name: /Rimuovi:.*Vinci se puoi/ }).click()
  await page.locator('.cards-code summary').click()
  await page.getByRole('button', { name: /Trasforma il mazzo in blocchi/ }).click()
  await expect(page.locator('#level-blocchi')).toBeVisible()
  const code = await page.locator('#generated').textContent()
  await page.reload()
  await expect(page.locator('#generated')).toHaveText(code)
  await expect(page.locator('#generated')).not.toBeEmpty()
})

test('la prova completa una partita reale e permette di riprovare', async ({ page }) => {
  test.setTimeout(60000)
  await page.goto('/editor/?game=tictactoe#carte')
  const button = page.getByRole('button', { name: '▶ Prova il bot', exact: true })
  await button.click()
  await expect(page.locator('#log')).toContainText(/VINTO|Questa volta|Pareggio/, { timeout: 50000 })
  await expect(page.frameLocator('iframe').locator('#setup')).toBeHidden()
  await expect(button).toBeEnabled()
})

test('le carte e le modifiche al codice sopravvivono al ricaricamento', async ({ page }) => {
  await page.goto('/editor/?game=tictactoe#carte')
  await expect(page.locator('#lab-game')).toHaveValue('tictactoe')
  await page.locator('#cards-deck .card-controls button').last().click()
  const count = await page.locator('#cards-deck > li').count()
  await page.locator('.cards-code summary').click()
  await page.locator('[data-editor-for="generated-carte"] .cm-content').fill('# la mia strategia\ndef rispondi(state):\n    return None')
  await page.reload()
  await expect(page.locator('#cards-deck > li')).toHaveCount(count)
  await expect(page.locator('#generated-carte')).toHaveValue('# la mia strategia\ndef rispondi(state):\n    return None')
})

test('cambiare template Python conserva il lavoro di ciascun gioco', async ({ page }) => {
  await page.goto('/editor/#python')
  await page.locator('[data-editor-for="code"] .cm-content').fill('# il mio bot del tris')
  await page.locator('#template-select').selectOption('forza4')
  await page.locator('[data-editor-for="code"] .cm-content').fill('# il mio bot di forza 4')
  await page.locator('#template-select').selectOption('tictactoe')
  await expect(page.locator('#code')).toHaveValue('# il mio bot del tris')
  await page.reload()
  await expect(page.locator('#code')).toHaveValue('# il mio bot del tris')
})

test('le carte funzionano anche quando Blockly non è raggiungibile', async ({ page }) => {
  await page.route('**/npm/blockly*/**', route => route.abort())
  await page.goto('/editor/')
  await expect(page.locator('#level-carte')).toBeVisible()
  await expect(page.locator('#cards-deck > li')).not.toHaveCount(0)
  await page.getByRole('link', { name: /Blocchi/ }).click()
  await expect(page.locator('#blockly-div')).toContainText('Impossibile caricare Blockly')
})

test('un download parziale di Blockly non blocca le carte', async ({ page }) => {
  await page.route('**/python_compressed.js', route => route.abort())
  await page.goto('/editor/')
  await expect(page.locator('#cards-deck > li')).not.toHaveCount(0)
  await page.getByRole('link', { name: /Blocchi/ }).click()
  await expect(page.locator('#blockly-div')).toContainText('Impossibile caricare Blockly')
})

test('home e laboratorio non debordano su uno schermo piccolo', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  for (const path of ['/', '/editor/', '/tictactoe/']) {
    await page.goto(path)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})
