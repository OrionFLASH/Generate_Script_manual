// =============================================================================
// AddressBook_export.js — выгрузки из адресной книги (DevTools, консоль)
// =============================================================================
// Запросы идут на выбранный стенд: полный URL = ORIGIN + /api/home/...
// credentials: 'include' — куки; при выборе хоста, отличного от вкладки, возможны ограничения CORS.
// =============================================================================

// Базовые хосты (как у gamification); при необходимости поправьте под фактический URL адресной книги.
const ADDRESSBOOK_ORIGINS = {
  ALPHA: "https://efs-our-business-prom.omega.sbrf.ru",
  SIGMA: "https://salesheroes.sberbank.ru"
};

const DEFAULT_ADDRESSBOOK_STAND = "SIGMA";

/** Выбранный на панели стенд (ALPHA | SIGMA). */
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
 * Нормализованный ключ стенда и origin без завершающего слэша.
 * @returns {{ standKey: string, origin: string }}
 */
function getAddressBookStandAndOrigin() {
  var k =
    ADDRESSBOOK_ACTIVE_STAND === "ALPHA" || ADDRESSBOOK_ACTIVE_STAND === "SIGMA"
      ? ADDRESSBOOK_ACTIVE_STAND
      : "SIGMA";
  var origin = ADDRESSBOOK_ORIGINS[k] || ADDRESSBOOK_ORIGINS.SIGMA;
  return { standKey: k, origin: origin.replace(/\/$/, "") };
}

/**
 * GET …/api/home/empInfoFull?empId=
 * @param {string} empId
 */
async function fetchEmpInfoFull(empId) {
  var o = getAddressBookStandAndOrigin();
  const url =
    o.origin +
    ADDRESSBOOK_API_HOME +
    "/empInfoFull?empId=" +
    encodeURIComponent(empId);
  const res = await fetch(url, { method: "GET", credentials: "include" });
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
    headers: { "Content-Type": "application/json", Accept: "application/json" },
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

function startAddressBookPanel() {
  const box = document.createElement("div");
  // На тёмной странице наследуется светлый color — подписи и поля не видны на белом фоне панели.
  box.style.cssText =
    "position:fixed;top:10px;right:10px;width:min(420px,calc(100vw - 20px));max-height:90vh;overflow:auto;z-index:999999;" +
    "background:#ffffff;border:1px solid #94a3b8;padding:12px;box-shadow:0 4px 16px rgba(0,0,0,.15);" +
    "font-family:sans-serif;font-size:12px;color:#111827;color-scheme:light;";

  const t = document.createElement("div");
  t.style.cssText = "font-weight:bold;margin-bottom:8px;color:#0f172a;font-size:14px;";
  t.textContent = "Адресная книга — выгрузки";
  box.appendChild(t);

  const hint = document.createElement("div");
  hint.style.cssText = "font-size:11px;color:#334155;margin-bottom:10px;line-height:1.4;";
  hint.textContent =
    "Хост API задаётся стендом ниже. Удобнее открыть вкладку на том же стенде, что выбран (иначе куки/CORS). Куки не вшиваются в код.";
  box.appendChild(hint);

  const rowStand = document.createElement("div");
  rowStand.style.cssText =
    "display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:11px;flex-wrap:wrap;color:#111827;";
  const labSt = document.createElement("label");
  labSt.textContent = "Стенд:";
  labSt.setAttribute("for", "addrBookStandSel");
  labSt.style.cssText = "font-weight:bold;color:#111827;";
  const selStand = document.createElement("select");
  selStand.id = "addrBookStandSel";
  // Контраст текста на тёмных темах страницы (нативный select наследует color-scheme).
  selStand.style.cssText =
    "padding:4px 8px;font-size:11px;min-width:220px;cursor:pointer;" +
    "color:#111827;background-color:#ffffff;border:1px solid #64748b;border-radius:4px;" +
    "color-scheme:light;";
  ["ALPHA", "SIGMA"].forEach(function (key) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = key + " — " + ADDRESSBOOK_ORIGINS[key];
    opt.style.cssText = "color:#111827;background-color:#ffffff;";
    if (key === ADDRESSBOOK_ACTIVE_STAND) opt.selected = true;
    selStand.appendChild(opt);
  });
  selStand.addEventListener("change", function () {
    ADDRESSBOOK_ACTIVE_STAND = selStand.value;
  });
  rowStand.appendChild(labSt);
  rowStand.appendChild(selStand);
  box.appendChild(rowStand);

  const lab1 = document.createElement("div");
  lab1.textContent = "Список табельных (empInfoFull + поиск по числу), по строке или через пробелы:";
  lab1.style.cssText = "font-weight:bold;margin:8px 0 4px;color:#111827;";
  box.appendChild(lab1);
  const taIds = document.createElement("textarea");
  taIds.rows = 4;
  taIds.style.cssText =
    "width:100%;box-sizing:border-box;font-size:11px;padding:8px;min-height:72px;resize:vertical;" +
    "color:#111827;background-color:#ffffff;border:1px solid #64748b;border-radius:6px;font-family:monospace;" +
    "color-scheme:light;";
  taIds.placeholder = EMP_IDS.join("\n");
  taIds.value = EMP_IDS.join("\n");
  box.appendChild(taIds);

  const row1 = document.createElement("div");
  row1.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin:8px 0;";
  const b1 = document.createElement("button");
  b1.type = "button";
  b1.textContent = "GET empInfoFull (все из поля)";
  b1.style.cssText =
    "padding:8px 12px;cursor:pointer;background:#0369a1;color:#ffffff;border:none;border-radius:6px;font-size:11px;font-weight:bold;";
  b1.addEventListener("click", async function () {
    const ids = parseEmpIdsFromText(taIds.value);
    if (ids.length === 0) {
      console.warn("Нет табельных в поле");
      return;
    }
    const results = [];
    for (let i = 0; i < ids.length; i++) {
      console.log("empInfoFull " + (i + 1) + "/" + ids.length + " " + ids[i]);
      try {
        results.push(await fetchEmpInfoFull(ids[i]));
      } catch (e) {
        results.push({ empId: ids[i], error: String(e) });
      }
      if (i < ids.length - 1) await delay(REQUEST_PAUSE_MS);
    }
    downloadJson(
      "addressbook_empInfoFull_" + ADDRESSBOOK_ACTIVE_STAND + "_" + Date.now() + ".json",
      results
    );
    console.log("Готово empInfoFull, записей: " + results.length);
  });
  row1.appendChild(b1);

  const b2 = document.createElement("button");
  b2.type = "button";
  b2.textContent = "POST search по ТН (число)";
  b2.style.cssText =
    "padding:8px 12px;cursor:pointer;background:#0d9488;color:#ffffff;border:none;border-radius:6px;font-size:11px;font-weight:bold;";
  b2.addEventListener("click", async function () {
    const ids = parseEmpIdsFromText(taIds.value);
    if (ids.length === 0) {
      console.warn("Нет табельных");
      return;
    }
    const results = [];
    for (let i = 0; i < ids.length; i++) {
      const num = Number(ids[i].replace(/^0+/, "") || "0");
      console.log("search ТН " + (i + 1) + "/" + ids.length + " " + num);
      try {
        results.push(await fetchEmployeesSearch(num, true));
      } catch (e) {
        results.push({ searchText: num, error: String(e) });
      }
      if (i < ids.length - 1) await delay(REQUEST_PAUSE_MS);
    }
    downloadJson(
      "addressbook_search_by_tn_" + ADDRESSBOOK_ACTIVE_STAND + "_" + Date.now() + ".json",
      results
    );
    console.log("Готово search ТН");
  });
  row1.appendChild(b2);
  box.appendChild(row1);

  const lab2 = document.createElement("div");
  lab2.textContent = "Поиск POST по ФИО (каждая строка — отдельный запрос):";
  lab2.style.cssText = "font-weight:bold;margin:12px 0 4px;color:#111827;";
  box.appendChild(lab2);
  const taFio = document.createElement("textarea");
  taFio.rows = 3;
  taFio.style.cssText =
    "width:100%;box-sizing:border-box;font-size:11px;padding:8px;min-height:56px;resize:vertical;" +
    "color:#111827;background-color:#ffffff;border:1px solid #64748b;border-radius:6px;" +
    "color-scheme:light;";
  taFio.placeholder = 'Например: Иванов Иван Иванович';
  box.appendChild(taFio);

  const b3 = document.createElement("button");
  b3.type = "button";
  b3.textContent = "POST search по ФИО (строки)";
  b3.style.cssText =
    "margin-top:6px;padding:10px 12px;cursor:pointer;width:100%;box-sizing:border-box;" +
    "background:#7c3aed;color:#ffffff;border:none;border-radius:6px;font-size:12px;font-weight:bold;";
  b3.addEventListener("click", async function () {
    const lines = taFio.value
      .split(/\r?\n/)
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
    if (lines.length === 0) {
      console.warn("Нет строк ФИО");
      return;
    }
    const results = [];
    for (let i = 0; i < lines.length; i++) {
      console.log("search ФИО " + (i + 1) + "/" + lines.length);
      try {
        results.push(await fetchEmployeesSearch(lines[i], false));
      } catch (e) {
        results.push({ searchText: lines[i], error: String(e) });
      }
      if (i < lines.length - 1) await delay(REQUEST_PAUSE_MS);
    }
    downloadJson(
      "addressbook_search_by_fio_" + ADDRESSBOOK_ACTIVE_STAND + "_" + Date.now() + ".json",
      results
    );
    console.log("Готово search ФИО");
  });
  box.appendChild(b3);

  const bClose = document.createElement("button");
  bClose.type = "button";
  bClose.textContent = "Закрыть";
  bClose.style.cssText =
    "margin-top:10px;padding:8px;width:100%;box-sizing:border-box;cursor:pointer;" +
    "background:#f1f5f9;color:#0f172a;border:1px solid #94a3b8;border-radius:6px;font-size:12px;";
  bClose.addEventListener("click", function () {
    box.remove();
  });
  box.appendChild(bClose);

  document.body.appendChild(box);
}

startAddressBookPanel();
