from random import choice, random
from time import sleep


def compute_next_move(board: list):
    ## simulates thinking time
    sleep(0.5 + random() * 0.5)
    empty_cells_idx = [idx for idx, cell in enumerate(board) if cell == ""]
    if not empty_cells_idx:
        return None
    return choice(empty_cells_idx)
