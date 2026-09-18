/**
 * A deliberately awful sample paste.
 *
 * It contains one of everything the tool detects, so a first-time visitor can
 * press Sample and watch the issue bar fill up. Built from code points so the
 * file stays ASCII, and so each problem is labelled by the constant that makes
 * it rather than being an invisible character in the source.
 */

const u = (...cp) => String.fromCodePoint(...cp)

const NBSP = u(0x00a0)
const ZWSP = u(0x200b)
const SOFT_HYPHEN = u(0x00ad)
const LSQUO = u(0x2018)
const RSQUO = u(0x2019)
const LDQUO = u(0x201c)
const RDQUO = u(0x201d)
const EM_DASH = u(0x2014)
const ELLIPSIS = u(0x2026)
const BULLET = u(0x2022)
const FI = u(0xfb01)
const FL = u(0xfb02)
const E_ACUTE = u(0x00e9)
const MOJIBAKE_RSQUO = u(0x00e2, 0x20ac, 0x2122)

export const SAMPLE_TEXT = [
  'Quarterly Review' + NBSP + '2024',
  '',
  'The committee' + RSQUO + 's report con' + SOFT_HYPHEN + 'firmed that the new work' + FL + 'ow',
  'reduced turnaround times by a signi' + FI + 'cant margin, and that the bene' + FI + 't',
  'was felt across every of' + FI + 'ce' + EM_DASH + 'including the smaller ones.',
  '',
  'Quarterly Review 2024',
  '12',
  '',
  BULLET + NBSP + ' First point, copied straight out of a slide deck' + ZWSP,
  BULLET + NBSP + ' Second point, with  two  spaces  everywhere ',
  BULLET + NBSP + ' Third point ' + ELLIPSIS + ' and a caf' + E_ACUTE + ' reference',
  '',
  '> On Tuesday the editor wrote:',
  '> ' + LDQUO + 'Please keep the wording as it stands, but check the',
  '> link before this goes anywhere near the printer.' + RDQUO,
  '',
  'Reference: https://example.com/report?id=42&utm_source=newsletter&utm_medium=email&fbclid=IwAR123',
  '',
  'And here is a line that came back from a CMS with It' + MOJIBAKE_RSQUO + 's own encoding problem.',
  '',
  'Quarterly Review 2024',
  '<p>Finally, a fragment of <strong>markup</strong> that came along for the ride.</p>',
  'Quarterly Review 2024',
].join('\n')
