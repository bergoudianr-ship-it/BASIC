# Resumo Executivo — Inspeção PU

**Controle de qualidade dimensional de peças e rolamentos revestidos de poliuretano, usando
só a câmera do celular — offline, sem papel e sem instrumento caro.**

---

## O problema
Conferir se peças revestidas de PU (até ~200 mm) saíram **na medida** hoje depende de
paquímetro peça a peça ou de metrologia de bancada — **lento, manual e sem registro digital**.
Em produção, isso vira gargalo e gera retrabalho/refugo que só aparece tarde.

## A solução
Um aplicativo que **fotografa a peça e devolve APROVADA/REPROVADA na hora**, com o desvio de
cada medida e um laudo em PDF. Converte pixels em milímetros usando uma referência de escala
conhecida — para rolamento revestido, o próprio **furo de aço** serve de régua e o app mede o
**diâmetro externo revestido** (e estima a espessura da capa). Roda no navegador do celular,
**offline**, sem instalar nada.

## Proposta de valor
- **Rápido:** quase "uma foto → veredito"; triagem em segundos.
- **Barato:** zero hardware/licença — qualquer celular. Sem custo de TI.
- **Rastreável:** histórico das inspeções + relatório PDF e exportação CSV para o PCP.
- **Acessível:** operador usa sem treinamento de metrologia.

## Diferenciais
- Catálogo embutido de **106 rolamentos** (ISO 15/DIN 625) — cria o padrão na hora.
- **Calibração pelo furo** (sem moeda/gabarito) + **detecção automática** dos círculos.
- Funciona **100% offline**; opção futura de trilha de **alta precisão** (ArUco/visão em PC).

## Posicionamento (comparativo)
| Critério | Paquímetro manual | Metrologia de bancada | Visão industrial dedicada | **Inspeção PU** |
|---|---|---|---|---|
| Custo inicial | Baixo | Alto | Muito alto | **~Zero** |
| Velocidade | Lenta | Média | Alta | **Alta** |
| Registro digital | Não | Sim | Sim | **Sim (PDF/CSV)** |
| Treinamento | Médio | Alto | Alto | **Baixo** |
| Precisão | Alta | Muito alta | Muito alta | **Boa (a validar)** |

## Status atual
**MVP funcional** (v7): app no celular, catálogo no Supabase, relatórios. Lógica e dados
conferidos. **Falta a validação metrológica com peças reais** — recomenda-se usar como
**triagem/produtividade** até comprovar a acurácia (estudo objetivo já planejado).

## Próximos passos
1. **Estudo de acurácia/repetibilidade** com peças reais (app vs paquímetro).
2. Espessura do revestimento como **critério próprio** de aprovação.
3. App lendo o catálogo **direto do Supabase** (multiusuário) + dashboard de qualidade.
4. **Estação de foto** simples (apoio + luz) para repetibilidade; identidade visual/branding.

## Investimento
- Operação atual: **custo praticamente nulo** (app estático + Supabase no plano gratuito).
- Evoluções (multiusuário, estação de foto, trilha de alta precisão) sob demanda, de baixo
  custo e incrementais.

> **Em uma frase:** transforma qualquer celular num conferidor dimensional de peças de PU —
> imediato, documentado e de custo quase zero — pronto para validar em produção.
