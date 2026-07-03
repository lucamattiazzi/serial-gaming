// ── Laboratorio: livelli, giochi, prova contro la CPU, upload ──
const LEVELS = ['blocchi', 'python', 'carte']

// la CPU "gentile" contro cui provare il bot, per gioco
const TEST_CPU = {
  tictactoe: 'cpu-random',
  forza4: 'cpu-random',
  morra: 'cpu-random',
  pong: 'cpu-easy',
  tron: 'cpu-easy',
  navale: 'cpu-random',
  racetrack: 'cpu-easy',
  chess: 'cpu-random',
}
const GAME_PATH = {
  tictactoe: '../tictactoe/',
  forza4: '../forza4/',
  morra: '../morra/',
  pong: '../pong/',
  tron: '../tron/',
  navale: '../navale/',
  racetrack: '../racetrack/',
  chess: '../chess/',
}

const codeArea = document.getElementById('code')
const templateSelect = document.getElementById('template-select')
const gameSelect = document.getElementById('lab-game')
const gameToolbar = document.getElementById('game-toolbar')
const connectButton = document.getElementById('connect-button')
const connStatus = document.getElementById('conn-status')
const uploadButton = document.getElementById('upload-button')
const tryButton = document.getElementById('try-button')
const logEl = document.getElementById('log')
const generatedEl = document.getElementById('generated')
const generatedCarte = document.getElementById('generated-carte')
const cardsAvailable = document.getElementById('cards-available')
const cardsDeck = document.getElementById('cards-deck')
const testFrame = document.getElementById('test-frame')

// ── Gioco corrente (per i livelli Blocchi e Carte) ───────────
let currentGameId = gameSelect.value

function labGame() {
  return LAB_GAMES[currentGameId]
}

// ── Navigazione tra i livelli ────────────────────────────────
function currentLevel() {
  const hash = location.hash.replace('#', '')
  return LEVELS.includes(hash) ? hash : 'carte' // Carte è il livello di default
}

function showLevel() {
  const level = currentLevel()
  for (const name of LEVELS) {
    document.getElementById(`level-${name}`).hidden = name !== level
    document.querySelector(`nav a[data-level="${name}"]`).classList.toggle('active', name === level)
  }
  gameToolbar.hidden = level === 'python'
  if (workspace) Blockly.svgResize(workspace)
}

window.addEventListener('hashchange', showLevel)

// ── Livello Blocchi ──────────────────────────────────────────
let workspace = null
let blocklyGen = null
let blocklyReady = false
const savedWorkspaces = {} // gameId -> XML testo

function initBlockly() {
  if (typeof Blockly === 'undefined') {
    document.getElementById('blockly-div').textContent =
      'Impossibile caricare Blockly: serve una connessione a internet. I livelli Python e Carte funzionano comunque.'
    return
  }
  for (const game of Object.values(LAB_GAMES)) game.setupBlocks()
  blocklyGen = labBlockTools().gen
  blocklyReady = true
  injectWorkspace()
}

function workspaceXml() {
  const dom = Blockly.Xml.workspaceToDom(workspace)
  return Blockly.Xml.domToText(dom)
}

function injectWorkspace() {
  if (!blocklyReady) return
  if (workspace) {
    workspace.dispose()
  }
  const darkTheme = Blockly.Theme.defineTheme(`serialgaming-dark-${currentGameId}`, {
    base: Blockly.Themes.Zelos || Blockly.Themes.Classic,
    componentStyles: {
      workspaceBackgroundColour: '#171a23',
      toolboxBackgroundColour: '#1c2030',
      toolboxForegroundColour: '#e8eaf2',
      flyoutBackgroundColour: '#12141c',
      flyoutForegroundColour: '#e8eaf2',
      flyoutOpacity: 0.97,
      scrollbarColour: '#3a4157',
      insertionMarkerColour: '#4fd1c5',
      insertionMarkerOpacity: 0.5,
      markerColour: '#4fd1c5',
      cursorColour: '#4fd1c5',
    },
    fontStyle: { size: 12 },
  })
  workspace = Blockly.inject('blockly-div', {
    toolbox: labGame().toolbox,
    renderer: 'zelos',
    theme: darkTheme,
    zoom: { controls: true, startScale: 0.9 },
    grid: { spacing: 24, length: 2, colour: '#2c3245', snap: false },
    trashcan: true,
  })
  const textToDom = (Blockly.utils.xml && Blockly.utils.xml.textToDom) || Blockly.Xml.textToDom
  const xml = savedWorkspaces[currentGameId] || labGame().starterXml
  Blockly.Xml.domToWorkspace(textToDom(xml), workspace)
  workspace.addChangeListener(refreshGenerated)
  refreshGenerated()
}

function blocksCode() {
  if (!workspace || !blocklyGen) return null
  return labGame().compose(blocklyGen.workspaceToCode(workspace))
}

function refreshGenerated() {
  const code = blocksCode()
  if (code) generatedEl.textContent = code
}

// ── Cambio di gioco ──────────────────────────────────────────
gameSelect.addEventListener('change', () => {
  if (workspace) savedWorkspaces[currentGameId] = workspaceXml()
  currentGameId = gameSelect.value
  injectWorkspace()
  renderCards()
})

// ── Livello Python ───────────────────────────────────────────
codeArea.value = BOT_TEMPLATES.tictactoe

templateSelect.addEventListener('change', () => {
  codeArea.value = BOT_TEMPLATES[templateSelect.value]
})

// Tab nelle textarea di codice inserisce 4 spazi invece di cambiare campo
function enableTabIndent(textarea) {
  textarea.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return
    event.preventDefault()
    const { selectionStart, selectionEnd, value } = textarea
    textarea.value = value.slice(0, selectionStart) + '    ' + value.slice(selectionEnd)
    textarea.selectionStart = textarea.selectionEnd = selectionStart + 4
  })
}
enableTabIndent(codeArea)
enableTabIndent(generatedCarte)

// ── Livello Carte ────────────────────────────────────────────
const decks = {} // gameId -> array di chiavi carta

function currentDeck() {
  if (!decks[currentGameId]) decks[currentGameId] = [...labGame().starterDeck]
  return decks[currentGameId]
}

function cardsCode() {
  const cards = labGame().cards
  const body = currentDeck().map(key => cards[key].code).join('\n')
  return labGame().compose(body)
}

function renderCards() {
  const cards = labGame().cards
  const deck = currentDeck()

  cardsAvailable.innerHTML = ''
  for (const [key, card] of Object.entries(cards)) {
    if (deck.includes(key)) continue
    const button = document.createElement('button')
    button.className = 'card'
    button.innerHTML = `<strong>${card.label}</strong><span>${card.hint}</span>`
    button.addEventListener('click', () => {
      deck.push(key)
      renderCards()
    })
    cardsAvailable.appendChild(button)
  }
  if (cardsAvailable.children.length === 0) {
    cardsAvailable.innerHTML = '<p class="cards-empty">Tutte le carte sono nel tuo bot!</p>'
  }

  cardsDeck.innerHTML = ''
  deck.forEach((key, index) => {
    const item = document.createElement('li')
    item.className = 'card in-deck'
    item.innerHTML = `<strong>${cards[key].label}</strong><span>${cards[key].hint}</span>`
    const controls = document.createElement('div')
    controls.className = 'card-controls'
    for (const [symbol, action, enabled] of [
      ['▲', () => { [deck[index - 1], deck[index]] = [deck[index], deck[index - 1]] }, index > 0],
      ['▼', () => { [deck[index + 1], deck[index]] = [deck[index], deck[index + 1]] }, index < deck.length - 1],
      ['✕', () => { deck.splice(index, 1) }, true],
    ]) {
      const button = document.createElement('button')
      button.textContent = symbol
      button.disabled = !enabled
      button.addEventListener('click', () => {
        action()
        renderCards()
      })
      controls.appendChild(button)
    }
    item.appendChild(controls)
    cardsDeck.appendChild(item)
  })
  if (deck.length === 0) {
    cardsDeck.innerHTML = '<p class="cards-empty">Mazzo vuoto: il bot giocherà sempre a caso. Aggiungi qualche carta!</p>'
  }

  // riscrive il codice a partire dalle carte (le modifiche manuali vengono perse:
  // è il comportamento voluto — le carte sono la fonte finché non le tocchi più)
  generatedCarte.value = cardsCode()
}

// ── Il bot corrente (codice + gioco su cui provarlo) ─────────
function currentBot() {
  const level = currentLevel()
  if (level === 'blocchi') {
    return { code: blocksCode(), gameId: currentGameId }
  }
  if (level === 'carte') {
    // si usa ciò che è nell'area di codice: le carte lo generano, ma il bambino
    // può averlo modificato a mano — in quel caso vince la sua versione
    return { code: generatedCarte.value, gameId: currentGameId }
  }
  const template = templateSelect.value
  return {
    code: codeArea.value,
    gameId: GAME_PATH[template] ? template : 'forza4',
  }
}

// ── Log ──────────────────────────────────────────────────────
function log(message) {
  logEl.hidden = false
  logEl.textContent += message + '\n'
  logEl.scrollTop = logEl.scrollHeight
}

// ── Prova contro la CPU (emulatore + partita nell'iframe) ────
let testing = false

tryButton.addEventListener('click', async () => {
  if (testing) return
  const { code, gameId } = currentBot()
  if (!code) {
    log('Niente da provare: costruisci prima il bot.')
    return
  }
  testing = true
  tryButton.disabled = true
  logEl.textContent = ''
  log(`Preparo l'emulatore e avvio una partita di prova (${gameId})…`)

  let emu
  try {
    emu = new EmulatedPico('Bot di prova', code, 5000)
    await emu.start()
  } catch (error) {
    log(`Il bot non parte: ${error.message}`)
    testing = false
    tryButton.disabled = false
    return
  }

  testFrame.innerHTML = ''
  const iframe = document.createElement('iframe')
  iframe.src = GAME_PATH[gameId]
  iframe.addEventListener('load', () => {
    const target = iframe.contentWindow
    if (typeof target.startExternalMatch !== 'function') {
      log('La pagina del gioco non è pilotabile.')
      testing = false
      tryButton.disabled = false
      return
    }
    log('Si gioca! Il tuo bot ha il primo slot (sinistra / X / Giocatore 1).')
    target.startExternalMatch([emu, TEST_CPU[gameId]], winnerSlot => {
      if (winnerSlot === 'P1') log('🎉 Il tuo bot ha VINTO!')
      else if (winnerSlot === 'P2') log('La CPU ha vinto: si può fare di meglio!')
      else log('Pareggio.')
      emu.disconnect()
      testing = false
      tryButton.disabled = false
    })
  })
  testFrame.appendChild(iframe)
  iframe.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
})

// ── Connessione e upload sul Pico ────────────────────────────
const pico = new PicoSerial('Laboratorio')
let busy = false

function updateSerialControls() {
  const connected = pico.isConnected
  connStatus.textContent = connected ? 'connesso' : 'non connesso'
  connStatus.classList.toggle('connected', connected)
  connectButton.disabled = connected || busy
  uploadButton.disabled = !connected || busy
}

pico.ondisconnect(updateSerialControls)

connectButton.addEventListener('click', async () => {
  try {
    await pico.connect()
    log('RP2040 connesso.')
  } catch (error) {
    log(`Connessione fallita: ${error.message}`)
  }
  updateSerialControls()
})

uploadButton.addEventListener('click', async () => {
  const { code } = currentBot()
  if (!code) {
    log('Niente da caricare: costruisci prima il bot.')
    return
  }
  busy = true
  updateSerialControls()
  logEl.textContent = ''
  try {
    await pico.uploadMainPy(code, log)
    await pico.disconnect()
    log('Porta seriale liberata: ora vai alla pagina del gioco e premi "Connetti".')
  } catch (error) {
    log(`Errore: ${error.message}`)
    log('Suggerimento: riprova, o ricollega il Pico e riconnetti.')
  }
  busy = false
  updateSerialControls()
})

// ── Avvio ────────────────────────────────────────────────────
initBlockly()
renderCards()
showLevel()
updateSerialControls()
