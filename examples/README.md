# Examples

## Symbol search → read source

```
User: Find where Model is defined
Agent: codegraph_query search="Model" limit=3
       → Model::model (minimax_m3_vl_model.py:140)
       codegraph_node name="Model::model"
       → verbatim source + caller trail
```

## Impact analysis before refactor

```
codegraph_impact symbol="Model::model" depth=2
→ downstream dependents + covering tests
```

## Explore unfamiliar area

```
codegraph_explore query="attention mask preparation"
→ relevant symbols + verbatim source + blast radius
```

After editing, run `codegraph_sync` so the index reflects the new code.
