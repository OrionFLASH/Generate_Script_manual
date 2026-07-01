/**
 * DevToolsTrace — трассировка UI, HTTP и журнала для DevTools-скриптов (один файл → вставка в консоль).
 * Использование: createDevToolsTrace({ scriptId: "MyScript" }) → mountToggleRow, attachPanel, wrapFetch, log.
 */
/* DevToolsTrace v1 */
function createDevToolsTrace(opts) {
  "use strict";
  var scriptId = (opts && opts.scriptId) || "devtools_script";
  var maxBodyLen = (opts && opts.maxBodyLen) || 16384;
  var maxLines = (opts && opts.maxLines) || 8000;
  var enabled = false;
  /** @type {string[]} */
  var buffer = [];

  /**
   * @returns {string}
   */
  function isoNow() {
    return new Date().toISOString();
  }

  /**
   * @param {string} ts
   * @returns {string}
   */
  function fileTsFromIso(ts) {
    return ts.replace(/[-:]/g, "").replace("T", "_").slice(0, 15);
  }

  /**
   * @param {unknown} v
   * @returns {string}
   */
  function truncBody(v) {
    if (v == null) return "";
    var s = typeof v === "string" ? v : String(v);
    if (s.length <= maxBodyLen) return s;
    return s.slice(0, maxBodyLen) + "\n… [truncated " + (s.length - maxBodyLen) + " chars]";
  }

  /**
   * @param {string} kind
   * @param {string} message
   * @param {Record<string, unknown>|null} [detail]
   */
  function push(kind, message, detail) {
    if (!enabled) return;
    var line = isoNow() + " [" + kind + "] " + message;
    if (detail && typeof detail === "object") {
      try {
        line += " " + JSON.stringify(detail);
      } catch (_e) {
        line += " [detail unserializable]";
      }
    }
    buffer.push(line);
    if (buffer.length > maxLines) buffer = buffer.slice(buffer.length - maxLines);
  }

  /**
   * @param {boolean} on
   */
  function setEnabled(on) {
    var next = !!on;
    if (next === enabled) return;
    if (next) {
      enabled = true;
      push("SYS", "Trace ON script=" + scriptId);
      return;
    }
    push("SYS", "Trace OFF script=" + scriptId);
    enabled = false;
    if (buffer.length > 0) downloadLog();
    buffer = [];
  }

  function isEnabled() {
    return enabled;
  }

  /**
   * @param {string} msg
   */
  function log(msg) {
    push("LOG", String(msg));
  }

  /**
   * @param {string} action
   * @param {Record<string, unknown>|null} [detail]
   */
  function ui(action, detail) {
    push("UI", action, detail);
  }

  /**
   * @param {typeof fetch} nativeFetch
   * @returns {typeof fetch}
   */
  function wrapFetch(nativeFetch) {
    return async function tracedFetch(input, init) {
      if (!enabled) return nativeFetch(input, init);
      var url =
        typeof input === "string"
          ? input
          : input && typeof input === "object" && "url" in input
            ? String(input.url)
            : String(input);
      var method = (init && init.method) || "GET";
      var reqBody = init && init.body != null ? truncBody(init.body) : "";
      push("HTTP", "→ " + method + " " + url, reqBody ? { requestBody: reqBody } : null);
      var t0 = Date.now();
      var res = await nativeFetch(input, init);
      var ms = Date.now() - t0;
      var status = res.status;
      var respText = "";
      try {
        respText = truncBody(await res.clone().text());
      } catch (_e) {
        respText = "[body read error]";
      }
      push("HTTP", "← " + status + " " + method + " " + url + " " + ms + "ms", {
        responseBody: respText
      });
      return res;
    };
  }

  /**
   * @param {HTMLElement} panelRoot
   */
  function attachPanel(panelRoot) {
    if (!panelRoot || panelRoot.__devToolsTraceAttached) return;
    panelRoot.__devToolsTraceAttached = true;
    panelRoot.addEventListener(
      "click",
      function (ev) {
        if (!enabled) return;
        var t = ev.target;
        if (!(t instanceof Element)) return;
        var btn = t.closest("button");
        if (btn) {
          ui("click button", { text: (btn.textContent || "").trim().slice(0, 120) });
          return;
        }
        var cb = t.closest('input[type="checkbox"]');
        if (cb) {
          ui("click checkbox", { checked: cb.checked, label: (cb.parentElement && cb.parentElement.textContent || "").trim().slice(0, 80) });
          return;
        }
        var sel = t.closest("select");
        if (sel) {
          ui("change select", { value: sel.value });
        }
      },
      true
    );
    panelRoot.addEventListener(
      "change",
      function (ev) {
        if (!enabled) return;
        var t = ev.target;
        if (!(t instanceof HTMLInputElement && t.type === "file")) return;
        var names = [];
        if (t.files) {
          for (var i = 0; i < t.files.length; i++) names.push(t.files[i].name);
        }
        ui("file input", { files: names });
      },
      true
    );
  }

  /**
   * @param {HTMLElement} container
   * @param {HTMLElement|null} [beforeNode]
   * @returns {{ row: HTMLElement, checkbox: HTMLInputElement, saveBtn: HTMLButtonElement }}
   */
  function mountToggleRow(container, beforeNode) {
    var row = document.createElement("div");
    row.className = "devtools-trace-row";
    row.style.cssText =
      "display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:6px 0;padding:6px 10px;" +
      "background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;font-size:11px;color:#334155;flex-shrink:0;";

    var label = document.createElement("label");
    label.style.cssText = "display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none;";
    var checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.title = "Запись всех HTTP-запросов, кликов по панели и строк журнала в файл при выключении";
    var span = document.createElement("span");
    span.textContent = "Trace (диагностика → файл .log)";
    label.appendChild(checkbox);
    label.appendChild(span);

    var saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.textContent = "Сохранить trace";
    saveBtn.style.cssText =
      "padding:3px 8px;border:1px solid #cbd5e1;border-radius:4px;background:#fff;cursor:pointer;font-size:11px;";
    saveBtn.disabled = true;

    checkbox.addEventListener("change", function () {
      setEnabled(checkbox.checked);
      saveBtn.disabled = !checkbox.checked;
    });

    saveBtn.addEventListener("click", function () {
      if (buffer.length === 0) {
        push("SYS", "manual save (empty buffer)");
      }
      downloadLog();
    });

    row.appendChild(label);
    row.appendChild(saveBtn);

    if (beforeNode && beforeNode.parentNode) {
      beforeNode.parentNode.insertBefore(row, beforeNode);
    } else if (container) {
      container.appendChild(row);
    }
    return { row: row, checkbox: checkbox, saveBtn: saveBtn };
  }

  function downloadLog() {
    if (buffer.length === 0) return;
    var header =
      "# DevToolsTrace script=" +
      scriptId +
      " exported=" +
      isoNow() +
      " lines=" +
      buffer.length +
      "\n";
    var body = header + buffer.join("\n") + "\n";
    var fname = "trace_" + scriptId + "_" + fileTsFromIso(isoNow()) + ".log";
    var blob = new Blob(["\uFEFF" + body], { type: "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
    }, 500);
  }

  return {
    scriptId: scriptId,
    isEnabled: isEnabled,
    setEnabled: setEnabled,
    log: log,
    ui: ui,
    wrapFetch: wrapFetch,
    attachPanel: attachPanel,
    mountToggleRow: mountToggleRow,
    downloadLog: downloadLog
  };
}
