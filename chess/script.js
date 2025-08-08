const statusDisplay = document.getElementById('status-display');
const gameBoard = document.getElementById('game-board');
const connectButton = document.getElementById('connect-button');
const restartButton = document.getElementById('restart-button');

const picoSerial = new PicoSerial();
const chess = new Chess();
let selectedPiece = null;

connectButton.addEventListener('click', async () => {
    await picoSerial.connect();
    connectButton.disabled = true;
    statusDisplay.textContent = "AI Connected! It's your turn.";
    picoSerial.onmessage(listenForAIData);
});

async function listenForAIData(text) {
    try {
        const jsonResponse = JSON.parse(text);
        if (jsonResponse.move == null) return;
        handleAIMove(jsonResponse.move);
    } catch (error) {
        picoSerial.logMessage(text, "debug");
    }
}

async function sendStateToAI(gameState) {
    const jsonString = JSON.stringify(gameState) + '\n';
    await picoSerial.sendMessage(jsonString);
    statusDisplay.textContent = "AI is thinking...";
}

function renderBoard() {
    gameBoard.innerHTML = '';
    const board = chess.board();
    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cell.classList.add((i + j) % 2 === 0 ? 'white' : 'black');
            cell.dataset.row = i;
            cell.dataset.col = j;

            const piece = board[i][j];
            if (piece) {
                const pieceElement = document.createElement('span');
                pieceElement.classList.add('piece');
                pieceElement.textContent = getPieceUnicode(piece);
                cell.appendChild(pieceElement);
            }
            cell.addEventListener('click', () => handleCellClick(i, j));
            gameBoard.appendChild(cell);
        }
    }
}

function getPieceUnicode(piece) {
    const unicodePieces = {
        'p': '♙', 'r': '♖', 'n': '♘', 'b': '♗', 'q': '♕', 'k': '♔',
        'P': '♟', 'R': '♜', 'N': '♞', 'B': '♝', 'Q': '♛', 'K': '♚'
    };
    return unicodePieces[piece.type === 'p' ? (piece.color === 'w' ? 'p' : 'P') : (piece.color === 'w' ? piece.type : piece.type.toUpperCase())];
}

function handleCellClick(row, col) {
    const square = String.fromCharCode(97 + col) + (8 - row);
    if (selectedPiece) {
        const move = chess.move({
            from: selectedPiece,
            to: square,
            promotion: 'q' // NOTE: always promote to a queen for simplicity
        });

        if (move === null) {
            selectedPiece = null;
            renderBoard();
            return;
        }

        renderBoard();
        if (!chess.game_over()) {
            const gameState = {
                fen: chess.fen(),
                lastMove: move,
                winner: null
            };
            sendStateToAI(gameState);
        } else {
            endGame();
        }
        selectedPiece = null;
    } else {
        const piece = chess.get(square);
        if (piece && piece.color === chess.turn()) {
            selectedPiece = square;
            const selectedCell = document.querySelector(`[data-row='${row}'][data-col='${col}']`);
            selectedCell.classList.add('selected');
        }
    }
}

function handleAIMove(move) {
    const result = chess.move(move, { sloppy: true });
    if (result === null) {
        statusDisplay.textContent = "AI made an invalid move! You win!";
        endGame();
        return;
    }
    renderBoard();
    if (chess.game_over()) {
        endGame();
    } else {
        statusDisplay.textContent = "Your turn";
    }
}

function endGame() {
    let message = "Game over.";
    if (chess.in_checkmate()) {
        message = `Checkmate! ${chess.turn() === 'w' ? 'Black' : 'White'} wins.`;
    } else if (chess.in_draw()) {
        message = "Draw.";
    }
    statusDisplay.textContent = message;
    const gameState = {
        fen: null,
        lastMove: null,
        winner: chess.turn() === 'w' ? 'b' : 'w'
    };
    sendStateToAI(gameState);
}

restartButton.addEventListener('click', () => {
    chess.reset();
    renderBoard();
    statusDisplay.textContent = "Game restarted. Your turn.";
});

renderBoard();
