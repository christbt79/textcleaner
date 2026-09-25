/**
 * Line and paragraph operations.
 *
 * The interesting work here is `unwrapParagraphs`: deciding which line breaks
 * in a PDF or email paste are real paragraph breaks and which are only the
 * artefact of a fixed column width.
 */

import {
  CLOSE_QUOTE_CLASS_BODY, EN_DASH, EM_DASH, LIST_MARKER_CLASS_BODY,
  OPEN_QUOTE_CLASS_BODY, SOFT_HYPHEN, escapeRegExp,
} from '../chars.js'

/** A hyphen, or the soft hyphen a word processor uses for the same job. */
const HYPHEN = '[-' + SOFT_HYPHEN + ']'

const BULLET_PREFIX = new RegExp('^[ \\t]*[' + LIST_MARKER_CLASS_BODY + '][ \\t]+')
const NUMBER_PREFIX = /^[ \t]*(?:\(?\d{1,3}[.)\]]|\(?[a-zA-Z][.)\]]|[ivxlcIVXLC]{1,5}[.)])[ \t]+/
const SENTENCE_END = new RegExp('[.!?:;' + CLOSE_QUOTE_CLASS_BODY + ')\\]]\\s*$')
const STARTS_NEW_SENTENCE = new RegExp('^[\\p{Lu}\\d' + OPEN_QUOTE_CLASS_BODY + ']', 'u')
const ENDS_MID_WORD = new RegExp(HYPHEN + '$')
const LEADING_INDENT = /^[ \t]*/

function median(values) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** True when a line looks like a list item rather than running prose. */
export function isListItem(line) {
  return BULLET_PREFIX.test(line) || NUMBER_PREFIX.test(line)
}

/** True when a line looks like a heading: short, without terminal punctuation. */
function looksLikeHeading(line) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.length > 80) return false
  if (/[.,;:]$/.test(trimmed)) return false
  const letters = trimmed.replace(/[^\p{L}]/gu, '')
  if (letters.length > 3 && letters === letters.toUpperCase()) return true
  return /^#{1,6}\s/.test(trimmed)
}

/**
 * Joins two lines that a fixed column width split apart.
 *
 * A trailing hyphen between two lowercase fragments is a hyphenation artefact,
 * so the hyphen goes and the word is made whole again.
 */
function joinPair(current, next, dehyphenateJoin) {
  const left = current.replace(/\s+$/, '')
  const right = next.replace(/^\s+/, '')
  if (!left) return right
  if (!right) return left
  if (dehyphenateJoin &&
      new RegExp('\\p{Ll}' + HYPHEN + '$', 'u').test(left) &&
      /^\p{Ll}/u.test(right)) {
    return left.slice(0, -1) + right
  }
  return left + ' ' + right
}

function shouldKeepBreak(current, next, typicalWidth) {
  const left = current.trim()
  const right = next.trim()

  if (!left || !right) return true
  if (isListItem(right) || isListItem(left)) return true
  if (looksLikeHeading(left) || looksLikeHeading(right)) return true
  // A line ending in a hyphen is mid-word, so it is never a paragraph boundary.
  if (ENDS_MID_WORD.test(left)) return false

  const short = typicalWidth > 0 && left.length < typicalWidth * 0.65
  if (short && SENTENCE_END.test(left)) return true
  if (short && STARTS_NEW_SENTENCE.test(right)) return true
  if (short && typicalWidth - left.length > 25) return true

  return false
}

/**
 * Removes the soft line breaks inside a paragraph while keeping the breaks
 * between paragraphs. This is the one that fixes PDF and plain-text email.
 */
export function unwrapParagraphs(text, { dehyphenate: dehyphenateJoin = true } = {}) {
  return text
    .split(/\n{2,}/)
    .map((block) => unwrapBlock(block, dehyphenateJoin))
    .join('\n\n')
}

function unwrapBlock(block, dehyphenateJoin) {
  const lines = block.split('\n')
  if (lines.length < 2) return block

  const widths = lines.map((l) => l.trim().length).filter((n) => n > 0)
  // The widest lines describe the column, so the upper half is a better
  // estimate of the wrap width than the median of everything.
  const halfway = median(widths)
  const typicalWidth = median(widths.filter((n) => n >= halfway))

  const out = []
  let current = lines[0]
  for (let i = 1; i < lines.length; i += 1) {
    if (shouldKeepBreak(current, lines[i], typicalWidth)) {
      out.push(current)
      current = lines[i]
    } else {
      current = joinPair(current, lines[i], dehyphenateJoin)
    }
  }
  out.push(current)
  return out.join('\n')
}

/** Joins every line into one, regardless of structure. */
export function removeAllLineBreaks(text, { separator = ' ' } = {}) {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).join(separator)
}

/** Joins hyphenated words split across a line break, without unwrapping. */
export function dehyphenate(text) {
  return text.replace(
    new RegExp('(\\p{Ll})' + HYPHEN + '\\n[^\\S\\n]*(\\p{Ll})', 'gu'),
    '$1$2',
  )
}

/** Runs of newlines collapse to a fixed maximum number of blank lines. */
export function collapseBlankLines(text, { max = 1 } = {}) {
  const limit = Math.max(0, max)
  return text.replace(/\n{2,}/g, '\n'.repeat(limit + 1))
}

/** Removes every empty or whitespace-only line. */
export function removeEmptyLines(text) {
  return text.split('\n').filter((line) => line.trim() !== '').join('\n')
}

/** Inserts a blank line between every pair of lines. */
export function doubleSpaceLines(text) {
  return text.split('\n').join('\n\n')
}

/** Removes bullet and auto-number prefixes that Word and the web leave behind. */
export function removeListMarkers(text, { bullets = true, numbers = true } = {}) {
  return text
    .split('\n')
    .map((line) => {
      let out = line
      if (bullets) out = out.replace(BULLET_PREFIX, (m) => m.match(LEADING_INDENT)[0])
      if (numbers) out = out.replace(NUMBER_PREFIX, (m) => m.match(LEADING_INDENT)[0])
      return out
    })
    .join('\n')
}

/** Normalises any bullet to a single consistent marker. */
export function normaliseListMarkers(text, { marker = '- ' } = {}) {
  return text
    .split('\n')
    .map((line) => {
      if (!BULLET_PREFIX.test(line)) return line
      const indent = line.match(LEADING_INDENT)[0]
      return indent + marker + line.replace(BULLET_PREFIX, '')
    })
    .join('\n')
}

/** Strips the markers that quoted email replies accumulate. */
export function removeEmailQuoting(text, { dropQuotedText = false } = {}) {
  const lines = text.split('\n')
  if (dropQuotedText) {
    return lines.filter((line) => !/^[ \t]*>/.test(line)).join('\n')
  }
  return lines.map((line) => line.replace(/^[ \t]*(?:>[ \t]?)+/, '')).join('\n')
}

const DASH_OR_BRACKET = '[-' + EN_DASH + EM_DASH + '[(]?'
const PAGE_NUMBER_PATTERNS = [
  /^\s*\d{1,4}\s*$/,
  new RegExp('^\\s*' + DASH_OR_BRACKET + '\\s*\\d{1,4}\\s*[-' + EN_DASH + EM_DASH + '\\])]?\\s*$'),
  /^\s*page\s+\d{1,4}(\s+of\s+\d{1,4})?\s*$/i,
  /^\s*\d{1,4}\s*[|/]\s*\d{1,4}\s*$/,
  /^\s*[ivxlcdm]{1,7}\s*$/i,
]

/** Removes stray page numbers left over from a PDF copy. */
export function removePageNumbers(text) {
  return text
    .split('\n')
    .filter((line) => !PAGE_NUMBER_PATTERNS.some((re) => re.test(line)))
    .join('\n')
}

/**
 * Removes running heads and feet: short lines that repeat across a document.
 *
 * Anything appearing at least `minOccurrences` times, on a line short enough to
 * be furniture rather than prose, is dropped.
 */
export function removeRepeatedLines(text, { minOccurrences = 3, maxLength = 80 } = {}) {
  const lines = text.split('\n')
  const counts = new Map()
  for (const line of lines) {
    const key = line.trim()
    if (!key || key.length > maxLength) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return lines
    .filter((line) => (counts.get(line.trim()) ?? 0) < minOccurrences)
    .join('\n')
}

/** Removes duplicate lines, keeping the first occurrence of each. */
export function deduplicateLines(text, { caseSensitive = true, adjacentOnly = false } = {}) {
  const lines = text.split('\n')
  const key = (line) => (caseSensitive ? line.trim() : line.trim().toLowerCase())

  if (adjacentOnly) {
    return lines.filter((line, i) => i === 0 || key(line) !== key(lines[i - 1])).join('\n')
  }
  const seen = new Set()
  return lines
    .filter((line) => {
      const k = key(line)
      if (k === '') return true
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .join('\n')
}

/** Keeps only the lines that appear more than once. */
export function keepDuplicateLines(text) {
  const lines = text.split('\n')
  const counts = new Map()
  for (const line of lines) counts.set(line.trim(), (counts.get(line.trim()) ?? 0) + 1)
  const seen = new Set()
  return lines
    .filter((line) => {
      const k = line.trim()
      if (!k || counts.get(k) < 2 || seen.has(k)) return false
      seen.add(k)
      return true
    })
    .join('\n')
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Sorts lines alphabetically, naturally, by length, or reverses them. */
export function sortLines(text, { order = 'asc', ignoreCase = true } = {}) {
  const lines = text.split('\n')
  const plain = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
  const compare = {
    asc: (a, b) => (ignoreCase ? collator.compare(a, b) : plain(a, b)),
    desc: (a, b) => -(ignoreCase ? collator.compare(a, b) : plain(a, b)),
    length: (a, b) => a.trim().length - b.trim().length || collator.compare(a, b),
    lengthDesc: (a, b) => b.trim().length - a.trim().length || collator.compare(a, b),
  }
  if (order === 'reverse') return lines.reverse().join('\n')
  if (order === 'shuffle') {
    for (let i = lines.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      const swap = lines[i]
      lines[i] = lines[j]
      lines[j] = swap
    }
    return lines.join('\n')
  }
  return lines.sort(compare[order] ?? compare.asc).join('\n')
}

/** Hard-wraps text at a column width, breaking on word boundaries. */
export function wrapLines(text, { width = 80, breakLongWords = false } = {}) {
  const limit = Math.max(10, width)
  return text
    .split('\n')
    .map((line) => wrapSingleLine(line, limit, breakLongWords))
    .join('\n')
}

function wrapSingleLine(line, limit, breakLongWords) {
  if (line.length <= limit) return line
  const indent = line.match(LEADING_INDENT)[0]
  const room = Math.max(1, limit - indent.length)
  const out = []
  let current = indent

  for (let word of line.trim().split(/\s+/)) {
    while (breakLongWords && word.length > room) {
      if (current.trim()) {
        out.push(current)
        current = indent
      }
      out.push(indent + word.slice(0, room))
      word = word.slice(room)
    }
    if (current.trim() === '') current = indent + word
    else if (current.length + 1 + word.length <= limit) current += ' ' + word
    else {
      out.push(current)
      current = indent + word
    }
  }
  if (current.trim()) out.push(current)
  return out.join('\n')
}

/** Adds `1. ` style numbering to each line. */
export function numberLines(text, { start = 1, separator = '. ', pad = false } = {}) {
  const lines = text.split('\n')
  const width = String(lines.length + start - 1).length
  return lines
    .map((line, i) => {
      const n = String(i + start)
      return (pad ? n.padStart(width, ' ') : n) + separator + line
    })
    .join('\n')
}

/** Removes `1.`, `1)`, `1 -` style numbering from the start of each line. */
export function removeLineNumbers(text) {
  return text.replace(
    new RegExp('^[ \\t]*\\d{1,6}[.):' + EN_DASH + '-]?[ \\t]+', 'gm'),
    '',
  )
}

/** Adds text before and/or after every line. */
export function affixLines(text, { prefix = '', suffix = '', skipEmpty = true } = {}) {
  return text
    .split('\n')
    .map((line) => (skipEmpty && line.trim() === '' ? line : prefix + line + suffix))
    .join('\n')
}

/** Expands the two escapes people expect to be able to type in a delimiter. */
function literalDelimiter(value) {
  return value.replace(/\\n/g, '\n').replace(/\\t/g, '\t')
}

/** Joins lines with a delimiter, optionally quoting each one. */
export function joinLines(text, { separator = ', ', quote = '', skipEmpty = true } = {}) {
  const all = text.split('\n').map((l) => l.trim())
  const kept = skipEmpty ? all.filter(Boolean) : all
  const wrapped = quote ? kept.map((l) => quote + l + quote) : kept
  return wrapped.join(literalDelimiter(separator))
}

/** Splits a delimited string back into one item per line. */
export function splitToLines(text, { separator = ',', trim = true } = {}) {
  const delim = literalDelimiter(separator)
  if (!delim) return text
  const parts = text.split(new RegExp(escapeRegExp(delim)))
  return (trim ? parts.map((p) => p.trim()) : parts).join('\n')
}

/** Keeps or drops the lines matching a pattern. */
export function filterLines(text, {
  pattern = '', mode = 'keep', regex = false, ignoreCase = true,
} = {}) {
  if (!pattern) return text
  let re
  try {
    re = new RegExp(regex ? pattern : escapeRegExp(pattern), ignoreCase ? 'i' : '')
  } catch {
    return text
  }
  return text
    .split('\n')
    .filter((line) => (mode === 'keep' ? re.test(line) : !re.test(line)))
    .join('\n')
}
