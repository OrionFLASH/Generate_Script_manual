# DevToolsTrace — диагностический режим в скриптах

## Назначение

Во **всех** скриптах из `Script/*.js` добавлен переключатель **«Trace (диагностика → файл .log)»**.  
По умолчанию выключен — поведение как раньше. При включении записываются:

| Тип | Что попадает в trace |
|-----|----------------------|
| **HTTP** | URL, method, тело запроса, status, тело ответа (с усечением больших JSON) |
| **LOG** | все строки «Журнала работы» на панели |
| **UI** | клики по кнопкам, чекбоксам, select, выбор файлов на панели |
| **SYS** | включение/выключение trace, ручное сохранение, смена маски ПДн |

Исходный модуль (для правок): `Script/lib/DevToolsTrace.js`.  
В каждый скрипт модуль **встроен** (один файл → одна вставка в консоль).

## Маска ПДн

Если скрипт передаёт `sanitizeForTrace` в `createDevToolsTrace`, рядом с Trace появляется чекбокс **«Маска ПДн»** (по умолчанию **включён**):

| Состояние | Поведение |
|-----------|-----------|
| Маска ON | В `.log` пишутся замаскированные тела HTTP и строки журнала |
| Маска OFF | В `.log` — сырые данные (удобно для локальной отладки) |

Сейчас маскирование подключено в:

- `News_Community_Export_v2.js` — ТН, ФИО, `createdBy`, ссылки alpha/sigma, почта/телефон, `personUuid`/`userId`, и т.п. (в т.ч. вложенные `authors`/`leaders` из list/detail)
- `Pulse_export_OE.js` — поля search/mainInfo (employeeId, ФИО, контакты…)

Отдельный скрипт **`HTTP_Traffic_Logger.js`** имеет свой переключатель **«Маска ПДн (.log)»** (JSON ответов всегда без маски).

Не маскируются: тексты новостей, коды наград/турниров, `contestName`, статусы, businessBlock.

## Где переключатель на панели

| Скрипт | Расположение |
|--------|----------------|
| `SUP_Config_Update.js` | над блоком журнала |
| `Parameters_Actual_Export.js` | над «Журнал работы» |
| `AddressBook_export.js` / `_OE.js` | над «Журнал работы» |
| `Pulse_export_OE.js` | над «Журнал работы» (+ Маска ПДн) |
| `File_DB_Load_GP.js` / `_v2.js` | над «Журнал работы» |
| `News_Community_Export.js` | в блоке журнала |
| `News_Community_Export_v2.js` | над общим журналом (+ Маска ПДн) |
| `Profile_GP_LOAD_file.js` | над «Журнал работы» |
| `Tournament_LeadersForAdmin.js` | в блоке журнала |
| `UI_AutoTest_LinksCrawler.js` | под блоком «Лог в файл» |
| `UI_AutoTest.js` | плавающая полоска внизу слева при старте прохода |
| `HTTP_Traffic_Logger.js` | в панели логгера (свой UI, не DevToolsTrace) |

## Как пользоваться

1. Запустить скрипт как обычно.
2. Перед проблемным сценарием включить **Trace**.
3. При необходимости снять/включить **Маска ПДн** (если есть).
4. Выполнить действия на панели.
5. Выключить Trace **или** нажать **«Сохранить trace»** — скачается файл  
   `trace_<имя_скрипта>_YYYYMMDD_HHMMSS.log` (UTF-8 BOM; в шапке `mask=ON|OFF` при наличии sanitize).

При **выключении** trace файл сохраняется автоматически, если буфер не пуст.

## Ограничения

- Запись только в **скачиваемый** `.log` (браузер не пишет напрямую в `log/` проекта).
- Тела HTTP/ответов длиннее ~16 KB **усекаются** (защита от мегабайтных export).
- В буфере до ~8000 строк; старые отбрасываются.
- `UI_AutoTest.js` не делает HTTP — в trace только UI/LOG шагов меню.

## Техническая интеграция (для разработчика)

После вставки `createDevToolsTrace` в IIFE:

```javascript
var __nativeFetch = fetch.bind(window);
var devTrace = createDevToolsTrace({
  scriptId: "MyScript",
  sanitizeForTrace: sanitizeForTrace, // опционально → чекбокс «Маска ПДн»
  maskEnabled: true // по умолчанию true, если передан sanitizeForTrace
});
var httpFetch = devTrace.wrapFetch(__nativeFetch);
devTrace.log("строка журнала");
devTrace.mountToggleRow(panel, nodeBeforeJournal);
devTrace.attachPanel(panel);
// devTrace.isMaskEnabled() / setMaskEnabled(bool)
```

Опция `sanitizeForTrace(string) → string` применяется к сообщениям, detail и телам HTTP **только при включённой маске**. Пример реализации — `Pulse_export_OE.js` / `News_Community_Export_v2.js`.

Пересборка встроенной копии во все скрипты:

- первичная вставка: `node tools/inject_devtools_trace.js` (если нет маркера `DevToolsTrace v1`);
- обновление уже встроенных копий: `node tools/update_devtools_trace.js`.

## История

| Версия | Дата | Изменения |
|--------|------|-----------|
| 1.0 | 2026-07-02 | Trace во всех Script/*.js |
| 1.1 | 2026-08-04 | Опция `sanitizeForTrace`; News v2 — сквозной trace + маски ПДн |
| 1.2 | 2026-08-05 | Чекбокс «Маска ПДн» при sanitize; `setMaskEnabled`; расширенные ключи news/Pulse; `update_devtools_trace.js` |
