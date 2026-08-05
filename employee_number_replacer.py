#!/usr/bin/env python3
"""Утилита замены employeeNumber в JSON-выгрузках по CSV-справочнику."""

from __future__ import annotations

import argparse
import csv
import json
import random
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class EmployeeRow:
    person_number_8: str
    surname: str
    first_name: str
    gosb_code: str
    tb_code: str


def normalize_person_number(raw: Any) -> str:
    """Привести табельный к формату из 8 цифр."""
    digits: str = "".join(ch for ch in str(raw or "") if ch.isdigit())
    if not digits:
        return ""
    return digits[-8:].zfill(8)


def load_config(config_path: Path) -> dict[str, Any]:
    """Загрузить конфиг из JSON-файла."""
    with config_path.open("r", encoding="utf-8") as fp:
        cfg: dict[str, Any] = json.load(fp)
    return cfg


def resolve_config_path(cli_config: str | None) -> Path:
    """
    Найти путь к конфигу.
    Приоритет:
    1) явный --config;
    2) config_emp_replace.json рядом со скриптом;
    3) первый config_*.json рядом со скриптом.
    """
    if cli_config:
        path = Path(cli_config).expanduser().resolve()
        if not path.is_file():
            raise FileNotFoundError(f"Конфиг не найден: {path}")
        return path

    script_dir: Path = Path(__file__).resolve().parent
    preferred: Path = script_dir / "config_emp_replace.json"
    if preferred.is_file():
        return preferred

    candidates: list[Path] = sorted(script_dir.glob("config_*.json"))
    if candidates:
        return candidates[0]

    raise FileNotFoundError(
        "Конфиг не указан и не найден рядом со скриптом "
        "(ожидается config_emp_replace.json или config_*.json). "
        "Можно передать путь явно: --config путь/к/config.json"
    )


def load_employee_pool(csv_path: Path, cfg: dict[str, Any]) -> dict[str, EmployeeRow]:
    """Считать пул табельных из CSV с фильтрами."""
    delimiter: str = str(cfg.get("csv_delimiter", ";"))
    filters: dict[str, str] = {
        "BUSINESS_BLOCK": str(cfg.get("filter_business_block", "KMKKSB")),
        "ROLE_CODE": str(cfg.get("filter_role_code", "KM_KKSB")),
        "UCH_CODE": str(cfg.get("filter_uch_code", "1")),
    }
    pool: dict[str, EmployeeRow] = {}
    with csv_path.open("r", encoding="utf-8-sig", newline="") as fp:
        reader = csv.DictReader(fp, delimiter=delimiter)
        for row in reader:
            if any(str(row.get(k, "")).strip() != v for k, v in filters.items()):
                continue
            person_number_8: str = normalize_person_number(row.get("PERSON_NUMBER", ""))
            if not person_number_8:
                continue
            pool[person_number_8] = EmployeeRow(
                person_number_8=person_number_8,
                surname=str(row.get("SURNAME", "")).strip(),
                first_name=str(row.get("FIRST_NAME", "")).strip(),
                gosb_code=str(row.get("GOSB_CODE", "")).strip(),
                tb_code=str(row.get("TB_CODE", "")).strip(),
            )
    return pool


def walk_employee_nodes(node: Any) -> list[dict[str, Any]]:
    """Найти все объекты, где присутствует employeeNumber."""
    found: list[dict[str, Any]] = []
    if isinstance(node, dict):
        if "employeeNumber" in node:
            found.append(node)
        for value in node.values():
            found.extend(walk_employee_nodes(value))
    elif isinstance(node, list):
        for item in node:
            found.extend(walk_employee_nodes(item))
    return found


def collect_input_files(input_dir: Path, cfg: dict[str, Any]) -> list[Path]:
    """
    Собрать входные JSON.
    Приоритет: cfg.input_files (список имён) → иначе input_glob в input_dir.
    """
    raw_names: Any = cfg.get("input_files")
    files: list[Path] = []
    seen: set[str] = set()

    if isinstance(raw_names, list) and raw_names:
        for item in raw_names:
            name: str = str(item or "").strip()
            if not name:
                continue
            path = Path(name)
            if not path.is_absolute():
                path = input_dir / path
            path = path.resolve()
            key: str = str(path)
            if key in seen:
                continue
            seen.add(key)
            if not path.is_file():
                raise FileNotFoundError(f"Входной файл не найден: {path}")
            files.append(path)
        return files

    pattern: str = str(cfg.get("input_glob", "*.json"))
    for path in sorted(input_dir.glob(pattern)):
        if not path.is_file():
            continue
        key = str(path.resolve())
        if key in seen:
            continue
        seen.add(key)
        files.append(path.resolve())
    return files


def build_mapping(
    source_numbers: list[str], pool: dict[str, EmployeeRow], rng: random.Random
) -> dict[str, EmployeeRow]:
    """Построить биективное соответствие исходных табельных и замен."""
    unique_sources: list[str] = sorted(set(source_numbers))
    available_rows: list[EmployeeRow] = list(pool.values())
    rng.shuffle(available_rows)
    if len(unique_sources) > len(available_rows):
        raise RuntimeError(
            f"Недостаточно табельных в пуле замены: нужно {len(unique_sources)}, доступно {len(available_rows)}"
        )
    mapping: dict[str, EmployeeRow] = {}
    for idx, src in enumerate(unique_sources):
        mapping[src] = available_rows[idx]
    return mapping


def replace_in_document(
    payload: Any, mapping: dict[str, EmployeeRow], tb_to_ter: dict[str, str]
) -> tuple[int, int]:
    """Заменить employeeNumber и связанные поля в одном JSON-документе."""
    replaced_total: int = 0
    replaced_emp_nodes: int = 0
    for node in walk_employee_nodes(payload):
        src_raw: Any = node.get("employeeNumber", "")
        src_norm: str = normalize_person_number(src_raw)
        if not src_norm or src_norm not in mapping:
            continue
        target: EmployeeRow = mapping[src_norm]
        node["employeeNumber"] = target.person_number_8
        replaced_total += 1
        replaced_emp_nodes += 1
        if "lastName" in node:
            node["lastName"] = target.surname
        if "firstName" in node:
            node["firstName"] = target.first_name
        if "gosbCode" in node:
            node["gosbCode"] = target.gosb_code
        if "tbCode" in node:
            node["tbCode"] = target.tb_code
        if "terDivisionName" in node:
            node["terDivisionName"] = str(
                tb_to_ter.get(target.tb_code, node.get("terDivisionName", ""))
            )
    return replaced_total, replaced_emp_nodes


def main() -> None:
    """Точка входа CLI."""
    parser = argparse.ArgumentParser(
        description="Замена employeeNumber в JSON-файлах. "
        "Без аргументов берёт config_emp_replace.json рядом со скриптом."
    )
    parser.add_argument(
        "--config",
        required=False,
        default=None,
        help="Опционально: путь к config_<name>.json (по умолчанию автопоиск рядом со скриптом)",
    )
    args = parser.parse_args()

    try:
        config_path: Path = resolve_config_path(args.config)
    except FileNotFoundError as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        raise SystemExit(2) from exc

    cfg: dict[str, Any] = load_config(config_path)
    base_dir: Path = config_path.parent

    input_dir: Path = (base_dir / str(cfg.get("input_dir", "IN"))).resolve()
    output_dir: Path = (base_dir / str(cfg.get("output_dir", "OUT"))).resolve()
    csv_path: Path = (
        base_dir / str(cfg.get("employee_csv_file", "custom_cib_kksb_dvl.dm_gamification_list_employee.csv"))
    ).resolve()
    output_prefix: str = str(cfg.get("output_prefix", "REPL_EmpID_"))
    seed: int = int(cfg.get("random_seed", 20260805))
    tb_to_ter: dict[str, str] = {
        str(k): str(v) for k, v in dict(cfg.get("tb_to_ter_division_name", {})).items()
    }

    print(f"Конфиг: {config_path}")
    try:
        files: list[Path] = collect_input_files(input_dir, cfg)
    except FileNotFoundError as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        raise SystemExit(2) from exc

    if not files:
        print(
            f"[ERROR] Нет входных файлов. Задайте input_files в конфиге "
            f"или положите JSON в {input_dir}",
            file=sys.stderr,
        )
        raise SystemExit(2)

    if not csv_path.is_file():
        print(f"[ERROR] CSV-справочник не найден: {csv_path}", file=sys.stderr)
        raise SystemExit(2)

    output_dir.mkdir(parents=True, exist_ok=True)
    pool: dict[str, EmployeeRow] = load_employee_pool(csv_path, cfg)
    if not pool:
        print("[ERROR] CSV не дал ни одной записи после фильтрации", file=sys.stderr)
        raise SystemExit(2)

    docs: list[tuple[Path, Any]] = []
    all_source_numbers: list[str] = []
    for path in files:
        with path.open("r", encoding="utf-8") as fp:
            payload: Any = json.load(fp)
        docs.append((path, payload))
        for node in walk_employee_nodes(payload):
            normalized: str = normalize_person_number(node.get("employeeNumber", ""))
            if normalized:
                all_source_numbers.append(normalized)

    if not all_source_numbers:
        print("[ERROR] Во входных файлах не найдено ни одного employeeNumber", file=sys.stderr)
        raise SystemExit(2)

    rng = random.Random(seed)
    mapping: dict[str, EmployeeRow] = build_mapping(all_source_numbers, pool, rng)

    total_replaced: int = 0
    for path, payload in docs:
        replaced_total, _ = replace_in_document(payload, mapping, tb_to_ter)
        total_replaced += replaced_total
        out_path: Path = output_dir / f"{output_prefix}{path.name}"
        with out_path.open("w", encoding="utf-8") as fp:
            json.dump(payload, fp, ensure_ascii=False, indent=2)
            fp.write("\n")
        print(f"[OK] {path.name} -> {out_path.name} | замен: {replaced_total}")

    print(
        f"Готово. Файлов: {len(docs)}, уникальных исходных employeeNumber: {len(set(all_source_numbers))}, "
        f"всего замен: {total_replaced}, размер пула: {len(pool)}"
    )


if __name__ == "__main__":
    main()
