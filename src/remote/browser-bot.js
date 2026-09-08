// Un solo messaggio alla volta: anche gli annunci di inizio/fine hanno un timeout.
export class BrowserBot {
  ready = false
  worker = null
  queue = []
  active = null
  timer = null

  constructor(onStatus, onReply) {
    this.onStatus = onStatus
    this.onReply = onReply
  }

  stop(message = 'Bot fermo. Puoi modificare il codice.') {
    clearTimeout(this.timer)
    this.worker?.terminate()
    this.worker = null
    this.ready = false
    this.queue = []
    this.active = null
    this.onStatus(message)
  }

  watchdog(milliseconds, message) {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.stop(message), milliseconds)
  }

  start(code) {
    this.stop('Caricamento di Python… La prima volta può richiedere un minuto.')
    const worker = new Worker(new URL('./python-worker.js', import.meta.url))
    this.worker = worker
    this.onStatus('Caricamento di Python… La prima volta può richiedere un minuto.')
    this.watchdog(60000, 'Download di Python interrotto. Controlla la connessione e riprova.')
    worker.onerror = () => {
      if (this.worker === worker) this.stop('Impossibile avviare Python. Controlla la connessione e riprova.')
    }
    worker.onmessage = ({ data }) => {
      if (this.worker !== worker) return
      switch (data.type) {
        case 'runtime-ready':
          this.watchdog(4000, 'Bot interrotto: il codice ha impiegato più di 4 secondi. Controlla i cicli.')
          this.onStatus('Preparazione del tuo bot…')
          break
        case 'ready':
          clearTimeout(this.timer)
          this.ready = true
          this.onStatus('Bot pronto nel browser. Fermalo per modificare il codice.')
          break
        case 'reply': {
          clearTimeout(this.timer)
          const requestId = this.active?.requestId
          this.active = null
          if (requestId) this.onReply(requestId, data.reply)
          this.next()
          break
        }
        case 'error': this.stop(`Bot interrotto. ${data.message}`); break
      }
    }
    worker.postMessage({ type: 'init', code })
  }

  sendState(state, requestId) {
    if (!this.ready) return
    this.queue.push({ state, requestId })
    this.next()
  }

  next() {
    if (this.active || !this.queue.length || !this.ready) return
    this.active = this.queue.shift()
    this.watchdog(4000, 'Bot interrotto: il codice ha impiegato più di 4 secondi. Controlla i cicli.')
    this.worker.postMessage({ type: 'state', state: this.active.state })
  }
}
