# Скрипт обновления параметров СУП (`SUP_Config_Update.js`)

## 1. Назначение

Браузерный DevTools-скрипт для **обновления значений параметров** в UFS Config Manager (СУП) через REST API — аналог «Сохранить» в UI.

Файл: `Script/SUP_Config_Update.js`. Копия для пересылки: `./post_txt_sync.sh` → `POST/SUP_Config_Update.js.txt`.

## 2. Запуск

1. Открыть вкладку **UFS Config Manager** (авторизованная сессия).
2. DevTools → Console → вставить **полный** файл скрипта → Enter.
3. Панель `id=sup-config-update-panel`.
4. Кнопка **Auto origin** подставляет origin, API prefix и referer с текущей вкладки.

## 3. API

Базовый prefix: `{origin}{path}/ufs-config-manager/pacman/rest/`

| Метод | Path | Назначение |
|-------|------|------------|
| GET | `tenantCodes` | Список тенантов (dropdown cfg-rn) |
| POST | `parameter/list` | Поиск параметра по `name` → `id` |
| POST | `parameter/data/export` | Скачивание текущих values |
| POST | `parameter/bundle/list` | Активный bundle (diff, блок info) |
| POST | `parameter/value/add` | **Сохранение** (полная замена values) |

Заголовки: `cfg-rn` = tenant; `x-cfga-location` = `""`; `credentials: include`.

### Payload add

```json
{
  "parameterId": 361251,
  "bundle": {
    "path": [{ "code": "SUBSYSTEM", "value": "KKSB_ENIGMA" }],
    "values": ["REWARD_00_01:BADGE_GURU"]
  }
}
```

## 4. Вкладки панели

| Вкладка | Описание |
|---------|----------|
| **Payload** | Ручной JSON; lookup `parameterId`; подстановка values из `.txt` |
| **Файл export** | Paste / file input; форматы EXPORT[], ADD_READY, JOB; чекбоксы bundle |
| **Скачать с сервера** | `parameter/data/export` → preview → сохранить JSON |

## 5. Форматы файлов

- **EXPORT** — массив записей UI export (`parameters_*.json`); `path[].name` → `path[].code`.
- **ADD_READY** — `{ meta, requests: [{ parameterId?, bundle }] }`.
- **JOB** — `{ tenant, parameters: [{ name, bundles }] }`; поле `valuesFile` — подсказка (values грузятся отдельным `.txt`).

## 6. Безопасность

- **Dry-run** включён по умолчанию (без POST).
- **Сравнить с сервером** — diff счётчиков values с активным bundle.
- **Откатить из export** — готовит очередь из последнего export (файл или сервер).
- При ошибке в batch — диалог «продолжить / остановить».
- Предупреждение: `value/add` заменяет **весь** список values.

## 7. Ключевые функции

| Имя | Назначение |
|-----|------------|
| `detectEnvFromLocation` | Origin + API prefix с вкладки |
| `resolveParameterId` | POST parameter/list + кэш |
| `exportPathToAddPath` | Универсальный name→code в path |
| `parseImportJson` | EXPORT / ADD_READY / JOB |
| `postValueAdd` | POST value/add (или dry-run preview) |
| `fetchActiveBundle` | Активный bundle для diff и UI-блока |

## 8. История версий документа

| Версия | Дата | Изменения |
|--------|------|-----------|
| 1.0 | 2026-05-22 | Первая версия скрипта и документации |
