/**
 * Small DOM helpers. No framework: the page is one text box and a few rows of
 * controls, which is well inside what the platform does comfortably.
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
