// ── Laboratorio: Forza 4 ─────────────────────────────────────
const FORZA4_RUNTIME_HEAD = `import random

# --- generato dal Laboratorio (Forza 4) ---
# La tua strategia e' dentro decidi(); il resto e' il motore.
# Il router (main.py) chiama rispondi(state) a ogni messaggio.

COLS = 7
ROWS = 6
BOARD = []
ULTIMA_MOSSA = None
IO = "O"
AVVERSARIO = "X"


def _riga_caduta(colonna):
    for r in range(ROWS - 1, -1, -1):
        if BOARD[r * COLS + colonna] == "":
            return r
    return None


def colonna_libera(colonna):
    try:
        colonna = int(colonna)
    except (TypeError, ValueError):
        return False
    return 0 <= colonna < COLS and BOARD[colonna] == ""


def colonne_libere():
    return [c for c in range(COLS) if BOARD[c] == ""]


def colonna_a_caso():
    return random.choice(colonne_libere())


def _vince(simbolo):
    for r in range(ROWS):
        for c in range(COLS):
            i = r * COLS + c
            if c <= COLS - 4 and all(BOARD[i + k] == simbolo for k in range(4)):
                return True
            if r <= ROWS - 4 and all(BOARD[i + k * COLS] == simbolo for k in range(4)):
                return True
            if c <= COLS - 4 and r <= ROWS - 4 and all(
                BOARD[i + k * (COLS + 1)] == simbolo for k in range(4)
            ):
                return True
            if c >= 3 and r <= ROWS - 4 and all(
                BOARD[i + k * (COLS - 1)] == simbolo for k in range(4)
            ):
                return True
    return False


def _colonna_vincente(simbolo):
    for c in colonne_libere():
        r = _riga_caduta(c)
        BOARD[r * COLS + c] = simbolo
        vinta = _vince(simbolo)
        BOARD[r * COLS + c] = ""
        if vinta:
            return c
    return None


def posso_vincere():
    return _colonna_vincente(IO) is not None


def mossa_vincente():
    c = _colonna_vincente(IO)
    return c if c is not None else colonna_a_caso()


def avversario_puo_vincere():
    return _colonna_vincente(AVVERSARIO) is not None


def mossa_che_blocca():
    c = _colonna_vincente(AVVERSARIO)
    return c if c is not None else colonna_a_caso()


def _regala_vittoria(colonna):
    # se gioco qui, al turno dopo l'avversario ha un 4 in fila?
    r = _riga_caduta(colonna)
    BOARD[r * COLS + colonna] = IO
    regalo = _colonna_vincente(AVVERSARIO) is not None
    BOARD[r * COLS + colonna] = ""
    return regalo


def colonne_sicure():
    return [c for c in colonne_libere() if not _regala_vittoria(c)]


def esiste_colonna_sicura():
    return len(colonne_sicure()) > 0


def una_colonna_sicura():
    sicure = colonne_sicure()
    return random.choice(sicure) if sicure else colonna_a_caso()


def ultima_mossa_avversario():
    return ULTIMA_MOSSA if ULTIMA_MOSSA is not None else 3


def decidi():
`

const FORZA4_RUNTIME_TAIL = `    return colonna_a_caso()


def rispondi(state):
    global BOARD, ULTIMA_MOSSA
    if state.get("winner") is not None:
        return None  # partita finita
    if state.get("board") is None:
        return None  # annuncio di inizio partita
    BOARD = state["board"]
    ULTIMA_MOSSA = state["lastMove"]
    mossa = decidi()
    if not colonna_libera(mossa):
        mossa = colonna_a_caso()  # rete di sicurezza: mai una mossa invalida
    return {"move": int(mossa)}
`

LAB_GAMES.forza4 = {
  name: 'Forza 4',

  compose(body) {
    return FORZA4_RUNTIME_HEAD + labIndent(body) + FORZA4_RUNTIME_TAIL
  },

  starterXml: `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="controls_if" x="30" y="30">
    <value name="IF0"><block type="f4_posso_vincere"></block></value>
    <statement name="DO0">
      <block type="f4_gioca">
        <value name="COLONNA"><block type="f4_mossa_vincente"></block></value>
      </block>
    </statement>
    <next>
      <block type="controls_if">
        <value name="IF0"><block type="f4_avversario_puo_vincere"></block></value>
        <statement name="DO0">
          <block type="f4_gioca">
            <value name="COLONNA"><block type="f4_mossa_che_blocca"></block></value>
          </block>
        </statement>
        <next>
          <block type="controls_if">
            <value name="IF0">
              <block type="f4_colonna_libera">
                <value name="COLONNA"><block type="f4_centro"></block></value>
              </block>
            </value>
            <statement name="DO0">
              <block type="f4_gioca">
                <value name="COLONNA"><block type="f4_centro"></block></value>
              </block>
            </statement>
            <next>
              <block type="f4_gioca">
                <value name="COLONNA"><block type="f4_colonna_a_caso"></block></value>
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
        name: 'Forza 4',
        colour: '210',
        contents: [
          { kind: 'block', type: 'f4_gioca' },
          { kind: 'block', type: 'f4_posso_vincere' },
          { kind: 'block', type: 'f4_mossa_vincente' },
          { kind: 'block', type: 'f4_avversario_puo_vincere' },
          { kind: 'block', type: 'f4_mossa_che_blocca' },
          { kind: 'block', type: 'f4_sicura_esiste' },
          { kind: 'block', type: 'f4_una_sicura' },
          { kind: 'block', type: 'f4_colonna_libera' },
          { kind: 'block', type: 'f4_colonna_a_caso' },
          { kind: 'block', type: 'f4_centro' },
          { kind: 'block', type: 'f4_ultima_mossa' },
        ],
      },
      LAB_LOGIC_CATEGORY,
    ],
  },

  setupBlocks() {
    Blockly.defineBlocksWithJsonArray([
      {
        type: 'f4_gioca',
        message0: 'gioca nella colonna %1',
        args0: [{ type: 'input_value', name: 'COLONNA', check: 'Number' }],
        previousStatement: null,
        colour: 160,
        tooltip: 'Fa cadere il tuo disco in quella colonna e chiude il turno.',
      },
      {
        type: 'f4_posso_vincere',
        message0: 'posso vincere subito?',
        output: 'Boolean',
        colour: 210,
        tooltip: 'Vero se esiste una colonna che ti fa fare 4 in fila adesso.',
      },
      {
        type: 'f4_mossa_vincente',
        message0: 'la colonna per vincere',
        output: 'Number',
        colour: 210,
        tooltip: 'La colonna che ti fa vincere subito.',
      },
      {
        type: 'f4_avversario_puo_vincere',
        message0: "l'avversario può vincere subito?",
        output: 'Boolean',
        colour: 210,
        tooltip: "Vero se al prossimo turno l'avversario può fare 4 in fila.",
      },
      {
        type: 'f4_mossa_che_blocca',
        message0: 'la colonna che lo blocca',
        output: 'Number',
        colour: 210,
        tooltip: "La colonna che impedisce all'avversario di vincere.",
      },
      {
        type: 'f4_sicura_esiste',
        message0: "c'è una colonna che non regala la vittoria?",
        output: 'Boolean',
        colour: 210,
        tooltip: "Vero se puoi giocare senza offrire all'avversario un 4 in fila al turno dopo.",
      },
      {
        type: 'f4_una_sicura',
        message0: 'una colonna che non regala la vittoria',
        output: 'Number',
        colour: 210,
        tooltip: "Una colonna dove la tua mossa non prepara la vittoria dell'avversario.",
      },
      {
        type: 'f4_colonna_libera',
        message0: 'la colonna %1 è libera?',
        args0: [{ type: 'input_value', name: 'COLONNA', check: 'Number' }],
        output: 'Boolean',
        colour: 210,
        tooltip: "Vero se in quella colonna c'è ancora posto (0 = la prima a sinistra).",
      },
      {
        type: 'f4_colonna_a_caso',
        message0: 'una colonna libera a caso',
        output: 'Number',
        colour: 210,
        tooltip: 'Una colonna libera scelta a caso.',
      },
      {
        type: 'f4_centro',
        message0: 'la colonna centrale',
        output: 'Number',
        colour: 210,
        tooltip: 'La colonna 3, quella in mezzo: di solito è la più preziosa.',
      },
      {
        type: 'f4_ultima_mossa',
        message0: "l'ultima colonna dell'avversario",
        output: 'Number',
        colour: 210,
        tooltip: "La colonna dell'ultima mossa avversaria.",
      },
    ])

    const { gen, Order, define } = labBlockTools()
    define('f4_gioca', (block) => {
      const value = gen.valueToCode(block, 'COLONNA', Order.NONE) || 'colonna_a_caso()'
      return `return ${value}\n`
    })
    define('f4_posso_vincere', () => ['posso_vincere()', Order.FUNCTION_CALL])
    define('f4_mossa_vincente', () => ['mossa_vincente()', Order.FUNCTION_CALL])
    define('f4_avversario_puo_vincere', () => ['avversario_puo_vincere()', Order.FUNCTION_CALL])
    define('f4_mossa_che_blocca', () => ['mossa_che_blocca()', Order.FUNCTION_CALL])
    define('f4_sicura_esiste', () => ['esiste_colonna_sicura()', Order.FUNCTION_CALL])
    define('f4_una_sicura', () => ['una_colonna_sicura()', Order.FUNCTION_CALL])
    define('f4_colonna_libera', (block) => {
      const value = gen.valueToCode(block, 'COLONNA', Order.NONE) || '3'
      return [`colonna_libera(${value})`, Order.FUNCTION_CALL]
    })
    define('f4_colonna_a_caso', () => ['colonna_a_caso()', Order.FUNCTION_CALL])
    define('f4_centro', () => ['3', Order.ATOMIC])
    define('f4_ultima_mossa', () => ['ultima_mossa_avversario()', Order.FUNCTION_CALL])
  },

  cards: {
    vinci: {
      label: '🏆 Vinci se puoi',
      hint: 'Se una colonna ti fa fare 4 in fila, giocala.',
      code: 'if posso_vincere():\n  return mossa_vincente()',
    },
    blocca: {
      label: "🛡️ Blocca l'avversario",
      hint: "Se l'avversario sta per vincere, tappagli la colonna.",
      code: 'if avversario_puo_vincere():\n  return mossa_che_blocca()',
    },
    centro: {
      label: '🎯 Prendi il centro',
      hint: 'La colonna in mezzo è la più preziosa: se è libera, giocala.',
      code: 'if colonna_libera(3):\n  return 3',
    },
    sicura: {
      label: '⚠️ Non regalare la vittoria',
      hint: "Evita le colonne dove la tua mossa offre all'avversario il 4 in fila.",
      code: 'if esiste_colonna_sicura():\n  return una_colonna_sicura()',
    },
    copia: {
      label: "🪞 Copia l'avversario",
      hint: "Gioca nella stessa colonna dell'ultima mossa avversaria.",
      code: 'if colonna_libera(ultima_mossa_avversario()):\n  return ultima_mossa_avversario()',
    },
    sinistra: {
      label: '⬅️ Riempi da sinistra',
      hint: 'La prima colonna libera partendo da sinistra.',
      code: 'for c in range(COLS):\n  if colonna_libera(c):\n    return c',
    },
    destra: {
      label: '➡️ Riempi da destra',
      hint: 'La prima colonna libera partendo da destra.',
      code: 'for c in range(COLS - 1, -1, -1):\n  if colonna_libera(c):\n    return c',
    },
    caso: {
      label: '🎲 Gioca a caso',
      hint: 'Una colonna libera qualsiasi: imprevedibile!',
      code: 'return colonna_a_caso()',
    },
  },
  starterDeck: ['vinci', 'blocca', 'centro', 'caso'],
}
