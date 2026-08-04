# Скрипт News community v2 (`News_Community_Export_v2.js`)

## Назначение

Скрипт добавляет отдельную модалку с вкладками для массовых операций по новостям community:

- **Создание** новостей (`newsCreate`)
- **Смена статуса** `draft ↔ published` (`newsUpdate`, `method: "patch"`)
- **Редактирование (каркас)** (`newsUpdate`, `method: "put"`)

Основной сценарий — загрузка JSON из файла, показ компактного списка кандидатов и отправка только отмеченных элементов после подтверждения.

## API и окружение

- Стенды: `PROM`, `PSI`, `IFT-SB`, `IFT-GF`
- Контуры: `ALPHA`, `SIGMA`
- Куки: `credentials: "include"` (сессия текущей вкладки)

Запросы:

1. `POST /bo/rmkib.gamification/proxy/v1/administration/news/newsCreate`
2. `POST /bo/rmkib.gamification/proxy/v1/administration/news/newsUpdate` (patch/put)

## Вкладка «Создание»

Поддерживает два основных формата входного JSON:

1. **Шаблонный формат**:

```json
{
  "createItems": [ ... ]
}
```

2. **Формат выгрузки из `News_Community_Export.js`**:
   - `comboResults[].merged.body.timePeriod[].news`
   - или `merged.body.timePeriod[].news`

Для каждого кандидата строится payload создания:

- `type`: `achievement` / `bestPractice` / `publication`  
  (`individualAchievement` нормализуется в `achievement`)
- `description`, `summary`, `authorsList`, `leadersList`, `tagList`
- `rewardList`, `tournamentList` (включая извлечение `tournamentCode` из `contests`)
- `tbCodeList`, `gosbCodeList`
- `createdBy`, `plannedDt`, `createDt`, `status: "draft"`

Перед отправкой:

- список показывается с чекбоксами (**по умолчанию всё выбрано**);
- выполняется валидация критичных полей;
- при ошибках операция отменяется без выполнения запросов.

## Вкладка «Статусы»

Источник данных:

- JSON-файл (`statusItems`, массив, либо экспортный JSON с новостями)
- или список `newsId` из текстового поля

Для каждого элемента отправляется:

```json
{
  "newsId": "...",
  "status": "published",
  "method": "patch"
}
```

Аналогично поддерживается обратный переход в `draft`.

Перед отправкой:

- обязательная проверка `newsId` и `status`;
- подтверждение в интерфейсе;
- запись результата в отдельный JSON-файл.

## Вкладка «Редактирование (каркас)»

Реализован базовый поток:

1. Загрузка `updateItems` из JSON.
2. Отбор элементов в таблице.
3. Отправка `method: "put"` в `newsUpdate`.

Предусмотрен экспорт шаблона файла редактирования для дальнейшего расширения логики.

## Компактный список выбора перед отправкой

Перед выполнением операций из файла отображается краткая таблица:

- Тип новости
- Заголовок (кратко)
- Количество авторов
- Количество лидеров
- ID новости

Все элементы отмечены по умолчанию.

## Примечания по надежности

- Если в выбранных данных есть критичные ошибки, запросы не выполняются.
- Все массовые операции требуют подтверждения.
- Результаты выполнения сохраняются в JSON (`*_result_*.json`) с payload и ответами API.
