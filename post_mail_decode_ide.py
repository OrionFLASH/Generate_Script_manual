#!/usr/bin/env python3
"""
Расшифровка POST-MAIL-BUNDLE для запуска в GigaCode IDE (Run, без CLI).

1. Положите вложения из почты (*.js.txt) в каталог IN/ рядом с этим скриптом.
2. Запустите скрипт (Run / ▶).
3. Готовые .js появятся в каталоге OUT/.
"""

from __future__ import annotations

import sys
import zlib
from pathlib import Path

# =============================================================================
# НАСТРОЙКИ — редактируйте здесь при необходимости
# =============================================================================

# Каталоги относительно папки, где лежит этот .py файл
IN_DIR: str = "IN"
OUT_DIR: str = "OUT"

# Список: (имя закодированного файла в IN/, имя расшифрованного файла в OUT/)
# Список синхронизируется с Script/*.js при ./post_txt_sync.sh
FILES_TO_DECODE: list[tuple[str, str]] = [
    ("AddressBook_export.js.txt", "AddressBook_export.js"),
    ("File_DB_Load_GP.js.txt", "File_DB_Load_GP.js"),
    ("File_DB_Load_GP_v2.js.txt", "File_DB_Load_GP_v2.js"),
    ("News_Community_Export.js.txt", "News_Community_Export.js"),
    ("Parameters_Actual_Export.js.txt", "Parameters_Actual_Export.js"),
    ("Profile_GP_LOAD_file.js.txt", "Profile_GP_LOAD_file.js"),
    ("Tournament_LeadersForAdmin.js.txt", "Tournament_LeadersForAdmin.js"),
    ("UI_AutoTest.js.txt", "UI_AutoTest.js"),
    ("UI_AutoTest_LinksCrawler.js.txt", "UI_AutoTest_LinksCrawler.js"),
]

# =============================================================================
# Алгоритм POST-MAIL-BUNDLE fmt=1 (не менять без синхронизации с post_mail_codec.py)
# =============================================================================

MAGIC_LINE: str = "# POST-MAIL-BUNDLE fmt=1"
ORIGINAL_PREFIX: str = "# original: "
PAYLOAD_START: str = "PAYLOAD"
PAYLOAD_END: str = "ENDPAYLOAD"
DATA_PREFIX: str = "D "
XOR_KEY: bytes = b"GenerateScriptManual2026"


def xor_bytes(data: bytes, key: bytes) -> bytes:
    """Побайтовый XOR с циклическим ключом."""
    key_len: int = len(key)
    return bytes(b ^ key[i % key_len] for i, b in enumerate(data))


def decode_bundle(encoded: str) -> tuple[str, str]:
    """
    Раскодирует bundle → (original_name, plaintext).
    @raises ValueError при неверном формате
    """
    lines_raw: list[str] = encoded.splitlines()
    if not lines_raw or lines_raw[0].strip() != MAGIC_LINE:
        raise ValueError("Не распознан формат POST-MAIL-BUNDLE (ожидается fmt=1 в первой строке)")

    original_name: str = ""
    in_payload: bool = False
    hex_parts: list[str] = []

    for line in lines_raw:
        stripped: str = line.strip()
        if stripped.startswith(ORIGINAL_PREFIX):
            original_name = stripped[len(ORIGINAL_PREFIX) :].strip()
            continue
        if stripped == PAYLOAD_START:
            in_payload = True
            continue
        if stripped == PAYLOAD_END:
            break
        if in_payload and stripped.startswith(DATA_PREFIX):
            hex_parts.append(stripped[len(DATA_PREFIX) :].strip())

    if not hex_parts:
        raise ValueError("Пустой или повреждённый блок PAYLOAD")

    try:
        xored: bytes = bytes.fromhex("".join(hex_parts))
    except ValueError as exc:
        raise ValueError("Некорректные hex-данные в PAYLOAD") from exc

    compressed: bytes = xor_bytes(xored, XOR_KEY)
    try:
        raw: bytes = zlib.decompress(compressed)
    except zlib.error as exc:
        raise ValueError("Ошибка распаковки zlib (файл повреждён или не тот ключ)") from exc

    return original_name, raw.decode("utf-8")


def run_decode_all() -> int:
    """Расшифровывает все файлы из FILES_TO_DECODE: IN/ → OUT/."""
    base: Path = Path(__file__).resolve().parent
    in_dir: Path = base / IN_DIR
    out_dir: Path = base / OUT_DIR

    in_dir.mkdir(parents=True, exist_ok=True)
    out_dir.mkdir(parents=True, exist_ok=True)

    ok_count: int = 0
    err_count: int = 0

    print(f"Каталог скрипта: {base}")
    print(f"Вход:  {in_dir}")
    print(f"Выход: {out_dir}")
    print(f"Файлов в списке: {len(FILES_TO_DECODE)}")
    print("-" * 50)

    for in_name, out_name in FILES_TO_DECODE:
        src: Path = in_dir / in_name
        dst: Path = out_dir / out_name

        if not src.is_file():
            print(f"ПРОПУСК (нет в IN): {in_name}")
            continue

        try:
            bundle_text: str = src.read_text(encoding="utf-8")
            original_meta, plain = decode_bundle(bundle_text)
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_text(plain, encoding="utf-8")
            print(f"OK: {in_name} → OUT/{out_name}  (meta: {original_meta})")
            ok_count += 1
        except (ValueError, OSError) as exc:
            print(f"ОШИБКА: {in_name} — {exc}")
            err_count += 1

    print("-" * 50)
    print(f"Готово: успешно {ok_count}, ошибок {err_count}, пропущено {len(FILES_TO_DECODE) - ok_count - err_count}")

    if ok_count == 0 and err_count == 0:
        print("Подсказка: положите *.js.txt из почты в папку IN/ и запустите снова.")
        return 1
    return 1 if err_count else 0


if __name__ == "__main__":
    sys.exit(run_decode_all())
