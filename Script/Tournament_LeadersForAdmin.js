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
 * Коды из CSV по именам колонок (как в первой строке файла, с учётом trim).
 * @param {string} csvText
 * @param {Record<string, boolean>} allowedStatus — какие значения статуса включены
 * @param {string} codeColumnName — заголовок колонки с кодом турнира
 * @param {string} statusColumnName — заголовок колонки со статусом (фильтр чекбоксов)
 * @returns {string[]}
 */
function codesFromCsvByColumns(csvText, allowedStatus, codeColumnName, statusColumnName) {
  const { headers, rows } = parseCsv(csvText);
  const ch = (codeColumnName || "").trim();
  const sh = (statusColumnName || "").trim();
  if (!ch || !sh) {
    console.warn("CSV: не заданы имена колонок (код и/или статус).");
    return [];
  }
  const ic = indexOfHeader(headers, ch);
  const is = indexOfHeader(headers, sh);
  if (ic < 0 || is < 0) {
    console.warn(
      "CSV: колонки не найдены. Ожидались «" + ch + "» и «" + sh + "». Заголовки в файле:",
      headers
    );
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
    "position:fixed;left:10px;top:10px;width:min(920px,calc(100vw - 16px));max-height:92vh;overflow:auto;z-index:999999;" +
    "background:#ffffff;border:1px solid #cbd5e1;padding:14px 16px;box-shadow:0 12px 40px rgba(15,23,42,.12);border-radius:12px;" +
    "font-family:system-ui,-apple-system,sans-serif;font-size:12px;color:#111827;color-scheme:light;box-sizing:border-box;";

  const title = document.createElement("div");
  title.style.cssText =
    "font-weight:700;font-size:16px;margin-bottom:2px;color:#0f172a;letter-spacing:-0.02em;";
  title.textContent = "Турниры — leadersForAdmin";
  root.appendChild(title);
  const titleSub = document.createElement("div");
  titleSub.style.cssText = "font-size:11px;color:#64748b;margin-bottom:10px;line-height:1.4;";
  titleSub.textContent =
    "Каждая кнопка сразу запускает выгрузку. Для .txt и CSV сначала откроется выбор файла. Стенд и «Удалять photoData» задайте до нажатия.";
  root.appendChild(titleSub);

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

  const logEl = document.createElement("div");
  logEl.style.cssText =
    "margin-top:10px;font-size:11px;color:rgb(15,23,42);background:#f8fafc;max-height:140px;overflow:auto;border:1px solid #cbd5e1;border-radius:8px;padding:8px;";
  logEl.textContent = "Лог: —";

  function log(msg) {
    logEl.textContent = msg;
    console.log(msg);
  }

  const labTa = document.createElement("div");
  labTa.style.cssText = "font-weight:600;font-size:11px;color:#475569;margin:10px 0 4px;";
  labTa.textContent = "Общее поле — простые коды (кнопка «По тексту» или вставка после выбора .txt)";
  root.appendChild(labTa);

  const ta = document.createElement("textarea");
  ta.rows = 4;
  ta.style.cssText =
    "width:100%;box-sizing:border-box;font-size:11px;padding:10px;" +
    "color:#111827;background-color:#ffffff;border:1px solid #94a3b8;border-radius:8px;resize:vertical;color-scheme:light;";
  ta.placeholder = TOURNAMENT_IDS_IN_SCRIPT.join("\n");
  ta.value = TOURNAMENT_IDS_IN_SCRIPT.join("\n");
  root.appendChild(ta);

  /** Защита от повторного запуска, пока идёт цикл fetch. */
  var exportBusy = false;

  /**
   * Общий цикл выгрузки по уже собранному списку кодов турнира.
   * @param {string[]} ids
   * @param {string} sourceTag — подпись для лога (источник кодов)
   */
  async function runExport(ids, sourceTag) {
    if (exportBusy) {
      log("Выгрузка уже выполняется, дождитесь окончания.");
      return;
    }
    if (!ids || ids.length === 0) {
      log("Нет кодов турнира (" + (sourceTag || "") + ").");
      return;
    }
    exportBusy = true;
    try {
      var standKey =
        TOURNAMENT_UI_STAND === "ALPHA" || TOURNAMENT_UI_STAND === "SIGMA"
          ? TOURNAMENT_UI_STAND
          : "ALPHA";
      const baseUrl = TOURNAMENT_BASE[standKey] || TOURNAMENT_BASE.ALPHA;

      log("Источник: " + (sourceTag || "") + " | кодов: " + ids.length + " | стенд: " + standKey);
      const results = {};
      let processed = 0;
      let skipped = 0;
      let errors = 0;
      /** Турниры с ответом OK, но 0 лидеров — в JSON не попадают; полный список в консоли. */
      const skippedZeroLeaders = [];

      for (let i = 0; i < ids.length; i++) {
        const tid = ids[i];
        log("[" + (i + 1) + "/" + ids.length + "] " + tid);
        try {
          const fr = await fetchLeadersForAdmin(baseUrl, tid);
          if (!fr.ok) {
            console.warn("[ошибка HTTP " + fr.status + "] турнир:", tid);
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
            skippedZeroLeaders.push(tid);
            console.log("[пропуск: 0 лидеров в ответе] турнир:", tid);
            continue;
          }
          results[tid] = [fr.data];
          processed++;
        } catch (e) {
          console.error("[исключение] турнир:", tid, e);
          errors++;
        }
        if (i < ids.length - 1) await delay(REQUEST_GAP_MS);
      }

      if (skippedZeroLeaders.length > 0) {
        console.log(
          "Итого пропущено (0 лидеров), штук: " +
            skippedZeroLeaders.length +
            ". Коды турниров:",
          skippedZeroLeaders
        );
      }

      if (cbPhoto.checked) {
        log("Удаление photoData…");
        removePhotoData(results);
      }

      const fname = LEADERS_SERVICE + "_" + standKey + "_" + getTimestamp() + ".json";
      downloadJson(fname, results);
      log(
        "Готово (" +
          (sourceTag || "") +
          "). Успех: " +
          processed +
          ", пропуск (0 лидеров): " +
          skipped +
          ", ошибок: " +
          errors +
          ". Файл: " +
          fname +
          (skipped > 0 ? " — список пропущенных кодов см. console.log выше." : "")
      );
    } finally {
      exportBusy = false;
    }
  }

  const labActions = document.createElement("div");
  labActions.style.cssText = "font-weight:700;margin:12px 0 8px;color:#0f172a;font-size:12px;";
  labActions.textContent = "Запуск: одна кнопка — сразу выгрузка (для .txt и CSV сначала откроется выбор файла)";
  root.appendChild(labActions);

  const actionGrid = document.createElement("div");
  actionGrid.style.cssText =
    "display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:10px;";
  if (typeof window.matchMedia === "function" && window.matchMedia("(max-width:560px)").matches) {
    actionGrid.style.gridTemplateColumns = "1fr";
  }

  const btnBase =
    "padding:10px 12px;font-size:11px;cursor:pointer;border:none;border-radius:8px;font-weight:600;" +
    "color:#fff;text-align:center;line-height:1.35;box-sizing:border-box;width:100%;";

  function addGridButton(label, bg, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.cssText = btnBase + "background:" + bg + ";";
    b.addEventListener("click", onClick);
    actionGrid.appendChild(b);
    return b;
  }

  // Скрытый input: выбор .txt → чтение → разбор кодов → runExport
  const fileInputTxtRun = document.createElement("input");
  fileInputTxtRun.type = "file";
  fileInputTxtRun.accept = ".txt,.csv,text/plain,text/csv";
  fileInputTxtRun.setAttribute("aria-label", "Файл со списком кодов турнира");
  fileInputTxtRun.style.cssText =
    "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;";
  root.appendChild(fileInputTxtRun);
  fileInputTxtRun.addEventListener("change", function () {
    const f = fileInputTxtRun.files && fileInputTxtRun.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = function () {
      const text = String(reader.result || "");
      try {
        fileInputTxtRun.value = "";
      } catch (eClr) {}
      const ids = parseTournamentCodesFromText(text);
      if (ids.length === 0) {
        log("В файле не найдено кодов турнира (ожидаются латиница, цифры, _ и -).");
        return;
      }
      void runExport(ids, "файл .txt");
    };
    reader.readAsText(f, "UTF-8");
  });

  addGridButton("По массиву в скрипте", "#059669", function () {
    void runExport(TOURNAMENT_IDS_IN_SCRIPT.slice(), "массив TOURNAMENT_IDS_IN_SCRIPT");
  });
  addGridButton("По тексту в поле выше", "#7c3aed", function () {
    const ids = parseTournamentCodesFromText(ta.value);
    if (ids.length === 0) {
      log("В общем поле нет кодов турнира.");
      return;
    }
    void runExport(ids, "текст в поле");
  });

  const btnTxtFile = document.createElement("button");
  btnTxtFile.type = "button";
  btnTxtFile.textContent = "Файл .txt — выбрать и сразу выгрузить";
  btnTxtFile.style.cssText = btnBase + "background:#2563eb;";
  btnTxtFile.style.gridColumn = "1 / -1";
  btnTxtFile.addEventListener("click", function () {
    fileInputTxtRun.click();
  });
  actionGrid.appendChild(btnTxtFile);

  root.appendChild(actionGrid);

  function makeStatusChecks(labels, container) {
    const map = {};
    labels.forEach(function (lbl) {
      const row = document.createElement("div");
      row.style.cssText = "margin:2px 0;color:#111827;line-height:1.35;display:flex;align-items:center;gap:6px;";
      const c = document.createElement("input");
      c.type = "checkbox";
      c.checked = true;
      map[lbl] = c;
      row.appendChild(c);
      const sp = document.createElement("span");
      sp.style.cssText = "color:#334155;font-size:11px;";
      sp.textContent = lbl;
      row.appendChild(sp);
      container.appendChild(row);
    });
    return map;
  }

  /**
   * Подпись + поле ввода (имена колонок CSV).
   * @param {HTMLElement} container
   * @param {string} labelText
   * @param {string} defaultValue
   * @param {string} [placeholder]
   * @returns {HTMLInputElement}
   */
  function addLabeledTextInput(container, labelText, defaultValue, placeholder) {
    const lab = document.createElement("label");
    lab.style.cssText =
      "display:flex;flex-direction:column;gap:4px;font-size:10px;color:#334155;font-weight:600;margin:0;";
    const span = document.createElement("span");
    span.textContent = labelText;
    const inp = document.createElement("input");
    inp.type = "text";
    inp.value = defaultValue || "";
    if (placeholder) inp.placeholder = placeholder;
    inp.style.cssText =
      "padding:6px 8px;font-size:11px;border:1px solid #94a3b8;border-radius:6px;color:#111827;" +
      "background:#fff;box-sizing:border-box;width:100%;color-scheme:light;";
    lab.appendChild(span);
    lab.appendChild(inp);
    container.appendChild(lab);
    return inp;
  }

  /**
   * Колонка CSV: имена колонок (код / статус), фильтр чекбоксами, только выгрузка через выбор файла.
   * @param {{ title: string, subtitle: string, border: string, bg: string, labels: string[], fileAria: string, defaultCodeColumn: string, defaultStatusColumn: string, runTag: string }} cfg
   * @param {function(string[], string): void} runExportFn
   */
  function createCsvColumn(cfg, runExportFn) {
    const col = document.createElement("div");
    col.style.cssText =
      "min-width:0;padding:12px;border-radius:10px;border:1px solid " +
      cfg.border +
      ";background:" +
      cfg.bg +
      ";box-sizing:border-box;display:flex;flex-direction:column;gap:8px;";

    const h = document.createElement("div");
    h.style.cssText = "font-weight:700;font-size:13px;color:#0f172a;";
    h.textContent = cfg.title;
    col.appendChild(h);

    const sub = document.createElement("div");
    sub.style.cssText = "font-size:10px;color:#64748b;line-height:1.35;margin-top:-4px;";
    sub.textContent = cfg.subtitle;
    col.appendChild(sub);

    const inpCodeCol = addLabeledTextInput(
      col,
      "Колонка с кодом турнира (точно как заголовок в 1-й строке CSV)",
      cfg.defaultCodeColumn,
      cfg.defaultCodeColumn
    );
    const inpStatusCol = addLabeledTextInput(
      col,
      "Колонка со статусом для фильтра (значения — в чекбоксах ниже)",
      cfg.defaultStatusColumn,
      cfg.defaultStatusColumn
    );

    const fileInLocal = document.createElement("input");
    fileInLocal.type = "file";
    fileInLocal.accept = ".txt,.csv,text/plain,text/csv";
    fileInLocal.setAttribute("aria-label", cfg.fileAria);
    fileInLocal.style.cssText =
      "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;";

    const fileStat = document.createElement("div");
    fileStat.style.cssText = "font-size:10px;color:#64748b;line-height:1.35;word-break:break-all;";
    fileStat.textContent = "Последний CSV-файл: не выбирали.";

    let lastCsv = "";
    let lastCsvName = "";

    const filtWrap = document.createElement("div");
    filtWrap.style.cssText = "margin-top:4px;padding-top:10px;border-top:1px solid rgba(15,23,42,.08);";
    const filtLab = document.createElement("div");
    filtLab.style.cssText = "font-weight:600;font-size:11px;color:#334155;margin-bottom:6px;";
    filtLab.textContent = "Фильтр статусов (учитывается при выгрузке)";
    filtWrap.appendChild(filtLab);
    const checks = makeStatusChecks(cfg.labels, filtWrap);

    function buildAllowMap() {
      const allow = {};
      Object.keys(checks).forEach(function (k) {
        allow[k] = checks[k].checked;
      });
      return allow;
    }

    function codesFromCsvText(csvText) {
      const allow = buildAllowMap();
      const codeH = (inpCodeCol.value || "").trim() || cfg.defaultCodeColumn;
      const statH = (inpStatusCol.value || "").trim() || cfg.defaultStatusColumn;
      return codesFromCsvByColumns(csvText, allow, codeH, statH);
    }

    fileInLocal.addEventListener("change", function () {
      const f = fileInLocal.files && fileInLocal.files[0];
      if (!f) return;
      lastCsvName = f.name || "";
      const reader = new FileReader();
      reader.onload = function () {
        lastCsv = String(reader.result || "");
        fileStat.textContent = "Последний файл: " + lastCsvName + " (" + lastCsv.length + " симв.)";
        console.log("CSV «" + cfg.title + "»: " + lastCsvName + ", символов: " + lastCsv.length);
        try {
          fileInLocal.value = "";
        } catch (eClr) {}
        const ids = codesFromCsvText(lastCsv);
        if (ids.length === 0) {
          log("Нет кодов (" + cfg.runTag + " файл). Проверьте колонки CSV и фильтр статусов.");
          return;
        }
        void runExportFn(ids, cfg.runTag + " файл");
      };
      reader.readAsText(f, "UTF-8");
    });

    const btnCsvFile = document.createElement("button");
    btnCsvFile.type = "button";
    btnCsvFile.textContent = "CSV: выбрать файл и сразу выгрузить";
    btnCsvFile.style.cssText =
      "padding:8px 10px;font-size:11px;cursor:pointer;background:#0f172a;color:#fff;border:none;border-radius:8px;font-weight:600;width:100%;box-sizing:border-box;";
    btnCsvFile.addEventListener("click", function () {
      fileInLocal.click();
    });

    col.appendChild(fileInLocal);
    col.appendChild(filtWrap);
    col.appendChild(btnCsvFile);
    col.appendChild(fileStat);

    return { col: col };
  }

  const csvColSectionLabel = document.createElement("div");
  csvColSectionLabel.style.cssText =
    "font-weight:700;margin:14px 0 8px;color:#0f172a;font-size:12px;padding-top:10px;border-top:1px solid #e2e8f0;";
  csvColSectionLabel.textContent =
    "Два блока CSV — имена колонок, фильтр статусов, выгрузка только через выбор файла";
  root.appendChild(csvColSectionLabel);

  const twoCol = document.createElement("div");
  twoCol.style.cssText =
    "display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:stretch;";
  if (typeof window.matchMedia === "function" && window.matchMedia("(max-width:700px)").matches) {
    twoCol.style.gridTemplateColumns = "1fr";
  }

  twoCol.appendChild(
    createCsvColumn(
      {
        title: "Колонка CSV A (слева)",
        subtitle:
          "По умолчанию колонки TOURNAMENT_CODE и TOURNAMENT_STATUS — можно заменить на свои заголовки из файла.",
        border: "#cbd5e1",
        bg: "linear-gradient(180deg,#f8fafc 0%,#f1f5f9 100%)",
        labels: CSV1_STATUS_LABELS,
        fileAria: "CSV файл колонки A",
        defaultCodeColumn: "TOURNAMENT_CODE",
        defaultStatusColumn: "TOURNAMENT_STATUS",
        runTag: "CSV-A"
      },
      runExport
    ).col
  );
  twoCol.appendChild(
    createCsvColumn(
      {
        title: "Колонка CSV B (справа)",
        subtitle:
          "По умолчанию «Код турнира» и «Бизнес-статус турнира» — задайте другие имена, если в выгрузке другие заголовки.",
        border: "#93c5fd",
        bg: "linear-gradient(180deg,#eff6ff 0%,#dbeafe 100%)",
        labels: CSV2_STATUS_LABELS,
        fileAria: "CSV файл колонки B",
        defaultCodeColumn: "Код турнира",
        defaultStatusColumn: "Бизнес-статус турнира",
        runTag: "CSV-B"
      },
      runExport
    ).col
  );
  root.appendChild(twoCol);

  root.appendChild(logEl);

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
