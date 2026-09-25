/**
 * Find and replace, extraction, encoding and removal operations.
 */

import { escapeRegExp, emojiRegex } from '../chars.js'

/** Builds the regex for a find-and-replace, or null if the pattern is bad. */
export function buildSearchRegex({
  find = '',
  regex = false,
  matchCase = false,
  wholeWord = false,
  global = true,
} = {}) {
  if (!find) return null
  let source = regex ? find : escapeRegExp(find)
  if (wholeWord) source = '\\b(?:' + source + ')\\b'
  const flags = (global ? 'g' : '') + (matchCase ? '' : 'i') + (regex ? 'm' : '')
  try {
    return new RegExp(source, flags)
  } catch {
    return null
  }
}

/**
 * Find and replace.
 *
 * In regex mode `\n` and `\t` in the replacement are turned into real
 * characters, and `$1` capture groups work as usual.
 */
export function findReplace(text, options = {}) {
  const re = buildSearchRegex(options)
  if (!re) return text
  const replacement = (options.replace ?? '').replace(/\\n/g, '\n').replace(/\\t/g, '\t')
  // Outside regex mode a replacement is literal: "$5" means five dollars, not
  // a capture group, so it goes through a function to escape the $ syntax.
  return text.replace(re, options.regex ? replacement : () => replacement)
}

/** Counts matches without changing anything, for the live match counter. */
export function countMatches(text, options = {}) {
  const re = buildSearchRegex({ ...options, global: true })
  if (!re) return 0
  let count = 0
  let match
  while ((match = re.exec(text)) !== null) {
    count += 1
    // An empty match does not move lastIndex, so step past it by hand.
    if (match[0] === '') re.lastIndex += 1
    if (count >= 1e6) break
  }
  return count
}

/** Applies a list of `{find, replace}` rules in order. */
export function applyReplacementRules(text, rules = [], shared = {}) {
  return rules.reduce(
    (acc, rule) => (rule?.find ? findReplace(acc, { ...shared, ...rule }) : acc),
    text,
  )
}

const PATTERNS = {
  emails: /[\w.+-]+@[\w-]+\.[\w.-]+\w/g,
  urls: /\bhttps?:\/\/[^\s<>"')\]]+|\bwww\.[^\s<>"')\]]+/gi,
  numbers: /-?\d[\d,]*(?:\.\d+)?/g,
  hashtags: /#[\p{L}\d_]+/gu,
  mentions: /@[\w.]+/g,
  ips: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  dates: /\b\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}\b/g,
  phones: /\+?\d[\d\s().-]{7,}\d/g,
}

/** Pulls every match of a known pattern out into one per line. */
export function extract(text, { pattern = 'urls', unique = true, sort = false } = {}) {
  const re = PATTERNS[pattern]
  if (!re) return text
  let found = text.match(new RegExp(re.source, re.flags)) ?? []
  found = found.map((m) => m.trim())
  if (unique) found = [...new Set(found)]
  if (sort) found.sort((a, b) => a.localeCompare(b))
  return found.join('\n')
}

export const EXTRACT_PATTERNS = Object.keys(PATTERNS)

/** Strips the analytics parameters that make pasted links enormous. */
export function cleanUrls(text, { removeTracking = true, unshorten = false } = {}) {
  if (!removeTracking) return text
  const junk = /^(utm_\w+|fbclid|gclid|gbraid|wbraid|dclid|mc_[ce]id|_hs\w*|igshid|ref|ref_src|ref_url|si|spm|yclid|msclkid|ttclid|trk|trkCampaign|cmpid|campaign_id|s_kwcid|vero_\w+|oly_\w+|hsa_\w+|__s|_ga|scid)$/i

  return text.replace(/\bhttps?:\/\/[^\s<>"'\])]+/gi, (url) => {
    const hashIndex = url.indexOf('#')
    const hash = hashIndex >= 0 ? url.slice(hashIndex) : ''
    const withoutHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url
    const queryIndex = withoutHash.indexOf('?')
    if (queryIndex < 0) return url

    const base = withoutHash.slice(0, queryIndex)
    const kept = withoutHash
      .slice(queryIndex + 1)
      .split('&')
      .filter((pair) => pair && !junk.test(pair.split('=')[0]))

    void unshorten
    return base + (kept.length ? '?' + kept.join('&') : '') + hash
  })
}

/** Removes every digit. */
export function removeNumbers(text) {
  return text.replace(/\d/g, '')
}

/** Removes punctuation, leaving letters, digits and whitespace. */
export function removePunctuation(text, { keep = '' } = {}) {
  const allow = keep ? new Set(keep.split('')) : null
  return text.replace(/[\p{P}\p{S}]/gu, (ch) => (allow?.has(ch) ? ch : ''))
}

/** Removes every character in a user-supplied set. */
export function removeCharacters(text, { characters = '' } = {}) {
  if (!characters) return text
  return text.replace(new RegExp('[' + escapeRegExp(characters) + ']', 'g'), '')
}

/** Removes accents, emoji and anything else the user names. */
export function removeEmojiAndSymbols(text) {
  return text.replace(emojiRegex(), '')
}

/** Reverses the whole string, or each line, or the word order. */
export function reverse(text, { mode = 'characters' } = {}) {
  if (mode === 'lines') return text.split('\n').reverse().join('\n')
  if (mode === 'words') {
    return text.split('\n').map((l) => l.split(/(\s+)/).reverse().join('')).join('\n')
  }
  return [...text].reverse().join('')
}

export function urlEncode(text, { component = true } = {}) {
  try {
    return component ? encodeURIComponent(text) : encodeURI(text)
  } catch {
    return text
  }
}

export function urlDecode(text) {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '))
  } catch {
    return text
  }
}

function utf8Bytes(text) {
  return new TextEncoder().encode(text)
}

export function base64Encode(text) {
  const bytes = utf8Bytes(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function base64Decode(text) {
  try {
    const binary = atob(text.replace(/\s+/g, ''))
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return text
  }
}

/** Escapes the string so it can be pasted inside a JSON string literal. */
export function jsonEscape(text) {
  const json = JSON.stringify(text)
  return json.slice(1, -1)
}

export function jsonUnescape(text) {
  try {
    return JSON.parse('"' + text.replace(/\n/g, '\\n').replace(/(^|[^\\])"/g, '$1\\"') + '"')
  } catch {
    return text
  }
}

/** Turns a block of text into a single-line CSV field. */
export function toCsvField(text) {
  return '"' + text.replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"'
}
