/**
 * Document statistics.
 */

import { ELLIPSIS, CLOSE_QUOTE_CLASS_BODY, RSQUO } from '../core/chars.js'

const WORD_RE = new RegExp(
  "[\\p{L}\\p{N}][\\p{L}\\p{N}'" + RSQUO + '._-]*',
  'gu',
)
const SENTENCE_SPLIT_RE = new RegExp(
  '[.!?' + ELLIPSIS + ']+[\\s' + CLOSE_QUOTE_CLASS_BODY + ')]|\\n',
  'u',
)

const EMPTY_STATS = {
  characters: 0, charactersNoSpaces: 0, words: 0, uniqueWords: 0,
  sentences: 0, paragraphs: 0, lines: 0, bytes: 0, longestLine: 0,
  readingMinutes: 0, speakingMinutes: 0, averageWordLength: 0,
}

/** Counts characters, words, lines and reading time for a block of text. */
export function computeStats(text) {
  if (!text) return { ...EMPTY_STATS }

  const words = text.match(WORD_RE) ?? []
  const unique = new Set(words.map((w) => w.toLowerCase()))
  const lines = text.split('\n')
  const paragraphs = text.split(/\n\s*\n/).filter((block) => block.trim() !== '')
  const sentences = text.split(SENTENCE_SPLIT_RE).filter((s) => s && s.trim() !== '')
  const letters = words.join('').length

  return {
    characters: [...text].length,
    charactersNoSpaces: [...text.replace(/\s/g, '')].length,
    words: words.length,
    uniqueWords: unique.size,
    sentences: sentences.length,
    paragraphs: paragraphs.length,
    lines: lines.length,
    bytes: new TextEncoder().encode(text).length,
    longestLine: lines.reduce((max, line) => Math.max(max, line.length), 0),
    readingMinutes: words.length / 238,
    speakingMinutes: words.length / 140,
    averageWordLength: words.length ? letters / words.length : 0,
  }
}

/** A duration people can read at a glance. */
export function formatDuration(minutes) {
  if (!minutes) return '0 sec'
  if (minutes < 1) return Math.max(1, Math.round(minutes * 60)) + ' sec'
  if (minutes < 60) return Math.round(minutes) + ' min'
  const hours = Math.floor(minutes / 60)
  return hours + ' hr ' + Math.round(minutes % 60) + ' min'
}

/** Thousands separators below ten thousand, then a compact suffix. */
export function formatCount(value) {
  if (value < 10000) return value.toLocaleString()
  if (value < 1e6) return (value / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return (value / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
}

/** Byte count as B, KB or MB. */
export function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'with', 'this', 'from', 'are', 'was', 'were',
  'have', 'has', 'had', 'you', 'your', 'our', 'their', 'they', 'them', 'but',
  'not', 'all', 'can', 'will', 'would', 'should', 'could', 'been', 'its',
  'into', 'than', 'then', 'there', 'these', 'those', 'what', 'when', 'which',
  'who', 'how', 'why', 'more', 'most', 'some', 'such', 'only', 'other', 'any',
])

/** The most frequent words, for a quick sense of what a document is about. */
export function wordFrequency(text, { limit = 12, minLength = 3, stopWords = true } = {}) {
  const counts = new Map()
  for (const raw of text.match(WORD_RE) ?? []) {
    const word = raw.toLowerCase().replace(/^[._-]+|[._-]+$/g, '')
    if (word.length < minLength) continue
    if (stopWords && STOP_WORDS.has(word)) continue
    counts.set(word, (counts.get(word) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }))
}

/** A summary of what the pipeline changed, for the output header. */
export function summariseChange(before, after) {
  const beforeStats = computeStats(before)
  const afterStats = computeStats(after)
  return {
    charactersRemoved: beforeStats.characters - afterStats.characters,
    linesRemoved: beforeStats.lines - afterStats.lines,
    wordsChanged: afterStats.words - beforeStats.words,
    changed: before !== after,
  }
}
