# Histórico de versões — Inspeção PU

Registro da evolução do produto (mais recente primeiro).

## v7 — Verificação de rolamento revestido de PU
- Biblioteca de rolamentos: informa a **espessura do revestimento PU** → calcula o
  **Ø externo revestido esperado** (D + 2× espessura) e mostra preview.
- Inspeção já inicia **calibrando pelo furo** (sem moeda) quando há furo conhecido.
- **🔎 Auto** autocalibra pela escala do furo e mede o Ø externo revestido sozinho.
- Resultado estima a **espessura do revestimento** = (Ø externo medido − D base) / 2.
- Documentação reescrita: Manual de Uso, Arquitetura, Conferência e Resumo Executivo
  (Markdown + PDF).

## v6 — Detecção automática e calibração pelo furo
- **OpenCV.js** no navegador: detecção automática dos círculos (externo/furo).
- Calibração da escala **pelo furo do rolamento** (além de objeto de referência).
- Catálogo de **106 rolamentos** salvo no **Supabase** (`public.rolamentos`).

## v5 e anteriores — Base do app
- App web de 1 arquivo, **offline no celular**, com 4 abas (Referências, Padrões,
  Inspecionar, Histórico).
- Medição por foto + referência de escala; ferramentas **Distância** e **Diâmetro** com
  lupa de precisão.
- Padrões (nominal ± tolerância), veredito **APROVADA/REPROVADA**, comparação lado a lado.
- **Relatório em PDF** (impressão) e **exportação CSV** para o PC.
- Biblioteca de rolamentos a partir do catálogo (criação de padrão na hora).
- Trilha opcional de alta precisão em Python (`inspecao-ia/`): medição **ArUco + OpenCV**
  e protótipo de **IA de defeitos visuais**.
