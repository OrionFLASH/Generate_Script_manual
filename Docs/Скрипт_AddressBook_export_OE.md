# Скрипт выгрузки из адресной книги OE (`AddressBook_export_OE.js`)

## 1. Назначение

Расширение [AddressBook_export.js](Скрипт_AddressBook_export.md): все три сценария v1 сохранены без изменений плюс новый пайплайн **Search → empInfoFull → OE** — после карточек сотрудников выполняются GET **`/api/home/departments/{id}`** по узлам `deptTree` из **empInfoFull**.

Файл v1 **не изменяется**; для OE используется отдельный скрипт.

## 2. Запуск

- Файл: `Script/AddressBook_export_OE.js`. Копия для вставки — через `post_txt_sync.sh` → `POST/AddressBook_export_OE.js.txt`.
- DevTools → Console → вставить скрипт → Enter.
- Панель: `id=addressBookExportOePanelRoot`, заголовок «Адресная книга — выгрузки (OE)».
- Origin и сессия — как в v1 (`credentials: "include"`, приоритет origin вкладки).

## 3. API (дополнительно к v1)

| Метод | Суффикс | Назначение |
|-------|---------|------------|
| GET | `/departments/{id}` | Оргединица по id из `deptTree[]` ответа empInfoFull |

## 4. Сценарий OE

1. **Search** — POST `/employees/search` по каждому значению ввода (с пагинацией).
2. Пауза «после всех Search».
3. **empInfoFull** — GET по каждому **уникальному** `employeeId` (порядок первого появления).
4. Пауза «после empInfoFull» (отдельное поле на панели).
5. **departments** — для каждого сотрудника id из `deptTree`; кэш Map на прогон (один GET на id). Ошибки departments не останавливают прогон.

### Имена файлов

Префикс **`PROM_ALPHA_`**, суффикс timestamp **`YYYYMMDD_HHMM`** (локальное время, один на прогон):

| Файл | Содержимое |
|------|------------|
| `PROM_ALPHA_AB_Search_<ts>.json` | Ответы всех POST search |
| `PROM_ALPHA_AB_empInfoFull_<ts>.json` | Результаты GET empInfoFull |
| `PROM_ALPHA_AB_deptTree_id_<ts>.json` | `byId` (кэш ответов) + `byEmployeeLinks` |
| `PROM_ALPHA_AB_full_<ts>.json` | Связанное дерево search → hit → emp → departments |
| `PROM_ALPHA_AB_profile_<ts>.json` | Форматированный профиль (если тоггл вкл.) |
| `PROM_ALPHA_AB_profile_<ts>.csv` | Таблица: одна строка на employeeId, UTF-8 BOM |

На панели — **отдельный чекбокс на каждый файл** (по умолчанию все включены). Снятый чекбокс — файл не сохраняется.

**CSV `AB_profile.csv`:** разделитель **`;`**, колонка **`TN_8`** после `fullName` (tabNum до 8 знаков с ведущими нулями; если >8 — без изменений). Вложенные массивы: порядок полей по индексу `(01)`, `(02)`… — `emails`: `address`, `domain`, `isMain`; `phones`: `type`, `phoneNumber`, `main`; `deptTree` — `id`, `name`, `orgUnit` на каждый индекс.

Дополнительные скалярные колонки (актуальная схема API Search / empInfoFull): `organizationName`, `regionalBankName`, `searchIsAgile`, `searchIsFos`, `search absenceInfo - *`, `contactEmail`, `empAddress`, `empPlace`, `empRoom`, `profileLink`, `isAgile`, `isFos`, `isRemote`, `innerPhoneState`, `absences - typeId` и др.

CSV фазы Search (не OE): `addressbook_search_employeeId_map_*.csv` — разделитель **`,`**, колонки `что искали`, `employeeId` (по каждой строке hit).

Фаза Search сценария **Search → empInfoFull** (`addressbook_search_*.json`): в каждом элементе `items[]` — агрегированный массив **`hits[]`** (как в `PROM_ALPHA_AB_Search_*`) и флаг **`notFound`**.

Сценарии **только Search** / **только empInfoFull** — объект с метаданными (не корневой массив):

| Файл | Корень JSON |
|------|-------------|
| `addressbook_search_only_*` | `{ exportedAt, scenario: "search_only", stand, items[] }` — в item: `hits[]`, `notFound` |
| `addressbook_empInfoFull_only_*` | `{ exportedAt, scenario: "empInfoFull_only", stand, results[] }` |

В **`results[]`** сценария «только empInfoFull» и во **`results`** комбинированного сценария: **`employeeId`** — UUID из ответа (из `profileLink` / `photo`, если GET был по таб. номеру); при расхождении с запросом — поле **`requestedEmpId`**. В журнале: `запрос «00673892» → UUID …`.

**AB_profile.json / AB_profile.csv** — только кнопка **«Search → empInfoFull → OE»** (на панели — подсказка у чекбоксов OE).

Искомые значения **без hit** в Search сохраняются в структуре с полями **`не найдено`**.

Запросы **empInfoFull** и **departments** — только по **уникальным** id (кэш на прогон).

## 5. Панель (UI)

Как v1, плюс:

- Третье поле паузы: **после empInfoFull** перед departments.
- Четвёртая кнопка файла: **Файл: Search → empInfoFull → OE**.
- Второй ряд кнопок: **Search → empInfoFull → OE** (из поля).
- Шесть чекбоксов **какие файлы OE сохранять** (Search, empInfoFull, deptTree_id, full, profile.json, profile.csv).

## 6. Ключевые функции (OE)

| Имя | Назначение |
|-----|------------|
| `fetchDepartmentById(deptId)` | GET departments |
| `extractDeptTreeNodes(empBody)` | id/name из `deptTree` |
| `formatExportTimestampLocal`, `buildOeExportFileName` | Timestamp и имена `PROM_ALPHA_AB_*` |
| `pickSearchHitFormatted`, `pickEmpInfoFormatted`, `pickDeptOrgUnit` | Поля для profile/CSV |
| `resolveEmployeeIdFromEmpInfoFull`, `describeEmpInfoFullResponse` | UUID из ответа empInfoFull; строка журнала |
| `collectSearchHitsFromPages` | Агрегированный `hits[]` из страниц search |
| `flattenArrayColumnsForCsv`, `csvRowFromOrderedKeys` | CSV с колонками `(01)(02)…` |
| `runSearchEmpInfoFullOeExport(...)` | Полный пайплайн OE |

## 7. История версий документа

| Версия | Дата | Изменения |
|--------|------|-----------|
| 1.0 | 2026-05-22 | Первая версия OE-сценария |
| 1.1 | 2026-05-22 | CSV `;`, колонка TN_8, порядок вложенных полей, чекбоксы по файлам, «не найдено», дедуп запросов |
| 1.2 | 2026-07-01 | Поля Search/empInfoFull под актуальный API: organizationName, absenceInfo, contactEmail, absences.commonAbsence, isMain/main в массивах |
| 1.3 | 2026-07-03 | hits[] в addressbook_search; обёртка search_only/empInfoFull_only; UUID в employeeId; подсказки profile OE и Trace |
