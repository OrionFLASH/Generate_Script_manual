// =============================================================================
// СКРИПТ ЗАГРУЗКИ ПРОФИЛЕЙ ГЕРОЕВ — ВАРИАНТ С ЗАГРУЗКОЙ ТН ИЗ ФАЙЛА
// =============================================================================
// Табельные можно загрузить из файла или взять из массива TAB_NUMS в коде.
// При запуске появляется выбор: «Выбрать файл .txt» или «Запустить по массиву из скрипта».
// В файле — любые разделители; нормализация: 8–20 цифр на номер.
// =============================================================================

// =============================================================================
// КОНФИГУРАЦИЯ
// =============================================================================
// Массив ТН для режима «без файла» (запуск по кнопке «По массиву из скрипта»).
const TAB_NUMS = [
  "01234567",
  "00673892"
];

const REQUEST_DELAY_MS = 2;
const OUTPUT_BASE_NAME = "profiles";
const BATCH_SIZE = 1000;

const ENABLE_PHOTO_DOWNLOAD = false;
const ENABLE_PHOTO_STRIP = true;

const STAND = "SIGMA";

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

function downloadBase64File(dataUrl, filename) {
  if (!dataUrl || typeof dataUrl !== "string") return;
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename || "file.bin";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function processPhotos(tn, data) {
  if (!data || typeof data !== "object") return data;
  const body = data.body;
  if (!body || typeof body !== "object") return data;

  let photoSize = 0;
  let photoKpkSize = 0;

  if (typeof body.photoData === "string") {
    photoSize = body.photoData.length;
    if (ENABLE_PHOTO_DOWNLOAD) {
      const name = tn + "_photoData.jpg";
      downloadBase64File(body.photoData, name);
    }
  }

  if (typeof body.photoDataKpk === "string") {
    photoKpkSize = body.photoDataKpk.length;
    if (ENABLE_PHOTO_DOWNLOAD) {
      const name = tn + "_photoDataKpk.jpg";
      downloadBase64File(body.photoDataKpk, name);
    }
  }

  if (ENABLE_PHOTO_STRIP) {
    delete body.photoData;
    delete body.photoDataKpk;
    body.photoDataInfo = { hasData: photoSize > 0, length: photoSize };
    body.photoDataKpkInfo = { hasData: photoKpkSize > 0, length: photoKpkSize };
  }

  return data;
}

async function fetchProfileByTN(tn) {
  const bodyObj = makeRequestBody(tn);
  const url = PROFILE_URLS[STAND] || PROFILE_URLS.ALPHA;

  const headers = {
    "Accept": "application/json",
    "Content-Type": "application/json"
  };
  if (STAND === "SIGMA") {
    headers["Origin"] = SIGMA_ORIGIN;
    headers["Referer"] = SIGMA_ORIGIN + "/profile/" + tn;
  }

  const fetchOpts = {
    method: "POST",
    headers: headers,
    body: JSON.stringify(bodyObj)
  };
  if (STAND === "SIGMA") {
    fetchOpts.credentials = "include";
  }

  const res = await fetch(url, fetchOpts);

  if (!res.ok) {
    console.warn("TN", tn, "ERROR HTTP", res.status);
    return { tn: tn, error: true, status: res.status };
  }

  const rawData = await res.json();
  const sizeBefore = getJsonSizeBytes(rawData);
  const processed = processPhotos(tn, rawData);
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
 * @param {string[]} tabNums — массив табельных (строки 8–20 цифр), полученный из файла. При пустом массиве сбор не выполняется.
 */
async function runCollectProfiles(tabNums) {
  const list = tabNums && tabNums.length > 0 ? tabNums : [];
  if (list.length === 0) {
    console.warn("Нет табельных номеров для обработки (файл пустой или не содержит чисел). Сбор не выполнен.");
    return;
  }

  let batch = [];
  let batchIndex = 1;
  let totalCount = 0;
  let totalOk = 0;
  let totalErr = 0;
  let totalSizeBefore = 0;
  let totalSizeAfter = 0;

  console.log("Старт. Всего ТН к обработке:", list.length);
  console.log("STAND:", STAND, "| URL:", PROFILE_URLS[STAND] || PROFILE_URLS.ALPHA);
  console.log("FLAGS | ENABLE_PHOTO_DOWNLOAD:", ENABLE_PHOTO_DOWNLOAD,
    "| ENABLE_PHOTO_STRIP:", ENABLE_PHOTO_STRIP);

  for (let i = 0; i < list.length; i++) {
    const tn = list[i];
    console.log("Запрос", i + 1, "/", list.length, "— ТН", tn);

    try {
      const r = await fetchProfileByTN(tn);

      if (r.error) {
        console.log("TN", tn, "| ERROR | status:", r.status);
        totalErr++;
      } else {
        totalOk++;
        totalSizeBefore += r.sizeBefore || 0;
        totalSizeAfter += r.sizeAfter || 0;
      }

      batch.push(r);
      totalCount++;
    } catch (e) {
      console.error("Исключение при запросе для", tn, e);
      batch.push({ tn: tn, error: true, exception: String(e) });
      totalErr++;
      totalCount++;
    }

    if (batch.length >= BATCH_SIZE) {
      console.log("== Сохранение батча", batchIndex, "| записей:", batch.length, "==");
      saveJsonToFile(batch, OUTPUT_BASE_NAME, batchIndex);
      batch = [];
      batchIndex++;
    }

    if (i < list.length - 1 && REQUEST_DELAY_MS > 0) {
      await delay(REQUEST_DELAY_MS);
    }
  }

  if (batch.length > 0) {
    console.log("== Сохранение финального батча", batchIndex, "| записей:", batch.length, "==");
    saveJsonToFile(batch, OUTPUT_BASE_NAME, batchIndex);
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
 * Показывает панель выбора: загрузить ТН из файла или запустить по массиву TAB_NUMS из скрипта.
 * При выборе файла — парсит текст и запускает runCollectProfiles(табельные_из_файла).
 * При «по массиву» — запускает runCollectProfiles(TAB_NUMS).
 */
function startWithChoice() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".txt,text/plain";
  input.style.display = "none";

  const label = document.createElement("div");
  label.style.cssText = "margin:0 0 10px 0;font-family:sans-serif;font-size:14px;color:#333;";
  label.textContent = "Табельные: из файла или из массива в скрипте (TAB_NUMS)";

  const btnFile = document.createElement("button");
  btnFile.type = "button";
  btnFile.textContent = "Выбрать файл .txt";
  btnFile.style.cssText = "display:block;margin:6px 0;padding:10px 16px;font-size:14px;cursor:pointer;background:#0066cc;color:#fff;border:none;border-radius:6px;width:100%;box-sizing:border-box;";
  btnFile.addEventListener("click", function () {
    input.click();
  });

  const btnArray = document.createElement("button");
  btnArray.type = "button";
  btnArray.textContent = "Запустить по массиву из скрипта (TAB_NUMS)";
  btnArray.style.cssText = "display:block;margin:6px 0;padding:10px 16px;font-size:14px;cursor:pointer;background:#28a745;color:#fff;border:none;border-radius:6px;width:100%;box-sizing:border-box;";
  btnArray.addEventListener("click", function () {
    if (TAB_NUMS.length === 0) {
      console.warn("Массив TAB_NUMS в скрипте пуст. Заполните его или выберите файл.");
      return;
    }
    console.log("Запуск по массиву из скрипта, ТН:", TAB_NUMS.length);
    runCollectProfiles(TAB_NUMS);
    container.remove();
  });

  const container = document.createElement("div");
  container.style.cssText = "position:fixed;top:10px;right:10px;background:#fff;border:1px solid #ccc;padding:16px;z-index:999999;box-shadow:0 2px 12px rgba(0,0,0,.2);min-width:300px;";
  container.appendChild(label);
  container.appendChild(btnFile);
  container.appendChild(btnArray);
  container.appendChild(input);
  document.body.appendChild(container);

  input.addEventListener("change", function () {
    const file = input.files && input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function () {
      const text = typeof reader.result === "string" ? reader.result : "";
      const tabNums = parseTabNumbersFromText(text);
      console.log("Из файла извлечено табельных номеров:", tabNums.length);
      runCollectProfiles(tabNums);
      container.remove();
    };
    reader.readAsText(file, "UTF-8");
  });
}

// При вставке скрипта в консоль показывается выбор: файл или массив TAB_NUMS.
startWithChoice();
