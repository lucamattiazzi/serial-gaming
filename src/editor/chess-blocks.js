// ── Laboratorio: Scacchi ─────────────────────────────────────
// Il runtime include un generatore di mosse legali completo (arrocco,
// en passant, promozione a donna, inchiodature): i bambini scelgono
// QUALE mossa giocare, mai una illegale.
const CHESS_RUNTIME_HEAD = `import random

# --- generato dal Laboratorio (Scacchi) ---
# La tua strategia e' dentro decidi(); il motore genera le mosse legali.
# Il router (main.py) chiama rispondi(state) a ogni messaggio.
# Una "mossa" e' una tupla interna: usala coi blocchi/helper, al resto
# pensa il motore.

FILES = "abcdefgh"
VAL = {"p": 1, "n": 3, "b": 3, "r": 5, "q": 9, "k": 0}
KNIGHT = ((2, 1), (2, -1), (-2, 1), (-2, -1), (1, 2), (1, -2), (-1, 2), (-1, -2))
KING = ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1))
DIAG = ((1, 1), (1, -1), (-1, 1), (-1, -1))
ORTO = ((1, 0), (-1, 0), (0, 1), (0, -1))

POS = None
LEGALI = []
REGOLA = None  # quale carta ha deciso l'ultima mossa (la mostra la pagina di gioco)


def _carta(nome, mossa):
    global REGOLA
    REGOLA = nome
    return mossa


def _parse_fen(fen):
    parts = fen.split()
    board = []
    for row in parts[0].split("/"):
        cells = []
        for ch in row:
            if ch.isdigit():
                cells.extend([""] * int(ch))
            else:
                cells.append(ch)
        board.append(cells)
    return {"board": board, "turn": parts[1], "castling": parts[2], "ep": parts[3]}


def _in_board(r, c):
    return 0 <= r < 8 and 0 <= c < 8


def _mine(p, turn):
    if p == "":
        return False
    return p.isupper() if turn == "w" else p.islower()


def _theirs(p, turn):
    if p == "":
        return False
    return p.islower() if turn == "w" else p.isupper()


def _attacked(board, r, c, by):
    pr = r + 1 if by == "w" else r - 1
    pawn = "P" if by == "w" else "p"
    for dc in (-1, 1):
        if _in_board(pr, c + dc) and board[pr][c + dc] == pawn:
            return True
    kn = "N" if by == "w" else "n"
    for dr, dc in KNIGHT:
        if _in_board(r + dr, c + dc) and board[r + dr][c + dc] == kn:
            return True
    kg = "K" if by == "w" else "k"
    for dr, dc in KING:
        if _in_board(r + dr, c + dc) and board[r + dr][c + dc] == kg:
            return True
    for dirs, pieces in ((DIAG, "bq"), (ORTO, "rq")):
        cerca = pieces.upper() if by == "w" else pieces
        for dr, dc in dirs:
            rr, cc = r + dr, c + dc
            while _in_board(rr, cc):
                p = board[rr][cc]
                if p != "":
                    if p in cerca:
                        return True
                    break
                rr += dr
                cc += dc
    return False


def _find_king(board, colore):
    k = "K" if colore == "w" else "k"
    for r in range(8):
        for c in range(8):
            if board[r][c] == k:
                return r, c
    return 0, 0


def _other(turn):
    return "b" if turn == "w" else "w"


def _sq_rc(sq):
    return 8 - int(sq[1]), FILES.index(sq[0])


def _pseudo(pos):
    board = pos["board"]
    turn = pos["turn"]
    res = []
    dirp = -1 if turn == "w" else 1
    start_r = 6 if turn == "w" else 1
    promo_r = 0 if turn == "w" else 7
    ep = _sq_rc(pos["ep"]) if pos["ep"] not in ("-", "") else None
    for r in range(8):
        for c in range(8):
            p = board[r][c]
            if not _mine(p, turn):
                continue
            pl = p.lower()
            if pl == "p":
                nr = r + dirp
                if _in_board(nr, c) and board[nr][c] == "":
                    res.append((r, c, nr, c, "q" if nr == promo_r else ""))
                    if r == start_r and board[r + 2 * dirp][c] == "":
                        res.append((r, c, r + 2 * dirp, c, ""))
                for dc in (-1, 1):
                    nc = c + dc
                    if not _in_board(nr, nc):
                        continue
                    if _theirs(board[nr][nc], turn):
                        res.append((r, c, nr, nc, "q" if nr == promo_r else ""))
                    elif ep is not None and (nr, nc) == ep:
                        res.append((r, c, nr, nc, "ep"))
            elif pl == "n":
                for dr, dc in KNIGHT:
                    rr, cc = r + dr, c + dc
                    if _in_board(rr, cc) and not _mine(board[rr][cc], turn):
                        res.append((r, c, rr, cc, ""))
            elif pl == "k":
                for dr, dc in KING:
                    rr, cc = r + dr, c + dc
                    if _in_board(rr, cc) and not _mine(board[rr][cc], turn):
                        res.append((r, c, rr, cc, ""))
                riga = 7 if turn == "w" else 0
                corto = "K" if turn == "w" else "k"
                lungo = "Q" if turn == "w" else "q"
                nemico = _other(turn)
                if r == riga and c == 4:
                    if (corto in pos["castling"] and board[riga][5] == "" and board[riga][6] == ""
                            and not _attacked(board, riga, 4, nemico)
                            and not _attacked(board, riga, 5, nemico)
                            and not _attacked(board, riga, 6, nemico)):
                        res.append((riga, 4, riga, 6, "cs"))
                    if (lungo in pos["castling"] and board[riga][1] == "" and board[riga][2] == ""
                            and board[riga][3] == ""
                            and not _attacked(board, riga, 4, nemico)
                            and not _attacked(board, riga, 3, nemico)
                            and not _attacked(board, riga, 2, nemico)):
                        res.append((riga, 4, riga, 2, "cl"))
            else:
                dirs = DIAG if pl == "b" else ORTO if pl == "r" else DIAG + ORTO
                for dr, dc in dirs:
                    rr, cc = r + dr, c + dc
                    while _in_board(rr, cc):
                        if _mine(board[rr][cc], turn):
                            break
                        res.append((r, c, rr, cc, ""))
                        if board[rr][cc] != "":
                            break
                        rr += dr
                        cc += dc
    return res


def _applica(board, mv, turn):
    r0, c0, r1, c1, flag = mv
    p = board[r0][c0]
    board[r0][c0] = ""
    if flag == "ep":
        board[r0][c1] = ""
    board[r1][c1] = ("Q" if turn == "w" else "q") if flag == "q" else p
    if flag == "cs":
        board[r1][5] = board[r1][7]
        board[r1][7] = ""
    if flag == "cl":
        board[r1][3] = board[r1][0]
        board[r1][0] = ""


def _legali(pos):
    res = []
    nemico = _other(pos["turn"])
    for mv in _pseudo(pos):
        b2 = [row[:] for row in pos["board"]]
        _applica(b2, mv, pos["turn"])
        kr, kc = _find_king(b2, pos["turn"])
        if not _attacked(b2, kr, kc, nemico):
            res.append(mv)
    return res


def _uci(mv):
    r0, c0, r1, c1, flag = mv
    return FILES[c0] + str(8 - r0) + FILES[c1] + str(8 - r1) + ("q" if flag == "q" else "")


def _valore_catturato(mv):
    r0, c0, r1, c1, flag = mv
    if flag == "ep":
        return 1
    p = POS["board"][r1][c1]
    return VAL[p.lower()] if p != "" else 0


def mossa_a_caso():
    return random.choice(LEGALI)


def posso_catturare():
    return any(_valore_catturato(mv) > 0 for mv in LEGALI)


def cattura_migliore():
    prese = [mv for mv in LEGALI if _valore_catturato(mv) > 0]
    if not prese:
        return mossa_a_caso()
    massimo = max(_valore_catturato(mv) for mv in prese)
    return random.choice([mv for mv in prese if _valore_catturato(mv) == massimo])


def _da_scacco(mv):
    b2 = [row[:] for row in POS["board"]]
    _applica(b2, mv, POS["turn"])
    kr, kc = _find_king(b2, _other(POS["turn"]))
    return _attacked(b2, kr, kc, POS["turn"])


def posso_dare_scacco():
    return any(_da_scacco(mv) for mv in LEGALI)


def mossa_di_scacco():
    scacchi = [mv for mv in LEGALI if _da_scacco(mv)]
    return random.choice(scacchi) if scacchi else mossa_a_caso()


def mossa_verso_il_centro():
    def dist(mv):
        return abs(mv[2] - 3.5) + abs(mv[3] - 3.5)
    minimo = min(dist(mv) for mv in LEGALI)
    return random.choice([mv for mv in LEGALI if dist(mv) == minimo])


def decidi():
`

const CHESS_RUNTIME_TAIL = `    return mossa_a_caso()


def rispondi(state):
    global POS, LEGALI, REGOLA
    if state.get("winner") is not None:
        return None  # partita finita
    if state.get("fen") is None:
        return None  # annuncio di inizio partita
    POS = _parse_fen(state["fen"])
    LEGALI = _legali(POS)
    if not LEGALI:
        return None
    REGOLA = None
    mossa = decidi()
    if mossa not in LEGALI:
        mossa = _carta("rete di sicurezza", mossa_a_caso())  # solo mosse legali
    risposta = {"move": _uci(mossa)}
    if REGOLA is not None:
        risposta["regola"] = REGOLA
    return risposta
`

LAB_GAMES.chess = {
  name: 'Scacchi',

  compose(body) {
    return CHESS_RUNTIME_HEAD + labIndent(body) + CHESS_RUNTIME_TAIL
  },

  starterXml: `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="controls_if" x="30" y="30">
    <value name="IF0"><block type="chess_posso_catturare"></block></value>
    <statement name="DO0">
      <block type="chess_gioca">
        <value name="MOSSA"><block type="chess_cattura"></block></value>
      </block>
    </statement>
    <next>
      <block type="controls_if">
        <value name="IF0"><block type="chess_posso_scacco"></block></value>
        <statement name="DO0">
          <block type="chess_gioca">
            <value name="MOSSA"><block type="chess_scacco"></block></value>
          </block>
        </statement>
        <next>
          <block type="chess_gioca">
            <value name="MOSSA"><block type="chess_centro"></block></value>
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
        name: 'Scacchi',
        colour: '290',
        contents: [
          { kind: 'block', type: 'chess_gioca' },
          { kind: 'block', type: 'chess_posso_catturare' },
          { kind: 'block', type: 'chess_cattura' },
          { kind: 'block', type: 'chess_posso_scacco' },
          { kind: 'block', type: 'chess_scacco' },
          { kind: 'block', type: 'chess_centro' },
          { kind: 'block', type: 'chess_caso' },
        ],
      },
      LAB_LOGIC_CATEGORY,
    ],
  },

  setupBlocks() {
    Blockly.defineBlocksWithJsonArray([
      {
        type: 'chess_gioca',
        message0: 'gioca %1',
        args0: [{ type: 'input_value', name: 'MOSSA', check: 'Mossa' }],
        previousStatement: null,
        colour: 160,
        tooltip: 'Gioca quella mossa e chiude il turno. Solo mosse legali: al resto pensa il motore.',
      },
      { type: 'chess_posso_catturare', message0: 'posso catturare qualcosa?', output: 'Boolean', colour: 290, tooltip: 'Vero se una mossa legale mangia un pezzo avversario.' },
      { type: 'chess_cattura', message0: 'la cattura più ghiotta', output: 'Mossa', colour: 290, tooltip: 'La mossa che mangia il pezzo di maggior valore (donna 9, torre 5, alfiere/cavallo 3, pedone 1).' },
      { type: 'chess_posso_scacco', message0: 'posso dare scacco?', output: 'Boolean', colour: 290, tooltip: 'Vero se una mossa legale mette sotto scacco il re avversario.' },
      { type: 'chess_scacco', message0: 'una mossa che dà scacco', output: 'Mossa', colour: 290, tooltip: 'Una mossa che attacca il re avversario.' },
      { type: 'chess_centro', message0: 'una mossa verso il centro', output: 'Mossa', colour: 290, tooltip: 'La mossa che porta un pezzo più vicino al centro della scacchiera.' },
      { type: 'chess_caso', message0: 'una mossa legale a caso', output: 'Mossa', colour: 290, tooltip: 'Una mossa legale qualsiasi.' },
    ])

    const { gen, Order, define } = labBlockTools()
    define('chess_gioca', (block) => {
      const value = gen.valueToCode(block, 'MOSSA', Order.NONE) || 'mossa_a_caso()'
      return `return ${value}\n`
    })
    define('chess_posso_catturare', () => ['posso_catturare()', Order.FUNCTION_CALL])
    define('chess_cattura', () => ['cattura_migliore()', Order.FUNCTION_CALL])
    define('chess_posso_scacco', () => ['posso_dare_scacco()', Order.FUNCTION_CALL])
    define('chess_scacco', () => ['mossa_di_scacco()', Order.FUNCTION_CALL])
    define('chess_centro', () => ['mossa_verso_il_centro()', Order.FUNCTION_CALL])
    define('chess_caso', () => ['mossa_a_caso()', Order.FUNCTION_CALL])
  },

  cards: {
    cattura: {
      label: '🍖 Mangia il pezzo più grosso',
      hint: 'Se puoi catturare, prendi il pezzo di maggior valore.',
      code: 'if posso_catturare():\n  return cattura_migliore()',
    },
    scacco: {
      label: '⚡ Dai scacco',
      hint: 'Se puoi attaccare il re avversario, fallo.',
      code: 'if posso_dare_scacco():\n  return mossa_di_scacco()',
    },
    centro: {
      label: '🎯 Verso il centro',
      hint: 'Porta i pezzi verso il centro: da lì controllano di più.',
      code: 'return mossa_verso_il_centro()',
    },
    caso: {
      label: '🎲 Una mossa a caso',
      hint: 'Una mossa legale qualsiasi.',
      code: 'return mossa_a_caso()',
    },
  },
  starterDeck: ['cattura', 'scacco', 'centro'],
}
