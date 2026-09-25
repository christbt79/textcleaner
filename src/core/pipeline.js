/**
 * The operation registry.
 *
 * Order matters and is the order of this array: markup is resolved before
 * characters are repaired, characters are repaired before lines are reflowed,
 * lines are reflowed before spacing is tidied, and case and formatting come
 * last so they act on finished text. Toggling operations never changes the
 * order they run in, which is what makes the output predictable.
 */

import * as repair from './ops/repair.js'
import * as markup from './ops/markup.js'
import * as lines from './ops/lines.js'
import * as space from './ops/whitespace.js'
import * as casing from './ops/casing.js'
import * as transform from './ops/transform.js'

export const GROUPS = [
  { id: 'markup', label: 'Strip markup', hint: 'HTML, Markdown and entities' },
  { id: 'repair', label: 'Repair characters', hint: 'Invisible and broken characters' },
  { id: 'typography', label: 'Quotes, dashes & symbols', hint: 'Smart punctuation to ASCII, or back' },
  { id: 'structure', label: 'Lines & paragraphs', hint: 'Reflow, lists, duplicates, sorting' },
  { id: 'spacing', label: 'Spacing', hint: 'Tabs, runs of spaces, indentation' },
  { id: 'replace', label: 'Find & replace', hint: 'Plain text or regular expressions' },
  { id: 'case', label: 'Case', hint: 'One conversion at a time' },
  { id: 'format', label: 'Output format', hint: 'Wrapping, numbering, joining' },
]

/** @type {Array<{id:string,label:string,hint?:string,group:string,params?:Array,run:Function,exclusive?:string}>} */
export const OPERATIONS = [
  // --- Strip markup -------------------------------------------------------
  {
    id: 'htmlToText',
    label: 'Strip HTML',
    hint: 'Removes tags and keeps block structure as line breaks.',
    group: 'markup',
    exclusive: 'markup',
    params: [
      { key: 'keepStructure', type: 'checkbox', label: 'Keep block structure', default: true },
      { key: 'keepLinks', type: 'checkbox', label: 'Keep link URLs in brackets', default: false },
      { key: 'listMarker', type: 'text', label: 'List marker', default: '- ', width: 'short' },
    ],
    run: (text, p) => markup.htmlToText(text, p),
  },
  {
    id: 'stripTags',
    label: 'Strip tags only',
    hint: 'Deletes anything in angle brackets, keeps the text between.',
    group: 'markup',
    exclusive: 'markup',
    params: [{ key: 'decode', type: 'checkbox', label: 'Decode entities', default: true }],
    run: (text, p) => markup.stripTags(text, p),
  },
  {
    id: 'htmlToMarkdown',
    label: 'HTML to Markdown',
    hint: 'Keeps headings, bold, links and lists as Markdown.',
    group: 'markup',
    exclusive: 'markup',
    run: (text) => markup.htmlToMarkdown(text),
  },
  {
    id: 'stripMarkdown',
    label: 'Strip Markdown',
    hint: 'Removes #, **, links and list markers.',
    group: 'markup',
    run: (text) => markup.stripMarkdown(text),
  },
  {
    id: 'decodeEntities',
    label: 'Decode HTML entities',
    hint: '&amp;amp; and &amp;#8217; become the characters they stand for.',
    group: 'markup',
    run: (text) => markup.decodeEntities(text),
  },
  {
    id: 'encodeEntities',
    label: 'Encode HTML entities',
    hint: 'Escapes the characters that break HTML.',
    group: 'markup',
    params: [{ key: 'all', type: 'checkbox', label: 'Also escape non-ASCII', default: false }],
    run: (text, p) => markup.encodeEntities(text, p),
  },

  // --- Repair characters --------------------------------------------------
  {
    id: 'fixMojibake',
    label: 'Repair mojibake',
    hint: 'Turns the classic garbled sequences back into the right character.',
    group: 'repair',
    default: true,
    run: (text) => repair.fixMojibake(text),
  },
  {
    id: 'fixCp1252',
    label: 'Repair Windows-1252 bytes',
    hint: 'Raw cp1252 control bytes become the punctuation they meant.',
    group: 'repair',
    default: true,
    run: (text) => repair.fixCp1252Controls(text),
  },
  {
    id: 'normaliseUnicode',
    label: 'Normalise Unicode (NFC)',
    hint: 'Recombines split accents so identical-looking text compares equal.',
    group: 'repair',
    default: true,
    params: [{
      key: 'form', type: 'select', label: 'Form', default: 'NFC',
      options: [['NFC', 'NFC (compose)'], ['NFD', 'NFD (decompose)'], ['NFKC', 'NFKC (compatibility)']],
    }],
    run: (text, p) => repair.normaliseUnicode(text, p),
  },
  {
    id: 'removeInvisibles',
    label: 'Remove invisible characters',
    hint: 'Zero-width spaces, soft hyphens, BOMs, bidi overrides, tag characters.',
    group: 'repair',
    default: true,
    run: (text) => repair.removeInvisibles(text),
  },
  {
    id: 'removeControls',
    label: 'Remove control characters',
    hint: 'Including the placeholders left by images and embedded objects.',
    group: 'repair',
    default: true,
    params: [{ key: 'privateUse', type: 'checkbox', label: 'Also private-use glyphs', default: true }],
    run: (text, p) => repair.removeControls(text, p),
  },
  {
    id: 'normaliseSpaces',
    label: 'Convert non-breaking spaces',
    hint: 'Every exotic space separator becomes a plain space.',
    group: 'repair',
    default: true,
    run: (text) => repair.normaliseSpaces(text),
  },
  {
    id: 'expandLigatures',
    label: 'Expand ligatures',
    hint: 'PDF glyphs like the fi ligature become ordinary letters.',
    group: 'repair',
    default: true,
    run: (text) => repair.expandLigatures(text),
  },
  {
    id: 'transliterate',
    label: 'Remove accents',
    hint: 'Accented Latin letters lose their diacritics.',
    group: 'repair',
    run: (text) => repair.transliterate(text),
  },
  {
    id: 'removeEmoji',
    label: 'Remove emoji',
    group: 'repair',
    run: (text) => repair.removeEmoji(text),
  },
  {
    id: 'asciiOnly',
    label: 'ASCII only',
    hint: 'The hammer: deletes everything outside printable ASCII.',
    group: 'repair',
    params: [{ key: 'replacement', type: 'text', label: 'Replace with', default: '', width: 'short' }],
    run: (text, p) => repair.asciiOnly(text, p),
  },

  // --- Quotes, dashes & symbols ------------------------------------------
  {
    id: 'straightenQuotes',
    label: 'Straighten quotes',
    hint: 'Curly quotes and primes become straight ASCII quotes.',
    group: 'typography',
    default: true,
    exclusive: 'quotes',
    run: (text) => repair.straightenQuotes(text),
  },
  {
    id: 'curlQuotes',
    label: 'Smarten quotes',
    hint: 'The other direction, for layout work.',
    group: 'typography',
    exclusive: 'quotes',
    run: (text) => repair.curlQuotes(text),
  },
  {
    id: 'straightenDashes',
    label: 'Straighten dashes',
    hint: 'En and em dashes become hyphens, spaced where they were not.',
    group: 'typography',
    default: true,
    exclusive: 'dashes',
    run: (text) => repair.straightenDashes(text),
  },
  {
    id: 'typographicDashes',
    label: 'Smarten dashes',
    hint: 'Number ranges get en dashes, -- becomes an em dash, ... an ellipsis.',
    group: 'typography',
    exclusive: 'dashes',
    run: (text) => repair.typographicDashes(text),
  },
  {
    id: 'asciiSymbols',
    label: 'Spell out symbols',
    hint: 'Ellipses, fractions, arrows and trademark signs become ASCII.',
    group: 'typography',
    run: (text) => repair.asciiSymbols(text),
  },
  {
    id: 'cleanUrls',
    label: 'Strip tracking from URLs',
    hint: 'Removes utm_, fbclid, gclid and friends.',
    group: 'typography',
    run: (text) => transform.cleanUrls(text, { removeTracking: true }),
  },

  // --- Lines & paragraphs -------------------------------------------------
  {
    id: 'removeEmailQuoting',
    label: 'Remove email quote markers',
    hint: 'Strips the > that replies accumulate.',
    group: 'structure',
    params: [{ key: 'dropQuotedText', type: 'checkbox', label: 'Delete quoted lines entirely', default: false }],
    run: (text, p) => lines.removeEmailQuoting(text, p),
  },
  {
    id: 'removeListMarkers',
    label: 'Remove list markers',
    hint: 'Bullets and auto-numbering that came across as characters.',
    group: 'structure',
    exclusive: 'listMarkers',
    params: [
      { key: 'bullets', type: 'checkbox', label: 'Bullets', default: true },
      { key: 'numbers', type: 'checkbox', label: 'Numbering', default: true },
    ],
    run: (text, p) => lines.removeListMarkers(text, p),
  },
  {
    id: 'normaliseListMarkers',
    label: 'Normalise list markers',
    hint: 'Every bullet becomes the same one.',
    group: 'structure',
    exclusive: 'listMarkers',
    params: [{ key: 'marker', type: 'text', label: 'Marker', default: '- ', width: 'short' }],
    run: (text, p) => lines.normaliseListMarkers(text, p),
  },
  {
    id: 'removePageNumbers',
    label: 'Remove page numbers',
    hint: 'Lines that are only a page number or "Page 3 of 12".',
    group: 'structure',
    run: (text) => lines.removePageNumbers(text),
  },
  {
    id: 'removeRepeatedLines',
    label: 'Remove running heads and feet',
    hint: 'Short lines that repeat throughout a document.',
    group: 'structure',
    params: [{ key: 'minOccurrences', type: 'number', label: 'Repeats before removal', default: 3, min: 2, max: 50 }],
    run: (text, p) => lines.removeRepeatedLines(text, p),
  },
  {
    id: 'dehyphenate',
    label: 'Rejoin hyphenated words',
    hint: 'Fixes words a PDF split across a line break.',
    group: 'structure',
    run: (text) => lines.dehyphenate(text),
  },
  {
    id: 'unwrapParagraphs',
    label: 'Remove line breaks (keep paragraphs)',
    hint: 'Undoes hard wrapping from PDFs and plain-text email, keeping real paragraph breaks.',
    group: 'structure',
    exclusive: 'lineBreaks',
    params: [{ key: 'dehyphenate', type: 'checkbox', label: 'Rejoin hyphenated words', default: true }],
    run: (text, p) => lines.unwrapParagraphs(text, p),
  },
  {
    id: 'removeAllLineBreaks',
    label: 'Remove all line breaks',
    hint: 'Everything becomes one line.',
    group: 'structure',
    exclusive: 'lineBreaks',
    params: [{ key: 'separator', type: 'text', label: 'Join with', default: ' ', width: 'short' }],
    run: (text, p) => lines.removeAllLineBreaks(text, p),
  },
  {
    id: 'removeEmptyLines',
    label: 'Remove empty lines',
    group: 'structure',
    exclusive: 'blankLines',
    run: (text) => lines.removeEmptyLines(text),
  },
  {
    id: 'collapseBlankLines',
    label: 'Limit blank lines',
    hint: 'Runs of blank lines collapse to a fixed maximum.',
    group: 'structure',
    default: true,
    exclusive: 'blankLines',
    params: [{ key: 'max', type: 'number', label: 'Maximum blank lines', default: 1, min: 0, max: 10 }],
    run: (text, p) => lines.collapseBlankLines(text, p),
  },
  {
    id: 'doubleSpaceLines',
    label: 'Blank line between every line',
    group: 'structure',
    exclusive: 'blankLines',
    run: (text) => lines.doubleSpaceLines(text),
  },
  {
    id: 'deduplicateLines',
    label: 'Remove duplicate lines',
    group: 'structure',
    params: [
      { key: 'caseSensitive', type: 'checkbox', label: 'Case sensitive', default: false },
      { key: 'adjacentOnly', type: 'checkbox', label: 'Only consecutive duplicates', default: false },
    ],
    run: (text, p) => lines.deduplicateLines(text, p),
  },
  {
    id: 'filterLines',
    label: 'Keep or drop matching lines',
    group: 'structure',
    params: [
      { key: 'pattern', type: 'text', label: 'Pattern', default: '', placeholder: 'text or regex' },
      { key: 'mode', type: 'select', label: 'Action', default: 'keep', options: [['keep', 'Keep matching'], ['drop', 'Drop matching']] },
      { key: 'regex', type: 'checkbox', label: 'Regular expression', default: false },
      { key: 'ignoreCase', type: 'checkbox', label: 'Ignore case', default: true },
    ],
    run: (text, p) => lines.filterLines(text, p),
  },
  {
    id: 'sortLines',
    label: 'Sort lines',
    group: 'structure',
    params: [{
      key: 'order', type: 'select', label: 'Order', default: 'asc',
      options: [
        ['asc', 'A to Z'], ['desc', 'Z to A'],
        ['length', 'Shortest first'], ['lengthDesc', 'Longest first'],
        ['reverse', 'Reverse current order'], ['shuffle', 'Shuffle'],
      ],
    }],
    run: (text, p) => lines.sortLines(text, p),
  },

  // --- Spacing ------------------------------------------------------------
  {
    id: 'tabsToSpaces',
    label: 'Tabs to spaces',
    group: 'spacing',
    exclusive: 'tabs',
    params: [{ key: 'width', type: 'number', label: 'Spaces per tab', default: 4, min: 1, max: 16 }],
    run: (text, p) => space.tabsToSpaces(text, p),
  },
  {
    id: 'spacesToTabs',
    label: 'Leading spaces to tabs',
    group: 'spacing',
    exclusive: 'tabs',
    params: [{ key: 'width', type: 'number', label: 'Spaces per tab', default: 4, min: 1, max: 16 }],
    run: (text, p) => space.spacesToTabs(text, p),
  },
  {
    id: 'collapseSpaces',
    label: 'Collapse repeated spaces',
    hint: 'Runs of spaces and tabs become a single space.',
    group: 'spacing',
    default: true,
    run: (text) => space.collapseSpaces(text),
  },
  {
    id: 'trimLines',
    label: 'Trim each line',
    group: 'spacing',
    default: true,
    params: [
      { key: 'start', type: 'checkbox', label: 'Leading whitespace', default: true },
      { key: 'end', type: 'checkbox', label: 'Trailing whitespace', default: true },
    ],
    run: (text, p) => {
      let out = text
      if (p.end) out = space.trimLineEnds(out)
      if (p.start) out = space.trimLineStarts(out)
      return out
    },
  },
  {
    id: 'fixSpaceBeforePunctuation',
    label: 'Fix space before punctuation',
    hint: 'Deletes the stray space in "word ."',
    group: 'spacing',
    default: true,
    run: (text) => space.fixSpaceBeforePunctuation(text),
  },
  {
    id: 'fixSpaceAfterPunctuation',
    label: 'Add missing space after punctuation',
    hint: 'Fixes "one.Two" from a broken PDF extraction.',
    group: 'spacing',
    run: (text) => space.fixSpaceAfterPunctuation(text),
  },
  {
    id: 'sentenceSpacing',
    label: 'Sentence spacing',
    group: 'spacing',
    params: [{
      key: 'mode', type: 'select', label: 'After a full stop', default: 'single',
      options: [['single', 'One space'], ['double', 'Two spaces']],
    }],
    run: (text, p) =>
      p.mode === 'double' ? space.doubleSpaceAfterSentence(text) : space.singleSpaceAfterSentence(text),
  },

  // --- Find & replace -----------------------------------------------------
  {
    id: 'findReplace',
    label: 'Find and replace',
    group: 'replace',
    params: [
      { key: 'rules', type: 'rules', label: 'Rules', default: [{ find: '', replace: '' }] },
      { key: 'regex', type: 'checkbox', label: 'Regular expression', default: false },
      { key: 'matchCase', type: 'checkbox', label: 'Match case', default: false },
      { key: 'wholeWord', type: 'checkbox', label: 'Whole word only', default: false },
    ],
    run: (text, p) =>
      transform.applyReplacementRules(text, p.rules ?? [], {
        regex: p.regex, matchCase: p.matchCase, wholeWord: p.wholeWord,
      }),
  },
  {
    id: 'removeCharacters',
    label: 'Remove specific characters',
    group: 'replace',
    params: [{ key: 'characters', type: 'text', label: 'Characters', default: '', placeholder: 'e.g. #*|' }],
    run: (text, p) => transform.removeCharacters(text, p),
  },
  {
    id: 'removePunctuation',
    label: 'Remove punctuation',
    group: 'replace',
    params: [{ key: 'keep', type: 'text', label: 'Except', default: '.,\'', width: 'short' }],
    run: (text, p) => transform.removePunctuation(text, p),
  },
  {
    id: 'removeNumbers',
    label: 'Remove digits',
    group: 'replace',
    run: (text) => transform.removeNumbers(text),
  },
  {
    id: 'extract',
    label: 'Extract only',
    hint: 'Throws away everything except the matches, one per line.',
    group: 'replace',
    params: [
      {
        key: 'pattern', type: 'select', label: 'Extract', default: 'urls',
        options: [
          ['urls', 'URLs'], ['emails', 'Email addresses'], ['numbers', 'Numbers'],
          ['hashtags', 'Hashtags'], ['mentions', 'Mentions'], ['dates', 'Dates'],
          ['phones', 'Phone numbers'], ['ips', 'IP addresses'],
        ],
      },
      { key: 'unique', type: 'checkbox', label: 'Unique only', default: true },
      { key: 'sort', type: 'checkbox', label: 'Sort', default: false },
    ],
    run: (text, p) => transform.extract(text, p),
  },

  // --- Case ---------------------------------------------------------------
  {
    id: 'changeCase',
    label: 'Convert case',
    group: 'case',
    params: [
      {
        key: 'mode', type: 'select', label: 'Convert to', default: 'sentence',
        options: [
          ['sentence', 'Sentence case'], ['title', 'Title Case'], ['capital', 'Capital Case'],
          ['upper', 'UPPER CASE'], ['lower', 'lower case'], ['toggle', 'tOGGLE cASE'],
          ['alternating', 'aLtErNaTiNg'], ['camel', 'camelCase'], ['pascal', 'PascalCase'],
          ['snake', 'snake_case'], ['kebab', 'kebab-case'], ['constant', 'CONSTANT_CASE'],
          ['dot', 'dot.case'], ['slug', 'url-slug'],
        ],
      },
      { key: 'preserveAcronyms', type: 'checkbox', label: 'Preserve acronyms and brand caps', default: true },
    ],
    run: (text, p) => {
      const fns = {
        sentence: casing.toSentenceCase, title: casing.toTitleCase, capital: casing.toCapitalCase,
        upper: casing.toUpperCase, lower: casing.toLowerCase, toggle: casing.toToggleCase,
        alternating: casing.toAlternatingCase, camel: casing.toCamelCase, pascal: casing.toPascalCase,
        snake: casing.toSnakeCase, kebab: casing.toKebabCase, constant: casing.toConstantCase,
        dot: casing.toDotCase, slug: casing.toSlug,
      }
      return (fns[p.mode] ?? casing.toSentenceCase)(text, p)
    },
  },

  // --- Output format ------------------------------------------------------
  {
    id: 'wrapLines',
    label: 'Wrap at column',
    group: 'format',
    params: [
      { key: 'width', type: 'number', label: 'Columns', default: 80, min: 20, max: 200 },
      { key: 'breakLongWords', type: 'checkbox', label: 'Break long words', default: false },
    ],
    run: (text, p) => lines.wrapLines(text, p),
  },
  {
    id: 'affixLines',
    label: 'Add prefix or suffix',
    group: 'format',
    params: [
      { key: 'prefix', type: 'text', label: 'Prefix', default: '', width: 'short' },
      { key: 'suffix', type: 'text', label: 'Suffix', default: '', width: 'short' },
      { key: 'skipEmpty', type: 'checkbox', label: 'Skip empty lines', default: true },
    ],
    run: (text, p) => lines.affixLines(text, p),
  },
  {
    id: 'numberLines',
    label: 'Number the lines',
    group: 'format',
    exclusive: 'numbering',
    params: [
      { key: 'start', type: 'number', label: 'Start at', default: 1, min: 0, max: 100000 },
      { key: 'separator', type: 'text', label: 'After the number', default: '. ', width: 'short' },
      { key: 'pad', type: 'checkbox', label: 'Align numbers', default: false },
    ],
    run: (text, p) => lines.numberLines(text, p),
  },
  {
    id: 'removeLineNumbers',
    label: 'Remove line numbers',
    group: 'format',
    exclusive: 'numbering',
    run: (text) => lines.removeLineNumbers(text),
  },
  {
    id: 'joinLines',
    label: 'Join lines with a delimiter',
    group: 'format',
    params: [
      { key: 'separator', type: 'text', label: 'Delimiter', default: ', ', width: 'short' },
      { key: 'quote', type: 'text', label: 'Wrap each in', default: '', width: 'short' },
    ],
    run: (text, p) => lines.joinLines(text, p),
  },
  {
    id: 'splitToLines',
    label: 'Split into lines',
    group: 'format',
    params: [{ key: 'separator', type: 'text', label: 'Split on', default: ',', width: 'short' }],
    run: (text, p) => lines.splitToLines(text, p),
  },
  {
    id: 'reverse',
    label: 'Reverse',
    group: 'format',
    params: [{
      key: 'mode', type: 'select', label: 'Reverse', default: 'lines',
      options: [['lines', 'Line order'], ['words', 'Word order'], ['characters', 'Characters']],
    }],
    run: (text, p) => transform.reverse(text, p),
  },
  {
    id: 'encode',
    label: 'Encode or decode',
    group: 'format',
    params: [{
      key: 'mode', type: 'select', label: 'Mode', default: 'urlEncode',
      options: [
        ['urlEncode', 'URL encode'], ['urlDecode', 'URL decode'],
        ['base64Encode', 'Base64 encode'], ['base64Decode', 'Base64 decode'],
        ['jsonEscape', 'Escape for JSON'], ['jsonUnescape', 'Unescape from JSON'],
        ['csv', 'Quote as a CSV field'],
      ],
    }],
    run: (text, p) => {
      const fns = {
        urlEncode: transform.urlEncode, urlDecode: transform.urlDecode,
        base64Encode: transform.base64Encode, base64Decode: transform.base64Decode,
        jsonEscape: transform.jsonEscape, jsonUnescape: transform.jsonUnescape,
        csv: transform.toCsvField,
      }
      return (fns[p.mode] ?? ((t) => t))(text)
    },
  },
  {
    id: 'trimDocument',
    label: 'Trim the whole document',
    group: 'format',
    default: true,
    run: (text) => space.trimDocument(text),
  },
]

export const OPERATIONS_BY_ID = new Map(OPERATIONS.map((op) => [op.id, op]))

/** The parameter defaults for one operation. */
export function defaultParams(op) {
  const out = {}
  for (const param of op.params ?? []) {
    out[param.key] = Array.isArray(param.default)
      ? param.default.map((entry) => ({ ...entry }))
      : param.default
  }
  return out
}

/** The full default parameter set, keyed by operation id. */
export function defaultParamState() {
  const out = {}
  for (const op of OPERATIONS) {
    const params = defaultParams(op)
    if (Object.keys(params).length) out[op.id] = params
  }
  return out
}

/** The operations enabled out of the box. */
export function defaultEnabled() {
  return OPERATIONS.filter((op) => op.default).map((op) => op.id)
}

/**
 * Runs the enabled operations in registry order.
 *
 * Newlines are normalised up front so every downstream operation can assume
 * `\n`, and any operation that throws is reported rather than losing the text.
 */
export function runPipeline(text, { enabled = [], params = {} } = {}) {
  const active = new Set(enabled)
  const errors = []
  let out = repair.normaliseNewlines(text)

  for (const op of OPERATIONS) {
    if (!active.has(op.id)) continue
    try {
      const result = op.run(out, { ...defaultParams(op), ...(params[op.id] ?? {}) })
      if (typeof result === 'string') out = result
    } catch (error) {
      errors.push({ id: op.id, label: op.label, message: String(error?.message ?? error) })
    }
  }

  return { text: out, errors }
}

/**
 * Operations that cannot be on at the same time, e.g. straighten vs smarten
 * quotes. Returns the ids to switch off when `id` is switched on.
 */
export function conflictsWith(id) {
  const op = OPERATIONS_BY_ID.get(id)
  if (!op?.exclusive) return []
  return OPERATIONS.filter((other) => other.exclusive === op.exclusive && other.id !== id)
    .map((other) => other.id)
}
