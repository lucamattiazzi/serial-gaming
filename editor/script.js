const codeArea = document.getElementById('code')
const templateSelect = document.getElementById('template-select')
const connectButton = document.getElementById('connect-button')
const connStatus = document.getElementById('conn-status')
const uploadButton = document.getElementById('upload-button')
const logEl = document.getElementById('log')

const TEMPLATES = BOT_TEMPLATES

const pico = new PicoSerial('Editor')
let busy = false

codeArea.value = TEMPLATES.tictactoe

templateSelect.addEventListener('change', () => {
  codeArea.value = TEMPLATES[templateSelect.value]
})

// Tab nell'editor inserisce 4 spazi invece di cambiare campo
codeArea.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return
  event.preventDefault()
  const { selectionStart, selectionEnd, value } = codeArea
  codeArea.value = value.slice(0, selectionStart) + '    ' + value.slice(selectionEnd)
  codeArea.selectionStart = codeArea.selectionEnd = selectionStart + 4
})

function log(message) {
  logEl.hidden = false
  logEl.textContent += message + '\n'
  logEl.scrollTop = logEl.scrollHeight
}

function updateControls() {
  const connected = pico.isConnected
  connStatus.textContent = connected ? 'connesso' : 'non connesso'
  connStatus.classList.toggle('connected', connected)
  connectButton.disabled = connected || busy
  uploadButton.disabled = !connected || busy
}

pico.ondisconnect(updateControls)

connectButton.addEventListener('click', async () => {
  try {
    await pico.connect()
    log('RP2040 connesso.')
  } catch (error) {
    log(`Connessione fallita: ${error.message}`)
  }
  updateControls()
})

uploadButton.addEventListener('click', async () => {
  busy = true
  updateControls()
  logEl.textContent = ''
  try {
    await pico.uploadMainPy(codeArea.value, log)
    await pico.disconnect()
    log('Porta seriale liberata: ora vai alla pagina del gioco e premi "Connetti".')
  } catch (error) {
    log(`Errore: ${error.message}`)
    log('Suggerimento: riprova, o ricollega il Pico e riconnetti.')
  }
  busy = false
  updateControls()
})

updateControls()
