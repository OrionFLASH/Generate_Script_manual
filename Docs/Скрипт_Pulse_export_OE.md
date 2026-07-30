# Скрипт выгрузки из Пульс (`Pulse_export_OE.js`)

## 1. Назначение

DevTools-скрипт для **hr.ca.sbrf.ru (Пульс)**: последовательный сценарий **OE** —

1. **multiSearch** (`category=PERSONS`) по списку запросов;
2. сбор уникальных **`personUuid`**;
3. **mainInfo_v1** по каждому UUID;
4. сохранение JSON и чернового CSV.

Образец поведения — [AddressBook_export_OE.js](Скрипт_AddressBook_export_OE.md). Финальный набор полей JSON/CSV пользователь уточнит отдельно; сейчас сохраняется полный ответ API + компактный профиль в CSV.

## 2. Запуск

- Файл: `Script/Pulse_export_OE.js`. Копия для вставки: `./post_txt_sync.sh` → `POST/Pulse_export_OE.js.txt`.
- Открыть вкладку **Пульс** (сессия пользователя) → DevTools → Console → вставить скрипт → Enter.
- Панель: `id=pulseExportOePanelRoot`.
- Запросы с **`credentials: "include"`**, origin — вкладки (fallback `https://hr.ca.sbrf.ru`).

## 3. API (по HAR `hr.ca.sbrf.ru.har`)

| Метод | Путь | Назначение |
|-------|------|------------|
| GET | `/api-web/globalsearch/api/v3/multiSearch?query=…&page=…&size=20&category=PERSONS` | Поиск сотрудников |
| GET | `/api-mobile/smart-profile/web/widgets/data?widgets=mainInfo_v1&userId={personUuid}` | Карточка |

### Важно про `size`

В HAR UI при наборе текста шлёт несколько multiSearch: **size=8** и **size=5** (несколько `category`) и затем **size=20** только с **`category=PERSONS`**.  
**`size` не равен длине query** — для выгрузки фиксируем **`size=20`**, как у полного списка PERSONS.

ID в поиске: **`personUuid`** в `data.PERSONS.data.content[]`.

Пагинация: `page=0…N` по `totalPages` / `last`. На панели — лимит **макс. страниц** (по умолчанию 50; для широких запросов вроде «Директор» API отдаёт до ~50 страниц).

## 4. Сценарий OE

1. Разбор поля/файла: разделители `\n`, `;`, `,`.
2. Для каждого query — все страницы multiSearch (с паузой между страницами).
3. Сохранение Search JSON (если отмечено).
4. Пауза «после Search».
5. Для каждого уникального `personUuid` (порядок первого появления) — mainInfo_v1.
6. Сохранение mainInfo / full / profile.csv по чекбоксам.

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
- Кнопка **«Стоп»** — мягкая остановка очереди.

## 6. UI

- Статус-бар: какой поиск / страница / UUID / прогресс.
- Журнал работы + DevToolsTrace (`scriptId=Pulse_export_OE`).
- Чекбоксы: какие файлы сохранять (Search / mainInfo / full / CSV).
- Параметры: паузы, база retry, maxPages.
- Кнопки: **Search → mainInfo**, **Стоп**, загрузка `.txt` в поле, **Закрыть панель**.

## 7. Ключевые функции

| Имя | Назначение |
|-----|------------|
| `getPulseOrigin` | Origin вкладки или fallback |
| `parseQueriesFromText` | Разбор списка query |
| `buildMultiSearchUrl` / `buildMainInfoUrl` | URL запросов |
| `fetchJsonWithRetry` | GET + до 3 попыток, удлиняющаяся пауза |
| `parsePersonsBlock` / `personUuidFromHit` | Разбор PERSONS и UUID |
| `extractMainInfoData` / `pickSearchHit` / `pickMainInfo` | Компактные поля для CSV |
| `buildCsv` | CSV `;`, UTF-8 BOM |
| `runOeExport` | Полный пайплайн OE |
| `startPulsePanel` | Панель `pulseExportOePanelRoot` |

## 8. CSV (черновик колонок)

Порядок: `searchedQuery`, `personUuid`, поля поиска (`employeeId_search`, `fullName_search`, …), поля mainInfo (`tabNumber`, ФИО, linear/agile, контакты, опыт, schedule, badges, `profTags`, …), `mainInfoOk`, `mainInfoError`.  
Финальный набор колонок будет уточнён отдельно.

## 9. История версий документа

| Версия | Дата | Изменения |
|--------|------|-----------|
| 1.0 | 2026-07-30 | Первый выпуск по HAR/ToDo Пульс: multiSearch PERSONS size=20 → mainInfo_v1, JSON+CSV, retry |
