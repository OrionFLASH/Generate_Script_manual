// =============================================================================
// News_Community_Export_v2.js — создание/статусы/редактирование news community
// =============================================================================
// Запуск: DevTools Console на странице community/admin community.
// Куки берутся из текущей вкладки (credentials: "include").
// =============================================================================
(function () {
  "use strict";

  var NEWS_V2_CFG = {
    PANEL_ID: "newsCommunityExportV2Root",
    NEWS_PATH: "/bo/rmkib.gamification/proxy/v1/news",
    NEWS_CREATE_PATH: "/bo/rmkib.gamification/proxy/v1/administration/news/newsCreate",
    NEWS_UPDATE_PATH: "/bo/rmkib.gamification/proxy/v1/administration/news/newsUpdate",
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
    LOG_MAX_LINES: 1200
  };

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
    if (t === "individualAchievement") return "achievement";
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
    var rewardsSource = source.rewardList || source.rewards || [];
    var tournamentsSource = source.tournamentList || [];
    var contestsSource = source.contests || [];
    var tagsSource = source.tagList || source.newsTagList || [];
    var businessBlocks =
      source.businessBlocks || parseMaybeJsonArray((source.newsFeatureObj || {}).businessBlock);
    var createdBy =
      String(source.createdBy || "").trim() ||
      String(defaultCreatedBy || "").trim() ||
      (authorsSource[0] && String(authorsSource[0].employeeNumber || "").trim()) ||
      (leadersSource[0] && String(leadersSource[0].employeeNumber || "").trim()) ||
      "";

    var rewardList = rewardsSource
      .map(function (r) {
        var code = r && typeof r === "object" ? r.rewardCode : r;
        return String(code || "").trim();
      })
      .filter(Boolean)
      .map(function (rewardCode) {
        return { rewardCode: rewardCode };
      });

    var tournamentList = tournamentsSource
      .map(function (t) {
        var code = t && typeof t === "object" ? t.tournamentCode : t;
        return String(code || "").trim();
      })
      .filter(Boolean)
      .map(function (tournamentCode) {
        return { tournamentCode: tournamentCode };
      });

    if (!tournamentList.length && Array.isArray(contestsSource)) {
      for (var ci = 0; ci < contestsSource.length; ci++) {
        var contest = contestsSource[ci];
        if (!contest || !Array.isArray(contest.tournaments)) continue;
        for (var ti = 0; ti < contest.tournaments.length; ti++) {
          var tournamentCode = String(
            (contest.tournaments[ti] && contest.tournaments[ti].tournamentCode) || ""
          ).trim();
          if (tournamentCode) tournamentList.push({ tournamentCode: tournamentCode });
        }
      }
    }

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
      plannedDt: nowIso(),
      status: "draft",
      createDt: batchStartIso || nowIso()
    };

    return payload;
  }

  /**
   * Режим «болванка»: принудительно очищает leaders/authors в кандидатах создания.
   * @param {object[]} list
   * @param {boolean} enabled
   */
  function applyCreateStubModeToCandidates(list, enabled) {
    if (!enabled || !Array.isArray(list)) return;
    for (var i = 0; i < list.length; i++) {
      if (!list[i] || !list[i].payload) continue;
      list[i].payload.authorsList = [];
      list[i].payload.leadersList = [];
      list[i].authorsCount = 0;
      list[i].leadersCount = 0;
    }
  }

  function compactNewsLabel(meta) {
    var summary = ensureString(meta && meta.summary).trim();
    if (summary) return summary.slice(0, 100);
    var text = ensureString(meta && (meta.newsText || meta.description)).trim();
    if (text) return text.slice(0, 100);
    return "без заголовка";
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
   * Собирает новости из экспортного JSON: pages[], comboResults, merged.
   * Важно: берём все страницы/body, не только первую.
   * @param {*} source
   * @returns {*[]}
   */
  function collectNewsRowsFromExportJson(source) {
    var rows = [];
    var seenIds = {};
    if (!source) return rows;

    if (Array.isArray(source)) {
      for (var ai = 0; ai < source.length; ai++) {
        if (source[ai] && typeof source[ai] === "object") rows.push(source[ai]);
      }
      return rows;
    }

    if (Array.isArray(source.createItems)) return source.createItems.slice();
    if (Array.isArray(source.statusItems)) return source.statusItems.slice();

    if (Array.isArray(source.pages)) {
      for (var pi = 0; pi < source.pages.length; pi++) {
        var page = source.pages[pi];
        pushNewsFromBody(page && page.body, rows, seenIds);
      }
    }

    if (Array.isArray(source.comboResults)) {
      for (var ci = 0; ci < source.comboResults.length; ci++) {
        var cr = source.comboResults[ci] || {};
        if (Array.isArray(cr.pages)) {
          for (var cpi = 0; cpi < cr.pages.length; cpi++) {
            pushNewsFromBody(cr.pages[cpi] && cr.pages[cpi].body, rows, seenIds);
          }
        }
        pushNewsFromBody(cr.merged && cr.merged.body, rows, seenIds);
      }
    }

    if (source.merged && source.merged.body) {
      pushNewsFromBody(source.merged.body, rows, seenIds);
    }

    // одиночный ответ API / payload
    if (!rows.length && source.body && Array.isArray(source.body.timePeriod)) {
      pushNewsFromBody(source.body, rows, seenIds);
    }
    if (!rows.length && source.payload) rows = [source.payload];
    if (!rows.length && (source.newsId || source.newsType || source.newsText || source.description)) {
      rows = [source];
    }
    return rows;
  }

  function extractCreateCandidatesFromAnyJson(inputJson, defaultCreatedBy, batchStartIso, options) {
    var rows = collectNewsRowsFromExportJson(inputJson);
    var candidates = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var payload = buildCreatePayloadFromSourceItem(row, defaultCreatedBy, batchStartIso, options);
      candidates.push({
        selected: true,
        sourceNewsId: ensureString(row.newsId || row.objectId || ""),
        sourceType: normalizeType(row.newsType || row.type),
        summary: compactNewsLabel(row),
        authorsCount: Array.isArray(payload.authorsList) ? payload.authorsList.length : 0,
        leadersCount: Array.isArray(payload.leadersList) ? payload.leadersList.length : 0,
        payload: payload
      });
    }
    return candidates;
  }

  function validateCreatePayload(payload) {
    if (!payload || typeof payload !== "object") return "payload отсутствует";
    if (!payload.type || NEWS_V2_CFG.NEWS_TYPES.indexOf(payload.type) < 0) {
      return "некорректный type";
    }
    if (!String(payload.createdBy || "").trim()) return "пустой createdBy";
    return "";
  }

  function buildStatusCandidatesFromAnyJson(inputJson, defaultStatus) {
    var rows;
    if (inputJson && Array.isArray(inputJson.statusItems)) {
      rows = inputJson.statusItems;
    } else {
      rows = collectNewsRowsFromExportJson(inputJson);
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
    var response = await fetch(url, options);
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

  function getNewsResponseError(fr) {
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
    if (data.success === true && data.body == null) return "JSON: success=true, но body отсутствует";
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

  function buildCreateTemplate() {
    return {
      info: "Шаблон для создания news. Можно передать массив createItems или одиночный объект.",
      createItems: [
        {
          bankLevel: false,
          rewardList: [{ rewardCode: "r_01_2026-1_01-1_1" }],
          tournamentList: [{ tournamentCode: "t_01_2026-1_01-1_1_4001" }],
          newsFeature: "{\"alphaLink\":\"\",\"sigmaLink\":\"\",\"businessBlock\":[\"KMKKSB\"]}",
          type: "bestPractice",
          description: "Текст новости",
          summary: "Заголовок новости",
          authorsList: [{ employeeNumber: "00673892" }],
          tagList: [{ tagValue: "ТЕСТ" }],
          tbCodeList: ["99"],
          gosbCodeList: [],
          leadersList: [{ employeeNumber: "02122594" }],
          createdBy: "00673892"
        }
      ]
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
    return {
      bankLevel: source.bankLevel !== false,
      rewardList: (source.rewards || [])
        .map(function (r) {
          return r && r.rewardCode ? { rewardCode: String(r.rewardCode) } : null;
        })
        .filter(Boolean),
      tournamentList: (source.tournamentList || [])
        .map(function (t) {
          return t && t.tournamentCode ? { tournamentCode: String(t.tournamentCode) } : null;
        })
        .filter(Boolean),
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
      "position:fixed;left:10px;top:10px;width:min(1200px,calc(100vw - 20px));height:94vh;" +
      "z-index:999999;background:linear-gradient(165deg,#f8fafc 0%,#eef2ff 48%,#f0fdf4 100%);" +
      "border:1px solid #94a3b8;border-radius:14px;" +
      "box-shadow:0 16px 48px rgba(15,23,42,.18);display:flex;flex-direction:column;overflow:hidden;" +
      "font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;color:#0f172a;color-scheme:light;";

    var title = document.createElement("div");
    title.style.cssText =
      "font-size:17px;font-weight:800;padding:12px 14px 4px;border-bottom:1px solid #e2e8f0;";
    title.textContent = "Новости community v2 — создание / статусы / редактирование";
    root.appendChild(title);

    var subtitle = document.createElement("div");
    subtitle.style.cssText = "padding:0 14px 10px;color:#475569;font-size:12px;border-bottom:1px solid #e2e8f0;";
    subtitle.textContent =
      "Основной режим: загрузка JSON-файла, выбор новостей, подтверждение и отправка запросов.";
    root.appendChild(subtitle);

    var envRow = document.createElement("div");
    envRow.style.cssText =
      "display:flex;gap:8px;align-items:center;padding:8px 14px;background:#f1f5f9;border-bottom:1px solid #e2e8f0;";
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

    var main = document.createElement("div");
    main.style.cssText = "flex:1;min-height:0;display:flex;overflow:hidden;";
    root.appendChild(main);

    var left = document.createElement("div");
    left.style.cssText = "width:220px;border-right:1px solid #e2e8f0;background:#f8fafc;padding:8px;display:flex;flex-direction:column;gap:6px;";
    main.appendChild(left);

    var right = document.createElement("div");
    right.style.cssText = "flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden;";
    main.appendChild(right);

    var content = document.createElement("div");
    content.style.cssText = "flex:1;min-height:0;overflow:auto;padding:10px 12px;";
    right.appendChild(content);

    var logWrap = document.createElement("div");
    logWrap.style.cssText = "height:190px;border-top:1px solid #e2e8f0;background:#fff;padding:8px 12px;display:flex;flex-direction:column;";
    right.appendChild(logWrap);
    var logTitle = document.createElement("div");
    logTitle.textContent = "Журнал";
    logTitle.style.cssText = "font-size:11px;font-weight:700;color:#334155;margin-bottom:6px;";
    logWrap.appendChild(logTitle);
    var logEl = document.createElement("div");
    logEl.style.cssText = "flex:1;overflow:auto;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc;padding:6px;font-family:ui-monospace,monospace;font-size:11px;";
    logWrap.appendChild(logEl);

    function log(msg) {
      var line = document.createElement("div");
      line.style.cssText = "margin-bottom:3px;line-height:1.35;";
      line.textContent = nowIso() + "  " + msg;
      logEl.appendChild(line);
      while (logEl.childElementCount > NEWS_V2_CFG.LOG_MAX_LINES) {
        logEl.removeChild(logEl.firstElementChild);
      }
      logEl.scrollTop = logEl.scrollHeight;
    }

    function mkBtn(text, onClick, extraCss) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      b.style.cssText =
        "padding:6px 9px;border-radius:6px;border:1px solid #94a3b8;background:#fff;color:#0f172a;cursor:pointer;font-size:12px;font-weight:600;" +
        (extraCss || "");
      b.addEventListener("click", onClick);
      return b;
    }

    function clearContent() {
      content.innerHTML = "";
    }

    function renderCandidatesTable(candidates, type, opts) {
      var options = opts || {};
      var onSelectionChange =
        typeof options.onSelectionChange === "function" ? options.onSelectionChange : function () {};
      var box = document.createElement("div");
      box.style.cssText = "border:1px solid #cbd5e1;border-radius:8px;overflow:hidden;background:#fff;";
      var head = document.createElement("div");
      head.style.cssText = "display:grid;grid-template-columns:26px 120px 1fr 90px 90px 170px;gap:8px;padding:6px 8px;font-size:11px;font-weight:700;background:#f1f5f9;border-bottom:1px solid #e2e8f0;";
      ["✓", "Тип", "Заголовок", "Авторов", "Лидеров", "ID новости"].forEach(function (h) {
        var c = document.createElement("div");
        c.textContent = h;
        head.appendChild(c);
      });
      box.appendChild(head);

      for (var i = 0; i < candidates.length; i++) {
        (function () {
          var item = candidates[i];
          var row = document.createElement("div");
          row.style.cssText = "display:grid;grid-template-columns:26px 120px 1fr 90px 90px 170px;gap:8px;padding:6px 8px;font-size:11px;border-bottom:1px solid #f1f5f9;align-items:center;";
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
          function addCell(text) {
            var cell = document.createElement("div");
            cell.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
            cell.textContent = ensureString(text);
            row.appendChild(cell);
          }
          addCell(item.sourceType || item.type || "");
          addCell(item.summary || "");
          addCell(item.authorsCount != null ? item.authorsCount : "");
          addCell(item.leadersCount != null ? item.leadersCount : "");
          addCell(item.sourceNewsId || item.newsId || "");
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
        "Создавать болванки: leadersList и authorsList всегда пустые, даже если заполнены в файле";
      var stubModeCb = document.createElement("input");
      stubModeCb.type = "checkbox";
      stubModeCb.checked = false;
      stubModeLabel.appendChild(stubModeCb);
      stubModeLabel.appendChild(document.createTextNode("Болванка: без leaders и authors"));
      top.appendChild(stubModeLabel);

      var fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".json,application/json";
      fileInput.style.display = "none";
      top.appendChild(fileInput);
      top.appendChild(
        mkBtn("Выбрать файл JSON", function () {
          fileInput.click();
        })
      );

      var manualInput = document.createElement("textarea");
      manualInput.placeholder = "Вставьте JSON вручную (объект или массив)";
      manualInput.rows = 6;
      manualInput.style.cssText = "width:100%;padding:8px;border:1px solid #94a3b8;border-radius:6px;font-family:ui-monospace,monospace;font-size:12px;";
      wrap.appendChild(manualInput);

      var actions = document.createElement("div");
      actions.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;";
      wrap.appendChild(actions);

      var tableHost = document.createElement("div");
      wrap.appendChild(tableHost);

      var candidates = [];
      var searchInput = document.createElement("input");
      searchInput.type = "text";
      searchInput.placeholder = "Поиск по типу / заголовку / ID";
      searchInput.style.cssText = "width:100%;padding:8px;border:1px solid #94a3b8;border-radius:6px;font-size:12px;";
      wrap.appendChild(searchInput);
      var selectionInfo = document.createElement("div");
      selectionInfo.style.cssText = "font-size:11px;color:#475569;";
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
            ensureString(item.sourceType || item.type),
            ensureString(item.summary),
            ensureString(item.sourceNewsId || item.newsId)
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
      }

      function setAllSelected(next) {
        for (var i = 0; i < candidates.length; i++) candidates[i].selected = !!next;
        renderList();
      }

      function clearLoadedSelection() {
        candidates = [];
        manualInput.value = "";
        fileInput.value = "";
        searchInput.value = "";
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
            ensureString(candidates[i].sourceType || candidates[i].type),
            ensureString(candidates[i].summary),
            ensureString(candidates[i].sourceNewsId || candidates[i].newsId)
          ]
            .join(" ")
            .toLowerCase();
          if (hay.indexOf(q) >= 0) candidates[i].selected = !!next;
        }
        renderList();
      }

      async function parseFromText(text) {
        var parsed = safeParseJson(text);
        if (!parsed.ok) {
          log("Ошибка JSON: " + parsed.error.message);
          return;
        }
        var batchStartIso = nowIso();
        var createdByValue = String(createdByInput.value || "").trim() || NEWS_V2_CFG.DEFAULT_CREATED_BY;
        var stubMode = !!stubModeCb.checked;
        candidates = extractCreateCandidatesFromAnyJson(
          parsed.value,
          createdByValue,
          batchStartIso,
          { ignoreLeadersAuthors: stubMode }
        );
        for (var ci = 0; ci < candidates.length; ci++) {
          if (!String(candidates[ci].payload.createdBy || "").trim()) {
            candidates[ci].payload.createdBy = createdByValue;
          }
        }
        applyCreateStubModeToCandidates(candidates, stubMode);
        renderList();
        log(
          "Загружено записей для создания: " +
            candidates.length +
            (stubMode ? " | режим болванки: без leaders/authors" : "")
        );
      }

      stubModeCb.addEventListener("change", function () {
        if (!candidates.length) {
          log(
            stubModeCb.checked
              ? "Режим болванки включён: при загрузке/создании leaders и authors будут пустыми."
              : "Режим болванки выключен."
          );
          return;
        }
        if (stubModeCb.checked) {
          applyCreateStubModeToCandidates(candidates, true);
          renderList();
          log("Режим болванки: leaders/authors очищены у загруженных записей.");
        } else {
          log(
            "Режим болванки выключен. Перезагрузите JSON, чтобы восстановить leaders/authors из файла."
          );
        }
      });

      actions.appendChild(
        mkBtn("Шаблон JSON", function () {
          downloadJson("news_create_template_" + tsShort() + ".json", buildCreateTemplate());
          log("Скачан шаблон создания.");
        })
      );
      actions.appendChild(
        mkBtn("Разобрать JSON из поля", function () {
          void parseFromText(manualInput.value);
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
          "Создать выбранные",
          function () {
            void (async function () {
              var selected = candidates.filter(function (c) {
                return c.selected !== false;
              });
              if (!selected.length) {
                log("Нет выбранных записей для создания.");
                return;
              }

              var errors = [];
              var createdByValue = String(createdByInput.value || "").trim() || NEWS_V2_CFG.DEFAULT_CREATED_BY;
              var stubMode = !!stubModeCb.checked;
              applyCreateStubModeToCandidates(selected, stubMode);
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
              var okCount = 0;
              var failCount = 0;
              var resultDump = [];
              for (var si = 0; si < selected.length; si++) {
                var payload = selected[si].payload;
                if (stubMode) {
                  payload.authorsList = [];
                  payload.leadersList = [];
                }
                var res = await postJson(
                  env.origin + NEWS_V2_CFG.NEWS_CREATE_PATH,
                  payload,
                  env.origin + "/salesheroes/admin/community/create"
                );
                var success = !!(
                  res.ok &&
                  res.data &&
                  res.data.success === true &&
                  res.data.body &&
                  res.data.body.objectId
                );
                resultDump.push({ payload: payload, response: res });
                if (success) {
                  okCount++;
                  log(
                    "Создано: objectId=" + res.data.body.objectId + " | type=" + payload.type + " | " + compactNewsLabel(payload)
                  );
                } else {
                  failCount++;
                  log("Ошибка создания: HTTP " + res.status + " | " + compactNewsLabel(payload));
                }
              }

              downloadJson(
                "news_create_result_" + env.stand + "_" + env.contour + "_" + tsShort() + ".json",
                {
                  env: env,
                  stubMode: stubMode,
                  total: selected.length,
                  okCount: okCount,
                  failCount: failCount,
                  results: resultDump
                }
              );
              log(
                "Создание завершено. OK=" +
                  okCount +
                  ", FAIL=" +
                  failCount +
                  (stubMode ? " | болванка без leaders/authors" : "") +
                  "."
              );
            })();
          },
          "background:#16a34a;color:#fff;border-color:#16a34a;"
        )
      );

      fileInput.addEventListener("change", function () {
        void (async function () {
          var file = fileInput.files && fileInput.files[0];
          if (!file) return;
          var text = await readFileAsText(file);
          await parseFromText(text);
        })();
      });
      searchInput.addEventListener("input", renderList);
    }

    function renderStatusTab() {
      clearContent();
      var wrap = document.createElement("div");
      wrap.style.cssText = "display:flex;flex-direction:column;gap:10px;";
      content.appendChild(wrap);

      var top = document.createElement("div");
      top.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;align-items:center;";
      wrap.appendChild(top);

      var targetSel = document.createElement("select");
      targetSel.style.cssText = "padding:6px 8px;border:1px solid #94a3b8;border-radius:6px;";
      [{ v: "published", t: "published (Опубликована)" }, { v: "draft", t: "draft (Черновик)" }].forEach(function (x) {
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
        mkBtn("Выбрать файл JSON", function () {
          fileInput.click();
        })
      );

      var idsInput = document.createElement("textarea");
      idsInput.rows = 5;
      idsInput.placeholder = "ID новостей: по одному на строку или через ;";
      idsInput.style.cssText = "width:100%;padding:8px;border:1px solid #94a3b8;border-radius:6px;font-family:ui-monospace,monospace;font-size:12px;";
      wrap.appendChild(idsInput);

      var actions = document.createElement("div");
      actions.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;";
      wrap.appendChild(actions);

      var tableHost = document.createElement("div");
      wrap.appendChild(tableHost);

      var candidates = [];
      var searchInput = document.createElement("input");
      searchInput.type = "text";
      searchInput.placeholder = "Поиск по типу / заголовку / ID";
      searchInput.style.cssText = "width:100%;padding:8px;border:1px solid #94a3b8;border-radius:6px;font-size:12px;";
      wrap.appendChild(searchInput);
      var selectionInfo = document.createElement("div");
      selectionInfo.style.cssText = "font-size:11px;color:#475569;";
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
        mkBtn("Шаблон JSON", function () {
          downloadJson("news_status_template_" + tsShort() + ".json", buildStatusTemplate(targetSel.value));
          log("Скачан шаблон статусов.");
        })
      );
      actions.appendChild(
        mkBtn("Разобрать JSON из файла/поля", function () {
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
      actions.appendChild(mkBtn("Очистить загруженное", function () { clearLoadedSelection(); }));
      actions.appendChild(
        mkBtn(
          "Применить статус",
          function () {
            void (async function () {
              var selected = candidates.filter(function (c) {
                return c.selected !== false;
              });
              if (!selected.length) {
                log("Нет выбранных записей для смены статуса.");
                return;
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
              if (!window.confirm("Сменить статус для " + selected.length + " новостей?")) {
                log("Операция отменена пользователем.");
                return;
              }
              var env = getEnv();
              var okCount = 0;
              var failCount = 0;
              var dump = [];
              for (var si = 0; si < selected.length; si++) {
                var item = selected[si];
                var payload = { newsId: item.newsId, status: item.targetStatus, method: "patch" };
                var res = await postJson(
                  env.origin + NEWS_V2_CFG.NEWS_UPDATE_PATH,
                  payload,
                  env.origin + "/salesheroes/admin/community/" + item.newsId
                );
                var success = !!(res.ok && res.data && res.data.success === true);
                dump.push({ payload: payload, response: res });
                if (success) {
                  okCount++;
                  log("Статус обновлён: newsId=" + item.newsId + " -> " + item.targetStatus);
                } else {
                  failCount++;
                  log("Ошибка статуса: newsId=" + item.newsId + " | HTTP " + res.status);
                }
              }
              downloadJson(
                "news_status_result_" + env.stand + "_" + env.contour + "_" + tsShort() + ".json",
                { env: env, total: selected.length, okCount: okCount, failCount: failCount, results: dump }
              );
              log("Смена статусов завершена. OK=" + okCount + ", FAIL=" + failCount + ".");
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
      wrap.style.cssText = "display:flex;flex-direction:column;gap:10px;";
      content.appendChild(wrap);

      var note = document.createElement("div");
      note.style.cssText = "padding:8px;border:1px solid #fde68a;border-radius:6px;background:#fffbeb;font-size:12px;color:#713f12;";
      note.textContent =
        "Редактирование: можно загрузить JSON updateItems или сначала загрузить текущие новости с сервера, выбрать нужные и сформировать payload.";
      wrap.appendChild(note);

      var fetchBox = document.createElement("div");
      fetchBox.style.cssText = "padding:8px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;";
      wrap.appendChild(fetchBox);

      var fetchTitle = document.createElement("div");
      fetchTitle.textContent = "Загрузка текущих новостей для редактирования";
      fetchTitle.style.cssText = "font-size:12px;font-weight:700;margin-bottom:8px;";
      fetchBox.appendChild(fetchTitle);

      function mkInlineMulti(label, values, defaultValue) {
        var row = document.createElement("div");
        row.style.cssText = "margin-bottom:6px;";
        var cap = document.createElement("div");
        cap.textContent = label;
        cap.style.cssText = "font-size:11px;color:#334155;margin-bottom:4px;";
        row.appendChild(cap);
        var checks = [];
        for (var i = 0; i < values.length; i++) {
          var lb = document.createElement("label");
          lb.style.cssText = "display:inline-flex;align-items:center;gap:4px;margin-right:10px;font-size:12px;";
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
            return checks.filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
          }
        };
      }

      var editStatusCtl = mkInlineMulti(
        "Status",
        optionValues(NEWS_V2_CFG.STATUS_OPTIONS),
        "published"
      );
      var editBlockCtl = mkInlineMulti(
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
      fetchPagesInput.style.cssText = "padding:4px 6px;border:1px solid #94a3b8;border-radius:6px;width:90px;margin-right:8px;";
      fetchBox.appendChild(fetchPagesInput);
      fetchBox.appendChild(document.createTextNode("макс. страниц на комбинацию"));

      var fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".json,application/json";
      fileInput.style.display = "none";
      wrap.appendChild(fileInput);
      wrap.appendChild(
        mkBtn("Выбрать файл JSON", function () {
          fileInput.click();
        })
      );

      var manualInput = document.createElement("textarea");
      manualInput.rows = 7;
      manualInput.placeholder = "JSON: { updateItems: [...] } или массив payload";
      manualInput.style.cssText = "width:100%;padding:8px;border:1px solid #94a3b8;border-radius:6px;font-family:ui-monospace,monospace;font-size:12px;";
      wrap.appendChild(manualInput);

      var actions = document.createElement("div");
      actions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;";
      wrap.appendChild(actions);

      var tableHost = document.createElement("div");
      wrap.appendChild(tableHost);

      var candidates = [];
      var searchInput = document.createElement("input");
      searchInput.type = "text";
      searchInput.placeholder = "Поиск по типу / заголовку / ID";
      searchInput.style.cssText = "width:100%;padding:8px;border:1px solid #94a3b8;border-radius:6px;font-size:12px;";
      wrap.appendChild(searchInput);
      var selectionInfo = document.createElement("div");
      selectionInfo.style.cssText = "font-size:11px;color:#475569;";
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
            ensureString(item.sourceType || item.type),
            ensureString(item.summary),
            ensureString(item.sourceNewsId || item.newsId)
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
      }

      function setAllSelected(next) {
        for (var i = 0; i < candidates.length; i++) candidates[i].selected = !!next;
        renderList();
      }

      function clearLoadedSelection() {
        candidates = [];
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
            ensureString(candidates[i].sourceType || candidates[i].type),
            ensureString(candidates[i].summary),
            ensureString(candidates[i].sourceNewsId || candidates[i].newsId)
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
          return {
            selected: true,
            sourceNewsId: ensureString(payload.newsId || ""),
            sourceType: normalizeType(payload.type || payload.newsType),
            summary: compactNewsLabel(payload),
            authorsCount: Array.isArray(payload.authorsList) ? payload.authorsList.length : 0,
            leadersCount: Array.isArray(payload.leadersList) ? payload.leadersList.length : 0,
            payload: payload
          };
        });
        renderList();
        log("Загружено payload для редактирования: " + candidates.length);
      }

      actions.appendChild(
        mkBtn(
          "Загрузить с сервера для выбора",
          function () {
            void (async function () {
              var statuses = editStatusCtl.getSelected();
              var blocks = editBlockCtl.getSelected();
              var maxPages = parseInt(String(fetchPagesInput.value || "3"), 10);
              if (!Number.isFinite(maxPages) || maxPages < 1) maxPages = 1;
              if (!statuses.length || !blocks.length) {
                log("Для загрузки выберите status и business block.");
                return;
              }
              var env = getEnv();
              var loaded = [];
              for (var si = 0; si < statuses.length; si++) {
                for (var bi = 0; bi < blocks.length; bi++) {
                  var status = statuses[si];
                  var block = blocks[bi];
                  var pageNum = 1;
                  while (pageNum <= maxPages) {
                    var payload = { newsStatus: status, businessBlock: block, pageNum: pageNum };
                    var res = await fetchNewsListPage(env.origin, payload);
                    if (!(res.ok && res.data && res.data.success === true && res.data.body)) {
                      log("Ошибка загрузки: " + status + "/" + block + " page=" + pageNum);
                      break;
                    }
                    var periods = Array.isArray(res.data.body.timePeriod) ? res.data.body.timePeriod : [];
                    var countOnPage = 0;
                    for (var pi = 0; pi < periods.length; pi++) {
                      var newsList = Array.isArray(periods[pi].news) ? periods[pi].news : [];
                      for (var ni = 0; ni < newsList.length; ni++) {
                        loaded.push(newsList[ni]);
                        countOnPage++;
                      }
                    }
                    var pageInfo = (res.data.body && res.data.body.page) || {};
                    log("Загружено: " + status + "/" + block + " page=" + pageNum + " новостей=" + countOnPage);
                    if (pageInfo.isLast === true) break;
                    if (Number(pageInfo.total || 0) > 0 && pageNum >= Number(pageInfo.total)) break;
                    pageNum++;
                  }
                }
              }
              candidates = loaded
                .filter(function (n) {
                  return String(n && n.newsId || "").trim();
                })
                .map(function (row) {
                  var payload = buildUpdatePayloadFromNewsItem(row);
                  return {
                    selected: true,
                    sourceNewsId: ensureString(payload.newsId || ""),
                    sourceType: normalizeType(payload.type || payload.newsType),
                    summary: compactNewsLabel(row),
                    authorsCount: Array.isArray(payload.authorsList) ? payload.authorsList.length : 0,
                    leadersCount: Array.isArray(payload.leadersList) ? payload.leadersList.length : 0,
                    payload: payload
                  };
                });
              renderList();
              log("Подготовлено записей к редактированию из сервера: " + candidates.length);
            })();
          },
          "background:#0ea5e9;color:#fff;border-color:#0ea5e9;"
        )
      );

      actions.appendChild(
        mkBtn("Шаблон редактирования", function () {
          downloadJson("news_edit_template_" + tsShort() + ".json", buildEditTemplate());
          log("Скачан шаблон редактирования.");
        })
      );
      actions.appendChild(
        mkBtn("Разобрать JSON из поля", function () {
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
              var selected = candidates.filter(function (c) {
                return c.selected !== false;
              });
              if (!selected.length) {
                log("Нет выбранных payload для редактирования.");
                return;
              }
              var errs = [];
              for (var i = 0; i < selected.length; i++) {
                var p = selected[i].payload;
                if (!String(p.newsId || "").trim()) errs.push("[" + (i + 1) + "] пустой newsId");
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
              var okCount = 0;
              var failCount = 0;
              var dump = [];
              for (var si = 0; si < selected.length; si++) {
                var payload = selected[si].payload;
                payload.method = "put";
                var res = await postJson(
                  env.origin + NEWS_V2_CFG.NEWS_UPDATE_PATH,
                  payload,
                  env.origin + "/salesheroes/admin/community/" + payload.newsId + "/edit"
                );
                var success = !!(res.ok && res.data && res.data.success === true);
                dump.push({ payload: payload, response: res });
                if (success) {
                  okCount++;
                  log("Обновлено: newsId=" + payload.newsId);
                } else {
                  failCount++;
                  log("Ошибка обновления: newsId=" + payload.newsId + " | HTTP " + res.status);
                }
              }
              downloadJson(
                "news_edit_result_" + env.stand + "_" + env.contour + "_" + tsShort() + ".json",
                { env: env, total: selected.length, okCount: okCount, failCount: failCount, results: dump }
              );
              log("Редактирование завершено. OK=" + okCount + ", FAIL=" + failCount + ".");
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
      var btnStop = mkBtn("⏹ Стоп", function () {
        if (!exportBusy) return;
        if (stopRequested) {
          log("Стоп уже запрошен — ждём текущий POST…");
          return;
        }
        stopRequested = true;
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

      function mkNumField(labelText, value, title) {
        var lab = document.createElement("label");
        lab.style.cssText = "display:flex;flex-direction:column;gap:2px;font-size:10px;color:#64748b;min-width:0;";
        lab.title = title || labelText;
        var cap = document.createElement("span");
        cap.textContent = labelText;
        var inp = document.createElement("input");
        inp.type = "number";
        inp.min = "0";
        inp.value = String(value);
        inp.style.cssText = "width:100%;box-sizing:border-box;padding:4px 6px;font-size:11px;border:1px solid #94a3b8;border-radius:5px;background:#fff;color:#0f172a;";
        lab.appendChild(cap);
        lab.appendChild(inp);
        return { lab: lab, inp: inp };
      }

      var timingBox = document.createElement("div");
      timingBox.style.cssText = "display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;align-items:end;padding-top:8px;border-top:1px solid #e2e8f0;";
      var fPayloadGap = mkNumField("Пауза payload, мс", NEWS_V2_CFG.PAYLOAD_GAP_MS, "Пауза между комбинациями");
      var fPageGap = mkNumField("Пауза страниц, мс", NEWS_V2_CFG.PAGE_GAP_MS, "Пауза между pageNum");
      var fMaxPages = mkNumField("Макс. страниц", NEWS_V2_CFG.MAX_PAGES_PER_COMBO, "0 = все");
      var fRetryPause = mkNumField("Пауза повтора, мс", NEWS_V2_CFG.RETRY_PAUSE_MS, "Пауза перед повтором");
      var fRetryMax = mkNumField("Попыток", NEWS_V2_CFG.RETRY_MAX, "Число попыток одного запроса");
      fRetryMax.inp.min = "1";
      timingBox.appendChild(fPayloadGap.lab);
      timingBox.appendChild(fPageGap.lab);
      timingBox.appendChild(fMaxPages.lab);
      timingBox.appendChild(fRetryPause.lab);
      timingBox.appendChild(fRetryMax.lab);
      payloadBox.appendChild(timingBox);

      var exportBusy = false;
      var stopRequested = false;

      function refreshRequiredUi() {
        var hasStatus = statusCtl.getSelectedKeys().length > 0;
        var hasBlock = blockCtl.getSelectedKeys().length > 0;
        statusCtl.setRequiredOk(hasStatus);
        blockCtl.setRequiredOk(hasBlock);
        if (exportBusy) return;
        var ok = hasStatus && hasBlock;
        btnJson.disabled = !ok;
        btnCsv.disabled = !ok;
        btnJson.style.opacity = ok ? "1" : "0.55";
        btnCsv.style.opacity = ok ? "1" : "0.55";
      }
      refreshRequiredUi();

      function setBusy(busy) {
        exportBusy = !!busy;
        btnStop.disabled = !busy;
        btnStop.style.opacity = busy ? "1" : "0.55";
        if (busy) {
          btnJson.disabled = true;
          btnCsv.disabled = true;
          btnJson.style.opacity = "0.55";
          btnCsv.style.opacity = "0.55";
        } else {
          refreshRequiredUi();
        }
      }

      function readGap(inp, fallback) {
        var n = parseInt(String(inp.value || "").trim(), 10);
        if (!Number.isFinite(n) || n < 0) return fallback;
        if (n > NEWS_V2_CFG.GAP_MAX_MS) return NEWS_V2_CFG.GAP_MAX_MS;
        return n;
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
        if (exportBusy) {
          log("Выгрузка уже выполняется.");
          return;
        }
        var sel = readPanelSelection();
        if (!sel.newsStatuses.length || !sel.businessBlocks.length) {
          refreshRequiredUi();
          log("Остановка: выберите хотя бы один status и один businessBlock.");
          return;
        }
        setBusy(true);
        stopRequested = false;
        var env = getEnv();
        var payloadGapMs = readGap(fPayloadGap.inp, NEWS_V2_CFG.PAYLOAD_GAP_MS);
        var pageGapMs = readGap(fPageGap.inp, NEWS_V2_CFG.PAGE_GAP_MS);
        var retryPauseMs = readGap(fRetryPause.inp, NEWS_V2_CFG.RETRY_PAUSE_MS);
        var retryMax = Math.max(1, parseInt(String(fRetryMax.inp.value || "2"), 10) || 2);
        var maxPages = Math.max(0, parseInt(String(fMaxPages.inp.value || "0"), 10) || 0);
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
        log("Старт выгрузки (" + mode + ") | комбинаций: " + combos.length);
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
        var abortLimit = Math.max(1, Number(NEWS_V2_CFG.CONSECUTIVE_FAIL_ABORT) || 2);
        var newsTotal = 0;

        try {
          for (var ci = 0; ci < combos.length; ci++) {
            if (stopRequested) { stoppedByUser = true; break; }
            var combo = combos[ci];
            var tagsStat = combo.newsTagList.length
              ? combo.newsTagList.map(function (t) { return t.tagCode; }).join(", ")
              : "—";
            setStats({
              tone: consecutiveExhaustedFails >= 1 ? "retry2" : "run",
              phase: (ci + 1) + "/" + combos.length,
              status: combo.newsStatus,
              block: combo.businessBlock,
              tags: tagsStat,
              progress: ci + " / " + combos.length + " завершено",
              page: "pageNum=1…",
              news: String(newsTotal)
            });
            var pageNum = 1;
            var totalPages = null;
            var comboNewsCount = null;
            var mergedCombo = null;
            var comboPages = [];
            var comboHadSuccess = false;
            while (true) {
              if (stopRequested) { stoppedByUser = true; break; }
              var payload = {
                newsStatus: combo.newsStatus,
                businessBlock: combo.businessBlock,
                pageNum: pageNum
              };
              if (combo.newsTagList.length) payload.newsTagList = combo.newsTagList;
              setStats({
                tone: consecutiveExhaustedFails >= 1 ? "retry2" : "run",
                page: "pageNum=" + pageNum + (totalPages != null ? "/" + totalPages : ""),
                status: combo.newsStatus,
                block: combo.businessBlock,
                tags: tagsStat,
                newsCount: comboNewsCount != null ? String(comboNewsCount) : "—"
              });
              var retryResult = await fetchNewsPageWithRetry(env.origin, payload, {
                log: log,
                retryMax: retryMax,
                retryPauseMs: retryPauseMs,
                shouldStop: function () { return !!stopRequested; },
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
              if (retryResult.stopped || stopRequested) { stoppedByUser = true; break; }
              if (!retryResult.ok) {
                errors++;
                consecutiveExhaustedFails++;
                if (consecutiveExhaustedFails >= abortLimit) {
                  abortedByErrors = true;
                  setStats({ tone: "done_err", phase: "ошибка — стоп", errors: String(errors) });
                  break;
                }
                var canNext = (maxPages <= 0 || pageNum < maxPages) && (totalPages == null || pageNum < totalPages);
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
              var pageInfo = fr.data.body && fr.data.body.page;
              var isLast = pageInfo && pageInfo.isLast === true;
              var total = pageInfo && pageInfo.total != null ? Number(pageInfo.total) : null;
              if (Number.isFinite(total) && total > 0) totalPages = total;
              if (comboNewsCount == null && fr.data.body && fr.data.body.newsCount != null) {
                var nc = Number(fr.data.body.newsCount);
                if (Number.isFinite(nc)) comboNewsCount = nc;
              }
              var pageTotalVal = totalPages != null ? totalPages : total != null ? total : "";
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
              log("  → OK pageNum=" + pageNum + " | новостей на странице: " + (fr.data.body ? countNewsInBody(fr.data.body) : 0));
              if (isLast) break;
              if (totalPages != null && pageNum >= totalPages) break;
              if (maxPages > 0 && pageNum >= maxPages) break;
              pageNum++;
              if (pageGapMs > 0) {
                await delay(pageGapMs);
                if (stopRequested) { stoppedByUser = true; break; }
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
                newsCount: mergedCombo ? countNewsInBody(mergedCombo.body) : 0,
                partial: !!stoppedByUser || !!abortedByErrors,
                merged: mergedCombo
              });
            }
            if (abortedByErrors || stoppedByUser) break;
            if (ci < combos.length - 1 && payloadGapMs > 0) {
              await delay(payloadGapMs);
              if (stopRequested) { stoppedByUser = true; break; }
            }
          }

          if (!rawPages.length) {
            setStats({
              tone: abortedByErrors ? "done_err" : stoppedByUser ? "stop" : "done_err",
              phase: abortedByErrors ? "ошибка (нет данных)" : stoppedByUser ? "стоп (нет данных)" : "нет данных",
              retries: String(retriesTotal),
              errors: String(errors)
            });
            log("Выгрузка не завершена: нет успешных страниц.");
            return;
          }

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
              retryMax: retryMax,
              retryPauseMs: retryPauseMs,
              retriesTotal: retriesTotal,
              errorsExhausted: errors,
              maxPagesPerCombo: maxPages > 0 ? maxPages : null,
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
          var prefix = NEWS_V2_CFG.FILENAME_PREFIX_AUTO + env.stand + "_" + env.contour + "_";
          var stamp = tsShort();
          var fnameJson = prefix + stamp + ".json";
          downloadJson(fnameJson, bundle);
          log(
            (abortedByErrors ? "Авария — JSON сохранён. " : stoppedByUser ? "Остановлено — JSON сохранён. " : errors > 0 ? "JSON сохранён с ошибками. " : "JSON готов. ") +
              "Страниц: " + rawPages.length + " | новостей: " + newsTotal + " | файл: " + fnameJson
          );
          if (mode === "JSON+CSV") {
            var table = buildNewsFlatCsv(flatRows);
            if (table.rows.length) {
              var fnameCsv = prefix + stamp + "_news.csv";
              downloadText(fnameCsv, "\uFEFF" + csvTableToText(table), "text/csv;charset=utf-8");
              log("  CSV: " + fnameCsv + " | строк: " + table.rows.length);
            } else {
              log("  CSV не создан: нет строк новостей.");
            }
          }
          setStats({
            tone: abortedByErrors || errors > 0 ? "done_err" : stoppedByUser ? "stop" : "done_ok",
            phase: abortedByErrors ? "ошибка — сохранено" : stoppedByUser ? "стоп — сохранено" : errors > 0 ? "готово с ошибками" : "готово",
            progress: combosOk + " OK / " + combos.length,
            news: String(newsTotal),
            retries: String(retriesTotal),
            errors: String(errors)
          });
        } finally {
          stopRequested = false;
          setBusy(false);
        }
      }
    }

    var tabs = [
      { key: "export", label: "Выгрузка (старый блок)", render: renderExportTab },
      { key: "create", label: "Создание", render: renderCreateTab },
      { key: "status", label: "Статусы", render: renderStatusTab },
      { key: "edit", label: "Редактирование (каркас)", render: renderEditTab }
    ];

    var activeTab = "";
    function switchTab(nextKey) {
      activeTab = nextKey;
      for (var i = 0; i < left.children.length; i++) {
        var btn = left.children[i];
        var isOn = btn.getAttribute("data-tab") === nextKey;
        btn.style.background = isOn ? "#2563eb" : "#fff";
        btn.style.color = isOn ? "#fff" : "#0f172a";
        btn.style.borderColor = isOn ? "#2563eb" : "#94a3b8";
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
        var b = mkBtn(t.label, function () {
          switchTab(t.key);
        }, "text-align:left;");
        b.setAttribute("data-tab", t.key);
        left.appendChild(b);
      })();
    }

    left.appendChild(
      mkBtn("Закрыть", function () {
        root.remove();
      }, "margin-top:auto;background:#ef4444;border-color:#ef4444;color:#fff;")
    );

    document.body.appendChild(root);
    switchTab("export");
    log("Панель запущена.");
  }

  startPanel();
})();
