/**
 * Rendering the output pane.
 *
 * Two modes: plain text, and "reveal hidden", which marks up the characters
 * you cannot otherwise see. Reveal is the answer to "this looks identical but
 * behaves differently", so an ordinary space and a non-breaking space have to
 * look different from each other, not merely visible.
 *
 * Whitespace keeps its real character inside the marker and the glyph is drawn
 * over it by CSS. Substituting the glyph instead would remove every break
 * opportunity from the line, and the pane would start breaking words in half.
 */

import { describeCodePoint, formatCodePoint, isInvisibleCodePoint } from '../core/chars.js'
import { el } from './dom.js'

/** Building the marked-up view is O(characters), so it is capped. */
const REVEAL_LIMIT = 40_000

const MIDDLE_DOT = String.fromCodePoint(0x00b7)
const PILCROW = String.fromCodePoint(0x00b6)
const TAB_ARROW = String.fromCodePoint(0x2192)
const DEGREE = String.fromCodePoint(0x00b0)

/** Writes the output into the pane, marked up or not. */
export function renderOutput(pane, emptyNote, text, { reveal }) {
  emptyNote.hidden = text.length > 0

  if (!reveal) {
    pane.textContent = text
    return
  }

  const capped = text.length > REVEAL_LIMIT
  const shown = capped ? text.slice(0, REVEAL_LIMIT) : text
  const fragment = document.createDocumentFragment()

  let plain = ''
  const flush = () => {
    if (!plain) return
    fragment.append(document.createTextNode(plain))
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
    fragment.append(el('span', { class: 'output-truncated' },
      'Showing the first ' + REVEAL_LIMIT.toLocaleString() +
      ' characters with markers. Turn off "Reveal hidden" to see all of it.'))
  }

  pane.replaceChildren(fragment)
}

/**
 * Returns a marked-up node for a character worth pointing out, or null when
 * the character should be printed as it is.
 */
function markFor(character) {
  const cp = character.codePointAt(0)

  // Plain printable ASCII is left alone: marking it up would only be noise.
  if (cp >= 0x21 && cp <= 0x7e) return null

  if (cp === 0x20) return whitespace(character, 'mark-space', MIDDLE_DOT, 'space')
  if (cp === 0x09) return whitespace(character, 'mark-tab', TAB_ARROW, 'tab')

  if (cp === 0x0a) {
    // The pilcrow is decoration; the real newline still has to be in the text.
    const wrapper = document.createDocumentFragment()
    wrapper.append(
      el('span', { class: 'mark mark-break', title: 'line break' }, PILCROW),
      document.createTextNode('\n'),
    )
    return wrapper
  }

  if (isSpaceLike(cp)) {
    return whitespace(
      character, 'mark-exotic-space', DEGREE,
      describeCodePoint(cp) + ' ' + formatCodePoint(cp) + ' - looks like a space, is not one',
    )
  }

  if (isInvisibleCodePoint(cp)) {
    // Nothing to keep: the character has no width, so the label stands in.
    return el('span', {
      class: 'mark mark-invisible',
      title: describeCodePoint(cp) + ' ' + formatCodePoint(cp),
    }, formatCodePoint(cp))
  }

  if (cp > 0x7e) {
    return el('span', {
      class: 'mark mark-other',
      title: describeCodePoint(cp) + ' ' + formatCodePoint(cp),
    }, character)
  }

  return null
}

/**
 * A whitespace marker: the real character stays inside, and the glyph is
 * drawn over it from CSS, so the line breaker still sees somewhere to break.
 */
function whitespace(character, className, glyph, title) {
  return el('span', {
    class: 'mark mark-ws ' + className,
    dataset: { glyph },
    title,
  }, character)
}

function isSpaceLike(cp) {
  return cp === 0x00a0 || cp === 0x1680 || cp === 0x202f || cp === 0x205f ||
    cp === 0x3000 || (cp >= 0x2000 && cp <= 0x200a)
}
