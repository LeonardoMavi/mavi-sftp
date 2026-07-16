import csv
import json
import re
import sys
from pathlib import Path


SEPARATORS = [";", ",", "\t", "|"]
DATE_COLUMN = "FECHA_COMERCIAL"


def detect_encoding(csv_path: Path) -> str:
    data = csv_path.read_bytes()
    try:
        data.decode("utf-8")
        return "utf-8"
    except UnicodeDecodeError:
        return "latin-1"


def detect_separator(sample: str) -> str:
    best_separator = ","
    best_score = 1

    for separator in SEPARATORS:
        try:
            rows = list(csv.reader(sample.splitlines()[:40], delimiter=separator))
        except csv.Error:
            continue

        column_counts = [len(row) for row in rows if row]
        if not column_counts:
            continue

        score = max(column_counts)
        if score > best_score:
            best_score = score
            best_separator = separator

    return best_separator


def sanitize_name(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", value).strip("._")


def find_date_column(headers: list[str]) -> str:
    for header in headers:
        if header.strip().upper() == DATE_COLUMN:
            return header
    raise ValueError(f"Coluna {DATE_COLUMN} nao encontrada")


def split_daily_sales(csv_file: str, output_dir: str, period: str) -> dict:
    csv_path = Path(csv_file)
    dest_dir = Path(output_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)

    encoding = detect_encoding(csv_path)
    sample = csv_path.read_text(encoding=encoding, errors="strict")[:65536]
    separator = detect_separator(sample)

    outputs = {}
    writers = {}
    counts = {}
    output_files = []
    logs = []
    filter_by_period = period.lower() not in {"all", "*", ""}

    try:
        with csv_path.open("r", encoding=encoding, newline="") as input_file:
            reader = csv.DictReader(input_file, delimiter=separator)
            headers = reader.fieldnames or []
            date_column = find_date_column(headers)

            for row in reader:
                day = str(row.get(date_column, "")).strip()
                if not re.fullmatch(r"\d{8}", day):
                    continue
                if filter_by_period and not day.startswith(period):
                    continue

                if day not in writers:
                    output_name = f"{sanitize_name(csv_path.stem)}_DIA_{day}.csv"
                    output_path = dest_dir / output_name
                    output_file = output_path.open("w", encoding=encoding, newline="")
                    writer = csv.DictWriter(output_file, fieldnames=headers, delimiter=separator)
                    writer.writeheader()
                    outputs[day] = output_file
                    writers[day] = writer
                    counts[day] = 0
                    output_files.append(str(output_path))

                writers[day].writerow(row)
                counts[day] += 1
    finally:
        for output_file in outputs.values():
            output_file.close()

    for day in sorted(counts):
        logs.append(f"{csv_path.name}: dia {day} salvo com {counts[day]} linha(s).")

    return {
        "ok": True,
        "files": output_files,
        "days": sorted(counts),
        "rows": sum(counts.values()),
        "encoding": encoding,
        "separator": separator,
        "logs": logs,
        "warnings": [],
    }


def main() -> int:
    if len(sys.argv) != 4:
        print(json.dumps({"ok": False, "error": "Uso: split_daily_sales.py entrada.csv pasta_saida periodo_yyyymm|all"}, ensure_ascii=False))
        return 2

    try:
        print(json.dumps(split_daily_sales(sys.argv[1], sys.argv[2], sys.argv[3]), ensure_ascii=False))
        return 0
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
