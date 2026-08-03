// =============================================================================
// News_Community_Export.js — выгрузка списка новостей community (POST /proxy/v1/news)
// =============================================================================
// DevTools на странице стенда gamification. POST JSON с пагинацией pageNum.
// Комбинации newsStatus × businessBlock (или фильтр newsTagList); JSON + CSV.
// Куки сессии вкладки: credentials: "include".
// =============================================================================
(function () {
  "use strict";



  // =============================================================================
  // НАСТРОЙКИ — правьте значения здесь при необходимости
  // =============================================================================
  var NEWS_CFG = {
    /** id DOM-панели */
    PANEL_ID: "newsCommunityExportRoot",
    /** scriptId для DevToolsTrace / имени .log */
    SCRIPT_ID: "News_Community_Export",

    /** Путь API (относительно origin) */
    NEWS_PATH: "/bo/rmkib.gamification/proxy/v1/news",

    /** Referer без тегов (относительно origin) */
    REFERER_ADMIN_COMMUNITY: "/salesheroes/admin/community",
    /** Referer с тегами: /community?newsTagList=… */
    REFERER_COMMUNITY_PATH: "/community",

    /** Стенды → контуры → origin */
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
    STAND_KEYS: ["PROM", "PSI", "IFT-SB", "IFT-GF"],
    CONTOUR_KEYS: ["ALPHA", "SIGMA"],
    /** Fallback, если origin вкладки не совпал со справочником */
    FALLBACK_STAND: "PROM",
    FALLBACK_CONTOUR: "SIGMA",

    /** Пауза между разными комбинациями payload (мс) */
    PAYLOAD_GAP_MS: 500,
    /** Пауза между страницами внутри одной комбинации (мс) */
    PAGE_GAP_MS: 100,
    /** Верхний предел пауз на панели (мс) */
    GAP_MAX_MS: 60000,

    /**
     * Повторы при ошибке HTTP / содержимого JSON:
     * пауза RETRY_PAUSE_MS, до RETRY_MAX попыток на один запрос.
     * Два подряд запроса с исчерпанными попытками → аварийная остановка с сохранением.
     */
    RETRY_MAX: 3,
    RETRY_PAUSE_MS: 2000,
    /** Сколько подряд «исчерпанных» запросов до аварийной остановки */
    CONSECUTIVE_FAIL_ABORT: 2,

    /**
     * Допустимые newsStatus — чекбоксы на панели.
     * value → в payload; label → подпись; defaultChecked → отмечен при открытии.
     */
    STATUS_OPTIONS: [
      { value: "published", label: "Опубликована (published)", defaultChecked: true },
      { value: "planned", label: "Запланирована (planned)", defaultChecked: false },
      { value: "draft", label: "Черновик (draft)", defaultChecked: false }
    ],

    /**
     * Допустимые businessBlock — чекбоксы на панели.
     */
    BUSINESS_BLOCK_OPTIONS: [
      { value: "KMKKSB", label: "KMKKSB", defaultChecked: true },
      { value: "CSM", label: "CSM", defaultChecked: false },
      { value: "AKMKKSB", label: "AKMKKSB", defaultChecked: false },
      { value: "MNS", label: "MNS", defaultChecked: false },
      { value: "KMFACTORING", label: "KMFACTORING", defaultChecked: false }
    ],

    /**
     * Теги NEWS_TYPE для опционального фильтра (по умолчанию все выключены).
     * tagType / tagCode → в newsTagList; label → подпись.
     */
    TAG_OPTIONS: [
      {
        tagType: "NEWS_TYPE",
        tagCode: "bestPractice",
        label: "Лучшие практики (bestPractice)",
        defaultChecked: false
      },
      {
        tagType: "NEWS_TYPE",
        tagCode: "achievement",
        label: "Достижения (achievement)",
        defaultChecked: false
      },
      {
        tagType: "NEWS_TYPE",
        tagCode: "publication",
        label: "Новости проекта (publication)",
        defaultChecked: false
      }
    ],

    /** tagType для пользовательских тегов из textarea */
    CUSTOM_TAG_TYPE: "TEXT",
    /** Подсказка в textarea своих тегов */
    CUSTOM_TAGS_PLACEHOLDER: "M&A\nГарантии\nВалютное хеджирование",

    /** Placeholder поля префикса имени файла */
    FILENAME_PREFIX_PLACEHOLDER: "авто: news_community_{стенд}_{контур}_",
    /** Авто-префикс: news_community_{stand}_{contour}_ */
    FILENAME_PREFIX_AUTO: "news_community_",

    /**
     * Колонки новости в CSV после параметров запроса
     * (newsStatus, businessBlock, pageNum, total).
     * newsItemStatus → поле newsStatus объекта новости.
     * Пока без полей 6–9: tbCode, gosbCode, contests, rewards.
     */
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

    /** Лимит строк журнала на панели */
    LOG_MAX_LINES: 1200,

    /** DevToolsTrace */
    TRACE_MAX_BODY_LEN: 16384,
    TRACE_MAX_LINES: 8000
  };

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

  var __nativeFetch = fetch.bind(window);
  var devTrace = createDevToolsTrace({
    scriptId: NEWS_CFG.SCRIPT_ID,
    maxBodyLen: NEWS_CFG.TRACE_MAX_BODY_LEN,
    maxLines: NEWS_CFG.TRACE_MAX_LINES
  });
  var httpFetch = devTrace.wrapFetch(__nativeFetch);

  // ---------------------------------------------------------------------------
  // Алиасы из NEWS_CFG (удобные короткие имена для кода ниже)
  // ---------------------------------------------------------------------------
  var NEWS_ORIGINS = NEWS_CFG.ORIGINS;
  var NEWS_STAND_KEYS = NEWS_CFG.STAND_KEYS;
  var NEWS_CONTOUR_KEYS = NEWS_CFG.CONTOUR_KEYS;
  var NEWS_PATH = NEWS_CFG.NEWS_PATH;
  var DEFAULT_PAYLOAD_GAP_MS = NEWS_CFG.PAYLOAD_GAP_MS;
  var DEFAULT_PAGE_GAP_MS = NEWS_CFG.PAGE_GAP_MS;
  var GAP_MAX_MS = NEWS_CFG.GAP_MAX_MS;
  var NEWS_STATUS_OPTIONS = NEWS_CFG.STATUS_OPTIONS;
  var NEWS_BUSINESS_BLOCK_OPTIONS = NEWS_CFG.BUSINESS_BLOCK_OPTIONS;
  var NEWS_TAG_OPTIONS = NEWS_CFG.TAG_OPTIONS;
  var DEFAULT_EXPORT_FILENAME_PREFIX_PLACEHOLDER = NEWS_CFG.FILENAME_PREFIX_PLACEHOLDER;
  var NEWS_CSV_DATA_KEYS = NEWS_CFG.CSV_DATA_KEYS;

  function detectNewsEnvFromLocation() {
    var origin = "";
    try {
      origin = String(window.location.origin || "").toLowerCase();
    } catch (e) {}
    for (var si = 0; si < NEWS_STAND_KEYS.length; si++) {
      var stand = NEWS_STAND_KEYS[si];
      var byStand = NEWS_ORIGINS[stand];
      if (!byStand) continue;
      for (var ci = 0; ci < NEWS_CONTOUR_KEYS.length; ci++) {
        var contour = NEWS_CONTOUR_KEYS[ci];
        var host = String((byStand && byStand[contour]) || "").toLowerCase();
        if (host && host === origin) {
          return { stand: stand, contour: contour };
        }
      }
    }
    return null;
  }

  var NEWS_AUTO_ENV = detectNewsEnvFromLocation();
  var DEFAULT_NEWS_STAND = (NEWS_AUTO_ENV && NEWS_AUTO_ENV.stand) || NEWS_CFG.FALLBACK_STAND;
  var DEFAULT_NEWS_CONTOUR = (NEWS_AUTO_ENV && NEWS_AUTO_ENV.contour) || NEWS_CFG.FALLBACK_CONTOUR;

  let NEWS_UI_STAND = DEFAULT_NEWS_STAND;
  let NEWS_UI_CONTOUR = DEFAULT_NEWS_CONTOUR;


  function getNewsEnv() {
    var stand =
      NEWS_STAND_KEYS.indexOf(NEWS_UI_STAND) >= 0 ? NEWS_UI_STAND : DEFAULT_NEWS_STAND;
    var contour =
      NEWS_CONTOUR_KEYS.indexOf(NEWS_UI_CONTOUR) >= 0
        ? NEWS_UI_CONTOUR
        : DEFAULT_NEWS_CONTOUR;
    var byStand = NEWS_ORIGINS[stand] || NEWS_ORIGINS[DEFAULT_NEWS_STAND];
    var origin =
      (byStand && byStand[contour]) || NEWS_ORIGINS[DEFAULT_NEWS_STAND][DEFAULT_NEWS_CONTOUR];
    return { stand: stand, contour: contour, origin: origin };
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function getTimestamp() {
    const d = new Date();
    const p = function (n) {
      return n.toString().padStart(2, "0");
    };
    return (
      d.getFullYear().toString() +
      p(d.getMonth() + 1) +
      p(d.getDate()) +
      "-" +
      p(d.getHours()) +
      p(d.getMinutes()) +
      p(d.getSeconds())
    );
  }

  function sanitizeExportFilenamePrefix(raw) {
    var t = String(raw || "").trim();
    if (!t) return "";
    t = t.replace(/[/\\:*?"<>|\x00-\x1f]+/g, "_").replace(/\s+/g, "_");
    if (t.length > 100) t = t.slice(0, 100);
    while (t.length && (t.endsWith("_") || t.endsWith("."))) t = t.slice(0, -1);
    return t;
  }

  /**
   * Разбор пользовательских TEXT-тегов из textarea (; / перевод строки).
   * @param {string} raw
   * @returns {string[]}
   */
  function parseCustomTagCodes(raw) {
    var text = String(raw || "");
    var parts = text.split(/[;\n\r]+/);
    var out = [];
    var seen = {};
    for (var i = 0; i < parts.length; i++) {
      var t = String(parts[i] || "").trim();
      if (!t) continue;
      if (seen[t]) continue;
      seen[t] = true;
      out.push(t);
    }
    return out;
  }

  /**
   * @param {number} pageNum
   * @param {{
   *   newsStatus: string,
   *   businessBlock?: string|null,
   *   newsTagList?: { tagType: string, tagCode: string }[]
   * }} combo
   */
  function buildNewsPayload(pageNum, combo) {
    var c = combo || {};
    /** @type {Record<string, unknown>} */
    var payload = {
      newsStatus: String(c.newsStatus || "published"),
      pageNum: Math.max(1, Math.floor(Number(pageNum) || 1))
    };
    var tags = Array.isArray(c.newsTagList) ? c.newsTagList : [];
    if (tags.length > 0) {
      payload.newsTagList = tags.map(function (t) {
        return {
          tagType: String(t.tagType || "").trim(),
          tagCode: String(t.tagCode || "").trim()
        };
      });
    } else if (c.businessBlock) {
      payload.businessBlock = String(c.businessBlock);
    }
    return payload;
  }

  /**
   * Краткая подпись комбинации для журнала / статистики.
   * @param {{
   *   newsStatus: string,
   *   businessBlock?: string|null,
   *   newsTagList?: { tagType: string, tagCode: string }[]
   * }} combo
   */
  function formatComboForLog(combo) {
    var tags = combo.newsTagList || [];
    if (tags.length > 0) {
      var tagTxt = tags
        .map(function (t) {
          return t.tagCode + "/" + t.tagType;
        })
        .join(", ");
      return "newsStatus=" + combo.newsStatus + " | tags[" + tags.length + "]: " + tagTxt;
    }
    return (
      "newsStatus=" +
      combo.newsStatus +
      " | businessBlock=" +
      (combo.businessBlock || "—")
    );
  }

  /**
   * Referer для запросов (куки сессии вкладки; Origin/Referer для SIGMA).
   * @param {string} origin
   * @param {{ tagType: string, tagCode: string }[]|null|undefined} tagList
   */
  function buildCommunityReferer(origin, tagList) {
    var base = String(origin || "").replace(/\/$/, "");
    if (tagList && tagList.length > 0) {
      var first = tagList[0];
      var q =
        "newsTagList=" +
        encodeURIComponent(String(first.tagCode)) +
        "%7C" +
        encodeURIComponent(String(first.tagType));
      return base + NEWS_CFG.REFERER_COMMUNITY_PATH + "?" + q;
    }
    return base + NEWS_CFG.REFERER_ADMIN_COMMUNITY;
  }

  /**
   * @param {string} origin
   * @param {string} contourKey
   * @param {Record<string, unknown>} payload
   */
  async function fetchNewsPage(origin, contourKey, payload) {
    var url = String(origin || "").replace(/\/$/, "") + NEWS_PATH;
    var headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7"
    };
    if (contourKey === "SIGMA" || contourKey === "ALPHA") {
      headers.Origin = origin;
      headers.Referer = buildCommunityReferer(
        origin,
        /** @type {{ tagType: string, tagCode: string }[]|undefined} */ (payload.newsTagList)
      );
    }
    var res = await httpFetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload),
      credentials: "include"
    });
    var data = await res.json().catch(function () {
      return null;
    });
    return { ok: res.ok, status: res.status, data: data, payload: payload };
  }

  /**
   * Ошибка HTTP или содержимого JSON (null = ответ пригоден).
   * @param {{ ok?: boolean, status?: number, data?: *, _exception?: string }|null} fr
   * @returns {string|null}
   */
  function getNewsResponseError(fr) {
    if (!fr) return "нет ответа";
    if (fr._exception) return "исключение: " + String(fr._exception);
    if (!fr.ok) return "HTTP " + String(fr.status != null ? fr.status : "?");
    var data = fr.data;
    if (data == null || typeof data !== "object") return "нет/невалидный JSON";
    if (data.success === false) {
      var apiTxt = "";
      if (data.error && typeof data.error === "object") {
        apiTxt = String(data.error.text || data.error.message || "").trim();
      } else if (data.error != null) {
        apiTxt = String(data.error).trim();
      }
      return "API success=false" + (apiTxt ? ": " + apiTxt : "");
    }
    if (data.error != null && data.error !== "") {
      var errTxt = "";
      if (typeof data.error === "object") {
        errTxt = String(data.error.text || data.error.message || "").trim();
        if (!errTxt) {
          try {
            errTxt = JSON.stringify(data.error);
          } catch (_e) {
            errTxt = String(data.error);
          }
        }
      } else {
        errTxt = String(data.error);
      }
      return "JSON.error: " + errTxt;
    }
    if (data.success === true && data.body == null) {
      return "JSON: success=true, но body отсутствует";
    }
    return null;
  }

  /**
   * POST с повторами при ошибке HTTP/JSON.
   * @param {string} origin
   * @param {string} contourKey
   * @param {Record<string, unknown>} payload
   * @param {{
   *   log: function(string): void,
   *   onAttempt?: function(number, number, string|null): void,
   *   shouldStop?: function(): boolean,
   *   retryMax?: number,
   *   retryPauseMs?: number
   * }} hooks
   * @returns {Promise<{
   *   ok: boolean,
   *   stopped?: boolean,
   *   fr: *,
   *   error: string|null,
   *   attempts: number
   * }>}
   */
  async function fetchNewsPageWithRetry(origin, contourKey, payload, hooks) {
    var h = hooks || {};
    var logFn = typeof h.log === "function" ? h.log : function () {};
    var onAttempt = typeof h.onAttempt === "function" ? h.onAttempt : null;
    var shouldStop = typeof h.shouldStop === "function" ? h.shouldStop : function () {
      return false;
    };
    var maxAttempts = Math.max(
      1,
      Number(h.retryMax != null ? h.retryMax : NEWS_CFG.RETRY_MAX) || 3
    );
    var pauseMs = Math.max(
      0,
      Number(h.retryPauseMs != null ? h.retryPauseMs : NEWS_CFG.RETRY_PAUSE_MS) || 2000
    );
    /** @type {*} */
    var lastFr = null;
    /** @type {string|null} */
    var lastErr = null;

    for (var attempt = 1; attempt <= maxAttempts; attempt++) {
      if (shouldStop()) {
        return { ok: false, stopped: true, fr: lastFr, error: lastErr || "стоп", attempts: attempt - 1 };
      }
      try {
        lastFr = await fetchNewsPage(origin, contourKey, payload);
        lastErr = getNewsResponseError(lastFr);
      } catch (ex) {
        lastFr = {
          ok: false,
          status: 0,
          data: null,
          payload: payload,
          _exception: ex && ex.message ? ex.message : String(ex)
        };
        lastErr = getNewsResponseError(lastFr);
      }

      if (onAttempt) onAttempt(attempt, maxAttempts, lastErr);

      if (!lastErr) {
        return { ok: true, fr: lastFr, error: null, attempts: attempt };
      }

      logFn(
        "  ошибка (попытка " +
          attempt +
          "/" +
          maxAttempts +
          "): " +
          lastErr
      );

      if (attempt < maxAttempts) {
        if (shouldStop()) {
          return { ok: false, stopped: true, fr: lastFr, error: lastErr, attempts: attempt };
        }
        logFn("  пауза " + pauseMs + " мс перед повтором…");
        if (pauseMs > 0) await delay(pauseMs);
      }
    }

    return { ok: false, fr: lastFr, error: lastErr, attempts: maxAttempts };
  }

  /**
   * Объединяет timePeriod[].news с нескольких страниц в один ответ.
   * @param {*} acc
   * @param {*} pageData
   */
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
    if (pageData.body.newsCount != null) {
      acc.body.newsCount = pageData.body.newsCount;
    }
    return acc;
  }

  /**
   * @param {*} body
   */
  function countNewsInBody(body) {
    if (!body || !Array.isArray(body.timePeriod)) return 0;
    var n = 0;
    for (var i = 0; i < body.timePeriod.length; i++) {
      var news = body.timePeriod[i] && body.timePeriod[i].news;
      if (Array.isArray(news)) n += news.length;
    }
    return n;
  }

  /**
   * Обходит все новости в timePeriod.
   * @param {*} body
   * @param {function(*, string): void} fn
   */
  function forEachNewsInBody(body, fn) {
    if (!body || !Array.isArray(body.timePeriod)) return;
    for (var i = 0; i < body.timePeriod.length; i++) {
      var period = body.timePeriod[i];
      var periodName = period && period.name != null ? String(period.name) : "";
      var newsList = period && Array.isArray(period.news) ? period.news : [];
      for (var j = 0; j < newsList.length; j++) {
        if (newsList[j] && typeof newsList[j] === "object") {
          fn(newsList[j], periodName);
        }
      }
    }
  }

  function escapeCsvField(s) {
    var t = String(s == null ? "" : s);
    if (/[\r\n",]/.test(t)) {
      return '"' + t.replace(/"/g, '""') + '"';
    }
    return t;
  }

  /**
   * Сериализация поля новости для CSV (массивы/объекты → JSON).
   * @param {*} news
   * @param {string} key
   */
  function formatNewsFieldForCsv(news, key) {
    if (!news || typeof news !== "object") return "";
    var fieldKey = key === "newsItemStatus" ? "newsStatus" : key;
    var v = news[fieldKey];
    if (v == null) return "";
    if (typeof v === "object") {
      try {
        return JSON.stringify(v);
      } catch (e) {
        return String(v);
      }
    }
    return String(v);
  }

  /**
   * CSV: параметры запроса + поля новости (одна строка на новость).
   * @param {{
   *   newsStatus: string,
   *   businessBlock: string,
   *   pageNum: number,
   *   total: number|string,
   *   news: *
   * }[]} flatRows
   * @returns {{ headers: string[], rows: string[][] }}
   */
  function buildNewsFlatCsv(flatRows) {
    var headers = ["newsStatus", "businessBlock", "pageNum", "total"].concat(NEWS_CSV_DATA_KEYS);
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
      for (var k = 0; k < NEWS_CSV_DATA_KEYS.length; k++) {
        row.push(formatNewsFieldForCsv(fr.news, NEWS_CSV_DATA_KEYS[k]));
      }
      rows.push(row);
    }
    return { headers: headers, rows: rows };
  }

  /**
   * @param {{ headers: string[], rows: string[][] }} table
   */
  function csvTableToText(table) {
    var lines = [table.headers.map(escapeCsvField).join(",")];
    for (var i = 0; i < table.rows.length; i++) {
      lines.push(
        table.rows[i]
          .map(function (c) {
            return escapeCsvField(c);
          })
          .join(",")
      );
    }
    return lines.join("\r\n") + "\r\n";
  }

  function downloadJson(name, obj) {
    var blob = new Blob([JSON.stringify(obj, null, 2)], {
      type: "application/json"
    });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
    }, 0);
  }

  function downloadText(filename, text, mimeType) {
    var blob = new Blob([text], { type: mimeType || "text/csv;charset=utf-8" });
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

  function startNewsPanel() {
    var prevRoot = document.getElementById(NEWS_CFG.PANEL_ID);
    if (prevRoot) prevRoot.remove();

    /** @type {object|null} */
    var lastExportBundle = null;

    const root = document.createElement("div");
    root.id = NEWS_CFG.PANEL_ID;
    root.style.cssText =
      "position:fixed;left:10px;top:10px;width:min(980px,calc(100vw - 16px));max-height:94vh;height:94vh;" +
      "display:flex;flex-direction:column;overflow:hidden;z-index:999999;" +
      "background:linear-gradient(165deg,#f8fafc 0%,#eef2ff 48%,#f0fdf4 100%);" +
      "border:1px solid #94a3b8;padding:14px 16px;box-shadow:0 16px 48px rgba(15,23,42,.18);border-radius:14px;" +
      "font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:12px;color:#0f172a;color-scheme:light;box-sizing:border-box;";

    const title = document.createElement("div");
    title.style.cssText =
      "font-weight:800;font-size:17px;margin-bottom:2px;color:#0f172a;letter-spacing:-0.03em;";
    title.textContent = "Новости community — выгрузка v2";
    root.appendChild(title);

    const titleSub = document.createElement("div");
    titleSub.style.cssText = "font-size:11px;color:#475569;margin-bottom:10px;line-height:1.45;";
    titleSub.textContent =
      "POST /proxy/v1/news · комбинации newsStatus × businessBlock (или фильтр по тегам) · пагинация pageNum · JSON + CSV. Куки сессии вкладки (credentials: include).";
    root.appendChild(titleSub);

    const stRow = document.createElement("div");
    stRow.style.cssText =
      "display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;font-size:12px;color:#111827;width:100%;box-sizing:border-box;" +
      "padding:8px 10px;background:rgba(255,255,255,.75);border:1px solid #cbd5e1;border-radius:10px;";

    const labSt = document.createElement("label");
    labSt.textContent = "Стенд:";
    labSt.style.cssText = "font-weight:700;color:#111827;";
    const selStand = document.createElement("select");
    selStand.style.cssText =
      "padding:4px 8px;font-size:12px;min-width:120px;cursor:pointer;color:#111827;background:#fff;border:1px solid #64748b;border-radius:6px;color-scheme:light;";
    NEWS_STAND_KEYS.forEach(function (key) {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = key;
      if (key === NEWS_UI_STAND) opt.selected = true;
      selStand.appendChild(opt);
    });
    selStand.addEventListener("change", function () {
      NEWS_UI_STAND = selStand.value;
    });
    stRow.appendChild(labSt);
    stRow.appendChild(selStand);

    const labContour = document.createElement("label");
    labContour.textContent = "Контур:";
    labContour.style.cssText = "font-weight:700;color:#111827;";
    const selContour = document.createElement("select");
    selContour.style.cssText =
      "padding:4px 8px;font-size:12px;min-width:110px;cursor:pointer;color:#111827;background:#fff;border:1px solid #64748b;border-radius:6px;color-scheme:light;";
    function refreshContourOptions() {
      var prev = NEWS_UI_CONTOUR;
      selContour.innerHTML = "";
      NEWS_CONTOUR_KEYS.forEach(function (key) {
        const opt = document.createElement("option");
        opt.value = key;
        opt.textContent = key;
        if (key === prev) opt.selected = true;
        selContour.appendChild(opt);
      });
    }
    refreshContourOptions();
    selStand.addEventListener("change", refreshContourOptions);
    selContour.addEventListener("change", function () {
      NEWS_UI_CONTOUR = selContour.value;
    });
    stRow.appendChild(labContour);
    stRow.appendChild(selContour);

    const envInfo = document.createElement("div");
    envInfo.style.cssText =
      "margin-left:auto;font-size:11px;color:#334155;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis;font-family:ui-monospace,Menlo,monospace;";
    function refreshEnvInfo() {
      try {
        envInfo.textContent = "POST " + getNewsEnv().origin;
      } catch (e) {
        envInfo.textContent = "";
      }
    }
    selStand.addEventListener("change", refreshEnvInfo);
    selContour.addEventListener("change", refreshEnvInfo);
    refreshEnvInfo();
    stRow.appendChild(envInfo);
    root.appendChild(stRow);

    const panelScroll = document.createElement("div");
    panelScroll.style.cssText =
      "flex:1 1 0;min-height:0;overflow-y:auto;overflow-x:hidden;box-sizing:border-box;-webkit-overflow-scrolling:touch;";
    root.appendChild(panelScroll);

    /** Блок живой статистики текущего запроса */
    const statsBox = document.createElement("div");
    statsBox.style.cssText =
      "margin-bottom:8px;padding:8px 10px;border:1px solid #86efac;border-radius:8px;" +
      "background:rgba(240,253,244,.92);display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px 10px;";
    const statsTitle = document.createElement("div");
    statsTitle.style.cssText =
      "grid-column:1/-1;font-weight:700;font-size:10px;color:#166534;letter-spacing:0.03em;text-transform:uppercase;";
    statsTitle.textContent = "Статистика";
    statsBox.appendChild(statsTitle);

    /** @type {Record<string, HTMLElement>} */
    var statCells = {};
    function addStatCell(key, label) {
      var wrap = document.createElement("div");
      wrap.style.cssText = "min-width:0;";
      var lab = document.createElement("div");
      lab.style.cssText = "font-size:9px;color:#64748b;margin-bottom:0;";
      lab.textContent = label;
      var val = document.createElement("div");
      val.style.cssText =
        "font-size:11px;font-weight:600;color:#0f172a;font-family:ui-monospace,Menlo,monospace;" +
        "word-break:break-word;line-height:1.3;";
      val.textContent = "—";
      wrap.appendChild(lab);
      wrap.appendChild(val);
      statsBox.appendChild(wrap);
      statCells[key] = val;
    }
    addStatCell("phase", "Фаза");
    addStatCell("combo", "Комбинация");
    addStatCell("status", "newsStatus");
    addStatCell("blockOrTags", "businessBlock / теги");
    addStatCell("page", "Страница");
    addStatCell("progress", "Прогресс комбинаций");
    addStatCell("news", "Новостей собрано");
    addStatCell("errors", "Ошибок / пропусков");

    /**
     * @param {Partial<{
     *   phase: string,
     *   combo: string,
     *   status: string,
     *   blockOrTags: string,
     *   page: string,
     *   progress: string,
     *   news: string,
     *   errors: string
     * }>} patch
     */
    function setStats(patch) {
      if (!patch) return;
      Object.keys(patch).forEach(function (k) {
        if (statCells[k] && patch[k] != null) statCells[k].textContent = String(patch[k]);
      });
    }
    setStats({
      phase: "ожидание",
      combo: "—",
      status: "—",
      blockOrTags: "—",
      page: "—",
      progress: "—",
      news: "0",
      errors: "0"
    });
    panelScroll.appendChild(statsBox);

    const payloadBox = document.createElement("div");
    payloadBox.style.cssText =
      "margin-bottom:10px;padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px;background:rgba(255,255,255,.9);";

    const payloadHead = document.createElement("div");
    payloadHead.style.cssText =
      "display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:8px;flex-wrap:wrap;";
    const payloadTitle = document.createElement("div");
    payloadTitle.style.cssText = "font-weight:700;font-size:12px;color:#1e293b;";
    payloadTitle.textContent = "Параметры";
    const payloadHint = document.createElement("div");
    payloadHint.style.cssText = "font-size:10px;color:#64748b;";
    payloadHint.textContent = "теги → без businessBlock · status × block последовательно";
    payloadHead.appendChild(payloadTitle);
    payloadHead.appendChild(payloadHint);
    payloadBox.appendChild(payloadHead);

    /**
     * Компактная колонка чекбоксов.
     * @param {string} title
     * @param {{ key: string, label: string, short?: string, defaultChecked?: boolean }[]} items
     * @returns {{ el: HTMLElement, getSelectedKeys: function(): string[], setAll: function(boolean): void }}
     */
    function makeCompactCheckCol(title, items) {
      const col = document.createElement("div");
      col.style.cssText =
        "min-width:0;padding:8px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;";

      const head = document.createElement("div");
      head.style.cssText =
        "display:flex;align-items:center;justify-content:space-between;gap:4px;margin-bottom:6px;";
      const lab = document.createElement("div");
      lab.style.cssText =
        "font-weight:700;font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.04em;";
      lab.textContent = title;
      head.appendChild(lab);

      const btnRow = document.createElement("div");
      btnRow.style.cssText = "display:flex;gap:3px;";
      function mkTiny(txt, on) {
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = txt;
        b.style.cssText =
          "padding:1px 5px;font-size:9px;cursor:pointer;border:1px solid #cbd5e1;border-radius:3px;" +
          "background:#fff;color:#64748b;line-height:1.2;";
        b.addEventListener("click", on);
        return b;
      }
      head.appendChild(btnRow);
      col.appendChild(head);

      const list = document.createElement("div");
      list.style.cssText = "display:flex;flex-direction:column;gap:3px;";
      /** @type {Record<string, HTMLInputElement>} */
      const checks = {};
      items.forEach(function (item) {
        const row = document.createElement("label");
        row.style.cssText =
          "margin:0;display:flex;align-items:center;gap:5px;cursor:pointer;font-size:11px;" +
          "padding:3px 5px;border-radius:5px;background:#fff;border:1px solid #e2e8f0;line-height:1.25;";
        row.title = item.label || item.key;
        const c = document.createElement("input");
        c.type = "checkbox";
        c.checked = !!item.defaultChecked;
        c.style.cssText = "margin:0;flex-shrink:0;";
        checks[item.key] = c;
        const sp = document.createElement("span");
        sp.style.cssText =
          "color:#334155;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;";
        sp.textContent = item.label || item.short || item.key;
        row.appendChild(c);
        row.appendChild(sp);
        list.appendChild(row);
      });
      col.appendChild(list);

      function setAll(v) {
        Object.keys(checks).forEach(function (k) {
          checks[k].checked = !!v;
        });
      }
      btnRow.appendChild(
        mkTiny("все", function () {
          setAll(true);
        })
      );
      btnRow.appendChild(
        mkTiny("сброс", function () {
          setAll(false);
        })
      );

      return {
        el: col,
        getSelectedKeys: function () {
          const out = [];
          Object.keys(checks).forEach(function (k) {
            if (checks[k].checked) out.push(k);
          });
          return out;
        },
        setAll: setAll
      };
    }

    const selectGrid = document.createElement("div");
    selectGrid.style.cssText =
      "display:grid;grid-template-columns:minmax(0,0.9fr) minmax(0,1.1fr) minmax(0,1.2fr);gap:8px;margin-bottom:8px;";

    const statusCtl = makeCompactCheckCol(
      "Статус",
      NEWS_STATUS_OPTIONS.map(function (opt) {
        return {
          key: opt.value,
          label: opt.label || opt.value,
          defaultChecked: !!opt.defaultChecked
        };
      })
    );

    const blockCtl = makeCompactCheckCol(
      "Блок",
      NEWS_BUSINESS_BLOCK_OPTIONS.map(function (opt) {
        return {
          key: opt.value,
          label: opt.label || opt.value,
          defaultChecked: !!opt.defaultChecked
        };
      })
    );

    const tagColWrap = document.createElement("div");
    tagColWrap.style.cssText =
      "min-width:0;padding:8px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;display:flex;flex-direction:column;gap:6px;";
    const tagCtlInner = makeCompactCheckCol(
      "Теги NEWS_TYPE",
      NEWS_TAG_OPTIONS.map(function (opt, idx) {
        return {
          key: String(idx),
          label: opt.label || opt.tagCode,
          defaultChecked: !!opt.defaultChecked
        };
      })
    );
    // Вложим список тегов без внешней рамки makeCompactCheckCol — переиспользуем el
    tagCtlInner.el.style.cssText =
      "min-width:0;padding:0;border:none;border-radius:0;background:transparent;";
    tagColWrap.appendChild(tagCtlInner.el);

    const inpCustomTags = document.createElement("textarea");
    inpCustomTags.rows = 2;
    inpCustomTags.placeholder = NEWS_CFG.CUSTOM_TAGS_PLACEHOLDER;
    inpCustomTags.title = "Свои TEXT-теги: ; или перевод строки";
    inpCustomTags.style.cssText =
      "width:100%;box-sizing:border-box;padding:5px 6px;font-size:10px;border:1px solid #94a3b8;border-radius:5px;" +
      "resize:vertical;min-height:40px;max-height:72px;font-family:ui-monospace,Menlo,monospace;color-scheme:light;background:#fff;";
    const customHint = document.createElement("div");
    customHint.style.cssText = "font-size:9px;color:#94a3b8;margin-top:-2px;";
    customHint.textContent = "свои TEXT (; / Enter)";
    tagColWrap.appendChild(inpCustomTags);
    tagColWrap.appendChild(customHint);

    const tagCtl = {
      getSelectedKeys: tagCtlInner.getSelectedKeys,
      setAll: tagCtlInner.setAll
    };

    selectGrid.appendChild(statusCtl.el);
    selectGrid.appendChild(blockCtl.el);
    selectGrid.appendChild(tagColWrap);
    payloadBox.appendChild(selectGrid);

    /** Компактное числовое поле настройки */
    function mkNumField(labelText, value, title) {
      const lab = document.createElement("label");
      lab.style.cssText =
        "display:flex;flex-direction:column;gap:2px;font-size:10px;color:#64748b;min-width:0;";
      lab.title = title || labelText;
      const cap = document.createElement("span");
      cap.textContent = labelText;
      cap.style.cssText = "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
      const inp = document.createElement("input");
      inp.type = "number";
      inp.min = "0";
      inp.value = String(value);
      inp.style.cssText =
        "width:100%;box-sizing:border-box;padding:4px 6px;font-size:11px;border:1px solid #94a3b8;" +
        "border-radius:5px;color-scheme:light;background:#fff;color:#0f172a;";
      lab.appendChild(cap);
      lab.appendChild(inp);
      return { lab: lab, inp: inp };
    }

    const timingBox = document.createElement("div");
    timingBox.style.cssText =
      "display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;align-items:end;" +
      "padding-top:8px;border-top:1px solid #e2e8f0;";

    const fPayloadGap = mkNumField(
      "Пауза payload, мс",
      DEFAULT_PAYLOAD_GAP_MS,
      "Пауза между комбинациями newsStatus×businessBlock"
    );
    fPayloadGap.inp.max = String(GAP_MAX_MS);
    const inpPayloadGapMs = fPayloadGap.inp;

    const fPageGap = mkNumField(
      "Пауза страниц, мс",
      DEFAULT_PAGE_GAP_MS,
      "Пауза между pageNum внутри комбинации"
    );
    fPageGap.inp.max = String(GAP_MAX_MS);
    const inpPageGapMs = fPageGap.inp;

    const fRetryPause = mkNumField(
      "Пауза повтора, мс",
      NEWS_CFG.RETRY_PAUSE_MS,
      "Пауза перед повтором при ошибке HTTP/JSON"
    );
    fRetryPause.inp.max = String(GAP_MAX_MS);
    const inpRetryPauseMs = fRetryPause.inp;

    const fRetryMax = mkNumField(
      "Попыток",
      NEWS_CFG.RETRY_MAX,
      "Число попыток одного запроса при ошибке"
    );
    fRetryMax.inp.min = "1";
    fRetryMax.inp.max = "20";
    const inpRetryMax = fRetryMax.inp;

    const labPrefix = document.createElement("label");
    labPrefix.style.cssText =
      "display:flex;flex-direction:column;gap:2px;font-size:10px;color:#64748b;grid-column:span 2;min-width:0;";
    labPrefix.appendChild(document.createTextNode("Префикс файла"));
    const inpFnamePrefix = document.createElement("input");
    inpFnamePrefix.type = "text";
    inpFnamePrefix.placeholder = DEFAULT_EXPORT_FILENAME_PREFIX_PLACEHOLDER;
    inpFnamePrefix.style.cssText =
      "width:100%;box-sizing:border-box;padding:4px 6px;font-size:11px;border:1px solid #94a3b8;" +
      "border-radius:5px;color-scheme:light;background:#fff;";
    labPrefix.appendChild(inpFnamePrefix);

    timingBox.appendChild(fPayloadGap.lab);
    timingBox.appendChild(fPageGap.lab);
    timingBox.appendChild(fRetryPause.lab);
    timingBox.appendChild(fRetryMax.lab);
    timingBox.appendChild(labPrefix);
    payloadBox.appendChild(timingBox);
    panelScroll.appendChild(payloadBox);

    const LOG_MAX_LINES = NEWS_CFG.LOG_MAX_LINES;
    const logWrap = document.createElement("div");
    logWrap.style.cssText =
      "margin-top:8px;flex-shrink:0;display:flex;flex-direction:column;height:min(180px,22vh);min-height:88px;max-height:26vh;box-sizing:border-box;";
    const logLab = document.createElement("div");
    logLab.style.cssText = "font-weight:600;font-size:11px;color:#475569;margin-bottom:4px;flex-shrink:0;";
    logLab.textContent = "Журнал работы:";
    devTrace.mountToggleRow(logWrap, logLab);
    logWrap.appendChild(logLab);
    const logEl = document.createElement("div");
    logEl.style.cssText =
      "flex:1 1 auto;min-height:0;overflow-y:auto;font-size:11px;color:#0f172a;background:rgba(248,250,252,.95);" +
      "border:1px solid #cbd5e1;border-radius:8px;padding:8px;";
    logWrap.appendChild(logEl);

    function formatLogTime() {
      const d = new Date();
      const p = function (n) {
        return n.toString().padStart(2, "0");
      };
      return (
        p(d.getHours()) +
        ":" +
        p(d.getMinutes()) +
        ":" +
        p(d.getSeconds()) +
        "." +
        d.getMilliseconds().toString().padStart(3, "0")
      );
    }

    function log(msg) {
      devTrace.log(String(msg));
      const line = document.createElement("div");
      line.style.cssText =
        "margin:0 0 3px 0;line-height:1.35;word-break:break-word;font-family:ui-monospace,Menlo,monospace;font-size:10px;";
      line.textContent = formatLogTime() + "  " + msg;
      logEl.appendChild(line);
      while (logEl.childElementCount > LOG_MAX_LINES) {
        logEl.removeChild(logEl.firstElementChild);
      }
      logEl.scrollTop = logEl.scrollHeight;
    }

    log(
      "Панель v2. status×block или теги. Паузы/повторы — в блоке параметров."
    );

    /**
     * @returns {{
     *   newsStatuses: string[],
     *   businessBlocks: string[],
     *   newsTagList: { tagType: string, tagCode: string }[],
     *   useTags: boolean
     * }}
     */
    function readPanelSelection() {
      var statuses = statusCtl.getSelectedKeys();
      var blocks = blockCtl.getSelectedKeys();
      var tagKeys = tagCtl.getSelectedKeys();
      /** @type {{ tagType: string, tagCode: string }[]} */
      var tags = [];
      tagKeys.forEach(function (key) {
        var idx = parseInt(key, 10);
        var opt = NEWS_TAG_OPTIONS[idx];
        if (opt) {
          tags.push({ tagType: String(opt.tagType), tagCode: String(opt.tagCode) });
        }
      });
      var customCodes = parseCustomTagCodes(inpCustomTags.value);
      customCodes.forEach(function (code) {
        tags.push({ tagType: NEWS_CFG.CUSTOM_TAG_TYPE, tagCode: code });
      });
      return {
        newsStatuses: statuses,
        businessBlocks: blocks,
        newsTagList: tags,
        useTags: tags.length > 0
      };
    }

    /**
     * Строит список комбинаций для последовательных запросов.
     * @param {{
     *   newsStatuses: string[],
     *   businessBlocks: string[],
     *   newsTagList: { tagType: string, tagCode: string }[],
     *   useTags: boolean
     * }} sel
     * @returns {{ newsStatus: string, businessBlock?: string|null, newsTagList?: { tagType: string, tagCode: string }[] }[]}
     */
    function buildCombos(sel) {
      /** @type {{ newsStatus: string, businessBlock?: string|null, newsTagList?: { tagType: string, tagCode: string }[] }[]} */
      var combos = [];
      if (sel.useTags) {
        for (var i = 0; i < sel.newsStatuses.length; i++) {
          combos.push({
            newsStatus: sel.newsStatuses[i],
            businessBlock: null,
            newsTagList: sel.newsTagList.slice()
          });
        }
      } else {
        for (var si = 0; si < sel.newsStatuses.length; si++) {
          for (var bi = 0; bi < sel.businessBlocks.length; bi++) {
            combos.push({
              newsStatus: sel.newsStatuses[si],
              businessBlock: sel.businessBlocks[bi],
              newsTagList: []
            });
          }
        }
      }
      return combos;
    }

    /**
     * @param {{
     *   newsStatuses: string[],
     *   businessBlocks: string[],
     *   newsTagList: { tagType: string, tagCode: string }[],
     *   useTags: boolean
     * }} sel
     */
    function validateSelection(sel) {
      if (!sel.newsStatuses || sel.newsStatuses.length === 0) {
        log("Остановка: не выбран ни один newsStatus.");
        return false;
      }
      if (sel.useTags) {
        if (!sel.newsTagList || sel.newsTagList.length === 0) {
          log("Остановка: режим тегов, но список newsTagList пуст.");
          return false;
        }
        return true;
      }
      if (!sel.businessBlocks || sel.businessBlocks.length === 0) {
        log("Остановка: не выбран ни один businessBlock (и не заданы теги).");
        return false;
      }
      return true;
    }

    function readGapMs(inp, fallback) {
      const n = parseInt(String(inp.value || "").trim(), 10);
      if (!Number.isFinite(n) || n < 0) return fallback;
      if (n > GAP_MAX_MS) return GAP_MAX_MS;
      return n;
    }

    function readRetryMax() {
      const n = parseInt(String(inpRetryMax.value || "").trim(), 10);
      if (!Number.isFinite(n) || n < 1) return NEWS_CFG.RETRY_MAX || 3;
      if (n > 20) return 20;
      return n;
    }

    function readRetryPauseMs() {
      return readGapMs(inpRetryPauseMs, NEWS_CFG.RETRY_PAUSE_MS || 2000);
    }

    function buildExportFilenamePrefix(standKey, contourKey) {
      var custom = sanitizeExportFilenamePrefix(inpFnamePrefix.value);
      if (custom) return custom.endsWith("_") ? custom : custom + "_";
      return NEWS_CFG.FILENAME_PREFIX_AUTO + standKey + "_" + contourKey + "_";
    }

    var fetchBusy = false;
    /** Флаг кнопки «Стоп»: прервать после текущего запроса и сохранить уже загруженное. */
    var stopRequested = false;

    function setExportButtonsBusy(busy) {
      btnJson.disabled = busy;
      btnCsv.disabled = busy;
      btnStop.disabled = !busy;
      var op = busy ? "0.55" : "1";
      var cur = busy ? "wait" : "pointer";
      btnJson.style.opacity = op;
      btnCsv.style.opacity = op;
      btnJson.style.cursor = cur;
      btnCsv.style.cursor = cur;
      btnStop.style.opacity = busy ? "1" : "0.55";
      btnStop.style.cursor = busy ? "pointer" : "not-allowed";
    }

    /**
     * Выгрузка всех комбинаций с пагинацией.
     * При stopRequested — выход после текущего POST; уже загруженные страницы возвращаются.
     * @param {string} sourceTag
     * @returns {Promise<{
     *   bundle: object,
     *   prefix: string,
     *   ts: string,
     *   pagesCount: number,
     *   newsTotal: number,
     *   flatRows: object[],
     *   errors: number,
     *   combosOk: number,
     *   combosSkip: number,
     *   stopped: boolean
     * }|null>}
     */
    async function runNewsFetch(sourceTag) {
      var env = getNewsEnv();
      var payloadGapMs = readGapMs(inpPayloadGapMs, DEFAULT_PAYLOAD_GAP_MS);
      var pageGapMs = readGapMs(inpPageGapMs, DEFAULT_PAGE_GAP_MS);
      var retryMax = readRetryMax();
      var retryPauseMs = readRetryPauseMs();
      var sel = readPanelSelection();
      if (!validateSelection(sel)) {
        return null;
      }
      var combos = buildCombos(sel);
      var prefix = buildExportFilenamePrefix(env.stand, env.contour);
      stopRequested = false;

      log(
        "Старт (" +
          (sourceTag || "") +
          ") | " +
          env.stand +
          "/" +
          env.contour +
          " | комбинаций: " +
          combos.length +
          " | режим: " +
          (sel.useTags ? "теги" : "businessBlock") +
          " | пауза payload " +
          payloadGapMs +
          " / страницы " +
          pageGapMs +
          " | повтор " +
          retryPauseMs +
          " мс × " +
          retryMax
      );

      setStats({
        phase: "выгрузка",
        progress: "0 / " + combos.length,
        news: "0",
        errors: "0",
        page: "—"
      });

      /** @type {*[]} */
      var rawPages = [];
      /** @type {*[]} */
      var comboResults = [];
      var mergedAll = null;
      /** @type {object[]} */
      var flatRows = [];
      var errors = 0;
      var combosOk = 0;
      var combosSkip = 0;
      var newsTotal = 0;
      var stoppedByUser = false;
      var abortedByErrors = false;
      var consecutiveExhaustedFails = 0;
      var abortLimit = Math.max(1, Number(NEWS_CFG.CONSECUTIVE_FAIL_ABORT) || 2);
      /** @type {{ message: string, combo: string, pageNum: number, error: string, payload: * }|null} */
      var fatalErrorInfo = null;
      /** @type {{ combo: string, pageNum: number, error: string, payload: * }|null} */
      var lastExhaustedFail = null;

      for (var ci = 0; ci < combos.length; ci++) {
        if (stopRequested) {
          stoppedByUser = true;
          log("Стоп: дальнейшие комбинации пропущены.");
          break;
        }

        var combo = combos[ci];
        var comboLabel = formatComboForLog(combo);
        var blockOrTags = sel.useTags
          ? (combo.newsTagList || [])
              .map(function (t) {
                return t.tagCode;
              })
              .join(", ")
          : String(combo.businessBlock || "—");

        setStats({
          phase: "комбинация " + (ci + 1) + "/" + combos.length,
          combo: comboLabel,
          status: String(combo.newsStatus),
          blockOrTags: blockOrTags,
          progress: ci + " / " + combos.length + " завершено",
          page: "запрос pageNum=1…",
          news: String(newsTotal),
          errors: String(errors)
        });

        log("─── Комбинация " + (ci + 1) + "/" + combos.length + ": " + comboLabel);

        var pageNum = 1;
        var totalPages = null;
        var mergedCombo = null;
        var comboPages = [];
        var comboHadSuccess = false;
        var comboAborted = false;

        while (!comboAborted) {
          if (stopRequested) {
            stoppedByUser = true;
            log("  Стоп: пагинация комбинации прервана.");
            break;
          }

          var payload = buildNewsPayload(pageNum, combo);
          var reqLabel = comboLabel + " | pageNum=" + pageNum;
          setStats({
            page:
              "pageNum=" +
              pageNum +
              (totalPages != null ? " / total=" + totalPages : " (ожидаем total)"),
            status: String(combo.newsStatus),
            blockOrTags: blockOrTags,
            combo: comboLabel
          });

          log(
            "  POST pageNum=" +
              pageNum +
              " | " +
              JSON.stringify(payload)
          );

          var retryResult = await fetchNewsPageWithRetry(
            env.origin,
            env.contour,
            payload,
            {
              log: log,
              retryMax: retryMax,
              retryPauseMs: retryPauseMs,
              shouldStop: function () {
                return !!stopRequested;
              },
              onAttempt: function (attempt, maxAttempts, err) {
                setStats({
                  phase: err
                    ? "повтор " + attempt + "/" + maxAttempts
                    : "комбинация " + (ci + 1) + "/" + combos.length,
                  page:
                    "pageNum=" +
                    pageNum +
                    (err ? " | ошибка: " + String(err).slice(0, 80) : "")
                });
              }
            }
          );

          if (retryResult.stopped || stopRequested) {
            stoppedByUser = true;
            log("  Стоп во время запроса/повторов.");
            break;
          }

          if (!retryResult.ok) {
            errors++;
            consecutiveExhaustedFails++;
            var failErr = retryResult.error || "неизвестная ошибка";
            log(
              "  Исчерпаны " +
                retryResult.attempts +
                " попыток: " +
                failErr +
                " → пропуск этого запроса (" +
                consecutiveExhaustedFails +
                "/" +
                abortLimit +
                " подряд)"
            );

            lastExhaustedFail = {
              combo: comboLabel,
              pageNum: pageNum,
              error: failErr,
              payload: payload
            };

            if (consecutiveExhaustedFails >= abortLimit) {
              abortedByErrors = true;
              fatalErrorInfo = {
                message:
                  "Два запроса подряд исчерпали " +
                  retryMax +
                  " попыток — аварийная остановка",
                combo: comboLabel,
                pageNum: pageNum,
                error: failErr,
                payload: payload
              };
              setStats({
                phase: "ошибка — стоп",
                combo: comboLabel,
                page:
                  "pageNum=" +
                  pageNum +
                  " | " +
                  String(failErr).slice(0, 100),
                errors: String(errors)
              });
              log(
                "АВАРИЯ: " +
                  fatalErrorInfo.message +
                  " | " +
                  reqLabel +
                  " | " +
                  failErr
              );
              break;
            }

            // Пропуск текущего запроса → следующий pageNum или следующая комбинация
            if (totalPages != null && pageNum < totalPages) {
              pageNum++;
              if (pageGapMs > 0) await delay(pageGapMs);
              continue;
            }
            comboAborted = true;
            break;
          }

          consecutiveExhaustedFails = 0;
          var fr = retryResult.fr;

          comboHadSuccess = true;
          rawPages.push(fr.data);
          comboPages.push(fr.data);
          mergedCombo = mergeNewsPageInto(mergedCombo, fr.data);
          mergedAll = mergeNewsPageInto(mergedAll, fr.data);

          var pageInfo = fr.data.body && fr.data.body.page;
          var isLast = pageInfo && pageInfo.isLast === true;
          var total = pageInfo && pageInfo.total != null ? Number(pageInfo.total) : null;
          if (Number.isFinite(total) && total > 0) totalPages = total;
          var num = pageInfo && pageInfo.num != null ? pageInfo.num : pageNum;
          var newsOnPage = fr.data.body ? countNewsInBody(fr.data.body) : 0;

          var pageTotalVal = totalPages != null ? totalPages : total != null ? total : "";
          if (fr.data.body) {
            forEachNewsInBody(fr.data.body, function (newsItem) {
              flatRows.push({
                newsStatus: combo.newsStatus,
                businessBlock: combo.businessBlock || "",
                pageNum: pageNum,
                total: pageTotalVal,
                news: newsItem
              });
            });
          }
          newsTotal = flatRows.length;

          setStats({
            page:
              "page.num=" +
              num +
              (totalPages != null ? " / total=" + totalPages : "") +
              " | isLast=" +
              (isLast ? "true" : "false"),
            news: String(newsTotal),
            errors: String(errors),
            phase: "комбинация " + (ci + 1) + "/" + combos.length
          });

          log(
            "  → OK" +
              (retryResult.attempts > 1
                ? " (с " + retryResult.attempts + " попытки)"
                : "") +
              " | page.num=" +
              num +
              (totalPages != null ? " | total=" + totalPages : "") +
              " | isLast=" +
              (isLast ? "true" : "false") +
              " | новостей на странице: " +
              newsOnPage
          );

          if (!fr.data.body || (!pageInfo && newsOnPage === 0)) {
            log("  Пустое тело / нет page — завершение комбинации");
            break;
          }

          if (isLast) break;
          if (totalPages != null && pageNum >= totalPages) break;
          if (totalPages === 0) break;

          pageNum++;
          if (pageGapMs > 0) {
            await delay(pageGapMs);
            if (stopRequested) {
              stoppedByUser = true;
              log("  Стоп после паузы страницы.");
              break;
            }
          }
        }

        if (abortedByErrors) {
          if (comboHadSuccess) {
            combosOk++;
            comboResults.push({
              combo: {
                newsStatus: combo.newsStatus,
                businessBlock: combo.businessBlock || null,
                newsTagList: combo.newsTagList || []
              },
              pagesFetched: comboPages.length,
              newsCount: mergedCombo ? countNewsInBody(mergedCombo.body) : 0,
              partial: true,
              merged: mergedCombo
            });
          } else if (comboAborted) {
            combosSkip++;
          }
          break;
        }

        if (comboHadSuccess) {
          combosOk++;
          comboResults.push({
            combo: {
              newsStatus: combo.newsStatus,
              businessBlock: combo.businessBlock || null,
              newsTagList: combo.newsTagList || []
            },
            pagesFetched: comboPages.length,
            newsCount: mergedCombo ? countNewsInBody(mergedCombo.body) : 0,
            partial: !!comboAborted || stoppedByUser,
            merged: mergedCombo
          });
          log(
            "  Комбинация " +
              (comboAborted || stoppedByUser ? "частично OK" : "OK") +
              ": страниц " +
              comboPages.length +
              ", новостей " +
              (mergedCombo ? countNewsInBody(mergedCombo.body) : 0)
          );
        } else if (comboAborted) {
          combosSkip++;
        }

        setStats({
          progress: ci + 1 + " / " + combos.length + " завершено",
          news: String(newsTotal),
          errors: String(errors)
        });

        if (stoppedByUser || abortedByErrors) break;

        if (ci < combos.length - 1 && payloadGapMs > 0) {
          await delay(payloadGapMs);
          if (stopRequested) {
            stoppedByUser = true;
            log("Стоп после паузы между payload.");
            break;
          }
        }
      }

      if (rawPages.length === 0) {
        setStats({
          phase: abortedByErrors
            ? "ошибка (нет данных)"
            : stoppedByUser
              ? "стоп (нет данных)"
              : "нет данных",
          page: fatalErrorInfo
            ? "pageNum=" + fatalErrorInfo.pageNum + " | " + fatalErrorInfo.error
            : "—",
          combo: fatalErrorInfo ? fatalErrorInfo.combo : "—"
        });
        log(
          (abortedByErrors
            ? "Аварийная остановка. "
            : stoppedByUser
              ? "Остановлено пользователем. "
              : "") +
            "Выгрузка не завершена: нет успешных страниц. Ошибок/пропусков: " +
            errors +
            "."
        );
        if (fatalErrorInfo) {
          log(
            "Последний сбой: " +
              fatalErrorInfo.combo +
              " | pageNum=" +
              fatalErrorInfo.pageNum +
              " | " +
              fatalErrorInfo.error
          );
        }
        console.log("[News community] Файлы не созданы.");
        return null;
      }

      var bundle = {
        exportMeta: {
          stand: env.stand,
          contour: env.contour,
          origin: env.origin,
          fetchedAt: new Date().toISOString(),
          pagesFetched: rawPages.length,
          combosTotal: combos.length,
          combosOk: combosOk,
          combosSkip: combosSkip,
          stoppedByUser: !!stoppedByUser,
          abortedByErrors: !!abortedByErrors,
          fatalError: fatalErrorInfo,
          lastExhaustedFail: lastExhaustedFail,
          retryMax: retryMax,
          retryPauseMs: retryPauseMs,
          mode: sel.useTags ? "tags" : "businessBlock",
          selection: {
            newsStatuses: sel.newsStatuses,
            businessBlocks: sel.useTags ? [] : sel.businessBlocks,
            newsTagList: sel.useTags ? sel.newsTagList : []
          },
          newsItemsFlat: newsTotal,
          newsItemsMerged: mergedAll ? countNewsInBody(mergedAll.body) : 0
        },
        comboResults: comboResults,
        pages: rawPages,
        merged: mergedAll
      };
      lastExportBundle = bundle;

      setStats({
        phase: abortedByErrors
          ? "ошибка — данные сохранены"
          : stoppedByUser
            ? "стоп — сохранение"
            : "готово",
        progress:
          combosOk +
          " OK / " +
          combosSkip +
          " skip / " +
          combos.length +
          " всего" +
          (abortedByErrors ? " (авария)" : stoppedByUser ? " (прервано)" : ""),
        news: String(newsTotal),
        errors: String(errors),
        page: fatalErrorInfo
          ? "pageNum=" +
            fatalErrorInfo.pageNum +
            " | " +
            String(fatalErrorInfo.error).slice(0, 90)
          : "—",
        combo: fatalErrorInfo ? fatalErrorInfo.combo : undefined
      });

      return {
        bundle: bundle,
        prefix: prefix,
        ts: getTimestamp(),
        pagesCount: rawPages.length,
        newsTotal: newsTotal,
        flatRows: flatRows,
        errors: errors,
        combosOk: combosOk,
        combosSkip: combosSkip,
        stopped: !!stoppedByUser,
        abortedByErrors: !!abortedByErrors,
        fatalError: fatalErrorInfo
      };
    }

    function saveCsvFromFlatRows(flatRows, prefix, ts) {
      var table = buildNewsFlatCsv(flatRows);
      var fname = prefix + ts + "_news.csv";
      if (!table.rows.length) {
        return { saved: false, fname: fname, rowCount: 0 };
      }
      var text = "\uFEFF" + csvTableToText(table);
      downloadText(fname, text, "text/csv;charset=utf-8");
      return { saved: true, fname: fname, rowCount: table.rows.length };
    }

    async function runNewsJsonExport() {
      if (fetchBusy) {
        log("Выгрузка уже выполняется.");
        return;
      }
      fetchBusy = true;
      stopRequested = false;
      setExportButtonsBusy(true);
      lastExportBundle = null;
      try {
        var result = await runNewsFetch("JSON");
        if (!result) return;

        var fname = result.prefix + result.ts + ".json";
        downloadJson(fname, result.bundle);
        log(
          (result.abortedByErrors
            ? "Авария — JSON сохранён. "
            : result.stopped
              ? "Остановлено — JSON сохранён. "
              : "JSON готов. ") +
            "Страниц: " +
            result.pagesCount +
            " | новостей: " +
            result.newsTotal +
            " | OK комб.: " +
            result.combosOk +
            " | skip: " +
            result.combosSkip +
            " | файл: " +
            fname
        );
        if (result.fatalError) {
          log(
            "  Сбой: " +
              result.fatalError.combo +
              " | pageNum=" +
              result.fatalError.pageNum +
              " | " +
              result.fatalError.error
          );
        }
        console.log(
          "[News community] JSON: " +
            fname +
            " | страниц: " +
            result.pagesCount +
            " | новостей: " +
            result.newsTotal +
            (result.abortedByErrors ? " | ABORTED_BY_ERRORS" : "") +
            (result.stopped ? " | STOPPED" : "")
        );
      } finally {
        fetchBusy = false;
        stopRequested = false;
        setExportButtonsBusy(false);
      }
    }

    async function runNewsCsvExport() {
      if (fetchBusy) {
        log("Выгрузка уже выполняется.");
        return;
      }
      fetchBusy = true;
      stopRequested = false;
      setExportButtonsBusy(true);
      lastExportBundle = null;
      try {
        log("JSON+CSV: запуск выгрузки…");
        var result = await runNewsFetch("JSON+CSV");
        if (!result) return;

        var fnameJson = result.prefix + result.ts + ".json";
        downloadJson(fnameJson, result.bundle);

        var csvInfo = saveCsvFromFlatRows(result.flatRows, result.prefix, result.ts);
        log(
          (result.abortedByErrors
            ? "Авария — файлы сохранены. "
            : result.stopped
              ? "Остановлено — файлы сохранены. "
              : "Готово (JSON+CSV). ") +
            "Страниц: " +
            result.pagesCount +
            " | новостей: " +
            result.newsTotal +
            " | JSON: " +
            fnameJson
        );
        if (result.fatalError) {
          log(
            "  Сбой: " +
              result.fatalError.combo +
              " | pageNum=" +
              result.fatalError.pageNum +
              " | " +
              result.fatalError.error
          );
        }
        if (csvInfo.saved) {
          log("  CSV: " + csvInfo.fname + " | строк: " + csvInfo.rowCount);
        } else {
          log("  CSV не создан: нет строк новостей.");
        }
        console.log(
          "[News community] JSON+CSV | JSON: " +
            fnameJson +
            " | CSV: " +
            (csvInfo.saved ? csvInfo.fname + " (" + csvInfo.rowCount + " строк)" : "нет строк") +
            (result.abortedByErrors ? " | ABORTED_BY_ERRORS" : "") +
            (result.stopped ? " | STOPPED" : "")
        );
      } finally {
        fetchBusy = false;
        stopRequested = false;
        setExportButtonsBusy(false);
      }
    }

    const btnBase =
      "padding:11px 12px;font-size:12px;cursor:pointer;border:none;border-radius:8px;font-weight:700;" +
      "color:#fff;text-align:center;line-height:1.35;box-sizing:border-box;width:100%;" +
      "box-shadow:0 2px 8px rgba(15,23,42,.12);";

    const actionGrid = document.createElement("div");
    actionGrid.style.cssText =
      "display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0 10px;";

    const btnJson = document.createElement("button");
    btnJson.type = "button";
    btnJson.textContent = "Загрузить → JSON";
    btnJson.style.cssText = btnBase + "background:#2563eb;";
    btnJson.addEventListener("click", function () {
      void runNewsJsonExport();
    });
    actionGrid.appendChild(btnJson);

    const btnCsv = document.createElement("button");
    btnCsv.type = "button";
    btnCsv.textContent = "Выгрузить JSON + CSV";
    btnCsv.style.cssText = btnBase + "background:#059669;";
    btnCsv.addEventListener("click", function () {
      void runNewsCsvExport();
    });
    actionGrid.appendChild(btnCsv);

    const btnStop = document.createElement("button");
    btnStop.type = "button";
    btnStop.textContent = "Стоп";
    btnStop.title =
      "Остановить запросы после текущего POST и сохранить уже успешно загруженные данные в файлы";
    btnStop.disabled = true;
    btnStop.style.cssText = btnBase + "background:#dc2626;opacity:0.55;cursor:not-allowed;";
    btnStop.addEventListener("click", function () {
      if (!fetchBusy) return;
      if (stopRequested) {
        log("Стоп уже запрошен — ожидаем завершения текущего запроса…");
        return;
      }
      stopRequested = true;
      setStats({ phase: "стоп… (ждём текущий POST)" });
      log("Стоп запрошен: после текущего запроса сохраним уже загруженное.");
    });
    actionGrid.appendChild(btnStop);
    panelScroll.appendChild(actionGrid);

    root.appendChild(logWrap);

    const btnClose = document.createElement("button");
    btnClose.type = "button";
    btnClose.textContent = "Закрыть панель";
    btnClose.style.cssText =
      "margin-top:8px;width:100%;padding:8px;cursor:pointer;background:#f1f5f9;color:rgb(15,23,42);" +
      "border:1px solid #94a3b8;border-radius:6px;font-size:12px;flex-shrink:0;";
    btnClose.addEventListener("click", function () {
      root.remove();
    });
    root.appendChild(btnClose);

    document.body.appendChild(root);
    devTrace.attachPanel(root);
    console.log("[News community] Панель v2 открыта. Журнал — на панели.");
  }

  startNewsPanel();
})();
