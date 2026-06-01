# Manual Pratico - Calculadora FA (Padrao Planilha Semanal CCEE)

Este manual descreve a versao Python em `app_python.py`, alinhada ao modelo semanal da CCEE:

- Portfolio - Preco Fixo, Consumo e Geracao
- Portfolio - Preco Variavel
- Portfolio - Derivativos
- Curva Forward por fonte/submercado
- Efeitos Financeiros do Mercado Regulado

Sem modulo de 5 contrapartes.

## 1) Objetivo

Avaliar alavancagem prudencial da empresa com foco em risco de mercado de energia:

- `FA` (fator divulgado)
- `FA_Risco`
- Parecer: `Saudavel`, `Atencao`, `Alavancada` ou `Critica`
- Detalhamento de risco por mes e por fonte

## 2) Formulas base

- `FA_Risco = RWA / PLA`
- `FA = max(0, (RWA - RES_FIN) / PLA)`
- `RWA = VaR_total + theta * Stress_total`
- `RES_FIN = soma(resultado contratos) + soma(receita regulada)`

No motor:

- `MtM_fonte = Exposicao_fonte * Forward_fonte * Horas`
- `VaR_fonte = |MtM_fonte| * phi * sigma * sqrt(D)`
- `Stress_fonte = |Exposicao_fonte| * Horas * |Forward_fonte - PrecoStress|`

## 3) Estrutura de entrada (igual ao template)

A tela contem os mesmos blocos logicos da declaracao:

1. `Portfolio - Preco Fixo, Consumo e Geracao`
2. `Portfolio - Preco Variavel`
3. `Portfolio - Derivativos`
4. `Efeitos Financeiros do Mercado Regulado`
5. `Curva Forward (ACL) por fonte/submercado`
6. `Premissas por vertice (M+0 ... M+6)`:
   - Horas
   - Volatilidade
   - Preco stress long/short

## 4) Importacao da planilha

Botao: `Importar da planilha`.

Leituras automaticas:

- `Premissas`: confianca, dias liquidacao, volatilidade, stress, PLD min/max, correlacao media.
- `Consolidado`: horas por vertice.
- `Curva Forward`: base `SECO/CONV` + spreads para formar forward por fonte/submercado.
- `Declaracao Portfolio`: blocos fixo/variavel/derivativos e receitas reguladas.
- `Patrimonio Liquido Ajustado`: PLA (quando preenchido).

Importacao altera apenas dados de calculo, preservando dados cadastrais da empresa.

## 5) Checks de consistencia do template

A calculadora valida automaticamente por mes:

- `netLine` vs `resource - requirement`
- `netLine` vs soma das fontes do bloco
- Para derivativos: `netLine` vs soma de `SE/CO + SUL + NORDESTE + NORTE`

Se houver divergencia, o parecer destaca no texto metodologico.

## 6) Curva Forward e impacto no FA

A curva forward entra diretamente em:

- Marcacao a mercado (MtM)
- VaR por fonte
- Stress por fonte

Como a curva muda semanalmente no ACL, o risco e o FA mudam mesmo com o mesmo volume em MWm.

## 7) Saidas para gestao de portfolio

Toda analise mostra:

- KPI: `FA`, `FA_Risco`, `RWA`, `Score/Rating`, `Parecer`
- `Resumo de risco por mes (detalhado)` com top fontes que explicam risco
- `Resumo de risco por fonte (horizonte total)` para concentracao
- Historico salvo por empresa em `/historico`

## 8) Logica de parecer

- `Critica`: `PLA <= 0`
- `Alavancada`: `FA > M` ou `FA_Risco` muito acima do limite
- `Atencao`: proximidade de limite, stress alto ou concentracao relevante
- `Saudavel`: sem gatilhos criticos nos parametros atuais

`M` e parametros prudenciais sao editaveis no painel de parametros.
