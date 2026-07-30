#!/usr/bin/env python3
"""Converte o CSV do pipeline (pega_negociacoes_bbce.py) para o formato que a
Calculadora de Análise de Produtos lê — sem alterar o CSV original do pipeline.

Entrada (colunas do seu script, separado por vírgula, gerado pelo pandas):
    createdAt, createdDate, id, produto_nome, tendency, unitPrice, quantity,
    tradingUnit, originOperationType, status

Saída (o export "Todos os Negócios", separado por ';', números em pt-BR):
    PRODUTO;DATA/HORA;Q.N;U.N.;Q.M;U.M.;PREÇO;TIPO DE CONTRATO;TENDÊNCIA;STATUS

Uso:
    python converter_para_ferramenta.py entrada.csv saida.csv
    python converter_para_ferramenta.py   # usa os caminhos padrão abaixo
"""
import csv
import re
import sys

# Caminhos padrão (ajuste para os seus, ou passe como argumentos na linha de
# comando). Por padrão procura/gera na pasta atual.
DEFAULT_IN = "todas_negociacoes_bbce.csv"
DEFAULT_OUT = "negociacoes_ferramenta.csv"

SAIDA_HEADER = ["PRODUTO", "DATA/HORA", "Q.N", "U.N.", "Q.M", "U.M.",
                "PREÇO", "TIPO DE CONTRATO", "TENDÊNCIA", "STATUS"]

# produto_nome já vem com prefixo de classe? (ex.: "FEN - ..."). Se não, prepõe.
_PREFIXO_RE = re.compile(r"^[A-Z]{2,4}\s*-\s+")


def num_br(valor):
    """Número no padrão brasileiro (vírgula decimal, sem casas se inteiro)."""
    s = (valor or "").strip()
    if s == "":
        return ""
    try:
        f = float(s.replace(",", "."))
    except ValueError:
        return s
    if f.is_integer():
        return str(int(f))
    return ("%.6f" % f).rstrip("0").rstrip(".").replace(".", ",")


def data_hora_br(valor):
    """'YYYY-MM-DD HH:MM:SS' -> 'DD/MM/YYYY HH:MM:SS' (mantém a hora)."""
    s = (valor or "").strip()
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})", s)
    if m:
        a, mes, d, h, mi, se = m.groups()
        return f"{d}/{mes}/{a} {h}:{mi}:{se}"
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", s)  # só data
    if m:
        a, mes, d = m.groups()
        return f"{d}/{mes}/{a}"
    return s


def produto_ferramenta(nome):
    """Garante o prefixo de classe que o parser da ferramenta espera (FEN - ...)."""
    nome = (nome or "").strip()
    if not nome:
        return nome
    if _PREFIXO_RE.match(nome):
        return nome
    return "FEN - " + nome


def converter(caminho_in, caminho_out):
    with open(caminho_in, "r", encoding="utf-8-sig", newline="") as f:
        leitor = csv.DictReader(f)  # vírgula por padrão (pandas)
        linhas = list(leitor)

    escritas = 0
    with open(caminho_out, "w", encoding="utf-8-sig", newline="") as f:
        escritor = csv.writer(f, delimiter=";")
        escritor.writerow(SAIDA_HEADER)
        for r in linhas:
            escritor.writerow([
                produto_ferramenta(r.get("produto_nome", "")),
                data_hora_br(r.get("createdAt", "")),
                num_br(r.get("quantity", "")),
                (r.get("tradingUnit", "") or "MWm").strip(),
                "",  # Q.M (energia MWh) não vem do pipeline
                "MWh",
                num_br(r.get("unitPrice", "")),
                (r.get("originOperationType", "") or "").strip(),
                (r.get("tendency", "") or "").strip(),
                (r.get("status", "") or "Ativo").strip(),
            ])
            escritas += 1

    print(f"Convertido: {caminho_in}")
    print(f"Gerado:     {caminho_out}  ({escritas} negócios)")


def main():
    caminho_in = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_IN
    caminho_out = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_OUT
    converter(caminho_in, caminho_out)


if __name__ == "__main__":
    main()
