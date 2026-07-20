// Solo porte USB nel selettore (niente Bluetooth): si filtrano i vendor
// dei microcontrollori e dei bridge seriali più comuni.
const USB_SERIAL_FILTERS = [
  { usbVendorId: 0x2e8a }, // Raspberry Pi (Pico)
  { usbVendorId: 0x303a }, // Espressif (ESP32-S2/S3 USB nativo)
  { usbVendorId: 0x1a86 }, // WCH CH340/CH343
  { usbVendorId: 0x10c4 }, // Silicon Labs CP210x
  { usbVendorId: 0x0403 }, // FTDI
  { usbVendorId: 0x239a }, // Adafruit
  { usbVendorId: 0x2341 }, // Arduino
  { usbVendorId: 0x1209 }, // pid.codes (schede varie)
  { usbVendorId: 0x16c0 }, // Teensy / V-USB
]

class PicoSerial {
  constructor(label = 'Pico') {
    this.label = label
    this.verbose = true // a false tace i log informativi (utile nei giochi a tick)
    this.port = null
    this.reader = null
    this.writer = null
    this.isConnected = false
    this.lastError = null // ultimo errore Python stampato dal bot, in forma comprensibile
    this.messageHandler = () => { }
    this.disconnectHandler = () => { }
    this.identity = null // risposta all'hello: {hello, name, id, bots, router}
    this.identityHandler = () => { }
    this.rawBuffer = ''
    this.rawWaiters = []
  }

  onmessage(fn) {
    this.messageHandler = fn
  }

  ondisconnect(fn) {
    this.disconnectHandler = fn
  }

  onidentity(fn) {
    this.identityHandler = fn
    if (this.identity) fn(this.identity)
  }

  async connect() {
    if (!('serial' in navigator)) {
      throw new Error('WebSerial non supportato: usa Chrome o Edge')
    }

    this.port = await navigator.serial.requestPort({ filters: USB_SERIAL_FILTERS })

    await this.port.open({
      baudRate: 115200,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      flowControl: 'none'
    })

    this.isConnected = true
    this.reader = this.port.readable.getReader()
    this.writer = this.port.writable.getWriter()
    this.readFromPort()
    this.logMessage('connesso', 'info')

    // Chiede alla scheda di presentarsi (nome, id univoco, bot installati):
    // risponde solo il router del Laboratorio. L'hello ha la stessa forma
    // di un annuncio di inizio partita (campi di gioco a null), così i
    // programmi scritti a mano che già sopravvivono agli annunci scartano
    // anche questo senza andare in errore.
    this.sendMessage(JSON.stringify({
      hello: true, winner: null, board: null, lastMove: null, fen: null,
      round: null, history: null, ball: null, you: null, opp: null,
      grid: null, field: null, phase: null, shots: null, fleet: null,
      track: null,
    }))
  }

  async disconnect() {
    const wasConnected = this.isConnected
    this.isConnected = false
    try {
      if (this.reader) {
        await this.reader.cancel()
        this.reader.releaseLock()
        this.reader = null
      }
      if (this.writer) {
        this.writer.releaseLock()
        this.writer = null
      }
      if (this.port) {
        await this.port.close()
        this.port = null
      }
      this.logMessage('disconnesso', 'info')
    } catch (error) {
      this.logMessage(`errore in disconnessione: ${error.message}`, 'error')
    }
    if (wasConnected) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pico-disconnect', { detail: { pico: this } }))
      }
      this.disconnectHandler()
    }
  }

  // La risposta all'hello è di servizio: viene trattenuta qui (con evento
  // globale per la UI, es. botname.js) e non arriva mai al codice di gioco.
  _captureIdentity(line) {
    if (!line.includes('"hello"')) return false
    let parsed
    try {
      parsed = JSON.parse(line)
    } catch {
      return false
    }
    if (!parsed || parsed.hello !== true) return false
    this.identity = parsed
    this.identityHandler(parsed)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pico-identity', { detail: { pico: this, identity: parsed } }))
    }
    return true
  }

  async readFromPort() {
    try {
      let buffer = ''

      while (this.isConnected && this.reader) {
        const { value, done } = await this.reader.read()
        if (done) break

        const text = new TextDecoder().decode(value)
        buffer += text
        this._feedRaw(text)

        const lines = buffer.split('\n')
        buffer = lines.pop() // la riga incompleta resta nel buffer

        for (const line of lines) {
          if (!line.trim()) continue
          this.logMessage(line.trim(), 'info')
          this._captureError(line.trim())
          if (this._captureIdentity(line)) continue
          this.messageHandler(line)
        }
      }
    } catch (error) {
      this.logMessage(`errore di lettura: ${error.message}`, 'error')
      if (this.isConnected) {
        this.isConnected = false
        this.disconnectHandler()
      }
    }
  }

  // Se il bot sul Pico va in errore, MicroPython stampa il traceback sulla
  // seriale: lo si intercetta e traduce, così la pagina di gioco può dire
  // "il codice è andato in errore" invece di un fuorviante "tempo scaduto".
  _captureError(line) {
    if (!/^Traceback |^\s*File "|^[A-Za-z_]+(Error|Exception)\b/.test(line)) return
    if (/^Traceback |^\s*File "/.test(line)) return // righe di contorno: si aspetta quella finale
    this.lastError = typeof friendlyBotError === 'function' ? friendlyBotError(line) : line
  }

  async sendMessage(message) {
    if (!this.isConnected || !this.writer) {
      this.logMessage('non connesso, messaggio non inviato', 'error')
      return
    }
    this.lastError = null

    try {
      const data = new TextEncoder().encode(message + '\n')
      await this.writer.write(data)
      this.logMessage(`inviato: ${message}`, 'info')
    } catch (error) {
      this.logMessage(`errore di invio: ${error.message}`, 'error')
    }
  }

  logMessage(message, level = 'log') {
    if (!this.verbose && level !== 'error') return
    const timestamp = new Date().toLocaleTimeString()
    console[level](`[${timestamp}] [${this.label}] ${message}`)
  }

  // ── Raw REPL: scrittura di file sul Pico direttamente dal browser ──
  // Stesso protocollo usato da Thonny/mpremote: Ctrl-C interrompe il
  // programma, Ctrl-A entra nel raw REPL, ogni blocco eseguito termina
  // con Ctrl-D, Ctrl-B esce, Ctrl-D nel REPL normale fa il soft reset
  // (che avvia il nuovo main.py).

  async writeRaw(text) {
    const data = new TextEncoder().encode(text)
    await this.writer.write(data)
  }

  _feedRaw(text) {
    this.rawBuffer = (this.rawBuffer + text).slice(-8192)
    for (const waiter of [...this.rawWaiters]) {
      if (this.rawBuffer.includes(waiter.needle)) {
        this.rawWaiters.splice(this.rawWaiters.indexOf(waiter), 1)
        clearTimeout(waiter.timer)
        waiter.resolve()
      }
    }
  }

  _clearRawBuffer() {
    this.rawBuffer = ''
  }

  _waitFor(needle, timeoutMs, description) {
    if (this.rawBuffer.includes(needle)) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const waiter = { needle, resolve, timer: null }
      waiter.timer = setTimeout(() => {
        this.rawWaiters.splice(this.rawWaiters.indexOf(waiter), 1)
        reject(new Error(`nessuna risposta dal Pico (${description})`))
      }, timeoutMs)
      this.rawWaiters.push(waiter)
    })
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // Rende visibili i caratteri di controllo per i messaggi diagnostici
  _visible(text) {
    return text
      .replace(/\x01/g, '<Ctrl-A>')
      .replace(/\x02/g, '<Ctrl-B>')
      .replace(/\x03/g, '<Ctrl-C>')
      .replace(/\x04/g, '<Ctrl-D>')
      .replace(/\r/g, '')
      .trim()
  }

  // Un estratto leggibile di ciò che il dispositivo ha inviato di recente
  _bufferSnippet() {
    const snippet = this._visible(this.rawBuffer).slice(-200)
    return snippet || '(nessuna risposta)'
  }

  // Entra nel raw REPL di MicroPython, con tentativi ripetuti.
  // Se fallisce, l'errore mostra cosa ha effettivamente risposto il dispositivo.
  async _enterRawRepl(attempts = 3) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      this._clearRawBuffer()
      // Ctrl-C due volte: interrompe qualsiasi programma in esecuzione (anche
      // uno bloccato su sys.stdin.readline, come i nostri bot)
      await this.writeRaw('\r\x03\x03')
      await this._sleep(150)
      await this.writeRaw('\r\x01') // Ctrl-A: entra nel raw REPL
      try {
        await this._waitFor('raw REPL', 1500, 'accesso al raw REPL')
        return
      } catch (error) {
        if (attempt === attempts) {
          throw new Error(
            'Non riesco a entrare nel raw REPL di MicroPython. ' +
            'Assicurati che sul microcontrollore sia installato MicroPython ' +
            '(il firmware di fabbrica non basta). ' +
            `Il dispositivo ha risposto: «${this._bufferSnippet()}»`
          )
        }
      }
    }
  }

  // Esegue una riga nel raw REPL e ritorna lo stdout; lancia su errore Python.
  async _execRaw(code, timeoutMs = 5000) {
    this._clearRawBuffer()
    await this.writeRaw(code)
    await this.writeRaw('\x04') // Ctrl-D: esegue il blocco
    // MicroPython conferma la ricezione con "OK", poi esegue
    await this._waitFor('OK', 3000, 'avvio esecuzione')
    await this._waitFor('\x04>', timeoutMs, 'fine esecuzione')
    // formato della risposta: OK<stdout>\x04<stderr>\x04>
    const match = this.rawBuffer.match(/OK([\s\S]*?)\x04([\s\S]*?)\x04>/)
    if (!match) {
      throw new Error(`risposta inattesa dal dispositivo: «${this._bufferSnippet()}»`)
    }
    if (match[2].trim()) {
      throw new Error(`errore dal microcontrollore: ${this._visible(match[2])}`)
    }
    return match[1]
  }

  // Scrive un file sul filesystem del microcontrollore (richiede il raw REPL già attivo)
  async _writeFile(name, code, onProgress) {
    onProgress(`Preparo la scrittura di ${name}…`)
    await this._execRaw(
      `try:\n import binascii\nexcept ImportError:\n import ubinascii as binascii\nf=open('${name}','wb')`
    )

    const bytes = new TextEncoder().encode(code)
    // Chunk piccoli: il buffer USB-CDC dell'ESP32-S3 è limitato, e righe
    // troppo lunghe possono perdersi. 128 byte grezzi → riga ~215 caratteri.
    const CHUNK = 128
    for (let i = 0; i < bytes.length; i += CHUNK) {
      const chunk = bytes.slice(i, i + CHUNK)
      const b64 = btoa(String.fromCharCode(...chunk))
      await this._execRaw(`f.write(binascii.a2b_base64('${b64}'))`)
      onProgress(`Scrittura di ${name}: ${Math.min(i + CHUNK, bytes.length)}/${bytes.length} byte`)
    }
    await this._execRaw('f.close()')

    // Verifica: la dimensione del file scritto deve corrispondere
    onProgress(`Verifico ${name}…`)
    const stat = await this._execRaw(`import os\nprint(os.stat('${name}')[6])`)
    const written = parseInt(this._visible(stat), 10)
    if (written !== bytes.length) {
      throw new Error(
        `${name} scritto è di ${written} byte invece di ${bytes.length}: ` +
        'caricamento incompleto, riprova.'
      )
    }
  }

  // Carica uno o più file ([{name, code}]) e riavvia con un soft reset.
  async uploadFiles(files, onProgress = () => { }) {
    if (!this.isConnected || !this.writer) {
      throw new Error('non connesso')
    }

    onProgress('Entro nel raw REPL di MicroPython…')
    await this._enterRawRepl()

    try {
      for (const { name, code } of files) {
        await this._writeFile(name, code, onProgress)
      }
    } catch (error) {
      // Prova a lasciare il dispositivo in uno stato pulito
      try { await this.writeRaw('\x02') } catch { /* ignora */ }
      throw error
    }

    onProgress('Soft reset: il bot parte ora…')
    this._clearRawBuffer()
    await this.writeRaw('\x02') // esce dal raw REPL
    await this._sleep(100)
    await this.writeRaw('\x04') // soft reset: al riavvio parte main.py
    onProgress('Caricamento completato con successo.')
  }
}
