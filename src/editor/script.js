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
  othello: 'cpu-random',
  arena: 'cpu-random',
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
  othello: '../othello/',
  arena: '../arena/',
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

function readDraft(kind, gameId) {
  try {
    return JSON.parse(localStorage.getItem(`serial-gaming:lab:${gameId}:${kind}`))
  } catch { return null }
}

function saveDraft(kind, gameId, value) {
  const status = document.getElementById('save-status')
  try {
    localStorage.setItem(`serial-gaming:lab:${gameId}:${kind}`, JSON.stringify(value))
    status.textContent = 'Salvato in questo browser'
  } catch {
    status.textContent = 'Salvataggio non disponibile: copia il codice prima di uscire.'
  }
}

const requestedGame = new URLSearchParams(location.search).get('game')
if (Object.hasOwn(LAB_GAMES, requestedGame) && !SITE_CONFIG.hiddenGames.includes(requestedGame)) {
  gameSelect.value = requestedGame
  templateSelect.value = requestedGame
}

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
    const link = document.querySelector(`nav a[data-level="${name}"]`)
    link.classList.toggle('active', name === level)
    if (name === level) link.setAttribute('aria-current', 'page')
    else link.removeAttribute('aria-current')
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
  if (typeof Blockly === 'undefined' || !Blockly.Blocks.controls_if ||
      !(globalThis.python?.pythonGenerator || Blockly.Python)) {
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
  const theme = Blockly.Theme.defineTheme(`serialgaming-${currentGameId}`, {
    base: Blockly.Themes.Zelos || Blockly.Themes.Classic,
    componentStyles: {
      workspaceBackgroundColour: '#171d29',
      toolboxBackgroundColour: '#202a38',
      toolboxForegroundColour: '#e5edf5',
      flyoutBackgroundColour: '#202a38',
      flyoutForegroundColour: '#e5edf5',
      flyoutOpacity: 0.97,
      scrollbarColour: '#3a4157',
      insertionMarkerColour: '#4fd1c5',
      insertionMarkerOpacity: 0.5,
      markerColour: '#4fd1c5',
      cursorColour: '#4fd1c5',
    },
    fontStyle: { size: 14 },
  })
  workspace = Blockly.inject('blockly-div', {
    toolbox: labGame().toolbox,
    renderer: 'zelos',
    theme,
    zoom: { controls: true, startScale: 1 },
    grid: { spacing: 24, length: 2, colour: '#344358', snap: false },
    trashcan: true,
  })
  const textToDom = (Blockly.utils.xml && Blockly.utils.xml.textToDom) || Blockly.Xml.textToDom
  const stored = readDraft('blocks', currentGameId)
  const xml = savedWorkspaces[currentGameId] || (typeof stored === 'string' ? stored : labGame().starterXml)
  try {
    Blockly.Xml.domToWorkspace(textToDom(xml), workspace)
  } catch {
    workspace.clear()
    Blockly.Xml.domToWorkspace(textToDom(labGame().starterXml), workspace)
    log('I blocchi salvati non si aprono: ripartiamo dal modello iniziale.')
  }
  workspace.addChangeListener(refreshGenerated)
  refreshGenerated()
}

function blocksCode() {
  if (!workspace || !blocklyGen) return null
  return labGame().compose(blocklyGen.workspaceToCode(workspace))
}

function refreshGenerated() {
  const code = blocksCode()
  if (code) {
    generatedEl.textContent = code
    generatedEl.dispatchEvent(new Event('codechange'))
    saveDraft('blocks', currentGameId, workspaceXml())
  }
}

// ── Cambio di gioco ──────────────────────────────────────────
gameSelect.addEventListener('change', () => {
  if (workspace) savedWorkspaces[currentGameId] = workspaceXml()
  currentGameId = gameSelect.value
  const url = new URL(location.href)
  url.searchParams.set('game', currentGameId)
  history.replaceState(null, '', url)
  injectWorkspace()
  renderCards()
})

// ── Livello Python ───────────────────────────────────────────
function restorePython() {
  const draft = readDraft('python', templateSelect.value)
  codeArea.value = typeof draft === 'string' ? draft : BOT_TEMPLATES[templateSelect.value]
  codeArea.dispatchEvent(new Event('codechange'))
}
restorePython()
codeArea.addEventListener('input', () => saveDraft('python', templateSelect.value, codeArea.value))
generatedCarte.addEventListener('input', () => saveDraft('cards-code', currentGameId, generatedCarte.value))

templateSelect.addEventListener('change', () => {
  restorePython()
})

// Tab nelle textarea di codice inserisce 4 spazi invece di cambiare campo
function enableTabIndent(textarea) {
  textarea.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab' || event.shiftKey) return
    event.preventDefault()
    const { selectionStart, selectionEnd, value } = textarea
    textarea.value = value.slice(0, selectionStart) + '    ' + value.slice(selectionEnd)
    textarea.selectionStart = textarea.selectionEnd = selectionStart + 4
    textarea.dispatchEvent(new Event('input'))
  })
}
enableTabIndent(codeArea)
enableTabIndent(generatedCarte)

// ── Livello Carte ────────────────────────────────────────────
const decks = {} // gameId -> array di chiavi carta

function currentDeck() {
  if (!decks[currentGameId]) {
    const draft = readDraft('deck', currentGameId)
    decks[currentGameId] = Array.isArray(draft)
      ? [...new Set(draft.filter(key => Object.hasOwn(labGame().cards, key)))]
      : [...labGame().starterDeck]
  }
  return decks[currentGameId]
}

function cardsCode() {
  const cards = labGame().cards
  const body = currentDeck().map(key => {
    const card = cards[key]
    const nome = labAsciiLabel(card.label)
    // ogni return della carta passa da _carta(): così il bot dichiara nella
    // risposta quale carta ha deciso, e la pagina di gioco la "accende"
    const code = card.code.replace(/^(\s*)return\s+(.+)$/gm,
      (_, indent, expr) => `${indent}return _carta(${JSON.stringify(nome)}, ${expr})`)
    return `# carta: ${nome}\n${code}`
  }).join('\n')
  return labGame().compose(body)
}

// Accende brevemente la carta del mazzo che ha appena deciso una mossa
// (durante la prova contro la CPU)
function highlightDeckCard(rule) {
  const cards = labGame().cards
  const index = currentDeck().findIndex(key => labAsciiLabel(cards[key].label) === rule)
  const item = index >= 0 ? cardsDeck.children[index] : null
  if (!item || !item.classList) return
  item.classList.remove('fired')
  void item.offsetWidth
  item.classList.add('fired')
}

function renderCards(resetCode = false) {
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
      renderCards(true)
      cardsDeck.lastElementChild?.querySelector('button:not(:disabled)')?.focus()
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
    for (const [symbol, label, action, enabled, nextIndex] of [
      ['▲', 'Sposta su', () => { [deck[index - 1], deck[index]] = [deck[index], deck[index - 1]] }, index > 0, index - 1],
      ['▼', 'Sposta giù', () => { [deck[index + 1], deck[index]] = [deck[index], deck[index + 1]] }, index < deck.length - 1, index + 1],
      ['✕', 'Rimuovi', () => { deck.splice(index, 1) }, true, index],
    ]) {
      const button = document.createElement('button')
      button.textContent = symbol
      button.setAttribute('aria-label', `${label}: ${cards[key].label}`)
      button.title = label
      button.disabled = !enabled
      button.addEventListener('click', () => {
        action()
        renderCards(true)
        const next = cardsDeck.children[Math.min(nextIndex, deck.length - 1)]
        const focusTarget = next?.querySelector('button:not(:disabled)') || cardsAvailable.querySelector('button')
        focusTarget?.focus()
      })
      controls.appendChild(button)
    }
    item.appendChild(controls)
    cardsDeck.appendChild(item)
  })
  if (deck.length === 0) {
    cardsDeck.innerHTML = '<p class="cards-empty">Mazzo vuoto: il bot giocherà sempre a caso. Aggiungi qualche carta!</p>'
  }

  // Solo cambiare il mazzo rigenera il codice; riaprire un gioco conserva le modifiche manuali.
  const draft = readDraft('cards-code', currentGameId)
  generatedCarte.value = !resetCode && typeof draft === 'string' ? draft : cardsCode()
  generatedCarte.dispatchEvent(new Event('codechange'))
  if (resetCode) {
    saveDraft('deck', currentGameId, deck)
    saveDraft('cards-code', currentGameId, generatedCarte.value)
  }
}

// ── Da carte a blocchi ───────────────────────────────────────
// Ogni carta conosce la propria versione a blocchi (campo xml): il mazzo
// diventa una catena di blocchi identica, caricata nel livello Blocchi.
// È il ponte tra i due livelli: le carte ERANO già blocchi (e codice).
function chainBlocksXml(fragments) {
  if (fragments.length === 0) return ''
  const [first, ...rest] = fragments
  if (rest.length === 0) return first
  const inner = chainBlocksXml(rest)
  const at = first.lastIndexOf('</block>')
  return `${first.slice(0, at)}<next>${inner}</next>${first.slice(at)}`
}

document.getElementById('cards-to-blocks').addEventListener('click', () => {
  const cards = labGame().cards
  const deck = currentDeck()
  if (deck.length === 0) {
    log('Il mazzo è vuoto: aggiungi qualche carta prima di trasformarlo in blocchi.')
    return
  }
  if (!blocklyReady) {
    log('Blockly non è disponibile (serve internet): il livello Blocchi non può aprirsi.')
    return
  }
  const fragments = []
  let terminale = null // la prima carta che gioca sempre chiude la catena
  for (const key of deck) {
    const card = cards[key]
    if (terminale) {
      log(`ℹ️ «${card.label}» viene dopo «${terminale}», che gioca sempre: non verrebbe mai usata.`)
      continue
    }
    if (!card.xml) {
      log(`ℹ️ «${card.label}» non ha una versione a blocchi: saltata.`)
      continue
    }
    fragments.push(card.xml)
    if (!card.xml.startsWith('<block type="controls_if"')) terminale = card.label
  }
  if (fragments.length === 0) {
    log('Nessuna delle carte nel mazzo ha una versione a blocchi.')
    return
  }
  const chained = chainBlocksXml(fragments).replace('<block ', '<block x="30" y="30" ')
  savedWorkspaces[currentGameId] = `<xml xmlns="https://developers.google.com/blockly/xml">${chained}</xml>`
  injectWorkspace()
  log('🧩 Mazzo trasformato in blocchi: guardali nel livello Blocchi (sono le stesse regole!).')
  location.hash = '#blocchi'
})

// ── Il bot corrente (codice + gioco a cui appartiene) ────────
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
  return { code: codeArea.value, gameId: templateSelect.value }
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
  // eventuali giochi senza pagina pilotabile si provano su forza4
  const testGameId = GAME_PATH[gameId] ? gameId : 'forza4'
  testing = true
  tryButton.disabled = true
  logEl.textContent = ''
  log(`Preparo l'emulatore e avvio una partita di prova (${testGameId})…`)

  let emu
  try {
    emu = new EmulatedPico('Bot di prova', code, 5000)
    // gli errori del bot devono finire nel log visibile, non solo in console
    emu.onlog((message, level) => {
      if (level === 'error') log(`⚠️ ${message}`)
    })
    await emu.start()
  } catch (error) {
    emu?.disconnect()
    log(`Il bot non parte: ${error.message}`)
    testing = false
    tryButton.disabled = false
    return
  }

  testFrame.innerHTML = ''
  const iframe = document.createElement('iframe')
  iframe.title = 'Partita di prova del tuo bot'
  iframe.src = GAME_PATH[testGameId]
  iframe.addEventListener('load', () => {
    const target = iframe.contentWindow
    if (typeof target.startExternalMatch !== 'function') {
      emu.disconnect()
      log('La pagina del gioco non è pilotabile.')
      testing = false
      tryButton.disabled = false
      return
    }
    log('Si gioca! Il tuo bot ha il primo slot (sinistra / X / Giocatore 1).')
    // ogni mossa arriva con la carta che l'ha decisa: la si accende nel
    // mazzo e la si annota nel log (l'avversario CPU non manda regole)
    target.__onBotRule = (id, rule) => {
      log(`🃏 ${rule}`)
      if (currentGameId === gameId) highlightDeckCard(rule)
    }
    target.startExternalMatch([emu, TEST_CPU[testGameId]], winnerSlot => {
      if (winnerSlot === 'P1') log('🎉 Il tuo bot ha VINTO!')
      else if (winnerSlot === 'P2') log('Questa volta ha vinto il computer. Quale carta potresti cambiare?')
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

// Nome del bot: ricordato tra Laboratorio e pagine di gioco (stesso browser)
const BOT_NAME_KEY = 'serial-gaming:botname'
const botNameInput = document.getElementById('bot-name')
try { botNameInput.value = localStorage.getItem(BOT_NAME_KEY) || '' } catch { /* storage non disponibile */ }
botNameInput.addEventListener('input', () => {
  try { localStorage.setItem(BOT_NAME_KEY, botNameInput.value.trim()) } catch { /* ignora */ }
})

function updateSerialControls() {
  const connected = pico.isConnected
  connStatus.textContent = connected ? 'connesso' : 'non connesso'
  connStatus.classList.toggle('connected', connected)
  connectButton.disabled = connected || busy || !('serial' in navigator)
  document.getElementById('serial-help').hidden = 'serial' in navigator
  uploadButton.disabled = !connected || busy
}

pico.ondisconnect(updateSerialControls)

connectButton.addEventListener('click', async () => {
  // se sulla scheda c'è già il router, si presenta: nome e bot installati
  pico.onidentity(({ name, bots }) => {
    const chi = name ? `"${name}"` : 'senza nome'
    const cosa = bots && bots.length ? `bot installati: ${bots.join(', ')}` : 'nessun bot installato'
    log(`La scheda si presenta: ${chi}, ${cosa}.`)
    if (name && !botNameInput.value.trim()) botNameInput.value = name
  })
  try {
    await pico.connect()
    log('RP2040 connesso.')
  } catch (error) {
    log(`Connessione fallita: ${error.message}`)
  }
  updateSerialControls()
})

uploadButton.addEventListener('click', async () => {
  const { code, gameId } = currentBot()
  if (!code) {
    log('Niente da caricare: costruisci prima il bot.')
    return
  }
  busy = true
  updateSerialControls()
  logEl.textContent = ''
  const named = botNameInput.value.trim()
  try { localStorage.setItem(BOT_NAME_KEY, named) } catch { /* ignora */ }
  try {
    // Ogni upload (ri)scrive anche il router: main.py smista i messaggi
    // ai bot_<gioco>.py, così sullo stesso Pico convivono i bot di tutti
    // i giochi e non serve alcun setup preliminare. Il nome viaggia con
    // la scheda (bot_config.json): le pagine di gioco lo chiedono via
    // handshake alla connessione.
    const files = [
      { name: 'main.py', code: ROUTER_MAIN_PY },
      { name: `bot_${gameId}.py`, code },
    ]
    if (named) files.push({ name: 'bot_config.json', code: JSON.stringify({ name: named }) })
    await pico.uploadFiles(files, log)
    await pico.disconnect()
    log(`Bot ${gameId} installato (bot_${gameId}.py): gli altri giochi già caricati restano al loro posto.`)
    log(`Porta seriale liberata: ora vai alla pagina del gioco e premi "Connetti".${named ? ` Il bot "${named}" è pronto.` : ''}`)
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
