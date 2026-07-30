# Backend BBCE — ponte de dados ao vivo

Serviço leve (Python puro, **sem dependências**) que autentica na API da BBCE,
busca os negócios e entrega para a Calculadora de Liquidez o CSV "Todos os
Negócios" já no formato esperado — assim a ferramenta continua sendo **um único
arquivo HTML compartilhável**, sem credenciais embutidas.

## Segurança (leia primeiro)

- As credenciais ficam **só no servidor**, em variáveis de ambiente / arquivo
  `.env` local. O navegador nunca as recebe.
- **Nunca** faça commit do `.env` com valores reais (ele está no `.gitignore`).
- A senha que você compartilhou no chat deve ser considerada exposta —
  **recomendo trocá-la** na BBCE e usar a nova só aqui, via `.env`.
- A BBCE permite **uma sessão ativa por usuário**: se a mesma conta logar em
  outro lugar, este serviço refaz o login sozinho (e vice-versa — usar o serviço
  pode derrubar sua sessão aberta no site).

## Modos

| Modo   | O que faz                                                    | Credenciais |
|--------|--------------------------------------------------------------|-------------|
| `mock` | Serve a base de exemplo `data/Todos_Negocios.csv`            | não precisa |
| `live` | Autentica na BBCE e busca os negócios ao vivo               | precisa     |

O modo `mock` já deixa a integração ponta-a-ponta funcionando (front → backend →
CSV → análise). Bom para testar e até para a demo, enquanto o modo `live` não é
liberado.

## Como rodar (o jeito fácil)

- **Windows:** dê **duplo-clique em `run.bat`**.
- **Mac/Linux:** rode `bash run.sh` na pasta `backend/`.

Isso sobe o serviço, **cria o `.env` sozinho** na primeira vez e **abre a
ferramenta no navegador** (`http://127.0.0.1:8787/`). Na primeira execução ele
sobe em modo demonstração (base de exemplo).

**Para puxar os dados reais da BBCE:** abra o `.env` que foi criado na pasta
`backend/`, preencha suas credenciais e troque `BBCE_MODE=mock` por
`BBCE_MODE=live`; depois rode de novo:

```
BBCE_MODE=live
BBCE_API_KEY=sua_apikey
BBCE_COMPANY_CODE=1266
BBCE_EMAIL=seu_email
BBCE_PASSWORD=sua_senha
BBCE_WALLET_IDS=2
```

Na ferramenta, use a aba **Dados BBCE** → **Carregar todos os negócios**. Cada
clique autentica e puxa os negócios atualizados na hora.

### Rodar pela linha de comando (equivalente)

```bash
cd "bbce liquidity/backend"
python3 server.py            # sobe + abre o navegador
python3 server.py --no-browser   # sem abrir o navegador
```

### Testar só o acesso (login)

Antes de subir o serviço, dá para confirmar que suas credenciais funcionam:

```bash
python3 server.py --check-login
```

Ele só faz o login e diz `LOGIN OK` (a API aceitou) ou aponta o que faltou/errou.
Não busca dados — é só para provar o acesso.

O serviço sobe em `http://127.0.0.1:8787`:

- `GET /health` → `{"status":"ok","mode":"mock"}`
- `GET /api/negocios` → CSV "Todos os Negócios"

Na ferramenta (painel **Base de operações**), informe a URL do backend em
**"Carregar da BBCE"** e clique em carregar — os dados entram pelo mesmo caminho
de um CSV colado.

## Modo `live`: como buscar os negócios

Fluxo automático (recomendado): informe o `BBCE_WALLET_IDS` e o serviço faz o
resto — lista os tickers da carteira em `GET /v1/negotiable-tickers?walletId=`
e busca `GET /v1/negotiation-data/{tickerId}` de cada um, juntando tudo num só
CSV. O nome do produto (`PRODUTO`) é reconstruído no formato "FEN - ..." que a
ferramenta espera, a partir do `stamp` + `description` do ticker.

Alternativas: `BBCE_TRADES_PATH` (endpoint único, se existir) ou
`BBCE_TICKER_IDS` (lista fixa de tickers).

### Ainda preciso de 2 coisas para fechar o modo live

1. **A `apiKey`** — nunca foi recebida (aparece mascarada na doc). Coloque-a em
   `BBCE_API_KEY` no `.env` (não mande por chat).
2. **Um exemplo da resposta do `negotiation-data`** — a listagem de tickers e a
   autenticação já estão mapeadas e testadas, mas o `negotiation-data` devolve um
   **resumo de preços do dia**, e ainda não vi o formato real da resposta. Rode
   uma vez e me mande **um JSON de exemplo** para eu confirmar os campos de
   data/preço/volume em `transform.py` (`FIELD_CANDIDATES`).

> Nota de granularidade: o `negotiation-data` é um **resumo diário**, enquanto a
> ferramenta foi construída sobre os **negócios individuais** (cada boleta, com
> hora exata) do export "Todos os Negócios". O resumo diário funciona, mas o
> filtro intradiário (±20%) e o ticket por negócio ficam aproximados. Se houver
> um endpoint de negócios individuais, ele reproduz a metodologia com mais fidelidade.

Todo o mapeamento está isolado em `transform.py` e coberto por
`test_transform.py`.

## Arquivos

| Arquivo             | Papel                                                    |
|---------------------|----------------------------------------------------------|
| `config.py`         | Lê as variáveis de ambiente / `.env`                     |
| `bbce_client.py`    | Login, refresh, logout e busca de negócios na BBCE       |
| `transform.py`      | Converte a resposta da BBCE no CSV da ferramenta         |
| `server.py`         | Servidor HTTP (endpoints + CORS + modos mock/live)       |
| `test_transform.py` | Teste unitário da conversão para CSV                     |
| `.env.example`      | Modelo de configuração (copie para `.env`)               |
