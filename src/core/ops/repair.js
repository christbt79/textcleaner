/**
 * Character-level repair: the operations that make a paste survive being
 * re-pasted somewhere else. These run first in the pipeline.
 */

import {
  BIDI_RE, COMBINING_RE, CONTROL_RE, CP1252_CONTROL_RE, CP1252_HIGH, DASHES,
  DASH_RE, ELLIPSIS, EM_DASH, EM_DASH_RE, EN_DASH, EXOTIC_SPACE_RE,
  INVISIBLE_RE, LDQUO, LIGATURES, LIGATURE_RE, LINE_SEPARATOR_RE, LSQUO,
  MOJIBAKE_HINT_RE, MOJIBAKE_PAIRS, OBJECT_REPLACEMENT_RE, PRIVATE_USE_RE,
  QUOTES, QUOTE_RE, RDQUO, RSQUO, SYMBOLS, SYMBOL_RE, TAG_CHARS_RE,
  TRANSLITERATE_RE, TRANSLITERATIONS, emojiRegex,
} from '../chars.js'

/** CRLF, lone CR and the Unicode line/paragraph separators all become LF. */
export function normaliseNewlines(text) {
  return text.replace(/\r\n?/g, '\n').replace(LINE_SEPARATOR_RE, '\n')
}

/**
 * Unicode normalisation to NFC.
 *
 * macOS and some PDF extractors hand back decomposed text, where an accented
 * letter is two code points. It looks identical and compares unequal.
 */
export function normaliseUnicode(text, { form = 'NFC' } = {}) {
  return text.normalize(form)
}

/** Strips zero-width, bidi, variation-selector and tag characters. */
export function removeInvisibles(text) {
  return text.replace(INVISIBLE_RE, '').replace(TAG_CHARS_RE, '')
}

/** Strips bidirectional overrides only, leaving other invisibles in place. */
export function removeBidi(text) {
  return text.replace(BIDI_RE, '')
}

/** Strips C0/C1 controls, object placeholders and private-use glyphs. */
export function removeControls(text, { privateUse = true } = {}) {
  let out = text.replace(CONTROL_RE, '').replace(OBJECT_REPLACEMENT_RE, '')
  if (privateUse) out = out.replace(PRIVATE_USE_RE, '')
  return out
}

/** Every non-standard space separator becomes a plain space. */
export function normaliseSpaces(text) {
  return text.replace(EXOTIC_SPACE_RE, ' ')
}

/** A PDF's single fi glyph becomes the two letters f and i. */
export function expandLigatures(text) {
  return text.replace(LIGATURE_RE, (c) => LIGATURES[c] ?? c)
}

/** Curly quotes and primes become straight ASCII quotes. */
export function straightenQuotes(text) {
  return text.replace(QUOTE_RE, (c) => QUOTES[c] ?? c)
}

/**
 * En and em dashes and the minus sign become an ASCII hyphen.
 *
 * An unspaced em dash gains spaces, because `word-word` reads as a compound
 * word while the original was a clause break.
 */
export function straightenDashes(text) {
  return text
    .replace(new RegExp('(\\S)' + EM_DASH_RE.source + '(\\S)', 'gu'), '$1 - $2')
    .replace(DASH_RE, (c) => DASHES[c] ?? c)
}

/** Ellipses, fractions, arrows and trademark signs become ASCII spellings. */
export function asciiSymbols(text) {
  return text.replace(SYMBOL_RE, (c) => SYMBOLS[c] ?? c)
}

/**
 * The opposite direction: straight quotes become typographic ones.
 *
 * For layout work you usually want the curly forms, and doing it here is more
 * predictable than trusting InDesign or Word autocorrect after the fact.
 */
export function curlQuotes(text) {
  return text
    // An apostrophe inside a word, and elisions such as 'til or '90s.
    .replace(/(\w)'(\w)/g, '$1' + RSQUO + '$2')
    .replace(/'(?=\d\d)/g, RSQUO)
    .replace(/'(?=(?:tis|twas|til|em|cause|n')\b)/gi, RSQUO)
    // An opening quote follows the start of a line, whitespace or a bracket.
    .replace(/(^|[\s([{-])"/gm, '$1' + LDQUO)
    .replace(/(^|[\s([{-])'/gm, '$1' + LSQUO)
    // Anything left trails content, so it closes.
    .replace(/"/g, RDQUO)
    .replace(/'/g, RSQUO)
}

/** Hyphens between digits become en dashes, and -- becomes an em dash. */
export function typographicDashes(text) {
  return text
    .replace(/(\d)\s*-\s*(\d)/g, '$1' + EN_DASH + '$2')
    .replace(/\s+--\s+/g, EM_DASH)
    .replace(/\.\.\./g, ELLIPSIS)
}

/**
 * Repairs UTF-8 that was decoded as Windows-1252 somewhere upstream: the
 * classic garbled sequence where an apostrophe arrives as three characters.
 *
 * A full byte-level re-decode is tried first, which fixes everything at once,
 * and a sequence table is the fallback when the text is mixed and a re-decode
 * would lose data.
 */
export function fixMojibake(text) {
  MOJIBAKE_HINT_RE.lastIndex = 0
  if (!MOJIBAKE_HINT_RE.test(text)) return text

  const allLatin1 = ![...text].some((c) => c.codePointAt(0) > 0xff)
  if (allLatin1) {
    try {
      const bytes = Uint8Array.from(text, (c) => c.charCodeAt(0))
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      return decoded
    } catch {
      // Not valid UTF-8 when read as bytes, so fall through to the table.
    }
  }

  let out = text
  for (const [broken, original] of MOJIBAKE_PAIRS) {
    if (out.includes(broken)) out = out.split(broken).join(original)
  }
  return out
}

/**
 * Repairs the other common breakage: cp1252 bytes that were never decoded, so
 * a right single quote arrives as a raw control character.
 */
export function fixCp1252Controls(text) {
  return text.replace(CP1252_CONTROL_RE, (c) => {
    const cp = CP1252_HIGH[c.charCodeAt(0) - 0x80]
    return cp >= 0x80 && cp <= 0x9f ? '' : String.fromCodePoint(cp)
  })
}

/** Accented Latin letters lose their diacritics. */
export function transliterate(text) {
  const mapped = text.replace(TRANSLITERATE_RE, (c) => TRANSLITERATIONS[c] ?? c)
  // NFD splits a letter from its combining marks, which are then dropped.
  return mapped.normalize('NFD').replace(COMBINING_RE, '').normalize('NFC')
}

/** Drops emoji and pictographs. */
export function removeEmoji(text) {
  return text.replace(emojiRegex(), '')
}

/** Drops anything outside printable ASCII, as a last-resort hammer. */
export function asciiOnly(text, { replacement = '' } = {}) {
  return text.replace(/[^\n\t -~]/g, replacement)
}
