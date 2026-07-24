"""Testa a conversão negócios-JSON -> CSV com uma resposta sintética.

Valida a mecânica de emissão (cabeçalho, separador, data, número BR, tendência,
defaults). Os NOMES de campo reais da BBCE ainda serão confirmados; quando forem,
ajuste FIELD_CANDIDATES em transform.py — este teste continua válido.
"""
import transform


def main():
    raw = {"data": [
        {"product": "FEN - SE CON MEN JUL/26 - Preço Fixo",
         "tradeDateTime": "2026-07-15T17:10:44Z",
         "quantity": 1, "unit": "MWm", "quantityMwh": 744, "energyUnit": "MWh",
         "price": 142, "contractType": "Negócio/Balcão", "side": "sell", "status": "Ativo"},
        {"product": "FEN - SE CON TRI ABR/27 JUN/27 - Preço Fixo",
         "tradeDateTime": "2026-07-15T17:12:37Z",
         "quantity": 1, "quantityMwh": 2184, "price": 250.5,
         "contractType": "Registro/Boleta", "side": "", "status": "Ativo"},
    ]}
    csv = transform.to_csv(raw)
    lines = csv.rstrip("\r\n").split("\r\n")

    assert lines[0] == transform.CSV_HEADER, lines[0]
    assert len(lines) == 3, len(lines)

    r1 = lines[1].split(";")
    assert r1[0] == "FEN - SE CON MEN JUL/26 - Preço Fixo", r1
    assert r1[1] == "15/07/2026 17:10:44", r1[1]
    assert r1[2] == "1", r1[2]
    assert r1[6] == "142", r1[6]
    assert r1[8] == "Venda", r1[8]
    assert r1[9] == "Ativo", r1

    r2 = lines[2].split(";")
    assert r2[3] == "MWm", r2[3]   # unidade default
    assert r2[6] == "250,5", r2[6]  # decimal BR
    assert r2[8] == "", r2[8]       # tendência vazia

    print("PASS  transform: cabeçalho, data, número BR, tendência e defaults OK")


if __name__ == "__main__":
    main()
