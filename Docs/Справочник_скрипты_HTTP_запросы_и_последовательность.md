# Справочник: скрипты каталога `Script/` — HTTP-запросы, payload и порядок выполнения

Документ описывает **все скрипты** из `Script/`: какие обращения к сети выполняются, **тело запроса (payload)** где применимо, и **логическая последовательность** шагов. Аутентификация везде опирается на **куки текущей вкладки** (`credentials: "include"`); URL-ы стендов приведены как в коде (без реальных секретов).

Подробные ТЗ по отдельным скриптам остаются в профильных файлах `Docs/*.md`; здесь — **единая сводка для быстрого поиска**.

---

## 1. `Profile_GP_LOAD_file.js`

**Назначение:** пакетная выгрузка профилей героев по **табельным номерам** (поле, вставка списка, файл `.txt`).

**Origin:** таблица `PROFILE_ORIGINS` по выбору на панели **стенд** `PROM` | `PSI` | `IFT-SB` | `IFT-GF` и **контур** `ALPHA` | `SIGMA`.
При старте выполняется автоопределение пары стенд/контур по `window.location.origin`; если совпадение не найдено — fallback на `PROM/SIGMA`.

| Шаг | Метод | Путь (относительно origin) | Payload (JSON) | Примечание |
|-----|--------|-----------------------------|----------------|------------|
| 1..N | **POST** | `/bo/rmkib.gamification/proxy/v1/profile` | `{ "employeeNumber": "<табельный>" }` | Один POST **на каждый** табельный из очереди. Для контура **SIGMA** в заголовках добавляются `Origin` и `Referer` (как в коде). |

**Последовательность:**

1. Пользователь задаёт список ТН (текст / файл), параметры паузы и retry на панели.
2. Для **каждого** ТН по очереди: сформировать `makeRequestBody(tn)` → `POST` профиля → разбор JSON → опционально вырезание/скачивание фото (`photoData` / `photoDataKpk`), запись в журнал.
3. При ошибках HTTP или `success: false` в JSON — запись в результат и журнал; при настроенном retry — повтор с задержкой.
4. Сохранение итогового JSON (и при необходимости отдельных файлов фото).

---

## 2. `File_DB_Load_GP.js`

**Назначение:** инициирование **скачивания файлов** (CSV и др.) с API gamification через `POST …/file-download`.

**Origin:** выбор **стенд** × **контур** на панели (`STAND_ORIGINS` в коде скрипта), где стенды: `PROM` | `PSI` | `IFT-SB` | `IFT-GF`.
При старте выполняется автоопределение пары стенд/контур по `window.location.origin`; если совпадение не найдено — fallback на `PROM/SIGMA`.

Общий шаблон: **`POST`** `origin + <apiPath из задачи>`, заголовки `Accept: */*`, `Content-Type: application/json`, тело — **JSON из поля `body` задачи** (клонируется перед отправкой).

### 2.1. Основные три задачи (`DOWNLOAD_JOBS`)

| Задача (id) | Путь | Payload по умолчанию | Дополнения |
|-------------|------|------------------------|------------|
| `tournamentListCsv` | `/bo/rmkib.gamification/proxy/v1/tournaments/file-download` | `{}` | — |
| `employeeRewardsSummary` | `/bo/rmkib.gamification/proxy/v1/employee-rewards/file-download` | `{}` → перед отправкой подставляется **`dateFrom`** с панели (`<input type="date">`, строка вида `YYYY-MM-DD`) | Итоговое тело: `{ "dateFrom": "…" }` |
| `administrationStatisticCsv` | `/bo/rmkib.gamification/proxy/v1/administration/statistic/file-download` | `{}` | — |

### 2.2. Группа «Рейтинг» (`RATING_GROUP_JOBS`)

- **POST** `/bo/rmkib.gamification/proxy/v1/ratinglist/file-download`
- **Payload:** `{ "businessBlock": "<KMKKSB|MNS>", "timePeriod": "<ACTIVESEASON|SEASON_…|ALLTHETIME|…>" }` — набор пар задан константами в скрипте (10 вариантов).

### 2.3. Группа «Заказы» (`ORDERS_GROUP_JOBS`)

- **POST** `/bo/rmkib.gamification/proxy/v1/orders/file-download`
- **Payload:** `{ "businessBlock": "<KMKKSB|MNS>", "listType": "<NONSEASON|SEASON_…|…>" }` — 10 вариантов в коде.

**Последовательность пакета:**

1. Пользователь отмечает задачи чекбоксами (или запускает группу «Рейтинг» / «Заказы»).
2. Режим **последовательно**: после **успешного** завершения POST N ждётся пауза с панели → POST N+1.
3. Режим **с перекрытием**: старт следующего POST не раньше минимального интервала после **старта** предыдущего; до **успеха** предыдущего следующий не начинается (логика в коде).
4. Ответ: ожидается **бинарное тело** (файл). Если `Content-Type` указывает на JSON и в теле **`success: false`** — файл **не** сохраняется, сообщение в журнал.

---

## 3. `AddressBook_export.js`

**Назначение:** выгрузка данных адресной книги: **поиск** сотрудников и/или **карточка** по UUID.

**Origin:** приоритетно **`window.location.origin`** текущей вкладки; если недоступен — fallback `ADDRESSBOOK_ORIGINS.ALPHA` (`https://addressbook.omega.sbrf.ru`). Базовый префикс API: **`ADDRESSBOOK_API_HOME` = `/api/home`**.

### 3.1. POST `employees/search`

| Поле | Описание |
|------|----------|
| `searchText` | Число (табельный как **number**, ведущие нули сняты) **или** строка (ФИО и т.д.) |
| `pageToken` | `null` на первой странице; со значения из ответа для следующих |

**Тело:** `{ "searchText": <number|string>, "pageToken": <string|null> }`.

**Последовательность для search:** при наличии пагинации — цикл POST с обновлением `pageToken`, пока токен не закончится.

### 3.2. GET `empInfoFull`

**URL:** `origin + /api/home/empInfoFull?empId=<UUID>`  
**Тело:** нет (GET).  
**Параметр:** `empId` — **UUID** `employeeId` из ответа search (не 8-значный табельный номер).

### 3.3. Сценарии на панели (логика)

| Сценарий | Последовательность |
|----------|-------------------|
| **Search → empInfoFull** | Для каждого ввода: POST search (все страницы) → сбор уникальных `employeeId` из `hits` → пауза «после search» → для **каждого** UUID: GET empInfoFull (с паузами по панели). |
| **Только Search** | Только цепочка POST search по каждому значению (с пагинацией). |
| **Только empInfoFull** | Ввод трактуется как список **UUID** (или табельные в режиме разбора — см. код): GET по каждому id. |

Те же три сценария доступны **из файла** (после выбора `.txt`).

---

## 4. `Parameters_Actual_Export.js`

**Назначение:** работа с параметрами gamification: **список/детали**, **создание**, **обновление**.

**Origin:** `PARAMETER_ORIGINS` по **стенд** `PROM|PSI|IFT-SB|IFT-GF` и **контур** `SIGMA|ALPHA`.
При старте выполняется автоопределение пары стенд/контур по `window.location.origin`; если совпадение не найдено — fallback на `PROM/SIGMA`.

### 4.1. Вкладка «Выгрузка»

| Шаг | Метод | Путь | Payload |
|-----|--------|------|---------|
| 1 | **POST** | `/bo/rmkib.gamification/proxy/v1/parameters` | `{ "status": "ACTUAL" }` или `{ "status": "ARCHIVE" }` — как выбрано на панели |
| 2..K+1 | **POST** | тот же путь | `{ "objectIds": [ "<objectId>" ] }` — **по одному** id из шага 1; между запросами — пауза с панели (мс) |

**Последовательность:** сначала список → извлечь все `objectId` → для каждого id отдельный POST детализации → объединить в JSON и скачать файл.

### 4.2. Вкладка «Создание» (`param-create`)

| Метод | Путь | Payload |
|--------|------|---------|
| **POST** | `/bo/rmkib.gamification/proxy/v1/parameters/param-create` | `{ "parameterCode", "parameterType", "parameterName", "parameterValue", "businessBlock?" }` — `businessBlock` опционален |

**Последовательность:** перед формой/файлом — **`ensureCachesForCreateOperation()`**: при необходимости один раз `POST` списка `ACTUAL` (кэш **`parameterCode`**) и при отсутствии типов из API — детализация **`parameterTypes`** (кэш допустимых типов, обновление селекта на вкладке «Создание»). Валидация → при необходимости проверка, что **`parameterCode`** ещё не в ACTUAL (иначе сообщение и **без** `param-create`) → подтверждение → **`POST …/param-create`**. Из файла: тот же разбор, что в документе по скрипту (в т.ч. блоки `{...}`); при таком разборе поддерживается автоматическое удаление висячих запятых перед `}`/`]`, а при ошибке в журнал выводится расширенная диагностика (блок, позиция, строка/колонка, фрагмент). Пауза **`PARAM_BATCH_REQUEST_GAP_MS`** между запросами, дубли по коду отфильтровываются. Успех: **`success === true`**.

Дополнительно по единой кнопке **`⬇ Загрузить параметры`** (рядом со вкладками): **всегда** `POST` списка `ACTUAL`; шаг детализации мета-параметра `parameterTypes` (`POST { objectIds: [metaId] }`) применяется для вкладки «Создание». Применение результатов: для «Создания» типы дополняют дефолтный `PARAMETER_TYPE_OPTIONS`, для «Редактирования» типы заменяются только значениями из шага 1 (`ACTUAL`) без шага 2. Для `businessBlock` применяется fallback-список (8 значений: `KMKKSB`, `MNS`, `SERVICEMEN`, `KMFACTORING`, `KMSB1`, `IMUB`, `RNUB`, `RSB1`).

### 4.3. Вкладка «Редактирование» (`param-update`)

| Шаг | Метод | Путь | Payload |
|-----|--------|------|---------|
| (подготовка) | **POST** | `/bo/rmkib.gamification/proxy/v1/parameters` | `{ "status": "ACTUAL" }` — при отсутствии кэша или по кнопке ⬇ на вкладке 3: кэши **`parameterCode`**, **`objectId`**, типы из **`parameterTypes`** |
| (подготовка) | **POST** | тот же | `{ "objectIds": [ "<metaObjectId>" ] }` — только детализация справочника типов (как на вкладке 2) |
| B | **POST** | тот же | `{ "objectIds": [ "<objectId>" ] }` — получение актуального **`version`** для выбранного параметра |
| C | **POST** | `/bo/rmkib.gamification/proxy/v1/parameters/param-update` | Базово `{ "parameterCode", "parameterType", "parameterName", "parameterValue", "businessBlock", "objectId", "version", "status" }`; при изменении `status` — сокращённо `{ "objectId", "status", "version" }` |

**Последовательность:** при необходимости автоматически тот же поток, что и кнопка ⬇ вкладки 3 (**`ensureEditTabListsForUpdate`**) → проверки: **`objectId`** ∈ сохранённому множеству из шага ACTUAL, **`parameterCode`** ∈ кэшу кодов (иначе — указание создавать на вкладке 2) + сверка связки `objectId <-> parameterCode` по картам кэша → детализация B → подтверждение существующей комбинации `objectId + parameterCode` по ответу API → проверка `version` (если введена в форме/файле, обязана совпасть с API) → сравнение редактируемых полей `parameterType/businessBlock/parameterName/parameterValue/status` (если отличий нет, `param-update` не отправляется) → подтверждение с таблицей «было/стало» → шаг C.  
Для `parameterCode` в UI доступен поиск по части текста (`input + datalist`). При выборе кода или вводе `objectId` сначала автоподставляются `objectId/parameterCode`, `parameterType`, `status`, `version` из кэша 7.2, затем выполняется детализация **`POST { "objectIds": [ "<id>" ] }`** для предзаполнения `parameterName` и `parameterValue` (и уточнения сопутствующих полей).  
Если введённый `parameterCode` или `objectId` не найден в кэше ACTUAL, связанные поля редактирования очищаются перед дальнейшим вводом.
Верхняя строка панели показывает текущий origin в компактном формате `POST <origin>`.
**Из файла:** тот же разбор, что для создания; для **каждой** записи — проверки по кэшу и сверка связки, затем B и C (без повторного запроса списка ACTUAL на каждую строку), пауза между **`param-update`**.
**Кнопка `🧩` на вкладке редактирования:** формирует файл-шаблон для массового обновления: запускает поток ACTUAL (как 7.2), затем отдельный `POST { "status": "ARCHIVE" }`, объединяет `objectId` из обоих статусов и выполняет детализацию по каждому id. На выходе — текстовый файл с блоками payload (по одному блоку на параметр) для дальнейшего редактирования и загрузки через «Обновить из файла…».

---

## 5. `Tournament_LeadersForAdmin.js`

**Назначение:** выгрузка лидеров турнира для админки по **коду турнира**.

**Base URL:** `TOURNAMENT_BASE[стенд][контур]` — путь вида  
`https://…/bo/rmkib.gamification/api/v1/tournaments/`  
(без `/proxy/` — **прямой** API v1 tournaments из кода). Стенды: `PROM` | `PSI` | `IFT-SB` | `IFT-GF`. При старте выполняется автоопределение пары стенд/контур по `window.location.origin`; если совпадение не найдено — fallback на `PROM/SIGMA`.

| Шаг | Метод | URL (шаблон) | Payload |
|-----|--------|----------------|---------|
| 1..N | **GET** | `<baseUrl><tournamentId>/leadersForAdmin?pageNum=1` | Нет (query только `pageNum=1`) |

**Последовательность:**

1. Сбор списка кодов турниров из поля, `.txt` или CSV (колонка кода + фильтр статусов).
2. Для **каждого** кода: `GET` → разбор JSON → при необходимости нормализация записи (в т.ч. «0 участников», вложенные ошибки в `body.tournament.error`).
3. Пауза между турнирами — значение с панели (мс).
4. Сохранение одного JSON и/или CSV на диск.

---

## 6. `UI_AutoTest.js`

**Назначение:** локальная автоматизация UI **без HTTP**: поиск в DOM элемента `a[href="/rating"]` и вызов **`click()`**.

**Запросы к API:** не выполняются.

---

## Сводная таблица по типам операций

| Скрипт | Основной тип запросов | Типичный контент-тело |
|--------|------------------------|------------------------|
| `Profile_GP_LOAD_file.js` | POST JSON | `{ employeeNumber }` |
| `File_DB_Load_GP.js` | POST JSON | `{}`, `{ dateFrom }`, `{ businessBlock, timePeriod }`, `{ businessBlock, listType }` |
| `AddressBook_export.js` | POST JSON + GET | search: `{ searchText, pageToken }`; empInfoFull: query `empId` |
| `Parameters_Actual_Export.js` | POST JSON | `{ status }`, `{ objectIds }`, create body, update body |
| `Tournament_LeadersForAdmin.js` | GET JSON | — |
| `UI_AutoTest.js` | — | — |

---

## История версий (этот справочник)

| Версия | Изменения |
|--------|-----------|
| 1.0 | Первый выпуск: сводка по всем скриптам `Script/`, методы, пути, payload, порядок шагов. |
| 1.1 | `Parameters_Actual_Export`: кнопка ⬇ — один `objectId` для справочника типов, без обхода всех id. |
| **1.2** | `Parameters_Actual_Export`: кэш **`objectId`** из ACTUAL; вкладка 3 — отдельная ⬇, **`ensureEditTabListsForUpdate`**; `param-update` без повторного POST списка на каждую операцию/строку файла; подробности в `Docs/Скрипт_выгрузка_актуальных_параметров_Parameters_Actual_Export.md` v3.1. |
| **1.3** | `Parameters_Actual_Export`: поиск `parameterCode` по части текста (datalist), карты соответствий `parameterCode/objectId` с `parameterType/status/version`, автоподстановка полей редактирования, ручной `version` в форме и приоритет источников версии при `param-update`. |
| **1.4** | `Parameters_Actual_Export`: автодетализация по выбранному/подставленному `objectId` при редактировании — заполнение `parameterName`/`parameterValue` и уточнение полей из ответа detail. |
| **1.5** | `Parameters_Actual_Export`: очистка связанных полей формы редактирования при вводе несуществующих `parameterCode`/`objectId` (защита от устаревших автоподставленных значений). |
| **1.6** | `Parameters_Actual_Export`: перед `param-update` добавлено сравнение «новые поля vs текущее состояние по objectId»; при отсутствии изменений запрос не отправляется (форма и файл). |
| **1.7** | `Parameters_Actual_Export`: перед `param-update` подтверждается существующая комбинация `objectId + parameterCode + version`; изменения обязательны хотя бы в одном из `parameterType/parameterName/parameterValue` (форма и файл). |
| **1.8** | `Parameters_Actual_Export`: в разборе JSON-файлов добавлена нормализация висячих запятых перед `}`/`]` для блоков `{...}` и расширенная диагностика ошибок разбора (номер блока, позиция, строка/колонка, фрагмент). |
| **1.9** | `Parameters_Actual_Export`: добавлены `businessBlock` (форма/файл/валидация/кэши), фильтрация `parameterCode` по выбранному `parameterType`, fallback шага 2 на данные шага 1, стенд-зависимый `metaObjectId` (`PROM/PSI`), учёт `status` в проверке изменений и сокращённый payload `{ objectId, status, version }` при изменении статуса. |
| **1.10** | `Parameters_Actual_Export`: добавлена кнопка `🧩` на вкладке редактирования для выгрузки шаблона массового редактирования по объединённому списку `objectId` из ACTUAL и ARCHIVE с детализацией по каждому id. |
| **1.11** | `Parameters_Actual_Export`: загрузка справочников унифицирована одной кнопкой `⬇ Загрузить параметры` рядом с вкладками; результаты общей загрузки используются всеми вкладками. Для `businessBlock` добавлен fallback-список (`KMKKSB`, `MNS`) при пустом ответе API. |
| **1.12** | Унификация окружений для `File_DB_Load_GP`, `Profile_GP_LOAD_file`, `Tournament_LeadersForAdmin`, `Parameters_Actual_Export`: добавлены стенды `IFT-SB` и `IFT-GF` (временно с host как у `PSI`), включено автоопределение стенда/контура по `window.location.origin`. В `Parameters_Actual_Export` обновлены fallback-списки `businessBlock` (8 значений) и типов параметров, верхний индикатор сокращён до `POST <origin>`. |
| **1.13** | `Parameters_Actual_Export`: уточнена логика списков типов при загрузке параметров — вкладка «Создание» дополняет дефолтный список уникальными типами из API, вкладка «Редактирование» использует только шаг 1 (`ACTUAL`) и не применяет шаг 2 (`objectIds` meta-parameterTypes). |
