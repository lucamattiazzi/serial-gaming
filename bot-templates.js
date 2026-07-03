// Template dei bot MicroPython, condivisi tra editor e pagine di gioco.
const BOT_TEMPLATES = {
  torneo: `import sys
import json
import random

# Bot multi-gioco per la modalita' torneo: ogni messaggio porta la busta
# {"game": ..., "match": ...} e si sceglie il gestore in base al gioco.
# Gli annunci di inizio partita (campi a null) mandano in errore i gestori:
# l'except li ignora. Sostituisci i gestori con le tue AI!


def play_tictactoe(state):
    free = [i for i, c in enumerate(state["board"]) if c == ""]
    return {"move": random.choice(free)}


def play_forza4(state):
    valid = [c for c in range(7) if state["board"][c] == ""]
    return {"move": random.choice(valid)}


def play_morra(state):
    return {"move": random.choice(["rock", "paper", "scissors"])}


def play_pong(state):
    dy = state["ball"]["y"] - state["you"]["y"]
    return {"move": -1 if dy < -1 else (1 if dy > 1 else 0)}


def play_tron(state):
    dirs = {"up": (0, -1), "down": (0, 1), "left": (-1, 0), "right": (1, 0)}
    me = state["you"]
    w = state["field"]["w"]
    h = state["field"]["h"]
    for d in [me["dir"]] + [x for x in dirs if x != me["dir"]]:
        dx, dy = dirs[d]
        x, y = me["x"] + dx, me["y"] + dy
        if 0 <= x < w and 0 <= y < h and state["grid"][y][x] == ".":
            return {"move": d}
    return {"move": me["dir"]}


def play_navale(state):
    if state["phase"] == "place":
        ships = []
        occupied = set()
        for length in state["fleet"]:
            while True:
                d = random.choice(["h", "v"])
                x = random.randrange(11 - length if d == "h" else 10)
                y = random.randrange(11 - length if d == "v" else 10)
                cells = [(x + i, y) if d == "h" else (x, y + i) for i in range(length)]
                if not any(c in occupied for c in cells):
                    occupied.update(cells)
                    ships.append({"x": x, "y": y, "dir": d, "len": length})
                    break
        return {"ships": ships}
    tried = {(s["x"], s["y"]) for s in state["shots"]}
    for s in state["shots"]:
        if s["result"] == "hit":
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                c = (s["x"] + dx, s["y"] + dy)
                if 0 <= c[0] < 10 and 0 <= c[1] < 10 and c not in tried:
                    return {"move": list(c)}
    while True:
        c = (random.randrange(10), random.randrange(10))
        if c not in tried:
            return {"move": list(c)}


def play_racetrack(state):
    track = state["track"]
    me = state["you"]

    def cell(x, y):
        if y < 0 or y >= len(track) or x < 0 or x >= len(track[0]):
            return "#"
        return track[y][x]

    def segment_ok(x0, y0, x1, y1):
        steps = max(abs(x1 - x0), abs(y1 - y0)) * 4 + 1
        for i in range(1, steps + 1):
            x = round(x0 + (x1 - x0) * i / steps)
            y = round(y0 + (y1 - y0) * i / steps)
            c = cell(x, y)
            if c == "#":
                return False
            if c == "F":
                return True
        return True

    def can_stop(x, y, vx, vy):
        while vx or vy:
            vx -= (vx > 0) - (vx < 0)
            vy -= (vy > 0) - (vy < 0)
            if vx == 0 and vy == 0:
                return True
            if not segment_ok(x, y, x + vx, y + vy):
                return False
            x += vx
            y += vy
        return True

    for ax in (-1, 0, 1):
        for ay in (-1, 0, 1):
            vx, vy = me["vx"] + ax, me["vy"] + ay
            if abs(vx) > 2 or abs(vy) > 2:
                continue
            nx, ny = me["x"] + vx, me["y"] + vy
            if segment_ok(me["x"], me["y"], nx, ny) and can_stop(nx, ny, vx, vy):
                return {"move": [ax, ay]}
    return {"move": [0, 0]}


HANDLERS = {
    "tictactoe": play_tictactoe,
    "forza4": play_forza4,
    "morra": play_morra,
    "pong": play_pong,
    "tron": play_tron,
    "navale": play_navale,
    "racetrack": play_racetrack,
}


while True:
    line = sys.stdin.readline()
    try:
        state = json.loads(line)
    except ValueError:
        continue
    if state.get("winner") is not None:
        continue  # partita finita
    handler = HANDLERS.get(state.get("game"))
    if handler is None:
        continue
    try:
        reply = handler(state)
    except Exception:
        continue  # annuncio di inizio partita o stato imprevisto
    print(json.dumps(reply))
`,
  tictactoe: `import sys
import json
import random

# Tris: ricevi {"board": [...], "lastMove": n, "winner": None}
# e rispondi {"move": indice} entro il limite di tempo.
# Il tuo simbolo e' sempre "O", l'avversario e' "X".


def next_move(board):
    free = [i for i, cell in enumerate(board) if cell == ""]
    return random.choice(free)


while True:
    line = sys.stdin.readline()
    try:
        state = json.loads(line)
    except ValueError:
        continue
    if state.get("winner") is not None:
        continue  # partita finita: qui puoi imparare dal risultato
    if state.get("board") is None:
        continue  # annuncio di inizio partita
    move = next_move(state["board"])
    print(json.dumps({"move": move}))
`,
  forza4: `import sys
import json
import random

# Forza 4: ricevi {"board": [...42 celle...], "lastMove": col, "winner": None}
# e rispondi {"move": colonna} (0-6) entro il limite di tempo.
# board: riga 0 in alto, indice = riga * 7 + colonna. Sei sempre "O".
# Colonna piena o fuori range = sconfitta immediata.

COLS = 7


def next_move(board):
    valid = [c for c in range(COLS) if board[c] == ""]
    return random.choice(valid)


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
    print(json.dumps({"move": next_move(state["board"])}))
`,
  morra: `import sys
import json
import random

# Morra cinese: 20 round a mosse simultanee, vince chi ne prende di piu'.
# Ricevi la storia completa a ogni round e rispondi {"move": ...} entro 1s
# con "rock", "paper" o "scissors".

HANDS = ["rock", "paper", "scissors"]
BEATEN_BY = {"rock": "paper", "paper": "scissors", "scissors": "rock"}


def next_move(history):
    if len(history) < 3:
        return random.choice(HANDS)
    opp_moves = [r["opp"] for r in history]
    most_frequent = max(HANDS, key=opp_moves.count)
    return BEATEN_BY[most_frequent]


while True:
    line = sys.stdin.readline()
    try:
        state = json.loads(line)
    except ValueError:
        continue
    if state.get("winner") is not None:
        continue  # partita finita
    if state.get("round") is None:
        continue  # annuncio di inizio partita
    print(json.dumps({"move": next_move(state["history"])}))
`,
  pong: `import sys
import json

# Pong: circa 10 volte al secondo ricevi lo stato del campo e rispondi
# con la direzione della tua racchetta:
#   {"move": -1} = su, {"move": 0} = ferma, {"move": 1} = giu'
# Tu sei SEMPRE la racchetta sinistra (la x cresce verso l'avversario).
# Se non rispondi nulla per 3 secondi, perdi. Primo a 5 punti.


def next_move(state):
    ball_y = state["ball"]["y"]
    my_y = state["you"]["y"]
    if ball_y < my_y - 1:
        return -1
    if ball_y > my_y + 1:
        return 1
    return 0


while True:
    line = sys.stdin.readline()
    try:
        state = json.loads(line)
    except ValueError:
        continue
    if state.get("winner") is not None:
        continue  # partita finita
    if state.get("ball") is None:
        continue  # annuncio di inizio partita
    print(json.dumps({"move": next_move(state)}))
`,
  navale: `import sys
import json
import random

# Battaglia navale: due fasi.
# 1) {"phase": "place", "fleet": [5,4,3,3,2], ...} -> rispondi con le navi
# 2) {"phase": "hunt", "shots": [storia dei tuoi colpi con esito], ...}
#    -> rispondi {"move": [x, y]} entro 2s. Cella gia' colpita = sconfitta.


def place_fleet(fleet):
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


def next_shot(shots):
    tried = {(s["x"], s["y"]) for s in shots}
    for s in shots:
        if s["result"] == "hit":
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                cell = (s["x"] + dx, s["y"] + dy)
                if 0 <= cell[0] < 10 and 0 <= cell[1] < 10 and cell not in tried:
                    return cell
    while True:
        cell = (random.randrange(10), random.randrange(10))
        if cell not in tried:
            return cell


while True:
    line = sys.stdin.readline()
    try:
        state = json.loads(line)
    except ValueError:
        continue
    if state.get("winner") is not None:
        continue  # partita finita
    if state.get("phase") == "place":
        print(json.dumps({"ships": place_fleet(state["fleet"])}))
    elif state.get("phase") == "hunt":
        x, y = next_shot(state["shots"])
        print(json.dumps({"move": [x, y]}))
`,
  racetrack: `import sys
import json

# Racetrack: a ogni turno v' = v + a, p' = p + v', con a = [ax, ay] e
# componenti in {-1, 0, 1}. Rispondi {"move": [ax, ay]} entro 2s.
# Il segmento del tuo spostamento non deve toccare i muri (#): sconfitta.
# Attraversa una cella F e hai vinto.


def cell(track, x, y):
    if y < 0 or y >= len(track) or x < 0 or x >= len(track[0]):
        return "#"
    return track[y][x]


def segment_ok(track, x0, y0, x1, y1):
    steps = max(abs(x1 - x0), abs(y1 - y0)) * 4 + 1
    for i in range(1, steps + 1):
        x = round(x0 + (x1 - x0) * i / steps)
        y = round(y0 + (y1 - y0) * i / steps)
        c = cell(track, x, y)
        if c == "#":
            return False
        if c == "F":
            return True
    return True


def can_stop(track, x, y, vx, vy):
    while vx or vy:
        vx -= (vx > 0) - (vx < 0)
        vy -= (vy > 0) - (vy < 0)
        if vx == 0 and vy == 0:
            return True
        if not segment_ok(track, x, y, x + vx, y + vy):
            return False
        x += vx
        y += vy
    return True


def next_move(state):
    track = state["track"]
    me = state["you"]
    best = None
    for ax in (-1, 0, 1):
        for ay in (-1, 0, 1):
            vx, vy = me["vx"] + ax, me["vy"] + ay
            if abs(vx) > 2 or abs(vy) > 2:
                continue
            nx, ny = me["x"] + vx, me["y"] + vy
            if not segment_ok(track, me["x"], me["y"], nx, ny):
                continue
            if not can_stop(track, nx, ny, vx, vy):
                continue
            # TODO: scegli la candidata migliore (es. BFS dal traguardo)
            if best is None:
                best = [ax, ay]
    return best or [0, 0]


while True:
    line = sys.stdin.readline()
    try:
        state = json.loads(line)
    except ValueError:
        continue
    if state.get("winner") is not None:
        continue  # gara finita
    if state.get("track") is None:
        continue  # annuncio di inizio gara
    print(json.dumps({"move": next_move(state)}))
`,
  tron: `import sys
import json

# Tron: a ogni tick (~150ms) ricevi lo stato e puoi rispondere con la
# direzione: {"move": "up" | "down" | "left" | "right"}.
# La direzione resta attiva finche' non la cambi. Parti SEMPRE da sinistra.
# Muri, scie (anche la tua) = morte. Zitto per 3 secondi = sconfitta.

DIRS = {"up": (0, -1), "down": (0, 1), "left": (-1, 0), "right": (1, 0)}


def is_free(state, x, y):
    w = state["field"]["w"]
    h = state["field"]["h"]
    if x < 0 or x >= w or y < 0 or y >= h:
        return False
    return state["grid"][y][x] == "."


def next_move(state):
    me = state["you"]
    order = [me["dir"]] + [d for d in DIRS if d != me["dir"]]
    for d in order:
        dx, dy = DIRS[d]
        if is_free(state, me["x"] + dx, me["y"] + dy):
            return d
    return me["dir"]


while True:
    line = sys.stdin.readline()
    try:
        state = json.loads(line)
    except ValueError:
        continue
    if state.get("winner") is not None:
        continue  # partita finita
    if state.get("grid") is None:
        continue  # annuncio di inizio partita
    print(json.dumps({"move": next_move(state)}))
`,
  arena: `import sys
import json

# Arena dei Mostri: prima il draft (3 mostri), poi ogni turno (simultaneo)
# rispondi con una di queste azioni entro 2 secondi:
#   ["attacca", 0]  attacco forte  (potente ma puo' fallire)
#   ["attacca", 1]  attacco preciso (meno potente, sempre a segno)
#   ["difendi"]     dimezzi il danno ricevuto e ne restituisci una parte
#   ["cambia", i]   mandi in campo il mostro i (vivo, non quello gia' in campo)
# Con "phase":"replace" (dopo un KO) e' ammesso solo ["cambia", i].
# ATTENZIONE: dell'avversario vedi solo il mostro in campo (opp["active"]) e
# quanti gliene restano (opp["alive"]); la sua PANCHINA e' segreta.
# Ogni turno ricevi anche "lastTurn": cosa e' successo nel turno precedente.

CICLO = ["fuoco", "erba", "elettro", "acqua"]


def moltiplicatore(tipo_mossa, tipo_difensore):
    if tipo_mossa == "normale" or tipo_difensore == "normale":
        return 1
    d = (CICLO.index(tipo_difensore) - CICLO.index(tipo_mossa)) % 4
    if d == 1:
        return 2
    if d in (3, 0):
        return 0.5
    return 1


def scegli(state):
    io = state["you"]["team"][state["you"]["active"]]
    if state["phase"] == "replace" or io["hp"] <= 0:
        vivi = [i for i, m in enumerate(state["you"]["team"])
                if m["hp"] > 0 and i != state["you"]["active"]]
        return ["cambia", vivi[0]]
    lui = state["opp"]["active"]
    # scegli l'attacco col miglior valore atteso (potenza * efficacia * precisione)
    ev = [m["power"] * moltiplicatore(m["type"], lui["type"]) * m["accuracy"]
          for m in io["moves"]]
    return ["attacca", ev.index(max(ev))]


while True:
    line = sys.stdin.readline()
    try:
        state = json.loads(line)
    except ValueError:
        continue
    if state.get("winner") is not None:
        continue  # partita finita
    if state.get("phase") == "draft":
        print(json.dumps({"team": [0, 4, 7]}))  # fuoco, erba, elettro
    elif state.get("phase") in ("battle", "replace"):
        print(json.dumps({"move": scegli(state)}))
`,
  chess: `import sys
import json

# Scacchi: ricevi {"fen": "...", "lastMove": "e2e4" | None, "winner": None}
# e rispondi {"move": "e7e5"} entro il limite di tempo.
# Il FEN dice tutto, anche di chi e' il turno (quindi il tuo colore).
# Le mosse sono in notazione from+to, con promozione es. "e7e8q".
# Una mossa illegale = sconfitta immediata: sta a te generarne di valide!


def next_move(fen, last_move):
    # TODO: la tua logica qui
    return "e2e4"


while True:
    line = sys.stdin.readline()
    try:
        state = json.loads(line)
    except ValueError:
        continue
    if state.get("winner") is not None:
        continue  # partita finita
    if state.get("fen") is None:
        continue  # annuncio di inizio partita
    move = next_move(state["fen"], state["lastMove"])
    print(json.dumps({"move": move}))
`,
}
