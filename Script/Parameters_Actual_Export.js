/**
 * Панель: выгрузка параметров, создание (param-create), редактирование (param-update).
 * Запуск: DevTools → Console → вставить файл → Enter.
 * Общий выбор стенда (PROM/PSI) и контура (ALPHA/SIGMA) над вкладками — для всех операций.
 */
(() => {
  "use strict";

  // ===========================================================================
  // Справочник parameterType (создание и правка): выпадающие списки + проверка JSON из файла.
  // Добавляйте строки { value, label } — value уходит в API, label виден в списке для ориентира.
  // ===========================================================================
  /** @type {{ value: string; label: string }[]} */
  const PARAMETER_TYPE_OPTIONS = [
    { value: "SERVICE", label: "SERVICE — сервисный параметр (пример из API)" },
    // Пример добавления: { value: "OTHER", label: "OTHER — кратко для чего" },
  ];

  /**
   * После кнопки «загрузить типы» сюда попадает объединённый список допустимых parameterType из API;
   * пока null — для проверок используется только PARAMETER_TYPE_OPTIONS.
   * @type {string[] | null}
   */
  let cachedAllowedParameterTypes = null;

  /**
   * Коды parameterCode из последнего ответа списка ACTUAL (для проверки: создание vs правка).
   * null — кэш ещё не заполняли (ни кнопкой типов, ни предзагрузкой перед созданием).
   * @type {Set<string> | null}
   */
  let cachedActualParameterCodes = null;

  /**
   * objectId из последнего ответа списка ACTUAL (тот же запрос, что и кэш кодов) — для проверок перед param-update без повторного POST списка.
   * @type {Set<string> | null}
   */
  let cachedActualObjectIds = null;

  /**
   * Вкладка «3. Редактирование»: пользователь нажал «загрузить допустимые значения» — можно выбирать parameterCode и parameterType из списков.
   * @type {boolean}
   */
  let editTabAllowedListsLoaded = false;

  /**
   * Допустимые значения parameterType для сравнения с полем в JSON и форме.
   * @returns {string[]}
   */
  function getParameterTypeAllowedValues() {
    if (cachedAllowedParameterTypes !== null && cachedAllowedParameterTypes.length > 0) {
      return cachedAllowedParameterTypes.slice();
    }
    return PARAMETER_TYPE_OPTIONS.map((row) => String(row.value).trim()).filter(Boolean);
  }

  /**
   * Заполняет <select> вариантами из PARAMETER_TYPE_OPTIONS.
   * @param {HTMLSelectElement} selectEl
   */
  function fillParameterTypeSelect(selectEl) {
    selectEl.textContent = "";
    for (const row of PARAMETER_TYPE_OPTIONS) {
      const v = String(row.value).trim();
      if (!v) continue;
      const o = document.createElement("option");
      o.value = v;
      o.textContent = row.label && String(row.label).trim() ? String(row.label).trim() : v;
      selectEl.appendChild(o);
    }
  }

  /**
   * Заполняет select значениями parameterType из API (строка = value и подпись).
   * @param {HTMLSelectElement} selectEl
   * @param {string[]} values
   * @param {boolean} [prependEmpty] — первая опция «— выберите …» (для вкладки «Редактирование»).
   */
  function fillParameterTypeSelectWithApiValues(selectEl, values, prependEmpty) {
    selectEl.textContent = "";
    if (prependEmpty) {
      const o0 = document.createElement("option");
      o0.value = "";
      o0.textContent = "— выберите parameterType —";
      selectEl.appendChild(o0);
    }
    const sorted = values
      .map(function (x) {
        return String(x).trim();
      })
      .filter(Boolean)
      .sort(function (a, b) {
        return a.localeCompare(b, "ru");
      });
    const seen = new Set();
    for (let i = 0; i < sorted.length; i++) {
      const t = sorted[i];
      if (seen.has(t)) continue;
      seen.add(t);
      const o = document.createElement("option");
      o.value = t;
      o.textContent = t;
      selectEl.appendChild(o);
    }
    if (prependEmpty) {
      selectEl.value = "";
    }
  }

  /**
   * Селект parameterCode на вкладке «Редактирование»: пустое значение + коды из ACTUAL.
   * @param {HTMLSelectElement} selectEl
   * @param {Set<string>} codeSet
   */
  function fillParameterCodeSelectFromActualCodes(selectEl, codeSet) {
    selectEl.textContent = "";
    const o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = "— выберите parameterCode —";
    selectEl.appendChild(o0);
    const arr = Array.from(codeSet).sort(function (a, b) {
      return a.localeCompare(b, "ru");
    });
    for (let i = 0; i < arr.length; i++) {
      const code = arr[i];
      const o = document.createElement("option");
      o.value = code;
      o.textContent = code;
      selectEl.appendChild(o);
    }
    selectEl.value = "";
  }

  /**
   * Обнуляет селекты вкладки «Редактирование» (до первой загрузки допустимых значений).
   * @param {HTMLSelectElement} codeSel
   * @param {HTMLSelectElement} typeSel
   */
  function clearEditTabParameterSelects(codeSel, typeSel) {
    codeSel.textContent = "";
    const oc = document.createElement("option");
    oc.value = "";
    oc.textContent = "— сначала нажмите «загрузить допустимые значения» —";
    codeSel.appendChild(oc);
    codeSel.value = "";
    typeSel.textContent = "";
    const ot = document.createElement("option");
    ot.value = "";
    ot.textContent = "— сначала нажмите «загрузить допустимые значения» —";
    typeSel.appendChild(ot);
    typeSel.value = "";
  }

  /** Пауза между последовательными POST из файла (create/update), мс. */
  const PARAM_BATCH_REQUEST_GAP_MS = 100;

  const DEFAULT_STAND = "PROM";
  const DEFAULT_CONTOUR = "SIGMA";
  const DEFAULT_STATUS = "ACTUAL";

  const PARAMETER_ORIGINS = {
    PROM: {
      SIGMA: "https://salesheroes.sberbank.ru",
      ALPHA: "https://salesheroes-alpha.sberbank.ru",
    },
    PSI: {
      SIGMA: "https://salesheroes-psi.sberbank.ru",
      ALPHA: "https://iam-enigma-psi.sberbank.ru",
    },
  };

  const PARAMETERS_PATH = "/bo/rmkib.gamification/proxy/v1/parameters";
  const PARAM_CREATE_PATH = "/bo/rmkib.gamification/proxy/v1/parameters/param-create";
  const PARAM_UPDATE_PATH = "/bo/rmkib.gamification/proxy/v1/parameters/param-update";

  /** parameterCode мета-параметра со списком типов в parameterValue.types (JSON). */
  const PARAMETER_TYPES_META_CODE = "parameterTypes";

  /**
   * Единственный objectId для детализации при кнопке ⬇: только этот ответ разбирается на «parameterTypes».
   * Полный обход всех objectId не выполняется (этап только для списка допустимых parameterType).
   */
  const PARAMETER_TYPES_DETAIL_OBJECT_ID = "745250143248942718";

  const PANEL_ID = "parameters-actual-export-panel";
  const LOG_MAX_LINES = 400;

  /** Базовый размер шрифта панели (компактно, чтобы форма и журнал помещались). */
  const PANEL_FONT_BASE = "11px";
  /** Подписи и подсказки. */
  const PANEL_FONT_SMALL = "10px";
  /**
   * Ширина панели — максимально возможная под текущее окно (с отступами от краёв).
   */
  const PANEL_WIDTH_CSS = "min(1400px, calc(100vw - 24px))";
  /**
   * Высота панели — почти на весь экран (фиксированные bottom/right 12px дают суммарно ~24px).
   */
  const PANEL_HEIGHT_CSS = "calc(100vh - 24px)";
  /** Минимальная высота блока журнала. */
  const PANEL_LOG_MIN_HEIGHT_PX = 56;
  /** Высота журнала: доля экрана, без забирации места у области вкладок сверх необходимого. */
  const PANEL_LOG_HEIGHT_CSS = "min(120px, 14vh)";

  /**
   * @param {string} stand
   * @param {string} contour
   * @returns {string}
   */
  function getOrigin(stand, contour) {
    const row = PARAMETER_ORIGINS[stand];
    if (!row) {
      throw new Error("Неизвестный стенд: " + stand);
    }
    const origin = row[contour];
    if (!origin) {
      throw new Error("Неизвестный контур: " + contour);
    }
    return origin;
  }

  /**
   * @param {string} origin
   * @param {string} path
   * @param {unknown} bodyObj
   * @returns {Promise<{ ok: boolean, status: number, data: unknown, text: string }>}
   */
  async function postJson(origin, path, bodyObj) {
    const url = origin + path;
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(bodyObj),
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { _parseError: true, raw: text };
    }
    return { ok: res.ok, status: res.status, data, text };
  }

  /**
   * @param {string} origin
   * @param {unknown} bodyObj
   */
  async function postParameters(origin, bodyObj) {
    return postJson(origin, PARAMETERS_PATH, bodyObj);
  }

  /**
   * Извлечение objectId из ответа списка parameters.
   * @param {unknown} listData
   * @returns {string[]}
   */
  function extractObjectIds(listData) {
    const out = [];
    const seen = new Set();
    const body = listData && typeof listData === "object" ? listData.body : null;
    const params = body && Array.isArray(body.parameters) ? body.parameters : [];
    for (const p of params) {
      if (!p || typeof p !== "object") continue;
      const id = p.objectId;
      if (typeof id === "string" && id.length > 0 && !seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
    return out;
  }

  /**
   * Извлекает из текста последовательность JSON-объектов по внешним `{`…`}` с учётом строк в кавычках.
   * @param {string} t
   * @returns {{ error: string | null, items: unknown[] }}
   */
  function parseJsonObjectsByBraceScan(t) {
    const items = [];
    let pos = 0;
    const len = t.length;
    while (pos < len) {
      while (pos < len && /\s/.test(t[pos])) pos++;
      if (pos >= len) break;
      if (t[pos] !== "{") {
        const next = t.indexOf("{", pos);
        if (next < 0) break;
        pos = next;
      }
      const start = pos;
      let depth = 0;
      let inStr = false;
      let esc = false;
      let j = pos;
      for (; j < len; j++) {
        const c = t[j];
        if (inStr) {
          if (esc) {
            esc = false;
            continue;
          }
          if (c === "\\") {
            esc = true;
            continue;
          }
          if (c === '"') {
            inStr = false;
            continue;
          }
          continue;
        }
        if (c === '"') {
          inStr = true;
          continue;
        }
        if (c === "{") depth++;
        else if (c === "}") {
          depth--;
          if (depth === 0) {
            const slice = t.slice(start, j + 1);
            try {
              items.push(JSON.parse(slice));
            } catch (e) {
              const msg = e && typeof e === "object" && "message" in /** @type {object} */ (e) ? String(/** @type {{ message: string }} */ (e).message) : String(e);
              return { error: "Ошибка разбора блока JSON: " + msg, items: [] };
            }
            pos = j + 1;
            break;
          }
        }
      }
      if (j >= len && depth !== 0) {
        return { error: "Незавершённый JSON-объект (фигурные скобки не сбалансированы).", items: [] };
      }
    }
    return { error: null, items };
  }

  /**
   * Разбор файла: один объект, массив, NDJSON (непустая строка = один объект), либо несколько `{...}{...}` / склейка по скобкам.
   * @param {string} text
   * @returns {{ error: string | null, items: unknown[] }}
   */
  function parseJsonObjectsFromFileText(text) {
    const t = text.trim();
    if (!t) return { error: "Пустой файл", items: [] };
    try {
      const root = JSON.parse(t);
      if (Array.isArray(root)) return { error: null, items: root };
      if (root && typeof root === "object") return { error: null, items: [root] };
    } catch {
      // продолжаем другие варианты
    }
    const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length > 0) {
      const parsed = [];
      for (let li = 0; li < lines.length; li++) {
        try {
          parsed.push(JSON.parse(lines[li]));
        } catch {
          parsed.length = 0;
          break;
        }
      }
      if (parsed.length === lines.length && parsed.length > 0) {
        return { error: null, items: parsed };
      }
    }
    const scanned = parseJsonObjectsByBraceScan(t);
    if (scanned.error) return scanned;
    if (scanned.items.length > 0) return { error: null, items: scanned.items };
    return {
      error: "Не удалось распознать JSON (объект, массив, по одному объекту на строку или несколько {...})",
      items: [],
    };
  }

  /**
   * @param {unknown} o
   * @returns {string | null} текст ошибки или null
   */
  function validateCreatePayload(o) {
    if (!o || typeof o !== "object") return "Запись не является объектом JSON";
    const rec = /** @type {Record<string, unknown>} */ (o);
    const fields = ["parameterCode", "parameterType", "parameterName", "parameterValue"];
    for (const f of fields) {
      if (!(f in rec) || String(rec[f]).trim() === "") {
        return "Пустое или отсутствует поле: " + f;
      }
    }
    const pt = String(rec.parameterType).trim();
    const allowed = getParameterTypeAllowedValues();
    if (allowed.indexOf(pt) < 0) {
      return "parameterType «" + pt + "» не из списка допустимых: " + allowed.join(", ");
    }
    return null;
  }

  /**
   * @param {unknown} o
   * @returns {string | null}
   */
  function validateUpdatePayload(o) {
    const base = validateCreatePayload(o);
    if (base) return base;
    const rec = /** @type {Record<string, unknown>} */ (o);
    if (editTabAllowedListsLoaded && cachedActualParameterCodes !== null) {
      const pc = String(rec.parameterCode).trim();
      if (!cachedActualParameterCodes.has(pc)) {
        return "parameterCode «" + pc + "» не из загруженного списка допустимых (вкладка «Редактирование»).";
      }
    }
    if (!("objectId" in rec) || String(rec.objectId).trim() === "") {
      return "Пустое или отсутствует поле: objectId";
    }
    if (!("version" in rec) || rec.version === null || rec.version === undefined || String(rec.version).trim() === "") {
      return "Пустое или отсутствует поле: version";
    }
    const v = Number(rec.version);
    if (!Number.isFinite(v) || v < 0) return "Некорректное поле version";
    if (!("status" in rec) || String(rec.status).trim() === "") {
      return "Пустое или отсутствует поле: status";
    }
    return null;
  }

  /**
   * @param {unknown} data
   * @returns {number | null}
   */
  function readVersionFromDetailResponse(data) {
    const body = data && typeof data === "object" ? data.body : null;
    const params = body && Array.isArray(body.parameters) ? body.parameters : [];
    const first = params[0];
    if (!first || typeof first !== "object") return null;
    const v = /** @type {Record<string, unknown>} */ (first).version;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }

  /**
   * parameterCode из первой записи body.parameters (ответ детализации по objectId).
   * @param {unknown} data
   * @returns {string | null}
   */
  function readParameterCodeFromDetailResponse(data) {
    const body = data && typeof data === "object" ? data.body : null;
    const params = body && Array.isArray(body.parameters) ? body.parameters : [];
    const first = params[0];
    if (!first || typeof first !== "object") return null;
    const c = /** @type {Record<string, unknown>} */ (first).parameterCode;
    return typeof c === "string" && c.trim() ? c.trim() : null;
  }

  /**
   * Длина массива body.parameters в ответе (для журнала на шаге списка).
   * @param {unknown} data
   * @returns {number}
   */
  function countParametersRowsInResponse(data) {
    const body = data && typeof data === "object" ? data.body : null;
    const params = body && Array.isArray(body.parameters) ? body.parameters : [];
    return params.length;
  }

  /**
   * Поле success верхнего уровня JSON, если есть (строка для журнала).
   * @param {unknown} data
   * @returns {string | null}
   */
  function formatSuccessFieldForLog(data) {
    if (!data || typeof data !== "object") return null;
    if (!("success" in /** @type {Record<string, unknown>} */ (data))) return null;
    return String(/** @type {Record<string, unknown>} */ (data).success);
  }

  /**
   * Все parameterCode из ответа списка parameters (ACTUAL/ARCHIVE).
   * @param {unknown} listData
   * @returns {Set<string>}
   */
  function extractParameterCodesFromListData(listData) {
    const set = new Set();
    const body = listData && typeof listData === "object" ? /** @type {Record<string, unknown>} */ (listData).body : null;
    const params = body && Array.isArray(body.parameters) ? /** @type {unknown[]} */ (body.parameters) : [];
    for (let i = 0; i < params.length; i++) {
      const p = params[i];
      if (!p || typeof p !== "object") continue;
      const c = /** @type {Record<string, unknown>} */ (p).parameterCode;
      if (typeof c === "string" && c.trim()) set.add(c.trim());
    }
    return set;
  }

  /**
   * Разбор parameterValue: ожидается JSON с массивом types (как у parameterTypes).
   * @param {unknown} parameterValue
   * @returns {string[]}
   */
  function parseTypesArrayFromParameterValue(parameterValue) {
    if (parameterValue == null) return [];
    let obj = null;
    if (typeof parameterValue === "string") {
      const s = String(parameterValue).trim();
      if (!s) return [];
      try {
        obj = JSON.parse(s);
      } catch {
        return [];
      }
    } else if (typeof parameterValue === "object") {
      obj = parameterValue;
    }
    if (!obj || typeof obj !== "object") return [];
    const types = /** @type {Record<string, unknown>} */ (obj).types;
    if (!Array.isArray(types)) return [];
    const out = [];
    const seen = new Set();
    for (let ti = 0; ti < types.length; ti++) {
      const v = String(types[ti]).trim();
      if (v && !seen.has(v)) {
        seen.add(v);
        out.push(v);
      }
    }
    return out;
  }

  /**
   * В ответе детализации ищет запись с parameterCode = parameterTypes, забирает types[] из parameterValue.
   * @param {unknown} detailData
   * @returns {string[]}
   */
  function extractTypesFromParameterTypesDetail(detailData) {
    const body = detailData && typeof detailData === "object" ? /** @type {Record<string, unknown>} */ (detailData).body : null;
    const params = body && Array.isArray(body.parameters) ? /** @type {unknown[]} */ (body.parameters) : [];
    for (let i = 0; i < params.length; i++) {
      const p = params[i];
      if (!p || typeof p !== "object") continue;
      const rec = /** @type {Record<string, unknown>} */ (p);
      if (String(rec.parameterCode || "").trim() !== PARAMETER_TYPES_META_CODE) continue;
      return parseTypesArrayFromParameterValue(rec.parameterValue);
    }
    return [];
  }

  /**
   * В ответе детализации есть ли строка с parameterCode = parameterTypes.
   * @param {unknown} detailData
   * @returns {boolean}
   */
  function hasParameterTypesMetaInDetail(detailData) {
    const body = detailData && typeof detailData === "object" ? /** @type {Record<string, unknown>} */ (detailData).body : null;
    const params = body && Array.isArray(body.parameters) ? /** @type {unknown[]} */ (body.parameters) : [];
    for (let i = 0; i < params.length; i++) {
      const p = params[i];
      if (!p || typeof p !== "object") continue;
      if (String(/** @type {Record<string, unknown>} */ (p).parameterCode || "").trim() === PARAMETER_TYPES_META_CODE) {
        return true;
      }
    }
    return false;
  }

  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /**
   * @param {string} filename
   * @param {unknown} obj
   */
  function downloadJson(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const existing = document.getElementById(PANEL_ID);
  if (existing) existing.remove();

  const panel = document.createElement("div");
  panel.id = PANEL_ID;
  // Колонка flex: область вкладок растягивается (flex:1), журнал — компактная фиксированная полоса внизу.
  panel.style.cssText = [
    "position:fixed",
    "right:12px",
    "bottom:12px",
    "width:" + PANEL_WIDTH_CSS,
    "height:" + PANEL_HEIGHT_CSS,
    "max-height:" + PANEL_HEIGHT_CSS,
    "box-sizing:border-box",
    "display:flex",
    "flex-direction:column",
    "overflow:hidden",
    "min-height:0",
    "z-index:2147483646",
    "background:#111827",
    "color:#e5e7eb",
    "font:" + PANEL_FONT_BASE + "/1.3 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif",
    "border:1px solid #374151",
    "border-radius:10px",
    "box-shadow:0 10px 30px rgba(0,0,0,.45)",
    "padding:8px 10px 8px",
  ].join(";");

  const title = document.createElement("div");
  title.textContent = "Параметры: выгрузка / создание / правка";
  title.style.cssText =
    "font-weight:700;font-size:" +
    PANEL_FONT_BASE +
    ";margin-bottom:3px;color:#f9fafb;flex-shrink:0;line-height:1.25;";
  panel.appendChild(title);

  const standRow = document.createElement("div");
  standRow.style.cssText = "display:flex;gap:6px;align-items:center;margin-bottom:4px;flex-wrap:wrap;flex-shrink:0;";
  const standLabel = document.createElement("span");
  standLabel.textContent = "Стенд:";
  const standSel = document.createElement("select");
  standSel.style.cssText =
    "font-size:" +
    PANEL_FONT_BASE +
    ";background:#0b1220;color:#e5e7eb;border:1px solid #374151;border-radius:5px;padding:3px 5px;";
  [["PROM", "PROM"], ["PSI", "PSI"]].forEach(([v, t]) => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = t;
    standSel.appendChild(o);
  });
  standSel.value = DEFAULT_STAND;

  const contourLabel = document.createElement("span");
  contourLabel.textContent = "Контур:";
  const contourSel = document.createElement("select");
  contourSel.style.cssText = standSel.style.cssText;
  [["SIGMA", "SIGMA"], ["ALPHA", "ALPHA"]].forEach(([v, t]) => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = t;
    contourSel.appendChild(o);
  });
  contourSel.value = DEFAULT_CONTOUR;

  standRow.appendChild(standLabel);
  standRow.appendChild(standSel);
  standRow.appendChild(contourLabel);
  standRow.appendChild(contourSel);
  panel.appendChild(standRow);

  const envInfo = document.createElement("div");
  envInfo.style.cssText =
    "font-size:" +
    PANEL_FONT_SMALL +
    ";line-height:1.25;color:#9ca3af;margin-bottom:4px;word-break:break-all;flex-shrink:0;max-height:3.2em;overflow-y:auto;";
  panel.appendChild(envInfo);

  function refreshEnvInfo() {
    try {
      const origin = getOrigin(standSel.value, contourSel.value);
      envInfo.textContent = "POST " + origin + PARAMETERS_PATH + " | create: " + PARAM_CREATE_PATH + " | update: " + PARAM_UPDATE_PATH;
    } catch (e) {
      envInfo.textContent = String(e && e.message ? e.message : e);
    }
  }
  const tabsRow = document.createElement("div");
  tabsRow.style.cssText = "display:flex;gap:4px;margin-bottom:4px;flex-wrap:wrap;flex-shrink:0;";
  const tabButtons = [];
  const tabPanels = [];

  /**
   * @param {number} idx
   */
  function showTab(idx) {
    tabButtons.forEach((b, i) => {
      b.style.background = i === idx ? "#2563eb" : "#1f2937";
      b.style.color = "#e5e7eb";
    });
    tabPanels.forEach((p, i) => {
      p.style.display = i === idx ? "flex" : "none";
    });
  }

  function mkTabButton(label, idx) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.cssText =
      "border:1px solid #374151;border-radius:5px;padding:4px 8px;cursor:pointer;font-size:" +
      PANEL_FONT_BASE +
      ";line-height:1.2;";
    b.addEventListener("click", () => showTab(idx));
    return b;
  }

  const tab1Btn = mkTabButton("1. Выгрузка", 0);
  const tab2Btn = mkTabButton("2. Создание", 1);
  const tab3Btn = mkTabButton("3. Редактирование", 2);
  tabButtons.push(tab1Btn, tab2Btn, tab3Btn);
  tabsRow.appendChild(tab1Btn);
  tabsRow.appendChild(tab2Btn);
  tabsRow.appendChild(tab3Btn);
  panel.appendChild(tabsRow);

  const wrap = document.createElement("div");
  // Область вкладок забирает всю свободную высоту панели; вкладки — колонка flex с растягиваемым textarea.
  wrap.style.cssText = [
    "flex:1 1 0%",
    "min-height:0",
    "position:relative",
    "overflow:hidden",
    "border:1px solid #374151",
    "border-radius:6px",
    "background:#0f172a",
    "box-sizing:border-box",
  ].join(";");
  panel.appendChild(wrap);

  /** Общие стили области вкладки: колонка на весь wrap; при нехватке места — прокрутка вкладки. */
  const tabPanelBaseStyle =
    "position:absolute;left:0;right:0;top:0;bottom:0;display:flex;flex-direction:column;min-height:0;overflow-x:hidden;overflow-y:auto;box-sizing:border-box;padding:4px 6px 6px;";

  // --- Tab 1: выгрузка ---
  const tab1 = document.createElement("div");
  tab1.style.cssText = tabPanelBaseStyle;
  const statusRow = document.createElement("div");
  statusRow.style.cssText =
    "flex-shrink:0;display:flex;gap:6px;align-items:center;margin-bottom:4px;flex-wrap:wrap;";
  const statusLabel = document.createElement("span");
  statusLabel.textContent = "Статус списка:";
  const statusSel = document.createElement("select");
  statusSel.style.cssText = standSel.style.cssText;
  [["ACTUAL", "ACTUAL"], ["ARCHIVE", "ARCHIVE"]].forEach(([v, t]) => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = t;
    statusSel.appendChild(o);
  });
  statusSel.value = DEFAULT_STATUS;
  const delayLabel = document.createElement("span");
  delayLabel.textContent = "Пауза (мс) между objectId:";
  const delayInput = document.createElement("input");
  delayInput.type = "number";
  delayInput.min = "0";
  delayInput.step = "50";
  delayInput.value = "250";
  delayInput.style.cssText =
    "width:84px;font-size:" +
    PANEL_FONT_BASE +
    ";background:#0b1220;color:#e5e7eb;border:1px solid #374151;border-radius:6px;padding:3px 5px;";
  statusRow.appendChild(statusLabel);
  statusRow.appendChild(statusSel);
  statusRow.appendChild(delayLabel);
  statusRow.appendChild(delayInput);
  tab1.appendChild(statusRow);

  const runBtn = document.createElement("button");
  runBtn.type = "button";
  runBtn.textContent = "Запустить выгрузку";
  runBtn.style.cssText =
    "width:100%;flex-shrink:0;border:1px solid #374151;border-radius:6px;padding:6px 8px;cursor:pointer;background:#2563eb;color:#f9fafb;font-weight:600;font-size:" +
    PANEL_FONT_BASE +
    ";";
  tab1.appendChild(runBtn);

  // --- Tab 2: создание ---
  const tab2 = document.createElement("div");
  tab2.style.cssText = tabPanelBaseStyle + "display:none;";
  const createHint = document.createElement("div");
  createHint.style.cssText =
    "flex-shrink:0;font-size:" + PANEL_FONT_SMALL + ";color:#9ca3af;margin-bottom:4px;line-height:1.3;";
  createHint.textContent =
    "Кнопка ⬇ (шаг 6.1): ACTUAL + детализация «parameterTypes» — кэш допустимых типов и кодов; param-create не вызывается. Если ⬇ не нажимали, перед «Создать» и при создании из файла те же запросы выполнятся один раз автоматически. Файл: по строке на JSON или несколько объектов {...} подряд.";
  tab2.appendChild(createHint);

  function mkLabel(text) {
    const el = document.createElement("div");
    el.textContent = text;
    el.style.cssText =
      "flex-shrink:0;font-size:" + PANEL_FONT_BASE + ";color:#d1d5db;margin:4px 0 2px;line-height:1.25;";
    return el;
  }
  function mkInput(type) {
    const el = document.createElement("input");
    el.type = type;
    el.style.cssText =
      "width:100%;flex-shrink:0;box-sizing:border-box;font-size:" +
      PANEL_FONT_BASE +
      ";line-height:1.25;background:#0b1220;color:#e5e7eb;border:1px solid #374151;border-radius:5px;padding:4px 6px;";
    return el;
  }
  function mkTextarea(rows) {
    const el = document.createElement("textarea");
    el.rows = rows;
    el.style.cssText =
      "width:100%;box-sizing:border-box;font-size:" +
      PANEL_FONT_BASE +
      ";line-height:1.25;background:#0b1220;color:#e5e7eb;border:1px solid #374151;border-radius:5px;padding:4px 6px;resize:vertical;";
    return el;
  }

  const cCode = mkInput("text");
  const cType = document.createElement("select");
  cType.style.cssText = cCode.style.cssText + "flex:1;min-width:0;";
  fillParameterTypeSelect(cType);
  const cName = mkInput("text");
  const cValue = mkTextarea(2);
  cValue.style.flex = "1 1 auto";
  cValue.style.minHeight = "44px";

  tab2.appendChild(mkLabel("parameterCode *"));
  tab2.appendChild(cCode);
  tab2.appendChild(mkLabel("parameterType * (кнопка ⬇ — загрузить из API)"));
  const cTypeRow = document.createElement("div");
  cTypeRow.style.cssText =
    "flex-shrink:0;display:flex;gap:6px;align-items:stretch;width:100%;box-sizing:border-box;";
  const refreshTypesBtn = document.createElement("button");
  refreshTypesBtn.type = "button";
  refreshTypesBtn.textContent = "\u2B07";
  refreshTypesBtn.title =
    "Загрузить допустимые parameterType: POST ACTUAL + одна детализация objectId " +
    PARAMETER_TYPES_DETAIL_OBJECT_ID +
    " (parameterCode=parameterTypes → types). Без param-create и без обхода всех id.";
  refreshTypesBtn.style.cssText =
    "flex-shrink:0;width:30px;min-width:30px;padding:0;border:1px solid #374151;border-radius:5px;background:#1f2937;color:#e5e7eb;cursor:pointer;font-size:14px;line-height:1;display:flex;align-items:center;justify-content:center;";
  cTypeRow.appendChild(cType);
  cTypeRow.appendChild(refreshTypesBtn);
  tab2.appendChild(cTypeRow);
  tab2.appendChild(mkLabel("parameterName *"));
  tab2.appendChild(cName);
  tab2.appendChild(mkLabel("parameterValue *"));
  tab2.appendChild(cValue);

  const createBtn = document.createElement("button");
  createBtn.type = "button";
  createBtn.textContent = "Создать параметр (param-create)";
  createBtn.style.cssText =
    "width:100%;flex-shrink:0;margin-top:6px;border:1px solid #374151;border-radius:6px;padding:6px 8px;cursor:pointer;background:#059669;color:#f9fafb;font-weight:600;font-size:" +
    PANEL_FONT_BASE +
    ";";
  tab2.appendChild(createBtn);

  const createFileRow = document.createElement("div");
  createFileRow.style.cssText = "flex-shrink:0;margin-top:8px;padding-top:6px;border-top:1px solid #374151;";
  const createFileHint = document.createElement("div");
  createFileHint.style.cssText = "font-size:" + PANEL_FONT_SMALL + ";color:#9ca3af;margin-bottom:4px;line-height:1.3;";
  createFileHint.textContent = "Из файла: JSON-объект(ы) с полями parameterCode, parameterType, parameterName, parameterValue. Несколько — по одному объекту на строку, массив, или блоки {...}{...}.";
  createFileRow.appendChild(createFileHint);
  const createFileInput = document.createElement("input");
  createFileInput.type = "file";
  createFileInput.accept = ".json,.txt,application/json,text/plain";
  createFileInput.style.cssText = "display:none;";
  const createFileBtn = document.createElement("button");
  createFileBtn.type = "button";
  createFileBtn.textContent = "Создать из файла…";
  createFileBtn.style.cssText =
    "width:100%;flex-shrink:0;border:1px solid #374151;border-radius:6px;padding:6px 8px;cursor:pointer;background:#1f2937;color:#e5e7eb;font-size:" +
    PANEL_FONT_BASE +
    ";";
  createFileRow.appendChild(createFileBtn);
  createFileRow.appendChild(createFileInput);
  tab2.appendChild(createFileRow);

  // --- Tab 3: редактирование ---
  const tab3 = document.createElement("div");
  tab3.style.cssText = tabPanelBaseStyle + "display:none;";
  const updHint = document.createElement("div");
  updHint.style.cssText =
    "flex-shrink:0;font-size:" + PANEL_FONT_SMALL + ";color:#9ca3af;margin-bottom:4px;line-height:1.3;";
  updHint.textContent =
    "Сначала нажмите «загрузить допустимые значения» (как шаг 6.1: только POST ACTUAL + детализация «parameterTypes», без param-update). В полях parameterCode и parameterType — списки из ответа. До загрузки поля пустые. objectId проверяется по ACTUAL; версия — из API по objectId.";
  tab3.appendChild(updHint);

  const uCode = document.createElement("select");
  uCode.style.cssText =
    "width:100%;flex-shrink:0;box-sizing:border-box;font-size:" +
    PANEL_FONT_BASE +
    ";line-height:1.25;background:#0b1220;color:#e5e7eb;border:1px solid #374151;border-radius:5px;padding:4px 6px;";
  const uType = document.createElement("select");
  uType.style.cssText = uCode.style.cssText + "flex:1;min-width:0;";
  clearEditTabParameterSelects(uCode, uType);
  const uName = mkInput("text");
  const uValue = mkTextarea(2);
  uValue.style.flex = "1 1 auto";
  uValue.style.minHeight = "44px";
  const uObjectId = mkInput("text");
  const uStatus = document.createElement("select");
  uStatus.style.cssText = cCode.style.cssText;
  [["ACTUAL", "ACTUAL"], ["ARCHIVE", "ARCHIVE"]].forEach(([v, t]) => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = t;
    uStatus.appendChild(o);
  });
  uStatus.value = "ACTUAL";
  const uVersionInfo = document.createElement("div");
  uVersionInfo.style.cssText =
    "flex-shrink:0;font-size:" + PANEL_FONT_BASE + ";color:#93c5fd;margin:2px 0;line-height:1.25;";

  tab3.appendChild(mkLabel("objectId *"));
  tab3.appendChild(uObjectId);
  tab3.appendChild(uVersionInfo);

  const editLoadHint = document.createElement("div");
  editLoadHint.style.cssText =
    "flex-shrink:0;font-size:" + PANEL_FONT_SMALL + ";color:#9ca3af;margin:4px 0 2px;line-height:1.3;";
  editLoadHint.textContent = "Допустимые parameterCode и parameterType (кнопка ⬇ — только загрузка справочников, без param-update):";
  tab3.appendChild(editLoadHint);
  const editLoadRow = document.createElement("div");
  editLoadRow.style.cssText =
    "flex-shrink:0;display:flex;gap:6px;align-items:stretch;width:100%;box-sizing:border-box;margin-bottom:4px;";
  const editLoadBtn = document.createElement("button");
  editLoadBtn.type = "button";
  editLoadBtn.textContent = "\u2B07";
  editLoadBtn.title =
    "Загрузить списки допустимых parameterCode (из ACTUAL) и parameterType (из детализации «parameterTypes»). Запросы те же, что на вкладке «Создание»; param-update не вызывается.";
  editLoadBtn.style.cssText =
    "flex-shrink:0;width:30px;min-width:30px;padding:0;border:1px solid #374151;border-radius:5px;background:#1f2937;color:#e5e7eb;cursor:pointer;font-size:14px;line-height:1;display:flex;align-items:center;justify-content:center;";
  const editLoadLabel = document.createElement("div");
  editLoadLabel.style.cssText =
    "flex:1;min-width:0;font-size:" + PANEL_FONT_SMALL + ";color:#9ca3af;display:flex;align-items:center;line-height:1.25;";
  editLoadLabel.textContent = "Загрузить допустимые значения для полей ниже";
  editLoadRow.appendChild(editLoadBtn);
  editLoadRow.appendChild(editLoadLabel);
  tab3.appendChild(editLoadRow);

  tab3.appendChild(mkLabel("parameterCode *"));
  tab3.appendChild(uCode);
  tab3.appendChild(mkLabel("parameterType *"));
  const uTypeRow = document.createElement("div");
  uTypeRow.style.cssText = "flex-shrink:0;display:flex;gap:6px;align-items:stretch;width:100%;box-sizing:border-box;";
  uTypeRow.appendChild(uType);
  tab3.appendChild(uTypeRow);
  tab3.appendChild(mkLabel("parameterName *"));
  tab3.appendChild(uName);
  tab3.appendChild(mkLabel("parameterValue *"));
  tab3.appendChild(uValue);
  tab3.appendChild(mkLabel("status *"));
  tab3.appendChild(uStatus);

  const updateBtn = document.createElement("button");
  updateBtn.type = "button";
  updateBtn.textContent = "Обновить параметр (param-update)";
  updateBtn.style.cssText =
    "width:100%;flex-shrink:0;margin-top:6px;border:1px solid #374151;border-radius:6px;padding:6px 8px;cursor:pointer;background:#d97706;color:#111827;font-weight:600;font-size:" +
    PANEL_FONT_BASE +
    ";";
  tab3.appendChild(updateBtn);

  const updateFileRow = document.createElement("div");
  updateFileRow.style.cssText = "flex-shrink:0;margin-top:8px;padding-top:6px;border-top:1px solid #374151;";
  const updateFileHint = document.createElement("div");
  updateFileHint.style.cssText = "font-size:" + PANEL_FONT_SMALL + ";color:#9ca3af;margin-bottom:4px;line-height:1.3;";
  updateFileHint.textContent = "Из файла: те же поля + objectId, status; version из файла игнорируется — берётся из API по objectId.";
  updateFileRow.appendChild(updateFileHint);
  const updateFileInput = document.createElement("input");
  updateFileInput.type = "file";
  updateFileInput.accept = ".json,.txt,application/json,text/plain";
  updateFileInput.style.cssText = "display:none;";
  const updateFileBtn = document.createElement("button");
  updateFileBtn.type = "button";
  updateFileBtn.textContent = "Обновить из файла…";
  updateFileBtn.style.cssText = createFileBtn.style.cssText;
  updateFileRow.appendChild(updateFileBtn);
  updateFileRow.appendChild(updateFileInput);
  tab3.appendChild(updateFileRow);

  /**
   * Смена стенда/контура — сброс кэшей, селект создания и пустые селекты вкладки «Редактирование».
   */
  function invalidateParameterCachesOnEnvChange() {
    cachedActualParameterCodes = null;
    cachedActualObjectIds = null;
    cachedAllowedParameterTypes = null;
    editTabAllowedListsLoaded = false;
    fillParameterTypeSelect(cType);
    clearEditTabParameterSelects(uCode, uType);
    refreshEnvInfo();
  }

  standSel.addEventListener("change", invalidateParameterCachesOnEnvChange);
  contourSel.addEventListener("change", invalidateParameterCachesOnEnvChange);
  refreshEnvInfo();

  tabPanels.push(tab1, tab2, tab3);
  wrap.appendChild(tab1);
  wrap.appendChild(tab2);
  wrap.appendChild(tab3);
  showTab(0);

  const logTitle = document.createElement("div");
  logTitle.textContent = "Журнал работы";
  logTitle.style.cssText =
    "margin-top:6px;font-weight:600;font-size:" + PANEL_FONT_BASE + ";color:#f9fafb;flex-shrink:0;";
  panel.appendChild(logTitle);

  const logBox = document.createElement("pre");
  // Журнал растягивается на оставшуюся высоту панели (не одна строка).
  logBox.style.cssText = [
    "flex:0 0 auto",
    "height:" + PANEL_LOG_HEIGHT_CSS,
    "min-height:" + PANEL_LOG_MIN_HEIGHT_PX + "px",
    "margin:4px 0 0",
    "padding:6px",
    "background:#0b1220",
    "border:1px solid #374151",
    "border-radius:8px",
    "overflow:auto",
    "white-space:pre-wrap",
    "word-break:break-word",
    "font:" + PANEL_FONT_SMALL + "/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
    "color:#e5e7eb",
  ].join(";");
  panel.appendChild(logBox);

  const footer = document.createElement("div");
  footer.style.cssText = "display:flex;gap:6px;margin-top:6px;flex-shrink:0;";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "Закрыть панель";
  closeBtn.style.cssText =
    "flex:1;border:1px solid #374151;border-radius:6px;padding:6px 8px;cursor:pointer;background:#1f2937;color:#e5e7eb;font-size:" +
    PANEL_FONT_BASE +
    ";";
  footer.appendChild(closeBtn);
  panel.appendChild(footer);

  document.body.appendChild(panel);

  /** @type {boolean} */
  let busy = false;

  /**
   * @param {string} msg
   */
  function log(msg) {
    const line = new Date().toISOString() + " — " + msg;
    const lines = (logBox.textContent ? logBox.textContent.split("\n") : []).concat(line);
    while (lines.length > LOG_MAX_LINES) lines.shift();
    logBox.textContent = lines.join("\n");
    logBox.scrollTop = logBox.scrollHeight;
    // Кратко в консоль только ошибки верхнего уровня
    if (msg.indexOf("Ошибка") >= 0 || msg.indexOf("ошибка") >= 0) {
      console.warn("[Parameters panel]", msg);
    }
  }

  /**
   * @param {boolean} v
   */
  function setBusy(v) {
    busy = v;
    runBtn.disabled = v;
    createBtn.disabled = v;
    createFileBtn.disabled = v;
    updateBtn.disabled = v;
    updateFileBtn.disabled = v;
    standSel.disabled = v;
    contourSel.disabled = v;
    statusSel.disabled = v;
    delayInput.disabled = v;
    tab1Btn.disabled = v;
    tab2Btn.disabled = v;
    tab3Btn.disabled = v;
    cCode.disabled = v;
    cType.disabled = v;
    cName.disabled = v;
    cValue.disabled = v;
    uCode.disabled = v;
    uType.disabled = v;
    uName.disabled = v;
    uValue.disabled = v;
    uObjectId.disabled = v;
    uStatus.disabled = v;
    refreshTypesBtn.disabled = v;
    editLoadBtn.disabled = v;
    runBtn.style.opacity = v ? "0.55" : "1";
    createBtn.style.opacity = v ? "0.55" : "1";
    createFileBtn.style.opacity = v ? "0.55" : "1";
    updateBtn.style.opacity = v ? "0.55" : "1";
    updateFileBtn.style.opacity = v ? "0.55" : "1";
    refreshTypesBtn.style.opacity = v ? "0.55" : "1";
    editLoadBtn.style.opacity = v ? "0.55" : "1";
  }

  closeBtn.addEventListener("click", () => panel.remove());

  /**
   * POST списка ACTUAL — всегда кладёт ответ в кэш (для кнопки ⬇ и принудительного обновления).
   * @param {string} origin
   * @param {boolean} verbose
   * @param {string} [logTag]
   * @returns {Promise<boolean>}
   */
  async function fetchActualListAndCache(origin, verbose, logTag) {
    const tag = logTag != null && String(logTag).trim() !== "" ? String(logTag).trim() : "[Создание]";
    if (verbose) {
      log(tag + ' Шаг 1/2: POST { "status": "ACTUAL" } — кэш parameterCode…');
    }
    const listRes = await postParameters(origin, { status: "ACTUAL" });
    if (!listRes.ok) {
      log(tag + " Ошибка списка ACTUAL: HTTP " + listRes.status + " — " + listRes.text.slice(0, 400));
      return false;
    }
    const listData = listRes.data;
    cachedActualParameterCodes = extractParameterCodesFromListData(listData);
    cachedActualObjectIds = new Set(extractObjectIds(listData));
    const rows = countParametersRowsInResponse(listData);
    if (verbose) {
      log(
        tag +
          " Шаг 1/2: HTTP " +
          listRes.status +
          ", строк в body.parameters: " +
          rows +
          ", parameterCode в кэше: " +
          cachedActualParameterCodes.size +
          ", objectId в кэше: " +
          cachedActualObjectIds.size +
          ".",
      );
    }
    return true;
  }

  /**
   * Одна детализация по PARAMETER_TYPES_DETAIL_OBJECT_ID — допустимые parameterType в кэш и селект создания (вкладка 2).
   * Селекты вкладки «Редактирование» заполняются только кнопкой загрузки на вкладке 3.
   * @param {string} origin
   * @param {boolean} verbose
   * @param {string} [logTag]
   * @returns {Promise<void>}
   */
  async function fetchParameterTypesDetailAndApply(origin, verbose, logTag) {
    const tag = logTag != null && String(logTag).trim() !== "" ? String(logTag).trim() : "[Создание]";
    const metaObjectId = String(PARAMETER_TYPES_DETAIL_OBJECT_ID).trim();
    if (verbose) {
      log(
        tag +
          ' Шаг 2/2: POST { "objectIds": ["' +
          metaObjectId +
          '"] } — ожидается parameterCode=«' +
          PARAMETER_TYPES_META_CODE +
          "»…",
      );
    }
    const dr = await postParameters(origin, { objectIds: [metaObjectId] });
    if (!dr.ok) {
      log(tag + " Ошибка детализации: HTTP " + dr.status + " — " + dr.text.slice(0, 400));
      cachedAllowedParameterTypes = null;
      fillParameterTypeSelect(cType);
      return;
    }
    const typesFromMeta = extractTypesFromParameterTypesDetail(dr.data);
    if (!hasParameterTypesMetaInDetail(dr.data)) {
      const codeIn = readParameterCodeFromDetailResponse(dr.data);
      log(
        tag +
          " В ответе нет записи с parameterCode=«" +
          PARAMETER_TYPES_META_CODE +
          "» (первая строка: «" +
          (codeIn != null && codeIn !== "" ? codeIn : "—") +
          "»). Список типов из API не применён — PARAMETER_TYPE_OPTIONS на вкладке «Создание».",
      );
      cachedAllowedParameterTypes = null;
      fillParameterTypeSelect(cType);
      return;
    }
    const merged = Array.from(new Set(typesFromMeta)).sort(function (a, b) {
      return a.localeCompare(b, "ru");
    });
    if (merged.length === 0) {
      cachedAllowedParameterTypes = null;
      log(
        tag +
          " Запись «" +
          PARAMETER_TYPES_META_CODE +
          "» найдена, но массив types пуст — оставлены PARAMETER_TYPE_OPTIONS на вкладке «Создание».",
      );
      fillParameterTypeSelect(cType);
    } else {
      cachedAllowedParameterTypes = merged;
      fillParameterTypeSelectWithApiValues(cType, merged);
      if (verbose) {
        log(tag + " Готово: уникальных parameterType из «" + PARAMETER_TYPES_META_CODE + ".types»: " + merged.length + ".");
      }
    }
  }

  /**
   * Перед созданием (форма или файл): шаг 6.1 — если кэш уже заполнен кнопкой ⬇, повторно ACTUAL не запрашиваем;
   * иначе один раз POST ACTUAL (п.2) и при необходимости детализация типов.
   * @returns {Promise<boolean>} false — нельзя продолжать (ошибка ACTUAL).
   */
  async function ensureCachesForCreateOperation() {
    const origin = getOrigin(standSel.value, contourSel.value);
    if (cachedActualParameterCodes === null) {
      log("[Создание] Кэш parameterCode пуст — выполняется POST ACTUAL (как п.2 при отсутствии шага 6.1 по кнопке ⬇).");
      const ok = await fetchActualListAndCache(origin, true);
      if (!ok) return false;
    } else {
      log(
        "[Создание] Список parameterCode берётся из кэша (шаг 6.1 уже выполнялся — повторный POST ACTUAL не делаем). Записей в кэше: " +
          cachedActualParameterCodes.size +
          ".",
      );
    }
    if (cachedAllowedParameterTypes !== null && cachedAllowedParameterTypes.length > 0) {
      log("[Создание] Допустимые parameterType уже из кэша API — повторная детализация не выполняется.");
      return true;
    }
    log("[Создание] Не загружены допустимые parameterType из API — детализация «parameterTypes» (один запрос).");
    await fetchParameterTypesDetailAndApply(origin, true);
    return true;
  }

  /**
   * Кнопка ⬇: принудительное обновление — всегда ACTUAL + детализация (param-create не вызывается).
   */
  async function refreshParameterTypesFromApi() {
    if (busy) return;
    setBusy(true);
    try {
      const origin = getOrigin(standSel.value, contourSel.value);
      log("[Создание] Обновление списка допустимых parameterType (без param-create, без обхода всех objectId).");
      const ok = await fetchActualListAndCache(origin, true);
      if (!ok) return;
      await fetchParameterTypesDetailAndApply(origin, true);
    } catch (e) {
      log("[Создание] Ошибка загрузки типов: " + (e && e.message ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Вкладка «3»: POST ACTUAL + детализация «parameterTypes» — только заполнение селектов parameterCode и parameterType (без param-update).
   * @returns {Promise<boolean>} true — справочники готовы (п. 7.1 / 7.2).
   */
  async function refreshEditTabAllowedListsFromApi() {
    if (busy) return false;
    setBusy(true);
    try {
      const origin = getOrigin(standSel.value, contourSel.value);
      log(
        "[Редактирование] Загрузка допустимых значений: POST ACTUAL + детализация «parameterTypes» (param-update не вызывается).",
      );
      const ok = await fetchActualListAndCache(origin, true, "[Редактирование]");
      if (!ok) {
        editTabAllowedListsLoaded = false;
        clearEditTabParameterSelects(uCode, uType);
        return false;
      }
      await fetchParameterTypesDetailAndApply(origin, true, "[Редактирование]");
      if (
        cachedAllowedParameterTypes !== null &&
        cachedAllowedParameterTypes.length > 0 &&
        cachedActualParameterCodes !== null
      ) {
        fillParameterCodeSelectFromActualCodes(uCode, cachedActualParameterCodes);
        fillParameterTypeSelectWithApiValues(uType, cachedAllowedParameterTypes, true);
        editTabAllowedListsLoaded = true;
        log(
          "[Редактирование] Списки для полей: parameterCode — " +
            cachedActualParameterCodes.size +
            " шт., objectId (сохранено для проверок) — " +
            (cachedActualObjectIds ? cachedActualObjectIds.size : 0) +
            " шт., parameterType — " +
            cachedAllowedParameterTypes.length +
            " шт.",
        );
        return true;
      }
      editTabAllowedListsLoaded = false;
      clearEditTabParameterSelects(uCode, uType);
      log(
        "[Редактирование] Справочники из API неполные — выбор parameterCode/parameterType недоступен. Повторите загрузку или проверьте ответ API.",
      );
      return false;
    } catch (e) {
      editTabAllowedListsLoaded = false;
      clearEditTabParameterSelects(uCode, uType);
      log("[Редактирование] Ошибка загрузки: " + (e && e.message ? e.message : String(e)));
      return false;
    } finally {
      setBusy(false);
    }
  }

  /**
   * Перед param-update: если справочники п. 7.1 не готовы — выполнить п. 7.2 (тот же поток, что кнопка ⬇).
   * @returns {Promise<boolean>}
   */
  async function ensureEditTabListsForUpdate() {
    if (editTabAllowedListsLoaded && cachedActualObjectIds !== null && cachedActualParameterCodes !== null) {
      return true;
    }
    log(
      "[Редактирование] Допустимые значения из п. 7.1 ещё не готовы — автоматически выполняется п. 7.2 (загрузка без param-update).",
    );
    return await refreshEditTabAllowedListsFromApi();
  }

  refreshTypesBtn.addEventListener("click", function () {
    refreshParameterTypesFromApi();
  });

  editLoadBtn.addEventListener("click", function () {
    refreshEditTabAllowedListsFromApi();
  });

  runBtn.addEventListener("click", async () => {
    if (busy) return;
    setBusy(true);
    log("[Выгрузка] Старт. Стенд: " + standSel.value + ", контур: " + contourSel.value + ".");
    try {
      const origin = getOrigin(standSel.value, contourSel.value);
      const status = statusSel.value;
      const delayMs = Math.max(0, Number(delayInput.value) || 0);
      const listPayload = { status };
      log(
        "[Выгрузка] Шаг 1/2: запрос списка параметров. POST " +
          origin +
          PARAMETERS_PATH +
          " | тело: " +
          JSON.stringify(listPayload) +
          " | пауза между детализациями: " +
          delayMs +
          " мс.",
      );

      const listRes = await postParameters(origin, listPayload);
      if (!listRes.ok) {
        log("[Выгрузка] Шаг 1/2: ошибка. HTTP " + listRes.status + " — фрагмент ответа: " + listRes.text.slice(0, 500));
        return;
      }
      const listData = listRes.data;
      const objectIds = extractObjectIds(listData);
      const rowsInList = countParametersRowsInResponse(listData);
      const succList = formatSuccessFieldForLog(listData);
      log(
        "[Выгрузка] Шаг 1/2: получен ответ HTTP " +
          listRes.status +
          ". Строк в body.parameters: " +
          rowsInList +
          ", уникальных objectId: " +
          objectIds.length +
          (succList !== null ? ", success=" + succList : "") +
          ".",
      );
      if (objectIds.length > 0) {
        const preview = objectIds.length <= 5 ? objectIds.join(", ") : objectIds.slice(0, 3).join(", ") + " … (всего " + objectIds.length + ")";
        log("[Выгрузка] objectId для детализации: " + preview + ".");
      } else {
        log("[Выгрузка] Шаг 2/2: детализировать нечего (список objectId пуст). Файл всё равно будет сохранён с пустым набором деталей.");
      }

      const details = [];
      let ok = 0;
      let fail = 0;
      const total = objectIds.length;
      for (let i = 0; i < objectIds.length; i++) {
        const id = objectIds[i];
        const num = i + 1;
        if (i > 0 && delayMs > 0) {
          log("[Выгрузка] Пауза " + delayMs + " мс перед запросом детали " + num + "/" + total + ".");
          await delay(delayMs);
        }
        const detailPayload = { objectIds: [id] };
        log(
          "[Выгрузка] Шаг 2/2: запрос детали " +
            num +
            " из " +
            total +
            ". POST " +
            origin +
            PARAMETERS_PATH +
            " | тело: " +
            JSON.stringify(detailPayload) +
            ".",
        );
        const dr = await postParameters(origin, detailPayload);
        details.push({ objectId: id, requestIndex: num, response: dr });
        if (dr.ok) {
          ok++;
          const code = readParameterCodeFromDetailResponse(dr.data);
          const succD = formatSuccessFieldForLog(dr.data);
          log(
            "[Выгрузка] Шаг 2/2: ответ по детали " +
              num +
              " из " +
              total +
              " — HTTP " +
              dr.status +
              " OK" +
              (code ? ", parameterCode=" + code : "") +
              (succD !== null ? ", success=" + succD : "") +
              ".",
          );
        } else {
          fail++;
          log(
            "[Выгрузка] Шаг 2/2: ошибка детали " +
              num +
              " из " +
              total +
              ", objectId=" +
              id +
              ": HTTP " +
              dr.status +
              " — фрагмент: " +
              dr.text.slice(0, 400),
          );
        }
      }

      const result = {
        meta: {
          exportedAt: new Date().toISOString(),
          stand: standSel.value,
          contour: contourSel.value,
          origin,
          parametersPath: PARAMETERS_PATH,
          listStatus: status,
          delayMsBetweenObjectIds: delayMs,
          objectIdsCount: objectIds.length,
          detailOk: ok,
          detailFail: fail,
        },
        list: listData,
        details,
      };

      const d = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const fname =
        "parameters_" +
        standSel.value +
        "_" +
        contourSel.value +
        "_" +
        d.getFullYear() +
        "-" +
        pad(d.getMonth() + 1) +
        "-" +
        pad(d.getDate()) +
        ".json";
      downloadJson(fname, result);
      log(
        "[Выгрузка] Готово. Файл: " +
          fname +
          " | детализаций: всего " +
          total +
          ", успешно " +
          ok +
          ", с ошибкой " +
          fail +
          ".",
      );
    } catch (e) {
      log("Ошибка: " + (e && e.message ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  });

  /**
   * @param {unknown} data
   * @returns {boolean}
   */
  function isSuccessTrue(data) {
    return !!(data && typeof data === "object" && /** @type {Record<string, unknown>} */ (data).success === true);
  }

  createBtn.addEventListener("click", async () => {
    if (busy) return;
    const payload = {
      parameterCode: cCode.value.trim(),
      parameterType: cType.value.trim(),
      parameterName: cName.value.trim(),
      parameterValue: cValue.value,
    };
    setBusy(true);
    try {
      const cachesOk = await ensureCachesForCreateOperation();
      if (!cachesOk) {
        log("[Создание] Не удалось подготовить данные для проверки (список ACTUAL). Создание не выполняется.");
        return;
      }
      const err = validateCreatePayload(payload);
      if (err) {
        log("Ошибка проверки полей и типа: " + err);
        return;
      }
      if (cachedActualParameterCodes && cachedActualParameterCodes.has(payload.parameterCode)) {
        log(
          "[Создание] Параметр с кодом «" +
            payload.parameterCode +
            "» уже есть в списке ACTUAL. Создание не выполняется — используйте вкладку «3. Редактирование» (param-update).",
        );
        return;
      }
    } catch (e) {
      log("Ошибка: " + (e && e.message ? e.message : String(e)));
      return;
    } finally {
      setBusy(false);
    }
    const summary =
      "Создать параметр (param-create)?\n\n" +
      "parameterCode: " +
      payload.parameterCode +
      "\nparameterType: " +
      payload.parameterType +
      "\nparameterName: " +
      payload.parameterName +
      "\nparameterValue (фрагмент): " +
      String(payload.parameterValue).slice(0, 120) +
      (String(payload.parameterValue).length > 120 ? "…" : "");
    if (!window.confirm(summary)) {
      log("Создание отменено пользователем — запрос param-create не отправлялся.");
      return;
    }
    setBusy(true);
    try {
      const origin = getOrigin(standSel.value, contourSel.value);
      const res = await postJson(origin, PARAM_CREATE_PATH, payload);
      if (!res.ok) {
        log("Ошибка param-create: HTTP " + res.status + " — " + res.text.slice(0, 800));
        return;
      }
      if (isSuccessTrue(res.data)) {
        log("param-create: success=true, ответ получен.");
      } else {
        log("Ошибка param-create: success не true. Фрагмент ответа: " + JSON.stringify(res.data).slice(0, 1200));
      }
    } catch (e) {
      log("Ошибка: " + (e && e.message ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  });

  createFileBtn.addEventListener("click", () => createFileInput.click());
  createFileInput.addEventListener("change", async () => {
    if (busy) return;
    const f = createFileInput.files && createFileInput.files[0];
    createFileInput.value = "";
    if (!f) return;
    setBusy(true);
    try {
      const cachesOk = await ensureCachesForCreateOperation();
      if (!cachesOk) {
        log("[Создание] Не удалось подготовить данные для проверки (список ACTUAL). Пакет из файла не выполняется.");
        return;
      }
      const text = await f.text();
      const parsed = parseJsonObjectsFromFileText(text);
      if (parsed.error) {
        log("Ошибка файла: " + parsed.error);
        return;
      }
      const items = parsed.items;
      const valid = [];
      for (let i = 0; i < items.length; i++) {
        const ve = validateCreatePayload(items[i]);
        if (ve) {
          log("Ошибка записи #" + (i + 1) + ": " + ve);
          return;
        }
        valid.push(/** @type {Record<string, string>} */ (items[i]));
      }
      if (valid.length === 0) {
        log("В файле нет записей.");
        return;
      }
      const filtered = [];
      for (let fi = 0; fi < valid.length; fi++) {
        const code = String(valid[fi].parameterCode).trim();
        if (cachedActualParameterCodes && cachedActualParameterCodes.has(code)) {
          log(
            "[Создание] Файл, запись #" +
              (fi + 1) +
              ": код «" +
              code +
              "» уже есть в ACTUAL — пропуск (нужна вкладка «Редактирование», не создание).",
          );
          continue;
        }
        filtered.push(valid[fi]);
      }
      if (filtered.length === 0) {
        log("[Создание] После проверки дублей со списком ACTUAL не осталось записей для создания.");
        return;
      }
      const first = filtered[0];
      const firstMsg =
        "Внести первый параметр из файла?\n\nparameterCode: " +
        first.parameterCode +
        "\nparameterType: " +
        first.parameterType +
        "\n\nОК — внести, Отмена — не вносить ни один.";
      if (!window.confirm(firstMsg)) {
        log("Пакетное создание отменено на первом шаге.");
        return;
      }
      let applyAll = false;
      if (filtered.length > 1) {
        applyAll = window.confirm(
          "В файле записей (без дублей ACTUAL): " +
            filtered.length +
            ". Внести остальные последовательно без дальнейших подтверждений?\n\nОК — да (все подряд), Отмена — спрашивать для каждой следующей.",
        );
      }
      const origin = getOrigin(standSel.value, contourSel.value);
      for (let i = 0; i < filtered.length; i++) {
        if (i > 0) {
          if (!applyAll) {
            const rec = filtered[i];
            const q =
              "Внести параметр #" +
              (i + 1) +
              "?\nparameterCode: " +
              rec.parameterCode +
              "\nparameterType: " +
              rec.parameterType;
            if (!window.confirm(q)) {
              log("Пропуск записи #" + (i + 1) + " (пользователь отказался).");
              continue;
            }
          }
          await delay(PARAM_BATCH_REQUEST_GAP_MS);
        }
        const payload = {
          parameterCode: filtered[i].parameterCode,
          parameterType: filtered[i].parameterType,
          parameterName: filtered[i].parameterName,
          parameterValue: filtered[i].parameterValue,
        };
        const res = await postJson(origin, PARAM_CREATE_PATH, payload);
        if (!res.ok) {
          log("Ошибка param-create #" + (i + 1) + ": HTTP " + res.status + " — " + res.text.slice(0, 500));
          continue;
        }
        if (isSuccessTrue(res.data)) {
          log("Запись #" + (i + 1) + " (" + payload.parameterCode + "): success=true.");
        } else {
          log(
            "Ошибка param-create #" +
              (i + 1) +
              ": success не true. Фрагмент ответа: " +
              JSON.stringify(res.data).slice(0, 600),
          );
        }
      }
      log("Пакетное создание из файла завершено.");
    } catch (e) {
      log("Ошибка: " + (e && e.message ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  });

  updateBtn.addEventListener("click", async () => {
    if (busy) return;
    if (!(await ensureEditTabListsForUpdate())) {
      log("[Редактирование] Не удалось подготовить справочники для обновления.");
      return;
    }
    const objectId = uObjectId.value.trim();
    const payloadBase = {
      parameterCode: uCode.value.trim(),
      parameterType: uType.value.trim(),
      parameterName: uName.value.trim(),
      parameterValue: uValue.value,
      objectId,
      version: 0,
      status: uStatus.value.trim(),
    };
    const err = validateUpdatePayload(payloadBase);
    if (err) {
      log("Ошибка проверки формы: " + err);
      return;
    }
    if (!cachedActualObjectIds || !cachedActualObjectIds.has(objectId)) {
      log(
        "Ошибка: objectId «" +
          objectId +
          "» отсутствует среди сохранённых по первому запросу ACTUAL (п. 7.1). Проверьте ввод или окружение.",
      );
      return;
    }
    const parameterCode = payloadBase.parameterCode.trim();
    if (!cachedActualParameterCodes || !cachedActualParameterCodes.has(parameterCode)) {
      log(
        "[Редактирование] parameterCode «" +
          parameterCode +
          "» нет среди параметров ACTUAL — сущности для правки нет. Создайте параметр на вкладке «2. Создание» (param-create), а не редактирование.",
      );
      return;
    }
    setBusy(true);
    uVersionInfo.textContent = "";
    try {
      const origin = getOrigin(standSel.value, contourSel.value);
      const det = await postParameters(origin, { objectIds: [objectId] });
      if (!det.ok) {
        log("Ошибка детализации по objectId: HTTP " + det.status);
        return;
      }
      const ver = readVersionFromDetailResponse(det.data);
      if (ver === null) {
        log("Ошибка: не удалось прочитать version из ответа API по objectId.");
        return;
      }
      uVersionInfo.textContent = "Версия из API для отправки: " + String(ver);
      const summary =
        "Обновить параметр (param-update)?\n\nobjectId: " +
        objectId +
        "\nversion (из API): " +
        ver +
        "\nparameterCode: " +
        payloadBase.parameterCode +
        "\nparameterType: " +
        payloadBase.parameterType +
        "\nstatus: " +
        payloadBase.status;
      if (!window.confirm(summary)) {
        log("Обновление отменено пользователем.");
        return;
      }
      const body = {
        parameterCode: payloadBase.parameterCode,
        parameterType: payloadBase.parameterType,
        parameterName: payloadBase.parameterName,
        parameterValue: payloadBase.parameterValue,
        objectId: payloadBase.objectId,
        version: ver,
        status: payloadBase.status,
      };
      const res = await postJson(origin, PARAM_UPDATE_PATH, body);
      if (!res.ok) {
        log("Ошибка param-update: HTTP " + res.status + " — " + res.text.slice(0, 800));
        return;
      }
      if (isSuccessTrue(res.data)) {
        log("param-update: success=true, ответ получен.");
      } else {
        log("Ошибка param-update: success не true. Ответ: " + JSON.stringify(res.data).slice(0, 1200));
      }
    } catch (e) {
      log("Ошибка: " + (e && e.message ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  });

  updateFileBtn.addEventListener("click", () => updateFileInput.click());
  updateFileInput.addEventListener("change", async () => {
    if (busy) return;
    const f = updateFileInput.files && updateFileInput.files[0];
    updateFileInput.value = "";
    if (!f) return;
    try {
      if (!(await ensureEditTabListsForUpdate())) {
        log("[Редактирование] Не удалось подготовить справочники для пакетного обновления.");
        return;
      }
      setBusy(true);
      const text = await f.text();
      const parsed = parseJsonObjectsFromFileText(text);
      if (parsed.error) {
        log("Ошибка файла: " + parsed.error);
        return;
      }
      const items = parsed.items;
      const valid = [];
      for (let i = 0; i < items.length; i++) {
        const ve = validateUpdatePayload(items[i]);
        if (ve) {
          log("Ошибка записи #" + (i + 1) + ": " + ve);
          return;
        }
        valid.push(/** @type {Record<string, unknown>} */ (items[i]));
      }
      if (valid.length === 0) {
        log("В файле нет записей.");
        return;
      }
      const first = valid[0];
      const firstMsg =
        "Обновить первый параметр из файла?\n\nobjectId: " +
        String(first.objectId) +
        "\nparameterCode: " +
        String(first.parameterCode) +
        "\n\nОК — выполнить для первого, Отмена — отменить весь пакет.\n(version из файла не используется — подставится из API.)";
      if (!window.confirm(firstMsg)) {
        log("Пакетное обновление отменено на первом шаге.");
        return;
      }
      let applyAll = false;
      if (valid.length > 1) {
        applyAll = window.confirm(
          "В файле записей: " +
            valid.length +
            ". Обновлять остальные последовательно без подтверждений?\n\nОК — да, Отмена — спрашивать для каждой.",
        );
      }
      const origin = getOrigin(standSel.value, contourSel.value);
      for (let i = 0; i < valid.length; i++) {
        if (i > 0) {
          if (!applyAll) {
            const rec = valid[i];
            const q =
              "Обновить запись #" +
              (i + 1) +
              "?\nobjectId: " +
              String(rec.objectId) +
              "\nparameterCode: " +
              String(rec.parameterCode);
            if (!window.confirm(q)) {
              log("Пропуск записи #" + (i + 1) + " (пользователь отказался).");
              continue;
            }
          }
          await delay(PARAM_BATCH_REQUEST_GAP_MS);
        }
        const objectId = String(valid[i].objectId).trim();
        if (!cachedActualObjectIds || !cachedActualObjectIds.has(objectId)) {
          log(
            "Ошибка записи #" +
              (i + 1) +
              ": objectId «" +
              objectId +
              "» нет в сохранённом по п. 7.1 списке ACTUAL. Проверьте ID или окружение.",
          );
          continue;
        }
        const pc = String(valid[i].parameterCode).trim();
        if (!cachedActualParameterCodes || !cachedActualParameterCodes.has(pc)) {
          log(
            "[Редактирование] Запись #" +
              (i + 1) +
              ": parameterCode «" +
              pc +
              "» нет в ACTUAL — создайте на вкладке «2. Создание», не редактирование.",
          );
          continue;
        }
        const det = await postParameters(origin, { objectIds: [objectId] });
        if (!det.ok) {
          log("Ошибка детализации для записи #" + (i + 1) + ": HTTP " + det.status);
          continue;
        }
        const ver = readVersionFromDetailResponse(det.data);
        if (ver === null) {
          log("Ошибка записи #" + (i + 1) + ": не удалось прочитать version из API.");
          continue;
        }
        const body = {
          parameterCode: String(valid[i].parameterCode).trim(),
          parameterType: String(valid[i].parameterType).trim(),
          parameterName: String(valid[i].parameterName).trim(),
          parameterValue: valid[i].parameterValue,
          objectId,
          version: ver,
          status: String(valid[i].status).trim(),
        };
        const res = await postJson(origin, PARAM_UPDATE_PATH, body);
        if (!res.ok) {
          log("Ошибка param-update #" + (i + 1) + ": HTTP " + res.status + " — " + res.text.slice(0, 500));
          continue;
        }
        if (isSuccessTrue(res.data)) {
          log("Запись #" + (i + 1) + " (" + body.parameterCode + ", objectId=" + objectId + "): success=true.");
        } else {
          log("Ошибка param-update #" + (i + 1) + ": success не true. " + JSON.stringify(res.data).slice(0, 600));
        }
      }
      log("Пакетное обновление из файла завершено.");
    } catch (e) {
      log("Ошибка: " + (e && e.message ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  });

  console.log("[Parameters_Actual_Export] Панель открыта. Стенд/контур общие для всех вкладок.");
})();
