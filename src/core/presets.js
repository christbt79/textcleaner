/**
 * Presets: named starting points for the common paste sources.
 *
 * A preset is just a set of enabled operation ids plus parameter overrides, so
 * picking one and then adjusting a single toggle always works.
 */

const REPAIR_CORE = [
  'fixMojibake', 'fixCp1252', 'normaliseUnicode', 'removeInvisibles',
  'removeControls', 'normaliseSpaces', 'expandLigatures',
]

const TIDY_CORE = ['collapseSpaces', 'trimLines', 'collapseBlankLines', 'trimDocument']

export const PRESETS = [
  {
    id: 'safePaste',
    label: 'Safe paste',
    hint: 'Repairs every character problem and leaves the structure alone. The one to use when you just want the text to behave.',
    enabled: [
      ...REPAIR_CORE, ...TIDY_CORE,
      'straightenQuotes', 'straightenDashes', 'fixSpaceBeforePunctuation',
    ],
  },
  {
    id: 'fromPdf',
    label: 'From a PDF',
    hint: 'Rejoins hyphenated words, undoes column wrapping, drops page numbers and running heads.',
    enabled: [
      ...REPAIR_CORE, ...TIDY_CORE,
      'straightenQuotes', 'straightenDashes', 'removePageNumbers',
      'removeRepeatedLines', 'unwrapParagraphs', 'fixSpaceBeforePunctuation',
      'fixSpaceAfterPunctuation',
    ],
    params: {
      unwrapParagraphs: { dehyphenate: true },
      removeRepeatedLines: { minOccurrences: 3 },
    },
  },
  {
    id: 'fromWord',
    label: 'From Word or Docs',
    hint: 'Smart quotes, non-breaking spaces, auto-bullets and field codes all flattened.',
    enabled: [
      ...REPAIR_CORE, ...TIDY_CORE,
      'straightenQuotes', 'straightenDashes', 'normaliseListMarkers',
      'fixSpaceBeforePunctuation', 'sentenceSpacing',
    ],
    params: {
      normaliseListMarkers: { marker: '- ' },
      sentenceSpacing: { mode: 'single' },
    },
  },
  {
    id: 'fromEmail',
    label: 'From an email',
    hint: 'Removes reply markers and the hard wrapping that mail clients add.',
    enabled: [
      ...REPAIR_CORE, ...TIDY_CORE,
      'removeEmailQuoting', 'unwrapParagraphs', 'straightenQuotes',
      'straightenDashes', 'cleanUrls', 'fixSpaceBeforePunctuation',
    ],
  },
  {
    id: 'fromWeb',
    label: 'From a web page',
    hint: 'Strips HTML if any came across, flattens entities and cleans tracking out of links.',
    enabled: [
      'htmlToText', ...REPAIR_CORE, ...TIDY_CORE,
      'straightenQuotes', 'straightenDashes', 'cleanUrls',
      'normaliseListMarkers', 'fixSpaceBeforePunctuation',
    ],
    params: { htmlToText: { keepStructure: true, keepLinks: false } },
  },
  {
    id: 'forLayout',
    label: 'Ready for InDesign',
    hint: 'Typographic quotes and dashes, single sentence spacing, nothing invisible left behind.',
    enabled: [
      ...REPAIR_CORE, ...TIDY_CORE,
      'curlQuotes', 'typographicDashes', 'sentenceSpacing',
      'fixSpaceBeforePunctuation', 'removeListMarkers',
    ],
    params: { sentenceSpacing: { mode: 'single' }, collapseBlankLines: { max: 0 } },
  },
  {
    id: 'forCode',
    label: 'Ready for code or CMS',
    hint: 'Pure ASCII, straight quotes, no invisible characters, tabs expanded.',
    enabled: [
      ...REPAIR_CORE, ...TIDY_CORE,
      'straightenQuotes', 'straightenDashes', 'asciiSymbols',
      'transliterate', 'removeEmoji', 'asciiOnly', 'tabsToSpaces',
    ],
    params: { tabsToSpaces: { width: 2 } },
  },
  {
    id: 'oneLine',
    label: 'Collapse to one line',
    hint: 'Everything on a single line, for a spreadsheet cell or a form field.',
    enabled: [...REPAIR_CORE, 'straightenQuotes', 'straightenDashes', 'collapseSpaces', 'removeAllLineBreaks', 'trimDocument'],
    params: { removeAllLineBreaks: { separator: ' ' } },
  },
  {
    id: 'plainList',
    label: 'Clean list',
    hint: 'One item per line, markers and numbering removed, duplicates and blanks gone.',
    enabled: [
      ...REPAIR_CORE, 'straightenQuotes', 'removeListMarkers', 'removeLineNumbers',
      'collapseSpaces', 'trimLines', 'removeEmptyLines', 'deduplicateLines', 'trimDocument',
    ],
  },
  {
    id: 'minimal',
    label: 'Minimal',
    hint: 'Invisible characters and trailing whitespace only. Everything else is left exactly as it was.',
    enabled: ['removeInvisibles', 'removeControls', 'normaliseSpaces', 'trimLines'],
    params: { trimLines: { start: false, end: true } },
  },
]

export const PRESETS_BY_ID = new Map(PRESETS.map((preset) => [preset.id, preset]))

export const DEFAULT_PRESET = 'safePaste'

/** True when the live selection still matches the preset it came from. */
export function matchesPreset(preset, enabled) {
  if (!preset) return false
  const a = [...new Set(preset.enabled)].sort()
  const b = [...new Set(enabled)].sort()
  return a.length === b.length && a.every((id, i) => id === b[i])
}
