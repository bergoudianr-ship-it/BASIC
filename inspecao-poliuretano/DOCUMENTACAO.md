# 📘 Documentação — Inspeção PU (medida por foto, 100% no celular)

Ferramenta de **controle de qualidade dimensional** de peças/rolamentos revestidos de
poliuretano (até ~200 mm), usando **só a câmera do celular**, **offline** e **sem papel**.

- **App (celular):** `inspecao-poliuretano/index.html`
- **Opcional (PC/servidor, máxima precisão):** `inspecao-ia/` (ArUco + OpenCV em Python)

> **Link de teste (versão atual):**
> https://raw.githack.com/bergoudianr-ship-it/BASIC/c832e2c5565bf4810b4d7f363404d3842e7c3835/inspecao-poliuretano/index.html
> A cada nova versão o link muda (fica preso ao commit). Para um endereço fixo, dá para
> publicar no GitHub Pages (ver "Próximos passos").

---

## 1. Visão geral

A ideia: você fotografa a peça com **uma referência de escala** (uma moeda, uma tampa, ou
o **próprio furo do rolamento**) e a ferramenta converte **pixels → milímetros**. Com isso
ela mede o que importa (diâmetros, larguras), **compara com um padrão** que você cadastrou
e diz **APROVADA / REPROVADA**, com o desvio de cada medida e um diagnóstico da causa.

Tudo roda dentro do navegador do celular. Os dados (referências, padrões, histórico)
ficam **salvos no próprio aparelho** — nada é enviado para a internet.

### As 4 abas
| Aba | Para quê |
|-----|----------|
| **Referências** | Cadastrar objetos de escala conhecidos (moeda, tampa…). |
| **Padrões** | Definir a peça correta (medindo por foto **ou** pegando do catálogo de rolamentos). |
| **Inspecionar** | Conferir uma peça nova contra o padrão. |
| **Histórico** | Ver/Exportar (CSV) as inspeções salvas — relatório para o PC. |

---

## 2. Como pensei a ferramenta (raciocínio de design)

Vale entender o "porquê" para usar do jeito certo e confiar no resultado.

1. **Por que medir por foto, e não digitar tudo?** Para ganhar tempo na produção. Mas foto
   só vira milímetro se houver uma **referência de escala** no quadro — daí a biblioteca de
   referências.
2. **Por que o limite de ~200 mm importa?** Quanto maior a peça na foto, mais milímetros
   cada pixel "vale" e maior o erro. Em ~200 mm, com foto reta e boa referência, o erro
   fica baixo (~1%). Em 700 mm a foto não dá precisão de QC — por isso o foco em ≤200 mm.
3. **Por que ajuste de círculo por 3 pontos?** Peças e moedas redondas têm a borda como
   melhor informação. Pegar 3 pontos na borda e **ajustar o círculo** é mais preciso e
   estável do que tentar acertar o diâmetro com 2 toques.
4. **Por que "calibrar pelo furo do rolamento"?** No rolamento revestido, o **furo é de aço
   usinado** (preciso) e o **revestimento de PU está no diâmetro externo** (o que você quer
   conferir). Então o furo é uma referência de escala que **já está na peça** — dispensa a
   moeda.
5. **Por que tolerância "nominal ± variação"?** É a linguagem de fabricação: você define o
   alvo e quanto pode variar; a ferramenta marca fora quem passar disso.
6. **Por que detecção automática (OpenCV no navegador)?** Para "passar a câmera e validar"
   sem marcar ponto a ponto. Mas detecção depende de contraste/luz, então o **modo manual
   continua como rede de segurança**.
7. **Por que o ArUco/Python ficou como opcional?** É o caminho de **sub-milímetro**, porém
   exige **imprimir** um marcador e **rodar num PC**. Como o requisito é "tudo no celular,
   sem papel", ele virou alternativa de precisão, não o caminho principal.

---

## 3. Primeiro acesso

1. Abra o link no **Chrome (Android)** ou **Safari (iPhone)**.
2. Ao usar a câmera pela 1ª vez, **permita o acesso** quando o navegador pedir.
3. (Opcional) Menu do navegador → **"Adicionar à tela inicial"** para abrir como um app e
   usar offline depois.
4. A detecção automática (🔎) baixa um motor (OpenCV) **na 1ª vez com internet**; depois
   fica em cache. Sem internet, use as ferramentas manuais (⭕ / ✏️).

---

## 4. Passo a passo

### 4.1 Cadastrar referências de escala (aba **Referências**)
Já vêm cadastradas as moedas comuns (R$1 = 27 mm etc.) e o cartão. Para adicionar a sua:
1. **Nome** (ex.: "Tampa preta 80 mm").
2. **Formato**: *Redondo (diâmetro)* ou *Reto (comprimento)*.
3. **Tamanho real (mm)** — meça uma vez com paquímetro.
4. **Adicionar**.

> Dica: prefira uma referência **grande e bem visível**, no **mesmo plano** da peça.

### 4.2 Criar um padrão (aba **Padrões**)
Há **dois caminhos**:

**A) A partir do catálogo de rolamentos (mais rápido)**
1. Em "📚 Biblioteca de rolamentos", escolha a designação (ex.: **6205**).
2. Defina a **tolerância** (ex.: ± 1%).
3. **Criar padrão deste rolamento** → cria automaticamente as medidas **Ø externo (D)** e
   **Ø interno / furo (d)** com os valores de catálogo (ISO 15).

**B) Medindo uma peça correta por foto**
1. **➕ Cadastrar padrão por foto**.
2. Escolha **Calibrar a escala por** → *Objeto de referência* e selecione a referência.
3. **📷 Câmera** / **🖼️ Foto** da peça correta (com a referência no quadro).
4. **📏 Calibrar**: marque a referência (3 pontos se redonda; 2 se reta). A escala aparece.
5. **⭕ Diâmetro** (3 pontos) ou **✏️ Distância** (2 pontos) para cada medida → dê **nome**
   e **tipo**.
6. Defina a **tolerância** e o **nome do padrão** → **Salvar**.

### 4.3 Inspecionar uma peça (aba **Inspecionar**)
1. Escolha o **padrão** e (opcional) a **identificação peça/lote**.
2. **▶ Iniciar inspeção**.
3. **Calibrar a escala por** — escolha uma das opções:
   - **Objeto de referência**: fotografe a peça **com a moeda/tampa** no quadro e marque-a.
   - **Furo do rolamento**: o Ø do furo já vem preenchido pelo padrão; fotografe a peça e
     marque **3 pontos na borda do furo** (não precisa de moeda).
4. Meça as dimensões:
   - **🔎 Auto (rolamento)**: acha sozinho o Ø externo e o furo (precisa de boa foto).
   - ou **⭕ / ✏️** manual, na ordem indicada no topo.
5. Veja o resultado: **APROVADA / REPROVADA**, tabela de desvios, **comparação lado a lado**
   (peça correta × inspecionada) e o **diagnóstico** do que saiu fora.
6. **🖨️ Relatório (PDF)** para salvar/enviar, e **💾 Salvar** para o histórico.

### 4.4 Histórico e relatório para o PC (aba **Histórico**)
- Lista das inspeções salvas (peça, padrão, data, veredito).
- **⬇️ Relatório p/ PC (CSV)**: baixa uma planilha (abre no Excel/Google Sheets) com todas
  as medidas e vereditos — para acompanhamento no PCP/Qualidade.

---

## 5. Roteiro de testes (faça nesta ordem)

Objetivo: validar a precisão antes de usar na produção.

### Teste 0 — Sanidade da escala (5 min)
1. Aba Padrões → "Cadastrar padrão por foto".
2. Fotografe **duas moedas conhecidas** lado a lado (ex.: R$1 = 27 mm e R$0,50 = 23 mm).
3. Calibre pela R$1 e **meça a R$0,50** com ⭕ Diâmetro.
4. **Esperado:** ~23 mm (erro < ~0,5 mm). Se der muito diferente, a foto está inclinada ou
   os pontos ficaram tortos — refaça mais perpendicular e usando a lupa.

### Teste 1 — Calibração pelo furo (rolamento)
1. Padrões → Biblioteca → crie, por ex., o **6205** (furo 25, externo 52).
2. Inspecionar → escolha 6205 → Iniciar.
3. Calibrar por **Furo do rolamento** (vem 25 mm) → marque a borda do furo.
4. Meça o **Ø externo** com ⭕.
5. **Esperado:** próximo de 52 mm (mais a espessura do revestimento, se houver). Veja se o
   veredito faz sentido com a sua tolerância.

### Teste 2 — Detecção automática (🔎)
1. Mesma inspeção, foto com **fundo contrastante** (peça sobre superfície de cor diferente)
   e luz uniforme.
2. Calibre a escala (furo ou moeda) e toque **🔎 Auto (rolamento)**.
3. **Esperado:** ele desenha o círculo externo e o furo e preenche as medidas. Compare com
   o manual. Se errar/achar nada, melhore contraste/luz ou use manual.

### Teste 3 — Peça reprovada (de propósito)
1. Inspecione uma peça que você sabe estar fora (ou reduza a tolerância para 0,1%).
2. **Esperado:** veredito **REPROVADA**, a medida fora destacada e o diagnóstico (ex.:
   "sobremedida / excesso de revestimento").

### Teste 4 — Relatório
1. Salve 3–4 inspeções (use "💾 Salvar").
2. Histórico → **Relatório p/ PC (CSV)** e abra no Excel.
3. **Esperado:** uma linha por medida, com nominal, medido e status.

### Checklist de aceitação
- [ ] Erro do Teste 0 < ~0,5 mm
- [ ] Calibração pelo furo funcionando
- [ ] Auto detectou Ø externo e furo em foto boa
- [ ] Reprovação e diagnóstico corretos
- [ ] CSV abrindo no PC com os dados certos

---

## 6. Boas práticas de foto (o que mais afeta a precisão)
- **Perpendicular**: câmera o mais reta possível sobre a peça (evita distorção).
- **Referência no mesmo plano** da medida (encostada na peça, não mais alta/baixa).
- **Luz uniforme**, sem sombra forte nem reflexo na borda.
- **Fundo contrastante** (essencial para o 🔎 Auto).
- **Use a lupa** para marcar a borda com precisão.
- Mantenha um **enquadramento padrão** (mesma distância) entre peças — repetibilidade.

---

## 7. Limitações (honestas)
- A precisão depende do **seu cuidado na foto** e da **referência**. Não substitui
  metrologia fina (paquímetro/micrômetro) para cotas críticas apertadas.
- **Largura/profundidade** não saem de uma foto de cima — precisariam de foto lateral.
- O **🔎 Auto** depende de contraste/luz; em foto ruim, erra ou não acha (use o manual).
- Calibrar **pelo furo** pressupõe o furo dentro do nominal.
- Dados ficam no **navegador do aparelho**: troque de celular/limpe o navegador e some.
  Exporte o histórico (CSV) periodicamente.

---

## 8. Alternativa de máxima precisão (opcional, `inspecao-ia/`)
Para sub-milímetro existe o caminho **ArUco + OpenCV (Python)**: imprime-se um marcador,
roda-se um servidor num PC e o celular envia a foto. Corrige perspectiva e mede
automaticamente. Há também um **protótipo de IA (Anomalib/PatchCore)** que aprende com
fotos de peças boas e aponta defeitos visuais. Use **só** se houver um computador dedicado
— foge do "tudo no celular".

---

## 9. Próximos passos sugeridos
- **Link fixo (GitHub Pages)** para parar de depender do endereço comprido.
- **Medição da largura B** por foto lateral.
- **Logo/empresa e assinatura** no relatório PDF.
- **Marcar o defeito sobre a foto** (círculo/seta) antes de gerar o laudo.
- Ajuste fino dos parâmetros do **🔎 Auto** com fotos reais suas.

---

## 10. Suporte / evolução
Esta é uma ferramenta em evolução. O ideal é rodarmos o **Roteiro de testes** com peças e
fotos reais para calibrar tolerâncias e os parâmetros da detecção automática.
