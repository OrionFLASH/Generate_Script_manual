// =============================================================================
// Tournament_LeadersForAdmin.js — выгрузка leadersForAdmin по кодам турниров
// =============================================================================
// DevTools на странице стенда (ALPHA omega / SIGMA salesheroes). GET JSON.
// Источники кодов: массив в скрипте, текстовое поле, файл .txt, CSV (два варианта колонок).
// =============================================================================
// Повторная вставка в консоль: весь код в IIFE — иначе глобальные const (TOURNAMENT_BASE и др.) дают SyntaxError.
(function () {
  "use strict";

  const DEFAULT_TOURNAMENT_STAND = "ALPHA";

  /** Стенд для GET leadersForAdmin; обновляется списком на панели. */
  let TOURNAMENT_UI_STAND = DEFAULT_TOURNAMENT_STAND;

const TOURNAMENT_BASE = {
  ALPHA: "https://efs-our-business-prom.omega.sbrf.ru/bo/rmkib.gamification/api/v1/tournaments/",
  SIGMA: "https://salesheroes.sberbank.ru/bo/rmkib.gamification/api/v1/tournaments/"
};

// Коды по умолчанию (если не заданы в поле / файле).
const TOURNAMENT_IDS_IN_SCRIPT = [
  "t_01_2026-1_05-1_1_3031",
  "TOURNAMENT_05_02"
];

const LEADERS_SERVICE = "leadersForAdmin";
const REQUEST_GAP_MS = 5;
const STRIP_PHOTO_DATA_DEFAULT = true;

/** Статусы CSV вариант 1 (колонка TOURNAMENT_STATUS). */
const CSV1_STATUS_LABELS = [
  "АКТИВНЫЙ",
  "ЗАВЕРШЕН",
  "ОТМЕНЕН",
  "ПОДВЕДЕНИЕ ИТОГОВ",
  "УДАЛЕН"
];

/** Статусы CSV вариант 2 (колонка «Бизнес-статус турнира»). */
const CSV2_STATUS_LABELS = [
  "Активный",
  "Завершен",
  "Запланирован",
  "Отменен",
  "Подведение итогов",
  "Удален"
];

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

/**
 * Извлекает коды турнира из текста: токены из букв, цифр, _, -
 * @param {string} text
 * @returns {string[]}
 */
function parseTournamentCodesFromText(text) {
  if (!text || typeof text !== "string") return [];
  const re = /[A-Za-z0-9_-]+/g;
  const m = text.match(re) || [];
  const seen = {};
  const out = [];
  for (let i = 0; i < m.length; i++) {
    const c = m[i];
    if (!seen[c]) {
      seen[c] = true;
      out.push(c);
    }
  }
  return out;
}

/**
 * Простой разбор CSV с кавычками и разделителем , или ;
 * @param {string} text
 * @returns {{ headers: string[], rows: string[][] }}
 */
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(function (l) {
    return l.trim().length > 0;
  });
  if (lines.length === 0) return { headers: [], rows: [] };
  const first = lines[0];
  const sep =
    first.split(";").length > first.split(",").length ? ";" : ",";
  function parseLine(line) {
    const cells = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQ = !inQ;
        continue;
      }
      if (!inQ && ch === sep) {
        cells.push(cur.trim());
        cur = "";
        continue;
      }
      cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  }
  const headers = parseLine(lines[0]);
  const rows = [];
  for (let r = 1; r < lines.length; r++) {
    rows.push(parseLine(lines[r]));
  }
  return { headers: headers, rows: rows };
}

function indexOfHeader(headers, name) {
  for (let i = 0; i < headers.length; i++) {
    if (headers[i].trim() === name) return i;
  }
  return -1;
}

/**
 * Коды из CSV вариант 1: TOURNAMENT_CODE + фильтр TOURNAMENT_STATUS.
 * @param {string} csvText
 * @param {Record<string, boolean>} allowedStatus — какие статусы включены
 */
function codesFromCsvVariant1(csvText, allowedStatus) {
  const { headers, rows } = parseCsv(csvText);
  const ic = indexOfHeader(headers, "TOURNAMENT_CODE");
  const is = indexOfHeader(headers, "TOURNAMENT_STATUS");
  if (ic < 0 || is < 0) {
    console.warn("CSV1: нет колонок TOURNAMENT_CODE или TOURNAMENT_STATUS");
    return [];
  }
  const out = [];
  const seen = {};
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const st = (row[is] || "").trim();
    if (!allowedStatus[st]) continue;
    const code = (row[ic] || "").trim();
    if (code && !seen[code]) {
      seen[code] = true;
      out.push(code);
    }
  }
  return out;
}

/**
 * Коды из CSV вариант 2: «Код турнира» + «Бизнес-статус турнира».
 */
function codesFromCsvVariant2(csvText, allowedStatus) {
  const { headers, rows } = parseCsv(csvText);
  const ic = indexOfHeader(headers, "Код турнира");
  const is = indexOfHeader(headers, "Бизнес-статус турнира");
  if (ic < 0 || is < 0) {
    console.warn("CSV2: нет колонок «Код турнира» или «Бизнес-статус турнира»");
    return [];
  }
  const out = [];
  const seen = {};
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const st = (row[is] || "").trim();
    if (!allowedStatus[st]) continue;
    const code = (row[ic] || "").trim();
    if (code && !seen[code]) {
      seen[code] = true;
      out.push(code);
    }
  }
  return out;
}

function removePhotoData(obj) {
  if (Array.isArray(obj)) {
    obj.forEach(removePhotoData);
  } else if (obj && typeof obj === "object") {
    Object.keys(obj).forEach(function (key) {
      if (key === "photoData") delete obj[key];
      else removePhotoData(obj[key]);
    });
  }
}

async function fetchLeadersForAdmin(baseUrl, tournamentId) {
  const url =
    baseUrl +
    encodeURIComponent(tournamentId) +
    "/" +
    LEADERS_SERVICE +
    "?pageNum=1";
  const res = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" }
  });
  const data = await res.json().catch(function () {
    return null;
  });
  return { ok: res.ok, status: res.status, tournamentId: tournamentId, data: data };
}

function downloadJson(name, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], {
    type: "application/json"
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () {
    URL.revokeObjectURL(a.href);
  }, 0);
}

function startTournamentPanel() {
  var prevRoot = document.getElementById("tournamentLeadersForAdminRoot");
  if (prevRoot) prevRoot.remove();

  const root = document.createElement("div");
  root.id = "tournamentLeadersForAdminRoot";
  // color + color-scheme: на тёмной странице иначе наследуется светлый текст — нечитаемо на белом фоне панели.
  root.style.cssText =
    "position:fixed;left:10px;top:10px;width:min(480px,calc(100vw - 20px));max-height:92vh;overflow:auto;z-index:999999;" +
    "background:#ffffff;border:1px solid #888;padding:12px;box-shadow:0 4px 20px rgba(0,0,0,.2);" +
    "font-family:sans-serif;font-size:12px;color:#111827;color-scheme:light;";

  const title = document.createElement("div");
  title.style.cssText = "font-weight:bold;font-size:14px;margin-bottom:6px;color:#111827;";
  title.textContent = "Турниры — leadersForAdmin";
  root.appendChild(title);

  const stRow = document.createElement("div");
  stRow.style.cssText =
    "display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;font-size:12px;color:#111827;";
  const labSt = document.createElement("label");
  labSt.textContent = "Стенд:";
  labSt.setAttribute("for", "tournamentStandSel");
  labSt.style.cssText = "font-weight:bold;color:#111827;";
  const selStand = document.createElement("select");
  selStand.id = "tournamentStandSel";
  selStand.style.cssText =
    "padding:4px 8px;font-size:12px;min-width:200px;cursor:pointer;" +
    "color:#111827;background-color:#ffffff;border:1px solid #64748b;border-radius:4px;" +
    "color-scheme:light;";
  ["ALPHA", "SIGMA"].forEach(function (key) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = key + " — API турниров";
    opt.style.cssText = "color:#111827;background-color:#ffffff;";
    if (key === TOURNAMENT_UI_STAND) opt.selected = true;
    selStand.appendChild(opt);
  });
  selStand.addEventListener("change", function () {
    TOURNAMENT_UI_STAND = selStand.value;
  });
  stRow.appendChild(labSt);
  stRow.appendChild(selStand);
  root.appendChild(stRow);

  const cbPhoto = document.createElement("input");
  cbPhoto.type = "checkbox";
  cbPhoto.checked = STRIP_PHOTO_DATA_DEFAULT;
  const lbPhoto = document.createElement("label");
  lbPhoto.style.cssText = "margin-left:6px;color:#111827;cursor:pointer;";
  lbPhoto.appendChild(cbPhoto);
  lbPhoto.appendChild(document.createTextNode(" Удалять photoData из JSON"));
  root.appendChild(lbPhoto);
  root.appendChild(document.createElement("br"));

  const labMode = document.createElement("div");
  labMode.style.cssText = "font-weight:bold;margin:10px 0 4px;color:#111827;";
  labMode.textContent = "Источник кодов турнира";
  root.appendChild(labMode);

  const modes = [
    { id: "m_script", label: "Массив TOURNAMENT_IDS_IN_SCRIPT в файле" },
    { id: "m_ta", label: "Текст ниже (коды через пробелы, запятые, строки)" },
    { id: "m_txt", label: "Файл .txt" },
    { id: "m_csv1", label: "CSV: TOURNAMENT_CODE + TOURNAMENT_STATUS" },
    { id: "m_csv2", label: "CSV: «Код турнира» + «Бизнес-статус турнира»" }
  ];
  const radios = {};
  modes.forEach(function (m, idx) {
    const row = document.createElement("div");
    row.style.cssText = "margin:4px 0;color:#111827;line-height:1.4;";
    const r = document.createElement("input");
    r.type = "radio";
    r.name = "tournSrc";
    r.value = m.id;
    r.checked = idx === 0;
    radios[m.id] = r;
    row.appendChild(r);
    const spanLab = document.createElement("span");
    spanLab.style.cssText = "color:#111827;";
    spanLab.textContent = " " + m.label;
    row.appendChild(spanLab);
    root.appendChild(row);
  });

  const ta = document.createElement("textarea");
  ta.rows = 5;
  ta.style.cssText =
    "width:100%;box-sizing:border-box;margin-top:8px;font-size:11px;padding:6px;" +
    "color:#111827;background-color:#ffffff;border:1px solid #64748b;border-radius:4px;resize:vertical;color-scheme:light;";
  ta.placeholder = TOURNAMENT_IDS_IN_SCRIPT.join("\n");
  ta.value = TOURNAMENT_IDS_IN_SCRIPT.join("\n");
  root.appendChild(ta);

  const fileIn = document.createElement("input");
  fileIn.type = "file";
  fileIn.accept = ".txt,.csv,text/plain,text/csv";
  fileIn.style.cssText = "margin-top:8px;width:100%;";
  root.appendChild(fileIn);

  let lastFileText = "";

  fileIn.addEventListener("change", function () {
    const f = fileIn.files && fileIn.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = function () {
      lastFileText = String(reader.result || "");
      console.log("Файл прочитан, символов: " + lastFileText.length);
    };
    reader.readAsText(f, "UTF-8");
  });

  function makeStatusChecks(labels, container) {
    const map = {};
    labels.forEach(function (lbl) {
      const row = document.createElement("div");
      row.style.cssText = "margin:3px 0;color:#111827;line-height:1.35;";
      const c = document.createElement("input");
      c.type = "checkbox";
      c.checked = true;
      map[lbl] = c;
      row.appendChild(c);
      const sp = document.createElement("span");
      sp.style.cssText = "color:#111827;";
      sp.textContent = " " + lbl;
      row.appendChild(sp);
      container.appendChild(row);
    });
    return map;
  }

  const csv1box = document.createElement("div");
  csv1box.style.cssText =
    "margin-top:8px;padding:10px;background:#eef1f5;border:1px solid #cbd5e1;border-radius:6px;color:#111827;";
  const csv1head = document.createElement("div");
  csv1head.style.cssText = "font-weight:bold;margin-bottom:8px;color:rgb(15,23,42);";
  csv1head.textContent = "Фильтр статусов (CSV1):";
  csv1box.appendChild(csv1head);
  const checks1 = makeStatusChecks(CSV1_STATUS_LABELS, csv1box);
  root.appendChild(csv1box);

  const csv2box = document.createElement("div");
  csv2box.style.cssText =
    "margin-top:8px;padding:10px;background:#e8f2fc;border:1px solid #93c5fd;border-radius:6px;color:#111827;";
  const csv2head = document.createElement("div");
  csv2head.style.cssText = "font-weight:bold;margin-bottom:8px;color:rgb(15,23,42);";
  csv2head.textContent = "Фильтр статусов (CSV2):";
  csv2box.appendChild(csv2head);
  const checks2 = makeStatusChecks(CSV2_STATUS_LABELS, csv2box);
  root.appendChild(csv2box);

  const logEl = document.createElement("div");
  logEl.style.cssText =
    "margin-top:8px;font-size:11px;color:rgb(15,23,42);background:#f8fafc;max-height:120px;overflow:auto;border:1px solid #cbd5e1;border-radius:4px;padding:6px;";
  logEl.textContent = "Лог: —";
  root.appendChild(logEl);

  function log(msg) {
    logEl.textContent = msg;
    console.log(msg);
  }

  const btnRun = document.createElement("button");
  btnRun.type = "button";
  btnRun.textContent = "Запустить выгрузку";
  btnRun.style.cssText =
    "margin-top:10px;padding:10px;width:100%;cursor:pointer;background:#0a0;color:#fff;border:none;border-radius:6px;font-weight:bold;";
  btnRun.addEventListener("click", async function () {
    let ids = [];
    const picked =
      modes.find(function (m) {
        return radios[m.id].checked;
      }) || modes[0];

    if (picked.id === "m_script") {
      ids = TOURNAMENT_IDS_IN_SCRIPT.slice();
    } else if (picked.id === "m_ta") {
      ids = parseTournamentCodesFromText(ta.value);
    } else if (picked.id === "m_txt") {
      ids = parseTournamentCodesFromText(lastFileText);
    } else if (picked.id === "m_csv1") {
      const allow = {};
      Object.keys(checks1).forEach(function (k) {
        allow[k] = checks1[k].checked;
      });
      ids = codesFromCsvVariant1(lastFileText, allow);
    } else if (picked.id === "m_csv2") {
      const allow = {};
      Object.keys(checks2).forEach(function (k) {
        allow[k] = checks2[k].checked;
      });
      ids = codesFromCsvVariant2(lastFileText, allow);
    }

    if (ids.length === 0) {
      log("Нет кодов турнира. Проверьте источник и файл.");
      return;
    }

    var standKey =
      TOURNAMENT_UI_STAND === "ALPHA" || TOURNAMENT_UI_STAND === "SIGMA"
        ? TOURNAMENT_UI_STAND
        : "ALPHA";
    const baseUrl = TOURNAMENT_BASE[standKey] || TOURNAMENT_BASE.ALPHA;

    log("Кодов к запросу: " + ids.length + " | стенд: " + standKey);
    const results = {};
    let processed = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < ids.length; i++) {
      const tid = ids[i];
      log("[" + (i + 1) + "/" + ids.length + "] " + tid);
      try {
        const fr = await fetchLeadersForAdmin(baseUrl, tid);
        if (!fr.ok) {
          console.warn("HTTP " + fr.status + " " + tid);
          errors++;
          continue;
        }
        const leadersArr =
          (fr.data &&
            fr.data.body &&
            fr.data.body.tournament &&
            fr.data.body.tournament.leaders) ||
          (fr.data && fr.data.body && fr.data.body.badge && fr.data.body.badge.leaders);
        const cnt = Array.isArray(leadersArr) ? leadersArr.length : 0;
        if (cnt === 0) {
          skipped++;
          continue;
        }
        results[tid] = [fr.data];
        processed++;
      } catch (e) {
        console.error(tid, e);
        errors++;
      }
      if (i < ids.length - 1) await delay(REQUEST_GAP_MS);
    }

    if (cbPhoto.checked) {
      log("Удаление photoData…");
      removePhotoData(results);
    }

    const fname = LEADERS_SERVICE + "_" + standKey + "_" + getTimestamp() + ".json";
    downloadJson(fname, results);
    log(
      "Готово. Успех: " +
        processed +
        ", пропуск (0 лидеров): " +
        skipped +
        ", ошибок: " +
        errors +
        ". Файл: " +
        fname
    );
  });
  root.appendChild(btnRun);

  const btnClose = document.createElement("button");
  btnClose.type = "button";
  btnClose.textContent = "Закрыть панель";
  // rgb() вместо #hex: при копировании в некоторых средах «#» мог пропасть и ломал color.
  btnClose.style.cssText =
    "margin-top:6px;width:100%;padding:8px;cursor:pointer;background:#f1f5f9;color:rgb(15,23,42);border:1px solid #94a3b8;border-radius:4px;font-size:12px;";
  btnClose.addEventListener("click", function () {
    root.remove();
  });
  root.appendChild(btnClose);

  document.body.appendChild(root);
}

startTournamentPanel();
})();
