/**
 * Case conversion.
 *
 * Title case is the one worth care: a naive capitalise-every-word mangles
 * acronyms, brand capitalisation and the small words that stay lowercase.
 */

import { COMBINING_RE, OPEN_QUOTE_CLASS_BODY, RSQUO } from '../chars.js'

/** Words that stay lowercase in a title unless first, last or after a colon. */
const SMALL_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'en', 'for', 'if', 'in', 'is',
  'nor', 'of', 'on', 'or', 'per', 'so', 'the', 'to', 'v', 'v.', 'via', 'vs',
  'vs.', 'from', 'into', 'over', 'with', 'yet',
])

/** A word, including the apostrophes that belong inside one. */
const WORD_RE = new RegExp("\\p{L}[\\p{L}\\p{M}'" + RSQUO + ']*', 'gu')
const WORD_WITH_DOTS_RE = new RegExp("\\p{L}[\\p{L}\\p{M}'" + RSQUO + '.]*', 'gu')
const FIRST_WORD_RE = new RegExp("\\p{L}[\\p{L}\\p{M}'" + RSQUO + ']*', 'u')
const SENTENCE_START_RE = new RegExp(
  '(^|[.!?]\\s+|\\n\\s*|[' + OPEN_QUOTE_CLASS_BODY + '(]\\s*)(\\p{Ll})',
  'gu',
)

/** True for iPhone, McDonald or NASA: capitalisation the writer intended. */
function hasDeliberateCaps(word) {
  const letters = word.replace(/[^\p{L}]/gu, '')
  if (letters.length < 2) return false
  if (letters === letters.toUpperCase()) return true
  return /\p{Ll}\p{Lu}/u.test(word)
}

export function toUpperCase(text) {
  return text.toUpperCase()
}

export function toLowerCase(text) {
  return text.toLowerCase()
}

/** Capitalises the first letter of each sentence and lowercases the rest. */
export function toSentenceCase(text, { preserveAcronyms = true } = {}) {
  const lowered = text.replace(WORD_WITH_DOTS_RE, (word) =>
    preserveAcronyms && hasDeliberateCaps(word) ? word : word.toLowerCase())

  return lowered.replace(SENTENCE_START_RE, (match, lead, letter) => lead + letter.toUpperCase())
}

/** Capitalises the first letter of every word. */
export function toCapitalCase(text, { preserveAcronyms = true } = {}) {
  return text.replace(WORD_RE, (word) => {
    if (preserveAcronyms && hasDeliberateCaps(word)) return word
    return word[0].toUpperCase() + word.slice(1).toLowerCase()
  })
}

/** Editorial title case, with small words left lowercase in the middle. */
export function toTitleCase(text, { preserveAcronyms = true } = {}) {
  return text
    .split('\n')
    .map((line) => titleCaseLine(line, preserveAcronyms))
    .join('\n')
}

function titleCaseLine(line, preserveAcronyms) {
  const tokens = line.split(/(\s+)/)
  const wordIndexes = tokens.map((t, i) => (/\S/.test(t) ? i : -1)).filter((i) => i >= 0)
  const first = wordIndexes[0]
  const last = wordIndexes[wordIndexes.length - 1]
  let forceNext = true

  return tokens
    .map((token, i) => {
      if (!/\S/.test(token)) return token
      const bare = token.replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, '')
      const isEdge = i === first || i === last
      const capitalise = forceNext || isEdge || !SMALL_WORDS.has(bare.toLowerCase())
      // A colon or a dash starts a new phrase, so the next word is capitalised.
      forceNext = /[:.;?!-]$/.test(token)

      return token.replace(FIRST_WORD_RE, (word) => {
        if (preserveAcronyms && hasDeliberateCaps(word)) return word
        const lower = word.toLowerCase()
        return capitalise ? lower[0].toUpperCase() + lower.slice(1) : lower
      })
    })
    .join('')
}

/** Inverts the case of every letter. */
export function toToggleCase(text) {
  return text.replace(/\p{L}/gu, (c) =>
    c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase())
}

/** Alternates case letter by letter. */
export function toAlternatingCase(text) {
  let upper = false
  return text.replace(/\p{L}/gu, (c) => {
    upper = !upper
    return upper ? c.toUpperCase() : c.toLowerCase()
  })
}

/** Splits any naming convention into its component words. */
function words(text) {
  return text
    .replace(/([\p{Ll}\d])(\p{Lu})/gu, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

export function toCamelCase(text) {
  return words(text)
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join('')
}

export function toPascalCase(text) {
  return words(text).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('')
}

export function toSnakeCase(text) {
  return words(text).map((w) => w.toLowerCase()).join('_')
}

export function toKebabCase(text) {
  return words(text).map((w) => w.toLowerCase()).join('-')
}

export function toConstantCase(text) {
  return words(text).map((w) => w.toUpperCase()).join('_')
}

export function toDotCase(text) {
  return words(text).map((w) => w.toLowerCase()).join('.')
}

/** A URL-safe slug. */
export function toSlug(text) {
  return text
    .normalize('NFD')
    .replace(COMBINING_RE, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}
