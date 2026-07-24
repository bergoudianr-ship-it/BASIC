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

## Como rodar

```bash
cd "bbce liquidity/backend"

# 1) Modo demonstração (sem credenciais):
python3 server.py

# 2) Modo ao vivo:
cp .env.example .env      # preencha os valores no .env
# ajuste BBCE_MODE=live no .env
python3 server.py
```

O serviço sobe em `http://127.0.0.1:8787`:

- `GET /health` → `{"status":"ok","mode":"mock"}`
- `GET /api/negocios` → CSV "Todos os Negócios"

Na ferramenta (painel **Base de operações**), informe a URL do backend em
**"Carregar da BBCE"** e clique em carregar — os dados entram pelo mesmo caminho
de um CSV colado.

## Pendência para o modo `live`

O endpoint que retorna os **negócios executados** ("Todos os Negócios") ainda não
foi documentado para nós — a doc recebida cobre só a autenticação. Falta:

1. O caminho do endpoint (grupo Orders/Trades) → variável `BBCE_TRADES_PATH`.
2. Os nomes dos campos na resposta → ajuste em `transform.py` (`FIELD_CANDIDATES`).

Enquanto isso, o mapeamento em `transform.py` é uma hipótese documentada e
coberta por `test_transform.py`. Assim que a doc chegar, muda só esse arquivo.

## Arquivos

| Arquivo             | Papel                                                    |
|---------------------|----------------------------------------------------------|
| `config.py`         | Lê as variáveis de ambiente / `.env`                     |
| `bbce_client.py`    | Login, refresh, logout e busca de negócios na BBCE       |
| `transform.py`      | Converte a resposta da BBCE no CSV da ferramenta         |
| `server.py`         | Servidor HTTP (endpoints + CORS + modos mock/live)       |
| `test_transform.py` | Teste unitário da conversão para CSV                     |
| `.env.example`      | Modelo de configuração (copie para `.env`)               |
