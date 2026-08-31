# Contributing

## Development

```sh
npm run check   # syntax check lib/*.js
npm test        # quote/argv round-trip tests (real bash)
```

## Release

1. Bump `version` in `package.json` and add entry to `CHANGELOG.md`.
2. `npm run check && npm run test` must pass.
3. `dsh --profile web --dump-config | grep codegraph` shows the row.
4. Headless smoke: `dsh --profile smoke "call codegraph_status"` against a workspace with `.codegraph/` index.

## Registry submission

This repo declares `dsh.bundle` (`cordis.patch.yml`). To list in [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin), add `data/plugins/errrepe__dsh-codegraph-plugin.yml` there (see their `contributing.md`). The `dsh-plugin` topic is already set on this repo.
