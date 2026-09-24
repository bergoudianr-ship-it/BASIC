# Conferência crítica do projeto — Inspeção PU

Autoavaliação honesta do que foi construído, para você validar com um empreendedor/técnico
experiente do mercado de poliuretano. Separa o que está **sólido**, o que está **a
verificar** e o que **precisa de decisão/negócio**.

---

## 1. O que está sólido (testado por mim)
- **App funciona offline no celular**, sem instalação; lógica em JavaScript validada
  sintaticamente.
- **Conversão pixel→mm** por referência conhecida e **ajuste de círculo por 3 pontos**:
  matemática correta (circunferência por 3 pontos, semelhança de escala).
- **Catálogo de 106 rolamentos** (ISO 15/DIN 625) embutido e **salvo no Supabase** (106
  linhas conferidas no banco).
- **Cálculo do Ø externo revestido** = D + 2× espessura e **estimativa da capa** =
  (Ø medido − D)/2: aritmética correta.
- **Relatório PDF** (impressão) e **exportação CSV** para o PC.

## 2. O que NÃO foi verificado (precisa de teste com peça real)
> Este é o ponto mais importante para o especialista.

- **Acurácia real da medida** com peças e fotos de verdade: eu **não tenho câmera nem
  peças** no ambiente, então não medi erro real. A estimativa de ~1% é teórica/condicional
  a foto reta + boa referência.
- **Detecção automática (OpenCV.js / HoughCircles)**: os parâmetros são heurísticos e
  **não foram calibrados com imagens reais**. Pode falhar com fundo/luz ruins. Por isso há
  sempre o modo manual.
- **Repetibilidade** (medir a mesma peça várias vezes e comparar): não medida.
- **Distorção de lente** do celular (grande-angular) em peças maiores: não compensada no
  app (só a trilha ArUco corrige perspectiva).
- **Trilha Python (ArUco/IA)**: escrita e com sintaxe compilada, mas **não executei com
  OpenCV/Torch instalados nem com imagens** — é protótipo a validar em um PC.

## 3. Pontos de atenção do domínio (PU) — validar com o especialista
- **O que realmente importa medir**: confirmamos que é o **Ø externo revestido** e a
  **espessura/concentricidade** da capa? Há outras cotas críticas (ex.: ovalização,
  batimento, dureza Shore, adesão do PU ao aço)? Dureza e adesão **não** são medíveis por
  foto.
- **Tolerâncias reais de produção**: quais valores de ± vocês usam hoje? O app aceita ±mm
  ou ±%, mas os limites certos são definição de vocês.
- **Concentricidade/ovalização**: hoje o app mede o diâmetro como círculo mínimo; medir
  **ovalização** (Ø máx − Ø mín) exigiria uma função dedicada — vale a pena?
- **A capa cobre o furo?** O método de calibrar pelo furo pressupõe **furo de aço exposto e
  no nominal**. Se o furo for revestido ou usinado fora, a escala desloca.

## 4. Riscos de negócio / produto
- **Decisão de aprovar/reprovar peça** baseada em foto tem risco se a precisão não for
  validada. Recomendação: usar como **triagem rápida** e manter paquímetro para a cota
  crítica até comprovar a acurácia.
- **Rastreabilidade**: hoje os dados ficam no **celular**. Para auditoria/cliente, é
  preciso evoluir para salvar no Supabase (multiusuário) — já há base para isso.
- **Metrologia formal**: se algum cliente exigir laudo com instrumento calibrado/RBC, a
  foto não substitui — posicionar a ferramenta como **apoio/produtividade**, não
  certificação.

## 5. Plano de validação sugerido (com o especialista)
1. **Estudo de acurácia**: 10 peças medidas no paquímetro e no app; comparar erro médio e
   máximo por dimensão.
2. **Repetibilidade**: 1 peça, 10 fotos, mesma pessoa; depois 3 pessoas (reprodutibilidade).
3. **Limite de tamanho**: confirmar até que diâmetro o erro fica aceitável.
4. **Auto vs manual**: em fotos reais, taxa de acerto do 🔎 Auto e ajuste dos parâmetros.
5. **Definir tolerâncias** reais e o conjunto de cotas/defeitos que importam.
6. Decidir se entra **estação fixa** (apoio + luz) e/ou a **trilha ArUco** (PC) para
   precisão.

## 6. Conclusão honesta
O que existe hoje é um **MVP funcional e usável** para triagem dimensional e documentação,
**barato e no celular**. A **lógica e os dados estão corretos**; o que falta é **validação
metrológica com peças reais** — que só vocês podem fazer. Recomendo tratar como
**ferramenta de produtividade/triagem** agora, e decidir, após o estudo de acurácia, se ela
assume papel de **critério de aprovação**.
