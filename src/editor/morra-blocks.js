// ── Laboratorio: Morra cinese ────────────────────────────────
const MORRA_RUNTIME_HEAD = `import random

# --- generato dal Laboratorio (Morra cinese) ---
# La tua strategia e' dentro decidi(); il resto e' il motore.
# Il router (main.py) chiama rispondi(state) a ogni messaggio.

HANDS = ["rock", "paper", "scissors"]
BEATS = {"rock": "scissors", "paper": "rock", "scissors": "paper"}
BEATEN_BY = {"rock": "paper", "paper": "scissors", "scissors": "rock"}
HISTORY = []
ROUND = 1
REGOLA = None  # quale carta ha deciso l'ultima mossa (la mostra la pagina di gioco)


def _carta(nome, mossa):
    global REGOLA
    REGOLA = nome
    return mossa


def mano_a_caso():
    return random.choice(HANDS)


def cosa_batte(mano):
    return BEATEN_BY.get(mano, mano_a_caso())


def mossa_preferita_avversario():
    if not HISTORY:
        return mano_a_caso()
    mosse = [r["opp"] for r in HISTORY]
    return max(HANDS, key=mosse.count)


def ultima_mossa_avversario():
    if not HISTORY:
        return mano_a_caso()
    return HISTORY[-1]["opp"]


def mia_ultima_mossa():
    if not HISTORY:
        return mano_a_caso()
    return HISTORY[-1]["you"]


def ho_vinto_lultimo_round():
    if not HISTORY:
        return False
    r = HISTORY[-1]
    return BEATS[r["you"]] == r["opp"]


def ho_perso_lultimo_round():
    if not HISTORY:
        return False
    r = HISTORY[-1]
    return BEATS[r["opp"]] == r["you"]


def numero_del_round():
    return ROUND


def decidi():
`

const MORRA_RUNTIME_TAIL = `    return mano_a_caso()


def rispondi(state):
    global HISTORY, ROUND, REGOLA
    if state.get("winner") is not None:
        return None  # partita finita
    if state.get("round") is None:
        return None  # annuncio di inizio partita
    HISTORY = state["history"]
    ROUND = state["round"]
    REGOLA = None
    mossa = decidi()
    if mossa not in HANDS:
        mossa = _carta("rete di sicurezza", mano_a_caso())
    risposta = {"move": mossa}
    if REGOLA is not None:
        risposta["regola"] = REGOLA
    return risposta
`

LAB_GAMES.morra = {
  name: 'Morra cinese',

  compose(body) {
    return MORRA_RUNTIME_HEAD + labIndent(body) + MORRA_RUNTIME_TAIL
  },

  starterXml: `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="controls_if" x="30" y="30">
    <value name="IF0"><block type="morra_ho_vinto"></block></value>
    <statement name="DO0">
      <block type="morra_gioca">
        <value name="MANO"><block type="morra_mia_ultima"></block></value>
      </block>
    </statement>
    <next>
      <block type="controls_if">
        <value name="IF0"><block type="morra_ho_perso"></block></value>
        <statement name="DO0">
          <block type="morra_gioca">
            <value name="MANO">
              <block type="morra_cosa_batte">
                <value name="MANO"><block type="morra_ultima_avv"></block></value>
              </block>
            </value>
          </block>
        </statement>
        <next>
          <block type="morra_gioca">
            <value name="MANO"><block type="morra_caso"></block></value>
          </block>
        </next>
      </block>
    </next>
  </block>
</xml>`,

  toolbox: {
    kind: 'categoryToolbox',
    contents: [
      {
        kind: 'category',
        name: 'Morra',
        colour: '20',
        contents: [
          { kind: 'block', type: 'morra_gioca' },
          { kind: 'block', type: 'morra_mano' },
          { kind: 'block', type: 'morra_cosa_batte' },
          { kind: 'block', type: 'morra_preferita' },
          { kind: 'block', type: 'morra_ultima_avv' },
          { kind: 'block', type: 'morra_mia_ultima' },
          { kind: 'block', type: 'morra_caso' },
          { kind: 'block', type: 'morra_ho_vinto' },
          { kind: 'block', type: 'morra_ho_perso' },
          { kind: 'block', type: 'morra_round' },
        ],
      },
      LAB_LOGIC_CATEGORY,
    ],
  },

  setupBlocks() {
    Blockly.defineBlocksWithJsonArray([
      {
        type: 'morra_gioca',
        message0: 'gioca %1',
        args0: [{ type: 'input_value', name: 'MANO', check: 'String' }],
        previousStatement: null,
        colour: 160,
        tooltip: 'Gioca quella mano e chiude il round.',
      },
      {
        type: 'morra_mano',
        message0: '%1',
        args0: [{
          type: 'field_dropdown',
          name: 'MANO',
          options: [['✊ sasso', 'rock'], ['✋ carta', 'paper'], ['✌️ forbici', 'scissors']],
        }],
        output: 'String',
        colour: 20,
        tooltip: 'Una mano fissa.',
      },
      {
        type: 'morra_cosa_batte',
        message0: 'la mossa che batte %1',
        args0: [{ type: 'input_value', name: 'MANO', check: 'String' }],
        output: 'String',
        colour: 20,
        tooltip: 'Carta batte sasso, forbici battono carta, sasso batte forbici.',
      },
      { type: 'morra_preferita', message0: "la preferita dell'avversario", output: 'String', colour: 20, tooltip: 'La mano che ha giocato più spesso finora.' },
      { type: 'morra_ultima_avv', message0: "l'ultima dell'avversario", output: 'String', colour: 20, tooltip: "La mano che l'avversario ha giocato nel round scorso." },
      { type: 'morra_mia_ultima', message0: 'la mia ultima mossa', output: 'String', colour: 20, tooltip: 'La mano che ho giocato nel round scorso.' },
      { type: 'morra_caso', message0: 'una mossa a caso', output: 'String', colour: 20, tooltip: 'Sasso, carta o forbici a caso.' },
      { type: 'morra_ho_vinto', message0: "ho vinto l'ultimo round?", output: 'Boolean', colour: 20, tooltip: 'Vero se il round scorso è andato a te.' },
      { type: 'morra_ho_perso', message0: "ho perso l'ultimo round?", output: 'Boolean', colour: 20, tooltip: 'Vero se il round scorso è andato a lui.' },
      { type: 'morra_round', message0: 'il numero del round', output: 'Number', colour: 20, tooltip: 'A che round siamo (da 1 a 20).' },
    ])

    const { gen, Order, define } = labBlockTools()
    define('morra_gioca', (block) => {
      const value = gen.valueToCode(block, 'MANO', Order.NONE) || 'mano_a_caso()'
      return `return ${value}\n`
    })
    define('morra_mano', (block) => [`"${block.getFieldValue('MANO')}"`, Order.ATOMIC])
    define('morra_cosa_batte', (block) => {
      const value = gen.valueToCode(block, 'MANO', Order.NONE) || 'mano_a_caso()'
      return [`cosa_batte(${value})`, Order.FUNCTION_CALL]
    })
    define('morra_preferita', () => ['mossa_preferita_avversario()', Order.FUNCTION_CALL])
    define('morra_ultima_avv', () => ['ultima_mossa_avversario()', Order.FUNCTION_CALL])
    define('morra_mia_ultima', () => ['mia_ultima_mossa()', Order.FUNCTION_CALL])
    define('morra_caso', () => ['mano_a_caso()', Order.FUNCTION_CALL])
    define('morra_ho_vinto', () => ['ho_vinto_lultimo_round()', Order.FUNCTION_CALL])
    define('morra_ho_perso', () => ['ho_perso_lultimo_round()', Order.FUNCTION_CALL])
    define('morra_round', () => ['numero_del_round()', Order.FUNCTION_CALL])
  },

  cards: {
    ripeti: {
      label: '🔁 Se vinco, ripeto',
      hint: 'Chi vince tende a cambiare... tu no: ripeti la mossa vincente.',
      code: 'if ho_vinto_lultimo_round():\n  return mia_ultima_mossa()',
      xml: '<block type="controls_if"><value name="IF0"><block type="morra_ho_vinto"></block></value><statement name="DO0"><block type="morra_gioca"><value name="MANO"><block type="morra_mia_ultima"></block></value></block></statement></block>',
    },
    cambia: {
      label: '🔀 Se perdo, batto la sua',
      hint: "Se ho perso, gioco la mossa che batte l'ultima dell'avversario.",
      code: 'if ho_perso_lultimo_round():\n  return cosa_batte(ultima_mossa_avversario())',
      xml: '<block type="controls_if"><value name="IF0"><block type="morra_ho_perso"></block></value><statement name="DO0"><block type="morra_gioca"><value name="MANO"><block type="morra_cosa_batte"><value name="MANO"><block type="morra_ultima_avv"></block></value></block></value></block></statement></block>',
    },
    preferita: {
      label: '🧠 Batti la sua preferita',
      hint: "Conta le mosse dell'avversario e batti la più frequente.",
      code: 'return cosa_batte(mossa_preferita_avversario())',
      xml: '<block type="morra_gioca"><value name="MANO"><block type="morra_cosa_batte"><value name="MANO"><block type="morra_preferita"></block></value></block></value></block>',
    },
    ultima: {
      label: '🔮 Batti la sua ultima',
      hint: "Scommetti che ripeterà l'ultima mossa: giocaci contro.",
      code: 'return cosa_batte(ultima_mossa_avversario())',
      xml: '<block type="morra_gioca"><value name="MANO"><block type="morra_cosa_batte"><value name="MANO"><block type="morra_ultima_avv"></block></value></block></value></block>',
    },
    caso: {
      label: '🎲 A caso',
      hint: 'Imprevedibile per definizione.',
      code: 'return mano_a_caso()',
      xml: '<block type="morra_gioca"><value name="MANO"><block type="morra_caso"></block></value></block>',
    },
  },
  starterDeck: ['ripeti', 'cambia', 'preferita'],
}
