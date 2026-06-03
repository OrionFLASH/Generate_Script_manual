#!/usr/bin/env bash
# Локальная синхронизация каталога POST/ для пересылки в корп. сегмент почты:
# - все Script/*.js → POST/<имя>.js.txt (закодировано, без сырого JS в теле);
# - post_mail_codec.py, инструкции, ЗАДАНИЕ;
# - config.json (если есть), карта «Куда_класть_файлы.txt».
# Каталог POST/ в .gitignore и не попадает в git.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
POST="$ROOT/POST"
SCRIPT_DIR="$ROOT/Script"
CODEC="$ROOT/post_mail_codec.py"
mkdir -p "$POST"

if [ ! -f "$CODEC" ]; then
  echo "Ошибка: не найден post_mail_codec.py в $ROOT" >&2
  exit 1
fi

# Все скрипты из Script/*.js (включая автотесты)
SCRIPT_COUNT=0
SCRIPT_LIST=()
while IFS= read -r -d '' f; do
  name="$(basename "$f")"
  SCRIPT_LIST+=("$name")
  python3 "$CODEC" encode --in "$f" --out "$POST/${name}.txt" --original "$name"
  SCRIPT_COUNT=$((SCRIPT_COUNT + 1))
done < <(find "$SCRIPT_DIR" -maxdepth 1 -name '*.js' -type f -print0 | sort -z)

DECODE_IDE="$ROOT/post_mail_decode_ide.py"

if [ ! -f "$DECODE_IDE" ]; then
  echo "Ошибка: не найден post_mail_decode_ide.py в $ROOT" >&2
  exit 1
fi

# Обновить FILES_TO_DECODE в post_mail_decode_ide.py по фактическому списку Script/*.js
python3 - "$DECODE_IDE" "${SCRIPT_LIST[@]}" <<'PY'
import re
import sys
from pathlib import Path

target = Path(sys.argv[1])
names = sys.argv[2:]
lines = [
    "FILES_TO_DECODE: list[tuple[str, str]] = [",
]
for name in names:
    lines.append(f'    ("{name}.txt", "{name}"),')
lines.append("]")
block = "\n".join(lines)
text = target.read_text(encoding="utf-8")
new_text, n = re.subn(
    r"FILES_TO_DECODE: list\[tuple\[str, str\]\] = \[[\s\S]*?\]",
    block,
    text,
    count=1,
)
if n != 1:
    raise SystemExit("Не удалось обновить FILES_TO_DECODE в post_mail_decode_ide.py")
target.write_text(new_text, encoding="utf-8")
PY

cp "$DECODE_IDE" "$POST/post_mail_decode_ide.py.txt"
cp "$CODEC" "$POST/post_mail_codec.py.txt"

if [ -f "$ROOT/config.json" ]; then
  python3 "$CODEC" encode --in "$ROOT/config.json" --out "$POST/config.json.txt" --original "config.json"
fi

BUILD_DATE="$(date +%Y-%m-%d)"

# Задание пользователя (для повторной постановки задачи ассистенту)
cat > "$POST/ЗАДАНИЕ_шифрование_POST.txt" <<'TASK_EOF'
в каталог POST надо скопировать все файлы скриптов поменяв расширение на txt
но это надо для пересылки в корп сегмент почты а на входе почты идет автоматическая проверка и она когда видит внутри файлов JS автоматически удаляет файлы поэтому кроме расширения надо еще "зашифровать обратимо" содержимое так чтобы во 1 алгоритм не распознал там скрипты а во вторых на целевой системе после получения по почте я мог бы без проблем вернуть содержимое к исходному виду
я думал что можно например добавлять через каждый символ комбинацию доп знаков при автозамене которых в редакторе на пустое получался бы исходный
либо можно написать небольшой шифровальщик на питоне скрипт который тут шифрует коротко одним файлом а на выходе там на той стороне такой же скрипт расшифрует
придумай что-то сам зашифруй положи в post и туда же положи если будет скрипт и инструкцию по его работе или по иному способу расшифорвки

положи эту инстркцию (ЗАДАНИЕ ЧТО Я СЕЙЧАС НАПИСАЛ) также в POST что б в будушем тебе же его давать заново при необходимости
TASK_EOF

# Инструкция по пересылке и восстановлению
cat > "$POST/ИНСТРУКЦИЯ_пересылка_скриптов_почтой.txt" <<EOF
Пересылка Script/*.js через корпоративную почту
==============================================
Дата сборки POST/: ${BUILD_DATE}

Зачем
-----
Почтовый фильтр удаляет вложения, внутри которых распознаёт JavaScript.
Файлы в POST/*.js.txt — это НЕ исходный код: текст сжат (zlib), XOR и записан
как hex-строки (формат POST-MAIL-BUNDLE fmt=1). Сигнатур function/fetch/const
в теле нет.

Что лежит в POST/
-----------------
- <имя>.js.txt     — закодированный скрипт (все файлы из Script/*.js)
- post_mail_decode_ide.py.txt — расшифровщик для GigaCode IDE (IN/ → OUT/, без CLI)
- post_mail_codec.py.txt — утилита decode/encode через командную строку (опционально)
- ИНСТРУКЦИЯ_пересылка_скриптов_почтой.txt — этот файл
- ЗАДАНИЕ_шифрование_POST.txt — исходная постановка задачи
- Куда_класть_файлы.txt — таблица путей после decode

Отправка (исходный ПК, уже сделано post_txt_sync.sh)
----------------------------------------------------
1. ./post_txt_sync.sh из корня репозитория
2. Прикрепить к письму нужные файлы из POST/ (расширение .txt)

Приём (целевой ПК) — GigaCode IDE (рекомендуется)
-------------------------------------------------
1. Создать рабочую папку, например post_unpack/
2. post_mail_decode_ide.py.txt → post_mail_decode_ide.py (убрать .txt)
3. Рядом создать каталог IN/
4. Сохранить вложения из почты (*.js.txt) в IN/
5. В GigaCode открыть post_mail_decode_ide.py и нажать Run (▶)
6. Расшифрованные .js появятся в OUT/ (имена заданы в FILES_TO_DECODE внутри скрипта)
7. Скопировать нужные файлы из OUT/ в Script/ проекта

Приём (целевой ПК) — командная строка (альтернатива)
----------------------------------------------------
1. Сохранить вложения из почты в любую папку
2. post_mail_codec.py.txt → post_mail_codec.py
3. python3 post_mail_codec.py decode \\
     --in ~/Downloads/post_in/File_DB_Load_GP_v2.js.txt \\
     --out /path/to/project/Script/File_DB_Load_GP_v2.js

4. Проверка после decode: файл должен начинаться с // или (function и содержать
   читаемый JS. Открыть в редакторе и вставить в DevTools как обычно.

Повторная сборка POST/ на исходном ПК
-------------------------------------
./post_txt_sync.sh

Проверка кодека (опционально)
-----------------------------
python3 post_mail_codec.py verify --in Script/File_DB_Load_GP_v2.js

Алгоритм (кратко)
-----------------
UTF-8 → zlib.compress → XOR(key) → hex → строки «D <hex>» между PAYLOAD/ENDPAYLOAD
Decode — обратный порядок. Ключ в post_mail_codec.py (XOR_KEY), не для секретности,
а чтобы антивирус не видел текст скрипта.
EOF

# Карта размещения после decode
{
  echo "Каталог POST/ — перенос на другой ПК (без git)"
  echo "================================================"
  echo "Дата сборки: ${BUILD_DATE}"
  echo ""
  echo "ВАЖНО: файлы *.js.txt в POST/ — ЗАКОДИРОВАНЫ (не копировать напрямую в Script/)."
  echo "Сначала decode — см. ИНСТРУКЦИЯ_пересылка_скриптов_почтой.txt"
  echo ""
  echo "Скрипты (после decode → Script/)"
  echo "--------------------------------"
  printf "| %-36s | %-36s |\n" "Файл в POST/" "Куда положить"
  printf "|%-38s|%-38s|\n" "--------------------------------------" "--------------------------------------"
  for name in "${SCRIPT_LIST[@]}"; do
    printf "| %-36s | Script/%-28s |\n" "${name}.txt" "$name"
  done
  echo ""
  echo "Утилиты"
  echo "-------"
  echo "post_mail_decode_ide.py.txt → post_mail_decode_ide.py; IN/*.js.txt → Run → OUT/*.js"
  echo "post_mail_codec.py.txt → post_mail_codec.py (CLI, опционально)"
  echo ""
  if [ -f "$ROOT/config.json" ]; then
    echo "config.json.txt → config.json (корень проекта, после decode)"
    echo ""
  fi
  echo "Пересборка: ./post_txt_sync.sh"
} > "$POST/Куда_класть_файлы.txt"

echo "Готово: $POST/ ($SCRIPT_COUNT скриптов, формат POST-MAIL-BUNDLE)"
