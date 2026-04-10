// =============================================================================
// AddressBook_export.js — выгрузки из адресной книги (DevTools, консоль)
// =============================================================================
// Запросы: полный URL = ORIGIN + /api/home/...
// По умолчанию ORIGIN = window.location.origin (режим TAB) — same-origin, куки с вкладки, без CORS.
// ALPHA/SIGMA — фиксированные хосты; использовать только если консоль открыта на том же origin.
// Карточка empInfoFull на прокси адресной книги ожидает empId = UUID (employeeId из ответа search), не 8-значный ТН.
// credentials: 'include' — куки текущей вкладки.
// =============================================================================

// Ключ «текущая вкладка»: URL берётся из location.origin, не из таблицы ниже.
const ADDRESSBOOK_STAND_TAB = "TAB";

// Фиксированные хосты (перекрёстные запросы с https://addressbook/ к ним дают CORS/401 без настройки сервера).
const ADDRESSBOOK_ORIGINS = {
  ALPHA: "https://efs-our-business-prom.omega.sbrf.ru",
  SIGMA: "https://salesheroes.sberbank.ru"
};

const DEFAULT_ADDRESSBOOK_STAND = ADDRESSBOOK_STAND_TAB;

/** Выбранный на панели стенд: TAB | ALPHA | SIGMA. */
var ADDRESSBOOK_ACTIVE_STAND = DEFAULT_ADDRESSBOOK_STAND;

const ADDRESSBOOK_API_HOME = "/api/home";

// Табельные для режима «по списку из скрипта» (empInfoFull и поиск по числу).
const EMP_IDS = ["02209710", "00673892"];

const REQUEST_PAUSE_MS = 50;

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
 * Разбор списка ТН из текста (цифровые группы как в других скриптах проекта).
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
 * Нормализованный ключ стенда и origin без завершающего слэша.
 * @returns {{ standKey: string, origin: string }}
 */
function getAddressBookStandAndOrigin() {
  var k = ADDRESSBOOK_ACTIVE_STAND;
  if (k === "ALPHA" || k === "SIGMA") {
    var originFixed = ADDRESSBOOK_ORIGINS[k] || ADDRESSBOOK_ORIGINS.SIGMA;
    return { standKey: k, origin: originFixed.replace(/\/$/, "") };
  }
  // TAB и любое неизвестное значение — origin страницы (адресная книга в той же вкладке).
  var tabOrigin = "";
  try {
    tabOrigin = String(window.location.origin || "").replace(/\/$/, "");
  } catch (e) {
    tabOrigin = "";
  }
  if (!tabOrigin) {
    var fallback = ADDRESSBOOK_ORIGINS.SIGMA || "";
    return { standKey: "TAB", origin: fallback.replace(/\/$/, "") };
  }
  return { standKey: "TAB", origin: tabOrigin };
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
    credentials: "include",
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
    credentials: "include",
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
    "position:fixed;top:12px;right:12px;width:min(440px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;" +
    "z-index:999999;box-sizing:border-box;padding:18px 18px 16px;" +
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
    "Стенд «Текущая вкладка» — запросы на origin страницы (рекомендуется для https://addressbook/…). ALPHA/SIGMA — только с той же вкладки на этом хосте, иначе CORS. Прогресс — в логе и в консоли.";
  box.appendChild(sub);

  const rowStand = document.createElement("div");
  rowStand.style.cssText =
    "display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap;padding:10px 12px;" +
    "background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;";
  const labSt = document.createElement("label");
  labSt.textContent = "Стенд";
  labSt.setAttribute("for", "addrBookStandSel");
  labSt.style.cssText = "font-weight:600;font-size:13px;color:#334155;min-width:52px;";
  const selStand = document.createElement("select");
  selStand.id = "addrBookStandSel";
  selStand.style.cssText =
    "flex:1;min-width:200px;padding:8px 10px;font-size:13px;cursor:pointer;" +
    "color:#0f172a;background:#fff;border:1px solid #94a3b8;border-radius:6px;color-scheme:light;";
  var tabOriginSafe = "";
  try {
    tabOriginSafe = window.location.origin || "";
  } catch (e) {
    tabOriginSafe = "";
  }
  [
    { key: ADDRESSBOOK_STAND_TAB, label: "Текущая вкладка — " + (tabOriginSafe || "(нет origin)") },
    { key: "ALPHA", label: "ALPHA — " + ADDRESSBOOK_ORIGINS.ALPHA },
    { key: "SIGMA", label: "SIGMA — " + ADDRESSBOOK_ORIGINS.SIGMA }
  ].forEach(function (item) {
    const opt = document.createElement("option");
    opt.value = item.key;
    opt.textContent = item.label;
    opt.style.cssText = "color:#0f172a;background:#fff;";
    if (item.key === ADDRESSBOOK_ACTIVE_STAND) opt.selected = true;
    selStand.appendChild(opt);
  });
  if (!selStand.value || selStand.selectedIndex < 0) {
    ADDRESSBOOK_ACTIVE_STAND = ADDRESSBOOK_STAND_TAB;
    selStand.value = ADDRESSBOOK_STAND_TAB;
  }
  selStand.addEventListener("change", function () {
    ADDRESSBOOK_ACTIVE_STAND = selStand.value;
  });
  rowStand.appendChild(labSt);
  rowStand.appendChild(selStand);
  box.appendChild(rowStand);

  const secTn = document.createElement("div");
  secTn.style.cssText =
    "font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;margin:16px 0 8px 0;";
  secTn.textContent = "Табельные номера";
  box.appendChild(secTn);

  const lab1 = document.createElement("div");
  lab1.textContent =
    "По ТН: полная карточка — сначала POST search (число), затем GET empInfoFull по employeeId из ответа. «POST search по ТН» — только поиск. Разделители между цифрами в списке ТН допускаются.";
  lab1.style.cssText = "font-size:12px;color:#475569;margin:0 0 8px 0;line-height:1.4;";
  box.appendChild(lab1);

  const taIds = document.createElement("textarea");
  taIds.rows = 4;
  taIds.spellcheck = false;
  taIds.style.cssText =
    "width:100%;box-sizing:border-box;margin:0 0 10px 0;padding:10px;font-size:12px;font-family:ui-monospace,monospace;" +
    "color:#0f172a;background:#fff;border:1px solid #94a3b8;border-radius:8px;resize:vertical;min-height:80px;color-scheme:light;";
  taIds.placeholder = EMP_IDS.join("\n");
  taIds.value = EMP_IDS.join("\n");
  box.appendChild(taIds);

  const btnRowTn = document.createElement("div");
  btnRowTn.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:4px;";
  const btnCssHalf =
    "padding:11px 10px;font-size:12px;font-weight:600;cursor:pointer;border-radius:8px;border:none;color:#fff;" +
    "text-align:center;line-height:1.3;box-sizing:border-box;";
  const b1 = document.createElement("button");
  b1.type = "button";
  b1.textContent = "Карточки по ТН (search → empInfoFull)";
  b1.style.cssText = btnCssHalf + "background:linear-gradient(180deg,#0284c7,#0369a1);box-shadow:0 2px 6px rgba(3,105,161,.3);";
  const b2 = document.createElement("button");
  b2.type = "button";
  b2.textContent = "POST search по ТН";
  b2.style.cssText = btnCssHalf + "background:linear-gradient(180deg,#14b8a6,#0d9488);box-shadow:0 2px 6px rgba(13,148,136,.3);";

  const secFio = document.createElement("div");
  secFio.style.cssText =
    "font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;margin:18px 0 8px 0;";
  secFio.textContent = "Поиск по ФИО";

  const lab2 = document.createElement("div");
  lab2.textContent = "Каждая непустая строка — отдельный POST employees/search.";
  lab2.style.cssText = "font-size:12px;color:#475569;margin:0 0 8px 0;line-height:1.4;";

  const taFio = document.createElement("textarea");
  taFio.rows = 3;
  taFio.spellcheck = false;
  taFio.style.cssText =
    "width:100%;box-sizing:border-box;margin:0 0 10px 0;padding:10px;font-size:12px;" +
    "color:#0f172a;background:#fff;border:1px solid #94a3b8;border-radius:8px;resize:vertical;min-height:72px;color-scheme:light;";
  taFio.placeholder = "Например:\nИванов Иван Иванович";

  const b3 = document.createElement("button");
  b3.type = "button";
  b3.textContent = "POST search по ФИО (все строки)";
  b3.style.cssText =
    "width:100%;box-sizing:border-box;padding:11px 14px;margin:0 0 12px 0;font-size:13px;font-weight:600;" +
    "cursor:pointer;border-radius:8px;border:none;color:#fff;" +
    "background:linear-gradient(180deg,#7c3aed,#6d28d9);box-shadow:0 2px 6px rgba(124,58,237,.35);";

  const logEl = document.createElement("div");
  logEl.style.cssText =
    "margin-top:4px;font-size:11px;color:#0f172a;background:#f8fafc;max-height:160px;overflow:auto;" +
    "border:1px solid #e2e8f0;border-radius:8px;padding:10px;font-family:ui-monospace,monospace;" +
    "white-space:pre-wrap;word-break:break-word;line-height:1.45;";
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
    requestBusy = true;
    b1.disabled = true;
    b2.disabled = true;
    b3.disabled = true;
    try {
      appendLog(
        "— Карточки по ТН (search → empInfoFull), шт.: " +
          ids.length +
          ", стенд: " +
          ADDRESSBOOK_ACTIVE_STAND
      );
      const results = [];
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const searchNum = tabNumToSearchNumber(id);
        appendLog(
          "[" + (i + 1) + "/" + ids.length + "] ТН " + id + " → search(" + searchNum + ") …"
        );
        try {
          const searchRes = await fetchEmployeesSearch(searchNum, true);
          appendLog(
            "    → search HTTP " +
              searchRes.status +
              (searchRes.ok ? "" : " — ошибка")
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
            await delay(REQUEST_PAUSE_MS);
            const full = await fetchEmpInfoFull(empUuid);
            results.push({
              tabNumNormalized: id,
              search: searchRes,
              employeeId: empUuid,
              empInfoFull: full
            });
            appendLog(
              "    → empInfoFull HTTP " + full.status + (full.ok ? " OK" : " ошибка")
            );
          }
        } catch (e) {
          results.push({ tabNumNormalized: id, error: String(e) });
          appendLog("    → исключение: " + e);
        }
        if (i < ids.length - 1) await delay(REQUEST_PAUSE_MS);
      }
      const fname =
        "addressbook_empInfoFull_" + ADDRESSBOOK_ACTIVE_STAND + "_" + Date.now() + ".json";
      downloadJson(fname, results);
      appendLog("Готово. Файл: " + fname + " (записей: " + results.length + ")");
    } finally {
      requestBusy = false;
      b1.disabled = false;
      b2.disabled = false;
      b3.disabled = false;
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
    requestBusy = true;
    b1.disabled = true;
    b2.disabled = true;
    b3.disabled = true;
    try {
      appendLog("— POST search по ТН (число), запросов: " + ids.length + ", стенд: " + ADDRESSBOOK_ACTIVE_STAND);
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
        if (i < ids.length - 1) await delay(REQUEST_PAUSE_MS);
      }
      const fname = "addressbook_search_by_tn_" + ADDRESSBOOK_ACTIVE_STAND + "_" + Date.now() + ".json";
      downloadJson(fname, results);
      appendLog("Готово. Файл: " + fname);
    } finally {
      requestBusy = false;
      b1.disabled = false;
      b2.disabled = false;
      b3.disabled = false;
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
    requestBusy = true;
    b1.disabled = true;
    b2.disabled = true;
    b3.disabled = true;
    try {
      appendLog("— POST search по ФИО, строк: " + lines.length + ", стенд: " + ADDRESSBOOK_ACTIVE_STAND);
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
        if (i < lines.length - 1) await delay(REQUEST_PAUSE_MS);
      }
      const fname = "addressbook_search_by_fio_" + ADDRESSBOOK_ACTIVE_STAND + "_" + Date.now() + ".json";
      downloadJson(fname, results);
      appendLog("Готово. Файл: " + fname);
    } finally {
      requestBusy = false;
      b1.disabled = false;
      b2.disabled = false;
      b3.disabled = false;
    }
  });

  btnRowTn.appendChild(b1);
  btnRowTn.appendChild(b2);
  box.appendChild(btnRowTn);
  box.appendChild(secFio);
  box.appendChild(lab2);
  box.appendChild(taFio);
  box.appendChild(b3);

  const logLab = document.createElement("div");
  logLab.style.cssText =
    "font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#64748b;margin:12px 0 6px 0;";
  logLab.textContent = "Лог";
  box.appendChild(logLab);
  box.appendChild(logEl);

  const bClose = document.createElement("button");
  bClose.type = "button";
  bClose.textContent = "Закрыть панель";
  bClose.title = "Снять панель. Повторный запуск — снова вставить скрипт (или обновить страницу при повторном const).";
  bClose.style.cssText =
    "margin-top:12px;width:100%;box-sizing:border-box;padding:9px 12px;font-size:12px;cursor:pointer;" +
    "background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;border-radius:8px;font-weight:500;";
  bClose.addEventListener("click", function () {
    box.remove();
  });
  box.appendChild(bClose);

  document.body.appendChild(box);
}

startAddressBookPanel();
