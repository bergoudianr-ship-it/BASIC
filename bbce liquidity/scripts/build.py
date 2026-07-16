#!/usr/bin/env python3
"""
Gera o arquivo standalone `liquidez.html` a partir de:
  - liquidez_template.html  (a ferramenta, com o placeholder __EMBEDDED_DATA_PLACEHOLDER__)
  - data/Todos_Negocios.csv (a base de negócios da BBCE que fica embutida por padrão)

A base é comprimida com gzip e codificada em base64, e injetada no template.
No navegador, a ferramenta descomprime com DecompressionStream('gzip') no carregamento.

Uso:
    python3 scripts/build.py                     # usa data/Todos_Negocios.csv
    python3 scripts/build.py caminho/para/base.csv
"""
import base64
import gzip
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE = os.path.join(ROOT, "liquidez_template.html")
DEFAULT_CSV = os.path.join(ROOT, "data", "Todos_Negocios.csv")
OUTPUT = os.path.join(ROOT, "liquidez.html")
PLACEHOLDER = "__EMBEDDED_DATA_PLACEHOLDER__"


def main():
    csv_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CSV

    with open(TEMPLATE, "r", encoding="utf-8") as f:
        template = f.read()
    if template.count(PLACEHOLDER) != 1:
        raise SystemExit(
            f"Esperava exatamente 1 ocorrência de {PLACEHOLDER} no template, "
            f"encontrei {template.count(PLACEHOLDER)}."
        )

    with open(csv_path, "rb") as f:
        raw = f.read()

    # mtime=0 para saída determinística (rebuilds byte-idênticos com a mesma base)
    import io
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb", compresslevel=9, mtime=0) as gz:
        gz.write(raw)
    comp = buf.getvalue()
    b64 = base64.b64encode(comp).decode("ascii")

    out = template.replace(PLACEHOLDER, b64)
    with open(OUTPUT, "w", encoding="utf-8") as f:
        f.write(out)

    print(f"Base:      {csv_path}  ({len(raw):,} bytes)")
    print(f"Gzip+b64:  {len(b64):,} caracteres embutidos")
    print(f"Gerado:    {OUTPUT}  ({len(out):,} bytes)")


if __name__ == "__main__":
    main()
