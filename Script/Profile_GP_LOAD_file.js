// =============================================================================
// СКРИПТ ЗАГРУЗКИ ПРОФИЛЕЙ ГЕРОЕВ — ВАРИАНТ С ЗАГРУЗКОЙ ТН ИЗ ФАЙЛА
// =============================================================================
// Табельные можно загрузить из файла или взять из массива TAB_NUMS в коде.
// При запуске появляется выбор: «Выбрать файл .txt» или «Запустить по массиву из скрипта».
// В файле — любые разделители; нормализация: 8–20 цифр на номер.
// =============================================================================
// Весь код в IIFE: повторная вставка скрипта в консоль без перезагрузки и без SyntaxError на const.
(function () {
  "use strict";

// =============================================================================
// КОНФИГУРАЦИЯ
// =============================================================================
// Массив ТН для режима «без файла» (запуск по кнопке «По массиву из скрипта»).
const TAB_NUMS = [
 "00673892",
  "01515739",
  "01980754"
];

// Значения по умолчанию для панели и для вызова runCollectProfiles без второго аргумента.
const DEFAULT_REQUEST_DELAY_MS = 2;
const DEFAULT_ENABLE_RETRY = true;
const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_RETRY_DELAY_ON_ERROR_MS = 1500;
const DEFAULT_OUTPUT_BASE_NAME = "profiles";
const DEFAULT_BATCH_SIZE = 12000;
const DEFAULT_ENABLE_PHOTO_DOWNLOAD = false;
const DEFAULT_ENABLE_PHOTO_STRIP = true;

/**
 * Снимок параметров одного прогона (задаются на панели или в коде).
 * @returns {object}
 */
function getDefaultRunOptions() {
  return {
    requestDelayMs: DEFAULT_REQUEST_DELAY_MS,
    enableRetry: DEFAULT_ENABLE_RETRY,
    maxRetries: DEFAULT_MAX_RETRIES,
    retryDelayOnErrorMs: DEFAULT_RETRY_DELAY_ON_ERROR_MS,
    outputBaseName: DEFAULT_OUTPUT_BASE_NAME,
    batchSize: DEFAULT_BATCH_SIZE,
    enablePhotoDownload: DEFAULT_ENABLE_PHOTO_DOWNLOAD,
    enablePhotoStrip: DEFAULT_ENABLE_PHOTO_STRIP,
    /** DOM-узел панели: сюда добавляются ссылки «Скачать фото» (обход блокировки автоскачивания). */
    photoDownloadLinkHost: null
  };
}

/**
 * Нормализация опций после слияния с формой.
 * @param {object} raw
 * @returns {object}
 */
function normalizeRunOptions(raw) {
  const o = Object.assign(getDefaultRunOptions(), raw || {});
  o.requestDelayMs = Math.max(0, Number(o.requestDelayMs) || 0);
  o.maxRetries = Math.max(0, Math.floor(Number(o.maxRetries) || 0));
  o.retryDelayOnErrorMs = Math.max(0, Number(o.retryDelayOnErrorMs) || 0);
  o.batchSize = Math.max(1, Math.floor(Number(o.batchSize) || 1));
  var base = String(o.outputBaseName || "profiles").replace(/[/\\?%*:|"<>]/g, "_").trim();
  if (!base) base = "profiles";
  if (base.length > 80) base = base.slice(0, 80);
  o.outputBaseName = base;
  o.enableRetry = Boolean(o.enableRetry);
  o.enablePhotoDownload = Boolean(o.enablePhotoDownload);
  o.enablePhotoStrip = Boolean(o.enablePhotoStrip);
  return o;
}

const DEFAULT_PROFILE_STAND = "ALPHA";

/** Стенд для URL профиля; меняется выпадающим списком на панели. */
let PROFILE_UI_STAND = DEFAULT_PROFILE_STAND;

const PROFILE_URLS = {
  ALPHA: "https://efs-our-business-prom.omega.sbrf.ru/bo/rmkib.gamification/proxy/v1/profile",
  SIGMA: "https://salesheroes.sberbank.ru/bo/rmkib.gamification/proxy/v1/profile"
};
const SIGMA_ORIGIN = "https://salesheroes.sberbank.ru";

// =============================================================================
// ПАРСИНГ ТАБЕЛЬНЫХ ИЗ ТЕКСТА (любые разделители, нормализация 8–20 цифр)
// =============================================================================

/**
 * Извлекает табельные номера из произвольного текста.
 * Разделители: любыые (запятая, точка с запятой, пробел, перенос строки и т.д.).
 * Табельный = подряд идущие цифры; не цифра = разделитель до следующей цифры.
 * Нормализация:
 *   — меньше 8 цифр → дополнение нулями слева до 8;
 *   — от 8 до 20 цифр → без изменений;
 *   — больше 20 цифр → берутся последние 20 цифр (обрезание «в начале»).
 * @param {string} text — содержимое файла или строка с числами.
 * @returns {string[]} массив строк (каждая 8–20 цифр).
 */
function parseTabNumbersFromText(text) {
  if (!text || typeof text !== "string") return [];
  const digitSequences = text.match(/\d+/g) || [];
  const result = [];
  for (const s of digitSequences) {
    let tn = s;
    if (tn.length < 8) tn = tn.padStart(8, "0");
    else if (tn.length > 20) tn = tn.slice(-20);
    result.push(tn);
  }
  return result;
}

/**
 * Формирует тело POST-запроса для получения профиля по табельному номеру.
 */
function makeRequestBody(tn) {
  return { employeeNumber: tn };
}

// =============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// =============================================================================

function delay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function getTimestamp() {
  const d = new Date();
  const yyyy = d.getFullYear().toString();
  const MM = (d.getMonth() + 1).toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  const ss = d.getSeconds().toString().padStart(2, "0");
  return yyyy + MM + dd + "_" + hh + mm + ss;
}

function getJsonSizeBytes(obj) {
  const json = JSON.stringify(obj);
  return new TextEncoder().encode(json).length;
}

/**
 * Декодирует base64 в бинарную строку для atob: убирает пробелы, добавляет padding, при ошибке пробует URL-safe (- _).
 * @param {string} s — фрагмент после снятия префикса data:...;base64,
 * @returns {string}
 */
function decodeBase64ToBinaryString(s) {
  s = s.replace(/\s/g, "");
  if (!s.length) return "";
  function tryDecode(str) {
    var pad = str.length % 4;
    if (pad) str += "====".slice(pad);
    return atob(str);
  }
  try {
    return tryDecode(s);
  } catch (e1) {
    var urlSafe = s.replace(/-/g, "+").replace(/_/g, "/");
    return tryDecode(urlSafe);
  }
}

/**
 * Видимая ссылка на blob: скачивание по клику пользователя (не блокируется как «не жест» после await fetch).
 * @param {HTMLElement|null} hostEl
 * @param {string} objectUrl
 * @param {string} filename
 */
function appendPhotoDownloadLink(hostEl, objectUrl, filename) {
  if (!hostEl || !objectUrl) return;
  var wrap = document.createElement("div");
  wrap.style.cssText = "margin:3px 0;line-height:1.45;";
  var a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename || "photo.jpg";
  a.setAttribute("data-blob-url", objectUrl);
  a.textContent = "Скачать " + (filename || "photo.jpg");
  a.style.cssText = "color:#2563eb;font-weight:600;text-decoration:underline;word-break:break-all;";
  wrap.appendChild(a);
  hostEl.appendChild(wrap);
}

/**
 * Сохраняет фото на диск. API часто отдаёт «голый» base64 без префикса data: — href с ним не работает.
 * Поддерживаются: data:image/...;base64,... и строка только из base64 (считаем image/jpeg).
 * После await fetch часть браузеров блокирует только программный click — тогда помогает ссылка в linkHost (ручной клик).
 * @param {string} rawOrDataUrl
 * @param {string} filename
 * @param {HTMLElement|null} [linkHost] — контейнер на панели для ссылки «Скачать …»
 */
function downloadBase64File(rawOrDataUrl, filename, linkHost) {
  if (!rawOrDataUrl || typeof rawOrDataUrl !== "string") return;
  var objectUrl = null;
  try {
    var s = rawOrDataUrl.trim();
    var mime = "image/jpeg";
    if (/^data:([^;]+);base64,/i.test(s)) {
      mime = RegExp.$1 || mime;
      s = s.replace(/^data:[^;]+;base64,/i, "");
    }
    if (!s.replace(/\s/g, "").length) return;
    var binary = decodeBase64ToBinaryString(s);
    var n = binary.length;
    var bytes = new Uint8Array(n);
    for (var i = 0; i < n; i++) bytes[i] = binary.charCodeAt(i);
    var blob = new Blob([bytes], { type: mime || "image/jpeg" });
    objectUrl = URL.createObjectURL(blob);
    if (linkHost) {
      appendPhotoDownloadLink(linkHost, objectUrl, filename || "photo.jpg");
    }
    var a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename || "photo.jpg";
    a.setAttribute("download", filename || "photo.jpg");
    // display:none ломает программное скачивание в части браузеров (WebKit).
    a.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0.01;pointer-events:none;";
    document.body.appendChild(a);
    if (typeof a.click === "function") {
      a.click();
    } else {
      var ev = document.createEvent("MouseEvents");
      ev.initMouseEvent("click", true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
      a.dispatchEvent(ev);
    }
    // Если есть ссылки на панели — держим URL дольше, чтобы успели нажать вручную.
    var revokeMs = linkHost ? 600000 : 60000;
    setTimeout(function () {
      if (a.parentNode) a.parentNode.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    }, revokeMs);
  } catch (e) {
    if (objectUrl) {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch (eRev) {}
    }
    console.warn("Скачивание фото не удалось:", filename, e);
  }
}

/**
 * Ищет объект с полями photoData / photoDataKpk (ответ SIGMA может класть их глубже, не в body напрямую).
 * @param {object} data — корень ответа API (обычно с полем body).
 * @returns {object|null}
 */
function findProfilePhotoContainer(data) {
  if (!data || typeof data !== "object") return null;
  var b = data.body;
  if (!b || typeof b !== "object") return null;
  function hasPhotoStr(o) {
    return (
      (typeof o.photoData === "string" && o.photoData.length > 0) ||
      (typeof o.photoDataKpk === "string" && o.photoDataKpk.length > 0)
    );
  }
  if (hasPhotoStr(b)) return b;
  function walk(o, depth, maxDepth) {
    if (!o || typeof o !== "object" || depth > maxDepth) return null;
    if (hasPhotoStr(o)) return o;
    for (var k in o) {
      if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
      var v = o[k];
      if (v && typeof v === "object" && !Array.isArray(v)) {
        var r = walk(v, depth + 1, maxDepth);
        if (r) return r;
      }
    }
    return null;
  }
  return walk(b, 0, 10);
}

/**
 * Обработка полей фото в ответе профиля.
 * @param {string} tn
 * @param {object} data
 * @param {{ enablePhotoDownload: boolean, enablePhotoStrip: boolean }} cfg
 */
function processPhotos(tn, data, cfg) {
  if (!data || typeof data !== "object") return data;
  var body = data.body;
  if (!body || typeof body !== "object") return data;

  var photoHost = findProfilePhotoContainer(data);
  if (!photoHost) {
    if (cfg.enablePhotoDownload) {
      console.warn(
        "Фото: в ответе не найден объект с непустыми строками photoData / photoDataKpk (проверьте вложенность JSON)."
      );
    }
    return data;
  }

  let photoSize = 0;
  let photoKpkSize = 0;

  if (typeof photoHost.photoData === "string") {
    photoSize = photoHost.photoData.length;
    if (cfg.enablePhotoDownload && photoSize > 0) {
      var nameMain = tn + "_photoData.jpg";
      console.log("Скачивание фото:", nameMain, "| символов в строке:", photoSize);
      downloadBase64File(photoHost.photoData, nameMain, cfg.photoDownloadLinkHost || null);
    }
  }

  if (typeof photoHost.photoDataKpk === "string") {
    photoKpkSize = photoHost.photoDataKpk.length;
    if (cfg.enablePhotoDownload && photoKpkSize > 0) {
      var nameKpk = tn + "_photoDataKpk.jpg";
      console.log("Скачивание фото KPK:", nameKpk, "| символов:", photoKpkSize);
      downloadBase64File(photoHost.photoDataKpk, nameKpk, cfg.photoDownloadLinkHost || null);
    }
  }

  if (cfg.enablePhotoStrip) {
    delete photoHost.photoData;
    delete photoHost.photoDataKpk;
    photoHost.photoDataInfo = { hasData: photoSize > 0, length: photoSize };
    photoHost.photoDataKpkInfo = { hasData: photoKpkSize > 0, length: photoKpkSize };
  }

  return data;
}

/**
 * @param {string} tn
 * @param {object} cfg — нормализованные опции (normalizeRunOptions).
 */
async function fetchProfileByTN(tn, cfg) {
  const bodyObj = makeRequestBody(tn);
  const standKey =
    PROFILE_UI_STAND === "ALPHA" || PROFILE_UI_STAND === "SIGMA" ? PROFILE_UI_STAND : "ALPHA";
  const url = PROFILE_URLS[standKey] || PROFILE_URLS.ALPHA;

  const headers = {
    "Accept": "application/json",
    "Content-Type": "application/json"
  };
  if (standKey === "SIGMA") {
    headers["Origin"] = SIGMA_ORIGIN;
    headers["Referer"] = SIGMA_ORIGIN + "/profile/" + tn;
  }

  const fetchOpts = {
    method: "POST",
    headers: headers,
    body: JSON.stringify(bodyObj)
  };
  if (standKey === "SIGMA") {
    fetchOpts.credentials = "include";
  }

  const res = await fetch(url, fetchOpts);

  if (!res.ok) {
    console.warn("TN", tn, "ERROR HTTP", res.status);
    return { tn: tn, error: true, status: res.status };
  }

  const rawData = await res.json();
  const sizeBefore = getJsonSizeBytes(rawData);
  const processed = processPhotos(tn, rawData, cfg);
  const sizeAfter = getJsonSizeBytes(processed);

  // Ответ с success: false (например «Запись не найдена») — выводим ERROR и поля ошибки; в JSON сохраняем как есть.
  if (rawData.success === false && rawData.error && typeof rawData.error === "object") {
    const err = rawData.error;
    console.log(
      "TN", tn,
      "| ERROR |",
      "code:", err.code || "",
      "system:", err.system || "",
      "text:", err.text || ""
    );
    return {
      tn: tn,
      error: true,
      requestBody: bodyObj,
      processed,
      sizeBefore: sizeBefore,
      sizeAfter: sizeAfter,
      code: err.code || "",
      system: err.system || "",
      text: err.text || ""
    };
  } else {
    console.log(
      "TN", tn,
      "| OK | size before:", sizeBefore, "bytes",
      "| size after:", sizeAfter, "bytes"
    );
  }

  return {
    tn: tn,
    requestBody: bodyObj,
    processed,
    sizeBefore: sizeBefore,
    sizeAfter: sizeAfter
  };
}

function saveJsonToFile(data, baseName, partIndex) {
  const jsonString = JSON.stringify(data);
  const sizeBytes = new TextEncoder().encode(jsonString).length;
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const ts = getTimestamp();
  const part = partIndex != null ? "_part" + partIndex : "";
  const filename = (baseName || "data") + part + "_" + ts + ".json";

  console.log(
    "Сохранение файла",
    filename,
    "| записей:", data.length,
    "| размер файла:", sizeBytes, "bytes"
  );

  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

// =============================================================================
// ОСНОВНАЯ ФУНКЦИЯ СБОРА (принимает массив ТН; при отсутствии — используется TAB_NUMS)
// =============================================================================

/**
 * Основной цикл сбора профилей по переданному массиву табельных номеров.
 * @param {string[]} tabNums — массив табельных (строки 8–20 цифр).
 * @param {object} [runOpts] — опции прогона; при отсутствии — getDefaultRunOptions().
 */
async function runCollectProfiles(tabNums, runOpts) {
  const cfg = normalizeRunOptions(runOpts);
  const list = tabNums && tabNums.length > 0 ? tabNums : [];
  if (list.length === 0) {
    console.warn("Нет табельных номеров для обработки (файл пустой или не содержит чисел). Сбор не выполнен.");
    return;
  }

  // Освобождаем старые blob:URL со ссылок прошлого прогона (панель).
  if (cfg.photoDownloadLinkHost) {
    var oldLinks = cfg.photoDownloadLinkHost.querySelectorAll("a[data-blob-url]");
    for (var li = 0; li < oldLinks.length; li++) {
      try {
        URL.revokeObjectURL(oldLinks[li].getAttribute("data-blob-url") || "");
      } catch (eRevOld) {}
    }
    cfg.photoDownloadLinkHost.innerHTML = "";
  }

  let batch = [];
  let batchIndex = 1;
  let totalCount = 0;
  let totalOk = 0;
  let totalErr = 0;
  let totalSizeBefore = 0;
  let totalSizeAfter = 0;

  console.log("Старт. Всего ТН к обработке:", list.length);
  var standKeyRun =
    PROFILE_UI_STAND === "ALPHA" || PROFILE_UI_STAND === "SIGMA" ? PROFILE_UI_STAND : "ALPHA";
  console.log("Стенд:", standKeyRun, "| URL:", PROFILE_URLS[standKeyRun] || PROFILE_URLS.ALPHA);
  console.log(
    "Параметры | задержка мс:", cfg.requestDelayMs,
    "| retry:", cfg.enableRetry, "| maxRetries:", cfg.maxRetries,
    "| retryDelay мс:", cfg.retryDelayOnErrorMs,
    "| batch:", cfg.batchSize,
    "| имя файла:", cfg.outputBaseName,
    "| фото DL:", cfg.enablePhotoDownload, "| strip:", cfg.enablePhotoStrip
  );

  for (let i = 0; i < list.length; i++) {
    const tn = list[i];
    console.log("Запрос", i + 1, "/", list.length, "— ТН", tn);

    try {
      const retries = cfg.enableRetry ? cfg.maxRetries : 0;
      const maxAttempts = 1 + retries;
      let r = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          r = await fetchProfileByTN(tn, cfg);
        } catch (reqErr) {
          r = { tn: tn, error: true, exception: String(reqErr) };
        }

        // Успех — завершаем цикл попыток.
        if (!r.error) {
          if (attempt > 1) {
            console.log("TN", tn, "| OK после", attempt, "-й попытки");
          }
          break;
        }

        // Ошибка и попытки закончились — фиксируем как итоговую ошибку.
        if (attempt >= maxAttempts) {
          console.log("TN", tn, "| ERROR после", attempt, "-й попытки | status:", r.status || "n/a");
          break;
        }

        // Ошибка и есть ещё попытки — ждём и повторяем.
        console.warn(
          "TN", tn,
          "| Ошибка на", attempt, "-й попытке. Повтор через",
          cfg.retryDelayOnErrorMs,
          "мс"
        );
        if (cfg.retryDelayOnErrorMs > 0) {
          await delay(cfg.retryDelayOnErrorMs);
        }
      }

      if (r && r.error) {
        totalErr++;
      } else {
        totalOk++;
        totalSizeBefore += (r && r.sizeBefore) || 0;
        totalSizeAfter += (r && r.sizeAfter) || 0;
      }

      batch.push(r);
      totalCount++;
    } catch (e) {
      console.error("Исключение при запросе для", tn, e);
      batch.push({ tn: tn, error: true, exception: String(e) });
      totalErr++;
      totalCount++;
    }

    if (batch.length >= cfg.batchSize) {
      console.log("== Сохранение батча", batchIndex, "| записей:", batch.length, "==");
      saveJsonToFile(batch, cfg.outputBaseName, batchIndex);
      batch = [];
      batchIndex++;
    }

    if (i < list.length - 1 && cfg.requestDelayMs > 0) {
      await delay(cfg.requestDelayMs);
    }
  }

  if (batch.length > 0) {
    console.log("== Сохранение финального батча", batchIndex, "| записей:", batch.length, "==");
    saveJsonToFile(batch, cfg.outputBaseName, batchIndex);
  }

  console.log("==== ИТОГ ====");
  console.log("Всего ТН:", list.length);
  console.log("Всего обработано записей:", totalCount);
  console.log("Успешных:", totalOk, "| Ошибок:", totalErr);
  console.log("Суммарный размер ответов ДО обработки:", totalSizeBefore, "bytes");
  console.log("Суммарный размер ответов ПОСЛЕ обработки:", totalSizeAfter, "bytes");
}

// =============================================================================
// ЗАГРУЗКА ТН ИЗ ФАЙЛА И ЗАПУСК СБОРА
// =============================================================================

/**
 * Панель: стенд, параметры прогона (задержки, retry, батч, фото), источник ТН и кнопки запуска.
 */
function startWithChoice() {
  var prev = document.getElementById("profileGpLoadPanelRoot");
  if (prev) prev.remove();

  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".txt,text/plain";
  input.style.display = "none";

  const inpCss =
    "padding:7px 10px;box-sizing:border-box;border:1px solid #94a3b8;border-radius:6px;font-size:12px;" +
    "color:#0f172a;background:#ffffff;color-scheme:light;width:100%;max-width:140px;";
  const gridRow =
    "display:grid;grid-template-columns:1fr minmax(88px,140px);gap:10px;align-items:center;margin:8px 0;font-size:12px;color:#0f172a;";

  function readOptsFromForm() {
    return normalizeRunOptions({
      requestDelayMs: inReqDelay.value,
      enableRetry: cbRetry.checked,
      maxRetries: inMaxRetries.value,
      retryDelayOnErrorMs: inRetryDel.value,
      outputBaseName: inOutName.value,
      batchSize: inBatch.value,
      enablePhotoDownload: cbPhotoDl.checked,
      enablePhotoStrip: cbPhotoStrip.checked
    });
  }

  function syncRetryFields() {
    var on = cbRetry.checked;
    inMaxRetries.disabled = !on;
    inRetryDel.disabled = !on;
    inMaxRetries.style.opacity = on ? "1" : "0.45";
    inRetryDel.style.opacity = on ? "1" : "0.45";
  }

  const container = document.createElement("div");
  container.id = "profileGpLoadPanelRoot";
  container.style.cssText =
    "position:fixed;top:12px;right:12px;width:min(420px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;" +
    "z-index:999999;box-sizing:border-box;padding:18px 18px 16px;" +
    "background:#ffffff;border:1px solid #cbd5e1;border-radius:12px;" +
    "box-shadow:0 10px 40px rgba(15,23,42,.12);font-family:system-ui,-apple-system,sans-serif;" +
    "color:#0f172a;color-scheme:light;";

  const head = document.createElement("div");
  head.style.cssText = "font-size:17px;font-weight:700;color:#0f172a;margin:0 0 4px 0;letter-spacing:-0.02em;";
  head.textContent = "Профили героев";
  container.appendChild(head);

  const sub = document.createElement("div");
  sub.style.cssText = "font-size:12px;color:#64748b;margin:0 0 14px 0;line-height:1.4;";
  sub.textContent = "Сбор по API профиля: выберите стенд, при необходимости параметры ниже, источник ТН.";
  container.appendChild(sub);

  const rowStand = document.createElement("div");
  rowStand.style.cssText =
    "display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap;padding:10px 12px;" +
    "background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;";
  const labStand = document.createElement("label");
  labStand.textContent = "Стенд";
  labStand.setAttribute("for", "profileStandSel");
  labStand.style.cssText = "font-weight:600;font-size:13px;color:#334155;min-width:52px;";
  const selStand = document.createElement("select");
  selStand.id = "profileStandSel";
  selStand.style.cssText =
    "flex:1;min-width:200px;padding:8px 10px;font-size:13px;cursor:pointer;" +
    "color:#0f172a;background:#fff;border:1px solid #94a3b8;border-radius:6px;color-scheme:light;";
  ["ALPHA", "SIGMA"].forEach(function (key) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = key + " — " + (PROFILE_URLS[key] || "");
    opt.style.cssText = "color:#0f172a;background:#fff;";
    if (key === PROFILE_UI_STAND) opt.selected = true;
    selStand.appendChild(opt);
  });
  selStand.addEventListener("change", function () {
    PROFILE_UI_STAND = selStand.value;
  });
  rowStand.appendChild(labStand);
  rowStand.appendChild(selStand);
  container.appendChild(rowStand);

  const def = getDefaultRunOptions();
  const details = document.createElement("details");
  details.open = true;
  details.style.cssText = "margin:0 0 12px 0;border:1px solid #e2e8f0;border-radius:8px;padding:0;overflow:hidden;";
  const summ = document.createElement("summary");
  summ.style.cssText =
    "cursor:pointer;list-style:none;padding:10px 12px;font-size:13px;font-weight:600;background:#f1f5f9;color:#334155;" +
    "user-select:none;";
  summ.textContent = "Параметры запуска (задержки, retry, батч, фото)";
  details.appendChild(summ);

  const paramsBody = document.createElement("div");
  paramsBody.style.cssText = "padding:8px 12px 14px 12px;border-top:1px solid #e2e8f0;background:#fafafa;";

  var row1 = document.createElement("div");
  row1.style.cssText = gridRow;
  const l1 = document.createElement("label");
  l1.htmlFor = "profReqDelay";
  l1.textContent = "Пауза между запросами (мс)";
  l1.style.cssText = "line-height:1.35;";
  const inReqDelay = document.createElement("input");
  inReqDelay.type = "number";
  inReqDelay.id = "profReqDelay";
  inReqDelay.min = "0";
  inReqDelay.step = "1";
  inReqDelay.value = String(def.requestDelayMs);
  inReqDelay.style.cssText = inpCss;
  row1.appendChild(l1);
  row1.appendChild(inReqDelay);
  paramsBody.appendChild(row1);

  const cbRetry = document.createElement("input");
  cbRetry.type = "checkbox";
  cbRetry.id = "profRetryEn";
  cbRetry.checked = def.enableRetry;
  const lbRetry = document.createElement("label");
  lbRetry.htmlFor = "profRetryEn";
  lbRetry.style.cssText =
    "display:flex;align-items:center;gap:8px;margin:10px 0 6px 0;font-size:12px;color:#0f172a;cursor:pointer;font-weight:600;";
  lbRetry.appendChild(cbRetry);
  lbRetry.appendChild(document.createTextNode(" Повтор при ошибке по ТН"));
  paramsBody.appendChild(lbRetry);

  var row2 = document.createElement("div");
  row2.style.cssText = gridRow;
  const l2 = document.createElement("label");
  l2.htmlFor = "profMaxRetr";
  l2.textContent = "Доп. попыток после первой";
  l2.style.cssText = "line-height:1.35;";
  const inMaxRetries = document.createElement("input");
  inMaxRetries.type = "number";
  inMaxRetries.id = "profMaxRetr";
  inMaxRetries.min = "0";
  inMaxRetries.step = "1";
  inMaxRetries.value = String(def.maxRetries);
  inMaxRetries.style.cssText = inpCss;
  row2.appendChild(l2);
  row2.appendChild(inMaxRetries);
  paramsBody.appendChild(row2);

  var row3 = document.createElement("div");
  row3.style.cssText = gridRow;
  const l3 = document.createElement("label");
  l3.htmlFor = "profRetryMs";
  l3.textContent = "Пауза перед повтором (мс)";
  l3.style.cssText = "line-height:1.35;";
  const inRetryDel = document.createElement("input");
  inRetryDel.type = "number";
  inRetryDel.id = "profRetryMs";
  inRetryDel.min = "0";
  inRetryDel.step = "100";
  inRetryDel.value = String(def.retryDelayOnErrorMs);
  inRetryDel.style.cssText = inpCss;
  row3.appendChild(l3);
  row3.appendChild(inRetryDel);
  paramsBody.appendChild(row3);

  var row4 = document.createElement("div");
  row4.style.cssText = "margin:10px 0 0 0;";
  const l4 = document.createElement("label");
  l4.htmlFor = "profOutName";
  l4.textContent = "Базовое имя JSON-файлов";
  l4.style.cssText = "display:block;margin:0 0 6px 0;font-size:12px;color:#0f172a;font-weight:600;";
  const inOutName = document.createElement("input");
  inOutName.type = "text";
  inOutName.id = "profOutName";
  inOutName.value = def.outputBaseName;
  inOutName.style.cssText =
    "padding:7px 10px;box-sizing:border-box;border:1px solid #94a3b8;border-radius:6px;font-size:12px;" +
    "color:#0f172a;background:#fff;width:100%;color-scheme:light;";
  row4.appendChild(l4);
  row4.appendChild(inOutName);
  paramsBody.appendChild(row4);

  var row5 = document.createElement("div");
  row5.style.cssText = gridRow;
  const l5 = document.createElement("label");
  l5.htmlFor = "profBatch";
  l5.textContent = "Записей в одном файле (батч)";
  l5.style.cssText = "line-height:1.35;";
  const inBatch = document.createElement("input");
  inBatch.type = "number";
  inBatch.id = "profBatch";
  inBatch.min = "1";
  inBatch.step = "100";
  inBatch.value = String(def.batchSize);
  inBatch.style.cssText = inpCss;
  row5.appendChild(l5);
  row5.appendChild(inBatch);
  paramsBody.appendChild(row5);

  const cbPhotoDl = document.createElement("input");
  cbPhotoDl.type = "checkbox";
  cbPhotoDl.id = "profPhotoDl";
  cbPhotoDl.checked = def.enablePhotoDownload;
  const lbPhotoDl = document.createElement("label");
  lbPhotoDl.htmlFor = "profPhotoDl";
  lbPhotoDl.style.cssText =
    "display:flex;align-items:center;gap:8px;margin:12px 0 6px 0;font-size:12px;color:#0f172a;cursor:pointer;";
  lbPhotoDl.appendChild(cbPhotoDl);
  lbPhotoDl.appendChild(document.createTextNode(" Скачивать фото (photoData / KPK) отдельными файлами"));
  paramsBody.appendChild(lbPhotoDl);

  const cbPhotoStrip = document.createElement("input");
  cbPhotoStrip.type = "checkbox";
  cbPhotoStrip.id = "profPhotoStrip";
  cbPhotoStrip.checked = def.enablePhotoStrip;
  const lbPhotoStrip = document.createElement("label");
  lbPhotoStrip.htmlFor = "profPhotoStrip";
  lbPhotoStrip.style.cssText =
    "display:flex;align-items:center;gap:8px;margin:0 0 4px 0;font-size:12px;color:#0f172a;cursor:pointer;";
  lbPhotoStrip.appendChild(cbPhotoStrip);
  lbPhotoStrip.appendChild(document.createTextNode(" Урезать base64 из JSON (photoDataInfo)"));
  paramsBody.appendChild(lbPhotoStrip);

  // Контейнер для ручного скачивания фото: программный клик после await fetch часто не считается «жестом пользователя».
  const photoDlSection = document.createElement("div");
  photoDlSection.style.cssText =
    "margin:12px 0 0 0;padding:10px 10px 8px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;";
  const photoDlSectionTitle = document.createElement("div");
  photoDlSectionTitle.style.cssText =
    "font-size:11px;color:#166534;font-weight:600;margin:0 0 6px 0;line-height:1.35;";
  photoDlSectionTitle.textContent =
    "Ссылки на фото: если в папку загрузок ничего не пришло, нажмите здесь (браузер часто блокирует автоскачивание после запроса).";
  var photoDlLinkHost = document.createElement("div");
  photoDlLinkHost.id = "profileGpPhotoDlHost";
  photoDlLinkHost.style.cssText = "font-size:12px;";
  photoDlSection.appendChild(photoDlSectionTitle);
  photoDlSection.appendChild(photoDlLinkHost);
  paramsBody.appendChild(photoDlSection);

  /** Опции прогона + привязка панели со ссылками на фото. */
  function readRunOptsForCollect() {
    return Object.assign(readOptsFromForm(), { photoDownloadLinkHost: photoDlLinkHost });
  }

  cbRetry.addEventListener("change", syncRetryFields);
  syncRetryFields();

  details.appendChild(paramsBody);
  container.appendChild(details);

  const secTn = document.createElement("div");
  secTn.style.cssText =
    "font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;margin:16px 0 8px 0;";
  secTn.textContent = "Источник табельных";
  container.appendChild(secTn);

  const labTa = document.createElement("div");
  labTa.style.cssText = "font-size:12px;color:#475569;margin:0 0 8px 0;line-height:1.45;";
  labTa.textContent =
    "Текст или файл: любые разделители между числами; нормализация 8–20 цифр. Либо массив TAB_NUMS в скрипте.";
  container.appendChild(labTa);

  const taNums = document.createElement("textarea");
  taNums.rows = 5;
  taNums.style.cssText =
    "width:100%;box-sizing:border-box;margin:0 0 12px 0;padding:10px;font-size:12px;font-family:ui-monospace,monospace;" +
    "color:#0f172a;background:#fff;border:1px solid #94a3b8;border-radius:8px;resize:vertical;min-height:88px;color-scheme:light;";
  taNums.placeholder = "Например:\n00673892, 01515739\n01980754";
  taNums.spellcheck = false;
  container.appendChild(taNums);

  const btnCssBase =
    "width:100%;box-sizing:border-box;padding:11px 14px;margin:0 0 8px 0;font-size:13px;font-weight:600;" +
    "cursor:pointer;border-radius:8px;border:none;transition:opacity .15s;";
  const btnFromText = document.createElement("button");
  btnFromText.type = "button";
  btnFromText.textContent = "Запустить по тексту из поля";
  btnFromText.style.cssText = btnCssBase + "background:linear-gradient(180deg,#7c3aed,#6d28d9);color:#fff;box-shadow:0 2px 6px rgba(124,58,237,.35);";
  btnFromText.addEventListener("click", function () {
    const tabNums = parseTabNumbersFromText(taNums.value);
    if (tabNums.length === 0) {
      console.warn("В поле нет табельных номеров (нужны группы цифр).");
      return;
    }
    console.log("Запуск по тексту из поля, ТН:", tabNums.length);
    console.log("Сбор в фоне — панель не закрывается; по окончании смотрите консоль и загрузки.");
    runCollectProfiles(tabNums, readRunOptsForCollect());
  });

  const btnFile = document.createElement("button");
  btnFile.type = "button";
  btnFile.textContent = "Выбрать файл .txt и запустить";
  btnFile.style.cssText = btnCssBase + "background:#2563eb;color:#fff;box-shadow:0 2px 6px rgba(37,99,235,.3);";
  btnFile.addEventListener("click", function () {
    input.click();
  });

  const btnArray = document.createElement("button");
  btnArray.type = "button";
  btnArray.textContent = "Запустить по TAB_NUMS из скрипта";
  btnArray.style.cssText = btnCssBase + "background:#059669;color:#fff;box-shadow:0 2px 6px rgba(5,150,105,.3);";
  btnArray.addEventListener("click", function () {
    if (TAB_NUMS.length === 0) {
      console.warn("Массив TAB_NUMS в скрипте пуст.");
      return;
    }
    console.log("Запуск по TAB_NUMS, ТН:", TAB_NUMS.length);
    console.log("Сбор в фоне — панель не закрывается; по окончании смотрите консоль и загрузки.");
    runCollectProfiles(TAB_NUMS, readRunOptsForCollect());
  });

  const btnClose = document.createElement("button");
  btnClose.type = "button";
  btnClose.textContent = "Закрыть панель";
  btnClose.title = "Снять панель с экрана. Повторный запуск — снова вставить скрипт в консоль (страницу не перезагружать).";
  btnClose.style.cssText =
    "width:100%;box-sizing:border-box;margin-top:4px;padding:9px 12px;font-size:12px;cursor:pointer;" +
    "background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;border-radius:8px;font-weight:500;";
  btnClose.addEventListener("click", function () {
    try {
      input.value = "";
    } catch (eCloseInp) {}
    container.remove();
  });

  container.appendChild(btnFromText);
  container.appendChild(btnFile);
  container.appendChild(btnArray);
  container.appendChild(btnClose);
  container.appendChild(input);
  document.body.appendChild(container);

  input.addEventListener("change", function () {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      const text = typeof reader.result === "string" ? reader.result : "";
      const tabNums = parseTabNumbersFromText(text);
      console.log("Из файла извлечено ТН:", tabNums.length);
      console.log("Сбор в фоне — панель не закрывается; по окончании смотрите консоль и загрузки.");
      runCollectProfiles(tabNums, readRunOptsForCollect());
      try {
        input.value = "";
      } catch (eClr) {}
    };
    reader.readAsText(file, "UTF-8");
  });
}

// При вставке скрипта в консоль — панель: текстовое поле ТН, файл или TAB_NUMS.
startWithChoice();
})();
