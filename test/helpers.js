/**
 * Test helpers.
 *
 * Tests build awkward input from code points rather than pasting literal
 * characters, so a test that is about an invisible character actually says
 * which one it means.
 */

/** Builds a string from code points: `u(0x2019)` is a right single quote. */
export const u = (...codePoints) => String.fromCodePoint(...codePoints)

export const NBSP = u(0x00a0)
export const NNBSP = u(0x202f)
export const THIN_SPACE = u(0x2009)
export const IDEOGRAPHIC_SPACE = u(0x3000)
export const SOFT_HYPHEN = u(0x00ad)
export const ZWSP = u(0x200b)
export const LRM = u(0x200e)
export const BOM = u(0xfeff)
export const LINE_SEPARATOR = u(0x2028)

export const LSQUO = u(0x2018)
export const RSQUO = u(0x2019)
export const LDQUO = u(0x201c)
export const RDQUO = u(0x201d)
export const EN_DASH = u(0x2013)
export const EM_DASH = u(0x2014)
export const ELLIPSIS = u(0x2026)
export const BULLET = u(0x2022)
export const BLACK_CIRCLE = u(0x25cf)

export const FI = u(0xfb01)
export const FL = u(0xfb02)

export const E_ACUTE = u(0x00e9)
export const I_DIAERESIS = u(0x00ef)
export const O_SLASH = u(0x00d8)
export const SHARP_S = u(0x00df)
export const OE = u(0x0153)
export const EURO = u(0x20ac)
export const TRADEMARK = u(0x2122)

/** The three characters a right single quote becomes when double-encoded. */
export const MOJIBAKE_RSQUO = u(0x00e2, 0x20ac, 0x2122)
export const MOJIBAKE_LDQUO = u(0x00e2, 0x20ac, 0x0153)
export const MOJIBAKE_RDQUO = u(0x00e2, 0x20ac, 0x009d)

/** Raw Windows-1252 bytes that were never decoded. */
export const CP1252_RSQUO = u(0x0092)
export const CP1252_LDQUO = u(0x0093)
export const CP1252_RDQUO = u(0x0094)
