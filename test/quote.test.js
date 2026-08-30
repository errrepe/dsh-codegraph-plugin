/**
 * Unit tests for lib/quote.js.
 *
 * The round-trip property is the one that matters: every builder's output is
 * parsed by a REAL `bash`, which re-poses the argument vector with `set --`,
 * and the parsed positionals must equal the intended argv exactly. This
 * exercises the actual interpreter the harness shell service uses, so any
 * quoting bug (word-splitting, `$` interpolation, backtick substitution,
 * embedded quotes) fails here instead of inside a model tool call.
 *
 * Run: node test/quote.test.js  (exit 0 = pass; any failure throws)
 *
 * @module dsh-codegraph/test/quote
 */

import { execFileSync } from 'node:child_process'
import {
  calleesArgs, callersArgs, commandFrom, exploreArgs, impactArgs, nodeArgs,
  queryArgs, shquote, statusArgs, syncArgs,
} from '../lib/quote.js'

let passed = 0

function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a !== b) throw new Error(`${label}\n  expected: ${b}\n  actual:   ${a}`)
  passed++
}

/** Hostile corpus: every metacharacter family, in one compact battery. */
const HOSTILE = [
  'plain',
  'with spaces',
  'with $dollar and `backtick`',
  "single'quote inside",
  'double"quote inside',
  'back\\slash',
  'semi;colon |pipe &and',
  'tab\tand\nnewline',
  'a b  c',
  "it's a \"test\" of everything $at once `yes` \\done",
  'wild*glob?chars[x]',
  'quote at end\'',
]

/**
 * Have bash parse an argv token list exactly as the shell service would, and
 * return the resulting positional parameters.
 *
 * The tokens arrive pre-shaped by the builders: dynamic values already
 * shquoted, flags and numbers bare. They are joined verbatim — this is the
 * same string `commandFrom` would put after `codegraph `.
 *
 * Arguments are NUL-separated on output: bash cannot hold a NUL inside a
 * positional parameter, so the separator is unambiguous even for hostile
 * values containing newlines or tabs.
 */
function parseArgv(tokens) {
  const script = 'set -- ' + tokens.join(' ')
    + '\nfor a in "$@"; do printf \'%s\\0\' "$a"; done'
  const out = execFileSync('bash', ['-c', script], { encoding: 'utf8' })
  const parts = out.split('\0')
  if (parts[parts.length - 1] === '') parts.pop()
  return parts
}

/** Inverse of shquote for the single-quoted idiom it emits. */
function unquote(word) {
  return word.slice(1, -1).replace(/'\\''/g, "'")
}

/** The argv a correct bash parse must produce from builder output. */
function expectedArgv(tokens) {
  return tokens.map((token) => (token.startsWith("'") ? unquote(token) : token))
}

// ── 1. shquote basics ──────────────────────────────────────────────────────

assertEqual(shquote("a'b"), "'a'\\''b'", 'shquote escapes embedded single quotes')
assertEqual(shquote(''), "''", 'shquote empty string')
assertEqual(shquote('$PATH'), "'$PATH'", 'shquote leaves dollar literals alone')

// ── 2. shquote round-trips every hostile value through real bash ───────────

for (const value of HOSTILE) {
  assertEqual(parseArgv([shquote(value)]), [value], `round-trip: ${JSON.stringify(value)}`)
}

// ── 3. Builder output round-trips as a whole argv ──────────────────────────

const BUILDER_CASES = [
  [{ search: 'Model', limit: 5, kind: 'class' }, queryArgs, 'query argv'],
  [{ search: "it's a $test `x`", limit: 3 }, queryArgs, 'query hostile search'],
  [{ symbol: 'load_model', limit: 2 }, callersArgs, 'callers argv'],
  [{ symbol: 'a b`c`$d' }, calleesArgs, 'callees hostile symbol'],
  [{ symbol: 'materialize_parameters_progressively', depth: 1 }, impactArgs, 'impact argv'],
  [{ query: 'how does $HOME resolve; show `load`' }, exploreArgs, 'explore hostile query'],
  [{ name: '_local_sharded_load' }, nodeArgs, 'node symbol argv'],
  [{ name: "weird 'sym' $name" }, nodeArgs, 'node hostile symbol'],
  [{ file: 'omlx/cluster/tensor_strategies.py', offset: 10, limit: 40, symbolsOnly: true }, nodeArgs, 'node file argv'],
  [{ file: "dir with spaces/file 'q'.py" }, nodeArgs, 'node hostile file'],
  [{}, statusArgs, 'status argv'],
  [{}, syncArgs, 'sync argv'],
]

for (const [input, builder, label] of BUILDER_CASES) {
  const argv = builder(input).slice(1) // drop the subcommand; keep flags+values
  assertEqual(parseArgv(argv), expectedArgv(argv), `builder round-trip: ${label}`)
}

// ── 4. commandFrom renders the full line ────────────────────────────────────

assertEqual(
  commandFrom(queryArgs({ search: 'a b' })),
  "codegraph query 'a b' -j",
  'commandFrom joins tokens with spaces',
)

// ── 5. nodeArgs exclusivity ────────────────────────────────────────────────

let threw = ''
try { nodeArgs({}) } catch (e) { threw = e.message }
assertEqual(threw, 'Provide either name (symbol) or file', 'nodeArgs without name or file throws')

// ── summary ────────────────────────────────────────────────────────────────

console.log(`quote.test.js: ${passed} assertions passed`)
