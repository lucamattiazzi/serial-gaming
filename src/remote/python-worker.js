// Stessa versione del Laboratorio, eseguita fuori dal thread della pagina.
importScripts('https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js')

let pyodide
let namespace
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      pyodide = await self.loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/' })
      self.postMessage({ type: 'runtime-ready' })
      namespace = pyodide.runPython('{"__name__": "__main__"}')
      pyodide.runPython(data.code, { globals: namespace })
      pyodide.runPython('assert callable(globals().get("rispondi")), "Definisci una funzione rispondi(stato)."', { globals: namespace })
      self.postMessage({ type: 'ready' })
    } else if (data.type === 'state') {
      namespace.set('_remote_state_json', JSON.stringify(data.state))
      const reply = pyodide.runPython('import json as _remote_json\n_remote_json.dumps(rispondi(_remote_json.loads(_remote_state_json)))', { globals: namespace })
      self.postMessage({ type: 'reply', reply: JSON.parse(reply) })
    }
  } catch (failure) {
    self.postMessage({ type: 'error', message: failure.message })
  }
}
