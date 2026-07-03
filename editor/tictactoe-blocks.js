// ── Laboratorio: Tris ────────────────────────────────────────
const TTT_RUNTIME_HEAD = `import sys
import json
import random

# --- generato dal Laboratorio (Tris) ---
# La tua strategia e' dentro decidi(); il resto e' il motore.
# Caselle 0-8: da sinistra a destra, dall'alto in basso. Sei sempre "O".

BOARD = []
ULTIMA_MOSSA = None
IO = "O"
AVVERSARIO = "X"
TRIPLE = ((0, 1, 2), (3, 4, 5), (6, 7, 8),
          (0, 3, 6), (1, 4, 7), (2, 5, 8),
          (0, 4, 8), (2, 4, 6))
ANGOLI = (0, 2, 6, 8)


def casella_libera(i):
    try:
        i = int(i)
    except (TypeError, ValueError):
        return False
    return 0 <= i < 9 and BOARD[i] == ""


def caselle_libere():
    return [i for i in range(9) if BOARD[i] == ""]


def casella_a_caso():
    return random.choice(caselle_libere())


def _casella_vincente(simbolo):
    for tripla in TRIPLE:
        valori = [BOARD[i] for i in tripla]
        if valori.count(simbolo) == 2 and valori.count("") == 1:
            for i in tripla:
                if BOARD[i] == "":
                    return i
    return None


def posso_vincere():
    return _casella_vincente(IO) is not None


def mossa_vincente():
    i = _casella_vincente(IO)
    return i if i is not None else casella_a_caso()


def avversario_puo_vincere():
    return _casella_vincente(AVVERSARIO) is not None


def mossa_che_blocca():
    i = _casella_vincente(AVVERSARIO)
    return i if i is not None else casella_a_caso()


def angolo_libero_esiste():
    return any(BOARD[i] == "" for i in ANGOLI)


def un_angolo_libero():
    liberi = [i for i in ANGOLI if BOARD[i] == ""]
    return random.choice(liberi) if liberi else casella_a_caso()


def ultima_mossa_avversario():
    return ULTIMA_MOSSA if ULTIMA_MOSSA is not None else 4


def decidi():
`

const TTT_RUNTIME_TAIL = `    return casella_a_caso()


while True:
    line = sys.stdin.readline()
    try:
        state = json.loads(line)
    except ValueError:
        continue
    if state.get("winner") is not None:
        continue  # partita finita
    if state.get("board") is None:
        continue  # annuncio di inizio partita
    BOARD = state["board"]
    ULTIMA_MOSSA = state["lastMove"]
    mossa = decidi()
    if not casella_libera(mossa):
        mossa = casella_a_caso()  # rete di sicurezza: mai una mossa invalida
    print(json.dumps({"move": int(mossa)}))
`

LAB_GAMES.tictactoe = {
  name: 'Tris',

  compose(body) {
    return TTT_RUNTIME_HEAD + labIndent(body) + TTT_RUNTIME_TAIL
  },

  starterXml: `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="controls_if" x="30" y="30">
    <value name="IF0"><block type="ttt_posso_vincere"></block></value>
    <statement name="DO0">
      <block type="ttt_gioca">
        <value name="CASELLA"><block type="ttt_mossa_vincente"></block></value>
      </block>
    </statement>
    <next>
      <block type="controls_if">
        <value name="IF0"><block type="ttt_avversario_puo_vincere"></block></value>
        <statement name="DO0">
          <block type="ttt_gioca">
            <value name="CASELLA"><block type="ttt_mossa_che_blocca"></block></value>
          </block>
        </statement>
        <next>
          <block type="controls_if">
            <value name="IF0">
              <block type="ttt_casella_libera">
                <value name="CASELLA"><block type="ttt_centro"></block></value>
              </block>
            </value>
            <statement name="DO0">
              <block type="ttt_gioca">
                <value name="CASELLA"><block type="ttt_centro"></block></value>
              </block>
            </statement>
            <next>
              <block type="ttt_gioca">
                <value name="CASELLA"><block type="ttt_casella_a_caso"></block></value>
              </block>
            </next>
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
        name: 'Tris',
        colour: '210',
        contents: [
          { kind: 'block', type: 'ttt_gioca' },
          { kind: 'block', type: 'ttt_posso_vincere' },
          { kind: 'block', type: 'ttt_mossa_vincente' },
          { kind: 'block', type: 'ttt_avversario_puo_vincere' },
          { kind: 'block', type: 'ttt_mossa_che_blocca' },
          { kind: 'block', type: 'ttt_casella_libera' },
          { kind: 'block', type: 'ttt_centro' },
          { kind: 'block', type: 'ttt_angolo_esiste' },
          { kind: 'block', type: 'ttt_angolo_libero' },
          { kind: 'block', type: 'ttt_casella_a_caso' },
          { kind: 'block', type: 'ttt_ultima_mossa' },
        ],
      },
      LAB_LOGIC_CATEGORY,
    ],
  },

  setupBlocks() {
    Blockly.defineBlocksWithJsonArray([
      {
        type: 'ttt_gioca',
        message0: 'gioca nella casella %1',
        args0: [{ type: 'input_value', name: 'CASELLA', check: 'Number' }],
        previousStatement: null,
        colour: 160,
        tooltip: 'Mette la tua O in quella casella (0-8) e chiude il turno.',
      },
      { type: 'ttt_posso_vincere', message0: 'posso vincere subito?', output: 'Boolean', colour: 210, tooltip: 'Vero se una casella completa il tuo tris.' },
      { type: 'ttt_mossa_vincente', message0: 'la casella per vincere', output: 'Number', colour: 210, tooltip: 'La casella che ti fa vincere subito.' },
      { type: 'ttt_avversario_puo_vincere', message0: "l'avversario può vincere subito?", output: 'Boolean', colour: 210, tooltip: "Vero se l'avversario ha un tris pronto." },
      { type: 'ttt_mossa_che_blocca', message0: 'la casella che lo blocca', output: 'Number', colour: 210, tooltip: "La casella che rovina il tris dell'avversario." },
      {
        type: 'ttt_casella_libera',
        message0: 'la casella %1 è libera?',
        args0: [{ type: 'input_value', name: 'CASELLA', check: 'Number' }],
        output: 'Boolean',
        colour: 210,
        tooltip: 'Vero se quella casella è vuota (0 = in alto a sinistra).',
      },
      { type: 'ttt_centro', message0: 'la casella centrale', output: 'Number', colour: 210, tooltip: 'La casella 4, quella in mezzo.' },
      { type: 'ttt_angolo_esiste', message0: "c'è un angolo libero?", output: 'Boolean', colour: 210, tooltip: 'Vero se almeno un angolo (0, 2, 6, 8) è vuoto.' },
      { type: 'ttt_angolo_libero', message0: 'un angolo libero', output: 'Number', colour: 210, tooltip: 'Un angolo vuoto scelto a caso.' },
      { type: 'ttt_casella_a_caso', message0: 'una casella libera a caso', output: 'Number', colour: 210, tooltip: 'Una casella vuota qualsiasi.' },
      { type: 'ttt_ultima_mossa', message0: "l'ultima casella dell'avversario", output: 'Number', colour: 210, tooltip: "Dove ha giocato l'avversario l'ultima volta." },
    ])

    const { gen, Order, define } = labBlockTools()
    define('ttt_gioca', (block) => {
      const value = gen.valueToCode(block, 'CASELLA', Order.NONE) || 'casella_a_caso()'
      return `return ${value}\n`
    })
    define('ttt_posso_vincere', () => ['posso_vincere()', Order.FUNCTION_CALL])
    define('ttt_mossa_vincente', () => ['mossa_vincente()', Order.FUNCTION_CALL])
    define('ttt_avversario_puo_vincere', () => ['avversario_puo_vincere()', Order.FUNCTION_CALL])
    define('ttt_mossa_che_blocca', () => ['mossa_che_blocca()', Order.FUNCTION_CALL])
    define('ttt_casella_libera', (block) => {
      const value = gen.valueToCode(block, 'CASELLA', Order.NONE) || '4'
      return [`casella_libera(${value})`, Order.FUNCTION_CALL]
    })
    define('ttt_centro', () => ['4', Order.ATOMIC])
    define('ttt_angolo_esiste', () => ['angolo_libero_esiste()', Order.FUNCTION_CALL])
    define('ttt_angolo_libero', () => ['un_angolo_libero()', Order.FUNCTION_CALL])
    define('ttt_casella_a_caso', () => ['casella_a_caso()', Order.FUNCTION_CALL])
    define('ttt_ultima_mossa', () => ['ultima_mossa_avversario()', Order.FUNCTION_CALL])
  },

  cards: {
    vinci: {
      label: '🏆 Vinci se puoi',
      hint: 'Se una casella completa il tuo tris, giocala.',
      code: 'if posso_vincere():\n  return mossa_vincente()',
    },
    blocca: {
      label: "🛡️ Blocca l'avversario",
      hint: "Se l'avversario ha un tris pronto, rovinaglielo.",
      code: 'if avversario_puo_vincere():\n  return mossa_che_blocca()',
    },
    centro: {
      label: '🎯 Prendi il centro',
      hint: 'La casella in mezzo tocca 4 linee: se è libera, prendila.',
      code: 'if casella_libera(4):\n  return 4',
    },
    angolo: {
      label: '📐 Prendi un angolo',
      hint: 'Gli angoli toccano 3 linee: meglio dei lati.',
      code: 'if angolo_libero_esiste():\n  return un_angolo_libero()',
    },
    caso: {
      label: '🎲 Gioca a caso',
      hint: 'Una casella libera qualsiasi.',
      code: 'return casella_a_caso()',
    },
  },
  starterDeck: ['vinci', 'blocca', 'centro', 'caso'],
}
