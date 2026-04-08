#!/usr/bin/env bash
# Локальная синхронизация каталога POST/: копии Script/*.js, Docs/*.md и README.md
# с суффиксом .txt к имени файла. Каталог POST/ в .gitignore и не попадает в git.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$ROOT/POST"
for f in "$ROOT/Script"/*.js; do
  [ -e "$f" ] || continue
  cp "$f" "$ROOT/POST/$(basename "$f").txt"
done
for f in "$ROOT/Docs"/*.md; do
  [ -e "$f" ] || continue
  cp "$f" "$ROOT/POST/$(basename "$f").txt"
done
cp "$ROOT/README.md" "$ROOT/POST/README.md.txt"
echo "Готово: $ROOT/POST/"
