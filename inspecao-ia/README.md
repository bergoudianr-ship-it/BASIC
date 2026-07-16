# Protótipo de IA — Validação de peça por foto (VALIDADA / NÃO CONFORME)

Protótipo que aprende com **fotos de peças boas** (o "modelo") e, ao receber a foto de uma
peça nova, responde **VALIDADA** ou **NÃO CONFORME**, com uma pontuação de quão diferente
ela está do padrão. É a base de **detecção visual de anomalias** usada na indústria.

> ⚠️ **Importante (você tem só celular):** este programa **não roda no telefone**. Ele roda
> num **computador ou servidor** com Python. O celular acessa pelo navegador, tira/envia a
> foto e recebe o resultado. Veja "Como rodar".

## O que ele faz (e o que não faz)
- ✅ Detecta **defeitos visuais e desvios de forma** (trinca, falha/bolha no revestimento,
  desgaste, oxidação, material faltando) comparando com as peças boas.
- ✅ Funciona treinando **só com peças boas** — não precisa de fotos de defeito.
- ❌ **Não** substitui paquímetro: não dá cota crítica em mm de peça grande com precisão.
- ❌ Precisa de **captura controlada** (câmera na mesma posição, luz e fundo constantes),
  senão dá alarme falso.

Este é um protótipo simples (embedding global com ResNet + vizinho mais próximo). Para
produção com **mapa de calor do defeito** e maior precisão, o passo seguinte é o
**Anomalib / PatchCore** (mesma ideia, mais robusto) — ver "Evolução".

## Como rodar

1. Num computador/servidor com Python 3.10+:
   ```bash
   pip install -r requirements.txt
   ```
2. Coloque de **20 a 50 fotos de peças BOAS** (o modelo) na pasta `pecas_boas/`,
   todas na **mesma condição** (mesmo enquadramento, luz e fundo).
3. Treine o modelo:
   ```bash
   python treinar.py
   ```
   Isso cria `modelo/banco.npy` e `modelo/config.json` (com o limite de decisão).
4. Suba o servidor:
   ```bash
   python servidor.py
   ```
5. No **celular**, abra o endereço mostrado (ex.: `http://IP-DO-PC:8000`) na mesma rede,
   tire a foto da peça e veja **VALIDADA / NÃO CONFORME**.

### Hospedar na internet (acessar de qualquer lugar)
Como você só tem celular, suba o `servidor.py` num servidor barato na nuvem
(qualquer VPS Linux, Render, Railway, etc.) e acesse pelo navegador do telefone.
Recomendo proteger com senha antes de expor na internet.

## Ajuste de sensibilidade
No `modelo/config.json`, o campo `limite` controla o rigor: **menor** = mais rígido (reprova
mais), **maior** = mais tolerante. Comece com o valor sugerido pelo treino e ajuste com
algumas peças reais (boas e ruins).

---

# Medição automática por foto (ArUco + OpenCV)

Esta é a parte de **medida dimensional automática** — você fotografa a peça com um
**marcador ArUco** impresso no quadro e a ferramenta mede sozinha o **diâmetro externo
(D)** e o **furo (d)**, compara com o **rolamento** escolhido e responde
**APROVADA / REPROVADA**. Ganha tempo na produção: sem marcar nada na tela.

Por usar o marcador (tamanho exato conhecido + cantos com subpixel), a medida é
**corrigida de perspectiva** (homografia imagem→mm) — bem mais precisa que marcar uma
moeda à mão. Ideal para peças ≤200 mm.

### Passos
1. Gere e **imprima** o marcador:
   ```bash
   python gerar_marcador.py
   ```
   Imprima sem ajuste de escala e **meça o lado preto impresso** (mm) com paquímetro.
2. Suba o servidor de medição:
   ```bash
   python servidor_medida.py
   ```
3. No celular, abra `http://IP-DO-PC:8001`, escolha o **rolamento**, informe o
   **tamanho do marcador (mm)**, fotografe a peça **com o marcador no mesmo plano** e toque
   em **Medir**. A foto volta anotada com D e d e o veredito.

### Biblioteca de rolamentos
`dados/rolamentos.json` traz as dimensões de catálogo (ISO 15 / DIN 625) de **106
rolamentos** das séries **6000, 6200, 6300, 6400, 6800, 6900 e 16000** (furo d, diâmetro
externo D, largura B). É a base para validar rolamentos revestidos de poliuretano sem
precisar cadastrar um padrão manualmente.

> Observação: "rolamento revestido de PU" não tem tabela própria — é um rolamento padrão
> com a capa de poliuretano no **diâmetro externo** (medida final específica de cada
> aplicação). Por isso o catálogo guarda as dimensões do **rolamento-base**.

### Banco de dados (Supabase)
As mesmas dimensões estão salvas na tabela `public.rolamentos` do Supabase (projeto
`pboizjwwxcnajeuteivp`), com RLS e leitura pública. O script reproduzível está em
`supabase/rolamentos.sql` (cria a tabela e faz o seed dos 106 itens). Não existe um pacote
Python oficial com essas dimensões — os valores vêm da norma ISO 15 / catálogos (SKF/NSK/
Timken); **confira no datasheet do fabricante** antes de usar como critério de aprovação.

### Limites honestos
- O **contorno da peça** é detectado por contraste — use **fundo contrastante** (peça
  clara em fundo escuro ou vice-versa) e boa luz.
- A **largura B** não sai de uma foto de cima (precisa de vista lateral) — o servidor mede
  **D** e **d**.
- Marcador e peça devem estar **no mesmo plano**; foto o mais perpendicular possível.

## Evolução para produção (Anomalib / PatchCore)
- `pip install anomalib` e treinar um `Patchcore` com as mesmas fotos boas dá **mapa de
  calor** mostrando *onde* está o defeito e melhor acurácia.
- Integrar com a câmera fixa da estação e registrar o resultado no histórico da ferramenta
  web (laudo único por peça/lote).
