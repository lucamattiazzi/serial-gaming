import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { python } from '@codemirror/lang-python'
import { oneDark } from '@codemirror/theme-one-dark'

// Le textarea restano la fonte usata da salvataggio, prove e upload sul Pico.
for (const source of document.querySelectorAll('#code, #generated-carte, #generated')) {
  const editable = source instanceof HTMLTextAreaElement
  const read = () => editable ? source.value : source.textContent
  const container = document.createElement('div')
  container.dataset.editorFor = source.id
  source.after(container)
  const view = new EditorView({
    doc: read(),
    parent: container,
    extensions: [
      basicSetup,
      python(),
      oneDark,
      EditorState.readOnly.of(!editable),
      EditorView.editable.of(editable),
      EditorView.contentAttributes.of({ 'aria-label': source.getAttribute('aria-label') || 'Codice Python generato' }),
      EditorView.theme({
        '&': { border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' },
        '.cm-scroller': { fontFamily: 'var(--font-mono)', fontSize: '14px', lineHeight: '1.6', overflow: 'auto', maxHeight: '520px' },
        '.cm-content': { minHeight: editable ? '300px' : '120px', padding: '14px 0' },
        '.cm-focused': { outline: '2px solid var(--accent)' },
      }),
      EditorView.updateListener.of(update => {
        if (!editable || !update.docChanged) return
        source.value = update.state.doc.toString()
        source.dispatchEvent(new Event('input'))
      }),
    ],
  })
  source.hidden = true
  source.addEventListener('codechange', () => {
    const value = read()
    if (value !== view.state.doc.toString()) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
    }
  })
}
