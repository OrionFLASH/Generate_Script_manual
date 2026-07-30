// =============================================================================
// Pulse_export_OE.js — выгрузка из Пульс (hr.ca.sbrf.ru): multiSearch → mainInfo_v1
// =============================================================================
// Аналог AddressBook_export_OE: поиск → сбор personUuid → карточки → JSON + CSV.
// Запуск: DevTools → Console на вкладке hr.ca.sbrf.ru → вставить файл → Enter.
// =============================================================================
(function () {
  "use strict";


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

  var __nativeFetch = window.fetch.bind(window);
  var PANEL_ID = "pulseExportOePanelRoot";
  var prev = document.getElementById(PANEL_ID);
  if (prev) prev.remove();

  /** Fallback origin, если у вкладки нет location.origin. */
  var PULSE_ORIGIN_FALLBACK = "https://hr.ca.sbrf.ru";
  var MULTI_SEARCH_PATH = "/api-web/globalsearch/api/v3/multiSearch";
  var MAIN_INFO_PATH = "/api-mobile/smart-profile/web/widgets/data";
  /** По HAR UI для полного списка PERSONS всегда size=20 (не длина query). */
  var DEFAULT_PAGE_SIZE = 20;
  var DEFAULT_PAUSE_MS = 400;
  var DEFAULT_PAUSE_AFTER_SEARCH_MS = 600;
  var DEFAULT_RETRY_BASE_MS = 1000;
  var MAX_RETRY = 3;
  var REQUEST_PAUSE_MAX_MS = 300000;
  var DEFAULT_MAX_PAGES = 50;
  var FILE_PREFIX = "PROM_PULSE_";

  var DEFAULT_QUERIES = [
    "673892",
    "Лакомкин Олег Олегович",
    "Лакомкин",
    "Гайн Роман",
    "Гайн",
    "Гайн Роман Андреевич",
    "Директор"
  ];

  var PANEL_FONT = "12px";

  var devTrace = createDevToolsTrace({ scriptId: "Pulse_export_OE" });
  var httpFetch = devTrace.wrapFetch(__nativeFetch);

  var runInProgress = false;
  var stopRequested = false;

  /**
   * @returns {{ origin: string }}
   */
  function getPulseOrigin() {
    try {
      if (window.location && window.location.origin && /^https?:/i.test(window.location.origin)) {
        return { origin: window.location.origin };
      }
    } catch (_e) {
      /* ignore */
    }
    return { origin: PULSE_ORIGIN_FALLBACK };
  }

  /**
   * @param {number} ms
   * @returns {Promise<void>}
   */
  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  /**
   * @param {Date} d
   * @returns {string}
   */
  function formatExportTimestampLocal(d) {
    var pad = function (n) {
      return n < 10 ? "0" + n : String(n);
    };
    return (
      d.getFullYear() +
      pad(d.getMonth() + 1) +
      pad(d.getDate()) +
      "_" +
      pad(d.getHours()) +
      pad(d.getMinutes())
    );
  }

  /**
   * @param {string} kind
   * @param {string} tsStamp
   * @param {string} [ext]
   * @returns {string}
   */
  function buildFileName(kind, tsStamp, ext) {
    return FILE_PREFIX + kind + "_" + tsStamp + (ext || ".json");
  }

  /**
   * @param {string} filename
   * @param {unknown} obj
   */
  function downloadJson(filename, obj) {
    var blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
    }, 800);
  }

  /**
   * @param {string} filename
   * @param {string} text
   * @param {string} [mime]
   */
  function downloadText(filename, text, mime) {
    var blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
    }, 800);
  }

  /**
   * @param {string} text
   * @returns {string[]}
   */
  function parseQueriesFromText(text) {
    var raw = String(text || "");
    var parts = raw.split(/[\n;,]+/);
    /** @type {string[]} */
    var out = [];
    var seen = {};
    for (var i = 0; i < parts.length; i++) {
      var s = parts[i].replace(/^\s+|\s+$/g, "");
      if (!s) continue;
      if (seen[s]) continue;
      seen[s] = true;
      out.push(s);
    }
    return out;
  }

  /**
   * @param {string} v
   * @returns {string}
   */
  function escapeCsvField(v) {
    var s = v == null ? "" : String(v);
    if (/[;"\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  /**
   * @param {unknown} v
   * @returns {string}
   */
  function cell(v) {
    if (v == null) return "";
    if (typeof v === "boolean" || typeof v === "number") return String(v);
    if (typeof v === "object") {
      try {
        return JSON.stringify(v);
      } catch (_e) {
        return String(v);
      }
    }
    return String(v);
  }

  /**
   * Ошибка из HTTP или тела JSON.
   * @param {number} status
   * @param {unknown} data
   * @param {string} context
   * @returns {string|null}
   */
  function detectApiError(status, data, context) {
    if (status < 200 || status >= 300) {
      return context + ": HTTP " + status;
    }
    if (!data || typeof data !== "object") return null;
    var obj = /** @type {Record<string, unknown>} */ (data);
    if (obj.success === false) {
      return context + ": success=false " + JSON.stringify(obj.messages || obj.status || obj);
    }
    if (typeof obj.status === "string" && obj.status !== "OK" && obj.success !== true) {
      return context + ": status=" + obj.status;
    }
    return null;
  }

  /**
   * @param {unknown} data
   * @returns {{ content: object[]; totalElements: number; totalPages: number; last: boolean; personsSuccess: boolean }}
   */
  function parsePersonsBlock(data) {
    var empty = { content: [], totalElements: 0, totalPages: 0, last: true, personsSuccess: false };
    if (!data || typeof data !== "object") return empty;
    var root = /** @type {Record<string, unknown>} */ (data);
    var dataWrap = root.data && typeof root.data === "object" ? /** @type {Record<string, unknown>} */ (root.data) : null;
    var persons = dataWrap && dataWrap.PERSONS && typeof dataWrap.PERSONS === "object"
      ? /** @type {Record<string, unknown>} */ (dataWrap.PERSONS)
      : null;
    if (!persons) return empty;
    var personsSuccess = persons.success !== false;
    var block = persons.data && typeof persons.data === "object" ? /** @type {Record<string, unknown>} */ (persons.data) : {};
    var content = Array.isArray(block.content) ? block.content : [];
    return {
      content: content,
      totalElements: Number(block.totalElements) || content.length,
      totalPages: Number(block.totalPages) || 1,
      last: block.last !== false,
      personsSuccess: personsSuccess
    };
  }

  /**
   * @param {object} hit
   * @returns {string}
   */
  function personUuidFromHit(hit) {
    if (!hit || typeof hit !== "object") return "";
    var id = /** @type {Record<string, unknown>} */ (hit).personUuid;
    return id != null ? String(id).trim() : "";
  }

  /**
   * @param {unknown} data
   * @returns {object|null}
   */
  function extractMainInfoData(data) {
    if (!data || typeof data !== "object") return null;
    var arr = /** @type {Record<string, unknown>} */ (data).data;
    if (!Array.isArray(arr)) return null;
    for (var i = 0; i < arr.length; i++) {
      var item = arr[i];
      if (item && typeof item === "object" && item.code === "mainInfo_v1" && item.data) {
        return /** @type {object} */ (item.data);
      }
    }
    if (arr[0] && typeof arr[0] === "object" && arr[0].data) return /** @type {object} */ (arr[0].data);
    return null;
  }

  startPulsePanel();

  /**
   * Панель и сценарий OE.
   */
  function startPulsePanel() {
    var originInfo = getPulseOrigin();

    var box = document.createElement("div");
    box.id = PANEL_ID;
    box.style.cssText =
      "position:fixed;top:12px;right:12px;z-index:2147483646;width:min(680px,calc(100vw - 24px));" +
      "max-height:calc(100vh - 24px);overflow:auto;box-sizing:border-box;padding:14px 16px 16px;" +
      "background:linear-gradient(165deg,#f8fafc 0%,#eef2ff 48%,#f0fdfa 100%);" +
      "color:#0f172a;border:1px solid #cbd5e1;border-radius:14px;" +
      "box-shadow:0 18px 40px rgba(15,23,42,.18);font:13px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;";

    var hdr = document.createElement("div");
    hdr.style.cssText = "display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin:0 0 10px 0;";
    var titleWrap = document.createElement("div");
    var title = document.createElement("div");
    title.style.cssText = "font-size:16px;font-weight:800;letter-spacing:-0.02em;color:#0f172a;";
    title.textContent = "Пульс — multiSearch → mainInfo";
    var sub = document.createElement("div");
    sub.style.cssText = "font-size:11px;color:#475569;margin-top:4px;line-height:1.4;";
    sub.textContent =
      "Origin: " +
      originInfo.origin +
      " · category=PERSONS · size=" +
      DEFAULT_PAGE_SIZE +
      " (по HAR, не длина query)";
    titleWrap.appendChild(title);
    titleWrap.appendChild(sub);
    hdr.appendChild(titleWrap);
    box.appendChild(hdr);

    var statusEl = document.createElement("div");
    statusEl.style.cssText =
      "margin:0 0 12px 0;padding:10px 12px;border-radius:10px;background:#0f172a;color:#e2e8f0;" +
      "font-size:12px;line-height:1.45;min-height:44px;box-sizing:border-box;";
    statusEl.textContent = "Готов к запуску. Вставьте запросы поиска и нажмите «Search → mainInfo».";
    box.appendChild(statusEl);

    /**
     * @param {string} text
     * @param {"info"|"ok"|"warn"|"err"} [level]
     */
    function setStatus(text, level) {
      var colors = {
        info: { bg: "#0f172a", fg: "#e2e8f0" },
        ok: { bg: "#064e3b", fg: "#d1fae5" },
        warn: { bg: "#78350f", fg: "#ffedd5" },
        err: { bg: "#7f1d1d", fg: "#fee2e2" }
      };
      var c = colors[level || "info"] || colors.info;
      statusEl.style.background = c.bg;
      statusEl.style.color = c.fg;
      statusEl.textContent = text;
    }

    var logEl = document.createElement("div");
    logEl.style.cssText =
      "margin:0 0 12px 0;padding:8px 10px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;" +
      "font-size:11px;color:#334155;min-height:140px;max-height:220px;overflow:auto;white-space:pre-wrap;" +
      "font-family:ui-monospace,SFMono-Regular,Menlo,monospace;line-height:1.4;";

    /**
     * @param {string} line
     * @param {"info"|"ok"|"warn"|"err"} [level]
     */
    function appendLog(line, level) {
      var prefix =
        level === "ok" ? "[OK] " : level === "warn" ? "[WARN] " : level === "err" ? "[ERR] " : "";
      var stamp = new Date().toLocaleTimeString("ru-RU", { hour12: false });
      var full = stamp + " " + prefix + line;
      logEl.textContent += (logEl.textContent ? "\n" : "") + full;
      logEl.scrollTop = logEl.scrollHeight;
      devTrace.log(full);
    }

    function mkNum(labelText, value, titleText) {
      var row = document.createElement("label");
      row.style.cssText =
        "display:flex;flex-direction:column;gap:4px;font-size:11px;color:#334155;font-weight:600;min-width:0;";
      var cap = document.createElement("span");
      cap.textContent = labelText;
      var inp = document.createElement("input");
      inp.type = "number";
      inp.min = "0";
      inp.value = String(value);
      inp.title = titleText || "";
      inp.style.cssText =
        "width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #94a3b8;border-radius:8px;" +
        "background:#fff;color:#0f172a;font-size:" +
        PANEL_FONT +
        ";";
      row.appendChild(cap);
      row.appendChild(inp);
      return { row: row, inp: inp };
    }

    var paramsGrid = document.createElement("div");
    paramsGrid.style.cssText =
      "display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 10px;margin:0 0 12px 0;";
    var fBetween = mkNum("Пауза между запросами, мс", DEFAULT_PAUSE_MS, "Между страницами search и между mainInfo");
    var fAfterSearch = mkNum(
      "Пауза после Search, мс",
      DEFAULT_PAUSE_AFTER_SEARCH_MS,
      "После всех multiSearch перед первым mainInfo"
    );
    var fRetry = mkNum("База retry-паузы, мс", DEFAULT_RETRY_BASE_MS, "Попытка N ждёт base×N мс");
    var fMaxPages = mkNum(
      "Макс. страниц на один поиск",
      DEFAULT_MAX_PAGES,
      "Защита от широких запросов (в HAR «Директор» ≈ 50 страниц)"
    );
    paramsGrid.appendChild(fBetween.row);
    paramsGrid.appendChild(fAfterSearch.row);
    paramsGrid.appendChild(fRetry.row);
    paramsGrid.appendChild(fMaxPages.row);
    box.appendChild(paramsGrid);

    var saveRow = document.createElement("div");
    saveRow.style.cssText =
      "display:flex;flex-wrap:wrap;gap:10px 14px;margin:0 0 12px 0;padding:8px 10px;" +
      "background:#fff;border:1px solid #e2e8f0;border-radius:10px;";
    /** @type {Record<string, HTMLInputElement>} */
    var saveChk = {};
    var saveDefs = [
      { key: "search", label: "Search JSON" },
      { key: "mainInfo", label: "mainInfo JSON" },
      { key: "full", label: "Full JSON" },
      { key: "csv", label: "Profile CSV" }
    ];
    for (var si = 0; si < saveDefs.length; si++) {
      var sd = saveDefs[si];
      var lab = document.createElement("label");
      lab.style.cssText = "display:inline-flex;align-items:center;gap:6px;font-size:11px;color:#334155;cursor:pointer;font-weight:600;";
      var chk = document.createElement("input");
      chk.type = "checkbox";
      chk.checked = true;
      chk.style.cssText = "margin:0;accent-color:#0f766e;";
      lab.appendChild(chk);
      lab.appendChild(document.createTextNode(sd.label));
      saveRow.appendChild(lab);
      saveChk[sd.key] = chk;
    }
    box.appendChild(saveRow);

    var labInput = document.createElement("div");
    labInput.style.cssText = "font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.04em;text-transform:uppercase;margin:0 0 6px 0;";
    labInput.textContent = "Запросы поиска";
    box.appendChild(labInput);

    var ta = document.createElement("textarea");
    ta.rows = 6;
    ta.spellcheck = false;
    ta.style.cssText =
      "width:100%;box-sizing:border-box;margin:0 0 10px 0;padding:8px 10px;font-size:12px;" +
      "color:#0f172a;background:#fff;border:1px solid #94a3b8;border-radius:10px;resize:vertical;min-height:110px;";
    ta.placeholder = "Одна строка — один query\nРазделители: перевод строки, ; ,";
    ta.value = DEFAULT_QUERIES.join("\n");
    box.appendChild(ta);

    var fileRow = document.createElement("div");
    fileRow.style.cssText = "display:flex;gap:8px;margin:0 0 12px 0;flex-wrap:wrap;";
    var fileInp = document.createElement("input");
    fileInp.type = "file";
    fileInp.accept = ".txt,text/plain";
    fileInp.style.cssText = "display:none;";
    var bFile = document.createElement("button");
    bFile.type = "button";
    bFile.textContent = "Файл .txt → поле";
    bFile.style.cssText =
      "flex:1;min-height:40px;padding:8px 10px;border:none;border-radius:10px;cursor:pointer;font-weight:700;font-size:12px;" +
      "background:#e2e8f0;color:#334155;";
    bFile.addEventListener("click", function () {
      fileInp.click();
    });
    fileInp.addEventListener("change", function () {
      var f = fileInp.files && fileInp.files[0];
      fileInp.value = "";
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        var text = typeof reader.result === "string" ? reader.result : "";
        ta.value = text;
        var n = parseQueriesFromText(text).length;
        appendLog("Файл «" + f.name + "»: значений " + n, n ? "ok" : "warn");
        setStatus("Загружен файл «" + f.name + "»: " + n + " запросов.", n ? "ok" : "warn");
      };
      reader.readAsText(f);
    });
    fileRow.appendChild(fileInp);
    fileRow.appendChild(bFile);
    box.appendChild(fileRow);

    var btnRow = document.createElement("div");
    btnRow.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 10px 0;";
    var bRun = document.createElement("button");
    bRun.type = "button";
    bRun.textContent = "Search → mainInfo";
    bRun.style.cssText =
      "min-height:46px;padding:10px;border:none;border-radius:10px;cursor:pointer;font-weight:800;font-size:13px;color:#fff;" +
      "background:linear-gradient(180deg,#0d9488,#0f766e);box-shadow:0 2px 8px rgba(15,118,110,.35);";
    var bStop = document.createElement("button");
    bStop.type = "button";
    bStop.textContent = "Стоп";
    bStop.disabled = true;
    bStop.style.cssText =
      "min-height:46px;padding:10px;border:1px solid #fecaca;border-radius:10px;cursor:pointer;font-weight:700;font-size:13px;" +
      "background:#fff;color:#b91c1c;";
    btnRow.appendChild(bRun);
    btnRow.appendChild(bStop);
    box.appendChild(btnRow);

    var logLab = document.createElement("div");
    logLab.style.cssText =
      "font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#64748b;margin:8px 0 6px 0;";
    logLab.textContent = "Журнал работы";
    box.appendChild(logLab);

    /**
     * @param {HTMLInputElement} inp
     * @param {number} fallback
     * @returns {number}
     */
    function readMs(inp, fallback) {
      var n = parseInt(String(inp.value).trim(), 10);
      if (isNaN(n) || n < 0) return fallback;
      if (n > REQUEST_PAUSE_MAX_MS) return REQUEST_PAUSE_MAX_MS;
      return n;
    }

    /**
     * @param {boolean} busy
     */
    function setBusy(busy) {
      runInProgress = busy;
      bRun.disabled = busy;
      bStop.disabled = !busy;
      ta.disabled = busy;
      bFile.disabled = busy;
      fBetween.inp.disabled = busy;
      fAfterSearch.inp.disabled = busy;
      fRetry.inp.disabled = busy;
      fMaxPages.inp.disabled = busy;
      Object.keys(saveChk).forEach(function (k) {
        saveChk[k].disabled = busy;
      });
    }

    /**
     * GET с retry и разбором ошибок API.
     * @param {string} url
     * @param {string} context
     * @param {number} retryBaseMs
     * @returns {Promise<{ ok: boolean; status: number; data: unknown; error: string|null; attempts: number }>}
     */
    async function fetchJsonWithRetry(url, context, retryBaseMs) {
      var lastErr = "unknown";
      var lastStatus = 0;
      var lastData = null;
      for (var attempt = 1; attempt <= MAX_RETRY; attempt++) {
        if (stopRequested) {
          return { ok: false, status: 0, data: null, error: "остановлено", attempts: attempt };
        }
        try {
          var res = await httpFetch(url, {
            method: "GET",
            mode: "cors",
            credentials: "include",
            cache: "no-store",
            headers: {
              Accept: "application/json, */*",
              Referer: getPulseOrigin().origin + "/platform/globalsearch"
            }
          });
          lastStatus = res.status;
          lastData = await res.json().catch(function () {
            return null;
          });
          var apiErr = detectApiError(res.status, lastData, context);
          if (!apiErr && context.indexOf("multiSearch") === 0) {
            var persons = parsePersonsBlock(lastData);
            if (!persons.personsSuccess) {
              apiErr = context + ": PERSONS.success=false";
            }
          }
          if (!apiErr) {
            return { ok: true, status: lastStatus, data: lastData, error: null, attempts: attempt };
          }
          lastErr = apiErr;
          appendLog(
            context + " попытка " + attempt + "/" + MAX_RETRY + ": " + apiErr,
            "warn"
          );
        } catch (e) {
          lastErr = context + ": " + String(e && e.message ? e.message : e);
          appendLog(context + " попытка " + attempt + "/" + MAX_RETRY + ": " + lastErr, "warn");
        }
        if (attempt < MAX_RETRY) {
          var wait = retryBaseMs * attempt;
          appendLog("повтор через " + wait + " мс…", "warn");
          await delay(wait);
        }
      }
      return { ok: false, status: lastStatus, data: lastData, error: lastErr, attempts: MAX_RETRY };
    }

    /**
     * @param {string} query
     * @param {number} page
     * @param {number} size
     * @returns {string}
     */
    function buildMultiSearchUrl(query, page, size) {
      var o = getPulseOrigin().origin;
      var q =
        "query=" +
        encodeURIComponent(query) +
        "&page=" +
        encodeURIComponent(String(page)) +
        "&size=" +
        encodeURIComponent(String(size)) +
        "&category=PERSONS";
      return o + MULTI_SEARCH_PATH + "?" + q;
    }

    /**
     * @param {string} userId
     * @returns {string}
     */
    function buildMainInfoUrl(userId) {
      var o = getPulseOrigin().origin;
      return (
        o +
        MAIN_INFO_PATH +
        "?widgets=mainInfo_v1&userId=" +
        encodeURIComponent(userId)
      );
    }

    /**
     * Сжатый hit для JSON/CSV (без потери ключевых полей поиска).
     * @param {object} hit
     * @returns {object}
     */
    function pickSearchHit(hit) {
      var h = hit || {};
      var pbasic = h.pbasic || {};
      var jbasic = h.jbasic || {};
      var jpos = (((h.jposition || {}).position || [])[0]) || {};
      var junit = (((h.junit || {}).unit || [])[0]) || {};
      var jmail = (h.jcontactsinterofficeemail || {}).value || "";
      var jext = (h.jcontactsexternalemail || {}).value || "";
      var jmob = (h.jcontactsmobile || {}).value || "";
      return {
        personUuid: h.personUuid || "",
        employeeId: jbasic.employeeId || "",
        status: jbasic.status || "",
        fullName: pbasic.fullName || "",
        lastName: pbasic.lastName || "",
        firstName: pbasic.firstName || "",
        midName: pbasic.midName || "",
        birthDay: pbasic.birthDay || "",
        position: jpos.fullName || jpos.shortName || "",
        funcBlock: jpos.funcBlock || "",
        unitName: junit.fullName || junit.shortName || "",
        unitId: junit.unitId || "",
        balanceUnitName: junit.balanceUnitName || "",
        emailOffice: jmail,
        emailExternal: jext,
        preferredMail: h.preferred_mail || "",
        mobile: jmob,
        company: h.company || "",
        photoUrl: (h.pbasicphoto || {}).url || ""
      };
    }

    /**
     * @param {object|null} info
     * @returns {object}
     */
    function pickMainInfo(info) {
      if (!info || typeof info !== "object") return {};
      var linear = info.linear || {};
      var agile = info.agile || {};
      var contacts = info.contacts || {};
      var mails = contacts.mails || {};
      var phones = contacts.phones || {};
      var birth = info.birthDate || {};
      var wx = info.workExperience || {};
      var schedule = info.schedule || {};
      var badges = info.badges || {};
      var orgPath = Array.isArray(linear.orgPath)
        ? linear.orgPath.map(function (x) {
            return x && x.title != null ? String(x.title) : "";
          }).filter(Boolean).join(" / ")
        : "";
      var agilePath = Array.isArray(agile.orgPath)
        ? agile.orgPath.map(function (x) {
            return x && x.title != null ? String(x.title) : "";
          }).filter(Boolean).join(" / ")
        : "";
      var tags = Array.isArray(info.profTags)
        ? info.profTags.map(function (t) {
            return t && t.value != null ? String(t.value) : "";
          }).filter(Boolean).join("; ")
        : "";
      return {
        userId: info.userId || "",
        tabNumber: info.tabNumber || "",
        lastName: info.lastName || "",
        firstName: info.firstName || "",
        secondName: info.secondName || "",
        birthDay: birth.day != null ? birth.day : "",
        birthMonth: birth.month != null ? birth.month : "",
        linearPosition: linear.position || "",
        linearOrgPath: orgPath,
        agilePosition: agile.position || "",
        agileOrgPath: agilePath,
        mailSigma: mails.sigma || "",
        mailAlpha: mails.alpha || "",
        phonePersonal: phones.personal || "",
        workAddress: contacts.workAddress || "",
        workExpFull: wx.fullExp || "",
        workExpPosition: wx.position || "",
        workExpCompany: wx.company || "",
        workExpContinuous: wx.continuous || "",
        professionLevelName: info.professionLevelName || "",
        isFired: info.isFired,
        formWorkCode: info.formWorkCode || "",
        scheduleDate: schedule.date || "",
        scheduleHours: schedule.hours || "",
        scheduleRemoteToday: schedule.remoteToday || "",
        scheduleOfficeDays: schedule.officeDays || "",
        isSuccessor: badges.isSuccessor,
        isCadrReserve: badges.isCadrReserve,
        isSberleader: badges.isSberleader,
        profTags: tags,
        photoUrl: info.photoUrl || "",
        departmentId: info.departmentId || "",
        agileDepartmentId: info.agileDepartmentId || ""
      };
    }

    /**
     * @param {object[]} rows
     * @returns {string}
     */
    function buildCsv(rows) {
      var cols = [
        "searchedQuery",
        "personUuid",
        "employeeId_search",
        "fullName_search",
        "status_search",
        "position_search",
        "unitName_search",
        "emailOffice_search",
        "emailExternal_search",
        "preferredMail_search",
        "mobile_search",
        "tabNumber",
        "lastName",
        "firstName",
        "secondName",
        "birthDay",
        "birthMonth",
        "linearPosition",
        "linearOrgPath",
        "agilePosition",
        "agileOrgPath",
        "mailSigma",
        "mailAlpha",
        "phonePersonal",
        "workAddress",
        "workExpFull",
        "workExpPosition",
        "workExpCompany",
        "workExpContinuous",
        "professionLevelName",
        "isFired",
        "formWorkCode",
        "scheduleDate",
        "scheduleHours",
        "scheduleRemoteToday",
        "scheduleOfficeDays",
        "isSuccessor",
        "isCadrReserve",
        "isSberleader",
        "profTags",
        "photoUrl",
        "departmentId",
        "agileDepartmentId",
        "mainInfoOk",
        "mainInfoError"
      ];
      var lines = ["\uFEFF" + cols.join(";")];
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        lines.push(
          cols
            .map(function (c) {
              return escapeCsvField(cell(r[c]));
            })
            .join(";")
        );
      }
      return lines.join("\r\n");
    }

    /**
     * @param {string[]} queries
     * @param {{ pauseBetween: number; pauseAfterSearch: number; retryBase: number; maxPages: number }} cfg
     * @param {{ search: boolean; mainInfo: boolean; full: boolean; csv: boolean }} save
     */
    async function runOeExport(queries, cfg, save) {
      var tsStamp = formatExportTimestampLocal(new Date());
      var consecutiveHardFails = 0;
      /** @type {object[]} */
      var searchItems = [];
      /** @type {{ personUuid: string; fromQuery: string; hit: object }[]} */
      var uuidOrder = [];
      var uuidSeen = {};

      appendLog(
        "Старт OE: запросов " +
          queries.length +
          ", size=" +
          DEFAULT_PAGE_SIZE +
          ", maxPages=" +
          cfg.maxPages +
          ", ts=" +
          tsStamp
      );
      setStatus("Фаза Search: 0/" + queries.length, "info");

      for (var qi = 0; qi < queries.length; qi++) {
        if (stopRequested) {
          appendLog("Остановлено пользователем на фазе Search", "warn");
          break;
        }
        var query = queries[qi];
        setStatus(
          "Search " + (qi + 1) + "/" + queries.length + ": «" + query + "» (страницы…)",
          "info"
        );
        appendLog("[Search " + (qi + 1) + "/" + queries.length + "] «" + query + "» …");

        /** @type {object[]} */
        var pages = [];
        /** @type {object[]} */
        var allHits = [];
        var page = 0;
        var stopReason = "completed";
        var searchHardFail = false;

        while (page < cfg.maxPages) {
          if (stopRequested) {
            stopReason = "stopped";
            break;
          }
          setStatus(
            "Search " +
              (qi + 1) +
              "/" +
              queries.length +
              ": «" +
              query +
              "» page=" +
              page +
              " size=" +
              DEFAULT_PAGE_SIZE,
            "info"
          );
          var url = buildMultiSearchUrl(query, page, DEFAULT_PAGE_SIZE);
          var res = await fetchJsonWithRetry(url, "multiSearch «" + query + "» p" + page, cfg.retryBase);
          if (!res.ok) {
            searchHardFail = true;
            pages.push({
              page: page,
              ok: false,
              status: res.status,
              error: res.error,
              attempts: res.attempts
            });
            stopReason = "http_or_api_error";
            break;
          }
          var persons = parsePersonsBlock(res.data);
          pages.push({
            page: page,
            ok: true,
            status: res.status,
            totalElements: persons.totalElements,
            totalPages: persons.totalPages,
            last: persons.last,
            contentCount: persons.content.length,
            data: res.data
          });
          for (var hi = 0; hi < persons.content.length; hi++) {
            allHits.push(persons.content[hi]);
          }
          appendLog(
            "    page " +
              page +
              ": hits=" +
              persons.content.length +
              ", totalElements=" +
              persons.totalElements +
              ", totalPages=" +
              persons.totalPages +
              ", last=" +
              persons.last,
            "ok"
          );
          if (persons.last || page + 1 >= persons.totalPages) {
            stopReason = "last_page";
            break;
          }
          page++;
          if (page >= cfg.maxPages) {
            stopReason = "max_pages";
            appendLog("    достигнут maxPages=" + cfg.maxPages, "warn");
            break;
          }
          if (cfg.pauseBetween > 0) await delay(cfg.pauseBetween);
        }

        if (searchHardFail) {
          consecutiveHardFails++;
          appendLog(
            "FAIL Search «" + query + "»: " + (pages[pages.length - 1] && pages[pages.length - 1].error),
            "err"
          );
          if (consecutiveHardFails >= 2) {
            appendLog("Стоп: две подряд операции исчерпали " + MAX_RETRY + " попытки", "err");
            setStatus("Стоп: две серии ошибок подряд (Search).", "err");
            break;
          }
        } else {
          consecutiveHardFails = 0;
        }

        var picked = [];
        for (var pj = 0; pj < allHits.length; pj++) {
          var hit = allHits[pj];
          var uuid = personUuidFromHit(hit);
          var compact = pickSearchHit(hit);
          picked.push(compact);
          if (uuid && !uuidSeen[uuid]) {
            uuidSeen[uuid] = true;
            uuidOrder.push({ personUuid: uuid, fromQuery: query, hit: compact });
          }
        }

        searchItems.push({
          query: query,
          notFound: allHits.length === 0 && !searchHardFail,
          stopReason: stopReason,
          pages: pages,
          hits: picked,
          uniquePersonUuids: picked
            .map(function (x) {
              return x.personUuid;
            })
            .filter(Boolean)
            .filter(function (id, idx, arr) {
              return arr.indexOf(id) === idx;
            })
        });

        if (qi < queries.length - 1 && cfg.pauseBetween > 0 && !stopRequested) {
          await delay(cfg.pauseBetween);
        }
      }

      var fnameSearch = buildFileName("Search", tsStamp);
      if (save.search) {
        downloadJson(fnameSearch, {
          exportedAt: new Date().toISOString(),
          scenario: "pulse_multisearch",
          origin: getPulseOrigin().origin,
          pageSize: DEFAULT_PAGE_SIZE,
          category: "PERSONS",
          timestamp: tsStamp,
          items: searchItems
        });
        appendLog("Файл: " + fnameSearch, "ok");
      }

      if (stopRequested) {
        setStatus("Остановлено. Search сохранён (если отмечен).", "warn");
        return;
      }

      consecutiveHardFails = 0;

      if (cfg.pauseAfterSearch > 0 && uuidOrder.length > 0) {
        setStatus("Пауза после Search перед mainInfo…", "info");
        await delay(cfg.pauseAfterSearch);
      }

      /** @type {Record<string, object>} */
      var mainById = {};
      appendLog("Фаза mainInfo: уникальных personUuid=" + uuidOrder.length);
      for (var mi = 0; mi < uuidOrder.length; mi++) {
        if (stopRequested) {
          appendLog("Остановлено на фазе mainInfo", "warn");
          break;
        }
        var entry = uuidOrder[mi];
        var uid = entry.personUuid;
        setStatus(
          "mainInfo " +
            (mi + 1) +
            "/" +
            uuidOrder.length +
            ": " +
            uid +
            " (из поиска «" +
            entry.fromQuery +
            "»)",
          "info"
        );
        appendLog(
          "[" +
            (mi + 1) +
            "/" +
            uuidOrder.length +
            "] mainInfo userId=" +
            uid +
            " ← «" +
            entry.fromQuery +
            "» …"
        );
        var mres = await fetchJsonWithRetry(
          buildMainInfoUrl(uid),
          "mainInfo " + uid,
          cfg.retryBase
        );
        if (!mres.ok) {
          consecutiveHardFails++;
          mainById[uid] = {
            personUuid: uid,
            fromQuery: entry.fromQuery,
            ok: false,
            status: mres.status,
            error: mres.error,
            attempts: mres.attempts,
            searchHit: entry.hit
          };
          appendLog("FAIL mainInfo " + uid + ": " + mres.error, "err");
          if (consecutiveHardFails >= 2) {
            appendLog("Стоп: две подряд операции исчерпали " + MAX_RETRY + " попытки", "err");
            setStatus("Стоп: две серии ошибок подряд (mainInfo).", "err");
            break;
          }
        } else {
          consecutiveHardFails = 0;
          var infoData = extractMainInfoData(mres.data);
          mainById[uid] = {
            personUuid: uid,
            fromQuery: entry.fromQuery,
            ok: true,
            status: mres.status,
            attempts: mres.attempts,
            searchHit: entry.hit,
            raw: mres.data,
            mainInfo: infoData,
            picked: pickMainInfo(infoData)
          };
          appendLog("    → HTTP " + mres.status + " OK", "ok");
        }
        if (mi < uuidOrder.length - 1 && cfg.pauseBetween > 0 && !stopRequested) {
          await delay(cfg.pauseBetween);
        }
      }

      var mainList = uuidOrder.map(function (e) {
        return (
          mainById[e.personUuid] || {
            personUuid: e.personUuid,
            fromQuery: e.fromQuery,
            ok: false,
            error: "не запрошено",
            searchHit: e.hit
          }
        );
      });

      var fnameMain = buildFileName("mainInfo", tsStamp);
      if (save.mainInfo) {
        downloadJson(fnameMain, {
          exportedAt: new Date().toISOString(),
          scenario: "pulse_mainInfo_v1",
          origin: getPulseOrigin().origin,
          timestamp: tsStamp,
          results: mainList
        });
        appendLog("Файл: " + fnameMain, "ok");
      }

      if (save.full) {
        var fnameFull = buildFileName("full", tsStamp);
        downloadJson(fnameFull, {
          exportedAt: new Date().toISOString(),
          scenario: "pulse_search_mainInfo_full",
          origin: getPulseOrigin().origin,
          timestamp: tsStamp,
          searches: searchItems,
          profiles: mainList
        });
        appendLog("Файл: " + fnameFull, "ok");
      }

      if (save.csv) {
        /** @type {object[]} */
        var csvRows = [];
        for (var ci = 0; ci < mainList.length; ci++) {
          var row = mainList[ci];
          var sh = row.searchHit || {};
          var pk = row.picked || {};
          csvRows.push({
            searchedQuery: row.fromQuery || "",
            personUuid: row.personUuid || "",
            employeeId_search: sh.employeeId || "",
            fullName_search: sh.fullName || "",
            status_search: sh.status || "",
            position_search: sh.position || "",
            unitName_search: sh.unitName || "",
            emailOffice_search: sh.emailOffice || "",
            emailExternal_search: sh.emailExternal || "",
            preferredMail_search: sh.preferredMail || "",
            mobile_search: sh.mobile || "",
            tabNumber: pk.tabNumber || "",
            lastName: pk.lastName || "",
            firstName: pk.firstName || "",
            secondName: pk.secondName || "",
            birthDay: pk.birthDay || "",
            birthMonth: pk.birthMonth || "",
            linearPosition: pk.linearPosition || "",
            linearOrgPath: pk.linearOrgPath || "",
            agilePosition: pk.agilePosition || "",
            agileOrgPath: pk.agileOrgPath || "",
            mailSigma: pk.mailSigma || "",
            mailAlpha: pk.mailAlpha || "",
            phonePersonal: pk.phonePersonal || "",
            workAddress: pk.workAddress || "",
            workExpFull: pk.workExpFull || "",
            workExpPosition: pk.workExpPosition || "",
            workExpCompany: pk.workExpCompany || "",
            workExpContinuous: pk.workExpContinuous || "",
            professionLevelName: pk.professionLevelName || "",
            isFired: pk.isFired,
            formWorkCode: pk.formWorkCode || "",
            scheduleDate: pk.scheduleDate || "",
            scheduleHours: pk.scheduleHours || "",
            scheduleRemoteToday: pk.scheduleRemoteToday || "",
            scheduleOfficeDays: pk.scheduleOfficeDays || "",
            isSuccessor: pk.isSuccessor,
            isCadrReserve: pk.isCadrReserve,
            isSberleader: pk.isSberleader,
            profTags: pk.profTags || "",
            photoUrl: pk.photoUrl || "",
            departmentId: pk.departmentId || "",
            agileDepartmentId: pk.agileDepartmentId || "",
            mainInfoOk: !!row.ok,
            mainInfoError: row.error || ""
          });
        }
        var fnameCsv = buildFileName("profile", tsStamp, ".csv");
        downloadText(fnameCsv, buildCsv(csvRows), "text/csv;charset=utf-8");
        appendLog("Файл: " + fnameCsv + " (строк: " + csvRows.length + ")", "ok");
      }

      var okMain = mainList.filter(function (x) {
        return x.ok;
      }).length;
      setStatus(
        "Готово. Search: " +
          searchItems.length +
          ", UUID: " +
          uuidOrder.length +
          ", mainInfo OK: " +
          okMain +
          "/" +
          mainList.length +
          ", ts=" +
          tsStamp,
        "ok"
      );
      appendLog(
        "Итог: searchQueries=" +
          searchItems.length +
          ", uniqueUuid=" +
          uuidOrder.length +
          ", mainInfoOk=" +
          okMain,
        "ok"
      );
      console.log("[Пульс OE] Готово ts=" + tsStamp + " uuid=" + uuidOrder.length);
    }

    bStop.addEventListener("click", function () {
      stopRequested = true;
      appendLog("Запрошена остановка", "warn");
      setStatus("Остановка…", "warn");
    });

    bRun.addEventListener("click", async function () {
      if (runInProgress) {
        appendLog("Уже выполняется", "warn");
        return;
      }
      var queries = parseQueriesFromText(ta.value);
      if (!queries.length) {
        appendLog("Нет запросов поиска в поле", "err");
        setStatus("Нет запросов поиска.", "err");
        return;
      }
      stopRequested = false;
      setBusy(true);
      try {
        await runOeExport(
          queries,
          {
            pauseBetween: readMs(fBetween.inp, DEFAULT_PAUSE_MS),
            pauseAfterSearch: readMs(fAfterSearch.inp, DEFAULT_PAUSE_AFTER_SEARCH_MS),
            retryBase: readMs(fRetry.inp, DEFAULT_RETRY_BASE_MS),
            maxPages: Math.max(1, readMs(fMaxPages.inp, DEFAULT_MAX_PAGES) || DEFAULT_MAX_PAGES)
          },
          {
            search: saveChk.search.checked,
            mainInfo: saveChk.mainInfo.checked,
            full: saveChk.full.checked,
            csv: saveChk.csv.checked
          }
        );
      } catch (e) {
        appendLog(String(e && e.message ? e.message : e), "err");
        setStatus("Ошибка: " + String(e && e.message ? e.message : e), "err");
      } finally {
        setBusy(false);
      }
    });

    var bClose = document.createElement("button");
    bClose.type = "button";
    bClose.textContent = "Закрыть панель";
    bClose.style.cssText =
      "margin-top:8px;width:100%;min-height:42px;padding:10px;border:1px solid #cbd5e1;border-radius:10px;" +
      "background:#f8fafc;color:#334155;cursor:pointer;font-weight:600;";
    bClose.addEventListener("click", function () {
      box.remove();
    });

    devTrace.mountToggleRow(box, logLab);
    box.appendChild(logEl);
    box.appendChild(bClose);
    document.body.appendChild(box);
    devTrace.attachPanel(box);

    console.log("[Пульс OE] Панель открыта. Origin:", getPulseOrigin().origin);
  }
})();
