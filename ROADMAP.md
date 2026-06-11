# ROADMAP — Generate Script Manual

Единый план по **всем скриптам** репозитория, вспомогательным файлам и документации. Детализация: **файл скрипта** → **логические блоки внутри файла** → **подпункты** (функции, сценарии UI, форматы выгрузки).

## Как читать статусы здесь

- **`[v]` в § 1–7** — поведение **уже реализовано** в указанном `Script/*.js` (и обычно отражено в README / `Docs/`).
- **`[ ]` в § 0.1–0.2** — не «отсутствующий код», а **регламент сопровождения** репозитория (сверять списки, обновлять документы при появлении новых файлов).
- **`[ ]` в § 6.3 и части § 7.6** — **опциональные** улучшения или напоминание поддерживать документ в актуальном виде после крупных правок краулера.

## Легенда статусов

| Статус | Значение |
|--------|----------|
| `[v]` | Сделано |
| `[w]` | В работе / требует доработки |
| `[ ]` | Не сделано |
| `[x]` | Отменено |

---

## 0. Репозиторий и инфраструктура (не `Script/`)

### 0.1 Корень проекта

- `[v]` **README.md** — описание структуры, ссылка на [Docs/Справочник_скрипты_HTTP_запросы_и_последовательность.md](Docs/Справочник_скрипты_HTTP_запросы_и_последовательность.md), перечень скриптов, история версий репозитория.
  - `[v]` Периодическая сверка списка скриптов в README с фактическим содержимым `Script/*.js` (сейчас **10** файлов, включая `SUP_Config_Update.js`).
  - `[ ]` При появлении нового скрипта — добавить строку в README, строку в справочник, подраздел в этом ROADMAP.

- `[v]` **ROADMAP.md** (этот файл) — декомпозиция по модулям и внутренним слоям скриптов.
  - `[ ]` По мере крупных изменений в скриптах — обновлять соответствующие подпункты и статусы.

- `[v]` **post_txt_sync.sh** — сборка текстовых копий для каталога `POST/` (суффикс `.txt` в имени файла).
  - `[ ]` Документировать в README любые новые шаблоны копируемых путей (если появятся).

- `[v]` **post.txt** — шаблон запроса на пересборку `POST/` (файл в корне); при смене процедуры обновлять текст.
  - `[ ]` Ревизия шаблона при изменении правил сборки `POST/`.

### 0.2 Каталоги

- `[v]` **Docs/** — для скриптов с HTTP-выгрузкой есть отдельные `Docs/*.md`; для **`UI_AutoTest.js`** описание в HTTP-справочнике.
  - `[ ]` После каждого значимого изменения скрипта — сверять профильный документ и справочник с кодом.
  - `[ ]` При добавлении нового `Script/*.js` — новый `Docs/*.md` или явная отсылка в существующий документ + строка в README и здесь.

- `[ ]` **ToDo/** — черновики задач; перенос выполненного в ROADMAP/README и пометка в ToDo.

- `[ ]` **log/** — при появлении серверных/CLI-утилит с логами — согласовать формат имён и уровней с правилами проекта.

- `[x]` **POST/** — не в git; только локальная сборка через `post_txt_sync.sh`.

---

## 1. `Script/Profile_GP_LOAD_file.js`

**Сопутствующий файл документации:** [Docs/Скрипт_загрузка_профиля_герои.md](Docs/Скрипт_загрузка_профиля_герои.md)

### 1.1 Конфигурация и окружение

- `[v]` Константы стендов/контуров (`PROFILE_ORIGINS`, ключи стенда и контура).
  - `[v]` Сверка fallback при неизвестном `window.location.origin`.
  - `[v]` Отображение на панели фактического `origin` и выбранной пары стенд/контур.

### 1.2 Разбор ввода

- `[v]` Табельные из textarea, из `TAB_NUMS`, из файла `.txt` (`parseEmpIdsFromText` / нормализация).
  - `[w]` Регрессия граничных случаев (пустой `.txt`, нецифровой мусор, дубликаты ТН) — по чеклисту при изменениях разбора ТН.

### 1.3 Сетевой слой

- `[v]` `POST` профиля: тело `{ employeeNumber }`, заголовки для контура SIGMA (если актуально).
  - `[v]` Обработка HTTP-ошибок и `success: false` в JSON.
  - `[v]` Retry и паузы с панели.

### 1.4 Медиа и выгрузка

- `[v]` Извлечение `photoData` / `photoDataKpk`, Blob, ссылки «Скачать».
- `[v]` Итоговый JSON выгрузки и журнал на панели.

### 1.5 UI-панель

- `[v]` Создание/удаление корня панели, блокировка параллельных прогонов.
- `[v]` Три кнопки запуска в один ряд; закрытие и сброс состояния.

---

## 2. `Script/File_DB_Load_GP.js`

**Сопутствующий файл документации:** [Docs/Скрипт_выгрузка_файлов_gamification_File_DB_Load_GP.md](Docs/Скрипт_выгрузка_файлов_gamification_File_DB_Load_GP.md)

### 2.1 Конфигурация задач

- `[v]` Таблица/массив задач `file-download`: пути, тела по умолчанию, подписи кнопок.
  - `[ ]` Основные три задачи + рейтинг + заказы — не расходиться с документом без отражения в Docs.

### 2.2 Окружение

- `[v]` Выбор стенда × контура, автоопределение по `window.location.origin`.
- `[v]` Индикатор `POST <origin>` на панели.

### 2.3 Пакетная отправка

- `[v]` Последовательный режим и режим с перекрытием; паузы; чтение с панели.
- `[v]` Поле даты наград (`dateFrom`) и подстановка в тело запросов, где требуется.

### 2.4 Обработка ответа

- `[v]` Бинарное сохранение файла; ветка JSON с `success: false` при HTTP 200 — не сохранять файл, писать в журнал.

### 2.5 UI-панель

- `[v]` Чекбоксы задач, «Отметить всё» / «Снять», сводка `(отмечено: N)`.
- `[v]` `fileDlDetachPanelAndResetRuntime` при «Закрыть»; повторная вставка IIFE без конфликта имён.
- `[v]` Дефолтные отметки: все задачи отмечены, кроме `orders_KMKKSB_ALLSEASONS` и `orders_MNS_NONSEASON` (`FILE_DL_DEFAULT_UNCHECKED_JOB_IDS`).
- `[v]` Скользящий старт включён по умолчанию (`staggerCb.checked = true`, сброс при «Закрыть»).
- `[v]` Паузы по умолчанию: `DOWNLOAD_ALL_DELAY_MS = 100`, `DOWNLOAD_STAGGER_MS = 300`.

---

## 2A. `Script/File_DB_Load_GP_v2.js`

**Сопутствующий файл документации:** [Docs/Скрипт_выгрузка_файлов_gamification_File_DB_Load_GP_v2.md](Docs/Скрипт_выгрузка_файлов_gamification_File_DB_Load_GP_v2.md)  
**ТЗ / декомпозиция:** [ToDo/ToDo_File_DB_панель_выбор_скачивания.md](ToDo/ToDo_File_DB_панель_выбор_скачивания.md)

### 2A.1 Конфигурация задач

- `[v]` `FILE_DL_RATING_BLOCKS_CONFIG` — 10 businessBlock, сезоны `timePeriod`, `defaultChecked` блока.
  - `[v]` `buildRatingGroupJobsFromConfig()` → `RATING_GROUP_JOBS` (20 задач при текущем конфиге).
  - `[v]` `FILE_DL_RATING_UI_ROWS` — две строки на панели: `KMKKSB, AKMKKSB, CSM, MNS` / `SERVICEMEN…RSB1`.
- `[v]` `FILE_DL_ORDERS_BLOCKS_CONFIG` — KMKKSB + MNS, `listTypes`, `defaultChecked`.
  - `[v]` `buildOrdersGroupJobsFromConfig()` → `ORDERS_GROUP_JOBS` (10 задач).
- `[v]` Основные выгрузки: 4 задачи, включая **`yearResultsCsv`** (`year-result/file-download`).
- `[v]` `isFileDlJobCheckedByDefault(job)` — `FILE_DL_*_DEFAULT_UNCHECKED_JOB_IDS` + `_blockDefaultChecked`.

### 2A.2 Окружение

- `[v]` Как v1: `STAND_ORIGINS`, автоопределение, индикатор `POST <origin>`.
- `[v]` id панели `fileDlGamificationPanelRootV2`, заголовок «Скачивание v2 · …».

### 2A.3 Пакетная отправка

- `[v]` Только **`downloadCheckedPanelJobs`** из UI («Скачать выделенное»).
- `[v]` Последовательный режим и перекрытие; паузы; `dateFrom` для наград.
- `[v]` Нет кнопок одиночного скачивания и «Все N (рейтинг/заказы)» на панели.

### 2A.4 Обработка ответа

- `[v]` Как v1: бинарное сохранение; JSON `success: false` при HTTP 200 — не сохранять.

### 2A.5 UI-панель

- `[v]` Основные — один ряд по центру (4 чекбокса).
- `[v]` Заказы — KMKKSB / MNS в одну строку, listType в 2 колонки.
- `[v]` Рейтинг — 2 строки блоков; `calcRatingRowMinHeightPx`, сезоны в 1 колонку, `fillRowHeight`.
- `[v]` Кнопки **✓ Отметить всё** / **⛔ Снять** / **↺ По умолчанию** после выбора контура.
- `[v]` Сводка `(отмечено: N)`; журнал; сброс при «Закрыть».

### 2A.6 Документация и сопровождение

- `[v]` Профильный документ v2 в `Docs/`.
- `[v]` Строка в README, § 2A здесь, § 2A в HTTP-справочнике.
- `[ ]` Accordion для длинных секций (опционально, см. ToDo § 8 Q.4).
- `[ ]` Расширение `FILE_DL_ORDERS_BLOCKS_CONFIG` на другие businessBlock.
- `[w]` Сверка `refererPath` для `yearResultsCsv` на всех стендах.

---

## 3. `Script/AddressBook_export.js`

**Сопутствующий файл документации:** [Docs/Скрипт_AddressBook_export.md](Docs/Скрипт_AddressBook_export.md)

### 3.1 Origin и API

- `[v]` `getAddressBookStandAndOrigin`, fallback `ADDRESSBOOK_ORIGINS.ALPHA`, базовый путь `/api/home`.

### 3.2 POST `employees/search`

- `[v]` `fetchEmployeesSearch`: число vs строка в `searchText`, пагинация `pageToken`.
- `[v]` `fetchAllSearchPages`: лимиты страниц, обработка повторяющегося токена, учёт `hits` в `data` и `data.body`.

### 3.3 GET `empInfoFull`

- `[v]` `fetchEmpInfoFull(empId)` — UUID, не табельный номер.

### 3.4 Сценарий «Search → empInfoFull»

- `[v]` Фаза 1: все поиски по списку; пауза «между запросами» между POST.
- `[v]` Сохранение `addressbook_search_*.json` и CSV `что искали,employeeId` (строка на каждый hit, BOM).
- `[v]` Пауза после всех Search перед первым GET.
- `[v]` Фаза 2: уникальные UUID в порядке первого появления; паузы между GET.
- `[v]` Итоговый `addressbook_empInfoFull_*.json` со ссылками на файлы фазы 1.

### 3.5 Сценарии «Только Search» / «Только empInfoFull»

- `[v]` Разбор входа по режиму табельный / строка поиска; только JSON выгрузки.

### 3.6 UI-панель

- `[v]` Режимы разбора, шесть кнопок (поле + файл), журнал, поля пауз.

### 3.7 Вспомогательные функции

- `[v]` `pickEmployeeIdsFromSearchData`, `collectEmployeeIdsFromSearchPagesInHitOrder`, `uniqueEmployeeIdsFirstOccurrence`.
- `[v]` `downloadJson`, `downloadText`, `escapeCsvField`.

---

## 3A. `Script/AddressBook_export_OE.js`

**Сопутствующий файл документации:** [Docs/Скрипт_AddressBook_export_OE.md](Docs/Скрипт_AddressBook_export_OE.md)

Расширение § 3: полная копия v1 + сценарий OE. Панель `addressBookExportOePanelRoot`.

### 3A.1 GET `/departments/{id}`

- `[v]` `fetchDepartmentById`, кэш `Map` на прогон, ошибки не прерывают пайплайн.

### 3A.2 Сценарий «Search → empInfoFull → OE»

- `[v]` Три фазы: Search → empInfoFull (уникальные UUID) → departments по `deptTree`.
- `[v]` Три паузы: между запросами, после Search, после empInfoFull.
- `[v]` Файлы `PROM_ALPHA_AB_*_YYYYMMDD_HHMM`: Search, empInfoFull, deptTree_id (`byId` + `byEmployeeLinks`), full.
- `[v]` Тоггл «Структура форматированная» (по умолчанию вкл.) → `AB_profile.json` + `AB_profile.csv` (1 строка / employeeId).

### 3A.3 UI OE

- `[v]` Второй ряд кнопок: поле и файл «Search → empInfoFull → OE», чекбокс форматирования.

### 3A.4 POST-сборка

- `[v]` `post_txt_sync.sh` — `AddressBook_export_OE.js` в `PROD_SCRIPTS`.

---

## 4. `Script/Parameters_Actual_Export.js`

**Сопутствующий файл документации:** [Docs/Скрипт_выгрузка_актуальных_параметров_Parameters_Actual_Export.md](Docs/Скрипт_выгрузка_актуальных_параметров_Parameters_Actual_Export.md)

### 4.1 Окружение и вкладки

- `[v]` Стенд × контур, автоопределение, индикатор `POST <origin>`.
- `[v]` Три вкладки: выгрузка, создание (`param-create`), редактирование (`param-update`).

### 4.2 Общая загрузка справочников

- `[v]` Кнопка «Загрузить параметры»; кэши ACTUAL, кодов, типов, `businessBlock`, карты связей.
  - `[v]` Различие логики списков для вкладки «Создание» vs «Редактирование» (шаг 1 / шаг 2).

### 4.3 Вкладка выгрузки

- `[v]` Цепочка `status` → `objectIds` → детализация; паузы; итоговый JSON.

### 4.4 Вкладка создания

- `[v]` Форма и файл; валидация; модальное подтверждение payload.
- `[v]` Fallback-списки `businessBlock` и типов.

### 4.5 Вкладка редактирования

- `[v]` Фильтры `businessBlock` / `parameterType` / `parameterCode`; datalist и picker (при наличии в коде).
- `[v]` Проверка комбинации `objectId + parameterCode + version`; сравнение «было/стало»; сокращённый payload при смене только `status`.
- `[v]` Кнопка «Сформировать шаблон Payload» (`🧩`): объединение ACTUAL + ARCHIVE, детализация по id.

### 4.6 Разбор JSON из файла

- `[v]` Нормализация висячих запятых; диагностика позиции ошибки.
- `[v]` Repair loose JSON (неэкранированные кавычки) при включённом автоэкранировании.
- `[v]` `parameterValue` как объект `{…}` в файле → `JSON.stringify` перед POST.

### 4.7 Валидация и preflight

- `[v]` `JSON.parse(parameterValue)` перед POST (форма и файл).
- `[v]` Preflight всего файла до confirm/POST — при ошибке ничего не отправляется.

### 4.8 Шаблон и фильтры

- `[v]` Фильтр `parameterType` для `🧩 Сформировать шаблон Payload` (пустой = все типы); `⬇ Загрузить параметры` без фильтра.

### 4.9 UI

- `[v]` Верхняя строка действий по контексту вкладки; модальные окна широкого формата.
- `[v]` Тоггл «Автоэкранирование кавычек» на вкладках создания и редактирования.

---

## 5. `Script/Tournament_LeadersForAdmin.js`

**Сопутствующий файл документации:** [Docs/Скрипт_турниры_leadersForAdmin.md](Docs/Скрипт_турниры_leadersForAdmin.md)

### 5.1 Конфигурация

- `[v]` `TOURNAMENT_BASE`, ключи стендов и контуров, автоопределение окружения.
- `[v]` Дефолтный текст поля кодов турниров.

### 5.2 Сбор кодов

- `[v]` Textarea, `.txt`, CSV с выбором колонки и фильтром статусов по кнопкам SHEDULE/LIST.

### 5.3 GET `leadersForAdmin`

- `[v]` Формирование URL; обработка успеха и вложенных ошибок (`body.tournament.error`).
- `[v]` Запись «0 участников»; отказ от скачивания пустого `{}`.

### 5.4 Экспорт

- `[v]` JSON; CSV с общим выбором колонок (`<select>` + «Другой…»).
- `[v]` Пауза между турнирами; префикс имени файла.

### 5.5 UI-панель

- `[v]` IIFE, журнал, блокировка повторного запуска.

---

## 6. `Script/News_Community_Export.js`

**Сопутствующий файл документации:** [Docs/Скрипт_новости_community_News_Community_Export.md](Docs/Скрипт_новости_community_News_Community_Export.md)

### 6.1 Конфигурация

- `[v]` `NEWS_ORIGINS`, стенды/контуры, автоопределение по `window.location.origin`.
- `[v]` Справочники `NEWS_STATUS_OPTIONS` и `NEWS_TAG_OPTIONS` (чекбоксы на панели, без ручного ввода).

### 6.2 POST `/proxy/v1/news`

- `[v]` Пагинация: `pageNum`, остановка по `isLast` и `total`.
- `[v]` Объединение `timePeriod[].news` в `merged`.

### 6.3 Экспорт

- `[v]` JSON: `exportMeta`, `pages`, `merged`.
- `[v]` CSV: строки `leaders` / `authors` + поля новости, без `colorCode` / `tags`.

### 6.4 UI-панель

- `[v]` IIFE, журнал, две кнопки (JSON / JSON+CSV), блокировка повторного запуска.
- `[v]` Валидация: хотя бы один `newsStatus` и одна пара `newsTagList` перед POST.

---

## 7. `Script/UI_AutoTest.js`

**Профильный документ в `Docs/`:** отсутствует (краткое описание — в [Справочник](Docs/Справочник_скрипты_HTTP_запросы_и_последовательность.md), раздел 6).

### 7.1 Назначение

- `[v]` Последовательный клик по фиксированному списку `MENU_HREFS` (основное и admin-меню).
- `[v]` Ожидание загрузки (`document.readyState`, смена URL, таймаут); паузы `STEP_DELAY_MS`.

### 7.2 Логирование

- `[v]` Консоль: OK / НЕ OK по шагам, итоговые счётчики.

### 7.3 Дальнейшее развитие (опционально)

- `[ ]` Вынести `MENU_HREFS` и тайминги на читаемый конфиг (если появится общий `config.json` для браузерных скриптов — согласовать формат).
- `[ ]` При необходимости — отдельный `Docs/Скрипт_UI_AutoTest.md` с таблицей href и ограничениями SPA.

---

## 8. `Script/UI_AutoTest_LinksCrawler.js`

**Сопутствующий файл документации:** [Docs/Скрипт_UI_AutoTest_LinksCrawler.md](Docs/Скрипт_UI_AutoTest_LinksCrawler.md)

### 8.1 Жизненный цикл панели

- `[v]` IIFE; удаление предыдущей панели; компактный режим на время этапа; кнопка «Остановить».

### 8.2 Этап 1

- `[v]` Скан ссылок на текущей странице; ручной выбор; запуск кликов по `<a>`.

### 8.3 Этапы 2..N

- `[v]` Автосбор дочерних ссылок с успешных узлов; группировка по родителю на этапах `>1`; каскад чекбоксов.

### 8.4 Статусы и дерево

- `[v]` `OK` / `FAIL` / `SKIPPED`; вывод дерева в консоль; при остановке — дерево проблемных узлов.

### 8.5 Лимиты и устойчивость

- `[v]` Лимиты на этап/родителя/рендер UI; кнопка сброса лимитов.
- `[v]` Лог в файл (File System Access API), восстановление из `sessionStorage`.
- `[v]` Прокрутка панели без прокрутки фоновой страницы.

### 8.6 Документация

- `[v]` [Docs/Скрипт_UI_AutoTest_LinksCrawler.md](Docs/Скрипт_UI_AutoTest_LinksCrawler.md) — полное описание этапов, лимитов, лога и остановки.
- `[ ]` После существенных правок `UI_AutoTest_LinksCrawler.js` — сверять документ с кодом (разделы этапов, лимиты, форматы вывода).

---

## 10. `Script/SUP_Config_Update.js`

**Сопутствующий файл документации:** [Docs/Скрипт_SUP_Config_Update.md](Docs/Скрипт_SUP_Config_Update.md)

Обновление параметров СУП (UFS Config Manager) через pacman REST. Панель `sup-config-update-panel`.

### 10.1 Окружение и API

- `[v]` Auto-detect origin / API prefix / referer с вкладки ufs-config-manager + ручной ввод.
- `[v]` Заголовки: `cfg-rn` = tenant, `x-cfga-location` = `""`.
- `[v]` GET `tenantCodes`, POST `parameter/list`, `parameter/data/export`, `parameter/bundle/list`, `parameter/value/add`.

### 10.2 Вкладки и форматы

- `[v]` Payload — ручной JSON, lookup parameterId, values из `.txt`.
- `[v]` Файл export — EXPORT[] / ADD_READY / JOB; чекбоксы bundle; name→code в path.
- `[v]` Скачать с сервера — export API, preview, сохранение JSON.

### 10.3 Безопасность и очередь

- `[v]` Dry-run по умолчанию; пауза 500 ms; кнопка «Стоп».
- `[v]` Diff с активным bundle; UI-блок id/active/createDate.
- `[v]` Откат из сохранённого export; диалог continue/stop при ошибке batch.
- `[v]` Предупреждение о полной замене values.

### 10.4 POST-сборка

- `[v]` `post_txt_sync.sh` — автоматически все `Script/*.js`.

---

## 9. Сводная таблица «скрипт ↔ документ ↔ раздел ROADMAP»

| Файл `Script/` | Основной документ `Docs/` | Раздел ROADMAP |
|----------------|----------------------------|----------------|
| `Profile_GP_LOAD_file.js` | Скрипт_загрузка_профиля_герои.md | § 1 |
| `File_DB_Load_GP.js` | Скрипт_выгрузка_файлов_gamification_File_DB_Load_GP.md | § 2 |
| `File_DB_Load_GP_v2.js` | Скрипт_выгрузка_файлов_gamification_File_DB_Load_GP_v2.md | § 2A |
| `AddressBook_export.js` | Скрипт_AddressBook_export.md | § 3 |
| `AddressBook_export_OE.js` | Скрипт_AddressBook_export_OE.md | § 3A |
| `Parameters_Actual_Export.js` | Скрипт_выгрузка_актуальных_параметров_Parameters_Actual_Export.md | § 4 |
| `Tournament_LeadersForAdmin.js` | Скрипт_турниры_leadersForAdmin.md | § 5 |
| `News_Community_Export.js` | Скрипт_новости_community_News_Community_Export.md | § 6 |
| `UI_AutoTest.js` | — (справочник) | § 7 |
| `UI_AutoTest_LinksCrawler.js` | Скрипт_UI_AutoTest_LinksCrawler.md | § 8 |
| `SUP_Config_Update.js` | Скрипт_SUP_Config_Update.md | § 10 |

**Общий HTTP-справочник:** [Docs/Справочник_скрипты_HTTP_запросы_и_последовательность.md](Docs/Справочник_скрипты_HTTP_запросы_и_последовательность.md)

---

*Базовая функциональность скриптов в § 1–8 и § 2A отмечена `[v]` по состоянию репозитория; пункты `[ ]` в § 0 и в опциональных подразделах — про сопровождение и дальнейшие улучшения, а не о «незавершённом» коде.*
