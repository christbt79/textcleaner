import test from 'node:test'
import assert from 'node:assert/strict'

import * as repair from '../src/core/ops/repair.js'
import * as lines from '../src/core/ops/lines.js'
import * as markup from '../src/core/ops/markup.js'
import * as casing from '../src/core/ops/casing.js'
import * as space from '../src/core/ops/whitespace.js'
import * as transform from '../src/core/ops/transform.js'
import { runPipeline, OPERATIONS, defaultParams, conflictsWith } from '../src/core/pipeline.js'
import { PRESETS, PRESETS_BY_ID } from '../src/core/presets.js'
import { scanText, inspectCharacters } from '../src/core/scan.js'
import { computeStats } from '../src/core/stats.js'
import {
  u, NBSP, NNBSP, THIN_SPACE, IDEOGRAPHIC_SPACE, SOFT_HYPHEN, ZWSP, LRM, BOM,
  LINE_SEPARATOR, LSQUO, RSQUO, LDQUO, RDQUO, EN_DASH, EM_DASH, BULLET,
  BLACK_CIRCLE, FI, FL, E_ACUTE, I_DIAERESIS, O_SLASH, SHARP_S,
  MOJIBAKE_RSQUO, MOJIBAKE_LDQUO, MOJIBAKE_RDQUO,
  CP1252_RSQUO, CP1252_LDQUO, CP1252_RDQUO,
} from './helpers.js'

// --- Character repair -----------------------------------------------------

test('newlines normalise to line feeds', () => {
  assert.equal(repair.normaliseNewlines('a\r\nb\rc' + LINE_SEPARATOR + 'd'), 'a\nb\nc\nd')
})

test('invisible characters are removed but real text survives', () => {
  assert.equal(
    repair.removeInvisibles('in' + ZWSP + 'vis' + SOFT_HYPHEN + 'ible' + BOM + ' text' + LRM),
    'invisible text',
  )
})

test('tag characters used for watermarking are removed', () => {
  assert.equal(repair.removeInvisibles('hello' + u(0xe0041, 0xe0042) + 'world'), 'helloworld')
})

test('non-breaking and exotic spaces become plain spaces', () => {
  assert.equal(
    repair.normaliseSpaces(['a', 'b', 'c', 'd', 'e'].join('|')
      .replace(/\|/g, () => [NBSP, THIN_SPACE, NNBSP, IDEOGRAPHIC_SPACE].shift() ?? ' ')),
    'a b c d e',
  )
})

test('each exotic space is handled individually', () => {
  for (const sp of [NBSP, NNBSP, THIN_SPACE, IDEOGRAPHIC_SPACE, u(0x2003), u(0x205f)]) {
    assert.equal(repair.normaliseSpaces('a' + sp + 'b'), 'a b')
  }
})

test('ligatures expand so search works again', () => {
  assert.equal(repair.expandLigatures(FI + 'nd the ' + FL + 'ag'), 'find the flag')
})

test('curly quotes straighten', () => {
  assert.equal(
    repair.straightenQuotes(LDQUO + 'It' + RSQUO + 's here,' + RDQUO + ' he said'),
    '"It\'s here," he said',
  )
})

test('unspaced em dashes gain spaces when flattened', () => {
  assert.equal(repair.straightenDashes('one' + EM_DASH + 'two'), 'one - two')
  assert.equal(repair.straightenDashes('2010' + EN_DASH + '2012'), '2010-2012')
})

test('quotes can be curled back for layout work', () => {
  assert.equal(
    repair.curlQuotes('"It\'s here," he said'),
    LDQUO + 'It' + RSQUO + 's here,' + RDQUO + ' he said',
  )
})

test('mojibake is repaired by a byte-level re-decode', () => {
  const broken = 'It' + MOJIBAKE_RSQUO + 's a ' + MOJIBAKE_LDQUO + 'test' + MOJIBAKE_RDQUO
  assert.equal(repair.fixMojibake(broken), 'It' + RSQUO + 's a ' + LDQUO + 'test' + RDQUO)
})

test('mojibake is repaired by the table when the text is mixed', () => {
  const broken = 'caf' + E_ACUTE + ' ' + EM_DASH + ' It' + MOJIBAKE_RSQUO + 's fine'
  assert.equal(repair.fixMojibake(broken), 'caf' + E_ACUTE + ' ' + EM_DASH + ' It' + RSQUO + 's fine')
})

test('clean text is never touched by the mojibake repair', () => {
  const clean = 'Perfectly normal text with caf' + E_ACUTE + ' and ' + LDQUO + 'quotes' + RDQUO + '.'
  assert.equal(repair.fixMojibake(clean), clean)
})

test('raw Windows-1252 bytes become real punctuation', () => {
  assert.equal(
    repair.fixCp1252Controls('It' + CP1252_RSQUO + 's ' + CP1252_LDQUO + 'quoted' + CP1252_RDQUO),
    'It' + RSQUO + 's ' + LDQUO + 'quoted' + RDQUO,
  )
})

test('accents transliterate to ASCII', () => {
  assert.equal(
    repair.transliterate('na' + I_DIAERESIS + 've caf' + E_ACUTE + ' stra' + SHARP_S + 'e ' + O_SLASH + 'resund'),
    'naive cafe strasse Oresund',
  )
})

test('the ASCII hammer leaves only printable ASCII', () => {
  const messy = 'caf' + E_ACUTE + ' ' + EM_DASH + ' ' + ZWSP + 'x' + u(0x1f600)
  assert.match(repair.asciiOnly(messy), /^[\n\t -~]*$/)
})

// --- Lines and paragraphs -------------------------------------------------

test('hard-wrapped paragraphs unwrap but paragraph breaks survive', () => {
  const input = [
    'The quick brown fox jumps over the lazy dog and keeps on',
    'running until it reaches the end of the long winding road.',
    '',
    'A second paragraph begins here and also wraps across more',
    'than one line of text in the original document.',
  ].join('\n')

  const paragraphs = lines.unwrapParagraphs(input).split('\n\n')
  assert.equal(paragraphs.length, 2)
  assert.ok(paragraphs[0].includes('dog and keeps on running until'))
  assert.ok(paragraphs[1].includes('wraps across more than one line'))
})

test('hyphenated words split by a PDF are rejoined', () => {
  assert.equal(
    lines.unwrapParagraphs('This is a demonstra-\ntion of hyphen handling in a document.'),
    'This is a demonstration of hyphen handling in a document.',
  )
})

test('a soft hyphen at a line break is rejoined too', () => {
  assert.equal(lines.dehyphenate('demonstra' + SOFT_HYPHEN + '\ntion'), 'demonstration')
})

test('list items keep their own lines when unwrapping', () => {
  const input = [
    'Here are the things you need to bring with you on the day:',
    '- a pen that works',
    '- some paper',
    '- a sense of humour',
  ].join('\n')
  assert.equal(lines.unwrapParagraphs(input).split('\n').length, 4)
})

test('a single short line is left alone', () => {
  assert.equal(lines.unwrapParagraphs('Just one line.'), 'Just one line.')
})

test('email quote markers are stripped', () => {
  assert.equal(lines.removeEmailQuoting('> > quoted\n> also\nnormal'), 'quoted\nalso\nnormal')
})

test('quoted lines can be dropped entirely', () => {
  assert.equal(lines.removeEmailQuoting('> quoted\nmine', { dropQuotedText: true }), 'mine')
})

test('list markers are removed and normalised', () => {
  assert.equal(lines.removeListMarkers(BULLET + ' one\n2. two\n- three'), 'one\ntwo\nthree')
  assert.equal(lines.normaliseListMarkers(BULLET + ' one\n' + BLACK_CIRCLE + ' two'), '- one\n- two')
})

test('page numbers and running heads are removed', () => {
  const doc = [
    'Chapter One', 'body text here', '12', 'Chapter One', 'more body',
    'Chapter One', 'Page 3 of 40',
  ].join('\n')
  const withoutPages = lines.removePageNumbers(doc)
  assert.ok(!withoutPages.split('\n').includes('12'))
  assert.ok(!withoutPages.includes('Page 3 of 40'))

  const withoutHeads = lines.removeRepeatedLines(withoutPages, { minOccurrences: 3 })
  assert.ok(!withoutHeads.includes('Chapter One'))
  assert.ok(withoutHeads.includes('body text here'))
})

test('duplicate lines are removed, keeping the first', () => {
  assert.equal(lines.deduplicateLines('a\nb\na\nc\nB', { caseSensitive: false }), 'a\nb\nc')
})

test('lines sort naturally, so item 10 follows item 9', () => {
  assert.equal(lines.sortLines('item 10\nitem 9\nitem 1'), 'item 1\nitem 9\nitem 10')
})

test('wrapping respects a column width and word boundaries', () => {
  const out = lines.wrapLines('aaaaa bbbbb ccccc', { width: 12 })
  assert.deepEqual(out.split('\n'), ['aaaaa bbbbb', 'ccccc'])
})

test('wrapping can break a word that is longer than the column', () => {
  const out = lines.wrapLines('x'.repeat(25), { width: 10, breakLongWords: true })
  assert.ok(out.split('\n').every((line) => line.length <= 10))
})

test('lines join and split round-trip', () => {
  const joined = lines.joinLines('one\ntwo\nthree', { separator: ', ' })
  assert.equal(joined, 'one, two, three')
  assert.equal(lines.splitToLines(joined, { separator: ', ' }), 'one\ntwo\nthree')
})

test('lines can be filtered in or out', () => {
  assert.equal(lines.filterLines('keep me\ndrop\nkeep too', { pattern: 'keep' }), 'keep me\nkeep too')
  assert.equal(lines.filterLines('keep me\ndrop', { pattern: 'drop', mode: 'drop' }), 'keep me')
})

test('an invalid filter regex leaves the text untouched', () => {
  assert.equal(lines.filterLines('a\nb', { pattern: '([', regex: true }), 'a\nb')
})

// --- Markup ---------------------------------------------------------------

test('HTML becomes plain text with block structure kept', () => {
  const html = '<h1>Title</h1><p>First <strong>para</strong>.</p><ul><li>one</li><li>two</li></ul>'
  assert.equal(markup.htmlToText(html), 'Title\n\nFirst para.\n\n- one\n- two')
})

test('Word conditional comments and office tags are removed', () => {
  const html = '<!--[if gte mso 9]><xml><o:OfficeDocumentSettings/></xml><![endif]-->' +
    '<p class=MsoNormal>Real <o:p></o:p>text</p>'
  assert.equal(markup.htmlToText(html), 'Real text')
})

test('script and style content never leaks into the output', () => {
  const html = '<style>p{color:red}</style><script>alert(1)</script><p>Visible</p>'
  assert.equal(markup.htmlToText(html), 'Visible')
})

test('link URLs can be kept alongside the label', () => {
  assert.equal(
    markup.htmlToText('<p>See <a href="https://example.com/x">the docs</a>.</p>', { keepLinks: true }),
    'See the docs (https://example.com/x).',
  )
})

test('entities decode, including numeric and hex forms', () => {
  assert.equal(
    markup.decodeEntities('Tom &amp; Jerry &#8217;s &#x201C;show&#x201D;&nbsp;end'),
    'Tom & Jerry ' + RSQUO + 's ' + LDQUO + 'show' + RDQUO + NBSP + 'end',
  )
})

test('a numeric entity in the Windows-1252 range decodes to its punctuation', () => {
  assert.equal(markup.decodeEntities('It&#146;s'), 'It' + RSQUO + 's')
})

test('unknown entities are left alone rather than mangled', () => {
  assert.equal(markup.decodeEntities('&notarealentity; &amp;'), '&notarealentity; &')
})

test('Markdown is stripped back to prose', () => {
  const md = '# Heading\n\nSome **bold** and _italic_ and [a link](https://x.com).\n\n- item one\n- item two'
  const out = markup.stripMarkdown(md)
  assert.ok(out.includes('Heading'))
  assert.ok(out.includes('Some bold and italic and a link.'))
  assert.ok(!out.includes('**'))
  assert.ok(!out.includes(']('))
})

test('HTML converts to Markdown', () => {
  const out = markup.htmlToMarkdown('<h2>Title</h2><p>Hello <b>world</b> <a href="https://x.com">link</a></p>')
  assert.ok(out.includes('## Title'))
  assert.ok(out.includes('**world**'))
  assert.ok(out.includes('[link](https://x.com)'))
})

test('HTML detection does not fire on prose about angle brackets', () => {
  assert.equal(markup.looksLikeHtml('Use a < b and b > c in maths'), false)
  assert.equal(markup.looksLikeHtml('<p>hello</p>'), true)
})

// --- Case -----------------------------------------------------------------

test('title case keeps small words lowercase in the middle', () => {
  assert.equal(
    casing.toTitleCase('the tale of a lost dog in the park'),
    'The Tale of a Lost Dog in the Park',
  )
})

test('title case preserves acronyms and brand capitalisation', () => {
  assert.equal(casing.toTitleCase('the iPhone and NASA report'), 'The iPhone and NASA Report')
})

test('title case capitalises the first word after a colon', () => {
  assert.equal(casing.toTitleCase('a study: the way of the dog'), 'A Study: The Way of the Dog')
})

test('sentence case restarts after full stops', () => {
  assert.equal(
    casing.toSentenceCase('HELLO THERE. HOW ARE YOU?', { preserveAcronyms: false }),
    'Hello there. How are you?',
  )
})

test('programmer cases convert', () => {
  assert.equal(casing.toCamelCase('hello wonderful world'), 'helloWonderfulWorld')
  assert.equal(casing.toSnakeCase('Hello Wonderful World'), 'hello_wonderful_world')
  assert.equal(casing.toKebabCase('helloWonderfulWorld'), 'hello-wonderful-world')
  assert.equal(casing.toConstantCase('hello world'), 'HELLO_WORLD')
  assert.equal(casing.toSlug('Caf' + E_ACUTE + ' R' + E_ACUTE + 'sum' + E_ACUTE + ': 2024 Edition!'),
    'cafe-resume-2024-edition')
})

// --- Whitespace -----------------------------------------------------------

test('repeated spaces collapse without touching newlines', () => {
  assert.equal(space.collapseSpaces('a   b\n\nc    d'), 'a b\n\nc d')
})

test('space before punctuation is removed', () => {
  assert.equal(space.fixSpaceBeforePunctuation('Hello , world . Yes ?'), 'Hello, world. Yes?')
})

test('a space before a spelled-out ellipsis is left alone', () => {
  assert.equal(
    space.fixSpaceBeforePunctuation('the work went on ... and on .'),
    'the work went on ... and on.',
  )
})

test('missing space after a full stop is added', () => {
  assert.equal(space.fixSpaceAfterPunctuation('One.Two.Three'), 'One. Two. Three')
})

test('decimals survive the space-after fix', () => {
  assert.equal(space.fixSpaceAfterPunctuation('It cost 3.5m in 2024'), 'It cost 3.5m in 2024')
})

test('double sentence spacing collapses to single', () => {
  assert.equal(space.singleSpaceAfterSentence('One.  Two.   Three.'), 'One. Two. Three.')
})

// --- Find, replace and convert --------------------------------------------

test('find and replace handles plain text and regex with groups', () => {
  assert.equal(transform.findReplace('cat hat', { find: 'at', replace: 'og' }), 'cog hog')
  assert.equal(
    transform.findReplace('2024-01-02', {
      find: '(\\d{4})-(\\d{2})-(\\d{2})', replace: '$3/$2/$1', regex: true,
    }),
    '02/01/2024',
  )
})

test('an invalid regex leaves the text untouched instead of throwing', () => {
  assert.equal(transform.findReplace('text', { find: '([unclosed', replace: 'x', regex: true }), 'text')
})

test('whole word matching does not match inside words', () => {
  assert.equal(
    transform.findReplace('cat category', { find: 'cat', replace: 'dog', wholeWord: true }),
    'dog category',
  )
})

test('match counting is accurate and terminates on empty matches', () => {
  assert.equal(transform.countMatches('a a a', { find: 'a' }), 3)
  assert.ok(transform.countMatches('aaa', { find: 'x*', regex: true }) >= 0)
})

test('tracking parameters are stripped but real ones survive', () => {
  assert.equal(
    transform.cleanUrls('See https://example.com/p?id=7&utm_source=news&fbclid=abc#top'),
    'See https://example.com/p?id=7#top',
  )
  assert.equal(transform.cleanUrls('https://example.com/p?utm_source=x'), 'https://example.com/p')
})

test('extraction pulls unique matches one per line', () => {
  assert.equal(
    transform.extract('mail a@b.com and a@b.com or c@d.org', { pattern: 'emails' }),
    'a@b.com\nc@d.org',
  )
})

test('base64 round-trips through unicode', () => {
  const original = 'caf' + E_ACUTE + ' ' + EM_DASH + ' ' + LDQUO + 'hello' + RDQUO
  assert.equal(transform.base64Decode(transform.base64Encode(original)), original)
})

// --- Pipeline -------------------------------------------------------------

test('every operation has a unique id, a group and a run function', () => {
  const ids = new Set()
  for (const op of OPERATIONS) {
    assert.ok(!ids.has(op.id), 'duplicate operation id: ' + op.id)
    ids.add(op.id)
    assert.equal(typeof op.run, 'function', op.id + ' needs a run function')
    assert.ok(op.group, op.id + ' needs a group')
    assert.ok(op.label, op.id + ' needs a label')
  }
})

test('every operation survives empty input, whitespace and awkward text', () => {
  const samples = ['', '\n\n', '   ', 'a', NBSP + ZWSP, '<p>x</p>', '2024-01-02', 'a\nb\nc', '- one']
  for (const op of OPERATIONS) {
    for (const sample of samples) {
      const result = op.run(sample, defaultParams(op))
      assert.equal(typeof result, 'string',
        op.id + ' returned a non-string for ' + JSON.stringify(sample))
    }
  }
})

test('the pipeline runs operations in registry order regardless of toggle order', () => {
  const html = '<p>Hello&nbsp;&amp; welcome</p>'
  const a = runPipeline(html, { enabled: ['collapseSpaces', 'htmlToText', 'normaliseSpaces'] })
  const b = runPipeline(html, { enabled: ['normaliseSpaces', 'collapseSpaces', 'htmlToText'] })
  assert.equal(a.text, b.text)
  assert.equal(a.text, 'Hello & welcome')
})

test('the pipeline reports an operation failure instead of losing the text', () => {
  const broken = {
    id: 'boom', label: 'Boom', group: 'repair', run: () => { throw new Error('nope') },
  }
  OPERATIONS.push(broken)
  try {
    const result = runPipeline('keep me', { enabled: ['boom'] })
    assert.equal(result.text, 'keep me')
    assert.equal(result.errors.length, 1)
    assert.equal(result.errors[0].id, 'boom')
  } finally {
    OPERATIONS.pop()
  }
})

test('mutually exclusive operations are reported as conflicts', () => {
  assert.ok(conflictsWith('straightenQuotes').includes('curlQuotes'))
  assert.ok(conflictsWith('unwrapParagraphs').includes('removeAllLineBreaks'))
  assert.deepEqual(conflictsWith('collapseSpaces'), [])
})

// --- Presets --------------------------------------------------------------

test('every preset names only real operations', () => {
  const ids = new Set(OPERATIONS.map((op) => op.id))
  for (const preset of PRESETS) {
    for (const id of preset.enabled) {
      assert.ok(ids.has(id), preset.id + ' refers to unknown operation ' + id)
    }
    for (const id of Object.keys(preset.params ?? {})) {
      assert.ok(ids.has(id), preset.id + ' sets params for unknown operation ' + id)
    }
  }
})

test('the safe paste preset makes a messy paste safe to re-paste', () => {
  const messy = 'The' + NBSP + 'quick ' + LDQUO + 'brown' + RDQUO + ' fox ' + EM_DASH +
    ' it' + RSQUO + 's ' + FI + 'ne' + ZWSP + '.  \nTrailing   \n\n\n\nNext'
  const preset = PRESETS_BY_ID.get('safePaste')
  const { text, errors } = runPipeline(messy, { enabled: preset.enabled, params: preset.params })

  assert.deepEqual(errors, [])
  assert.match(text, /^[\n\t -~]*$/, 'only printable ASCII should remain: ' + JSON.stringify(text))
  assert.ok(text.includes('"brown"'))
  assert.ok(text.includes("it's fine"))
  assert.ok(!/[^\S\n]$/m.test(text), 'no trailing whitespace')
  assert.ok(!text.includes('\n\n\n'))
})

test('the PDF preset reflows a realistic PDF paste', () => {
  const pdfPaste = [
    'Annual Report 2024',
    'The organisation delivered a strong performance across all of its',
    'operating divisions during the year, with revenue growth of eleven',
    'per cent and an improved margin.',
    '',
    '12',
    'Annual Report 2024',
    'Looking ahead, the board expects conditions to remain compet-',
    'itive, but is confident in the strategy.',
    'Annual Report 2024',
  ].join('\n')

  const preset = PRESETS_BY_ID.get('fromPdf')
  const { text } = runPipeline(pdfPaste, { enabled: preset.enabled, params: preset.params })

  assert.ok(!text.includes('Annual Report 2024'), 'running head removed')
  assert.ok(!text.split('\n').includes('12'), 'page number removed')
  assert.ok(text.includes('competitive'), 'hyphenated word rejoined')
  assert.ok(text.includes('all of its operating divisions'), 'wrapped lines rejoined')
})

test('the email preset removes reply markers and rewraps', () => {
  const email = [
    '> On Monday, someone wrote:',
    '> The meeting has been moved to Thursday at two, which should',
    '> suit everyone who asked about the original time.',
  ].join('\n')
  const preset = PRESETS_BY_ID.get('fromEmail')
  const { text } = runPipeline(email, { enabled: preset.enabled, params: preset.params })
  assert.ok(!text.includes('>'))
  assert.ok(text.includes('Thursday at two, which should suit everyone'))
})

test('the one-line preset collapses everything to a single line', () => {
  const preset = PRESETS_BY_ID.get('oneLine')
  const { text } = runPipeline('one\ntwo\n\nthree', { enabled: preset.enabled, params: preset.params })
  assert.equal(text, 'one two three')
})

test('the minimal preset changes nothing except invisible characters', () => {
  const preset = PRESETS_BY_ID.get('minimal')
  const input = 'Keep  the  "spacing"   and the ' + EM_DASH + ' dash.' + ZWSP + '   \nSecond line.'
  const { text } = runPipeline(input, { enabled: preset.enabled, params: preset.params })
  assert.equal(text, 'Keep  the  "spacing"   and the ' + EM_DASH + ' dash.\nSecond line.')
})

test('cleaning is idempotent: running it twice changes nothing more', () => {
  const messy = '<p>Caf' + E_ACUTE + NBSP + ' ' + LDQUO + 'test' + RDQUO + ' ' + EM_DASH +
    ' ' + FI + 'ne</p>\n\n\n> quoted\n- one\n1. two'
  for (const preset of PRESETS) {
    const once = runPipeline(messy, { enabled: preset.enabled, params: preset.params }).text
    const twice = runPipeline(once, { enabled: preset.enabled, params: preset.params }).text
    assert.equal(twice, once, preset.id + ' is not idempotent')
  }
})

test('no preset ever throws on any of a range of awkward inputs', () => {
  const samples = ['', '\n', '   ', BULLET + ' item', '<p>x</p>', '> q', 'a'.repeat(500)]
  for (const preset of PRESETS) {
    for (const sample of samples) {
      const { errors } = runPipeline(sample, { enabled: preset.enabled, params: preset.params })
      assert.deepEqual(errors, [], preset.id + ' failed on ' + JSON.stringify(sample))
    }
  }
})

// --- Scanner --------------------------------------------------------------

test('the scanner finds and counts real problems', () => {
  const messy = 'Caf' + E_ACUTE + NBSP + 'here ' + LDQUO + 'quoted' + RDQUO + ZWSP +
    ' with  spaces and a ' + FI + ' ligature'
  const found = new Map(scanText(messy).map((issue) => [issue.id, issue.count]))

  assert.equal(found.get('nbsp'), 1)
  assert.equal(found.get('invisibles'), 1)
  assert.equal(found.get('smartQuotes'), 2)
  assert.equal(found.get('ligatures'), 1)
  assert.equal(found.get('multiSpace'), 1)
})

test('the scanner stays quiet on text that is already clean', () => {
  assert.deepEqual(scanText('A clean line of plain text.\n\nAnd another one.'), [])
})

test('the scanner detects hard wrapping and hyphen breaks', () => {
  const wrapped = [
    'The organisation delivered a strong performance across all of its',
    'operating divisions during the year, with revenue growth of elev-',
    'en per cent and an improved margin on every product that it sold.',
  ].join('\n')
  const found = new Map(scanText(wrapped).map((i) => [i.id, i.count]))
  assert.ok(found.get('hardWrap') >= 1)
  assert.equal(found.get('hyphenBreaks'), 1)
})

test('the scanner does not call a short document hard-wrapped', () => {
  const prose = 'A short note.\n\nAnother short note.\n\nAnd a third.'
  assert.equal(scanText(prose).find((i) => i.id === 'hardWrap'), undefined)
})

test('the scanner sorts the worst problems first', () => {
  const messy = '<p>x</p>' + NBSP + '  ' + LDQUO + 'q' + RDQUO
  const found = scanText(messy)
  assert.equal(found[0].severity, 'high')
})

test('every scan check names operations that exist', () => {
  const ids = new Set(OPERATIONS.map((op) => op.id))
  const messy = 'a' + NBSP + ZWSP + RSQUO + EM_DASH + FI + '<p>x</p>&amp;\r\n>  q\n\t\n\n\n' +
    'https://x.com?utm_source=a\n1\n'
  for (const issue of scanText(messy)) {
    for (const opId of issue.ops) {
      assert.ok(ids.has(opId), issue.id + ' names unknown operation ' + opId)
    }
  }
})

test('every problem the scanner reports is actually fixed by the ops it names', () => {
  const messy = 'Caf' + E_ACUTE + NBSP + LDQUO + 'q' + RDQUO + ZWSP + FI + '  x' + EM_DASH + 'y\t\n\n\n' +
    BULLET + ' item\n> quoted\nhttps://x.com/a?utm_source=n\n'
  for (const issue of scanText(messy)) {
    if (!issue.ops.length) continue
    const { text } = runPipeline(messy, { enabled: issue.ops })
    const remaining = scanText(text).find((i) => i.id === issue.id)
    assert.ok(
      !remaining || remaining.count < issue.count,
      issue.id + ' was not reduced by ' + issue.ops.join(', '),
    )
  }
})

test('the character inspector names what it finds', () => {
  const byLabel = new Map(inspectCharacters('a' + NBSP + 'b' + ZWSP + 'c').map((e) => [e.label, e]))
  assert.equal(byLabel.get('U+00A0').name, 'no-break space')
  assert.equal(byLabel.get('U+200B').name, 'zero-width space')
  assert.equal(byLabel.get('U+200B').printable, false)
})

test('the character inspector ignores ordinary ASCII', () => {
  assert.deepEqual(inspectCharacters('plain ascii\ttext\n'), [])
})

// --- Statistics -----------------------------------------------------------

test('statistics count what people expect', () => {
  const stats = computeStats('Hello world.\n\nSecond paragraph here.')
  assert.equal(stats.words, 5)
  assert.equal(stats.paragraphs, 2)
  assert.equal(stats.lines, 3)
  assert.equal(stats.sentences, 2)
})

test('statistics handle empty input', () => {
  assert.equal(computeStats('').words, 0)
  assert.equal(computeStats('').characters, 0)
})

test('astral characters count as one character, not two', () => {
  assert.equal(computeStats(u(0x1f600)).characters, 1)
})

// --- Source hygiene -------------------------------------------------------

test('no source file contains a literal non-ASCII character', async () => {
  const { readdir, readFile } = await import('node:fs/promises')
  const { join } = await import('node:path')

  const SKIP = new Set(['node_modules', '.git', 'assets'])

  async function walk(dir) {
    const out = []
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (SKIP.has(entry.name)) continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) out.push(...(await walk(path)))
      else if (/\.(js|html|css|json|webmanifest|toml|ya?ml)$/.test(entry.name)) out.push(path)
    }
    return out
  }

  // The whole repository, not only `src`: the deployed page and its stylesheet
  // have to survive the same journeys as the text this tool cleans.
  for (const path of await walk('.')) {
    const content = await readFile(path, 'utf8')
    const offenders = [...content].filter((c) => {
      const cp = c.codePointAt(0)
      return !(cp === 0x0a || cp === 0x09 || (cp >= 0x20 && cp <= 0x7e))
    })
    assert.equal(
      offenders.length, 0,
      path + ' contains ' + offenders.length + ' non-ASCII characters, first is ' +
        (offenders.length ? 'U+' + offenders[0].codePointAt(0).toString(16).toUpperCase() : ''),
    )
  }
})
