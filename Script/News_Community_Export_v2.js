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
    STATUS_OPTIONS: ["published", "planned", "draft"],
    BUSINESS_BLOCK_OPTIONS: ["KMKKSB", "CSM", "AKMKKSB", "MNS", "KMFACTORING"],
    TAG_OPTIONS: ["achievement", "bestPractice", "publication"],
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

  function buildCreatePayloadFromSourceItem(item, defaultCreatedBy, batchStartIso) {
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

    var payload = {
      bankLevel: source.bankLevel !== false,
      rewardList: rewardList,
      tournamentList: tournamentList,
      newsFeature: normalizeNewsFeature(source.newsFeature, businessBlocks),
      type: type,
      description: ensureString(source.description || source.newsText),
      summary: type === "achievement" ? "" : ensureString(source.summary),
      authorsList: mapEmployeesList(authorsSource),
      tagList: toTagList(tagsSource),
      tbCodeList: parseMaybeJsonArray(source.tbCodeList != null ? source.tbCodeList : source.tbCode),
      gosbCodeList: parseMaybeJsonArray(
        source.gosbCodeList != null ? source.gosbCodeList : source.gosbCode
      ),
      leadersList: mapEmployeesList(leadersSource),
      createdBy: createdBy,
      plannedDt: nowIso(),
      status: "draft",
      createDt: batchStartIso || nowIso()
    };

    return payload;
  }

  function compactNewsLabel(meta) {
    var summary = ensureString(meta.summary).trim();
    if (summary) return summary.slice(0, 70);
    var description = ensureString(meta.description).trim();
    return description ? description.slice(0, 70) : "без заголовка";
  }

  function extractCreateCandidatesFromAnyJson(inputJson, defaultCreatedBy, batchStartIso) {
    var source = inputJson;
    var rows = [];
    if (Array.isArray(source)) {
      rows = source;
    } else if (source && Array.isArray(source.createItems)) {
      rows = source.createItems;
    } else if (source && Array.isArray(source.comboResults)) {
      for (var ci = 0; ci < source.comboResults.length; ci++) {
        var merged = source.comboResults[ci] && source.comboResults[ci].merged;
        var periods =
          merged && merged.body && Array.isArray(merged.body.timePeriod)
            ? merged.body.timePeriod
            : [];
        for (var pi = 0; pi < periods.length; pi++) {
          var newsList = Array.isArray(periods[pi].news) ? periods[pi].news : [];
          for (var ni = 0; ni < newsList.length; ni++) rows.push(newsList[ni]);
        }
      }
    } else if (source && source.merged && source.merged.body && Array.isArray(source.merged.body.timePeriod)) {
      for (var mpi = 0; mpi < source.merged.body.timePeriod.length; mpi++) {
        var mergedNews = source.merged.body.timePeriod[mpi].news || [];
        for (var mni = 0; mni < mergedNews.length; mni++) rows.push(mergedNews[mni]);
      }
    } else if (source && source.payload) {
      rows = [source.payload];
    } else {
      rows = [source];
    }

    var candidates = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var payload = buildCreatePayloadFromSourceItem(row, defaultCreatedBy, batchStartIso);
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
    var source = inputJson;
    var rows = [];
    if (Array.isArray(source)) rows = source;
    else if (source && Array.isArray(source.statusItems)) rows = source.statusItems;
    else if (source && Array.isArray(source.comboResults)) {
      for (var ci = 0; ci < source.comboResults.length; ci++) {
        var merged = source.comboResults[ci] && source.comboResults[ci].merged;
        var periods =
          merged && merged.body && Array.isArray(merged.body.timePeriod)
            ? merged.body.timePeriod
            : [];
        for (var pi = 0; pi < periods.length; pi++) {
          var newsList = Array.isArray(periods[pi].news) ? periods[pi].news : [];
          for (var ni = 0; ni < newsList.length; ni++) rows.push(newsList[ni]);
        }
      }
    } else rows = [source];

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
      "z-index:999999;background:#f8fafc;border:1px solid #94a3b8;border-radius:12px;" +
      "box-shadow:0 18px 48px rgba(15,23,42,.2);display:flex;flex-direction:column;overflow:hidden;" +
      "font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;color:#0f172a;";

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
        candidates = extractCreateCandidatesFromAnyJson(
          parsed.value,
          createdByValue,
          batchStartIso
        );
        for (var ci = 0; ci < candidates.length; ci++) {
          if (!String(candidates[ci].payload.createdBy || "").trim()) {
            candidates[ci].payload.createdBy = createdByValue;
          }
        }
        renderList();
        log("Загружено записей для создания: " + candidates.length);
      }

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

              if (!window.confirm("Создать выбранные новости: " + selected.length + " шт.?")) {
                log("Создание отменено пользователем.");
                return;
              }

              var env = getEnv();
              var okCount = 0;
              var failCount = 0;
              var resultDump = [];
              for (var si = 0; si < selected.length; si++) {
                var payload = selected[si].payload;
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
                  total: selected.length,
                  okCount: okCount,
                  failCount: failCount,
                  results: resultDump
                }
              );
              log("Создание завершено. OK=" + okCount + ", FAIL=" + failCount + ".");
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

      var editStatusCtl = mkInlineMulti("Status", NEWS_V2_CFG.STATUS_OPTIONS, "published");
      var editBlockCtl = mkInlineMulti("Business block", NEWS_V2_CFG.BUSINESS_BLOCK_OPTIONS, "KMKKSB");
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

      var note = document.createElement("div");
      note.style.cssText = "padding:8px;border:1px solid #93c5fd;border-radius:6px;background:#eff6ff;font-size:12px;color:#1e3a8a;";
      note.textContent =
        "Выгрузка как в старом скрипте: выбор status/block/tag, пагинация и скачивание JSON.";
      wrap.appendChild(note);

      function mkMulti(title, values, defaults) {
        var box = document.createElement("div");
        box.style.cssText = "padding:8px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;";
        var cap = document.createElement("div");
        cap.textContent = title;
        cap.style.cssText = "font-size:11px;font-weight:700;margin-bottom:6px;";
        box.appendChild(cap);
        var checks = [];
        for (var i = 0; i < values.length; i++) {
          var row = document.createElement("label");
          row.style.cssText = "display:inline-flex;align-items:center;gap:4px;margin-right:12px;margin-bottom:6px;font-size:12px;";
          var c = document.createElement("input");
          c.type = "checkbox";
          c.value = values[i];
          c.checked = defaults.indexOf(values[i]) >= 0;
          checks.push(c);
          row.appendChild(c);
          row.appendChild(document.createTextNode(values[i]));
          box.appendChild(row);
        }
        return {
          el: box,
          getSelected: function () {
            return checks.filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
          }
        };
      }

      var statusCtl = mkMulti("Status *", NEWS_V2_CFG.STATUS_OPTIONS, ["published"]);
      var blockCtl = mkMulti("Business block *", NEWS_V2_CFG.BUSINESS_BLOCK_OPTIONS, ["KMKKSB"]);
      var tagCtl = mkMulti("Теги NEWS_TYPE (опционально)", NEWS_V2_CFG.TAG_OPTIONS, []);
      wrap.appendChild(statusCtl.el);
      wrap.appendChild(blockCtl.el);
      wrap.appendChild(tagCtl.el);

      var maxPagesInput = document.createElement("input");
      maxPagesInput.type = "number";
      maxPagesInput.min = "0";
      maxPagesInput.value = "0";
      maxPagesInput.style.cssText = "padding:6px 8px;border:1px solid #94a3b8;border-radius:6px;width:180px;";
      wrap.appendChild(maxPagesInput);
      wrap.appendChild(document.createTextNode("Макс. страниц на комбинацию (0 = все)"));

      var actions = document.createElement("div");
      actions.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;";
      wrap.appendChild(actions);

      actions.appendChild(
        mkBtn(
          "Выгрузить JSON",
          function () {
            void (async function () {
              var statuses = statusCtl.getSelected();
              var blocks = blockCtl.getSelected();
              var tags = tagCtl.getSelected();
              var maxPages = parseInt(String(maxPagesInput.value || "0"), 10);
              if (!Number.isFinite(maxPages) || maxPages < 0) maxPages = 0;
              if (!statuses.length || !blocks.length) {
                log("Для выгрузки выберите минимум 1 status и 1 businessBlock.");
                return;
              }
              var env = getEnv();
              var comboResults = [];
              var pages = [];
              var errors = [];
              for (var si = 0; si < statuses.length; si++) {
                for (var bi = 0; bi < blocks.length; bi++) {
                  var status = statuses[si];
                  var block = blocks[bi];
                  var pageNum = 1;
                  var localPages = [];
                  while (true) {
                    if (maxPages > 0 && pageNum > maxPages) break;
                    var payload = { newsStatus: status, businessBlock: block, pageNum: pageNum };
                    if (tags.length) {
                      payload.newsTagList = tags.map(function (tagCode) {
                        return { tagType: "NEWS_TYPE", tagCode: tagCode };
                      });
                    }
                    var res = await fetchNewsListPage(env.origin, payload);
                    if (!(res.ok && res.data && res.data.success === true && res.data.body)) {
                      errors.push({ payload: payload, response: res });
                      log("Ошибка выгрузки: status=" + status + ", block=" + block + ", page=" + pageNum);
                      break;
                    }
                    localPages.push(res.data);
                    pages.push(res.data);
                    var pageInfo = (res.data.body && res.data.body.page) || {};
                    var isLast = pageInfo.isLast === true;
                    var total = Number(pageInfo.total || 0);
                    log("OK выгрузка: " + status + "/" + block + " page=" + pageNum + (total ? "/" + total : ""));
                    if (isLast) break;
                    if (total > 0 && pageNum >= total) break;
                    pageNum++;
                  }
                  comboResults.push({
                    combo: {
                      newsStatus: status,
                      businessBlock: block,
                      newsTagList: tags.map(function (tagCode) {
                        return { tagType: "NEWS_TYPE", tagCode: tagCode };
                      })
                    },
                    pagesFetched: localPages.length,
                    merged: localPages[localPages.length - 1] || null
                  });
                }
              }
              var bundle = {
                exportMeta: {
                  stand: env.stand,
                  contour: env.contour,
                  origin: env.origin,
                  fetchedAt: nowIso(),
                  statuses: statuses,
                  businessBlocks: blocks,
                  tags: tags,
                  maxPagesPerCombo: maxPages || null,
                  pagesFetched: pages.length,
                  errorsCount: errors.length
                },
                comboResults: comboResults,
                pages: pages,
                errors: errors
              };
              downloadJson("news_export_v2_" + env.stand + "_" + env.contour + "_" + tsShort() + ".json", bundle);
              log("Выгрузка завершена. Страниц: " + pages.length + ", ошибок: " + errors.length);
            })();
          },
          "background:#0ea5e9;color:#fff;border-color:#0ea5e9;"
        )
      );
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
