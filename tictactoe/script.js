const statusDisplay = document.getElementById('status-display')
const gameBoard = document.getElementById('game-board')
const connectButton = document.getElementById('connect-button')
const restartButton = document.getElementById('restart-button')

const board = Array(9).fill('')
let isGameActive = false
const humanPlayer = 'X'
const aiPlayer = 'O'
let currentPlayer = humanPlayer
const picoSerial = new PicoSerial()

connectButton.addEventListener('click', async () => {
  await picoSerial.connect()
  connectButton.disabled = true
  statusDisplay.textContent = "AI Connected! It's your turn."
  isGameActive = true
  picoSerial.onmessage(listenForAIData)
})

async function listenForAIData(text) {
  const jsonResponse = JSON.parse(text)
  if (jsonResponse.move !== undefined) {
    handleAIMove(jsonResponse.move)
  }
}


async function sendStateToAI(lastMoveIndex) {
  const gameState = {
    board: board,
    lastMove: lastMoveIndex
  }

  const jsonString = JSON.stringify(gameState) + '\n'
  await picoSerial.sendMessage(jsonString)
  statusDisplay.textContent = "AI is thinking..."
}

// --- Game Logic Functions ---

async function initializeGame() {
  board.forEach(cell => { cell = '' })
  currentPlayer = humanPlayer
  statusDisplay.textContent = isGameActive ? "Your turn (X)" : "Connect to AI to play."
  renderBoard()
}

function renderBoard() {
  gameBoard.innerHTML = ''
  board.forEach((cellValue, index) => {
    const cellElement = document.createElement('div')
    cellElement.classList.add('cell')
    cellElement.dataset.index = index
    cellElement.textContent = cellValue
    cellElement.addEventListener('click', handleCellClick)
    gameBoard.appendChild(cellElement)
  })
}

function handleCellClick(event) {
  const clickedCellIndex = parseInt(event.target.dataset.index)

  if (currentPlayer !== humanPlayer || !isGameActive || board[clickedCellIndex] !== '') {
    return
  }

  makeMove(clickedCellIndex, humanPlayer)

  if (isGameActive) {
    currentPlayer = aiPlayer
    sendStateToAI(clickedCellIndex)
  }
}

function handleAIMove(moveIndex) {
  if (moveIndex < 0 || moveIndex > 8 || board[moveIndex] !== '') {
    statusDisplay.textContent = "AI made an invalid move! You win!"
    isGameActive = false
    return
  }

  makeMove(moveIndex, aiPlayer)

  if (isGameActive) {
    currentPlayer = humanPlayer
    statusDisplay.textContent = "Your turn (X)"
  }
}


function makeMove(index, player) {
  board[index] = player
  renderBoard()

  const winner = checkWinner()
  if (winner) {
    isGameActive = false
    if (winner === 'TIE') {
      statusDisplay.textContent = "It's a tie!"
    } else {
      statusDisplay.textContent = `${winner} wins!`
    }
  }
}


function checkWinner() {
  const winningConditions = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ]

  for (let i = 0; i < winningConditions.length; i++) {
    const [a, b, c] = winningConditions[i]
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a]
    }
  }

  if (!board.includes('')) {
    return 'TIE'
  }

  return null
}

restartButton.addEventListener('click', initializeGame)
initializeGame()