import { test, expect } from '@playwright/test'

test('istruzioni e prova sono affiancate e visibili su computer', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/editor/?game=tictactoe#carte')
  await expect(page.locator('#stage-panel')).toBeVisible()
  await expect(page.locator('#try-button')).toBeInViewport()
  const palette = await page.locator('#add-cards').boundingBox()
  const deck = await page.locator('#cards-deck').boundingBox()
  const stage = await page.locator('#stage-panel').boundingBox()
  expect(palette.x + palette.width).toBeLessThanOrEqual(deck.x)
  expect(deck.x + deck.width).toBeLessThanOrEqual(stage.x)
  expect(Math.abs(deck.y - stage.y)).toBeLessThan(240)
})

test('si ordinano le istruzioni da tastiera e la sequenza resta salvata', async ({ page }) => {
  await page.goto('/editor/?game=tictactoe#carte')
  const labels = page.locator('#cards-deck > li > strong')
  const initial = await labels.allTextContents()
  const down = page.locator('#cards-deck > li').first().getByRole('button', { name: /Sposta giù/ })
  await down.focus()
  await down.press('Enter')
  await expect(labels.nth(1)).toHaveText(initial[0])
  await page.reload()
  await expect(labels.nth(1)).toHaveText(initial[0])
})

test('la prova mostra il gioco scelto anche cambiando livello', async ({ page }) => {
  await page.goto('/editor/?game=tictactoe#carte')
  await expect(page.locator('#stage-game')).toHaveText('Tris')
  await page.locator('#lab-game').selectOption('forza4')
  await expect(page.locator('#stage-game')).toHaveText('Forza 4')
  await page.getByRole('link', { name: /Python/ }).click()
  await page.locator('#template-select').selectOption('morra')
  await expect(page.locator('#stage-game')).toHaveText('Morra cinese')
  await expect(page.locator('#play-yourself')).toHaveAttribute('href', '../morra/')
})

for (const width of [375, 768]) {
  test(`il laboratorio resta utilizzabile a ${width}px in ogni livello`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    for (const level of ['carte', 'blocchi', 'python']) {
      await page.goto(`/editor/?game=tictactoe#${level}`)
      await expect(page.locator('#try-button')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      const stage = await page.locator('#stage-panel').boundingBox()
      expect(stage.width).toBeLessThanOrEqual(width)
    }
  })
}

test('il tema chiaro segue il sistema e i blocchi cambiano tema senza perdere il lavoro', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/editor/#blocchi')
  await expect(page.locator('.blocklySvg')).toBeVisible()
  const code = await page.locator('#generated').textContent()
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('light')
  await expect(page.locator('.blocklySvg').first()).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('.blocklySvg').first()).not.toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect(page.locator('#generated')).toHaveText(code)
})

test('le carte già usate restano riconoscibili nella tavolozza', async ({ page }) => {
  await page.goto('/editor/')
  await expect(page.locator('#cards-available button')).toHaveCount(5)
  const available = page.locator('#cards-available button:not(:disabled)')
  await expect(available).toHaveCount(1)
  await available.click()
  await expect(page.locator('#cards-available button:disabled')).toHaveCount(5)
  await page.locator('#cards-deck > li').last().getByRole('button', { name: /Rimuovi/ }).click()
  await expect(available).toHaveCount(1)
})

test('un errore di avvio è spiegato vicino alla prova e si può riprovare', async ({ page }) => {
  await page.route('**/pyodide.js', route => route.abort())
  await page.goto('/editor/')
  await page.locator('#try-button').click()
  await expect(page.locator('#stage-status')).toContainText('non è partito')
  await expect(page.locator('#log')).toBeVisible()
  await expect(page.locator('#try-button')).toBeEnabled()
  await expect(page.locator('#lab-game')).toBeEnabled()
})

test('su telefono si raggiunge la prova senza uscire da Python', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/editor/#python')
  await page.getByRole('link', { name: 'Vai alla prova ↓' }).click()
  await expect(page.locator('#try-button')).toBeInViewport()
  await expect(page.locator('#try-button')).toBeFocused()
  await expect(page.locator('#level-python')).toBeVisible()
})

for (const game of ['tictactoe', 'forza4', 'morra', 'navale', 'arena', 'othello']) {
  test(`${game}: la partita entra nel riquadro di prova stretto`, async ({ page }) => {
    await page.setViewportSize({ width: 318, height: 480 })
    await page.goto(`/${game}/`)
    await page.evaluate(() => startExternalMatch(['cpu-random', 'cpu-random'], () => {}))
    await expect(page.locator('body')).toHaveClass(/external-match/)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
