/**
 * The issue bar and the character inspector.
 *
 * Between them they answer the question the tool exists for: what is actually
 * wrong with the text I just pasted, and what will fix it.
 */

import { el, replaceChildren } from './dom.js'
import { formatCount } from '../core/stats.js'

/** Renders the issue chips. Each chip toggles the operations that fix it. */
export function renderIssues(elements, issues, state, { onFix }) {
  const { bar, chips, title, fixAll } = elements

  if (!issues.length) {
    bar.hidden = true
    replaceChildren(chips)
    return
  }

  bar.hidden = false

  const unfixed = issues.filter((issue) => !isHandled(issue, state))
  title.textContent = unfixed.length
    ? 'Found in this text'
    : 'Everything found is being fixed'
  fixAll.hidden = unfixed.length === 0

  replaceChildren(chips, issues.map((issue) => {
    const handled = isHandled(issue, state)
    const actionable = issue.ops.length > 0

    return el('button', {
      type: 'button',
      class: 'issue-chip',
      dataset: {
        severity: issue.severity,
        fixed: String(handled),
        actionable: String(actionable),
      },
      title: describe(issue, handled, actionable),
      'aria-pressed': actionable ? String(handled) : null,
      disabled: !actionable,
      onclick: actionable ? () => onFix(issue, !handled) : null,
    },
      el('span', { class: 'dot' }),
      el('span', { class: 'name' }, issue.label),
      el('span', { class: 'count' }, formatCount(issue.count)))
  }))
}

function isHandled(issue, state) {
  return issue.ops.length > 0 && issue.ops.some((opId) => state.enabled.has(opId))
}

function describe(issue, handled, actionable) {
  const parts = []
  if (issue.detail) parts.push(issue.detail)
  if (!actionable) parts.push('Always handled.')
  else parts.push(handled ? 'Being fixed. Click to stop fixing it.' : 'Click to fix.')
  return parts.join(' ')
}

/** Renders the list of every unusual character found in the text. */
export function renderInspector(elements, characters) {
  const { panel, body, count } = elements

  if (!characters.length) {
    panel.hidden = true
    return
  }

  panel.hidden = false
  const total = characters.reduce((sum, entry) => sum + entry.count, 0)
  count.textContent =
    formatCount(total) + ' in ' + characters.length +
    (characters.length === 1 ? ' kind' : ' kinds')

  replaceChildren(body, characters.map((entry) =>
    el('div', {
      class: 'char-card',
      dataset: { invisible: String(!entry.printable) },
      title: entry.name + ' (' + entry.label + '), ' + entry.count + ' occurrences',
    },
      el('span', { class: 'char-glyph' }, entry.printable ? entry.char : entry.label.slice(2)),
      el('span', { class: 'char-meta' },
        el('span', { class: 'char-name' }, entry.name),
        el('span', { class: 'char-code' }, entry.label)),
      el('span', { class: 'char-count' }, formatCount(entry.count)))))
}
