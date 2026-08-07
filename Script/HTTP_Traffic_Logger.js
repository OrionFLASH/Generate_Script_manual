// =============================================================================
// HTTP_Traffic_Logger.js — фоновый логгер HTTP (+ UI) и режим Play для DevTools
// =============================================================================
// Артефакты записи (общий timestamp / sessionId / eventId):
//   .log  — фронт↔бэк (состав по тоглам)
//   .json — ответы сайта (если тогл JSON)
//   _ui.log — клики/действия UI (если тогл UI)
// Режим Play: вкладка → загрузка _ui.log → прокликивание «плёнки» + сбор HTTP,
//   ошибки статусов/тела, slow-запросы, статистика, Стоп.
// =============================================================================
(function () {
  "use strict";

  var CFG = {
    PANEL_ID: "httpTrafficLoggerRoot",
    SCRIPT_ID: "HTTP_Traffic_Logger",
    FILE_PREFIX: "httplog_",
    PLAY_FILE_PREFIX: "httplog_",
    /** Мягкий лимит на тело (защита от OOM); 0 = без обрезки. */
    MAX_BODY_LEN: 2 * 1024 * 1024,
    MAX_ENTRIES: 5000,
    MAX_UI_EVENTS: 8000,
    FILTER_PLACEHOLDER:
      "Фильтр URL для .log (по одной подстроке в строке). Пусто = все.\nПример:\n/proxy/v1/news\ngamification\nmultiSearch",
    DEFAULT_MASK: true,
    /** Пауза между шагами Play (мс). */
    PLAY_STEP_DELAY_MS: 700,
    /** Ожидание «тишины» сети после шага (мс без новых HTTP). */
    PLAY_SETTLE_MS: 900,
    /** Абсолютный порог «долгого» запроса (мс). */
    PLAY_SLOW_ABS_MS: 2500,
    /** Относительный порог: duration > median * factor. */
    PLAY_SLOW_FACTOR: 2.5,
    /** Макс. ожидание settle (мс), чтобы не зависнуть. */
    PLAY_SETTLE_MAX_MS: 15000,
    /** Сколько ждать появления элемента при Play (модалки и т.п.), мс. */
    PLAY_FIND_TIMEOUT_MS: 5000,
    /** Ожидание появления модалки/поповера перед шагом внутри overlay. */
    PLAY_OVERLAY_TIMEOUT_MS: 4000
  };

  /** Ключи JSON, значения которых маскируются при включённой маске (news HAR + общие). */
  var TRACE_MASK_KEYS = {
    employeenumber: true,
    tabnum: true,
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

  /**
   * Основная часть хоста для имени файла: без схемы, без www, без TLD (.ru/.com/…).
   * Пример: promo.sigma.sber.ru → promo.sigma.sber
   */
  function siteHostTag() {
    var host = "";
    try {
      host = String((window.location && window.location.hostname) || "");
    } catch (_e) {
      host = "";
    }
    host = host.replace(/^www\./i, "");
    host = host.replace(
      /\.(ru|su|by|kz|ua|com|net|org|io|dev|app|local|test|internal|corp|xn--p1ai)$/i,
      ""
    );
    host = host
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^[._]+|[._]+$/g, "");
    if (!host) host = "local";
    if (host.length > 48) host = host.slice(0, 48);
    return host;
  }

  /**
   * kind: http | json | ui | test
   * (запись: http/json/ui; Play → один полный test-лог)
   */
  function makeExportFilename(kind, stamp, ext) {
    var k = String(kind || "http").replace(/[^a-z0-9]+/gi, "");
    if (!k) k = "data";
    return (
      CFG.FILE_PREFIX +
      siteHostTag() +
      "_" +
      k +
      "_" +
      (stamp || tsShort()) +
      "." +
      String(ext || "log").replace(/^\./, "")
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
    }, 1500);
  }

  function downloadJson(filename, data) {
    downloadText(filename, JSON.stringify(data, null, 2), "application/json;charset=utf-8");
  }

  /**
   * Несколько файлов подряд: браузер часто блокирует 2–3-ю загрузку в одном клике.
   * Качаем с паузой; при блокировке — разрешить «несколько файлов» для сайта.
   */
  function downloadSequentially(jobs, delayMs) {
    var gap = delayMs == null ? 400 : delayMs;
    var i = 0;
    function step() {
      if (i >= jobs.length) return;
      var job = jobs[i++];
      if (job.mime) downloadText(job.filename, job.text, job.mime);
      else downloadText(job.filename, job.text);
      if (i < jobs.length) setTimeout(step, gap);
    }
    step();
  }

  // --- состояние ---
  var recording = false;
  /** Режим воспроизведения UI-плёнки. */
  var playing = false;
  var maskOn = CFG.DEFAULT_MASK;
  /** Состав экспорта / захвата (тоглы панели). По умолчанию: заг. req/resp + payload + JSON ответы. */
  var exportOpts = {
    logReqHeaders: true,
    logRespHeaders: true,
    logReqBody: true,
    logRespBody: false,
    logTiming: false,
    saveJson: true,
    captureUi: false
  };
  /** @type {string[]} фильтр применяется при экспорте .log (не при захвате) */
  var filterParts = [];
  /** @type {object[]} сырые HTTP-записи (без маски ПДн) */
  var entries = [];
  /** @type {object[]} клики/действия UI сайта */
  var uiEvents = [];
  var seq = 0;
  var uiSeq = 0;
  /** Сквозной счётчик событий session (HTTP + UI) для связи файлов. */
  var eventSeq = 0;
  var lastUiEventId = null;
  var sessionId = tsShort() + "_" + Math.random().toString(36).slice(2, 8);
  var startedAt = "";
  var stats = { total: 0, ok: 0, err: 0, bytesIn: 0, bytesOut: 0, ui: 0 };
  var lastHttpAt = 0;
  var playStepIndex = -1;
  var nativeFetch = window.fetch.bind(window);
  var NativeXHR = window.XMLHttpRequest;
  var hooksInstalled = false;
  var uiHooksInstalled = false;

  /** Состояние вкладки Play. */
  var play = {
    script: /** @type {object[]} */ ([]),
    fileName: "",
    index: 0,
    abort: false,
    stepDelayMs: CFG.PLAY_STEP_DELAY_MS,
    settleMs: CFG.PLAY_SETTLE_MS,
    slowAbsMs: CFG.PLAY_SLOW_ABS_MS,
    slowFactor: CFG.PLAY_SLOW_FACTOR,
    findings: /** @type {object[]} */ ([]),
    stepLog: /** @type {object[]} */ ([]),
    stats: {
      stepsTotal: 0,
      stepsOk: 0,
      stepsFail: 0,
      stepsSkip: 0,
      httpOk: 0,
      httpErr: 0,
      bodyErr: 0,
      slow: 0
    },
    startedAt: "",
    finishedAt: "",
    /** Идёт накопление тест-лога (несколько Play до очистки). */
    testActive: false,
    runCount: 0,
    statusText: "Загрузите _ui.log для воспроизведения."
  };

  function nextEventId(kind) {
    eventSeq++;
    return "evt_" + sessionId + "_" + eventSeq + (kind ? "_" + kind : "");
  }

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

  function cssEscapeIdent(s) {
    var str = String(s || "");
    try {
      if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(str);
    } catch (_e) {
      /* ignore */
    }
    return str.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
  }

  function isStableClassToken(tok) {
    if (!tok || tok.length > 48) return false;
    // emotion/css-modules и Tailwind arbitrary — плохи для querySelector
    if (/^css-/i.test(tok)) return false;
    if (/[:/\[\]]/.test(tok)) return false;
    if (/^_r_/i.test(tok)) return false;
    return /^[a-zA-Z_][\w-]*$/.test(tok);
  }

  function getXPath(el) {
    try {
      if (!el || el.nodeType !== 1) return "";
      if (el.id) return '//*[@id="' + String(el.id).replace(/"/g, '\\"') + '"]';
      var parts = [];
      var cur = el;
      var depth = 0;
      while (cur && cur.nodeType === 1 && depth < 10) {
        var tag = cur.nodeName.toLowerCase();
        var ix = 1;
        var sib = cur.previousElementSibling;
        while (sib) {
          if (sib.nodeName === cur.nodeName) ix++;
          sib = sib.previousElementSibling;
        }
        parts.unshift(tag + "[" + ix + "]");
        cur = cur.parentElement;
        depth++;
        if (cur && cur.id) {
          parts.unshift('//*[@id="' + String(cur.id).replace(/"/g, '\\"') + '"]');
          return parts.join("/");
        }
      }
      return "/" + parts.join("/");
    } catch (_e) {
      return "";
    }
  }

  function describeDomTarget(el) {
    if (!el || !el.tagName) {
      return { tag: "", selector: "", text: "" };
    }
    var tag = String(el.tagName || "").toLowerCase();
    var id = el.id ? String(el.id) : "";
    // нестабильные react-id и react-select-N-option-M не как #id
    var reactSelectOption = /^react-select-\d+-option-\d+$/i.test(id);
    if (id && (/^_r_/i.test(id) || reactSelectOption)) id = "";
    var clsRaw =
      el.className && typeof el.className === "string"
        ? el.className.replace(/\s+/g, " ").trim().slice(0, 160)
        : "";
    var name = el.getAttribute && el.getAttribute("name") ? String(el.getAttribute("name")) : "";
    // нестабильные name=_r_…
    var nameUnstable = !!(name && /^_r_/i.test(name));
    var type = el.getAttribute && el.getAttribute("type") ? String(el.getAttribute("type")) : "";
    var href = el.getAttribute && el.getAttribute("href") ? String(el.getAttribute("href")).slice(0, 200) : "";
    var role = el.getAttribute && el.getAttribute("role") ? String(el.getAttribute("role")) : "";
    if (reactSelectOption && !role) role = "option";
    var ariaLabel =
      el.getAttribute && el.getAttribute("aria-label")
        ? String(el.getAttribute("aria-label")).slice(0, 120)
        : "";
    var title =
      el.getAttribute && el.getAttribute("title") ? String(el.getAttribute("title")).slice(0, 120) : "";
    var testId =
      el.getAttribute && el.getAttribute("data-testid")
        ? String(el.getAttribute("data-testid")).slice(0, 80)
        : "";
    var placeholder =
      el.getAttribute && el.getAttribute("placeholder")
        ? String(el.getAttribute("placeholder")).slice(0, 80)
        : "";
    var inputValue = "";
    try {
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
        inputValue = String(el.value || "").slice(0, 120);
      }
    } catch (_v) {
      inputValue = "";
    }
    var checked = null;
    try {
      if (el instanceof HTMLInputElement && (type === "checkbox" || type === "radio")) {
        checked = !!el.checked;
      }
    } catch (_c) {
      checked = null;
    }
    var inOverlay = false;
    try {
      inOverlay = !!(
        el.closest &&
        el.closest(
          '#dialog, dialog, [role="dialog"], [aria-modal="true"], #popover, [data-radix-popper-content-wrapper]'
        )
      );
    } catch (_o) {
      inOverlay = false;
    }
    var text = "";
    try {
      text = String(el.innerText || el.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 100);
    } catch (_e) {
      text = "";
    }
    // целый dialog даёт огромный text — для цели бесполезен
    if (tag === "dialog" || (text.length > 80 && tag === "div" && !role)) {
      /* оставим короткий кусок */
      if (tag === "dialog") text = text.slice(0, 40);
    }
    if (!text && ariaLabel) text = ariaLabel;
    if (!text && title) text = title;

    // Стабильный селектор
    var sel = tag;
    if (id && !/^_r_/i.test(id) && !reactSelectOption) {
      sel = tag + "#" + cssEscapeIdent(id);
    } else if (name && !nameUnstable) {
      sel = tag + '[name="' + name.replace(/"/g, '\\"') + '"]';
      if (type) sel += '[type="' + type.replace(/"/g, '\\"') + '"]';
    } else if (inputValue && (type === "radio" || type === "checkbox")) {
      sel =
        (tag || "input") +
        '[type="' +
        type +
        '"][value="' +
        inputValue.replace(/"/g, '\\"') +
        '"]';
    } else if (role === "option" && text) {
      sel = '[role="option"]';
    } else if (testId) {
      sel = tag + '[data-testid="' + testId.replace(/"/g, '\\"') + '"]';
    } else if (ariaLabel) {
      sel = tag + '[aria-label="' + ariaLabel.replace(/"/g, '\\"') + '"]';
    } else if (href && tag === "a") {
      sel = 'a[href="' + href.replace(/"/g, '\\"') + '"]';
    } else {
      var parts = clsRaw.split(" ").filter(isStableClassToken).slice(0, 3);
      if (parts.length) {
        sel = tag + "." + parts.map(cssEscapeIdent).join(".");
      } else if (role) {
        sel = tag + '[role="' + role.replace(/"/g, '\\"') + '"]';
      }
    }

    return {
      tag: tag,
      id: id,
      className: clsRaw,
      name: nameUnstable ? "" : name,
      nameRaw: name,
      type: type,
      href: href,
      role: role,
      ariaLabel: ariaLabel,
      title: title,
      testId: testId,
      placeholder: placeholder,
      inputValue: inputValue,
      checked: checked,
      inOverlay: inOverlay,
      reactSelectOption: reactSelectOption,
      text: text,
      selector: sel,
      xpath: getXPath(el)
    };
  }

  function isInsideLoggerPanel(el) {
    if (!el || !el.closest) return false;
    try {
      return !!el.closest("#" + CFG.PANEL_ID);
    } catch (_e) {
      return false;
    }
  }

  var UI_CLICK_CLOSEST =
    "button,a,[role='button'],[role='tab'],[role='menuitem'],[role='menuitemcheckbox']," +
    "[role='option'],[role='checkbox'],[role='switch'],[role='radio'],[role='listitem']," +
    "input,select,textarea,label,summary,[contenteditable='true']," +
    "[id*='-option-']";

  function resolveClickTarget(el) {
    if (!el || !el.closest) return el;
    var tag = String(el.tagName || "").toLowerCase();
    // SVG-декор (path/rect/…) → ближайшая кнопка/ссылка
    if (/^(path|rect|circle|ellipse|line|polyline|polygon|use|g)$/i.test(tag) || tag === "svg") {
      var fromSvg = el.closest(
        "button,a,[role='button'],[role='menuitem'],[role='tab'],label,summary"
      );
      if (fromSvg) return fromSvg;
    }
    // option react-select
    var opt = el.closest("[role='option'],[id*='-option-']");
    if (opt) return opt;

    var focus = el.closest(UI_CLICK_CLOSEST);
    if (focus) {
      var ft = String(focus.tagName || "").toLowerCase();
      // клик по оболочке dialog — ищем реальный контрол
      if (ft === "dialog" || focus.id === "dialog") {
        var inner = el.closest(
          "button,a,input,label,[role='button'],[role='option'],[role='menuitem'],[id*='-option-']"
        );
        if (inner && inner !== focus) return inner;
        return null;
      }
      return focus;
    }
    var p = el;
    for (var i = 0; i < 6 && p; i++) {
      try {
        var st = window.getComputedStyle(p);
        if (st && st.cursor === "pointer") {
          var pt = String(p.tagName || "").toLowerCase();
          if (pt !== "dialog") return p;
        }
      } catch (_e) {
        /* ignore */
      }
      p = p.parentElement;
    }
    if (tag === "dialog") return null;
    return el;
  }

  function isNoiseUiTarget(target) {
    var t = target || {};
    var tag = String(t.tag || "").toLowerCase();
    if (tag === "dialog") return true;
    if (/^(path|rect|circle|ellipse|line|polyline|polygon|use|svg)$/i.test(tag)) return true;
    if (/^dialog(#dialog)?$/i.test(String(t.selector || ""))) return true;
    if (/^(path|rect)#/i.test(String(t.selector || ""))) return true;
    return false;
  }

  /**
   * Пишет сырую HTTP-запись в буфер (без маски).
   * Фильтр URL на захват не влияет — все HTTP попадают в буфер для JSON.
   * Работает при записи и при Play.
   */
  function pushEntry(partial) {
    if (!recording && !playing) return;
    if (shouldSkipUrl(partial.url)) return;

    seq++;
    var reqT = truncBody(bodyToString(partial.requestBody));
    var respT = truncBody(bodyToString(partial.responseBody));
    var eventId = nextEventId("http");
    var corrId = "httplog_" + sessionId + "_" + seq;
    var entry = {
      id: seq,
      corrId: corrId,
      eventId: eventId,
      eventSeq: eventSeq,
      sessionId: sessionId,
      afterUiEventId: lastUiEventId,
      playStepIndex: playing ? playStepIndex : null,
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

    lastHttpAt = Date.now();
    stats.total++;
    if (entry.status != null && entry.status >= 200 && entry.status < 400) stats.ok++;
    else if (entry.status != null) stats.err++;
    stats.bytesOut += reqT.rawLen;
    stats.bytesIn += respT.rawLen;
    refreshStats();
  }

  function pushUiEvent(partial) {
    if (playing) return;
    if (!recording || !exportOpts.captureUi) return;
    uiSeq++;
    var eventId = nextEventId("ui");
    var corrId = "httplog_" + sessionId + "_ui_" + uiSeq;
    var row = {
      id: uiSeq,
      corrId: corrId,
      eventId: eventId,
      eventSeq: eventSeq,
      sessionId: sessionId,
      ts: nowIso(),
      action: String(partial.action || "click"),
      pageUrl: String(window.location && window.location.href ? window.location.href : ""),
      target: partial.target || {},
      detail: partial.detail || null
    };
    lastUiEventId = eventId;
    uiEvents.push(row);
    if (uiEvents.length > CFG.MAX_UI_EVENTS) {
      uiEvents = uiEvents.slice(uiEvents.length - CFG.MAX_UI_EVENTS);
    }
    stats.ui = uiEvents.length;
    refreshStats();
  }

  function onDocClickCapture(ev) {
    if (playing) return;
    if (!recording || !exportOpts.captureUi) return;
    var t = ev.target;
    if (!(t instanceof Element)) return;
    if (isInsideLoggerPanel(t)) return;
    var focus = resolveClickTarget(/** @type {Element} */ (t));
    if (!focus) return;
    var info = describeDomTarget(focus);
    if (isNoiseUiTarget(info)) return;
    var detail = {
      button: ev.button,
      altKey: !!ev.altKey,
      ctrlKey: !!ev.ctrlKey,
      metaKey: !!ev.metaKey,
      shiftKey: !!ev.shiftKey
    };
    try {
      if (focus instanceof HTMLInputElement && (info.type === "checkbox" || info.type === "radio")) {
        detail.checkedBefore = !!focus.checked;
        detail.checked = !focus.checked;
        detail.value = String(focus.value || "");
      }
      if (info.inputValue) detail.value = info.inputValue;
      if (info.inOverlay) detail.inOverlay = true;
      if (info.reactSelectOption) detail.reactSelectOption = true;
    } catch (_e) {
      /* ignore */
    }
    pushUiEvent({
      action: "click",
      target: info,
      detail: detail
    });
  }

  function onDocChangeCapture(ev) {
    if (playing) return;
    if (!recording || !exportOpts.captureUi) return;
    var t = ev.target;
    if (!(t instanceof Element)) return;
    if (isInsideLoggerPanel(t)) return;
    var info = describeDomTarget(t);
    var valuePreview = "";
    var checked = null;
    var rawValue = "";
    try {
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) {
        rawValue = String(t.value || "");
        if (t instanceof HTMLInputElement && (info.type === "checkbox" || info.type === "radio")) {
          checked = !!t.checked;
          // для replay важны value и checked — без маскировки коротких/кодовых значений
          valuePreview = rawValue.slice(0, 120);
        } else if (info.type === "password") {
          valuePreview = "[masked]";
        } else if (maskOn && rawValue.length > 4) {
          valuePreview = maskSensitiveValue(rawValue.slice(0, 40));
        } else {
          valuePreview = rawValue.slice(0, 120);
        }
      }
    } catch (_e) {
      valuePreview = "";
    }
    var detail = { valuePreview: valuePreview };
    if (checked != null) detail.checked = checked;
    if (rawValue && (info.type === "checkbox" || info.type === "radio" || info.type === "select-one")) {
      detail.value = rawValue.slice(0, 120);
    }
    pushUiEvent({
      action: "change",
      target: info,
      detail: detail
    });
  }

  function onDocSubmitCapture(ev) {
    if (playing) return;
    if (!recording || !exportOpts.captureUi) return;
    var t = ev.target;
    if (!(t instanceof Element)) return;
    if (isInsideLoggerPanel(t)) return;
    pushUiEvent({
      action: "submit",
      target: describeDomTarget(t),
      detail: null
    });
  }

  function installUiHooks() {
    if (uiHooksInstalled) return;
    uiHooksInstalled = true;
    document.addEventListener("click", onDocClickCapture, true);
    document.addEventListener("change", onDocChangeCapture, true);
    document.addEventListener("submit", onDocSubmitCapture, true);
  }

  function uninstallUiHooks() {
    if (!uiHooksInstalled) return;
    document.removeEventListener("click", onDocClickCapture, true);
    document.removeEventListener("change", onDocChangeCapture, true);
    document.removeEventListener("submit", onDocSubmitCapture, true);
    uiHooksInstalled = false;
  }

  function installHooks() {
    if (hooksInstalled) return;
    hooksInstalled = true;

    window.fetch = async function (input, init) {
      if (!recording && !playing) return nativeFetch(input, init);
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
        if (recording || playing) {
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

  /** .log: HTTP фронт↔бэк, состав по тоглам; фильтр URL + маска ПДн. */
  function buildLogText() {
    var filters = currentLogFilters();
    var lines = [];
    var kept = 0;
    var optFlags =
      "reqHdr=" +
      exportOpts.logReqHeaders +
      " respHdr=" +
      exportOpts.logRespHeaders +
      " reqBody=" +
      exportOpts.logReqBody +
      " respBody=" +
      exportOpts.logRespBody +
      " timing=" +
      exportOpts.logTiming;
    lines.push(
      "# HTTP_Traffic_Logger HTTP.log sessionId=" +
        sessionId +
        " origin=" +
        String(window.location && window.location.origin ? window.location.origin : "") +
        " exported=" +
        nowIso() +
        " mask=" +
        maskOn
    );
    lines.push("# filters=" + (filters.length ? filters.join(" | ") : "(all)"));
    lines.push("# logOpts " + optFlags);
    lines.push(
      "# Связь файлов: sessionId + eventId + corrId (+ afterUiEventId → клик UI до запроса)."
    );
    lines.push("# JSON: ответы сайта (если тогл). UI.log: клики (если тогл).");

    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (!urlMatchesFilter(e.url, filters)) continue;
      kept++;
      var timingPart =
        exportOpts.logTiming && e.durationMs != null ? " " + e.durationMs + "ms" : "";

      lines.push("");
      lines.push(
        "================================================================================"
      );
      lines.push(
        "--- #" +
          e.id +
          " eventId=" +
          e.eventId +
          " corrId=" +
          e.corrId +
          " eventSeq=" +
          e.eventSeq +
          " " +
          e.ts +
          " [" +
          e.kind +
          "] " +
          e.method +
          " " +
          e.status +
          (e.statusText ? " " + e.statusText : "") +
          timingPart
      );
      lines.push("URL " + e.url);
      if (e.afterUiEventId) lines.push("afterUiEventId " + e.afterUiEventId);

      if (exportOpts.logReqHeaders) {
        var reqHdr = sanitizeHeaders(e.requestHeaders, maskOn);
        lines.push("");
        lines.push(">>> REQUEST HEADERS");
        lines.push(formatHeadersBlock(reqHdr));
      }
      if (exportOpts.logReqBody) {
        var reqBody = sanitizeBody(e.requestBody, maskOn);
        lines.push("");
        lines.push(
          ">>> REQUEST PAYLOAD" +
            (e.requestTruncated ? " [truncated rawLen=" + e.requestBodyRawLen + "]" : "") +
            (reqBody ? "" : " (пусто)")
        );
        if (reqBody) lines.push(reqBody);
      }
      if (exportOpts.logRespHeaders) {
        var respHdr = sanitizeHeaders(e.responseHeaders, maskOn);
        lines.push("");
        lines.push("<<< RESPONSE HEADERS");
        lines.push(formatHeadersBlock(respHdr));
      }
      if (exportOpts.logRespBody) {
        var respBody = sanitizeBody(e.responseBody, maskOn);
        lines.push("");
        lines.push(
          "<<< RESPONSE BODY" +
            (e.responseTruncated ? " [truncated rawLen=" + e.responseBodyRawLen + "]" : "") +
            (respBody ? "" : " (пусто)")
        );
        if (respBody) lines.push(respBody);
      }
      if (
        exportOpts.logTiming &&
        e.durationMs != null &&
        !exportOpts.logReqHeaders &&
        !exportOpts.logReqBody &&
        !exportOpts.logRespHeaders &&
        !exportOpts.logRespBody
      ) {
        lines.push("durationMs " + e.durationMs);
      }
    }
    lines.push("");
    lines.push("# exportedInLog=" + kept + " ofCaptured=" + entries.length);
    return lines.join("\n") + "\n";
  }

  /**
   * JSON: ответы сайта целиком, без маски ПДн, без фильтра URL.
   * Связь: sessionId / eventId / corrId / afterUiEventId.
   */
  function buildJsonResponses() {
    var responses = [];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      responses.push({
        id: e.id,
        corrId: e.corrId,
        eventId: e.eventId,
        eventSeq: e.eventSeq,
        sessionId: e.sessionId,
        afterUiEventId: e.afterUiEventId || null,
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
        format: "http_traffic_responses_v3",
        sessionId: sessionId,
        origin: String(window.location && window.location.origin ? window.location.origin : ""),
        pageUrl: String(window.location && window.location.href ? window.location.href : ""),
        startedAt: startedAt || null,
        exportedAt: nowIso(),
        maskApplied: false,
        note:
          "Ответы без маски ПДн. Связь с .log / _ui.log: sessionId, eventId, corrId, afterUiEventId.",
        maxBodyLen: CFG.MAX_BODY_LEN,
        stats: {
          total: stats.total,
          ok: stats.ok,
          err: stats.err,
          bytesOut: stats.bytesOut,
          bytesIn: stats.bytesIn,
          responses: responses.length,
          uiEvents: uiEvents.length
        }
      },
      responses: responses
    };
  }

  /** Третий файл: действия пользователя по UI сайта. */
  function buildUiLogText() {
    var lines = [];
    lines.push(
      "# HTTP_Traffic_Logger UI.log sessionId=" +
        sessionId +
        " exported=" +
        nowIso() +
        " events=" +
        uiEvents.length
    );
    lines.push(
      "# Связь: eventId / sessionId; HTTP после клика помечается afterUiEventId=этот eventId."
    );
    for (var i = 0; i < uiEvents.length; i++) {
      var u = uiEvents[i];
      var t = u.target || {};
      lines.push("");
      lines.push(
        "--- ui#" +
          u.id +
          " eventId=" +
          u.eventId +
          " corrId=" +
          u.corrId +
          " eventSeq=" +
          u.eventSeq +
          " " +
          u.ts +
          " [" +
          u.action +
          "]"
      );
      lines.push("page " + u.pageUrl);
      lines.push("selector " + (t.selector || "(n/a)"));
      if (t.tag) lines.push("tag " + t.tag + (t.type ? " type=" + t.type : ""));
      if (t.name) lines.push("name " + t.name);
      if (t.inputValue) lines.push("value " + t.inputValue);
      if (t.ariaLabel) lines.push("ariaLabel " + t.ariaLabel);
      if (t.testId) lines.push("testId " + t.testId);
      if (t.role) lines.push("role " + t.role);
      if (t.inOverlay) lines.push("inOverlay true");
      if (t.reactSelectOption) lines.push("reactSelectOption true");
      if (t.checked != null) lines.push("checked " + t.checked);
      if (t.text) lines.push("text " + t.text);
      if (t.href) lines.push("href " + t.href);
      if (t.xpath) lines.push("xpath " + t.xpath);
      if (u.detail) {
        try {
          lines.push("detail " + JSON.stringify(u.detail));
        } catch (_e) {
          lines.push("detail [unserializable]");
        }
      }
    }
    lines.push("");
    return lines.join("\n") + "\n";
  }

  // ---------------------------------------------------------------------------
  // Play: парсинг _ui.log, поиск элементов, прокликивание, анализ HTTP
  // ---------------------------------------------------------------------------

  function waitMs(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, Math.max(0, ms | 0));
    });
  }

  function normText(s) {
    return String(s || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  /** Разбор текстового _ui.log, сохранённого этим скриптом. */
  function parseUiLogText(text) {
    var raw = String(text || "");
    var blocks = raw.split(/\n---\s*ui#/);
    var out = [];
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      if (!block || block.indexOf("HTTP_Traffic_Logger UI.log") === 0 || block.charAt(0) === "#") {
        continue;
      }
      var lines = block.split(/\n/);
      var head = lines[0] || "";
      var mAction = head.match(/\[([^\]]+)\]\s*$/);
      var mId = head.match(/^(\d+)/);
      var mEventId = head.match(/eventId=(\S+)/);
      var action = mAction ? mAction[1] : "click";
      var target = {
        selector: "",
        tag: "",
        type: "",
        text: "",
        href: "",
        id: "",
        name: "",
        className: "",
        role: "",
        ariaLabel: "",
        testId: "",
        xpath: "",
        inputValue: "",
        inOverlay: false,
        reactSelectOption: false,
        checked: null
      };
      var detail = null;
      var pageUrl = "";
      for (var j = 1; j < lines.length; j++) {
        var line = lines[j];
        if (!line) continue;
        if (line.indexOf("page ") === 0) pageUrl = line.slice(5);
        else if (line.indexOf("selector ") === 0) target.selector = line.slice(9);
        else if (line.indexOf("tag ") === 0) {
          var tm = line.match(/^tag\s+(\S+)(?:\s+type=(\S+))?/);
          if (tm) {
            target.tag = tm[1];
            target.type = tm[2] || "";
          }
        } else if (line.indexOf("name ") === 0) target.name = line.slice(5);
        else if (line.indexOf("value ") === 0) target.inputValue = line.slice(6);
        else if (line.indexOf("ariaLabel ") === 0) target.ariaLabel = line.slice(10);
        else if (line.indexOf("testId ") === 0) target.testId = line.slice(7);
        else if (line.indexOf("role ") === 0) target.role = line.slice(5);
        else if (line.indexOf("inOverlay ") === 0) target.inOverlay = /true/i.test(line.slice(10));
        else if (line.indexOf("reactSelectOption ") === 0) {
          target.reactSelectOption = /true/i.test(line.slice(18));
        } else if (line.indexOf("checked ") === 0) {
          target.checked = String(line.slice(8)).toLowerCase() === "true";
        } else if (line.indexOf("text ") === 0) target.text = line.slice(5);
        else if (line.indexOf("href ") === 0) target.href = line.slice(5);
        else if (line.indexOf("xpath ") === 0) target.xpath = line.slice(6);
        else if (line.indexOf("detail ") === 0) {
          try {
            detail = JSON.parse(line.slice(7));
          } catch (_e) {
            detail = { raw: line.slice(7) };
          }
        }
      }
      if (detail) {
        if (detail.value && !target.inputValue) target.inputValue = String(detail.value);
        if (detail.inOverlay) target.inOverlay = true;
        if (detail.reactSelectOption) target.reactSelectOption = true;
      }
      // из старых логов: name/type/value из селектора
      if (!target.name && target.selector) {
        var nm = target.selector.match(/\[name=["']([^"']+)["']\]/);
        if (nm && !/^_r_/i.test(nm[1])) target.name = nm[1];
        var tp = target.selector.match(/\[type=["']([^"']+)["']\]/);
        if (tp && !target.type) target.type = tp[1];
        var vv = target.selector.match(/\[value=["']([^"']+)["']\]/);
        if (vv && !target.inputValue) target.inputValue = vv[1];
        if (!target.tag) {
          var tg = target.selector.match(/^([a-z0-9]+)/i);
          if (tg) target.tag = tg[1].toLowerCase();
        }
      }
      if (/dialog|popover|react-select|-option-/i.test(target.selector + target.xpath)) {
        target.inOverlay = true;
      }
      if (/react-select-.*-option-/i.test(target.selector) || target.reactSelectOption) {
        target.reactSelectOption = true;
        target.inOverlay = true;
      }
      if (target.selector === "(n/a)") target.selector = "";
      if (
        !target.selector &&
        !target.text &&
        !target.tag &&
        !target.name &&
        !target.href &&
        !target.xpath &&
        !target.inputValue
      ) {
        continue;
      }
      out.push({
        id: mId ? Number(mId[1]) : out.length + 1,
        eventId: mEventId ? mEventId[1] : "",
        action: action,
        pageUrl: pageUrl,
        target: target,
        detail: detail
      });
    }
    return out;
  }

  function elVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    var r = el.getBoundingClientRect();
    if (r.width <= 0 && r.height <= 0) return false;
    var st = window.getComputedStyle(el);
    if (st.visibility === "hidden" || st.display === "none") return false;
    return true;
  }

  function scoreCandidate(el, target) {
    var score = 0;
    var info = describeDomTarget(el);
    var t = target || {};
    if (t.inputValue && info.inputValue === t.inputValue) score += 45;
    if (t.name && info.name === t.name) score += 40;
    if (t.testId && info.testId === t.testId) score += 45;
    if (t.ariaLabel && normText(info.ariaLabel) === normText(t.ariaLabel)) score += 35;
    if (t.text && normText(info.text) === normText(t.text)) score += 50;
    else if (t.text && normText(info.text).indexOf(normText(t.text)) >= 0) score += 25;
    if (t.tag && info.tag === t.tag) score += 10;
    if (t.type && info.type === t.type) score += 12;
    if (t.role && info.role === t.role) score += 15;
    if (t.href && info.href) {
      if (info.href === t.href || info.href.indexOf(t.href) >= 0 || t.href.indexOf(info.href) >= 0) {
        score += 30;
      }
    }
    if (elVisible(el)) score += 5;
    try {
      if (
        el.closest &&
        el.closest(
          '#dialog, dialog, [role="dialog"], [aria-modal="true"], #popover, [data-radix-popper-content-wrapper]'
        )
      ) {
        score += 12;
      }
    } catch (_e) {
      /* ignore */
    }
    return score;
  }

  function queryAllSafe(sel) {
    if (!sel) return [];
    try {
      return Array.prototype.slice.call(document.querySelectorAll(sel));
    } catch (_e) {
      return [];
    }
  }

  function findByXPath(xpath) {
    if (!xpath) return null;
    try {
      var r = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      var n = r && r.singleNodeValue;
      return n && n.nodeType === 1 ? n : null;
    } catch (_e) {
      return null;
    }
  }

  function isWeakSelector(sel) {
    var s = String(sel || "");
    if (!s) return true;
    if (/\[(name|href|aria-label|data-testid|value)=/i.test(s)) return false;
    if (/^a\[href=/i.test(s)) return false;
    // button.cursor-pointer.transition(.px-16)? без уникального bg/текста
    if (/^button(\.(cursor-pointer|transition|relative|px-\d+|disabled))?(\.(cursor-pointer|transition|relative|px-\d+|disabled))*$/i.test(s)) {
      return true;
    }
    return false;
  }

  function getOverlayRoots() {
    return queryAllSafe(
      '#dialog, dialog[open], dialog, [role="dialog"], [aria-modal="true"], #popover, [data-radix-popper-content-wrapper]'
    ).filter(function (el) {
      return elVisible(el) || (el.id === "dialog" && el.querySelector);
    });
  }

  function stepNeedsOverlay(step) {
    var t = (step && step.target) || {};
    if (t.inOverlay || t.reactSelectOption) return true;
    var blob = [t.selector, t.xpath, t.role, t.id || ""].join(" ");
    if (/dialog|popover|option|react-select|\[role=.?option/i.test(blob)) return true;
    // меню/портал вне #root (часто «Редактировать»)
    if (t.text && t.xpath && /\/html\[1\]|\/body\[1\]|#popover/i.test(t.xpath)) return true;
    return false;
  }

  async function waitForOverlay(timeoutMs) {
    var limit = timeoutMs == null ? CFG.PLAY_OVERLAY_TIMEOUT_MS : timeoutMs;
    var t0 = Date.now();
    while (!play.abort && Date.now() - t0 < limit) {
      if (getOverlayRoots().length) return true;
      await waitMs(120);
    }
    return getOverlayRoots().length > 0;
  }

  /** Поиск: value/radio → option text → name → href → overlay text → xpath → selector. */
  function findPlayTarget(target) {
    var t = target || {};
    var best = null;
    var bestScore = -1;

    function considerList(list, minScore) {
      for (var i = 0; i < list.length; i++) {
        var el = list[i];
        if (!(el instanceof Element)) continue;
        if (isInsideLoggerPanel(el)) continue;
        var sc = scoreCandidate(el, t);
        if (sc > bestScore) {
          bestScore = sc;
          best = el;
        }
      }
      if (best && bestScore >= (minScore == null ? 20 : minScore)) {
        return true;
      }
      return false;
    }

    // 0) radio/checkbox по value (стабильнее name=_r_*)
    if (t.inputValue && (t.type === "radio" || t.type === "checkbox" || /radio|checkbox/i.test(t.selector || ""))) {
      var byVal = queryAllSafe(
        'input[value="' +
          String(t.inputValue).replace(/"/g, '\\"') +
          '"]' +
          (t.type ? '[type="' + t.type + '"]' : "")
      );
      best = null;
      bestScore = -1;
      if (considerList(byVal, 40)) return { el: best, how: "value" };
    }

    // 0b) react-select / role=option по тексту
    if (t.reactSelectOption || t.role === "option" || /option/i.test(t.selector || "") || t.text) {
      if (t.text && (t.reactSelectOption || t.role === "option" || /react-select|-option-/i.test(t.selector || ""))) {
        best = null;
        bestScore = -1;
        var opts = queryAllSafe('[role="option"],[id*="-option-"]');
        if (considerList(opts, 40)) return { el: best, how: "option-text" };
      }
    }

    // 1) стабильный name (+type)
    if (t.name && !/^_r_/i.test(t.name)) {
      var byName = queryAllSafe(
        (t.tag || "") +
          '[name="' +
          String(t.name).replace(/"/g, '\\"') +
          '"]' +
          (t.type ? '[type="' + String(t.type).replace(/"/g, '\\"') + '"]' : "")
      );
      if (!byName.length) byName = queryAllSafe('[name="' + String(t.name).replace(/"/g, '\\"') + '"]');
      best = null;
      bestScore = -1;
      if (considerList(byName, 30)) return { el: best, how: "name" };
    }

    // 2) data-testid
    if (t.testId) {
      best = null;
      bestScore = -1;
      var byTid = queryAllSafe('[data-testid="' + String(t.testId).replace(/"/g, '\\"') + '"]');
      if (considerList(byTid, 30)) return { el: best, how: "testid" };
    }

    // 3) href
    if (t.href) {
      var hrefEsc = String(t.href).replace(/"/g, '\\"');
      var byHref = queryAllSafe('a[href="' + hrefEsc + '"]');
      if (!byHref.length) byHref = queryAllSafe('a[href$="' + hrefEsc + '"]');
      if (!byHref.length) {
        byHref = Array.prototype.slice
          .call(document.querySelectorAll("a[href]") || [])
          .filter(function (a) {
            var h = a.getAttribute("href") || "";
            return h === t.href || h.indexOf(t.href) >= 0 || t.href.indexOf(h) >= 0;
          });
      }
      best = null;
      bestScore = -1;
      if (considerList(byHref, 25)) return { el: best, how: "href" };
    }

    // 4) aria-label
    if (t.ariaLabel) {
      best = null;
      bestScore = -1;
      var byAria = queryAllSafe('[aria-label="' + String(t.ariaLabel).replace(/"/g, '\\"') + '"]');
      if (considerList(byAria, 30)) return { el: best, how: "aria" };
    }

    // 5) текст внутри открытых overlay (модалки/поповеры)
    if (t.text) {
      var roots = getOverlayRoots();
      if (roots.length) {
        best = null;
        bestScore = -1;
        var inOverlay = [];
        for (var r = 0; r < roots.length; r++) {
          var nodes = roots[r].querySelectorAll(
            "button,a,label,input,[role='button'],[role='option'],[role='menuitem'],[id*='-option-'],div,span"
          );
          for (var n = 0; n < nodes.length; n++) inOverlay.push(nodes[n]);
        }
        if (considerList(inOverlay, 40)) return { el: best, how: "overlay-text" };
      }
    }

    // 6) xpath раньше слабого CSS (иконки без текста)
    if (t.xpath && (!t.text || isWeakSelector(t.selector))) {
      var xpEarly = findByXPath(t.xpath);
      if (xpEarly && !isInsideLoggerPanel(xpEarly)) {
        var resolved = resolveClickTarget(xpEarly) || xpEarly;
        if (resolved && String(resolved.tagName || "").toLowerCase() !== "dialog") {
          return { el: resolved, how: "xpath" };
        }
      }
    }

    // 7) CSS selector (не слабый / или с текстом)
    if (t.selector && !/^dialog/i.test(t.selector) && !isNoiseUiTarget(t)) {
      if (!(isWeakSelector(t.selector) && !t.text)) {
        best = null;
        bestScore = -1;
        var bySel = queryAllSafe(t.selector);
        if (bySel.length === 1 && !isInsideLoggerPanel(bySel[0]) && t.text) {
          if (normText(describeDomTarget(bySel[0]).text).indexOf(normText(t.text)) >= 0) {
            return { el: bySel[0], how: "selector" };
          }
        }
        if (bySel.length === 1 && !isInsideLoggerPanel(bySel[0]) && !isWeakSelector(t.selector)) {
          return { el: bySel[0], how: "selector" };
        }
        if (bySel.length > 1 && considerList(bySel, 35)) return { el: best, how: "selector+text" };
      }
    }

    // 8) text + clickable (весь документ)
    if (t.text) {
      best = null;
      bestScore = -1;
      var clickables = queryAllSafe(
        "button,a,[role='button'],[role='tab'],[role='menuitem'],[role='option']," +
          "[role='checkbox'],input,select,textarea,label,[id*='-option-']"
      );
      if (considerList(clickables, 45)) return { el: best, how: "text" };
    }

    // 9) xpath fallback
    if (t.xpath) {
      var xp = findByXPath(t.xpath);
      if (xp && !isInsideLoggerPanel(xp)) {
        var res2 = resolveClickTarget(xp) || xp;
        if (String(res2.tagName || "").toLowerCase() !== "dialog") {
          return { el: res2, how: "xpath" };
        }
      }
    }

    return { el: null, how: "miss" };
  }

  async function waitForPlayTarget(target, timeoutMs) {
    var limit = timeoutMs == null ? CFG.PLAY_FIND_TIMEOUT_MS : timeoutMs;
    var t0 = Date.now();
    var last = { el: null, how: "miss" };
    while (!play.abort && Date.now() - t0 < limit) {
      last = findPlayTarget(target);
      if (last.el && (elVisible(last.el) || (target && target.type === "radio"))) return last;
      await waitMs(150);
    }
    last = findPlayTarget(target);
    return last;
  }

  function highlightEl(el) {
    if (!el || !el.style) return function () {};
    var prev = el.getAttribute("style") || "";
    try {
      el.style.outline = "3px solid #f59e0b";
      el.style.outlineOffset = "2px";
    } catch (_e) {
      /* ignore */
    }
    return function () {
      try {
        if (prev) el.setAttribute("style", prev);
        else el.removeAttribute("style");
      } catch (_e2) {
        /* ignore */
      }
    };
  }

  function dispatchClick(el) {
    try {
      el.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
    } catch (_e) {
      try {
        el.scrollIntoView(true);
      } catch (_e2) {
        /* ignore */
      }
    }
    var un = highlightEl(el);
    try {
      if (typeof el.focus === "function") el.focus();
    } catch (_e3) {
      /* ignore */
    }
    try {
      el.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window })
      );
      el.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window })
      );
      el.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, view: window })
      );
      if (typeof el.click === "function") el.click();
    } finally {
      setTimeout(un, 250);
    }
  }

  function applyChange(el, detail) {
    var d = detail || {};
    var preview = d.valuePreview != null ? String(d.valuePreview) : "";
    if (preview === "[masked]" || /\*/.test(preview)) preview = "";
    var rawVal = d.value != null ? String(d.value) : preview;
    try {
      if (el instanceof HTMLInputElement) {
        var typ = String(el.type || "").toLowerCase();
        if (typ === "checkbox" || typ === "radio") {
          var want =
            d.checked != null
              ? !!d.checked
              : d.checked === undefined && typ === "radio"
                ? true
                : null;
          if (want == null && rawVal) {
            // если есть value — выбрать radio с этим value
            if (typ === "radio" && el.value !== rawVal) {
              var named = document.querySelectorAll(
                'input[type="radio"][name="' + String(el.name).replace(/"/g, '\\"') + '"]'
              );
              for (var i = 0; i < named.length; i++) {
                if (named[i].value === rawVal) {
                  el = named[i];
                  break;
                }
              }
            }
            want = true;
          }
          if (want == null) want = true;
          if (el.checked !== want) {
            el.click();
          } else {
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }
          return;
        }
        el.focus();
        if (rawVal) {
          el.value = rawVal;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          dispatchClick(el);
        }
        return;
      }
      if (el instanceof HTMLTextAreaElement) {
        el.focus();
        if (rawVal) {
          el.value = rawVal;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return;
      }
      if (el instanceof HTMLSelectElement) {
        if (rawVal) {
          el.value = rawVal;
          el.dispatchEvent(new Event("change", { bubbles: true }));
        } else dispatchClick(el);
        return;
      }
    } catch (_e) {
      /* fallthrough */
    }
    dispatchClick(el);
  }

  function applySubmit(el) {
    var form =
      el.tagName && String(el.tagName).toLowerCase() === "form"
        ? el
        : el.closest && el.closest("form");
    if (form) {
      try {
        if (typeof form.requestSubmit === "function") form.requestSubmit();
        else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        return;
      } catch (_e) {
        /* fallthrough */
      }
    }
    dispatchClick(el);
  }

  function performPlayAction(step, el) {
    var action = String(step.action || "click");
    var detail = step.detail || {};
    // click по checkbox/radio с известным целевым checked
    if (
      action === "click" &&
      el instanceof HTMLInputElement &&
      (el.type === "checkbox" || el.type === "radio") &&
      detail.checked != null
    ) {
      applyChange(el, detail);
      return;
    }
    if (action === "change") applyChange(el, detail);
    else if (action === "submit") applySubmit(el);
    else dispatchClick(el);
  }

  function scanBodyForErrors(bodyText, url) {
    var found = [];
    var s = String(bodyText || "");
    if (!s) return found;
    var parsed = null;
    try {
      parsed = JSON.parse(s);
    } catch (_e) {
      parsed = null;
    }
    if (parsed && typeof parsed === "object") {
      (function walk(node, path, depth) {
        if (!node || depth > 6) return;
        if (Array.isArray(node)) {
          for (var i = 0; i < Math.min(node.length, 30); i++) {
            walk(node[i], path + "[" + i + "]", depth + 1);
          }
          return;
        }
        if (typeof node !== "object") return;
        var keys = Object.keys(node);
        for (var k = 0; k < keys.length; k++) {
          var key = keys[k];
          var lk = key.toLowerCase();
          var val = node[key];
          var p = path ? path + "." + key : key;
          if (
            (lk === "error" ||
              lk === "errors" ||
              lk === "errormessage" ||
              lk === "errormsg" ||
              lk === "exception") &&
            val != null &&
            val !== "" &&
            val !== false
          ) {
            found.push({
              path: p,
              value: typeof val === "string" ? val.slice(0, 200) : val,
              url: url
            });
          }
          if (lk === "success" && val === false) {
            found.push({ path: p, value: false, url: url });
          }
          if (
            (lk === "status" || lk === "result" || lk === "state") &&
            typeof val === "string" &&
            /^(error|fail|failed|denied|reject)/i.test(val)
          ) {
            found.push({ path: p, value: val, url: url });
          }
          if (val && typeof val === "object") walk(val, p, depth + 1);
        }
      })(parsed, "", 0);
    } else if (/(\"error\"\s*:|exception|traceback|internal server error)/i.test(s.slice(0, 4000))) {
      found.push({ path: "(text)", value: s.slice(0, 160), url: url });
    }
    return found;
  }

  function medianOf(nums) {
    if (!nums.length) return 0;
    var a = nums.slice().sort(function (x, y) {
      return x - y;
    });
    var mid = Math.floor(a.length / 2);
    if (a.length % 2) return a[mid];
    return (a[mid - 1] + a[mid]) / 2;
  }

  function analyzeHttpSlice(fromId, stepIndex, step) {
    var durations = [];
    var i;
    for (i = 0; i < entries.length; i++) {
      if (entries[i].id > fromId && entries[i].durationMs != null) {
        durations.push(Number(entries[i].durationMs));
      }
    }
    var allDur = [];
    for (i = 0; i < entries.length; i++) {
      if (entries[i].durationMs != null) allDur.push(Number(entries[i].durationMs));
    }
    var med = medianOf(allDur.length ? allDur : durations);
    var slowCut = Math.max(play.slowAbsMs, med * play.slowFactor);

    for (i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (e.id <= fromId) continue;
      var httpOk = e.status != null && e.status >= 200 && e.status < 400;
      if (httpOk) play.stats.httpOk++;
      else {
        play.stats.httpErr++;
        play.findings.push({
          type: "http_status",
          stepIndex: stepIndex,
          stepAction: step.action,
          corrId: e.corrId,
          method: e.method,
          url: e.url,
          status: e.status,
          durationMs: e.durationMs,
          message: "HTTP status " + e.status
        });
      }
      var bodyIssues = scanBodyForErrors(e.responseBody, e.url);
      if (bodyIssues.length) {
        play.stats.bodyErr += bodyIssues.length;
        for (var b = 0; b < bodyIssues.length; b++) {
          play.findings.push({
            type: "body_error",
            stepIndex: stepIndex,
            stepAction: step.action,
            corrId: e.corrId,
            method: e.method,
            url: e.url,
            status: e.status,
            durationMs: e.durationMs,
            message: bodyIssues[b].path + "=" + JSON.stringify(bodyIssues[b].value).slice(0, 180)
          });
        }
      }
      if (e.durationMs != null && Number(e.durationMs) >= slowCut) {
        play.stats.slow++;
        play.findings.push({
          type: "slow",
          stepIndex: stepIndex,
          stepAction: step.action,
          corrId: e.corrId,
          method: e.method,
          url: e.url,
          status: e.status,
          durationMs: e.durationMs,
          message:
            "Медленный запрос " +
            e.durationMs +
            "ms (порог ~" +
            Math.round(slowCut) +
            "ms, median=" +
            Math.round(med) +
            "ms)"
        });
      }
    }
  }

  async function waitNetworkSettle() {
    var settle = play.settleMs;
    var maxWait = CFG.PLAY_SETTLE_MAX_MS;
    var t0 = Date.now();
    lastHttpAt = Date.now();
    while (!play.abort) {
      var idle = Date.now() - lastHttpAt;
      if (idle >= settle) break;
      if (Date.now() - t0 >= maxWait) break;
      await waitMs(80);
    }
  }

  function resetPlayStats() {
    play.findings = [];
    play.stepLog = [];
    play.stats = {
      stepsTotal: 0,
      stepsOk: 0,
      stepsFail: 0,
      stepsSkip: 0,
      httpOk: 0,
      httpErr: 0,
      bodyErr: 0,
      slow: 0
    };
  }

  /** Старт накопления тест-сессии (один раз до очистки). */
  function ensurePlayTestSession() {
    if (play.testActive) return;
    play.testActive = true;
    play.runCount = 0;
    play.startedAt = nowIso();
    play.finishedAt = "";
    resetPlayStats();
    entries = [];
    seq = 0;
    eventSeq = 0;
    lastUiEventId = null;
    sessionId = "play_" + tsShort() + "_" + Math.random().toString(36).slice(2, 8);
    startedAt = play.startedAt;
    stats = { total: 0, ok: 0, err: 0, bytesIn: 0, bytesOut: 0, ui: 0 };
  }

  function clearPlayTestAccumulation() {
    play.testActive = false;
    play.runCount = 0;
    play.startedAt = "";
    play.finishedAt = "";
    play.abort = false;
    resetPlayStats();
    if (!recording) {
      entries = [];
      seq = 0;
      eventSeq = 0;
      lastUiEventId = null;
      stats = { total: 0, ok: 0, err: 0, bytesIn: 0, bytesOut: 0, ui: stats.ui || 0 };
      sessionId = tsShort() + "_" + Math.random().toString(36).slice(2, 8);
      startedAt = "";
    }
    play.statusText = "Тест-лог очищен. Можно снова запускать Play — накопление с нуля.";
  }

  function buildPlayReportJson() {
    return {
      exportMeta: {
        scriptId: CFG.SCRIPT_ID,
        format: "http_traffic_test_report_v1",
        kind: "test",
        sessionId: sessionId,
        hostTag: siteHostTag(),
        sourceUiLog: play.fileName || null,
        runCount: play.runCount,
        startedAt: play.startedAt,
        finishedAt: play.finishedAt || nowIso(),
        aborted: !!play.abort,
        stepDelayMs: play.stepDelayMs,
        settleMs: play.settleMs,
        slowAbsMs: play.slowAbsMs,
        slowFactor: play.slowFactor,
        pageUrl: String(window.location && window.location.href ? window.location.href : ""),
        stats: play.stats,
        httpStats: {
          total: stats.total,
          ok: stats.ok,
          err: stats.err,
          bytesIn: stats.bytesIn,
          bytesOut: stats.bytesOut
        }
      },
      steps: play.stepLog,
      findings: play.findings,
      http: buildJsonResponses().responses
    };
  }

  /**
   * Единый тест-лог Play: мета, шаги UI, findings, полный HTTP дамп + встроенный JSON.
   */
  function buildTestLogText() {
    var lines = [];
    var report = buildPlayReportJson();
    lines.push("# HTTP_Traffic_Logger TEST log (накопленный прогон(ы) Play)");
    lines.push("# sessionId=" + sessionId + " host=" + siteHostTag() + " exported=" + nowIso());
    lines.push("# sourceUiLog=" + (play.fileName || "(n/a)") + " runCount=" + play.runCount);
    lines.push(
      "# started=" +
        (play.startedAt || "") +
        " finished=" +
        (play.finishedAt || nowIso()) +
        " aborted=" +
        !!play.abort
    );
    lines.push(
      "# UI stepsOk=" +
        play.stats.stepsOk +
        " fail=" +
        play.stats.stepsFail +
        " skip=" +
        play.stats.stepsSkip +
        " total=" +
        play.stats.stepsTotal
    );
    lines.push(
      "# HTTP ok=" +
        play.stats.httpOk +
        " err=" +
        play.stats.httpErr +
        " bodyErr=" +
        play.stats.bodyErr +
        " slow=" +
        play.stats.slow +
        " captured=" +
        entries.length
    );
    lines.push(
      "# params stepDelayMs=" +
        play.stepDelayMs +
        " settleMs=" +
        play.settleMs +
        " slowAbsMs=" +
        play.slowAbsMs +
        " slowFactor=" +
        play.slowFactor
    );
    lines.push(
      "# page " +
        String(window.location && window.location.href ? window.location.href : "")
    );

    lines.push("");
    lines.push("================================================================================");
    lines.push("=== 1. STEPS (воспроизведение UI) ===");
    if (!play.stepLog.length) lines.push("(шагов нет)");
    for (var i = 0; i < play.stepLog.length; i++) {
      var s = play.stepLog[i];
      lines.push("");
      lines.push(
        "--- step#" +
          (i + 1) +
          " [" +
          s.result +
          "]" +
          (s.run != null ? " run#" + s.run : "") +
          " action=" +
          s.action +
          " how=" +
          (s.how || "")
      );
      if (s.selector) lines.push("selector " + s.selector);
      if (s.text) lines.push("text " + s.text);
      if (s.message) lines.push("message " + s.message);
    }

    lines.push("");
    lines.push("================================================================================");
    lines.push("=== 2. FINDINGS (ошибки / slow / miss) ===");
    if (!play.findings.length) lines.push("(нет)");
    for (var f = 0; f < play.findings.length; f++) {
      var x = play.findings[f];
      lines.push("");
      lines.push(
        "--- finding#" +
          (f + 1) +
          " type=" +
          x.type +
          " step#" +
          (x.stepIndex != null ? x.stepIndex + 1 : "?")
      );
      if (x.corrId) lines.push("corrId " + x.corrId);
      if (x.method || x.url) {
        lines.push(
          (x.method || "") +
            " " +
            (x.status != null ? x.status : "") +
            (x.durationMs != null ? " " + x.durationMs + "ms" : "") +
            " " +
            (x.url || "")
        );
      }
      lines.push("message " + x.message);
    }

    lines.push("");
    lines.push("================================================================================");
    lines.push("=== 3. HTTP (весь трафик сессии Play) ===");
    if (!entries.length) lines.push("(HTTP не зафиксирован)");
    for (var h = 0; h < entries.length; h++) {
      var e = entries[h];
      lines.push("");
      lines.push(
        "--------------------------------------------------------------------------------"
      );
      lines.push(
        "--- http#" +
          e.id +
          " eventId=" +
          e.eventId +
          " corrId=" +
          e.corrId +
          (e.playStepIndex != null ? " playStep=" + (e.playStepIndex + 1) : "") +
          " " +
          e.ts +
          " [" +
          e.kind +
          "] " +
          e.method +
          " " +
          e.status +
          (e.durationMs != null ? " " + e.durationMs + "ms" : "")
      );
      lines.push("URL " + e.url);
      lines.push("");
      lines.push(">>> REQUEST HEADERS");
      lines.push(formatHeadersBlock(sanitizeHeaders(e.requestHeaders, maskOn)));
      lines.push("");
      lines.push(
        ">>> REQUEST PAYLOAD" +
          (e.requestTruncated ? " [truncated rawLen=" + e.requestBodyRawLen + "]" : "")
      );
      lines.push(sanitizeBody(e.requestBody, maskOn) || "(пусто)");
      lines.push("");
      lines.push("<<< RESPONSE HEADERS");
      lines.push(formatHeadersBlock(sanitizeHeaders(e.responseHeaders, maskOn)));
      lines.push("");
      lines.push(
        "<<< RESPONSE BODY" +
          (e.responseTruncated ? " [truncated rawLen=" + e.responseBodyRawLen + "]" : "")
      );
      lines.push(sanitizeBody(e.responseBody, maskOn) || "(пусто)");
    }

    lines.push("");
    lines.push("================================================================================");
    lines.push("=== 4. EMBEDDED_JSON (машинный полный отчёт) ===");
    lines.push("<<<JSON");
    try {
      lines.push(JSON.stringify(report, null, 2));
    } catch (_e) {
      lines.push('{"error":"serialize_failed"}');
    }
    lines.push("JSON>>>");
    lines.push("");
    lines.push("# end test log");
    return lines.join("\n") + "\n";
  }

  /** Один файл: httplog_<host>_test_<ts>.log — вся работа Play. */
  function savePlayReport() {
    var stamp = tsShort();
    var name = makeExportFilename("test", stamp, "log");
    downloadText(name, buildTestLogText());
    console.log(
      "[HTTP_Traffic_Logger] Тест-лог Play сохранён: " + name + " · sessionId=" + sessionId
    );
  }

  async function runPlay() {
    if (playing || recording) return;
    if (!play.script.length) {
      play.statusText = "Сначала загрузите файл _ui.log.";
      refreshPlayUi();
      return;
    }
    playing = true;
    play.abort = false;
    play.index = 0;
    ensurePlayTestSession();
    play.runCount++;
    play.stats.stepsTotal += play.script.length;
    play.stepLog.push({
      index: -1,
      action: "run",
      selector: "",
      text: "",
      result: "run_start",
      how: "",
      run: play.runCount,
      message:
        "run#" +
        play.runCount +
        " source=" +
        (play.fileName || "(n/a)") +
        " steps=" +
        play.script.length +
        " at=" +
        nowIso()
    });
    play.finishedAt = "";
    installHooks();
    play.statusText = "Play run#" + play.runCount + "…";
    applyPanelMode();
    refreshPlayUi();
    refreshStats();

    for (var i = 0; i < play.script.length; i++) {
      if (play.abort) break;
      play.index = i;
      playStepIndex = i;
      var step = play.script[i];
      refreshPlayUi();

      // дополняем target из detail (старые логи radio value)
      if (step.target && step.detail) {
        if (step.detail.value && !step.target.inputValue) {
          step.target.inputValue = String(step.detail.value);
        }
        if (step.detail.inOverlay) step.target.inOverlay = true;
        if (step.detail.reactSelectOption) step.target.reactSelectOption = true;
      }

      // шум: клик по SVG/целому dialog — не проигрываем
      if (isNoiseUiTarget(step.target)) {
        play.stepLog.push({
          index: i,
          action: step.action,
          selector: (step.target && step.target.selector) || "",
          text: (step.target && step.target.text) || "",
          result: "skip",
          how: "noise",
          run: play.runCount,
          message: "Пропуск шума (svg/dialog shell)"
        });
        continue;
      }

      if (stepNeedsOverlay(step)) {
        await waitForOverlay(CFG.PLAY_OVERLAY_TIMEOUT_MS);
      }

      var beforeId = seq;
      var found = await waitForPlayTarget(step.target, CFG.PLAY_FIND_TIMEOUT_MS);
      if (!found.el) {
        play.stats.stepsSkip++;
        play.stepLog.push({
          index: i,
          action: step.action,
          selector: (step.target && step.target.selector) || "",
          text: (step.target && step.target.text) || "",
          result: "skip",
          how: "miss",
          run: play.runCount,
          message: "Элемент не найден"
        });
        play.findings.push({
          type: "ui_miss",
          stepIndex: i,
          run: play.runCount,
          stepAction: step.action,
          message: "Не найден: " + ((step.target && step.target.selector) || step.target.text || "?")
        });
        await waitMs(play.stepDelayMs);
        continue;
      }
      try {
        performPlayAction(step, found.el);
        play.stats.stepsOk++;
        play.stepLog.push({
          index: i,
          action: step.action,
          selector: (step.target && step.target.selector) || "",
          text: (step.target && step.target.text) || "",
          result: "ok",
          how: found.how,
          run: play.runCount,
          message: ""
        });
      } catch (err) {
        play.stats.stepsFail++;
        play.stepLog.push({
          index: i,
          action: step.action,
          selector: (step.target && step.target.selector) || "",
          text: (step.target && step.target.text) || "",
          result: "fail",
          how: found.how,
          run: play.runCount,
          message: String(err && err.message ? err.message : err)
        });
        play.findings.push({
          type: "ui_fail",
          stepIndex: i,
          run: play.runCount,
          stepAction: step.action,
          message: String(err && err.message ? err.message : err)
        });
      }
      await waitMs(play.stepDelayMs);
      if (play.abort) break;
      await waitNetworkSettle();
      if (play.abort) break;
      analyzeHttpSlice(beforeId, i, step);
      refreshPlayUi();
      refreshStats();
    }

    playStepIndex = -1;
    play.finishedAt = nowIso();
    playing = false;
    play.statusText = play.abort
      ? "Остановлено. Накоплено шагов в тест-логе: " +
        play.stepLog.length +
        " (run#" +
        play.runCount +
        "). Сохраните кнопкой."
      : "Готово run#" +
        play.runCount +
        ". Накоплено: UI ok " +
        play.stats.stepsOk +
        ", skip " +
        play.stats.stepsSkip +
        ", HTTP err " +
        play.stats.httpErr +
        ", slow " +
        play.stats.slow +
        ". Автосохранения нет — нажмите «⬇ Сохранить тест-лог».";
    applyPanelMode();
    refreshPlayUi();
    refreshStats();
  }

  function stopPlay() {
    if (!playing) return;
    play.abort = true;
    play.statusText = "Остановка…";
    refreshPlayUi();
  }

  // --- UI ---
  var root = document.createElement("div");
  root.id = CFG.PANEL_ID;
  root.style.cssText =
    "position:fixed;right:12px;bottom:12px;z-index:2147483646;width:440px;" +
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

  var tabsRow = document.createElement("div");
  tabsRow.style.cssText =
    "display:flex;gap:0;background:#1e293b;border-bottom:1px solid #334155;";
  fullView.appendChild(tabsRow);

  function mkTab(label) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.cssText =
      "flex:1;padding:7px 8px;border:0;background:transparent;color:#94a3b8;" +
      "cursor:pointer;font-size:11px;font-weight:700;";
    return b;
  }
  var tabRecBtn = mkTab("Запись");
  var tabPlayBtn = mkTab("Play");
  tabsRow.appendChild(tabRecBtn);
  tabsRow.appendChild(tabPlayBtn);
  var activeTab = "record";

  var body = document.createElement("div");
  body.style.cssText = "padding:10px;display:flex;flex-direction:column;gap:8px;background:#f8fafc;";
  fullView.appendChild(body);

  var tabRecord = document.createElement("div");
  tabRecord.style.cssText = "display:flex;flex-direction:column;gap:8px;";
  body.appendChild(tabRecord);

  var tabPlay = document.createElement("div");
  tabPlay.style.cssText = "display:none;flex-direction:column;gap:8px;";
  body.appendChild(tabPlay);

  var rowMain = document.createElement("div");
  rowMain.style.cssText = "display:flex;gap:6px;align-items:center;flex-wrap:wrap;";
  tabRecord.appendChild(rowMain);

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
  maskLab.title = "Маска ПДн только для .log / UI.log (JSON всегда без маски)";
  maskLab.appendChild(maskCb);
  maskLab.appendChild(document.createTextNode("Маска ПДн"));
  rowMain.appendChild(maskLab);

  var statsEl = document.createElement("div");
  statsEl.style.cssText =
    "font-family:ui-monospace,monospace;font-size:11px;color:#334155;line-height:1.45;" +
    "padding:7px 8px;border-radius:8px;border:1px solid #e2e8f0;background:#fff;";
  tabRecord.appendChild(statsEl);

  var optsBox = document.createElement("div");
  optsBox.style.cssText =
    "display:flex;flex-direction:column;gap:5px;padding:8px 10px;" +
    "border:1px solid #e2e8f0;border-radius:8px;background:#fff;";
  tabRecord.appendChild(optsBox);
  var optsTitle = document.createElement("div");
  optsTitle.style.cssText =
    "font-size:11px;font-weight:700;color:#475569;margin-bottom:2px;";
  optsTitle.textContent = "Что писать в файлы";
  optsBox.appendChild(optsTitle);

  function mkOpt(key, label, titleText) {
    var lab = document.createElement("label");
    lab.style.cssText =
      "display:flex;align-items:flex-start;gap:7px;font-size:11px;color:#334155;cursor:pointer;line-height:1.35;";
    lab.title = titleText || label;
    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!exportOpts[key];
    cb.style.cssText = "margin-top:2px;flex-shrink:0;";
    cb.addEventListener("change", function () {
      exportOpts[key] = !!cb.checked;
      refreshStats();
    });
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(label));
    optsBox.appendChild(lab);
    return cb;
  }

  mkOpt(
    "logReqHeaders",
    "Заголовки запроса (в .log)",
    "В файл .log: блок REQUEST HEADERS"
  );
  mkOpt(
    "logRespHeaders",
    "Заголовки ответа (в .log)",
    "В файл .log: блок RESPONSE HEADERS"
  );
  mkOpt(
    "logReqBody",
    "Payload / тело запроса (в .log)",
    "В файл .log: блок REQUEST PAYLOAD"
  );
  mkOpt(
    "logRespBody",
    "Тело ответа сервера (в .log)",
    "В файл .log: блок RESPONSE BODY"
  );
  mkOpt(
    "logTiming",
    "Тайминг запроса, длительность в миллисекундах (в .log)",
    "В файл .log: durationMs у каждой записи"
  );
  mkOpt(
    "saveJson",
    "Ответы сервера — отдельный JSON-файл (.json)",
    "Сохранять httplog_<хост>_json_*.json с ответами сайта (без маски ПДн)"
  );
  mkOpt(
    "captureUi",
    "Клики и действия пользователя по интерфейсу (_ui.log)",
    "Писать click / change / submit по сайту в файл httplog_<хост>_ui_*.log"
  );

  var filterTa = document.createElement("textarea");
  filterTa.rows = 2;
  filterTa.placeholder = CFG.FILTER_PLACEHOLDER;
  filterTa.style.cssText =
    "width:100%;box-sizing:border-box;resize:vertical;padding:7px 8px;border:1px solid #94a3b8;" +
    "border-radius:8px;font-size:11px;font-family:ui-monospace,monospace;background:#fff;color:#0f172a;";
  tabRecord.appendChild(filterTa);

  var hint = document.createElement("div");
  hint.style.cssText = "font-size:10px;color:#64748b;line-height:1.35;";
  hint.textContent =
    "Имена: httplog_<хост>_<http|json|ui>_<время>. Хост — без https и без .ru/.com. Файлы качаются с паузой.";
  tabRecord.appendChild(hint);

  var rowActions = document.createElement("div");
  rowActions.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;";
  tabRecord.appendChild(rowActions);

  var btnSaveBoth = mkBtn("⬇ Сохранить");
  btnSaveBoth.title =
    "Сохранить включённые файлы с одним timestamp (.log / .json / _ui.log)";
  var btnClear = mkBtn("Очистить");
  rowActions.appendChild(btnSaveBoth);
  rowActions.appendChild(btnClear);

  // --- вкладка Play ---
  var playLoadRow = document.createElement("div");
  playLoadRow.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;align-items:center;";
  tabPlay.appendChild(playLoadRow);

  var btnLoadUi = mkBtn("📂 Загрузить лог UI");
  btnLoadUi.title = "Выбрать файл httplog_*_ui_*.log";
  var playFileInput = document.createElement("input");
  playFileInput.type = "file";
  playFileInput.accept = ".log,.txt,text/plain";
  playFileInput.style.display = "none";
  playLoadRow.appendChild(btnLoadUi);
  playLoadRow.appendChild(playFileInput);

  var btnPlayRun = mkBtn("▶ Play", "background:#2563eb;border-color:#2563eb;color:#fff;min-width:88px;");
  var btnPlayStop = mkBtn("⏹ Стоп", "background:#dc2626;border-color:#dc2626;color:#fff;min-width:88px;");
  btnPlayStop.disabled = true;
  btnPlayStop.style.opacity = "0.45";
  playLoadRow.appendChild(btnPlayRun);
  playLoadRow.appendChild(btnPlayStop);

  var playFileLabel = document.createElement("div");
  playFileLabel.style.cssText = "font-size:11px;color:#334155;line-height:1.35;";
  playFileLabel.textContent = "Файл не загружен.";
  tabPlay.appendChild(playFileLabel);

  var playOpts = document.createElement("div");
  playOpts.style.cssText =
    "display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:8px;" +
    "border:1px solid #e2e8f0;border-radius:8px;background:#fff;font-size:11px;color:#334155;";
  tabPlay.appendChild(playOpts);

  function mkNumField(label, key, defVal) {
    var wrap = document.createElement("label");
    wrap.style.cssText = "display:flex;flex-direction:column;gap:3px;";
    wrap.appendChild(document.createTextNode(label));
    var inp = document.createElement("input");
    inp.type = "number";
    inp.min = "0";
    inp.step = "50";
    inp.value = String(defVal);
    inp.style.cssText =
      "padding:5px 6px;border:1px solid #94a3b8;border-radius:6px;font-size:11px;";
    inp.addEventListener("change", function () {
      var n = Number(inp.value);
      if (!isFinite(n) || n < 0) n = defVal;
      play[key] = n;
      inp.value = String(n);
    });
    wrap.appendChild(inp);
    playOpts.appendChild(wrap);
    return inp;
  }

  mkNumField("Пауза между шагами, мс", "stepDelayMs", play.stepDelayMs);
  mkNumField("Ожидание сети после шага, мс", "settleMs", play.settleMs);
  mkNumField("Порог «долго», мс (абс.)", "slowAbsMs", play.slowAbsMs);
  var slowFactorWrap = document.createElement("label");
  slowFactorWrap.style.cssText = "display:flex;flex-direction:column;gap:3px;";
  slowFactorWrap.appendChild(document.createTextNode("Множитель к median (slow)"));
  var slowFactorInp = document.createElement("input");
  slowFactorInp.type = "number";
  slowFactorInp.min = "1";
  slowFactorInp.step = "0.1";
  slowFactorInp.value = String(play.slowFactor);
  slowFactorInp.style.cssText =
    "padding:5px 6px;border:1px solid #94a3b8;border-radius:6px;font-size:11px;";
  slowFactorInp.addEventListener("change", function () {
    var n = Number(slowFactorInp.value);
    if (!isFinite(n) || n < 1) n = CFG.PLAY_SLOW_FACTOR;
    play.slowFactor = n;
    slowFactorInp.value = String(n);
  });
  slowFactorWrap.appendChild(slowFactorInp);
  playOpts.appendChild(slowFactorWrap);

  var playStatsEl = document.createElement("div");
  playStatsEl.style.cssText =
    "font-family:ui-monospace,monospace;font-size:11px;color:#334155;line-height:1.45;" +
    "padding:7px 8px;border-radius:8px;border:1px solid #e2e8f0;background:#fff;white-space:pre-wrap;";
  tabPlay.appendChild(playStatsEl);

  var playHint = document.createElement("div");
  playHint.style.cssText = "font-size:10px;color:#64748b;line-height:1.35;";
  playHint.textContent =
    "Тест-лог (_test_) не качается сам. Несколько Play / смена UI-файла копятся в один буфер до «Очистить». Сохранение — только кнопкой «⬇ Сохранить тест-лог».";
  tabPlay.appendChild(playHint);

  var playActions = document.createElement("div");
  playActions.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;";
  tabPlay.appendChild(playActions);
  var btnPlayReport = mkBtn("⬇ Сохранить тест-лог");
  btnPlayReport.title =
    "Скачать httplog_<хост>_test_*.log — весь накопленный Play (все прогоны до очистки)";
  var btnPlayClear = mkBtn("Очистить тест");
  btnPlayClear.title = "Сбросить накопленный тест-лог Play (шаги, findings, HTTP Play)";
  playActions.appendChild(btnPlayReport);
  playActions.appendChild(btnPlayClear);

  // компактная панель во время Play (Стоп + статистика)
  var playCompact = document.createElement("div");
  playCompact.style.cssText =
    "display:none;flex-direction:column;gap:6px;padding:6px 8px;background:#f8fafc;";
  fullView.appendChild(playCompact);
  var playCompactStop = mkBtn(
    "⏹ Стоп Play",
    "background:#dc2626;border-color:#dc2626;color:#fff;width:100%;"
  );
  playCompact.appendChild(playCompactStop);
  var playCompactStats = document.createElement("div");
  playCompactStats.style.cssText =
    "font-family:ui-monospace,monospace;font-size:9px;color:#334155;line-height:1.35;" +
    "padding:5px 6px;border-radius:8px;border:1px solid #e2e8f0;background:#fff;white-space:pre-wrap;";
  playCompact.appendChild(playCompactStats);

  function setActiveTab(name) {
    if (playing || recording) return;
    activeTab = name === "play" ? "play" : "record";
    tabRecord.style.display = activeTab === "record" ? "flex" : "none";
    tabPlay.style.display = activeTab === "play" ? "flex" : "none";
    tabRecBtn.style.background = activeTab === "record" ? "#334155" : "transparent";
    tabRecBtn.style.color = activeTab === "record" ? "#f8fafc" : "#94a3b8";
    tabPlayBtn.style.background = activeTab === "play" ? "#334155" : "transparent";
    tabPlayBtn.style.color = activeTab === "play" ? "#f8fafc" : "#94a3b8";
  }
  setActiveTab("record");

  function refreshPlayUi() {
    var st = play.stats;
    var loaded = play.script.length
      ? "Файл: " + (play.fileName || "(без имени)") + " · шагов: " + play.script.length
      : "Файл не загружен.";
    playFileLabel.textContent = loaded;
    var txt =
      play.statusText +
      "\nruns " +
      play.runCount +
      (play.testActive ? " · накопление ON" : "") +
      "  шаг " +
      (playing ? play.index + 1 + "/" + (play.script.length || 0) : "—") +
      "  записей в тесте " +
      play.stepLog.length +
      "\nUI ok " +
      st.stepsOk +
      "  fail " +
      st.stepsFail +
      "  skip " +
      st.stepsSkip +
      "\nHTTP ok " +
      st.httpOk +
      "  err " +
      st.httpErr +
      "  bodyErr " +
      st.bodyErr +
      "  slow " +
      st.slow +
      "\nfindings " +
      play.findings.length +
      "  HTTP buf " +
      entries.length;
    playStatsEl.textContent = txt;
    playCompactStats.textContent = txt;
    btnPlayRun.disabled = playing || !play.script.length;
    btnPlayRun.style.opacity = btnPlayRun.disabled ? "0.45" : "1";
    btnPlayStop.disabled = !playing;
    btnPlayStop.style.opacity = playing ? "1" : "0.45";
    btnLoadUi.disabled = playing;
    btnPlayReport.disabled = !play.stepLog.length && !play.findings.length;
  }

  // мини-бар (сворачивание «—»)
  var mini = document.createElement("div");
  mini.style.cssText =
    "display:none;flex-direction:column;align-items:stretch;gap:4px;padding:6px 10px;" +
    "background:#0f172a;color:#f8fafc;cursor:pointer;min-width:340px;max-width:420px;";
  mini.title = "Развернуть";
  root.appendChild(mini);
  var miniTop = document.createElement("div");
  miniTop.style.cssText = "display:flex;align-items:center;gap:8px;";
  mini.appendChild(miniTop);
  var miniDot = document.createElement("span");
  miniDot.style.cssText =
    "width:8px;height:8px;border-radius:50%;background:#64748b;display:inline-block;flex-shrink:0;";
  miniTop.appendChild(miniDot);
  var miniText = document.createElement("span");
  miniText.style.cssText =
    "font-size:10px;font-weight:700;font-family:ui-monospace,monospace;letter-spacing:0.01em;";
  miniText.textContent = "HTTP · idle";
  miniTop.appendChild(miniText);
  var miniStats = document.createElement("div");
  miniStats.style.cssText =
    "font-size:9px;font-family:ui-monospace,monospace;color:#cbd5e1;line-height:1.4;white-space:pre-wrap;";
  miniStats.textContent = "";
  mini.appendChild(miniStats);

  function fmtBytes(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(2) + " MB";
  }

  function plannedSaveFiles() {
    var host = siteHostTag();
    var parts = ["http"];
    if (exportOpts.saveJson) parts.push("json");
    if (exportOpts.captureUi) parts.push("ui");
    return parts.map(function (k) {
      return "httplog_" + host + "_" + k + "_…";
    });
  }

  function detailedStatsText(compact) {
    var mode = playing ? "▶ PLAY" : recording ? "● REC" : "○ idle";
    var line1 =
      mode +
      "  HTTP " +
      stats.total +
      "  OK " +
      stats.ok +
      "  err " +
      stats.err +
      "  UI " +
      uiEvents.length;
    var line2 =
      "buf " +
      entries.length +
      "  out " +
      fmtBytes(stats.bytesOut) +
      "  in " +
      fmtBytes(stats.bytesIn) +
      (maskOn ? "  mask ON" : "  mask OFF");
    var line3 = playing
      ? "play " +
        (play.index + 1) +
        "/" +
        play.script.length +
        "  findings " +
        play.findings.length
      : "files: " + plannedSaveFiles().join(" + ");
    if (compact) {
      return line1 + "  ·  " + line2 + "\n" + line3;
    }
    return line1 + "\n" + line2 + "\n" + line3;
  }

  /** Компакт: при записи или Play — только Стоп + статистика. */
  function applyPanelMode() {
    var compact = recording || playing;
    if (compact) {
      mini.style.display = "none";
      fullView.style.display = "block";
    }
    head.style.display = compact ? "none" : "flex";
    tabsRow.style.display = compact ? "none" : "flex";
    btnMin.style.display = compact ? "none" : "";
    btnClose.style.display = compact ? "none" : "";

    if (playing) {
      body.style.display = "none";
      playCompact.style.display = "flex";
      root.style.width = "380px";
      return;
    }

    playCompact.style.display = "none";
    body.style.display = "flex";
    tabRecord.style.display = activeTab === "record" ? "flex" : "none";
    tabPlay.style.display = activeTab === "play" ? "flex" : "none";

    maskLab.style.display = recording ? "none" : "inline-flex";
    optsBox.style.display = recording ? "none" : "flex";
    filterTa.style.display = recording ? "none" : "block";
    hint.style.display = recording ? "none" : "block";
    rowActions.style.display = recording ? "none" : "flex";
    root.style.width = recording ? "360px" : "440px";
    body.style.padding = recording ? "6px 8px" : "10px";
    body.style.gap = recording ? "5px" : "8px";
    statsEl.style.fontSize = recording ? "9px" : "11px";
    statsEl.style.lineHeight = recording ? "1.35" : "1.45";
    statsEl.style.padding = recording ? "5px 6px" : "7px 8px";
    btnToggle.style.minWidth = recording ? "72px" : "88px";
    btnToggle.style.padding = recording ? "5px 10px" : "6px 10px";
    btnToggle.style.fontSize = recording ? "11px" : "12px";
    rowMain.style.flexDirection = "row";
    rowMain.style.flexWrap = recording ? "nowrap" : "wrap";
  }

  function refreshStats() {
    statsEl.textContent = detailedStatsText(!!(recording || playing));
    miniText.textContent = playing
      ? "▶ PLAY  " + (play.index + 1) + "/" + play.script.length
      : recording
        ? "● REC  HTTP " + stats.total + " / UI " + uiEvents.length
        : "○ idle  HTTP " + stats.total;
    miniStats.textContent = detailedStatsText(true);
    recDot.style.background = playing ? "#2563eb" : recording ? "#ef4444" : "#64748b";
    miniDot.style.background = playing ? "#2563eb" : recording ? "#ef4444" : "#64748b";
    btnSaveBoth.title =
      "Сохранить с паузой между файлами: " +
      plannedSaveFiles().join(", ") +
      " (если браузер спросит — разрешите несколько загрузок)";
    if (typeof refreshPlayUi === "function") refreshPlayUi();
  }

  function setRecording(on) {
    if (playing) return;
    recording = !!on;
    if (recording) {
      setActiveTab("record");
      filterParts = parseFilters(filterTa.value);
      if (!startedAt) startedAt = nowIso();
      installHooks();
      installUiHooks();
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
    }
    applyPanelMode();
    refreshStats();
  }

  function cleanup() {
    play.abort = true;
    playing = false;
    setRecording(false);
    uninstallHooks();
    uninstallUiHooks();
  }

  root.__httpLoggerCleanup = cleanup;

  tabRecBtn.addEventListener("click", function () {
    setActiveTab("record");
  });
  tabPlayBtn.addEventListener("click", function () {
    setActiveTab("play");
  });

  btnToggle.addEventListener("click", function () {
    if (playing) return;
    setRecording(!recording);
  });

  maskCb.addEventListener("change", function () {
    maskOn = !!maskCb.checked;
    refreshStats();
  });

  btnLoadUi.addEventListener("click", function () {
    if (playing) return;
    playFileInput.click();
  });

  playFileInput.addEventListener("change", function () {
    var f = playFileInput.files && playFileInput.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = parseUiLogText(String(reader.result || ""));
        play.script = parsed;
        play.fileName = f.name;
        // накопленный тест-лог не сбрасываем — только смена сценария для следующего Play
        play.statusText = parsed.length
          ? "Загружено шагов: " +
            parsed.length +
            "." +
            (play.testActive
              ? " Тест-буфер сохранён (runs=" + play.runCount + ") — можно Play снова или «Сохранить тест-лог»."
              : " Можно запускать Play.")
          : "В файле нет шагов UI (проверьте формат _ui.log).";
        refreshPlayUi();
        console.log("[HTTP_Traffic_Logger] UI log загружен:", f.name, "шагов=", parsed.length);
      } catch (err) {
        play.script = [];
        play.statusText = "Ошибка разбора: " + String(err && err.message ? err.message : err);
        refreshPlayUi();
      }
      playFileInput.value = "";
    };
    reader.onerror = function () {
      play.statusText = "Не удалось прочитать файл.";
      refreshPlayUi();
    };
    reader.readAsText(f);
  });

  btnPlayRun.addEventListener("click", function () {
    if (recording) {
      play.statusText = "Сначала остановите запись.";
      refreshPlayUi();
      return;
    }
    runPlay();
  });

  btnPlayStop.addEventListener("click", function () {
    stopPlay();
  });
  playCompactStop.addEventListener("click", function () {
    stopPlay();
  });

  btnPlayReport.addEventListener("click", function () {
    if (!play.stepLog.length && !play.findings.length && !entries.length) {
      play.statusText = "Нечего сохранять — сначала выполните Play.";
      refreshPlayUi();
      return;
    }
    savePlayReport();
    play.statusText =
      "Тест-лог сохранён (runs=" + play.runCount + ", записей=" + play.stepLog.length + "). Буфер не очищен.";
    refreshPlayUi();
  });

  btnPlayClear.addEventListener("click", function () {
    if (playing) return;
    clearPlayTestAccumulation();
    refreshPlayUi();
    refreshStats();
  });

  btnClear.addEventListener("click", function () {
    if (playing) return;
    clearPlayTestAccumulation();
    entries = [];
    uiEvents = [];
    seq = 0;
    uiSeq = 0;
    eventSeq = 0;
    lastUiEventId = null;
    sessionId = tsShort() + "_" + Math.random().toString(36).slice(2, 8);
    startedAt = recording ? nowIso() : "";
    stats = { total: 0, ok: 0, err: 0, bytesIn: 0, bytesOut: 0, ui: 0 };
    refreshPlayUi();
    refreshStats();
  });

  btnSaveBoth.addEventListener("click", function () {
    // Имена: httplog_<host>_<http|json|ui>_<ts>.ext
    var stamp = tsShort();
    var jobs = [{ filename: makeExportFilename("http", stamp, "log"), text: buildLogText() }];
    if (exportOpts.saveJson) {
      jobs.push({
        filename: makeExportFilename("json", stamp, "json"),
        text: JSON.stringify(buildJsonResponses(), null, 2),
        mime: "application/json;charset=utf-8"
      });
    }
    if (exportOpts.captureUi) {
      jobs.push({ filename: makeExportFilename("ui", stamp, "log"), text: buildUiLogText() });
    }
    downloadSequentially(jobs, 450);
    console.log(
      "[HTTP_Traffic_Logger] Сохранение (" +
        stamp +
        " @ " +
        siteHostTag() +
        "): " +
        jobs
          .map(function (j) {
            return j.filename;
          })
          .join(", ") +
        " · sessionId=" +
        sessionId +
        " · если пришёл только 1 файл — разрешите сайту несколько загрузок"
    );
  });

  btnMin.addEventListener("click", function () {
    if (recording || playing) return;
    fullView.style.display = "none";
    mini.style.display = "flex";
    root.style.width = "auto";
    refreshStats();
  });

  mini.addEventListener("click", function () {
    mini.style.display = "none";
    fullView.style.display = "block";
    root.style.width = recording || playing ? "360px" : "440px";
    applyPanelMode();
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
  installHooks();
  installUiHooks();
  refreshPlayUi();
  refreshStats();
  console.log(
    "[HTTP_Traffic_Logger] Панель: вкладка Запись / Play. Play ← загрузка _ui.log → прокликивание + отчёт."
  );
})();
