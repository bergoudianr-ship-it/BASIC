# BBCE Liquidity — Calculadora de Liquidez do Mercado Livre de Energia

Ferramenta web autocontida que reproduz, para qualquer período, a metodologia
de análise de liquidez de produtos da **BBCE** (FEN / Preço Fixo) a partir da
exportação "Todos os Negócios". Roda inteiramente no navegador (HTML + JS puro,
sem servidor, sem dependências externas).

Artefato publicado (privado por padrão):
https://claude.ai/code/artifact/ce8d740c-1284-4b96-8501-429c64d153d5

## O que a ferramenta faz

- **Classificação por horizonte a partir da DATA/HORA (criação) de cada negócio:**
  `M+0` = mês vigente (entrega no próprio mês da criação), `M+1` = mês seguinte,
  e assim por diante — o enquadramento desliza conforme os meses passam.
  - `MEN → M+N` (meses) · `ANU → A+N` (anos) · `TRI → T+N` (trimestres) ·
    `SEM → S+N` (semestres) · `BIM → B+N` (bimestres). Demais famílias (OTR, SFR)
    são classificadas em meses de antecedência até o início da entrega.
- **Filtro de outliers intradiário:** para cada produto/dia calcula-se a mediana
  do preço; negócios com desvio acima de ±20% (ajustável) são excluídos.
- **Dias úteis pelo calendário nacional** (feriados fixos + Páscoa/Carnaval/
  Corpus Christi calculados algoritmicamente, então funciona para qualquer ano).
- **Status `Cancelado` sempre excluído** da análise, independentemente dos filtros.
- **Métricas por horizonte:** volume (MWm), share, volume/dia útil, negócios/dia
  útil, volume/dia negociado, ticket médio, frequência (% dias úteis), preço
  mediano e preço médio ponderado.
- **Filtros:** período de criação, família de produto, submercado, classificação,
  tipo de preço, status e limiar de exclusão intradiária.
- **Aba Comparador:** compara até 8 produtos, montados de duas formas:
  1. **Por atributos** — submercado · prazo (família) · entrega/horizonte
     (horizonte relativo `M+N` ou entrega específica, ex.: `AGO/26`, `JAN/27–DEZ/27`).
  2. **Por produto** — busca com autocomplete pela nomenclatura BBCE
     (ex.: `SE CON MEN AGO/26`, `SU CON ANU JAN/27 DEZ/27`).
  Visualização em evolução mensal (linhas com crosshair) ou total no período
  (barras), em qualquer métrica, com tabela comparativa.
- **Exportação** das tabelas em CSV e impressão/PDF.

O Comparador abrange **todos os submercados** presentes na base (após os demais
filtros); o filtro de Submercado afeta apenas a aba Análise.

## Estrutura

```
bbce liquidity/
├── liquidez.html              # Ferramenta standalone (com a base embutida). Abra no navegador.
├── liquidez_template.html     # Template da ferramenta, com placeholder para a base.
├── data/
│   ├── Todos_Negocios.csv     # Base "Todos os Negócios" da BBCE (base padrão embutida).
│   └── produtos_MEN_ANU.csv   # Base original (MEN/ANU) usada no primeiro relatório.
├── scripts/
│   ├── build.py               # Gera liquidez.html a partir do template + base (gzip+base64).
│   └── test_liquidez.js       # Smoke test (Playwright): confere totais e comparador.
└── docs/
    └── METODOLOGIA.md         # Detalhamento da metodologia de liquidez.
```

## Como usar

Basta abrir `liquidez.html` no navegador — a base "Todos os Negócios" já vem
embutida e a análise aparece calculada. Para analisar outra base, use o botão de
anexar/colar CSV dentro da própria ferramenta (mesmo layout de colunas:
`PRODUTO;DATA/HORA;Q.N;U.N.;Q.M;U.M.;PREÇO;TIPO DE CONTRATO;TENDÊNCIA;STATUS`).

## Como regenerar o HTML com uma base nova (build)

Ao editar `liquidez_template.html` ou trocar a base padrão embutida:

```bash
cd "bbce liquidity"
python3 scripts/build.py                 # embute data/Todos_Negocios.csv
python3 scripts/build.py caminho/base.csv # embute outra base
```

Isso reescreve `liquidez.html`. A base é comprimida (gzip) e codificada em base64;
no navegador ela é descomprimida com `DecompressionStream('gzip')` no carregamento.

## Testes

```bash
cd "bbce liquidity"
node scripts/test_liquidez.js
```

Confere os totais de volume por família (valores de referência para
SE + CON + Preço Fixo no período 01/01–15/07/2026) e que o comparador carrega.

## Notas técnicas

- 100% client-side: nenhum dado sai do navegador. Seguro para bases sensíveis.
- Números em formato BR (vírgula decimal, ponto de milhar) são tratados na leitura.
- Codificação do CSV é auto-detectada (UTF-8 / Windows-1252) e ajustável.
- Tema claro/escuro; layout responsivo (desktop e mobile).
