# Manual de Uso — Inspeção PU (v7)

Ferramenta de **controle de qualidade dimensional** de peças e **rolamentos revestidos de
poliuretano** (até ~200 mm), usando **só a câmera do celular**, **offline** e **sem papel**.

- App (celular): `inspecao-poliuretano/index.html`
- Catálogo de rolamentos: também salvo no Supabase (tabela `public.rolamentos`)
- Opcional (PC/servidor, máxima precisão): `inspecao-ia/` (ArUco + OpenCV em Python)

> Link de teste (versão atual): troca a cada versão (fica preso ao commit). Para um
> endereço fixo, dá para publicar no GitHub Pages.

---

## 1. O que a ferramenta faz

Você fotografa a peça com uma **referência de escala** (o **furo do rolamento**, uma moeda
ou uma tampa) e o app converte **pixels em milímetros**. Com isso mede diâmetros, compara
com um **padrão** e responde **APROVADA / REPROVADA**, com o desvio de cada medida e um
diagnóstico da causa. Tudo roda no navegador do celular; os dados ficam salvos no aparelho.

### As 4 abas
- **Referências** — objetos de escala conhecidos (moeda, tampa…).
- **Padrões** — a peça correta. Pode vir do **catálogo de rolamentos** (recomendado) ou ser
  medida por foto.
- **Inspecionar** — conferir a peça nova contra o padrão.
- **Histórico** — ver e exportar (CSV) as inspeções, para acompanhamento no PC.

---

## 2. Fluxo recomendado (rolamento revestido de PU)

É o caminho mais rápido — quase "uma foto → veredito".

### Passo 1 — Criar o padrão (aba Padrões → Biblioteca de rolamentos)
1. Escolha o rolamento-base (ex.: **6205**).
2. Digite a **espessura do revestimento PU por lado** (mm). Use **0** para rolamento sem capa.
3. Defina a **tolerância** do Ø externo (ex.: ± 0,5 mm).
4. O app mostra o **Ø externo revestido esperado** = D + 2× espessura
   (ex.: 6205 → D 52 + PU 3 mm = **58 mm**) e usa o **furo (25 mm)** como escala.
5. **Criar padrão deste rolamento**.

### Passo 2 — Inspecionar (aba Inspecionar)
1. Escolha o padrão e (opcional) a identificação peça/lote → **Iniciar inspeção**.
   (Já vem em *Calibrar por: Furo do rolamento* — não precisa de moeda.)
2. Fotografe a peça **de cima, reta**, com **fundo contrastante** e boa luz.
3. Toque **🔎 Auto**: o app detecta os dois círculos, usa o **furo para a escala
   automaticamente** e mede o **Ø externo revestido**.
4. Resultado: **APROVADA / REPROVADA**, desvio, comparação lado a lado, **estimativa da
   espessura da capa** = (Ø externo medido − D base) / 2.
5. **🖨️ Relatório (PDF)** para enviar e **💾 Salvar** no histórico.

> Se a foto não permitir o Auto, use as ferramentas manuais **⭕ Diâmetro** (3 pontos) e
> **✏️ Distância** (2 pontos), com a **lupa** para acertar a borda.

---

## 3. Outras formas de escala (sem ser o furo)
Na tela de medição, em **Calibrar a escala por**:
- **Furo do rolamento** — marca 3 pontos na borda do furo; o Ø do furo já vem do padrão.
- **Objeto de referência** — fotografe com a moeda/tampa no quadro e marque-a (3 pontos se
  redonda, 2 se reta). As moedas comuns já vêm cadastradas em Referências.

---

## 4. Criar padrão medindo uma peça boa (alternativa ao catálogo)
1. Aba Padrões → **Cadastrar padrão por foto**.
2. Calibre a escala (referência ou furo) e meça cada dimensão com ⭕/✏️.
3. Dê nome/tipo a cada medida, defina a tolerância e salve.

---

## 5. Histórico e relatório para o PC
Aba **Histórico** lista as inspeções salvas. **Relatório p/ PC (CSV)** baixa uma planilha
(Excel/Sheets) com todas as medidas e vereditos — para o PCP/Qualidade.

---

## 6. Roteiro de testes (faça nesta ordem)
- **Teste 0 — Escala (5 min):** fotografe duas moedas (R$1=27 e R$0,50=23), calibre pela
  R$1 e meça a R$0,50. Esperado ~23 mm (erro < ~0,5 mm).
- **Teste 1 — Pelo furo:** crie o 6205 com PU (ex. 3 mm). Inspecione, calibre pelo furo e
  meça o Ø externo. Esperado próximo de 58 mm.
- **Teste 2 — Auto:** foto com fundo contrastante; toque 🔎 Auto. Esperado: acha os dois
  círculos e preenche as medidas.
- **Teste 3 — Reprovação:** reduza a tolerância (ex. 0,1 mm) ou meça uma peça fora.
  Esperado: REPROVADA + diagnóstico.
- **Teste 4 — Relatório:** salve 3 inspeções e exporte o CSV no PC.

**Checklist de aceitação:** [ ] erro do Teste 0 < ~0,5 mm · [ ] calibração pelo furo ok ·
[ ] Auto acha os círculos · [ ] reprovação correta · [ ] CSV no PC.

---

## 7. Boas práticas de foto (o que mais afeta a precisão)
- Câmera **perpendicular** (de cima, sem inclinar).
- **Fundo contrastante** e **luz uniforme** (essencial para o Auto).
- Referência **no mesmo plano** da medida.
- Use a **lupa** ao marcar manual; mantenha o **mesmo enquadramento** entre peças.

---

## 8. Limitações (honestas)
- Medição por **foto 2D**; a precisão depende do cuidado na foto. Não substitui
  paquímetro/micrômetro em cotas críticas apertadas.
- **Largura (B)** não sai de uma foto de cima (precisa de vista lateral).
- O **🔎 Auto** depende de contraste/luz; foto ruim erra ou não acha (use o manual).
- Calibrar **pelo furo** pressupõe o furo dentro do nominal.
- O **Ø externo revestido** não é normalizado — é específico da sua aplicação; por isso é
  você quem define a espessura nominal do PU.
- Dados ficam no **navegador do aparelho** — exporte o histórico periodicamente.

---

## 9. Versão de máxima precisão (opcional, `inspecao-ia/`)
ArUco + OpenCV em Python (sub-milímetro, com correção de perspectiva) e protótipo de IA
para defeitos visuais. Exige **PC/servidor** — fora do "tudo no celular".
