# lib

- `index.js` — host half: registers the eight tools, resolves `defineTool` from the harness graph, anchors every CLI invocation to `exec.agent.session.header.cwd` under the session's standing sandbox policy.
- `quote.js` — pure argv builders with `shquote()` single-quote escaping; tested by real `bash -c` round-trips.
