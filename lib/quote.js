/**
 * Pure helpers for building shell-safe codegraph command lines.
 *
 * The plugin's host half executes `codegraph <subcommand> …` through the
 * harness `shell` service, which runs the command string under `bash -c`.
 * Every dynamic token (symbol names, file paths, natural-language explore
 * queries) is single-quoted by {@link shquote}, so a query like
 * "how does $HOME resolve; show me `load`" reaches codegraph as ONE argument,
 * byte-for-byte, instead of being word-split or interpolated by bash.
 *
 * Everything here is pure data-in/data-out, which is what makes the quoting
 * testable: `test/quote.test.js` round-trips every builder's output through
 * a real `bash -c "set — …"` and asserts the parsed arguments equal the
 * originals.
 *
 * @module dsh-codegraph/quote
 */

/**
 * Quote one value for safe use as a single bash word.
 *
 * Uses single quotes, the only bash quoting in which NOTHING is special
 * except the closing quote itself; embedded single quotes are closed,
 * escaped, and reopened (`'\''`), the canonical POSIX idiom.
 *
 * @param {string} value - the token to quote (coerced with String()).
 * @returns {string} the quoted word.
 */
export function shquote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'"
}

/**
 * Render a token array as the full command string for the shell service.
 *
 * Numeric and flag tokens are passed through bare by the builders (they are
 * plugin-authored literals, never model input); every model-supplied token is
 * already quoted by the time it reaches this function.
 *
 * @param {string[]} parts - argv tokens (dynamic ones pre-quoted).
 * @returns {string} the `codegraph …` command line.
 */
export function commandFrom(parts) {
  return 'codegraph ' + parts.join(' ')
}

/**
 * Coerce an optional integer argument into a bare argv token, or leave the
 * flag off entirely when the argument is absent.
 *
 * @param {string[]} parts - argv accumulator.
 * @param {string} flag - the option flag, e.g. '-l'.
 * @param {number | undefined} value - the model-supplied integer, if any.
 */
function pushInt(parts, flag, value) {
  if (value === undefined) return
  parts.push(flag, String(Math.trunc(value)))
}

/** `codegraph query <search> [-l n] [-k kind] --json` */
export function queryArgs({ search, limit, kind }) {
  const parts = ['query', shquote(search), '-j']
  pushInt(parts, '-l', limit)
  if (kind !== undefined) parts.push('-k', shquote(kind))
  return parts
}

/** `codegraph callers <symbol> [-l n] --json` */
export function callersArgs({ symbol, limit }) {
  const parts = ['callers', shquote(symbol), '-j']
  pushInt(parts, '-l', limit)
  return parts
}

/** `codegraph callees <symbol> [-l n] --json` */
export function calleesArgs({ symbol, limit }) {
  const parts = ['callees', shquote(symbol), '-j']
  pushInt(parts, '-l', limit)
  return parts
}

/** `codegraph impact <symbol> [-d n] --json` */
export function impactArgs({ symbol, depth }) {
  const parts = ['impact', shquote(symbol), '-j']
  pushInt(parts, '-d', depth)
  return parts
}

/** `codegraph explore <query>` (text output; the CLI has no --json mode) */
export function exploreArgs({ query }) {
  return ['explore', shquote(query)]
}

/**
 * `codegraph node <symbol>` or `codegraph node -f <file> [--offset n]
 * [--limit n] [--symbols-only]` (text output).
 *
 * Exactly one of `name` / `file` is required; the exclusivity check lives
 * here so it fires as a tool error before any process is spawned.
 */
export function nodeArgs({ name, file, offset, limit, symbolsOnly }) {
  const parts = ['node']
  if (file !== undefined) {
    parts.push('-f', shquote(file))
    pushInt(parts, '--offset', offset)
    pushInt(parts, '--limit', limit)
    if (symbolsOnly === true) parts.push('--symbols-only')
  } else if (name !== undefined) {
    parts.push(shquote(name))
  } else {
    throw new Error('Provide either name (symbol) or file')
  }
  return parts
}

/** `codegraph status` (text output; human-readable statistics) */
export function statusArgs() {
  return ['status']
}

/** `codegraph sync` (text output) */
export function syncArgs() {
  return ['sync']
}
