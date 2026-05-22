# Скрипт выгрузки новостей community (`News_Community_Export.js`)

## Назначение

На странице выбранного окружения gamification (стенд `PROM/PSI/IFT-SB/IFT-GF`, контур `ALPHA/SIGMA`) из консоли DevTools выполняются **POST**-запросы:

`POST {origin}/bo/rmkib.gamification/proxy/v1/news`

Тело запроса (по умолчанию):

```json
{
  "newsStatus": "published",
  "newsTagList": [{ "tagType": "NEWS_TYPE", "tagCode": "bestPractice" }],
  "pageNum": 1
}
```

Пагинация: в ответе `body.page` — поля `total`, `isLast`, `num`. Скрипт увеличивает `pageNum`, пока `isLast !== true` и пока `pageNum < total`.

## Файлы

- Скрипт: `Script/News_Community_Export.js` (IIFE — повторная вставка в консоль без SyntaxError).
- Запуск: вставить скрипт в консоль на вкладке нужного стенда; откроется панель.

## Выгрузка JSON

Кнопка **«Загрузить новости → JSON»** сохраняет объект:

| Ключ | Содержимое |
|------|------------|
| `exportMeta` | стенд, контур, origin, время, число страниц, параметры payload, число новостей после merge |
| `pages` | массив сырых ответов API по страницам |
| `merged` | один объединённый ответ (`timePeriod[].news` склеены по имени периода) |

Имя файла: `news_community_{стенд}_{контур}_{дата}.json` или пользовательский префикс на панели.

## Выгрузка CSV

Кнопка **«Выгрузить JSON + CSV (leaders + authors)»** сразу активна: выполняет те же POST по всем страницам, затем сохраняет **полный JSON** и **CSV** с одним таймштампом в имени файлов (например `…20260522-120000.json` и `…20260522-120000_leaders_authors.csv`).

Кнопка **«Загрузить новости → JSON»** — только JSON без CSV.

Каждая строка — один человек из `leaders` или `authors` плюс поля связанной новости:

- `personRole`: `leaders` или `authors`
- `timePeriodName` — имя блока `timePeriod`
- поля person: `employeeNumber`, `lastName`, `firstName`, `terDivisionName`, `gosbCode`, `tbCode` (без `colorCode`, `tags`)
- поля новости: `newsId`, `createDate`, `updateDate`, `plannedDate`, `plannedDateTime`, `date`, `newsStatus`, `newsType`, `summary` (без `imageList`)

## Панель

- Выбор стенда и контура, автоопределение по `window.location.origin`
- Поля `newsStatus`, `tagType`, `tagCode`
- Пауза между страницами (мс), префикс имени файла
- **Журнал работы** (лента)

## История версий

| Версия | Изменения |
|--------|-----------|
| 1.0 | Первая версия: POST news, пагинация, JSON + CSV leaders/authors |
