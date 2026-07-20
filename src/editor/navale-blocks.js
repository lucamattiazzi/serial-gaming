// ── Laboratorio: Battaglia navale ────────────────────────────
// La flotta viene piazzata a caso dal motore: la strategia dei
// bambini è tutta nella caccia.
const NAVALE_RUNTIME_HEAD = `import random

# --- generato dal Laboratorio (Battaglia navale) ---
# La tua strategia di caccia e' dentro decidi(); il resto e' il motore
# (la flotta viene piazzata a caso).
# Il router (main.py) chiama rispondi(state) a ogni messaggio.

SHOTS = []
REGOLA = None  # quale carta ha deciso l'ultimo colpo (la mostra la pagina di gioco)


def _carta(nome, mossa):
    global REGOLA
    REGOLA = nome
    return mossa


def _piazza_flotta(fleet):
    ships = []
    occupied = set()
    for length in fleet:
        while True:
            d = random.choice(["h", "v"])
            x = random.randrange(11 - length if d == "h" else 10)
            y = random.randrange(11 - length if d == "v" else 10)
            cells = [(x + i, y) if d == "h" else (x, y + i) for i in range(length)]
            if not any(c in occupied for c in cells):
                occupied.update(cells)
                ships.append({"x": x, "y": y, "dir": d, "len": length})
                break
    return ships


def _provate():
    return {(s["x"], s["y"]) for s in SHOTS}


def _libere():
    tried = _provate()
    return [(x, y) for y in range(10) for x in range(10) if (x, y) not in tried]


def colpo_a_caso():
    return random.choice(_libere())


def colpo_a_scacchiera():
    pari = [c for c in _libere() if (c[0] + c[1]) % 2 == 0]
    return random.choice(pari) if pari else colpo_a_caso()


def _bersagli():
    tried = _provate()
    res = []
    for s in SHOTS:
        if s["result"] != "hit":
            continue
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            cella = (s["x"] + dx, s["y"] + dy)
            if 0 <= cella[0] < 10 and 0 <= cella[1] < 10 and cella not in tried:
                res.append(cella)
    return res


def ho_un_bersaglio():
    return len(_bersagli()) > 0


def vicino_a_un_colpo():
    bersagli = _bersagli()
    return random.choice(bersagli) if bersagli else colpo_a_caso()


def _bersagli_in_linea():
    # due o piu' colpi a segno adiacenti: la nave continua alle estremita'
    tried = _provate()
    hits = {(s["x"], s["y"]) for s in SHOTS if s["result"] == "hit"}
    res = []
    for x, y in hits:
        for dx, dy in ((1, 0), (0, 1)):
            if (x + dx, y + dy) not in hits:
                continue
            ax, ay = x, y
            while (ax - dx, ay - dy) in hits:
                ax, ay = ax - dx, ay - dy
            bx, by = x + dx, y + dy
            while (bx + dx, by + dy) in hits:
                bx, by = bx + dx, by + dy
            for cella in ((ax - dx, ay - dy), (bx + dx, by + dy)):
                if 0 <= cella[0] < 10 and 0 <= cella[1] < 10 \
                        and cella not in tried and cella not in res:
                    res.append(cella)
    return res


def ho_una_linea():
    return len(_bersagli_in_linea()) > 0


def colpo_in_linea():
    bersagli = _bersagli_in_linea()
    return random.choice(bersagli) if bersagli else vicino_a_un_colpo()


def quanti_colpi_a_segno():
    return sum(1 for s in SHOTS if s["result"] in ("hit", "sunk"))


def decidi():
`

const NAVALE_RUNTIME_TAIL = `    return colpo_a_scacchiera()


def rispondi(state):
    global SHOTS, REGOLA
    if state.get("winner") is not None:
        return None  # partita finita
    if state.get("phase") == "place":
        return {"ships": _piazza_flotta(state["fleet"])}
    if state.get("phase") != "hunt":
        return None  # annuncio di inizio partita
    SHOTS = state["shots"]
    REGOLA = None
    mossa = decidi()
    valida = (isinstance(mossa, (list, tuple)) and len(mossa) == 2
              and 0 <= mossa[0] < 10 and 0 <= mossa[1] < 10
              and (mossa[0], mossa[1]) not in _provate())
    if not valida:
        mossa = _carta("rete di sicurezza", colpo_a_caso())
    risposta = {"move": [int(mossa[0]), int(mossa[1])]}
    if REGOLA is not None:
        risposta["regola"] = REGOLA
    return risposta
`

LAB_GAMES.navale = {
  name: 'Battaglia navale',

  compose(body) {
    return NAVALE_RUNTIME_HEAD + labIndent(body) + NAVALE_RUNTIME_TAIL
  },

  starterXml: `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="controls_if" x="30" y="30">
    <value name="IF0"><block type="nav_ho_linea"></block></value>
    <statement name="DO0">
      <block type="nav_spara">
        <value name="CELLA"><block type="nav_in_linea"></block></value>
      </block>
    </statement>
    <next>
      <block type="controls_if">
        <value name="IF0"><block type="nav_ho_bersaglio"></block></value>
        <statement name="DO0">
          <block type="nav_spara">
            <value name="CELLA"><block type="nav_vicino"></block></value>
          </block>
        </statement>
        <next>
          <block type="nav_spara">
            <value name="CELLA"><block type="nav_scacchiera"></block></value>
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
        name: 'Navale',
        colour: '230',
        contents: [
          { kind: 'block', type: 'nav_spara' },
          { kind: 'block', type: 'nav_ho_linea' },
          { kind: 'block', type: 'nav_in_linea' },
          { kind: 'block', type: 'nav_ho_bersaglio' },
          { kind: 'block', type: 'nav_vicino' },
          { kind: 'block', type: 'nav_scacchiera' },
          { kind: 'block', type: 'nav_caso' },
          { kind: 'block', type: 'nav_colpi_a_segno' },
        ],
      },
      LAB_LOGIC_CATEGORY,
    ],
  },

  setupBlocks() {
    Blockly.defineBlocksWithJsonArray([
      {
        type: 'nav_spara',
        message0: 'spara in %1',
        args0: [{ type: 'input_value', name: 'CELLA', check: 'Cella' }],
        previousStatement: null,
        colour: 160,
        tooltip: 'Fai fuoco su quella cella e chiudi il turno.',
      },
      { type: 'nav_ho_linea', message0: 'ho due colpi a segno allineati?', output: 'Boolean', colour: 230, tooltip: 'Vero se due colpi a segno adiacenti indicano la direzione di una nave.' },
      { type: 'nav_in_linea', message0: 'una cella che continua la linea', output: 'Cella', colour: 230, tooltip: 'La nave continua oltre le estremità dei colpi allineati: spara lì.' },
      { type: 'nav_ho_bersaglio', message0: 'ho un colpo a segno da inseguire?', output: 'Boolean', colour: 230, tooltip: 'Vero se accanto a un tuo colpo a segno ci sono celle da provare.' },
      { type: 'nav_vicino', message0: 'una cella accanto a un colpo a segno', output: 'Cella', colour: 230, tooltip: 'Insegui la nave che hai già colpito.' },
      { type: 'nav_scacchiera', message0: 'una cella a scacchiera', output: 'Cella', colour: 230, tooltip: 'Cerca saltando una cella sì e una no: nessuna nave ti sfugge.' },
      { type: 'nav_caso', message0: 'una cella a caso', output: 'Cella', colour: 230, tooltip: 'Una cella mai provata, a caso.' },
      { type: 'nav_colpi_a_segno', message0: 'quanti colpi a segno ho fatto', output: 'Number', colour: 230, tooltip: 'Il totale dei tuoi colpi andati a segno.' },
    ])

    const { gen, Order, define } = labBlockTools()
    define('nav_spara', (block) => {
      const value = gen.valueToCode(block, 'CELLA', Order.NONE) || 'colpo_a_scacchiera()'
      return `return ${value}\n`
    })
    define('nav_ho_linea', () => ['ho_una_linea()', Order.FUNCTION_CALL])
    define('nav_in_linea', () => ['colpo_in_linea()', Order.FUNCTION_CALL])
    define('nav_ho_bersaglio', () => ['ho_un_bersaglio()', Order.FUNCTION_CALL])
    define('nav_vicino', () => ['vicino_a_un_colpo()', Order.FUNCTION_CALL])
    define('nav_scacchiera', () => ['colpo_a_scacchiera()', Order.FUNCTION_CALL])
    define('nav_caso', () => ['colpo_a_caso()', Order.FUNCTION_CALL])
    define('nav_colpi_a_segno', () => ['quanti_colpi_a_segno()', Order.FUNCTION_CALL])
  },

  cards: {
    linea: {
      label: '📐 Segui la linea',
      hint: 'Due colpi a segno allineati? La nave continua di lì: spara alle estremità.',
      code: 'if ho_una_linea():\n  return colpo_in_linea()',
      xml: '<block type="controls_if"><value name="IF0"><block type="nav_ho_linea"></block></value><statement name="DO0"><block type="nav_spara"><value name="CELLA"><block type="nav_in_linea"></block></value></block></statement></block>',
    },
    insegui: {
      label: '🎯 Insegui i colpi a segno',
      hint: 'Hai colpito qualcosa? Spara nelle celle accanto per affondarla.',
      code: 'if ho_un_bersaglio():\n  return vicino_a_un_colpo()',
      xml: '<block type="controls_if"><value name="IF0"><block type="nav_ho_bersaglio"></block></value><statement name="DO0"><block type="nav_spara"><value name="CELLA"><block type="nav_vicino"></block></value></block></statement></block>',
    },
    scacchiera: {
      label: '♟️ Cerca a scacchiera',
      hint: 'Una cella sì e una no: la nave più corta (2) non può sfuggirti.',
      code: 'return colpo_a_scacchiera()',
      xml: '<block type="nav_spara"><value name="CELLA"><block type="nav_scacchiera"></block></value></block>',
    },
    caso: {
      label: '🎲 Spara a caso',
      hint: 'Fuoco alla cieca su una cella mai provata.',
      code: 'return colpo_a_caso()',
      xml: '<block type="nav_spara"><value name="CELLA"><block type="nav_caso"></block></value></block>',
    },
  },
  starterDeck: ['linea', 'insegui', 'scacchiera'],
}
