# Metodologia de análise de liquidez

Reproduz a metodologia da planilha de liquidez da BBCE (FEN / Preço Fixo),
generalizada para todas as famílias de produto.

| Critério | Aplicação |
|---|---|
| **Base de dados** | Exportação "Todos os Negócios" da BBCE (`data/Todos_Negocios.csv`). Cada linha é um negócio, com `PRODUTO`, `DATA/HORA`, `Q.N` (MWm), `PREÇO` e `STATUS`. |
| **Período de criação** | Coluna `DATA/HORA`. O período é ajustável na ferramenta (padrão = toda a base). |
| **Produtos** | `FEN` — parse do nome `FEN - {SUBMERCADO} {CLASSIFICAÇÃO} {FAMÍLIA} {ENTREGA} - {TIPO DE PREÇO}`. Padrão de análise: submercado `SE`, classificação `CON`, `Preço Fixo`. |
| **Status** | Registros com `STATUS = Cancelado` são **sempre** excluídos, independentemente dos filtros. |
| **Classificação por horizonte** | Diferença entre a criação (`DATA/HORA`) e o início da entrega, na unidade da família. `M+0` = mês vigente (entrega no mês da criação). MEN→meses, ANU→anos, TRI→trimestres, SEM→semestres, BIM→bimestres. Como cada negócio usa sua própria data de criação, o enquadramento desliza conforme os meses passam. |
| **Tratamento de distorções (intradiário)** | Para cada produto específico e cada dia, calcula-se a **mediana do preço** do dia; negócios cujo preço desvia mais de **±20%** (limiar ajustável) dessa mediana são excluídos. |
| **Volume** | Soma de `Q.N` (MWm) por horizonte. |
| **Giro diário** | Volume ÷ dias úteis do período. Também: volume ÷ dias efetivamente negociados. |
| **Frequência** | Nº de dias úteis com pelo menos um negócio ÷ dias úteis do período. |
| **Profundidade** | Ticket médio = volume ÷ nº de negócios. |
| **Dias úteis** | Pregões no período pelo calendário nacional. Feriados fixos + móveis (Páscoa, Carnaval, Sexta-feira Santa, Corpus Christi) calculados algoritmicamente (algoritmo de Gauss/Meeus), válido para qualquer ano. Quarta-feira de Cinzas é dia útil. |
| **Preços** | Preço mediano e preço médio ponderado pelo volume `Q.N` (MWm), pós-filtro. |

## Validação

Para SE + CON + Preço Fixo, os totais por família reproduzem o relatório de
referência. Exemplo (base `Todos_Negocios.csv`, 01/01–15/07/2026, 133 dias úteis):

| Família | Volume (MWm) | Nº negócios |
|---|---|---|
| MEN (M+N) | 36.551,068 | 16.869 |
| ANU (A+N) | 4.448,366 | 1.081 |
| TRI (T+N) | 5.056,977 | 2.134 |
| SEM (S+N) | 2.581,138 | 1.122 |

> A base original (MEN/ANU) usada no primeiro relatório está em
> `data/produtos_MEN_ANU.csv`; naquela base, os horizontes M+N e A+N para
> SE + CON + Preço Fixo batem com a planilha de referência (10/12 horizontes M+N
> idênticos e 10/10 A+N idênticos; a única diferença é um negócio de fronteira
> no filtro de ±20%, de impacto desprezível).
