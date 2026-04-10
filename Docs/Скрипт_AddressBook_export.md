# Скрипт выгрузки из адресной книги (`AddressBook_export.js`)

## 1. Назначение

В браузере на странице приложения **адресной книги** (желательно тот же origin, что у API) выполняются запросы к путям **`ORIGIN` + `/api/home/...`** с **`credentials: "include"`**. Результаты сохраняются в один JSON-файл на сценарий (кнопка на панели). Куки и токены в код не вшиваются.

## 2. Запуск

- Файл: `Script/AddressBook_export.js`. Текстовые копии для вставки из «.txt» собираются в каталог **`POST/`** скриптом `post_txt_sync.sh` (см. корневой `README.md`); каталог `POST/` в `.gitignore` и не входит в git.
- DevTools → Console → вставить скрипт → Enter.
- **Стенд** на панели: **«Текущая вкладка» (TAB)** — `window.location.origin` + `/api/home/...` (рекомендуется для `https://addressbook/…`, same-origin, без CORS). **ALPHA / SIGMA** — фиксированные хосты; с другой вкладки к ним запросы часто блокируются CORS.
- Повторная вставка скрипта снимает старую панель (`id=addressBookExportPanelRoot`) и создаёт новую; при ошибке повторного `const` в консоли обновите страницу.

## 3. API (логически)

Полный URL: **`ORIGIN` + `/api/home` + суффикс**.

| Метод | Суффикс | Назначение |
|-------|---------|------------|
| GET | `/empInfoFull?empId=` | Полная карточка; в типичном развёртывании **empId — UUID** (`employeeId` из ответа search), не 8-значный табельный номер. |
| POST | `/employees/search` | Поиск: в теле `{ searchText, pageToken: null }` — **число** (ТН без ведущих нулей, напр. `2209710`) или **строка** (ФИО). |

## 4. Панель (UI)

Оформление в духе панели профилей: скругление, тень, `system-ui`, блок стенда на светлом фоне, секции с подзаголовками (uppercase), кнопки с градиентом.

1. **Стенд** — **Текущая вкладка (TAB)** | ALPHA | SIGMA (`ADDRESSBOOK_ORIGINS` для последних двух).
2. **Табельные номера** — textarea (**`EMP_IDS`**); кнопки: **Карточки по ТН** (цепочка POST search → GET empInfoFull по `hits[0].employeeId`) и **POST search по ТН** (только поиск, в теле `searchText` как число).
3. **Поиск по ФИО** — textarea; кнопка **POST search по ФИО**; каждая непустая строка — отдельный POST.
4. **Лог** — прокручиваемое поле под кнопками: ход сценария, HTTP-статус по каждому запросу, подсказка при 405 и т.д.; строки дублируются в консоль с префиксом `[Адресная книга]`.
5. Пока выполняется сценарий, остальные кнопки отключены (`requestBusy`).
6. **Закрыть панель** — удалить контейнер со страницы.

Имена файлов: `addressbook_empInfoFull_<STAND>_<timestamp>.json`, `addressbook_search_by_tn_…`, `addressbook_search_by_fio_…`.

**Структура JSON для «Карточки по ТН»:** массив объектов; при успехе — поля `tabNumNormalized`, `search` (ответ POST search), `employeeId` (UUID), `empInfoFull` (результат GET); при отсутствии сотрудника в поиске — `error` и при необходимости `search` / пустой `empInfoFull`.

## 5. Переменные и функции

| Имя | Назначение |
|-----|------------|
| `ADDRESSBOOK_STAND_TAB` | Константа ключа «Текущая вкладка» (`TAB`) |
| `ADDRESSBOOK_ORIGINS` | Базовые URL только для ALPHA / SIGMA |
| `DEFAULT_ADDRESSBOOK_STAND`, `ADDRESSBOOK_ACTIVE_STAND` | По умолчанию `TAB`; текущий выбор на панели |
| `tabNumToSearchNumber` | ТН из поля (8 цифр) → число для тела search (без ведущих нулей) |
| `pickEmployeeIdFromSearchData` | Из JSON ответа search — `hits[0].employeeId` (UUID) |
| `ADDRESSBOOK_API_HOME` | Префикс пути `/api/home` |
| `getAddressBookStandAndOrigin()` | Активный ключ стенда и origin для запросов |
| `EMP_IDS` | Табельные по умолчанию для подсказки в textarea |
| `REQUEST_PAUSE_MS` | Пауза между последовательными запросами в одном сценарии |
| `normalizeEmpId`, `parseEmpIdsFromText` | Нормализация и разбор списка ТН из текста |
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

*Актуальность проверяйте по `Script/AddressBook_export.js`.*
