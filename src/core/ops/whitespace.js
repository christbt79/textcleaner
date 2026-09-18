/**
 * Whitespace and spacing operations.
 */

import { CLOSE_QUOTE_CLASS_BODY } from '../chars.js'

/** A full stop and whatever quote or bracket closes after it. */
const SENTENCE_TAIL = '([.!?][' + CLOSE_QUOTE_CLASS_BODY + ')]?)'
const UPPERCASE_START = '(?=\\p{Lu})'

/** Runs of spaces and tabs collapse to a single space. Newlines are kept. */
export function collapseSpaces(text) {
  return text.replace(/[^\S\n]{2,}/g, ' ')
}

/** Tabs become a fixed number of spaces. */
export function tabsToSpaces(text, { width = 4 } = {}) {
  return text.replace(/\t/g, ' '.repeat(Math.max(0, width)))
}

/** Runs of leading spaces become tabs. */
export function spacesToTabs(text, { width = 4 } = {}) {
  const size = Math.max(1, width)
  return text.replace(/^ +/gm, (run) =>
    '\t'.repeat(Math.floor(run.length / size)) + ' '.repeat(run.length % size))
}

/** Removes whitespace at the end of every line. */
export function trimLineEnds(text) {
  return text.replace(/[^\S\n]+$/gm, '')
}

/** Removes whitespace at the start of every line. */
export function trimLineStarts(text) {
  return text.replace(/^[^\S\n]+/gm, '')
}

/** Removes leading and trailing whitespace on every line. */
export function trimLines(text) {
  return trimLineStarts(trimLineEnds(text))
}

/** Removes leading and trailing whitespace across the whole document. */
export function trimDocument(text) {
  return text.trim()
}

/** Deletes the stray space that sits before punctuation. */
export function fixSpaceBeforePunctuation(text) {
  return text
    .replace(/[^\S\n]+([,.;:!?%\]})])/g, '$1')
    .replace(/([([{])[^\S\n]+/g, '$1')
}

/**
 * Adds the space that a broken PDF extraction dropped.
 *
 * The lookahead deliberately excludes digits, so decimals and version numbers
 * survive, and excludes quotes and brackets, which legitimately hug punctuation.
 */
export function fixSpaceAfterPunctuation(text) {
  const afterClause = new RegExp(
    '([,;:!?])(?=[^\\s\\d"\'' + CLOSE_QUOTE_CLASS_BODY + ')\\]}])',
    'gu',
  )
  return text
    .replace(afterClause, '$1 ')
    .replace(new RegExp('([.!?])' + UPPERCASE_START, 'gu'), '$1 ')
}

/** Collapses the old two-spaces-after-a-full-stop typing habit. */
export function singleSpaceAfterSentence(text) {
  return text.replace(new RegExp(SENTENCE_TAIL + '[^\\S\\n]{2,}', 'gu'), '$1 ')
}

/** Forces two spaces after a sentence, for people who prefer it. */
export function doubleSpaceAfterSentence(text) {
  return text.replace(
    new RegExp(SENTENCE_TAIL + '[^\\S\\n]+' + UPPERCASE_START, 'gu'),
    '$1  ',
  )
}

/** Adds a space between a number and the unit that follows it. */
export function spaceBeforeUnits(text) {
  return text.replace(/(\d)(?=(?:kg|km|cm|mm|mb|gb|tb|kb|hz|ml|oz|lb|ft|in|px|pt|%)\b)/gi, '$1 ')
}
