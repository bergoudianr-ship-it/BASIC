"""Testa a conversão dos negócios da API de produção -> CSV da ferramenta.

Valida: cabeçalho, prefixo FEN reconstruído, data BR, número BR, filtro de
produtos 'Spread' e defaults.
"""
import transform


def main():
    deals = [
        {"createdAt": "2026-07-15 17:10:44", "produto_nome": "SE CON MEN JUL/26 - Preço Fixo",
         "quantity": 1.0, "tradingUnit": "MWm", "unitPrice": 142.0,
         "originOperationType": "Negócio/Balcão", "tendency": "Venda", "status": "ativo"},
        {"createdAt": "2026-07-15 17:12:37", "produto_nome": "SE CON TRI ABR/27 JUN/27 - Preço Fixo",
         "quantity": 2.0, "tradingUnit": "MWm", "unitPrice": 250.5,
         "originOperationType": "Registro/Boleta", "tendency": "Compra", "status": "ativo"},
        {"createdAt": "2026-07-14 10:00:00", "produto_nome": "SE CON MEN SET/26 Spread",
         "quantity": 9.0, "tradingUnit": "MWm", "unitPrice": 99.0,
         "originOperationType": "Registro/Boleta", "tendency": "Venda", "status": "ativo"},
    ]
    csv = transform.to_csv(deals)
    lines = csv.rstrip("\r\n").split("\r\n")

    assert lines[0] == transform.CSV_HEADER, lines[0]
    assert len(lines) == 3, f"esperava 2 negócios (spread filtrado), veio {len(lines)-1}"

    r1 = lines[1].split(";")
    assert r1[0] == "FEN - SE CON MEN JUL/26 - Preço Fixo", r1[0]
    assert r1[1] == "15/07/2026 17:10:44", r1[1]
    assert r1[2] == "1", r1[2]
    assert r1[3] == "MWm", r1[3]
    assert r1[6] == "142", r1[6]
    assert r1[8] == "Venda", r1[8]
    assert r1[9] == "ativo", r1[9]

    r2 = lines[2].split(";")
    assert r2[0] == "FEN - SE CON TRI ABR/27 JUN/27 - Preço Fixo", r2[0]
    assert r2[6] == "250,5", r2[6]  # número BR

    print("PASS  transform: cabeçalho, FEN, data BR, número BR, spread filtrado, defaults OK")


if __name__ == "__main__":
    main()
