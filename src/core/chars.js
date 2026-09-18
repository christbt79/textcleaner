/**
 * Every special character this tool knows about, defined by code point.
 *
 * Nothing in this repository contains a literal non-ASCII character: the
 * tables below are numeric and the strings and regular expressions are built
 * at load time. A tool whose job is to remove invisible characters should not
 * have any hiding in its own source, and it means the code survives being
 * copied, diffed and pasted as badly as anything a user will throw at it.
 *
 * Everything under `core/` is pure and DOM-free, so it runs under `node --test`.
 */

const ch = (cp) => String.fromCodePoint(cp)

/** Escapes a string for safe interpolation into a RegExp. */
export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Escapes the four characters that are special inside a character class. */
function escapeInClass(value) {
  return value.replace(/[\\\]^-]/g, '\\$&')
}

/**
 * Builds a character class from code points and `[from, to]` ranges.
 *
 * Literal characters are used rather than escape sequences, so a range is
 * written as its two endpoints and the `u` flag keeps astral planes working.
 */
export function charClass(spec, flags = 'gu') {
  const body = spec
    .map((entry) =>
      Array.isArray(entry)
        ? escapeInClass(ch(entry[0])) + '-' + escapeInClass(ch(entry[1]))
        : escapeInClass(ch(entry)))
    .join('')
  return new RegExp('[' + body + ']', flags)
}

function classFromKeys(map, flags = 'gu') {
  return charClass(Object.keys(map).map((key) => key.codePointAt(0)), flags)
}

function buildMap(entries) {
  const out = {}
  for (const [cp, value] of entries) out[ch(cp)] = value
  return out
}

// --- Named characters -----------------------------------------------------

export const NBSP = ch(0x00a0)
export const NNBSP = ch(0x202f)
export const THIN_SPACE = ch(0x2009)
export const SOFT_HYPHEN = ch(0x00ad)
export const ZWSP = ch(0x200b)
export const BOM = ch(0xfeff)
export const LSQUO = ch(0x2018)
export const RSQUO = ch(0x2019)
export const LDQUO = ch(0x201c)
export const RDQUO = ch(0x201d)
export const EN_DASH = ch(0x2013)
export const EM_DASH = ch(0x2014)
export const ELLIPSIS = ch(0x2026)
export const BULLET = ch(0x2022)
export const REPLACEMENT = ch(0xfffd)
export const OBJECT_REPLACEMENT = ch(0xfffc)

// --- Encoding -------------------------------------------------------------

/** Windows-1252 values for 0x80-0x9F, which differ from Latin-1. */
export const CP1252_HIGH = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021,
  0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x008d, 0x017d, 0x008f,
  0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
]

// --- Character classes ----------------------------------------------------

/**
 * Invisible characters that carry no meaning in plain text but survive a
 * copy/paste, then break search, diffing, line wrapping and layout import.
 *
 * Excluded on purpose: U+FE0F (emoji presentation, owned by the emoji op) and
 * U+2028/U+2029 (turned into real newlines by normaliseNewlines).
 */
export const INVISIBLE_RE = charClass([
  0x00ad, 0x061c, 0x180e,
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x2064],
  [0x2066, 0x206f],
  [0xfe00, 0xfe0e],
  0xfeff,
  [0xfff9, 0xfffb],
  [0xe0100, 0xe01ef],
])

/** Plane-14 tag characters: invisible, and a known text-watermarking vector. */
export const TAG_CHARS_RE = charClass([[0xe0000, 0xe007f]])

/** Bidirectional overrides: invisible, and able to disguise what text says. */
export const BIDI_RE = charClass([0x061c, 0x200e, 0x200f, [0x202a, 0x202e], [0x2066, 0x2069]])

/** C0/C1 control characters, keeping tab and newline. */
export const CONTROL_RE = charClass([
  [0x0000, 0x0008], 0x000b, 0x000c, [0x000e, 0x001f], [0x007f, 0x009f],
], 'g')

/** Raw Windows-1252 punctuation bytes that were never decoded. */
export const CP1252_CONTROL_RE = charClass([[0x0080, 0x009f]], 'g')

/** Placeholders left behind by an image, chart or embedded object. */
export const OBJECT_REPLACEMENT_RE = charClass([0xfffc, 0xfffd], 'g')

/** Unicode line and paragraph separators, which are newlines in disguise. */
export const LINE_SEPARATOR_RE = charClass([0x2028, 0x2029], 'g')

/** Every Unicode space separator that is not a plain U+0020. */
export const EXOTIC_SPACE_RE = charClass([
  0x00a0, 0x1680, [0x2000, 0x200a], 0x202f, 0x205f, 0x3000,
], 'g')

/** Private-use area: Word and InDesign keep font-specific bullets here. */
export const PRIVATE_USE_RE = charClass([[0xe000, 0xf8ff]], 'g')

/** Combining marks, left behind after an NFD decomposition. */
export const COMBINING_RE = charClass([[0x0300, 0x036f]], 'g')

const EMOJI_SPEC = [
  [0x1f000, 0x1faff], [0x2600, 0x27bf], [0x2b00, 0x2bff],
  0xfe0f, [0x1f1e6, 0x1f1ff], [0x2300, 0x23ff], [0x2900, 0x297f],
]

/** A fresh regex each call, because a shared `g` regex carries `lastIndex`. */
export function emojiRegex() {
  return charClass(EMOJI_SPEC)
}

// --- Substitution tables --------------------------------------------------

/** Typographic ligatures that PDF extraction leaves behind as single glyphs. */
export const LIGATURES = buildMap([
  [0xfb00, 'ff'], [0xfb01, 'fi'], [0xfb02, 'fl'], [0xfb03, 'ffi'],
  [0xfb04, 'ffl'], [0xfb05, 'ft'], [0xfb06, 'st'],
  [0x0132, 'IJ'], [0x0133, 'ij'], [0xa728, 'TZ'], [0xa729, 'tz'],
])
export const LIGATURE_RE = classFromKeys(LIGATURES)

/** Curly quotes, primes and regional quote marks to ASCII " and '. */
export const QUOTES = buildMap([
  [0x2018, "'"], [0x2019, "'"], [0x201a, "'"], [0x201b, "'"],
  [0x2032, "'"], [0x2035, "'"], [0x02bc, "'"], [0x02b9, "'"], [0xff07, "'"],
  [0x2039, "'"], [0x203a, "'"],
  [0x201c, '"'], [0x201d, '"'], [0x201e, '"'], [0x201f, '"'],
  [0x2033, '"'], [0x2036, '"'], [0x02ba, '"'], [0xff02, '"'],
  [0x00ab, '"'], [0x00bb, '"'],
])
export const QUOTE_RE = classFromKeys(QUOTES)

/** Dashes and minus-alikes to an ASCII hyphen. */
export const DASHES = buildMap([
  [0x2010, '-'], [0x2011, '-'], [0x2012, '-'], [0x2013, '-'], [0x2014, '-'],
  [0x2015, '-'], [0x2212, '-'], [0x2043, '-'], [0xfe58, '-'], [0xfe63, '-'],
  [0xff0d, '-'],
])
export const DASH_RE = classFromKeys(DASHES)

/** Em dashes only, which need spaces when they are flattened to a hyphen. */
export const EM_DASH_RE = charClass([0x2014, 0x2015])

/** Symbols that are safe to spell out in ASCII. */
export const SYMBOLS = buildMap([
  [0x2026, '...'], [0x2024, '.'], [0x2025, '..'],
  [0x2022, '-'], [0x2023, '-'], [0x25aa, '-'], [0x25ab, '-'], [0x25cf, '-'],
  [0x25cb, '-'], [0x25e6, '-'], [0x204c, '-'], [0x204d, '-'], [0x2219, '-'],
  [0x00b7, '-'],
  [0x00bc, '1/4'], [0x00bd, '1/2'], [0x00be, '3/4'], [0x2044, '/'],
  [0x2122, '(TM)'], [0x00ae, '(R)'], [0x00a9, '(C)'], [0x2117, '(P)'],
  [0x00d7, 'x'], [0x2260, '!='], [0x2264, '<='], [0x2265, '>='],
  [0x00b0, ' degrees'], [0x2192, '->'], [0x2190, '<-'], [0x2194, '<->'],
  [0x21d2, '=>'], [0x2020, '*'], [0x2021, '**'], [0x2030, '%'],
])
export const SYMBOL_RE = classFromKeys(SYMBOLS)

/** Latin letters with diacritics and currency signs, to ASCII spellings. */
export const TRANSLITERATIONS = buildMap([
  [0x00e6, 'ae'], [0x00c6, 'AE'], [0x0153, 'oe'], [0x0152, 'OE'],
  [0x00df, 'ss'], [0x1e9e, 'SS'], [0x00f8, 'o'], [0x00d8, 'O'],
  [0x0111, 'd'], [0x0110, 'D'], [0x00f0, 'd'], [0x00d0, 'D'],
  [0x00fe, 'th'], [0x00de, 'TH'], [0x0142, 'l'], [0x0141, 'L'],
  [0x0127, 'h'], [0x0126, 'H'], [0x0131, 'i'], [0x014b, 'ng'], [0x014a, 'NG'],
  [0x20ac, 'EUR'], [0x00a3, 'GBP'], [0x00a5, 'JPY'], [0x00a2, 'c'],
  [0x2116, 'No.'], [0x00b5, 'u'],
])
export const TRANSLITERATE_RE = classFromKeys(TRANSLITERATIONS)

/** Bullet glyphs that turn up at the start of a line after a paste. */
export const BULLET_CODE_POINTS = [
  0x2022, 0x2023, 0x25aa, 0x25ab, 0x25cf, 0x25cb, 0x25e6, 0x2043, 0x204c,
  0x204d, 0x2219, 0x00b7, 0x00a7, 0x2751,
]

/** Just the bullet characters, for detecting a line that starts with one. */
export const BULLET_RE = charClass([...BULLET_CODE_POINTS, [0xe000, 0xf8ff]])

/**
 * Everything that can start a list item, which is the bullets plus the ASCII
 * markers people type by hand and the dashes a word processor substitutes.
 */
export const LIST_MARKER_CLASS_BODY =
  BULLET_CODE_POINTS.map((cp) => escapeInClass(ch(cp))).join('') +
  escapeInClass(ch(0xe000)) + '-' + escapeInClass(ch(0xf8ff)) +
  [0x002d, 0x2013, 0x2014].map((cp) => escapeInClass(ch(cp))).join('') +
  '\\*\\+'

/** Opening quote characters, used when deciding a sentence has restarted. */
export const OPEN_QUOTE_CLASS_BODY =
  '"\'' + escapeInClass(LDQUO) + escapeInClass(LSQUO)

/** Closing quote characters, used when deciding a sentence has ended. */
export const CLOSE_QUOTE_CLASS_BODY =
  '"\'' + escapeInClass(RDQUO) + escapeInClass(RSQUO)

/** Smart punctuation the scanner counts as "curly". */
export const SMART_QUOTE_RE = charClass([
  0x2018, 0x2019, 0x201a, 0x201b, 0x201c, 0x201d, 0x201e, 0x201f,
  0x2032, 0x2033, 0x00ab, 0x00bb,
], 'g')

/** Dashes the scanner counts as non-ASCII. */
export const SMART_DASH_RE = charClass([[0x2010, 0x2015], 0x2212], 'g')

/** Leading bytes that show text was decoded with the wrong encoding. */
export const MOJIBAKE_HINT_RE = new RegExp(
  '[' + [0x00c2, 0x00c3, 0x00e2, 0x00c5, 0x00d0].map((cp) => escapeInClass(ch(cp))).join('') + ']' +
  '[' + escapeInClass(ch(0x0080)) + '-' + escapeInClass(ch(0x00bf)) +
  [0x2013, 0x2014, 0x2018, 0x2019, 0x201a, 0x201c, 0x201d, 0x201e, 0x20ac, 0x2122, 0x2026]
    .map((cp) => escapeInClass(ch(cp))).join('') + ']',
  'g',
)

/** Builds `[mojibake, original]` pairs for the characters that break most. */
function buildMojibakePairs() {
  const targets = [
    0x2018, 0x2019, 0x201a, 0x201c, 0x201d, 0x201e, 0x2013, 0x2014, 0x2026,
    0x2022, 0x2039, 0x203a, 0x00a0, 0x00a9, 0x00ae, 0x2122, 0x00b0, 0x00b7,
    0x00bd, 0x00bc, 0x00be, 0x20ac, 0x00a3, 0x00a5, 0x2032, 0x2033, 0x00ab,
    0x00bb, 0x2212, 0x00d7, 0x2192, 0x2190, 0x00e0, 0x00e1, 0x00e2, 0x00e3,
    0x00e4, 0x00e5, 0x00e7, 0x00e8, 0x00e9, 0x00ea, 0x00eb, 0x00ed, 0x00ee,
    0x00ef, 0x00f1, 0x00f3, 0x00f4, 0x00f6, 0x00f8, 0x00fa, 0x00fb, 0x00fc,
    0x00fd, 0x00ff, 0x00c9, 0x00d6, 0x00dc, 0x00df, 0x0161, 0x017e, 0x0153,
  ]
  const byteToChar = (b) =>
    b >= 0x80 && b <= 0x9f ? ch(CP1252_HIGH[b - 0x80]) : String.fromCharCode(b)

  const encoder = new TextEncoder()
  const pairs = []
  for (const cp of targets) {
    const original = ch(cp)
    const broken = Array.from(encoder.encode(original), byteToChar).join('')
    if (broken !== original) pairs.push([broken, original])
  }
  // Longest first, so a three-character sequence wins over its own prefix.
  return pairs.sort((a, b) => b[0].length - a[0].length)
}

export const MOJIBAKE_PAIRS = buildMojibakePairs()

// --- Description ----------------------------------------------------------

const CHARACTER_NAMES = new Map([
  [0x09, 'tab'], [0x0a, 'line feed'], [0x0d, 'carriage return'], [0x20, 'space'],
  [0xa0, 'no-break space'], [0xad, 'soft hyphen'],
  [0x200b, 'zero-width space'], [0x200c, 'zero-width non-joiner'],
  [0x200d, 'zero-width joiner'], [0xfeff, 'byte order mark'],
  [0x2018, 'left single quote'], [0x2019, 'right single quote or apostrophe'],
  [0x201c, 'left double quote'], [0x201d, 'right double quote'],
  [0x2013, 'en dash'], [0x2014, 'em dash'], [0x2026, 'horizontal ellipsis'],
  [0x2022, 'bullet'], [0x202f, 'narrow no-break space'], [0x2009, 'thin space'],
  [0x2002, 'en space'], [0x2003, 'em space'], [0x3000, 'ideographic space'],
  [0xfffc, 'object replacement (image or embed)'],
  [0xfffd, 'replacement character (the original is already lost)'],
  [0xfb00, 'ligature ff'], [0xfb01, 'ligature fi'], [0xfb02, 'ligature fl'],
  [0x2028, 'line separator'], [0x2029, 'paragraph separator'],
])

/** Human-readable name for a code point, used by the character inspector. */
export function describeCodePoint(cp) {
  const named = CHARACTER_NAMES.get(cp)
  if (named) return named
  if (cp >= 0xe0000 && cp <= 0xe007f) return 'invisible tag character'
  if (cp >= 0xe000 && cp <= 0xf8ff) return 'private-use glyph (font-specific)'
  if (cp >= 0x0300 && cp <= 0x036f) return 'combining accent'
  if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) return 'control character'
  if (cp >= 0x1f000) return 'emoji or pictograph'
  return 'non-ASCII character'
}

/** `U+00A0` style label. */
export function formatCodePoint(cp) {
  return 'U+' + cp.toString(16).toUpperCase().padStart(4, '0')
}

/** True when a code point would be invisible or misleading on screen. */
export function isInvisibleCodePoint(cp) {
  if (cp < 0x20 || (cp >= 0x7f && cp <= 0xa0)) return true
  if (cp >= 0x200b && cp <= 0x200f) return true
  if (cp >= 0x2028 && cp <= 0x202e) return true
  if (cp >= 0x2060 && cp <= 0x206f) return true
  if (cp === 0xfeff || cp === 0xfffc) return true
  if (cp >= 0xe000 && cp <= 0xf8ff) return true
  if (cp >= 0xe0000 && cp <= 0xe007f) return true
  if (cp >= 0xfe00 && cp <= 0xfe0f) return true
  return false
}
