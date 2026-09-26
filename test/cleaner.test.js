import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ALWAYS, SWITCHES, DEFAULT_OPTIONS, TOOLS, enabledOps, cleanText, applySteps,
  describeChanges, findSuggestions, joinList,
} from '../src/core/cleaner.js'
import { OPERATIONS_BY_ID, runPipeline } from '../src/core/pipeline.js'
import {
  u, NBSP, ZWSP, LDQUO, RDQUO, RSQUO, EM_DASH, BULLET, FI, E_ACUTE,
  MOJIBAKE_RSQUO,
} from './helpers.js'

const PDF_PASTE = [
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

const EMAIL_PASTE = [
  '> On Monday, someone wrote:',
  '> The meeting has been moved to Thursday at two, which should',
  '> suit everyone who asked about the original time.',
].join('\n')

/** Every combination of the switches, plus the hidden HTML option. */
function allOptionCombinations() {
  const keys = [...SWITCHES.map((s) => s.id), 'stripHtml']
  const out = []
  for (let mask = 0; mask < 1 << keys.length; mask += 1) {
    const options = { ...DEFAULT_OPTIONS }
    keys.forEach((key, i) => { options[key] = Boolean(mask & (1 << i)) })
    out.push(options)
  }
  return out
}

// --- Options --------------------------------------------------------------

test('every switch and the always-on set name real pipeline operations', () => {
  for (const id of ALWAYS) assert.ok(OPERATIONS_BY_ID.has(id), 'unknown operation ' + id)
  for (const options of allOptionCombinations()) {
    for (const id of enabledOps(options)) {
      assert.ok(OPERATIONS_BY_ID.has(id), 'unknown operation ' + id)
    }
  }
})

test('there are exactly five visible switches, all off by default', () => {
  assert.deepEqual(SWITCHES.map((s) => s.id), ['joinLines', 'removeBullets', 'keepQuotes', 'oneLine', 'removeEmojis'])
  for (const option of SWITCHES) {
    assert.equal(DEFAULT_OPTIONS[option.id], false, option.id + ' should default to off')
    assert.ok(option.label && option.hint, option.id + ' needs a label and a hint')
  }
})

// --- Cleaning -------------------------------------------------------------

test('by default a messy paste comes out safe to paste anywhere', () => {
  const messy = 'The' + NBSP + 'quick ' + LDQUO + 'brown' + RDQUO + ' fox ' + EM_DASH +
    ' it' + RSQUO + 's ' + FI + 'ne' + ZWSP + '.  \nTrailing   \n\n\n\nNext'
  const text = cleanText(messy)

  assert.match(text, /^[\n\t -~]*$/, 'only printable ASCII should remain: ' + JSON.stringify(text))
  assert.ok(text.includes('"brown"'))
  assert.ok(text.includes("it's fine"))
  assert.ok(!/[^\S\n]$/m.test(text), 'no trailing whitespace')
  assert.ok(!text.includes('\n\n\n'), 'blank lines collapsed')
})

test('by default the shape of the text is left alone', () => {
  assert.equal(cleanText('line one\nline two\n\n' + BULLET + ' a bullet'), 'line one\nline two\n\n' + BULLET + ' a bullet')
})

test('keep curly quotes leaves typography alone but still fixes the rest', () => {
  const input = LDQUO + 'hi' + RDQUO + NBSP + EM_DASH + ' there'
  assert.equal(cleanText(input, { keepQuotes: true }), LDQUO + 'hi' + RDQUO + ' ' + EM_DASH + ' there')
})

test('join broken lines reflows a PDF paste and removes its furniture', () => {
  const text = cleanText(PDF_PASTE, { joinLines: true })
  assert.ok(!text.includes('Annual Report 2024'), 'running head removed')
  assert.ok(!text.split('\n').includes('12'), 'page number removed')
  assert.ok(text.includes('competitive'), 'hyphenated word rejoined')
  assert.ok(text.includes('all of its operating divisions'), 'wrapped lines rejoined')
})

test('join broken lines removes reply markers and rewraps an email', () => {
  const text = cleanText(EMAIL_PASTE, { joinLines: true })
  assert.ok(!text.includes('>'))
  assert.ok(text.includes('Thursday at two, which should suit everyone'))
})

test('remove bullets strips bullets and numbering', () => {
  assert.equal(cleanText(BULLET + ' one\n2. two\n- three', { removeBullets: true }), 'one\ntwo\nthree')
})

test('one line joins everything, rejoining hyphenated words on the way', () => {
  assert.equal(cleanText('one\ntwo\n\nthree', { oneLine: true }), 'one two three')
  assert.equal(cleanText('a demonstra-\ntion of it', { oneLine: true }), 'a demonstration of it')
})

test('strip HTML takes tags out before characters are repaired', () => {
  assert.equal(cleanText('<p>Hello&nbsp;<b>there</b></p>', { stripHtml: true }), 'Hello there')
})

test('cleaning twice changes nothing more, whatever the switches', () => {
  const messy = '<p>Caf' + E_ACUTE + NBSP + ' ' + LDQUO + 'test' + RDQUO + ' ' + EM_DASH + ' ' + FI +
    'ne</p>\n\n\n> quoted line that goes on for a while and then\n> carries on here\n' +
    BULLET + ' one\n1. two\n' + PDF_PASTE
  for (const options of allOptionCombinations()) {
    const once = cleanText(messy, options)
    assert.equal(cleanText(once, options), once, 'not idempotent with ' + JSON.stringify(options))
  }
})

test('no combination of switches makes an operation fail', () => {
  const samples = ['', '\n', '   ', BULLET + ' item', '<p>x</p>', '> q', 'a'.repeat(500), PDF_PASTE]
  for (const options of allOptionCombinations()) {
    for (const sample of samples) {
      const { errors } = runPipeline(sample, { enabled: enabledOps(options) })
      assert.deepEqual(errors, [], JSON.stringify(options) + ' failed on ' + JSON.stringify(sample))
    }
  }
})

// --- Describing changes ---------------------------------------------------

test('the summary says what was fixed in plain English', () => {
  const raw = 'Say' + NBSP + LDQUO + 'hi' + RDQUO + '.'
  assert.deepEqual(describeChanges(raw, cleanText(raw)), ['Fixed 1 non-breaking space and 2 curly quotes.'])
})

test('the summary is empty when nothing needed fixing', () => {
  const raw = 'Already clean text.\n\nWith two paragraphs.'
  assert.deepEqual(describeChanges(raw, cleanText(raw)), [])
})

test('Windows line endings are not reported as trailing spaces', () => {
  const raw = 'one\r\ntwo\r\nthree'
  assert.deepEqual(describeChanges(raw, cleanText(raw)), [])
})

test('the summary does not claim fixes a switch told it to leave alone', () => {
  const raw = LDQUO + 'hi' + RDQUO + NBSP + 'there'
  const options = { keepQuotes: true }
  assert.deepEqual(describeChanges(raw, cleanText(raw, options), options), ['Fixed 1 non-breaking space.'])
})

test('the summary describes line changes as a second sentence', () => {
  const options = { joinLines: true }
  const sentences = describeChanges(PDF_PASTE, cleanText(PDF_PASTE, options), options)
  assert.equal(sentences.length, 1)
  const [actions] = sentences
  assert.ok(actions.startsWith('Rejoined 1 hyphenated word'), actions)
  assert.ok(actions.includes('joined broken lines'), actions)
  assert.ok(actions.includes('removed page numbers'), actions)
  assert.ok(actions.includes('removed repeated headers'), actions)
})

test('a long list of fixes is cut short', () => {
  const raw = 'It' + MOJIBAKE_RSQUO + 's' + ZWSP + ' a' + NBSP + FI + 'ne ' + LDQUO + 'day' + RDQUO +
    ' ' + EM_DASH + ' really  good .'
  const [sentence] = describeChanges(raw, cleanText(raw))
  assert.match(sentence, /^Fixed .+ and \d+ other fix(es)?\.$/, sentence)
})

test('one line mode says so rather than claiming to remove bullets', () => {
  const raw = BULLET + ' first\n' + BULLET + ' second'
  const options = { oneLine: true }
  const sentences = describeChanges(raw, cleanText(raw, options), options)
  assert.deepEqual(sentences, ['Put everything on one line.'])
})

test('lists read naturally', () => {
  assert.equal(joinList([]), '')
  assert.equal(joinList(['a']), 'a')
  assert.equal(joinList(['a', 'b']), 'a and b')
  assert.equal(joinList(['a', 'b', 'c']), 'a, b and c')
})

// --- Suggestions ----------------------------------------------------------

test('a PDF paste suggests joining broken lines', () => {
  const [suggestion] = findSuggestions(PDF_PASTE)
  assert.equal(suggestion.option, 'joinLines')
})

test('the suggestion goes away once the switch is on', () => {
  assert.deepEqual(findSuggestions(PDF_PASTE, { joinLines: true }), [])
  assert.deepEqual(findSuggestions(PDF_PASTE, { oneLine: true }), [])
})

test('an email with reply markers suggests joining lines', () => {
  assert.equal(findSuggestions('> just one quoted line')[0]?.option, 'joinLines')
})

test('HTML suggests stripping the tags', () => {
  const found = findSuggestions('<p>Hello <strong>there</strong></p>')
  assert.ok(found.some((s) => s.option === 'stripHtml'))
  assert.ok(!findSuggestions('<p>Hello</p>', { stripHtml: true }).some((s) => s.option === 'stripHtml'))
})

test('ordinary prose gets no suggestions', () => {
  assert.deepEqual(findSuggestions('A normal sentence.\n\nAnother normal sentence.'), [])
})

// --- Emoji ----------------------------------------------------------------

const GRIN = u(0x1f600)
const THUMBS_UP_MEDIUM = u(0x1f44d, 0x1f3fd)
const FAMILY = u(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467)
const UK_FLAG = u(0x1f1ec, 0x1f1e7)
const SCOTLAND_FLAG = u(0x1f3f4, 0xe0067, 0xe0062, 0xe0073, 0xe0063, 0xe0074, 0xe007f)
const KEYCAP_ONE = u(0x31, 0xfe0f, 0x20e3)
const RED_HEART = u(0x2764, 0xfe0f)
const WOMAN_RUNNING = u(0x1f3c3, 0x200d, 0x2640, 0xfe0f)
const COPYRIGHT = u(0x00a9)
const TRADEMARK = u(0x2122)
const LEFT_RIGHT_ARROW = u(0x2194)
const CHECK_MARK = u(0x2713)

test('remove emojis takes whole emojis out, pieces and all', () => {
  const options = { removeEmojis: true }
  for (const emoji of [GRIN, THUMBS_UP_MEDIUM, FAMILY, UK_FLAG, SCOTLAND_FLAG, KEYCAP_ONE, RED_HEART, WOMAN_RUNNING]) {
    assert.equal(cleanText('Hello ' + emoji + ' there', options), 'Hello there', [...emoji].map((c) => c.codePointAt(0).toString(16)).join(' '))
  }
})

test('remove emojis tidies the space an emoji leaves behind', () => {
  const options = { removeEmojis: true }
  assert.equal(cleanText(u(0x2705) + ' Done', options), 'Done')
  assert.equal(cleanText('Thanks ' + THUMBS_UP_MEDIUM + '.', options), 'Thanks.')
  assert.equal(cleanText('Launch' + u(0x1f680) + 'day', options), 'Launch day')
  assert.equal(cleanText('Great news! ' + u(0x1f389, 0x1f389) + '\n' + GRIN + '\nNext', options), 'Great news!\n\nNext')
})

test('remove emojis leaves typographic symbols alone', () => {
  const text = 'Copyright ' + COPYRIGHT + ' 2026 Acme' + TRADEMARK + ', A ' + LEFT_RIGHT_ARROW + ' B ' + CHECK_MARK + ', #1 of 10*'
  assert.equal(cleanText(text, { removeEmojis: true, keepQuotes: true }), text)
  // The same symbol written as an emoji goes.
  assert.equal(cleanText('Acme' + COPYRIGHT + u(0xfe0f), { removeEmojis: true }), 'Acme')
})

test('default cleaning keeps emojis intact, joiners and flag tags included', () => {
  for (const emoji of [FAMILY, SCOTLAND_FLAG, WOMAN_RUNNING, THUMBS_UP_MEDIUM, KEYCAP_ONE, RED_HEART]) {
    assert.equal(cleanText('Hi ' + emoji), 'Hi ' + emoji)
  }
  // Joiners and tag characters that are not part of an emoji still go.
  assert.equal(cleanText('a' + u(0x200d) + 'b' + u(0xe0067, 0xe007f) + 'c'), 'abc')
})

test('the summary counts emojis removed, and only when the switch is on', () => {
  const raw = 'Party ' + u(0x1f389) + ' with the ' + FAMILY + ' ' + UK_FLAG
  const options = { removeEmojis: true }
  assert.deepEqual(describeChanges(raw, cleanText(raw, options), options), ['Removed 3 emojis.'])
  assert.deepEqual(describeChanges(raw, cleanText(raw)), [])
})

// --- Tools ----------------------------------------------------------------

test('every tool has a label, a group and something to do', () => {
  const ids = new Set()
  for (const tool of TOOLS) {
    assert.ok(!ids.has(tool.id), 'duplicate tool ' + tool.id)
    ids.add(tool.id)
    assert.ok(tool.label && tool.group && tool.done, tool.id + ' needs a label, a group and a done phrase')
    if (tool.kind === 'step') assert.equal(typeof tool.run(''), 'string', tool.id + ' should return a string')
    if (tool.kind === 'option') assert.ok(tool.option in DEFAULT_OPTIONS, tool.id + ' names an unknown option')
  }
})

test('tools apply in order on top of the cleaned text', () => {
  assert.equal(applySteps('b\na\nb', [{ id: 'dedupe' }, { id: 'sort' }]), 'a\nb')
  assert.equal(applySteps('the tale of a dog', [{ id: 'title' }]), 'The Tale of a Dog')
  assert.equal(applySteps('Shout', [{ id: 'upper' }]), 'SHOUT')
  assert.equal(applySteps('a\n\nb', [{ id: 'removeEmpty' }]), 'a\nb')
})

test('plain ASCII removes accents, emoji and symbols', () => {
  const input = 'caf' + E_ACUTE + ' ' + EM_DASH + ' ok' + u(0x1f600)
  assert.equal(applySteps(input, [{ id: 'ascii' }]), 'cafe - ok')
})

test('find and replace treats the replacement literally unless regex is on', () => {
  assert.equal(applySteps('axb', [{ id: 'replace', params: { find: 'x', replace: '$1' } }]), 'a$1b')
  assert.equal(
    applySteps('2024-01-02', [{ id: 'replace', params: { find: '(\\d+)-(\\d+)-(\\d+)', replace: '$3/$2/$1', regex: true } }]),
    '02/01/2024',
  )
})

test('an unknown step is ignored rather than breaking the text', () => {
  assert.equal(applySteps('keep me', [{ id: 'nope' }, { id: 'stripHtml' }]), 'keep me')
})
