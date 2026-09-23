# Operação Blackout — Especificação de design

> Gerada numa consultoria `design` com a skill `oiloil-ui-ux-guide`.
> Família de estilo: `brand-driven` — os tokens partem da identidade que o jogo já tinha
> (a sálvia `#d8e2c8` e o âmbar `#ffb020`), apertados para a linguagem dos shooters atuais.

## 1. Direção

- **Produto**: FPS de sobrevivência por ondas que roda no navegador, em arquivo único.
- **Referências**: Modern Warfare (retorno, HUD, bússola) e Battlefield (densidade).
- **Tom**: tático, contido, legível sob pressão.
- **Restrições duras**:
  - a HUD fica **sobre o jogo em movimento** — o fundo muda a cada quadro, então nenhum
    texto pode depender do cenário para ter contraste;
  - o jogo precisa **abrir offline**: a fonte é melhoria, nunca dependência;
  - funciona com mouse e com toque.
- **Idioma**: `pt-BR`. Pontos cardeais em português: N, NE, **L**, SE, S, SO, **O**, NO.

### Decisões da consultoria

| Dimensão | Decisão | Por quê |
|---|---|---|
| Tipografia | Barlow Condensed + Barlow | A família de números dos shooters atuais, mais neutra e industrial |
| Densidade | Meio-termo | Vida sempre visível sem gritar; lista de armas só quando serve |
| Cor da HUD | Sálvia `#d8e2c8` com véu | É a identidade; o véu a torna legível em qualquer mapa |
| Retorno | Contido, como Modern Warfare | "Realista" = ler o combate pelo som e pela reação, não por texto |
| Forma | Cantos retos, escala de 4 px | O jogo já era reto; a HUD é densa demais para 8 px |

## 2. Cor

### Texto da HUD (a identidade)
- `--hud`: `#d8e2c8` — texto principal, números, barra de vida cheia.
- `--hud-2`: `rgba(216,226,200,.8)` — texto secundário: rótulos, nome da arma.
- `--hud-3`: `rgba(216,226,200,.6)` — rótulos **só na metade de baixo da tela**, e traços.
- `--hud-line`: `rgba(216,226,200,.18)` — trilhos de barra, divisórias, tracinho vazio.
- `--ammo`: `#eef3e2` — o numeral de munição, o número mais lido da tela.
- `--aim`: `rgba(240,244,236,.92)` — mira e marcador de acerto. É instrumento de pontaria,
  não texto: fica quase branca de propósito, fora da sálvia.

### Acento e semântica
- `--accent`: `#ffb020` — um sinal por grupo: modo de tiro, grau da bússola, pontos, seleção.
- `--on-accent`: `#101208` — texto sobre âmbar.
- `--danger`: `#e04030` — dano, vida baixa, inimigo, abate.
- `--ok`: `#5ad07a` — ganho de atributo (oficina).
- `--armor`: `#7fb6e8` — colete, e só ele.

### Fundos
- `--ground`: `#0a0c0a` — telas e fundo da página.
- `--scrim`: `rgba(6,8,10,.78)` — **o véu** dos cantos de baixo.
- `--plate`: `rgba(8,10,12,.62)` — placa atrás de texto pequeno (killfeed, lista de armas).

### A regra do véu (obrigatória)

A sálvia sozinha **não é legível** sobre o jogo. Medido:

| Fundo | Sálvia pura | Com véu |
|---|---|---|
| Areia da Torre `#9a8c6b` | 2,47:1 — reprova | 11,40:1 |
| Céu diurno `#9dafbd` | 1,68:1 — reprova | 7,03:1 |
| Piso do Saguão `#71777e` | 3,37:1 — só texto grande | — |
| Chão do Ferro-Velho `#3c4438` | 7,53:1 | — |

Por isso **todo grupo de texto da HUD carrega o próprio véu** (gradiente radial escuro
ancorado no canto dele). Texto nunca pode ser posto na HUD sem véu ou placa atrás.

O véu de cima é mais fraco (`.62`), para não virar uma mancha no céu. Consequência, medida
com o véu sobre o céu:

| Token | Contraste no topo | Uso permitido no topo |
|---|---|---|
| `--hud` | 7,03:1 | texto de qualquer tamanho |
| `--hud-2` | 5,17:1 | texto de qualquer tamanho |
| `--hud-3` | 3,67:1 | **só traço** (marcas da bússola) — nunca texto |
| `--accent` | 5,17:1 | texto de qualquer tamanho |
| `--danger` | 2,23:1 | **só com contorno escuro** de 1 px (losangos da bússola) |

Embaixo o véu é `.78` e todos passam: `--hud-3` 5,03:1, `--danger` 3,61:1 (forma e
número grande).

### Modo claro
N/A — o jogo é escuro por natureza; a tela é a própria cena.

## 3. Tipografia

| Papel | Fonte | Pesos | Origem |
|---|---|---|---|
| Números, rótulos, títulos, botões | Barlow Condensed | 500, 600, 700 | Google Fonts |
| Texto corrido, valores miúdos | Barlow | 400, 500, 600 | Google Fonts |
| Fallback | `system-ui` | — | sistema |

- `--font-display`: `'Barlow Condensed','Barlow',system-ui,sans-serif`
- `--font-ui`: `'Barlow',system-ui,'Segoe UI',sans-serif`
- Números com `font-variant-numeric: tabular-nums` na página inteira: munição e placar
  não tremem de largura ao mudar.

**Carregamento**: o `<link>` usa `media="print"` + `onload="this.media='all'"`. A folha não
bloqueia a primeira pintura — se o Google demorar ou não responder, o jogo abre no
`system-ui` e troca quando a fonte chegar. Verificado: com a fonte carregada, "RESTANTES 0123"
em 64 px ocupa 379 px na condensada contra 615 px no fallback.

> Antes desta consultoria o CSS pedia `"Rajdhani"` sem nunca carregá-la. O jogo rodou o
> tempo todo em Segoe UI / Roboto.

### Escala (px)
`11 / 12 / 14 / 16 / 20 / 24 / 32 / 44 / 64` → `--fs-xs` … `--fs-5xl`.

Substituiu 15 tamanhos soltos (11, 12, 12.5, 13, 14, 15, 16, 17, 21, 24, 30, 40, 44, 52, 64).
O CSS não tem mais nenhum `font-size` literal; as únicas exceções são os `clamp()` dos
títulos das telas, que escalam com a janela.

| Onde | Token | Fonte |
|---|---|---|
| Munição no pente | `--fs-5xl` 64 | display 700 |
| Faixa de onda ("ONDA 1") | `--fs-5xl` 64 | display 700 |
| Inimigos restantes | `--fs-4xl` 44 | display 700 |
| Reserva de munição | `--fs-2xl` 24 | display 600 |
| Valor de vida, pontos | `--fs-md` 14 | ui 500 |
| Rótulos da HUD | `--fs-sm` 12 | display 600, espaçamento 1,5–3 px |
| Rótulo mínimo ("PTS") | `--fs-xs` 11 | display 600 |

## 4. Espaço

- Base: `4px`. Escala: `4 / 8 / 12 / 16 / 20 / 24 / 32 / 48` → `--s1` … `--s12`.
- `--edge: 32px` — margem segura da HUD em todos os lados.
- Densidade: `compact` na HUD, `balanced` nas telas.
- **Única exceção**: `2px` entre os tracinhos do pente — é fio de desenho, não espaçamento
  de layout (comentado no CSS).

## 5. Raio

- Tudo reto: `0`.
- `50%` só em formas que são círculos de verdade: luneta, botões de toque, spinner.
- Removido o `3px` que as teclas (`.k`) tinham — era o único canto arredondado do jogo.

## 6. Elevação

Plano. Não há sombra de elevação. Profundidade vem do véu e da placa (seção 2).
Sombra existe só como proteção de texto: `text-shadow: 0 1px 2px rgba(0,0,0,.7)` na HUD.

## 7. Movimento — retorno contido

- Vocabulário: `minimal`.
- `--t-fast: 90ms` — marcador de acerto, entrada do arco de dano.
- `--t-base: 140ms` — vinheta, barras, lista de armas, botões.
- Saídas podem ser mais lentas que entradas: o arco de dano entra em 90 ms e sai em 400 ms.
- **Permitido**: fade, fade + deslocamento de 8 px.
- **Proibido**:
  - números de dano flutuando sobre o inimigo (removidos);
  - tremor de câmera no disparo e ao levar dano (removidos — tremor **só em explosão**);
  - marcador que cresce no headshot ou no abate — o abate é o mesmo desenho, em vermelho.

| Evento | Retorno |
|---|---|
| Acerto | marcador seco por 120 ms + estalo |
| Abate | o mesmo marcador em vermelho por 240 ms + som de abate |
| Tiro na cabeça | só o som distinto; nada visual extra |
| Dano recebido | arco na direção da origem + vinheta vermelha |
| Explosão | tremor de câmera |

## 7a. Estratégia de contêiner

- **HUD**: `none` — grupos flutuam sobre o véu; sem caixa, sem borda.
- **Itens de lista na HUD** (killfeed, lista de armas): `tinted-surface` com `--plate`.
- **Telas** (menu, pausa, fim): `border` — `1px solid rgba(216,226,200,.18)` sobre
  `rgba(0,0,0,.3)`.

## 7b. Ícones

- **Conjunto**: próprio, SVG inline de traço (coração, granada). Nada de emoji nem glifo
  de texto — o `✚` que marcava granadas foi substituído.
- **Traço**: 1,5–1,6 px. **Tamanho**: 16 px.
- **Cor**: `currentColor`, exceto o coração, que usa `--danger`.

## 7c. Decoração

| Superfície | Gradientes | Texturas | Motivos |
|---|---|---|---|
| HUD | só o véu (funcional) | nenhuma | nenhum |
| Telas | fundo radial escuro | nenhuma | nenhum |
| Luneta | tinta ótica sutil | nenhuma | retícula mil-dot |

## 8. Componentes

### HUD — onde cada coisa mora

| Canto | Conteúdo |
|---|---|
| Topo esquerdo | minimapa 136 px + mapa e dificuldade **empilhados** (lado a lado não cabem) |
| Topo centro | bússola 520 px: grau em âmbar, pontos cardeais, marca central, losango do inimigo avistado |
| Topo direito | onda, inimigos restantes, pontos, sequência, killfeed |
| Centro | mira, marcador de acerto, arco de dano, barra de recarga |
| Baixo esquerdo | colete em três segmentos, coração + barra + valor de vida, granadas, postura |
| Baixo direito | arma · modo de tiro, munição, pente em tracinhos, aviso de recarga |

### Densidade meio-termo
- **Vida**: sempre visível, sem o rótulo `VITALIDADE` e sem barra larga. Sálvia cheia,
  vermelha abaixo de 35%.
- **Lista de armas**: invisível. Aparece ao trocar de arma e ao entrar em campo, some em 2 s.
- **Postura**: "AGACHADO" / "CORRENDO" só quando é verdade; senão, nada.

### Bússola
- Norte é `-z`, leste é `+x`. Faixa com três voltas; ~118° visíveis.
- Marca **só inimigo com linha de visão** — inimigo avistado. O minimapa segue mostrando todos.

### Pente em tracinhos
- Até 10 balas: um tracinho por bala (escopeta, AWM).
- Acima: 10 tracinhos, cada um vale 10% do pente.

### Botões
- Primário: borda sálvia 45%, fundo sálvia 6%; ao passar ou focar, âmbar com `--on-accent`.
- Altura mínima 44 px. `:focus-visible` tem o mesmo tratamento do hover.
- Seletores (mapa, dificuldade): mesma regra, 44 px, selecionado em âmbar.

### Toque
- Com toque, os grupos de baixo sobem (`body.touch`) para não ficarem sob os botões:
  vitais a 176 px, munição a 224 px, lista de armas a 352 px.

## 9. Superfícies

- **Em combate**: a HUD acima.
- **Menu**: título em condensada 64 px com "BLACKOUT" em âmbar; seletores de mapa e
  dificuldade; cartões de controles e arsenal.
- **Pausa**: título 44 px, cartão de configurações, dois botões.
- **Fim de partida**: título em `--danger`, estatística principal em âmbar 44 px.

## 10. Antipadrões deste projeto

- Texto na HUD sem véu ou placa atrás.
- `--hud-3` em texto na metade de cima da tela.
- Qualquer `font-size`, espaçamento ou cor fora dos tokens sem comentário justificando.
- Números de dano, tremor no disparo, marcador que cresce.
- Rótulo por extenso onde um ícone basta (`VITALIDADE`, `PONTOS`).
- Informação permanente que só importa às vezes (a lista de armas fixa, como era).
- Aviso de interação sem mecânica por trás — o "F REABASTECER" do canvas **não** entrou,
  porque o jogo não tem reabastecimento.

## 11. Questões em aberto

- **Minimapa revela todos os inimigos** enquanto a bússola só marca os avistados. Em
  Modern Warfare o minimapa também só mostra quem disparou. Decidir se o minimapa segue a
  bússola.
- **Tamanho do véu no topo**: aparece como sombra contra o céu claro. É o custo aceito
  da sálvia; pode ser apertado para abraçar melhor o texto, se incomodar.
- **Pilha de render** (tone mapping ACES, sombra de contato, névoa, gradação por mapa) e
  **mira com óptica** (ponto vermelho, sombra de eye-box na luneta) estão desenhadas no
  canvas, mas não implementadas.
- **Oficina de armas** depende de um sistema de acessórios que o jogo não tem.

### Referência visual
Canvas "Blackout Moderno": `https://claude.ai/artifact/TsRaQELnddNNX12ebUvo7G` (privado).
