/**
 * Host half of dsh-codegraph: a DSH profile bundle exposing the installed
 * `codegraph` CLI (https://github.com/colbymchenry/codegraph) as eight
 * model-facing tools.
 *
 * Design notes — each encodes a lesson from building and testing the
 * dynamic-plugin prototype this bundle replaces:
 *
 *   - The CLI is a prerequisite, not a dependency. `codegraph` must be on the
 *     PATH of the shell that boots the profile; a missing CLI surfaces as the
 *     CLI's own "command not found" inside a tool error, never a failed boot.
 *   - The session cwd IS the project. Every command anchors `workdir` to the
 *     calling session's own cwd, so the index that is read/written is the one
 *     in the workspace the model is working on — including the session's
 *     standing sandbox policy, without which the CLI's WAL-mode SQLite cannot
 *     even open for reading inside a confined workspace.
 *   - `defineTool` is borrowed, not imported. It lives in the harness's own
 *     module graph (`@deepseek-ai/dsh-tools`), which is not a resolvable
 *     dependency of a third-party bundle; the two-step probe (bare specifier,
 *     then resolve from the harness entry script) is the community pattern
 *     (see dsh-bill's hostkit), and the `link:`ed-checkout install layout is
 *     exactly the case the second step exists for.
 *   - Registration is fail-soft. `ctx.inject(['shell', 'tools'], …)` waits for
 *     both registries in a child fiber (no load-order race), and every
 *     registration is individually guarded: a third-party plugin may lose its
 *     own tools, never the harness boot.
 *
 * @module dsh-codegraph
 */

import {
  calleesArgs, callersArgs, commandFrom, exploreArgs, impactArgs, nodeArgs,
  queryArgs, statusArgs, syncArgs,
} from './quote.js'

/** Foreground command budget; indexing a large repo is the slow case. */
const TIMEOUT_MS = 120000

/** Settings namespace id — persisted in ~/.dsh/settings.yaml. */
const CODEGRAPH_NS_RAW = 'codegraph'
const BRIDGE_PREFIX = '/api/dsh-codegraph'
const MAX_JSON_BODY_BYTES = 64 * 1024

/** Prompt digest injected via systemPrompt.section order 50. */
const CODEGRAPH_PROMPT = [
  '# Codegraph — use the graph before you grep',
  '',
  'Codegraph is a prebuilt knowledge graph of the current workspace (every symbol, call edge, and dependency) stored in .codegraph/. It gives surgical context without file-by-file search.',
  '',
  'Rules:',
  '1. Before any code search or exploration, call codegraph_status to verify the index exists. If it reports no index, run `codegraph init` in bash at the project root, then retry.',
  '2. For open-ended questions ("how does X work", "trace flow from A to B", "explore area Y"), call codegraph_explore first. One call returns relevant symbols, verbatim source grouped by file, call paths between them, and a blast-radius summary.',
  '3. For symbol lookup, call codegraph_query. For full source plus caller/callee trail, follow with codegraph_node.',
  '4. Before changing a symbol, call codegraph_callers or codegraph_impact to map downstream dependents and covering tests.',
  '5. After any file edit, call codegraph_sync so the next query reflects the new code.',
  '6. Prefer codegraph_* tools over grep, glob, or manual file reads for code discovery. Use bash search only for non-code text or when codegraph_status shows no index.',
].join('\n')

/**
 * Import a package that exists only inside the harness's own module graph.
 *
 * Two attempts, because there are two ways this bundle gets mounted:
 *
 *   1. Installed normally, it sits in the profile's `node_modules` and a bare
 *      specifier resolves its `@deepseek-ai/*` siblings the ordinary way.
 *   2. Installed from a local path (`dsh plugin add /path/to/this/repo`), the
 *      layout used to develop this very plugin: pnpm links it, Node resolves
 *      the symlink to the real path first, so the lookup walks up from the
 *      CHECKOUT and never sees the profile's `node_modules` at all.
 *
 * The fallback resolves from `process.argv[1]` — the harness entry script —
 * i.e. "resolve from where the host resolves". Resolves to `null` rather
 * than throwing on either failure, so the boot can never be taken down.
 */
async function optionalHostImport(specifier) {
  try {
    return await import(specifier)
  } catch { /* fall through to the host-entry attempt */ }
  const entry = process.argv[1]
  if (typeof entry !== 'string' || entry === '') return null
  try {
    const { createRequire } = await import('node:module')
    const { pathToFileURL } = await import('node:url')
    const resolved = createRequire(entry).resolve(specifier)
    return await import(pathToFileURL(resolved).href)
  } catch {
    return null
  }
}

//#region bridge helpers

function writeJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'referrer-policy': 'no-referrer',
  })
  res.end(payload)
}

async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_JSON_BODY_BYTES) return undefined
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return undefined
  }
}

function isLoopbackRequest(request) {
  const address = request.socket.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  const host = request.headers.host
  if (typeof host !== 'string') return false
  let hostUrl
  try {
    hostUrl = new URL('http://' + host)
  } catch {
    return false
  }
  if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]') return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

function makeBridgeRoutes(settings, ns) {
  const findDescriptor = () =>
    settings
      .describe({ redactSecrets: true })
      .find((candidate) => String(candidate.ns) === String(ns))

  const describe = async () => {
    const descriptor = findDescriptor()
    if (descriptor === undefined) {
      return { ok: false, code: 'settings-not-exposed', message: 'settings namespace "' + String(ns) + '" is not exposed' }
    }
    return { ok: true, value: descriptor.value, revision: descriptor.revision }
  }

  const mutate = async (body) => {
    if (body === undefined || body === null || typeof body !== 'object' || !Array.isArray(body.ops)) {
      return { ok: false, code: 'settings-rejected', message: 'malformed bridge settings request' }
    }
    const expectedRevision = typeof body.expectedRevision === 'number' ? body.expectedRevision : undefined
    try {
      await settings.mutate(ns, body.ops, expectedRevision)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (error?.code === 'settings-conflict' || message.includes('conflict')) {
        return { ok: false, code: 'settings-conflict', message }
      }
      return { ok: false, code: 'settings-write-failed', message }
    }
    const descriptor = findDescriptor()
    if (descriptor === undefined) {
      return { ok: false, code: 'internal', message: 'settings namespace "' + String(ns) + '" was disposed after the mutate' }
    }
    return { ok: true, value: descriptor.value, revision: descriptor.revision }
  }

  const guard = (req, res) => {
    if (!isLoopbackRequest(req)) {
      writeJson(res, 403, { error: 'loopback requests only' })
      return false
    }
    if (req.method !== 'POST') {
      writeJson(res, 405, { error: 'method not allowed: ' + (req.method ?? '') })
      return false
    }
    return true
  }

  return [
    {
      kind: 'exact',
      path: BRIDGE_PREFIX + '/describe',
      handler: async (req, res) => {
        if (!guard(req, res)) return
        writeJson(res, 200, await describe())
      },
    },
    {
      kind: 'exact',
      path: BRIDGE_PREFIX + '/mutate',
      handler: async (req, res) => {
        if (!guard(req, res)) return
        const body = await readJsonBody(req)
        writeJson(res, 200, await mutate(body))
      },
    },
  ]
}

//#endregion

export default {
  name: 'dsh-codegraph',
  inject: [],

  apply(ctx, rawConfig) {
    let current = () => {
      const base = rawConfig ?? {}
      return {
        enabled: base.enabled !== false,
        injectPrompt: base.injectPrompt !== false,
      }
    }
    let refreshPrompt = null

    ;(async () => {
      const settingsMod = await optionalHostImport('@deepseek-ai/dsh-settings')
      const zMod = await optionalHostImport('@deepseek-ai/schemastery')
      if (!settingsMod || !zMod) {
        ctx.logger?.warn?.('dsh-codegraph: settings or schemastery unreachable — using fallback config')
        return
      }
      const z = zMod.default ?? zMod.z ?? zMod
      const settingsNamespace = settingsMod.settingsNamespace ?? settingsMod.default?.settingsNamespace
      const installSettingsSection = settingsMod.installSettingsSection ?? settingsMod.default?.installSettingsSection
      if (typeof settingsNamespace !== 'function') {
        ctx.logger?.warn?.('dsh-codegraph: settingsNamespace not found — using fallback config')
        return
      }
      let ns
      try {
        ns = settingsNamespace(CODEGRAPH_NS_RAW)
      } catch (e) {
        ctx.logger?.warn?.('dsh-codegraph: settingsNamespace failed — ' + (e?.message ?? e))
        return
      }
      let Config
      try {
        Config = z.object({
          enabled: z.boolean().default(true),
          injectPrompt: z.boolean().default(true),
        })
      } catch (e) {
        ctx.logger?.warn?.('dsh-codegraph: schema build failed — ' + (e?.message ?? e))
        return
      }
      try {
        if (typeof installSettingsSection === 'function') {
          installSettingsSection(ctx, ns, Config, rawConfig ?? {}, {
            setSource: (source) => {
              current = source
            },
            onChange: () => {
              if (typeof refreshPrompt === 'function') refreshPrompt()
            },
          })
        } else {
          ctx.inject(['settings'], (scoped) => {
            try {
              const scope = scoped.settings.register(ns, Config, { base: rawConfig ?? {} })
              current = () => scope.get()
              scope.watch(() => {
                if (typeof refreshPrompt === 'function') refreshPrompt()
              })
              scoped.effect(() => () => {
                current = () => {
                  const base = rawConfig ?? {}
                  return { enabled: base.enabled !== false, injectPrompt: base.injectPrompt !== false }
                }
                if (typeof refreshPrompt === 'function') refreshPrompt()
              })
            } catch (e) {
              ctx.logger?.warn?.('dsh-codegraph: settings.register failed — ' + (e?.message ?? e))
            }
          })
        }
      } catch (e) {
        ctx.logger?.warn?.('dsh-codegraph: installSettingsSection failed — ' + (e?.message ?? e))
      }
    })()

    ctx.inject(['systemPrompt'], (sctx) => {
      let dispose = null
      refreshPrompt = () => {
        if (dispose) {
          try { dispose() } catch {}
          dispose = null
        }
        dispose = sctx.systemPrompt.section({
          name: 'codegraph-guidance',
          order: 50,
          text: () => {
            try {
              const cfg = current()
              const enabled = cfg.enabled !== false
              const injectPrompt = cfg.injectPrompt !== false
              return (enabled && injectPrompt) ? CODEGRAPH_PROMPT : ''
            } catch {
              return ''
            }
          },
        })
      }
      sctx.effect(() => {
        refreshPrompt()
        return () => {
          if (dispose) {
            try { dispose() } catch {}
            dispose = null
          }
        }
      }, 'codegraph: prompt section')
    })

    ctx.inject(['webServer', 'settings'], (sctx) => {
      sctx.effect(() => {
        let disposers = []
        let cancelled = false
        ;(async () => {
          const settingsMod = await optionalHostImport('@deepseek-ai/dsh-settings')
          if (cancelled) return
          const fn = settingsMod?.settingsNamespace ?? settingsMod?.default?.settingsNamespace
          if (typeof fn !== 'function') return
          let ns
          try { ns = fn(CODEGRAPH_NS_RAW) } catch { return }
          if (cancelled) return
          try {
            const routes = makeBridgeRoutes(sctx.settings, ns)
            disposers = routes.map((route) => sctx.webServer.register(route))
          } catch (e) {
            sctx.logger?.warn?.('dsh-codegraph: bridge register failed — ' + (e?.message ?? e))
          }
        })()
        return () => {
          cancelled = true
          for (const d of disposers) {
            try { d() } catch {}
          }
        }
      }, 'codegraph: settings bridge')
    })

    ctx.inject(['shell', 'tools'], (child) => {
      optionalHostImport('@deepseek-ai/dsh-tools').then((mod) => {
        if (!mod || typeof mod.defineTool !== 'function') {
          console.warn('dsh-codegraph: @deepseek-ai/dsh-tools unreachable — tools not registered')
          return
        }
        for (const tool of buildTools(child, current)) {
          try {
            child.effect(() => child.tools.register(tool), 'register ' + tool.name)
          } catch (error) {
            console.warn('dsh-codegraph: ' + tool.name + ' not registered —', error?.message ?? error)
          }
        }
      })
    })
  },
}

/**
 * Resolve the session's standing sandbox policy for one tool execution.
 *
 * The CLI's index is a WAL-mode SQLite database in the project's `.codegraph`
 * directory: even read-only queries must create the `-wal`/`-shm` files, which
 * a confined executor permits only inside the policy's workspace root.
 * Resolving per-call (not once at apply) is what keeps the boundary attached
 * to the calling session rather than to whichever session booted first.
 */
function standingPolicy(child, exec) {
  const svc = child.get('sandboxPolicy')
  if (svc === undefined) return undefined
  if (exec.agent === undefined) return svc.resolve()
  return svc.resolve({ session: exec.agent.session })
}

/** The calling session's cwd — the project whose index the tools address. */
function sessionCwd(exec) {
  const cwd = exec.agent && exec.agent.session ? exec.agent.session.header.cwd : undefined
  if (typeof cwd !== 'string' || cwd === '') {
    throw new Error('codegraph tools require an Agent-backed session (no session cwd to anchor the project)')
  }
  return cwd
}

/**
 * Run one codegraph command line in the session workspace.
 *
 * @returns {{exitCode: number|null, stdout: string, stderr: string,
 *            truncated: boolean, spillPath?: string}} plain JSON-safe facts.
 */
async function run(child, exec, parts) {
  const cwd = sessionCwd(exec)
  const policy = standingPolicy(child, exec)
  const request = {
    command: commandFrom(parts),
    workdir: cwd,
    timeoutMs: TIMEOUT_MS,
    ...(policy !== undefined ? { sandboxPolicy: policy } : {}),
  }
  const shell = child.get('shell')
  if (shell === undefined) throw new Error('codegraph tools require the shell service')
  const result = await shell.run(shell.resolve(request))
  if (result.aborted) {
    const error = new Error('tool call aborted')
    error.name = 'AbortError'
    throw error
  }
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.text,
    stderr: result.stderr.text,
    truncated: result.stdout.truncated === true,
    ...(typeof result.stdout.spillPath === 'string' ? { spillPath: result.stdout.spillPath } : {}),
  }
}

/** Human-facing prefix for a non-zero CLI exit. */
function failure(r) {
  return 'codegraph exited with code ' + r.exitCode + ': ' + (r.stderr || r.stdout).slice(0, 500)
}

/** Run a --json command; return its decoded payload inside a typed envelope. */
async function runJson(child, exec, parts) {
  const r = await run(child, exec, parts)
  if (r.exitCode !== 0) throw new Error(failure(r))
  let payload
  try {
    payload = JSON.parse(r.stdout)
  } catch {
    throw new Error('codegraph output was not valid JSON: ' + r.stdout.slice(0, 300))
  }
  // codegraph emits either a bare array (query) or a bare object (callers/
  // callees/impact). Wrap both in one envelope whose fixed `ok` marker matches
  // the declared output schema; the original shape rides along under `result`.
  return { ok: true, result: payload }
}

/** Run a text-mode command; return its trimmed stdout in the envelope. */
async function runText(child, exec, parts) {
  const r = await run(child, exec, parts)
  if (r.exitCode !== 0) throw new Error(failure(r))
  const text = (r.stdout || '').trim()
  return {
    ok: true,
    text: text.length > 0 ? text : (r.stderr || '').trim(),
    ...(r.truncated ? { truncated: true, spillPath: r.spillPath } : {}),
  }
}

/**
 * Shared definition skeleton.
 *
 * Output channel: the raw JSON envelope is kept in the structured value
 * (available for follow-up questions without a second CLI call), while the
 * render the model actually reads is the pretty-printed body. The envelope's
 * fixed marker `ok` pins the schema; everything else rides along under an
 * open object (`additionalProperties: true`), because codegraph's JSON
 * shapes vary by command and node kind.
 */
function tool(name, description, parameters, execute) {
  return {
    name,
    description,
    parameters,
    output: {
      schema: {
        type: 'object',
        properties: { ok: { type: 'boolean' } },
        required: ['ok'],
        additionalProperties: true,
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    execute,
  }
}

/** Throw if the plugin is disabled via Settings/Plugins. */
function assertEnabled(current) {
  try {
    const cfg = current()
    if (cfg.enabled === false) {
      throw new Error('Codegraph is disabled in Settings > Plugins. Enable it there to use codegraph tools.')
    }
  } catch (e) {
    if (e && typeof e.message === 'string' && e.message.includes('disabled in Settings')) throw e
  }
}

/** Build the eight tool definitions against one plugin fiber. */
function buildTools(child, current) {
  const PREFIX = 'Requires the project to have a .codegraph index; run `codegraph init` in bash first if missing. After editing files, run codegraph_sync so queries reflect the current code.'

  return [
    tool('codegraph_query',
      'Search for symbols (functions, classes, methods) in the indexed codebase. Returns matching symbols with kind, qualified name, file path, line range, signature, and relevance score. ' + PREFIX,
      {
        search: { type: 'string', required: true, description: 'Symbol name or fragment to search for' },
        limit: { type: 'integer', description: 'Maximum results (default 10)' },
        kind: { type: 'string', description: 'Filter by node kind: function, method, class, field, variable, etc.' },
      },
      (args, exec) => { assertEnabled(current); return runJson(child, exec, queryArgs(args)) }),

    tool('codegraph_callers',
      'Find all functions/methods that call a specific symbol. The first step of impact analysis before changing a function. ' + PREFIX,
      {
        symbol: { type: 'string', required: true, description: 'Symbol name to find callers of' },
        limit: { type: 'integer', description: 'Maximum results (default 20)' },
      },
      (args, exec) => { assertEnabled(current); return runJson(child, exec, callersArgs(args)) }),

    tool('codegraph_callees',
      'Find all functions/methods that a specific symbol calls. ' + PREFIX,
      {
        symbol: { type: 'string', required: true, description: 'Symbol name to find callees of' },
        limit: { type: 'integer', description: 'Maximum results (default 20)' },
      },
      (args, exec) => { assertEnabled(current); return runJson(child, exec, calleesArgs(args)) }),

    tool('codegraph_impact',
      'Analyze what code is affected by changing a symbol: downstream dependents traversed up to a depth, including covering tests. ' + PREFIX,
      {
        symbol: { type: 'string', required: true, description: 'Symbol name to analyze impact for' },
        depth: { type: 'integer', description: 'Traversal depth (default 2)' },
      },
      (args, exec) => { assertEnabled(current); return runJson(child, exec, impactArgs(args)) }),

    tool('codegraph_explore',
      'Explore an area of the codebase: relevant symbols, their verbatim source, call paths, and a blast-radius list of dependents — in one shot. Use this to understand unfamiliar code before editing it. ' + PREFIX,
      {
        query: { type: 'string', required: true, description: 'Area or topic to explore (natural language)' },
      },
      (args, exec) => { assertEnabled(current); return runText(child, exec, exploreArgs(args)) }),

    tool('codegraph_node',
      "Read one symbol's full source plus its caller/callee trail, or read a file with line numbers and its dependent symbols. Use after a query/explore hit to get the complete source. " + PREFIX,
      {
        name: { type: 'string', description: 'Symbol name (e.g. function or class name)' },
        file: { type: 'string', description: 'Treat as file mode: read this file instead of a symbol' },
        offset: { type: 'integer', description: 'File mode: 1-based start line' },
        limit: { type: 'integer', description: 'File mode: maximum lines' },
        symbolsOnly: { type: 'boolean', description: 'File mode: return just the symbol map + dependents' },
      },
      (args, exec) => { assertEnabled(current); return runText(child, exec, nodeArgs(args)) }),

    tool('codegraph_status',
      'Show the codegraph index status and statistics: file count, node/edge counts, per-kind and per-language breakdown, and whether the index exists. Read-only. ' + PREFIX,
      {},
      (_args, exec) => { assertEnabled(current); return runText(child, exec, statusArgs()) }),

    tool('codegraph_sync',
      'Sync the codegraph index with changes since the last indexing. Run after editing files so subsequent queries reflect the current code. ' + PREFIX,
      {},
      (_args, exec) => { assertEnabled(current); return runText(child, exec, syncArgs()) }),
  ]
}
