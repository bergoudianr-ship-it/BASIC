# Simulador FA CCEE — App Streamlit

App web (Streamlit) para simular o **Fator de Alavancagem (FA)** conforme o
Manual CCEE v2023.2.0 (período sombra: K=0 e θ=0). Reaproveita integralmente
a lógica de cálculo de `calculadora_fa.py`.

## Estrutura mínima para publicar

```
simulador_fa/
├── streamlit_app.py        # o app (ponto de entrada)
├── calculadora_fa.py       # motor de cálculo (calcular_fa, combinar_portfolios)
├── requirements.txt        # streamlit, pandas
└── data/                   # dados iniciais (premissas, empresa, extra, histórico)
    ├── premissas.json
    ├── empresa.json
    ├── portfolio_extra.json
    └── historico.json
```

## Rodar localmente

```bash
cd simulador_fa
pip install -r requirements.txt
streamlit run streamlit_app.py
```

## Publicar no Streamlit Community Cloud (grátis)

1. Suba este repositório no GitHub (a pasta `simulador_fa/` inteira).
2. Acesse https://share.streamlit.io e clique em **New app**.
3. Selecione o repositório e a branch, e informe o caminho do app:
   `simulador_fa/streamlit_app.py`
4. Clique em **Deploy**. O Streamlit instala o `requirements.txt`
   automaticamente e publica uma URL pública.

> Observação: as edições feitas na interface valem para a sessão do usuário
> (não são gravadas de volta nos arquivos `data/*.json`, pois o disco do
> Streamlit Cloud é efêmero). Os `data/*.json` servem como valores iniciais.
> Para levar/trazer dados, use o **download de CSV** na aba Portfólio e a
> exportação do Histórico.

## Abas

- **Premissas** — φ, D, PLD, curva Forward, volatilidade, estresse, horas.
- **PLA** — PL bruto e as 8 deduções (Anexo I).
- **Portfólio** — Preço Fixo, Preço Variável, Derivativos e EFM (editáveis).
- **Portfólio Extra** — simulação incremental (toggle Real × Real + Extra).
- **Cálculo** — VaR, MtM, exposições, totais consolidados e FA.
- **Histórico** — série temporal e exportação CSV.
