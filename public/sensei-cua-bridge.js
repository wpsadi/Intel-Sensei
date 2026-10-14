/*
 * Sensei computer-use bridge. A page that includes this script lets the Sensei agent in SBrowse click, type, press keys and
 * scroll in it. The agent sends coordinates in the page's own pixels as postMessage events; each one is answered, so the
 * agent knows whether it landed. Without this script a page from another site ignores them.
 */
;(function () {
  var last = { x: 0, y: 0 }
  function target() {
    return document.elementFromPoint(last.x, last.y) || document.body
  }
  function mouse(type, extra) {
    var init = Object.assign({ bubbles: true, cancelable: true, view: window, clientX: last.x, clientY: last.y }, extra)
    target().dispatchEvent(new MouseEvent(type, init))
  }
  function click(button, count) {
    var el = target()
    if (el.focus) el.focus()
    mouse('mousedown', { button: button, detail: count })
    mouse('mouseup', { button: button, detail: count })
    if (button === 2) mouse('contextmenu', { button: 2 })
    else {
      mouse('click', { button: 0, detail: count })
      if (count === 2) mouse('dblclick', { button: 0, detail: 2 })
    }
  }
  function keyInit(spec) {
    var parts = String(spec).split('+')
    var key = parts.pop()
    var mods = parts.map(function (p) { return p.toLowerCase() })
    return {
      key: key,
      bubbles: true,
      cancelable: true,
      ctrlKey: mods.indexOf('ctrl') >= 0 || mods.indexOf('control') >= 0,
      shiftKey: mods.indexOf('shift') >= 0,
      altKey: mods.indexOf('alt') >= 0,
      metaKey: mods.indexOf('meta') >= 0 || mods.indexOf('cmd') >= 0,
    }
  }
  function typeText(text) {
    var el = document.activeElement
    if (!el) return
    for (var i = 0; i < text.length; i++) {
      var ch = text[i]
      el.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }))
      if (el.isContentEditable) document.execCommand('insertText', false, ch)
      else if ('value' in el) {
        var proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
        var set = Object.getOwnPropertyDescriptor(proto, 'value').set
        set.call(el, el.value + ch)
        el.dispatchEvent(new InputEvent('input', { data: ch, inputType: 'insertText', bubbles: true }))
      }
      el.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true }))
    }
  }
  function act(m) {
    if (typeof m.x === 'number' && typeof m.y === 'number') last = { x: m.x, y: m.y }
    switch (m.action) {
      case 'move': mouse('mousemove', {}); return true
      case 'click': click(0, 1); return true
      case 'double_click': click(0, 2); return true
      case 'right_click': click(2, 1); return true
      case 'type': typeText(String(m.text || '')); return true
      case 'key': {
        var init = keyInit(m.key)
        var el = document.activeElement || document.body
        el.dispatchEvent(new KeyboardEvent('keydown', init))
        if (init.key === 'Enter' && el.form && el.form.requestSubmit) el.form.requestSubmit()
        el.dispatchEvent(new KeyboardEvent('keyup', init))
        return true
      }
      case 'scroll': window.scrollBy({ left: m.dx || 0, top: m.dy || 0 }); return true
      default: return false
    }
  }
  window.addEventListener('message', function (event) {
    var m = event.data
    if (!m || m.source !== 'sensei-cua' || event.source !== window.parent) return
    var ok = false
    try { ok = act(m) } catch (e) { ok = false }
    if (m.id) window.parent.postMessage({ source: 'sensei-cua-ack', id: m.id, ok: ok }, '*')
  })
})()
