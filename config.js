// ── Configurazione del sito ──────────────────────────────────
// Due flag per decidere cosa è disponibile. Cambia qui e ricarica.
const SITE_CONFIG = {
  // false = si gioca solo con un RP2040 vero. Durante le partite sparisce
  //         l'opzione "RP2040 emulato" (scrivere codice Python nel browser)
  //         e ogni riferimento all'emulatore marcato data-requires-emulator.
  //         Il "Prova contro la CPU" del Laboratorio resta attivo: serve a
  //         provare il bot prima di caricarlo sul Pico, non è una partita.
  allowEmulator: false,

  // Giochi da nascondere da home, torneo e Laboratorio. Le pagine restano
  // raggiungibili via URL diretto, ma non sono più linkate né selezionabili.
  hiddenGames: ['pong', 'tron', 'racetrack', 'arena', 'torneo'],
}

function applySiteConfig() {
  if (!SITE_CONFIG.allowEmulator) {
    for (const opt of document.querySelectorAll('select option[value="emu"]')) opt.remove()
    for (const el of document.querySelectorAll('.emu-row, [data-requires-emulator]')) {
      el.hidden = true
    }
  }

  for (const game of SITE_CONFIG.hiddenGames) {
    // elementi marcati (card, sezioni, voci di lista, checkbox del pool torneo)
    for (const el of document.querySelectorAll(`[data-game="${game}"]`)) {
      el.hidden = true
      for (const input of el.querySelectorAll('input')) input.checked = false
    }
    // opzioni dei menu a tendina (es. i template del Laboratorio)
    for (const opt of document.querySelectorAll(`select option[value="${game}"]`)) opt.remove()
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', applySiteConfig)
} else {
  applySiteConfig()
}
