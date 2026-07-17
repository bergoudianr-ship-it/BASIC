#!/usr/bin/env python3
"""
Gera o arquivo standalone `liquidez.html` a partir de:
  - liquidez_template.html  (a ferramenta, com os placeholders __EMBEDDED_DATA_PLACEHOLDER__
    e __ECHOENERGIA_LOGO_B64__, entre outros de assets/)
  - data/Todos_Negocios.csv (a base de negócios da BBCE que fica embutida por padrão)
  - assets/*.png            (logos embutidos como data URI, ver ASSET_PLACEHOLDERS)

A base é comprimida com gzip e codificada em base64, e injetada no template.
No navegador, a ferramenta descomprime com DecompressionStream('gzip') no carregamento.
Os logos são injetados como base64 puro (sem compressão, já são PNGs).

Uso:
    python3 scripts/build.py                     # usa data/Todos_Negocios.csv
    python3 scripts/build.py caminho/para/base.csv
"""
import base64
import gzip
import io
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE = os.path.join(ROOT, "liquidez_template.html")
DEFAULT_CSV = os.path.join(ROOT, "data", "Todos_Negocios.csv")
ASSETS_DIR = os.path.join(ROOT, "assets")
OUTPUT = os.path.join(ROOT, "liquidez.html")
PLACEHOLDER = "__EMBEDDED_DATA_PLACEHOLDER__"

# placeholder no template -> arquivo de imagem em assets/ (base64 puro, sem gzip)
ASSET_PLACEHOLDERS = {
    "__ECHOENERGIA_LOGO_B64__": "echoenergia-logo.png",
}


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
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb", compresslevel=9, mtime=0) as gz:
        gz.write(raw)
    comp = buf.getvalue()
    b64 = base64.b64encode(comp).decode("ascii")

    out = template.replace(PLACEHOLDER, b64)

    print(f"Base:      {csv_path}  ({len(raw):,} bytes)")
    print(f"Gzip+b64:  {len(b64):,} caracteres embutidos")

    for placeholder, filename in ASSET_PLACEHOLDERS.items():
        asset_path = os.path.join(ASSETS_DIR, filename)
        if placeholder not in out:
            continue  # asset opcional ainda não referenciado no template
        if not os.path.exists(asset_path):
            raise SystemExit(f"Asset não encontrado: {asset_path} (placeholder {placeholder})")
        with open(asset_path, "rb") as f:
            asset_bytes = f.read()
        asset_b64 = base64.b64encode(asset_bytes).decode("ascii")
        n = out.count(placeholder)
        out = out.replace(placeholder, asset_b64)
        print(f"Asset:     {filename} ({len(asset_bytes):,} bytes) -> {placeholder} ({n}x)")

    with open(OUTPUT, "w", encoding="utf-8") as f:
        f.write(out)

    print(f"Gerado:    {OUTPUT}  ({len(out):,} bytes)")


if __name__ == "__main__":
    main()
