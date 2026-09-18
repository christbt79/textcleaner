/**
 * Small DOM helpers. No framework: the page is a handful of lists that are
 * re-rendered when state changes, which is well inside what the platform does
 * comfortably and keeps the whole app dependency-free.
 */

export const $ = (id) => document.getElementById(id)

/** `el('button', { class: 'x', onclick }, 'label')` */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag)

  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue
    if (key === 'class') node.className = value
    else if (key === 'dataset') Object.assign(node.dataset, value)
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2), value)
    } else if (key === 'checked' || key === 'disabled' || key === 'hidden') {
      node[key] = Boolean(value)
    } else if (key === 'value') {
      node.value = value
    } else {
      node.setAttribute(key, value === true ? '' : String(value))
    }
  }

  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue
    node.append(child instanceof Node ? child : document.createTextNode(String(child)))
  }
  return node
}

/** Replaces a container's children in one go. */
export function replaceChildren(container, ...children) {
  container.replaceChildren(...children.flat().filter(Boolean))
}

/** An inline SVG icon from a path definition. */
export function icon(path, size = 14) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  node.setAttribute('d', path)
  svg.append(node)
  return svg
}

export const ICONS = {
  chevron: 'M9 6l6 6-6 6',
  close: 'M6 6l12 12M18 6L6 18',
}

/** Runs `fn` at most once per animation frame. */
export function throttleToFrame(fn) {
  let queued = false
  let lastArgs = []
  return (...args) => {
    lastArgs = args
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      fn(...lastArgs)
    })
  }
}

/** Runs `fn` once the caller has stopped calling it for `wait` milliseconds. */
export function debounce(fn, wait) {
  let timer = 0
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), wait)
  }
}

/** True when the keyboard event carries the platform's command modifier. */
export function isCommandKey(event) {
  return event.metaKey || event.ctrlKey
}

/** True when focus is somewhere the user is typing. */
export function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}
