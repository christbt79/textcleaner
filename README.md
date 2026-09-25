# Format My Text

An all-in-one text cleaner and formatter. Paste something that came out of a
PDF, Word, InDesign, an email or a web page, and get text that behaves when you
paste it somewhere else.

It runs entirely in the browser. No server, no build step, no dependencies, no
network requests, no analytics. The text never leaves the tab.

## How it works

Paste, then copy. That is the whole job.

1. **Paste anywhere on the page.** The text is cleaned the moment it lands.
   There is one box, and what is in it is already the clean version.
2. **Read the line under the box.** It says in plain English what was fixed,
   for example *Fixed 4 non-breaking spaces, 2 invisible characters and 3 curly
   quotes*. *Show original* puts your paste back on screen with each of those
   characters highlighted, so you can see exactly where they were.
3. **Press Copy clean text** (or Ctrl/Cmd + Enter). The clipboard gets plain
   text only, which is what stops formatting following it into the next
   application.

### Always fixed

Garbled characters (an apostrophe that arrives as three strange symbols),
invisible and control characters, non-breaking and other odd spaces, joined-up
letters from PDFs such as *fi* and *fl*, curly quotes and long dashes, double
spaces, spaces at the ends of lines and extra blank lines. The shape of the
text is left alone: line breaks stay where they were unless you ask otherwise.

### Four switches

| Switch | For |
| --- | --- |
| Join broken lines | PDFs and emails, where lines break mid-sentence. Also removes page numbers, repeated headers and `>` reply markers. |
| Remove bullets and numbering | Lists copied from slides, Word or web pages. |
| Keep curly quotes | Text going into InDesign or Word, where typographic quotes and dashes are wanted. |
| One line | A form field or a spreadsheet cell. |

Switches are remembered between visits. Turning one on or off re-cleans your
original paste, so nothing is ever lost by trying one.

If the app spots something a switch would fix (lines breaking mid-sentence, or
HTML tags in the text) it says so under the box, with a button to fix it.

### More tools

One-off actions, each undoable: UPPER, lower, Sentence and Title case; sort
lines; remove duplicate or empty lines; find and replace (plain text or regular
expressions); strip HTML tags; reduce to plain ASCII. Undo takes back pastes,
switches and tools alike.

### Details worth knowing

- **Nothing leaves the browser.** No server, no account, no analytics. The
  switches and theme are remembered; the text never is.
- **Cleaning is idempotent.** Cleaning clean text changes nothing, under every
  combination of switches. There is a test for it.
- **It works offline.** A service worker caches the app on first visit, and it
  is installable as a standalone app.
- **Counts along the bottom of the box**: words, characters with and
  without spaces, paragraphs and lines, for the clean text you are about to
  copy. Handy for anything with a character limit.
- **Light by default.** The moon button in the top bar switches to dark, and
  the choice is remembered.
- **Typing is allowed.** Edit the text by hand and the app steps back; a paste
  while you are editing goes in at the cursor, cleaned.

## Running it

There is nothing to build.

```sh
npm start          # serves the folder at http://localhost:8080
npm test           # the test suite, no dependencies
```

Any static server works, and opening `index.html` through a server (rather than
`file://`) is needed because the app is ES modules.

## Deploying

The live site is **https://formatmytext.netlify.app**.

**Netlify.** Connect the repository. `netlify.toml` sets the publish directory
to the repository root, an empty build command and the security headers. Or
drag the folder onto the Netlify dashboard.

**Render.** Connect the repository and pick *Static Site*. `render.yaml`
already describes it: no build command, the repository root as the publish
path.

**Anywhere else.** Copy the folder onto any static host. There is no
server-side anything.

The content security policy in `netlify.toml` and `_headers` is deliberately
tight: `default-src 'none'`, scripts and styles from the site only, and no
outbound connections. If a future change ever tried to send text somewhere,
the browser would refuse.

## How the code is laid out

```
index.html            the page
styles/app.css        the whole stylesheet
src/core/             pure text processing, no DOM, runs under node --test
  chars.js              every special character, defined by code point
  cleaner.js            what the app does: the always-on fixes, the four
                        switches, the tools, the summary line, suggestions
  ops/                  the individual operations, grouped by what they act on
  pipeline.js           the registry and the fixed order operations run in
  scan.js               problem detection, used for the summary and suggestions
  stats.js              word and character counts
src/ui/               DOM helpers, the Show original view, the example text
src/main.js           the page: state, rendering and events
test/                 the tests
sw.js                 offline caching
```

`src/core` never touches the DOM, which is why the test suite needs no browser
and no test framework beyond what Node ships with.

### No literal non-ASCII characters anywhere

Every special character in this repository is written as a code point and built
at load time. A test walks the whole repository and fails if a literal
non-ASCII character appears in any source file.

This is not fussiness. A tool that removes invisible characters should not have
any hiding in its own source, and the code has to survive being copied, pasted
and diffed as badly as anything a user will throw at it. It also caught a real
bug during development: an escape sequence that had been silently turned into a
literal U+2028, which is a line terminator in JavaScript and broke the file.
