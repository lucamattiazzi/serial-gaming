import ujson as json
from utils.serial import on_message, parse_payload, send_message
from utils.tictactoe import compute_next_move


def on_message_callback(message: str):
    board = parse_payload(message)
    move = compute_next_move(board)
    response = {"move": move}
    send_message(json.dumps(response))


def run_game():
    on_message(on_message_callback)


if __name__ == "__main__":
    run_game()
