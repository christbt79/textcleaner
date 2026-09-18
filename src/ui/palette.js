/**
 * The command palette.
 *
 * With this many operations, search beats hunting through groups. It covers
 * presets and operations, and toggles whatever is selected.
 */

import { OPERATIONS, GROUPS } from '../core/pipeline.js'
import { PRESETS } from '../core/presets.js'
import { el, replaceChildren } from './dom.js'
import { optionLabels } from './controls.js'

const GROUP_LABELS = new Map(GROUPS.map((group) => [group.id, group.label]))

export function createPalette({ dialog, input, results }, { getState, onPreset, onToggle, onOption }) {
  let items = []
  let active = 0

  function build(query) {
    const needle = query.trim().toLowerCase()
    const state = getState()

    const candidates = [
      ...PRESETS.map((preset) => ({
        kind: 'Preset',
        id: preset.id,
        name: preset.label,
        detail: preset.hint ?? '',
        on: state.preset === preset.id,
        run: () => onPreset(preset.id),
      })),
      ...OPERATIONS.map((op) => ({
        kind: GROUP_LABELS.get(op.group) ?? 'Operation',
        id: op.id,
        name: op.label,
        // The option labels are searchable too, so "title case" finds the
        // operation that offers it rather than nothing at all.
        detail: [op.hint ?? '', optionLabels(op)].filter(Boolean).join(' '),
        on: state.enabled.has(op.id),
        run: () => onToggle(op.id, !state.enabled.has(op.id)),
      })),
      // Individual choices are worth finding directly: someone looking for
      // "title case" wants that conversion, not the operation that offers it.
      ...(needle ? selectChoices(state) : []),
    ]

    items = candidates
      .map((item) => ({ item, score: score(item, needle) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40)
      .map((entry) => entry.item)

    active = 0
    draw()
  }

  /** One entry per select option, so a mode can be applied in one step. */
  function selectChoices(state) {
    const out = []
    for (const op of OPERATIONS) {
      for (const param of op.params ?? []) {
        if (param.type !== 'select') continue
        for (const [value, label] of param.options) {
          out.push({
            kind: op.label,
            id: op.id + '.' + param.key + '.' + value,
            name: label,
            detail: op.label + ' ' + (op.hint ?? ''),
            on: state.enabled.has(op.id) && state.params[op.id]?.[param.key] === value,
            run: () => onOption(op.id, param.key, value),
          })
        }
      }
    }
    return out
  }

  function score(item, needle) {
    if (!needle) return item.on ? 2 : 1
    const name = item.name.toLowerCase()
    if (name.startsWith(needle)) return 100
    if (name.includes(needle)) return 60
    if (item.detail.toLowerCase().includes(needle)) return 25
    if (item.id.toLowerCase().includes(needle)) return 20
    return 0
  }

  function draw() {
    replaceChildren(results, items.map((item, index) =>
      el('li', {
        class: 'palette-item' + (index === active ? ' is-active' : ''),
        role: 'option',
        'aria-selected': String(index === active),
        onmouseenter: () => {
          active = index
          draw()
        },
        onclick: () => choose(index),
      },
        el('span', { class: 'kind' }, item.kind),
        el('span', { class: 'name' }, item.name),
        item.on ? el('span', { class: 'state' }, 'on') : null)))
  }

  function choose(index) {
    const item = items[index]
    if (!item) return
    item.run()
    dialog.close()
  }

  input.addEventListener('input', () => build(input.value))

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      active = Math.min(active + 1, items.length - 1)
      draw()
      results.children[active]?.scrollIntoView({ block: 'nearest' })
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      active = Math.max(active - 1, 0)
      draw()
      results.children[active]?.scrollIntoView({ block: 'nearest' })
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(active)
    }
  })

  return {
    open() {
      input.value = ''
      build('')
      dialog.showModal()
      input.focus()
    },
  }
}
