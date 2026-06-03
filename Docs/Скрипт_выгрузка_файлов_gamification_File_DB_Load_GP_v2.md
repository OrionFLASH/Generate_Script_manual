# Скрипт выгрузки файлов gamification v2 (`File_DB_Load_GP_v2.js`)

## 1. Назначение и задача

**Задача:** в браузере, в контексте уже открытой сессии на стенде, по отмеченным на панели чекбоксам запросить у backend выгрузки (CSV и др.) через POST-эндпоинты вида `.../file-download`, получить бинарный ответ и инициировать скачивание файла на диск пользователя.

**Отличия от v1** (`File_DB_Load_GP.js`):

| Аспект | v1 | v2 |
|--------|----|----|
| Запуск скачивания | Кнопки у каждой задачи + «Все N (рейтинг/заказы)» + «Скачать выделенное» | **Только** «Скачать выделенное» |
| Основные выгрузки | 3 задачи | 4 задачи (+ **«Итоги года»**) |
| Рейтинг | 2 businessBlock (KMKKSB, MNS) | 10 businessBlock, конфиг `FILE_DL_RATING_BLOCKS_CONFIG` |
| Заказы | Жёсткий массив | Конфиг `FILE_DL_ORDERS_BLOCKS_CONFIG` |
| UI рейтинга | Две колонки «Рейтинг» / «Заказы» | Отдельная секция «Рейтинг» в **2 строки** блоков |
| id панели | `fileDlGamificationPanelRoot` | `fileDlGamificationPanelRootV2` |
| Кнопки отметок | «Отметить всё» / «Снять» | + **«По умолчанию»** (↺) |

**Технические ограничения** — те же, что у v1: DevTools, `credentials: "include"`, Referer/Origin из браузера, IIFE, без табельных номеров в коде.

**Связанные документы:**

- v1 (базовая логика POST, журнал, паузы): [Скрипт_выгрузка_файлов_gamification_File_DB_Load_GP.md](Скрипт_выгрузка_файлов_gamification_File_DB_Load_GP.md)
- ТЗ и декомпозиция: [ToDo/ToDo_File_DB_панель_выбор_скачивания.md](../ToDo/ToDo_File_DB_панель_выбор_скачивания.md)
- ROADMAP репозитория: [ROADMAP.md](../ROADMAP.md) § 2A
- HTTP-справочник: [Справочник_скрипты_HTTP_запросы_и_последовательность.md](Справочник_скрипты_HTTP_запросы_и_последовательность.md) § 2A

## 2. Расположение и запуск

- Файл: `Script/File_DB_Load_GP_v2.js`.
- **Запуск:** скопировать **полное** содержимое файла → DevTools → Console → Enter на странице нужного стенда.
- Панель: заголовок **«Скачивание v2 · STAND/CONTOUR»**, корневой элемент `id=fileDlGamificationPanelRootV2`.
- Повторная вставка скрипта без перезагрузки вкладки поддерживается (IIFE); старая панель v2 удаляется перед открытием новой.
- v1 и v2 могут сосуществовать: у панелей разные `id`.

## 3. Выбор окружения (стенд и контур)

Идентично v1:

| Константа | Смысл |
|-----------|--------|
| `STAND_ORIGINS` | Таблица `STAND → CONTOUR → origin` |
| `STAND_KEYS` | `PROM`, `PSI`, `IFT-SB`, `IFT-GF` |
| `CONTOUR_KEYS` | `ALPHA`, `SIGMA` |
| `detectFileDlEnvFromLocation()` | Автоопределение по `window.location.origin` |
| `FILE_DL_ACTIVE_STAND`, `FILE_DL_ACTIVE_CONTOUR` | Текущий выбор с панели |
| Индикатор справа в строке стенда | `POST <origin>` |

## 4. Общая схема работы

1. Пользователь отмечает чекбоксы (основные, рейтинг, заказы) и нажимает **«Скачать выделенное»**.
2. Для каждой отмеченной задачи: URL = `origin + job.apiPath`, тело POST = JSON из `job.body` (для наград подставляется `dateFrom` с панели).
3. HTTP 200 + JSON с `success: false` → файл **не** сохраняется, детали в **«Журнал работы»**.
4. Иначе — `Blob`, имя из `Content-Disposition` / `job.fileName` / fallback.
5. Пакет — последовательно или с перекрытием (чекбокс «Перекрывать запросы…»), паузы с панели.

## 5. Константы конфигурации

### 5.1. Общие (наследуются от v1)

| Имя | Назначение | Значение по умолчанию |
|-----|------------|------------------------|
| `DOWNLOAD_ALL_DELAY_MS` | Пауза между файлами пакета | 100 мс |
| `DOWNLOAD_STAGGER_MS` | Мин. интервал между стартами POST при перекрытии | 300 мс |
| `FILE_DL_USE_STAGGER` | Скользящий старт включён | `true` |
| `DEFAULT_EMPLOYEE_REWARDS_DATE_FROM` | Дата наград | `2023-01-01` |
| `RATINGLIST_FILE_DOWNLOAD_PATH` | Рейтинг | `…/ratinglist/file-download` |
| `ORDERS_FILE_DOWNLOAD_PATH` | Заказы | `…/orders/file-download` |
| `YEAR_RESULT_FILE_DOWNLOAD_PATH` | Итоги года | `…/year-result/file-download` |

### 5.2. Конфиги v2 (редактируются в JS)

| Константа | Назначение |
|-----------|------------|
| `FILE_DL_RATING_BLOCKS_CONFIG` | Массив `{ block, timePeriods[], defaultChecked? }` — генерация задач рейтинга |
| `FILE_DL_RATING_UI_ROWS` | Раскладка блоков на панели (2 строки) |
| `FILE_DL_ORDERS_BLOCKS_CONFIG` | Массив `{ block, listTypes[], defaultChecked? }` |
| `FILE_DL_MAIN_DEFAULT_UNCHECKED_JOB_IDS` | id основных, снятых по умолчанию |
| `FILE_DL_RATING_DEFAULT_UNCHECKED_JOB_IDS` | id рейтинга, снятых поверх `defaultChecked` блока |
| `FILE_DL_ORDERS_DEFAULT_UNCHECKED_JOB_IDS` | id заказов, снятых поверх блока |

Функции генерации:

- `buildRatingGroupJobsFromConfig(config)` → `RATING_GROUP_JOBS`
- `buildOrdersGroupJobsFromConfig(config)` → `ORDERS_GROUP_JOBS`
- `isFileDlJobCheckedByDefault(job)` — единая логика дефолтов чекбоксов

### 5.3. Раскладка рейтинга на панели

```javascript
const FILE_DL_RATING_UI_ROWS = [
  ["KMKKSB", "AKMKKSB", "CSM", "MNS"],
  ["SERVICEMEN", "KMFACTORING", "KMSB1", "IMUB", "RNUB", "RSB1"],
];
```

Высота каждой строки: `calcRatingRowMinHeightPx(blockNames)` — по блоку с максимальным числом сезонов в ряду; сезоны в **1 колонку** (`columns: 1`), блоки растягиваются (`fillRowHeight: true`).

## 6. Наборы задач

### 6.1. `DOWNLOAD_JOBS` — основные (4 чекбокса)

| id | label | apiPath | body | refererPath |
|----|-------|---------|------|-------------|
| `tournamentListCsv` | Список турниров (CSV) | tournaments/file-download | `{}` | `/tournaments/list` |
| `employeeRewardsSummary` | Награды: (LIST REWARD) | employee-rewards/file-download | `{ dateFrom }` с панели | `/awards/list` |
| `administrationStatisticCsv` | Посещения | administration/statistic/file-download | `{}` | `/admin/statistic` |
| `yearResultsCsv` | Итоги года | year-result/file-download | `{}` | `/salesheroes/profile` |

Fallback имени: `gamification-yearResults.csv` для итогов года.

**Дефолт:** все четыре отмечены (`FILE_DL_MAIN_DEFAULT_UNCHECKED_JOB_IDS = []`).

### 6.2. `RATING_GROUP_JOBS` — рейтинг (20 задач при текущем конфиге)

Endpoint: `ratinglist/file-download`, тело `{ businessBlock, timePeriod }`.

| businessBlock | timePeriod | defaultChecked блока |
|---------------|------------|----------------------|
| KMKKSB | ACTIVESEASON, SEASON_2025_2, SEASON_2025_1, SEASON_2024, ALLTHETIME | да |
| MNS | ACTIVESEASON, SEASON_m_2025_2, SEASON_m_2025_1, SEASON_m_2024, ALLTHETIME | нет |
| CSM | ALLTHETIME, ACTIVESEASON | да |
| AKMKKSB | ALLTHETIME, ACTIVESEASON | да |
| SERVICEMEN, KMFACTORING, KMSB1, IMUB, RNUB, RSB1 | ALLTHETIME | нет |

id задачи: `rating_<BLOCK>_<PERIOD>`.  
fileName: `gamification-ratingList_<BLOCK>_<PERIOD>.csv`.

### 6.3. `ORDERS_GROUP_JOBS` — заказы (10 задач)

Endpoint: `orders/file-download`, тело `{ businessBlock, listType }`.

| businessBlock | listType | defaultChecked |
|---------------|----------|----------------|
| KMKKSB | NONSEASON, SEASON_2025_2, SEASON_2025_1, SEASON_2024, ALLSEASONS | да |
| MNS | NONSEASON, SEASON_m_2025_2, SEASON_m_2025_1, SEASON_m_2024, ALLSEASONS | да |

**Дефолт v2:** все listType отмечены (`FILE_DL_ORDERS_DEFAULT_UNCHECKED_JOB_IDS = []`).

id: `orders_<BLOCK>_<LISTTYPE>`.  
fileName: `gamification-orderList_<BLOCK>_<LISTTYPE>.csv`.

### 6.4. Порядок в «Скачать выделенное»

`getAllDownloadJobs()` = основные (4) → рейтинг (20) → заказы (10) = **34 задачи**.

## 7. Панель управления (UI)

Ширина до **960px**, прокрутка по вертикали.

### 7.1. Строка стенда

Порядок слева направо: **Стенд** → **Контур** → кнопки **✓ Отметить всё** / **⛔ Снять отметки** / **↺ По умолчанию** → **`POST <origin>`** (справа).

«По умолчанию» вызывает `resetPanelCheckboxesToDefault()` → `isFileDlJobCheckedByDefault(job)` для каждой задачи.

### 7.2. Сводка

Под заголовком: `Осн.: 4 · Рейт.: 20 · Зак.: 10 · Всего задач с чекбоксом: 34 (отмечено: N)`.

### 7.3. Пакет: паузы

Как в v1: пауза между файлами, мин. интервал стартов, чекбокс перекрытия, **«Награды с:»** + `input type="date"`.

### 7.4. Секции выбора

1. **Основные выгрузки** — один горизонтальный ряд по центру, 4 чекбокса (без кнопок скачивания).
2. **Заказы** — KMKKSB слева, MNS справа (`flex:1`); listType в **2 колонки**; заголовок businessBlock без master-checkbox.
3. **Рейтинг** — **2 строки** блоков (см. § 5.3); сезоны в столбик внутри каждого блока.

### 7.5. Запуск и закрытие

- **«Скачать выделенное»** — единственная кнопка запуска пакета; при пустом выборе — предупреждение в журнал.
- **«Журнал работы»** — внизу панели.
- **«Закрыть»** — `fileDlDetachPanelAndResetRuntime()`, удаление `#fileDlGamificationPanelRootV2`.

## 8. Журнал и консоль

Поведение как в v1: `fileDlPanelEcho`, `fileDlConsoleSingleJobSummary`, форматы СТАРТ / ЗАВЕРШЕНО / ОШИБКА API / пакетные сводки. Подробности — в документе v1 § 8.

## 9. Функции (справочник v2)

### Новые / изменённые относительно v1

| Функция | Назначение |
|---------|------------|
| `buildRatingGroupJobsFromConfig` | Генерация задач рейтинга из конфига |
| `buildOrdersGroupJobsFromConfig` | Генерация задач заказов из конфига |
| `isFileDlJobCheckedByDefault` | Дефолт чекбокса по id и `_blockDefaultChecked` |
| `getMaxRatingSeasonCountInBlocks` | Макс. число сезонов среди блоков ряда |
| `calcRatingRowMinHeightPx` | min-height строки рейтинга на панели |
| `appendCheckboxOnlyRow` | Чекбокс без кнопки скачивания (внутри `startDownloadPanel`) |
| `appendBlockGroupSection` | Секция businessBlock + дочерние чекбоксы |
| `groupJobsByBusinessBlock` | Группировка по `body.businessBlock` |
| `mkMarkActionBtn` | Кнопка отметки с иконкой |
| `resetPanelCheckboxesToDefault` | Сброс к конфигу дефолтов |

### Унаследованные от v1 (без UI-кнопок одиночного скачивания)

`downloadOneJob`, `downloadJobsSequentially`, `downloadJobsStaggered`, `downloadJobsBatch`, `downloadCheckedPanelJobs`, `getGroupNameForJob`, `syncFileDlDelaysFromPanel`, `syncFileDlRewardsDateFromPanel`, `fileDlDetachPanelAndResetRuntime`, `parseFilenameFromContentDisposition`, и др.

**Не используются в UI v2:** `downloadRatingGroupOnly`, `downloadOrdersGroupOnly` (если остались в коде — только для отладки или удалены).

## 10. Настройка под себя

1. **Новый сезон рейтинга** — добавить `timePeriod` в нужный элемент `FILE_DL_RATING_BLOCKS_CONFIG`.
2. **Новый businessBlock рейтинга** — новый объект в конфиг + имя блока в `FILE_DL_RATING_UI_ROWS` (нужная строка).
3. **Дефолт отметки блока** — `defaultChecked: true/false` в конфиге; точечно — id в `FILE_DL_*_DEFAULT_UNCHECKED_JOB_IDS`.
4. **Заказы для других блоков** — расширить `FILE_DL_ORDERS_BLOCKS_CONFIG` по аналогии с рейтингом.
5. **Раскладка UI** — правка `FILE_DL_RATING_UI_ROWS`, `columns`, `cellMinWidth` в вызовах `appendBlockGroupSection`.

## 11. Каталог POST/

После правок: `./post_txt_sync.sh` из корня репозитория → `POST/File_DB_Load_GP_v2.js.txt`.

## 12. Roadmap v2 (сопровождение и развитие)

| № | Задача | Статус |
|---|--------|--------|
| R.1 | Конфиги рейтинга/заказов + генераторы задач | `[v]` |
| R.2 | «Итоги года» в основных | `[v]` |
| R.3 | UI: только чекбоксы + «Скачать выделенное» | `[v]` |
| R.4 | UI: 2 строки рейтинга, высота под столбик сезонов | `[v]` |
| R.5 | Кнопки ✓ / ⛔ / ↺ «По умолчанию» | `[v]` |
| R.6 | Документация Docs + README + ROADMAP | `[v]` |
| R.7 | Accordion / сворачивание длинных секций | `[ ]` опционально |
| R.8 | Расширение заказов на businessBlock из рейтинга | `[ ]` по запросу |
| R.9 | Замена v1 на v2 как основного скрипта в README | `[ ]` не выполнялось — оба файла |
| R.10 | Сверка refererPath для year-result на всех стендах | `[w]` уточнить на PROM/PSI |

## 13. История версий (документ)

| Версия | Изменения |
|--------|-----------|
| **1.0** | Первое описание v2: конфиги, UI, 34 задачи, отличия от v1, roadmap сопровождения. |

*Актуальность полей кода проверяйте по `Script/File_DB_Load_GP_v2.js`.*
