# Скрипт HTTP Traffic Logger (`HTTP_Traffic_Logger.js`)

## Назначение

Отдельный **фоновый логгер HTTP** для DevTools Console. Не внутри рабочих скриптов выгрузки.

- Перехватывает **fetch** и **XMLHttpRequest** текущей вкладки.
- Пишет сеть подробно: method, URL, status, длительность, **заголовки запроса**, **заголовки ответа**, **payload** запроса, **тело ответа**.
- **Не** пишет клики и UI-события.
- Компактная панель не блокирует сайт — можно ходить по страницам и собирать трафик для проектирования других скриптов.

## Запуск

1. Открыть нужный стенд/сайт, DevTools → Console.
2. Вставить содержимое `Script/HTTP_Traffic_Logger.js` → Enter.
3. Нажать **▶ Старт**.
4. Работать в UI сайта как обычно.
5. **⏹ Стоп** → **⬇ JSON** или **⬇ .log**.
6. **×** — закрыть панель и снять перехват.

Повторная вставка заменяет предыдущую панель.

## Интерфейс

| Элемент | Назначение |
|---------|------------|
| **▶ Старт / ⏹ Стоп** | Включение/выключение записи |
| **Маска ПДн (.log)** | Маскировать ПДн **только в файле `.log`** (JSON всегда без маски). Ключи: employeeNumber/ФИО/createdBy/uuid/token/cookie и вложенные authors/leaders |
| Фильтр URL | Действует на **`.log`**: подстроки по одной в строке; пусто = все. На JSON не влияет |
| Статистика | Число запросов, OK/err, объём out/in, размер буфера |
| **⬇ JSON** | Ответы сайта целиком без маски ПДн; связь с `.log` по `corrId` / `id` |
| **⬇ .log** | Полный текстовый дамп (заголовки + payload) с учётом фильтра и маски |
| **Очистить** | Сброс буфера, счётчиков и `sessionId` |
| **—** | Свернуть в мини-бар (`● REC N`) |
| **×** | Закрыть и восстановить родные `fetch` / `XHR` |
| Заголовок | Перетаскивание панели |

## Разделение .log и JSON

| | `.log` | JSON |
|--|--------|------|
| Содержимое | Запрос + ответ целиком: headers + payload/body | Ответы (и краткий request для связи) |
| Маска ПДн | По переключателю | **Никогда** (сырые данные) |
| Фильтр URL | Да | **Нет** — все захваченные ответы |
| Связь | `corrId` / `id` / `sessionId` | те же поля |

Пример `corrId`: `httplog_20260805_014500_ab12cd_3`.

## Формат JSON

```json
{
  "exportMeta": {
    "scriptId": "HTTP_Traffic_Logger",
    "format": "http_traffic_responses_v2",
    "sessionId": "…",
    "origin": "https://…",
    "pageUrl": "https://…",
    "maskApplied": false,
    "note": "Ответы без маски ПДн. Связь с .log по corrId.",
    "stats": { "total": 12, "responses": 12 }
  },
  "responses": [
    {
      "id": 1,
      "corrId": "httplog_…_1",
      "sessionId": "…",
      "ts": "…",
      "kind": "fetch",
      "method": "POST",
      "url": "https://…/proxy/v1/news",
      "status": 200,
      "ok": true,
      "durationMs": 820,
      "request": {
        "headers": { "Content-Type": "application/json", "…": "…" },
        "payload": { "…": "…" },
        "payloadRawLen": 120,
        "truncated": false
      },
      "response": {
        "headers": { "content-type": "application/json", "…": "…" },
        "body": { "…": "…" },
        "bodyRawLen": 4096,
        "truncated": false
      }
    }
  ]
}
```

Имя файла: `http_traffic_YYYYMMDD_HHMMSS.json` (или `.log`).

## Формат .log (фрагмент)

```
# HTTP_Traffic_Logger sessionId=… mask=true
# Связь с JSON: поле corrId / id
================================================================================
--- #1 corrId=httplog_…_1 2026-… [fetch] POST 200 820ms
URL https://…/proxy/v1/news

>>> REQUEST HEADERS
Content-Type: application/json
…

>>> REQUEST PAYLOAD
{…}

<<< RESPONSE HEADERS
content-type: application/json
…

<<< RESPONSE BODY
{…}
```

## Ограничения

- Тела длиннее ~2 MB обрезаются мягко (`MAX_BODY_LEN`, защита от OOM); в записи есть флаги `truncated` / `*RawLen`.
- В буфере до ~5000 записей (старые отбрасываются).
- Не видит запросы из других расширений/Service Worker вне страницы; WebSocket не пишется.
- Заголовки, которые браузер добавляет сам (например Cookie в некоторых режимах), могут быть неполными в перехвате `fetch`/`setRequestHeader`.
- Если другой скрипт тоже патчит `fetch`, порядок обёрток зависит от порядка запуска.
- `blob:` / `data:` URL пропускаются.

## Конфиг в скрипте

Блок `CFG` вверху файла: лимиты тела/буфера, префикс имён, маска по умолчанию.

## История версий

| Версия | Дата | Изменения |
|--------|------|-----------|
| 1.2 | 2026-08-05 | Расширены ключи маски по HAR news; массивы строковых значений |
| 1.1 | 2026-08-05 | Заголовки req/resp + payload; `.log` полный с маской/фильтром; JSON — ответы без маски, связь `corrId` |
| 1.0 | 2026-08-05 | Первый релиз: fetch+XHR, фильтр URL, маска ПДн, JSON/.log, мини-бар |
