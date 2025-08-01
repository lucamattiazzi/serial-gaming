import ujson as json

MEMORY = json.load(open("./memory.json", "r"))
PLAYED_MOVES = {}

def serialize_board(board: list) -> str:
    if isinstance(board, str):
        return board
    board = [x if len(x) else "-" for x in board]
    return "".join(board)

def deserialize_board(board_str: str) -> list:
    return [x if x != "-" else "" for x in board_str]

def remember_move(board: list, move_id: int):
    key = serialize_board(board)
    PLAYED_MOVES[key] = move_id

def store_played_moves(*args, won: bool):
    for serialized_board, move_id in PLAYED_MOVES.items():
        board = deserialize_board(serialized_board)
        memory = read_memory(board)
        if won:
            memory[move_id] += 1
        else:
            memory[move_id] -= 1
        _write_memory(serialized_board, memory)
    PLAYED_MOVES.clear()


def read_memory(board: list[int]) -> list[int]:
    key = serialize_board(board)
    return MEMORY.get(key, [0, 0, 0, 0, 0, 0, 0, 0, 0])


def _write_memory(key: str, value: list[int]) -> None:
    MEMORY[key] = value
    with open("./memory.json", "w") as f:
        f.write(json.dumps(MEMORY))
