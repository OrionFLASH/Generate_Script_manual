# Скрипт выгрузки из адресной книги (`AddressBook_export.js`)

## 1. Назначение

В браузере на странице приложения **адресной книги** (тот же origin, что у API) выполняются запросы к относительным путям `/api/home/...` с **`credentials: "same-origin"`**. Результаты сохраняются в один JSON-файл на сценарий (кнопка на панели). Куки и токены в код не вшиваются.

## 2. Запуск

- Файл: `Script/AddressBook_export.js`.
- DevTools → Console → вставить скрипт → Enter.
- **Стенд** на панели задаёт базовый хост (`ADDRESSBOOK_ORIGINS` + путь `/api/home/...`). Удобнее открыть вкладку на том же стенде (куки, CORS).
- Повторная вставка в той же сессии может вызвать ошибку повторного объявления `const` — обновите страницу.

## 3. API (логически)

Полный URL: **`ORIGIN` + `/api/home` + суффикс**.

| Метод | Суффикс | Назначение |
|-------|---------|------------|
| GET | `/empInfoFull?empId=` | Карточка по табельному |
| POST | `/employees/search` | Поиск: в теле `{ searchText, pageToken: null }` — число (ТН) или строка (ФИО) |

## 4. Панель (UI)

1. **Стенд** — выпадающий список ALPHA / SIGMA (хосты в коде в `ADDRESSBOOK_ORIGINS`).
2. **Список табельных** — textarea; по умолчанию подставляется **`EMP_IDS`** из скрипта.
3. **GET empInfoFull (все из поля)** — для каждого ТН из списка GET `empInfoFull`, пауза **`REQUEST_PAUSE_MS`** между запросами; выгрузка `addressbook_empInfoFull_<STAND>_<timestamp>.json` (в записи есть поле `stand`).
4. **POST search по ТН (число)** — для каждого ТН из поля: в теле `searchText` как **число**; файл `addressbook_search_by_tn_<STAND>_<timestamp>.json`.
5. **Поиск по ФИО** — отдельное textarea, каждая непустая строка — отдельный POST; файл `addressbook_search_by_fio_<STAND>_<timestamp>.json`.
6. **Закрыть** — снять панель.

## 5. Переменные и функции

| Имя | Назначение |
|-----|------------|
| `ADDRESSBOOK_ORIGINS` | Базовые URL ALPHA / SIGMA (при необходимости заменить на фактический хост адресной книги) |
| `DEFAULT_ADDRESSBOOK_STAND`, `ADDRESSBOOK_ACTIVE_STAND` | Стенд по умолчанию и текущий выбор на панели |
| `ADDRESSBOOK_API_HOME` | Префикс пути `/api/home` |
| `getAddressBookStandAndOrigin()` | Активный ключ стенда и origin для запросов |
| `EMP_IDS` | Табельные по умолчанию для подсказки в textarea |
| `REQUEST_PAUSE_MS` | Пауза между последовательными запросами в одном сценарии |
| `normalizeEmpId`, `parseEmpIdsFromText` | Нормализация и разбор списка ТН из текста |
| `fetchEmpInfoFull(empId)` | GET empInfoFull |
| `fetchEmployeesSearch(searchText, asNumber)` | POST search; `asNumber === true` — ТН в JSON как число |
| `downloadJson(filename, obj)` | Сохранение объекта в JSON на диск |
| `startAddressBookPanel()` | Панель (автовызов в конце файла) |

## 6. История версий (документ)

| Версия | Изменения |
|--------|-----------|
| 1.0 | Первое описание: empInfoFull, search по ТН и по ФИО, панель, относительные пути. |
| 1.1 | Выбор стенда на панели; абсолютные URL (`ADDRESSBOOK_ORIGINS` + `/api/home`), `credentials: include`. |

*Актуальность проверяйте по `Script/AddressBook_export.js`.*
