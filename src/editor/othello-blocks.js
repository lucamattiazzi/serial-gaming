// ── Laboratorio: Othello ─────────────────────────────────────
// Il motore passa le mosse legali gia' pronte (MOSSE): la strategia
// dei bambini e' tutta nello scegliere QUALE giocare.
const OTH_RUNTIME_HEAD = `import random

# --- generato dal Laboratorio (Othello) ---
# La tua strategia e' dentro decidi(); il resto e' il motore.
# Il router (main.py) chiama rispondi(state) a ogni messaggio.
# Caselle 0-63: indice = riga * 8 + colonna. Sei sempre "O".
# In MOSSE trovi le mosse legali gia' calcolate: scegline una.

BOARD = []
MOSSE = []
ULTIMA_MOSSA = None
IO = "O"
AVVERSARIO = "X"
ANGOLI = (0, 7, 56, 63)
# le caselle accanto agli angoli: giocarci spesso regala l'angolo
VICINE_AGLI_ANGOLI = (1, 8, 9, 6, 14, 15, 48, 49, 57, 54, 55, 62)
DIREZIONI = ((-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1))


def mossa_a_caso():
    return random.choice(MOSSE)


def conta_catture(mossa):
    if mossa not in MOSSE:
        return 0
    riga, col = mossa // 8, mossa % 8
    totale = 0
    for dr, dc in DIREZIONI:
        r, c = riga + dr, col + dc
        fila = 0
        while 0 <= r < 8 and 0 <= c < 8 and BOARD[r * 8 + c] == AVVERSARIO:
            fila += 1
            r += dr
            c += dc
        if fila and 0 <= r < 8 and 0 <= c < 8 and BOARD[r * 8 + c] == IO:
            totale += fila
    return totale


def angolo_possibile():
    return any(m in ANGOLI for m in MOSSE)


def un_angolo():
    angoli = [m for m in MOSSE if m in ANGOLI]
    return random.choice(angoli) if angoli else mossa_a_caso()


def _sicure():
    return [m for m in MOSSE if m not in VICINE_AGLI_ANGOLI]


def esiste_mossa_sicura():
    return len(_sicure()) > 0


def una_mossa_sicura():
    sicure = _sicure()
    return random.choice(sicure) if sicure else mossa_a_caso()


def _bordi():
    return [m for m in MOSSE
            if (m // 8 in (0, 7) or m % 8 in (0, 7))
            and m not in VICINE_AGLI_ANGOLI]


def bordo_possibile():
    return len(_bordi()) > 0


def un_bordo():
    bordi = _bordi()
    return random.choice(bordi) if bordi else mossa_a_caso()


def mossa_piu_ghiotta():
    return max(MOSSE, key=conta_catture)


def mossa_meno_ghiotta():
    return min(MOSSE, key=conta_catture)


def quante_mosse_ho():
    return len(MOSSE)


def decidi():
`

const OTH_RUNTIME_TAIL = `    return mossa_a_caso()


def rispondi(state):
    global BOARD, MOSSE, ULTIMA_MOSSA
    if state.get("winner") is not None:
        return None  # partita finita
    if state.get("board") is None:
        return None  # annuncio di inizio partita
    BOARD = state["board"]
    MOSSE = state["moves"]
    ULTIMA_MOSSA = state["lastMove"]
    mossa = decidi()
    if mossa not in MOSSE:
        mossa = mossa_a_caso()  # rete di sicurezza: mai una mossa invalida
    return {"move": int(mossa)}
`

LAB_GAMES.othello = {
  name: 'Othello',

  compose(body) {
    return OTH_RUNTIME_HEAD + labIndent(body) + OTH_RUNTIME_TAIL
  },

  starterXml: `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="controls_if" x="30" y="30">
    <value name="IF0"><block type="oth_angolo_possibile"></block></value>
    <statement name="DO0">
      <block type="oth_gioca">
        <value name="CASELLA"><block type="oth_un_angolo"></block></value>
      </block>
    </statement>
    <next>
      <block type="controls_if">
        <value name="IF0"><block type="oth_sicura_esiste"></block></value>
        <statement name="DO0">
          <block type="oth_gioca">
            <value name="CASELLA"><block type="oth_una_sicura"></block></value>
          </block>
        </statement>
        <next>
          <block type="oth_gioca">
            <value name="CASELLA"><block type="oth_piu_ghiotta"></block></value>
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
        name: 'Othello',
        colour: '120',
        contents: [
          { kind: 'block', type: 'oth_gioca' },
          { kind: 'block', type: 'oth_angolo_possibile' },
          { kind: 'block', type: 'oth_un_angolo' },
          { kind: 'block', type: 'oth_sicura_esiste' },
          { kind: 'block', type: 'oth_una_sicura' },
          { kind: 'block', type: 'oth_bordo_possibile' },
          { kind: 'block', type: 'oth_un_bordo' },
          { kind: 'block', type: 'oth_piu_ghiotta' },
          { kind: 'block', type: 'oth_meno_ghiotta' },
          { kind: 'block', type: 'oth_caso' },
          { kind: 'block', type: 'oth_catture' },
          { kind: 'block', type: 'oth_quante_mosse' },
        ],
      },
      LAB_LOGIC_CATEGORY,
    ],
  },

  setupBlocks() {
    Blockly.defineBlocksWithJsonArray([
      {
        type: 'oth_gioca',
        message0: 'gioca nella casella %1',
        args0: [{ type: 'input_value', name: 'CASELLA', check: 'Number' }],
        previousStatement: null,
        colour: 160,
        tooltip: 'Mette il tuo disco in quella casella (0-63) e chiude il turno.',
      },
      { type: 'oth_angolo_possibile', message0: 'posso prendere un angolo?', output: 'Boolean', colour: 120, tooltip: 'Vero se una delle tue mosse legali è un angolo (0, 7, 56, 63).' },
      { type: 'oth_un_angolo', message0: 'un angolo da prendere', output: 'Number', colour: 120, tooltip: 'Un angolo tra le tue mosse legali: la casella più preziosa che ci sia.' },
      { type: 'oth_sicura_esiste', message0: "c'è una mossa che non regala gli angoli?", output: 'Boolean', colour: 120, tooltip: 'Vero se puoi evitare le caselle accanto agli angoli.' },
      { type: 'oth_una_sicura', message0: 'una mossa che non regala gli angoli', output: 'Number', colour: 120, tooltip: "Una mossa lontana dalle caselle accanto agli angoli: da lì l'avversario li prende." },
      { type: 'oth_bordo_possibile', message0: 'posso prendere un bordo?', output: 'Boolean', colour: 120, tooltip: 'Vero se una mossa legale è sul bordo (non accanto a un angolo).' },
      { type: 'oth_un_bordo', message0: 'una casella di bordo', output: 'Number', colour: 120, tooltip: 'Una mossa sul bordo: i dischi lì sono difficili da girare.' },
      { type: 'oth_piu_ghiotta', message0: 'la mossa che mangia di più', output: 'Number', colour: 120, tooltip: 'La mossa che gira più pedine avversarie. Sembra furba… lo è davvero?' },
      { type: 'oth_meno_ghiotta', message0: 'la mossa che mangia di meno', output: 'Number', colour: 120, tooltip: 'La mossa che gira meno pedine: spesso lascia meno mosse buone all\'avversario.' },
      { type: 'oth_caso', message0: 'una mossa legale a caso', output: 'Number', colour: 120, tooltip: 'Una mossa qualsiasi tra quelle permesse.' },
      {
        type: 'oth_catture',
        message0: 'quante pedine mangio con %1',
        args0: [{ type: 'input_value', name: 'CASELLA', check: 'Number' }],
        output: 'Number',
        colour: 120,
        tooltip: 'Il numero di pedine avversarie che quella mossa girerebbe.',
      },
      { type: 'oth_quante_mosse', message0: 'quante mosse ho', output: 'Number', colour: 120, tooltip: 'Il numero delle tue mosse legali in questo turno.' },
    ])

    const { gen, Order, define } = labBlockTools()
    define('oth_gioca', (block) => {
      const value = gen.valueToCode(block, 'CASELLA', Order.NONE) || 'mossa_a_caso()'
      return `return ${value}\n`
    })
    define('oth_angolo_possibile', () => ['angolo_possibile()', Order.FUNCTION_CALL])
    define('oth_un_angolo', () => ['un_angolo()', Order.FUNCTION_CALL])
    define('oth_sicura_esiste', () => ['esiste_mossa_sicura()', Order.FUNCTION_CALL])
    define('oth_una_sicura', () => ['una_mossa_sicura()', Order.FUNCTION_CALL])
    define('oth_bordo_possibile', () => ['bordo_possibile()', Order.FUNCTION_CALL])
    define('oth_un_bordo', () => ['un_bordo()', Order.FUNCTION_CALL])
    define('oth_piu_ghiotta', () => ['mossa_piu_ghiotta()', Order.FUNCTION_CALL])
    define('oth_meno_ghiotta', () => ['mossa_meno_ghiotta()', Order.FUNCTION_CALL])
    define('oth_caso', () => ['mossa_a_caso()', Order.FUNCTION_CALL])
    define('oth_catture', (block) => {
      const value = gen.valueToCode(block, 'CASELLA', Order.NONE) || '0'
      return [`conta_catture(${value})`, Order.FUNCTION_CALL]
    })
    define('oth_quante_mosse', () => ['quante_mosse_ho()', Order.FUNCTION_CALL])
  },

  cards: {
    angolo: {
      label: "👑 Prendi l'angolo",
      hint: 'Un disco nell\'angolo non può più essere girato: se puoi, prendilo.',
      code: 'if angolo_possibile():\n  return un_angolo()',
    },
    sicura: {
      label: '🚧 Non regalare gli angoli',
      hint: "Evita le caselle accanto agli angoli: da lì l'avversario se li prende.",
      code: 'if esiste_mossa_sicura():\n  return una_mossa_sicura()',
    },
    bordo: {
      label: '📏 Prendi il bordo',
      hint: 'I dischi sul bordo sono difficili da girare (alla larga dagli angoli altrui).',
      code: 'if bordo_possibile():\n  return un_bordo()',
    },
    ghiotta: {
      label: '😋 Mangia il più possibile',
      hint: 'La mossa che gira più pedine. Sembra furbo… sarà vero?',
      code: 'return mossa_piu_ghiotta()',
    },
    parca: {
      label: '🤏 Mangia il meno possibile',
      hint: 'Poche pedine girate = meno regali all\'avversario. I campioni fanno così.',
      code: 'return mossa_meno_ghiotta()',
    },
    caso: {
      label: '🎲 Gioca a caso',
      hint: 'Una mossa legale qualsiasi.',
      code: 'return mossa_a_caso()',
    },
  },
  starterDeck: ['angolo', 'sicura', 'ghiotta'],
}
