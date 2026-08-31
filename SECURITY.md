# Security

This plugin shells out to the local `codegraph` CLI. It does not exfiltrate code.

- Commands run in the calling session's workspace under that session's sandbox policy.
- No network access is performed by the plugin itself.
- Arguments are POSIX single-quote escaped; see `test/quote.test.js` (real bash round-trip).

Report issues via GitHub Issues.
