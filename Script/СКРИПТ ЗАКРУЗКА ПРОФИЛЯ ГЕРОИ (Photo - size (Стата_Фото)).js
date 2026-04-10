// =============================================================================
// СКРИПТ ЗАГРУЗКИ ПРОФИЛЕЙ ГЕРОЕВ (с опцией обработки фото)
// =============================================================================
// Назначение: пакетная загрузка профилей сотрудников через API геймификации.
// Запуск: вставить код в консоль разработчика (F12 → Console) на странице
// выбранного стенда (ALPHA или SIGMA), предварительно авторизовавшись.
// Результат: JSON-файлы с профилями скачиваются на компьютер пользователя;
// при необходимости большие поля с фото заменяются на компактные ...Info.
// Подробная документация: см. Docs/Скрипт_загрузка_профиля_герои.md
// =============================================================================

// =============================================================================
// КОНФИГУРАЦИЯ: список табельных номеров (ТН) сотрудников для загрузки профилей.
// Каждый элемент — строка из 8 цифр. Скрипт последовательно запросит профиль по каждому ТН.
// =============================================================================
const TAB_NUMS = [
"01234567",
  "02345678"
// Добавьте сюда все нужные ТН в формате строки "XXXXXXXX"
];

// Задержка между двумя последовательными HTTP-запросами (в миллисекундах).
// Снижает нагрузку на API; при 0 задержки не будет.
const REQUEST_DELAY_MS = 2;

// Базовое имя сохраняемых JSON-файлов. К нему добавляются номер части и метка времени.
const OUTPUT_BASE_NAME = "profiles";

// Максимальное количество записей в одном файле. При достижении этого числа
// текущий батч сохраняется в файл и начинается новый (имя файла: baseName_partN_timestamp.json).
const BATCH_SIZE = 1000;

// -----------------------------------------------------------------------------
// Флаги обработки фотографий в ответе API
// -----------------------------------------------------------------------------
// true — скачивать изображения из полей photoData и photoDataKpk (base64) как отдельные .jpg файлы.
const ENABLE_PHOTO_DOWNLOAD = false;
// true — удалять из сохраняемого JSON сами поля photoData/photoDataKpk и заменять их
// на объекты photoDataInfo / photoDataKpkInfo (hasData, length), чтобы уменьшить размер файлов.
const ENABLE_PHOTO_STRIP = true;

// -----------------------------------------------------------------------------
// Выбор стенда: от него зависят URL запросов и заголовки (для SIGMA — ещё и куки).
// ALPHA — промовый стенд (omega); SIGMA — стенд salesheroes.
// -----------------------------------------------------------------------------
const STAND = "ALPHA";

// URL метода получения профиля для каждого стенда. Используется в fetch как адрес POST-запроса.
const PROFILE_URLS = {
  ALPHA: "https://efs-our-business-prom.omega.sbrf.ru/bo/rmkib.gamification/proxy/v1/profile",
  SIGMA: "https://salesheroes.sberbank.ru/bo/rmkib.gamification/proxy/v1/profile"
};
// Базовый origin для стенда SIGMA: подставляется в заголовки Origin и Referer.
const SIGMA_ORIGIN = "https://salesheroes.sberbank.ru";

/**
 * Формирует тело POST-запроса для получения профиля по табельному номеру.
 * @param {string} tn — табельный номер сотрудника (например "01707713").
 * @returns {{ employeeNumber: string }} объект для JSON.stringify и отправки в body.
 */
function makeRequestBody(tn) {
  return { employeeNumber: tn };
}

// =============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// =============================================================================

/**
 * Возвращает Promise, который разрешится через заданное число миллисекунд.
 * Используется для паузы между запросами в основном цикле.
 * @param {number} ms — задержка в миллисекундах.
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

/**
 * Возвращает текущую метку времени в формате YYYYMMDD_HHMMSS (год, месяц, день, часы, минуты, секунды).
 * Используется в именах сохраняемых JSON-файлов для уникальности.
 * @returns {string} например "20260218_143052"
 */
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

/**
 * Вычисляет размер объекта в байтах при сериализации в JSON (UTF-8).
 * Нужна для логирования размера ответов до и после обработки (удаления фото).
 * @param {object} obj — любой объект, допускающий JSON.stringify.
 * @returns {number} размер в байтах.
 */
function getJsonSizeBytes(obj) {
  const json = JSON.stringify(obj);
  return new TextEncoder().encode(json).length;
}

/**
 * Скачивание фото из ответа API: часто приходит «голый» base64 без префикса data: —
 * тогда прямой href не работает. Поддержка data:image/...;base64,... и сырого base64.
 * Реализация через Blob + object URL.
 * @param {string} rawOrDataUrl
 * @param {string} [filename]
 */
function downloadBase64File(rawOrDataUrl, filename) {
  if (!rawOrDataUrl || typeof rawOrDataUrl !== "string") return;
  try {
    var s = rawOrDataUrl.trim();
    var mime = "image/jpeg";
    if (/^data:([^;]+);base64,/i.test(s)) {
      mime = RegExp.$1 || mime;
      s = s.replace(/^data:[^;]+;base64,/i, "");
    }
    s = s.replace(/\s/g, "");
    if (!s.length) return;
    var binary = atob(s);
    var n = binary.length;
    var bytes = new Uint8Array(n);
    for (var i = 0; i < n; i++) bytes[i] = binary.charCodeAt(i);
    var blob = new Blob([bytes], { type: mime || "image/jpeg" });
    var objectUrl = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename || "photo.jpg";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(objectUrl);
    }, 500);
  } catch (e) {
    console.warn("Скачивание фото не удалось:", filename, e);
  }
}

/**
 * Обрабатывает поля с фотографиями в теле ответа API (data.body).
 * В зависимости от флагов: скачивает base64-изображения как файлы и/или заменяет
 * большие поля на компактные объекты ...Info (hasData, length).
 * @param {string} tn — табельный номер (для имён файлов при скачивании).
 * @param {object} data — объект ответа API с полем body; body может содержать photoData, photoDataKpk.
 * @returns {object} тот же data (возможно изменённый).
 */
function processPhotos(tn, data) {
  if (!data || typeof data !== "object") return data;

  const body = data.body;
  if (!body || typeof body !== "object") return data;

  // Размеры полей (в символах строки base64) для последующей подстановки в ...Info.
  let photoSize = 0;
  let photoKpkSize = 0;

  // Поле photoData — основное фото сотрудника (base64-строка).
  if (typeof body.photoData === "string") {
    photoSize = body.photoData.length;
    if (ENABLE_PHOTO_DOWNLOAD) {
      const name = tn + "_photoData.jpg";
      downloadBase64File(body.photoData, name);
    }
  }

  // Поле photoDataKpk — фото для КПК (base64-строка).
  if (typeof body.photoDataKpk === "string") {
    photoKpkSize = body.photoDataKpk.length;
    if (ENABLE_PHOTO_DOWNLOAD) {
      const name = tn + "_photoDataKpk.jpg";
      downloadBase64File(body.photoDataKpk, name);
    }
  }

  // Удаляем тяжёлые поля и подставляем краткую сводку, если включён ENABLE_PHOTO_STRIP.
  if (ENABLE_PHOTO_STRIP) {
    delete body.photoData;
    delete body.photoDataKpk;

    body.photoDataInfo = {
      hasData: photoSize > 0,
      length: photoSize
    };

    body.photoDataKpkInfo = {
      hasData: photoKpkSize > 0,
      length: photoKpkSize
    };
  }

  return data;
}

/**
 * Запрашивает профиль сотрудника по табельному номеру через POST к API.
 * Выбор URL и заголовков зависит от константы STAND (ALPHA / SIGMA).
 * Для SIGMA дополнительно отправляются куки сессии (credentials: "include") и заголовки Origin, Referer.
 * @param {string} tn — табельный номер сотрудника.
 * @returns {Promise<object>} объект с полями tn, requestBody, processed, sizeBefore, sizeAfter при успехе;
 *   при HTTP-ошибке — { tn, error: true, status }.
 */
async function fetchProfileByTN(tn) {
  // Тело запроса: { employeeNumber: tn } — требуется API для обоих стендов.
  const bodyObj = makeRequestBody(tn);
  const url = PROFILE_URLS[STAND] || PROFILE_URLS.ALPHA;

  // Базовые заголовки для JSON POST.
  const headers = {
    "Accept": "application/json",
    "Content-Type": "application/json"
  };
  // Для стенда SIGMA сервер ожидает Origin и Referer (в Referer — страница профиля с текущим ТН).
  if (STAND === "SIGMA") {
    headers["Origin"] = SIGMA_ORIGIN;
    headers["Referer"] = SIGMA_ORIGIN + "/profile/" + tn;
  }

  const fetchOpts = {
    method: "POST",
    headers: headers,
    body: JSON.stringify(bodyObj)
  };
  // Отправка куки сессии обязательна для SIGMA, иначе запрос может вернуть 403.
  if (STAND === "SIGMA") {
    fetchOpts.credentials = "include";
  }

  const res = await fetch(url, fetchOpts);

  if (!res.ok) {
    console.warn("TN", tn, "ERROR HTTP", res.status);
    return {
      tn: tn,
      error: true,
      status: res.status
    };
  }

  const rawData = await res.json();
  const sizeBefore = getJsonSizeBytes(rawData);

  // Обработка полей фото (скачивание и/или замена на ...Info).
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

/**
 * Сохраняет массив данных в JSON-файл и инициирует его скачивание в браузере.
 * Имя файла: baseName + опционально _partN + _YYYYMMDD_HHMMSS + ".json".
 * @param {Array<object>} data — массив объектов (результаты запросов по каждому ТН).
 * @param {string} [baseName] — базовое имя файла; по умолчанию "data".
 * @param {number|null} [partIndex] — номер части; если задан, в имя добавляется "_partN".
 */
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
  // Удаляем ссылку из DOM и освобождаем object URL после срабатывания скачивания.
  setTimeout(function () {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

// =============================================================================
// ОСНОВНАЯ ФУНКЦИЯ: последовательный сбор профилей и сохранение батчами
// =============================================================================

/**
 * Основной цикл: для каждого ТН из TAB_NUMS выполняет запрос профиля, накапливает
 * результаты в батч и при достижении BATCH_SIZE сохраняет батч в JSON-файл.
 * Между запросами — пауза REQUEST_DELAY_MS. В конце выводит итоговую статистику.
 */
async function runCollectProfiles() {
  // Буфер накопленных результатов перед записью в файл.
  let batch = [];
  let batchIndex = 1;
  let totalCount = 0;
  let totalOk = 0;
  let totalErr = 0;

  let totalSizeBefore = 0;
  let totalSizeAfter = 0;

  console.log("Старт. Всего ТН к обработке:", TAB_NUMS.length);
  console.log("STAND:", STAND, "| URL:", PROFILE_URLS[STAND] || PROFILE_URLS.ALPHA);
  console.log("FLAGS | ENABLE_PHOTO_DOWNLOAD:", ENABLE_PHOTO_DOWNLOAD,
    "| ENABLE_PHOTO_STRIP:", ENABLE_PHOTO_STRIP);

  for (let i = 0; i < TAB_NUMS.length; i++) {
    const tn = TAB_NUMS[i];
    console.log("Запрос", i + 1, "/", TAB_NUMS.length, "— ТН", tn);

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

    // Достигнут размер батча — сохраняем в файл и сбрасываем буфер.
    if (batch.length >= BATCH_SIZE) {
      console.log(
        "== Сохранение батча", batchIndex,
        "| записей:", batch.length,
        "=="
      );
      saveJsonToFile(batch, OUTPUT_BASE_NAME, batchIndex);
      batch = [];
      batchIndex++;
    }

    // Пауза между запросами (кроме паузы после последнего ТН).
    if (i < TAB_NUMS.length - 1 && REQUEST_DELAY_MS > 0) {
      await delay(REQUEST_DELAY_MS);
    }
  }

  // Сохраняем оставшиеся записи, если батч не заполнился до BATCH_SIZE.
  if (batch.length > 0) {
    console.log(
      "== Сохранение финального батча", batchIndex,
      "| записей:", batch.length,
      "=="
    );
    saveJsonToFile(batch, OUTPUT_BASE_NAME, batchIndex);
  }

  console.log("==== ИТОГ ====");
  console.log("Всего ТН:", TAB_NUMS.length);
  console.log("Всего обработано записей:", totalCount);
  console.log("Успешных:", totalOk, "| Ошибок:", totalErr);
  console.log("Суммарный размер ответов ДО обработки:", totalSizeBefore, "bytes");
  console.log("Суммарный размер ответов ПОСЛЕ обработки:", totalSizeAfter, "bytes");
}

// При вставке скрипта в консоль браузера сбор профилей запускается сразу.
runCollectProfiles();
