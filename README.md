# dsh-codegraph

[DSH](https://github.com/deepseek-ai) (DeepSeek Harness) profile bundle que expõe o [`codegraph`](https://github.com/colbymchenry/codegraph) como oito tools de inteligência de código para o modelo. O plugin mantém um índice do workspace atual em sincronismo e dá ao agente busca de símbolos, análise de chamadas, análise de impacto e leitura de código — sem `grep` às cegas.

> **Pré-requisito**: o CLI `codegraph` instalado e no `PATH` (o plugin executa o CLI; não o gerencia). Em macOS/Linux:
> ```bash
> cargo install codegraph   # ou siga as instruções da repo do codegraph
> codegraph --version       # verifique antes de prosseguir
> ```

## Instalação

O pacote é um DSH profile bundle — instalável em qualquer profile com um comando:

```bash
dsh plugin --profile web add /caminho/para/este/checkout
# ou, uma vez publicado no npm:
dsh plugin --profile web add dsh-codegraph
# ou direto do GitHub:
dsh plugin --profile web add github:errrepe/dsh-codegraph-plugin
```

O comando registra o bundle em `dsh.profile.bundles` e o plugin carrega no próximo boot do profile. Reinicie o processo DSH do profile para o plugin fazer efeito.

Para remover:

```bash
dsh plugin --profile web remove dsh-codegraph
```

## Como funciona

- Cada tool executa `codegraph <subcommand>` **na cwd da sessão que chamou** — o projeto cujo índice é lido é sempre o workspace em que o agente está trabalhando. A execução usa a sandbox policy da própria sessão, o que permite ao SQLite (WAL) do índice abrir dentro de workspaces confinados.
- Projeto sem índice: rode `codegraph init` na raiz do projeto (via bash) uma única vez. Depois disso, chame `codegraph_sync` após editar arquivos para que as queries reflitam o código atual.
- Saída: `query`/`callers`/`callees`/`impact` retornam JSON estruturado; `explore`/`node`/`status`/`sync` retornam texto formatado. Todos os argumentos dinâmicos são shell-quoted de forma segura (single-quote POSIX); há testes de round-trip por bash real (`node test/quote.test.js`).

## Configuracao em Settings/Plugins e System Prompt

O plugin agora expõe um card em **Settings > Plugins** (aba Configuráveis) com `key: codegraph`:

- **Ativar Codegraph** (`enabled`, padrão `true`): quando ligado, as oito tools permanecem registradas. Quando desligado, cada tool retorna erro `Codegraph is disabled in Settings > Plugins` — sem derrubar o boot.
- **Instruir o modelo via system prompt** (`injectPrompt`, padrão `true`): quando ligado junto com `enabled`, o host injeta a seção `codegraph-guidance` (ordem 50) em todo prompt montado. A seção ensina o modelo a preferir o grafo ao `grep` cego. Veja o digest em `lib/index.js` (`CODEGRAPH_PROMPT`). Desligar remove a seção sem deixar resíduo (`renderPrompt` descarta seções vazias).

Persistência: as duas flags vivem no namespace `codegraph` em `~/.dsh/settings.yaml` (camadas: defaults da schema < `base` do composition < documento do usuário). A UI faz `POST /api/dsh-codegraph/describe` e `POST /api/dsh-codegraph/mutate` (loopback-only) e reage a conflitos de revisão. O toggle afeta o próximo step do modelo sem reinício.

Comportamento esperado pelo upstream `colbymchenry/codegraph` (https://github.com/colbymchenry/codegraph): o grafo entrega contexto cirúrgico em uma chamada. O digest instrui o modelo a: verificar `codegraph_status` antes da primeira busca (se sem índice, rodar `codegraph init`), usar `codegraph_explore` como primeira escolha para perguntas abertas (retorna símbolos + source agrupado por arquivo + caminhos de chamada + blast radius em um shot), seguir `codegraph_query` com `codegraph_node` para leitura exata, mapear impacto com `codegraph_callers`/`impact` antes de refatorar, e rodar `codegraph_sync` após editar. Reserve `grep`/`glob` apenas para texto não-código ou quando `status` indica ausência de índice.

## Tools

| Tool | O que faz | Saída |
|---|---|---|
| `codegraph_query` | Busca símbolos (funções, classes, métodos) por nome, com filtro por kind | JSON |
| `codegraph_callers` | Quem chama um símbolo — primeiro passo antes de mudar uma função | JSON |
| `codegraph_callees` | O que um símbolo chama | JSON |
| `codegraph_impact` | Raio de impacto de mudar um símbolo (dependentes + testes que cobrem) | JSON |
| `codegraph_explore` | Explora uma área: símbolos relevantes, código-fonte, caminhos de chamada, dependentes — em um shot | texto |
| `codegraph_node` | Lê o código-fonte completo de um símbolo (+ trail de chamadas), ou lê um arquivo com line numbers e dependentes | texto |
| `codegraph_status` | Estatísticas do índice: contagens de arquivos/nodes/edges, por kind e linguagem | texto |
| `codegraph_sync` | Sincroniza o índice com as mudanças desde a última indexação | texto |

## Compatibilidade e resiliência

- **Settings/Plugins**: o host registra o namespace `codegraph` via `@deepseek-ai/dsh-settings` (`installSettingsSection` com fallback manual). Se o serviço estiver ausente (host antigo/headless), o plugin cai para `enabled: true` e sem bridge — nunca bloqueia o boot.
- **System prompt**: a seção `codegraph-guidance` vive em `@deepseek-ai/dsh-system-prompt` ordem 50 (depois da persona 0, antes do guia de tools 100+). Texto é função de `current()`; quando `enabled` é `false` ou `injectPrompt` é `false`, retorna `""` e não deixa resíduo.

- O `defineTool` do harness é resolvido em runtime (import guardado com fallback), pois não é uma dependência resolvível de bundles de terceiros. Se indisponível, o plugin loga um aviso e não registra os tools — **nunca** derruba o boot do DSH.
- Sem sessão com cwd (ex.: uso headless sem agent): os tools retornam erro explícito, não crasham.
- CLI ausente ou projeto sem índice: o erro do próprio CLI é devolvido ao modelo como erro do tool.

## Desenvolvimento

```bash
npm run check   # node --check nos módulos
npm test        # testes de quoting/argv (bash real round-trip)
```

Estrutura: `lib/index.js` (host half — registro dos tools, namespace `codegraph`, seção `codegraph-guidance`, bridge `/api/dsh-codegraph/*`), `lib/client.js` (browser half — card `settings.plugin.item` key `codegraph` em Settings > Plugins), `lib/quote.js` (builders de argv puros e testáveis), `cordis.patch.yml` (row `codegraph` do composition).

## Licença

MIT — veja [LICENSE](./LICENSE).

## FAQ

**Does codegraph need to be installed?** Yes — the plugin shells out to the `codegraph` CLI on the host `PATH`. Install via `cargo install codegraph` or from https://github.com/colbymchenry/codegraph.

**When to call `codegraph_sync`?** After editing files, so subsequent `query`/`explore` calls see the new code. `status` shows whether the index is stale.
