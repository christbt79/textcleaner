/**
 * Application entry point.
 *
 * The page holds three pieces of state: the text as it was pasted, the
 * switches, and the one-off tools applied since. What the box shows is always
 * derived from those three, so turning a switch on or off after pasting
 * simply re-cleans the original paste instead of trying to reverse a clean.
 */

import {
  DEFAULT_OPTIONS, SWITCHES, TOOLS, TOOLS_BY_ID, applySteps, cleanText,
  describeChanges, findSuggestions, joinList,
} from './core/cleaner.js'
import { computeStats, formatCount } from './core/stats.js'
import { buildSearchRegex, countMatches } from './core/ops/transform.js'
import { normaliseNewlines } from './core/ops/repair.js'
import { $, el, replaceChildren, debounce, isCommandKey } from './ui/dom.js'
import { renderMarked } from './ui/reveal.js'
import { SAMPLE_TEXT } from './ui/sample.js'

const OPTIONS_KEY = 'textcleaner.options.v2'
const THEME_KEY = 'textcleaner.theme.v1'
const HISTORY_LIMIT = 50
const MAX_FILE_BYTES = 12 * 1024 * 1024
const MIDDOT = String.fromCodePoint(0x00b7)
const THEMES = ['auto', 'dark', 'light']
const COPY_LABEL = 'Copy clean text'

const dom = {
  box: $('box'),
  text: $('text'),
  original: $('original'),
  emptyState: $('empty-state'),
  report: $('report'),
  summary: $('summary'),
  summaryText: $('summary-text'),
  originalButton: $('original-button'),
  suggestions: $('suggestions'),
  replaceBar: $('replace-bar'),
  findInput: $('find-input'),
  replaceInput: $('replace-input'),
  matchCase: $('match-case'),
  useRegex: $('use-regex'),
  matchCount: $('match-count'),
  switches: $('switches'),
  toolsButton: $('tools-button'),
  toolsPanel: $('tools-panel'),
  undoButton: $('undo-button'),
  clearButton: $('clear-button'),
  copyButton: $('copy-button'),
  counts: $('counts'),
  toast: $('toast'),
  about: $('about'),
}

// --- Preferences ----------------------------------------------------------
// Only the switches and the theme are remembered. The text never is.

function readStorage(key) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Private browsing or blocked storage: the app works, it just forgets.
  }
}

function loadSavedOptions() {
  try {
    const saved = JSON.parse(readStorage(OPTIONS_KEY) ?? '{}')
    const out = {}
    for (const option of SWITCHES) {
      if (typeof saved[option.id] === 'boolean') out[option.id] = saved[option.id]
    }
    return out
  } catch {
    return {}
  }
}

function saveOptions() {
  const out = {}
  for (const option of SWITCHES) out[option.id] = Boolean(state.options[option.id])
  writeStorage(OPTIONS_KEY, JSON.stringify(out))
}

// --- State ----------------------------------------------------------------

const state = {
  raw: '',
  options: { ...DEFAULT_OPTIONS, ...loadSavedOptions() },
  steps: [],
  view: 'clean',
}

const history = []

let copyTimer = 0

/** The cleaned text before any tools, which is what the summary describes. */
let cleaned = ''

/** True once the user has typed in the box since the app last filled it. */
let edited = false

function remember() {
  history.push({
    raw: state.raw,
    steps: state.steps.map((step) => ({ ...step })),
    options: { ...state.options },
  })
  if (history.length > HISTORY_LIMIT) history.shift()
}

// --- Rendering ------------------------------------------------------------

function render() {
  cleaned = cleanText(state.raw, state.options)
  const text = applySteps(cleaned, state.steps)
  edited = false
  if (dom.text.value !== text) dom.text.value = text
  renderView()
  renderReport()
  renderControls()
}

function renderView() {
  const showOriginal = state.view === 'original' && state.raw !== ''
  dom.text.hidden = showOriginal
  dom.original.hidden = !showOriginal
  if (showOriginal) renderMarked(dom.original, state.raw)
  dom.emptyState.hidden = showOriginal || dom.text.value !== ''
}

function stepDone(step) {
  return TOOLS_BY_ID.get(step.id)?.done ?? step.id
}

function renderReport() {
  const hasText = state.raw.trim() !== ''
  const showingOriginal = state.view === 'original'

  let summary = ''
  if (hasText && showingOriginal) {
    summary = 'This is your original paste. Characters that are not plain text are highlighted: hover over one to see what it is.'
  } else if (hasText && !edited) {
    const sentences = describeChanges(state.raw, cleaned, state.options)
    if (state.steps.length) sentences.push('Then ' + joinList(state.steps.map(stepDone)) + '.')
    summary = sentences.length ? sentences.join(' ') : 'Nothing needed fixing. The text was already clean.'
  }
  dom.summaryText.textContent = summary
  dom.summary.hidden = !summary
  dom.summary.classList.toggle('is-note', showingOriginal)

  const changed = normaliseNewlines(state.raw) !== dom.text.value
  dom.originalButton.hidden = !(showingOriginal || (hasText && changed && !edited))
  dom.originalButton.textContent = showingOriginal ? 'Back to clean text' : 'Show original'

  const suggestions = hasText && !showingOriginal ? findSuggestions(state.raw, state.options) : []
  replaceChildren(dom.suggestions, suggestions.map((suggestion) =>
    el('div', { class: 'suggestion' },
      el('span', {}, suggestion.text),
      el('button', {
        type: 'button',
        class: 'tool-button',
        onclick: () => turnOn(suggestion.option, suggestion.button),
      }, suggestion.button))))
  dom.suggestions.hidden = suggestions.length === 0

  dom.report.hidden = dom.summary.hidden && dom.suggestions.hidden
}

function renderControls() {
  for (const option of SWITCHES) {
    const input = $('opt-' + option.id)
    if (input) input.checked = Boolean(state.options[option.id])
  }
  dom.undoButton.disabled = history.length === 0
  dom.clearButton.disabled = dom.text.value === '' && state.raw === ''
  dom.copyButton.disabled = dom.text.value === ''
  renderCounts()
}

function countLabel(n, one) {
  return formatCount(n) + ' ' + (n === 1 ? one : one + 's')
}

function renderCounts() {
  const text = dom.text.value
  if (!text) {
    dom.counts.textContent = ''
    return
  }
  const stats = computeStats(text)
  dom.counts.textContent =
    countLabel(stats.words, 'word') + ' ' + MIDDOT + ' ' + countLabel(stats.characters, 'character')
}

// --- Actions --------------------------------------------------------------

/** Replaces the text with a new paste, cleaned. */
function load(raw, { stripHtml = false, caret = null, message = '' } = {}) {
  remember()
  clearTimeout(copyTimer)
  dom.copyButton.textContent = COPY_LABEL
  state.raw = raw
  state.steps = []
  state.options.stripHtml = stripHtml
  state.view = 'clean'
  render()
  dom.text.focus()
  if (caret === null) {
    dom.text.setSelectionRange(0, 0)
    dom.text.scrollTop = 0
  } else {
    const at = Math.min(caret, dom.text.value.length)
    dom.text.setSelectionRange(at, at)
  }
  if (message) toast(message)
}

function setOption(id, value) {
  if (state.raw) remember()
  state.options[id] = value
  saveOptions()
  render()
}

/** Switches something on from a suggestion or a tool. */
function turnOn(option, label) {
  if (state.options[option]) {
    toast(label + ' is already on')
    return
  }
  remember()
  state.options[option] = true
  if (SWITCHES.some((s) => s.id === option)) saveOptions()
  render()
  toast(label + ': done. Undo takes it back.')
}

function runTool(tool) {
  closeToolsPanel()
  if (tool.kind === 'dialog') {
    openReplaceBar()
    return
  }
  if (!dom.text.value.trim()) {
    toast('Paste some text first')
    return
  }
  if (tool.kind === 'option') {
    turnOn(tool.option, tool.label)
    return
  }

  const before = dom.text.value
  remember()
  state.steps.push({ id: tool.id })
  render()
  if (dom.text.value === before) {
    // Nothing changed, so there is nothing worth undoing either.
    history.pop()
    state.steps.pop()
    render()
    toast('Nothing to change')
  } else {
    toast(tool.label + ' applied')
  }
}

function undo() {
  const previous = history.pop()
  if (!previous) return
  state.raw = previous.raw
  state.steps = previous.steps
  state.options = previous.options
  state.view = 'clean'
  saveOptions()
  render()
  toast('Undone')
}

function clearText() {
  if (!dom.text.value && !state.raw) return
  load('')
}

function toggleOriginal() {
  state.view = state.view === 'original' ? 'clean' : 'original'
  renderView()
  renderReport()
  if (state.view === 'original') dom.original.focus()
  else dom.text.focus()
}

async function copy() {
  const text = dom.text.value
  if (!text) {
    toast('Nothing to copy yet')
    return
  }
  if (!(await writeClipboard(text))) {
    toast('Your browser blocked copying. Select the text and copy it yourself.')
    return
  }
  dom.copyButton.textContent = 'Copied'
  clearTimeout(copyTimer)
  copyTimer = setTimeout(() => { dom.copyButton.textContent = COPY_LABEL }, 1600)
  toast('Copied as plain text. Paste it anywhere.')
}

/**
 * Writes plain text only. That is the point of the button: a rich clipboard
 * entry is exactly what carries formatting into the next application.
 */
async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const staging = el('textarea', {
      style: 'position:fixed;top:-1000px;left:-1000px;opacity:0',
      'aria-hidden': 'true',
    })
    staging.value = text
    document.body.append(staging)
    staging.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    staging.remove()
    return ok
  }
}

let toastTimer = 0

function toast(message) {
  dom.toast.textContent = message
  dom.toast.classList.add('is-visible')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => dom.toast.classList.remove('is-visible'), 2400)
}

// --- Find and replace -----------------------------------------------------

function replaceParams() {
  return {
    find: dom.findInput.value,
    replace: dom.replaceInput.value,
    matchCase: dom.matchCase.checked,
    regex: dom.useRegex.checked,
  }
}

function updateMatchCount() {
  const params = replaceParams()
  if (!params.find) {
    dom.matchCount.textContent = ''
    return
  }
  if (!buildSearchRegex(params)) {
    dom.matchCount.textContent = 'Invalid pattern'
    return
  }
  const n = countMatches(dom.text.value, params)
  dom.matchCount.textContent = n === 1 ? '1 match' : n + ' matches'
}

function openReplaceBar() {
  dom.replaceBar.hidden = false
  dom.findInput.focus()
  dom.findInput.select()
  updateMatchCount()
}

function closeReplaceBar() {
  dom.replaceBar.hidden = true
}

function replaceAll() {
  const params = replaceParams()
  if (!params.find) {
    dom.findInput.focus()
    return
  }
  const n = buildSearchRegex(params) ? countMatches(dom.text.value, params) : 0
  if (!n) {
    toast('No matches')
    return
  }
  remember()
  state.steps.push({ id: 'replace', params })
  render()
  updateMatchCount()
  toast('Replaced ' + (n === 1 ? '1 match' : n + ' matches'))
}

// --- More tools -----------------------------------------------------------

function buildToolsPanel() {
  const groups = [...new Set(TOOLS.map((tool) => tool.group))]
  replaceChildren(dom.toolsPanel, groups.map((group) =>
    el('div', { class: 'tool-group' },
      el('h3', {}, group),
      el('div', { class: 'tool-group-buttons' },
        TOOLS.filter((tool) => tool.group === group).map((tool) =>
          el('button', {
            type: 'button',
            class: 'tool-button',
            title: tool.hint ?? null,
            onclick: () => runTool(tool),
          }, tool.kind === 'dialog' ? tool.label + '...' : tool.label))))))
}

function openToolsPanel() {
  dom.toolsPanel.hidden = false
  dom.toolsButton.setAttribute('aria-expanded', 'true')
}

function closeToolsPanel() {
  dom.toolsPanel.hidden = true
  dom.toolsButton.setAttribute('aria-expanded', 'false')
}

// --- Switches -------------------------------------------------------------

function buildSwitches() {
  replaceChildren(dom.switches, SWITCHES.map((option) =>
    el('label', { class: 'switch', title: option.hint },
      el('input', {
        type: 'checkbox',
        role: 'switch',
        id: 'opt-' + option.id,
        checked: state.options[option.id],
        onchange: (event) => setOption(option.id, event.target.checked),
      }),
      el('span', {}, option.label))))
}

// --- Theme ----------------------------------------------------------------

let theme = readStorage(THEME_KEY)
if (!THEMES.includes(theme)) theme = 'auto'

function applyTheme() {
  document.documentElement.dataset.theme = theme
}

function cycleTheme() {
  theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]
  applyTheme()
  writeStorage(THEME_KEY, theme)
  toast(theme === 'auto' ? 'Theme follows your system' : 'Theme: ' + theme)
}

// --- Events ---------------------------------------------------------------

/**
 * A paste anywhere on the page lands in the box, cleaned. A paste into text
 * the user is editing by hand goes where the cursor is, as in any editor;
 * otherwise it replaces what was there, which is the paste-clean-copy loop.
 */
document.addEventListener('paste', (event) => {
  if (event.target instanceof HTMLInputElement || dom.about.open) return
  const pasted = event.clipboardData?.getData('text/plain') ?? ''
  if (!pasted) return
  event.preventDefault()
  closeToolsPanel()

  if (event.target === dom.text && edited) {
    const { value, selectionStart, selectionEnd } = dom.text
    load(value.slice(0, selectionStart) + pasted + value.slice(selectionEnd), {
      stripHtml: state.options.stripHtml,
      caret: selectionStart + cleanText(pasted, state.options).length,
    })
    return
  }
  load(pasted)
})

const refreshWhileTyping = debounce(() => {
  if (edited) renderReport()
}, 300)

dom.text.addEventListener('input', () => {
  // The first keystroke after the app filled the box is an undo point.
  if (!edited) remember()
  edited = true
  state.raw = dom.text.value
  state.steps = []
  state.options.stripHtml = false
  state.view = 'clean'
  dom.summary.hidden = true
  dom.originalButton.hidden = true
  dom.emptyState.hidden = dom.text.value !== ''
  renderControls()
  refreshWhileTyping()
})

dom.originalButton.addEventListener('click', toggleOriginal)
dom.copyButton.addEventListener('click', copy)
dom.undoButton.addEventListener('click', undo)
dom.clearButton.addEventListener('click', clearText)
$('example-button').addEventListener('click', () =>
  load(SAMPLE_TEXT, { message: 'Loaded an example with a bit of everything wrong with it' }))
$('theme-button').addEventListener('click', cycleTheme)
$('about-button').addEventListener('click', () => dom.about.showModal())
$('about-close').addEventListener('click', () => dom.about.close())

dom.toolsButton.addEventListener('click', () => {
  if (dom.toolsPanel.hidden) openToolsPanel()
  else closeToolsPanel()
})

document.addEventListener('click', (event) => {
  if (!dom.toolsPanel.hidden && !event.target.closest('.tools')) closeToolsPanel()
})

$('replace-all').addEventListener('click', replaceAll)
$('replace-close').addEventListener('click', () => {
  closeReplaceBar()
  dom.text.focus()
})
for (const input of [dom.findInput, dom.replaceInput]) {
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      replaceAll()
    }
  })
}
dom.findInput.addEventListener('input', updateMatchCount)
dom.matchCase.addEventListener('change', updateMatchCount)
dom.useRegex.addEventListener('change', updateMatchCount)

// Drag and drop: a text file, or text dragged from another window.
for (const type of ['dragenter', 'dragover']) {
  dom.box.addEventListener(type, (event) => {
    const types = event.dataTransfer?.types ?? []
    if (!types.includes('Files') && !types.includes('text/plain')) return
    event.preventDefault()
    if (types.includes('Files')) dom.box.classList.add('is-dropping')
  })
}

dom.box.addEventListener('dragleave', (event) => {
  if (!dom.box.contains(event.relatedTarget)) dom.box.classList.remove('is-dropping')
})

dom.box.addEventListener('drop', async (event) => {
  dom.box.classList.remove('is-dropping')
  const file = event.dataTransfer?.files?.[0]
  const dropped = event.dataTransfer?.getData('text/plain') ?? ''
  if (!file && !dropped) return
  event.preventDefault()

  if (!file) {
    load(dropped)
    return
  }
  if (file.size > MAX_FILE_BYTES) {
    toast('That file is too big to work with comfortably')
    return
  }
  try {
    load(await file.text(), { stripHtml: /\.html?$/i.test(file.name), message: 'Loaded ' + file.name })
  } catch {
    toast('That file could not be read as text')
  }
})

document.addEventListener('keydown', (event) => {
  if (dom.about.open) return

  if (event.key === 'Escape') {
    if (!dom.toolsPanel.hidden) {
      closeToolsPanel()
      dom.toolsButton.focus()
    } else if (!dom.replaceBar.hidden) {
      closeReplaceBar()
      dom.text.focus()
    } else if (state.view === 'original') {
      toggleOriginal()
    }
    return
  }

  if (isCommandKey(event) && event.key === 'Enter') {
    event.preventDefault()
    copy()
    return
  }

  // The app's own undo covers pastes, switches and tools. Once the user is
  // typing, the text box's native undo takes over.
  if (isCommandKey(event) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'z') {
    if (event.target instanceof HTMLInputElement || edited || history.length === 0) return
    event.preventDefault()
    undo()
  }
})

// --- Start ----------------------------------------------------------------

applyTheme()
buildSwitches()
buildToolsPanel()
render()
dom.text.focus()

// The service worker is what makes the page work offline. It is optional: a
// failure here must never stop the app from running.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {})
  })
}
