# Simulador FA CCEE — `app.py` (arquivo único, backend Python)

`app.py` é a aplicação **completa em um único arquivo Python**. O backend
(cálculo e leitura/escrita de planilhas) roda em **Python** e serve a
**mesma interface do HTML original** — comportamento idêntico ao
`static/index.html`, porém com o cálculo no servidor.

Tudo está embutido no arquivo:
- motor de cálculo (`calcular_fa`, `combinar_portfolios`);
- leitura/escrita de planilhas (modelos `.xlsx`/`.csv`, import CCEE);
- a interface HTML (idêntica ao original);
- os dados iniciais (premissas, empresa, portfólio extra, histórico).

O estado é mantido **em memória** por processo.

## Rodar localmente

```bash
pip install openpyxl        # opcional — só para modelos .xlsx e import CCEE
python app.py               # abre em http://localhost:8765
python app.py 9000          # porta customizada
```

## Publicar (Render, Railway, Fly.io, VM… qualquer host Python)

O servidor escuta em `0.0.0.0` e usa a variável de ambiente `PORT` se existir.

- **Comando de start:** `python app.py`
- Já existe um `Procfile` (`web: python app.py`) para plataformas que o usam.
- Dependência opcional: `openpyxl` (está no `requirements.txt`).

### Exemplo — Render.com
1. New → Web Service, aponte para este repositório.
2. Root Directory: `simulador_fa`
3. Build Command: `pip install -r requirements.txt`
4. Start Command: `python app.py`

> Observação: o Streamlit Community Cloud **não** roda este `app.py`
> (ele só executa `streamlit run`). Para o Streamlit, use `streamlit_app.py`.
> Este `app.py` é a versão fiel ao HTML e roda em qualquer host Python comum.

## Diferença entre os arquivos

| Arquivo | Backend | Interface | Onde publicar |
|---|---|---|---|
| `app.py` | Python (servidor HTTP) | **idêntica ao HTML** | Render/Railway/Fly/VM |
| `streamlit_app.py` | Python (Streamlit) | remontada no Streamlit | Streamlit Cloud |
| `static/index_standalone.html` | JavaScript (no navegador) | idêntica ao HTML | githack / abrir local |
