// ── Navigazione a schede della home (#giochi / #spiegazione) ──
// La scheda centrale (Laboratorio) è un link a pagina separata.
const VIEWS = ['giochi', 'spiegazione']

function showView() {
  const hash = location.hash.replace('#', '')
  const view = VIEWS.includes(hash) ? hash : 'giochi'
  for (const name of VIEWS) {
    document.getElementById(`view-${name}`).hidden = name !== view
    document.querySelector(`nav a[data-view="${name}"]`).classList.toggle('active', name === view)
  }
}

window.addEventListener('hashchange', showView)
showView()
