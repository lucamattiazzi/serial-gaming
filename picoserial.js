class PicoSerial {
  constructor(label = 'Pico') {
    this.label = label
    this.port = null
    this.reader = null
    this.writer = null
    this.isConnected = false
    this.messageHandler = () => { }
    this.disconnectHandler = () => { }
    this.rawBuffer = ''
    this.rawWaiters = []
  }

  onmessage(fn) {
    this.messageHandler = fn
  }

  ondisconnect(fn) {
    this.disconnectHandler = fn
  }

  async connect() {
    if (!('serial' in navigator)) {
      throw new Error('WebSerial non supportato: usa Chrome o Edge')
    }

    this.port = await navigator.serial.requestPort()

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
    if (wasConnected) this.disconnectHandler()
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

  async sendMessage(message) {
    if (!this.isConnected || !this.writer) {
      this.logMessage('non connesso, messaggio non inviato', 'error')
      return
    }

    try {
      const data = new TextEncoder().encode(message + '\n')
      await this.writer.write(data)
      this.logMessage(`inviato: ${message}`, 'info')
    } catch (error) {
      this.logMessage(`errore di invio: ${error.message}`, 'error')
    }
  }

  logMessage(message, level = 'log') {
    const timestamp = new Date().toLocaleTimeString()
    console[level](`[${timestamp}] [${this.label}] ${message}`)
  }

  // ── Raw REPL: scrittura di main.py direttamente dal browser ──
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

  async _execRaw(code, timeoutMs = 5000) {
    this._clearRawBuffer()
    await this.writeRaw(code)
    await this.writeRaw('\x04')
    await this._waitFor('OK', 3000, 'avvio esecuzione')
    await this._waitFor('\x04>', timeoutMs, 'fine esecuzione')
    // formato della risposta: OK<stdout>\x04<stderr>\x04>
    const match = this.rawBuffer.match(/OK([\s\S]*?)\x04([\s\S]*?)\x04>/)
    if (match && match[2].trim()) {
      throw new Error(`errore dal Pico: ${match[2].trim()}`)
    }
  }

  async uploadMainPy(code, onProgress = () => { }) {
    if (!this.isConnected || !this.writer) {
      throw new Error('non connesso')
    }

    onProgress('Interrompo il programma in esecuzione…')
    await this.writeRaw('\r\x03')
    await this._sleep(100)
    await this.writeRaw('\x03')
    await this._sleep(100)

    onProgress('Entro nel raw REPL…')
    this._clearRawBuffer()
    await this.writeRaw('\r\x01')
    await this._waitFor('raw REPL; CTRL-B to exit', 3000, 'accesso al raw REPL')

    onProgress('Scrivo main.py…')
    await this._execRaw(
      "try:\n import binascii\nexcept ImportError:\n import ubinascii as binascii\nf=open('main.py','wb')"
    )

    const bytes = new TextEncoder().encode(code)
    const CHUNK = 256
    for (let i = 0; i < bytes.length; i += CHUNK) {
      const chunk = bytes.slice(i, i + CHUNK)
      const b64 = btoa(String.fromCharCode(...chunk))
      await this._execRaw(`f.write(binascii.a2b_base64('${b64}'))`)
      onProgress(`Scrittura: ${Math.min(i + CHUNK, bytes.length)}/${bytes.length} byte`)
    }
    await this._execRaw("f.close()")

    onProgress('Soft reset: il tuo main.py parte ora…')
    this._clearRawBuffer()
    await this.writeRaw('\x02') // esce dal raw REPL
    await this._sleep(100)
    await this.writeRaw('\x04') // soft reset: al riavvio parte main.py
    onProgress('Caricamento completato.')
  }
}
