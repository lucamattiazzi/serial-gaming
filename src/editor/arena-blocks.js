// ── Laboratorio: Arena dei Mostri ────────────────────────────
// Il draft lo gestisce il motore (3 tipi diversi, a caso) e cosi' pure
// il cambio obbligato dopo un KO: la strategia dei bambini e' tutta
// nella scelta dell'azione a ogni turno di battaglia.
const ARENA_RUNTIME_HEAD = `import random

# --- generato dal Laboratorio (Arena dei Mostri) ---
# La tua strategia e' dentro decidi(); il resto e' il motore
# (il draft sceglie 3 mostri di tipo diverso).
# Il router (main.py) chiama rispondi(state) a ogni messaggio.

CICLO = ["fuoco", "erba", "elettro", "acqua"]
STATE = {}


def _mio():
    return STATE["you"]["team"][STATE["you"]["active"]]


def _suo():
    return STATE["opp"]["active"]


def _moltiplicatore(tipo_mossa, tipo_difensore):
    if tipo_mossa == "normale" or tipo_difensore == "normale":
        return 1
    d = (CICLO.index(tipo_difensore) - CICLO.index(tipo_mossa)) % 4
    if d == 1:
        return 2
    if d in (0, 3):
        return 0.5
    return 1


def _valore(mossa, difensore):
    # danno atteso: potenza * efficacia di tipo * precisione
    return mossa["power"] * _moltiplicatore(mossa["type"], difensore["type"]) * mossa["accuracy"]


def attacco_migliore():
    io, lui = _mio(), _suo()
    valori = [_valore(m, lui) for m in io["moves"]]
    return ["attacca", valori.index(max(valori))]


def attacco_forte():
    return ["attacca", 0]


def attacco_preciso():
    return ["attacca", 1]


def difenditi():
    return ["difendi"]


def _panchina():
    return [i for i, m in enumerate(STATE["you"]["team"])
            if m["hp"] > 0 and i != STATE["you"]["active"]]


def posso_cambiare():
    return len(_panchina()) > 0


def cambio_migliore():
    lui = _suo()

    def punteggio(i):
        m = STATE["you"]["team"][i]
        mio_meglio = max(_valore(mv, lui) for mv in m["moves"])
        suo_meglio = max(_valore(mv, m) for mv in lui["moves"])
        return mio_meglio - suo_meglio

    scelta = _panchina()[0]
    for i in _panchina():
        if punteggio(i) > punteggio(scelta):
            scelta = i
    return ["cambia", scelta]


def sono_svantaggiato():
    # il tipo dell'avversario e' superefficace sul mio?
    return _moltiplicatore(_suo()["type"], _mio()["type"]) == 2


def sono_avvantaggiato():
    return _moltiplicatore(_mio()["type"], _suo()["type"]) == 2


def sto_per_morire():
    io, lui = _mio(), _suo()
    colpo = max(m["power"] * _moltiplicatore(m["type"], io["type"]) for m in lui["moves"])
    return io["hp"] <= colpo


def sono_piu_lento():
    return _mio()["speed"] < _suo()["speed"]


def azione_a_caso():
    return random.choice([attacco_forte(), attacco_preciso(), difenditi()])


def _scegli_squadra(roster):
    ordine = sorted(range(len(roster)), key=lambda i: random.random())
    squadra = []
    tipi = []
    for i in ordine:
        if roster[i]["type"] in tipi:
            continue
        squadra.append(i)
        tipi.append(roster[i]["type"])
        if len(squadra) == 3:
            return squadra
    for i in ordine:
        if i not in squadra:
            squadra.append(i)
            if len(squadra) == 3:
                break
    return squadra


def _azione_valida(azione):
    if not isinstance(azione, list) or not azione:
        return False
    if azione[0] == "difendi":
        return True
    if azione[0] == "attacca":
        return len(azione) == 2 and azione[1] in (0, 1)
    if azione[0] == "cambia":
        return len(azione) == 2 and azione[1] in _panchina()
    return False


def decidi():
`

const ARENA_RUNTIME_TAIL = `    return attacco_migliore()


def rispondi(state):
    global STATE
    if state.get("winner") is not None:
        return None  # partita finita
    if state.get("phase") == "draft":
        return {"team": _scegli_squadra(state["roster"])}
    if state.get("phase") not in ("battle", "replace"):
        return None  # annuncio di inizio partita
    STATE = state
    if state["phase"] == "replace":
        return {"move": cambio_migliore()}  # dopo un KO si puo' solo cambiare
    azione = decidi()
    if not _azione_valida(azione):
        azione = attacco_preciso()  # rete di sicurezza: sempre valida
    return {"move": azione}
`

LAB_GAMES.arena = {
  name: 'Arena dei Mostri',

  compose(body) {
    return ARENA_RUNTIME_HEAD + labIndent(body) + ARENA_RUNTIME_TAIL
  },

  starterXml: `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="controls_if" x="30" y="30">
    <value name="IF0">
      <block type="logic_operation">
        <field name="OP">AND</field>
        <value name="A"><block type="arena_svantaggiato"></block></value>
        <value name="B"><block type="arena_posso_cambiare"></block></value>
      </block>
    </value>
    <statement name="DO0">
      <block type="arena_fai">
        <value name="AZIONE"><block type="arena_cambio_migliore"></block></value>
      </block>
    </statement>
    <next>
      <block type="controls_if">
        <value name="IF0"><block type="arena_sto_per_morire"></block></value>
        <statement name="DO0">
          <block type="arena_fai">
            <value name="AZIONE"><block type="arena_difendi"></block></value>
          </block>
        </statement>
        <next>
          <block type="arena_fai">
            <value name="AZIONE"><block type="arena_attacco_migliore"></block></value>
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
        name: 'Arena',
        colour: '20',
        contents: [
          { kind: 'block', type: 'arena_fai' },
          { kind: 'block', type: 'arena_attacco_migliore' },
          { kind: 'block', type: 'arena_attacco_forte' },
          { kind: 'block', type: 'arena_attacco_preciso' },
          { kind: 'block', type: 'arena_difendi' },
          { kind: 'block', type: 'arena_cambio_migliore' },
          { kind: 'block', type: 'arena_svantaggiato' },
          { kind: 'block', type: 'arena_avvantaggiato' },
          { kind: 'block', type: 'arena_sto_per_morire' },
          { kind: 'block', type: 'arena_piu_lento' },
          { kind: 'block', type: 'arena_posso_cambiare' },
          { kind: 'block', type: 'arena_caso' },
        ],
      },
      LAB_LOGIC_CATEGORY,
    ],
  },

  setupBlocks() {
    Blockly.defineBlocksWithJsonArray([
      {
        type: 'arena_fai',
        message0: "fai l'azione %1",
        args0: [{ type: 'input_value', name: 'AZIONE', check: 'Azione' }],
        previousStatement: null,
        colour: 160,
        tooltip: 'Esegue quell\'azione e chiude il turno.',
      },
      { type: 'arena_attacco_migliore', message0: "l'attacco più efficace", output: 'Azione', colour: 20, tooltip: 'L\'attacco col miglior danno atteso (potenza × tipo × precisione).' },
      { type: 'arena_attacco_forte', message0: "l'attacco forte", output: 'Azione', colour: 20, tooltip: 'Tanta potenza, ma può mancare il bersaglio.' },
      { type: 'arena_attacco_preciso', message0: "l'attacco preciso", output: 'Azione', colour: 20, tooltip: 'Meno potenza, ma va sempre a segno.' },
      { type: 'arena_difendi', message0: 'difenditi', output: 'Azione', colour: 20, tooltip: 'Dimezzi il danno ricevuto e ne restituisci una parte.' },
      { type: 'arena_cambio_migliore', message0: 'il cambio migliore', output: 'Azione', colour: 20, tooltip: 'Manda in campo il mostro della panchina messo meglio contro quello avversario.' },
      { type: 'arena_svantaggiato', message0: 'sono svantaggiato di tipo?', output: 'Boolean', colour: 20, tooltip: 'Vero se il tipo avversario è superefficace sul tuo.' },
      { type: 'arena_avvantaggiato', message0: 'sono avvantaggiato di tipo?', output: 'Boolean', colour: 20, tooltip: 'Vero se il tuo tipo è superefficace su quello avversario.' },
      { type: 'arena_sto_per_morire', message0: 'il prossimo colpo può mettermi KO?', output: 'Boolean', colour: 20, tooltip: 'Vero se l\'attacco più forte dell\'avversario basta a finire il tuo mostro.' },
      { type: 'arena_piu_lento', message0: 'sono più lento?', output: 'Boolean', colour: 20, tooltip: 'Vero se il mostro avversario attacca prima del tuo.' },
      { type: 'arena_posso_cambiare', message0: 'ho qualcuno in panchina?', output: 'Boolean', colour: 20, tooltip: 'Vero se hai almeno un mostro vivo da mandare in campo.' },
      { type: 'arena_caso', message0: "un'azione a caso", output: 'Azione', colour: 20, tooltip: 'Attacco forte, preciso o difesa: a caso.' },
    ])

    const { gen, Order, define } = labBlockTools()
    define('arena_fai', (block) => {
      const value = gen.valueToCode(block, 'AZIONE', Order.NONE) || 'attacco_migliore()'
      return `return ${value}\n`
    })
    define('arena_attacco_migliore', () => ['attacco_migliore()', Order.FUNCTION_CALL])
    define('arena_attacco_forte', () => ['attacco_forte()', Order.FUNCTION_CALL])
    define('arena_attacco_preciso', () => ['attacco_preciso()', Order.FUNCTION_CALL])
    define('arena_difendi', () => ['difenditi()', Order.FUNCTION_CALL])
    define('arena_cambio_migliore', () => ['cambio_migliore()', Order.FUNCTION_CALL])
    define('arena_svantaggiato', () => ['sono_svantaggiato()', Order.FUNCTION_CALL])
    define('arena_avvantaggiato', () => ['sono_avvantaggiato()', Order.FUNCTION_CALL])
    define('arena_sto_per_morire', () => ['sto_per_morire()', Order.FUNCTION_CALL])
    define('arena_piu_lento', () => ['sono_piu_lento()', Order.FUNCTION_CALL])
    define('arena_posso_cambiare', () => ['posso_cambiare()', Order.FUNCTION_CALL])
    define('arena_caso', () => ['azione_a_caso()', Order.FUNCTION_CALL])
  },

  cards: {
    svantaggio: {
      label: '🔄 Cambia se sei svantaggiato',
      hint: 'Il suo tipo batte il tuo? Manda in campo il mostro messo meglio.',
      code: 'if sono_svantaggiato() and posso_cambiare():\n  return cambio_migliore()',
    },
    scudo: {
      label: '🛡️ Para il colpo del KO',
      hint: 'Se il prossimo colpo può stenderti, difenditi: dimezzi e restituisci danno.',
      code: 'if sto_per_morire() and sono_piu_lento():\n  return difenditi()',
    },
    migliore: {
      label: "💥 L'attacco più efficace",
      hint: 'Il colpo col miglior danno atteso: potenza × tipo × precisione.',
      code: 'return attacco_migliore()',
    },
    forte: {
      label: "🔨 Sempre l'attacco forte",
      hint: 'Tutta potenza, zero paura: ma ogni tanto manca il bersaglio.',
      code: 'return attacco_forte()',
    },
    preciso: {
      label: "🎯 Sempre l'attacco preciso",
      hint: 'Meno danno ma nessun rischio: va sempre a segno.',
      code: 'return attacco_preciso()',
    },
    caso: {
      label: '🎲 Agisci a caso',
      hint: 'Forte, preciso o difesa: deciderà la sorte.',
      code: 'return azione_a_caso()',
    },
  },
  starterDeck: ['svantaggio', 'scudo', 'migliore'],
}
