import csv
import html
import json
import re
import sys
import zipfile
from pathlib import Path


SAFE_DATA_ROWS = 900_000
SEPARATORS = [";", ",", "\t", "|"]
PROTECTED_COLUMN_KEYS = ("CODIGO", "COD", "EAN", "BARRAS", "CPF", "CNPJ", "RUC")
DECIMAL_COMMA_RE = re.compile(r"^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+),\d+$")


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


def is_protected_column(column_name: str) -> bool:
    normalized = str(column_name).upper()
    return any(key in normalized for key in PROTECTED_COLUMN_KEYS)


def column_letter(index: int) -> str:
    result = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        result = chr(65 + remainder) + result
    return result


def cell_xml(value: str, row_index: int, column_index: int, protected: bool) -> str:
    ref = f"{column_letter(column_index)}{row_index}"
    text = "" if value is None else str(value)
    stripped = text.strip()

    if not protected and DECIMAL_COMMA_RE.match(stripped):
        number = stripped.replace(".", "").replace(",", ".")
        return f'<c r="{ref}"><v>{number}</v></c>'

    escaped = html.escape(text, quote=False)
    return f'<c r="{ref}" t="inlineStr"><is><t>{escaped}</t></is></c>'


def write_row(sheet, row_values: list[str], row_index: int, protected_columns: list[bool]) -> None:
    cells = []
    for col_index, value in enumerate(row_values, start=1):
        protected = protected_columns[col_index - 1] if col_index - 1 < len(protected_columns) else False
        cells.append(cell_xml(value, row_index, col_index, protected))
    sheet.write(f'<row r="{row_index}">{"".join(cells)}</row>'.encode("utf-8"))


def write_xlsx(rows: list[list[str]], headers: list[str], output_path: Path) -> int:
    protected_columns = [is_protected_column(header) for header in headers]
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as xlsx:
        xlsx.writestr("[Content_Types].xml", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>""")
        xlsx.writestr("_rels/.rels", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>""")
        xlsx.writestr("xl/workbook.xml", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Dados" sheetId="1" r:id="rId1"/></sheets>
</workbook>""")
        xlsx.writestr("xl/_rels/workbook.xml.rels", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>""")
        xlsx.writestr("xl/styles.xml", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>""")

        with xlsx.open("xl/worksheets/sheet1.xml", "w") as sheet:
            sheet.write(b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
            sheet.write(b'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>')
            write_row(sheet, headers, 1, [True] * len(headers))
            for index, row in enumerate(rows, start=2):
                write_row(sheet, row, index, protected_columns)
            sheet.write(b"</sheetData></worksheet>")

    return len(rows)


def convert(csv_file: str, xlsx_file: str) -> dict:
    csv_path = Path(csv_file)
    output_path = Path(xlsx_file)
    encoding = detect_encoding(csv_path)
    sample = csv_path.read_text(encoding=encoding, errors="strict")[:65536]
    separator = detect_separator(sample)
    warnings = []
    logs = []
    written_files = []

    with csv_path.open("r", encoding=encoding, newline="") as input_file:
        reader = csv.reader(input_file, delimiter=separator)
        try:
            headers = next(reader)
        except StopIteration:
            headers = []

        part_rows = []
        total_rows = 0
        part_index = 1
        output_stem = output_path.with_suffix("")

        def flush_part(rows: list[list[str]], index: int) -> None:
            if not rows and index > 1:
                return
            part_path = output_path if index == 1 else output_stem.with_name(f"{output_stem.name}_PARTE{index}").with_suffix(".xlsx")
            row_count = write_xlsx(rows, headers, part_path)
            written_files.append(str(part_path))
            logs.append(f"{part_path.name} salvo com {row_count} linhas.")

        for row in reader:
            part_rows.append(row)
            total_rows += 1
            if len(part_rows) >= SAFE_DATA_ROWS:
                flush_part(part_rows, part_index)
                part_rows = []
                part_index += 1

        flush_part(part_rows, part_index)

    if len(written_files) > 1:
        warnings.append(
            f'AVISO: "{csv_path.name}" excede o limite definido para divisao segura '
            f"({total_rows} linhas). Dividido em {len(written_files)} partes."
        )

    return {
        "ok": True,
        "files": written_files,
        "warnings": warnings,
        "logs": logs,
        "rows": total_rows,
        "encoding": encoding,
        "separator": separator,
    }


def main() -> int:
    if len(sys.argv) != 3:
        print(json.dumps({"ok": False, "error": "Uso: csv_to_xlsx.py entrada.csv saida.xlsx"}, ensure_ascii=False))
        return 2

    try:
        print(json.dumps(convert(sys.argv[1], sys.argv[2]), ensure_ascii=False))
        return 0
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
