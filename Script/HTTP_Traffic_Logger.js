// =============================================================================
// HTTP_Traffic_Logger.js — фоновый логгер HTTP (fetch + XHR) для DevTools Console
// =============================================================================
// Отдельно от рабочих скриптов: только запросы/ответы сайта, без кликов UI.
// .log — headers + payload целиком (фильтр URL + маска ПДн); JSON — ответы без маски, связь corrId.
// Панель не блокирует страницу — можно ходить по UI и собирать трафик для ТЗ.
// Запуск: вставить файл в Console → Enter. Повторная вставка заменяет панель.
// =============================================================================
(function () {
  "use strict";

  var CFG = {
    PANEL_ID: "httpTrafficLoggerRoot",
    SCRIPT_ID: "HTTP_Traffic_Logger",
    FILE_PREFIX: "http_traffic_",
    /** Мягкий лимит на тело (защита от OOM); 0 = без обрезки. */
    MAX_BODY_LEN: 2 * 1024 * 1024,
    MAX_ENTRIES: 5000,
    FILTER_PLACEHOLDER:
      "Фильтр URL (по одной подстроке в строке). Пусто = все.\nПример:\n/proxy/v1/news\ngamification\nmultiSearch",
    DEFAULT_MASK: true
  };

  /** Ключи JSON, значения которых маскируются при включённой маске (news HAR + общие). */
  var TRACE_MASK_KEYS = {
    employeenumber: true,
    employeeid: true,
    createdby: true,
    lastname: true,
    firstname: true,
    midname: true,
    middlename: true,
    secondname: true,
    fullname: true,
    personuuid: true,
    userid: true,
    tabnumber: true,
    sberchatmention: true,
    alphalink: true,
    sigmalink: true,
    email: true,
    mail: true,
    phone: true,
    preferred_mail: true,
    preferred_phone: true,
    password: true,
    token: true,
    authorization: true,
    cookie: true,
    bossnames: true
  };

  var prev = document.getElementById(CFG.PANEL_ID);
  if (prev) {
    try {
      if (typeof prev.__httpLoggerCleanup === "function") prev.__httpLoggerCleanup();
    } catch (_e) {
      /* ignore */
    }
    prev.remove();
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function tsShort() {
    var d = new Date();
    return (
      d.getFullYear() +
      pad2(d.getMonth() + 1) +
      pad2(d.getDate()) +
      "_" +
      pad2(d.getHours()) +
      pad2(d.getMinutes()) +
      pad2(d.getSeconds())
    );
  }

  function truncBody(v, maxLen) {
    if (v == null) return { text: "", truncated: false, rawLen: 0 };
    var s = typeof v === "string" ? v : String(v);
    var lim = maxLen == null ? CFG.MAX_BODY_LEN : maxLen;
    if (!lim || lim <= 0 || s.length <= lim) {
      return { text: s, truncated: false, rawLen: s.length };
    }
    return {
      text: s.slice(0, lim) + "\n… [truncated " + (s.length - lim) + " chars]",
      truncated: true,
      rawLen: s.length
    };
  }

  function bodyToString(body) {
    if (body == null) return "";
    if (typeof body === "string") return body;
    if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
      return body.toString();
    }
    if (typeof Blob !== "undefined" && body instanceof Blob) {
      return "[Blob size=" + body.size + " type=" + (body.type || "") + "]";
    }
    if (typeof FormData !== "undefined" && body instanceof FormData) {
      try {
        var parts = [];
        body.forEach(function (val, key) {
          parts.push(key + "=" + (typeof val === "string" ? val : "[File/Blob]"));
        });
        return parts.join("&");
      } catch (_e) {
        return "[FormData]";
      }
    }
    if (typeof ArrayBuffer !== "undefined" && body instanceof ArrayBuffer) {
      return "[ArrayBuffer byteLength=" + body.byteLength + "]";
    }
    try {
      return String(body);
    } catch (_e2) {
      return "[unreadable body]";
    }
  }

  function headersToObject(headers) {
    var out = {};
    if (!headers) return out;
    try {
      if (typeof Headers !== "undefined" && headers instanceof Headers) {
        headers.forEach(function (value, key) {
          out[String(key)] = String(value);
        });
        return out;
      }
    } catch (_e) {
      /* fallthrough */
    }
    if (typeof headers === "object") {
      var keys = Object.keys(headers);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var v = headers[k];
        if (v == null) continue;
        out[String(k)] = String(v);
      }
    }
    return out;
  }

  function parseRawResponseHeaders(raw) {
    var out = {};
    var text = String(raw || "");
    if (!text) return out;
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var idx = line.indexOf(":");
      if (idx <= 0) continue;
      var key = line.slice(0, idx).replace(/^\s+|\s+$/g, "");
      var val = line.slice(idx + 1).replace(/^\s+|\s+$/g, "");
      if (!key) continue;
      if (out[key] != null) out[key] = out[key] + ", " + val;
      else out[key] = val;
    }
    return out;
  }

  function maskSensitiveValue(v) {
    var s = v == null ? "" : String(v);
    if (!s) return s;
    if (s.length === 1) return s + "***";
    if (s.length <= 4) return s.charAt(0) + "***" + s.slice(1);
    return s.charAt(0) + "***" + s.slice(-3);
  }

  function maskSensitiveTree(node) {
    if (node == null) return node;
    if (Array.isArray(node)) return node.map(maskSensitiveTree);
    if (typeof node === "object") {
      var out = {};
      var keys = Object.keys(node);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var val = node[k];
        var lk = String(k).toLowerCase();
        if (TRACE_MASK_KEYS[lk]) {
          if (typeof val === "string" || typeof val === "number") {
            out[k] = maskSensitiveValue(val);
          } else if (
            Array.isArray(val) &&
            val.every(function (x) {
              return typeof x === "string" || typeof x === "number";
            })
          ) {
            out[k] = val.map(maskSensitiveValue);
          } else {
            out[k] = maskSensitiveTree(val);
          }
        } else if (typeof val === "string") {
          var trimmed = val.replace(/^\s+/, "");
          if (trimmed.charAt(0) === "{" || trimmed.charAt(0) === "[") {
            try {
              out[k] = JSON.stringify(maskSensitiveTree(JSON.parse(val)));
            } catch (_e) {
              out[k] = maskSensitiveInPlainText(val);
            }
          } else {
            out[k] = maskSensitiveInPlainText(val);
          }
        } else {
          out[k] = maskSensitiveTree(val);
        }
      }
      return out;
    }
    return node;
  }

  function maskSensitiveInPlainText(s) {
    s = String(s);
    s = s.replace(
      /"(employeeNumber|employeeId|createdBy|lastName|firstName|midName|middleName|secondName|fullName|personUuid|userId|tabNumber|sberChatMention|alphaLink|sigmaLink|email|mail|phone|preferred_mail|preferred_phone|password|token|Authorization|Cookie|bossNames)"\s*:\s*"([^"]*)"/gi,
      function (_m, key, val) {
        return '"' + key + '": "' + maskSensitiveValue(val) + '"';
      }
    );
    return s;
  }

  function sanitizeBody(raw, enabled) {
    var s = String(raw == null ? "" : raw);
    if (!s || !enabled) return s;
    var t = s.replace(/^\s+/, "");
    if (t.charAt(0) === "{" || t.charAt(0) === "[") {
      try {
        return JSON.stringify(maskSensitiveTree(JSON.parse(s)));
      } catch (_e) {
        /* fallthrough */
      }
    }
    return maskSensitiveInPlainText(s);
  }

  function sanitizeHeaders(headersObj, enabled) {
    var src = headersObj && typeof headersObj === "object" ? headersObj : {};
    var out = {};
    var keys = Object.keys(src);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = src[k];
      var lk = String(k).toLowerCase();
      if (
        enabled &&
        (TRACE_MASK_KEYS[lk] ||
          lk === "authorization" ||
          lk === "cookie" ||
          lk === "set-cookie" ||
          lk === "x-auth-token" ||
          lk.indexOf("token") >= 0)
      ) {
        out[k] = maskSensitiveValue(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  function formatHeadersBlock(headersObj) {
    var h = headersObj && typeof headersObj === "object" ? headersObj : {};
    var keys = Object.keys(h);
    if (!keys.length) return "(нет)";
    var lines = [];
    for (var i = 0; i < keys.length; i++) {
      lines.push(keys[i] + ": " + h[keys[i]]);
    }
    return lines.join("\n");
  }

  function tryParseJsonValue(text) {
    var s = String(text == null ? "" : text);
    var t = s.replace(/^\s+/, "");
    if (!t || (t.charAt(0) !== "{" && t.charAt(0) !== "[")) return s;
    try {
      return JSON.parse(s);
    } catch (_e) {
      return s;
    }
  }

  function downloadText(filename, text, mime) {
    var blob = new Blob(["\uFEFF" + text], { type: mime || "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
    }, 500);
  }

  function downloadJson(filename, data) {
    downloadText(filename, JSON.stringify(data, null, 2), "application/json;charset=utf-8");
  }

  // --- состояние ---
  var recording = false;
  var maskOn = CFG.DEFAULT_MASK;
  /** @type {string[]} фильтр применяется при экспорте .log (не при захвате) */
  var filterParts = [];
  /** @type {object[]} сырые записи (без маски ПДн) */
  var entries = [];
  var seq = 0;
  var sessionId = tsShort() + "_" + Math.random().toString(36).slice(2, 8);
  var startedAt = "";
  var stats = { total: 0, ok: 0, err: 0, bytesIn: 0, bytesOut: 0 };
  var nativeFetch = window.fetch.bind(window);
  var NativeXHR = window.XMLHttpRequest;
  var hooksInstalled = false;

  function parseFilters(text) {
    return String(text || "")
      .split(/\n|;/g)
      .map(function (s) {
        return s.replace(/^\s+|\s+$/g, "");
      })
      .filter(Boolean);
  }

  function urlMatchesFilter(url, parts) {
    var list = parts || filterParts;
    if (!list.length) return true;
    var u = String(url || "").toLowerCase();
    for (var i = 0; i < list.length; i++) {
      if (u.indexOf(String(list[i]).toLowerCase()) >= 0) return true;
    }
    return false;
  }

  function shouldSkipUrl(url) {
    var u = String(url || "");
    if (!u || u.indexOf("blob:") === 0 || u.indexOf("data:") === 0) return true;
    return false;
  }

  function copyHeaders(obj) {
    var src = obj && typeof obj === "object" ? obj : {};
    var out = {};
    var keys = Object.keys(src);
    for (var i = 0; i < keys.length; i++) {
      out[keys[i]] = src[keys[i]];
    }
    return out;
  }

  /**
   * Пишет сырую запись в буфер (без маски).
   * Фильтр URL на захват не влияет — все HTTP попадают в буфер для JSON.
   */
  function pushEntry(partial) {
    if (!recording) return;
    if (shouldSkipUrl(partial.url)) return;

    seq++;
    var reqT = truncBody(bodyToString(partial.requestBody));
    var respT = truncBody(bodyToString(partial.responseBody));
    var corrId = "httplog_" + sessionId + "_" + seq;
    var entry = {
      id: seq,
      corrId: corrId,
      sessionId: sessionId,
      ts: nowIso(),
      kind: partial.kind || "fetch",
      method: String(partial.method || "GET").toUpperCase(),
      url: String(partial.url || ""),
      status: partial.status == null ? null : Number(partial.status),
      statusText: partial.statusText != null ? String(partial.statusText) : "",
      ok: !!partial.ok,
      durationMs: partial.durationMs == null ? null : Number(partial.durationMs),
      requestHeaders: copyHeaders(partial.requestHeaders),
      responseHeaders: copyHeaders(partial.responseHeaders),
      requestBody: reqT.text,
      responseBody: respT.text,
      requestBodyRawLen: reqT.rawLen,
      responseBodyRawLen: respT.rawLen,
      requestTruncated: reqT.truncated,
      responseTruncated: respT.truncated
    };

    entries.push(entry);
    if (entries.length > CFG.MAX_ENTRIES) {
      entries = entries.slice(entries.length - CFG.MAX_ENTRIES);
    }

    stats.total++;
    if (entry.status != null && entry.status >= 200 && entry.status < 400) stats.ok++;
    else if (entry.status != null) stats.err++;
    stats.bytesOut += reqT.rawLen;
    stats.bytesIn += respT.rawLen;
    refreshStats();
  }

  function installHooks() {
    if (hooksInstalled) return;
    hooksInstalled = true;

    window.fetch = async function (input, init) {
      if (!recording) return nativeFetch(input, init);
      var url =
        typeof input === "string"
          ? input
          : input && typeof input === "object" && "url" in input
            ? String(input.url)
            : String(input);
      var method = (init && init.method) || (input && input.method) || "GET";
      var reqHeaders = {};
      try {
        if (init && init.headers) reqHeaders = headersToObject(init.headers);
        else if (input && typeof input === "object" && input.headers) {
          reqHeaders = headersToObject(input.headers);
        }
      } catch (_eh) {
        reqHeaders = {};
      }
      var reqBody = "";
      if (init && init.body != null) {
        reqBody = bodyToString(init.body);
      } else if (input && typeof input === "object" && typeof input.clone === "function") {
        try {
          reqBody = await input.clone().text();
        } catch (_eb) {
          reqBody = "";
        }
      }
      var t0 = Date.now();
      var res;
      try {
        res = await nativeFetch(input, init);
      } catch (ex) {
        pushEntry({
          kind: "fetch",
          method: method,
          url: url,
          status: 0,
          statusText: "",
          ok: false,
          durationMs: Date.now() - t0,
          requestHeaders: reqHeaders,
          responseHeaders: {},
          requestBody: reqBody,
          responseBody: "ERROR: " + (ex && ex.message ? ex.message : String(ex))
        });
        throw ex;
      }
      var ms = Date.now() - t0;
      var respText = "";
      var respHeaders = {};
      try {
        respHeaders = headersToObject(res.headers);
      } catch (_hr) {
        respHeaders = {};
      }
      try {
        respText = await res.clone().text();
      } catch (_e2) {
        respText = "[body read error]";
      }
      pushEntry({
        kind: "fetch",
        method: method,
        url: url,
        status: res.status,
        statusText: res.statusText || "",
        ok: res.ok,
        durationMs: ms,
        requestHeaders: reqHeaders,
        responseHeaders: respHeaders,
        requestBody: reqBody,
        responseBody: respText
      });
      return res;
    };

    function PatchedXHR() {
      var xhr = new NativeXHR();
      var _method = "GET";
      var _url = "";
      var _reqBody = "";
      var _reqHeaders = {};
      var _t0 = 0;

      var openOrig = xhr.open;
      xhr.open = function (method, url) {
        _method = method;
        _url = url;
        _reqHeaders = {};
        return openOrig.apply(xhr, arguments);
      };

      var setHdrOrig = xhr.setRequestHeader;
      xhr.setRequestHeader = function (name, value) {
        try {
          var k = String(name);
          var v = String(value);
          if (_reqHeaders[k] != null) _reqHeaders[k] = _reqHeaders[k] + ", " + v;
          else _reqHeaders[k] = v;
        } catch (_e) {
          /* ignore */
        }
        return setHdrOrig.apply(xhr, arguments);
      };

      var sendOrig = xhr.send;
      xhr.send = function (body) {
        _reqBody = body == null ? "" : bodyToString(body);
        _t0 = Date.now();
        if (recording) {
          xhr.addEventListener(
            "loadend",
            function () {
              var respHeaders = {};
              try {
                respHeaders = parseRawResponseHeaders(xhr.getAllResponseHeaders());
              } catch (_e) {
                respHeaders = {};
              }
              pushEntry({
                kind: "xhr",
                method: _method,
                url: _url,
                status: xhr.status,
                statusText: xhr.statusText || "",
                ok: xhr.status >= 200 && xhr.status < 400,
                durationMs: Date.now() - _t0,
                requestHeaders: copyHeaders(_reqHeaders),
                responseHeaders: respHeaders,
                requestBody: _reqBody,
                responseBody: xhr.responseText || ""
              });
            },
            { once: true }
          );
        }
        return sendOrig.apply(xhr, arguments);
      };

      return xhr;
    }
    PatchedXHR.prototype = NativeXHR.prototype;
    window.XMLHttpRequest = /** @type {typeof XMLHttpRequest} */ (PatchedXHR);
  }

  function uninstallHooks() {
    if (!hooksInstalled) return;
    window.fetch = nativeFetch;
    window.XMLHttpRequest = NativeXHR;
    hooksInstalled = false;
  }

  function currentLogFilters() {
    if (recording) return filterParts.slice();
    return parseFilters(filterTa.value);
  }

  /** .log: полный дамп (заголовки + payload), с фильтром URL и маской ПДн. */
  function buildLogText() {
    var filters = currentLogFilters();
    var lines = [];
    var kept = 0;
    lines.push(
      "# HTTP_Traffic_Logger sessionId=" +
        sessionId +
        " origin=" +
        String(window.location && window.location.origin ? window.location.origin : "") +
        " exported=" +
        nowIso() +
        " mask=" +
        maskOn
    );
    lines.push("# filters=" + (filters.length ? filters.join(" | ") : "(all)"));
    lines.push("# Связь с JSON: поле corrId / id совпадает в обоих файлах.");
    lines.push("# В .log — запрос+ответ целиком (с маской ПДн при включении).");
    lines.push("# В JSON — ответы без маски ПДн, все URL (фильтр на JSON не действует).");

    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (!urlMatchesFilter(e.url, filters)) continue;
      kept++;
      var reqHdr = sanitizeHeaders(e.requestHeaders, maskOn);
      var respHdr = sanitizeHeaders(e.responseHeaders, maskOn);
      var reqBody = sanitizeBody(e.requestBody, maskOn);
      var respBody = sanitizeBody(e.responseBody, maskOn);

      lines.push("");
      lines.push(
        "================================================================================"
      );
      lines.push(
        "--- #" +
          e.id +
          " corrId=" +
          e.corrId +
          " " +
          e.ts +
          " [" +
          e.kind +
          "] " +
          e.method +
          " " +
          e.status +
          (e.statusText ? " " + e.statusText : "") +
          " " +
          (e.durationMs != null ? e.durationMs + "ms" : "")
      );
      lines.push("URL " + e.url);
      lines.push("");
      lines.push(">>> REQUEST HEADERS");
      lines.push(formatHeadersBlock(reqHdr));
      lines.push("");
      lines.push(
        ">>> REQUEST PAYLOAD" +
          (e.requestTruncated ? " [truncated rawLen=" + e.requestBodyRawLen + "]" : "") +
          (reqBody ? "" : " (пусто)")
      );
      if (reqBody) lines.push(reqBody);
      lines.push("");
      lines.push("<<< RESPONSE HEADERS");
      lines.push(formatHeadersBlock(respHdr));
      lines.push("");
      lines.push(
        "<<< RESPONSE BODY" +
          (e.responseTruncated ? " [truncated rawLen=" + e.responseBodyRawLen + "]" : "") +
          (respBody ? "" : " (пусто)")
      );
      if (respBody) lines.push(respBody);
    }
    lines.push("");
    lines.push("# exportedInLog=" + kept + " ofCaptured=" + entries.length);
    return lines.join("\n") + "\n";
  }

  /**
   * JSON: ответы сайта целиком, без маски ПДн, без фильтра URL.
   * Связь с .log: id + corrId (+ method/url/ts).
   */
  function buildJsonResponses() {
    var responses = [];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      responses.push({
        id: e.id,
        corrId: e.corrId,
        sessionId: e.sessionId,
        ts: e.ts,
        kind: e.kind,
        method: e.method,
        url: e.url,
        status: e.status,
        statusText: e.statusText || "",
        ok: e.ok,
        durationMs: e.durationMs,
        request: {
          headers: copyHeaders(e.requestHeaders),
          payload: tryParseJsonValue(e.requestBody),
          payloadRawLen: e.requestBodyRawLen,
          truncated: e.requestTruncated
        },
        response: {
          headers: copyHeaders(e.responseHeaders),
          body: tryParseJsonValue(e.responseBody),
          bodyRawLen: e.responseBodyRawLen,
          truncated: e.responseTruncated
        }
      });
    }
    return {
      exportMeta: {
        scriptId: CFG.SCRIPT_ID,
        format: "http_traffic_responses_v2",
        sessionId: sessionId,
        origin: String(window.location && window.location.origin ? window.location.origin : ""),
        pageUrl: String(window.location && window.location.href ? window.location.href : ""),
        startedAt: startedAt || null,
        exportedAt: nowIso(),
        maskApplied: false,
        note:
          "Ответы и заголовки без маски ПДн. Связь с .log по corrId (и id). Фильтр URL на JSON не действует.",
        maxBodyLen: CFG.MAX_BODY_LEN,
        stats: {
          total: stats.total,
          ok: stats.ok,
          err: stats.err,
          bytesOut: stats.bytesOut,
          bytesIn: stats.bytesIn,
          responses: responses.length
        }
      },
      responses: responses
    };
  }

  // --- UI ---
  var root = document.createElement("div");
  root.id = CFG.PANEL_ID;
  root.style.cssText =
    "position:fixed;right:12px;bottom:12px;z-index:2147483646;width:340px;" +
    "font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:12px;color:#0f172a;" +
    "color-scheme:light;box-shadow:0 12px 40px rgba(15,23,42,.22);border-radius:12px;" +
    "border:1px solid #94a3b8;background:#fff;overflow:hidden;";

  var fullView = document.createElement("div");
  root.appendChild(fullView);

  var head = document.createElement("div");
  head.style.cssText =
    "display:flex;align-items:center;gap:8px;padding:8px 10px;background:#0f172a;color:#f8fafc;";
  fullView.appendChild(head);

  var title = document.createElement("div");
  title.style.cssText = "font-weight:700;font-size:12px;letter-spacing:0.02em;flex:1;";
  title.textContent = "HTTP Logger";
  head.appendChild(title);

  var recDot = document.createElement("span");
  recDot.style.cssText =
    "width:8px;height:8px;border-radius:50%;background:#64748b;display:inline-block;flex-shrink:0;";
  head.appendChild(recDot);

  function mkHeadBtn(label, titleText) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.title = titleText || label;
    b.style.cssText =
      "padding:2px 7px;border-radius:5px;border:1px solid #475569;background:#1e293b;color:#e2e8f0;" +
      "cursor:pointer;font-size:11px;font-weight:600;";
    return b;
  }

  var btnMin = mkHeadBtn("—", "Свернуть");
  var btnClose = mkHeadBtn("×", "Закрыть и снять перехват");
  head.appendChild(btnMin);
  head.appendChild(btnClose);

  var body = document.createElement("div");
  body.style.cssText = "padding:10px;display:flex;flex-direction:column;gap:8px;background:#f8fafc;";
  fullView.appendChild(body);

  var rowMain = document.createElement("div");
  rowMain.style.cssText = "display:flex;gap:6px;align-items:center;flex-wrap:wrap;";
  body.appendChild(rowMain);

  function mkBtn(text, css) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.style.cssText =
      "padding:6px 10px;border-radius:7px;border:1px solid #94a3b8;background:#fff;color:#0f172a;" +
      "cursor:pointer;font-size:12px;font-weight:700;" +
      (css || "");
    return b;
  }

  var btnToggle = mkBtn("▶ Старт", "background:#16a34a;border-color:#16a34a;color:#fff;min-width:88px;");
  rowMain.appendChild(btnToggle);

  var maskLab = document.createElement("label");
  maskLab.style.cssText =
    "display:inline-flex;align-items:center;gap:5px;font-size:11px;color:#334155;cursor:pointer;" +
    "padding:5px 8px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;";
  var maskCb = document.createElement("input");
  maskCb.type = "checkbox";
  maskCb.checked = maskOn;
  maskLab.title = "Маска ПДн применяется только к файлу .log (JSON всегда без маски)";
  maskLab.appendChild(maskCb);
  maskLab.appendChild(document.createTextNode("Маска ПДн (.log)"));
  rowMain.appendChild(maskLab);

  var statsEl = document.createElement("div");
  statsEl.style.cssText =
    "font-family:ui-monospace,monospace;font-size:11px;color:#334155;line-height:1.45;" +
    "padding:7px 8px;border-radius:8px;border:1px solid #e2e8f0;background:#fff;";
  body.appendChild(statsEl);

  var filterTa = document.createElement("textarea");
  filterTa.rows = 3;
  filterTa.placeholder = CFG.FILTER_PLACEHOLDER;
  filterTa.style.cssText =
    "width:100%;box-sizing:border-box;resize:vertical;padding:7px 8px;border:1px solid #94a3b8;" +
    "border-radius:8px;font-size:11px;font-family:ui-monospace,monospace;background:#fff;color:#0f172a;";
  body.appendChild(filterTa);

  var hint = document.createElement("div");
  hint.style.cssText = "font-size:10px;color:#64748b;line-height:1.35;";
  hint.textContent =
    ".log — заголовки + payload запроса/ответа целиком (фильтр URL + маска ПДн). JSON — все ответы без маски; связь по corrId/id. Клики не пишутся.";
  body.appendChild(hint);

  var rowActions = document.createElement("div");
  rowActions.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;";
  body.appendChild(rowActions);

  var btnSaveJson = mkBtn("⬇ JSON");
  var btnSaveLog = mkBtn("⬇ .log");
  var btnClear = mkBtn("Очистить");
  rowActions.appendChild(btnSaveJson);
  rowActions.appendChild(btnSaveLog);
  rowActions.appendChild(btnClear);

  // мини-бар
  var mini = document.createElement("div");
  mini.style.cssText =
    "display:none;align-items:center;gap:8px;padding:7px 10px;background:#0f172a;color:#f8fafc;cursor:pointer;";
  mini.title = "Развернуть";
  root.appendChild(mini);
  var miniDot = document.createElement("span");
  miniDot.style.cssText =
    "width:8px;height:8px;border-radius:50%;background:#64748b;display:inline-block;";
  mini.appendChild(miniDot);
  var miniText = document.createElement("span");
  miniText.style.cssText = "font-size:11px;font-weight:700;font-family:ui-monospace,monospace;";
  miniText.textContent = "HTTP · idle";
  mini.appendChild(miniText);

  function fmtBytes(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(2) + " MB";
  }

  function refreshStats() {
    statsEl.textContent =
      "запросов: " +
      stats.total +
      "  ·  OK: " +
      stats.ok +
      "  ·  err: " +
      stats.err +
      "\nв буфере: " +
      entries.length +
      "  ·  out " +
      fmtBytes(stats.bytesOut) +
      "  ·  in " +
      fmtBytes(stats.bytesIn) +
      (maskOn ? "  ·  mask ON" : "  ·  mask OFF") +
      (filterParts.length ? "  ·  filter " + filterParts.length : "  ·  all URLs");

    var label = recording
      ? "● REC  " + stats.total
      : "○ idle  " + stats.total;
    miniText.textContent = "HTTP · " + label;
    recDot.style.background = recording ? "#ef4444" : "#64748b";
    miniDot.style.background = recording ? "#ef4444" : "#64748b";
  }

  function setRecording(on) {
    recording = !!on;
    if (recording) {
      filterParts = parseFilters(filterTa.value);
      if (!startedAt) startedAt = nowIso();
      installHooks();
      btnToggle.textContent = "⏹ Стоп";
      btnToggle.style.background = "#dc2626";
      btnToggle.style.borderColor = "#dc2626";
      filterTa.disabled = true;
      filterTa.style.opacity = "0.65";
    } else {
      btnToggle.textContent = "▶ Старт";
      btnToggle.style.background = "#16a34a";
      btnToggle.style.borderColor = "#16a34a";
      filterTa.disabled = false;
      filterTa.style.opacity = "1";
      // hooks остаются, пока панель открыта — но pushEntry no-op without recording
      // оставляем hooks чтобы не мигать; при закрытии снимем
    }
    refreshStats();
  }

  function cleanup() {
    setRecording(false);
    uninstallHooks();
  }

  root.__httpLoggerCleanup = cleanup;

  btnToggle.addEventListener("click", function () {
    setRecording(!recording);
  });

  maskCb.addEventListener("change", function () {
    maskOn = !!maskCb.checked;
    refreshStats();
  });

  btnClear.addEventListener("click", function () {
    entries = [];
    seq = 0;
    sessionId = tsShort() + "_" + Math.random().toString(36).slice(2, 8);
    startedAt = recording ? nowIso() : "";
    stats = { total: 0, ok: 0, err: 0, bytesIn: 0, bytesOut: 0 };
    refreshStats();
  });

  btnSaveJson.addEventListener("click", function () {
    downloadJson(CFG.FILE_PREFIX + tsShort() + ".json", buildJsonResponses());
  });

  btnSaveLog.addEventListener("click", function () {
    downloadText(CFG.FILE_PREFIX + tsShort() + ".log", buildLogText());
  });

  btnMin.addEventListener("click", function () {
    fullView.style.display = "none";
    mini.style.display = "flex";
    root.style.width = "auto";
  });

  mini.addEventListener("click", function () {
    mini.style.display = "none";
    fullView.style.display = "block";
    root.style.width = "340px";
  });

  btnClose.addEventListener("click", function () {
    cleanup();
    root.remove();
  });

  // лёгкий drag за заголовок
  (function () {
    var dragging = false;
    var ox = 0;
    var oy = 0;
    head.style.cursor = "move";
    head.addEventListener("mousedown", function (ev) {
      if (ev.target !== head && ev.target !== title && ev.target !== recDot) return;
      dragging = true;
      var rect = root.getBoundingClientRect();
      ox = ev.clientX - rect.left;
      oy = ev.clientY - rect.top;
      root.style.right = "auto";
      root.style.bottom = "auto";
      root.style.left = rect.left + "px";
      root.style.top = rect.top + "px";
      ev.preventDefault();
    });
    document.addEventListener("mousemove", function (ev) {
      if (!dragging) return;
      root.style.left = Math.max(0, ev.clientX - ox) + "px";
      root.style.top = Math.max(0, ev.clientY - oy) + "px";
    });
    document.addEventListener("mouseup", function () {
      dragging = false;
    });
  })();

  document.body.appendChild(root);
  installHooks(); // готовы к старту; запись только после ▶
  refreshStats();
  console.log(
    "[HTTP_Traffic_Logger] Панель открыта. Нажмите «Старт», ходите по сайту, затем «⬇ JSON» / «⬇ .log»."
  );
})();
