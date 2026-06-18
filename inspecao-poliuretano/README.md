# Inspeção PU — medida por foto + referência de escala (peças ≤200 mm)

Ferramenta web (1 arquivo, **funciona offline no celular**) para controle de qualidade
dimensional de peças de poliuretano **até ~200 mm**. Você cadastra uma **referência de
escala** (moeda, tampa redonda…), cadastra o **padrão** medindo uma peça correta **pela
foto**, e depois **inspeciona** a peça nova comparando lado a lado.

Abra `index.html` no navegador do celular. Tudo roda no aparelho; nada vai para a internet.

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

### 2b. Biblioteca de rolamentos (atalho)
Na aba "Padrões", a **Biblioteca de rolamentos** cria um padrão na hora a partir das
medidas de catálogo (séries 6000/6200/6300 — ISO 15): escolha a designação (ex.: 6205),
defina a tolerância e pronto — já dá para inspecionar usando o diâmetro externo (D) e o
furo (d), sem precisar fotografar uma peça boa.

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

## Versão de máxima precisão (engenharia)
O método mais preciso (sub-milímetro) usa **marcador ArUco impresso + OpenCV com correção
de perspectiva** — porém roda em **Python num PC/servidor**, não no celular. Está iniciado
em `../inspecao-ia/` e é o caminho de evolução quando houver um computador disponível.
