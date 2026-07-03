// Template dei bot MicroPython, condivisi tra editor e pagine di gioco.
const BOT_TEMPLATES = {
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
    move = next_move(state["board"])
    print(json.dumps({"move": move}))
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
    move = next_move(state["fen"], state["lastMove"])
    print(json.dumps({"move": move}))
`,
}
