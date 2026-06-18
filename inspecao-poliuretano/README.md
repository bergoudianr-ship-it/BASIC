# Inspeção PU — Rolamentos revestidos (medidas digitadas + inspeção visual)

Ferramenta web (1 arquivo, **funciona offline no celular**) para **controle de qualidade
de rolamentos revestidos de poliuretano** (até ~700 mm). Você cadastra o **padrão**
digitando as medidas, e na inspeção **digita as medidas reais** (paquímetro/instrumento)
+ faz um **checklist visual** com **fotos dos defeitos**. Nada é marcado/medido sobre a
foto — a câmera serve para documentar.

Abra `index.html` no navegador do celular. Tudo roda no aparelho; nada vai para a internet.

## Por que as medidas são digitadas (e não medidas pela foto)
Em peças grandes (700 mm cabendo na tela), cada pixel da foto vale **vários milímetros**,
então medir pela imagem não tem precisão de QC. A medida confiável vem do **seu
instrumento** (paquímetro, trena, micrômetro) e é **digitada**. A câmera é usada para
**documentar e comparar** a peça e registrar defeitos visíveis.

## Padrões (aba "Padrões")
Crie um padrão digitando:
- **Nome da peça** e, opcionalmente, uma **foto de referência** da peça correta.
- **Medidas**: para cada uma, `Nome`, `Tipo` (diâmetro, largura, altura, profundidade,
  **espessura do revestimento**, outro), **Nominal (mm)** e **Variação ± (mm)**.
  A ferramenta calcula os limites mín/máx automaticamente.
- **Itens de inspeção visual** (trinca, falha no revestimento, descolamento, desgaste,
  oxidação, ovalização, etc.) — há sugestões prontas e você pode adicionar os seus.

## Inspecionar (aba "Inspecionar")
1. Escolha o **padrão** e (opcional) a **identificação da peça/lote**.
2. **Fotos da peça**: passe a câmera e capture os pontos importantes (documentação).
3. **Medidas**: digite o valor de cada dimensão em mm — a ferramenta mostra na hora
   **OK / FORA**, o desvio e a **causa provável** se estiver fora.
4. **Inspeção visual**: marque **OK / Problema** em cada item; se houver problema, escreva
   uma observação e **anexe a foto do defeito**.
5. **Comparação (referência × peça atual)**: coloque a foto da peça nova/correta e a da
   peça usada lado a lado e use o **controle deslizante (antes/depois)** para enxergar o
   desgaste e localizar os problemas.
6. **Finalizar** → veredito **APROVADA / REPROVADA** com o diagnóstico do que saiu fora.
7. **Relatório (PDF)**: gera um relatório com veredito, **quais medidas estão fora**
   (destacadas) + diagnóstico, achados visuais com fotos e as fotos comparativas. Use o
   "Salvar em PDF" da impressão do próprio celular — pronto para anexar no PCP/Qualidade.
8. **Salvar no histórico** para guardar o registro da peça (com a comparação e as fotos);
   o relatório pode ser reimpresso depois pela aba Histórico.

## Inspeção em lote (50 peças)
Preencha o campo **Lote / NF** e um **nº de peça**. Ao finalizar cada peça, use
**"💾 Salvar e próxima peça ▶"**: ela é salva no histórico e o nº avança automaticamente,
mantendo o padrão carregado. O card do topo mostra a **contagem do lote** (aprovadas /
reprovadas) e o botão **"Relatório do lote (PDF)"** gera um laudo consolidado com todas as
peças, destacando as reprovadas e o que ficou fora.

> Observação: as medidas continuam **digitadas** (do seu instrumento). Para validação
> automática por foto em volume, veja o protótipo de IA em `../inspecao-ia/`.

## Histórico (aba "Histórico")
Lista das inspeções salvas (peça, padrão, data, veredito). Abra para ver o relatório
completo com medidas, itens visuais e fotos. Exporte/importe `.json` para backup ou para
passar a outro celular.

## Limitações
- As medidas dependem da precisão do **seu instrumento** (a ferramenta só compara/registra).
- A inspeção visual depende da qualidade das fotos e do olho do inspetor — a ferramenta
  organiza e documenta, não detecta defeitos automaticamente.
- Dados e fotos ficam no **armazenamento do navegador** deste aparelho (pode encher com
  muitas fotos — exporte e limpe periodicamente).

## Ideias para próximas versões
- Relatório em **PDF** por peça (para enviar ao cliente).
- Campos de **variação assimétrica** (+x / -y) por medida.
- Comparação **lado a lado** da foto da peça com a foto de referência.
