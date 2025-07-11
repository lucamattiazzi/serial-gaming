AI_PLAYER = "O"
HUMAN_PLAYER = "X"
MAX_DEPTH = 9
EARLY_EXIT_DEPTH = 5  ## rp2040 is fucking slow, also no need to play perfectly

WIN_TRIPLETS = [
    (0, 1, 2),
    (3, 4, 5),
    (6, 7, 8),
    (0, 3, 6),
    (1, 4, 7),
    (2, 5, 8),
    (0, 4, 8),
    (2, 4, 6),
]


def check_winner(board: list) -> str | None:
    empty_cells = [idx for idx, cell in enumerate(board) if cell == ""]
    if len(empty_cells) > 4:
        return None
    for a, b, c in WIN_TRIPLETS:
        if board[a] == board[b] == board[c] and board[a] != "":
            return board[a]
    if len(empty_cells) == 0:
        return "TIE"
    return None


def minimax(board, depth, current_player):
    ## checks exit conditions
    winner = check_winner(board)
    if winner == AI_PLAYER:
        return MAX_DEPTH - depth
    if winner == HUMAN_PLAYER:
        return depth - MAX_DEPTH
    if winner == "TIE":
        return 0
    ## increments depth for next recursion
    depth += 1

    if depth >= EARLY_EXIT_DEPTH:
        return 0

    ## determines if it's AI's turn or human's turn
    is_ai_turn = current_player == AI_PLAYER
    next_player = HUMAN_PLAYER if is_ai_turn else AI_PLAYER
    start_best_score = -float("inf") if is_ai_turn else float("inf")
    compare_fn = max if is_ai_turn else min

    ## recursive part
    for i in range(len(board)):
        if board[i] != "":
            continue
        board[i] = current_player
        score = minimax(board, depth, next_player)
        board[i] = ""
        start_best_score = compare_fn(score, start_best_score)

    return start_best_score


def compute_next_move(board):
    best_score = -float("inf")
    move = -1
    for i in range(len(board)):
        if board[i] != "":
            continue
        board[i] = AI_PLAYER
        score = minimax(board, 0, HUMAN_PLAYER)
        board[i] = ""
        if score > best_score:
            best_score = score
            move = i
    return move
