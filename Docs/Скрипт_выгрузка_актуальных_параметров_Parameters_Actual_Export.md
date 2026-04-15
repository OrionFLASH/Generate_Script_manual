# Скрипт параметров: выгрузка, создание, правка (`Parameters_Actual_Export.js`)

## 1. Назначение

Скрипт запускается в консоли DevTools на странице приложения (с активной сессией) и открывает **одну панель** с **тремя вкладками**:

1. **Выгрузка** — двухшаговая выгрузка по выбранному статусу (`ACTUAL` / `ARCHIVE`), сохранение JSON на диск.
2. **Создание** — POST `…/proxy/v1/parameters/param-create` с телом `parameterCode`, `parameterType`, `parameterName`, `parameterValue` (форма или файл).
3. **Редактирование** — POST `…/proxy/v1/parameters/param-update` с теми же полями плюс `objectId`, `version` (берётся из API по `objectId`), `status` (форма или файл).

**Стенд** (`PROM` / `PSI`) и **контур** (`ALPHA` / `SIGMA`) выбираются **один раз над вкладками** и используются для всех операций.

Под строкой выбора отображаются базовый путь `POST …/parameters` и суффиксы `param-create` / `param-update`.

---

## 2. Поддерживаемые окружения

Таблица `origin` такая же, как для выгрузки:

- **Стенд:** `PROM` / `PSI`
- **Контур:** `SIGMA` / `ALPHA`

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
- Информационная строка с базовым URL и путями API.
- **Журнал работы** — сообщения по всем вкладкам; префиксы **`[Выгрузка]`**, **`[Создание]`**, **`[Редактирование]`** в зависимости от операции.
- Кнопка **«Закрыть панель»**.
- Во время длительной операции элементы панели блокируются.

**Смена стенда или контура** сбрасывает кэши:

- `cachedActualParameterCodes`, `cachedAllowedParameterTypes`;
- флаг **`editTabAllowedListsLoaded`** (вкладка «Редактирование»);
- селект **parameterType** на вкладке «Создание» — снова из **`PARAMETER_TYPE_OPTIONS`**;
- селекты **parameterCode** и **parameterType** на вкладке «Редактирование» — снова в «пустое» состояние (до повторной загрузки справочников).

---

## 5. Вкладка «1. Выгрузка»

### 5.1. Подготовка

1. Выбрать **стенд** и **контур**.
2. Выбрать **статус списка** для первого запроса: `ACTUAL` или `ARCHIVE`.
3. Задать **паузу в мс** между запросами детализации по каждому `objectId` (после первого списка).

### 5.2. Кнопка «Запустить выгрузка» — порядок запросов

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

### 6.2. Кнопка ⬇ рядом с `parameterType` (принудительное обновление)

**Назначение:** только обновить кэши и селект **parameterType на вкладке «Создание»** (`cType`). **`param-create` не вызывается.** Полный обход всех `objectId` **не** выполняется.

**Порядок запросов (всегда оба шага подряд):**

| Шаг | Запрос | Тело | Результат в скрипте |
|-----|--------|------|---------------------|
| 1 | `POST …/parameters` | `{ "status": "ACTUAL" }` | Заполнение **`cachedActualParameterCodes`** (все `parameterCode` из `body.parameters`) |
| 2 | `POST …/parameters` | `{ "objectIds": ["745250143248942718"] }` | Константа **`PARAMETER_TYPES_DETAIL_OBJECT_ID`**; из ответа ищется запись с **`parameterCode` = `parameterTypes`** (**`PARAMETER_TYPES_META_CODE`**); из **`parameterValue.types`** читаются допустимые типы → **`cachedAllowedParameterTypes`** и обновление **только селекта создания** `cType` |

**Журнал:** префикс **`[Создание]`**, шаги «1/2» и «2/2».

**Важно:** селекты **parameterCode** и **parameterType** на вкладке «3. Редактирование» этой кнопкой **не** заполняются — они обновляются только кнопкой ⬇ на вкладке 3 (см. раздел 7).

### 6.3. Внутренняя функция `ensureCachesForCreateOperation()` (без отдельной кнопки)

Вызывается **автоматически** перед:

- нажатием **«Создать параметр (param-create)»**;
- обработкой файла **«Создать из файла…»**.

**Логика (без лишних повторов POST ACTUAL):**

1. Если **`cachedActualParameterCodes` уже есть** (например, после кнопки ⬇ на вкладке 2) — **повторный `POST { status: ACTUAL }` не выполняется**; в журнал пишется, что коды берутся из кэша.
2. Если кэша кодов нет — выполняется **`POST { "status": "ACTUAL" }`** и заполняется **`cachedActualParameterCodes`**.
3. Если **`cachedAllowedParameterTypes`** уже непустой — **детализация по `PARAMETER_TYPES_DETAIL_OBJECT_ID` не повторяется**.
4. Если типов из API ещё нет — выполняется **один** `POST { "objectIds": ["…"] }` как в шаге 2 п. 6.2, обновляется **`cachedAllowedParameterTypes`** и селект **`cType`**.

### 6.4. Кнопка «Создать параметр (param-create)» — порядок действий

1. **`ensureCachesForCreateOperation()`** — см. п. 6.3 (при ошибке ACTUAL создание не продолжается).
2. Проверка полей и **`parameterType`** через **`validateCreatePayload`** (список допустимых: **`getParameterTypeAllowedValues()`** — после загрузки API из кэша, иначе из **`PARAMETER_TYPE_OPTIONS`**).
3. Проверка дубликата: если **`parameterCode`** уже есть в **`cachedActualParameterCodes`** — сообщение в журнал, переход на вкладку «Редактирование», **`param-create` не отправляется**.
4. Диалог подтверждения (код, тип, имя, фрагмент значения).
5. **Отмена** — в журнал: создание отменено, **`param-create` не вызывался**.
6. **ОК** — **`POST …/param-create`** с JSON телом из четырёх полей.
7. Успех при **`success === true`** в ответе; иначе в журнал — фрагмент ответа.

### 6.5. Кнопка «Создать из файла…» — порядок действий

1. **`ensureCachesForCreateOperation()`** — см. п. 6.3 (один раз на весь файл).
2. Чтение и разбор файла (**`parseJsonObjectsFromFileText`**):
   - один JSON-объект или массив;
   - NDJSON (непустая строка = один объект);
   - несколько объектов `{...}{...}` подряд (разбор по внешним `{`…`}` с учётом строк в кавычках).
3. Для каждой записи — **`validateCreatePayload`**; при первой ошибке — стоп, сообщение в журнал.
4. Исключение записей, **`parameterCode`** которых уже есть в **`cachedActualParameterCodes`** (в журнал — причина); если ничего не осталось — стоп.
5. Диалоги подтверждения (первая запись, затем опция «все остальные без подтверждений» или по одной).
6. Для каждой принятой записи: пауза **`PARAM_BATCH_REQUEST_GAP_MS`** (100 мс) между запросами (кроме первой), затем **`POST …/param-create`**.

---

## 7. Вкладка «3. Редактирование»

### 7.1. Поля и справочники до загрузки

- **`parameterCode`** и **`parameterType`** — это **`<select>`**, до первой загрузки допустимых значений показывают одну опцию-заглушку (нужно сначала нажать кнопку загрузки).
- **`objectId`**, **`parameterName`**, **`parameterValue`**, **`status`** — как раньше (ввод вручную или из файла для пакета).

### 7.2. Кнопка ⬇ на вкладке «Редактирование» (загрузка допустимых значений)

**Назначение:** только получить справочники для **двух селектов** и дальнейших проверок. **`param-update` не вызывается.**

**Порядок запросов** — тот же, что в п. 6.2 (два шага):

| Шаг | Запрос | Тело |
|-----|--------|------|
| 1 | `POST …/parameters` | `{ "status": "ACTUAL" }` |
| 2 | `POST …/parameters` | `{ "objectIds": ["745250143248942718"] }` |

**Журнал:** префикс **`[Редактирование]`**.

После успешного ответа по типам:

- заполняется селект **`parameterCode`** из множества **`cachedActualParameterCodes`** (все коды из списка ACTUAL, сортировка);
- заполняется селект **`parameterType`** из **`cachedAllowedParameterTypes`** (из `parameterTypes.types`), с пустой первой опцией «выберите тип».

Устанавливается флаг **`editTabAllowedListsLoaded = true`**. Если справочник типов из API пуст или неполный — флаг сбрасывается, селекты возвращаются к заглушкам.

**Побочный эффект:** функция детализации типов обновляет также селект **`parameterType` на вкладке «Создание»** (`cType`), т.к. используется общий кэш API.

### 7.3. Обязательное условие перед `param-update`

Кнопки **«Обновить параметр (param-update)»** и **«Обновить из файла…»** выполняют действия **только если** **`editTabAllowedListsLoaded === true`**. Иначе в журнал выводится сообщение: сначала нажать ⬇ на вкладке 3 и дождаться заполнения списков.

### 7.4. Кнопка «Обновить параметр (param-update)» — порядок действий

1. Проверка **`editTabAllowedListsLoaded`** (см. п. 7.3).
2. Сбор полей из формы; **`validateUpdatePayload`** (в т.ч. **`parameterCode`** должен входить в **`cachedActualParameterCodes`**, если справочники загружены).
3. **`POST …/parameters`** с **`{ "status": "ACTUAL" }`** — извлечение множества **`objectId`**.
4. Если введённый **`objectId`** не в списке — ошибка в журнал, **`param-update` не отправляется**.
5. **`POST …/parameters`** с **`{ "objectIds": [ "<objectId>" ] }`** — чтение **`version`** из ответа (первая запись).
6. На панели: строка «Версия из API для отправки: …».
7. Диалог подтверждения (objectId, version, код, тип, статус).
8. **Отмена** — без отправки, запись в журнал.
9. **ОК** — **`POST …/param-update`** с телом: `parameterCode`, `parameterType`, `parameterName`, `parameterValue`, `objectId`, **`version` из API**, `status`.

**Примечание:** поле `version` в объекте валидации для формы подставляется как **0** только для прохождения проверки; в API уходит версия из шага 5.

### 7.5. Кнопка «Обновить из файла…» — порядок действий

1. Проверка **`editTabAllowedListsLoaded`** (см. п. 7.3).
2. Разбор файла (как в п. 6.5).
3. Для каждой записи — **`validateUpdatePayload`**.
4. Диалоги подтверждения (аналогично созданию из файла).
5. Для каждой записи:
   - **`POST …/parameters`** `{ "status": "ACTUAL" }` — проверка наличия **`objectId`**;
   - **`POST …/parameters`** `{ "objectIds": [ "<objectId>" ] }` — **`version`**;
   - **`POST …/param-update`** с телом, где **`version`** всегда из API, **не из файла**.

Пауза **`PARAM_BATCH_REQUEST_GAP_MS`** между пакетными запросами к **`param-update`**.

---

## 8. Константы и функции (справочник)

| Имя | Назначение |
|-----|------------|
| `PARAMETER_TYPE_OPTIONS` | Справочник `{ value, label }` для `parameterType` на вкладке «Создание», пока нет API |
| `PARAMETER_TYPES_META_CODE` | Код мета-параметра (`parameterTypes`) |
| `PARAMETER_TYPES_DETAIL_OBJECT_ID` | Один `objectId` для детализации списка типов |
| `cachedAllowedParameterTypes`, `cachedActualParameterCodes` | Кэш типов из `parameterTypes.types` и кодов из списка ACTUAL |
| `editTabAllowedListsLoaded` | Флаг: на вкладке 3 выполнена загрузка справочников для селектов |
| `getParameterTypeAllowedValues` | Список для проверки `parameterType` |
| `fillParameterTypeSelect`, `fillParameterTypeSelectWithApiValues` | Заполнение селектов типов (на «Создание»; для правки — с опцией «пусто») |
| `fillParameterCodeSelectFromActualCodes`, `clearEditTabParameterSelects` | Селекты вкладки «Редактирование» |
| `fetchActualListAndCache`, `fetchParameterTypesDetailAndApply` | POST ACTUAL и детализация типов (журнал: тег `[Создание]` или `[Редактирование]`) |
| `ensureCachesForCreateOperation` | Условная подготовка кэшей перед созданием формы/файла |
| `refreshParameterTypesFromApi` | Кнопка ⬇ вкладки 2: всегда ACTUAL + детализация |
| `refreshEditTabAllowedListsFromApi` | Кнопка ⬇ вкладки 3: те же запросы + заполнение селектов `parameterCode`/`parameterType` |
| `extractParameterCodesFromListData`, `extractTypesFromParameterTypesDetail`, `hasParameterTypesMetaInDetail` | Разбор ответов API |
| `PARAM_BATCH_REQUEST_GAP_MS` | Пауза между последовательными create/update из файла (100 мс) |
| `PARAMETER_ORIGINS` | `origin` по стенду и контуру |
| `PARAMETERS_PATH`, `PARAM_CREATE_PATH`, `PARAM_UPDATE_PATH` | Пути API |
| `getOrigin`, `postJson`, `postParameters` | Запросы с `credentials: "include"` |
| `extractObjectIds` | Сбор `objectId` из ответа списка |
| `parseJsonObjectsFromFileText`, `parseJsonObjectsByBraceScan` | Разбор файла (объект / массив / строки / скобки с учётом строк) |
| `validateCreatePayload` / `validateUpdatePayload` | Проверка записей |
| `readVersionFromDetailResponse` | Чтение `version` из ответа по `objectIds` |
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
