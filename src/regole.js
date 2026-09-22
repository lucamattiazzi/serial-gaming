// Mostra quale carta/regola del Laboratorio ha deciso la mossa di un bot:
// un piccolo badge sotto la card del giocatore. I bot composti con le carte
// aggiungono "regola" alla risposta; gli altri bot non la mandano e il
// badge semplicemente non compare.
function showBotRule(id, rule) {
  const card = document.getElementById(`card-${id}`)
  if (card) {
    let el = card.querySelector('.bot-rule')
    if (!el) {
      el = document.createElement('div')
      el.className = 'bot-rule'
      card.appendChild(el)
    }
    el.textContent = `🃏 ${rule}`
    el.classList.remove('flash')
    void el.offsetWidth // riavvia l'animazione anche se la regola è la stessa
    el.classList.add('flash')
  }
  // il Laboratorio, che pilota la pagina in un iframe, ascolta da qui
  if (typeof globalThis.__onBotRule === 'function') globalThis.__onBotRule(id, rule)
}

function clearBotRules() {
  for (const el of document.querySelectorAll('.bot-rule')) el.remove()
}

// Le descrizioni seguono le strategie effettive degli avversari integrati.
function computerAiDescription(type, game) {
  const introduction = 'Il computer ha una sua intelligenza artificiale (AI): un programma che decide le mosse.'
  let strategy = ''
  if (type === 'cpu-random') {
    strategy = game === 'arena'
      ? 'Qui combina scelte a caso e regole semplici, come curarsi quando ha poca vita.'
      : 'A questo livello sceglie a caso tra le mosse possibili.'
  } else if (type === 'cpu-perfect' || type === 'cpu-minimax') {
    strategy = 'Esplora le mosse successive per cercare la scelta migliore.'
  } else if (type === 'cpu-counter') {
    strategy = 'Dopo i primi turni, cerca di battere la mossa che usi più spesso.'
  } else if (type === 'cpu-hunter') {
    strategy = 'Cerca le navi e mira vicino ai colpi a segno.'
  } else if (type === 'cpu-smart' && game === 'othello') {
    strategy = 'Preferisce le caselle vantaggiose, soprattutto gli angoli.'
  } else if (type === 'cpu-smart' && game === 'arena') {
    strategy = 'Valuta i tipi dei mostri e la vita rimasta per scegliere attacchi, cure e cambi.'
  }
  return strategy ? `${introduction} ${strategy}` : introduction
}

function explainComputerPlayers() {
  for (const select of document.querySelectorAll('#setup select[id^="type-"]')) {
    const explanation = document.createElement('p')
    explanation.className = 'computer-ai'
    explanation.id = `ai-${select.id}`
    explanation.setAttribute('role', 'status')
    select.after(explanation)
    const update = () => {
      const isComputer = select.value.startsWith('cpu-')
      explanation.hidden = !isComputer
      explanation.textContent = isComputer
        ? computerAiDescription(select.value, typeof GAME_ID === 'string' ? GAME_ID : '')
        : ''
    }
    select.addEventListener('change', update)
    update()
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', explainComputerPlayers)
else explainComputerPlayers()
