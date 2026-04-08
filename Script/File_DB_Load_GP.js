// =============================================================================
// File_DB_Load_GP.js — скачивание файлов через API gamification (консоль DevTools)
// =============================================================================
// POST к эндпоинтам .../file-download — ответ: бинарный файл (скачивание в браузере).
// Куки берутся из текущей сессии (credentials: "include"), на странице нужного стенда.
// Панель: основные выгрузки, группы «Рейтинг» и «Заказы», «Скачать всё» с паузой между запросами.
// Табельные номера не используются.
// =============================================================================

// =============================================================================
// КОНФИГУРАЦИЯ
// =============================================================================

// Стенд: ALPHA (omega) или SIGMA (salesheroes) — меняются базовый origin и referer.
const STAND = "SIGMA";

// Базовые URL для каждого стенда (без завершающего слэша).
const STAND_ORIGINS = {
  ALPHA: "https://efs-our-business-prom.omega.sbrf.ru",
  SIGMA: "https://salesheroes.sberbank.ru"
};

// Путь по умолчанию, если у задачи не указан apiPath.
const DEFAULT_FILE_DOWNLOAD_PATH = "/bo/rmkib.gamification/proxy/v1/tournaments/file-download";

// Дата «с которой» грузить сводку наград (payload dateFrom для employee-rewards/file-download).
const EMPLOYEE_REWARDS_DATE_FROM = "2026-01-01";

// Пауза между запросами при пакетной загрузке («Скачать всё», группы «Рейтинг» / «Заказы»), мс.
const DOWNLOAD_ALL_DELAY_MS = 800;

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
    id: "orders_KMKKSB_ALLTHETIME",
    label: "Заказы · KMKKSB · ALLTHETIME",
    apiPath: ORDERS_FILE_DOWNLOAD_PATH,
    body: { businessBlock: "KMKKSB", listType: "ALLTHETIME" },
    refererPath: "/admin/orders",
    fileName: "gamification-orderList_KMKKSB_ALLTHETIME.csv"
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
    id: "orders_MNS_ALLTHETIME",
    label: "Заказы · MNS · ALLTHETIME",
    apiPath: ORDERS_FILE_DOWNLOAD_PATH,
    body: { businessBlock: "MNS", listType: "ALLTHETIME" },
    refererPath: "/admin/orders",
    fileName: "gamification-orderList_MNS_ALLTHETIME.csv"
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
 * Выполняет один POST и инициирует скачивание полученного файла.
 * @param {object} job — элемент из списка задач.
 * @param {object} [ctx] — контекст для логов: groupName, batchName, index (0-based), total.
 * @returns {Promise<{ ok: boolean, status?: number, fileName?: string, error?: string }>}
 */
async function downloadOneJob(job, ctx) {
  ctx = ctx || {};
  const origin = STAND_ORIGINS[STAND] || STAND_ORIGINS.SIGMA;
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

  // Группа, пакет, позиция в пакете и id уже выведены в «СТАРТ загрузки» — только результат.
  console.log("ЗАВЕРШЕНО: файл скачан\nРазмер ответа: " + sizeBytes + " байт");

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

/** Основные выгрузки + рейтинг + заказы. */
async function downloadAllJobs() {
  await downloadJobsSequentially(getAllDownloadJobs(), "«Скачать всё»");
}

/** Только группа «Рейтинг» (10 файлов). */
async function downloadRatingGroupOnly() {
  await downloadJobsSequentially(RATING_GROUP_JOBS, "«Загрузить Рейтинг»");
}

/** Только группа «Заказы» (10 файлов). */
async function downloadOrdersGroupOnly() {
  await downloadJobsSequentially(ORDERS_GROUP_JOBS, "«Загрузить Заказы»");
}

/**
 * Панель: по кнопке на каждую задачу + «Скачать всё».
 * Рейтинг и Заказы — в одном ряду (слева / справа), уменьшенные отступы без лишней прокрутки.
 */
function startDownloadPanel() {
  // Компактные кнопки в колонках (длинные подписи переносятся).
  const panelBtnGroupRow =
    "display:block;margin:2px 0;padding:3px 6px;font-size:10px;line-height:1.2;cursor:pointer;color:#fff;border:none;border-radius:4px;width:100%;box-sizing:border-box;text-align:left;white-space:normal;word-break:break-word;";

  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;top:8px;right:8px;background:#fff;border:1px solid #ccc;padding:10px 10px 8px;z-index:999999;box-shadow:0 2px 10px rgba(0,0,0,.18);min-width:min(520px,calc(100vw - 16px));max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow-y:auto;box-sizing:border-box;font-family:sans-serif;font-size:11px;";

  const title = document.createElement("div");
  title.style.cssText = "font-size:12px;font-weight:bold;margin:0 0 6px;color:#333;line-height:1.2;";
  title.textContent = "Скачивание (gamification) · " + STAND;
  container.appendChild(title);

  const sub = document.createElement("div");
  sub.style.cssText = "font-size:10px;color:#666;margin:0 0 8px;line-height:1.35;word-break:break-word;";
  sub.textContent =
    "Осн.: " +
    DOWNLOAD_JOBS.length +
    " · Рейт.: " +
    RATING_GROUP_JOBS.length +
    " · Зак.: " +
    ORDERS_GROUP_JOBS.length +
    " · Всего «всё»: " +
    getAllDownloadJobs().length +
    " · dateFrom наград: " +
    EMPLOYEE_REWARDS_DATE_FROM;
  container.appendChild(sub);

  const secMain = document.createElement("div");
  secMain.style.cssText = "margin-bottom:8px;";
  const labMain = document.createElement("div");
  labMain.style.cssText = "font-size:11px;font-weight:bold;color:#444;margin:0 0 4px;";
  labMain.textContent = "Основные выгрузки";
  secMain.appendChild(labMain);

  DOWNLOAD_JOBS.forEach(function (job) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = job.label || job.id || "Скачать";
    btn.style.cssText =
      "display:block;margin:3px 0;padding:5px 10px;font-size:11px;line-height:1.2;cursor:pointer;background:#0066cc;color:#fff;border:none;border-radius:4px;width:100%;box-sizing:border-box;";
    btn.addEventListener("click", function () {
      downloadOneJob(job, {
        groupName: getGroupNameForJob(job),
        batchName: "ручной клик (одна задача) | секция «Основные выгрузки»"
      });
    });
    secMain.appendChild(btn);
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
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = job.label || job.id || "Скачать";
    btn.style.cssText = panelBtnGroupRow + "background:#415a9e;";
    btn.addEventListener("click", function () {
      downloadOneJob(job, {
        groupName: "Рейтинг",
        batchName: "ручной клик (одна задача) | секция «Рейтинг»"
      });
    });
    secRating.appendChild(btn);
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
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = job.label || job.id || "Скачать";
    btn.style.cssText = panelBtnGroupRow + "background:#2d8659;";
    btn.addEventListener("click", function () {
      downloadOneJob(job, {
        groupName: "Заказы",
        batchName: "ручной клик (одна задача) | секция «Заказы»"
      });
    });
    secOrders.appendChild(btn);
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

  const btnAll = document.createElement("button");
  btnAll.type = "button";
  btnAll.textContent = "Скачать всё (осн. + рейт. + зак.)";
  btnAll.style.cssText =
    "display:block;margin:0 0 4px;padding:6px 10px;font-size:11px;line-height:1.2;cursor:pointer;background:#28a745;color:#fff;border:none;border-radius:4px;width:100%;box-sizing:border-box;font-weight:bold;";
  btnAll.addEventListener("click", function () {
    downloadAllJobs();
  });
  container.appendChild(btnAll);

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
