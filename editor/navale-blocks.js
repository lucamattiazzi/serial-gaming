// ── Laboratorio: Battaglia navale ────────────────────────────
// La flotta viene piazzata a caso dal motore: la strategia dei
// bambini è tutta nella caccia.
const NAVALE_RUNTIME_HEAD = `import sys
import json
import random

# --- generato dal Laboratorio (Battaglia navale) ---
# La tua strategia di caccia e' dentro decidi(); il resto e' il motore
# (la flotta viene piazzata a caso).

SHOTS = []


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


def quanti_colpi_a_segno():
    return sum(1 for s in SHOTS if s["result"] in ("hit", "sunk"))


def decidi():
`

const NAVALE_RUNTIME_TAIL = `    return colpo_a_scacchiera()


while True:
    line = sys.stdin.readline()
    try:
        state = json.loads(line)
    except ValueError:
        continue
    if state.get("winner") is not None:
        continue  # partita finita
    if state.get("phase") == "place":
        print(json.dumps({"ships": _piazza_flotta(state["fleet"])}))
        continue
    if state.get("phase") != "hunt":
        continue  # annuncio di inizio partita
    SHOTS = state["shots"]
    mossa = decidi()
    valida = (isinstance(mossa, (list, tuple)) and len(mossa) == 2
              and 0 <= mossa[0] < 10 and 0 <= mossa[1] < 10
              and (mossa[0], mossa[1]) not in _provate())
    if not valida:
        mossa = colpo_a_caso()  # rete di sicurezza
    print(json.dumps({"move": [int(mossa[0]), int(mossa[1])]}))
`

LAB_GAMES.navale = {
  name: 'Battaglia navale',

  compose(body) {
    return NAVALE_RUNTIME_HEAD + labIndent(body) + NAVALE_RUNTIME_TAIL
  },

  starterXml: `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="controls_if" x="30" y="30">
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
    define('nav_ho_bersaglio', () => ['ho_un_bersaglio()', Order.FUNCTION_CALL])
    define('nav_vicino', () => ['vicino_a_un_colpo()', Order.FUNCTION_CALL])
    define('nav_scacchiera', () => ['colpo_a_scacchiera()', Order.FUNCTION_CALL])
    define('nav_caso', () => ['colpo_a_caso()', Order.FUNCTION_CALL])
    define('nav_colpi_a_segno', () => ['quanti_colpi_a_segno()', Order.FUNCTION_CALL])
  },

  cards: {
    insegui: {
      label: '🎯 Insegui i colpi a segno',
      hint: 'Hai colpito qualcosa? Spara nelle celle accanto per affondarla.',
      code: 'if ho_un_bersaglio():\n  return vicino_a_un_colpo()',
    },
    scacchiera: {
      label: '♟️ Cerca a scacchiera',
      hint: 'Una cella sì e una no: la nave più corta (2) non può sfuggirti.',
      code: 'return colpo_a_scacchiera()',
    },
    caso: {
      label: '🎲 Spara a caso',
      hint: 'Fuoco alla cieca su una cella mai provata.',
      code: 'return colpo_a_caso()',
    },
  },
  starterDeck: ['insegui', 'scacchiera'],
}
