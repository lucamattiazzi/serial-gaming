import math
from random import choice, random

from utils.memory import read_memory, store_played_moves

AI_PLAYER = "O"
HUMAN_PLAYER = "X"


def softmax(board: list):
    exp_x = [math.exp(val) for val in board]
    sum_exp = sum(exp_x)
    return [val / sum_exp for val in exp_x]


def random_move(board: list):
    empty_cells_idx = [idx for idx, cell in enumerate(board) if cell == ""]
    if not empty_cells_idx:
        return None
    return choice(empty_cells_idx)


def compute_next_move(current_board: list):
    memory_moves = read_memory(current_board)
    valid_moves = [
        {"points": memory_moves[idx], "original_index": idx}
        for idx, cell in enumerate(current_board)
        if cell == ""
    ]

    probabilities = softmax([move["points"] for move in valid_moves])
    cumulative = 0.0
    r = random()
    for i, prob in enumerate(probabilities):
        cumulative += prob
        if r <= cumulative:
            return valid_moves[i]["original_index"]
    # Fallback to random move if no valid move is found
    return random_move(current_board)


def handle_winner(winner: str):
    if winner == AI_PLAYER:
        store_played_moves(won=True)
    elif winner == HUMAN_PLAYER:
        store_played_moves(won=False)
