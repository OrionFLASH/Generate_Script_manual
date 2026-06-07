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

При **выключенном** тоггле «Структура форматированная» сохраняются только сырые файлы и `AB_full` (без profile).

## 5. Панель (UI)

Как v1, плюс:

- Третье поле паузы: **после empInfoFull** перед departments.
- Четвёртая кнопка файла: **Файл: Search → empInfoFull → OE**.
- Второй ряд кнопок: **Search → empInfoFull → OE** (из поля).
- Чекбокс **«Структура форматированная»** — по умолчанию **включён**.

## 6. Ключевые функции (OE)

| Имя | Назначение |
|-----|------------|
| `fetchDepartmentById(deptId)` | GET departments |
| `extractDeptTreeNodes(empBody)` | id/name из `deptTree` |
| `formatExportTimestampLocal`, `buildOeExportFileName` | Timestamp и имена `PROM_ALPHA_AB_*` |
| `pickSearchHitFormatted`, `pickEmpInfoFormatted`, `pickDeptOrgUnit` | Поля для profile/CSV |
| `flattenArrayColumnsForCsv`, `csvRowFromOrderedKeys` | CSV с колонками `(01)(02)…` |
| `runSearchEmpInfoFullOeExport(...)` | Полный пайплайн OE |

## 7. История версий документа

| Версия | Дата | Изменения |
|--------|------|-----------|
| 1.0 | 2026-05-22 | Первая версия OE-сценария |
