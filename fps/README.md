# Operação Blackout — FPS em primeira pessoa

Jogo de tiro em primeira pessoa no estilo *Call of Duty*, modo sobrevivência por ondas.
Roda direto no navegador, sem instalação e sem build.

## Como jogar

Abra `fps/index.html` no navegador. Duas formas:

- **Duplo clique no arquivo** — funciona porque a biblioteca 3D está incluída em `vendor/`.
- **Servidor local** (recomendado, evita restrições de `file://` em alguns navegadores):

  ```bash
  npx http-server . -p 8080
  # depois acesse http://localhost:8080/fps/
  ```

Escolha o mapa e a dificuldade, clique em **INICIAR MISSÃO** e depois na tela para
capturar o mouse. `ESC` libera o mouse e pausa.

## Controles

| Ação | Tecla |
|---|---|
| Andar | `W` `A` `S` `D` |
| Correr | `Shift` |
| Pular | `Espaço` |
| Agachar | `Ctrl` ou `C` |
| Atirar | Botão esquerdo |
| Mirar / luneta | Botão direito |
| Recarregar | `R` |
| Trocar de arma | `1` `2` `3` `4` ou `Q` (arma anterior) |
| Granada | `G` |
| Pausar | `ESC` |

Em celular/tablet aparecem controles de toque: analógico à esquerda, botões à direita,
e arrastar na tela move a mira.

## Mapas

Três mapas, escolhidos no menu. Os layouts são **originais**, construídos com a
gramática de mapa do *Modern Warfare 2/3* — não são recriações dos mapas oficiais.
O que foi copiado é o método, não o desenho:

- **Três corredores paralelos** ligados por travessas, para o combate nunca virar
  uma linha reta só.
- **Uma posição de poder elevada** que domina o mapa mas pode ser flanqueada.
- **Uma linha longa de tiro** para o fuzil de precisão, cortada por pilares ou vãos.
- **Cobertura baixa densa**, quebrando as linhas de visão a cada poucos metros.
- **Marcos visuais** distintos, para você saber onde está sem olhar o minimapa.

| Mapa | Tamanho | Caráter | Posição de poder | Linha longa |
|---|---|---|---|---|
| **Ferro-Velho** | 90×90 m | Pátio industrial, médio alcance | Mezanino do armazém central | Corredor de contêineres a oeste |
| **Torre** | 56×56 m | Pequeno e frenético, tudo é perto | Topo da torre central | Nenhuma: é tudo curto |
| **Saguão** | 96×72 m | Terminal coberto, interior | Mezanino sobre o salão | O salão inteiro, 80 m |

Dá para subir escadas e mezaninos andando — degraus de até 58 cm são vencidos sem
pular, então a verticalidade é usável de verdade.

## Dificuldade

Três níveis, escolhidos no menu. Mexem em quanto o inimigo acerta, quanto o tiro dele
dói, quanto ele aguenta, quantos aparecem ao mesmo tempo e em quanto tempo ele reage
depois de te ver. Dificuldade maior também paga mais pontos.

| Nível | Pontaria | Dano | Vida | Simultâneos | Reação | Pontos |
|---|---|---|---|---|---|---|
| **Recruta** | 58% | 70% | 85% | −1 | 0,45–1,3 s | ×0,8 |
| **Veterano** | 100% | 100% | 100% | normal | 0,15–0,7 s | ×1,0 |
| **Elite** | 145% | 132% | 130% | +2 | 0,04–0,3 s | ×1,4 |

Medido em teste, parado e sem revidar na onda 1: no Recruta você termina 45 s inteiro,
no Veterano termina com a vida cheia mas sem colete, e no Elite morre em ~21 s.

## Arsenal

As armas são modeladas a partir de armas reais, tanto nas estatísticas quanto na
silhueta.

| # | Arma | Calibre | Modo | Dano | Cadência | Pente |
|---|---|---|---|---|---|---|
| 1 | **M4A1** | 5,56×45mm | Automático | 26 | 720 RPM | 30 |
| 2 | **MP7A1** | 4,6×30mm | Automático | 18 | 1000 RPM | 40 |
| 3 | **Remington 870** | Cal. 12 | Bomba | 17 × 9 chumbos | 78 RPM | 7 |
| 4 | **AWM** | .338 Lapua | Ferrolho | 120 | 48 RPM | 5 |

**A AWM tem luneta.** Com o botão direito a mira ocupa a tela inteira, com retícula de
mil-dots e zoom de 82° para 11° de campo de visão. A sensibilidade do mouse cai junto
com o zoom, senão a mira ficaria incontrolável. Derruba tropa comum com um tiro só —
mas fora da luneta a dispersão é enorme, e andar piora ainda mais: é arma de parar,
respirar e mirar.

## Inimigos

Cada tipo carrega uma arma diferente, visível e reconhecível pela silhueta — dá para
saber o que vem vindo antes de tomar o tiro.

| Inimigo | Arma | Vida | Comportamento |
|---|---|---|---|
| **Soldado** | AKM | 100 | Tropa padrão, equilibrado |
| **Batedor** | MP5A3 | 70 | Rápido e agressivo, briga de perto |
| **Blindado** | RPK | 260 | Lento, aguenta muito e dói muito |
| **Atirador** | SVD Dragunov | 85 | Preciso e de longo alcance, pouca vida |

## Regras que valem a pena saber

- Tiro na cabeça causa **2,5× de dano** — dois acertos derrubam um soldado com a M4A1,
  um só com a AWM.
- A vida **regenera** após ~4 s sem tomar dano; o colete absorve 60% do dano até acabar
  e é reposto a cada onda.
- **Mover-se reduz** a chance de o inimigo acertar; ficar parado é perigoso.
- Mirar reduz muito a dispersão; correr e pular aumentam.
- A cada 5 abates seguidos você ganha bônus de pontos, vida e munição.
- Granadas causam dano em área — **inclusive em você**.

## Estrutura

```
fps/
├── index.html          jogo inteiro: cena, IA, HUD, áudio (arquivo único)
├── vendor/
│   └── three.min.js    Three.js r128 (MIT), embutido para funcionar offline
└── README.md
```

Não há dependências para instalar nem etapa de build. Todo o áudio é sintetizado em
tempo real com a Web Audio API (nenhum arquivo de som) e toda a geometria é gerada por
código (nenhum modelo 3D externo). Se `vendor/three.min.js` faltar, a página tenta o CDN
como reserva.

## Notas técnicas

- **Geometria de armas compartilhada**: `buildWeaponParts()` monta as oito armas a
  partir de caixas e cilindros, em metros aproximados, e `normalizeGun()` centra e
  escala para o comprimento pedido. O mesmo construtor serve ao modelo em primeira
  pessoa e à arma na mão do inimigo — só muda o comprimento final.
- **Mapas montados por código**, a partir de utilitários (`addRoom`, `addStairs`,
  `addContainer`, `addPlatform`, `addWallWithGaps`). Trocar de mapa desmonta a cena
  anterior e monta a nova; céu, névoa, alcance do minimapa e pontos de nascimento
  vêm da definição de cada mapa.
- Colisão por AABB contra uma lista de caixas do cenário, com **subida de degrau**:
  obstáculos de até 58 cm são vencidos andando, o que faz escadas e mezaninos
  funcionarem. A checagem de espaço livre só considera o que está acima do novo
  piso — tratar o degrau seguinte como teto travaria a subida inteira.
- Tiro por *raycast* com dispersão dependente de estado (movimento, mira, agachado, no
  ar) e queda de dano por distância. A escopeta dispara 9 chumbos e o dano é somado por
  alvo, para virar um número só na tela.
- A cadência de tiro usa um acumulador de tempo, então **não depende da taxa de quadros**.
- IA com estados (procurar/engajar), checagem de linha de visão amostrada, desvio de
  paredes e de outros inimigos, e chance de acerto explícita — o que torna o
  balanceamento previsível e ajustável por nível de dificuldade. O traçante e o clarão
  saem da boca do cano da arma que o inimigo carrega, e cada arma tem seu próprio som.
- `window.__blackout` expõe uma sonda somente-leitura (tempo, quadros, inimigos, arma
  atual, campo de visão, mapa, estatísticas) usada para diagnóstico e testes
  automatizados.
- Os mapas são validados por um teste de **alcançabilidade**: um flood-fill em grade
  de 1 m confirma que todo ponto de nascimento de inimigo é acessível a pé desde o
  nascimento do jogador e que não existe sala fechada sem porta.
