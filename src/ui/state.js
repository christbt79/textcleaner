/**
 * Application state, persistence and recipe sharing.
 *
 * The text itself is kept in `localStorage` so a reload does not lose a paste,
 * and the operation selection can be shared as a link. A shared link carries
 * the recipe only: the text never goes into a URL.
 */

import {
  OPERATIONS_BY_ID, conflictsWith, defaultParamState, defaultEnabled,
} from '../core/pipeline.js'
import { PRESETS_BY_ID, DEFAULT_PRESET } from '../core/presets.js'

const STORAGE_KEY = 'textcleaner.state.v1'
const TEXT_KEY = 'textcleaner.text.v1'
const MAX_STORED_TEXT = 400_000

/** Reads from storage, tolerating a browser that refuses to provide it. */
function readStorage(key) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key, value) {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    // Private browsing, a full quota or blocked site data. Not worth reporting:
    // the app works, it just will not remember anything.
  }
}

function freshState() {
  return {
    preset: DEFAULT_PRESET,
    enabled: new Set(PRESETS_BY_ID.get(DEFAULT_PRESET)?.enabled ?? defaultEnabled()),
    params: defaultParamState(),
    theme: 'auto',
    reveal: false,
    openGroups: new Set(['repair', 'structure']),
  }
}

/** Merges stored parameters over the defaults, ignoring anything unknown. */
function mergeParams(stored) {
  const params = defaultParamState()
  if (!stored || typeof stored !== 'object') return params
  for (const [opId, values] of Object.entries(stored)) {
    if (!params[opId] || !values || typeof values !== 'object') continue
    for (const [key, value] of Object.entries(values)) {
      if (key in params[opId]) params[opId][key] = value
    }
  }
  return params
}

/** Restores state from a shared link first, then from storage. */
export function loadState() {
  const state = freshState()

  const stored = readStorage(STORAGE_KEY)
  if (stored) {
    try {
      const saved = JSON.parse(stored)
      if (Array.isArray(saved.enabled)) {
        state.enabled = new Set(saved.enabled.filter((id) => OPERATIONS_BY_ID.has(id)))
      }
      if (saved.params) state.params = mergeParams(saved.params)
      if (typeof saved.preset === 'string') state.preset = saved.preset
      if (['auto', 'dark', 'light'].includes(saved.theme)) state.theme = saved.theme
      if (typeof saved.reveal === 'boolean') state.reveal = saved.reveal
      if (Array.isArray(saved.openGroups)) state.openGroups = new Set(saved.openGroups)
    } catch {
      // A corrupt entry should never stop the app loading.
    }
  }

  const shared = readRecipeFromLocation()
  if (shared) {
    state.enabled = shared.enabled
    state.params = mergeParams(shared.params)
    state.preset = shared.preset ?? null
  }

  return state
}

export function saveState(state) {
  writeStorage(STORAGE_KEY, JSON.stringify({
    preset: state.preset,
    enabled: [...state.enabled],
    params: state.params,
    theme: state.theme,
    reveal: state.reveal,
    openGroups: [...state.openGroups],
  }))
}

export function loadText() {
  return readStorage(TEXT_KEY) ?? ''
}

export function saveText(text) {
  writeStorage(TEXT_KEY, text.length > MAX_STORED_TEXT ? null : text)
}

/**
 * Switching an operation on also switches off anything it contradicts, so the
 * two directions of a conversion can never both be selected.
 */
export function setOperation(state, id, on) {
  if (!OPERATIONS_BY_ID.has(id)) return
  if (on) {
    state.enabled.add(id)
    for (const other of conflictsWith(id)) state.enabled.delete(other)
  } else {
    state.enabled.delete(id)
  }
  state.preset = null
}

export function applyPreset(state, presetId) {
  const preset = PRESETS_BY_ID.get(presetId)
  if (!preset) return
  state.preset = presetId
  state.enabled = new Set(preset.enabled)
  state.params = defaultParamState()
  for (const [opId, values] of Object.entries(preset.params ?? {})) {
    if (state.params[opId]) Object.assign(state.params[opId], values)
  }
}

export function setParam(state, opId, key, value) {
  if (!state.params[opId]) state.params[opId] = {}
  state.params[opId][key] = value
  state.preset = null
}

/** The parameters for one operation, with defaults filled in. */
export function paramsFor(state, opId) {
  return state.params[opId] ?? {}
}

// --- Recipe sharing -------------------------------------------------------

/**
 * Only the parameters that differ from their defaults travel in a link, which
 * keeps a shared URL short and readable.
 */
function changedParams(state) {
  const defaults = defaultParamState()
  const out = {}
  for (const [opId, values] of Object.entries(state.params)) {
    if (!state.enabled.has(opId)) continue
    const diff = {}
    for (const [key, value] of Object.entries(values)) {
      if (JSON.stringify(value) !== JSON.stringify(defaults[opId]?.[key])) diff[key] = value
    }
    if (Object.keys(diff).length) out[opId] = diff
  }
  return out
}

/** Builds a shareable URL for the current operation selection. */
export function buildRecipeLink(state) {
  const recipe = {
    v: 1,
    preset: state.preset ?? undefined,
    ops: [...state.enabled],
    params: changedParams(state),
  }
  const encoded = encodeURIComponent(JSON.stringify(recipe))
  const url = new URL(window.location.href)
  url.hash = 'recipe=' + encoded
  return url.toString()
}

function readRecipeFromLocation() {
  const hash = window.location.hash.replace(/^#/, '')
  if (!hash.startsWith('recipe=')) return null
  try {
    const recipe = JSON.parse(decodeURIComponent(hash.slice('recipe='.length)))
    if (!Array.isArray(recipe.ops)) return null
    return {
      enabled: new Set(recipe.ops.filter((id) => OPERATIONS_BY_ID.has(id))),
      params: recipe.params ?? {},
      preset: typeof recipe.preset === 'string' ? recipe.preset : null,
    }
  } catch {
    return null
  }
}
