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
