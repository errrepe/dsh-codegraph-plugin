# Changelog

All notable changes to `dsh-codegraph` will be documented in this file.

## [0.2.0] - 2026-08-31
### Added
- Settings/Plugins: card `settings.plugin.item` com `key: codegraph` em **Settings > Plugins** (aba Configuráveis). Dois toggles persistidos no namespace `codegraph` em `~/.dsh/settings.yaml`: `enabled` (padrão `true`, desliga as oito tools com mensagem guiada) e `injectPrompt` (padrão `true`, controla a seção de prompt).
- System prompt: seção `codegraph-guidance` ordem 50 que injeta o digest de uso do `colbymchenry/codegraph` (ver `CODEGRAPH_PROMPT` em `lib/index.js`) — ensina o modelo a verificar `codegraph_status`, preferir `codegraph_explore` em um shot, seguir `query`→`node`, mapear impacto antes de refatorar e rodar `sync` após editar. Vazia quando `enabled` é `false`.
- Browser half `lib/client.js` (`window.__ModuleLoader__.load({id:"dsh-codegraph"})`) com bridge loopback `POST /api/dsh-codegraph/describe|mutate` e estilos com tokens `--dsw-alias-*` para temas claro/escuro e layout compacto.
- `dsh.client` em `package.json` (`platform: web`) e exports `./client`.

## [0.1.0] - 2026-08-30
### Added
- Initial release as DSH profile bundle (`dsh.bundle`).
- Eight codegraph CLI tools: `codegraph_query`, `codegraph_callers`, `codegraph_callees`, `codegraph_impact`, `codegraph_explore`, `codegraph_node`, `codegraph_status`, `codegraph_sync`.
- Session-cwd anchoring with standing sandbox policy (WAL SQLite support).
- POSIX single-quote shell quoting with real `bash` round-trip tests (29 assertions).
- Fail-soft `defineTool` resolution via `createRequire(entry)` fallback for `link:` installs.
