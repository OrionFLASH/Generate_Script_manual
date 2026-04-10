// =============================================================================
// AddressBook_export.js — выгрузки из адресной книги (DevTools, консоль)
// =============================================================================
// Стенд в смысле окружения — ALPHA; база URL для fetch = window.location.origin (как в успешном HAR: тот же хост, что у открытой вкладки).
// Тогда credentials: 'include' отправляет куки сессии, привязанные к этому хосту (не к «чужому» origin вроде omega.sbrf.ru при вкладке https://addressbook/).
// ADDRESSBOOK_ORIGINS.ALPHA — справочный/запасной хост Omega, если origin вкладки пуст (редко: file:// и т.п.).
// Карточка empInfoFull: empId = UUID (employeeId из search), не 8-значный ТН.
// =============================================================================
// Вся логика в IIFE: повторная вставка скрипта в консоль не падает на «уже объявлено» (const/let на верхнем уровне).
(function () {
  "use strict";

/** Ключ стенда в логах и именах файлов (только ALPHA, вариантов SIGMA/TAB нет). */
const ADDRESSBOOK_STAND_KEY = "ALPHA";

// Справочный хост Omega (подпись на панели, запасной origin, если у вкладки нет location.origin).
const ADDRESSBOOK_ORIGINS = {
  ALPHA: "https://addressbook.omega.sbrf.ru"
};

const ADDRESSBOOK_API_HOME = "/api/home";

// Табельные для подсказки в поле (empInfoFull / search по числу); тот же разбор, что из файла .txt.
const EMP_IDS = ["00673892"];

/** Значение по умолчанию для пауз на панели (мс). */
const REQUEST_PAUSE_MS = 50;

/** Верхняя граница паузы с панели (мс), защита от опечаток. */
const REQUEST_PAUSE_MAX_MS = 300000;

function delay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

/**
 * Нормализация табельного: цифры, при необходимости ведущие нули до 8 знаков.
 * @param {string} s
 * @returns {string|null}
 */
function normalizeEmpId(s) {
  if (!s || typeof s !== "string") return null;
  const digits = s.replace(/\D/g, "");
  if (digits.length === 0) return null;
  let t = digits;
  if (t.length < 8) t = t.padStart(8, "0");
  if (t.length > 20) t = t.slice(-20);
  return t;
}

/**
 * Разбор списка ТН из текста или содержимого .txt: группы цифр, любые нецифры — разделители (как в Profile_GP / _from_file).
 * @param {string} text
 * @returns {string[]}
 */
function parseEmpIdsFromText(text) {
  if (!text || typeof text !== "string") return [];
  const seq = text.match(/\d+/g) || [];
  const out = [];
  const seen = {};
  for (let i = 0; i < seq.length; i++) {
    const n = normalizeEmpId(seq[i]);
    if (n && !seen[n]) {
      seen[n] = true;
      out.push(n);
    }
  }
  return out;
}

/**
 * Число для тела POST search по табельному (как в UI адресной книги): ведущие нули снимаются.
 * @param {string} normalizedEightDigits
 * @returns {number}
 */
function tabNumToSearchNumber(normalizedEightDigits) {
  return Number(String(normalizedEightDigits).replace(/^0+/, "") || "0");
}

/**
 * Берёт employeeId (UUID) из ответа POST employees/search.
 * @param {*} data — распарсенный JSON
 * @returns {string|null}
 */
function pickEmployeeIdFromSearchData(data) {
  if (!data || typeof data !== "object") return null;
  var hits = data.hits;
  if (!Array.isArray(hits) || hits.length === 0) return null;
  var h0 = hits[0];
  if (!h0 || typeof h0.employeeId !== "string") return null;
  var id = h0.employeeId.trim();
  return id.length > 0 ? id : null;
}

/**
 * Ключ стенда ALPHA и origin для URL запросов без завершающего слэша.
 * Приоритет — origin текущей вкладки (куки сессии совпадают с документом); иначе ADDRESSBOOK_ORIGINS.ALPHA.
 * @returns {{ standKey: string, origin: string }}
 */
function getAddressBookStandAndOrigin() {
  var tabOrigin = "";
  try {
    tabOrigin = String(window.location.origin || "").replace(/\/$/, "");
  } catch (e) {
    tabOrigin = "";
  }
  if (tabOrigin && tabOrigin !== "null") {
    return { standKey: ADDRESSBOOK_STAND_KEY, origin: tabOrigin };
  }
  var fallback = (ADDRESSBOOK_ORIGINS.ALPHA || "").replace(/\/$/, "");
  return { standKey: ADDRESSBOOK_STAND_KEY, origin: fallback };
}

/**
 * GET …/api/home/empInfoFull?empId=  (empId — UUID employeeId с бэкенда, не 8-значный ТН)
 * @param {string} empId
 */
async function fetchEmpInfoFull(empId) {
  var o = getAddressBookStandAndOrigin();
  const url =
    o.origin +
    ADDRESSBOOK_API_HOME +
    "/empInfoFull?empId=" +
    encodeURIComponent(empId);
  const res = await fetch(url, {
    method: "GET",
    mode: "cors",
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json, text/plain, */*" }
  });
  const data = await res.json().catch(function () {
    return null;
  });
  return {
    empId: empId,
    stand: o.standKey,
    ok: res.ok,
    status: res.status,
    data: data
  };
}

/**
 * POST …/api/home/employees/search
 * @param {string|number} searchText — число ТН или строка ФИО
 * @param {boolean} asNumber — true: в теле число без кавычек в JSON
 */
async function fetchEmployeesSearch(searchText, asNumber) {
  var o = getAddressBookStandAndOrigin();
  const body = asNumber
    ? { searchText: Number(searchText), pageToken: null }
    : { searchText: String(searchText), pageToken: null };
  const res = await fetch(o.origin + ADDRESSBOOK_API_HOME + "/employees/search", {
    method: "POST",
    mode: "cors",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*"
    },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(function () {
    return null;
  });
  return {
    stand: o.standKey,
    ok: res.ok,
    status: res.status,
    body: body,
    data: data
  };
}

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], {
    type: "application/json"
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () {
    URL.revokeObjectURL(a.href);
  }, 0);
}

/**
 * Панель выгрузок: визуально в одном стиле с Profile_GP_LOAD_file (отступы, скругления, стенд в «карточке», кнопки-градиенты).
 * Повторная вставка скрипта удаляет предыдущий корень `addressBookExportPanelRoot`.
 */
function startAddressBookPanel() {
  var prev = document.getElementById("addressBookExportPanelRoot");
  if (prev) prev.remove();

  /** Пока идёт цепочка запросов — не запускать второй сценарий с панели. */
  var requestBusy = false;

  const box = document.createElement("div");
  box.id = "addressBookExportPanelRoot";
  // Стиль как у панели профилей: читаемость на тёмных страницах (color + color-scheme).
  box.style.cssText =
    "position:fixed;top:12px;right:12px;width:min(700px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;" +
    "z-index:999999;box-sizing:border-box;padding:20px 20px 18px;" +
    "background:#ffffff;border:1px solid #cbd5e1;border-radius:12px;" +
    "box-shadow:0 10px 40px rgba(15,23,42,.12);font-family:system-ui,-apple-system,sans-serif;" +
    "font-size:12px;color:#0f172a;color-scheme:light;";

  const head = document.createElement("div");
  head.style.cssText =
    "font-size:17px;font-weight:700;color:#0f172a;margin:0 0 4px 0;letter-spacing:-0.02em;";
  head.textContent = "Адресная книга — выгрузки";
  box.appendChild(head);

  const sub = document.createElement("div");
  sub.style.cssText = "font-size:12px;color:#64748b;margin:0 0 14px 0;line-height:1.45;";
  sub.textContent =
    "Стенд ALPHA. Запросы идут на origin этой вкладки — с ним же уходят куки сессии (см. блок «Стенд»). Прогресс — в логе и в консоли.";
  box.appendChild(sub);

  const rowStand = document.createElement("div");
  rowStand.style.cssText =
    "display:flex;align-items:flex-start;gap:12px;margin-bottom:16px;flex-wrap:wrap;padding:12px 14px;" +
    "background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;";
  const labSt = document.createElement("div");
  labSt.textContent = "Стенд";
  labSt.style.cssText = "font-weight:600;font-size:13px;color:#334155;min-width:52px;flex-shrink:0;padding-top:2px;";
  const standInfo = document.createElement("div");
  standInfo.style.cssText =
    "flex:1;min-width:200px;font-size:12px;color:#0f172a;line-height:1.45;word-break:break-all;";
  var oPanel = "";
  try {
    oPanel = String(window.location.origin || "").replace(/\/$/, "");
  } catch (e) {
    oPanel = "";
  }
  if (oPanel && oPanel !== "null") {
    standInfo.textContent =
      "ALPHA. База запросов (куки сессии): " + oPanel + ADDRESSBOOK_API_HOME + "/…";
  } else {
    standInfo.textContent =
      "ALPHA. Нет origin вкладки — запасной хост: " +
      ADDRESSBOOK_ORIGINS.ALPHA +
      ADDRESSBOOK_API_HOME +
      "/…";
  }
  rowStand.appendChild(labSt);
  rowStand.appendChild(standInfo);
  box.appendChild(rowStand);

  const secParams = document.createElement("div");
  secParams.style.cssText =
    "font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;margin:0 0 6px 0;";
  secParams.textContent = "Параметры";
  box.appendChild(secParams);

  const rowParams = document.createElement("div");
  rowParams.style.cssText =
    "display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px 14px;margin-bottom:14px;padding:8px 12px;" +
    "background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;box-sizing:border-box;align-items:center;";
  function mkPauseField(labelText, defaultMs, idSuffix) {
    const wrap = document.createElement("label");
    wrap.style.cssText =
      "display:flex;flex-direction:row;align-items:center;justify-content:space-between;gap:8px;" +
      "font-size:11px;color:#334155;cursor:pointer;min-width:0;";
    wrap.setAttribute("for", "addrBookPause" + idSuffix);
    const sp = document.createElement("span");
    sp.textContent = labelText;
    sp.style.cssText = "line-height:1.25;flex:1 1 auto;min-width:0;";
    const inp = document.createElement("input");
    inp.type = "number";
    inp.id = "addrBookPause" + idSuffix;
    inp.min = "0";
    inp.max = String(REQUEST_PAUSE_MAX_MS);
    inp.step = "1";
    inp.value = String(defaultMs);
    inp.title = "0 — без паузы; максимум " + REQUEST_PAUSE_MAX_MS + " мс.";
    inp.style.cssText =
      "flex:0 0 auto;width:64px;box-sizing:border-box;padding:4px 6px;font-size:12px;color:#0f172a;" +
      "border:1px solid #94a3b8;border-radius:6px;color-scheme:light;";
    wrap.appendChild(sp);
    wrap.appendChild(inp);
    return { wrap: wrap, inp: inp };
  }
  var fieldBetween = mkPauseField("Пауза между сотрудниками в списке, мс", REQUEST_PAUSE_MS, "Between");
  var fieldAfterSearch = mkPauseField("Пауза после search перед empInfoFull, мс", REQUEST_PAUSE_MS, "AfterSearch");
  rowParams.appendChild(fieldBetween.wrap);
  rowParams.appendChild(fieldAfterSearch.wrap);
  box.appendChild(rowParams);

  // Выбор .txt: parseEmpIdsFromText; без записи в textarea — сразу цепочка карточек.
  const inputFileTn = document.createElement("input");
  inputFileTn.type = "file";
  inputFileTn.accept = ".txt,text/plain";
  inputFileTn.style.cssText = "display:none;";

  const bLoadTn = document.createElement("button");
  bLoadTn.type = "button";
  bLoadTn.textContent = "Файл .txt → карточки сразу";
  bLoadTn.title =
    "UTF-8, любые разделители между числами. В лог — статистика; затем сразу search → empInfoFull по списку (поле ТН не трогаем).";
  bLoadTn.style.cssText =
    "width:100%;box-sizing:border-box;min-height:42px;padding:8px 10px;margin:0;font-size:11px;font-weight:600;cursor:pointer;" +
    "border-radius:8px;border:1px solid #64748b;color:#1e293b;background:#e2e8f0;line-height:1.3;" +
    "display:flex;align-items:center;justify-content:center;";

  const rowFileTxt = document.createElement("div");
  rowFileTxt.style.cssText = "width:100%;box-sizing:border-box;margin:0 0 14px 0;";
  rowFileTxt.appendChild(inputFileTn);
  rowFileTxt.appendChild(bLoadTn);
  box.appendChild(rowFileTxt);

  const inpPauseBetween = fieldBetween.inp;
  const inpPauseAfterSearch = fieldAfterSearch.inp;

  /**
   * Читает паузу из поля: неотрицательное целое, с ограничением сверху.
   * @param {HTMLInputElement} inp
   * @param {number} fallback
   * @returns {number}
   */
  function readPauseMsFromInput(inp, fallback) {
    var n = parseInt(String(inp.value).trim(), 10);
    if (isNaN(n) || n < 0) return fallback;
    if (n > REQUEST_PAUSE_MAX_MS) return REQUEST_PAUSE_MAX_MS;
    return n;
  }

  // Заголовки колонок; подсказки — фиксированная высота + прокрутка, чтобы textarea и ряд кнопок совпадали в обеих колонках.
  const secHdr =
    "font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;margin:0;line-height:1.2;";
  const labHint =
    "font-size:11px;color:#475569;margin:0;line-height:1.45;box-sizing:border-box;" +
    "height:5.5rem;min-height:5.5rem;max-height:5.5rem;overflow-y:auto;overflow-x:hidden;padding:2px 4px 2px 0;";

  const secTn = document.createElement("div");
  secTn.style.cssText = secHdr;
  secTn.textContent = "Табельные номера";

  const lab1 = document.createElement("div");
  lab1.textContent =
    "По ТН из поля: карточка — search → empInfoFull; «POST search по ТН» — только поиск. Разделители между цифрами — любые. Выгрузка из .txt — кнопка над колонками (поле ТН не меняется).";
  lab1.style.cssText = labHint;

  const taIds = document.createElement("textarea");
  taIds.rows = 4;
  taIds.spellcheck = false;
  taIds.style.cssText =
    "width:100%;box-sizing:border-box;margin:0;padding:8px 10px;font-size:12px;font-family:ui-monospace,monospace;" +
    "color:#0f172a;background:#fff;border:1px solid #94a3b8;border-radius:8px;resize:vertical;" +
    "min-height:100px;height:100px;max-height:220px;color-scheme:light;";
  taIds.placeholder = EMP_IDS.join("\n");
  taIds.value = EMP_IDS.join("\n");

  const btnRowTn = document.createElement("div");
  btnRowTn.style.cssText =
    "display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;width:100%;box-sizing:border-box;";
  const btnCssHalf =
    "min-width:0;min-height:42px;padding:8px 6px;font-size:10px;font-weight:600;cursor:pointer;border-radius:8px;border:none;color:#fff;" +
    "text-align:center;line-height:1.2;box-sizing:border-box;display:flex;align-items:center;justify-content:center;";
  const b1 = document.createElement("button");
  b1.type = "button";
  b1.textContent = "Карточки по ТН (search → empInfoFull)";
  b1.style.cssText = btnCssHalf + "background:linear-gradient(180deg,#0284c7,#0369a1);box-shadow:0 2px 6px rgba(3,105,161,.3);";
  const b2 = document.createElement("button");
  b2.type = "button";
  b2.textContent = "POST search по ТН";
  b2.style.cssText = btnCssHalf + "background:linear-gradient(180deg,#14b8a6,#0d9488);box-shadow:0 2px 6px rgba(13,148,136,.3);";


  const mainGrid = document.createElement("div");
  mainGrid.style.cssText =
    "display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:20px;row-gap:10px;" +
    "align-items:start;margin-bottom:12px;box-sizing:border-box;";

  const secFio = document.createElement("div");
  secFio.style.cssText = secHdr;
  secFio.textContent = "Поиск по ФИО";

  const lab2 = document.createElement("div");
  lab2.textContent = "Каждая непустая строка — отдельный POST employees/search.";
  lab2.style.cssText = labHint;

  const taFio = document.createElement("textarea");
  taFio.rows = 4;
  taFio.spellcheck = false;
  taFio.style.cssText =
    "width:100%;box-sizing:border-box;margin:0;padding:8px 10px;font-size:12px;" +
    "color:#0f172a;background:#fff;border:1px solid #94a3b8;border-radius:8px;resize:vertical;" +
    "min-height:100px;height:100px;max-height:220px;color-scheme:light;";
  taFio.placeholder = "Например:\nИванов Иван Иванович";

  const b3 = document.createElement("button");
  b3.type = "button";
  b3.textContent = "POST search по ФИО (все строки)";
  b3.style.cssText =
    "width:100%;box-sizing:border-box;min-height:42px;padding:8px 10px;margin:0;font-size:11px;font-weight:600;" +
    "cursor:pointer;border-radius:8px;border:none;color:#fff;" +
    "background:linear-gradient(180deg,#7c3aed,#6d28d9);box-shadow:0 2px 6px rgba(124,58,237,.35);" +
    "display:flex;align-items:center;justify-content:center;line-height:1.25;";

  btnRowTn.appendChild(b1);
  btnRowTn.appendChild(b2);

  // Первая строка сетки — один контейнер на две колонки, чтобы заголовки «Табельные номера» и «Поиск по ФИО» были на одной линии.
  const headerRow = document.createElement("div");
  headerRow.style.cssText =
    "grid-column:1 / -1;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:20px;box-sizing:border-box;align-items:start;";
  headerRow.appendChild(secTn);
  headerRow.appendChild(secFio);

  // Подсказки и поля в общих строках; кнопка .txt — отдельной полосой над сеткой (rowFileTxt).
  mainGrid.appendChild(headerRow);
  mainGrid.appendChild(lab1);
  mainGrid.appendChild(lab2);
  mainGrid.appendChild(taIds);
  mainGrid.appendChild(taFio);
  mainGrid.appendChild(btnRowTn);
  mainGrid.appendChild(b3);
  box.appendChild(mainGrid);

  const logEl = document.createElement("div");
  logEl.style.cssText =
    "margin-top:0;font-size:11px;color:#0f172a;background:#f8fafc;min-height:168px;max-height:300px;overflow:auto;" +
    "border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-family:ui-monospace,monospace;" +
    "white-space:pre-wrap;word-break:break-word;line-height:1.45;box-sizing:border-box;width:100%;";
  logEl.textContent = "Лог: —";

  /**
   * Добавляет строку в поле лога на панели и дублирует в консоль.
   * @param {string} line
   */
  function appendLog(line) {
    const s = typeof line === "string" ? line : String(line);
    console.log("[Адресная книга]", s);
    if (logEl.textContent === "Лог: —") logEl.textContent = s;
    else logEl.textContent = logEl.textContent + "\n" + s;
    logEl.scrollTop = logEl.scrollHeight;
  }

  /** Блокировка кнопок и полей паузы на время сценария. */
  function setBusy(busy) {
    requestBusy = busy;
    b1.disabled = busy;
    b2.disabled = busy;
    b3.disabled = busy;
    bLoadTn.disabled = busy;
    inpPauseBetween.disabled = busy;
    inpPauseAfterSearch.disabled = busy;
  }

  /**
   * Цепочка search → empInfoFull по списку ТН; паузы задаются с панели.
   * @param {string[]} ids
   * @param {number} pauseBetweenMs — после обработки одного ТН перед следующим
   * @param {number} pauseAfterSearchMs — после успешного search перед GET empInfoFull
   * @param {string} [sourceTag] — метка в логе («Из поля» / «Из файла»)
   */
  async function runEmpInfoFullExport(ids, pauseBetweenMs, pauseAfterSearchMs, sourceTag) {
    var prefix = sourceTag ? sourceTag + " — " : "";
    appendLog(
      prefix +
        "Карточки по ТН (search → empInfoFull), шт.: " +
        ids.length +
        ", стенд: " +
        ADDRESSBOOK_STAND_KEY
    );
    const results = [];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const searchNum = tabNumToSearchNumber(id);
      appendLog("[" + (i + 1) + "/" + ids.length + "] ТН " + id + " → search(" + searchNum + ") …");
      try {
        const searchRes = await fetchEmployeesSearch(searchNum, true);
        appendLog(
          "    → search HTTP " + searchRes.status + (searchRes.ok ? "" : " — ошибка")
        );
        var totalHits =
          searchRes.data && typeof searchRes.data.total === "number"
            ? searchRes.data.total
            : searchRes.data && Array.isArray(searchRes.data.hits)
              ? searchRes.data.hits.length
              : 0;
        if (totalHits > 1) {
          appendLog("    → внимание: в ответе search несколько записей, берётся первая (hits[0])");
        }
        const empUuid = pickEmployeeIdFromSearchData(searchRes.data);
        if (!empUuid) {
          results.push({
            tabNumNormalized: id,
            search: searchRes,
            employeeId: null,
            empInfoFull: null,
            error: "Нет employeeId в ответе search (пустые hits или неуспех)"
          });
          appendLog("    → пропуск: нет employeeId после search");
        } else {
          appendLog("    → employeeId " + empUuid + " → GET empInfoFull …");
          if (pauseAfterSearchMs > 0) await delay(pauseAfterSearchMs);
          const full = await fetchEmpInfoFull(empUuid);
          results.push({
            tabNumNormalized: id,
            search: searchRes,
            employeeId: empUuid,
            empInfoFull: full
          });
          appendLog("    → empInfoFull HTTP " + full.status + (full.ok ? " OK" : " ошибка"));
        }
      } catch (e) {
        results.push({ tabNumNormalized: id, error: String(e) });
        appendLog("    → исключение: " + e);
      }
      if (i < ids.length - 1 && pauseBetweenMs > 0) await delay(pauseBetweenMs);
    }
    const fname = "addressbook_empInfoFull_" + ADDRESSBOOK_STAND_KEY + "_" + Date.now() + ".json";
    downloadJson(fname, results);
    appendLog("Готово. Файл: " + fname + " (записей: " + results.length + ")");
  }

  // Файл .txt: статистика в лог, без заполнения textarea — сразу runEmpInfoFullExport.
  inputFileTn.addEventListener("change", function () {
    var file = inputFileTn.files && inputFileTn.files[0];
    inputFileTn.value = "";
    if (!file) return;
    if (requestBusy) {
      appendLog("Уже выполняется запрос — дождитесь окончания.");
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var text = typeof reader.result === "string" ? reader.result : "";
      var digitGroups = text.match(/\d+/g) || [];
      var ids = parseEmpIdsFromText(text);
      if (ids.length === 0) {
        appendLog(
          "Файл «" +
            file.name +
            "»: уникальных ТН нет (групп цифр в тексте: " +
            digitGroups.length +
            ")."
        );
        return;
      }
      appendLog(
        "Файл «" +
          file.name +
          "»: статистика — групп цифр: " +
          digitGroups.length +
          ", уникальных ТН: " +
          ids.length +
          ". Запуск выгрузки карточек…"
      );
      var pb = readPauseMsFromInput(inpPauseBetween, REQUEST_PAUSE_MS);
      var pa = readPauseMsFromInput(inpPauseAfterSearch, REQUEST_PAUSE_MS);
      setBusy(true);
      void (async function () {
        try {
          await runEmpInfoFullExport(ids, pb, pa, "Из файла");
        } catch (err) {
          appendLog("Сбой сценария: " + err);
        } finally {
          setBusy(false);
        }
      })();
    };
    reader.onerror = function () {
      appendLog("Ошибка чтения файла «" + file.name + "».");
    };
    reader.readAsText(file, "UTF-8");
  });

  bLoadTn.addEventListener("click", function () {
    if (requestBusy) {
      appendLog("Уже выполняется запрос — дождитесь окончания.");
      return;
    }
    inputFileTn.click();
  });

  b1.addEventListener("click", async function () {
    if (requestBusy) {
      appendLog("Уже выполняется запрос — дождитесь окончания.");
      return;
    }
    const ids = parseEmpIdsFromText(taIds.value);
    if (ids.length === 0) {
      appendLog("Нет табельных в поле (нужны группы цифр).");
      return;
    }
    var pb = readPauseMsFromInput(inpPauseBetween, REQUEST_PAUSE_MS);
    var pa = readPauseMsFromInput(inpPauseAfterSearch, REQUEST_PAUSE_MS);
    setBusy(true);
    try {
      await runEmpInfoFullExport(ids, pb, pa, "Из поля");
    } catch (err) {
      appendLog("Сбой сценария: " + err);
    } finally {
      setBusy(false);
    }
  });

  b2.addEventListener("click", async function () {
    if (requestBusy) {
      appendLog("Уже выполняется запрос — дождитесь окончания.");
      return;
    }
    const ids = parseEmpIdsFromText(taIds.value);
    if (ids.length === 0) {
      appendLog("Нет табельных в поле.");
      return;
    }
    var pb = readPauseMsFromInput(inpPauseBetween, REQUEST_PAUSE_MS);
    setBusy(true);
    try {
      appendLog("— POST search по ТН (число), запросов: " + ids.length + ", стенд: " + ADDRESSBOOK_STAND_KEY);
      const results = [];
      for (let i = 0; i < ids.length; i++) {
        const num = tabNumToSearchNumber(ids[i]);
        appendLog("[" + (i + 1) + "/" + ids.length + "] search ТН " + num + " …");
        try {
          const r = await fetchEmployeesSearch(num, true);
          results.push(r);
          appendLog("    → HTTP " + r.status + (r.ok ? " OK" : " — проверьте метод/URL (например 405)"));
        } catch (e) {
          results.push({ searchText: num, error: String(e) });
          appendLog("    → исключение: " + e);
        }
        if (i < ids.length - 1 && pb > 0) await delay(pb);
      }
      const fname = "addressbook_search_by_tn_" + ADDRESSBOOK_STAND_KEY + "_" + Date.now() + ".json";
      downloadJson(fname, results);
      appendLog("Готово. Файл: " + fname);
    } finally {
      setBusy(false);
    }
  });

  b3.addEventListener("click", async function () {
    if (requestBusy) {
      appendLog("Уже выполняется запрос — дождитесь окончания.");
      return;
    }
    const lines = taFio.value
      .split(/\r?\n/)
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
    if (lines.length === 0) {
      appendLog("Нет непустых строк ФИО.");
      return;
    }
    var pb = readPauseMsFromInput(inpPauseBetween, REQUEST_PAUSE_MS);
    setBusy(true);
    try {
      appendLog("— POST search по ФИО, строк: " + lines.length + ", стенд: " + ADDRESSBOOK_STAND_KEY);
      const results = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        appendLog(
          "[" +
            (i + 1) +
            "/" +
            lines.length +
            "] «" +
            line.slice(0, 40) +
            (line.length > 40 ? "…" : "") +
            "» …"
        );
        try {
          const r = await fetchEmployeesSearch(line, false);
          results.push(r);
          appendLog("    → HTTP " + r.status + (r.ok ? " OK" : " — проверьте метод/URL"));
        } catch (e) {
          results.push({ searchText: line, error: String(e) });
          appendLog("    → исключение: " + e);
        }
        if (i < lines.length - 1 && pb > 0) await delay(pb);
      }
      const fname = "addressbook_search_by_fio_" + ADDRESSBOOK_STAND_KEY + "_" + Date.now() + ".json";
      downloadJson(fname, results);
      appendLog("Готово. Файл: " + fname);
    } finally {
      setBusy(false);
    }
  });

  const logLab = document.createElement("div");
  logLab.style.cssText =
    "font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#64748b;margin:16px 0 8px 0;";
  logLab.textContent = "Лог";
  box.appendChild(logLab);
  box.appendChild(logEl);

  const bClose = document.createElement("button");
  bClose.type = "button";
  bClose.textContent = "Закрыть панель";
  bClose.title =
    "Удаляет панель с DOM: поля, паузы и обработчики снимаются; скрипт можно снова вставить в консоль (обёртка IIFE не даёт ошибки повторного const).";
  bClose.style.cssText =
    "margin-top:14px;width:100%;box-sizing:border-box;min-height:44px;padding:10px 14px;font-size:12px;cursor:pointer;" +
    "background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;border-radius:8px;font-weight:500;";
  bClose.addEventListener("click", function () {
    // Удаление корня панели: замыкание сценария (requestBusy, ссылки на поля) перестаёт быть связанным с документом;
    // незавершённые fetch могут ещё завершиться в фоне, но UI и «память» панели очищены.
    box.remove();
  });
  box.appendChild(bClose);

  document.body.appendChild(box);
}

startAddressBookPanel();
})();
