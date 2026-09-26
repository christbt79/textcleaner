/**
 * What the app does with a paste.
 *
 * Safe repairs always run: nobody wants a non-breaking space or a garbled
 * apostrophe, so there is nothing to choose. Four switches cover the changes
 * that alter the shape of the text, which the app cannot decide on its own.
 * Tools are one-off actions applied on top of the cleaned text, each undoable.
 *
 * This module sits on top of the pipeline, so every operation still runs in
 * the pipeline's fixed order whichever switches are on.
 */

import { runPipeline } from './pipeline.js'
import { scanText } from './scan.js'
import { looksLikeHtml } from './ops/markup.js'
import { isListItem } from './ops/lines.js'
import * as casing from './ops/casing.js'
import * as lines from './ops/lines.js'
import * as repair from './ops/repair.js'
import * as space from './ops/whitespace.js'
import { findReplace } from './ops/transform.js'

/** Repairs that are always safe, so they always run. */
export const ALWAYS = [
  'fixMojibake', 'fixCp1252', 'normaliseUnicode', 'removeInvisibles',
  'removeControls', 'normaliseSpaces', 'expandLigatures', 'collapseSpaces',
  'trimLines', 'collapseBlankLines', 'fixSpaceBeforePunctuation', 'trimDocument',
]

/** The switches under the box, in the order they are shown. */
export const SWITCHES = [
  {
    id: 'joinLines',
    label: 'Join broken lines',
    hint: 'For text from a PDF or an email. Joins lines that break mid-sentence, and removes page numbers, repeated headers and > reply markers.',
    ops: ['removeEmailQuoting', 'removePageNumbers', 'removeRepeatedLines', 'unwrapParagraphs'],
  },
  {
    id: 'removeBullets',
    label: 'Remove bullets & numbering',
    hint: 'Strips bullet characters and 1. 2. 3. numbering from the start of lines.',
    ops: ['removeListMarkers'],
  },
  {
    id: 'keepQuotes',
    label: 'Keep curly quotes',
    hint: 'Leaves typographic quotes and dashes as they are, for InDesign or Word.',
    ops: [],
  },
  {
    id: 'oneLine',
    label: 'One line',
    hint: 'Puts everything on a single line, for a form field or a spreadsheet cell.',
    ops: ['dehyphenate', 'removeAllLineBreaks'],
  },
  {
    id: 'removeEmojis',
    label: 'Remove emojis',
    hint: 'Removes emojis, with their skin tones, flags and keycaps. Copyright and trademark signs, arrows and ticks stay.',
    ops: ['removeEmoji'],
  },
]

export const DEFAULT_OPTIONS = Object.freeze({
  joinLines: false,
  removeBullets: false,
  keepQuotes: false,
  oneLine: false,
  removeEmojis: false,
  // Not a visible switch: turned on by the Strip HTML tool or suggestion,
  // because tags have to come out before the characters are repaired.
  stripHtml: false,
})

/** The pipeline operations a set of options switches on. */
export function enabledOps(options = {}) {
  const ops = [...ALWAYS]
  if (!options.keepQuotes) ops.push('straightenQuotes', 'straightenDashes')
  for (const option of SWITCHES) {
    if (options[option.id]) ops.push(...option.ops)
  }
  if (options.stripHtml) ops.push('htmlToText')
  return ops
}

/** Cleans a paste according to the options. */
export function cleanText(raw, options = {}) {
  if (!raw) return ''
  return runPipeline(raw, { enabled: enabledOps(options) }).text
}

// --- Tools ----------------------------------------------------------------

/** Plain ASCII, for a CMS or code: accents, emoji and symbols go. */
function toPlainAscii(text) {
  let out = repair.straightenQuotes(text)
  out = repair.straightenDashes(out)
  out = repair.asciiSymbols(out)
  out = repair.transliterate(out)
  out = repair.removeEmoji(out)
  out = repair.asciiOnly(out)
  return space.trimLineEnds(space.collapseSpaces(out))
}

/**
 * One-off actions. `step` tools are applied to the cleaned text in order;
 * `option` tools switch on a pipeline option; `dialog` tools open a panel.
 * `done` finishes the sentence "Then ..." in the summary line.
 */
export const TOOLS = [
  { id: 'upper', group: 'Case', label: 'UPPER CASE', done: 'changed to UPPER CASE', kind: 'step', run: (t) => casing.toUpperCase(t) },
  { id: 'lower', group: 'Case', label: 'lower case', done: 'changed to lower case', kind: 'step', run: (t) => casing.toLowerCase(t) },
  { id: 'sentence', group: 'Case', label: 'Sentence case', done: 'changed to Sentence case', kind: 'step', run: (t) => casing.toSentenceCase(t) },
  { id: 'title', group: 'Case', label: 'Title Case', done: 'changed to Title Case', kind: 'step', run: (t) => casing.toTitleCase(t) },
  { id: 'sort', group: 'Lines', label: 'Sort lines A to Z', done: 'sorted the lines A to Z', kind: 'step', run: (t) => lines.sortLines(t, { order: 'asc' }) },
  { id: 'dedupe', group: 'Lines', label: 'Remove duplicate lines', done: 'removed duplicate lines', kind: 'step', run: (t) => lines.deduplicateLines(t, { caseSensitive: false }) },
  { id: 'removeEmpty', group: 'Lines', label: 'Remove empty lines', done: 'removed empty lines', kind: 'step', run: (t) => lines.removeEmptyLines(t) },
  { id: 'replace', group: 'Other', label: 'Find and replace', done: 'replaced text', kind: 'dialog', run: (t, p) => findReplace(t, p) },
  { id: 'stripHtml', group: 'Other', label: 'Strip HTML tags', done: 'removed HTML tags', kind: 'option', option: 'stripHtml' },
  { id: 'ascii', group: 'Other', label: 'Plain ASCII only', done: 'reduced to plain ASCII', kind: 'step', hint: 'Removes accents, emoji and special symbols.', run: toPlainAscii },
]

export const TOOLS_BY_ID = new Map(TOOLS.map((tool) => [tool.id, tool]))

/** Applies tool steps, in order, to already-cleaned text. */
export function applySteps(text, steps = []) {
  return steps.reduce((acc, step) => {
    const tool = TOOLS_BY_ID.get(step.id)
    return tool?.run ? tool.run(acc, step.params ?? {}) : acc
  }, text)
}

// --- Describing what happened ---------------------------------------------

function plural(n, one, many = one + 's') {
  return n + ' ' + (n === 1 ? one : many)
}

/** `a`, `a and b`, `a, b and c`. */
export function joinList(items) {
  if (items.length < 2) return items.join('')
  return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1]
}

/** Character repairs, as nouns with exact counts: "Fixed 4 non-breaking spaces". */
const CHARACTER_FIXES = [
  ['mojibake', ['fixMojibake'], (n) => plural(n, 'garbled character')],
  ['replacementChar', ['removeControls'], (n) => plural(n, 'broken character')],
  ['invisibles', ['removeInvisibles'], (n) => plural(n, 'invisible character')],
  ['tagChars', ['removeInvisibles'], (n) => plural(n, 'hidden tag character')],
  ['controls', ['removeControls'], (n) => plural(n, 'control character')],
  ['objects', ['removeControls'], (n) => plural(n, 'image placeholder')],
  ['privateUse', ['removeControls'], (n) => plural(n, 'font-specific symbol')],
  ['nbsp', ['normaliseSpaces'], (n) => plural(n, 'non-breaking space')],
  ['ligatures', ['expandLigatures'], (n) => plural(n, 'ligature')],
  ['smartQuotes', ['straightenQuotes'], (n) => plural(n, 'curly quote')],
  ['dashes', ['straightenDashes'], (n) => plural(n, 'long dash', 'long dashes')],
  ['multiSpace', ['collapseSpaces'], (n) => plural(n, 'double space')],
  ['trailingSpace', ['trimLines'], (n) => plural(n, 'trailing space')],
  ['spaceBeforePunctuation', ['fixSpaceBeforePunctuation'],
    (n) => plural(n, 'space before punctuation', 'spaces before punctuation')],
]

/**
 * Changes to the shape of the text, as verb phrases. Counts are given only
 * where the scanner's count is exactly what the operation removed.
 */
const STRUCTURE_FIXES = [
  ['html', ['htmlToText'], () => 'removed HTML tags'],
  ['hyphenBreaks', ['unwrapParagraphs', 'dehyphenate'], (n) => 'rejoined ' + plural(n, 'hyphenated word')],
  ['hardWrap', ['unwrapParagraphs'], () => 'joined broken lines'],
  ['pageNumbers', ['removePageNumbers'], () => 'removed page numbers'],
  ['runningHeads', ['removeRepeatedLines'], () => 'removed repeated headers'],
  ['emailQuoting', ['removeEmailQuoting'], () => 'removed reply markers'],
  ['emoji', ['removeEmoji'], (n) => 'removed ' + plural(n, 'emoji', 'emojis')],
  ['blankRuns', ['collapseBlankLines'], () => 'removed extra blank lines'],
]

const MAX_LISTED = 5

function countListItems(text) {
  return text.split('\n').filter((line) => isListItem(line)).length
}

/**
 * Plain-English sentences saying what cleaning changed, for the line under
 * the text box. Empty when nothing changed.
 *
 * Only a problem that an enabled operation fixes is reported, so a switch
 * that happens to hide a problem (one line hiding bullets, say) never claims
 * credit for fixing it.
 */
export function describeChanges(raw, cleaned, options = {}) {
  if (!raw) return []
  const before = repair.normaliseNewlines(raw)
  const on = new Set(enabledOps(options))
  const counts = (text) => new Map(scanText(text).map((issue) => [issue.id, issue.count]))
  const was = counts(before)
  const now = counts(cleaned)
  const reduced = (id) => (was.get(id) ?? 0) - (now.get(id) ?? 0)
  const enabled = (ops) => ops.some((op) => on.has(op))

  const fixed = []
  for (const [id, ops, phrase] of CHARACTER_FIXES) {
    const n = reduced(id)
    if (n > 0 && enabled(ops)) fixed.push(phrase(n))
  }

  const actions = []
  for (const [id, ops, phrase] of STRUCTURE_FIXES) {
    const n = reduced(id)
    if (n > 0 && enabled(ops)) actions.push(phrase(n))
  }
  if (on.has('removeListMarkers') && countListItems(before) > countListItems(cleaned)) {
    actions.push('removed bullets and numbering')
  }
  if (options.oneLine && before.trim().includes('\n')) {
    actions.push('put everything on one line')
  }

  const sentences = []
  if (fixed.length) {
    const shown = fixed.length > MAX_LISTED
      ? [...fixed.slice(0, MAX_LISTED - 1), plural(fixed.length - MAX_LISTED + 1, 'other fix', 'other fixes')]
      : fixed
    sentences.push('Fixed ' + joinList(shown) + '.')
  }
  if (actions.length) {
    const sentence = joinList(actions)
    sentences.push(sentence[0].toUpperCase() + sentence.slice(1) + '.')
  }
  return sentences
}

/**
 * One-click suggestions for things the app spotted but will not do on its
 * own, because they change the shape of the text.
 */
export function findSuggestions(raw, options = {}) {
  if (!raw || !raw.trim()) return []
  const text = repair.normaliseNewlines(raw)
  const found = new Set(scanText(text).map((issue) => issue.id))
  const out = []

  if (!options.joinLines && !options.oneLine) {
    let reason = null
    if (found.has('hardWrap') || found.has('hyphenBreaks')) {
      reason = 'Some lines break in the middle of a sentence, as they do when copied from a PDF or an email.'
    } else if (found.has('pageNumbers') || found.has('runningHeads')) {
      reason = 'This looks like it has page numbers or repeated headers from a PDF.'
    } else if (found.has('emailQuoting')) {
      reason = 'This has email reply markers (>) at the start of lines.'
    }
    if (reason) out.push({ id: 'joinLines', text: reason, button: 'Join broken lines', option: 'joinLines' })
  }

  if (!options.stripHtml && looksLikeHtml(text)) {
    out.push({ id: 'stripHtml', text: 'This contains HTML tags.', button: 'Strip HTML', option: 'stripHtml' })
  }

  return out
}
