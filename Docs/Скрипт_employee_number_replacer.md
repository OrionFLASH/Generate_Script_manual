# Утилита замены employeeNumber (`employee_number_replacer.py`)

Независимый однофайловый скрипт: обезличивает табельные номера и связанные поля сотрудника в JSON-выгрузках новостей.

## Зависимости

```bash
pip install -r requirements.txt
```

Нужен пакет `openpyxl` (Excel-отчёт).

## Запуск

Из корня репозитория (или каталога, где лежат скрипт и конфиг):

```bash
python3 employee_number_replacer.py
```

`--config` **не обязателен**. По умолчанию берётся:
1. `config_emp_replace.json` рядом со скриптом;
2. иначе первый `config_*.json` рядом со скриптом.

Явно указать другой конфиг:

```bash
python3 employee_number_replacer.py --config ./config_emp_replace.json
```

## Конфиг `config_emp_replace.json`

| Поле | Назначение |
|------|------------|
| `input_dir` | Каталог входных JSON (по умолчанию `IN`) |
| `output_dir` | Каталог результатов (по умолчанию `OUT`) |
| `input_files` | **Список имён файлов** (один или несколько). Имена относительно `input_dir` |
| `input_glob` | Fallback, если `input_files` пуст/`null`: маска в `input_dir` |
| `output_prefix` | Префикс выходного имени (`REPL_EmpID_`) |
| `excel_report_file` | Имя Excel-отчёта в `output_dir` (по умолчанию `REPL_EmpID_mapping.xlsx`) |
| `employee_csv_file` | CSV-справочник табельных |
| `filter_rules` | Список правил фильтрации CSV: `business_block`, `role_code`, `uch_code` (`*`/`ANY`/`ALL` = любой `UCH_CODE`) |
| `filter_*` | Legacy-формат фильтров (`BUSINESS_BLOCK`, `ROLE_CODE`, `UCH_CODE`), строка или список |
| `tb_to_ter_division_name` | Соответствие `TB_CODE` → `terDivisionName` |
| `random_seed` | Seed для воспроизводимой случайной замены |

Пример `input_files`:

```json
"input_files": [
  "news_export_1.json",
  "news_export_2.json"
]
```

Пример `filter_rules`:

```json
"filter_rules": [
  {
    "business_block": "KMKKSB",
    "role_code": "KM_KKSB",
    "uch_code": "1"
  },
  {
    "business_block": "AKMKKSB",
    "role_code": "AKM_KKSB",
    "uch_code": "*"
  }
]
```

## Логика

1. Читает указанные JSON из `IN`.
2. Собирает все `employeeNumber`, дедуплицирует.
3. Строит биективную замену на пул из CSV (по `filter_rules`; если поле не задано — по legacy `filter_*`).
4. Один исходный табельный → один и тот же заменяющий во всех файлах/вхождениях.
5. При наличии в блоке сотрудника также меняет:
   - `lastName` ← `SURNAME`
   - `firstName` ← `FIRST_NAME`
   - `gosbCode` ← `GOSB_CODE`
   - `tbCode` ← `TB_CODE`
   - `terDivisionName` ← маппинг по `tbCode` из конфига
6. Пишет в `OUT` файлы с префиксом `REPL_EmpID_`.
7. Пишет Excel-отчёт замен (см. ниже).

## Excel-отчёт

После замен создаётся файл `OUT/REPL_EmpID_mapping.xlsx` (имя из `excel_report_file`).

Порядок колонок: **сначала все «было»**, затем **все «стало»**, затем **ID новостей**, затем **файлы**.

| Колонка | Содержание |
|---------|------------|
| **Было employeeNumber** … **Было terDivisionName** | Снимок исходных полей до замены (`employeeNumber`, `lastName`, `firstName`, `gosbCode`, `tbCode`, `terDivisionName`) |
| **Стало employeeNumber** … **Стало terDivisionName** | Значения из пула замены (и `terDivisionName` по `tbCode` из конфига) |
| **ID новостей** | `objectId` / `newsId` новостей; несколько — через перевод строки |
| **Файлы** | Имена входных JSON; несколько — через перевод строки |

Формат листа:
- заголовки зафиксированы (`freeze` первой строки);
- включён автофильтр по всей таблице;
- в ячейках с несколькими значениями включён перенос текста.

## Структура каталогов

```
IN/          — исходные JSON (имена из input_files)
OUT/         — результаты REPL_EmpID_* + Excel-отчёт
config_emp_replace.json
employee_number_replacer.py
requirements.txt
custom_cib_kksb_dvl.dm_gamification_list_employee.csv
```
