import random
from utils.serial import read, write
from utils.chess import Chess

def get_random_move(valid_moves):
    return random.choice(valid_moves)

if __name__ == "__main__":
    while True:
        try:
            state = read()
            if state.get("winner") is not None:
                continue

            game = Chess(fen=state.get("fen"))
            valid_moves = game.get_valid_moves()

            if not valid_moves:
                response = {"move": None}
            else:
                ai_move = get_random_move(valid_moves)
                response = {"move": ai_move.uci()}

            write(response)

        except (json.JSONDecodeError, IndexError, ValueError) as e:
            error_message = {"error": str(e)}
            write(error_message)
            time.sleep(1)
            continue
