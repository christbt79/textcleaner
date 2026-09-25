/**
 * Markup operations: HTML, the HTML Word and Outlook produce, and Markdown.
 *
 * Written as a string tokeniser rather than with DOMParser so the same code
 * runs in the browser and under `node --test`, and so a malformed fragment,
 * which is what a clipboard usually holds, still produces sensible output.
 */

/** Named entities, defined by code point so this file stays ASCII. */
const NAMED_ENTITY_CODE_POINTS = {
  amp: 0x26, lt: 0x3c, gt: 0x3e, quot: 0x22, apos: 0x27, nbsp: 0x00a0,
  copy: 0x00a9, reg: 0x00ae, trade: 0x2122, hellip: 0x2026,
  mdash: 0x2014, ndash: 0x2013, lsquo: 0x2018, rsquo: 0x2019,
  ldquo: 0x201c, rdquo: 0x201d, sbquo: 0x201a, bdquo: 0x201e,
  laquo: 0x00ab, raquo: 0x00bb, bull: 0x2022, middot: 0x00b7,
  deg: 0x00b0, plusmn: 0x00b1, frac12: 0x00bd, frac14: 0x00bc,
  frac34: 0x00be, times: 0x00d7, divide: 0x00f7, minus: 0x2212,
  euro: 0x20ac, pound: 0x00a3, yen: 0x00a5, cent: 0x00a2,
  sect: 0x00a7, para: 0x00b6, dagger: 0x2020, Dagger: 0x2021,
  permil: 0x2030, prime: 0x2032, Prime: 0x2033, lsaquo: 0x2039,
  rsaquo: 0x203a, oline: 0x203e, frasl: 0x2044, larr: 0x2190,
  uarr: 0x2191, rarr: 0x2192, darr: 0x2193, harr: 0x2194,
  rArr: 0x21d2, hArr: 0x21d4, ensp: 0x2002, emsp: 0x2003,
  thinsp: 0x2009, zwnj: 0x200c, zwj: 0x200d, shy: 0x00ad,
  eacute: 0x00e9, egrave: 0x00e8, agrave: 0x00e0, ccedil: 0x00e7,
  uuml: 0x00fc, ouml: 0x00f6, auml: 0x00e4, szlig: 0x00df,
  ntilde: 0x00f1, aacute: 0x00e1, iacute: 0x00ed, oacute: 0x00f3,
  uacute: 0x00fa, oslash: 0x00f8, aring: 0x00e5, aelig: 0x00e6,
  ecirc: 0x00ea, ocirc: 0x00f4, acirc: 0x00e2, icirc: 0x00ee,
  Eacute: 0x00c9, Ouml: 0x00d6, Uuml: 0x00dc, Auml: 0x00c4,
}

const NAMED_ENTITIES = new Map()
for (const [name, cp] of Object.entries(NAMED_ENTITY_CODE_POINTS)) {
  NAMED_ENTITIES.set(name, String.fromCodePoint(cp))
}
const NAMED_ENTITIES_LOWER = new Map()
for (const [name, value] of NAMED_ENTITIES) {
  if (!NAMED_ENTITIES_LOWER.has(name.toLowerCase())) {
    NAMED_ENTITIES_LOWER.set(name.toLowerCase(), value)
  }
}

/** Windows-1252 values for 0x80-0x9F, for numeric references that assume them. */
const CP1252_NUMERIC = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021,
  0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x008d, 0x017d, 0x008f,
  0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
]

/** Escaped characters become the characters they stand for. */
export function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]{1,31});/gi, (match, body) => {
    if (body[0] === '#') {
      const isHex = body[1] === 'x' || body[1] === 'X'
      let cp = isHex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return match
      // A numeric reference in this range almost always means cp1252.
      if (cp >= 0x80 && cp <= 0x9f) cp = CP1252_NUMERIC[cp - 0x80]
      try {
        return String.fromCodePoint(cp)
      } catch {
        return match
      }
    }
    return NAMED_ENTITIES.get(body) ?? NAMED_ENTITIES_LOWER.get(body.toLowerCase()) ?? match
  })
}

/** The reverse: escapes the characters that would break HTML. */
export function encodeEntities(text, { all = false } = {}) {
  const base = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
  if (!all) return base
  return base.replace(/[^\n\t -~]/g, (c) => '&#' + c.codePointAt(0) + ';')
}

const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'div', 'dd', 'dl', 'dt',
  'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3',
  'h4', 'h5', 'h6', 'header', 'hr', 'main', 'nav', 'ol', 'p', 'pre',
  'section', 'table', 'tbody', 'tfoot', 'thead', 'ul',
])

const LINE_TAGS = new Set(['br', 'tr'])

/**
 * Converts HTML to plain text, preserving block structure as line breaks.
 *
 * Handles the specific rubbish Word and Outlook produce: conditional comments,
 * namespaced office tags, XML islands and class-attribute soup.
 */
export function htmlToText(html, {
  keepLinks = false,
  listMarker = '- ',
  keepStructure = true,
} = {}) {
  let out = html
    // Office conditional comments and XML islands, then ordinary comments.
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<xml\b[\s\S]*?<\/xml>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!doctype[^>]*>/gi, '')
    // Elements whose text content is not content.
    .replace(/<(script|style|noscript|head|title|svg|math)\b[^>]*>[\s\S]*?<\/\1>/gi, '')

  if (keepLinks) {
    out = out.replace(
      /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi,
      (match, quote, href, inner) => {
        const label = inner.replace(/<[^>]*>/g, '').trim()
        if (!href || href.startsWith('#') || /^javascript:/i.test(href)) return label
        if (!label || label === href) return href
        return label + ' (' + href + ')'
      },
    )
  }

  if (keepStructure) {
    out = out
      .replace(/<li\b[^>]*>/gi, '\n' + listMarker)
      .replace(/<\/(?:td|th)>\s*(?=<(?:td|th)\b)/gi, '\t')
      .replace(/<hr\b[^>]*>/gi, '\n\n---\n\n')
  }

  out = out.replace(/<\/?([a-z][a-z0-9-]*)(?::[a-z0-9-]+)?\b[^>]*>/gi, (match, rawTag) => {
    if (!keepStructure) return ' '
    const tag = rawTag.toLowerCase()
    // The opening <li> was already replaced with its marker above, so anything
    // still here is a closing tag and must not add a second line break.
    if (tag === 'li') return ''
    if (LINE_TAGS.has(tag)) return '\n'
    if (BLOCK_TAGS.has(tag)) return '\n\n'
    return ''
  })

  out = decodeEntities(out)

  if (!keepStructure) return out.replace(/\s+/g, ' ').trim()

  return out
    .replace(/\r\n?/g, '\n')
    // Collapse runs of spaces, but never across a line break.
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Removes tags and keeps the text, with no structural interpretation. */
export function stripTags(text, { decode = true } = {}) {
  const stripped = text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]*>/g, '')
  return decode ? decodeEntities(stripped) : stripped
}

/** Removes Markdown syntax, leaving the prose. */
export function stripMarkdown(text) {
  return text
    .replace(/^```[\s\S]*?^```$/gm, (block) => block.split('\n').slice(1, -1).join('\n'))
    .replace(/`{1,3}([^`]+)`{1,3}/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}(?:[-*_]\s*){3,}$/gm, '')
    .replace(/(\*\*\*|___)(\S[\s\S]*?\S)\1/g, '$2')
    .replace(/(\*\*|__)(\S[\s\S]*?\S)\1/g, '$2')
    .replace(/(\*|_)(\S[\s\S]*?\S)\1/g, '$2')
    .replace(/~~(\S[\s\S]*?\S)~~/g, '$1')
    .replace(/^\s{0,3}\|.*\|\s*$/gm, (line) =>
      /^\s*\|[\s:|-]+\|\s*$/.test(line)
        ? ''
        : line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()).join('\t'))
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/\\([\\`*_{}[\]()#+\-.!])/g, '$1')
}

/** Converts basic HTML into Markdown, for moving copy into a repo or CMS. */
export function htmlToMarkdown(html) {
  const out = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|head)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (m, level, inner) =>
      '\n\n' + '#'.repeat(Number(level)) + ' ' + inner.replace(/<[^>]*>/g, '').trim() + '\n\n')
    .replace(/<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, '**$1**')
    .replace(/<(?:em|i)\b[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, '_$1_')
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
    .replace(/<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi,
      (m, quote, href, inner) => '[' + inner.replace(/<[^>]*>/g, '').trim() + '](' + href + ')')
    .replace(/<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/gi, '![]($2)')
    .replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (m, inner) =>
      '\n\n' + inner.replace(/<[^>]*>/g, '').trim().split('\n').map((l) => '> ' + l).join('\n') + '\n\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<hr\b[^>]*>/gi, '\n\n---\n\n')
    .replace(/<br\b[^>]*>/gi, '  \n')
    .replace(/<\/(?:p|div|ul|ol|table|tr|section|article)>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')

  return decodeEntities(out)
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** True when a string is likely to be HTML, rather than prose about HTML. */
export function looksLikeHtml(text) {
  return /<(?:p|div|span|br|a|ul|ol|li|table|tr|td|h[1-6]|strong|em|b|i|img|body|html|font|o:p)\b[^>]*>/i.test(text)
}
