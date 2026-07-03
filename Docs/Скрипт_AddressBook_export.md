# Скрипт выгрузки из адресной книги (`AddressBook_export.js`)

## 1. Назначение

В браузере выполняются запросы на отдельный стенд адресной книги **ALPHA**. Для API используется приоритетно **`window.location.origin` + `/api/home/...`** (тот же хост, что у открытой вкладки справочника), чтобы с запросом ушли **куки текущей сессии** (`credentials: "include"`). Если у вкладки нет `location.origin`, используется fallback **`ADDRESSBOOK_ORIGINS.ALPHA`**.

## 2. Запуск

- Файл: `Script/AddressBook_export.js`. Текстовые копии для вставки из «.txt» собираются в каталог **`POST/`** скриптом `post_txt_sync.sh` (см. корневой `README.md`); каталог `POST/` в `.gitignore` и не входит в git.
- DevTools → Console → вставить скрипт → Enter.
- **Стенд** фиксированный: **ALPHA** (без выбора). На панели показано, на какой **origin** реально идут запросы (обычно origin вкладки; при его отсутствии — fallback `ADDRESSBOOK_ORIGINS.ALPHA`).
- Весь код после шапки файла обёрнут в **IIFE** `(function () { … })();`: повторная вставка скрипта в консоль **не** вызывает ошибку «Identifier has already been declared» из‑за верхнеуровневых `const`/`let`. Повторная вставка также снимает предыдущую панель (`id=addressBookExportPanelRoot`), если она ещё на странице.
- **Закрыть панель** удаляет корень панели из DOM вместе с полями и обработчиками; состояние панели в интерфейсе сбрасывается. Незавершённые `fetch` могут ещё завершиться в фоне.

## 3. API (логически)

Полный URL: **`getAddressBookStandAndOrigin().origin` + `/api/home` + суффикс** (по умолчанию origin вкладки).

| Метод | Суффикс | Назначение |
|-------|---------|------------|
| GET | `/empInfoFull?empId=` | Полная карточка; в типичном развёртывании **empId — UUID** (`employeeId` из ответа search), не 8-значный табельный номер. |
| POST | `/employees/search` | Поиск: в теле `{ searchText, pageToken: null }` — **число** (ТН без ведущих нулей, напр. `2209710`) или **строка** (ФИО). |

## 4. Панель (UI)

Оформление: ширина панели **`min(700px, 100vw − отступы)`**; один общий блок ввода + режим разбора + наборы кнопок по полю и по файлу.

1. **Стенд** — фиксированный `ALPHA`, плюс фактический `origin` + `/api/home/…`.
2. **Параметры** — компактный блок в две колонки: подпись и поле числа **в одной строке** (пауза **между запросами в списке**, мс — между вызовами в фазе Search, между GET в фазе empInfoFull; пауза **после всех Search перед первым empInfoFull**, мс). Диапазон 0…300000; на время выполнения поля блокируются.
3. **Три кнопки для файла `.txt`** (в одну строку): `Файл: Search → empInfoFull`, `Файл: Только Search`, `Файл: Только empInfoFull`. После выбора файла запускается тот сценарий, который был нажат.
4. **Один общий textarea** для всех сценариев со значением по умолчанию из **`EMP_IDS`**.
5. **Режим разбора**:
   - `Табельный номер (нормализация)` — любые разделители, берутся группы цифр (`parseEmpIdsFromText`), для search отправляется число без ведущих нулей (`tabNumToSearchNumber`);
   - `Значения для поиска (без нормализации)` — разделители только перенос строки, `;`, `,` (`parseSearchValuesRaw`), пробел внутри строки сохраняется (ФИО уходит целиком).
6. **Три кнопки для поля** (в одну строку): `Search → empInfoFull (все Search, затем карточки)`, `Только Search`, `Только empInfoFull`.
7. **Журнал работы** — область с **min-height ~168px**, max-height ~300px, прокрутка; подробные сообщения **только** здесь. В **консоли** — кратко: открытие панели, старт сценария, итог (имя файла и счётчики).
8. На время сценария блокируются кнопки, поля пауз и переключатели режима (`setBusy`).
9. **Закрыть панель** — `remove()` корня панели (см. п. «Запуск»).

Имена файлов (суффикс стенда **ALPHA**; для `Search → empInfoFull` у трёх файлов **одинаковый** `<timestamp>`):
- `addressbook_search_ALPHA_<timestamp>.json` — ответы **всех** POST search (фаза 1); в каждом `items[]` — **`hits[]`** и **`notFound`**,
- `addressbook_search_employeeId_map_ALPHA_<timestamp>.csv` — столбцы **`что искали`**, **`employeeId`**: по одной строке на каждую запись в `hits` (если по одному запросу несколько строк — несколько строк CSV); UTF-8 с BOM для Excel,
- `addressbook_empInfoFull_ALPHA_<timestamp>.json` — результаты GET **empInfoFull** по каждому **уникальному** `employeeId` (порядок первого появления по всем поискам подряд); в корне объекта — ссылки на два файла фазы Search. В **`results[]`**: **`employeeId`** — UUID из ответа; при запросе по таб. номеру — **`requestedEmpId`**.

Сценарии **только Search** / **только empInfoFull** — объект с метаданными (в OE-скрипте `AddressBook_export_OE.js`, v1 без изменений):
- `addressbook_search_only_ALPHA_<timestamp>.json` — `{ exportedAt, scenario: "search_only", stand, items[] }` (в item: `hits[]`, `notFound`),
- `addressbook_empInfoFull_only_ALPHA_<timestamp>.json` — `{ exportedAt, scenario: "empInfoFull_only", stand, results[] }`.

**Сценарий `Search → empInfoFull`:** сначала выполняются **все** поиски по списку входа; затем сохраняются JSON с полными страницами search и CSV соответствия; после этого — последовательные GET `empInfoFull` (один запрос на UUID, без дубликатов). Структура `addressbook_empInfoFull_…json`: объект с полями `results` (массив `{ employeeId, empInfoFull }` или `error`), `totalUniqueEmployeeIds`, `searchFiles`, метаданные экспорта.

## 5. Переменные и функции

| Имя | Назначение |
|-----|------------|
| `ADDRESSBOOK_STAND_KEY` | Строка `"ALPHA"` для логов и имён файлов |
| `ADDRESSBOOK_ORIGINS` | `ALPHA` — отдельный fallback-host AddressBook, если нет `location.origin` |
| `getAddressBookStandAndOrigin()` | `origin` = вкладка или fallback; `standKey` = `ALPHA` |
| `tabNumToSearchNumber` | ТН из поля (8 цифр) → число для тела search (без ведущих нулей) |
| `collectEmployeeIdsFromSearchPagesInHitOrder` | Все `employeeId` из hits по порядку (с повторами по строкам hits), с учётом пагинации |
| `uniqueEmployeeIdsFirstOccurrence` | Уникальные UUID в порядке первого появления в плоском списке |
| `escapeCsvField`, `downloadText` | CSV-экранирование и сохранение текстового файла |
| `pickEmployeeIdsFromSearchData` | Из JSON ответа search — все уникальные `employeeId` из `hits` (порядок как в ответе) |
| `ADDRESSBOOK_API_HOME` | Префикс пути `/api/home` |
| `EMP_IDS` | Табельные по умолчанию для подсказки в textarea |
| `REQUEST_PAUSE_MS`, `REQUEST_PAUSE_MAX_MS` | Значения по умолчанию и потолок пауз с панели (мс) |
| `setBusy` | Блокировка кнопок, полей пауз и режима разбора |
| `parseSearchValuesRaw` | Разбор строк без нормализации (разделители: `\n`, `;`, `,`) |
| `parseSearchInputs` | Разбор входа для сценариев с search с учётом режима |
| `parseEmpInfoOnlyInputs` | Разбор входа для сценария «только empInfoFull» |
| `runSearchThenEmpInfoFullExport` | Сценарий `Search → empInfoFull` (поле или файл) |
| `runSearchOnlyExport` | Сценарий «только Search» |
| `runEmpInfoFullOnlyExport` | Сценарий «только empInfoFull» |
| `readPauseMsFromInput` | Разбор числа из поля параметра |
| `normalizeEmpId`, `parseEmpIdsFromText` | Разбор ТН из textarea и из .txt |
| `fetchEmpInfoFull(empId)` | GET empInfoFull (`empId` — UUID) |
| `fetchEmployeesSearch(searchText, asNumber)` | POST search; `asNumber === true` — ТН в JSON как число |
| `downloadJson(filename, obj)` | Сохранение объекта в JSON на диск |
| `downloadText(filename, text, mimeType?)` | Сохранение текста (CSV) на диск |
| `startAddressBookPanel()` | Панель: `addressBookExportPanelRoot`, «Журнал работы», блокировка параллельных сценариев; вызывается в конце файла **внутри IIFE** |

## 6. История версий (документ)

| Версия | Изменения |
|--------|-----------|
| 1.0 | Первое описание: empInfoFull, search по ТН и по ФИО, панель, относительные пути. |
| 1.1 | Выбор стенда на панели; абсолютные URL (`ADDRESSBOOK_ORIGINS` + `/api/home`), `credentials: include`. |
| 1.2 | Панель: стиль как у профилей; поле **лога** на панели; снятие предыдущей панели по `id`; `try/finally` для снятия блокировки кнопок. |
| 1.3 | Раздел «Запуск»: ссылка на каталог `POST/` и `post_txt_sync.sh` (копии с суффиксом `.txt` в имени, не в git). |
| 1.4 | Стенд **TAB** (origin вкладки) по умолчанию; цепочка **search → empInfoFull** по ТН; заголовки `Accept` как у браузера; уточнение про UUID в `empInfoFull`. |
| 1.5 | Панель (UI): структура JSON выгрузки «Карточки по ТН». |
| 1.6 | Стенды **OMEGA/SIGMA** с корректными хостами справочника (по HAR); убраны ошибочные URL gamification. |
| 1.7 | Только стенд **ALPHA**; убраны **TAB** и **SIGMA**; запросы всегда на `ADDRESSBOOK_ORIGINS.ALPHA`. |
| 1.8 | Уточнены шаблоны имён выгружаемых JSON (всегда `ALPHA` в имени файла). |
| 1.9 | База URL запросов — **origin вкладки** (куки сессии); `ADDRESSBOOK_ORIGINS.ALPHA` — запасной; `fetch`: `mode: cors`, `cache: no-store`, `credentials: include`. |
| 1.10 | Кнопка загрузки ТН из **.txt** (`FileReader` + тот же `parseEmpIdsFromText`). |
| 1.11 | Файл .txt → статистика + сразу карточки без заполнения поля; параметры пауз; панель шире, две колонки. |
| 1.12 | IIFE: повторная вставка в консоль без ошибки повторного `const`; кнопка **.txt** на всю ширину под параметрами; панель **700px**; компактные параметры; выравнивание колонок (общая строка заголовков, фиксированная высота подсказок); лог выше; «Закрыть» снимает панель с DOM. |
| 1.13 | Несколько записей в ответе **search** по одному ТН: **GET empInfoFull** для **каждого** уникального `employeeId` в `hits`; в JSON — массив **`cards`** вместо одной пары `employeeId`/`empInfoFull`. Блок на панели переименован в **«Журнал работы»**; подробный вывод только в журнале, в консоли — кратко (старт/итог). |
| 1.14 | Один общий ввод + режим разбора (`табельный` / `значения для поиска`), три кнопки сценариев по полю и три кнопки по файлу: `Search → empInfoFull`, `Только Search`, `Только empInfoFull`. Для режима поиска разделители только `перенос строки`, `;`, `,`; пробелы внутри значения сохраняются. |
| 1.15 | Добавлен выбор окружения на панели: **стенд `PROM/PSI`** и **контур `ALPHA/SIGMA`**. В логах и именах файлов используется суффикс `<STAND>_<CONTOUR>`. Запросы по-прежнему с приоритетом на `origin` текущей вкладки, fallback — по `ADDRESSBOOK_ORIGINS`. |
| 1.16 | Возвращён режим с **одним отдельным стендом ALPHA** без выбора стенда/контура на панели. В логах и именах файлов снова фиксированный суффикс `ALPHA`; fallback возвращён на `ADDRESSBOOK_ORIGINS.ALPHA`. |
| 1.17 | Актуализирована документация и описания по текущему состоянию скрипта; изменений бизнес-логики нет. |
| 1.18 | Сценарий **Search → empInfoFull**: фаза 1 — все POST search; сохранение `addressbook_search_…json` и CSV **`что искали`, `employeeId`** (строка на каждый hit); фаза 2 — GET empInfoFull по уникальным UUID (`addressbook_empInfoFull_…json`); общий `<timestamp>` у трёх файлов; пауза «после Search» — после всех поисков перед первым GET. |
| 1.19 | В корне репозитория добавлен [ROADMAP.md](../ROADMAP.md) (§ 3 — план работ и декомпозиция по этому скрипту). |
| 1.20 | Форматы выгрузок в **AddressBook_export_OE.js** (базовые сценарии v1): `hits[]` в `addressbook_search_*`; обёртка `search_only` / `empInfoFull_only`; UUID в `employeeId`. |

*Актуальность проверяйте по `Script/AddressBook_export.js` и `Script/AddressBook_export_OE.js` (базовые сценарии — в OE).*
