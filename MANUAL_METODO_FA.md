# Manual Pratico - Metodo de Alavancagem (FA) (Versao Planilha Semanal)

Este manual descreve o metodo implementado no app Python para avaliar se a empresa esta alavancada, usando:

- `Manual Monitoramento Prudencial v2` (logica de FA, FA risco, RWA e PLA)
- `Arquivo de apoio para simulacao (declaracao semanal).xlsx`

## 1) Objetivo de negocio

Responder de forma objetiva:

- A empresa esta `Saudavel`, `Atencao`, `Alavancada` ou `Critica`?
- Qual fator esta pressionando: risco de mercado, resultado financeiro, PLA ou concentracao em contraparte?

## 2) Formulas nucleares (base manual prudencial)

- `PLA = PL - Deducoes`
- `FA_Risco = RWA / PLA`
- `FA = max(0, (RWA - RES_FIN) / PLA)`
- `RWA = RWA_Mercado + RWA_Credito + RWA_Operacional`
- `RES_FIN = PnL + FIN_PV + Receita_ACR`

No motor:

- `VaR_mensal = |MtM| * phi * sigma * sqrt(D)`
- `VaR_total` agregado pela matriz de correlacao entre vertices M+0...M+6
- `Stress_mensal = |exposicao| * horas * |preco_forward - preco_stress|`
- `RWA_Mercado = max(K*VaR_total, VaR_total) + theta * max(K*Risco_Adicional, Risco_Adicional)`

## 3) Metodo de classificacao de alavancagem

Parecer final no app:

- `Critica`: `PLA <= 0`
- `Alavancada`: `FA > M` (referencia regulatoria configurada no parametro `faReference`) ou concentracao muito alta
- `Atencao`: `FA > 75% de M` ou sinais de risco relevantes
- `Saudavel`: sem gatilhos criticos no estado atual

Gatilhos usados no texto explicativo:

- `FA` acima da referencia `M`
- `FA_risco` alto para o capital
- concentracao de contraparte (`Maior EAD / PLA`)
- `RES_FIN` negativo (agrava alavancagem)

## 4) Integracao com a planilha semanal

Botao no app: `Importar da planilha`.

Campos lidos automaticamente:

1. `Premissas`
- Confianca
- Dias para liquidacao
- Volatilidades M0..M6
- Precos de stress long/short M0..M6
- PLD min/max

2. `Curva Forward`
- Curva `SECO/CONV` M0..M6 para marcar exposicao

3. `Consolidado`
- Horas por mes M0..M6

4. `Declaracao Portfolio`
- `NET ENERGETICO` (vira exposicao)
- `RECURSO`, `PRECO MEDIO RECURSO`
- `REQUISITO`, `PRECO MEDIO REQUISITO`
- `PLA` declarado na planilha (quando preenchido)

5. `Patrimonio Liquido Ajustado`
- Valor de PLA ajustado da planilha (quando preenchido)

6. `Declaracao Contrapartes`
- Top 5 exposicoes por contraparte

## 5) Campos e parametros (aderentes ao modelo semanal)

Nesta versao, o app evita campos de DRE completo e privilegia somente dados coerentes com o processo de monitoramento prudencial:

- `PLA ajustado`
- dados de portifolio prudencial (`NET`, `Recurso`, `Requisito`, `Preco medio`, `Forward`, `Volatilidade`, `Stress`)
- premissas prudenciais (`M`, confianca, phi, dias para liquidacao, correlacao, theta, PLD min/max)
- curva forward por fonte/submercado (ACL), com atualizacao semanal

A importacao da planilha altera apenas os dados de calculo prudencial.

## 6) Leitura gerencial para decisao

Sequencia recomendada para comite de risco:

1. Ver `FA` e `FA_Risco`.
2. Confirmar `PLA` (qualidade e atualizacao do balanço).
3. Checar contribuicao de `VaR` e `Stress` no `RWA_Mercado`.
4. Verificar `RES_FIN`: se negativo, reduz capacidade de absorver risco.
5. Avaliar concentracao (`Maior EAD / PLA`) e perda esperada.

## 7) Como interpretar rapidamente

- `FA baixo` + `PLA positivo` + `RES_FIN neutro/positivo` + `concentracao baixa` -> estrutura confortavel.
- `FA subindo` com `VaR/Stress` alto -> revisar exposicao direcional, hedge e limites.
- `FA baixo` mas `PLA fraco` -> risco de degradacao rapida em choque adverso.
- `Concentracao alta` mesmo com `FA controlado` -> risco de evento de contraparte.

## 8) Resumo detalhado automatico

Toda analise agora traz, obrigatoriamente:

- `Resumo de risco por mes (detalhado)`: risco agregado do mes e principais fontes/submercados que explicam o risco.
- `Resumo de risco por fonte (horizonte total)`: ranking consolidado de contribuicao de risco por fonte/submercado.

Nesta versao, o painel de contrapartes foi removido para concentrar a analise no risco de mercado e na curva forward semanal do ACL.

Isso permite atuar com foco tatico no portifolio de energia.

## 9) Observacoes importantes

- O resultado depende da qualidade da declaracao da planilha.
- Mitigadores de contraparte podem ser refinados no app para calibrar EAD.
- Parametros (`M`, `theta`, `K`, correlacao) podem ser ajustados para analise de sensibilidade.
