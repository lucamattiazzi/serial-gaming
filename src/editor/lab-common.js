// ── Registro dei giochi del Laboratorio ──────────────────────
// Ogni gioco registra: nome, compose(body) -> modulo bot completo (con rispondi(state)),
// starterXml e toolbox per Blockly, setupBlocks(), carte e mazzo iniziale.
const LAB_GAMES = {}

// Etichetta di una carta ridotta ad ASCII puro, per finire nel sorgente
// Python ("Mangia il più possibile" -> "Mangia il piu' possibile"): il
// codice caricato sul Pico resta senza emoji e senza accentate.
function labAsciiLabel(label) {
  return label
    .replace(/à/g, "a'").replace(/[èé]/g, "e'").replace(/ì/g, "i'")
    .replace(/ò/g, "o'").replace(/ù/g, "u'")
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// indenta il corpo di decidi() di 4 spazi
function labIndent(body) {
  const lines = body.split('\n').filter(line => line.trim() !== '')
  return lines.map(line => '    ' + line).join('\n') + (lines.length ? '\n' : '')
}

// categoria Logica condivisa da tutti i toolbox
const LAB_LOGIC_CATEGORY = {
  kind: 'category',
  name: 'Logica',
  colour: '%{BKY_LOGIC_HUE}',
  contents: [
    { kind: 'block', type: 'controls_if' },
    { kind: 'block', type: 'logic_operation' },
    { kind: 'block', type: 'logic_negate' },
    { kind: 'block', type: 'logic_compare' },
    { kind: 'block', type: 'math_number' },
  ],
}

// helper per definire blocchi + generatori compatibile tra versioni di Blockly
function labBlockTools() {
  const gen = typeof python !== 'undefined' ? python.pythonGenerator : Blockly.Python
  const Order = typeof python !== 'undefined' && python.Order
    ? python.Order
    : { NONE: gen.ORDER_NONE, FUNCTION_CALL: gen.ORDER_FUNCTION_CALL, ATOMIC: gen.ORDER_ATOMIC }
  function define(name, fn) {
    if (gen.forBlock) gen.forBlock[name] = fn
    else gen[name] = fn
  }
  return { gen, Order, define }
}
