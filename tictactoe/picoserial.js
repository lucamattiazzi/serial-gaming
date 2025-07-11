class PicoSerial {
  constructor() {
    this.port = null
    this.reader = null
    this.writer = null
    this.isConnected = false
    this.messageHandler = () => { }
  }

  onmessage(fn) {
    this.messageHandler = fn
  }

  async connect() {
    try {
      if (!('serial' in navigator)) {
        this.logMessage('WebSerial API not supported in this browser, use chrome or edgey')
        return
      }

      this.port = await navigator.serial.requestPort()

      await this.port.open({
        baudRate: 115200,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none'
      })

      this.logMessage('Connected to Raspberry Pi Pico')
      this.updateConnectionStatus(true)

      this.reader = this.port.readable.getReader()
      this.writer = this.port.writable.getWriter()
      this.readFromPort()
    } catch (error) {
      this.logMessage(`Connection failed: ${error.message}`)
    } finally {
      window.addEventListener('beforeunload', () => {
        if (this.isConnected) {
          this.disconnect()
        }
      })
    }
  }

  async disconnect() {
    try {
      if (this.reader) {
        await this.reader.cancel()
        this.reader.releaseLock()
      }
      if (this.writer) await this.writer.releaseLock()
      if (this.port) await this.port.close()

      this.logMessage('Disconnected from Raspberry Pi Pico')
      this.updateConnectionStatus(false)

    } catch (error) {
      this.logMessage(`Disconnection error: ${error.message}`)
    }
  }

  async readFromPort() {
    try {
      let buffer = ''

      while (this.isConnected && this.reader) {
        const { value, done } = await this.reader.read()

        if (done) break

        const text = new TextDecoder().decode(value)
        buffer += text

        const lines = buffer.split('\n')
        buffer = lines.pop() // Keep incomplete line in buffer

        lines.forEach(line => {
          if (line.trim()) {
            this.logMessage(`Pico: ${line.trim()}`)
            this.messageHandler(line)
          }
        })
      }
    } catch (error) {
      this.logMessage(`Read error: ${error.message}`)
    }
  }

  async sendMessage(message) {
    if (!this.isConnected || !this.writer) {
      this.logMessage('Not connected to Pico')
      return
    }

    try {
      const encoder = new TextEncoder()
      const data = encoder.encode(message + '\n')
      await this.writer.write(data)

      this.logMessage(`Sent: ${message}`)
    } catch (error) {
      this.logMessage(`Send error: ${error.message}`)
    }
  }

  sendCustomMessage(rawMessage) {
    const message = rawMessage.trim()
    if (message) this.sendMessage(message)
  }

  updateConnectionStatus(connected) {
    this.isConnected = connected
  }

  logMessage(message) {
    const timestamp = new Date().toLocaleTimeString()
    console.log(`[${timestamp}] ${message}\n`)
  }
}