/**
 * Scans text for the problems that survive a copy/paste, and names the
 * operations that fix each one.
 *
 * This is what turns "my text is behaving strangely" into a list of specific,
 * countable causes, each with a one-click fix.
 */

import {
  BIDI_RE, BULLET_RE, CONTROL_RE, EXOTIC_SPACE_RE, INVISIBLE_RE, LIGATURE_RE,
  MOJIBAKE_HINT_RE, OBJECT_REPLACEMENT_RE, PRIVATE_USE_RE, REPLACEMENT,
  SMART_DASH_RE, SMART_QUOTE_RE, SOFT_HYPHEN, TAG_CHARS_RE, describeCodePoint,
  emojiRegex, EMOJI_GLUE_PATTERN, formatCodePoint, isInvisibleCodePoint,
} from './chars.js'
import { looksLikeHtml } from './ops/markup.js'
import { isListItem } from './ops/lines.js'

/** Counts matches with a private copy of the regex, so `lastIndex` is safe. */
function count(text, re) {
  const flags = re.flags.includes('g') ? re.flags : re.flags + 'g'
  const matches = text.match(new RegExp(re.source, flags))
  return matches ? matches.length : 0
}

/**
 * Counts invisible characters that are junk, leaving out the joiners and tag
 * letters that hold an emoji together: those are part of the picture.
 */
function countOutsideEmoji(text, re) {
  return count(text.replace(new RegExp(EMOJI_GLUE_PATTERN, 'gu'), ''), re)
}

const HYPHEN_BREAK_RE = new RegExp(
  '\\p{Ll}[-' + SOFT_HYPHEN + ']\\n[^\\S\\n]*\\p{Ll}',
  'gu',
)
const LEADING_BULLET_RE = new RegExp('^[ \\t]*' + BULLET_RE.source, 'u')

/** Detects hard-wrapped prose: lines of a similar width, broken mid-sentence. */
function detectHardWrapping(text) {
  const body = text.split('\n').filter((line) => line.trim().length > 0)
  if (body.length < 3) return 0

  const widths = body.map((line) => line.trim().length)
  const longest = Math.max(...widths)
  // Beyond this, the text is not wrapped to a column at all.
  if (longest > 200) return 0

  let suspicious = 0
  for (let i = 0; i < body.length - 1; i += 1) {
    const line = body[i].trim()
    const next = body[i + 1].trim()
    if (!next || isListItem(next) || isListItem(line)) continue
    // A line that stops without punctuation, where the next carries on in
    // lowercase, was almost certainly broken by a column width.
    if (!/[.!?:;]$/.test(line) && /^[\p{Ll}\d]/u.test(next) && line.length > longest * 0.6) {
      suspicious += 1
    }
  }
  return suspicious
}

function countRepeatedLines(text) {
  const counts = new Map()
  for (const line of text.split('\n')) {
    const key = line.trim()
    if (!key || key.length > 80) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  let total = 0
  for (const n of counts.values()) if (n >= 3) total += n
  return total
}

function countDuplicateLines(text) {
  const seen = new Set()
  let duplicates = 0
  for (const line of text.split('\n')) {
    const key = line.trim()
    if (!key) continue
    if (seen.has(key)) duplicates += 1
    else seen.add(key)
  }
  return duplicates
}

function countPageNumbers(text) {
  return text.split('\n').filter((line) =>
    /^\s*\d{1,4}\s*$/.test(line) ||
    /^\s*page\s+\d{1,4}(\s+of\s+\d{1,4})?\s*$/i.test(line)).length
}

const CHECKS = [
  {
    id: 'mojibake',
    severity: 'high',
    label: 'Garbled characters',
    detail: 'Text that was encoded twice somewhere upstream. The worst kind, because it looks like real characters and survives everything else.',
    ops: ['fixMojibake'],
    count: (t) => count(t, MOJIBAKE_HINT_RE),
  },
  {
    id: 'replacementChar',
    severity: 'high',
    label: 'Replacement characters',
    detail: 'The original character is already lost. Worth going back to the source before using this text.',
    ops: ['removeControls'],
    count: (t) => t.split(REPLACEMENT).length - 1,
  },
  {
    id: 'tagChars',
    severity: 'high',
    label: 'Invisible tag characters',
    detail: 'Invisible code points sometimes used to watermark or fingerprint text.',
    ops: ['removeInvisibles'],
    count: (t) => countOutsideEmoji(t, TAG_CHARS_RE),
  },
  {
    id: 'bidi',
    severity: 'high',
    label: 'Bidirectional overrides',
    detail: 'Invisible characters that reorder how text displays, so it can read differently from how it is stored.',
    ops: ['removeInvisibles'],
    count: (t) => count(t, BIDI_RE),
  },
  {
    id: 'html',
    severity: 'high',
    label: 'HTML markup',
    detail: 'Tags came across with the text.',
    ops: ['htmlToText'],
    count: (t) => (looksLikeHtml(t) ? count(t, /<[a-z!/][^>]*>/gi) : 0),
  },
  {
    id: 'hardWrap',
    severity: 'high',
    label: 'Hard-wrapped paragraphs',
    detail: 'Line breaks in the middle of sentences, from a PDF column or a plain-text email.',
    ops: ['unwrapParagraphs'],
    count: detectHardWrapping,
  },
  {
    id: 'hyphenBreaks',
    severity: 'high',
    label: 'Words split by a hyphen',
    detail: 'A word broken across a line break by PDF hyphenation.',
    ops: ['unwrapParagraphs', 'dehyphenate'],
    count: (t) => count(t, HYPHEN_BREAK_RE),
  },
  {
    id: 'invisibles',
    severity: 'medium',
    label: 'Invisible characters',
    detail: 'Zero-width spaces, soft hyphens and byte order marks. They break search, sorting and word counts.',
    ops: ['removeInvisibles'],
    count: (t) => countOutsideEmoji(t, INVISIBLE_RE),
  },
  {
    id: 'controls',
    severity: 'medium',
    label: 'Control characters',
    detail: 'Non-printing characters that some applications refuse to import.',
    ops: ['removeControls'],
    count: (t) => count(t, CONTROL_RE),
  },
  {
    id: 'objects',
    severity: 'medium',
    label: 'Image and object placeholders',
    detail: 'Left where an image, chart or embedded object used to be.',
    ops: ['removeControls'],
    count: (t) => count(t, OBJECT_REPLACEMENT_RE),
  },
  {
    id: 'privateUse',
    severity: 'medium',
    label: 'Private-use glyphs',
    detail: 'Font-specific characters, usually Word or InDesign bullets. They render as empty boxes anywhere else.',
    ops: ['removeControls'],
    count: (t) => count(t, PRIVATE_USE_RE),
  },
  {
    id: 'nbsp',
    severity: 'medium',
    label: 'Non-breaking and exotic spaces',
    detail: 'They look like spaces but do not wrap, do not match a space in search, and confuse layout software.',
    ops: ['normaliseSpaces'],
    count: (t) => count(t, EXOTIC_SPACE_RE),
  },
  {
    id: 'ligatures',
    severity: 'medium',
    label: 'Typographic ligatures',
    detail: 'PDF extraction glyphs. Searching for a word will not match it when two of its letters are one character.',
    ops: ['expandLigatures'],
    count: (t) => count(t, LIGATURE_RE),
  },
  {
    id: 'entities',
    severity: 'medium',
    label: 'HTML entities',
    detail: 'Escaped characters that should be real ones.',
    ops: ['decodeEntities'],
    count: (t) => count(t, /&(?:#x?[0-9a-f]+|[a-z][a-z0-9]{1,31});/gi),
  },
  {
    id: 'emailQuoting',
    severity: 'medium',
    label: 'Email reply markers',
    detail: 'Lines prefixed with the marker a mail client adds to a quoted reply.',
    ops: ['removeEmailQuoting'],
    count: (t) => t.split('\n').filter((l) => /^[ \t]*>/.test(l)).length,
  },
  {
    id: 'pageNumbers',
    severity: 'medium',
    label: 'Stray page numbers',
    detail: 'Lines containing nothing but a page number.',
    ops: ['removePageNumbers'],
    count: countPageNumbers,
  },
  {
    id: 'runningHeads',
    severity: 'medium',
    label: 'Repeating running heads',
    detail: 'Short lines that appear again and again, usually a header or footer.',
    ops: ['removeRepeatedLines'],
    count: countRepeatedLines,
  },
  {
    id: 'smartQuotes',
    severity: 'low',
    label: 'Curly quotes and apostrophes',
    detail: 'Correct in a document, a problem in code, CSVs, URLs and search boxes.',
    ops: ['straightenQuotes'],
    count: (t) => count(t, SMART_QUOTE_RE),
  },
  {
    id: 'dashes',
    severity: 'low',
    label: 'En and em dashes',
    detail: 'Often arrive unspaced, which reads as a compound word once flattened.',
    ops: ['straightenDashes'],
    count: (t) => count(t, SMART_DASH_RE),
  },
  {
    id: 'bullets',
    severity: 'low',
    label: 'Bullet characters',
    detail: 'A real list arrived as text beginning with a bullet glyph.',
    ops: ['normaliseListMarkers'],
    count: (t) => t.split('\n').filter((l) => LEADING_BULLET_RE.test(l)).length,
  },
  {
    id: 'duplicateLines',
    severity: 'low',
    label: 'Duplicate lines',
    ops: ['deduplicateLines'],
    count: countDuplicateLines,
  },
  {
    id: 'multiSpace',
    severity: 'low',
    label: 'Repeated spaces',
    detail: 'Runs of two or more spaces in the middle of a line.',
    ops: ['collapseSpaces'],
    count: (t) => count(t, /\S[^\S\n]{2,}\S/g),
  },
  {
    id: 'trailingSpace',
    severity: 'low',
    label: 'Trailing whitespace',
    ops: ['trimLines'],
    count: (t) => count(t, /[^\S\n]+$/gm),
  },
  {
    id: 'tabs',
    severity: 'low',
    label: 'Tabs',
    detail: 'Fine in code, unpredictable in a document or a form field.',
    ops: ['tabsToSpaces'],
    count: (t) => count(t, /\t/g),
  },
  {
    id: 'blankRuns',
    severity: 'low',
    label: 'Runs of blank lines',
    ops: ['collapseBlankLines'],
    count: (t) => count(t, /\n{3,}/g),
  },
  {
    id: 'spaceBeforePunctuation',
    severity: 'low',
    label: 'Space before punctuation',
    ops: ['fixSpaceBeforePunctuation'],
    count: (t) => count(t, /\s+[,.;:!?]/g),
  },
  {
    id: 'trackingLinks',
    severity: 'low',
    label: 'URLs with tracking parameters',
    ops: ['cleanUrls'],
    count: (t) => count(t, /[?&](?:utm_\w+|fbclid|gclid|mc_[ce]id|igshid|msclkid)=/gi),
  },
  {
    id: 'emoji',
    severity: 'low',
    label: 'Emoji and pictographs',
    ops: ['removeEmoji'],
    count: (t) => count(t, emojiRegex()),
  },
]

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 }

/** Runs every check and returns the problems that were found, worst first. */
export function scanText(text) {
  if (!text) return []
  return CHECKS
    .map((check) => ({ ...check, count: check.count(text) }))
    .filter((check) => check.count > 0)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.count - a.count)
}

/**
 * Every character outside plain ASCII, with a count and a description.
 *
 * This is the escape hatch for whatever the named checks do not cover: it can
 * always answer "what exactly is in this text".
 */
export function inspectCharacters(text, { limit = 200 } = {}) {
  const counts = new Map()
  for (const c of text) {
    const cp = c.codePointAt(0)
    if (cp === 0x0a || cp === 0x09 || (cp >= 0x20 && cp <= 0x7e)) continue
    counts.set(cp, (counts.get(cp) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([cp, n]) => ({
      codePoint: cp,
      count: n,
      label: formatCodePoint(cp),
      name: describeCodePoint(cp),
      char: String.fromCodePoint(cp),
      printable: !isInvisibleCodePoint(cp),
    }))
}
