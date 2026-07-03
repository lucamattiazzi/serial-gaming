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

class EmulatedPico {
  constructor(label, code, timeLimitMs) {
    this.label = label
    this.code = code
    this.timeLimitMs = timeLimitMs
    this.runner = null
    this.isConnected = false
    this.messageHandler = () => { }
    this.disconnectHandler = () => { }
  }

  onmessage(fn) {
    this.messageHandler = fn
  }

  ondisconnect(fn) {
    this.disconnectHandler = fn
  }

  async start() {
    const pyodide = await loadPyodideRuntime()
    this.runner = pyodide.globals.get('_run_bot')
    // esegue il programma fino alla prima readline: fa emergere subito
    // errori di sintassi, di import o nell'inizializzazione
    try {
      this.runner(this.code, [])
    } catch (error) {
      throw new Error(shortPythonError(error))
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
    this.logMessage(`inviato: ${message}`, 'info')

    const started = performance.now()
    let output
    try {
      output = this.runner(this.code, [message + '\n'])
    } catch (error) {
      // nessuna risposta: per il gioco è come un bot muto (tempo scaduto)
      this.logMessage(`errore Python: ${shortPythonError(error)}`, 'error')
      return
    }
    const elapsed = performance.now() - started

    const lines = output.split('\n').filter(line => line.trim())
    for (const line of lines) this.logMessage(line.trim(), 'info')

    if (elapsed > this.timeLimitMs) {
      this.logMessage(`mossa calcolata in ${Math.round(elapsed)} ms: oltre il limite di ${this.timeLimitMs} ms`, 'error')
      return // fuori tempo: la risposta non viene consegnata
    }

    for (const line of lines) this.messageHandler(line)
  }

  logMessage(message, level = 'log') {
    const timestamp = new Date().toLocaleTimeString()
    console[level](`[${timestamp}] [${this.label}] ${message}`)
  }
}
