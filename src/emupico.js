// Emulatore di RP2040: esegue il bot Python nel browser con Pyodide.
// Espone la stessa interfaccia di PicoSerial usata dalle pagine di gioco
// (sendMessage/onmessage/ondisconnect/isConnected), così il flusso di
// partita non distingue tra Pico vero ed emulato.
//
// Differenza chiave col Pico vero: a ogni messaggio il programma viene
// rieseguito da capo, con quella sola riga disponibile su stdin. Lo stato
// in variabili non sopravvive tra un turno e l'altro (il gioco manda
// comunque sempre lo stato completo); per persistere qualcosa si può
// scrivere su file (filesystem virtuale, dura quanto la pagina).

const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js'

const EMU_PRELUDE = `
import io
import sys

class _NoMoreInput(BaseException):
    pass

class _QueueStdin(io.IOBase):
    def __init__(self, lines):
        self._lines = list(lines)

    def readline(self):
        if not self._lines:
            raise _NoMoreInput()
        return self._lines.pop(0)

def _run_bot(source, lines):
    out = io.StringIO()
    old_stdin, old_stdout = sys.stdin, sys.stdout
    sys.stdin = _QueueStdin(lines)
    sys.stdout = out
    try:
        exec(source, {"__name__": "__main__"})
    except _NoMoreInput:
        pass
    finally:
        sys.stdin, sys.stdout = old_stdin, old_stdout
    return out.getvalue()
`

// Sul Pico vero i bot sono moduli: il router (main.py) chiama la loro
// rispondi(state). Nell'emulatore il router non c'è, quindi si appende
// questo driver che fa la stessa cosa. Se il codice è un vecchio bot
// standalone (con il proprio while True), il suo loop consuma tutto lo
// stdin e il driver non viene mai eseguito: restano validi entrambi.
const EMU_DRIVER = `

# --- driver dell'emulatore: consegna i messaggi a rispondi(state) ---
import sys as _emu_sys
import json as _emu_json
while True:
    _emu_line = _emu_sys.stdin.readline()
    try:
        _emu_state = _emu_json.loads(_emu_line)
    except ValueError:
        continue
    _emu_reply = rispondi(_emu_state)
    if _emu_reply is not None:
        print(_emu_json.dumps(_emu_reply))
`

let pyodideRuntimePromise = null

function loadPyodideRuntime() {
  if (pyodideRuntimePromise) return pyodideRuntimePromise
  pyodideRuntimePromise = (async () => {
    if (typeof loadPyodide === 'undefined') {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = PYODIDE_URL
        script.onload = resolve
        script.onerror = () => reject(new Error('impossibile scaricare Pyodide: serve una connessione a internet'))
        document.head.appendChild(script)
      })
    }
    const pyodide = await loadPyodide()
    pyodide.runPython(EMU_PRELUDE)
    return pyodide
  })()
  // un fallimento (es. offline) non deve impedire un nuovo tentativo
  pyodideRuntimePromise.catch(() => { pyodideRuntimePromise = null })
  return pyodideRuntimePromise
}

function shortPythonError(error) {
  const lines = String(error.message || error).trim().split('\n').filter(line => line.trim())
  return lines[lines.length - 1] || 'errore Python'
}

// Traduce l'ultima riga di un traceback Python in un messaggio comprensibile
// a un ragazzo delle medie. Usata dall'emulatore e da PicoSerial.
function friendlyBotError(text) {
  const line = String(text || '').trim().split('\n').filter(l => l.trim()).pop() || 'errore Python'
  const translations = [
    [/NameError: name '([^']+)' is(?:n't| not) defined/,
      (m) => `il nome «${m[1]}» non esiste: controlla di averlo scritto uguale a dove l'hai creato`],
    [/IndentationError|TabError/,
      () => 'gli spazi a inizio riga non tornano: in Python l\'allineamento fa parte del codice'],
    [/SyntaxError/,
      () => 'errore di scrittura: controlla parentesi, virgole e i due punti «:» a fine riga'],
    [/IndexError/,
      () => 'hai chiesto una posizione che non esiste nella lista (occhio: si conta da 0)'],
    [/KeyError/,
      () => 'hai cercato nel dizionario una chiave che non c\'è'],
    [/TypeError/,
      () => 'stai mescolando cose di tipo diverso (per esempio numeri e parole)'],
    [/ZeroDivisionError/,
      () => 'hai diviso per zero: matematicamente impossibile, anche per un bot'],
    [/AttributeError/,
      () => 'hai chiesto a un valore qualcosa che non sa fare (controlla il punto «.»)'],
    [/(?:ImportError|ModuleNotFoundError)/,
      () => 'hai importato un modulo che qui non esiste'],
    [/RecursionError|maximum recursion/,
      () => 'la funzione continua a chiamare se stessa senza mai fermarsi'],
  ]
  for (const [pattern, message] of translations) {
    const m = line.match(pattern)
    if (m) return `${message(m)} — ${line}`
  }
  return line
}

// Perché il bot non ha risposto? Se il suo codice è andato in errore lo si
// dice chiaramente, altrimenti è un vero tempo scaduto. Usata dalle pagine
// di gioco al posto del generico "tempo scaduto".
function botFailReason(player) {
  const serial = player && player.serial
  if (serial && serial.lastError) return `il suo codice è andato in errore (${serial.lastError})`
  if (serial && serial.lastSlow) return `troppo lento: ha risposto in ${serial.lastSlow} ms, oltre il limite`
  return 'tempo scaduto, nessuna mossa'
}

class EmulatedPico {
  constructor(label, code, timeLimitMs) {
    this.label = label
    this.verbose = true // a false tace i log informativi (utile nei giochi a tick)
    this.code = code + EMU_DRIVER
    this.timeLimitMs = timeLimitMs
    this.runner = null
    this.isConnected = false
    this.lastError = null // ultimo errore Python, in forma comprensibile
    this.messageHandler = () => { }
    this.disconnectHandler = () => { }
    this.loghandler = null
  }

  onmessage(fn) {
    this.messageHandler = fn
  }

  ondisconnect(fn) {
    this.disconnectHandler = fn
  }

  // Riceve anche i log (msg, level): serve al Laboratorio per mostrare
  // gli errori del bot nel pannello visibile, non solo in console.
  onlog(fn) {
    this.loghandler = fn
  }

  async start() {
    const pyodide = await loadPyodideRuntime()
    this.runner = pyodide.globals.get('_run_bot')
    // esegue il programma fino alla prima readline: fa emergere subito
    // errori di sintassi, di import o nell'inizializzazione
    try {
      this.runner(this.code, [])
    } catch (error) {
      throw new Error(friendlyBotError(shortPythonError(error)))
    }
    this.isConnected = true
    this.logMessage('bot avviato', 'info')
  }

  async disconnect() {
    if (!this.isConnected) return
    this.isConnected = false
    this.logMessage('bot fermato', 'info')
    this.disconnectHandler()
  }

  async sendMessage(message) {
    if (!this.isConnected) return
    this.lastError = null
    this.lastSlow = null
    this.logMessage(`inviato: ${message}`, 'info')

    const started = performance.now()
    let output
    try {
      output = this.runner(this.code, [message + '\n'])
    } catch (error) {
      // nessuna risposta: il gioco leggerà lastError per spiegare il perché
      this.lastError = friendlyBotError(shortPythonError(error))
      this.logMessage(`errore Python: ${this.lastError}`, 'error')
      return
    }
    const elapsed = performance.now() - started

    const lines = output.split('\n').filter(line => line.trim())
    for (const line of lines) this.logMessage(line.trim(), 'info')

    if (elapsed > this.timeLimitMs) {
      this.lastSlow = Math.round(elapsed)
      this.logMessage(`mossa calcolata in ${Math.round(elapsed)} ms: oltre il limite di ${this.timeLimitMs} ms`, 'error')
      return // fuori tempo: la risposta non viene consegnata
    }

    for (const line of lines) this.messageHandler(line)
  }

  logMessage(message, level = 'log') {
    if (this.loghandler) this.loghandler(message, level)
    if (!this.verbose && level !== 'error') return
    const timestamp = new Date().toLocaleTimeString()
    console[level](`[${timestamp}] [${this.label}] ${message}`)
  }
}
