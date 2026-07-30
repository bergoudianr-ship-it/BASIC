"""Converte os negócios retornados pela API BBCE para o CSV que a ferramenta lê.

Saída (separador ';', idêntica ao export "Todos os Negócios" da BBCE):
    PRODUTO;DATA/HORA;Q.N;U.N.;Q.M;U.M.;PREÇO;TIPO DE CONTRATO;TENDÊNCIA;STATUS

O mapeamento de campos abaixo é uma HIPÓTESE documentada — precisa ser confirmado
contra a resposta real do endpoint de negócios da BBCE. Está isolado de propósito:
quando soubermos os nomes reais dos campos, só este arquivo muda.
"""
import datetime

CSV_HEADER = "PRODUTO;DATA/HORA;Q.N;U.N.;Q.M;U.M.;PREÇO;TIPO DE CONTRATO;TENDÊNCIA;STATUS"

# coluna do CSV -> nomes candidatos no JSON da BBCE (o 1º presente vence).
# Campos com prefixo "_" são injetados pelo cliente a partir do ticker negociável
# (PRODUTO reconstruído no formato "FEN - ...", unidades de negociação/medida).
FIELD_CANDIDATES = {
    "PRODUTO": ["_product", "product", "productName", "produto", "instrument"],
    "DATA/HORA": ["tradeDateTime", "createdAt", "dateTime", "dataHora", "date", "timestamp"],
    "Q.N": ["quantity", "volume", "qN", "quantidade"],
    "U.N.": ["_tradingUnit", "unit", "unidade", "uN"],
    "Q.M": ["quantityMwh", "energyVolume", "qM"],
    "U.M.": ["_measurementUnit", "energyUnit", "uM"],
    "PREÇO": ["price", "preco", "valor", "avgPrice", "lastPrice"],
    "TIPO DE CONTRATO": ["contractType", "tipoContrato", "type"],
    "TENDÊNCIA": ["side", "trend", "tendencia", "direction"],
    "STATUS": ["status", "situacao"],
}


def _first(rec, candidates):
    for key in candidates:
        if key in rec and rec[key] not in (None, ""):
            return rec[key]
    return ""


def _fmt_datetime(value):
    """Normaliza para 'DD/MM/YYYY HH:MM:SS'. Aceita ISO 8601 ou já formatado."""
    if not value:
        return ""
    s = str(value)
    if len(s) >= 10 and s[2] == "/" and s[5] == "/":  # já em formato BR
        return s[:19]
    try:
        return datetime.datetime.fromisoformat(
            s.replace("Z", "+00:00")).strftime("%d/%m/%Y %H:%M:%S")
    except ValueError:
        return s


def _fmt_num_br(value):
    """Número no padrão brasileiro (vírgula decimal, sem casas se inteiro)."""
    if value in (None, ""):
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    if isinstance(value, int):
        return str(value)
    return ("%.4f" % value).rstrip("0").rstrip(".").replace(".", ",")


def _fmt_side(value):
    s = str(value).strip().lower()
    if s in ("buy", "compra", "bid", "c"):
        return "Compra"
    if s in ("sell", "venda", "ask", "v"):
        return "Venda"
    return "" if s in ("", "none", "null") else str(value)


def extract_records(raw):
    """A lista de negócios pode vir na raiz ou embrulhada em várias chaves comuns."""
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict):
        for key in ("data", "content", "items", "results", "negocios", "trades"):
            if isinstance(raw.get(key), list):
                return raw[key]
    return []


def to_csv(raw):
    records = extract_records(raw)
    lines = [CSV_HEADER]
    for rec in records:
        if not isinstance(rec, dict):
            continue
        lines.append(";".join([
            str(_first(rec, FIELD_CANDIDATES["PRODUTO"])),
            _fmt_datetime(_first(rec, FIELD_CANDIDATES["DATA/HORA"])),
            _fmt_num_br(_first(rec, FIELD_CANDIDATES["Q.N"])),
            str(_first(rec, FIELD_CANDIDATES["U.N."]) or "MWm"),
            _fmt_num_br(_first(rec, FIELD_CANDIDATES["Q.M"])),
            str(_first(rec, FIELD_CANDIDATES["U.M."]) or "MWh"),
            _fmt_num_br(_first(rec, FIELD_CANDIDATES["PREÇO"])),
            str(_first(rec, FIELD_CANDIDATES["TIPO DE CONTRATO"])),
            _fmt_side(_first(rec, FIELD_CANDIDATES["TENDÊNCIA"])),
            str(_first(rec, FIELD_CANDIDATES["STATUS"]) or "Ativo"),
        ]))
    return "\r\n".join(lines) + "\r\n"
