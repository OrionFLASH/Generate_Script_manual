# Скрипт параметров: выгрузка, создание, правка (`Parameters_Actual_Export.js`)

## 1. Назначение

Скрипт запускается в консоли DevTools на странице приложения (с активной сессией) и открывает **одну панель** с **тремя вкладками**:

1. **Выгрузка** — двухшаговая выгрузка по выбранному статусу (`ACTUAL` / `ARCHIVE`), сохранение JSON на диск.
2. **Создание** — POST `…/proxy/v1/parameters/param-create` с телом `parameterCode`, `parameterType`, `parameterName`, `parameterValue` и опциональным `businessBlock` (форма или файл).
3. **Редактирование** — POST `…/proxy/v1/parameters/param-update` с теми же полями плюс `objectId`, `version`, `status`; для изменений статуса используется сокращённый payload `{ objectId, status, version }` (форма или файл).

**Стенд** (`PROM` / `PSI` / `IFT-SB` / `IFT-GF`) и **контур** (`ALPHA` / `SIGMA`) выбираются **один раз над вкладками** и используются для всех операций.

Справа в строке выбора отображается короткий индикатор окружения в формате `POST <origin>` (без длинных API-суффиксов).

---

## 2. Поддерживаемые окружения

Таблица `origin` такая же, как для выгрузки:

- **Стенд:** `PROM` / `PSI` / `IFT-SB` / `IFT-GF`
- **Контур:** `SIGMA` / `ALPHA`
- **Автоопределение при старте:** скрипт пытается определить стенд/контур по `window.location.origin`; если совпадение не найдено, используются значения по умолчанию (`PROM` + `ALPHA`).

---

## 3. Запуск

1. Открыть нужную страницу и авторизоваться.
2. DevTools → Console.
3. Вставить код `Script/Parameters_Actual_Export.js` и нажать Enter.
4. Выбрать стенд и контур, перейти на нужную вкладку.

Скрипт обёрнут в IIFE; повторная вставка удаляет старую панель и создаёт новую.

---

## 4. Общие элементы панели

- **Стенд** и **контур** — всегда сверху, до переключения вкладок.
- Над вкладками работает **единая строка действий** (кнопки с иконками), и набор кнопок меняется по активной вкладке:
  - **Выгрузка:** только `▶ Запустить выгрузку`;
  - **Создание:** `⬇ Загрузить параметры`, `➕ Создать параметр`, `📄 Создать из файла`;
  - **Редактирование:** `⬇ Загрузить параметры`, `✏ Обновить параметр`, `🗂 Обновить из файла`, `🧩 Сформировать шаблон Payload`.
- Справа от селектов — индикатор `POST <origin>` для активной пары стенд/контур.
- **Журнал работы** — сообщения по всем вкладкам; префиксы **`[Выгрузка]`**, **`[Создание]`**, **`[Редактирование]`** в зависимости от операции.
- Кнопка **«Закрыть панель»**.
- Во время длительной операции элементы панели блокируются.

**Смена стенда или контура** сбрасывает кэши:

- `cachedActualParameterCodes`, `cachedAllowedParameterTypes`, `cachedAllowedBusinessBlocks`;
- флаг **`editTabAllowedListsLoaded`** (вкладка «Редактирование»);
- селект **parameterType** на вкладке «Создание» — снова из **`PARAMETER_TYPE_OPTIONS`**;
- селекты **parameterCode** и **parameterType** на вкладке «Редактирование» — снова в «пустое» состояние (до повторной загрузки справочников).
- `businessBlock` — fallback-список (`KMKKSB`, `MNS`, `SERVICEMEN`, `KMFACTORING`, `KMSB1`, `IMUB`, `RNUB`, `RSB1`) до повторной загрузки.

---

## 5. Вкладка «1. Выгрузка»

### 5.1. Подготовка

1. Выбрать **стенд** и **контур**.
2. Выбрать **статус списка** для первого запроса: `ACTUAL` или `ARCHIVE`.
3. Задать **паузу в мс** между запросами детализации по каждому `objectId` (после первого списка).

### 5.2. Кнопка «▶ Запустить выгрузку» — порядок запросов

| Шаг | Назначение | HTTP | Тело запроса |
|-----|------------|------|--------------|
| 1 | Список параметров | `POST {origin}{PARAMETERS_PATH}` | `{ "status": "<ACTUAL\|ARCHIVE>" }` |
| 2…N | Детализация по каждому `objectId` из шага 1 | `POST {origin}{PARAMETERS_PATH}` | `{ "objectIds": ["<id>"] }` |

Между шагами 2 и далее выдерживается пауза **`delayMs`** из поля «Пауза (мс) между objectId».

**Итог:** файл `parameters_<СТЕНД>_<КОНТУР>_<YYYY-MM-DD>.json` (поля `meta`, `list`, `details`).

**Журнал:** префикс **`[Выгрузка]`** — старт, шаг 1/2 (URL, тело, пауза), ответ (HTTP, число строк в `body.parameters`, `objectId`, при наличии `success`), для каждой детализации шаг 2/2 (**M из N**), паузы, ошибки с фрагментом ответа, итог по файлу.

---

## 6. Вкладка «2. Создание»

### 6.1. Справочник `parameterType` в коде

В начале скрипта задан массив **`PARAMETER_TYPE_OPTIONS`** (`{ value, label }`) — запасной вариант для селекта **parameterType**, пока не загружены типы из API.

### 6.2. Единая кнопка `⬇ Загрузить параметры` (рядом со вкладками)

**Назначение:** одним действием загрузить общие кэши и применить их для всех вкладок:
- на «Создание»: `parameterType`, `businessBlock`;
- на «Редактирование`: `parameterCode`, `parameterType`, `businessBlock`, карты соответствий.
`param-create`/`param-update` не вызываются.

**Порядок запросов (всегда оба шага подряд):**

| Шаг | Запрос | Тело | Результат в скрипте |
|-----|--------|------|---------------------|
| 1 | `POST …/parameters` | `{ "status": "ACTUAL" }` | Заполнение `cachedActualParameterCodes`, `cachedActualObjectIds`, карт соответствий и `cachedAllowedBusinessBlocks` |
| 2 | `POST …/parameters` | `{ "objectIds": ["<metaId>"] }` | `<metaId>` выбирается по стенду: `PROM -> 745250143248942718`, `PSI/IFT-SB/IFT-GF -> 737634462490874360`; шаг применяется только для вкладки «Создание» |

**Журнал:** префикс **`[Создание]`**, шаги «1/2» и «2/2».

**Важно (актуальная логика применения):**
- для вкладки **«Создание»** список `parameterType` формируется как **объединение**: все значения из `PARAMETER_TYPE_OPTIONS` + уникальные значения из API;
- для вкладки **«Редактирование»** список `parameterType` берётся **только из шага 1** (`POST { status: "ACTUAL" }`) и **заменяет** прежний список; шаг 2 (`objectIds` для `parameterTypes`) для редактирования не используется.

### 6.3. Внутренняя функция `ensureCachesForCreateOperation()` (без отдельной кнопки)

Вызывается **автоматически** перед:

- нажатием **«Создать параметр (param-create)»**;
- обработкой файла **«Создать из файла…»**.

**Логика (без лишних повторов POST ACTUAL):**

1. Если **`cachedActualParameterCodes` уже есть** (например, после кнопки ⬇ на вкладке 2) — **повторный `POST { status: ACTUAL }` не выполняется**; в журнал пишется, что коды берутся из кэша.
2. Если кэша кодов нет — выполняется **`POST { "status": "ACTUAL" }`** и заполняется **`cachedActualParameterCodes`**.
3. Если **`cachedAllowedParameterTypes`** уже непустой — **детализация по `PARAMETER_TYPES_DETAIL_OBJECT_ID` не повторяется**.
4. Если типов из API ещё нет — выполняется **один** `POST { "objectIds": ["…"] }` как в шаге 2 п. 6.2, обновляется **`cachedAllowedParameterTypes`** и селект **`cType`**.
5. Если шаг 2 неуспешен или в нём нет ожидаемого `parameterTypes`, операция не останавливается: используются данные шага 1 (ACTUAL), а дополнение типами из шага 2 пропускается.

### 6.4. Кнопка «➕ Создать параметр» — порядок действий

1. **`ensureCachesForCreateOperation()`** — см. п. 6.3 (при ошибке ACTUAL создание не продолжается).
2. Проверка полей и **`parameterType`** через **`validateCreatePayload`** (список допустимых: **`getParameterTypeAllowedValues()`** — после загрузки API из кэша, иначе из **`PARAMETER_TYPE_OPTIONS`**). Для `businessBlock` поле необязательное; если заполнено, проверка идёт через `getBusinessBlockAllowedValues()` (кэш API, иначе fallback из `BUSINESS_BLOCK_OPTIONS`).
3. Проверка дубликата: если **`parameterCode`** уже есть в **`cachedActualParameterCodes`** — сообщение в журнал, переход на вкладку «Редактирование», **`param-create` не отправляется**.
4. Открывается широкое модальное окно подтверждения в общем стиле панели; отображаются **все поля payload**: `parameterCode`, `parameterType`, `parameterName`, `businessBlock`, `parameterValue`.
5. **Отмена** — в журнал: создание отменено, **`param-create` не вызывался**.
6. **ОК** — **`POST …/param-create`** с JSON телом из четырёх полей.
7. Успех при **`success === true`** в ответе; иначе в журнал — фрагмент ответа.

### 6.5. Кнопка «📄 Создать из файла» — порядок действий

1. **`ensureCachesForCreateOperation()`** — см. п. 6.3 (один раз на весь файл).
2. Чтение и разбор файла (**`parseJsonObjectsFromFileText`**):
   - один JSON-объект или массив;
   - NDJSON (непустая строка = один объект);
   - несколько объектов `{...}{...}` подряд (разбор по внешним `{`…`}` с учётом строк в кавычках);
   - при разборе блоков `{...}` автоматически удаляются «висячие» запятые перед `}`/`]` (вне строк JSON), чтобы не падать на типовом формате файла с лишней запятой.
3. Для каждой записи — **`validateCreatePayload`**; при первой ошибке — стоп, сообщение в журнал.
4. Исключение записей, **`parameterCode`** которых уже есть в **`cachedActualParameterCodes`** (в журнал — причина); если ничего не осталось — стоп.
5. Диалоги подтверждения (первая запись, затем опция «все остальные без подтверждений» или по одной).
6. Для каждой принятой записи: пауза **`PARAM_BATCH_REQUEST_GAP_MS`** (100 мс) между запросами (кроме первой), затем **`POST …/param-create`**.

---

## 7. Вкладка «3. Редактирование»

### 7.1. Поля, справочники и кэш для проверок (п. 7.1)

**Интерфейс до загрузки:**

- **`parameterCode`** — поле ввода с поиском (`input` + `datalist`), до загрузки справочников показывает заглушку в `placeholder`.
- **`parameterType`** — `select` с заглушкой до загрузки.
- **`businessBlock`** — отдельный необязательный `select` (заполняется из ACTUAL после предварительной загрузки).
- **`objectId`**, **`parameterName`**, **`parameterValue`**, **`status`** — ввод вручную (или из файла для пакета).
- Рядом со `status` есть отдельное поле **`version`** (небольшое поле для информации и ручной корректировки перед отправкой).
- В верхней строке действий есть кнопка **`🧩 Сформировать шаблон Payload`** — выгрузка шаблона для массового редактирования.
- При выборе `parameterCode` (поиск) или при вводе/выборе `objectId` выполняется автоподстановка связанных полей (`objectId`, `parameterCode`, `parameterType`, `status`, `version`) из кэша.
- Реализованы зависимости списков на вкладке редактирования:
  - `parameterType -> parameterCode`;
  - `businessBlock -> parameterCode`;
  - `businessBlock -> parameterType`;
  - `businessBlock + parameterType -> parameterCode`.
- Если в `parameterType` или `businessBlock` введено/выбрано несуществующее значение, фильтрация не применяется и `parameterCode` показывает полный список.
- Если введённый `parameterCode` или `objectId` отсутствует в кэше ACTUAL, связанные поля очищаются (чтобы не оставались значения от предыдущей найденной записи).

**Что даёт первый шаг загрузки (тот же ответ `POST { "status": "ACTUAL" }`, что и на вкладке «Создание» при шаге 6.2):**

- множество **`parameterCode`** → кэш **`cachedActualParameterCodes`** (и заполнение селекта `parameterCode` после успешного завершения п. 7.2);
- множество **`objectId`** из **`body.parameters`** → кэш **`cachedActualObjectIds`** — **сохраняется для проверок** перед `param-update`: не нужно повторно запрашивать весь список ACTUAL при каждом нажатии «Обновить», если кэш актуален;
- допустимые **`parameterType`** приходят со **второго** запроса (детализация «parameterTypes») → **`cachedAllowedParameterTypes`** и селект `parameterType`.
- дополнительно формируются карты соответствий:
  - **`cachedActualByCode`**: `parameterCode -> { objectId, parameterType, businessBlock, status, version }`;
  - **`cachedActualByObjectId`**: `objectId -> { parameterCode, parameterType, businessBlock, status, version }`.

Эти карты используются для автоподстановки формы и для валидации связки полей (`objectId` и `parameterCode` должны указывать на одну и ту же запись).
После автоподстановки из кэша скрипт выполняет дополнительный запрос детализации по `objectId`, чтобы предзаполнить **`parameterName`** и **`parameterValue`** (а также уточнить остальные поля, если они отличаются).
При отсутствии соответствия в кэше по введённому значению запускается локальная очистка связанных полей (`objectId`/`parameterCode`, `parameterType`, `status`, `version`, `parameterName`, `parameterValue`) и выводится информационное сообщение.

**Допустимые значения для полей формы** считаются полученными после успешного выполнения **п. 7.2** (ниже): флаг **`editTabAllowedListsLoaded === true`** и непустые кэши кодов, **objectId** и типов.

### 7.2. Загрузка справочников для редактирования (через общую кнопку)

**Назначение:** получить справочники и кэши п. 7.1 через общую кнопку `⬇ Загрузить параметры`. `param-update` не вызывается.

**Порядок запросов** (как в п. 6.2):

| Шаг | Запрос | Тело |
|-----|--------|------|
| 1 | `POST …/parameters` | `{ "status": "ACTUAL" }` → **`cachedActualParameterCodes`**, **`cachedActualObjectIds`** |
| 2 | `POST …/parameters` | `{ "objectIds": ["<metaId>"] }` | Для редактирования не используется (типы берутся только из шага 1) |

**Журнал:** префикс **`[Редактирование]`** (в т.ч. число **objectId** в кэше на шаге 1).

После успеха:

- `datalist` для поиска **`parameterCode`**;
- `select` для **`parameterType`** (замена значениями из шага 1 ACTUAL);
- карты соответствий по коду и по `objectId`;
- флаг **`editTabAllowedListsLoaded`**.

Дальше при выборе `parameterCode` или вводе `objectId` запускается:

- **`POST …/parameters`** с `{ "objectIds": [ "<objectId>" ] }`,
- из первой записи `body.parameters` берутся и подставляются:
  `parameterName`, `parameterValue`, `parameterType`, `status`, `version` (и связанный `objectId`/`parameterCode`).

**Побочный эффект:** обновляется селект **`parameterType` на вкладке «Создание»** (`cType`).

### 7.3. Автозагрузка п. 7.2 при нажатии «Обновить»

Если справочники п. 7.1 **ещё не готовы** (пользователь не нажимал ⬇), при нажатии **«Обновить параметр (param-update)»** или при выборе файла для **«Обновить из файла…»** скрипт **сам выполняет тот же поток, что и п. 7.2** (функция **`ensureEditTabListsForUpdate()`**): два запроса без `param-update`, заполнение кэшей и селектов. В журнал пишется, что выполняется автоматическая загрузка.

Если после этого справочники не собрались — обновление не продолжается.

### 7.4. Проверки перед отправкой `param-update` (форма)

После того как кэши п. 7.1 готовы (вручную через п. 7.2 или автоматически по п. 7.3):

1. **`validateUpdatePayload`** (в т.ч. **`parameterCode`** в **`cachedActualParameterCodes`** при загруженных справочниках).
2. **`objectId` из формы** должен входить в **`cachedActualObjectIds`**. Иначе — ошибка в журнале (нет такого id в сохранённом списке ACTUAL).
3. **`parameterCode` из формы** должен входить в **`cachedActualParameterCodes`**. Иначе — сообщение: **параметра в ACTUAL нет — нужно создавать на вкладке «2. Создание» (param-create), а не редактировать**.
4. Проверка связки из карт соответствий:
   - если для выбранного `objectId` в кэше найден **другой** `parameterCode` — ошибка, отправка блокируется;
   - если для выбранного `parameterCode` в кэше найден **другой** `objectId` — ошибка, отправка блокируется.
5. Перед отправкой всегда выполняется детализация по `objectId`: **`POST …/parameters`** с **`{ "objectIds": [ "<objectId>" ] }`**.
6. Из ответа детализации сначала подтверждается существование текущей связки:
   - `objectId` из формы должен совпасть с `objectId` из ответа;
   - `parameterCode` из формы должен совпасть с `parameterCode` из ответа.
   При несовпадении отправка блокируется.
7. Проверка `version`:
   - из API читается текущая `version` по `objectId`;
   - если в форме `version` заполнен вручную, он обязан быть числом `>= 0` и **совпадать** с `version` из API;
   - при несовпадении отправка блокируется (комбинация `objectId + parameterCode + version` считается несуществующей).
8. Проверка «есть что обновлять» выполняется только по редактируемым полям:
   `parameterType`, `businessBlock`, `parameterName`, `parameterValue`, `status`.
   Если ни одно из этих полей не отличается от текущих данных по `objectId`, **`param-update` не отправляется**.
9. Открывается широкое модальное окно подтверждения в общем стиле панели:
   - в шапке показывается только `parameterCode`;
   - в таблице показываются только реально изменённые поля (`поле / было / стало`).
10. Формирование payload:
   - если меняется `status` (в т.ч. вместе с другими полями), отправляется сокращённое тело `{ "objectId", "status", "version" }`;
   - иначе — полное `{ "parameterCode", "parameterType", "parameterName", "parameterValue", "businessBlock", "objectId", "version", "status" }`.

**Отмена** в диалоге — без отправки `param-update`.

### 7.5. Кнопка «🗂 Обновить из файла» — порядок действий

1. **П. 7.3** — при необходимости автоматически выполняется п. 7.2 (как при кнопке «Обновить»).
2. **Разбор файла** — как в п. 6.5: один объект / массив / **непустые строки по одному JSON** / **несколько блоков `{...}{...}`** (разбор по внешним фигурным скобкам с учётом строк в кавычках).
   При ошибке разбора блока журнал теперь содержит номер блока, позицию в исходном тексте (строка/колонка) и фрагмент JSON для диагностики.
3. Для **каждой** записи отдельно: **`validateUpdatePayload`**.
4. Диалоги подтверждения (первая запись, затем опция «все остальные без подтверждений» или по одной).
5. Для **каждой** записи **последовательно**:
   - проверка **`objectId`** ∈ **`cachedActualObjectIds`** (без повторного POST списка ACTUAL на каждую строку);
   - проверка **`parameterCode`** ∈ **`cachedActualParameterCodes`**; если нет — в журнал: **создавать на вкладке «2. Создание»**, не редактировать;
   - проверка связки `objectId <-> parameterCode` по картам соответствий;
   - детализация по `objectId`: **`POST …/parameters`** `{ "objectIds": [ "<objectId>" ] }`;
   - подтверждение существующей связки `objectId + parameterCode` по детализации API;
   - сравнение только редактируемых полей (`parameterType`, `businessBlock`, `parameterName`, `parameterValue`, `status`); если отличий нет — запись пропускается;
   - проверка `version` из файла: число `>= 0` и строгое совпадение с `version` из API (иначе запись пропускается);
   - `version` в тело `param-update` берётся из детализации API (проверенное совпадение с версией файла обязательно);
   - если в изменениях участвует `status` — тело `{ objectId, status, version }`, иначе полное тело с `parameter*` и `businessBlock`;
   - **`POST …/param-update`**.

Пауза **`PARAM_BATCH_REQUEST_GAP_MS`** между пакетными **`param-update`**.

### 7.6. Кнопка `🧩 Сформировать шаблон Payload` — выгрузка шаблона для редактирования

**Назначение:** сформировать файл, который можно отредактировать и затем загрузить через «Обновить из файла…».

**Порядок действий кнопки:**

1. Выполняется загрузка ACTUAL как в 7.2 (шаг 1, далее шаг 2 для `parameterTypes`).
2. Дополнительно выполняется `POST …/parameters` с `{ "status": "ARCHIVE" }`.
3. Из ответов ACTUAL и ARCHIVE собирается объединённый список `objectId` (без дублей).
4. По каждому `objectId` последовательно выполняется детализация:
   `POST …/parameters` с `{ "objectIds": [ "<objectId>" ] }`.
5. Из каждой детализации формируется блок payload для редактирования с полями:
   `parameterCode`, `parameterType`, `parameterName`, `parameterValue`, `businessBlock`, `objectId`, `version`, `status`.
6. Блоки сохраняются в файл `parameters_update_template_<STAND>_<CONTOUR>_<YYYY-MM-DD>.txt`, каждый блок — с новой строки (через пустую строку между блоками).

---

## 8. Константы и функции (справочник)

| Имя | Назначение |
|-----|------------|
| `PARAMETER_TYPE_OPTIONS` | Справочник `{ value, label }` для `parameterType` на вкладке «Создание», пока нет API (включает 11 типов из `parameterValue.types`) |
| `PARAMETER_TYPES_META_CODE` | Код мета-параметра (`parameterTypes`) |
| `getParameterTypesDetailObjectId` | Выбор `metaObjectId` по стенду (`PROM` или `PSI/IFT-SB/IFT-GF`) для шага детализации `parameterTypes` |
| `BUSINESS_BLOCK_OPTIONS`, `getBusinessBlockAllowedValues` | Fallback и итоговый список допустимых `businessBlock` (`API -> fallback из 8 значений`) |
| `cachedAllowedParameterTypes`, `cachedAllowedBusinessBlocks`, `cachedActualParameterCodes`, `cachedActualObjectIds` | Кэши типов/бизнес-блоков/кодов/**objectId** из ответов ACTUAL и детализации |
| `cachedActualByCode`, `cachedActualByObjectId` | Карты соответствий `parameterCode <-> objectId` c `parameterType`, `businessBlock`, `status`, `version` для автоподстановки и сверок |
| `editTabAllowedListsLoaded` | Флаг: на вкладке 3 выполнена загрузка справочников для селектов |
| `ensureEditTabListsForUpdate` | Перед `param-update`: если кэш п. 7.1 не готов — выполнить поток п. 7.2 |
| `getParameterTypeAllowedValues` | Список для проверки `parameterType` |
| `fillParameterTypeSelect`, `fillParameterTypeSelectWithApiValues`, `fillCreateTypeSelectWithDefaultsAndApi`, `fillBusinessBlockSelect`, `fillCreateBusinessBlockSelectWithDefaultsAndApi` | Заполнение селектов типов и `businessBlock` (для создания — объединение дефолтов и API) |
| `fillParameterCodeSelectFromActualCodes`, `refreshEditFilterOptions`, `clearEditTabParameterSelects` | Поле поиска `parameterCode` (`datalist`) и взаимозависимые фильтры `parameterType`/`businessBlock` на вкладке «Редактирование» |
| `extractActualMappingsFromListData` | Построение карт соответствий по `parameterCode` и `objectId` из ответа ACTUAL |
| `readFirstParameterRowFromDetail`, `fetchAndApplyDetailByObjectId`, `scheduleDetailFillByObjectId` | Детализация по `objectId` и автозаполнение `parameterName/parameterValue` и связанных полей |
| `clearUpdateFormDerivedFields` | Очистка зависимых полей формы редактирования, если введённые `objectId`/`parameterCode` не найдены в кэше ACTUAL |
| `fetchActualListAndCache`, `fetchParameterTypesDetailAndApply` | POST ACTUAL и детализация типов (журнал: тег `[Создание]` или `[Редактирование]`) |
| `refreshSharedParameterListsFromApi` | Единая загрузка параметров для всех вкладок (кнопка рядом с вкладками) |
| `ensureCachesForCreateOperation` | Условная подготовка кэшей перед созданием формы/файла |
| `refreshParameterTypesFromApi` | Кнопка ⬇ вкладки 2: всегда ACTUAL + детализация |
| `refreshEditTabAllowedListsFromApi` | Кнопка ⬇ вкладки 3: те же запросы + заполнение селектов `parameterCode`/`parameterType` |
| `extractParameterCodesFromListData`, `extractTypesFromParameterTypesDetail`, `hasParameterTypesMetaInDetail` | Разбор ответов API |
| `PARAM_BATCH_REQUEST_GAP_MS` | Пауза между последовательными create/update из файла (100 мс) |
| `PARAMETER_ORIGINS` | `origin` по стенду и контуру |
| `STAND_KEYS`, `CONTOUR_KEYS`, `detectParameterEnvFromLocation` | Набор доступных окружений и автоопределение стенда/контура по `window.location.origin` |
| `PARAMETERS_PATH`, `PARAM_CREATE_PATH`, `PARAM_UPDATE_PATH` | Пути API |
| `getOrigin`, `postJson`, `postParameters` | Запросы с `credentials: "include"` |
| `extractObjectIds` | Сбор `objectId` из ответа списка |
| `parseJsonObjectsFromFileText`, `parseJsonObjectsByBraceScan` | Разбор файла (объект / массив / строки / скобки с учётом строк), удаление висячих запятых перед `}`/`]`, расширенная диагностика места ошибки |
| `validateCreatePayload` / `validateUpdatePayload` | Проверка записей |
| `readVersionFromDetailResponse` | Чтение `version` из ответа по `objectIds` |
| `diffEditableUpdateFields` | Сравнение только редактируемых полей `parameterType`/`businessBlock`/`parameterName`/`parameterValue`/`status` перед `param-update` |
| `showCreateConfirmDialog`, `showUpdateConfirmDialog` | Кастомные широкие окна подтверждения в стиле панели для `param-create` и `param-update` |
| `downloadTextFile` | Сохранение текстового файла (используется для шаблона `🧩`) |
| `isSuccessTrue` | Проверка `success === true` |
| `downloadJson` | Сохранение результата выгрузки |

---

## 9. Важные замечания

- Куки и заголовки сессии — из текущей вкладки; в код не вшиваются.
- Для проверки `objectId` перед `param-update` список строится по **`status: ACTUAL`**.
- Если структура ответа API отличается от ожидаемой (`body.parameters`), проверки могут потребовать доработки под фактический JSON.

---

## 10. История версий (документ)

| Версия | Изменения |
|--------|-----------|
| 1.0 | Первая версия: двухшаговая выгрузка, 4 окружения, пауза между `objectId`, журнал, JSON-файл. |
| 1.1 | Выбор статуса первого этапа `ACTUAL` / `ARCHIVE`. |
| 1.2 | Терминология: стенд = PROM/PSI, контур = ALPHA/SIGMA; имена файлов `parameters_<стенд>_<контура>_<дата>.json`. |
| **2.0** | Три вкладки: выгрузка; **param-create** (форма + файл); **param-update** (проверка `objectId`, `version` из API). Общий выбор стенда/контура. |
| **2.1** | Справочник `parameterType`: массив **`{ value, label }`**, общие функции селектов и проверок. |
| **2.2** | Вкладка «Выгрузка»: подробный журнал **`[Выгрузка]`**. |
| **2.3** | Вкладка «Создание»: кнопка ⬇ — ACTUAL + одна детализация по **`PARAMETER_TYPES_DETAIL_OBJECT_ID`**; проверка дубликата **`parameterCode`**; панель по высоте окна. |
| **2.4** | Уточнение 2.3: без обхода всех `objectId`; типы только из **`parameterTypes.types`**. |
| **3.0** | Подробно задокументированы порядок запросов по каждой кнопке; **`ensureCachesForCreateOperation`** перед созданием; разделение селектов вкладок 2 и 3; вкладка «Редактирование»: отдельная кнопка ⬇, селекты `parameterCode`/`parameterType` из кэша, флаг **`editTabAllowedListsLoaded`** до **`param-update`**; разбор файла со скобками и строками; таблица функций обновлена. |
| **3.1** | Кэш **`cachedActualObjectIds`** из первого запроса ACTUAL; проверки **`objectId`** и **`parameterCode`** по сохранённым множествам; при отсутствии кода — указание создавать на вкладке 2; автозагрузка п. 7.2 при «Обновить» / файл; пакетное обновление без повторного POST списка ACTUAL на каждую строку; раздел 7 переписан. |
| **3.2** | Вкладка «Редактирование»: поиск по `parameterCode` через ввод части текста (`input + datalist`), карты соответствий `parameterCode/objectId` с `parameterType/status/version`, автоподстановка полей при выборе кода или вводе `objectId`, ручное поле `version` рядом со `status`, приоритет источников `version` (поле → кэш 7.2 → детализация API), сверка связки `objectId <-> parameterCode` для формы и файла. |
| **3.3** | После выбора `parameterCode` или `objectId` в редактировании автоматически выполняется детализация по `objectId` и предзаполняются `parameterName` и `parameterValue` (а также уточняются `parameterType`, `status`, `version`). Описан точный порядок этого запроса и источники данных для автоподстановки. |
| **3.4** | Для несуществующих `parameterCode`/`objectId` добавлена очистка связанных полей формы редактирования, чтобы не оставались значения от предыдущей найденной записи; уточнён порядок автоподстановки и поведение fallback. |
| **3.5** | Перед `param-update` (форма и файл) добавлена проверка «есть ли реальные изменения» по `objectId`: сравнение всех полей обновления с текущим состоянием из детализации API. Если изменений нет, запрос `param-update` не отправляется. |
| **3.6** | Уточнена валидация перед `param-update`: подтверждение существования комбинации `objectId + parameterCode + version` (версия из формы/файла должна совпадать с API), а также отдельная проверка, что изменяется хотя бы одно из полей `parameterType`/`parameterName`/`parameterValue`. |
| **3.7** | Улучшен разбор JSON из файла: для блоков `{...}` добавлена нормализация висячих запятых перед закрывающими `}`/`]`, а сообщения об ошибке разбора стали подробными (номер блока, позиция, строка/колонка и фрагмент JSON). |
| **3.8** | Реализованы пункты ToDo: стенд-зависимый `metaObjectId` для шага `parameterTypes`; fallback на данные шага 1 при ошибке шага 2; поле `businessBlock` (форма/файл/кэш/валидации); фильтрация `parameterCode` по выбранному `parameterType`; проверка изменений включает `status`; подтверждение обновления в формате «было/стало»; для изменений статуса отправляется сокращённый payload `{ objectId, status, version }`. |
| **3.9** | Добавлена кнопка `🧩` на вкладке редактирования: выгрузка шаблона для пакетного `param-update` по объединённым `objectId` из ACTUAL и ARCHIVE с последующей детализацией по каждому `objectId`. |
| **3.10** | Вынесена единая кнопка `⬇ Загрузить параметры` рядом со вкладками; одна загрузка используется всеми вкладками. Для `businessBlock` добавлен fallback-список допустимых значений (`KMKKSB`, `MNS`) при пустом ответе API. |
| **3.11** | Добавлены стенды `IFT-SB` и `IFT-GF` (с временными host как у `PSI`), реализовано автоопределение стенда/контура по `window.location.origin`, обновлён верхний индикатор окружения до формата `POST <origin>`, расширены fallback-значения `BUSINESS_BLOCK_OPTIONS` и обновлён дефолтный список `PARAMETER_TYPE_OPTIONS` по актуальному `types`. |
| **3.12** | Уточнена загрузка `parameterType`: на вкладке «Создание» список дополняется уникальными значениями из API поверх `PARAMETER_TYPE_OPTIONS`; на вкладке «Редактирование» список полностью заменяется значениями из шага 1 (`POST { status: "ACTUAL" }`) без использования шага 2 по `objectIds`. |
| **3.13** | UI действий вынесен в верхнюю строку рядом со вкладками с контекстным показом кнопок по активной вкладке; кнопка шаблона payload перенесена наверх. Для «Создания» добавлено объединение дефолтов и API не только для `parameterType`, но и для `businessBlock`. В редактировании добавлены зависимые фильтры `businessBlock`/`parameterType` для `parameterCode` и обратная фильтрация `parameterType` от `businessBlock` с fallback на полный список при невалидном фильтре. Подтверждения `param-create`/`param-update` переведены на широкие модальные окна в общем стиле панели. |
