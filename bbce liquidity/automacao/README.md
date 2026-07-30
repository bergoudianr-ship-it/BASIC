# Automação — atualização a cada 10 minutos (Windows)

Roda a sua coleta da BBCE a cada 10 minutos, mantém o CSV do pipeline e gera um
CSV pronto para carregar na ferramenta de Análise de Produtos.

```
Task Scheduler (a cada 10 min)
        │
        ▼
rodar_a_cada_10min.bat
        │  1) pega_negociacoes_bbce.py   → todas_negociacoes_bbce.csv   (seu pipeline)
        │  2) converter_para_ferramenta.py → negociacoes_ferramenta.csv (para a ferramenta)
        ▼
Você abre a ferramenta e carrega "negociacoes_ferramenta.csv"
```

---

## ⚠️ Segurança primeiro

O seu `pega_negociacoes_bbce.py` tinha **apiKey, usuário e senha no código**. Isso
não pode ir para o repositório (que é público). Faça duas coisas:

1. **Troque a senha e regenere a apiKey** com a BBCE — elas já circularam em texto puro.
2. **Tire as credenciais do código** e coloque num arquivo `.env` local (passo abaixo).

### Tirar as credenciais do código

No topo do `pega_negociacoes_bbce.py`, **substitua** o bloco:

```python
API_KEY: str = "..."       # a apiKey que estava no código
USERNAME: str = "..."      # o e-mail
PASSWORD: str = "..."      # a senha
COMPANY_ID: str = "1266"
```

por:

```python
import os
from pathlib import Path

def _load_env():
    p = Path(__file__).with_name(".env")
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

_load_env()
API_KEY = os.environ.get("BBCE_API_KEY", "")
USERNAME = os.environ.get("BBCE_USERNAME", "")
PASSWORD = os.environ.get("BBCE_PASSWORD", "")
COMPANY_ID = os.environ.get("BBCE_COMPANY_ID", "1266")
```

Depois copie `.env.example` para `.env` (na mesma pasta) e preencha com as
credenciais **novas**. O `.env` está no `.gitignore` — nunca sobe para o git.

---

## Passo a passo

1. **Junte os arquivos** numa pasta na sua máquina, por exemplo `C:\bbce\`:
   - `pega_negociacoes_bbce.py` (seu script, já com o `.env` — passo acima)
   - `converter_para_ferramenta.py`
   - `rodar_a_cada_10min.bat`
   - `.env` (com as credenciais novas)

2. **Ajuste os caminhos:**
   - No `rodar_a_cada_10min.bat`: a variável `PASTA` (onde estão os scripts).
   - No `converter_para_ferramenta.py`: `DEFAULT_IN` (o CSV do seu pipeline) e
     `DEFAULT_OUT` (onde salvar o CSV da ferramenta). Por padrão usam a pasta
     atual; aponte para o seu caminho do SharePoint, ou passe como argumentos:
     `python converter_para_ferramenta.py "C:\...\todas_negociacoes_bbce.csv" "C:\...\negociacoes_ferramenta.csv"`.

3. **Teste manualmente** (abra o Prompt de Comando na pasta e rode):
   ```
   rodar_a_cada_10min.bat
   ```
   Confira se `negociacoes_ferramenta.csv` foi criado e se os logs
   (`log_coleta.txt`, `log_conversao.txt`) não têm erro.

4. **Agende a cada 10 minutos.** No Prompt de Comando **como Administrador**:
   ```
   schtasks /Create /SC MINUTE /MO 10 /TN "BBCE Atualiza 10min" /TR "C:\bbce\rodar_a_cada_10min.bat" /ST 07:00 /F
   ```
   - `/SC MINUTE /MO 10` = a cada 10 minutos.
   - `/ST 07:00` = horário de início (ajuste se quiser).
   - Para conferir: `schtasks /Query /TN "BBCE Atualiza 10min"`
   - Para remover: `schtasks /Delete /TN "BBCE Atualiza 10min" /F`

   > Alternativa pela interface: **Agendador de Tarefas → Criar Tarefa Básica**,
   > gatilho "Diariamente", e em **Repetir a cada 10 minutos** por "1 dia".

5. **Na ferramenta:** abra o `liquidez.html` e carregue o
   `negociacoes_ferramenta.csv` (arraste ou cole). Como o arquivo é
   reescrito a cada 10 min, basta recarregar para ver o dado mais novo.

---

## Observações

- **Dedup e idempotência:** o seu script já deduplica por `id`, então rodar a
  cada 10 minutos não duplica negócios.
- **Filtro de outliers:** o seu pipeline já remove outliers (3σ sobre as 20
  anteriores). A ferramenta aplica, por cima, o filtro intradiário dela (±20% da
  mediana do dia/produto) — são critérios diferentes e complementares.
- **Formato:** o conversor reconstrói o nome do produto no padrão `FEN - …`,
  passa as datas para `DD/MM/AAAA HH:MM:SS` e os números para o padrão brasileiro,
  que é o que a ferramenta espera.
- **Automatizar também o carregamento na tela** (a ferramenta atualizar sozinha,
  sem recarregar) exige um pequeno servidor local — é o caminho "backend" que
  deixamos para depois; quando quiser, a gente liga isso.
