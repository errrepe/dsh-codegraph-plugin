# lib

- `index.js` — host half: registers the eight tools, resolves `defineTool` from the harness graph, anchors every CLI invocation to `exec.agent.session.header.cwd` under the session's standing sandbox policy. Also owns the `codegraph` settings namespace (`enabled`, `injectPrompt`), the `codegraph-guidance` systemPrompt section (order 50), and the loopback bridge `/api/dsh-codegraph/describe|mutate`.
- `client.js` — browser half: `window.__ModuleLoader__.load({id:"dsh-codegraph"})` that registers `settings.plugin.item` with `key: "codegraph"` for Settings > Plugins. Card shows Ativado/Desativado toggle and "Instruir o modelo" toggle, persists to `~/.dsh/settings.yaml`.
- `quote.js` — pure argv builders with `shquote()` single-quote escaping; tested by real `bash -c` round-trips.
