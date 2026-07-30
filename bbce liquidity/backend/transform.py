"""Converte os negócios da API de produção para o CSV que a ferramenta lê.

Saída (export "Todos os Negócios", separador ';', números em pt-BR):
    PRODUTO;DATA/HORA;Q.N;U.N.;Q.M;U.M.;PREÇO;TIPO DE CONTRATO;TENDÊNCIA;STATUS

Campos de entrada (all-deals/report + produto_nome via tickers):
    createdAt, produto_nome, quantity, tradingUnit, unitPrice,
    originOperationType, tendency, status
"""
import re

CSV_HEADER = "PRODUTO;DATA/HORA;Q.N;U.N.;Q.M;U.M.;PREÇO;TIPO DE CONTRATO;TENDÊNCIA;STATUS"
_PREFIXO = re.compile(r"^[A-Z]{2,4}\s*-\s+")


def _num_br(value):
    if value is None or value == "":
        return ""
    try:
        f = float(value)
    except (TypeError, ValueError):
        return str(value)
    if f.is_integer():
        return str(int(f))
    return ("%.6f" % f).rstrip("0").rstrip(".").replace(".", ",")


def _dt_br(value):
    s = str(value or "").strip()
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})", s)
    if m:
        a, mo, d, h, mi, se = m.groups()
        return f"{d}/{mo}/{a} {h}:{mi}:{se}"
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        a, mo, d = m.groups()
        return f"{d}/{mo}/{a}"
    return s


def _produto(nome):
    nome = str(nome or "").strip()
    if not nome:
        return nome
    return nome if _PREFIXO.match(nome) else "FEN - " + nome


def _is_spread(nome):
    return str(nome or "").strip().lower().endswith("spread")


def to_csv(deals):
    lines = [CSV_HEADER]
    for d in deals:
        nome = d.get("produto_nome")
        if _is_spread(nome):
            continue
        lines.append(";".join([
            _produto(nome),
            _dt_br(d.get("createdAt")),
            _num_br(d.get("quantity")),
            str(d.get("tradingUnit") or "MWm"),
            "",
            "MWh",
            _num_br(d.get("unitPrice")),
            str(d.get("originOperationType") or ""),
            str(d.get("tendency") or ""),
            str(d.get("status") or "Ativo"),
        ]))
    return "\r\n".join(lines) + "\r\n"
