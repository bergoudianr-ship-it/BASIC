# Passo a passo — auto-atualização a cada 10 minutos (Windows)

Objetivo: rodar o backend na sua máquina para a ferramenta puxar os negócios
direto da BBCE e **atualizar sozinha a cada 10 minutos**.

---

## Fase 0 — Segurança (faça antes)

Antes de tudo, **troque a senha e regenere a apiKey** na BBCE (as antigas
circularam em texto puro). Use as **novas** no passo 3. Nunca coloque credenciais
direto no código.

---

## Fase 1 — Instalar o Python (uma vez só)

1. Baixe em **python.org/downloads** (versão 3.x).
2. No instalador (Windows), **marque "Add Python to PATH"** antes de *Install Now*.
3. Confira: abra o **Prompt de Comando** e digite `python --version` → deve
   aparecer algo como `Python 3.12`.

## Fase 2 — Baixar o projeto

1. Acesse `https://github.com/bergoudianr-ship-it/BASIC`.
2. Selecione a branch **`claude/bbce-liquidity-calculator-8ye8o1`**.
3. Botão verde **Code → Download ZIP** e **extraia** (ex.: na Área de Trabalho).
4. Entre na pasta `bbce liquidity` → `backend`.

## Fase 3 — Configurar (uma vez só)

### Modo recomendado: ler o CSV do SharePoint (sem API, sem credenciais)

Se o seu pipeline já grava o `todas_negociacoes_bbce.csv` numa pasta do
SharePoint sincronizada pelo OneDrive, o backend só precisa ler esse arquivo:

1. Dê duplo-clique em `run.bat` uma vez (cria o `.env`); pode fechar.
2. Abra o `.env` no Bloco de Notas e deixe assim (ajuste o caminho para o seu):
   ```
   BBCE_MODE=csv
   BBCE_CSV_PATH=C:\Users\voce\GRUPO EQUATORIAL ENERGIA\Research & Middle - Documents\3. Dados\3_processados\automatico\todas_negociacoes_bbce.csv
   ```
   Salve e feche. **Pronto — sem apiKey, sem senha.** Pule para a Fase 5.

   > A pasta precisa estar **sincronizada localmente** (não "somente online" no
   > OneDrive). O backend relê o CSV a cada 10 min automaticamente.
   >
   > Pode apontar `BBCE_CSV_PATH` para o **arquivo** ou para a **pasta** — se for
   > pasta, o backend procura o `todas_negociacoes_bbce.csv` dentro dela (inclusive
   > em subpastas). Confira em `http://127.0.0.1:8787/health` o campo `source`
   > para ver qual arquivo ele está lendo.

### Modo alternativo: puxar direto da API (precisa das credenciais)

Você já tem as credenciais no seu `pega_negociacoes_bbce.py`. Escolha **uma** das
opções (as credenciais ficam só na sua máquina — nunca sobem para o repositório):

**Opção A (mais fácil) — usar o seu próprio arquivo:**
1. Copie o seu **`pega_negociacoes_bbce.py`** para dentro da pasta `backend`.
2. O backend lê as credenciais (API_KEY, USERNAME, PASSWORD, COMPANY_ID)
   direto dele — **não precisa preencher nada**.
3. Só falta ligar o modo ao vivo: dê duplo-clique em `run.bat` uma vez (cria o
   `.env`), abra o `.env` no Bloco de Notas e deixe só:
   ```
   BBCE_MODE=live
   ```

**Opção B — preencher o `.env`:**
1. Duplo-clique em `run.bat` uma vez (cria o `.env`); pode fechar.
2. Abra o `.env` no Bloco de Notas, copie os 4 valores do seu
   `pega_negociacoes_bbce.py` (linhas `API_KEY`, `USERNAME`, `PASSWORD`,
   `COMPANY_ID`) e cole:
   ```
   BBCE_MODE=live
   BBCE_API_KEY=<o API_KEY do seu script>
   BBCE_USERNAME=<o USERNAME do seu script>
   BBCE_PASSWORD=<o PASSWORD do seu script>
   BBCE_COMPANY_ID=1266
   ```
   Salve e feche.

> Recomendação de segurança: como essas credenciais já circularam em texto puro,
> o ideal é **trocar a senha e regenerar a apiKey** na BBCE e usar as novas aqui.

## Fase 4 — Testar o acesso

- Duplo-clique em **`verificar_acesso.bat`**.
- Se aparecer **`LOGIN OK`** → está tudo certo, siga para a Fase 5.
- Se der erro → ele diz o que faltou (apiKey, usuário ou senha). Corrija o `.env`.

## Fase 5 — Rodar (uso do dia a dia)

1. Duplo-clique em **`run.bat`**.
2. Abre uma janela preta (o servidor) e o **navegador sozinho** em
   `http://127.0.0.1:8787/`.
3. A ferramenta **carrega os negócios ao vivo** e **atualiza sozinha a cada 10
   minutos** — sem você fazer nada. Pode filtrar/analisar à vontade; ao atualizar,
   seus filtros e período são mantidos.
4. **Deixe a janela preta aberta** enquanto usar. Para parar: feche a janela.

> No 1º arranque ele puxa ~6 meses de histórico (pode levar um pouco). Depois,
> a cada 10 min, só busca os dias recentes e acumula (sem duplicar).

---

## Dicas

- **Subir sozinho quando ligar o PC:** aperte `Win + R`, digite `shell:startup`,
  Enter, e coloque um **atalho do `run.bat`** nessa pasta. Assim o backend sobe no
  logon.
- **Ajustes finos** (no `.env`): `BBCE_BACKFILL_DAYS` (histórico inicial),
  `BBCE_REFRESH_SECONDS` (intervalo, padrão 600 = 10 min).
- **Erro "Failed to fetch" / porta ocupada:** confira se a janela do `run.bat`
  está aberta e se a porta 8787 está livre (mude `BBCE_PORT` no `.env` se preciso).
- **Modo demonstração:** com `BBCE_MODE=mock` no `.env`, roda com a base de
  exemplo, sem credenciais — bom para testar a ferramenta.
