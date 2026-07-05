// Il main.py installato dal Laboratorio a ogni upload: legge i messaggi
// dei giochi e li smista al modulo giusto (bot_<gioco>.py), che deve
// definire rispondi(state). Risponde inoltre all'hello di PicoSerial
// presentando la scheda (nome, id univoco, bot installati).
// Ogni upload lo riscrive: aggiornarlo qui basta.
const ROUTER_MAIN_PY = `import sys
import json
import os

# --- Serial Gaming: router v2 (installato dal Laboratorio) ---
# Non modificare questo file: viene riscritto a ogni upload.
# Ogni messaggio porta {"game": ...}: il router importa bot_<gioco>.py
# alla prima occorrenza (lazy) e chiama la sua rispondi(state), che
# ritorna il dict della risposta oppure None per stare zitta.
# {"hello": true} chiede invece l'identita' della scheda.

try:
    import machine
    UID = ''.join('%02x' % b for b in machine.unique_id())
except ImportError:
    UID = ''  # fuori da MicroPython (test) non c'e' un id hardware

_bots = {}


def _bot(game):
    if game not in _bots:
        try:
            _bots[game] = __import__("bot_" + game)
        except ImportError:
            _bots[game] = None  # nessun bot caricato per questo gioco
    return _bots[game]


def _identity():
    try:
        f = open('bot_config.json')
        cfg = json.load(f)
        f.close()
    except Exception:
        cfg = {}
    bots = sorted(n[4:-3] for n in os.listdir()
                  if n.startswith('bot_') and n.endswith('.py'))
    return {"hello": True, "name": cfg.get("name", ""),
            "id": UID, "bots": bots, "router": 2}


while True:
    line = sys.stdin.readline()
    try:
        state = json.loads(line)
    except ValueError:
        continue
    if not isinstance(state, dict):
        continue
    if state.get("hello") is not None:
        print(json.dumps(_identity()))
        continue
    game = state.get("game")
    if not isinstance(game, str) or not game:
        continue
    if not all(c.isalpha() or c.isdigit() for c in game):
        continue  # solo nomi semplici: diventano nomi di modulo
    bot = _bot(game)
    if bot is None:
        continue
    try:
        reply = bot.rispondi(state)
    except Exception:
        continue  # un errore del bot non deve fermare il router
    if reply is not None:
        print(json.dumps(reply))
`
