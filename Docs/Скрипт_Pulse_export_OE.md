# Скрипт выгрузки из Пульс (`Pulse_export_OE.js`)

## 1. Назначение

DevTools-скрипт для **hr.ca.sbrf.ru (Пульс)**: последовательный сценарий **OE** —

1. **multiSearch** (`category=PERSONS`) по списку запросов (если отмечена фаза Search);
2. сбор уникальных **`personUuid`** + **`employeeId` / `fullName` / `position`**;
3. **mainInfo_v1** по каждому UUID (если отмечена фаза mainInfo);
4. сохранение JSON и чернового CSV по чекбоксам выгрузки.

Образец поведения — [AddressBook_export_OE.js](Скрипт_AddressBook_export_OE.md). Финальный набор полей JSON/CSV пользователь уточнит отдельно; сейчас сохраняется полный ответ API + компактный профиль в CSV.

## 2. Запуск

- Файл: `Script/Pulse_export_OE.js`. Копия для вставки: `./post_txt_sync.sh` → `POST/Pulse_export_OE.js.txt`.
- Открыть вкладку **Пульс** (сессия пользователя) → DevTools → Console → вставить скрипт → Enter.
- Панель: `id=pulseExportOePanelRoot`.
- Запросы с **`credentials: "include"`**, origin — вкладки (fallback `https://hr.ca.sbrf.ru`).

### Настройки в коде

Все параметры по умолчанию — в объекте **`PULSE_CFG`** в начале скрипта (паузы, джиттер, `PAGE_SIZE`, пути API, `DEFAULT_QUERIES`, лимиты Trace). Править удобнее всего там.

Стартовые query по умолчанию: `673892`, `Лакомкин Олег`.

## 3. API (по HAR `hr.ca.sbrf.ru.har`)

| Метод | Путь | Назначение |
|-------|------|------------|
| GET | `/api-web/globalsearch/api/v3/multiSearch?query=…&page=…&size=20&category=PERSONS` | Поиск сотрудников |
| GET | `/api-mobile/smart-profile/web/widgets/data?widgets=mainInfo_v1&userId={personUuid}` | Карточка |

### Важно про `size`

В HAR UI при наборе текста шлёт несколько multiSearch: **size=8** и **size=5** (несколько `category`) и затем **size=20** только с **`category=PERSONS`**.  
**`size` не равен длине query** — для выгрузки фиксируем **`size=20`**, как у полного списка PERSONS.

ID в поиске: **`personUuid`** в `data.PERSONS.data.content[]`.  
Дополнительно из hit забираются: **`employeeId`** (Таб.номер), **`fullName`** (ФИО), **`position`** (Должность) — для журнала, статуса и CSV.

### Пагинация по `totalPages`

С первой страницы (`page=0`) читается `data.PERSONS.data.totalPages`.  
Дальше запрашиваются страницы **`page = 0 … totalPages - 1`** (пример: `totalPages=5` → `0,1,2,3,4`).  
На панели — лимит **макс. страниц** (по умолчанию 50).

## 4. Сценарий OE

1. Разбор поля/файла: разделители `\n`, `;`, `,`.
2. **Если отмечен Search** — для каждого query все страницы multiSearch (пауза между страницами).
3. Сохранение Search JSON (вместе с фазой Search).
4. Пауза «после Search» (если будет mainInfo).
5. **Если отмечен mainInfo** — для каждого уникального `personUuid` — mainInfo_v1; в статусе/журнале: Таб.номер / ФИО / Должность.
6. Сохранение Full / profile.csv — только если отмечены **и** доступны (нужны Search + mainInfo).

### Зависимость галочек

| Search | mainInfo | Full / CSV | Поведение |
|--------|----------|------------|-----------|
| ✓ | ✓ | можно | Search → mainInfo; Full/CSV по галочкам |
| ✓ | ✗ | недоступны | Только Search |
| ✗ | ✓ | — | Авто-вкл. Search |
| ✗ | ✗ | недоступны | Запуск запрещён |
| вкл. Full/CSV | — | — | Авто-вкл. Search + mainInfo |

### Паузы и джиттер

- Номинал по умолчанию: **1500 мс** между запросами и после Search.
- К каждой паузе добавляется случайный джиттер **+5…10%**.
- Каждый **10-й** и каждый **50-й** запрос — джиттер **+15…25%** (имитация более длинной паузы человека).
- Параметры джиттера — в `PULSE_CFG.JITTER_*`.

### Имена файлов

Префикс **`PROM_PULSE_`**, timestamp `YYYYMMDD_HHMM`:

| Файл | Содержимое |
|------|------------|
| `PROM_PULSE_Search_<ts>.json` | Ответы multiSearch по запросам |
| `PROM_PULSE_mainInfo_<ts>.json` | Результаты mainInfo_v1 |
| `PROM_PULSE_full_<ts>.json` | Search + profiles |
| `PROM_PULSE_profile_<ts>.csv` | Черновой flatten (`;`, UTF-8 BOM) |

## 5. Ошибки и retry

- До **3** попыток на запрос; пауза между попытками = **база × номер попытки**.
- Ошибки: HTTP ≠ 2xx, `success: false`, `PERSONS.success=false`.
- После исчерпания 3 попыток — переход к следующему запросу.
- Если **две подряд** операции исчерпали 3 попытки — **стоп** прогона.
- Кнопка **«Стоп»** — мягкая остановка очереди; уже собранное сохраняется.
- Кнопка **«⏸ Пауза» / «▶ Продолжить»** — приостанавливает старт следующих запросов (текущий дорабатывает).
- Панель статуса (phase / title / lines) показывает текущий запрос и прогресс.

## 6. UI и Trace

- **Структурированный статус**: фаза, какой поиск из N, страница из totalPages, какой mainInfo, кого запрашиваем (Таб.номер / ФИО / Должность), payload.
- Журнал на панели — **без маскирования** (удобно оператору).
- DevToolsTrace (`scriptId=Pulse_export_OE`): payload, HTTP-тела и строки журнала в `.log` проходят **`sanitizeForTrace`**.
  - Формат маски: первая буква + `***` + последние 3 (`673892` → `6***892`).
  - Маскируются чувствительные ключи ответов (employeeId, tabNumber, телефоны, почты, positionId, ФИО/UUID в LOG и т.п.) и query-параметры URL.
- Чекбоксы: **Search** / **mainInfo** — фазы; **Full** / **CSV** — только при обеих фазах.
- Параметры: паузы, база retry, maxPages.
- Кнопки: **Запуск**, **⏸ Пауза**, **Стоп**, загрузка `.txt` в поле, **Закрыть панель**.

## 7. Ключевые функции

| Имя | Назначение |
|-----|------------|
| `PULSE_CFG` | Все дефолты и константы |
| `getPulseOrigin` | Origin вкладки или fallback |
| `parseQueriesFromText` | Разбор списка query |
| `buildMultiSearchUrl` / `buildMainInfoUrl` | URL запросов |
| `fetchJsonWithRetry` | GET + до 3 попыток, удлиняющаяся пауза |
| `humanDelay` / `nextHumanPauseMs` | Пауза с джиттером |
| `maskSensitiveValue` / `sanitizeForTrace` | Маскирование для Trace |
| `parsePersonsBlock` / `personUuidFromHit` | Разбор PERSONS, UUID, totalPages |
| `personMetaFromHit` | employeeId / fullName / position из hit |
| `extractMainInfoData` / `pickSearchHit` / `pickMainInfo` | Компактные поля для CSV |
| `buildCsv` | CSV `;`, UTF-8 BOM |
| `runOeExport` | Полный пайплайн OE (с учётом фаз) |
| `startPulsePanel` | Панель `pulseExportOePanelRoot` |

## 8. CSV (черновик колонок)

Порядок: `searchedQuery`, `personUuid`, поля поиска (`employeeId_search`, `fullName_search`, …), поля mainInfo (`tabNumber`, ФИО, linear/agile, контакты, опыт, schedule, badges, `profTags`, …), `mainInfoOk`, `mainInfoError`.  
Финальный набор колонок будет уточнён отдельно.

## 9. История версий документа

| Версия | Дата | Изменения |
|--------|------|-----------|
| 1.0 | 2026-07-30 | Первый выпуск по HAR/ToDo Пульс: multiSearch PERSONS size=20 → mainInfo_v1, JSON+CSV, retry |
| 1.1 | 2026-07-31 | Пагинация строго по totalPages; фазы Search/mainInfo по галочкам; статус с Таб.номер/ФИО/Должность; payload в trace |
| 1.2 | 2026-07-31 | `PULSE_CFG` сверху; пауза 1500+джиттер; Full/CSV зависят от Search+mainInfo; маскирование Trace; дефолт query |
| 1.3 | 2026-08-10 | Кнопка **⏸ Пауза / ▶ Продолжить**; статус при паузе/стопе; сохранение уже собранного при Стоп |
