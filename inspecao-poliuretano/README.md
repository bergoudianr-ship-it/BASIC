# Inspeção PU — medida por foto + referência de escala (peças ≤200 mm)

Ferramenta web (1 arquivo, **funciona offline no celular**) para controle de qualidade
dimensional de peças de poliuretano **até ~200 mm**. Você cadastra uma **referência de
escala** (moeda, tampa redonda…), cadastra o **padrão** medindo uma peça correta **pela
foto**, e depois **inspeciona** a peça nova comparando lado a lado.

Abra `index.html` no navegador do celular. Tudo roda no aparelho; nada vai para a internet.

## Documentos do projeto
- **[RESUMO_EXECUTIVO.md](RESUMO_EXECUTIVO.md)** — visão de negócio em 1 página (para apresentar).
- **[DOCUMENTACAO.md](DOCUMENTACAO.md)** — manual de uso (v7).
- **[ARQUITETURA.md](ARQUITETURA.md)** — arquitetura técnica, decisões, roadmap, riscos.
- **[CONFERENCIA.md](CONFERENCIA.md)** — autoavaliação honesta e plano de validação.
- **[CHANGELOG.md](CHANGELOG.md)** — histórico de versões.
- PDFs correspondentes (`Inspecao_PU_*.pdf`) para envio/impressão.

## Fluxo

### 1. Referências (aba "Referências")
Cadastre objetos de tamanho conhecido que aparecerão na foto para dar escala:
- **Redondo (diâmetro)** — ex.: moeda R$1 = 27 mm, tampa redonda 80 mm.
- **Reto (comprimento)** — ex.: cartão = 85,6 mm, uma régua.
Já vêm cadastradas as moedas comuns; adicione suas tampas/objetos.

### 2. Padrão (aba "Padrões" → "Cadastrar padrão por foto")
1. Selecione a **referência de escala**.
2. Fotografe a **peça correta** com a referência **no mesmo plano** da peça.
3. **📏 Calibrar**: se a referência é redonda, marque **3 pontos na borda** (ajuste de
   círculo, mais preciso); se é reta, marque **2 pontos**. A escala (px↔mm) é calculada.
4. Meça cada dimensão: **⭕ Diâmetro** (3 pontos na borda) ou **✏️ Distância** (2 pontos),
   dê nome e tipo. A **lupa** ajuda a acertar a borda.
5. Defina a **tolerância** (± % ou mm) e salve.

### 2b. Biblioteca de rolamentos revestidos de PU (atalho — recomendado)
Na aba "Padrões", a **Biblioteca de rolamentos** cria o padrão na hora: escolha a
designação (ex.: 6205), digite a **espessura do revestimento PU por lado** e a tolerância.
O app calcula o **Ø externo revestido esperado** = D + 2× espessura, usando o **furo (d)**
como escala. (Com espessura 0, vale para o rolamento sem capa.)

Fluxo recomendado na inspeção (quase "uma foto → veredito"):
1. Escolha o padrão e **Iniciar inspeção** (já vem em *Calibrar por: Furo do rolamento*).
2. Fotografe a peça de cima (bom contraste/luz).
3. Toque **🔎 Auto**: ele detecta os dois círculos, usa o **furo para a escala
   automaticamente** e mede o **Ø externo revestido**, ainda **estimando a espessura da
   capa** ((Ø externo medido − D base) / 2). Veredito **APROVADA/REPROVADA** na hora.
4. Se a foto não permitir o Auto, use ⭕/✏️ manuais.

### 3. Inspecionar (aba "Inspecionar")
1. Escolha o **padrão** e (opcional) a identificação da peça/lote.
2. Fotografe a peça nova com a referência no quadro, calibre.
3. Meça, na ordem indicada, as mesmas dimensões. Cada uma compara com o padrão e mostra
   **OK / FORA** + desvio.
4. Resultado **APROVADA / REPROVADA**, **comparação lado a lado** (correta × inspecionada),
   **relatório em PDF** (imprimir/salvar) e **salvar no histórico**.

## Precisão
- Para peças ≤200 mm, com foto **reta (perpendicular)** e a **referência no mesmo plano**,
  a precisão típica fica em torno de **~1%**.
- Use referência **grande** em relação à peça e bem focada; o ajuste de círculo por 3
  pontos reduz erro em peças/moedas redondas.
- Erros aumentam com foto inclinada, lente grande-angular muito próxima, ou referência
  num plano diferente da medida.

## 100% no celular, sem papel
- **Referência de escala** = um objeto que você já tem (moeda, tampa redonda). Nada de
  imprimir nada.
- **Calibrar pelo furo do rolamento**: em "Calibrar a escala por", escolha *Furo do
  rolamento*. Como o Ø interno (d) é conhecido (catálogo) e o furo de aço costuma ser a
  referência precisa, você marca 3 pontos na borda do furo e a escala sai dele — **sem
  precisar de moeda nenhuma**. (Pressupõe o furo dentro do nominal; o revestimento PU fica
  no diâmetro externo.)
- **Detecção automática (🔎 Auto)**: o OpenCV roda **dentro do navegador** do celular.
  Calibre a escala uma vez na moeda e toque em **🔎 Auto (rolamento)** — a ferramenta acha
  sozinha o **Ø externo** e o **furo** do rolamento e mede. (Na 1ª vez precisa de internet
  para baixar o motor; depois fica em cache. Se não carregar, as ferramentas manuais
  ⭕/✏️ funcionam offline.)
- **Relatório para o PC**: na aba Histórico, **"Relatório p/ PC (CSV)"** baixa uma planilha
  (abre no Excel/Sheets) com todas as inspeções para acompanhamento no PCP/Qualidade.

## Alternativa opcional de máxima precisão (não obrigatória)
Para sub-milímetro existe o caminho **ArUco + OpenCV em Python** (`../inspecao-ia/`), mas
ele exige **imprimir um marcador** e **rodar num PC/servidor** — fora do "tudo no celular".
Fica como opção para quando houver um computador dedicado.
