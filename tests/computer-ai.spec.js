import { test, expect } from '@playwright/test'

for (const [game, advanced, strategy] of [
  ['tictactoe', 'cpu-perfect', 'mosse successive'],
  ['forza4', 'cpu-minimax', 'mosse successive'],
  ['morra', 'cpu-counter', 'più spesso'],
  ['navale', 'cpu-hunter', 'colpi a segno'],
  ['arena', 'cpu-smart', 'tipi dei mostri'],
  ['othello', 'cpu-smart', 'angoli'],
]) {
  test(`${game}: l’AI è spiegata solo per il computer e segue il livello scelto`, async ({ page }) => {
    await page.goto(`/${game}/`)
    const opponent = page.locator('#setup .player-card').last()
    const explanation = opponent.locator('.computer-ai')
    const select = opponent.locator('select')
    await expect(explanation).toBeVisible()
    await expect(explanation).toContainText('intelligenza artificiale')
    await expect(explanation).toContainText('a caso')
    await expect(page.locator('#setup .player-card').first().locator('.computer-ai')).toBeHidden()
    await select.selectOption(advanced)
    await expect(explanation).toContainText(strategy)
    await select.selectOption('human')
    await expect(explanation).toBeHidden()
    await select.selectOption('pico')
    await expect(explanation).toBeHidden()
    await select.selectOption('cpu-random')
    await expect(explanation).toBeVisible()
    await page.setViewportSize({ width: 375, height: 812 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

test('il laboratorio distingue il proprio bot dall’AI avversaria', async ({ page }) => {
  await page.goto('/editor/')
  await expect(page.locator('.stage-caption')).toContainText('AI del computer')
  await expect(page.locator('#computer-strategy')).toBeHidden()
  await page.getByText('Come gioca il computer?', { exact: true }).click()
  await expect(page.locator('#computer-strategy')).toContainText('a caso')
  await page.locator('#lab-game').selectOption('arena')
  await expect(page.locator('#computer-strategy')).toContainText('regole semplici')
  await expect(page.locator('#cards-deck')).toBeVisible()
})
