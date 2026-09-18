/**
 * The operations rail: groups, toggles and per-operation parameters.
 *
 * Parameter fields read their current value from state at the moment they
 * fire, never from a value captured when the row was drawn. The rail is not
 * redrawn on every keystroke, so a captured value would be stale as soon as a
 * field was edited twice.
 */

import { GROUPS, OPERATIONS } from '../core/pipeline.js'
import { PRESETS } from '../core/presets.js'
import { el, icon, ICONS, replaceChildren } from './dom.js'

/** Renders the preset chips along the top bar. */
export function renderPresets(container, state, { onPick }) {
  replaceChildren(container, PRESETS.map((preset) =>
    el('button', {
      type: 'button',
      class: 'preset-chip',
      'aria-pressed': String(state.preset === preset.id),
      title: preset.hint ?? '',
      onclick: () => onPick(preset.id),
    }, preset.label)))
}

/**
 * Renders the rail.
 *
 * `filter` narrows the list to matching operations and opens every group that
 * still has something in it, so searching always shows its own results.
 */
export function renderRail(container, state, handlers) {
  const needle = (handlers.filter ?? '').trim().toLowerCase()
  const matches = (op) =>
    !needle ||
    op.label.toLowerCase().includes(needle) ||
    (op.hint ?? '').toLowerCase().includes(needle) ||
    op.id.toLowerCase().includes(needle) ||
    optionLabels(op).toLowerCase().includes(needle)

  const groups = GROUPS.map((group) => {
    const ops = OPERATIONS.filter((op) => op.group === group.id && matches(op))
    if (!ops.length) return null

    const activeCount = ops.filter((op) => state.enabled.has(op.id)).length
    const open = needle ? true : state.openGroups.has(group.id)

    return el('section', { class: 'group', dataset: { open: String(open) } },
      el('button', {
        type: 'button',
        class: 'group-head',
        'aria-expanded': String(open),
        onclick: () => handlers.onGroupToggle(group.id),
      },
        icon(ICONS.chevron, 13),
        el('span', { class: 'group-name' }, group.label),
        el('span', { class: 'group-badge', hidden: activeCount === 0 }, String(activeCount))),
      el('div', { class: 'group-body' },
        ops.map((op) => renderOperation(op, state, handlers))))
  })

  const visible = groups.filter(Boolean)
  replaceChildren(container, visible.length
    ? visible
    : el('p', { class: 'op-hint empty-note' }, 'No operation matches that.'))
}

/** The labels of an operation's select options, so they can be searched. */
export function optionLabels(op) {
  return (op.params ?? [])
    .flatMap((param) => (param.options ?? []).map(([, label]) => label))
    .join(' ')
}

function renderOperation(op, state, handlers) {
  const on = state.enabled.has(op.id)

  return el('div', { class: 'op', dataset: { on: String(on) } },
    el('label', { class: 'op-row' },
      el('input', {
        type: 'checkbox',
        checked: on,
        onchange: (event) => handlers.onToggle(op.id, event.target.checked),
      }),
      el('span', { class: 'op-text' },
        el('span', { class: 'op-label' }, op.label),
        op.hint ? el('span', { class: 'op-hint' }, op.hint) : null)),
    op.params?.length
      ? el('div', { class: 'op-params' },
        op.params.map((param) => renderParam(op, param, state, handlers.onParam)))
      : null)
}

function renderParam(op, param, state, onParam) {
  /** Always the live value, never one captured when this row was drawn. */
  const current = () => state.params[op.id]?.[param.key]
  const change = (next, options) => onParam(op.id, param.key, next, options)
  const value = current()

  if (param.type === 'checkbox') {
    return el('label', { class: 'param' },
      el('input', {
        type: 'checkbox',
        checked: Boolean(value),
        onchange: (event) => change(event.target.checked),
      }),
      param.label)
  }

  if (param.type === 'select') {
    return el('label', { class: 'param' },
      param.label,
      el('select', { onchange: (event) => change(event.target.value) },
        param.options.map(([optionValue, optionLabel]) =>
          el('option', { value: optionValue, selected: optionValue === value }, optionLabel))))
  }

  if (param.type === 'number') {
    return el('label', { class: 'param' },
      param.label,
      el('input', {
        type: 'number',
        value: String(value ?? ''),
        min: param.min,
        max: param.max,
        oninput: (event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) change(next)
        },
      }))
  }

  if (param.type === 'rules') {
    return renderRules(current, change)
  }

  return el('label', { class: 'param' },
    param.label,
    el('input', {
      type: 'text',
      value: value ?? '',
      placeholder: param.placeholder ?? '',
      dataset: param.width ? { width: param.width } : {},
      oninput: (event) => change(event.target.value),
    }))
}

const EMPTY_RULE = { find: '', replace: '' }

/** Find-and-replace rules: a row each, applied in order, plus an add button. */
function renderRules(current, change) {
  const rules = () => {
    const live = current()
    return Array.isArray(live) && live.length ? live : [EMPTY_RULE]
  }
  const rows = rules()

  const edit = (index, key, value) => {
    const next = rules().map((rule) => ({ ...rule }))
    while (next.length <= index) next.push({ ...EMPTY_RULE })
    next[index] = { ...next[index], [key]: value }
    change(next)
  }

  const remove = (index) => {
    const next = rules().filter((_, i) => i !== index)
    change(next.length ? next : [{ ...EMPTY_RULE }], { rerender: true })
  }

  return el('div', { class: 'rules' },
    rows.map((rule, index) =>
      el('div', { class: 'rule' },
        el('input', {
          type: 'text',
          value: rule.find ?? '',
          placeholder: 'find',
          'aria-label': 'Find',
          oninput: (event) => edit(index, 'find', event.target.value),
        }),
        el('span', { class: 'arrow' }, '->'),
        el('input', {
          type: 'text',
          value: rule.replace ?? '',
          placeholder: 'replace with',
          'aria-label': 'Replace with',
          oninput: (event) => edit(index, 'replace', event.target.value),
        }),
        el('button', {
          type: 'button',
          class: 'rule-remove',
          title: 'Remove this rule',
          'aria-label': 'Remove this rule',
          hidden: rows.length === 1,
          onclick: () => remove(index),
        }, 'x'))),
    el('button', {
      type: 'button',
      class: 'link-button rule-add',
      onclick: () => change([...rules().map((rule) => ({ ...rule })), { ...EMPTY_RULE }],
        { rerender: true, focusLastRule: true }),
    }, 'Add another rule'))
}
