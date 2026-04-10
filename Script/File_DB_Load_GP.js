// =============================================================================
// File_DB_Load_GP.js — скачивание файлов через API gamification (консоль DevTools)
// =============================================================================
// POST к эндпоинтам .../file-download — ответ: бинарный файл (скачивание в браузере).
// Куки берутся из текущей сессии (credentials: "include"), на странице нужного стенда.
// Панель: основные выгрузки, группы «Рейтинг» и «Заказы», чекбоксы и «Скачать выделенное» с паузой между запросами.
// Табельные номера не используются.
// =============================================================================

// =============================================================================
// КОНФИГУРАЦИЯ
// =============================================================================

// Стенд по умолчанию до открытия панели; дальше задаётся выпадающим списком на панели.
const DEFAULT_FILE_DL_STAND = "SIGMA";

/** Текущий выбранный стенд для POST (обновляется из UI панели). */
var FILE_DL_ACTIVE_STAND = DEFAULT_FILE_DL_STAND;

// Базовые URL для каждого стенда (без завершающего слэша).
const STAND_ORIGINS = {
  ALPHA: "https://efs-our-business-prom.omega.sbrf.ru",
  SIGMA: "https://salesheroes.sberbank.ru"
};

// Путь по умолчанию, если у задачи не указан apiPath.
const DEFAULT_FILE_DOWNLOAD_PATH = "/bo/rmkib.gamification/proxy/v1/tournaments/file-download";

// Дата «с которой» грузить сводку наград (payload dateFrom для employee-rewards/file-download).
const EMPLOYEE_REWARDS_DATE_FROM = "2023-01-01";

// Пауза между запросами при пакетной загрузке («Скачать всё», группы «Рейтинг» / «Заказы»), мс.
const DOWNLOAD_ALL_DELAY_MS = 800;

// Режим «скользящий старт»: минимальный интервал между запусками POST (мс); следующий старт раньше, если предыдущий успешно завершился и прошло DOWNLOAD_ALL_DELAY_MS.
const DOWNLOAD_STAGGER_MS = 15000;

/** Включён ли на панели чекбокс «скользящий старт» (обновляется из UI). */
var FILE_DL_USE_STAGGER = false;

// Эндпоинт выгрузки рейтинга (группа кнопок «Рейтинг»).
const RATINGLIST_FILE_DOWNLOAD_PATH = "/bo/rmkib.gamification/proxy/v1/ratinglist/file-download";

// Эндпоинт выгрузки заказов (группа кнопок «Заказы»): body — businessBlock + listType (не timePeriod).
const ORDERS_FILE_DOWNLOAD_PATH = "/bo/rmkib.gamification/proxy/v1/orders/file-download";

/**
 * Список запросов на скачивание.
 * - apiPath — путь POST относительно origin (если не задан — используется DEFAULT_FILE_DOWNLOAD_PATH).
 * - label — текст на кнопке.
 * - body — тело POST (JSON).
 * - refererPath — подсказка: лучше открыть вкладку на … + refererPath (браузер сам выставит Referer).
 * - fileName — необязательно, если сервер не прислал Content-Disposition.
 */
const DOWNLOAD_JOBS = [
  {
    id: "tournamentListCsv",
    label: "Список турниров (CSV)",
    apiPath: DEFAULT_FILE_DOWNLOAD_PATH,
    body: {},
    refererPath: "/tournaments/list",
    fileName: null
  },
  {
    id: "employeeRewardsSummary",
    label: "Сводка (награды, CSV)",
    apiPath: "/bo/rmkib.gamification/proxy/v1/employee-rewards/file-download",
    body: { dateFrom: EMPLOYEE_REWARDS_DATE_FROM },
    refererPath: "/awards/list",
    fileName: null
  },
  {
    id: "administrationStatisticCsv",
    label: "Сводка статистики (админ, CSV)",
    apiPath: "/bo/rmkib.gamification/proxy/v1/administration/statistic/file-download",
    body: {},
    refererPath: "/admin/statistic",
    fileName: null
  }
];

/**
 * Группа «Рейтинг»: один URL, разные payload (businessBlock + timePeriod).
 * У каждой задачи задано уникальное fileName — иначе браузер перезапишет одинаковые gamification-ratingList.csv.
 * Лучше открыть вкладку на …/rating перед запуском.
 */
const RATING_GROUP_JOBS = [
  {
    id: "rating_KMKKSB_ACTIVESEASON",
    label: "Рейтинг · KMKKSB · ACTIVESEASON",
    apiPath: RATINGLIST_FILE_DOWNLOAD_PATH,
    body: { businessBlock: "KMKKSB", timePeriod: "ACTIVESEASON" },
    refererPath: "/rating",
    fileName: "gamification-ratingList_KMKKSB_ACTIVESEASON.csv"
  },
  {
    id: "rating_KMKKSB_SEASON_2025_2",
    label: "Рейтинг · KMKKSB · SEASON_2025_2",
    apiPath: RATINGLIST_FILE_DOWNLOAD_PATH,
    body: { businessBlock: "KMKKSB", timePeriod: "SEASON_2025_2" },
    refererPath: "/rating",
    fileName: "gamification-ratingList_KMKKSB_SEASON_2025_2.csv"
  },
  {
    id: "rating_KMKKSB_SEASON_2025_1",
    label: "Рейтинг · KMKKSB · SEASON_2025_1",
    apiPath: RATINGLIST_FILE_DOWNLOAD_PATH,
    body: { businessBlock: "KMKKSB", timePeriod: "SEASON_2025_1" },
    refererPath: "/rating",
    fileName: "gamification-ratingList_KMKKSB_SEASON_2025_1.csv"
  },
  {
    id: "rating_KMKKSB_SEASON_2024",
    label: "Рейтинг · KMKKSB · SEASON_2024",
    apiPath: RATINGLIST_FILE_DOWNLOAD_PATH,
    body: { businessBlock: "KMKKSB", timePeriod: "SEASON_2024" },
    refererPath: "/rating",
    fileName: "gamification-ratingList_KMKKSB_SEASON_2024.csv"
  },
  {
    id: "rating_KMKKSB_ALLTHETIME",
    label: "Рейтинг · KMKKSB · ALLTHETIME",
    apiPath: RATINGLIST_FILE_DOWNLOAD_PATH,
    body: { businessBlock: "KMKKSB", timePeriod: "ALLTHETIME" },
    refererPath: "/rating",
    fileName: "gamification-ratingList_KMKKSB_ALLTHETIME.csv"
  },
  {
    id: "rating_MNS_ACTIVESEASON",
    label: "Рейтинг · MNS · ACTIVESEASON",
    apiPath: RATINGLIST_FILE_DOWNLOAD_PATH,
    body: { businessBlock: "MNS", timePeriod: "ACTIVESEASON" },
    refererPath: "/rating",
    fileName: "gamification-ratingList_MNS_ACTIVESEASON.csv"
  },
  {
    id: "rating_MNS_SEASON_m_2025_2",
    label: "Рейтинг · MNS · SEASON_m_2025_2",
    apiPath: RATINGLIST_FILE_DOWNLOAD_PATH,
    body: { businessBlock: "MNS", timePeriod: "SEASON_m_2025_2" },
    refererPath: "/rating",
    fileName: "gamification-ratingList_MNS_SEASON_m_2025_2.csv"
  },
  {
    id: "rating_MNS_SEASON_m_2025_1",
    label: "Рейтинг · MNS · SEASON_m_2025_1",
    apiPath: RATINGLIST_FILE_DOWNLOAD_PATH,
    body: { businessBlock: "MNS", timePeriod: "SEASON_m_2025_1" },
    refererPath: "/rating",
    fileName: "gamification-ratingList_MNS_SEASON_m_2025_1.csv"
  },
  {
    id: "rating_MNS_SEASON_m_2024",
    label: "Рейтинг · MNS · SEASON_m_2024",
    apiPath: RATINGLIST_FILE_DOWNLOAD_PATH,
    body: { businessBlock: "MNS", timePeriod: "SEASON_m_2024" },
    refererPath: "/rating",
    fileName: "gamification-ratingList_MNS_SEASON_m_2024.csv"
  },
  {
    id: "rating_MNS_ALLTHETIME",
    label: "Рейтинг · MNS · ALLTHETIME",
    apiPath: RATINGLIST_FILE_DOWNLOAD_PATH,
    body: { businessBlock: "MNS", timePeriod: "ALLTHETIME" },
    refererPath: "/rating",
    fileName: "gamification-ratingList_MNS_ALLTHETIME.csv"
  }
];

/**
 * Группа «Заказы»: POST …/orders/file-download, в теле listType (аналог периодов рейтинга).
 * Вместо двух запросов с ACTIVESEASON — два с NONSEASON (KMKKSB и MNS).
 * Сервер часто отдаёт одно имя gamification-orderList.csv — задаём уникальные fileName.
 * Лучше открыть вкладку на …/admin/orders перед запуском.
 */
const ORDERS_GROUP_JOBS = [
  {
    id: "orders_KMKKSB_NONSEASON",
    label: "Заказы · KMKKSB · NONSEASON",
    apiPath: ORDERS_FILE_DOWNLOAD_PATH,
    body: { businessBlock: "KMKKSB", listType: "NONSEASON" },
    refererPath: "/admin/orders",
    fileName: "gamification-orderList_KMKKSB_NONSEASON.csv"
  },
  {
    id: "orders_KMKKSB_SEASON_2025_2",
    label: "Заказы · KMKKSB · SEASON_2025_2",
    apiPath: ORDERS_FILE_DOWNLOAD_PATH,
    body: { businessBlock: "KMKKSB", listType: "SEASON_2025_2" },
    refererPath: "/admin/orders",
    fileName: "gamification-orderList_KMKKSB_SEASON_2025_2.csv"
  },
  {
    id: "orders_KMKKSB_SEASON_2025_1",
    label: "Заказы · KMKKSB · SEASON_2025_1",
    apiPath: ORDERS_FILE_DOWNLOAD_PATH,
    body: { businessBlock: "KMKKSB", listType: "SEASON_2025_1" },
    refererPath: "/admin/orders",
    fileName: "gamification-orderList_KMKKSB_SEASON_2025_1.csv"
  },
  {
    id: "orders_KMKKSB_SEASON_2024",
    label: "Заказы · KMKKSB · SEASON_2024",
    apiPath: ORDERS_FILE_DOWNLOAD_PATH,
    body: { businessBlock: "KMKKSB", listType: "SEASON_2024" },
    refererPath: "/admin/orders",
    fileName: "gamification-orderList_KMKKSB_SEASON_2024.csv"
  },
  {
    id: "orders_KMKKSB_ALLSEASONS",
    label: "Заказы · KMKKSB · ALLSEASONS",
    apiPath: ORDERS_FILE_DOWNLOAD_PATH,
    body: { businessBlock: "KMKKSB", listType: "ALLSEASONS" },
    refererPath: "/admin/orders",
    fileName: "gamification-orderList_KMKKSB_ALLSEASONS.csv"
  },
  {
    id: "orders_MNS_NONSEASON",
    label: "Заказы · MNS · NONSEASON",
    apiPath: ORDERS_FILE_DOWNLOAD_PATH,
    body: { businessBlock: "MNS", listType: "NONSEASON" },
    refererPath: "/admin/orders",
    fileName: "gamification-orderList_MNS_NONSEASON.csv"
  },
  {
    id: "orders_MNS_SEASON_m_2025_2",
    label: "Заказы · MNS · SEASON_m_2025_2",
    apiPath: ORDERS_FILE_DOWNLOAD_PATH,
    body: { businessBlock: "MNS", listType: "SEASON_m_2025_2" },
    refererPath: "/admin/orders",
    fileName: "gamification-orderList_MNS_SEASON_m_2025_2.csv"
  },
  {
    id: "orders_MNS_SEASON_m_2025_1",
    label: "Заказы · MNS · SEASON_m_2025_1",
    apiPath: ORDERS_FILE_DOWNLOAD_PATH,
    body: { businessBlock: "MNS", listType: "SEASON_m_2025_1" },
    refererPath: "/admin/orders",
    fileName: "gamification-orderList_MNS_SEASON_m_2025_1.csv"
  },
  {
    id: "orders_MNS_SEASON_m_2024",
    label: "Заказы · MNS · SEASON_m_2024",
    apiPath: ORDERS_FILE_DOWNLOAD_PATH,
    body: { businessBlock: "MNS", listType: "SEASON_m_2024" },
    refererPath: "/admin/orders",
    fileName: "gamification-orderList_MNS_SEASON_m_2024.csv"
  },
  {
    id: "orders_MNS_ALLSEASONS",
    label: "Заказы · MNS · ALLSEASONS",
    apiPath: ORDERS_FILE_DOWNLOAD_PATH,
    body: { businessBlock: "MNS", listType: "ALLSEASONS" },
    refererPath: "/admin/orders",
    fileName: "gamification-orderList_MNS_ALLSEASONS.csv"
  }
];

/** Все задачи подряд: основные + рейтинг + заказы (для «Скачать всё»). */
function getAllDownloadJobs() {
  return DOWNLOAD_JOBS.concat(RATING_GROUP_JOBS).concat(ORDERS_GROUP_JOBS);
}

/**
 * Определяет название группы для логов (по пути API).
 * @param {object} job
 * @returns {string}
 */
function getGroupNameForJob(job) {
  const p = job.apiPath || "";
  if (p.indexOf("/orders/file-download") !== -1) return "Заказы";
  if (p.indexOf("/ratinglist/file-download") !== -1) return "Рейтинг";
  if (p.indexOf("/employee-rewards/file-download") !== -1) return "Награды (сводка)";
  if (p.indexOf("/administration/statistic/file-download") !== -1) return "Статистика (админ)";
  if (p.indexOf("/tournaments/file-download") !== -1) return "Турниры";
  return "Прочее";
}

// =============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// =============================================================================

function delay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

/**
 * Извлекает имя файла из заголовка Content-Disposition (RFC 5987 / простой вариант).
 * @param {string|null} header
 * @returns {string|null}
 */
function parseFilenameFromContentDisposition(header) {
  if (!header || typeof header !== "string") return null;
  const utf8Match = header.match(/filename\*=UTF-8''([^;\s]+)/i);
  if (utf8Match && utf8Match[1]) {
    try {
      return decodeURIComponent(utf8Match[1].replace(/\+/g, " "));
    } catch (e) {
      return utf8Match[1];
    }
  }
  const quoted = header.match(/filename="([^"]+)"/i);
  if (quoted && quoted[1]) return quoted[1];
  const unquoted = header.match(/filename=([^;\s]+)/i);
  if (unquoted && unquoted[1]) return unquoted[1].replace(/^["']|["']$/g, "");
  return null;
}

/**
 * Проверяет, что Content-Type указывает на JSON.
 * @param {string|null} ct
 * @returns {boolean}
 */
function isJsonContentType(ct) {
  if (!ct || typeof ct !== "string") return false;
  return ct.split(";")[0].trim().toLowerCase() === "application/json";
}

/**
 * Компактная строка тела POST для логов консоли (параметры выгрузки).
 * @param {object} bodyObj
 * @returns {string}
 */
function formatPostBodyForLog(bodyObj) {
  try {
    return JSON.stringify(bodyObj !== undefined && bodyObj !== null ? bodyObj : {});
  } catch (e) {
    return String(bodyObj);
  }
}

/**
 * Выполняет один POST и инициирует скачивание полученного файла.
 * @param {object} job — элемент из списка задач.
 * @param {object} [ctx] — контекст для логов: groupName, batchName, index (0-based), total.
 * @returns {Promise<{ ok: boolean, status?: number, fileName?: string, error?: string }>}
 */
async function downloadOneJob(job, ctx) {
  ctx = ctx || {};
  const standKey = FILE_DL_ACTIVE_STAND === "ALPHA" || FILE_DL_ACTIVE_STAND === "SIGMA" ? FILE_DL_ACTIVE_STAND : "SIGMA";
  const origin = STAND_ORIGINS[standKey] || STAND_ORIGINS.SIGMA;
  const path = job.apiPath || DEFAULT_FILE_DOWNLOAD_PATH;
  const url = origin + path;
  // Origin и Referer в fetch из JS задавать нельзя (запрещённые заголовки) — браузер подставит сам с текущей вкладки.
  // Для совпадения с типичным запросом откройте вкладку на странице вида … + job.refererPath.

  const headers = {
    Accept: "*/*",
    "Content-Type": "application/json"
  };

  const bodyObj = job.body !== undefined && job.body !== null ? job.body : {};

  const groupName = ctx.groupName != null ? ctx.groupName : getGroupNameForJob(job);
  const batchName = ctx.batchName != null ? ctx.batchName : "одиночный запрос (кнопка)";
  const idx = ctx.index;
  const total = ctx.total;
  const posStr =
    idx != null && total != null ? "Файл в пакете: " + (idx + 1) + " из " + total : null;

  console.log(
    "СТАРТ загрузки\n" +
      "Группа: " +
      groupName +
      "\nПакет / режим: " +
      batchName +
      (posStr ? "\n" + posStr : "") +
      "\nЗадача id: " +
      (job.id || "—")
  );

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: headers,
      body: JSON.stringify(bodyObj)
    });
  } catch (e) {
    // id задачи уже в предыдущем логе «СТАРТ загрузки» — не дублируем.
    console.error("ОШИБКА (сеть / исключение)\n" + String(e));
    return { ok: false, error: String(e) };
  }

  if (!res.ok) {
    console.warn(
      "ОШИБКА HTTP\nСтатус: " + res.status + " " + (res.statusText || "")
    );
    return { ok: false, status: res.status };
  }

  // Сервер может вернуть HTTP 200 и JSON с success:false (таймаут и т.д.) — не сохранять как файл.
  const contentType = res.headers.get("Content-Type") || "";
  if (isJsonContentType(contentType)) {
    const textBody = await res.text();
    let data;
    try {
      data = JSON.parse(textBody);
    } catch (parseErr) {
      console.warn(
        "ОШИБКА: ответ помечен как JSON, разбор не удался\n" + String(parseErr)
      );
      return { ok: false, error: "invalid_json_body" };
    }
    if (data && data.success === false && data.error) {
      const err = data.error;
      console.warn(
        "ОШИБКА API (HTTP 200, JSON)\nСтенд: " +
          standKey +
          "\nЗадача id: " +
          (job.id || "—") +
          "\nPOST body: " +
          formatPostBodyForLog(bodyObj) +
          "\ncode: " +
          (err.code || "—") +
          "\nsystem: " +
          (err.system || "—") +
          "\ntext: " +
          (err.text || "—") +
          (err.uuid ? "\nuuid: " + err.uuid : "")
      );
      return { ok: false, apiError: err };
    }
    if (data && data.success === true) {
      console.warn(
        "Ответ JSON с success:true — не файл выгрузки, скачивание отменено"
      );
      return { ok: false, error: "unexpected_json_success" };
    }
    console.warn(
      "Ответ application/json непохож на файл выгрузки — скачивание отменено"
    );
    return { ok: false, error: "unexpected_json_shape" };
  }

  const blob = await res.blob();
  const sizeBytes = blob.size;
  const cd = res.headers.get("Content-Disposition");
  const fromHeader = parseFilenameFromContentDisposition(cd);
  const safeLabel = (job.label || job.id || "download").replace(/[/\\?%*:|"<>]/g, "_");
  const fileName =
    (job.fileName && String(job.fileName).trim()) ||
    fromHeader ||
    safeLabel + ".bin";

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () {
    URL.revokeObjectURL(objectUrl);
  }, 0);

  // При параллельном (скользящем) старте в консоли несколько потоков — дублируем id и payload.
  console.log(
    "ЗАВЕРШЕНО: файл скачан\n" +
      "Стенд: " +
      standKey +
      "\nЗадача id: " +
      (job.id || "—") +
      "\nPOST body: " +
      formatPostBodyForLog(bodyObj) +
      "\nПуть API: " +
      path +
      "\nИмя файла: " +
      fileName +
      "\nРазмер ответа: " +
      sizeBytes +
      " байт"
  );

  return { ok: true, fileName: fileName };
}

/**
 * Последовательно скачивает задачи из массива с паузой DOWNLOAD_ALL_DELAY_MS.
 * @param {object[]} jobs
 * @param {string} logLabel — подпись для консоли (название пакета).
 */
async function downloadJobsSequentially(jobs, logLabel) {
  const total = jobs.length;
  console.log(
    "ПАКЕТ: " +
      logLabel +
      "\nСТАРТ последовательной загрузки\nВсего файлов в пакете: " +
      total +
      "\nПауза между запросами: " +
      DOWNLOAD_ALL_DELAY_MS +
      " мс"
  );

  let okCount = 0;
  let errCount = 0;

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const groupName = getGroupNameForJob(job);
    const result = await downloadOneJob(job, {
      groupName: groupName,
      batchName: logLabel,
      index: i,
      total: total
    });
    if (result.ok) okCount++;
    else errCount++;

    if (i < jobs.length - 1 && DOWNLOAD_ALL_DELAY_MS > 0) {
      console.log(
        "Пауза " + DOWNLOAD_ALL_DELAY_MS + " мс перед файлом " + (i + 2) + "/" + total
      );
      await delay(DOWNLOAD_ALL_DELAY_MS);
    }
  }

  console.log(
    "ПАКЕТ: " +
      logLabel +
      "\nФИНИШ: обработано задач: " +
      total +
      "\nУспешно (файл инициирован): " +
      okCount +
      "\nС ошибкой: " +
      errCount
  );
}

/**
 * Пакет с перекрывающимися запросами: каждый следующий старт не раньше чем через DOWNLOAD_STAGGER_MS;
 * если предыдущий завершился успешно — можно стартовать через DOWNLOAD_ALL_DELAY_MS после его конца.
 * @param {object[]} jobs
 * @param {string} logLabel
 */
async function downloadJobsStaggered(jobs, logLabel) {
  const total = jobs.length;
  console.log(
    "ПАКЕТ: " +
      logLabel +
      "\nСТАРТ (скользящий старт запросов)\nВсего задач: " +
      total +
      "\nМежду стартами min: " +
      DOWNLOAD_STAGGER_MS +
      " мс | после успеха предыдущего: " +
      DOWNLOAD_ALL_DELAY_MS +
      " мс"
  );

  const promises = [];
  for (let i = 0; i < total; i++) {
    const job = jobs[i];
    const groupName = getGroupNameForJob(job);
    const p = downloadOneJob(job, {
      groupName: groupName,
      batchName: logLabel,
      index: i,
      total: total
    });
    promises.push(p);
    if (i < total - 1) {
      await Promise.race([
        delay(DOWNLOAD_STAGGER_MS),
        p.then(function (result) {
          if (result && result.ok) return delay(DOWNLOAD_ALL_DELAY_MS);
          return new Promise(function () {});
        })
      ]);
    }
  }

  const results = await Promise.all(promises);
  let okCount = 0;
  let errCount = 0;
  results.forEach(function (r) {
    if (r.ok) okCount++;
    else errCount++;
  });

  console.log(
    "ПАКЕТ: " +
      logLabel +
      "\nФИНИШ: обработано задач: " +
      total +
      "\nУспешно (файл инициирован): " +
      okCount +
      "\nС ошибкой: " +
      errCount
  );
}

/**
 * Запуск пакета: последовательно или скользящий старт.
 * @param {object[]} jobs
 * @param {string} logLabel
 * @param {boolean} useStagger
 */
async function downloadJobsBatch(jobs, logLabel, useStagger) {
  if (useStagger) await downloadJobsStaggered(jobs, logLabel);
  else await downloadJobsSequentially(jobs, logLabel);
}

/** Основные выгрузки + рейтинг + заказы. */
async function downloadAllJobs() {
  await downloadJobsSequentially(getAllDownloadJobs(), "«Скачать всё»");
}

/** Только группа «Рейтинг» (10 файлов). */
async function downloadRatingGroupOnly() {
  await downloadJobsBatch(RATING_GROUP_JOBS, "«Загрузить Рейтинг»", FILE_DL_USE_STAGGER);
}

/** Только группа «Заказы» (10 файлов). */
async function downloadOrdersGroupOnly() {
  await downloadJobsBatch(ORDERS_GROUP_JOBS, "«Загрузить Заказы»", FILE_DL_USE_STAGGER);
}

/**
 * Скачивание только тех задач, у которых на панели отмечен чекбокс.
 * @param {{ cb: HTMLInputElement, job: object }[]} entries — пары чекбокс + задача с панели.
 */
async function downloadCheckedPanelJobs(entries) {
  const jobs = entries
    .filter(function (x) {
      return x.cb.checked;
    })
    .map(function (x) {
      return x.job;
    });
  if (jobs.length === 0) {
    console.warn(
      "Скачать выделенное: нет отмеченных задач. Отметьте чекбоксы или нажмите «Отметить всё»."
    );
    return;
  }
  await downloadJobsBatch(jobs, "«Скачать выделенное»", FILE_DL_USE_STAGGER);
}

/**
 * Панель: кнопка на каждую задачу + чекбокс для пакета «Скачать выделенное».
 * Рейтинг и Заказы — в одном ряду (слева / справа), компактные отступы.
 */
function startDownloadPanel() {
  // Пары чекбокс ↔ задача (порядок = порядок обхода при «Скачать выделенное»).
  const panelCheckboxJobs = [];

  // Компактные кнопки в колонках (длинные подписи переносятся); в строке с чекбоксом — flex:1.
  const panelBtnGroupRow =
    "flex:1;min-width:0;display:block;margin:0;padding:3px 6px;font-size:10px;line-height:1.2;cursor:pointer;color:#fff;border:none;border-radius:4px;box-sizing:border-box;text-align:left;white-space:normal;word-break:break-word;";

  /**
   * Строка: чекбокс + кнопка скачивания одной задачи (учёт в «Скачать выделенное»).
   * @param {HTMLElement} parent
   * @param {object} job
   * @param {string} buttonCss — стили кнопки (в т.ч. background).
   * @param {function(): void} onButtonClick
   */
  function appendRowWithCheckbox(parent, job, buttonCss, onButtonClick) {
    const row = document.createElement("div");
    row.style.cssText =
      "display:flex;flex-direction:row;align-items:flex-start;gap:5px;margin:2px 0;width:100%;box-sizing:border-box;";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = false;
    cb.title = "Участвует в «Скачать выделенное»";
    cb.style.cssText =
      "margin:5px 0 0 0;flex-shrink:0;width:14px;height:14px;cursor:pointer;accent-color:#444;";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = job.label || job.id || "Скачать";
    btn.style.cssText = buttonCss;
    btn.addEventListener("click", onButtonClick);
    row.appendChild(cb);
    row.appendChild(btn);
    parent.appendChild(row);
    panelCheckboxJobs.push({ cb: cb, job: job });
  }

  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;top:8px;right:8px;background:#fff;border:1px solid #ccc;padding:10px 10px 8px;z-index:999999;box-shadow:0 2px 10px rgba(0,0,0,.18);min-width:min(520px,calc(100vw - 16px));max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow-y:auto;box-sizing:border-box;font-family:sans-serif;font-size:11px;";

  const title = document.createElement("div");
  title.style.cssText = "font-size:12px;font-weight:bold;margin:0 0 6px;color:#333;line-height:1.2;";
  function syncFileDlTitle() {
    title.textContent = "Скачивание (gamification) · " + FILE_DL_ACTIVE_STAND;
  }
  syncFileDlTitle();
  container.appendChild(title);

  // Выбор стенда: базовый хост для POST (ALPHA / SIGMA).
  const rowStand = document.createElement("div");
  rowStand.style.cssText =
    "display:flex;align-items:center;gap:8px;margin:0 0 8px;font-size:11px;flex-wrap:wrap;";
  const labStand = document.createElement("label");
  labStand.style.cssText = "color:#333;font-weight:bold;";
  labStand.textContent = "Стенд:";
  labStand.setAttribute("for", "fileDlStandSelect");
  const selStand = document.createElement("select");
  selStand.id = "fileDlStandSelect";
  // Явные цвета и color-scheme: иначе на тёмной странице текст select может быть белым на белом фоне панели.
  selStand.style.cssText =
    "padding:4px 8px;font-size:11px;min-width:160px;cursor:pointer;" +
    "color:#111827;background-color:#ffffff;border:1px solid #64748b;border-radius:4px;" +
    "color-scheme:light;";
  ["ALPHA", "SIGMA"].forEach(function (key) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = key + " — " + STAND_ORIGINS[key];
    opt.style.cssText = "color:#111827;background-color:#ffffff;";
    if (key === FILE_DL_ACTIVE_STAND) opt.selected = true;
    selStand.appendChild(opt);
  });
  selStand.addEventListener("change", function () {
    FILE_DL_ACTIVE_STAND = selStand.value;
    syncFileDlTitle();
  });
  rowStand.appendChild(labStand);
  rowStand.appendChild(selStand);
  container.appendChild(rowStand);

  const sub = document.createElement("div");
  sub.style.cssText = "font-size:10px;color:#666;margin:0 0 8px;line-height:1.35;word-break:break-word;";
  sub.textContent =
    "Осн.: " +
    DOWNLOAD_JOBS.length +
    " · Рейт.: " +
    RATING_GROUP_JOBS.length +
    " · Зак.: " +
    ORDERS_GROUP_JOBS.length +
    " · Всего задач с чекбоксом: " +
    getAllDownloadJobs().length +
    " · dateFrom наград: " +
    EMPLOYEE_REWARDS_DATE_FROM;
  container.appendChild(sub);

  // Режим пакета: скользящий старт запросов (см. DOWNLOAD_STAGGER_MS / DOWNLOAD_ALL_DELAY_MS).
  const rowStagger = document.createElement("div");
  rowStagger.style.cssText =
    "display:flex;align-items:center;gap:6px;margin:0 0 8px;font-size:10px;color:#444;";
  const staggerCb = document.createElement("input");
  staggerCb.type = "checkbox";
  staggerCb.id = "fileDlStaggerCb";
  staggerCb.addEventListener("change", function () {
    FILE_DL_USE_STAGGER = staggerCb.checked;
  });
  const staggerLab = document.createElement("label");
  staggerLab.htmlFor = "fileDlStaggerCb";
  staggerLab.style.cssText = "cursor:pointer;line-height:1.3;";
  staggerLab.textContent =
    "Пакеты: скользящий старт (след. запрос через " +
    DOWNLOAD_STAGGER_MS / 1000 +
    " с или раньше после успеха +" +
    DOWNLOAD_ALL_DELAY_MS +
    " мс)";
  rowStagger.appendChild(staggerCb);
  rowStagger.appendChild(staggerLab);
  container.appendChild(rowStagger);

  const secMain = document.createElement("div");
  secMain.style.cssText = "margin-bottom:8px;";
  const labMain = document.createElement("div");
  labMain.style.cssText = "font-size:11px;font-weight:bold;color:#444;margin:0 0 4px;";
  labMain.textContent = "Основные выгрузки";
  secMain.appendChild(labMain);

  const mainBtnCss =
    "flex:1;min-width:0;display:block;margin:0;padding:5px 10px;font-size:11px;line-height:1.2;cursor:pointer;background:#0066cc;color:#fff;border:none;border-radius:4px;box-sizing:border-box;text-align:left;";
  DOWNLOAD_JOBS.forEach(function (job) {
    appendRowWithCheckbox(secMain, job, mainBtnCss, function () {
      downloadOneJob(job, {
        groupName: getGroupNameForJob(job),
        batchName: "ручной клик (одна задача) | секция «Основные выгрузки»"
      });
    });
  });
  container.appendChild(secMain);

  // Две колонки: слева «Рейтинг», справа «Заказы».
  const rowRatingOrders = document.createElement("div");
  rowRatingOrders.style.cssText =
    "display:flex;flex-direction:row;gap:8px;align-items:flex-start;margin:0 0 8px;width:100%;box-sizing:border-box;";

  const secRating = document.createElement("div");
  secRating.style.cssText =
    "flex:1;min-width:0;box-sizing:border-box;margin:0;padding:8px;background:#f0f4ff;border:1px solid #c5d0f0;border-radius:6px;";
  const labRating = document.createElement("div");
  labRating.style.cssText = "font-size:11px;font-weight:bold;color:#2c3e80;margin:0 0 5px;line-height:1.2;";
  labRating.textContent = "Рейтинг (" + RATING_GROUP_JOBS.length + ")";
  secRating.appendChild(labRating);

  RATING_GROUP_JOBS.forEach(function (job) {
    appendRowWithCheckbox(secRating, job, panelBtnGroupRow + "background:#415a9e;", function () {
      downloadOneJob(job, {
        groupName: "Рейтинг",
        batchName: "ручной клик (одна задача) | секция «Рейтинг»"
      });
    });
  });

  const btnRatingAll = document.createElement("button");
  btnRatingAll.type = "button";
  btnRatingAll.textContent = "Все " + RATING_GROUP_JOBS.length + " (рейтинг)";
  btnRatingAll.style.cssText =
    "display:block;margin:6px 0 0;padding:5px 8px;font-size:10px;line-height:1.2;cursor:pointer;background:#6f42c1;color:#fff;border:none;border-radius:4px;width:100%;box-sizing:border-box;font-weight:bold;";
  btnRatingAll.addEventListener("click", function () {
    downloadRatingGroupOnly();
  });
  secRating.appendChild(btnRatingAll);
  rowRatingOrders.appendChild(secRating);

  const secOrders = document.createElement("div");
  secOrders.style.cssText =
    "flex:1;min-width:0;box-sizing:border-box;margin:0;padding:8px;background:#f0faf4;border:1px solid #b8dfc8;border-radius:6px;";
  const labOrders = document.createElement("div");
  labOrders.style.cssText = "font-size:11px;font-weight:bold;color:#1e5c3a;margin:0 0 5px;line-height:1.2;";
  labOrders.textContent = "Заказы (" + ORDERS_GROUP_JOBS.length + ")";
  secOrders.appendChild(labOrders);

  ORDERS_GROUP_JOBS.forEach(function (job) {
    appendRowWithCheckbox(secOrders, job, panelBtnGroupRow + "background:#2d8659;", function () {
      downloadOneJob(job, {
        groupName: "Заказы",
        batchName: "ручной клик (одна задача) | секция «Заказы»"
      });
    });
  });

  const btnOrdersAll = document.createElement("button");
  btnOrdersAll.type = "button";
  btnOrdersAll.textContent = "Все " + ORDERS_GROUP_JOBS.length + " (заказы)";
  btnOrdersAll.style.cssText =
    "display:block;margin:6px 0 0;padding:5px 8px;font-size:10px;line-height:1.2;cursor:pointer;background:#1a6840;color:#fff;border:none;border-radius:4px;width:100%;box-sizing:border-box;font-weight:bold;";
  btnOrdersAll.addEventListener("click", function () {
    downloadOrdersGroupOnly();
  });
  secOrders.appendChild(btnOrdersAll);
  rowRatingOrders.appendChild(secOrders);

  container.appendChild(rowRatingOrders);

  // Мелкие кнопки: отметить / снять все чекбоксы на панели.
  const rowMark = document.createElement("div");
  rowMark.style.cssText =
    "display:flex;flex-direction:row;flex-wrap:wrap;gap:6px;align-items:center;margin:0 0 6px;";
  const btnMarkAll = document.createElement("button");
  btnMarkAll.type = "button";
  btnMarkAll.textContent = "Отметить всё";
  btnMarkAll.style.cssText =
    "padding:3px 8px;font-size:10px;line-height:1.2;cursor:pointer;background:#e8e8e8;color:#222;border:1px solid #bbb;border-radius:4px;box-sizing:border-box;";
  btnMarkAll.addEventListener("click", function () {
    panelCheckboxJobs.forEach(function (x) {
      x.cb.checked = true;
    });
  });
  rowMark.appendChild(btnMarkAll);
  const btnClearAll = document.createElement("button");
  btnClearAll.type = "button";
  btnClearAll.textContent = "Снять отметки";
  btnClearAll.style.cssText =
    "padding:3px 8px;font-size:10px;line-height:1.2;cursor:pointer;background:#f5f5f5;color:#333;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;";
  btnClearAll.addEventListener("click", function () {
    panelCheckboxJobs.forEach(function (x) {
      x.cb.checked = false;
    });
  });
  rowMark.appendChild(btnClearAll);
  container.appendChild(rowMark);

  const btnSelected = document.createElement("button");
  btnSelected.type = "button";
  btnSelected.textContent = "Скачать выделенное (по чекбоксам)";
  btnSelected.style.cssText =
    "display:block;margin:0 0 6px;padding:6px 10px;font-size:11px;line-height:1.2;cursor:pointer;background:#28a745;color:#fff;border:none;border-radius:4px;width:100%;box-sizing:border-box;font-weight:bold;";
  btnSelected.addEventListener("click", function () {
    downloadCheckedPanelJobs(panelCheckboxJobs);
  });
  container.appendChild(btnSelected);

  const btnClose = document.createElement("button");
  btnClose.type = "button";
  btnClose.textContent = "Закрыть";
  btnClose.style.cssText =
    "display:block;margin:0;padding:5px 10px;font-size:11px;cursor:pointer;background:#f0f0f0;color:#333;border:1px solid #ccc;border-radius:4px;width:100%;box-sizing:border-box;";
  btnClose.addEventListener("click", function () {
    container.remove();
  });
  container.appendChild(btnClose);

  document.body.appendChild(container);
}

// При вставке скрипта в консоль на странице стенда показывается панель.
startDownloadPanel();
