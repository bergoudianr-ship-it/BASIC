# Documentação — Análise de Produtos BBCE

Como a ferramenta transforma os negócios da BBCE em métricas de liquidez, horizonte e preço.
Tudo roda no navegador (um único `liquidez.html`), sem enviar dados para fora.

---

## 1. Visão geral do fluxo

```
CSV de negócios (manual ou API BBCE)
        │
        ▼
1. Leitura e decodificação (UTF-8 / Latin-1)
2. Parse de cada linha  →  produto, DATA/HORA, volume, preço, status
3. Parse da nomenclatura do produto (submercado, fonte, família, entrega, tipo)
        │
        ▼
4. Filtros (cancelados, status, período, submercado, fonte, família, tipo de preço)
5. Filtro de outliers intradiários (±20% da mediana do dia/produto)
6. Classificação por horizonte (M+N, A+N, T+N, S+N, B+N) via DATA/HORA
        │
        ├──► Aba ANÁLISE  — liquidez por horizonte (volume, giro, frequência, preço)
        ├──► Aba PREÇOS   — VWAP, volatilidade, curva a termo, ranking
        └──► Aba COMPARADOR — séries por produto no tempo (dia/semana/mês)
```

---

## 2. Entrada de dados

**Colunas esperadas** (separador `;`, exportação "Todos os Negócios" da BBCE):

`PRODUTO ; DATA/HORA ; Q.N ; U.N. ; Q.M ; U.M. ; PREÇO ; TIPO DE CONTRATO ; TENDÊNCIA ; STATUS`

- **Codificação:** detectada automaticamente (tenta UTF-8; se houver caractere inválido, usa Windows-1252/Latin-1).
- **Números** no padrão brasileiro: `.` separador de milhar e `,` decimal → convertidos para número (`"1.234,5"` → `1234.5`).
- **DATA/HORA:** formato `DD/MM/AAAA HH:MM:SS`. É a **data de criação do negócio** — base de toda a classificação por horizonte.
- **Fontes:** colar/arrastar o CSV, ou puxar ao vivo pela aba **Dados BBCE** (backend local). O resultado é idêntico: o backend entrega o mesmo formato de CSV.

### Nomenclatura do produto

Cada `PRODUTO` é lido no padrão:

```
FEN - <SUBMERCADO> <FONTE> <FAMÍLIA> <ENTREGA…> - <TIPO DE PREÇO>
```

Exemplo: `FEN - SE CON MEN JUL/26 - Preço Fixo`

| Campo | Exemplo | Significado |
|---|---|---|
| Submercado | `SE` | SE, SU, NE, NO |
| Fonte / Classificação | `CON` | ex.: convencional |
| Família | `MEN` | MEN, ANU, TRI, SEM, BIM… |
| Entrega | `JUL/26` | mês(es)/ano de fornecimento (1 ou 2 tokens `MMM/AA`) |
| Tipo de preço | `Preço Fixo` | |

Linhas cujo `PRODUTO` não bate com esse padrão são **ignoradas** (contabilizadas como "não reconhecidas").

---

## 3. Filtros aplicados antes do cálculo

Na ordem, cada negócio passa por:

1. **Cancelados** — qualquer `STATUS` contendo "cancelad" é **sempre excluído** (independe dos filtros).
2. **Status** — por padrão só `Ativo` (ajustável).
3. **Período** — a `DATA/HORA` precisa estar entre início e fim selecionados (padrão: toda a base).
4. **Submercado / Fonte / Família / Tipo de preço** — conforme as caixas marcadas à esquerda.
   Padrão replicando o relatório original: **SE + CON + Preço Fixo**, todas as famílias.
5. **Números válidos** — preço e volume precisam ser numéricos.

### Filtro de outliers intradiários (±20%)

Para não deixar um preço digitado errado distorcer as médias:

- Os negócios são agrupados por **(produto exato + dia)**.
- Calcula-se a **mediana** dos preços daquele produto naquele dia.
- Um negócio é **excluído** se `|preço − mediana| / mediana > 20%`.

O limite (20%) é ajustável no painel. Os excluídos são reportados como "Excluídos (intradiário)".

---

## 4. Classificação por horizonte (M+N, A+N, T+N, S+N, B+N)

O **horizonte** mede a antecedência entre a **criação** do negócio (DATA/HORA) e o **início da entrega** (primeira data do produto). É por isso que ele "desliza" com o tempo: o mesmo produto é M+2 hoje e M+1 no mês seguinte, porque a referência é a data de criação de cada negócio.

Cada família tem uma unidade de período:

| Família | Prefixo | Unidade | Tokens de entrega |
|---|---|---|---|
| MEN — Mensal | M+N | mês | 1 |
| ANU — Anual | A+N | ano | 2 |
| TRI — Trimestral | T+N | trimestre | 2 |
| SEM — Semestral | S+N | semestre | 2 |
| BIM — Bimestral | B+N | bimestre | 2 |

O cálculo converte ano/mês em um **índice de período** e subtrai:

```
índice(mês)       = ano*12 + (mês-1)
índice(trimestre) = ano*4  + ⌊(mês-1)/3⌋
índice(semestre)  = ano*2  + ⌊(mês-1)/6⌋
índice(bimestre)  = ano*6  + ⌊(mês-1)/2⌋
índice(ano)       = ano

horizonte = índice(entrega) − índice(criação)
```

- **M+0** = entrega no próprio mês da criação; **M+1** = mês seguinte; e assim por diante.
- Horizonte **negativo** (entrega antes da criação) é tratado como inconsistência e desconsiderado.
- Produtos cujo nº de datas de entrega não bate com o esperado da família entram em "Outras famílias" e não nas tabelas de horizonte.

---

## 5. Calendário de dias úteis

Vários indicadores dividem por "dias úteis". Um dia é útil se **não** é sábado/domingo e **não** é feriado nacional.

**Feriados fixos:** 01/01, 21/04, 01/05, 07/09, 12/10, 02/11, 15/11, 20/11 (Consciência Negra), 25/12.

**Feriados móveis** (derivados da Páscoa): Carnaval (segunda e terça), Sexta-feira Santa, Corpus Christi. A data da Páscoa é calculada pelo **algoritmo de Gauss/Meeus** (computus), então o calendário funciona para qualquer ano sem tabela fixa.

`dias úteis no período` = contagem desses dias entre o início e o fim selecionados.

---

## 6. Aba ANÁLISE — métricas de liquidez por horizonte

Para cada família, os negócios (já filtrados e sem outliers) são agrupados por **horizonte**. Definições:

| Métrica | Fórmula |
|---|---|
| **Volume (Q.N)** | soma de `Q.N` (MWm) do horizonte |
| **Nº de negócios** | contagem de negócios |
| **Dias c/ negócio** | nº de dias distintos com ao menos um negócio |
| **Dias úteis** | dias úteis do período (calendário acima) |
| **Share do volume** | volume do horizonte ÷ volume total da família |
| **Vol. médio / dia útil** | volume ÷ dias úteis |
| **Negócios / dia útil** | nº de negócios ÷ dias úteis |
| **Vol. / dia negociado** | volume ÷ dias c/ negócio |
| **Ticket médio** | volume ÷ nº de negócios |
| **Frequência** | dias c/ negócio ÷ dias úteis |
| **Preço mediano** | mediana dos preços do horizonte |
| **Preço médio ponderado** | Σ(preço·volume) ÷ Σ(volume) |

Complementos da aba:
- **Volume por horizonte** (gráfico) e **Evolução mensal por horizonte** (volume, MWm/dia útil ou nº de negócios).
- **Média por dia útil (mensal)** = volume do mês ÷ dias úteis do mês.
- **Grade M+N por dia útil**: volume médio por dia útil, cruzando mês de criação × horizonte.

---

## 7. Aba PREÇOS — análise quantitativa

Todos os cálculos usam o mesmo conjunto de negócios limpos (pós-filtros e sem outliers), com preço em **R$/MWh**.

| Métrica | Fórmula |
|---|---|
| **VWAP** (preço médio ponderado) | `Σ(preço·volume) ÷ Σ(volume)` |
| **Preço médio simples** | média aritmética dos preços dos negócios |
| **Volatilidade** | desvio-padrão dos preços: `√(E[preço²] − E[preço]²)` |
| **CV %** (coef. de variação) | `desvio-padrão ÷ média × 100` |
| **Faixa de preço** | menor e maior preço observados |

- **Curva a termo:** para cada **período de início de fornecimento** (ex.: JAN/26, FEV/26…), o **VWAP** dos negócios cujo produto começa a entregar naquele período. Quando há mais de um submercado, mostra o VWAP por submercado. A barra é o preço relativo ao maior VWAP da curva.
- **Estatísticas por família:** as métricas acima, quebradas por MEN/ANU/TRI/…
- **Produtos mais negociados:** top 15 por volume, com share (% do volume total), VWAP e volatilidade — mostra onde a liquidez se concentra.

> Observação importante: VWAP pondera pelo volume; a volatilidade e o "preço médio simples" tratam cada negócio com peso igual. São medidas diferentes de propósito.

---

## 8. Aba COMPARADOR — séries por produto no tempo

Compara até 8 séries (produtos ou grupos) num **período próprio**, independente da aba Análise. As métricas por bucket de tempo:

| Métrica | Definição |
|---|---|
| Volume total (MWm) | soma de Q.N |
| MWm / dia útil | volume ÷ dias úteis do bucket |
| Nº de negócios | contagem |
| Ticket médio | volume ÷ nº de negócios |
| Preço médio ponderado | Σ(preço·volume) ÷ Σ(volume) |
| Frequência | dias c/ negócio ÷ dias úteis |

A granularidade do eixo X pode ser **dia**, **semana** (segunda a domingo) ou **mês**, para análise do micro ao macro. O comparador aplica os mesmos filtros da Análise, **exceto submercado** (para poder comparar SE×SU entre si).

---

## 9. Aba DADOS BBCE — como a carga ao vivo é montada

O backend local (pasta `backend/`) autentica na API da BBCE e monta o mesmo CSV que a ferramenta lê:

1. **Login** (`/v2/login`) com apiKey + e-mail + senha + companyExternalCode → recebe o token (renovado automaticamente).
2. **Lista de tickers** (`/v1/negotiable-tickers?walletId=`) → todos os produtos negociáveis da carteira.
3. **Negociações por ticker** (`/v1/negotiation-data/{tickerId}`) → preços/volumes.
4. **Montagem do PRODUTO:** o nome é reconstruído no formato da ferramenta (`FEN - …`) a partir do `stamp` (classe + produto) + `description` do ticker; as unidades vêm do próprio ticker.

As credenciais ficam **só no seu computador** (arquivo `.env`, ignorado pelo git); nunca vão para o navegador nem para o repositório.

---

## 10. Glossário rápido

- **Q.N / MWm** — volume do negócio em megawatt-médio.
- **VWAP** — Volume-Weighted Average Price (preço médio ponderado pelo volume).
- **Horizonte (M+N…)** — antecedência entre criação do negócio e início da entrega.
- **Dia útil** — dia sem sábado/domingo e sem feriado nacional.
- **Outlier intradiário** — negócio cujo preço desvia mais que o limite (±20%) da mediana do dia/produto.
- **Ticket médio** — volume por negócio.
- **Frequência** — proporção de dias úteis com pelo menos um negócio.

---

*Esta documentação acompanha o código em `liquidez_template.html` (fonte) → `liquidez.html` (gerado por `scripts/build.py`). Os valores de referência são conferidos por um recálculo independente em `scripts/test_liquidez.js`.*
