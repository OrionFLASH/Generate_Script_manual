# Утилита замены employeeNumber (`employee_number_replacer.py`)

Независимый однофайловый скрипт: обезличивает табельные номера и связанные поля сотрудника в JSON-выгрузках новостей.

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
| `employee_csv_file` | CSV-справочник табельных |
| `filter_*` | Фильтры строк CSV (`BUSINESS_BLOCK`, `ROLE_CODE`, `UCH_CODE`) |
| `tb_to_ter_division_name` | Соответствие `TB_CODE` → `terDivisionName` |
| `random_seed` | Seed для воспроизводимой случайной замены |

Пример `input_files`:

```json
"input_files": [
  "news_export_1.json",
  "news_export_2.json"
]
```

## Логика

1. Читает указанные JSON из `IN`.
2. Собирает все `employeeNumber`, дедуплицирует.
3. Строит биективную замену на пул из CSV (фильтры `KMKKSB` / `KM_KKSB` / `1`).
4. Один исходный табельный → один и тот же заменяющий во всех файлах/вхождениях.
5. При наличии в блоке сотрудника также меняет:
   - `lastName` ← `SURNAME`
   - `firstName` ← `FIRST_NAME`
   - `gosbCode` ← `GOSB_CODE`
   - `tbCode` ← `TB_CODE`
   - `terDivisionName` ← маппинг по `tbCode` из конфига
6. Пишет в `OUT` файлы с префиксом `REPL_EmpID_`.

## Структура каталогов

```
IN/          — исходные JSON (имена из input_files)
OUT/         — результаты REPL_EmpID_*
config_emp_replace.json
employee_number_replacer.py
custom_cib_kksb_dvl.dm_gamification_list_employee.csv
```
