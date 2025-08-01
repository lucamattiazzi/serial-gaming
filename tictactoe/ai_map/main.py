import ujson as json
from utils.memory import remember_move
from utils.serial import on_message, parse_payload, send_message
from utils.tictactoe import compute_next_move, handle_winner


def handle_next_move(board: list) -> None:
    move = compute_next_move(board)
    remember_move(board, move)
    send_message(json.dumps({"move": move}))


def on_message_callback(message: str):
    winner, board = parse_payload(message)
    if winner is not None:
        return handle_winner(winner)
    if board is not None:
        return handle_next_move(board)

def run_game():
    on_message(on_message_callback)


if __name__ == "__main__":
    try:
        run_game()
    except Exception as e:
        print("Error occurred:", e)
