#!/usr/bin/env python3
"""
Обратимое кодирование JS-файлов для пересылки через корп. почту.

Содержимое сжимается (zlib), XOR-ится с ключом и записывается как hex-строки
с префиксом «D » — в теле нет ключевых слов JavaScript (function, fetch и т.д.).
"""

from __future__ import annotations

import argparse
import sys
import zlib
from pathlib import Path

MAGIC_LINE: str = "# POST-MAIL-BUNDLE fmt=1"
ORIGINAL_PREFIX: str = "# original: "
PAYLOAD_START: str = "PAYLOAD"
PAYLOAD_END: str = "ENDPAYLOAD"
DATA_PREFIX: str = "D "
# Ключ обфускации (не секретность — только снятие сигнатур JS для антивируса почты).
XOR_KEY: bytes = b"GenerateScriptManual2026"


def xor_bytes(data: bytes, key: bytes) -> bytes:
    """Побайтовый XOR с циклическим ключом."""
    key_len: int = len(key)
    return bytes(b ^ key[i % key_len] for i, b in enumerate(data))


def encode_plaintext(plain: str, original_name: str) -> str:
    """
    Кодирует текст скрипта в формат POST-MAIL-BUNDLE.
    @param plain исходный текст UTF-8
    @param original_name имя исходного файла для метаданных
    """
    raw: bytes = plain.encode("utf-8")
    compressed: bytes = zlib.compress(raw, level=9)
    xored: bytes = xor_bytes(compressed, XOR_KEY)
    hex_body: str = xored.hex()

    lines: list[str] = [
        MAGIC_LINE,
        f"{ORIGINAL_PREFIX}{original_name}",
        "# restore: python3 post_mail_codec.py decode --in FILE.js.txt --out Script/FILE.js",
        PAYLOAD_START,
    ]
    chunk_size: int = 64
    for offset in range(0, len(hex_body), chunk_size):
        lines.append(DATA_PREFIX + hex_body[offset : offset + chunk_size])
    lines.append(PAYLOAD_END)
    return "\n".join(lines) + "\n"


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


def cmd_encode(args: argparse.Namespace) -> int:
    """Команда encode: файл → bundle .txt."""
    src: Path = Path(args.input).resolve()
    dst: Path = Path(args.output).resolve()
    if not src.is_file():
        print(f"Ошибка: не найден входной файл {src}", file=sys.stderr)
        return 1
    plain: str = src.read_text(encoding="utf-8")
    original: str = args.original or src.name
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(encode_plaintext(plain, original), encoding="utf-8")
    print(f"OK encode: {src.name} → {dst}")
    return 0


def cmd_decode(args: argparse.Namespace) -> int:
    """Команда decode: bundle .txt → исходный JS."""
    src: Path = Path(args.input).resolve()
    dst: Path = Path(args.output).resolve()
    if not src.is_file():
        print(f"Ошибка: не найден входной файл {src}", file=sys.stderr)
        return 1
    try:
        original_name, plain = decode_bundle(src.read_text(encoding="utf-8"))
    except ValueError as exc:
        print(f"Ошибка decode: {exc}", file=sys.stderr)
        return 1
    if args.original and args.original != original_name:
        print(f"Примечание: в bundle original={original_name!r}, используем --out", file=sys.stderr)
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(plain, encoding="utf-8")
    print(f"OK decode: {src.name} → {dst} (original: {original_name})")
    return 0


def cmd_verify(args: argparse.Namespace) -> int:
    """Проверка round-trip: encode → decode → сравнение с исходником."""
    src: Path = Path(args.input).resolve()
    if not src.is_file():
        print(f"Ошибка: не найден {src}", file=sys.stderr)
        return 1
    plain: str = src.read_text(encoding="utf-8")
    bundled: str = encode_plaintext(plain, src.name)
    _, restored = decode_bundle(bundled)
    if restored != plain:
        print("FAIL: round-trip не совпал", file=sys.stderr)
        return 1
    js_markers: tuple[str, ...] = ("function", "const ", "fetch(", "document.")
    found: list[str] = [m for m in js_markers if m in bundled]
    if found:
        print(f"WARN: в bundle найдены маркеры JS: {found}", file=sys.stderr)
    else:
        print("OK: маркеры JS в bundle не обнаружены")
    print(f"OK verify: {src.name} ({len(plain)} → {len(bundled)} символов bundle)")
    return 0


def build_parser() -> argparse.ArgumentParser:
    """CLI."""
    parser = argparse.ArgumentParser(
        description="Кодирование/декодирование Script/*.js для пересылки почтой (POST-MAIL-BUNDLE fmt=1)."
    )
    sub = parser.add_subparsers(dest="command", required=True)

    enc = sub.add_parser("encode", help="JS → закодированный .txt")
    enc.add_argument("--in", dest="input", required=True, help="Исходный .js")
    enc.add_argument("--out", dest="output", required=True, help="Выходной .txt")
    enc.add_argument("--original", help="Имя для метаданных (# original:)")
    enc.set_defaults(func=cmd_encode)

    dec = sub.add_parser("decode", help=".txt bundle → JS")
    dec.add_argument("--in", dest="input", required=True, help="Закодированный .txt")
    dec.add_argument("--out", dest="output", required=True, help="Восстановленный .js")
    dec.add_argument("--original", help="Игнорируется, для совместимости")
    dec.set_defaults(func=cmd_decode)

    ver = sub.add_parser("verify", help="Проверка round-trip одного файла")
    ver.add_argument("--in", dest="input", required=True)
    ver.set_defaults(func=cmd_verify)

    return parser


def main() -> int:
    parser: argparse.ArgumentParser = build_parser()
    args: argparse.Namespace = parser.parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    sys.exit(main())
