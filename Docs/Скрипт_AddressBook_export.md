# Скрипт выгрузки из адресной книги (`AddressBook_export.js`)

## 1. Назначение

В браузере выполняются запросы в окружении **ALPHA**; база URL для API — **`window.location.origin` + `/api/home/...`** (тот же хост, что у открытой вкладки справочника), чтобы с запросом ушли **куки текущей сессии** (`credentials: "include"`). Если у вкладки нет `location.origin`, используется запасной **`ADDRESSBOOK_ORIGINS.ALPHA`**. Вариантов TAB и SIGMA нет. Куки в код не вшиваются.

## 2. Запуск

- Файл: `Script/AddressBook_export.js`. Текстовые копии для вставки из «.txt» собираются в каталог **`POST/`** скриптом `post_txt_sync.sh` (см. корневой `README.md`); каталог `POST/` в `.gitignore` и не входит в git.
- DevTools → Console → вставить скрипт → Enter.
- **Стенд** — только **ALPHA** (без переключения). На панели показано, на какой **origin** реально идут запросы (обычно совпадает с вкладкой; куки сессии привязаны к нему). Константа `ADDRESSBOOK_ORIGINS.ALPHA` — справочный хост Omega и запасной базовый URL.
- Повторная вставка скрипта снимает старую панель (`id=addressBookExportPanelRoot`) и создаёт новую; при ошибке повторного `const` в консоли обновите страницу.

## 3. API (логически)

Полный URL: **`getAddressBookStandAndOrigin().origin` + `/api/home` + суффикс** (по умолчанию origin вкладки).

| Метод | Суффикс | Назначение |
|-------|---------|------------|
| GET | `/empInfoFull?empId=` | Полная карточка; в типичном развёртывании **empId — UUID** (`employeeId` из ответа search), не 8-значный табельный номер. |
| POST | `/employees/search` | Поиск: в теле `{ searchText, pageToken: null }` — **число** (ТН без ведущих нулей, напр. `2209710`) или **строка** (ФИО). |

## 4. Панель (UI)

Оформление: ширина панели ~620px; две колонки (**ТН** | **ФИО**) на широком экране, на узком — друг под другом.

1. **Стенд** — **ALPHA** и фактический `origin` + `/api/home/…`.
2. **Параметры** — пауза **между сотрудниками в списке** (мс): для всех сценариев с циклом; отдельно — пауза **после search перед empInfoFull** (мс): только для цепочки карточек. Значения 0…300000; на время выполнения поля блокируются.
3. **Табельные** — textarea (**`EMP_IDS`**); **Карточки по ТН** и **POST search по ТН** читают список из поля. Кнопка **«Файл .txt → карточки сразу»** — выбор UTF-8 файла: в лог пишется статистика (число групп цифр и уникальных ТН), **textarea не меняется**, сразу запускается та же выгрузка карточек, что и по кнопке «Карточки по ТН».
4. **Поиск по ФИО** — отдельная колонка; **POST search по ФИО**; пауза между строками — из «между сотрудниками».
5. **Лог** — ход сценария и консоль `[Адресная книга]`.
6. На время сценария кнопки и поля пауз заблокированы (`setBusy`).
7. **Закрыть панель**.

Имена файлов (везде суффикс стенда **ALPHA**): `addressbook_empInfoFull_ALPHA_<timestamp>.json`, `addressbook_search_by_tn_ALPHA_<timestamp>.json`, `addressbook_search_by_fio_ALPHA_<timestamp>.json`.

**Структура JSON для «Карточки по ТН»:** массив объектов; при успехе — поля `tabNumNormalized`, `search` (ответ POST search), `employeeId` (UUID), `empInfoFull` (результат GET); при отсутствии сотрудника в поиске — `error` и при необходимости `search` / пустой `empInfoFull`.

## 5. Переменные и функции

| Имя | Назначение |
|-----|------------|
| `ADDRESSBOOK_STAND_KEY` | Строка `"ALPHA"` для логов и имён файлов |
| `ADDRESSBOOK_ORIGINS` | **ALPHA** — справочный/запасной хост Omega, если нет `location.origin` |
| `getAddressBookStandAndOrigin()` | `origin` = вкладка или запасной ALPHA; `standKey` = ALPHA |
| `tabNumToSearchNumber` | ТН из поля (8 цифр) → число для тела search (без ведущих нулей) |
| `pickEmployeeIdFromSearchData` | Из JSON ответа search — `hits[0].employeeId` (UUID) |
| `ADDRESSBOOK_API_HOME` | Префикс пути `/api/home` |
| `EMP_IDS` | Табельные по умолчанию для подсказки в textarea |
| `REQUEST_PAUSE_MS`, `REQUEST_PAUSE_MAX_MS` | Значения по умолчанию и потолок пауз с панели (мс) |
| `setBusy` | Блокировка кнопок и полей пауз |
| `runEmpInfoFullExport` | Общая цепочка карточек (поле или файл) |
| `readPauseMsFromInput` | Разбор числа из поля параметра |
| `normalizeEmpId`, `parseEmpIdsFromText` | Разбор ТН из textarea и из .txt |
| `fetchEmpInfoFull(empId)` | GET empInfoFull (`empId` — UUID) |
| `fetchEmployeesSearch(searchText, asNumber)` | POST search; `asNumber === true` — ТН в JSON как число |
| `downloadJson(filename, obj)` | Сохранение объекта в JSON на диск |
| `startAddressBookPanel()` | Панель: `addressBookExportPanelRoot`, лог, блокировка параллельных сценариев (автовызов в конце файла) |

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

*Актуальность проверяйте по `Script/AddressBook_export.js`.*
