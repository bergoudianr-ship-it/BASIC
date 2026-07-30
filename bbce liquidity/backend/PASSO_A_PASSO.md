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

## Fase 3 — Configurar as credenciais (uma vez só)

1. Na pasta `backend`, dê **duplo-clique em `run.bat`** uma vez. Ele cria o
   arquivo **`.env`** automaticamente (e sobe em modo demonstração — pode fechar).
2. Abra o `.env` com o **Bloco de Notas** e preencha com as credenciais **novas**:
   ```
   BBCE_MODE=live
   BBCE_API_KEY=sua_apikey_nova
   BBCE_USERNAME=seu_email@echoenergia.com.br
   BBCE_PASSWORD=sua_senha_nova
   BBCE_COMPANY_ID=1266
   ```
   Salve e feche. (O `.env` fica só na sua máquina — não sobe para lugar nenhum.)

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
