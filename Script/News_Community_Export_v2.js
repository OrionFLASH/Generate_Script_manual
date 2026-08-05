// =============================================================================
// News_Community_Export_v2.js — выгрузка / создание / статусы / редактирование / удаление
// =============================================================================
// Запуск: DevTools Console на странице community/admin community.
// Куки берутся из текущей вкладки (credentials: "include").
// Список для выбора: POST /v1/news; create/update/delete — admin API (по HAR logger).
// =============================================================================
(function () {
  "use strict";

  var NEWS_V2_CFG = {
    PANEL_ID: "newsCommunityExportV2Root",
    /** scriptId для DevToolsTrace / имени .log */
    SCRIPT_ID: "News_Community_Export_v2",
    NEWS_PATH: "/bo/rmkib.gamification/proxy/v1/news",
    NEWS_CREATE_PATH: "/bo/rmkib.gamification/proxy/v1/administration/news/newsCreate",
    NEWS_UPDATE_PATH: "/bo/rmkib.gamification/proxy/v1/administration/news/newsUpdate",
    /** Удаление: POST …/news/newsId/newsDelete, body { newsId } (HAR). */
    NEWS_DELETE_PATH: "/bo/rmkib.gamification/proxy/v1/news/newsId/newsDelete",
    /** Детальная карточка: POST …/news-detail, body { newsId }. */
    NEWS_DETAIL_PATH: "/bo/rmkib.gamification/proxy/v1/news-detail",
    ORIGINS: {
      PROM: {
        ALPHA: "https://efs-our-business-prom.omega.sbrf.ru",
        SIGMA: "https://salesheroes.sberbank.ru"
      },
      PSI: {
        ALPHA: "https://iam-enigma-psi.omega.sbrf.ru",
        SIGMA: "https://salesheroes-psi.sigma.sbrf.ru"
      },
      "IFT-SB": {
        ALPHA: "https://iam-enigma-psi.omega.sbrf.ru",
        SIGMA: "https://salesheroes-psi.sigma.sbrf.ru"
      },
      "IFT-GF": {
        ALPHA: "https://iam-enigma-psi.omega.sbrf.ru",
        SIGMA: "https://salesheroes-psi.sigma.sbrf.ru"
      }
    },
    STANDS: ["PROM", "PSI", "IFT-SB", "IFT-GF"],
    CONTOURS: ["ALPHA", "SIGMA"],
    FALLBACK_STAND: "PROM",
    FALLBACK_CONTOUR: "SIGMA",
    DEFAULT_NEWS_TYPE: "publication",
    NEWS_TYPES: ["achievement", "bestPractice", "publication"],
    /** Подписи типов для формы создания (create API ≠ все значения newsType из выгрузки). */
    NEWS_TYPE_LABELS: {
      achievement: "Достижение (achievement) ← individual/tournamentAchievement",
      bestPractice: "Лучшая практика (bestPractice)",
      publication: "Публикация / новость проекта (publication)"
    },
    DEFAULT_STATUS_TARGET: "published",
    DEFAULT_CREATED_BY: "00673892",
    STATUS_OPTIONS: [
      { value: "published", label: "Опубликована (published)", defaultChecked: true },
      { value: "planned", label: "Запланирована (planned)", defaultChecked: false },
      { value: "draft", label: "Черновик (draft)", defaultChecked: false }
    ],
    BUSINESS_BLOCK_OPTIONS: [
      { value: "KMKKSB", label: "KMKKSB", defaultChecked: true },
      { value: "CSM", label: "CSM", defaultChecked: false },
      { value: "AKMKKSB", label: "AKMKKSB", defaultChecked: false },
      { value: "MNS", label: "MNS", defaultChecked: false },
      { value: "KMFACTORING", label: "KMFACTORING", defaultChecked: false }
    ],
    TAG_OPTIONS: [
      { tagType: "NEWS_TYPE", tagCode: "bestPractice", label: "Лучшие практики (bestPractice)", defaultChecked: false },
      { tagType: "NEWS_TYPE", tagCode: "achievement", label: "Достижения (achievement)", defaultChecked: false },
      { tagType: "NEWS_TYPE", tagCode: "publication", label: "Новости проекта (publication)", defaultChecked: false }
    ],
    CUSTOM_TAG_TYPE: "TEXT",
    CUSTOM_TAGS_PLACEHOLDER: "M&A\nГарантии\nВалютное хеджирование",
    PAYLOAD_GAP_MS: 500,
    PAGE_GAP_MS: 100,
    /** Начальный pageNum выгрузки (и загрузки для edit). */
    PAGE_FROM: 1,
    /** Конечный pageNum включительно; 0 = до последней страницы API. */
    PAGE_TO: 0,
    /** Совместимость: если PAGE_TO=0 и нужен локальный лимит «сколько страниц» (edit). */
    MAX_PAGES_PER_COMBO: 0,
    GAP_MAX_MS: 60000,
    RETRY_MAX: 2,
    RETRY_PAUSE_MS: 2000,
    CONSECUTIVE_FAIL_ABORT: 2,
    CSV_DELIMITER: ";",
    CSV_DATA_KEYS: [
      "newsId",
      "newsType",
      "summary",
      "newsText",
      "newsItemStatus",
      "createDate",
      "updateDate",
      "plannedDate",
      "date",
      "businessBlocks"
    ],
    FILENAME_PREFIX_AUTO: "news_community_",
    FILENAME_PREFIX_PLACEHOLDER: "авто: news_community_{стенд}_{контур}_",
    LOG_MAX_LINES: 1200,
    /** DevToolsTrace */
    TRACE_MAX_BODY_LEN: 16384,
    TRACE_MAX_LINES: 8000
  };

  /**
   * Ключи JSON (news / create / update / authors / leaders / newsFeature),
   * значения которых маскируются в Trace (по HAR list/detail: employeeNumber, ФИО…).
   */
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
    /** Массив строк с именами (если встречается). */
    bossnames: true
  };

/**
 * DevToolsTrace — трассировка UI, HTTP и журнала для DevTools-скриптов (один файл → вставка в консоль).
 * Использование: createDevToolsTrace({ scriptId, sanitizeForTrace?, maskEnabled? }) →
 *   mountToggleRow, attachPanel, wrapFetch, log.
 * При наличии sanitizeForTrace в строке Trace появляется чекбокс «Маска ПДн» (по умолчанию вкл.).
 */
/* DevToolsTrace v1 */
function createDevToolsTrace(opts) {
  "use strict";
  var scriptId = (opts && opts.scriptId) || "devtools_script";
  var maxBodyLen = (opts && opts.maxBodyLen) || 16384;
  var maxLines = (opts && opts.maxLines) || 8000;
  /** @type {((s: string) => string)|null} */
  var userSanitize =
    opts && typeof opts.sanitizeForTrace === "function" ? opts.sanitizeForTrace : null;
  /** Маска ПДн: только если передан sanitizeForTrace; по умолчанию включена. */
  var maskEnabled = userSanitize ? opts.maskEnabled !== false : false;
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
   * Применяет sanitize только при включённой маске.
   * @param {string} s
   * @returns {string}
   */
  function applySanitize(s) {
    var text = String(s == null ? "" : s);
    if (!userSanitize || !maskEnabled) return text;
    return userSanitize(text);
  }

  /**
   * @param {string} kind
   * @param {string} message
   * @param {Record<string, unknown>|null} [detail]
   */
  function push(kind, message, detail) {
    if (!enabled) return;
    var safeMsg = applySanitize(String(message == null ? "" : message));
    var line = isoNow() + " [" + kind + "] " + safeMsg;
    if (detail && typeof detail === "object") {
      try {
        line += " " + applySanitize(JSON.stringify(detail));
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
      push(
        "SYS",
        "Trace ON script=" +
          scriptId +
          (userSanitize ? " mask=" + (maskEnabled ? "ON" : "OFF") : "")
      );
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
   * @param {boolean} on
   */
  function setMaskEnabled(on) {
    if (!userSanitize) return;
    var next = !!on;
    if (next === maskEnabled) return;
    maskEnabled = next;
    if (enabled) push("SYS", "Mask " + (maskEnabled ? "ON" : "OFF"));
  }

  function isMaskEnabled() {
    return !!(userSanitize && maskEnabled);
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
      var reqBody = init && init.body != null ? applySanitize(truncBody(init.body)) : "";
      push("HTTP", "→ " + method + " " + url, reqBody ? { requestBody: reqBody } : null);
      var t0 = Date.now();
      var res = await nativeFetch(input, init);
      var ms = Date.now() - t0;
      var status = res.status;
      var respText = "";
      try {
        respText = applySanitize(truncBody(await res.clone().text()));
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
          ui("click checkbox", {
            checked: cb.checked,
            label: ((cb.parentElement && cb.parentElement.textContent) || "").trim().slice(0, 80)
          });
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
   * @returns {{ row: HTMLElement, checkbox: HTMLInputElement, maskCheckbox: HTMLInputElement|null, saveBtn: HTMLButtonElement }}
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
    checkbox.title =
      "Общая запись HTTP, кликов по панели и журнала со всех вкладок → файл .log при выключении";
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

    /** @type {HTMLInputElement|null} */
    var maskCheckbox = null;
    if (userSanitize) {
      var maskLab = document.createElement("label");
      maskLab.style.cssText =
        "display:flex;align-items:center;gap:5px;cursor:pointer;user-select:none;" +
        "padding:2px 6px;border:1px solid #cbd5e1;border-radius:4px;background:#fff;font-size:10px;";
      maskLab.title = "Маскировать ПДн в trace (.log). Выкл. — сырые тела HTTP/журнала.";
      maskCheckbox = document.createElement("input");
      maskCheckbox.type = "checkbox";
      maskCheckbox.checked = maskEnabled;
      maskLab.appendChild(maskCheckbox);
      maskLab.appendChild(document.createTextNode("Маска ПДн"));
      maskCheckbox.addEventListener("change", function () {
        setMaskEnabled(!!maskCheckbox.checked);
      });
      row.appendChild(maskLab);
    }

    row.appendChild(saveBtn);

    if (beforeNode && beforeNode.parentNode) {
      beforeNode.parentNode.insertBefore(row, beforeNode);
    } else if (container) {
      container.appendChild(row);
    }
    return { row: row, checkbox: checkbox, maskCheckbox: maskCheckbox, saveBtn: saveBtn };
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
      (userSanitize ? " mask=" + (maskEnabled ? "ON" : "OFF") : "") +
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
    isMaskEnabled: isMaskEnabled,
    setMaskEnabled: setMaskEnabled,
    log: log,
    ui: ui,
    wrapFetch: wrapFetch,
    attachPanel: attachPanel,
    mountToggleRow: mountToggleRow,
    downloadLog: downloadLog
  };
}

  var __nativeFetch = window.fetch.bind(window);

  /**
   * Маска: первая буква + *** + последние 3 (пример: 00673892 → 0***892).
   * @param {unknown} v
   * @returns {string}
   */
  function maskSensitiveValue(v) {
    var s = v == null ? "" : String(v);
    if (!s) return s;
    if (s.length === 1) return s + "***";
    if (s.length <= 4) return s.charAt(0) + "***" + s.slice(1);
    return s.charAt(0) + "***" + s.slice(-3);
  }

  /**
   * Рекурсивно маскирует чувствительные ключи в объекте/массиве для Trace.
   * @param {unknown} node
   * @returns {unknown}
   */
  function maskSensitiveTree(node) {
    if (node == null) return node;
    if (Array.isArray(node)) {
      return node.map(maskSensitiveTree);
    }
    if (typeof node === "object") {
      /** @type {Record<string, unknown>} */
      var out = {};
      var keys = Object.keys(/** @type {object} */ (node));
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var val = /** @type {Record<string, unknown>} */ (node)[k];
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
          } else if (typeof val === "string") {
            out[k] = maskSensitiveDeep(val);
          } else {
            out[k] = maskSensitiveTree(val);
          }
        } else if (typeof val === "string") {
          // Вложенные JSON-строки: newsFeature, contestFeature и т.п.
          out[k] = maskSensitiveDeep(val);
        } else {
          out[k] = maskSensitiveTree(val);
        }
      }
      return out;
    }
    return node;
  }

  /**
   * Маскирование текста/JSON для записи в Trace.
   * @param {string} raw
   * @returns {string}
   */
  function sanitizeForTrace(raw) {
    var s = String(raw == null ? "" : raw);
    if (!s) return s;
    var t = s.replace(/^\s+/, "");
    if (t.charAt(0) === "{" || t.charAt(0) === "[") {
      try {
        var parsed = JSON.parse(s);
        return JSON.stringify(maskSensitiveDeep(parsed));
      } catch (_e) {
        /* не JSON — текстовые замены ниже */
      }
    }
    return maskSensitiveInPlainText(s);
  }

  /**
   * Рекурсивный обход с разбором вложенных JSON-строк (newsFeature и т.п.).
   * @param {unknown} node
   * @returns {unknown}
   */
  function maskSensitiveDeep(node) {
    if (node == null) return node;
    if (typeof node === "string") {
      var trimmed = node.replace(/^\s+/, "");
      if (trimmed.charAt(0) === "{" || trimmed.charAt(0) === "[") {
        try {
          return JSON.stringify(maskSensitiveTree(JSON.parse(node)));
        } catch (_e) {
          return maskSensitiveInPlainText(node);
        }
      }
      return maskSensitiveInPlainText(node);
    }
    if (typeof node === "object") {
      return maskSensitiveTree(node);
    }
    return node;
  }

  /**
   * Текстовое маскирование лейблов и "key": "value" паттернов.
   * @param {string} s
   * @returns {string}
   */
  function maskSensitiveInPlainText(s) {
    s = String(s);
    s = s.replace(
      /(createdBy|employeeNumber|employeeId|personUuid|userId|tabNumber|authorsList|leadersList|ФИО|firstName|lastName|fullName|sberChatMention)\s*=\s*([^|,\n]+?)(?=\s*\||,|$)/gi,
      function (_m, label, val) {
        return label + "=" + maskSensitiveValue(String(val).replace(/^\s+|\s+$/g, ""));
      }
    );
    s = s.replace(
      /"(employeeNumber|employeeId|createdBy|lastName|firstName|midName|middleName|secondName|fullName|sberChatMention|alphaLink|sigmaLink|email|mail|phone|preferred_mail|preferred_phone|personUuid|userId|tabNumber|password|token|authorization|cookie|bossNames)"\s*:\s*"([^"]*)"/gi,
      function (_m, key, val) {
        return '"' + key + '": "' + maskSensitiveValue(val) + '"';
      }
    );
    return s;
  }

  var devTrace = createDevToolsTrace({
    scriptId: NEWS_V2_CFG.SCRIPT_ID,
    maxBodyLen: NEWS_V2_CFG.TRACE_MAX_BODY_LEN,
    maxLines: NEWS_V2_CFG.TRACE_MAX_LINES,
    sanitizeForTrace: sanitizeForTrace
  });
  var httpFetch = devTrace.wrapFetch(__nativeFetch);

  function detectEnvByOrigin(origin) {
    var lower = String(origin || "").toLowerCase();
    for (var si = 0; si < NEWS_V2_CFG.STANDS.length; si++) {
      var stand = NEWS_V2_CFG.STANDS[si];
      for (var ci = 0; ci < NEWS_V2_CFG.CONTOURS.length; ci++) {
        var contour = NEWS_V2_CFG.CONTOURS[ci];
        var value = NEWS_V2_CFG.ORIGINS[stand] && NEWS_V2_CFG.ORIGINS[stand][contour];
        if (value && String(value).toLowerCase() === lower) {
          return { stand: stand, contour: contour, origin: value };
        }
      }
    }
    return null;
  }

  var detected = detectEnvByOrigin(window.location.origin);
  var selectedStand = detected ? detected.stand : NEWS_V2_CFG.FALLBACK_STAND;
  var selectedContour = detected ? detected.contour : NEWS_V2_CFG.FALLBACK_CONTOUR;

  function getEnv() {
    var origin =
      NEWS_V2_CFG.ORIGINS[selectedStand] &&
      NEWS_V2_CFG.ORIGINS[selectedStand][selectedContour];
    if (!origin) {
      origin =
        NEWS_V2_CFG.ORIGINS[NEWS_V2_CFG.FALLBACK_STAND][NEWS_V2_CFG.FALLBACK_CONTOUR];
    }
    return {
      stand: selectedStand,
      contour: selectedContour,
      origin: origin
    };
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

  function safeParseJson(text) {
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch (e) {
      return { ok: false, error: e };
    }
  }

  function parseLinesToList(text) {
    if (!text) return [];
    var raw = String(text).replace(/\r/g, "\n").split(/\n|;/g);
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var v = raw[i].trim();
      if (v) out.push(v);
    }
    return out;
  }

  function parseMaybeJsonArray(value) {
    if (Array.isArray(value)) return value.slice();
    if (typeof value !== "string") return [];
    var trimmed = value.trim();
    if (!trimmed) return [];
    var parsed = safeParseJson(trimmed);
    if (parsed.ok && Array.isArray(parsed.value)) return parsed.value;
    return parseLinesToList(trimmed);
  }

  function normalizeType(typeValue) {
    var t = String(typeValue || "").trim();
    if (!t) return NEWS_V2_CFG.DEFAULT_NEWS_TYPE;
    if (t === "individualAchievement" || t === "tournamentAchievement") return "achievement";
    if (NEWS_V2_CFG.NEWS_TYPES.indexOf(t) >= 0) return t;
    return NEWS_V2_CFG.DEFAULT_NEWS_TYPE;
  }

  function toTagList(value) {
    if (Array.isArray(value)) {
      return value
        .map(function (item) {
          if (item && typeof item === "object" && item.tagValue) {
            return { tagValue: String(item.tagValue).trim() };
          }
          var raw = String(item || "").trim();
          return raw ? { tagValue: raw } : null;
        })
        .filter(Boolean);
    }
    var tags = parseLinesToList(String(value || ""));
    return tags.map(function (v) {
      return { tagValue: v };
    });
  }

  function mapEmployeesList(list) {
    if (!Array.isArray(list)) return [];
    return list
      .map(function (x) {
        if (x && typeof x === "object" && x.employeeNumber != null) {
          return String(x.employeeNumber).trim();
        }
        return String(x || "").trim();
      })
      .filter(Boolean)
      .map(function (employeeNumber) {
        return { employeeNumber: employeeNumber };
      });
  }

  function ensureString(value) {
    return value == null ? "" : String(value);
  }

  /**
   * Коды наград из create-шаблона или выгрузки (rewards / rewardList).
   * @param {*} source
   * @returns {{ rewardCode: string }[]}
   */
  function extractRewardList(source) {
    var out = [];
    var seen = {};
    function add(code) {
      var c = String(code == null ? "" : code).trim();
      if (!c || seen[c]) return;
      seen[c] = true;
      out.push({ rewardCode: c });
    }
    var list = (source && (source.rewardList || source.rewards)) || [];
    if (!Array.isArray(list)) return out;
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (r && typeof r === "object") add(r.rewardCode);
      else add(r);
    }
    return out;
  }

  /**
   * Коды турниров: tournamentList или contests[].tournaments[].tournamentCode.
   * @param {*} source
   * @returns {{ tournamentCode: string }[]}
   */
  function extractTournamentList(source) {
    var out = [];
    var seen = {};
    function add(code) {
      var c = String(code == null ? "" : code).trim();
      if (!c || seen[c]) return;
      seen[c] = true;
      out.push({ tournamentCode: c });
    }
    var list = (source && source.tournamentList) || [];
    if (Array.isArray(list)) {
      for (var i = 0; i < list.length; i++) {
        var t = list[i];
        if (t && typeof t === "object") add(t.tournamentCode);
        else add(t);
      }
    }
    var contests = (source && source.contests) || [];
    if (Array.isArray(contests)) {
      for (var ci = 0; ci < contests.length; ci++) {
        var contest = contests[ci];
        if (!contest || typeof contest !== "object") continue;
        if (contest.tournamentCode) add(contest.tournamentCode);
        var ts = contest.tournaments;
        if (!Array.isArray(ts)) continue;
        for (var ti = 0; ti < ts.length; ti++) {
          var tw = ts[ti];
          if (tw && typeof tw === "object") add(tw.tournamentCode);
          else add(tw);
        }
      }
    }
    return out;
  }

  function normalizeNewsFeature(rawFeature, fallbackBusinessBlocks) {
    if (rawFeature == null || rawFeature === "") {
      return JSON.stringify({
        alphaLink: "",
        sigmaLink: "",
        businessBlock: fallbackBusinessBlocks || []
      });
    }
    if (typeof rawFeature === "string") {
      var parsed = safeParseJson(rawFeature);
      if (parsed.ok && parsed.value && typeof parsed.value === "object") {
        return JSON.stringify(parsed.value);
      }
      return JSON.stringify({
        alphaLink: "",
        sigmaLink: "",
        businessBlock: fallbackBusinessBlocks || []
      });
    }
    if (typeof rawFeature === "object") return JSON.stringify(rawFeature);
    return JSON.stringify({
      alphaLink: "",
      sigmaLink: "",
      businessBlock: fallbackBusinessBlocks || []
    });
  }

  function buildCreatePayloadFromSourceItem(item, defaultCreatedBy, batchStartIso, options) {
    var opts = options || {};
    var ignoreLeadersAuthors = !!opts.ignoreLeadersAuthors;
    var source = item || {};
    var type = normalizeType(source.type || source.newsType);
    var leadersSource = source.leadersList || source.leaders || [];
    var authorsSource = source.authorsList || source.authors || [];
    var tagsSource = source.tagList || source.newsTagList || [];
    var businessBlocks =
      source.businessBlocks || parseMaybeJsonArray((source.newsFeatureObj || {}).businessBlock);
    var createdBy =
      String(source.createdBy || "").trim() ||
      String(defaultCreatedBy || "").trim() ||
      (authorsSource[0] && String(authorsSource[0].employeeNumber || "").trim()) ||
      (leadersSource[0] && String(leadersSource[0].employeeNumber || "").trim()) ||
      "";

    var rewardList = extractRewardList(source);
    var tournamentList = extractTournamentList(source);

    var authorsList = ignoreLeadersAuthors ? [] : mapEmployeesList(authorsSource);
    var leadersList = ignoreLeadersAuthors ? [] : mapEmployeesList(leadersSource);

    var payload = {
      bankLevel: source.bankLevel !== false,
      rewardList: rewardList,
      tournamentList: tournamentList,
      newsFeature: normalizeNewsFeature(source.newsFeature, businessBlocks),
      type: type,
      description: ensureString(source.description || source.newsText),
      summary: type === "achievement" ? "" : ensureString(source.summary),
      authorsList: authorsList,
      tagList: toTagList(tagsSource),
      tbCodeList: parseMaybeJsonArray(source.tbCodeList != null ? source.tbCodeList : source.tbCode),
      gosbCodeList: parseMaybeJsonArray(
        source.gosbCodeList != null ? source.gosbCodeList : source.gosbCode
      ),
      leadersList: leadersList,
      createdBy: createdBy,
      // Как в HAR: можно задать plannedDt; иначе — сейчас
      plannedDt: ensureString(source.plannedDt || source.plannedDateTime).trim() || nowIso(),
      status: "draft",
      createDt: batchStartIso || nowIso()
    };

    return payload;
  }

  /**
   * Режим «болванка»: для отправки очищает leaders/authors в копии payload.
   * Счётчики отображения (authorsCount/leadersCount) не меняет.
   * @param {object} payload
   * @param {boolean} enabled
   * @returns {object}
   */
  function payloadForCreateSend(payload, enabled) {
    var out = Object.assign({}, payload || {});
    if (enabled) {
      out.authorsList = [];
      out.leadersList = [];
    }
    return out;
  }

  function compactNewsLabel(meta, maxLen) {
    var max = Number(maxLen);
    if (!Number.isFinite(max) || max < 1) max = 50;
    var summary = ensureString(meta && meta.summary).trim();
    if (summary) return summary.slice(0, max);
    var text = ensureString(meta && (meta.newsText || meta.description)).trim();
    if (text) return text.slice(0, max);
    return "без заголовка";
  }

  /** Уникальные коды из списка объектов/строк по ключу (rewardCode / tournamentCode). */
  function extractUniqueCodes(list, key) {
    if (!Array.isArray(list)) return [];
    var out = [];
    var seen = {};
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      var raw =
        item && typeof item === "object"
          ? String(item[key] != null ? item[key] : "").trim()
          : String(item == null ? "" : item).trim();
      if (!raw || seen[raw]) continue;
      seen[raw] = true;
      out.push(raw);
    }
    return out;
  }

  /**
   * Коды для колонки выбора: по newsType.
   * individualAchievement / achievement → rewardCode;
   * tournamentAchievement → tournamentCode;
   * иначе — reward, иначе tournament; пусто → «—».
   */
  function formatLinkedCodesDisplay(newsType, payload) {
    var p = payload || {};
    var t = String(newsType || p.type || "").trim();
    var lower = t.toLowerCase();
    var rewards = extractUniqueCodes(p.rewardList, "rewardCode");
    var tournaments = extractUniqueCodes(p.tournamentList, "tournamentCode");
    var codes = [];
    if (
      lower === "tournamentachievement" ||
      lower === "tournamentacievement" ||
      lower.indexOf("tournament") >= 0
    ) {
      codes = tournaments;
    } else if (
      lower === "individualachievement" ||
      lower === "achievement" ||
      lower.indexOf("individual") >= 0
    ) {
      codes = rewards;
    } else if (rewards.length) {
      codes = rewards;
    } else {
      codes = tournaments;
    }
    if (!codes.length) return "—";
    return codes.join("\n");
  }

  function buildCreateCandidateView(row, payload) {
    var rawType = ensureString(
      (row && (row.newsType || row.type)) || (payload && payload.type) || ""
    );
    return {
      selected: true,
      sourceNewsId: ensureString((row && (row.newsId || row.objectId)) || ""),
      sourceNewsType: rawType || ensureString(payload && payload.type),
      sourceType: normalizeType(
        (row && (row.newsType || row.type)) || (payload && payload.type)
      ),
      summary: compactNewsLabel(row || payload, 50),
      tagsCount: Array.isArray(payload && payload.tagList) ? payload.tagList.length : 0,
      codesDisplay: formatLinkedCodesDisplay(rawType || (payload && payload.type), payload),
      authorsCount: Array.isArray(payload && payload.authorsList)
        ? payload.authorsList.length
        : 0,
      leadersCount: Array.isArray(payload && payload.leadersList)
        ? payload.leadersList.length
        : 0,
      payload: payload
    };
  }

  /**
   * Добавляет новости из body.timePeriod[].news с дедупликацией по newsId.
   * @param {*} body
   * @param {*[]} rows
   * @param {Record<string, boolean>} seenIds
   */
  function pushNewsFromBody(body, rows, seenIds) {
    if (!body || !Array.isArray(body.timePeriod)) return;
    for (var pi = 0; pi < body.timePeriod.length; pi++) {
      var newsList = Array.isArray(body.timePeriod[pi] && body.timePeriod[pi].news)
        ? body.timePeriod[pi].news
        : [];
      for (var ni = 0; ni < newsList.length; ni++) {
        var item = newsList[ni];
        if (!item || typeof item !== "object") continue;
        var id = ensureString(item.newsId || item.objectId || "").trim();
        if (id) {
          if (seenIds[id]) continue;
          seenIds[id] = true;
        }
        rows.push(item);
      }
    }
  }

  /**
   * Страница выгрузки = полный ответ API ({ body }) или сам body с timePeriod.
   * @param {*} pageOrBody
   * @param {*[]} rows
   * @param {Record<string, boolean>} seenIds
   * @returns {boolean} true, если удалось прочитать timePeriod
   */
  function pushNewsFromPageLike(pageOrBody, rows, seenIds) {
    if (!pageOrBody || typeof pageOrBody !== "object") return false;
    if (pageOrBody.body && Array.isArray(pageOrBody.body.timePeriod)) {
      pushNewsFromBody(pageOrBody.body, rows, seenIds);
      return true;
    }
    if (Array.isArray(pageOrBody.timePeriod)) {
      pushNewsFromBody(pageOrBody, rows, seenIds);
      return true;
    }
    return false;
  }

  /**
   * Собирает новости из экспортного JSON: все pages[], все comboResults, merged.
   * Не ограничиваемся первой страницей.
   * @param {*} source
   * @returns {{ rows: *[], meta: { pagesScanned: number, comboBlocks: number, fromCreateItems: boolean } }}
   */
  function collectNewsRowsFromExportJson(source) {
    var rows = [];
    var seenIds = {};
    var meta = { pagesScanned: 0, comboBlocks: 0, fromCreateItems: false };
    if (!source) return { rows: rows, meta: meta };

    if (Array.isArray(source)) {
      for (var ai = 0; ai < source.length; ai++) {
        if (source[ai] && typeof source[ai] === "object") rows.push(source[ai]);
      }
      return { rows: rows, meta: meta };
    }

    if (Array.isArray(source.createItems)) {
      meta.fromCreateItems = true;
      return { rows: source.createItems.slice(), meta: meta };
    }
    if (Array.isArray(source.statusItems)) {
      return { rows: source.statusItems.slice(), meta: meta };
    }

    if (Array.isArray(source.pages)) {
      for (var pi = 0; pi < source.pages.length; pi++) {
        if (pushNewsFromPageLike(source.pages[pi], rows, seenIds)) meta.pagesScanned++;
      }
    }

    if (Array.isArray(source.comboResults)) {
      for (var ci = 0; ci < source.comboResults.length; ci++) {
        var cr = source.comboResults[ci] || {};
        meta.comboBlocks++;
        if (Array.isArray(cr.pages)) {
          for (var cpi = 0; cpi < cr.pages.length; cpi++) {
            if (pushNewsFromPageLike(cr.pages[cpi], rows, seenIds)) meta.pagesScanned++;
          }
        }
        pushNewsFromPageLike(cr.merged, rows, seenIds);
      }
    }

    if (source.merged) {
      pushNewsFromPageLike(source.merged, rows, seenIds);
    }

    // одиночный ответ API / payload
    if (!rows.length && source.body && Array.isArray(source.body.timePeriod)) {
      pushNewsFromBody(source.body, rows, seenIds);
    }
    if (!rows.length && source.payload) rows = [source.payload];
    if (!rows.length && (source.newsId || source.newsType || source.newsText || source.description)) {
      rows = [source];
    }
    return { rows: rows, meta: meta };
  }

  function extractCreateCandidatesFromAnyJson(inputJson, defaultCreatedBy, batchStartIso, options) {
    var collected = collectNewsRowsFromExportJson(inputJson);
    var rows = collected.rows;
    var candidates = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var payload = buildCreatePayloadFromSourceItem(row, defaultCreatedBy, batchStartIso, options);
      candidates.push(buildCreateCandidateView(row, payload));
    }
    candidates._parseMeta = collected.meta;
    return candidates;
  }

  function validateCreatePayload(payload) {
    if (!payload || typeof payload !== "object") return "payload отсутствует";
    if (!payload.type || NEWS_V2_CFG.NEWS_TYPES.indexOf(payload.type) < 0) {
      return "некорректный type";
    }
    if (!String(payload.createdBy || "").trim()) return "пустой createdBy";
    if (!String(payload.description || "").trim()) return "пустой description (текст новости)";
    if (payload.type === "achievement") {
      if (!Array.isArray(payload.rewardList) || !payload.rewardList.length) {
        return "для achievement нужна хотя бы одна награда (rewardCode)";
      }
      if (!Array.isArray(payload.tournamentList) || !payload.tournamentList.length) {
        return "для achievement нужен хотя бы один турнир (tournamentCode)";
      }
    }
    return "";
  }

  function validateUpdatePayload(payload) {
    if (!payload || typeof payload !== "object") return "payload отсутствует";
    if (!String(payload.newsId || "").trim()) return "пустой newsId";
    return "";
  }

  function normalizeCreateTemplateItem(payload) {
    var p = payload || {};
    return {
      bankLevel: p.bankLevel !== false,
      rewardList: extractUniqueCodes(p.rewardList, "rewardCode").map(function (x) {
        return { rewardCode: x };
      }),
      tournamentList: extractUniqueCodes(p.tournamentList, "tournamentCode").map(function (x) {
        return { tournamentCode: x };
      }),
      newsFeature: normalizeNewsFeature(
        p.newsFeature,
        parseMaybeJsonArray((p.newsFeatureObj || {}).businessBlock)
      ),
      type: normalizeType(p.type),
      description: ensureString(p.description || p.newsText),
      summary: ensureString(p.summary),
      authorsList: mapEmployeesList(p.authorsList || p.authors || []),
      tagList: toTagList(p.tagList || p.newsTagList || []),
      tbCodeList: parseMaybeJsonArray(p.tbCodeList != null ? p.tbCodeList : p.tbCode),
      gosbCodeList: parseMaybeJsonArray(
        p.gosbCodeList != null ? p.gosbCodeList : p.gosbCode
      ),
      leadersList: mapEmployeesList(p.leadersList || p.leaders || []),
      createdBy: ensureString(p.createdBy || NEWS_V2_CFG.DEFAULT_CREATED_BY),
      plannedDt: ensureString(p.plannedDt || p.plannedDateTime || nowIso()),
      status: "draft",
      createDt: ensureString(p.createDt || nowIso())
    };
  }

  function normalizeUpdateTemplateItem(payload) {
    var p = payload || {};
    return {
      bankLevel: p.bankLevel !== false,
      rewardList: extractUniqueCodes(p.rewardList || p.rewards || [], "rewardCode").map(
        function (x) {
          return { rewardCode: x };
        }
      ),
      tournamentList: extractUniqueCodes(p.tournamentList, "tournamentCode").map(function (x) {
        return { tournamentCode: x };
      }),
      imageList: Array.isArray(p.imageList) ? p.imageList.slice() : [],
      newsFeature: normalizeNewsFeature(
        p.newsFeature,
        parseMaybeJsonArray((p.newsFeatureObj || {}).businessBlock)
      ),
      type: normalizeType(p.type || p.newsType),
      description: ensureString(p.description || p.newsText),
      summary: ensureString(p.summary),
      authorsList: mapEmployeesList(p.authorsList || p.authors || []),
      tagList: toTagList(p.tagList || p.newsTagList || []),
      tbCodeList: parseMaybeJsonArray(p.tbCodeList != null ? p.tbCodeList : p.tbCode),
      gosbCodeList: parseMaybeJsonArray(
        p.gosbCodeList != null ? p.gosbCodeList : p.gosbCode
      ),
      leadersList: mapEmployeesList(p.leadersList || p.leaders || []),
      createdBy: ensureString(p.createdBy || NEWS_V2_CFG.DEFAULT_CREATED_BY),
      plannedDt: ensureString(p.plannedDt || p.plannedDateTime || nowIso()),
      newsId: ensureString(p.newsId),
      method: "put",
      status: ensureString(p.newsStatus || p.status || "draft")
    };
  }

  function buildCreateTemplateFromCandidates(candidates, createdObjectIdsByIndex) {
    var items = (candidates || []).map(function (candidate, idx) {
      var item = normalizeCreateTemplateItem(
        candidate && candidate.payload ? candidate.payload : {}
      );
      if (Array.isArray(createdObjectIdsByIndex) && createdObjectIdsByIndex[idx]) {
        item.createdObjectId = ensureString(createdObjectIdsByIndex[idx]);
      }
      return item;
    });
    return {
      info: "Нормализованный шаблон createItems (подготовлено скриптом).",
      createItems: items
    };
  }

  function buildUpdateTemplateFromCandidates(candidates) {
    var items = (candidates || []).map(function (candidate) {
      return normalizeUpdateTemplateItem(
        candidate && candidate.payload ? candidate.payload : {}
      );
    });
    return {
      info: "Нормализованный шаблон updateItems (подготовлено скриптом).",
      updateItems: items
    };
  }

  /**
   * Из полной выгрузки / списка новостей собрать шаблон для create и edit.
   * @param {*} source
   * @param {string} [defaultCreatedBy]
   * @returns {{ info: string, createItems: object[], updateItems: object[], _meta: object }}
   */
  function buildCreateEditTemplateFromExportSource(source, defaultCreatedBy) {
    var batchIso = nowIso();
    var createdBy =
      String(defaultCreatedBy || "").trim() || NEWS_V2_CFG.DEFAULT_CREATED_BY;
    var collected = collectNewsRowsFromExportJson(source);
    var rows = collected.rows;
    var createItems = [];
    var updateItems = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row || typeof row !== "object") continue;
      var createPayload = buildCreatePayloadFromSourceItem(row, createdBy, batchIso, null);
      createItems.push(normalizeCreateTemplateItem(createPayload));
      var updatePayload = buildUpdatePayloadFromNewsItem(row);
      if (!String(updatePayload.createdBy || "").trim()) {
        updatePayload.createdBy = createdBy;
      }
      updateItems.push(normalizeUpdateTemplateItem(updatePayload));
    }
    return {
      info:
        "Нормализованный шаблон из выгрузки: createItems — для вкладки Создание, " +
        "updateItems — для вкладки Редактирование.",
      createItems: createItems,
      updateItems: updateItems,
      _meta: {
        generatedAt: batchIso,
        source: "export",
        itemsCount: createItems.length,
        defaultCreatedBy: createdBy
      }
    };
  }

  function buildStatusCandidatesFromAnyJson(inputJson, defaultStatus) {
    var rows;
    if (inputJson && Array.isArray(inputJson.statusItems)) {
      rows = inputJson.statusItems;
    } else {
      rows = collectNewsRowsFromExportJson(inputJson).rows;
    }

    var target = defaultStatus === "draft" ? "draft" : "published";
    return rows
      .map(function (row) {
        var newsId = ensureString(row.newsId || row.objectId || "").trim();
        if (!newsId) return null;
        return {
          selected: true,
          newsId: newsId,
          currentStatus: ensureString(row.newsStatus || row.status || ""),
          summary: compactNewsLabel(row),
          type: normalizeType(row.newsType || row.type),
          targetStatus: row.status && (row.status === "draft" || row.status === "published")
            ? row.status
            : target
        };
      })
      .filter(Boolean);
  }

  function validateStatusItem(item) {
    if (!item || !String(item.newsId || "").trim()) return "пустой newsId";
    if (item.targetStatus !== "draft" && item.targetStatus !== "published") return "некорректный status";
    return "";
  }

  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(String(reader.result || ""));
      };
      reader.onerror = function () {
        reject(reader.error || new Error("Ошибка чтения файла"));
      };
      reader.readAsText(file, "utf-8");
    });
  }

  async function postJson(url, payload, refererUrl) {
    var headers = {
      Accept: "application/json",
      "Content-Type": "application/json"
    };
    var options = {
      method: "POST",
      credentials: "include",
      headers: headers,
      body: JSON.stringify(payload)
    };
    if (refererUrl) options.referrer = refererUrl;
    var response = await httpFetch(url, options);
    var data = null;
    try {
      data = await response.json();
    } catch (_e) {
      data = null;
    }
    return { ok: response.ok, status: response.status, data: data };
  }

  async function fetchNewsListPage(origin, payload) {
    return postJson(origin + NEWS_V2_CFG.NEWS_PATH, payload, origin + "/community");
  }

  /** Детальная карточка новости (для put / сверки полей). */
  async function fetchNewsDetail(origin, newsId) {
    var id = String(newsId || "").trim();
    return postJson(
      origin + NEWS_V2_CFG.NEWS_DETAIL_PATH,
      { newsId: id },
      origin + "/admin/community/" + id
    );
  }

  /** Удаление новости. */
  async function deleteNewsById(origin, newsId) {
    var id = String(newsId || "").trim();
    return postJson(
      origin + NEWS_V2_CFG.NEWS_DELETE_PATH,
      { newsId: id },
      origin + "/admin/community/" + id
    );
  }

  function downloadJson(filename, data) {
    var text = JSON.stringify(data, null, 2);
    var blob = new Blob([text], { type: "application/json;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
    }, 0);
  }


  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function optionValues(options) {
    return (options || []).map(function (o) {
      return typeof o === "string" ? o : String(o.value || o.tagCode || "");
    }).filter(Boolean);
  }

  function mergeNewsPageInto(acc, pageData) {
    if (!pageData || typeof pageData !== "object") return acc;
    if (!acc) {
      try {
        return JSON.parse(JSON.stringify(pageData));
      } catch (e) {
        return pageData;
      }
    }
    if (!acc.body) acc.body = {};
    if (!pageData.body) return acc;
    var dstPeriods = Array.isArray(acc.body.timePeriod) ? acc.body.timePeriod : [];
    var srcPeriods = Array.isArray(pageData.body.timePeriod) ? pageData.body.timePeriod : [];
    var nameToIdx = {};
    for (var i = 0; i < dstPeriods.length; i++) {
      var nm = dstPeriods[i] && dstPeriods[i].name;
      if (nm != null) nameToIdx[String(nm)] = i;
    }
    for (var j = 0; j < srcPeriods.length; j++) {
      var sp = srcPeriods[j];
      if (!sp) continue;
      var key = sp.name != null ? String(sp.name) : "period_" + j;
      if (nameToIdx[key] !== undefined) {
        var dstItem = dstPeriods[nameToIdx[key]];
        var dstNews = Array.isArray(dstItem.news) ? dstItem.news : [];
        var srcNews = Array.isArray(sp.news) ? sp.news : [];
        dstItem.news = dstNews.concat(srcNews);
      } else {
        try {
          dstPeriods.push(JSON.parse(JSON.stringify(sp)));
        } catch (e2) {
          dstPeriods.push(sp);
        }
        nameToIdx[key] = dstPeriods.length - 1;
      }
    }
    acc.body.timePeriod = dstPeriods;
    acc.body.page = pageData.body.page;
    if (pageData.body.newsCount != null) acc.body.newsCount = pageData.body.newsCount;
    return acc;
  }

  function countNewsInBody(body) {
    if (!body || !Array.isArray(body.timePeriod)) return 0;
    var n = 0;
    for (var i = 0; i < body.timePeriod.length; i++) {
      var news = body.timePeriod[i] && body.timePeriod[i].news;
      if (Array.isArray(news)) n += news.length;
    }
    return n;
  }

  function forEachNewsInBody(body, fn) {
    if (!body || !Array.isArray(body.timePeriod)) return;
    for (var i = 0; i < body.timePeriod.length; i++) {
      var period = body.timePeriod[i];
      var newsList = period && Array.isArray(period.news) ? period.news : [];
      for (var j = 0; j < newsList.length; j++) {
        if (newsList[j] && typeof newsList[j] === "object") fn(newsList[j]);
      }
    }
  }

  /** Метаданные страницы из body ответа /proxy/v1/news (isLast / total / num). */
  function readNewsPageMeta(body) {
    var page = body && body.page && typeof body.page === "object" ? body.page : null;
    var rawIsLast = page ? page.isLast : body && body.isLast;
    var isLast =
      rawIsLast === true ||
      rawIsLast === 1 ||
      String(rawIsLast == null ? "" : rawIsLast).toLowerCase() === "true";
    var totalRaw = page && page.total != null ? Number(page.total) : null;
    var total = Number.isFinite(totalRaw) && totalRaw > 0 ? totalRaw : null;
    var numRaw = page && page.num != null ? Number(page.num) : null;
    var num = Number.isFinite(numRaw) ? numRaw : null;
    return { page: page, isLast: !!isLast, total: total, num: num };
  }

  function escapeCsvField(s) {
    var t = String(s == null ? "" : s);
    var delim = NEWS_V2_CFG.CSV_DELIMITER || ";";
    if (t.indexOf("\r") >= 0 || t.indexOf("\n") >= 0 || t.indexOf('"') >= 0 || t.indexOf(delim) >= 0) {
      return '"' + t.replace(/"/g, '""') + '"';
    }
    return t;
  }

  function formatNewsFieldForCsv(news, key) {
    if (!news || typeof news !== "object") return "";
    var fieldKey = key === "newsItemStatus" ? "newsStatus" : key;
    var v = news[fieldKey];
    if (v == null) return "";
    if (typeof v === "object") {
      try { return JSON.stringify(v); } catch (e) { return String(v); }
    }
    return String(v);
  }

  function buildNewsFlatCsv(flatRows) {
    var keys = NEWS_V2_CFG.CSV_DATA_KEYS || [];
    var headers = ["newsStatus", "businessBlock", "pageNum", "total"].concat(keys);
    var rows = [];
    if (!Array.isArray(flatRows)) return { headers: headers, rows: rows };
    for (var i = 0; i < flatRows.length; i++) {
      var fr = flatRows[i];
      if (!fr || !fr.news) continue;
      var row = [
        String(fr.newsStatus == null ? "" : fr.newsStatus),
        String(fr.businessBlock == null ? "" : fr.businessBlock),
        String(fr.pageNum == null ? "" : fr.pageNum),
        String(fr.total == null ? "" : fr.total)
      ];
      for (var k = 0; k < keys.length; k++) row.push(formatNewsFieldForCsv(fr.news, keys[k]));
      rows.push(row);
    }
    return { headers: headers, rows: rows };
  }

  function csvTableToText(table) {
    var delim = NEWS_V2_CFG.CSV_DELIMITER || ";";
    var lines = [table.headers.map(escapeCsvField).join(delim)];
    for (var i = 0; i < table.rows.length; i++) {
      lines.push(table.rows[i].map(escapeCsvField).join(delim));
    }
    return lines.join("\r\n") + "\r\n";
  }

  function downloadText(filename, text, mimeType) {
    var blob = new Blob([text], { type: mimeType || "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 0);
  }

  function getNewsResponseError(fr, opts) {
    var o = opts || {};
    if (!fr) return "нет ответа";
    if (!fr.ok) return "HTTP " + String(fr.status != null ? fr.status : "?");
    var data = fr.data;
    if (data == null || typeof data !== "object") return "нет/невалидный JSON";
    if (data.success === false) {
      var apiTxt = "";
      if (data.error && typeof data.error === "object") apiTxt = String(data.error.text || data.error.message || "").trim();
      else if (data.error != null) apiTxt = String(data.error).trim();
      return "API success=false" + (apiTxt ? ": " + apiTxt : "");
    }
    // Для list/create body обычно нужен; для patch/put статуса body может отсутствовать.
    if (o.requireBody !== false && data.success === true && data.body == null) {
      return "JSON: success=true, но body отсутствует";
    }
    return null;
  }

  async function fetchNewsPageWithRetry(origin, payload, hooks) {
    var h = hooks || {};
    var logFn = typeof h.log === "function" ? h.log : function () {};
    var onAttempt = typeof h.onAttempt === "function" ? h.onAttempt : null;
    var shouldStop = typeof h.shouldStop === "function" ? h.shouldStop : function () { return false; };
    var maxAttempts = Math.max(1, Number(h.retryMax != null ? h.retryMax : NEWS_V2_CFG.RETRY_MAX) || 2);
    var pauseMs = Math.max(0, Number(h.retryPauseMs != null ? h.retryPauseMs : NEWS_V2_CFG.RETRY_PAUSE_MS) || 2000);
    var lastFr = null;
    var lastErr = null;
    var retriesDone = 0;
    for (var attempt = 1; attempt <= maxAttempts; attempt++) {
      if (shouldStop()) return { ok: false, stopped: true, fr: lastFr, error: lastErr || "стоп", attempts: attempt - 1, retries: retriesDone };
      if (attempt > 1) retriesDone++;
      try {
        lastFr = await fetchNewsListPage(origin, payload);
        lastErr = getNewsResponseError(lastFr);
      } catch (ex) {
        lastFr = { ok: false, status: 0, data: null };
        lastErr = "исключение: " + (ex && ex.message ? ex.message : String(ex));
      }
      if (onAttempt) onAttempt(attempt, maxAttempts, lastErr, { isRetry: attempt > 1 });
      if (!lastErr) return { ok: true, fr: lastFr, error: null, attempts: attempt, retries: retriesDone };
      logFn("  ошибка (попытка " + attempt + "/" + maxAttempts + "): " + lastErr);
      if (attempt < maxAttempts) {
        if (shouldStop()) return { ok: false, stopped: true, fr: lastFr, error: lastErr, attempts: attempt, retries: retriesDone };
        if (pauseMs > 0) await delay(pauseMs);
      }
    }
    return { ok: false, fr: lastFr, error: lastErr, attempts: maxAttempts, retries: retriesDone };
  }

  async function postJsonWithRetry(url, payload, refererUrl, hooks) {
    var h = hooks || {};
    var logFn = typeof h.log === "function" ? h.log : function () {};
    var onAttempt = typeof h.onAttempt === "function" ? h.onAttempt : null;
    var shouldStop = typeof h.shouldStop === "function" ? h.shouldStop : function () { return false; };
    var successCheck = typeof h.successCheck === "function" ? h.successCheck : null;
    // По умолчанию для mutate-запросов body не обязателен (status/edit).
    var requireBody = h.requireBody === true;
    var maxAttempts = Math.max(1, Number(h.retryMax != null ? h.retryMax : NEWS_V2_CFG.RETRY_MAX) || 2);
    var pauseMs = Math.max(0, Number(h.retryPauseMs != null ? h.retryPauseMs : NEWS_V2_CFG.RETRY_PAUSE_MS) || 2000);
    var lastFr = null;
    var lastErr = null;
    var retriesDone = 0;
    for (var attempt = 1; attempt <= maxAttempts; attempt++) {
      if (shouldStop()) {
        return { ok: false, stopped: true, fr: lastFr, error: lastErr || "стоп", attempts: attempt - 1, retries: retriesDone };
      }
      if (attempt > 1) retriesDone++;
      try {
        lastFr = await postJson(url, payload, refererUrl);
        lastErr = getNewsResponseError(lastFr, { requireBody: requireBody });
        if (!lastErr && successCheck) {
          var customErr = successCheck(lastFr);
          if (customErr) lastErr = customErr;
        }
      } catch (ex) {
        lastFr = { ok: false, status: 0, data: null };
        lastErr = "исключение: " + (ex && ex.message ? ex.message : String(ex));
      }
      if (onAttempt) onAttempt(attempt, maxAttempts, lastErr, { isRetry: attempt > 1 });
      if (!lastErr) {
        return { ok: true, fr: lastFr, error: null, attempts: attempt, retries: retriesDone };
      }
      logFn("  ошибка (попытка " + attempt + "/" + maxAttempts + "): " + lastErr);
      if (attempt < maxAttempts) {
        if (shouldStop()) {
          return { ok: false, stopped: true, fr: lastFr, error: lastErr, attempts: attempt, retries: retriesDone };
        }
        if (pauseMs > 0) await delay(pauseMs);
      }
    }
    return { ok: false, fr: lastFr, error: lastErr, attempts: maxAttempts, retries: retriesDone };
  }

  function buildCreateTemplate() {
    var batchIso = nowIso();
    return {
      info:
        "Шаблон по ToDo/NEWS/Создание новостей.txt (HAR newsCreate). " +
        "createItems[] — по одной новости. type: achievement | bestPractice | publication. " +
        "Для achievement обязательны rewardList и tournamentList (даже для «нетурнирной» награды в UI — в API уходит tournamentCode). " +
        "Ответ create: body.objectId — скрипт предложит опубликовать выбранные черновики. " +
        "Вместо createItems можно загрузить файл выгрузки (все pages[]).",
      fieldNotes: {
        type: "achievement | bestPractice | publication",
        description: "текст новости (в выгрузке — newsText)",
        summary: "заголовок; у achievement/publication часто \"\"",
        bankLevel: "bestPractice в HAR: false; achievement: true",
        newsFeature:
          "строка JSON или объект. bestPractice в HAR: только alphaLink/sigmaLink; achievement: + businessBlock",
        rewardList: "[] или [{ rewardCode }] — обязательно непусто для achievement",
        tournamentList: "[] или [{ tournamentCode }] — обязательно непусто для achievement",
        authorsList: "[{ employeeNumber }]",
        leadersList: "[{ employeeNumber }]",
        tagList: "[{ tagValue }]",
        tbCodeList: "пример bestPractice: [\"99\"]",
        gosbCodeList: "пример bestPractice: [\"0\"]",
        createdBy: "табельный или UPPKKSB_TECH",
        plannedDt: "ISO-8601; если нет — подставится now",
        status: "при отправке всегда draft",
        createDt: "ставится пакетом при создании"
      },
      createItems: [
        {
          _example: "HAR: создание лучшей практики",
          type: "bestPractice",
          bankLevel: false,
          rewardList: [],
          tournamentList: [],
          newsFeature: "{\"alphaLink\":\"\",\"sigmaLink\":\"\"}",
          description:
            "### **Компания X внедрила лучшие практики геймификации для ускорения разработки ИИ-решений**\n\nКраткий пример текста bestPractice (полный текст — в ToDo HAR).",
          summary: "Тест создания Лучшей практики для уведомлений",
          authorsList: [{ employeeNumber: "00673892" }],
          tagList: [{ tagValue: "AI" }, { tagValue: "Благотворительность" }],
          tbCodeList: ["99"],
          gosbCodeList: ["0"],
          leadersList: [
            { employeeNumber: "02122594" },
            { employeeNumber: "01340230" },
            { employeeNumber: "01924995" }
          ],
          createdBy: "00673892",
          plannedDt: batchIso,
          status: "draft"
        },
        {
          _example:
            "HAR: достижение с выбором нетурнирной награды — в API всё равно rewardCode + tournamentCode",
          type: "achievement",
          bankLevel: true,
          rewardList: [{ rewardCode: "r_01_2026-1_09-1_1_1" }],
          tournamentList: [{ tournamentCode: "t_01_2026-1_09-1_1_3071" }],
          newsFeature: "{\"businessBlock\":[\"KMKKSB\"],\"alphaLink\":\"\",\"sigmaLink\":\"\"}",
          description:
            "**Новость: Победа в турнире «Лучший герой продаж Геймификации»!**\n\nКраткий пример achievement (полный текст — в ToDo HAR).",
          summary: "",
          authorsList: [],
          tagList: [
            { tagValue: "AI" },
            { tagValue: "Бизнес-миссия" },
            { tagValue: "Sber API" }
          ],
          tbCodeList: [],
          gosbCodeList: [],
          leadersList: [
            { employeeNumber: "01340230" },
            { employeeNumber: "01655289" }
          ],
          createdBy: "UPPKKSB_TECH",
          plannedDt: batchIso,
          status: "draft"
        },
        {
          _example: "publication — из типичной выгрузки (в HAR create нет, формат тот же API)",
          type: "publication",
          bankLevel: true,
          rewardList: [],
          tournamentList: [],
          newsFeature: "{\"alphaLink\":\"\",\"sigmaLink\":\"\",\"businessBlock\":[\"KMKKSB\"]}",
          description: "Текст новости проекта / публикации для community.",
          summary: "",
          authorsList: [],
          tagList: [{ tagValue: "Преференции" }],
          tbCodeList: [],
          gosbCodeList: [],
          leadersList: [
            { employeeNumber: "00125105" },
            { employeeNumber: "00321473" }
          ],
          createdBy: "00673892",
          plannedDt: batchIso,
          status: "draft"
        }
      ],
      _meta: {
        generatedAt: batchIso,
        sourceDoc: "ToDo/NEWS/Создание новостей.txt",
        apiPath: "/bo/rmkib.gamification/proxy/v1/administration/news/newsCreate",
        refererHint: "/admin/community/create",
        responseIdField: "body.objectId"
      }
    };
  }

  function buildStatusTemplate(targetStatus) {
    return {
      info: "Шаблон для смены статуса news.",
      statusItems: [
        {
          newsId: "872397599317105606",
          status: targetStatus === "draft" ? "draft" : "published"
        }
      ]
    };
  }

  function buildEditTemplate() {
    return {
      info: "Каркас для редактирования. Все записи уходят как method=put.",
      updateItems: [
        {
          bankLevel: false,
          rewardList: [],
          tournamentList: [],
          imageList: [],
          newsFeature: "{\"alphaLink\":\"\",\"sigmaLink\":\"\",\"businessBlock\":[\"KMKKSB\"]}",
          type: "bestPractice",
          description: "Обновлённый текст",
          summary: "Обновлённый заголовок",
          authorsList: [{ employeeNumber: "00673892" }],
          tagList: [{ tagValue: "ТЕСТ" }],
          tbCodeList: [],
          gosbCodeList: [],
          leadersList: [{ employeeNumber: "02122594" }],
          createdBy: "00673892",
          plannedDt: nowIso(),
          newsId: "872397599317105606",
          status: "draft"
        }
      ]
    };
  }

  function buildUpdatePayloadFromNewsItem(newsItem) {
    var source = newsItem || {};
    // Как create: rewards / contests[].tournaments (list и news-detail), не только tournamentList.
    return {
      bankLevel: source.bankLevel !== false,
      rewardList: extractRewardList(source),
      tournamentList: extractTournamentList(source),
      imageList: Array.isArray(source.imageList) ? source.imageList.slice() : [],
      newsFeature: normalizeNewsFeature(source.newsFeature, source.businessBlocks || []),
      type: normalizeType(source.type || source.newsType),
      description: ensureString(source.description || source.newsText),
      summary: ensureString(source.summary),
      authorsList: mapEmployeesList(source.authorsList || source.authors || []),
      tagList: toTagList(source.tagList || source.newsTagList || []),
      tbCodeList: parseMaybeJsonArray(source.tbCodeList != null ? source.tbCodeList : source.tbCode),
      gosbCodeList: parseMaybeJsonArray(
        source.gosbCodeList != null ? source.gosbCodeList : source.gosbCode
      ),
      leadersList: mapEmployeesList(source.leadersList || source.leaders || []),
      createdBy: ensureString(source.createdBy || NEWS_V2_CFG.DEFAULT_CREATED_BY),
      plannedDt: ensureString(source.plannedDt || source.plannedDateTime || nowIso()),
      newsId: ensureString(source.newsId || ""),
      method: "put",
      status: ensureString(source.newsStatus || source.status || "draft")
    };
  }

  function startPanel() {
    var prev = document.getElementById(NEWS_V2_CFG.PANEL_ID);
    if (prev) prev.remove();

    var root = document.createElement("div");
    root.id = NEWS_V2_CFG.PANEL_ID;
    root.style.cssText =
      "position:fixed;left:8px;top:8px;width:min(1120px,calc(100vw - 16px));height:92vh;" +
      "z-index:999999;background:#f1f5f9;" +
      "border:1px solid #94a3b8;border-radius:10px;" +
      "box-shadow:0 12px 36px rgba(15,23,42,.16);display:flex;flex-direction:column;overflow:hidden;" +
      "font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;color:#0f172a;color-scheme:light;";

    var title = document.createElement("div");
    title.style.cssText =
      "font-size:14px;font-weight:800;padding:8px 12px 2px;letter-spacing:0.01em;";
    title.textContent = "Новости community v2";
    root.appendChild(title);

    var subtitle = document.createElement("div");
    subtitle.style.cssText =
      "padding:0 12px 6px;color:#64748b;font-size:10px;line-height:1.35;border-bottom:1px solid #e2e8f0;";
    subtitle.textContent =
      "Выгрузка · создание · статусы · редактирование · удаление. Список /v1/news — для выбора; create/update/delete — admin API.";
    root.appendChild(subtitle);

    var envRow = document.createElement("div");
    envRow.style.cssText =
      "display:flex;gap:6px;align-items:center;padding:5px 12px;background:#e2e8f0;border-bottom:1px solid #cbd5e1;font-size:11px;";
    root.appendChild(envRow);

    function mkSelect(values, selected) {
      var sel = document.createElement("select");
      sel.style.cssText =
        "padding:4px 8px;border:1px solid #94a3b8;border-radius:6px;background:#fff;font-size:12px;";
      for (var i = 0; i < values.length; i++) {
        var opt = document.createElement("option");
        opt.value = values[i];
        opt.textContent = values[i];
        if (values[i] === selected) opt.selected = true;
        sel.appendChild(opt);
      }
      return sel;
    }

    var standSel = mkSelect(NEWS_V2_CFG.STANDS, selectedStand);
    var contourSel = mkSelect(NEWS_V2_CFG.CONTOURS, selectedContour);
    var envInfo = document.createElement("div");
    envInfo.style.cssText = "margin-left:auto;font-family:ui-monospace,monospace;color:#334155;font-size:11px;";
    function refreshEnvInfo() {
      envInfo.textContent = "POST " + getEnv().origin;
    }
    standSel.addEventListener("change", function () {
      selectedStand = standSel.value;
      refreshEnvInfo();
    });
    contourSel.addEventListener("change", function () {
      selectedContour = contourSel.value;
      refreshEnvInfo();
    });
    envRow.appendChild(document.createTextNode("Стенд:"));
    envRow.appendChild(standSel);
    envRow.appendChild(document.createTextNode("Контур:"));
    envRow.appendChild(contourSel);
    envRow.appendChild(envInfo);
    refreshEnvInfo();

    // Общие настройки пауз/ретраев + Стоп для всех вкладок
    var sharedTimingBox = document.createElement("div");
    sharedTimingBox.style.cssText =
      "display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;align-items:end;" +
      "padding:5px 12px;border-bottom:1px solid #e2e8f0;background:#fff;";
    root.appendChild(sharedTimingBox);

    function mkSharedNum(labelText, value, title) {
      var lab = document.createElement("label");
      lab.style.cssText = "display:flex;flex-direction:column;gap:1px;font-size:9px;color:#64748b;min-width:0;";
      lab.title = title || labelText;
      var cap = document.createElement("span");
      cap.textContent = labelText;
      var inp = document.createElement("input");
      inp.type = "number";
      inp.min = "0";
      inp.value = String(value);
      inp.style.cssText =
        "width:100%;box-sizing:border-box;padding:3px 5px;font-size:11px;border:1px solid #94a3b8;" +
        "border-radius:4px;background:#fff;color:#0f172a;";
      lab.appendChild(cap);
      lab.appendChild(inp);
      return { lab: lab, inp: inp };
    }

    var sharedPayloadGap = mkSharedNum("Пауза операций, мс", NEWS_V2_CFG.PAYLOAD_GAP_MS, "Пауза между запросами создания/статусов/редактирования и между комбинациями выгрузки");
    var sharedPageGap = mkSharedNum("Пауза страниц, мс", NEWS_V2_CFG.PAGE_GAP_MS, "Пауза между pageNum внутри комбинации выгрузки");
    var sharedPageFrom = mkSharedNum("Стр. с", NEWS_V2_CFG.PAGE_FROM, "Начальный pageNum (выгрузка и загрузка для редактирования). Пример: 10");
    sharedPageFrom.inp.min = "1";
    var sharedPageTo = mkSharedNum("Стр. по", NEWS_V2_CFG.PAGE_TO, "Конечный pageNum включительно. 0 = до последней. Пример: 20 → только страницы 10…20");
    var sharedRetryPause = mkSharedNum("Пауза повтора, мс", NEWS_V2_CFG.RETRY_PAUSE_MS, "Пауза перед повтором при ошибке");
    var sharedRetryMax = mkSharedNum("Попыток", NEWS_V2_CFG.RETRY_MAX, "Число попыток одного запроса");
    sharedRetryMax.inp.min = "1";
    var sharedAbort = mkSharedNum("Стоп после N ошибок подряд", NEWS_V2_CFG.CONSECUTIVE_FAIL_ABORT, "Аварийная остановка после N подряд исчерпанных попыток");
    sharedAbort.inp.min = "1";
    sharedTimingBox.appendChild(sharedPayloadGap.lab);
    sharedTimingBox.appendChild(sharedPageGap.lab);
    sharedTimingBox.appendChild(sharedPageFrom.lab);
    sharedTimingBox.appendChild(sharedPageTo.lab);
    sharedTimingBox.appendChild(sharedRetryPause.lab);
    sharedTimingBox.appendChild(sharedRetryMax.lab);
    sharedTimingBox.appendChild(sharedAbort.lab);

    var sharedOpRow = document.createElement("div");
    sharedOpRow.style.cssText =
      "display:flex;gap:6px;align-items:center;padding:4px 12px;border-bottom:1px solid #e2e8f0;background:#f8fafc;";
    root.appendChild(sharedOpRow);
    var sharedOpStatus = document.createElement("div");
    sharedOpStatus.style.cssText = "font-size:10px;color:#475569;flex:1;";
    sharedOpStatus.textContent = "Операции: ожидание";
    sharedOpRow.appendChild(sharedOpStatus);

    var opBusy = false;
    var stopRequested = false;
    var btnGlobalStop = document.createElement("button");
    btnGlobalStop.type = "button";
    btnGlobalStop.textContent = "⏹ Стоп";
    btnGlobalStop.disabled = true;
    btnGlobalStop.style.cssText =
      "padding:4px 8px;border-radius:5px;border:1px solid #b91c1c;background:#dc2626;color:#fff;" +
      "font-size:11px;font-weight:700;cursor:not-allowed;opacity:0.55;";
    btnGlobalStop.addEventListener("click", function () {
      if (!opBusy) return;
      if (stopRequested) {
        log("Стоп уже запрошен — ждём текущий запрос…");
        return;
      }
      stopRequested = true;
      sharedOpStatus.textContent = "Операции: стоп запрошен…";
      log("Стоп запрошен: после текущего запроса остановим пакет.");
    });
    sharedOpRow.appendChild(btnGlobalStop);

    function readSharedGap(inp, fallback) {
      var n = parseInt(String(inp.value || "").trim(), 10);
      if (!Number.isFinite(n) || n < 0) return fallback;
      if (n > NEWS_V2_CFG.GAP_MAX_MS) return NEWS_V2_CFG.GAP_MAX_MS;
      return n;
    }
    function readSharedRetryMax() {
      var n = parseInt(String(sharedRetryMax.inp.value || "").trim(), 10);
      if (!Number.isFinite(n) || n < 1) return NEWS_V2_CFG.RETRY_MAX || 2;
      if (n > 20) return 20;
      return n;
    }
    function readSharedAbortLimit() {
      var n = parseInt(String(sharedAbort.inp.value || "").trim(), 10);
      if (!Number.isFinite(n) || n < 1) return NEWS_V2_CFG.CONSECUTIVE_FAIL_ABORT || 2;
      if (n > 20) return 20;
      return n;
    }
    function readSharedPageFrom() {
      var n = parseInt(String(sharedPageFrom.inp.value || "").trim(), 10);
      if (!Number.isFinite(n) || n < 1) return Math.max(1, NEWS_V2_CFG.PAGE_FROM || 1);
      return n;
    }
    function readSharedPageTo() {
      var n = parseInt(String(sharedPageTo.inp.value || "").trim(), 10);
      if (!Number.isFinite(n) || n < 0) return Math.max(0, NEWS_V2_CFG.PAGE_TO || 0);
      return n;
    }
    /**
     * Диапазон pageNum: с pageFrom по pageTo (включительно).
     * pageTo=0 → до последней страницы API (isLast / total).
     */
    function resolvePageRange(settings, fallbackCount) {
      var from = Math.max(1, Number(settings && settings.pageFrom) || 1);
      var to = Math.max(0, Number(settings && settings.pageTo) || 0);
      if (to > 0 && to < from) {
        return {
          ok: false,
          error: "Стр. по (" + to + ") меньше Стр. с (" + from + ")",
          pageFrom: from,
          pageTo: to
        };
      }
      var end = to;
      if (end <= 0 && fallbackCount != null) {
        var count = Math.max(1, Number(fallbackCount) || 1);
        end = from + count - 1;
      }
      return { ok: true, pageFrom: from, pageTo: end, pageToRaw: to };
    }
    function getSharedRequestSettings() {
      return {
        opGapMs: readSharedGap(sharedPayloadGap.inp, NEWS_V2_CFG.PAYLOAD_GAP_MS),
        pageGapMs: readSharedGap(sharedPageGap.inp, NEWS_V2_CFG.PAGE_GAP_MS),
        pageFrom: readSharedPageFrom(),
        pageTo: readSharedPageTo(),
        retryPauseMs: readSharedGap(sharedRetryPause.inp, NEWS_V2_CFG.RETRY_PAUSE_MS),
        retryMax: readSharedRetryMax(),
        abortLimit: readSharedAbortLimit()
      };
    }
    function setOpBusy(busy, label) {
      opBusy = !!busy;
      btnGlobalStop.disabled = !busy;
      btnGlobalStop.style.opacity = busy ? "1" : "0.55";
      btnGlobalStop.style.cursor = busy ? "pointer" : "not-allowed";
      if (!busy) stopRequested = false;
      sharedOpStatus.textContent = busy
        ? "Операции: " + (label || "выполняется…")
        : "Операции: ожидание";
    }
    function isStopRequested() {
      return !!stopRequested;
    }

    /**
     * Общая загрузка новостей с POST /v1/news (status × block × page range).
     * Используется статусами / редактированием / удалением.
     */
    async function fetchNewsItemsFromServer(statuses, blocks, settings, localMax, busyLabel) {
      var range = resolvePageRange(settings, localMax);
      if (!range.ok) {
        return {
          ok: false,
          error: range.error,
          items: [],
          retriesTotal: 0,
          stoppedByUser: false,
          abortedByErrors: false
        };
      }
      if (!statuses || !statuses.length || !blocks || !blocks.length) {
        return {
          ok: false,
          error: "Выберите status и business block.",
          items: [],
          retriesTotal: 0,
          stoppedByUser: false,
          abortedByErrors: false
        };
      }
      var env = getEnv();
      var loaded = [];
      var retriesTotal = 0;
      var consecutiveFails = 0;
      var stoppedByUser = false;
      var abortedByErrors = false;
      var pageFrom = range.pageFrom;
      var pageTo = range.pageTo;
      setOpBusy(true, busyLabel || "загрузка списка");
      try {
        log(
          "Загрузка списка /v1/news стр. " +
            pageFrom +
            "…" +
            pageTo +
            (range.pageToRaw > 0 ? "" : " (лимит вкладки: " + localMax + ")")
        );
        for (var si = 0; si < statuses.length; si++) {
          if (isStopRequested()) {
            stoppedByUser = true;
            break;
          }
          for (var bi = 0; bi < blocks.length; bi++) {
            if (isStopRequested()) {
              stoppedByUser = true;
              break;
            }
            var status = statuses[si];
            var block = blocks[bi];
            var pageNum = pageFrom;
            while (pageNum <= pageTo) {
              if (isStopRequested()) {
                stoppedByUser = true;
                break;
              }
              sharedOpStatus.textContent =
                "Операции: список " + status + "/" + block + " стр." + pageNum;
              var payload = { newsStatus: status, businessBlock: block, pageNum: pageNum };
              var retryResult = await fetchNewsPageWithRetry(env.origin, payload, {
                log: log,
                retryMax: settings.retryMax,
                retryPauseMs: settings.retryPauseMs,
                shouldStop: isStopRequested,
                onAttempt: function (_a, _m, _e, meta) {
                  if (meta && meta.isRetry) retriesTotal++;
                }
              });
              if (retryResult.stopped || isStopRequested()) {
                stoppedByUser = true;
                break;
              }
              if (!retryResult.ok) {
                consecutiveFails++;
                log(
                  "Ошибка списка: " +
                    status +
                    "/" +
                    block +
                    " page=" +
                    pageNum +
                    " | " +
                    (retryResult.error || "ошибка")
                );
                if (consecutiveFails >= settings.abortLimit) {
                  abortedByErrors = true;
                  log("АВАРИЯ: " + consecutiveFails + " подряд ошибок — остановка загрузки.");
                  break;
                }
                break;
              }
              consecutiveFails = 0;
              var res = retryResult.fr;
              var periods = Array.isArray(res.data.body.timePeriod) ? res.data.body.timePeriod : [];
              var countOnPage = 0;
              for (var pi = 0; pi < periods.length; pi++) {
                var newsList = Array.isArray(periods[pi].news) ? periods[pi].news : [];
                for (var ni = 0; ni < newsList.length; ni++) {
                  loaded.push(newsList[ni]);
                  countOnPage++;
                }
              }
              var pageMeta = readNewsPageMeta(res.data.body);
              log(
                "Список: " +
                  status +
                  "/" +
                  block +
                  " page=" +
                  pageNum +
                  " новостей=" +
                  countOnPage +
                  " | isLast=" +
                  (pageMeta.isLast ? "true" : "false")
              );
              if (pageMeta.isLast) break;
              if (pageMeta.total != null && pageNum >= pageMeta.total) break;
              pageNum++;
              if (pageNum <= pageTo && settings.pageGapMs > 0) {
                await delay(settings.pageGapMs);
                if (isStopRequested()) {
                  stoppedByUser = true;
                  break;
                }
              }
            }
            if (stoppedByUser || abortedByErrors) break;
            if (settings.opGapMs > 0 && !(si === statuses.length - 1 && bi === blocks.length - 1)) {
              await delay(settings.opGapMs);
              if (isStopRequested()) {
                stoppedByUser = true;
                break;
              }
            }
          }
          if (stoppedByUser || abortedByErrors) break;
        }
      } finally {
        setOpBusy(false);
      }
      return {
        ok: true,
        items: loaded.filter(function (n) {
          return String((n && n.newsId) || "").trim();
        }),
        retriesTotal: retriesTotal,
        stoppedByUser: stoppedByUser,
        abortedByErrors: abortedByErrors
      };
    }

    function mkInlineMultiChecks(label, values, defaultValue) {
      var row = document.createElement("div");
      row.style.cssText = "margin-bottom:4px;";
      var cap = document.createElement("div");
      cap.textContent = label;
      cap.style.cssText = "font-size:10px;color:#64748b;margin-bottom:2px;font-weight:600;";
      row.appendChild(cap);
      var checks = [];
      for (var i = 0; i < values.length; i++) {
        var lb = document.createElement("label");
        lb.style.cssText =
          "display:inline-flex;align-items:center;gap:3px;margin-right:8px;font-size:11px;color:#0f172a;";
        var c = document.createElement("input");
        c.type = "checkbox";
        c.value = values[i];
        c.checked = defaultValue === values[i];
        checks.push(c);
        lb.appendChild(c);
        lb.appendChild(document.createTextNode(values[i]));
        row.appendChild(lb);
      }
      return {
        el: row,
        getSelected: function () {
          return checks.filter(function (x) {
            return x.checked;
          }).map(function (x) {
            return x.value;
          });
        }
      };
    }

    var main = document.createElement("div");
    main.style.cssText =
      "flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;width:100%;";
    root.appendChild(main);

    // Вкладки — компактная строка сверху на всю ширину
    var tabBar = document.createElement("div");
    tabBar.style.cssText =
      "display:flex;flex-wrap:wrap;align-items:center;gap:3px;padding:4px 8px;" +
      "border-bottom:1px solid #cbd5e1;background:#e2e8f0;flex-shrink:0;width:100%;box-sizing:border-box;";
    main.appendChild(tabBar);

    var work = document.createElement("div");
    work.style.cssText =
      "flex:1;min-height:0;min-width:0;display:flex;flex-direction:column;overflow:hidden;width:100%;background:#f8fafc;";
    main.appendChild(work);

    var content = document.createElement("div");
    content.style.cssText =
      "flex:1;min-height:0;min-width:0;overflow:auto;padding:8px 10px;width:100%;box-sizing:border-box;";
    work.appendChild(content);

    var logWrap = document.createElement("div");
    logWrap.style.cssText =
      "height:130px;border-top:1px solid #e2e8f0;border-bottom:1px solid #cbd5e1;background:#fff;padding:5px 12px;" +
      "display:flex;flex-direction:column;width:100%;box-sizing:border-box;flex-shrink:0;";
    // Журнал + Trace ближе к общим параметрам (без пустого разрыва).
    root.insertBefore(logWrap, main);
    var logTitle = document.createElement("div");
    logTitle.textContent = "Журнал";
    logTitle.style.cssText = "font-size:10px;font-weight:700;color:#475569;margin-bottom:3px;";
    logWrap.appendChild(logTitle);
    var logEl = document.createElement("div");
    logEl.style.cssText =
      "flex:1;overflow:auto;border:1px solid #cbd5e1;border-radius:5px;background:#f8fafc;padding:4px 6px;" +
      "font-family:ui-monospace,monospace;font-size:10px;line-height:1.35;";
    logWrap.appendChild(logEl);

    // Один общий Trace на всю панель (все вкладки → один буфер / один .log)
    devTrace.mountToggleRow(logWrap, logTitle);

    function log(msg) {
      var line = document.createElement("div");
      line.style.cssText = "margin-bottom:3px;line-height:1.35;";
      line.textContent = nowIso() + "  " + msg;
      logEl.appendChild(line);
      while (logEl.childElementCount > NEWS_V2_CFG.LOG_MAX_LINES) {
        logEl.removeChild(logEl.firstElementChild);
      }
      logEl.scrollTop = logEl.scrollHeight;
      try {
        devTrace.log(String(msg));
      } catch (_e) {
        /* ignore */
      }
    }

    function mkBtn(text, onClick, extraCss) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      b.style.cssText =
        "padding:4px 8px;border-radius:5px;border:1px solid #94a3b8;background:#fff;color:#0f172a;" +
        "cursor:pointer;font-size:11px;font-weight:600;line-height:1.2;" +
        (extraCss || "");
      b.addEventListener("click", onClick);
      return b;
    }

    /** Цветная кнопка с поддержкой disabled (динамической активности). */
    function mkToneBtn(text, onClick, tone) {
      var tones = {
        primary: "background:#16a34a;color:#fff;border-color:#15803d;",
        file: "background:#2563eb;color:#fff;border-color:#1d4ed8;",
        parse: "background:#4f46e5;color:#fff;border-color:#4338ca;",
        template: "background:#0f766e;color:#fff;border-color:#0f766e;",
        select: "background:#0284c7;color:#fff;border-color:#0369a1;",
        deselect: "background:#64748b;color:#fff;border-color:#475569;",
        warn: "background:#ea580c;color:#fff;border-color:#c2410c;",
        muted: "background:#f8fafc;color:#334155;border-color:#cbd5e1;"
      };
      var base =
        "padding:5px 9px;border-radius:6px;border:1px solid;cursor:pointer;" +
        "font-size:11px;font-weight:700;line-height:1.2;transition:opacity .12s ease;";
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      b.setAttribute("data-tone", tone || "muted");
      b.style.cssText = base + (tones[tone] || tones.muted);
      b.addEventListener("click", function (ev) {
        if (b.disabled) return;
        onClick(ev);
      });
      b._setActive = function (active, titleWhenOff) {
        var on = !!active;
        b.disabled = !on;
        b.style.opacity = on ? "1" : "0.45";
        b.style.cursor = on ? "pointer" : "not-allowed";
        if (!on && titleWhenOff) b.title = titleWhenOff;
        else if (on) b.removeAttribute("title");
      };
      return b;
    }

    function mkActionRow(labelText) {
      var row = document.createElement("div");
      row.style.cssText = "display:flex;flex-wrap:wrap;gap:5px;align-items:center;";
      if (labelText) {
        var lab = document.createElement("span");
        lab.textContent = labelText;
        lab.style.cssText =
          "font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;" +
          "letter-spacing:0.04em;margin-right:3px;min-width:58px;";
        row.appendChild(lab);
      }
      return row;
    }

    function mkHint(text, tone) {
      var el = document.createElement("div");
      var bg = "#f8fafc";
      var bd = "#e2e8f0";
      var fg = "#64748b";
      if (tone === "warn") {
        bg = "#fffbeb";
        bd = "#fde68a";
        fg = "#92400e";
      } else if (tone === "danger") {
        bg = "#fef2f2";
        bd = "#fecaca";
        fg = "#991b1b";
      } else if (tone === "info") {
        bg = "#eff6ff";
        bd = "#bfdbfe";
        fg = "#1e40af";
      }
      el.style.cssText =
        "padding:5px 7px;border:1px solid " +
        bd +
        ";border-radius:5px;background:" +
        bg +
        ";font-size:10px;line-height:1.35;color:" +
        fg +
        ";";
      el.textContent = text;
      return el;
    }

    function mkSectionCard(titleText) {
      var box = document.createElement("div");
      box.style.cssText =
        "padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;";
      if (titleText) {
        var t = document.createElement("div");
        t.textContent = titleText;
        t.style.cssText = "font-size:11px;font-weight:700;color:#334155;margin-bottom:5px;";
        box.appendChild(t);
      }
      return box;
    }

    function clearContent() {
      content.innerHTML = "";
    }

    function renderCandidatesTable(candidates, type, opts) {
      var options = opts || {};
      var onSelectionChange =
        typeof options.onSelectionChange === "function" ? options.onSelectionChange : function () {};
      var isCreateLike = type === "create" || type === "edit";
      var box = document.createElement("div");
      box.style.cssText = "border:1px solid #cbd5e1;border-radius:8px;overflow:hidden;background:#fff;";
      var head = document.createElement("div");
      var gridCols = isCreateLike
        ? "26px 118px minmax(70px,0.9fr) 40px minmax(110px,1.1fr) 40px 40px 120px"
        : "26px 120px 1fr 90px 90px 170px";
      head.style.cssText =
        "display:grid;grid-template-columns:" +
        gridCols +
        ";gap:6px;padding:6px 8px;font-size:11px;font-weight:700;background:#f1f5f9;border-bottom:1px solid #e2e8f0;";
      var headers = isCreateLike
        ? ["✓", "NewsType", "Заголовок", "Теги", "Коды", "Авт.", "Лид.", "ID"]
        : ["✓", "Тип", "Заголовок", "Авторов", "Лидеров", "ID новости"];
      headers.forEach(function (h) {
        var c = document.createElement("div");
        c.textContent = h;
        head.appendChild(c);
      });
      box.appendChild(head);

      for (var i = 0; i < candidates.length; i++) {
        (function () {
          var item = candidates[i];
          var row = document.createElement("div");
          row.style.cssText =
            "display:grid;grid-template-columns:" +
            gridCols +
            ";gap:6px;padding:6px 8px;font-size:11px;border-bottom:1px solid #f1f5f9;align-items:start;";
          var ch = document.createElement("input");
          ch.type = "checkbox";
          ch.checked = item.selected !== false;
          ch.addEventListener("change", function () {
            item.selected = ch.checked;
            onSelectionChange();
          });
          var cc = document.createElement("div");
          cc.appendChild(ch);
          row.appendChild(cc);
          function addCell(text, multiline) {
            var cell = document.createElement("div");
            cell.style.cssText = multiline
              ? "white-space:pre-line;word-break:break-word;line-height:1.35;"
              : "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
            cell.textContent = ensureString(text);
            row.appendChild(cell);
          }
          if (isCreateLike) {
            var payload = item.payload || {};
            var newsType =
              item.sourceNewsType ||
              item.sourceType ||
              item.type ||
              payload.type ||
              "";
            var tagsCount =
              item.tagsCount != null
                ? item.tagsCount
                : Array.isArray(payload.tagList)
                  ? payload.tagList.length
                  : 0;
            var codesText =
              item.codesDisplay || formatLinkedCodesDisplay(newsType, payload);
            var title = compactNewsLabel(
              { summary: item.summary, newsText: payload.description || payload.newsText },
              50
            );
            addCell(newsType);
            addCell(title);
            addCell(String(tagsCount));
            addCell(codesText, true);
            addCell(item.authorsCount != null ? item.authorsCount : "");
            addCell(item.leadersCount != null ? item.leadersCount : "");
            addCell(item.sourceNewsId || item.newsId || "");
          } else {
            addCell(item.sourceType || item.type || "");
            addCell(item.summary || "");
            addCell(item.authorsCount != null ? item.authorsCount : "");
            addCell(item.leadersCount != null ? item.leadersCount : "");
            addCell(item.sourceNewsId || item.newsId || "");
          }
          box.appendChild(row);
        })();
      }

      if (type === "status") {
        head.children[3].textContent = "Текущий";
        head.children[4].textContent = "Целевой";
        for (var ri = 1; ri < box.childElementCount; ri++) {
          var rowNode = box.childNodes[ri];
          if (!rowNode || !rowNode.children || rowNode.children.length < 6) continue;
          rowNode.children[3].textContent = candidates[ri - 1].currentStatus || "";
          rowNode.children[4].textContent = candidates[ri - 1].targetStatus || "";
        }
      }

      return box;
    }

    function renderCreateTab() {
      clearContent();
      var wrap = document.createElement("div");
      wrap.style.cssText = "display:flex;flex-direction:column;gap:10px;";
      content.appendChild(wrap);

      var top = document.createElement("div");
      top.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;align-items:center;";
      wrap.appendChild(top);

      var createdByInput = document.createElement("input");
      createdByInput.type = "text";
      createdByInput.placeholder = "createdBy по умолчанию";
      createdByInput.value = NEWS_V2_CFG.DEFAULT_CREATED_BY;
      createdByInput.style.cssText = "padding:6px 8px;border:1px solid #94a3b8;border-radius:6px;width:220px;";
      top.appendChild(createdByInput);

      var stubModeLabel = document.createElement("label");
      stubModeLabel.style.cssText =
        "display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:5px 8px;" +
        "border:1px solid #cbd5e1;border-radius:6px;background:#fff;cursor:pointer;";
      stubModeLabel.title =
        "При отправке leadersList и authorsList будут пустыми; данные и счётчики в форме/таблице не меняются";
      var stubModeCb = document.createElement("input");
      stubModeCb.type = "checkbox";
      stubModeCb.checked = false;
      stubModeLabel.appendChild(stubModeCb);
      stubModeLabel.appendChild(document.createTextNode("Болванка: без leaders и authors"));
      top.appendChild(stubModeLabel);

      var modeRow = document.createElement("div");
      modeRow.style.cssText =
        "display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;padding:8px 10px;" +
        "border:1px solid #cbd5e1;border-radius:8px;background:#fff;";
      wrap.appendChild(modeRow);
      var modeHint = document.createElement("div");
      modeHint.style.cssText = "font-size:10px;color:#64748b;width:100%;line-height:1.35;";
      modeHint.textContent =
        "Одна новость — форма или файл. Несколько — только файл JSON. Create → draft + objectId; публикация — patch.";
      modeRow.appendChild(modeHint);

      function mkModeRadio(id, value, labelText, checked) {
        var lab = document.createElement("label");
        lab.setAttribute("for", id);
        lab.style.cssText =
          "display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;cursor:pointer;color:#0f172a;";
        var r = document.createElement("input");
        r.type = "radio";
        r.name = "newsV2CreateSourceMode";
        r.id = id;
        r.value = value;
        r.checked = !!checked;
        lab.appendChild(r);
        lab.appendChild(document.createTextNode(labelText));
        return { lab: lab, inp: r };
      }
      var modeForm = mkModeRadio("newsV2CreateModeForm", "form", "Форма (одна новость)", true);
      var modeFile = mkModeRadio("newsV2CreateModeFile", "file", "Файл JSON (несколько)", false);
      modeRow.appendChild(modeForm.lab);
      modeRow.appendChild(modeFile.lab);

      function getCreateMode() {
        return modeFile.inp.checked ? "file" : "form";
      }

      function mkLabeled(labelText, node, hint) {
        var box = document.createElement("div");
        box.style.cssText = "display:flex;flex-direction:column;gap:4px;min-width:0;";
        var lab = document.createElement("label");
        lab.style.cssText = "font-size:11px;font-weight:700;color:#475569;";
        lab.textContent = labelText;
        if (hint) lab.title = hint;
        box.appendChild(lab);
        box.appendChild(node);
        return box;
      }

      function styleInput(el) {
        el.style.cssText =
          "width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #94a3b8;" +
          "border-radius:6px;font-size:12px;background:#fff;color:#0f172a;";
        return el;
      }

      function styleTextarea(el, rows) {
        el.rows = rows || 3;
        el.style.cssText =
          "width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #94a3b8;" +
          "border-radius:6px;font-size:12px;background:#fff;color:#0f172a;resize:vertical;" +
          "font-family:ui-sans-serif,system-ui,sans-serif;";
        return el;
      }

      // --- Форма одной новости ---
      var formBox = document.createElement("div");
      formBox.style.cssText =
        "display:flex;flex-direction:column;gap:10px;padding:10px;border:1px solid #bbf7d0;" +
        "border-radius:10px;background:rgba(240,253,244,.7);";
      wrap.appendChild(formBox);

      var formGrid = document.createElement("div");
      formGrid.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:10px;";
      formBox.appendChild(formGrid);

      var typeSel = document.createElement("select");
      styleInput(typeSel);
      for (var ti = 0; ti < NEWS_V2_CFG.NEWS_TYPES.length; ti++) {
        var tVal = NEWS_V2_CFG.NEWS_TYPES[ti];
        var tOpt = document.createElement("option");
        tOpt.value = tVal;
        tOpt.textContent =
          (NEWS_V2_CFG.NEWS_TYPE_LABELS && NEWS_V2_CFG.NEWS_TYPE_LABELS[tVal]) || tVal;
        if (tVal === NEWS_V2_CFG.DEFAULT_NEWS_TYPE) tOpt.selected = true;
        typeSel.appendChild(tOpt);
      }
      formGrid.appendChild(
        mkLabeled(
          "Тип (type) для create",
          typeSel,
          "В выгрузке бывают individualAchievement / tournamentAchievement — при создании уходят как achievement"
        )
      );

      var summaryInp = document.createElement("input");
      summaryInp.type = "text";
      summaryInp.placeholder = "Заголовок; у bestPractice обычно есть, у achievement/publication часто пусто";
      styleInput(summaryInp);
      formGrid.appendChild(mkLabeled("Заголовок (summary)", summaryInp));

      var descTa = document.createElement("textarea");
      descTa.placeholder = "Текст новости — в выгрузке поле newsText → в create: description";
      styleTextarea(descTa, 5);
      var descWrap = mkLabeled("Текст (description ← newsText)", descTa);
      descWrap.style.gridColumn = "1 / -1";
      formGrid.appendChild(descWrap);

      var bankLevelLab = document.createElement("label");
      bankLevelLab.style.cssText =
        "display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:6px 8px;" +
        "border:1px solid #cbd5e1;border-radius:6px;background:#fff;cursor:pointer;";
      var bankLevelCb = document.createElement("input");
      bankLevelCb.type = "checkbox";
      bankLevelCb.checked = true;
      bankLevelLab.appendChild(bankLevelCb);
      bankLevelLab.appendChild(document.createTextNode("bankLevel (в выгрузке чаще true)"));
      formGrid.appendChild(mkLabeled("Флаги", bankLevelLab));

      var formCreatedBy = document.createElement("input");
      formCreatedBy.type = "text";
      formCreatedBy.placeholder = "если пусто — из поля сверху";
      formCreatedBy.value = NEWS_V2_CFG.DEFAULT_CREATED_BY;
      styleInput(formCreatedBy);
      formGrid.appendChild(mkLabeled("createdBy (этой новости)", formCreatedBy));

      var alphaLinkInp = document.createElement("input");
      alphaLinkInp.type = "text";
      alphaLinkInp.placeholder = "alphaLink (из newsFeature)";
      styleInput(alphaLinkInp);
      formGrid.appendChild(mkLabeled("Ссылка ALPHA", alphaLinkInp));

      var sigmaLinkInp = document.createElement("input");
      sigmaLinkInp.type = "text";
      sigmaLinkInp.placeholder = "sigmaLink (из newsFeature)";
      styleInput(sigmaLinkInp);
      formGrid.appendChild(mkLabeled("Ссылка SIGMA", sigmaLinkInp));

      var blocksBox = document.createElement("div");
      blocksBox.style.cssText = "display:flex;flex-wrap:wrap;gap:6px 10px;";
      /** @type {Record<string, HTMLInputElement>} */
      var blockChecks = {};
      for (var bi = 0; bi < NEWS_V2_CFG.BUSINESS_BLOCK_OPTIONS.length; bi++) {
        var bo = NEWS_V2_CFG.BUSINESS_BLOCK_OPTIONS[bi];
        var bl = document.createElement("label");
        bl.style.cssText = "display:inline-flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;";
        var bc = document.createElement("input");
        bc.type = "checkbox";
        bc.checked = !!bo.defaultChecked;
        blockChecks[bo.value] = bc;
        bl.appendChild(bc);
        bl.appendChild(document.createTextNode(bo.label || bo.value));
        blocksBox.appendChild(bl);
      }
      var blocksWrap = mkLabeled(
        "Бизнес-блоки (businessBlocks / newsFeature.businessBlock)",
        blocksBox,
        "В выгрузках чаще KMKKSB; в create уходит в newsFeature.businessBlock"
      );
      blocksWrap.style.gridColumn = "1 / -1";
      formGrid.appendChild(blocksWrap);

      var customTagsTa = document.createElement("textarea");
      customTagsTa.placeholder =
        "Основные теги из выгрузки — TEXT: ДРИМФ, Гарантии, Лизинг, ВЭД…\nПо одному в строке или через ;";
      styleTextarea(customTagsTa, 3);
      var customTagsWrap = mkLabeled(
        "Теги TEXT (newsTagList.tagValue)",
        customTagsTa,
        "В реальных данных почти все теги tagType=TEXT (не NEWS_TYPE)"
      );
      customTagsWrap.style.gridColumn = "1 / -1";
      formGrid.appendChild(customTagsWrap);

      var tagsBox = document.createElement("div");
      tagsBox.style.cssText = "display:flex;flex-wrap:wrap;gap:6px 10px;";
      /** @type {HTMLInputElement[]} */
      var tagChecks = [];
      for (var tgi = 0; tgi < NEWS_V2_CFG.TAG_OPTIONS.length; tgi++) {
        var tg = NEWS_V2_CFG.TAG_OPTIONS[tgi];
        var tgl = document.createElement("label");
        tgl.style.cssText = "display:inline-flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;";
        var tgc = document.createElement("input");
        tgc.type = "checkbox";
        tgc.checked = !!tg.defaultChecked;
        tgc.setAttribute("data-tag-value", tg.tagCode || tg.label || "");
        tagChecks.push(tgc);
        tgl.appendChild(tgc);
        tgl.appendChild(document.createTextNode(tg.label || tg.tagCode));
        tagsBox.appendChild(tgl);
      }
      var tagsWrap = mkLabeled("Доп. теги NEWS_TYPE (редко в выгрузке)", tagsBox);
      tagsWrap.style.gridColumn = "1 / -1";
      formGrid.appendChild(tagsWrap);

      var rewardsTa = document.createElement("textarea");
      rewardsTa.placeholder =
        "Обязательно для achievement: rewardCode из rewards[].rewardCode\nпример: r_01_2026-1_16-2_1";
      styleTextarea(rewardsTa, 2);
      formGrid.appendChild(
        mkLabeled("Награды * (rewardList ← rewards)", rewardsTa, "Для type=achievement обязательно")
      );

      var tournamentsTa = document.createElement("textarea");
      tournamentsTa.placeholder =
        "Обязательно для achievement: tournamentCode из contests[].tournaments[]\nпример: t_01_2026-1_16-2_1_2032";
      styleTextarea(tournamentsTa, 2);
      formGrid.appendChild(
        mkLabeled(
          "Турниры * (tournamentList ← contests)",
          tournamentsTa,
          "Для type=achievement обязательно; в выгрузке — contests[].tournaments[].tournamentCode"
        )
      );

      var authorsTa = document.createElement("textarea");
      authorsTa.placeholder = "Табельные authors[].employeeNumber (у bestPractice часто 1)";
      styleTextarea(authorsTa, 2);
      var authorsWrap = mkLabeled("Авторы (authorsList ← authors)", authorsTa);
      formGrid.appendChild(authorsWrap);

      var leadersTa = document.createElement("textarea");
      leadersTa.placeholder = "Табельные leaders[].employeeNumber (в create достаточно номера)";
      styleTextarea(leadersTa, 2);
      var leadersWrap = mkLabeled("Лидеры (leadersList ← leaders)", leadersTa);
      formGrid.appendChild(leadersWrap);

      var tbInp = document.createElement("input");
      tbInp.type = "text";
      tbInp.placeholder = "в выгрузке часто \"[]\" — можно пусто";
      styleInput(tbInp);
      formGrid.appendChild(mkLabeled("tbCodeList ← tbCode", tbInp, "Коды ТБ через ; или запятую"));

      var gosbInp = document.createElement("input");
      gosbInp.type = "text";
      gosbInp.placeholder = "в выгрузке часто \"[]\" — можно пусто";
      styleInput(gosbInp);
      formGrid.appendChild(mkLabeled("gosbCodeList ← gosbCode", gosbInp));

      var formActions = document.createElement("div");
      formActions.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;";
      formBox.appendChild(formActions);

      function syncStubFieldsVisibility() {
        var off = !!stubModeCb.checked;
        authorsWrap.style.opacity = off ? "0.65" : "1";
        leadersWrap.style.opacity = off ? "0.65" : "1";
        authorsWrap.title = off ? "Значения сохранятся, но при create будут отправлены []" : "";
        leadersWrap.title = off ? "Значения сохранятся, но при create будут отправлены []" : "";
      }
      syncStubFieldsVisibility();

      function splitCodes(text) {
        return String(text || "")
          .split(/[\n;,]+/)
          .map(function (s) {
            return s.replace(/^\s+|\s+$/g, "");
          })
          .filter(Boolean);
      }

      function readFormSourceItem() {
        var blocks = [];
        Object.keys(blockChecks).forEach(function (k) {
          if (blockChecks[k].checked) blocks.push(k);
        });
        var tags = [];
        for (var i = 0; i < tagChecks.length; i++) {
          if (tagChecks[i].checked) {
            var tv = tagChecks[i].getAttribute("data-tag-value") || "";
            if (tv) tags.push(tv);
          }
        }
        splitCodes(customTagsTa.value).forEach(function (t) {
          tags.push(t);
        });
        var createdByForm = String(formCreatedBy.value || "").trim();
        var createdByTop = String(createdByInput.value || "").trim();
        return {
          type: typeSel.value,
          summary: summaryInp.value,
          description: descTa.value,
          bankLevel: !!bankLevelCb.checked,
          businessBlocks: blocks,
          newsFeature: {
            alphaLink: String(alphaLinkInp.value || "").trim(),
            sigmaLink: String(sigmaLinkInp.value || "").trim(),
            businessBlock: blocks
          },
          tagList: tags,
          rewardList: splitCodes(rewardsTa.value).map(function (c) {
            return { rewardCode: c };
          }),
          tournamentList: splitCodes(tournamentsTa.value).map(function (c) {
            return { tournamentCode: c };
          }),
          authorsList: splitCodes(authorsTa.value).map(function (n) {
            return { employeeNumber: n };
          }),
          leadersList: splitCodes(leadersTa.value).map(function (n) {
            return { employeeNumber: n };
          }),
          tbCodeList: splitCodes(tbInp.value),
          gosbCodeList: splitCodes(gosbInp.value),
          createdBy: createdByForm || createdByTop || NEWS_V2_CFG.DEFAULT_CREATED_BY
        };
      }

      function clearFormFields() {
        typeSel.value = NEWS_V2_CFG.DEFAULT_NEWS_TYPE;
        summaryInp.value = "";
        descTa.value = "";
        bankLevelCb.checked = true;
        formCreatedBy.value = String(createdByInput.value || "").trim() || NEWS_V2_CFG.DEFAULT_CREATED_BY;
        alphaLinkInp.value = "";
        sigmaLinkInp.value = "";
        Object.keys(blockChecks).forEach(function (k) {
          var def = NEWS_V2_CFG.BUSINESS_BLOCK_OPTIONS.filter(function (o) {
            return o.value === k;
          })[0];
          blockChecks[k].checked = !!(def && def.defaultChecked);
        });
        for (var i = 0; i < tagChecks.length; i++) {
          var opt = NEWS_V2_CFG.TAG_OPTIONS[i];
          tagChecks[i].checked = !!(opt && opt.defaultChecked);
        }
        customTagsTa.value = "";
        rewardsTa.value = "";
        tournamentsTa.value = "";
        authorsTa.value = "";
        leadersTa.value = "";
        tbInp.value = "";
        gosbInp.value = "";
      }

      // --- Файл / JSON ---
      var fileBox = document.createElement("div");
      fileBox.style.cssText =
        "display:none;flex-direction:column;gap:8px;padding:10px;border:1px solid #bfdbfe;" +
        "border-radius:10px;background:rgba(239,246,255,.75);";
      wrap.appendChild(fileBox);

      var fileTop = document.createElement("div");
      fileTop.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;align-items:center;";
      fileBox.appendChild(fileTop);
      var fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".json,application/json";
      fileInput.style.display = "none";
      fileTop.appendChild(fileInput);
      fileTop.appendChild(
        mkToneBtn("Выбрать файл JSON", function () {
          fileInput.click();
        }, "file")
      );
      fileTop.appendChild(
        mkToneBtn("Шаблон JSON", function () {
          downloadJson("news_create_template_" + tsShort() + ".json", buildCreateTemplate());
          log("Скачан шаблон создания.");
        }, "template")
      );

      var manualInput = document.createElement("textarea");
      manualInput.placeholder =
        "Несколько новостей: вставьте JSON (createItems / выгрузка) или загрузите файл выше";
      manualInput.rows = 6;
      manualInput.style.cssText =
        "width:100%;padding:8px;border:1px solid #94a3b8;border-radius:6px;font-family:ui-monospace,monospace;font-size:12px;";
      fileBox.appendChild(manualInput);

      var actions = document.createElement("div");
      actions.style.cssText =
        "display:flex;flex-direction:column;gap:6px;padding:7px;" +
        "border:1px solid #e2e8f0;border-radius:7px;background:rgba(255,255,255,.72);";
      wrap.appendChild(actions);
      var rowLoad = mkActionRow("JSON");
      var rowSelect = mkActionRow("Выбор");
      var rowRun = mkActionRow("Запуск");
      actions.appendChild(rowLoad);
      actions.appendChild(rowSelect);
      actions.appendChild(rowRun);

      var tableHost = document.createElement("div");
      wrap.appendChild(tableHost);

      var candidates = [];
      var lastNormalizedCreateTemplate = null;
      var searchInput = document.createElement("input");
      searchInput.type = "text";
      searchInput.placeholder = "Поиск по типу / заголовку / ID";
      searchInput.style.cssText =
        "width:100%;padding:8px;border:1px solid #94a3b8;border-radius:6px;font-size:12px;";
      wrap.appendChild(searchInput);
      var selectionInfo = document.createElement("div");
      selectionInfo.style.cssText = "font-size:11px;color:#475569;";
      wrap.appendChild(selectionInfo);

      var publishBox = document.createElement("div");
      publishBox.style.cssText =
        "display:none;flex-direction:column;gap:8px;padding:10px;border:1px solid #86efac;" +
        "border-radius:8px;background:#f0fdf4;";
      wrap.appendChild(publishBox);

      /** @type {{ newsId: string, type: string, summary: string, selected: boolean }[]} */
      var createdDrafts = [];

      function clearPublishBox() {
        createdDrafts = [];
        publishBox.style.display = "none";
        publishBox.innerHTML = "";
      }

      function renderPublishBox() {
        publishBox.innerHTML = "";
        if (!createdDrafts.length) {
          publishBox.style.display = "none";
          return;
        }
        publishBox.style.display = "flex";
        var title = document.createElement("div");
        title.style.cssText = "font-size:12px;font-weight:700;color:#166534;";
        title.textContent =
          "Созданы черновики (" +
          createdDrafts.length +
          "). Отметьте и опубликуйте (status → published):";
        publishBox.appendChild(title);

        var list = document.createElement("div");
        list.style.cssText =
          "border:1px solid #bbf7d0;border-radius:6px;overflow:hidden;background:#fff;max-height:220px;overflow-y:auto;";
        for (var i = 0; i < createdDrafts.length; i++) {
          (function () {
            var item = createdDrafts[i];
            var row = document.createElement("label");
            row.style.cssText =
              "display:grid;grid-template-columns:24px 110px 1fr 200px;gap:8px;padding:6px 8px;" +
              "font-size:11px;border-bottom:1px solid #f0fdf4;align-items:center;cursor:pointer;";
            var cb = document.createElement("input");
            cb.type = "checkbox";
            cb.checked = item.selected !== false;
            cb.addEventListener("change", function () {
              item.selected = cb.checked;
            });
            row.appendChild(cb);
            var t = document.createElement("div");
            t.textContent = item.type || "";
            row.appendChild(t);
            var s = document.createElement("div");
            s.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
            s.textContent = item.summary || "";
            row.appendChild(s);
            var idEl = document.createElement("div");
            idEl.style.cssText = "font-family:ui-monospace,monospace;font-size:10px;";
            idEl.textContent = item.newsId || "";
            row.appendChild(idEl);
            list.appendChild(row);
          })();
        }
        publishBox.appendChild(list);

        var pubActions = document.createElement("div");
        pubActions.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;";
        publishBox.appendChild(pubActions);

        pubActions.appendChild(
          mkBtn("Отметить все", function () {
            for (var i = 0; i < createdDrafts.length; i++) createdDrafts[i].selected = true;
            renderPublishBox();
          })
        );
        pubActions.appendChild(
          mkBtn("Снять все", function () {
            for (var i = 0; i < createdDrafts.length; i++) createdDrafts[i].selected = false;
            renderPublishBox();
          })
        );
        pubActions.appendChild(
          mkBtn(
            "Опубликовать выбранные",
            function () {
              void publishCreatedDrafts();
            },
            "background:#16a34a;color:#fff;border-color:#16a34a;"
          )
        );
        pubActions.appendChild(
          mkBtn("Пропустить", function () {
            clearPublishBox();
            log("Публикация созданных черновиков пропущена.");
          })
        );
      }

      async function publishCreatedDrafts() {
        var toPub = createdDrafts.filter(function (x) {
          return x.selected !== false && String(x.newsId || "").trim();
        });
        if (!toPub.length) {
          log("Нет отмеченных черновиков для публикации.");
          return;
        }
        if (opBusy) {
          log("Уже выполняется другая операция — дождитесь завершения или нажмите Стоп.");
          return;
        }
        if (
          !window.confirm(
            "Опубликовать выбранные новости: " + toPub.length + " шт. (method: patch, status: published)?"
          )
        ) {
          log("Публикация отменена пользователем.");
          return;
        }
        var env = getEnv();
        var settings = getSharedRequestSettings();
        var ok = 0;
        var fail = 0;
        setOpBusy(true, "публикация после создания");
        refreshCreateActions();
        try {
          for (var i = 0; i < toPub.length; i++) {
            if (isStopRequested()) {
              log("Стоп: публикация прервана.");
              break;
            }
            var newsId = toPub[i].newsId;
            sharedOpStatus.textContent = "Операции: публикация " + (i + 1) + "/" + toPub.length;
            var payload = { newsId: newsId, status: "published", method: "patch" };
            var retryResult = await postJsonWithRetry(
              env.origin + NEWS_V2_CFG.NEWS_UPDATE_PATH,
              payload,
              env.origin + "/admin/community/" + newsId,
              {
                log: log,
                retryMax: settings.retryMax,
                retryPauseMs: settings.retryPauseMs,
                requireBody: false,
                shouldStop: isStopRequested
              }
            );
            if (retryResult.stopped) break;
            if (retryResult.ok) {
              ok++;
              log("Опубликовано: newsId=" + newsId);
            } else {
              fail++;
              log(
                "Ошибка публикации newsId=" +
                  newsId +
                  ": " +
                  (retryResult.error || ("HTTP " + (retryResult.fr && retryResult.fr.status)))
              );
            }
            if (i < toPub.length - 1 && settings.opGapMs > 0) await delay(settings.opGapMs);
          }
        } finally {
          setOpBusy(false);
          refreshCreateActions();
        }
        log("Публикация после создания: OK=" + ok + ", FAIL=" + fail + ".");
        if (fail === 0 && ok > 0) clearPublishBox();
      }

      function showCreatedDraftsForPublish(items) {
        createdDrafts = (items || []).map(function (x) {
          return {
            newsId: ensureString(x.newsId),
            type: ensureString(x.type),
            summary: ensureString(x.summary),
            selected: true
          };
        });
        renderPublishBox();
        if (createdDrafts.length) {
          log(
            "Можно опубликовать созданные черновики: отметьте нужные и нажмите «Опубликовать выбранные»."
          );
        }
      }

      var btnParseField;
      var btnCreateTemplateLoaded;
      var btnSelectAll;
      var btnSelectFiltered;
      var btnDeselectAll;
      var btnDeselectFiltered;
      var btnClear;
      var btnCreate;

      function getCreateSelectionStats() {
        var selectedCount = 0;
        for (var i = 0; i < candidates.length; i++) {
          if (candidates[i].selected !== false) selectedCount++;
        }
        var q = String(searchInput.value || "").trim().toLowerCase();
        var filteredCount = 0;
        if (!q) {
          filteredCount = candidates.length;
        } else {
          for (var fi = 0; fi < candidates.length; fi++) {
            var hay = [
              ensureString(
                candidates[fi].sourceNewsType ||
                  candidates[fi].sourceType ||
                  candidates[fi].type
              ),
              ensureString(candidates[fi].summary),
              ensureString(candidates[fi].sourceNewsId || candidates[fi].newsId),
              ensureString(candidates[fi].codesDisplay)
            ]
              .join(" ")
              .toLowerCase();
            if (hay.indexOf(q) >= 0) filteredCount++;
          }
        }
        return {
          total: candidates.length,
          selected: selectedCount,
          filtered: filteredCount,
          hasFilter: !!q,
          hasManual: !!String(manualInput.value || "").trim()
        };
      }

      function refreshCreateActions() {
        if (!btnCreate) return;
        var stats = getCreateSelectionStats();
        var hasList = stats.total > 0;
        btnParseField._setActive(
          getCreateMode() === "file" && stats.hasManual,
          getCreateMode() === "file"
            ? "Вставьте JSON в поле выше"
            : "Переключитесь в режим «Файл JSON»"
        );
        btnCreateTemplateLoaded._setActive(hasList, "Сначала загрузите записи");
        btnSelectAll._setActive(hasList, "Сначала загрузите записи");
        btnDeselectAll._setActive(hasList, "Сначала загрузите записи");
        btnClear._setActive(hasList || stats.hasManual, "Нечего очищать");
        btnSelectFiltered._setActive(
          hasList && stats.hasFilter && stats.filtered > 0,
          hasList ? "Задайте текст поиска" : "Сначала загрузите записи"
        );
        btnDeselectFiltered._setActive(
          hasList && stats.hasFilter && stats.filtered > 0,
          hasList ? "Задайте текст поиска" : "Сначала загрузите записи"
        );
        var canCreate = hasList && stats.selected > 0 && !opBusy;
        btnCreate._setActive(
          canCreate,
          opBusy
            ? "Идёт другая операция"
            : hasList
              ? "Отметьте хотя бы одну запись"
              : "Сначала загрузите записи"
        );
        btnCreate.textContent =
          stats.selected > 0
            ? "Создать выбранные (" + stats.selected + ")"
            : "Создать выбранные";
      }

      function renderList() {
        tableHost.innerHTML = "";
        if (!candidates.length) {
          selectionInfo.textContent = "Записей: 0";
          refreshCreateActions();
          return;
        }
        var q = String(searchInput.value || "").trim().toLowerCase();
        var filtered = candidates.filter(function (item) {
          if (!q) return true;
          var hay = [
            ensureString(item.sourceNewsType || item.sourceType || item.type),
            ensureString(item.summary),
            ensureString(item.sourceNewsId || item.newsId),
            ensureString(item.codesDisplay)
          ]
            .join(" ")
            .toLowerCase();
          return hay.indexOf(q) >= 0;
        });
        tableHost.appendChild(
          renderCandidatesTable(filtered, "create", {
            onSelectionChange: updateSelectionInfo
          })
        );
        updateSelectionInfo(filtered.length);
      }

      function updateSelectionInfo(filteredCount) {
        var selectedCount = candidates.filter(function (x) {
          return x.selected !== false;
        }).length;
        var countForView = typeof filteredCount === "number" ? filteredCount : candidates.length;
        selectionInfo.textContent =
          "Записей: " +
          candidates.length +
          " | В фильтре: " +
          countForView +
          " | Выбрано: " +
          selectedCount;
        refreshCreateActions();
      }

      function setAllSelected(next) {
        for (var i = 0; i < candidates.length; i++) candidates[i].selected = !!next;
        renderList();
      }

      function clearLoadedSelection() {
        candidates = [];
        lastNormalizedCreateTemplate = null;
        manualInput.value = "";
        fileInput.value = "";
        searchInput.value = "";
        clearPublishBox();
        renderList();
        log("Список выбора (создание) очищен.");
      }

      function setFilteredSelected(next) {
        var q = String(searchInput.value || "").trim().toLowerCase();
        for (var i = 0; i < candidates.length; i++) {
          if (!q) {
            candidates[i].selected = !!next;
            continue;
          }
          var hay = [
            ensureString(
              candidates[i].sourceNewsType ||
                candidates[i].sourceType ||
                candidates[i].type
            ),
            ensureString(candidates[i].summary),
            ensureString(candidates[i].sourceNewsId || candidates[i].newsId),
            ensureString(candidates[i].codesDisplay)
          ]
            .join(" ")
            .toLowerCase();
          if (hay.indexOf(q) >= 0) candidates[i].selected = !!next;
        }
        renderList();
      }

      function applyCandidatesFromSourceList(rowsOrJson, fromLabel, saveNormalized) {
        var batchStartIso = nowIso();
        var createdByValue = String(createdByInput.value || "").trim() || NEWS_V2_CFG.DEFAULT_CREATED_BY;
        var stubMode = !!stubModeCb.checked;
        // Болванка влияет только на отправку: в кандидатах и таблице остаются исходные списки.
        candidates = extractCreateCandidatesFromAnyJson(
          rowsOrJson,
          createdByValue,
          batchStartIso,
          null
        );
        var parseMeta = candidates._parseMeta || {};
        for (var ci = 0; ci < candidates.length; ci++) {
          if (!String(candidates[ci].payload.createdBy || "").trim()) {
            candidates[ci].payload.createdBy = createdByValue;
          }
        }
        lastNormalizedCreateTemplate = buildCreateTemplateFromCandidates(candidates);
        renderList();
        var achMissing = 0;
        var achOk = 0;
        for (var aj = 0; aj < candidates.length; aj++) {
          if (candidates[aj].payload.type !== "achievement") continue;
          if (
            !(candidates[aj].payload.rewardList || []).length ||
            !(candidates[aj].payload.tournamentList || []).length
          ) {
            achMissing++;
          } else {
            achOk++;
          }
        }
        log(
          "Загружено записей для создания: " +
            candidates.length +
            (fromLabel ? " (" + fromLabel + ")" : "") +
            (parseMeta.fromCreateItems
              ? " | источник: createItems"
              : " | страниц API прочитано: " +
                (parseMeta.pagesScanned || 0) +
                " | combo-блоков: " +
                (parseMeta.comboBlocks || 0)) +
            (stubMode ? " | болванка: при create leaders/authors будут []" : "")
        );
        if (achOk || achMissing) {
          log(
            "  achievement: с наградой+турниром=" +
              achOk +
              ", без обязательных кодов=" +
              achMissing +
              (achMissing
                ? " (такие записи не пройдут валидацию при создании)"
                : "")
          );
        }
        if (saveNormalized && candidates.length) {
          var fname = "news_create_template_normalized_" + tsShort() + ".json";
          downloadJson(fname, lastNormalizedCreateTemplate);
          log("Сохранён нормализованный шаблон createItems: " + fname);
        }
      }

      async function parseFromText(text) {
        var parsed = safeParseJson(text);
        if (!parsed.ok) {
          log("Ошибка JSON: " + parsed.error.message);
          return;
        }
        applyCandidatesFromSourceList(parsed.value, "JSON", true);
      }

      function addFromForm() {
        var source = readFormSourceItem();
        if (!String(source.description || "").trim() && !String(source.summary || "").trim()) {
          log("Форма: заполните заголовок или текст новости.");
          return;
        }
        if (!String(source.description || "").trim()) {
          log("Форма: заполните текст новости (description).");
          return;
        }
        if (!source.businessBlocks.length) {
          log("Форма: выберите хотя бы один businessBlock.");
          return;
        }
        if (normalizeType(source.type) === "achievement") {
          if (!source.rewardList.length) {
            log("Форма: для achievement укажите хотя бы один rewardCode.");
            return;
          }
          if (!source.tournamentList.length) {
            log("Форма: для achievement укажите хотя бы один tournamentCode.");
            return;
          }
        }
        // Одна новость из формы — заменяем список кандидатов.
        applyCandidatesFromSourceList({ createItems: [source] }, "форма", false);
        if (getCreateMode() === "form" && candidates.length > 1) {
          candidates = candidates.slice(0, 1);
          renderList();
        }
      }

      function applyModeUi() {
        var mode = getCreateMode();
        var isForm = mode === "form";
        formBox.style.display = isForm ? "flex" : "none";
        fileBox.style.display = isForm ? "none" : "flex";
        log(
          isForm
            ? "Режим: форма (одна новость)."
            : "Режим: файл/JSON (несколько новостей)."
        );
        refreshCreateActions();
      }
      modeForm.inp.addEventListener("change", applyModeUi);
      modeFile.inp.addEventListener("change", applyModeUi);
      applyModeUi();

      formActions.appendChild(
        mkToneBtn(
          "Добавить в список из формы",
          function () {
            addFromForm();
          },
          "primary"
        )
      );
      formActions.appendChild(
        mkToneBtn("Очистить форму", function () {
          clearFormFields();
          log("Форма создания очищена.");
        }, "muted")
      );

      stubModeCb.addEventListener("change", function () {
        syncStubFieldsVisibility();
        log(
          stubModeCb.checked
            ? "Режим болванки включён: при создании leaders/authors уйдут пустыми (данные и counts не меняются)."
            : "Режим болванки выключен."
        );
      });

      btnParseField = mkToneBtn("Разобрать JSON из поля", function () {
        if (getCreateMode() !== "file") {
          log("Разбор JSON доступен в режиме «Файл JSON».");
          return;
        }
        void parseFromText(manualInput.value);
      }, "parse");
      btnCreateTemplateLoaded = mkToneBtn("Создать шаблон из загруженного", function () {
        if (!candidates.length) return;
        lastNormalizedCreateTemplate = buildCreateTemplateFromCandidates(candidates);
        var fname = "news_create_template_normalized_" + tsShort() + ".json";
        downloadJson(fname, lastNormalizedCreateTemplate);
        log("Сохранён нормализованный шаблон createItems: " + fname);
      }, "template");
      btnSelectAll = mkToneBtn("Отметить всё", function () {
        setAllSelected(true);
      }, "select");
      btnSelectFiltered = mkToneBtn("Отметить в фильтре", function () {
        setFilteredSelected(true);
      }, "select");
      btnDeselectAll = mkToneBtn("Снять всё", function () {
        setAllSelected(false);
      }, "deselect");
      btnDeselectFiltered = mkToneBtn("Снять в фильтре", function () {
        setFilteredSelected(false);
      }, "deselect");
      btnClear = mkToneBtn("Очистить загруженное", function () {
        clearLoadedSelection();
      }, "warn");
      rowLoad.appendChild(btnParseField);
      rowLoad.appendChild(btnCreateTemplateLoaded);
      rowSelect.appendChild(btnSelectAll);
      rowSelect.appendChild(btnSelectFiltered);
      rowSelect.appendChild(btnDeselectAll);
      rowSelect.appendChild(btnDeselectFiltered);
      rowSelect.appendChild(btnClear);

      btnCreate = mkToneBtn(
        "Создать выбранные",
        function () {
            void (async function () {
              if (opBusy) {
                log("Уже выполняется другая операция — дождитесь завершения или нажмите Стоп.");
                return;
              }
              if (getCreateMode() === "form" && !candidates.length) {
                addFromForm();
              }
              var selected = candidates.filter(function (c) {
                return c.selected !== false;
              });
              if (!selected.length) {
                log("Нет выбранных записей для создания.");
                return;
              }
              if (getCreateMode() === "form" && selected.length > 1) {
                log("В режиме формы создаётся только одна новость. Снимите лишние или переключитесь на файл.");
                return;
              }

              var errors = [];
              var createdByValue = String(createdByInput.value || "").trim() || NEWS_V2_CFG.DEFAULT_CREATED_BY;
              var stubMode = !!stubModeCb.checked;
              for (var i = 0; i < selected.length; i++) {
                if (!String(selected[i].payload.createdBy || "").trim()) {
                  selected[i].payload.createdBy = createdByValue;
                }
                var err = validateCreatePayload(selected[i].payload);
                if (err) {
                  errors.push("[" + (i + 1) + "] " + err + " :: " + compactNewsLabel(selected[i].payload));
                }
              }
              if (errors.length) {
                log("Отмена создания: найдены ошибки в критичных данных.");
                for (var ei = 0; ei < errors.length; ei++) log("  " + errors[ei]);
                return;
              }

              var confirmText =
                "Создать выбранные новости: " +
                selected.length +
                " шт.?" +
                (stubMode ? "\n\nРежим болванки: leadersList и authorsList будут пустыми." : "");
              if (!window.confirm(confirmText)) {
                log("Создание отменено пользователем.");
                return;
              }

              var env = getEnv();
              var settings = getSharedRequestSettings();
              var okCount = 0;
              var failCount = 0;
              var retriesTotal = 0;
              var consecutiveFails = 0;
              var stoppedByUser = false;
              var abortedByErrors = false;
              var resultDump = [];
              var createdIds = [];
              var createdObjectIdsByIndex = new Array(selected.length);
              clearPublishBox();
              setOpBusy(true, "создание");
              refreshCreateActions();
              try {
                for (var si = 0; si < selected.length; si++) {
                  if (isStopRequested()) {
                    stoppedByUser = true;
                    log("Стоп: создание прервано пользователем.");
                    break;
                  }
                  // Болванка очищает списки только в копии для отправки.
                  var payload = payloadForCreateSend(selected[si].payload, stubMode);
                  sharedOpStatus.textContent =
                    "Операции: создание " + (si + 1) + "/" + selected.length;
                  var retryResult = await postJsonWithRetry(
                    env.origin + NEWS_V2_CFG.NEWS_CREATE_PATH,
                    payload,
                    env.origin + "/admin/community/create",
                    {
                      log: log,
                      retryMax: settings.retryMax,
                      retryPauseMs: settings.retryPauseMs,
                      requireBody: true,
                      shouldStop: isStopRequested,
                      successCheck: function (fr) {
                        if (!(fr && fr.data && fr.data.body && fr.data.body.objectId)) {
                          return "нет objectId в ответе";
                        }
                        return null;
                      },
                      onAttempt: function (attempt, maxAttempts, err, meta) {
                        if (meta && meta.isRetry) retriesTotal++;
                      }
                    }
                  );
                  if (retryResult.stopped || isStopRequested()) {
                    stoppedByUser = true;
                    resultDump.push({ payload: payload, response: retryResult.fr, stopped: true });
                    break;
                  }
                  resultDump.push({
                    payload: payload,
                    response: retryResult.fr,
                    attempts: retryResult.attempts,
                    retries: retryResult.retries
                  });
                  if (retryResult.ok) {
                    consecutiveFails = 0;
                    okCount++;
                    var newId = String(retryResult.fr.data.body.objectId);
                    createdObjectIdsByIndex[si] = newId;
                    createdIds.push({
                      newsId: newId,
                      type: payload.type,
                      summary: compactNewsLabel(payload)
                    });
                    log(
                      "Создано: objectId=" +
                        newId +
                        " | type=" +
                        payload.type +
                        " | " +
                        compactNewsLabel(payload)
                    );
                  } else {
                    failCount++;
                    consecutiveFails++;
                    log(
                      "Ошибка создания: " +
                        (retryResult.error || ("HTTP " + (retryResult.fr && retryResult.fr.status))) +
                        " | " +
                        compactNewsLabel(payload)
                    );
                    if (consecutiveFails >= settings.abortLimit) {
                      abortedByErrors = true;
                      log(
                        "АВАРИЯ: " +
                          consecutiveFails +
                          " подряд исчерпанных ошибок — остановка создания."
                      );
                      break;
                    }
                  }
                  if (si < selected.length - 1 && settings.opGapMs > 0) {
                    await delay(settings.opGapMs);
                    if (isStopRequested()) {
                      stoppedByUser = true;
                      break;
                    }
                  }
                }
              } finally {
                setOpBusy(false);
                refreshCreateActions();
              }

              downloadJson(
                "news_create_result_" + env.stand + "_" + env.contour + "_" + tsShort() + ".json",
                {
                  env: env,
                  stubMode: stubMode,
                  settings: settings,
                  total: selected.length,
                  okCount: okCount,
                  failCount: failCount,
                  retriesTotal: retriesTotal,
                  stoppedByUser: stoppedByUser,
                  abortedByErrors: abortedByErrors,
                  createdObjectIds: createdIds.map(function (x) {
                    return x.newsId;
                  }),
                  results: resultDump
                }
              );
              if (createdIds.length) {
                var createdTemplateName =
                  "news_create_template_created_" +
                  env.stand +
                  "_" +
                  env.contour +
                  "_" +
                  tsShort() +
                  ".json";
                downloadJson(
                  createdTemplateName,
                  buildCreateTemplateFromCandidates(selected, createdObjectIdsByIndex)
                );
                log(
                  "Сохранён шаблон созданных новостей с createdObjectId: " +
                    createdTemplateName
                );
              }
              log(
                "Создание завершено. OK=" +
                  okCount +
                  ", FAIL=" +
                  failCount +
                  ", повторов=" +
                  retriesTotal +
                  (stoppedByUser ? " | стоп" : "") +
                  (abortedByErrors ? " | авария" : "") +
                  (stubMode ? " | болванка без leaders/authors" : "") +
                  "."
              );
              if (createdIds.length) showCreatedDraftsForPublish(createdIds);
            })();
        },
        "primary"
      );
      rowRun.appendChild(btnCreate);

      fileInput.addEventListener("change", function () {
        void (async function () {
          var file = fileInput.files && fileInput.files[0];
          if (!file) return;
          if (getCreateMode() !== "file") {
            modeFile.inp.checked = true;
            applyModeUi();
          }
          var text = await readFileAsText(file);
          await parseFromText(text);
        })();
      });
      searchInput.addEventListener("input", renderList);
      manualInput.addEventListener("input", refreshCreateActions);
      refreshCreateActions();
    }

    function renderStatusTab() {
      clearContent();
      var wrap = document.createElement("div");
      wrap.style.cssText = "display:flex;flex-direction:column;gap:8px;";
      content.appendChild(wrap);

      wrap.appendChild(
        mkHint(
          "Смена статуса: patch { newsId, status, method:\"patch\" }. Список — POST /v1/news (status×block), либо JSON/ID.",
          "info"
        )
      );

      var top = document.createElement("div");
      top.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;align-items:center;";
      wrap.appendChild(top);

      var targetSel = document.createElement("select");
      targetSel.style.cssText =
        "padding:4px 7px;border:1px solid #94a3b8;border-radius:5px;font-size:11px;background:#fff;";
      [{ v: "published", t: "→ published" }, { v: "draft", t: "→ draft" }].forEach(function (x) {
        var opt = document.createElement("option");
        opt.value = x.v;
        opt.textContent = x.t;
        if (x.v === NEWS_V2_CFG.DEFAULT_STATUS_TARGET) opt.selected = true;
        targetSel.appendChild(opt);
      });
      top.appendChild(targetSel);

      var fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".json,application/json";
      fileInput.style.display = "none";
      top.appendChild(fileInput);
      top.appendChild(
        mkBtn("Файл JSON", function () {
          fileInput.click();
        })
      );

      var fetchBox = mkSectionCard("Загрузка с сервера (/v1/news)");
      wrap.appendChild(fetchBox);
      var statusCtl = mkInlineMultiChecks(
        "Status",
        optionValues(NEWS_V2_CFG.STATUS_OPTIONS),
        "draft"
      );
      var blockCtl = mkInlineMultiChecks(
        "Business block",
        optionValues(NEWS_V2_CFG.BUSINESS_BLOCK_OPTIONS),
        "KMKKSB"
      );
      fetchBox.appendChild(statusCtl.el);
      fetchBox.appendChild(blockCtl.el);
      var fetchPagesInput = document.createElement("input");
      fetchPagesInput.type = "number";
      fetchPagesInput.min = "1";
      fetchPagesInput.value = "3";
      fetchPagesInput.style.cssText =
        "padding:3px 5px;border:1px solid #94a3b8;border-radius:4px;width:72px;font-size:11px;margin-right:6px;";
      var pagesRow = document.createElement("div");
      pagesRow.style.cssText = "display:flex;align-items:center;gap:4px;margin-top:4px;font-size:10px;color:#64748b;";
      pagesRow.appendChild(fetchPagesInput);
      pagesRow.appendChild(
        document.createTextNode("стр. если «Стр. по»=0 (общий блок панели)")
      );
      fetchBox.appendChild(pagesRow);

      var idsInput = document.createElement("textarea");
      idsInput.rows = 3;
      idsInput.placeholder = "Или ID вручную: по одному на строку / через ;";
      idsInput.style.cssText =
        "width:100%;padding:6px;border:1px solid #94a3b8;border-radius:5px;font-family:ui-monospace,monospace;font-size:11px;box-sizing:border-box;";
      wrap.appendChild(idsInput);

      var actions = document.createElement("div");
      actions.style.cssText = "display:flex;flex-wrap:wrap;gap:5px;";
      wrap.appendChild(actions);

      var tableHost = document.createElement("div");
      wrap.appendChild(tableHost);

      var candidates = [];
      var searchInput = document.createElement("input");
      searchInput.type = "text";
      searchInput.placeholder = "Поиск по типу / заголовку / ID";
      searchInput.style.cssText =
        "width:100%;padding:5px 7px;border:1px solid #94a3b8;border-radius:5px;font-size:11px;box-sizing:border-box;";
      wrap.appendChild(searchInput);
      var selectionInfo = document.createElement("div");
      selectionInfo.style.cssText = "font-size:10px;color:#64748b;";
      wrap.appendChild(selectionInfo);
      function renderList() {
        tableHost.innerHTML = "";
        if (!candidates.length) {
          selectionInfo.textContent = "Записей: 0";
          return;
        }
        var q = String(searchInput.value || "").trim().toLowerCase();
        var filtered = candidates.filter(function (item) {
          if (!q) return true;
          var hay = [
            ensureString(item.type),
            ensureString(item.summary),
            ensureString(item.newsId)
          ]
            .join(" ")
            .toLowerCase();
          return hay.indexOf(q) >= 0;
        });
        tableHost.appendChild(
          renderCandidatesTable(filtered, "status", {
            onSelectionChange: updateSelectionInfo
          })
        );
        updateSelectionInfo(filtered.length);
      }

      function updateSelectionInfo(filteredCount) {
        var selectedCount = candidates.filter(function (x) {
          return x.selected !== false;
        }).length;
        var countForView = typeof filteredCount === "number" ? filteredCount : candidates.length;
        selectionInfo.textContent =
          "Записей: " +
          candidates.length +
          " | В фильтре: " +
          countForView +
          " | Выбрано: " +
          selectedCount;
      }

      function setAllSelected(next) {
        for (var i = 0; i < candidates.length; i++) candidates[i].selected = !!next;
        renderList();
      }
      function clearLoadedSelection() {
        candidates = [];
        fileInput.value = "";
        searchInput.value = "";
        renderList();
        log("Список выбора (статусы) очищен.");
      }
      function setFilteredSelected(next) {
        var q = String(searchInput.value || "").trim().toLowerCase();
        for (var i = 0; i < candidates.length; i++) {
          if (!q) {
            candidates[i].selected = !!next;
            continue;
          }
          var hay = [
            ensureString(candidates[i].type),
            ensureString(candidates[i].summary),
            ensureString(candidates[i].newsId)
          ]
            .join(" ")
            .toLowerCase();
          if (hay.indexOf(q) >= 0) candidates[i].selected = !!next;
        }
        renderList();
      }

      function parseFromJsonText(text) {
        var parsed = safeParseJson(text);
        if (!parsed.ok) {
          log("Ошибка JSON: " + parsed.error.message);
          return;
        }
        candidates = buildStatusCandidatesFromAnyJson(parsed.value, targetSel.value);
        renderList();
        log("Загружено записей для смены статуса: " + candidates.length);
      }

      actions.appendChild(
        mkBtn(
          "Загрузить с сервера",
          function () {
            void (async function () {
              if (opBusy) {
                log("Уже выполняется другая операция — дождитесь завершения или нажмите Стоп.");
                return;
              }
              var settings = getSharedRequestSettings();
              var localMax = parseInt(String(fetchPagesInput.value || "3"), 10);
              if (!Number.isFinite(localMax) || localMax < 1) localMax = 1;
              var result = await fetchNewsItemsFromServer(
                statusCtl.getSelected(),
                blockCtl.getSelected(),
                settings,
                localMax,
                "загрузка для статусов"
              );
              if (!result.ok) {
                log("Отмена загрузки: " + (result.error || "ошибка"));
                return;
              }
              candidates = result.items.map(function (row) {
                return {
                  selected: true,
                  newsId: ensureString(row.newsId),
                  type: normalizeType(row.newsType || row.type),
                  summary: compactNewsLabel(row),
                  targetStatus: targetSel.value,
                  currentStatus: ensureString(row.newsStatus || "")
                };
              });
              renderList();
              log(
                "К смене статуса с сервера: " +
                  candidates.length +
                  ", повторов=" +
                  result.retriesTotal +
                  (result.stoppedByUser ? " | стоп" : "") +
                  (result.abortedByErrors ? " | авария" : "") +
                  "."
              );
            })();
          },
          "background:#0ea5e9;color:#fff;border-color:#0ea5e9;"
        )
      );
      actions.appendChild(
        mkBtn("Шаблон JSON", function () {
          downloadJson("news_status_template_" + tsShort() + ".json", buildStatusTemplate(targetSel.value));
          log("Скачан шаблон статусов.");
        })
      );
      actions.appendChild(
        mkBtn("Разобрать ID/JSON", function () {
          if (idsInput.value.trim()) {
            var list = parseLinesToList(idsInput.value).map(function (id) {
              return { newsId: id, status: targetSel.value };
            });
            candidates = buildStatusCandidatesFromAnyJson(list, targetSel.value);
            renderList();
            log("Сформировано из списка ID: " + candidates.length);
            return;
          }
          log("Поле ID пустое — загрузите файл JSON или вставьте ID.");
        })
      );
      actions.appendChild(mkBtn("Отметить всё", function () { setAllSelected(true); }));
      actions.appendChild(mkBtn("Отметить в фильтре", function () { setFilteredSelected(true); }));
      actions.appendChild(mkBtn("Снять всё", function () { setAllSelected(false); }));
      actions.appendChild(mkBtn("Снять в фильтре", function () { setFilteredSelected(false); }));
      actions.appendChild(mkBtn("Очистить", function () { clearLoadedSelection(); }));
      actions.appendChild(
        mkBtn(
          "Применить статус",
          function () {
            void (async function () {
              if (opBusy) {
                log("Уже выполняется другая операция — дождитесь завершения или нажмите Стоп.");
                return;
              }
              var selected = candidates.filter(function (c) {
                return c.selected !== false;
              });
              if (!selected.length) {
                log("Нет выбранных записей для смены статуса.");
                return;
              }
              // целевой статус берём из селекта на момент применения
              for (var uj = 0; uj < selected.length; uj++) {
                selected[uj].targetStatus = targetSel.value;
              }
              var errs = [];
              for (var i = 0; i < selected.length; i++) {
                var e = validateStatusItem(selected[i]);
                if (e) errs.push("[" + (i + 1) + "] " + e);
              }
              if (errs.length) {
                log("Отмена смены статуса: ошибки в данных.");
                for (var ei = 0; ei < errs.length; ei++) log("  " + errs[ei]);
                return;
              }
              if (!window.confirm("Сменить статус на «" + targetSel.value + "» для " + selected.length + " новостей?")) {
                log("Операция отменена пользователем.");
                return;
              }
              var env = getEnv();
              var settings = getSharedRequestSettings();
              var okCount = 0;
              var failCount = 0;
              var retriesTotal = 0;
              var consecutiveFails = 0;
              var stoppedByUser = false;
              var abortedByErrors = false;
              var dump = [];
              setOpBusy(true, "статусы");
              try {
                for (var si = 0; si < selected.length; si++) {
                  if (isStopRequested()) {
                    stoppedByUser = true;
                    log("Стоп: смена статусов прервана пользователем.");
                    break;
                  }
                  var item = selected[si];
                  var payload = { newsId: item.newsId, status: item.targetStatus, method: "patch" };
                  sharedOpStatus.textContent =
                    "Операции: статус " + (si + 1) + "/" + selected.length;
                  var retryResult = await postJsonWithRetry(
                    env.origin + NEWS_V2_CFG.NEWS_UPDATE_PATH,
                    payload,
                    env.origin + "/admin/community/" + item.newsId,
                    {
                      log: log,
                      retryMax: settings.retryMax,
                      retryPauseMs: settings.retryPauseMs,
                      requireBody: false,
                      shouldStop: isStopRequested,
                      onAttempt: function (attempt, maxAttempts, err, meta) {
                        if (meta && meta.isRetry) retriesTotal++;
                      }
                    }
                  );
                  if (retryResult.stopped || isStopRequested()) {
                    stoppedByUser = true;
                    dump.push({ payload: payload, response: retryResult.fr, stopped: true });
                    break;
                  }
                  dump.push({
                    payload: payload,
                    response: retryResult.fr,
                    attempts: retryResult.attempts,
                    retries: retryResult.retries
                  });
                  if (retryResult.ok) {
                    consecutiveFails = 0;
                    okCount++;
                    log("Статус обновлён: newsId=" + item.newsId + " -> " + item.targetStatus);
                  } else {
                    failCount++;
                    consecutiveFails++;
                    log(
                      "Ошибка статуса: newsId=" +
                        item.newsId +
                        " | " +
                        (retryResult.error || ("HTTP " + (retryResult.fr && retryResult.fr.status)))
                    );
                    if (consecutiveFails >= settings.abortLimit) {
                      abortedByErrors = true;
                      log(
                        "АВАРИЯ: " +
                          consecutiveFails +
                          " подряд исчерпанных ошибок — остановка смены статусов."
                      );
                      break;
                    }
                  }
                  if (si < selected.length - 1 && settings.opGapMs > 0) {
                    await delay(settings.opGapMs);
                    if (isStopRequested()) {
                      stoppedByUser = true;
                      break;
                    }
                  }
                }
              } finally {
                setOpBusy(false);
              }
              downloadJson(
                "news_status_result_" + env.stand + "_" + env.contour + "_" + tsShort() + ".json",
                {
                  env: env,
                  settings: settings,
                  total: selected.length,
                  okCount: okCount,
                  failCount: failCount,
                  retriesTotal: retriesTotal,
                  stoppedByUser: stoppedByUser,
                  abortedByErrors: abortedByErrors,
                  results: dump
                }
              );
              log(
                "Смена статусов завершена. OK=" +
                  okCount +
                  ", FAIL=" +
                  failCount +
                  ", повторов=" +
                  retriesTotal +
                  (stoppedByUser ? " | стоп" : "") +
                  (abortedByErrors ? " | авария" : "") +
                  "."
              );
            })();
          },
          "background:#2563eb;color:#fff;border-color:#2563eb;"
        )
      );

      fileInput.addEventListener("change", function () {
        void (async function () {
          var file = fileInput.files && fileInput.files[0];
          if (!file) return;
          var text = await readFileAsText(file);
          parseFromJsonText(text);
        })();
      });
      searchInput.addEventListener("input", renderList);
    }

    function renderEditTab() {
      clearContent();
      var wrap = document.createElement("div");
      wrap.style.cssText = "display:flex;flex-direction:column;gap:8px;";
      content.appendChild(wrap);

      wrap.appendChild(
        mkHint(
          "Редактирование: put-полный payload на newsUpdate. Список — /v1/news; опционально догрузка news-detail перед отправкой (точнее rewards/contests/imageList).",
          "warn"
        )
      );

      var fetchBox = mkSectionCard("Загрузка с сервера (/v1/news)");
      wrap.appendChild(fetchBox);

      var editStatusCtl = mkInlineMultiChecks(
        "Status",
        optionValues(NEWS_V2_CFG.STATUS_OPTIONS),
        "published"
      );
      var editBlockCtl = mkInlineMultiChecks(
        "Business block",
        optionValues(NEWS_V2_CFG.BUSINESS_BLOCK_OPTIONS),
        "KMKKSB"
      );
      fetchBox.appendChild(editStatusCtl.el);
      fetchBox.appendChild(editBlockCtl.el);

      var fetchPagesInput = document.createElement("input");
      fetchPagesInput.type = "number";
      fetchPagesInput.min = "1";
      fetchPagesInput.value = "3";
      fetchPagesInput.style.cssText =
        "padding:3px 5px;border:1px solid #94a3b8;border-radius:4px;width:72px;font-size:11px;margin-right:6px;";
      var pagesRow = document.createElement("div");
      pagesRow.style.cssText = "display:flex;align-items:center;gap:4px;margin-top:4px;font-size:10px;color:#64748b;";
      pagesRow.appendChild(fetchPagesInput);
      pagesRow.appendChild(
        document.createTextNode("стр. если «Стр. по»=0")
      );
      fetchBox.appendChild(pagesRow);

      var detailLab = document.createElement("label");
      detailLab.style.cssText =
        "display:inline-flex;align-items:center;gap:5px;font-size:10px;color:#334155;margin-top:6px;cursor:pointer;";
      detailLab.title = "Перед put запросить news-detail по каждому выбранному newsId";
      var detailCb = document.createElement("input");
      detailCb.type = "checkbox";
      detailCb.checked = true;
      detailLab.appendChild(detailCb);
      detailLab.appendChild(document.createTextNode("Перед отправкой догрузить news-detail"));
      fetchBox.appendChild(detailLab);

      var fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".json,application/json";
      fileInput.style.display = "none";
      wrap.appendChild(fileInput);

      var manualInput = document.createElement("textarea");
      manualInput.rows = 4;
      manualInput.placeholder = "Или JSON: { updateItems: [...] } / массив put-payload";
      manualInput.style.cssText =
        "width:100%;padding:6px;border:1px solid #94a3b8;border-radius:5px;font-family:ui-monospace,monospace;font-size:11px;box-sizing:border-box;";
      wrap.appendChild(manualInput);

      var actions = document.createElement("div");
      actions.style.cssText = "display:flex;gap:5px;flex-wrap:wrap;";
      wrap.appendChild(actions);

      var tableHost = document.createElement("div");
      wrap.appendChild(tableHost);

      var candidates = [];
      var lastNormalizedUpdateTemplate = null;
      var searchInput = document.createElement("input");
      searchInput.type = "text";
      searchInput.placeholder = "Поиск по типу / заголовку / ID";
      searchInput.style.cssText =
        "width:100%;padding:5px 7px;border:1px solid #94a3b8;border-radius:5px;font-size:11px;box-sizing:border-box;";
      wrap.appendChild(searchInput);
      var selectionInfo = document.createElement("div");
      selectionInfo.style.cssText = "font-size:10px;color:#64748b;";
      wrap.appendChild(selectionInfo);
      function renderList() {
        tableHost.innerHTML = "";
        if (!candidates.length) {
          selectionInfo.textContent = "Записей: 0";
          return;
        }
        var q = String(searchInput.value || "").trim().toLowerCase();
        var filtered = candidates.filter(function (item) {
          if (!q) return true;
          var hay = [
            ensureString(item.sourceNewsType || item.sourceType || item.type),
            ensureString(item.summary),
            ensureString(item.sourceNewsId || item.newsId),
            ensureString(item.codesDisplay)
          ]
            .join(" ")
            .toLowerCase();
          return hay.indexOf(q) >= 0;
        });
        tableHost.appendChild(
          renderCandidatesTable(filtered, "edit", {
            onSelectionChange: updateSelectionInfo
          })
        );
        updateSelectionInfo(filtered.length);
      }

      function updateSelectionInfo(filteredCount) {
        var selectedCount = candidates.filter(function (x) {
          return x.selected !== false;
        }).length;
        var countForView = typeof filteredCount === "number" ? filteredCount : candidates.length;
        selectionInfo.textContent =
          "Записей: " +
          candidates.length +
          " | В фильтре: " +
          countForView +
          " | Выбрано: " +
          selectedCount;
      }

      function setAllSelected(next) {
        for (var i = 0; i < candidates.length; i++) candidates[i].selected = !!next;
        renderList();
      }

      function clearLoadedSelection() {
        candidates = [];
        lastNormalizedUpdateTemplate = null;
        manualInput.value = "";
        fileInput.value = "";
        searchInput.value = "";
        renderList();
        log("Список выбора (редактирование) очищен.");
      }

      function setFilteredSelected(next) {
        var q = String(searchInput.value || "").trim().toLowerCase();
        for (var i = 0; i < candidates.length; i++) {
          if (!q) {
            candidates[i].selected = !!next;
            continue;
          }
          var hay = [
            ensureString(
              candidates[i].sourceNewsType ||
                candidates[i].sourceType ||
                candidates[i].type
            ),
            ensureString(candidates[i].summary),
            ensureString(candidates[i].sourceNewsId || candidates[i].newsId),
            ensureString(candidates[i].codesDisplay)
          ]
            .join(" ")
            .toLowerCase();
          if (hay.indexOf(q) >= 0) candidates[i].selected = !!next;
        }
        renderList();
      }

      function parseUpdateJson(text) {
        var parsed = safeParseJson(text);
        if (!parsed.ok) {
          log("Ошибка JSON: " + parsed.error.message);
          return;
        }
        var rows = [];
        if (Array.isArray(parsed.value)) rows = parsed.value;
        else if (parsed.value && Array.isArray(parsed.value.updateItems)) rows = parsed.value.updateItems;
        else rows = [parsed.value];
        candidates = rows.map(function (row) {
          var payload = Object.assign({}, row || {});
          payload.method = "put";
          var view = buildCreateCandidateView(row, payload);
          view.payload = payload;
          return view;
        });
        var validationErrors = [];
        for (var i = 0; i < candidates.length; i++) {
          var err = validateUpdatePayload(candidates[i].payload);
          if (err) validationErrors.push("[" + (i + 1) + "] " + err);
        }
        if (validationErrors.length) {
          log("Найдены ошибки в загруженных данных (редактирование):");
          for (var vi = 0; vi < validationErrors.length; vi++) {
            log("  " + validationErrors[vi]);
          }
        }
        lastNormalizedUpdateTemplate = buildUpdateTemplateFromCandidates(candidates);
        renderList();
        log("Загружено payload для редактирования: " + candidates.length);
        if (!validationErrors.length && candidates.length) {
          var fname = "news_edit_template_normalized_" + tsShort() + ".json";
          downloadJson(fname, lastNormalizedUpdateTemplate);
          log("Сохранён нормализованный шаблон updateItems: " + fname);
        }
      }

      actions.appendChild(
        mkBtn(
          "Загрузить с сервера",
          function () {
            void (async function () {
              if (opBusy) {
                log("Уже выполняется другая операция — дождитесь завершения или нажмите Стоп.");
                return;
              }
              var settings = getSharedRequestSettings();
              var localMax = parseInt(String(fetchPagesInput.value || "3"), 10);
              if (!Number.isFinite(localMax) || localMax < 1) localMax = 1;
              var result = await fetchNewsItemsFromServer(
                editStatusCtl.getSelected(),
                editBlockCtl.getSelected(),
                settings,
                localMax,
                "загрузка для редактирования"
              );
              if (!result.ok) {
                log("Отмена загрузки: " + (result.error || "ошибка"));
                return;
              }
              candidates = result.items.map(function (row) {
                var payload = buildUpdatePayloadFromNewsItem(row);
                var view = buildCreateCandidateView(row, payload);
                view.payload = payload;
                return view;
              });
              lastNormalizedUpdateTemplate = buildUpdateTemplateFromCandidates(candidates);
              renderList();
              log(
                "К редактированию с сервера: " +
                  candidates.length +
                  ", повторов=" +
                  result.retriesTotal +
                  (result.stoppedByUser ? " | стоп" : "") +
                  (result.abortedByErrors ? " | авария" : "") +
                  "."
              );
            })();
          },
          "background:#0ea5e9;color:#fff;border-color:#0ea5e9;"
        )
      );

      actions.appendChild(
        mkBtn("Файл JSON", function () {
          fileInput.click();
        })
      );
      actions.appendChild(
        mkBtn("Шаблон", function () {
          downloadJson("news_edit_template_" + tsShort() + ".json", buildEditTemplate());
          log("Скачан шаблон редактирования.");
        })
      );
      actions.appendChild(
        mkBtn("Создать шаблон из загруженного", function () {
          if (!candidates.length) {
            log("Нет загруженных записей для шаблона редактирования.");
            return;
          }
          lastNormalizedUpdateTemplate = buildUpdateTemplateFromCandidates(candidates);
          var fname = "news_edit_template_normalized_" + tsShort() + ".json";
          downloadJson(fname, lastNormalizedUpdateTemplate);
          log("Сохранён нормализованный шаблон updateItems: " + fname);
        }, "background:#0f766e;color:#fff;border-color:#0f766e;")
      );
      actions.appendChild(
        mkBtn("Разобрать JSON", function () {
          parseUpdateJson(manualInput.value);
        })
      );
      actions.appendChild(
        mkBtn("Отметить всё", function () {
          setAllSelected(true);
        })
      );
      actions.appendChild(
        mkBtn("Отметить в фильтре", function () {
          setFilteredSelected(true);
        })
      );
      actions.appendChild(
        mkBtn("Снять всё", function () {
          setAllSelected(false);
        })
      );
      actions.appendChild(
        mkBtn("Снять в фильтре", function () {
          setFilteredSelected(false);
        })
      );
      actions.appendChild(
        mkBtn("Очистить загруженное", function () {
          clearLoadedSelection();
        })
      );
      actions.appendChild(
        mkBtn(
          "Применить редактирование",
          function () {
            void (async function () {
              if (opBusy) {
                log("Уже выполняется другая операция — дождитесь завершения или нажмите Стоп.");
                return;
              }
              var selected = candidates.filter(function (c) {
                return c.selected !== false;
              });
              if (!selected.length) {
                log("Нет выбранных payload для редактирования.");
                return;
              }
              var errs = [];
              for (var i = 0; i < selected.length; i++) {
                var err = validateUpdatePayload(selected[i].payload);
                if (err) errs.push("[" + (i + 1) + "] " + err);
              }
              if (errs.length) {
                log("Отмена редактирования: ошибки в критичных данных.");
                for (var ei = 0; ei < errs.length; ei++) log("  " + errs[ei]);
                return;
              }
              if (!window.confirm("Обновить выбранные новости: " + selected.length + " шт.?")) {
                log("Редактирование отменено пользователем.");
                return;
              }
              var env = getEnv();
              var settings = getSharedRequestSettings();
              var okCount = 0;
              var failCount = 0;
              var retriesTotal = 0;
              var consecutiveFails = 0;
              var stoppedByUser = false;
              var abortedByErrors = false;
              var dump = [];
              setOpBusy(true, "редактирование");
              try {
                for (var si = 0; si < selected.length; si++) {
                  if (isStopRequested()) {
                    stoppedByUser = true;
                    log("Стоп: редактирование прервано пользователем.");
                    break;
                  }
                  var payload = selected[si].payload;
                  if (detailCb.checked) {
                    sharedOpStatus.textContent =
                      "Операции: news-detail " + (si + 1) + "/" + selected.length;
                    var detailRes = await postJsonWithRetry(
                      env.origin + NEWS_V2_CFG.NEWS_DETAIL_PATH,
                      { newsId: String(payload.newsId || "").trim() },
                      env.origin + "/admin/community/" + payload.newsId,
                      {
                        log: log,
                        retryMax: settings.retryMax,
                        retryPauseMs: settings.retryPauseMs,
                        requireBody: true,
                        shouldStop: isStopRequested,
                        onAttempt: function (_a, _m, _e, meta) {
                          if (meta && meta.isRetry) retriesTotal++;
                        }
                      }
                    );
                    if (detailRes.stopped || isStopRequested()) {
                      stoppedByUser = true;
                      dump.push({ payload: payload, response: detailRes.fr, stopped: true, phase: "detail" });
                      break;
                    }
                    if (
                      detailRes.ok &&
                      detailRes.fr &&
                      detailRes.fr.data &&
                      detailRes.fr.data.body
                    ) {
                      // Сохраняем статус/правки из текущего payload, поля контента — из detail.
                      var enriched = buildUpdatePayloadFromNewsItem(detailRes.fr.data.body);
                      enriched.status = payload.status || enriched.status;
                      enriched.newsId = payload.newsId || enriched.newsId;
                      if (payload.description) enriched.description = payload.description;
                      if (payload.summary != null) enriched.summary = payload.summary;
                      payload = enriched;
                      selected[si].payload = payload;
                    } else {
                      log(
                        "news-detail не получен для " +
                          payload.newsId +
                          " — put по данным списка/файла."
                      );
                    }
                  }
                  payload.method = "put";
                  sharedOpStatus.textContent =
                    "Операции: редактирование " + (si + 1) + "/" + selected.length;
                  var retryResult = await postJsonWithRetry(
                    env.origin + NEWS_V2_CFG.NEWS_UPDATE_PATH,
                    payload,
                    env.origin + "/admin/community/" + payload.newsId + "/edit",
                    {
                      log: log,
                      retryMax: settings.retryMax,
                      retryPauseMs: settings.retryPauseMs,
                      requireBody: false,
                      shouldStop: isStopRequested,
                      onAttempt: function (attempt, maxAttempts, err, meta) {
                        if (meta && meta.isRetry) retriesTotal++;
                      }
                    }
                  );
                  if (retryResult.stopped || isStopRequested()) {
                    stoppedByUser = true;
                    dump.push({ payload: payload, response: retryResult.fr, stopped: true });
                    break;
                  }
                  dump.push({
                    payload: payload,
                    response: retryResult.fr,
                    attempts: retryResult.attempts,
                    retries: retryResult.retries
                  });
                  if (retryResult.ok) {
                    consecutiveFails = 0;
                    okCount++;
                    log("Обновлено: newsId=" + payload.newsId);
                  } else {
                    failCount++;
                    consecutiveFails++;
                    log(
                      "Ошибка обновления: newsId=" +
                        payload.newsId +
                        " | " +
                        (retryResult.error || ("HTTP " + (retryResult.fr && retryResult.fr.status)))
                    );
                    if (consecutiveFails >= settings.abortLimit) {
                      abortedByErrors = true;
                      log(
                        "АВАРИЯ: " +
                          consecutiveFails +
                          " подряд исчерпанных ошибок — остановка редактирования."
                      );
                      break;
                    }
                  }
                  if (si < selected.length - 1 && settings.opGapMs > 0) {
                    await delay(settings.opGapMs);
                    if (isStopRequested()) {
                      stoppedByUser = true;
                      break;
                    }
                  }
                }
              } finally {
                setOpBusy(false);
              }
              downloadJson(
                "news_edit_result_" + env.stand + "_" + env.contour + "_" + tsShort() + ".json",
                {
                  env: env,
                  settings: settings,
                  total: selected.length,
                  okCount: okCount,
                  failCount: failCount,
                  retriesTotal: retriesTotal,
                  stoppedByUser: stoppedByUser,
                  abortedByErrors: abortedByErrors,
                  results: dump
                }
              );
              log(
                "Редактирование завершено. OK=" +
                  okCount +
                  ", FAIL=" +
                  failCount +
                  ", повторов=" +
                  retriesTotal +
                  (stoppedByUser ? " | стоп" : "") +
                  (abortedByErrors ? " | авария" : "") +
                  "."
              );
            })();
          },
          "background:#7c3aed;color:#fff;border-color:#7c3aed;"
        )
      );

      fileInput.addEventListener("change", function () {
        void (async function () {
          var file = fileInput.files && fileInput.files[0];
          if (!file) return;
          var text = await readFileAsText(file);
          parseUpdateJson(text);
        })();
      });
      searchInput.addEventListener("input", renderList);
    }

    function renderDeleteTab() {
      clearContent();
      var wrap = document.createElement("div");
      wrap.style.cssText = "display:flex;flex-direction:column;gap:8px;";
      content.appendChild(wrap);

      wrap.appendChild(
        mkHint(
          "Удаление: POST …/news/newsId/newsDelete, body { newsId }. Безвозвратно. Список — /v1/news или ручные ID.",
          "danger"
        )
      );

      var fetchBox = mkSectionCard("Загрузка с сервера (/v1/news)");
      wrap.appendChild(fetchBox);
      var delStatusCtl = mkInlineMultiChecks(
        "Status",
        optionValues(NEWS_V2_CFG.STATUS_OPTIONS),
        "draft"
      );
      var delBlockCtl = mkInlineMultiChecks(
        "Business block",
        optionValues(NEWS_V2_CFG.BUSINESS_BLOCK_OPTIONS),
        "KMKKSB"
      );
      fetchBox.appendChild(delStatusCtl.el);
      fetchBox.appendChild(delBlockCtl.el);
      var fetchPagesInput = document.createElement("input");
      fetchPagesInput.type = "number";
      fetchPagesInput.min = "1";
      fetchPagesInput.value = "3";
      fetchPagesInput.style.cssText =
        "padding:3px 5px;border:1px solid #94a3b8;border-radius:4px;width:72px;font-size:11px;margin-right:6px;";
      var pagesRow = document.createElement("div");
      pagesRow.style.cssText =
        "display:flex;align-items:center;gap:4px;margin-top:4px;font-size:10px;color:#64748b;";
      pagesRow.appendChild(fetchPagesInput);
      pagesRow.appendChild(document.createTextNode("стр. если «Стр. по»=0"));
      fetchBox.appendChild(pagesRow);

      var idsInput = document.createElement("textarea");
      idsInput.rows = 3;
      idsInput.placeholder = "Или ID вручную: по одному / через ;";
      idsInput.style.cssText =
        "width:100%;padding:6px;border:1px solid #94a3b8;border-radius:5px;font-family:ui-monospace,monospace;font-size:11px;box-sizing:border-box;";
      wrap.appendChild(idsInput);

      var actions = document.createElement("div");
      actions.style.cssText = "display:flex;flex-wrap:wrap;gap:5px;";
      wrap.appendChild(actions);

      var tableHost = document.createElement("div");
      wrap.appendChild(tableHost);

      var candidates = [];
      var searchInput = document.createElement("input");
      searchInput.type = "text";
      searchInput.placeholder = "Поиск по типу / заголовку / ID";
      searchInput.style.cssText =
        "width:100%;padding:5px 7px;border:1px solid #94a3b8;border-radius:5px;font-size:11px;box-sizing:border-box;";
      wrap.appendChild(searchInput);
      var selectionInfo = document.createElement("div");
      selectionInfo.style.cssText = "font-size:10px;color:#64748b;";
      wrap.appendChild(selectionInfo);

      function renderList() {
        tableHost.innerHTML = "";
        if (!candidates.length) {
          selectionInfo.textContent = "Записей: 0";
          return;
        }
        var q = String(searchInput.value || "").trim().toLowerCase();
        var filtered = candidates.filter(function (item) {
          if (!q) return true;
          var hay = [ensureString(item.type), ensureString(item.summary), ensureString(item.newsId)]
            .join(" ")
            .toLowerCase();
          return hay.indexOf(q) >= 0;
        });
        tableHost.appendChild(
          renderCandidatesTable(filtered, "status", { onSelectionChange: updateSelectionInfo })
        );
        updateSelectionInfo(filtered.length);
      }
      function updateSelectionInfo(filteredCount) {
        var selectedCount = candidates.filter(function (x) {
          return x.selected !== false;
        }).length;
        var countForView = typeof filteredCount === "number" ? filteredCount : candidates.length;
        selectionInfo.textContent =
          "Записей: " +
          candidates.length +
          " | В фильтре: " +
          countForView +
          " | Выбрано: " +
          selectedCount;
      }
      function setAllSelected(next) {
        for (var i = 0; i < candidates.length; i++) candidates[i].selected = !!next;
        renderList();
      }
      function setFilteredSelected(next) {
        var q = String(searchInput.value || "").trim().toLowerCase();
        for (var i = 0; i < candidates.length; i++) {
          if (!q) {
            candidates[i].selected = !!next;
            continue;
          }
          var hay = [
            ensureString(candidates[i].type),
            ensureString(candidates[i].summary),
            ensureString(candidates[i].newsId)
          ]
            .join(" ")
            .toLowerCase();
          if (hay.indexOf(q) >= 0) candidates[i].selected = !!next;
        }
        renderList();
      }
      function clearLoadedSelection() {
        candidates = [];
        searchInput.value = "";
        idsInput.value = "";
        renderList();
        log("Список выбора (удаление) очищен.");
      }

      actions.appendChild(
        mkBtn(
          "Загрузить с сервера",
          function () {
            void (async function () {
              if (opBusy) {
                log("Уже выполняется другая операция — дождитесь завершения или нажмите Стоп.");
                return;
              }
              var settings = getSharedRequestSettings();
              var localMax = parseInt(String(fetchPagesInput.value || "3"), 10);
              if (!Number.isFinite(localMax) || localMax < 1) localMax = 1;
              var result = await fetchNewsItemsFromServer(
                delStatusCtl.getSelected(),
                delBlockCtl.getSelected(),
                settings,
                localMax,
                "загрузка для удаления"
              );
              if (!result.ok) {
                log("Отмена загрузки: " + (result.error || "ошибка"));
                return;
              }
              candidates = result.items.map(function (row) {
                return {
                  selected: false,
                  newsId: ensureString(row.newsId),
                  type: normalizeType(row.newsType || row.type),
                  summary: compactNewsLabel(row),
                  currentStatus: ensureString(row.newsStatus || "")
                };
              });
              renderList();
              log(
                "К удалению с сервера: " +
                  candidates.length +
                  " (по умолчанию снято — отметьте нужные)."
              );
            })();
          },
          "background:#0ea5e9;color:#fff;border-color:#0ea5e9;"
        )
      );
      actions.appendChild(
        mkBtn("Разобрать ID", function () {
          var list = parseLinesToList(idsInput.value);
          if (!list.length) {
            log("Поле ID пустое.");
            return;
          }
          candidates = list.map(function (id) {
            return {
              selected: true,
              newsId: id,
              type: "",
              summary: id,
              currentStatus: ""
            };
          });
          renderList();
          log("К удалению из ID: " + candidates.length);
        })
      );
      actions.appendChild(mkBtn("Отметить всё", function () { setAllSelected(true); }));
      actions.appendChild(mkBtn("Отметить в фильтре", function () { setFilteredSelected(true); }));
      actions.appendChild(mkBtn("Снять всё", function () { setAllSelected(false); }));
      actions.appendChild(mkBtn("Очистить", function () { clearLoadedSelection(); }));
      actions.appendChild(
        mkBtn(
          "Удалить выбранные",
          function () {
            void (async function () {
              if (opBusy) {
                log("Уже выполняется другая операция — дождитесь завершения или нажмите Стоп.");
                return;
              }
              var selected = candidates.filter(function (c) {
                return c.selected !== false && String(c.newsId || "").trim();
              });
              if (!selected.length) {
                log("Нет выбранных новостей для удаления.");
                return;
              }
              if (
                !window.confirm(
                  "УДАЛИТЬ безвозвратно " + selected.length + " новостей?\nЭто действие необратимо."
                )
              ) {
                log("Удаление отменено пользователем.");
                return;
              }
              var env = getEnv();
              var settings = getSharedRequestSettings();
              var okCount = 0;
              var failCount = 0;
              var retriesTotal = 0;
              var consecutiveFails = 0;
              var stoppedByUser = false;
              var abortedByErrors = false;
              var dump = [];
              setOpBusy(true, "удаление");
              try {
                for (var si = 0; si < selected.length; si++) {
                  if (isStopRequested()) {
                    stoppedByUser = true;
                    log("Стоп: удаление прервано.");
                    break;
                  }
                  var item = selected[si];
                  var payload = { newsId: item.newsId };
                  sharedOpStatus.textContent =
                    "Операции: удаление " + (si + 1) + "/" + selected.length;
                  var retryResult = await postJsonWithRetry(
                    env.origin + NEWS_V2_CFG.NEWS_DELETE_PATH,
                    payload,
                    env.origin + "/admin/community/" + item.newsId,
                    {
                      log: log,
                      retryMax: settings.retryMax,
                      retryPauseMs: settings.retryPauseMs,
                      requireBody: false,
                      shouldStop: isStopRequested,
                      onAttempt: function (_a, _m, _e, meta) {
                        if (meta && meta.isRetry) retriesTotal++;
                      }
                    }
                  );
                  if (retryResult.stopped || isStopRequested()) {
                    stoppedByUser = true;
                    dump.push({ payload: payload, response: retryResult.fr, stopped: true });
                    break;
                  }
                  dump.push({
                    payload: payload,
                    response: retryResult.fr,
                    attempts: retryResult.attempts,
                    retries: retryResult.retries
                  });
                  if (retryResult.ok) {
                    consecutiveFails = 0;
                    okCount++;
                    log("Удалено: newsId=" + item.newsId);
                  } else {
                    failCount++;
                    consecutiveFails++;
                    log(
                      "Ошибка удаления: newsId=" +
                        item.newsId +
                        " | " +
                        (retryResult.error || ("HTTP " + (retryResult.fr && retryResult.fr.status)))
                    );
                    if (consecutiveFails >= settings.abortLimit) {
                      abortedByErrors = true;
                      log("АВАРИЯ: остановка удаления после " + consecutiveFails + " ошибок подряд.");
                      break;
                    }
                  }
                  if (si < selected.length - 1 && settings.opGapMs > 0) {
                    await delay(settings.opGapMs);
                    if (isStopRequested()) {
                      stoppedByUser = true;
                      break;
                    }
                  }
                }
              } finally {
                setOpBusy(false);
              }
              downloadJson(
                "news_delete_result_" + env.stand + "_" + env.contour + "_" + tsShort() + ".json",
                {
                  env: env,
                  settings: settings,
                  total: selected.length,
                  okCount: okCount,
                  failCount: failCount,
                  retriesTotal: retriesTotal,
                  stoppedByUser: stoppedByUser,
                  abortedByErrors: abortedByErrors,
                  results: dump
                }
              );
              log(
                "Удаление завершено. OK=" +
                  okCount +
                  ", FAIL=" +
                  failCount +
                  (stoppedByUser ? " | стоп" : "") +
                  (abortedByErrors ? " | авария" : "") +
                  "."
              );
            })();
          },
          "background:#b91c1c;color:#fff;border-color:#b91c1c;"
        )
      );
      searchInput.addEventListener("input", renderList);
    }

    function renderExportTab() {
      clearContent();
      var wrap = document.createElement("div");
      wrap.style.cssText = "display:flex;flex-direction:column;gap:10px;";
      content.appendChild(wrap);

      var actionBar = document.createElement("div");
      actionBar.style.cssText =
        "display:flex;flex-wrap:wrap;gap:5px;align-items:center;padding:6px;" +
        "background:rgba(255,255,255,.85);border:1px solid #cbd5e1;border-radius:8px;";
      wrap.appendChild(actionBar);

      var btnJson = mkBtn("⬇ JSON", function () { void runExport("JSON"); }, "background:#2563eb;color:#fff;border-color:#2563eb;");
      var btnCsv = mkBtn("▦ JSON+CSV", function () { void runExport("JSON+CSV"); }, "background:#059669;color:#fff;border-color:#059669;");
      // Стоп общий (панель сверху); на вкладке — зеркальная кнопка для удобства.
      var btnStop = mkBtn("⏹ Стоп", function () {
        if (!opBusy) return;
        if (isStopRequested()) {
          log("Стоп уже запрошен — ждём текущий POST…");
          return;
        }
        stopRequested = true;
        sharedOpStatus.textContent = "Операции: стоп запрошен…";
        setStats({ tone: "stop", phase: "стоп… (ждём POST)" });
        log("Стоп запрошен: после текущего запроса сохраним уже загруженное.");
      }, "background:#dc2626;color:#fff;border-color:#dc2626;opacity:0.55;");
      btnStop.disabled = true;
      actionBar.appendChild(btnJson);
      actionBar.appendChild(btnCsv);
      actionBar.appendChild(btnStop);

      var statsBox = document.createElement("div");
      wrap.appendChild(statsBox);
      var statsTitle = document.createElement("div");
      statsTitle.textContent = "Статистика";
      statsBox.appendChild(statsTitle);
      var statCells = {};
      var statLabs = {};
      function applyStatsTone(tone) {
        var themes = {
          idle: { box: "border:1px solid #cbd5e1;background:#f1f5f9;", title: "#64748b", lab: "#94a3b8", val: "#475569" },
          run: { box: "border:1px solid #93c5fd;background:#eff6ff;", title: "#1d4ed8", lab: "#64748b", val: "#0f172a" },
          retry1: { box: "border:1px solid #fbbf24;background:#fffbeb;", title: "#b45309", lab: "#a16207", val: "#78350f" },
          retry2: { box: "border:1px solid #fb923c;background:#fff7ed;", title: "#c2410c", lab: "#c2410c", val: "#7c2d12" },
          done_ok: { box: "border:1px solid #86efac;background:#f0fdf4;", title: "#166534", lab: "#4d7c0f", val: "#14532d" },
          done_err: { box: "border:1px solid #f87171;background:#fef2f2;", title: "#b91c1c", lab: "#b91c1c", val: "#7f1d1d" },
          stop: { box: "border:1px solid #c4b5fd;background:#f5f3ff;", title: "#6d28d9", lab: "#7c3aed", val: "#4c1d95" }
        };
        var th = themes[tone] || themes.idle;
        statsBox.style.cssText =
          "padding:5px 8px;border-radius:6px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px 8px;" + th.box;
        statsTitle.style.cssText =
          "grid-column:1/-1;font-weight:700;font-size:9px;letter-spacing:0.04em;text-transform:uppercase;color:" + th.title + ";margin:0 0 1px 0;";
        Object.keys(statLabs).forEach(function (k) { if (statLabs[k]) statLabs[k].style.color = th.lab; });
        Object.keys(statCells).forEach(function (k) { if (statCells[k]) statCells[k].style.color = th.val; });
      }
      function addStatCell(key, label) {
        var w = document.createElement("div");
        w.style.cssText = "min-width:0;display:flex;align-items:baseline;gap:4px;line-height:1.25;padding:1px 0;";
        var lab = document.createElement("span");
        lab.style.cssText = "font-size:9px;flex-shrink:0;white-space:nowrap;";
        lab.textContent = label + ":";
        var val = document.createElement("span");
        val.style.cssText = "font-size:10px;font-weight:600;font-family:ui-monospace,Menlo,monospace;word-break:break-word;min-width:0;";
        val.textContent = "—";
        w.appendChild(lab);
        w.appendChild(val);
        statsBox.appendChild(w);
        statCells[key] = val;
        statLabs[key] = lab;
      }
      ["phase", "status", "block", "tags", "page", "progress", "news", "newsCount", "retries", "errors"].forEach(function (k) {
        addStatCell(k, k === "news" ? "собрано" : k === "newsCount" ? "newsCount" : k === "retries" ? "повторов" : k === "errors" ? "ошибок" : k === "phase" ? "фаза" : k === "page" ? "стр." : k === "progress" ? "прогресс" : k === "block" ? "block" : k === "tags" ? "теги" : "status");
      });
      function setStats(patch) {
        if (!patch) return;
        if (patch.tone) applyStatsTone(String(patch.tone));
        Object.keys(patch).forEach(function (k) {
          if (k === "tone") return;
          if (statCells[k] && patch[k] != null) statCells[k].textContent = String(patch[k]);
        });
      }
      applyStatsTone("idle");
      setStats({ tone: "idle", phase: "ожидание", status: "—", block: "—", tags: "—", page: "—", progress: "—", news: "0", newsCount: "—", retries: "0", errors: "0" });

      var payloadBox = document.createElement("div");
      payloadBox.style.cssText = "padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px;background:rgba(255,255,255,.9);";
      wrap.appendChild(payloadBox);
      var payloadTitle = document.createElement("div");
      payloadTitle.style.cssText = "font-weight:700;font-size:12px;color:#1e293b;margin-bottom:8px;";
      payloadTitle.textContent = "Параметры выгрузки (как в исходном скрипте)";
      payloadBox.appendChild(payloadTitle);

      function makeCompactCheckCol(title, items, required) {
        var col = document.createElement("div");
        var styleOk = "min-width:0;padding:8px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;";
        var styleBad = "min-width:0;padding:8px;border:1px solid #f87171;border-radius:8px;background:#fef2f2;";
        col.style.cssText = styleOk;
        var head = document.createElement("div");
        head.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:4px;margin-bottom:6px;";
        var lab = document.createElement("div");
        lab.style.cssText = "font-weight:700;font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.04em;";
        lab.textContent = title;
        head.appendChild(lab);
        var btnRow = document.createElement("div");
        btnRow.style.cssText = "display:flex;gap:3px;";
        head.appendChild(btnRow);
        col.appendChild(head);
        var list = document.createElement("div");
        list.style.cssText = "display:flex;flex-direction:column;gap:3px;";
        var checks = {};
        items.forEach(function (item) {
          var row = document.createElement("label");
          row.style.cssText = "margin:0;display:flex;align-items:center;gap:5px;cursor:pointer;font-size:11px;padding:3px 5px;border-radius:5px;background:#fff;border:1px solid #e2e8f0;";
          var c = document.createElement("input");
          c.type = "checkbox";
          c.checked = !!item.defaultChecked;
          c.style.cssText = "margin:0;flex-shrink:0;";
          c.addEventListener("change", refreshRequiredUi);
          checks[item.key] = c;
          var sp = document.createElement("span");
          sp.textContent = item.label || item.key;
          row.appendChild(c);
          row.appendChild(sp);
          list.appendChild(row);
        });
        col.appendChild(list);
        function setAll(v) {
          Object.keys(checks).forEach(function (k) { checks[k].checked = !!v; });
          refreshRequiredUi();
        }
        function mkTiny(txt, on) {
          var b = document.createElement("button");
          b.type = "button";
          b.textContent = txt;
          b.style.cssText = "padding:1px 5px;font-size:9px;cursor:pointer;border:1px solid #cbd5e1;border-radius:3px;background:#fff;color:#64748b;";
          b.addEventListener("click", on);
          return b;
        }
        btnRow.appendChild(mkTiny("все", function () { setAll(true); }));
        btnRow.appendChild(mkTiny("сброс", function () { setAll(false); }));
        return {
          el: col,
          getSelectedKeys: function () {
            var out = [];
            Object.keys(checks).forEach(function (k) { if (checks[k].checked) out.push(k); });
            return out;
          },
          setRequiredOk: function (ok) {
            if (!required) return;
            col.style.cssText = ok ? styleOk : styleBad;
            lab.style.color = ok ? "#475569" : "#b91c1c";
          }
        };
      }

      var selectGrid = document.createElement("div");
      selectGrid.style.cssText = "display:grid;grid-template-columns:minmax(0,0.9fr) minmax(0,1.1fr) minmax(0,1.2fr);gap:8px;margin-bottom:8px;";
      payloadBox.appendChild(selectGrid);

      var statusCtl = makeCompactCheckCol(
        "Статус *",
        NEWS_V2_CFG.STATUS_OPTIONS.map(function (o) {
          return { key: o.value, label: o.label || o.value, defaultChecked: !!o.defaultChecked };
        }),
        true
      );
      var blockCtl = makeCompactCheckCol(
        "Блок *",
        NEWS_V2_CFG.BUSINESS_BLOCK_OPTIONS.map(function (o) {
          return { key: o.value, label: o.label || o.value, defaultChecked: !!o.defaultChecked };
        }),
        true
      );
      var tagColWrap = document.createElement("div");
      tagColWrap.style.cssText = "min-width:0;padding:8px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;display:flex;flex-direction:column;gap:6px;";
      var tagCtlInner = makeCompactCheckCol(
        "Теги (опц.)",
        NEWS_V2_CFG.TAG_OPTIONS.map(function (o, idx) {
          return { key: String(idx), label: o.label || o.tagCode, defaultChecked: !!o.defaultChecked };
        }),
        false
      );
      tagCtlInner.el.style.cssText = "min-width:0;padding:0;border:none;background:transparent;";
      tagColWrap.appendChild(tagCtlInner.el);
      var inpCustomTags = document.createElement("textarea");
      inpCustomTags.rows = 2;
      inpCustomTags.placeholder = NEWS_V2_CFG.CUSTOM_TAGS_PLACEHOLDER;
      inpCustomTags.style.cssText = "width:100%;box-sizing:border-box;padding:5px 6px;font-size:10px;border:1px solid #94a3b8;border-radius:5px;resize:vertical;min-height:40px;font-family:ui-monospace,Menlo,monospace;background:#fff;";
      tagColWrap.appendChild(inpCustomTags);
      selectGrid.appendChild(statusCtl.el);
      selectGrid.appendChild(blockCtl.el);
      selectGrid.appendChild(tagColWrap);

      function refreshRequiredUi() {
        var hasStatus = statusCtl.getSelectedKeys().length > 0;
        var hasBlock = blockCtl.getSelectedKeys().length > 0;
        statusCtl.setRequiredOk(hasStatus);
        blockCtl.setRequiredOk(hasBlock);
        if (opBusy) return;
        var ok = hasStatus && hasBlock;
        btnJson.disabled = !ok;
        btnCsv.disabled = !ok;
        btnJson.style.opacity = ok ? "1" : "0.55";
        btnCsv.style.opacity = ok ? "1" : "0.55";
      }
      refreshRequiredUi();

      function setExportBusy(busy) {
        btnStop.disabled = !busy;
        btnStop.style.opacity = busy ? "1" : "0.55";
        if (busy) {
          btnJson.disabled = true;
          btnCsv.disabled = true;
          btnJson.style.opacity = "0.55";
          btnCsv.style.opacity = "0.55";
          setOpBusy(true, "выгрузка");
        } else {
          setOpBusy(false);
          refreshRequiredUi();
        }
      }

      function readPanelSelection() {
        var statuses = statusCtl.getSelectedKeys();
        var blocks = blockCtl.getSelectedKeys();
        var tags = [];
        tagCtlInner.getSelectedKeys().forEach(function (key) {
          var opt = NEWS_V2_CFG.TAG_OPTIONS[parseInt(key, 10)];
          if (opt) tags.push({ tagType: String(opt.tagType), tagCode: String(opt.tagCode) });
        });
        parseLinesToList(inpCustomTags.value).forEach(function (code) {
          tags.push({ tagType: NEWS_V2_CFG.CUSTOM_TAG_TYPE, tagCode: code });
        });
        return { newsStatuses: statuses, businessBlocks: blocks, newsTagList: tags, useTags: tags.length > 0 };
      }

      async function runExport(mode) {
        if (opBusy) {
          log("Уже выполняется другая операция — дождитесь завершения или нажмите Стоп.");
          return;
        }
        var sel = readPanelSelection();
        if (!sel.newsStatuses.length || !sel.businessBlocks.length) {
          refreshRequiredUi();
          log("Остановка: выберите хотя бы один status и один businessBlock.");
          return;
        }
        setExportBusy(true);
        var env = getEnv();
        var settings = getSharedRequestSettings();
        var range = resolvePageRange(settings, null);
        if (!range.ok) {
          setExportBusy(false);
          log("Остановка выгрузки: " + range.error);
          return;
        }
        var pageFrom = range.pageFrom;
        var pageTo = range.pageToRaw; // 0 = до последней
        var payloadGapMs = settings.opGapMs;
        var pageGapMs = settings.pageGapMs;
        var retryPauseMs = settings.retryPauseMs;
        var retryMax = settings.retryMax;
        var abortLimit = settings.abortLimit;
        var combos = [];
        for (var si = 0; si < sel.newsStatuses.length; si++) {
          for (var bi = 0; bi < sel.businessBlocks.length; bi++) {
            combos.push({
              newsStatus: sel.newsStatuses[si],
              businessBlock: sel.businessBlocks[bi],
              newsTagList: sel.newsTagList.slice()
            });
          }
        }
        log(
          "Старт выгрузки (" +
            mode +
            ") | комбинаций: " +
            combos.length +
            " | страницы: " +
            pageFrom +
            "…" +
            (pageTo > 0 ? String(pageTo) : "конец")
        );
        setStats({ tone: "run", phase: "выгрузка", progress: "0 / " + combos.length, news: "0", newsCount: "—", retries: "0", errors: "0" });

        var rawPages = [];
        var comboResults = [];
        var mergedAll = null;
        var flatRows = [];
        var errors = 0;
        var retriesTotal = 0;
        var combosOk = 0;
        var stoppedByUser = false;
        var abortedByErrors = false;
        var consecutiveExhaustedFails = 0;
        var newsTotal = 0;
        var saveDone = false;

        /** Сохранить только успешные страницы; ошибочные ответы в rawPages не попадают. */
        function finalizeExportSave(reason) {
          if (saveDone) return;
          newsTotal = flatRows.length;
          if (!rawPages.length) {
            setStats({
              tone: abortedByErrors ? "done_err" : stoppedByUser ? "stop" : "done_err",
              phase: abortedByErrors
                ? "ошибка (нет данных)"
                : stoppedByUser
                  ? "стоп (нет данных)"
                  : "нет данных",
              retries: String(retriesTotal),
              errors: String(errors)
            });
            log(
              (reason ? reason + " " : "") +
                "Выгрузка не завершена: нет успешных страниц. Повторов: " +
                retriesTotal +
                ", ошибок: " +
                errors +
                "."
            );
            return;
          }
          saveDone = true;
          var isPartial = !!(stoppedByUser || abortedByErrors || errors > 0);
          var bundle = {
            exportMeta: {
              stand: env.stand,
              contour: env.contour,
              origin: env.origin,
              fetchedAt: nowIso(),
              pagesFetched: rawPages.length,
              combosTotal: combos.length,
              combosOk: combosOk,
              stoppedByUser: !!stoppedByUser,
              abortedByErrors: !!abortedByErrors,
              partial: isPartial,
              finishReason:
                reason ||
                (abortedByErrors
                  ? "abortedByErrors"
                  : stoppedByUser
                    ? "stoppedByUser"
                    : errors > 0
                      ? "completedWithErrors"
                      : "ok"),
              retryMax: retryMax,
              retryPauseMs: retryPauseMs,
              retriesTotal: retriesTotal,
              errorsExhausted: errors,
              abortLimit: abortLimit,
              pageFrom: pageFrom,
              pageTo: pageTo > 0 ? pageTo : null,
              mode: sel.useTags ? "businessBlock+tags" : "businessBlock",
              selection: {
                newsStatuses: sel.newsStatuses,
                businessBlocks: sel.businessBlocks,
                newsTagList: sel.useTags ? sel.newsTagList : []
              },
              newsItemsFlat: newsTotal,
              newsItemsMerged: mergedAll ? countNewsInBody(mergedAll.body) : 0
            },
            comboResults: comboResults,
            pages: rawPages,
            merged: mergedAll
          };
          var prefix =
            NEWS_V2_CFG.FILENAME_PREFIX_AUTO + env.stand + "_" + env.contour + "_";
          var stamp = tsShort();
          var suffix = isPartial ? "_partial" : "";
          var fnameJson = prefix + stamp + suffix + ".json";
          var fnameTemplate =
            prefix + stamp + suffix + "_create_edit_template.json";
          try {
            downloadJson(fnameJson, bundle);
            log(
              (abortedByErrors
                ? "Авария — JSON сохранён (только успешные страницы). "
                : stoppedByUser
                  ? "Остановлено — JSON сохранён (только успешные страницы). "
                  : errors > 0
                    ? "JSON сохранён с ошибками (ошибочные страницы пропущены). "
                    : "JSON готов. ") +
                "Страниц: " +
                rawPages.length +
                " | новостей: " +
                newsTotal +
                " | файл: " +
                fnameJson
            );
          } catch (saveEx) {
            log(
              "Не удалось сохранить JSON: " +
                (saveEx && saveEx.message ? saveEx.message : String(saveEx))
            );
          }
          try {
            var workTemplate = buildCreateEditTemplateFromExportSource(
              bundle,
              NEWS_V2_CFG.DEFAULT_CREATED_BY
            );
            downloadJson(fnameTemplate, workTemplate);
            log(
              "  Шаблон create/edit: " +
                fnameTemplate +
                " | createItems=" +
                (workTemplate.createItems || []).length +
                " | updateItems=" +
                (workTemplate.updateItems || []).length
            );
          } catch (tplEx) {
            log(
              "Не удалось сохранить шаблон create/edit: " +
                (tplEx && tplEx.message ? tplEx.message : String(tplEx))
            );
          }
          if (mode === "JSON+CSV") {
            try {
              var table = buildNewsFlatCsv(flatRows);
              if (table.rows.length) {
                var fnameCsv = prefix + stamp + suffix + "_news.csv";
                downloadText(
                  fnameCsv,
                  "\uFEFF" + csvTableToText(table),
                  "text/csv;charset=utf-8"
                );
                log("  CSV: " + fnameCsv + " | строк: " + table.rows.length);
              } else {
                log("  CSV не создан: нет строк новостей среди успешных страниц.");
              }
            } catch (csvEx) {
              log(
                "Не удалось сохранить CSV: " +
                  (csvEx && csvEx.message ? csvEx.message : String(csvEx))
              );
            }
          }
          setStats({
            tone: abortedByErrors || errors > 0 ? "done_err" : stoppedByUser ? "stop" : "done_ok",
            phase: abortedByErrors
              ? "ошибка — сохранено"
              : stoppedByUser
                ? "стоп — сохранено"
                : errors > 0
                  ? "готово с ошибками"
                  : "готово",
            progress: combosOk + " OK / " + combos.length,
            news: String(newsTotal),
            retries: String(retriesTotal),
            errors: String(errors)
          });
        }

        try {
          for (var ci = 0; ci < combos.length; ci++) {
            if (isStopRequested()) { stoppedByUser = true; break; }
            var combo = combos[ci];
            var tagsStat = combo.newsTagList.length
              ? combo.newsTagList.map(function (t) { return t.tagCode; }).join(", ")
              : "—";
            sharedOpStatus.textContent =
              "Операции: выгрузка " + (ci + 1) + "/" + combos.length;
            setStats({
              tone: consecutiveExhaustedFails >= 1 ? "retry2" : "run",
              phase: (ci + 1) + "/" + combos.length,
              status: combo.newsStatus,
              block: combo.businessBlock,
              tags: tagsStat,
              progress: ci + " / " + combos.length + " завершено",
              page: "pageNum=" + pageFrom + "…",
              news: String(newsTotal)
            });
            var pageNum = pageFrom;
            var totalPages = null;
            var comboNewsCount = null;
            var mergedCombo = null;
            var comboPages = [];
            var comboHadSuccess = false;
            while (true) {
              if (isStopRequested()) { stoppedByUser = true; break; }
              var payload = {
                newsStatus: combo.newsStatus,
                businessBlock: combo.businessBlock,
                pageNum: pageNum
              };
              if (combo.newsTagList.length) payload.newsTagList = combo.newsTagList;
              setStats({
                tone: consecutiveExhaustedFails >= 1 ? "retry2" : "run",
                page: "pageNum=" + pageNum + (totalPages != null ? "/" + totalPages : "") +
                  (pageTo > 0 ? " (до " + pageTo + ")" : ""),
                status: combo.newsStatus,
                block: combo.businessBlock,
                tags: tagsStat,
                newsCount: comboNewsCount != null ? String(comboNewsCount) : "—"
              });
              var retryResult = await fetchNewsPageWithRetry(env.origin, payload, {
                log: log,
                retryMax: retryMax,
                retryPauseMs: retryPauseMs,
                shouldStop: isStopRequested,
                onAttempt: function (attempt, maxAttempts, err, meta) {
                  var m = meta || {};
                  if (m.isRetry) retriesTotal++;
                  setStats({
                    tone: err ? (consecutiveExhaustedFails >= 1 || attempt > 2 ? "retry2" : "retry1") : (consecutiveExhaustedFails >= 1 ? "retry2" : "run"),
                    phase: err ? ("повтор " + attempt + "/" + maxAttempts) : ((ci + 1) + "/" + combos.length),
                    retries: String(retriesTotal),
                    errors: String(errors)
                  });
                }
              });
              if (retryResult.stopped || isStopRequested()) { stoppedByUser = true; break; }
              if (!retryResult.ok) {
                // Ошибочную страницу не сохраняем, успешные остаются доступны для partial-файла.
                errors++;
                consecutiveExhaustedFails++;
                log(
                  "  ✗ pageNum=" +
                    pageNum +
                    " исчерпан | " +
                    (retryResult.error || "ошибка") +
                    " — страница пропущена, успешных уже собрано: " +
                    rawPages.length
                );
                if (consecutiveExhaustedFails >= abortLimit) {
                  abortedByErrors = true;
                  setStats({ tone: "done_err", phase: "ошибка — стоп", errors: String(errors) });
                  break;
                }
                var canNext =
                  (pageTo <= 0 || pageNum < pageTo) &&
                  (totalPages == null || pageNum < totalPages);
                if (canNext) {
                  pageNum++;
                  if (pageGapMs > 0) await delay(pageGapMs);
                  continue;
                }
                break;
              }
              consecutiveExhaustedFails = 0;
              comboHadSuccess = true;
              var fr = retryResult.fr;
              rawPages.push(fr.data);
              comboPages.push(fr.data);
              mergedCombo = mergeNewsPageInto(mergedCombo, fr.data);
              mergedAll = mergeNewsPageInto(mergedAll, fr.data);
              var pageMeta = readNewsPageMeta(fr.data && fr.data.body);
              var isLast = pageMeta.isLast;
              if (pageMeta.total != null) totalPages = pageMeta.total;
              if (comboNewsCount == null && fr.data.body && fr.data.body.newsCount != null) {
                var nc = Number(fr.data.body.newsCount);
                if (Number.isFinite(nc)) comboNewsCount = nc;
              }
              var pageTotalVal = totalPages != null ? totalPages : "";
              if (fr.data.body) {
                forEachNewsInBody(fr.data.body, function (newsItem) {
                  flatRows.push({
                    newsStatus: combo.newsStatus,
                    businessBlock: combo.businessBlock,
                    pageNum: pageNum,
                    total: pageTotalVal,
                    news: newsItem
                  });
                });
              }
              newsTotal = flatRows.length;
              setStats({
                tone: "run",
                page: pageNum + (totalPages != null ? "/" + totalPages : "") + (isLast ? " last" : ""),
                news: String(newsTotal),
                newsCount: comboNewsCount != null ? String(comboNewsCount) : "—",
                retries: String(retriesTotal),
                errors: String(errors)
              });
              log(
                "  → OK pageNum=" +
                  pageNum +
                  (pageMeta.num != null ? " (page.num=" + pageMeta.num + ")" : "") +
                  (totalPages != null ? " | total=" + totalPages : "") +
                  " | isLast=" +
                  (isLast ? "true" : "false") +
                  " | новостей на странице: " +
                  (fr.data.body ? countNewsInBody(fr.data.body) : 0)
              );
              // Приоритет: isLast=true — следующий запрос с большим pageNum не делаем.
              if (isLast) {
                log("  isLast=true — комбинация завершена, следующий pageNum не запрашиваем.");
                break;
              }
              if (pageTo > 0 && pageNum >= pageTo) {
                log("  Достигнут «Стр. по»=" + pageTo + " — остановка пагинации комбинации.");
                break;
              }
              if (totalPages != null && pageNum >= totalPages) {
                log("  pageNum >= total (" + totalPages + ") — остановка пагинации комбинации.");
                break;
              }
              pageNum++;
              if (pageGapMs > 0) {
                await delay(pageGapMs);
                if (isStopRequested()) { stoppedByUser = true; break; }
              }
            }
            if (comboHadSuccess) {
              combosOk++;
              comboResults.push({
                combo: {
                  newsStatus: combo.newsStatus,
                  businessBlock: combo.businessBlock,
                  newsTagList: combo.newsTagList || []
                },
                pagesFetched: comboPages.length,
                pageFrom: pageFrom,
                pageTo: pageTo > 0 ? pageTo : null,
                newsCount: mergedCombo ? countNewsInBody(mergedCombo.body) : 0,
                partial: !!stoppedByUser || !!abortedByErrors,
                pages: comboPages,
                merged: mergedCombo
              });
            }
            if (abortedByErrors || stoppedByUser) break;
            if (ci < combos.length - 1 && payloadGapMs > 0) {
              await delay(payloadGapMs);
              if (isStopRequested()) { stoppedByUser = true; break; }
            }
          }

          finalizeExportSave(
            abortedByErrors
              ? "Аварийная остановка."
              : stoppedByUser
                ? "Остановлено пользователем."
                : null
          );
        } catch (ex) {
          log(
            "Исключение выгрузки: " +
              (ex && ex.message ? ex.message : String(ex)) +
              " — пробуем сохранить уже успешные страницы (" +
              rawPages.length +
              ")."
          );
          abortedByErrors = true;
          try {
            finalizeExportSave("Исключение.");
          } catch (saveEx2) {
            log(
              "Сохранение после исключения тоже не удалось: " +
                (saveEx2 && saveEx2.message ? saveEx2.message : String(saveEx2))
            );
          }
        } finally {
          if (!saveDone && rawPages.length) {
            try {
              finalizeExportSave("Досохранение в finally.");
            } catch (_e) {
              /* ignore */
            }
          }
          setExportBusy(false);
        }
      }
    }

    var tabs = [
      { key: "export", label: "Выгрузка", render: renderExportTab },
      { key: "create", label: "Создание", render: renderCreateTab },
      { key: "status", label: "Статусы", render: renderStatusTab },
      { key: "edit", label: "Редактирование", render: renderEditTab },
      { key: "delete", label: "Удаление", render: renderDeleteTab }
    ];

    var tabBtnBaseCss =
      "padding:3px 8px;border-radius:5px;border:1px solid #94a3b8;background:#fff;color:#334155;" +
      "cursor:pointer;font-size:11px;font-weight:600;line-height:1.2;white-space:nowrap;";

    var activeTab = "";
    function switchTab(nextKey) {
      activeTab = nextKey;
      for (var i = 0; i < tabBar.children.length; i++) {
        var btn = tabBar.children[i];
        if (!btn.getAttribute || !btn.getAttribute("data-tab")) continue;
        var isOn = btn.getAttribute("data-tab") === nextKey;
        var isDel = btn.getAttribute("data-tab") === "delete";
        if (isOn && isDel) {
          btn.style.background = "#b91c1c";
          btn.style.color = "#fff";
          btn.style.borderColor = "#b91c1c";
        } else if (isOn) {
          btn.style.background = "#1d4ed8";
          btn.style.color = "#fff";
          btn.style.borderColor = "#1d4ed8";
        } else {
          btn.style.background = "#fff";
          btn.style.color = "#334155";
          btn.style.borderColor = "#94a3b8";
        }
      }
      for (var ti = 0; ti < tabs.length; ti++) {
        if (tabs[ti].key === nextKey) {
          tabs[ti].render();
          log("Открыта вкладка: " + tabs[ti].label);
          return;
        }
      }
    }

    for (var ti = 0; ti < tabs.length; ti++) {
      (function () {
        var t = tabs[ti];
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = t.label;
        b.setAttribute("data-tab", t.key);
        b.style.cssText = tabBtnBaseCss;
        b.addEventListener("click", function () {
          switchTab(t.key);
        });
        tabBar.appendChild(b);
      })();
    }

    var btnClose = document.createElement("button");
    btnClose.type = "button";
    btnClose.textContent = "Закрыть";
    btnClose.style.cssText =
      tabBtnBaseCss +
      "margin-left:auto;background:#ef4444;border-color:#ef4444;color:#fff;border-radius:6px;";
    btnClose.addEventListener("click", function () {
      root.remove();
    });
    tabBar.appendChild(btnClose);

    document.body.appendChild(root);
    devTrace.attachPanel(root);
    switchTab("export");
    log("Панель запущена. Trace — общий для всех вкладок (с маскированием ПДн).");
  }

  startPanel();
})();
