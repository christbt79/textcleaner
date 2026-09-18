/**
 * Application entry point: wires the DOM to the pipeline.
 *
 * The whole app is one cycle. Text or settings change, the pipeline runs, and
 * the output, statistics, issue bar and character inspector are redrawn from
 * the result. Nothing else mutates the page.
 */

import { runPipeline, OPERATIONS_BY_ID } from './core/pipeline.js'
import { PRESETS_BY_ID, DEFAULT_PRESET } from './core/presets.js'
import { scanText, inspectCharacters } from './core/scan.js'
import { computeStats, formatBytes, formatCount, formatDuration } from './core/stats.js'
import { looksLikeHtml } from './core/ops/markup.js'

import { $, el, replaceChildren, debounce, isCommandKey, isTypingTarget } from './ui/dom.js'
import {
  applyPreset, buildRecipeLink, loadState, loadText, saveState, saveText,
  setOperation, setParam,
} from './ui/state.js'
import { renderPresets, renderRail } from './ui/controls.js'
import { renderIssues, renderInspector } from './ui/issues.js'
import { renderOutput } from './ui/output.js'
import { createPalette } from './ui/palette.js'
import { SAMPLE_TEXT } from './ui/sample.js'

const dom = {
  presetChips: $('preset-chips'),
  railGroups: $('rail-groups'),
  railFilter: $('rail-filter'),
  activeCount: $('active-count'),
  issueBar: $('issue-bar'),
  issueChips: $('issue-chips'),
  issueTitle: $('issue-bar-title'),
  fixAll: $('fix-all'),
  input: $('input'),
  inputStats: $('input-stats'),
  output: $('output'),
  outputEmpty: $('output-empty'),
  outputStats: $('output-stats'),
  inspector: $('inspector'),
  inspectorToggle: $('inspector-toggle'),
  inspectorBody: $('inspector-body'),
  inspectorCount: $('inspector-count'),
  revealToggle: $('reveal-toggle'),
  useHtml: $('use-html'),
  toast: $('toast'),
  workspace: $('workspace'),
  paneSwitch: $('pane-switch'),
  dropHint: $('drop-hint'),
}

const state = loadState()
let clipboardHtml = ''
let lastOutput = ''

// --- Rendering ------------------------------------------------------------

/** One pass: run the pipeline and redraw everything that depends on it. */
function update() {
  const input = dom.input.value
  const { text, errors } = runPipeline(input, {
    enabled: [...state.enabled],
    params: state.params,
  })
  lastOutput = text

  renderOutput(dom.output, dom.outputEmpty, text, { reveal: state.reveal })
  renderStats(dom.inputStats, input, { label: 'Original' })
  renderStats(dom.outputStats, text, { label: 'Cleaned', compareWith: input, errors })

  const issues = scanText(input)
  renderIssues(
    { bar: dom.issueBar, chips: dom.issueChips, title: dom.issueTitle, fixAll: dom.fixAll },
    issues, state, { onFix: toggleIssue },
  )
  renderInspector(
    { panel: dom.inspector, body: dom.inspectorBody, count: dom.inspectorCount },
    inspectCharacters(input),
  )

  dom.activeCount.textContent = state.enabled.size === 1
    ? '1 operation on'
    : state.enabled.size + ' operations on'
}

function drawRail() {
  renderRail(dom.railGroups, state, {
    filter: dom.railFilter.value,
    onToggle: toggleOperation,
    onParam: changeParam,
    onGroupToggle: toggleGroup,
  })
}

/** Redraws the controls, then the output. */
function updateAll() {
  renderPresets(dom.presetChips, state, { onPick: pickPreset })
  drawRail()
  update()
  saveState(state)
}

function renderStats(container, text, { label, compareWith, errors = [] }) {
  const stats = computeStats(text)
  const parts = [
    stat(label, ''),
    stat('Words', formatCount(stats.words)),
    stat('Characters', formatCount(stats.characters)),
    stat('Lines', formatCount(stats.lines)),
    stat('Paragraphs', formatCount(stats.paragraphs)),
    stat('Read', formatDuration(stats.readingMinutes)),
    stat('Size', formatBytes(stats.bytes)),
  ]

  if (compareWith !== undefined && compareWith !== text) {
    const removed = [...compareWith].length - stats.characters
    if (removed !== 0) {
      parts.push(el('span', { class: 'stat stat-change' },
        (removed > 0 ? 'Removed ' : 'Added ') + formatCount(Math.abs(removed)) + ' characters'))
    }
  }

  for (const error of errors) {
    parts.push(el('span', { class: 'stat stat-error' }, error.label + ' failed: ' + error.message))
  }

  replaceChildren(container, parts)
}

function stat(label, value) {
  return value === ''
    ? el('span', { class: 'stat' }, el('b', {}, label))
    : el('span', { class: 'stat' }, label + ' ', el('b', {}, value))
}

// --- Actions --------------------------------------------------------------

function pickPreset(presetId) {
  applyPreset(state, presetId)
  updateAll()
  const preset = PRESETS_BY_ID.get(presetId)
  if (preset) toast(preset.label + ' applied')
}

function toggleOperation(id, on) {
  setOperation(state, id, on)
  updateAll()
}

function changeParam(opId, key, value, { rerender = false, focusLastRule = false } = {}) {
  setParam(state, opId, key, value)
  // The rail is not redrawn while a field is being typed into: doing so would
  // steal the focus. Only structural changes, such as adding or removing a
  // rule, ask for a redraw.
  renderPresets(dom.presetChips, state, { onPick: pickPreset })
  if (rerender) {
    drawRail()
    if (focusLastRule) {
      const inputs = dom.railGroups.querySelectorAll('.rule input[aria-label="Find"]')
      inputs[inputs.length - 1]?.focus()
    }
  }
  update()
  saveState(state)
}

function toggleGroup(groupId) {
  if (state.openGroups.has(groupId)) state.openGroups.delete(groupId)
  else state.openGroups.add(groupId)
  updateAll()
}

/** Switching an issue on enables the first operation that fixes it. */
function toggleIssue(issue, on) {
  if (on) {
    setOperation(state, issue.ops[0], true)
  } else {
    for (const opId of issue.ops) setOperation(state, opId, false)
  }
  updateAll()
}

function fixEverything() {
  for (const issue of scanText(dom.input.value)) {
    if (issue.ops.length && !issue.ops.some((id) => state.enabled.has(id))) {
      setOperation(state, issue.ops[0], true)
    }
  }
  updateAll()
  toast('Every problem found is now being fixed')
}

function resetOperations() {
  applyPreset(state, DEFAULT_PRESET)
  dom.railFilter.value = ''
  updateAll()
  toast('Back to Safe paste')
}

async function copyOutput() {
  if (!lastOutput) {
    toast('Nothing to copy yet')
    return
  }
  const ok = await writeToClipboard(lastOutput)
  toast(ok ? 'Copied as plain text' : 'The browser blocked the clipboard, so select and copy')
}

/**
 * Writes plain text only.
 *
 * That is the point of the Copy button: a rich-text clipboard entry is exactly
 * what carries formatting into the next application.
 */
async function writeToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return copyBySelection(text)
  }
}

/** The fallback for browsers or contexts where the async clipboard is denied. */
function copyBySelection(text) {
  const staging = el('textarea', {
    value: text,
    style: 'position:fixed;top:-1000px;left:-1000px;opacity:0',
    'aria-hidden': 'true',
  })
  document.body.append(staging)
  staging.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  staging.remove()
  dom.input.focus()
  return ok
}

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText()
    setInput(text)
    toast('Pasted')
  } catch {
    dom.input.focus()
    toast('The browser needs you to paste with the keyboard')
  }
}

function downloadOutput() {
  if (!lastOutput) {
    toast('Nothing to save yet')
    return
  }
  const blob = new Blob([lastOutput], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = el('a', { href: url, download: 'cleaned.txt' })
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function setInput(text, { keepHtml = false } = {}) {
  dom.input.value = text
  if (!keepHtml) setClipboardHtml('')
  saveText(text)
  update()
}

function setClipboardHtml(html) {
  clipboardHtml = html
  dom.useHtml.hidden = !html
}

let toastTimer = 0
function toast(message) {
  dom.toast.textContent = message
  dom.toast.classList.add('is-visible')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => dom.toast.classList.remove('is-visible'), 2200)
}

// --- Theme ----------------------------------------------------------------

const THEMES = ['auto', 'dark', 'light']

function applyTheme() {
  document.documentElement.dataset.theme = state.theme
}

function cycleTheme() {
  state.theme = THEMES[(THEMES.indexOf(state.theme) + 1) % THEMES.length]
  applyTheme()
  saveState(state)
  toast('Theme: ' + state.theme)
}

// --- Panes on small screens -----------------------------------------------

function setMobileView(view) {
  document.body.dataset.mobileView = view
  for (const button of dom.paneSwitch.querySelectorAll('button')) {
    button.classList.toggle('is-active', button.dataset.view === view)
  }
}

// --- Events ---------------------------------------------------------------

const persist = debounce((text) => saveText(text), 400)

dom.input.addEventListener('input', () => {
  update()
  persist(dom.input.value)
})

/**
 * A paste usually carries both plain text and HTML. The plain text is what the
 * textarea takes, which is right by default, but the HTML holds the list and
 * link structure, so it is kept in case the user wants it.
 */
dom.input.addEventListener('paste', (event) => {
  const html = event.clipboardData?.getData('text/html') ?? ''
  setClipboardHtml(html && looksLikeHtml(html) ? html : '')
})

dom.useHtml.addEventListener('click', () => {
  if (!clipboardHtml) return
  setInput(clipboardHtml, { keepHtml: true })
  setOperation(state, 'htmlToText', true)
  updateAll()
  toast('Loaded the rich source and switched on Strip HTML')
})

dom.railFilter.addEventListener('input', drawRail)

dom.revealToggle.addEventListener('change', () => {
  state.reveal = dom.revealToggle.checked
  saveState(state)
  update()
})

dom.inspectorToggle.addEventListener('click', () => {
  const open = dom.inspectorBody.hidden
  dom.inspectorBody.hidden = !open
  dom.inspectorToggle.setAttribute('aria-expanded', String(open))
})

$('copy-button').addEventListener('click', copyOutput)
$('download-button').addEventListener('click', downloadOutput)
$('paste-button').addEventListener('click', pasteFromClipboard)
$('clear-button').addEventListener('click', () => {
  setInput('')
  dom.input.focus()
})
$('sample-button').addEventListener('click', () => {
  setInput(SAMPLE_TEXT)
  toast('Loaded a sample with one of everything wrong with it')
})
$('reuse-button').addEventListener('click', () => {
  if (!lastOutput) return
  setInput(lastOutput)
  toast('Output moved across, ready for another pass')
})
$('reset-operations').addEventListener('click', resetOperations)
dom.fixAll.addEventListener('click', fixEverything)
$('theme-button').addEventListener('click', cycleTheme)
$('about-button').addEventListener('click', () => $('about').showModal())

$('copy-recipe').addEventListener('click', async () => {
  const ok = await writeToClipboard(buildRecipeLink(state))
  toast(ok
    ? 'Link copied. It carries the settings only, never the text.'
    : 'Could not reach the clipboard')
})

for (const button of dom.paneSwitch.querySelectorAll('button')) {
  button.addEventListener('click', () => setMobileView(button.dataset.view))
}

// Drag and drop a text file onto the input.
const inputBody = dom.input.parentElement

for (const type of ['dragenter', 'dragover']) {
  inputBody.addEventListener(type, (event) => {
    if (!event.dataTransfer?.types.includes('Files')) return
    event.preventDefault()
    inputBody.classList.add('is-dropping')
  })
}

for (const type of ['dragleave', 'drop']) {
  inputBody.addEventListener(type, (event) => {
    if (type === 'dragleave' && inputBody.contains(event.relatedTarget)) return
    inputBody.classList.remove('is-dropping')
  })
}

inputBody.addEventListener('drop', async (event) => {
  const file = event.dataTransfer?.files?.[0]
  if (!file) return
  event.preventDefault()
  if (file.size > 12 * 1024 * 1024) {
    toast('That file is too big to work with comfortably')
    return
  }
  try {
    const text = await file.text()
    setInput(text)
    if (/\.html?$/i.test(file.name) || looksLikeHtml(text)) {
      setOperation(state, 'htmlToText', true)
      updateAll()
    }
    toast('Loaded ' + file.name)
  } catch {
    toast('That file could not be read as text')
  }
})

// --- Keyboard -------------------------------------------------------------

const SHORTCUTS = [
  ['Ctrl / Cmd + K', 'Search presets and operations'],
  ['Ctrl / Cmd + Enter', 'Copy the clean text'],
  ['Ctrl / Cmd + Shift + Backspace', 'Clear the input'],
  ['Ctrl / Cmd + I', 'Reveal hidden characters'],
  ['Ctrl / Cmd + Shift + R', 'Send the output back to the input'],
  ['Escape', 'Close a dialog'],
]

replaceChildren($('shortcuts'), SHORTCUTS.flatMap(([keys, description]) =>
  [el('dt', {}, keys), el('dd', {}, description)]))

const palette = createPalette(
  { dialog: $('palette'), input: $('palette-input'), results: $('palette-results') },
  {
    getState: () => state,
    onPreset: pickPreset,
    onToggle: (id, on) => {
      toggleOperation(id, on)
      const op = OPERATIONS_BY_ID.get(id)
      if (op) toast(op.label + (on ? ' on' : ' off'))
    },
    // Picking a mode from the palette also switches its operation on, which is
    // what someone who searched for that mode by name is asking for.
    onOption: (opId, key, value) => {
      setParam(state, opId, key, value)
      setOperation(state, opId, true)
      updateAll()
      const op = OPERATIONS_BY_ID.get(opId)
      const label = op?.params
        ?.find((param) => param.key === key)
        ?.options?.find(([optionValue]) => optionValue === value)?.[1]
      toast((label ?? op?.label ?? 'Applied') + ' applied')
    },
  },
)

$('palette-button').addEventListener('click', () => palette.open())

document.addEventListener('keydown', (event) => {
  if (isCommandKey(event) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    palette.open()
    return
  }
  if (isCommandKey(event) && event.key === 'Enter') {
    event.preventDefault()
    copyOutput()
    return
  }
  if (isCommandKey(event) && event.shiftKey && event.key === 'Backspace') {
    event.preventDefault()
    setInput('')
    return
  }
  if (isCommandKey(event) && event.key.toLowerCase() === 'i' && !event.shiftKey) {
    event.preventDefault()
    dom.revealToggle.checked = !dom.revealToggle.checked
    dom.revealToggle.dispatchEvent(new Event('change'))
    return
  }
  if (isCommandKey(event) && event.shiftKey && event.key.toLowerCase() === 'r') {
    event.preventDefault()
    if (lastOutput) setInput(lastOutput)
    return
  }
  // A bare keystroke with nothing focused should land in the textarea.
  if (!isCommandKey(event) && !event.altKey && event.key.length === 1 &&
      !isTypingTarget(document.activeElement) && !document.querySelector('dialog[open]')) {
    dom.input.focus()
  }
})

// --- Start ----------------------------------------------------------------

applyTheme()
dom.revealToggle.checked = state.reveal
dom.input.value = loadText()
setMobileView('input')
updateAll()

if (!dom.input.value) dom.input.focus()

// The service worker is what makes the page work with no connection. It is
// optional: a failure here must never stop the app from running.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {})
  })
}
