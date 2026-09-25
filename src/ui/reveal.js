/**
 * The "Show original" view: the paste as it arrived, with every character
 * that is not plain text highlighted.
 *
 * This is where the invisible problems become visible. A non-breaking space
 * is outlined, a zero-width character shows its code, and anything else
 * outside plain ASCII is underlined, each with a tooltip naming it. Ordinary
 * spaces and line breaks are left alone so the text still reads normally.
 *
 * Whitespace markers keep their real character inside and draw the glyph on
 * top from CSS, so lines still wrap where they would have.
 */

import { describeCodePoint, formatCodePoint, isInvisibleCodePoint } from '../core/chars.js'
import { normaliseNewlines } from '../core/ops/repair.js'
import { el } from './dom.js'

/** Marking up is one node per unusual character, so very long text is capped. */
const LIMIT = 60_000

const TAB_ARROW = String.fromCodePoint(0x2192)
const DEGREE = String.fromCodePoint(0x00b0)

export function renderMarked(pane, raw) {
  const text = normaliseNewlines(raw)
  const capped = text.length > LIMIT
  const shown = capped ? text.slice(0, LIMIT) : text
  const fragment = document.createDocumentFragment()

  let plain = ''
  const flush = () => {
    if (plain) fragment.append(document.createTextNode(plain))
    plain = ''
  }

  for (const character of shown) {
    const mark = markFor(character)
    if (!mark) {
      plain += character
      continue
    }
    flush()
    fragment.append(mark)
  }
  flush()

  if (capped) {
    fragment.append(el('span', { class: 'truncated' },
      'Showing the first ' + LIMIT.toLocaleString() + ' characters.'))
  }

  pane.replaceChildren(fragment)
}

function markFor(character) {
  const cp = character.codePointAt(0)
  if (cp === 0x0a || (cp >= 0x20 && cp <= 0x7e)) return null

  const name = describeCodePoint(cp) + ' (' + formatCodePoint(cp) + ')'

  if (cp === 0x09) {
    return el('span', { class: 'mark mark-ws mark-tab', dataset: { glyph: TAB_ARROW }, title: 'tab' }, character)
  }
  if (isSpaceLike(cp)) {
    return el('span', {
      class: 'mark mark-ws mark-space',
      dataset: { glyph: DEGREE },
      title: name + ': looks like a space, but is not one',
    }, character)
  }
  if (isInvisibleCodePoint(cp)) {
    return el('span', { class: 'mark mark-invisible', title: name }, formatCodePoint(cp))
  }
  return el('span', { class: 'mark mark-other', title: name }, character)
}

function isSpaceLike(cp) {
  return cp === 0x00a0 || cp === 0x1680 || cp === 0x202f || cp === 0x205f ||
    cp === 0x3000 || (cp >= 0x2000 && cp <= 0x200a)
}
