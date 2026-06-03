#!/usr/bin/env bash
# Локальная синхронизация каталога POST/: рабочие Script/*.js (без автотестов),
# config.json (если есть), файл «Куда_класть_файлы.txt».
# Каталог POST/ в .gitignore и не попадает в git.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
POST="$ROOT/POST"
mkdir -p "$POST"

# Скрипты для работы (UI_AutoTest* — тесты, не копируем)
PROD_SCRIPTS=(
  AddressBook_export.js
  File_DB_Load_GP.js
  File_DB_Load_GP_v2.js
  News_Community_Export.js
  Parameters_Actual_Export.js
  Profile_GP_LOAD_file.js
  Tournament_LeadersForAdmin.js
)
for name in "${PROD_SCRIPTS[@]}"; do
  src="$ROOT/Script/$name"
  if [ -f "$src" ]; then
    cp "$src" "$POST/${name}.txt"
  fi
done

if [ -f "$ROOT/config.json" ]; then
  cp "$ROOT/config.json" "$POST/config.json.txt"
fi

# Карта размещения (перезаписывается при каждой сборке)
BUILD_DATE="$(date +%Y-%m-%d)"
cat > "$POST/Куда_класть_файлы.txt" <<EOF
Каталог POST/ — перенос на другой ПК (без git)
================================================
Дата сборки: ${BUILD_DATE}

Как пользоваться
----------------
1. Скопируйте нужные файлы из POST/ на целевой ПК.
2. У каждого файла в POST/ к имени добавлен суффикс .txt — при размещении
   в проекте УБЕРИТЕ только этот суффикс .txt в конце (см. таблицу «Куда»).
3. Структура каталогов на целевом ПК должна совпадать с репозиторием
   Generate_Script_manual (корень проекта — папка с README.md).

Скрипты для работы (в POST/ → в проект)
--------------------------------------
| Файл в POST/                         | Куда положить в проекте              | Назначение |
|--------------------------------------|--------------------------------------|------------|
| AddressBook_export.js.txt            | Script/AddressBook_export.js         | Адресная книга: search → empInfoFull |
| File_DB_Load_GP.js.txt               | Script/File_DB_Load_GP.js            | Выгрузка файлов gamification (v1, кнопки + чекбоксы) |
| File_DB_Load_GP_v2.js.txt            | Script/File_DB_Load_GP_v2.js         | Выгрузка gamification v2: только «Скачать выделенное», конфиг блоков |
| News_Community_Export.js.txt         | Script/News_Community_Export.js      | Новости community: JSON/CSV |
| Parameters_Actual_Export.js.txt      | Script/Parameters_Actual_Export.js   | Параметры: выгрузка, create, update |
| Profile_GP_LOAD_file.js.txt          | Script/Profile_GP_LOAD_file.js       | Загрузка профиля «Герои» |
| Tournament_LeadersForAdmin.js.txt     | Script/Tournament_LeadersForAdmin.js | Турниры: leadersForAdmin |

Конфигурация
------------
| Файл в POST/      | Куда положить | Примечание |
|-------------------|---------------|------------|
| config.json.txt   | config.json   | В корень проекта (копируется только если config.json существует в корне). |

НЕ копировать из POST/ (тесты, в эту сборку не входят)
-------------------------------------------------------
| Исключено из POST/              | Где оригинал              |
|---------------------------------|---------------------------|
| UI_AutoTest.js                  | Script/UI_AutoTest.js     |
| UI_AutoTest_LinksCrawler.js     | Script/UI_AutoTest_LinksCrawler.js |

Запуск скриптов
---------------
Открыть нужный стенд в браузере → DevTools → Console → вставить полное содержимое
соответствующего файла из Script/*.js (или скопировать текст из POST/*.js.txt).

Пересборка POST/ на исходном ПК
-------------------------------
Из корня репозитория: ./post_txt_sync.sh
EOF

echo "Готово: $POST/ (${#PROD_SCRIPTS[@]} скриптов, без тестов)"
