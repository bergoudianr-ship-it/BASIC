# Backend BBCE — dados ao vivo, direto da API (produção)

Serviço em Python puro (**sem dependências**) que autentica na API de produção da
BBCE, puxa **todos os negócios**, serve a própria ferramenta e mantém tudo fresco
**atualizando sozinho a cada 10 minutos**. A ferramenta, aberta pelo backend,
recarrega os dados automaticamente — sem CSV manual.

```
server.py (na sua máquina)
   │  POST /v2/login                 -> idToken
   │  GET  /v1/all-deals/report      -> negócios (paginado)
   │  GET  /v2/tickers/{id}          -> nome do produto
   │  acumula por 'id' + converte -> CSV "Todos os Negócios"
   ▼
http://127.0.0.1:8787/  (a ferramenta, que recarrega a cada 10 min)
```

## Segurança (leia primeiro)

- As credenciais ficam **só no servidor**, no `.env` local (fora do git).
- **Troque a senha e regenere a apiKey** na BBCE — as que vieram no script
  circularam em texto puro.
- A BBCE permite **uma sessão ativa por usuário**: se a mesma conta logar em
  outro lugar, o serviço refaz o login sozinho (e vice-versa).

## Dois jeitos de alimentar a ferramenta

- **Modo `csv` (recomendado, sem API/credenciais):** o backend lê o CSV que o seu
  pipeline já grava no SharePoint (sincronizado pelo OneDrive como pasta local),
  converte e serve. Nenhuma credencial no backend. Configure `BBCE_MODE=csv` e
  `BBCE_CSV_PATH`.
- **Modo `live` (direto da API):** o backend autentica na BBCE e puxa os negócios.
  Precisa das credenciais no `.env` (ou lê do seu `pega_negociacoes_bbce.py`).

## Como rodar

```bash
cd "bbce liquidity/backend"

# 1) Demonstração (base de exemplo, sem configurar nada):
python3 server.py

# 2) Modo CSV (lê o CSV do SharePoint sincronizado):
cp .env.example .env          # BBCE_MODE=csv + BBCE_CSV_PATH=...
python3 server.py

# 3) Modo ao vivo (direto da API):
cp .env.example .env          # BBCE_MODE=live + credenciais
python3 server.py             # abre http://127.0.0.1:8787/ e atualiza a cada 10 min
```

Testar só o acesso antes: `python3 server.py --check-login` (mostra `LOGIN OK`).

No Windows dá para agendar o serviço para subir no logon, ou simplesmente deixar
a janela aberta — ele mesmo se atualiza a cada 10 minutos (não precisa de
Agendador de Tarefas neste modelo).

## Configuração (.env)

| Variável | Padrão | O que faz |
|---|---|---|
| `BBCE_MODE` | `mock` | `live` para dados reais |
| `BBCE_API_KEY` | — | apiKey da BBCE |
| `BBCE_USERNAME` | — | e-mail de login |
| `BBCE_PASSWORD` | — | senha |
| `BBCE_COMPANY_ID` | `1266` | companyExternalCode |
| `BBCE_BACKFILL_DAYS` | `180` | histórico puxado no 1º arranque |
| `BBCE_REFRESH_DAYS` | `3` | janela re-puxada a cada refresh |
| `BBCE_REFRESH_SECONDS` | `600` | intervalo de atualização (10 min) |
| `BBCE_ORIGIN_OPERATION_TYPE` | — | filtro opcional por tipo de operação |

Os negócios são **acumulados e deduplicados por `id`** e persistidos em
`cache_negocios.json` (ignorado pelo git), então reiniciar não perde histórico.

## Arquivos

| Arquivo | Papel |
|---|---|
| `config.py` | Lê o `.env` / variáveis de ambiente |
| `bbce_client.py` | Login, all-deals/report (paginado) e tickers |
| `transform.py` | Converte os negócios no CSV da ferramenta |
| `server.py` | Servidor + refresh a cada 10 min + serve a ferramenta |
| `test_transform.py` | Teste unitário da conversão |
| `.env.example` | Modelo de configuração |
