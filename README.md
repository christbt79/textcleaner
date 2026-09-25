# Textcleaner

An all-in-one text cleaner and formatter. Paste something that came out of a
PDF, Word, InDesign, an email or a web page, and get text that behaves when you
paste it somewhere else.

It runs entirely in the browser. No server, no build step, no dependencies, no
network requests, no analytics. The text never leaves the tab.

## What it does

**It tells you what is wrong before it changes anything.** The bar across the
top names the actual problems in what you pasted, with a count for each:
four non-breaking spaces, two invisible characters, a word split by PDF
hyphenation, a running head repeating eleven times. Each one switches on the
operation that fixes it, or you can press *Fix everything*.

**Presets for where the text came from.** *From a PDF* rejoins hyphenated
words, undoes column wrapping and drops page numbers and running heads. *From
Word or Docs* flattens smart quotes, non-breaking spaces and auto-bullets.
*From an email* strips reply markers and mail-client wrapping. *Ready for
InDesign* goes the other way and puts proper typographic quotes and dashes in.
*Ready for code or CMS* reduces everything to plain ASCII.

**Reveal hidden** marks up the characters you cannot see. An ordinary space is
a faint dot; a non-breaking space is outlined in red, because that is the one
you are hunting for.

**A character inspector** at the foot of the window lists every unusual
character in the text, by name and code point, with a count. When something is
misbehaving and nothing else explains it, this does.

### Operations

Around fifty, in eight groups:

| Group | What is in it |
| --- | --- |
| Strip markup | HTML to text, tags only, HTML to Markdown, strip Markdown, entities both ways |
| Repair characters | Mojibake, undecoded Windows-1252 bytes, Unicode normalisation, invisible and control characters, non-breaking spaces, ligatures, accents, emoji, ASCII-only |
| Quotes, dashes and symbols | Straighten or smarten quotes and dashes, spell out symbols, strip URL tracking |
| Lines and paragraphs | Unwrap PDF and email wrapping, rejoin hyphenated words, remove line breaks, email quote markers, list markers, page numbers, running heads, blank lines, duplicates, filter, sort |
| Spacing | Tabs and spaces both ways, collapse runs, trim, space around punctuation, sentence spacing |
| Find and replace | Plain text or regular expressions with capture groups, several rules in order, remove characters, punctuation or digits, extract URLs, emails, numbers and more |
| Case | Sentence, Title, Capital, UPPER, lower, tOGGLE, camelCase, PascalCase, snake_case, kebab-case, CONSTANT_CASE, dot.case, slug |
| Output format | Wrap at a column, prefix and suffix, line numbering, join and split on a delimiter, reverse, URL, Base64, JSON and CSV encoding |

### Details worth knowing

- **The order never depends on what you clicked.** Operations always run in
  pipeline order: markup, then characters, then lines, then spacing, then
  find-and-replace, then case, then formatting. Toggling things on and off in a
  different order always gives the same result.
- **Cleaning is idempotent.** Running any preset twice gives the same answer as
  running it once. There is a test for it.
- **Copy writes plain text only**, which is the whole point: a rich clipboard
  entry is what carries formatting into the next application.
- **An operation that fails cannot lose your text.** It is reported in the
  status bar under the output and the pipeline carries on.
- **It works offline.** A service worker caches the app on first visit, and it
  is installable as a standalone app.
- **Recipes are shareable.** *Copy recipe link* produces a URL that restores
  the operation selection. It carries the settings only, never the text.

## Running it

There is nothing to build.

```sh
npm start          # serves the folder at http://localhost:8080
npm test           # 85 tests, no dependencies
```

Any static server works, and opening `index.html` through a server (rather than
`file://`) is needed because the app is ES modules.

## Deploying

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
  ops/                  the operations, grouped by what they act on
  pipeline.js           the registry and the fixed order they run in
  presets.js            named starting points per paste source
  scan.js               problem detection, and which operation fixes each
  stats.js              counts, reading time, word frequency
src/ui/               DOM rendering and state
src/main.js           wiring
test/                 85 tests
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
