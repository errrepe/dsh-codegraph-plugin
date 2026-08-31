# Changelog

All notable changes to `dsh-codegraph` will be documented in this file.

## [0.1.0] - 2026-08-30
### Added
- Initial release as DSH profile bundle (`dsh.bundle`).
- Eight codegraph CLI tools: `codegraph_query`, `codegraph_callers`, `codegraph_callees`, `codegraph_impact`, `codegraph_explore`, `codegraph_node`, `codegraph_status`, `codegraph_sync`.
- Session-cwd anchoring with standing sandbox policy (WAL SQLite support).
- POSIX single-quote shell quoting with real `bash` round-trip tests (29 assertions).
- Fail-soft `defineTool` resolution via `createRequire(entry)` fallback for `link:` installs.
