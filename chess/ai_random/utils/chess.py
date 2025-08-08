import chess

class Chess:
    def __init__(self, fen=None):
        if fen:
            self.board = chess.Board(fen)
        else:
            self.board = chess.Board()

    def get_valid_moves(self):
        return list(self.board.legal_moves)

    def make_move(self, move):
        self.board.push(move)

    def is_game_over(self):
        return self.board.is_game_over()

    def get_winner(self):
        if self.board.is_checkmate():
            return 'b' if self.board.turn == chess.WHITE else 'w'
        return None

    def fen(self):
        return self.board.fen()
