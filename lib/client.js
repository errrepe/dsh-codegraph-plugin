window.__ModuleLoader__.load({
  id: "dsh-codegraph",
  factory: function(require) {
    var React = require("react");
    var jsx = require("react/jsx-runtime");
    var BRIDGE_DESCRIBE = "/api/dsh-codegraph/describe";
    var BRIDGE_MUTATE = "/api/dsh-codegraph/mutate";
    var TAG = "dsh-codegraph:client";
    var css = [
      ".cg-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:8px;min-width:0;list-style:none;overflow:hidden;margin-bottom:8px}",
      ".cg-cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}",
      ".cg-header{width:100%;color:inherit;cursor:pointer;text-align:left;font:inherit;background:0 0;border:0;align-items:center;gap:8px;padding:10px 14px;display:flex}",
      ".cg-header:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}",
      ".cg-headText{flex-direction:column;flex:1;gap:2px;min-width:0;display:flex;overflow:hidden}",
      ".cg-name{color:var(--dsw-alias-label-primary);white-space:nowrap;text-overflow:ellipsis;font-weight:600;overflow:hidden}",
      ".cg-desc{color:var(--dsw-alias-label-tertiary);white-space:nowrap;text-overflow:ellipsis;font-size:12px;overflow:hidden}",
      ".cg-chevron{color:var(--dsw-alias-label-tertiary);flex:none;font-size:13px;transition:transform .12s}",
      ".cg-chevronOpen{transform:rotate(180deg)}",
      ".cg-body{flex-direction:column;gap:14px;padding:0 14px 14px;display:flex}",
      ".cg-field{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2)}",
      ".cg-fieldInfo{display:flex;flex-direction:column;gap:2px;min-width:0}",
      ".cg-label{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;line-height:1.4}",
      ".cg-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.4}",
      ".cg-toggle{position:relative;inline-size:44px;block-size:26px;flex:none;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);cursor:pointer;transition:background .16s,border-color .16s}",
      ".cg-toggleOn{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}",
      ".cg-knob{position:absolute;inset-block-start:2px;inset-inline-start:2px;inline-size:20px;block-size:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .16s}",
      ".cg-toggleOn .cg-knob{transform:translateX(18px)}",
      ".cg-footer{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}",
      ".cg-footerLeft{display:flex;align-items:center;gap:8px}",
      ".cg-footerRight{display:flex;align-items:center;gap:8px}",
      ".cg-save{border:none;border-radius:6px;padding:6px 14px;font-size:13px;font-weight:600;cursor:pointer;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-on-primary)}",
      ".cg-save:disabled{opacity:.45;cursor:default}",
      ".cg-discard{border:none;background:0 0;color:var(--dsw-alias-label-secondary);font-size:13px;cursor:pointer;padding:6px 10px}",
      ".cg-discard:disabled{opacity:.45;cursor:default}",
      ".cg-failed{color:var(--dsw-alias-state-error-primary);font-size:12px}",
      ".cg-ok{color:#7ddb9c;font-size:12px}",
      ".cg-muted{color:var(--dsw-alias-label-tertiary);font-size:12px}"
    ].join("");
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(TAG) + "]") === null) {
      var tag = document.createElement("style");
      tag.dataset.pluginCss = TAG;
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    async function fetchDescribe() {
      var res = await fetch(BRIDGE_DESCRIBE, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      var json = await res.json();
      return json;
    }

    async function fetchMutate(ops, expectedRevision) {
      var res = await fetch(BRIDGE_MUTATE, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ops: ops, expectedRevision: expectedRevision })
      });
      var json = await res.json();
      return json;
    }

    function Toggle(props) {
      return jsx.jsx("button", {
        type: "button",
        role: "switch",
        "aria-checked": props.checked,
        "aria-label": props.label,
        className: "cg-toggle" + (props.checked ? " cg-toggleOn" : ""),
        onClick: props.onChange,
        disabled: props.disabled,
        children: jsx.jsx("span", { className: "cg-knob" })
      });
    }

    function CodegraphCard() {
      var _a = React.useState(null);
      var data = _a[0];
      var setData = _a[1];
      var _b = React.useState(null);
      var revision = _b[0];
      var setRevision = _b[1];
      var _c = React.useState(true);
      var loading = _c[0];
      var setLoading = _c[1];
      var _d = React.useState(false);
      var saving = _d[0];
      var setSaving = _d[1];
      var _e = React.useState(null);
      var error = _e[0];
      var setError = _e[1];
      var _f = React.useState(false);
      var open = _f[0];
      var setOpen = _f[1];
      var _g = React.useState(null);
      var draft = _g[0];
      var setDraft = _g[1];

      var load = React.useCallback(function() {
        setLoading(true);
        setError(null);
        fetchDescribe().then(function(json) {
          if (json && json.ok === true) {
            setData(json.value);
            setRevision(json.revision);
            setDraft(json.value);
          } else {
            setError(json && json.message ? json.message : "Settings unavailable");
          }
        }).catch(function(e) {
          setError(e && e.message ? e.message : String(e));
        }).finally(function() { setLoading(false); });
      }, []);

      React.useEffect(function() { load(); }, [load]);

      var enabled = draft ? draft.enabled !== false : true;
      var injectPrompt = draft ? draft.injectPrompt !== false : true;
      var dirty = data && draft ? (data.enabled !== draft.enabled || data.injectPrompt !== draft.injectPrompt) : false;
      var blocked = !dirty || saving || loading;

      function onToggleEnabled() {
        if (!draft) return;
        setDraft({ enabled: !enabled, injectPrompt: injectPrompt });
        setError(null);
      }
      function onTogglePrompt() {
        if (!draft) return;
        setDraft({ enabled: enabled, injectPrompt: !injectPrompt });
        setError(null);
      }
      function onDiscard() {
        if (!data) return;
        setDraft(data);
        setError(null);
      }
      function onSave() {
        if (!draft || revision === null) return;
        setSaving(true);
        setError(null);
        var ops = [
          { op: "set", path: ["enabled"], value: enabled },
          { op: "set", path: ["injectPrompt"], value: injectPrompt }
        ];
        fetchMutate(ops, revision).then(function(json) {
          if (json && json.ok === true) {
            setData(json.value);
            setDraft(json.value);
            setRevision(json.revision);
          } else if (json && json.code === "settings-conflict") {
            setError("Conflito de revisao. Recarregue a pagina.");
            load();
          } else {
            setError(json && json.message ? json.message : "Falha ao salvar");
          }
        }).catch(function(e) {
          setError(e && e.message ? e.message : String(e));
        }).finally(function() { setSaving(false); });
      }

      var statusText = loading ? "Carregando..." : (enabled ? "Ativado" : "Desativado");

      return jsx.jsxs("div", {
        className: "cg-card" + (open ? " cg-cardOpen" : ""),
        children: [
          jsx.jsxs("button", {
            className: "cg-header",
            onClick: function() { setOpen(!open); },
            children: [
              jsx.jsxs("span", {
                className: "cg-headText",
                children: [
                  jsx.jsx("span", { className: "cg-name", children: "Codegraph" }),
                  jsx.jsx("span", { className: "cg-desc", children: loading ? "Carregando..." : (enabled ? "Ferramentas ativas e modelo instruido a usar o grafo" : "Desativado — ferramentas recusam chamadas") })
                ]
              }),
              jsx.jsx("span", { className: "cg-muted", style: { fontSize: 12, whiteSpace: "nowrap" }, children: statusText }),
              jsx.jsx("span", { className: "cg-chevron" + (open ? " cg-chevronOpen" : ""), children: "▾" })
            ]
          }),
          open ? jsx.jsxs("div", {
            className: "cg-body",
            children: [
              error ? jsx.jsx("p", { className: "cg-failed", role: "status", children: error }) : null,
              loading ? jsx.jsx("p", { className: "cg-muted", children: "Carregando configuracao..." }) : jsx.jsxs(React.Fragment, {
                children: [
                  jsx.jsxs("div", {
                    className: "cg-field",
                    children: [
                      jsx.jsxs("span", {
                        className: "cg-fieldInfo",
                        children: [
                          jsx.jsx("span", { className: "cg-label", children: "Ativar Codegraph" }),
                          jsx.jsx("span", { className: "cg-hint", children: "Registra as oito tools e injeta instrucao no system prompt" })
                        ]
                      }),
                      jsx.jsx(Toggle, { checked: enabled, onChange: onToggleEnabled, label: "Ativar Codegraph", disabled: saving })
                    ]
                  }),
                  jsx.jsxs("div", {
                    className: "cg-field",
                    children: [
                      jsx.jsxs("span", {
                        className: "cg-fieldInfo",
                        children: [
                          jsx.jsx("span", { className: "cg-label", children: "Instruir o modelo via system prompt" }),
                          jsx.jsx("span", { className: "cg-hint", children: "Quando ligado, o modelo recebe guia para preferir codegraph_explore/ query ao grep" })
                        ]
                      }),
                      jsx.jsx(Toggle, { checked: injectPrompt, onChange: onTogglePrompt, label: "Instruir o modelo", disabled: saving || !enabled })
                    ]
                  }),
                  jsx.jsxs("div", {
                    className: "cg-footer",
                    children: [
                      jsx.jsx("span", { className: "cg-muted", children: "Persistido em ~/.dsh/settings.yaml" }),
                      jsx.jsxs("span", {
                        className: "cg-footerRight",
                        children: [
                          jsx.jsx("button", { className: "cg-discard", onClick: onDiscard, disabled: !dirty || saving, children: "Descartar" }),
                          jsx.jsx("button", { className: "cg-save", onClick: onSave, disabled: blocked, children: saving ? "Salvando..." : "Salvar" })
                        ]
                      })
                    ]
                  })
                ]
              })
            ]
          }) : null
        ]
      });
    }

    return {
      inject: ["slots"],
      apply: function(ctx) {
        ctx.slots.inject("settings.plugin.item", function() {
          return ctx.slots.register({
            name: "settings.plugin.item",
            key: "codegraph",
            id: "dsh-codegraph",
            order: 30,
            inject: function() { return {}; }
          }, CodegraphCard);
        });
      }
    };
  }
});
