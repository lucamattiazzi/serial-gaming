import { test, expect } from '@playwright/test'

test('le cure sono limitate, precedono gli attacchi e non rianimano un KO', async ({ page }) => {
  await page.goto('/arena/')
  const result = await page.evaluate(() => {
    const b = makeBattle([0, 2, 4], [0, 2, 4])
    const mon = activeMonster(b, 'P1')
    const atFullHealth = validAction(b, 'P1', ['cura'])
    mon.hp = 50
    const canHeal = validAction(b, 'P1', ['cura'])
    const events = resolveTurn(b, { P1: ['cura'], P2: ['attacca', 1] }, () => 0)
    const afterAttack = mon.hp
    const malformed = validAction(b, 'P1', ['cura', 99])
    const replace = validAction(b, 'P1', ['cura'], true)
    resolveTurn(b, { P1: ['cura'], P2: ['difendi'] }, () => 0)
    mon.hp = 20
    const exhausted = validAction(b, 'P1', ['cura'])
    const left = b.heals.P1
    mon.hp = 0
    b.heals.P1 = 1
    return { atFullHealth, canHeal, afterAttack, healed: events[0].healed,
      malformed, replace, exhausted, left, knockedOut: validAction(b, 'P1', ['cura']) }
  })
  expect(result).toEqual({ atFullHealth: false, canHeal: true, afterAttack: 66, healed: 30,
    malformed: false, replace: false, exhausted: false, left: 0, knockedOut: false })
})

test('la mossa jolly supera la resistenza e i bot vedono cure ma non la panchina avversaria', async ({ page }) => {
  await page.goto('/arena/')
  const result = await page.evaluate(() => {
    battle = makeBattle([0, 2, 4], [0, 3, 5])
    return { roster: ROSTER.length, first: ROSTER[0].name, oldLast: ROSTER[7].name,
      best: bestMoveIndex(activeMonster(battle, 'P1'), activeMonster(battle, 'P2')),
      damages: [0, 1, 2].map(i => computeHit(battle, 'P1', i, false, () => 0).damage),
      state: stateFor('P1', 'battle') }
  })
  expect(result).toMatchObject({ roster: 12, first: 'Bracino', oldLast: 'Tuonotauro', best: 2, damages: [23, 14, 24] })
  expect(result.state.you.healsLeft).toBe(2)
  expect(result.state.opp.healsLeft).toBe(2)
  expect(result.state.opp).not.toHaveProperty('team')
})

test('due allenatori umani scelgono da tastiera e completano il primo turno', async ({ page }) => {
  await page.clock.install()
  await page.goto('/arena/')
  await page.locator('#type-P2').selectOption('human')
  await page.locator('#start-button').click()
  for (const trainer of [1, 2]) {
    await expect(page.locator('#draft-title')).toContainText(`Allenatore ${trainer}`)
    for (const name of ['Bracino', 'Ondina', 'Fogliolino']) {
      const card = page.getByRole('button', { name: new RegExp(name) })
      await card.press('Enter')
      await expect(card).toHaveAttribute('aria-pressed', 'true')
    }
    await page.locator('#draft-confirm').click()
  }
  for (const trainer of [1, 2]) {
    await expect(page.locator('#command-label')).toContainText(`Allenatore ${trainer}`)
    await expect(page.getByRole('button', { name: /Cura/ })).toBeDisabled()
    await page.getByRole('button', { name: /jolly/ }).click()
  }
  await page.clock.fastForward(5000)
  await expect(page.locator('#battle-log')).toContainText('24 danni')
  await expect(page.locator('#command-label')).toContainText('Allenatore 1')
  await expect(page.getByRole('button', { name: /Cura/ })).toBeEnabled()
  await expect(page.locator('#hptext-P1')).toContainText('56/80')
})

test('il bestiario e i comandi restano leggibili su mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/arena/')
  await page.locator('#start-button').click()
  await expect(page.locator('.roster-card')).toHaveCount(12)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('il Python delle carte usa cure e jolly senza invalidare i bot precedenti', async ({ page }) => {
  test.setTimeout(65000)
  await page.goto('/editor/?game=arena#carte')
  const moves = await page.evaluate(async () => {
    const game = LAB_GAMES.arena
    const code = game.compose(game.cards.cura.code + '\n' + game.cards.migliore.code)
    const { BrowserBot } = await import('/remote/browser-bot.js')
    const monster = { name: 'Bracino', type: 'fuoco', hp: 30, maxHp: 80, speed: 95, moves: [
      { type: 'fuoco', power: 45, accuracy: 0.7 },
      { type: 'fuoco', power: 27, accuracy: 1 },
      { type: 'normale', power: 24, accuracy: 1 },
    ] }
    const state = { game: 'arena', phase: 'battle', winner: null, turn: 0,
      you: { active: 0, healsLeft: 2, team: [monster] }, opp: { active: { ...monster, hp: 80 } } }
    const replies = []
    return await new Promise((resolve, reject) => {
      const bot = new BrowserBot(status => {
        if (status.startsWith('Bot pronto')) bot.sendState(state, 'heal')
        else if (/interrotto|Impossibile/.test(status)) reject(new Error(status))
      }, (id, reply) => {
        replies.push(reply.move)
        if (id === 'heal') {
          state.you.healsLeft = 0
          bot.sendState(state, 'jolly')
        } else if (id === 'jolly') {
          delete state.you.healsLeft // un vecchio arbitro non invia le cure
          state.you.team[0].moves.pop() // vecchio formato a due attacchi
          bot.sendState(state, 'legacy')
        } else {
          bot.stop()
          resolve(replies)
        }
      })
      bot.start(code)
    })
  })
  expect(moves).toEqual([['cura'], ['attacca', 2], ['attacca', 0]])
})

test('le nuove carte si trasformano in blocchi Python utilizzabili', async ({ page }) => {
  await page.goto('/editor/?game=arena#carte')
  await page.locator('#add-cards summary').click()
  await expect(page.locator('#cards-available')).toBeVisible()
  await page.getByRole('button', { name: /Cura se hai poca vita/ }).click()
  await page.getByRole('button', { name: /Sposta su:.*Cura se hai poca vita/ }).click()
  await page.getByRole('button', { name: /Rimuovi:.*attacco più efficace/ }).click()
  await page.getByRole('button', { name: /Sempre il colpo jolly/ }).click()
  await page.locator('.cards-code summary').click()
  await page.getByRole('button', { name: /Trasforma il mazzo in blocchi/ }).click()
  await expect(page.locator('#generated')).toContainText('return curati()')
  await expect(page.locator('#generated')).toContainText('return attacco_jolly()')
  await expect(page.locator('#blockly-div .blocklyWorkspace[role="region"]')).toBeVisible()
})

test('due bot via protocollo Pico completano una partita con mostri nuovi e mosse precedenti', async ({ page }) => {
  await page.goto('/arena/')
  const result = await page.evaluate(async () => {
    sleep = () => Promise.resolve() // accelera solo le pause delle animazioni
    let sawHeal = false
    let sawJolly = false
    let firstLog = null
    const makeBot = expanded => ({
      onmessage(handler) { this.handler = handler },
      ondisconnect() {},
      sendMessage(line) {
        const state = JSON.parse(line)
        let reply
        if (state.phase === 'draft') reply = { team: expanded ? [8, 9, 10] : [0, 4, 7] }
        else if (state.phase === 'replace') {
          reply = { move: ['cambia', state.you.team.findIndex((m, i) => m.hp > 0 && i !== state.you.active)] }
        } else if (state.phase === 'battle') {
          firstLog ??= battleLog.textContent
          const me = state.you.team[state.you.active]
          if (expanded && state.you.healsLeft > 0 && me.hp <= me.maxHp / 2) {
            reply = { move: ['cura'] }
            sawHeal = true
          } else {
            reply = { move: ['attacca', expanded ? 2 : 1] }
            if (expanded) sawJolly = true
          }
        }
        if (reply) queueMicrotask(() => this.handler(JSON.stringify(reply)))
      },
    })
    const winner = await new Promise(resolve => startExternalMatch([makeBot(true), makeBot(false)], resolve))
    return { winner, sawHeal, sawJolly, firstLog, status: statusDisplay.textContent, turns: battle.turn,
      revealed: ['P1', 'P2'].every(id => activeMonster(battle, id).seen) }
  })
  expect(['P1', 'P2', 'TIE']).toContain(result.winner)
  expect(result.sawHeal).toBe(true)
  expect(result.sawJolly).toBe(true)
  expect(result.firstLog).not.toContain('Bracino, Fogliolino, Tuonotauro')
  expect(result.revealed).toBe(true)
  expect(result.status).not.toContain('perde:')
  expect(result.turns).toBeGreaterThan(1)
  expect(result.turns).toBeLessThanOrEqual(60)
})
